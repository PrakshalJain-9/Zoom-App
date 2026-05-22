from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import json
import uuid
import datetime
import os
import requests
import jwt

import crud, models, schemas
from database import SessionLocal, engine
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer

load_dotenv()

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Zoom Clone REST & WS Control Plane API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "zoom_clone_secret_key_change_me_in_production_123456789")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440 # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# JWT Helpers
def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except jwt.PyJWTError:
        return None
    user = crud.get_user_by_email(db, email=email)
    return user

# Seeding the Database
@app.on_event("startup")
def seed_database():
    db = SessionLocal()
    # SQLite migration: add 'status' column to participants if missing
    try:
        with engine.connect() as conn:
            cols = [row[1] for row in conn.execute(
                __import__("sqlalchemy").text("PRAGMA table_info(participants)")
            )]
            if "status" not in cols:
                conn.execute(__import__("sqlalchemy").text(
                    "ALTER TABLE participants ADD COLUMN status VARCHAR DEFAULT 'waiting'"
                ))
                conn.commit()
    except Exception as e:
        print(f"Migration warning: {e}")

    default_email = "host@zoomclone.com"
    user = crud.get_user_by_email(db, email=default_email)
    if not user:
        # Default seed user gets password 'password123'
        crud.create_user(db, schemas.UserCreate(name="Default Host", email=default_email, password="password123"))
    db.close()


# --- WEB-SOCKET CONNECTION MANAGER (CONTROL PLANE) ---
class ConnectionManager:
    def __init__(self):
        # Maps meeting_code -> list of connected WebSockets with details
        # Structure: {"ws": websocket, "name": display_name, "is_host": bool, "id": str, "audio": bool, "video": bool, "hand_raised": bool, "status": str}
        self.active_connections: Dict[str, List[Dict]] = {}

    async def connect(
        self, 
        websocket: WebSocket, 
        meeting_code: str, 
        display_name: str, 
        is_host: bool, 
        participant_id: Optional[str] = None,
        audio: bool = True,
        video: bool = True,
        status: str = "waiting"
    ):
        await websocket.accept()
        if meeting_code not in self.active_connections:
            self.active_connections[meeting_code] = []
        
        if not participant_id:
            participant_id = str(uuid.uuid4())
        connection_info = {
            "ws": websocket, 
            "name": display_name, 
            "is_host": is_host,
            "id": participant_id,
            "audio": audio,
            "video": video,
            "hand_raised": False,
            "status": status
        }
        self.active_connections[meeting_code].append(connection_info)
        
        # Get active participants snapshot
        participants_list = [
            {
                "id": p["id"],
                "name": p["name"],
                "is_host": p["is_host"],
                "audio": p["audio"],
                "video": p["video"],
                "hand_raised": p["hand_raised"],
                "status": p["status"]
            } 
            for p in self.active_connections[meeting_code]
        ]
        
        # Broadcast that a new user joined
        await self.broadcast(meeting_code, {
            "type": "USER_JOINED", 
            "name": display_name,
            "id": participant_id,
            "is_host": is_host,
            "participants": participants_list
        })
        return participant_id

    def disconnect(self, websocket: WebSocket, meeting_code: str):
        if meeting_code in self.active_connections:
            display_name = None
            for p in self.active_connections[meeting_code]:
                if p["ws"] == websocket:
                    display_name = p["name"]
                    break
            
            self.active_connections[meeting_code] = [p for p in self.active_connections[meeting_code] if p["ws"] != websocket]
            if len(self.active_connections[meeting_code]) == 0:
                del self.active_connections[meeting_code]
            return display_name
        return None

    async def broadcast(self, meeting_code: str, message: dict, sender_ws: WebSocket = None):
        print(f"DEBUG: [broadcast] Broadcasting {message.get('type')} to room {meeting_code}...")
        if meeting_code in self.active_connections:
            target_user_id = message.get("target_user_id")
            for connection in self.active_connections[meeting_code]:
                name = connection.get("name", "Unknown")
                conn_id = connection.get("id")
                
                # If target_user_id is specified, only route to target and the sender
                if target_user_id:
                    if conn_id != target_user_id and connection["ws"] != sender_ws:
                        continue
                
                print(f"DEBUG: [broadcast] Sending message to participant {name}...")
                try:
                    await connection["ws"].send_json(message)
                    print(f"DEBUG: [broadcast] Sent successfully to participant {name}")
                except Exception as e:
                    print(f"DEBUG: [broadcast] Error sending to participant {name}: {e}")
        print(f"DEBUG: [broadcast] Broadcast {message.get('type')} complete for room {meeting_code}")

    async def send_personal_message(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def close_all_connections(self, meeting_code: str):
        print(f"DEBUG: [close_all_connections] Closing connections for room {meeting_code}...")
        if meeting_code in self.active_connections:
            for connection in self.active_connections[meeting_code]:
                name = connection.get("name", "Unknown")
                print(f"DEBUG: [close_all_connections] Closing websocket for user {name}...")
                try:
                    await connection["ws"].close()
                    print(f"DEBUG: [close_all_connections] Websocket closed for user {name}")
                except Exception as e:
                    print(f"DEBUG: [close_all_connections] Error closing websocket for user {name}: {e}")
            del self.active_connections[meeting_code]
        print(f"DEBUG: [close_all_connections] Done closing all connections for room {meeting_code}")

manager = ConnectionManager()


@app.websocket("/ws/meeting/{meeting_code}")
async def websocket_endpoint(
    websocket: WebSocket, 
    meeting_code: str, 
    name: str = "Guest", 
    token: Optional[str] = None,
    participant_id: Optional[str] = None
):
    db = SessionLocal()
    initial_audio = True
    initial_video = True
    try:
        meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
        if not meeting or meeting.is_ended:
            await websocket.accept()
            await websocket.send_json({"type": "ERROR", "message": "Meeting not found or already ended."})
            await websocket.close()
            return

        # Check if the connecting user is the host
        is_host = False
        if token:
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                email = payload.get("sub")
                if email:
                    user = crud.get_user_by_email(db, email=email)
                    if user and meeting.host_id == user.id:
                        is_host = True
            except jwt.PyJWTError:
                pass
        meeting_id = meeting.id

        initial_status = "admitted" if is_host else "waiting"
        if participant_id:
            db_p = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
            if db_p:
                initial_audio = db_p.audio_enabled
                initial_video = db_p.video_enabled
                initial_status = db_p.status if db_p.status else initial_status
    finally:
        db.close()

    # Register connection in websocket manager
    participant_id = await manager.connect(
        websocket, 
        meeting_code, 
        name, 
        is_host, 
        participant_id,
        audio=initial_audio,
        video=initial_video,
        status=initial_status
    )
    
    try:
        while True:
            # Receive and process messages (control plane logic)
            message_text = await websocket.receive_text()
            try:
                event = json.loads(message_text)
            except Exception:
                await manager.send_personal_message(websocket, {"type": "ERROR", "message": "Invalid JSON format"})
                continue
            
            # Use a short-lived session for this specific WS event
            db = SessionLocal()
            try:
                event_type = event.get("type")
                
                if event_type == "CHAT_MESSAGE":
                    msg_text = event.get("message_text")
                    target_user_id = event.get("target_user_id")
                    if msg_text:
                        # Only save public messages to DB
                        if not target_user_id:
                            chat_create = schemas.ChatMessageCreate(
                                meeting_id=meeting_id,
                                sender_name=name,
                                message_text=msg_text
                            )
                            crud.save_chat_message(db, chat_create)
                        
                        # Broadcast chat message (routing to target if private)
                        await manager.broadcast(meeting_code, {
                            "type": "CHAT_MESSAGE",
                            "sender_name": name,
                            "message_text": msg_text,
                            "timestamp": datetime.datetime.utcnow().isoformat(),
                            "target_user_id": target_user_id
                        }, sender_ws=websocket)

                elif event_type == "STATE_UPDATE":
                    updates = schemas.ParticipantUpdate(
                        audio_enabled=event.get("audio_enabled"),
                        video_enabled=event.get("video_enabled"),
                        hand_raised=event.get("hand_raised")
                    )
                    crud.update_participant_state(db, meeting_id, name, updates)
                    
                    # Sync state in-memory
                    if meeting_code in manager.active_connections:
                        for p in manager.active_connections[meeting_code]:
                            if p["id"] == participant_id:
                                if event.get("audio_enabled") is not None:
                                    p["audio"] = event.get("audio_enabled")
                                if event.get("video_enabled") is not None:
                                    p["video"] = event.get("video_enabled")
                                if event.get("hand_raised") is not None:
                                    p["hand_raised"] = event.get("hand_raised")
                                break
                    
                    # Broadcast updated participants list
                    participants_list = [
                        {
                            "id": p["id"],
                            "name": p["name"],
                            "is_host": p["is_host"],
                            "audio": p["audio"],
                            "video": p["video"],
                            "hand_raised": p["hand_raised"],
                            "status": p["status"]
                        } 
                        for p in manager.active_connections.get(meeting_code, [])
                    ]
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                elif event_type == "ADMIT_USER":
                    if not is_host:
                        await manager.send_personal_message(websocket, {
                            "type": "ERROR",
                            "message": "Forbidden: Only the host can admit users."
                        })
                        continue

                    target_id = event.get("target_id")
                    if not target_id:
                        continue
                    
                    # Update DB
                    db_p = db.query(models.Participant).filter(models.Participant.id == target_id).first()
                    if db_p:
                        db_p.status = "admitted"
                        db.commit()

                    # Update in-memory
                    if meeting_code in manager.active_connections:
                        for p in manager.active_connections[meeting_code]:
                            if p["id"] == target_id:
                                p["status"] = "admitted"
                                break

                    participants_list = [
                        {
                            "id": p["id"],
                            "name": p["name"],
                            "is_host": p["is_host"],
                            "audio": p["audio"],
                            "video": p["video"],
                            "hand_raised": p["hand_raised"],
                            "status": p["status"]
                        }
                        for p in manager.active_connections.get(meeting_code, [])
                    ]
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                elif event_type == "ADMIT_ALL":
                    if not is_host:
                        await manager.send_personal_message(websocket, {
                            "type": "ERROR",
                            "message": "Forbidden: Only the host can admit users."
                        })
                        continue

                    # Update all waiting participants in DB and in-memory
                    if meeting_code in manager.active_connections:
                        for p in manager.active_connections[meeting_code]:
                            if p["status"] == "waiting":
                                p["status"] = "admitted"
                                db_p = db.query(models.Participant).filter(models.Participant.id == p["id"]).first()
                                if db_p:
                                    db_p.status = "admitted"
                        db.commit()

                    participants_list = [
                        {
                            "id": p["id"],
                            "name": p["name"],
                            "is_host": p["is_host"],
                            "audio": p["audio"],
                            "video": p["video"],
                            "hand_raised": p["hand_raised"],
                            "status": p["status"]
                        }
                        for p in manager.active_connections.get(meeting_code, [])
                    ]
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                elif event_type == "HOST_COMMAND":
                    if not is_host:
                        print(f"DEBUG: [HOST_COMMAND] Rejected command execution from non-host {name}")
                        await manager.send_personal_message(websocket, {
                            "type": "ERROR", 
                            "message": "Forbidden: Only the meeting host can execute commands."
                        })
                        continue
                    
                    command = event.get("command")
                    print(f"DEBUG: [HOST_COMMAND] Host {name} is executing command: {command}")
                    if command == "mute_all":
                        if meeting_code in manager.active_connections:
                            for p in manager.active_connections[meeting_code]:
                                if not p["is_host"]:
                                    print(f"DEBUG: [HOST_COMMAND] Muting participant {p['name']}...")
                                    p["audio"] = False
                                    updates = schemas.ParticipantUpdate(audio_enabled=False)
                                    crud.update_participant_state(db, meeting_id, p["name"], updates)
                                    print(f"DEBUG: [HOST_COMMAND] Mute completed for participant {p['name']}")
                        
                        print(f"DEBUG: [HOST_COMMAND] Broadcasting HOST_COMMAND mute_all...")
                        await manager.broadcast(meeting_code, {
                            "type": "HOST_COMMAND",
                            "command": "mute_all"
                        })
                        
                        # Broadcast updated list
                        participants_list = [
                            {
                                "id": p["id"],
                                "name": p["name"],
                                "is_host": p["is_host"],
                                "audio": p["audio"],
                                "video": p["video"],
                                "hand_raised": p["hand_raised"],
                                "status": p["status"]
                            } 
                            for p in manager.active_connections.get(meeting_code, [])
                        ]
                        await manager.broadcast(meeting_code, {
                            "type": "PARTICIPANTS_UPDATE",
                            "participants": participants_list
                        })

                    elif command == "mute_user":
                        target_id = event.get("target_id")
                        if target_id:
                            if meeting_code in manager.active_connections:
                                for p in manager.active_connections[meeting_code]:
                                    if p["id"] == target_id:
                                        print(f"DEBUG: [HOST_COMMAND] Muting participant {p['name']} specifically...")
                                        p["audio"] = False
                                        updates = schemas.ParticipantUpdate(audio_enabled=False)
                                        crud.update_participant_state(db, meeting_id, p["name"], updates)
                                        print(f"DEBUG: [HOST_COMMAND] Specific mute completed for participant {p['name']}")
                                        break
                            
                            # Broadcast HOST_COMMAND mute_user to all participants so target_id can mute themselves
                            await manager.broadcast(meeting_code, {
                                "type": "HOST_COMMAND",
                                "command": "mute_user",
                                "target_id": target_id
                            })
                            
                            # Broadcast updated list
                            participants_list = [
                                {
                                    "id": p["id"],
                                    "name": p["name"],
                                    "is_host": p["is_host"],
                                    "audio": p["audio"],
                                    "video": p["video"],
                                    "hand_raised": p["hand_raised"],
                                    "status": p["status"]
                                } 
                                for p in manager.active_connections.get(meeting_code, [])
                            ]
                            await manager.broadcast(meeting_code, {
                                "type": "PARTICIPANTS_UPDATE",
                                "participants": participants_list
                            })

                    elif command == "kick_user":
                        target_name = event.get("target_name")
                        target_ws = None
                        if meeting_code in manager.active_connections:
                            for p in manager.active_connections[meeting_code]:
                                if p["name"] == target_name:
                                    target_ws = p["ws"]
                                    break
                        if target_ws:
                            await manager.send_personal_message(target_ws, {
                                "type": "KICKED",
                                "message": "You have been removed from the meeting by the host."
                            })
                            await target_ws.close()

                    elif command == "end_meeting":
                        print(f"DEBUG: [end_meeting] Received by WS for user {name}. Ending meeting in CRUD...")
                        crud.end_meeting(db, meeting_id)
                        print(f"DEBUG: [end_meeting] Meeting ended in database. Broadcasting MEETING_ENDED...")
                        await manager.broadcast(meeting_code, {
                            "type": "MEETING_ENDED",
                            "message": "The host has ended the meeting."
                        })
                        print(f"DEBUG: [end_meeting] Broadcast complete. Closing all connections...")
                        await manager.close_all_connections(meeting_code)
                        print(f"DEBUG: [end_meeting] Connections closed. Breaking loop.")
                        break

                elif event_type == "REACTION":
                    emoji = event.get("emoji", "")
                    if emoji:
                        await manager.broadcast(meeting_code, {
                            "type": "REACTION",
                            "emoji": emoji,
                            "sender_name": name,
                            "sender_id": participant_id
                        })

                elif event_type == "HEARTBEAT":
                    await manager.send_personal_message(websocket, {"type": "HEARTBEAT_ACK"})
            except Exception as e:
                import traceback
                print(f"ERROR processing event {event}: {e}")
                traceback.print_exc()
                await manager.send_personal_message(websocket, {"type": "ERROR", "message": f"Server error: {str(e)}"})
            finally:
                db.close()

    except WebSocketDisconnect:
        print(f"DEBUG: [WebSocketDisconnect] Caught disconnect for user {name} in room {meeting_code}")
        # Use short-lived DB session for disconnect updates
        db = SessionLocal()
        try:
            left_name = manager.disconnect(websocket, meeting_code)
            print(f"DEBUG: [WebSocketDisconnect] Disconnected user: {left_name}")
            if left_name:
                print(f"DEBUG: [WebSocketDisconnect] Recording participant left in CRUD...")
                crud.record_participant_left(db, meeting_id, left_name)
                print(f"DEBUG: [WebSocketDisconnect] Record left complete.")
                
                participants_list = [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "is_host": p["is_host"],
                        "audio": p["audio"],
                        "video": p["video"],
                        "hand_raised": p["hand_raised"],
                        "status": p["status"]
                    } 
                    for p in manager.active_connections.get(meeting_code, [])
                ]
                print(f"DEBUG: [WebSocketDisconnect] Broadcasting USER_LEFT for {left_name}...")
                await manager.broadcast(meeting_code, {
                    "type": "USER_LEFT",
                    "name": left_name,
                    "participants": participants_list
                })
                print(f"DEBUG: [WebSocketDisconnect] Broadcast USER_LEFT complete.")
        except Exception as e:
            print(f"DEBUG: [WebSocketDisconnect] Error in disconnect block: {e}")
        finally:
            db.close()
            print(f"DEBUG: [WebSocketDisconnect] Closed DB session for disconnected user {name}")


# --- AUTHENTICATION ENDPOINTS ---

# This should not be used in real production, try to replace the jwt token generation later using the correct login page 
@app.post("/api/auth/anonymous-session")
def create_anonymous_session(db: Session = Depends( get_db)):
    guest_name = f"Guest-{uuid.uuid4().hex[:6]}"
    guest_email = f"guest_{uuid.uuid4().hex[:8]}@zoomclone.local"
    user = crud.create_user(db, schemas.UserCreate(
        name=guest_name, 
        email=guest_email, 
        password=uuid.uuid4().hex
    ))
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id}




@app.post("/api/auth/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/api/auth/login", response_model=schemas.Token)
def login_user(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=login_data.email)
    if not user or not crud.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=schemas.User)
def get_me(current_user: models.User = Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


from zego_token import get_zego_token

ZEGO_APP_ID = int(os.getenv("ZEGO_APP_ID", "0"))
ZEGO_SERVER_SECRET = os.getenv("ZEGO_SERVER_SECRET", "")

# --- MEETING REST ENDPOINTS ---
@app.post("/api/meetings", response_model=schemas.Meeting, status_code=status.HTTP_201_CREATED)
def create_meeting(
    meeting: schemas.MeetingCreate, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    # Determine Host
    if current_user:
        host = current_user
    else:
        # Fallback for guest or seeded email lookup
        if "@" in meeting.host_id:
            host = crud.get_user_by_email(db, email=meeting.host_id)
        else:
            host = crud.get_user(db, user_id=meeting.host_id)
            
        if not host:
            default_email = "host@zoomclone.com"
            host = crud.get_user_by_email(db, email=default_email)
            if not host:
                host = crud.create_user(db, schemas.UserCreate(
                    name="Default Host", 
                    email=default_email,
                    password="password123"
                ))
                
    meeting.host_id = host.id
    
    # --- ZEGO SDK INTEGRATION ---
    meeting.daily_room_url = None
    meeting.video_url = None
        
    return crud.create_meeting(db=db, meeting=meeting)

@app.get("/api/meetings", response_model=List[schemas.Meeting])
def read_meetings(
    skip: int = 0,
    limit: int = 100,
    current_user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user:
        return db.query(models.Meeting).filter(models.Meeting.host_id == current_user.id).offset(skip).limit(limit).all()
    return []

@app.get("/api/meetings/{meeting_code}", response_model=schemas.Meeting)
def get_meeting(meeting_code: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

@app.post("/api/meetings/{meeting_code}/join", response_model=schemas.Participant)
def join_meeting(
    meeting_code: str, 
    join_req: schemas.MeetingJoinRequest, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if meeting.is_ended:
        raise HTTPException(status_code=400, detail="This meeting has already ended")
        
    if meeting.passcode and meeting.passcode != join_req.passcode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect meeting passcode")

    # RESTORE PERSISTENT SESSION
    if join_req.participant_id:
        existing_p = db.query(models.Participant).filter(
            models.Participant.id == join_req.participant_id,
            models.Participant.meeting_id == meeting.id
        ).first()
        if existing_p:
            existing_p.left_at = None
            if not existing_p.status:
                existing_p.status = "admitted" if existing_p.is_host else "waiting"
            db.commit()
            db.refresh(existing_p)
            
            # Generate Zego Token
            try:
                if ZEGO_APP_ID and ZEGO_SERVER_SECRET:
                    token = get_zego_token(
                        app_id=ZEGO_APP_ID,
                        server_secret=ZEGO_SERVER_SECRET,
                        user_id=str(existing_p.id),
                        room_id=str(meeting_code)
                    )
                    existing_p.token = token
                    existing_p.zego_app_id = ZEGO_APP_ID
                else:
                    existing_p.token = "mock-token"
                    existing_p.zego_app_id = 0
            except Exception as e:
                print(f"ERROR: Exception while generating Zego token for restored participant: {e}")
                existing_p.token = "mock-token"
                existing_p.zego_app_id = 0
            return existing_p
        
    # --- SECURE ROLE VERIFICATION ---
    # Completely ignore the client's 'is_host' claim. 
    # Verify via the JWT (current_user) and the Database (meeting.host_id).
    join_is_host = False
    if current_user and meeting.host_id == current_user.id:
        join_is_host = True

    # Clean up any existing active participant session with the same display name / user ID
    if current_user:
        existing_active = db.query(models.Participant).filter(
            models.Participant.meeting_id == meeting.id,
            models.Participant.user_id == current_user.id,
            models.Participant.left_at == None
        ).all()
    else:
        existing_active = db.query(models.Participant).filter(
            models.Participant.meeting_id == meeting.id,
            models.Participant.display_name == join_req.display_name,
            models.Participant.left_at == None
        ).all()
    
    for p in existing_active:
        p.left_at = datetime.datetime.utcnow()
    if existing_active:
        db.commit()

    participant_create = schemas.ParticipantCreate(
        display_name=join_req.display_name,
        meeting_id=meeting.id,
        user_id=current_user.id if current_user else None,
        is_host=join_is_host,
        status="admitted" if join_is_host else "waiting"
    )
    db_participant = crud.add_participant(db=db, participant=participant_create)

    # Generate Zego Token using the participant ID as user_id and meeting_code as room_id
    try:
        if ZEGO_APP_ID and ZEGO_SERVER_SECRET:
            token = get_zego_token(
                app_id=ZEGO_APP_ID,
                server_secret=ZEGO_SERVER_SECRET,
                user_id=str(db_participant.id),
                room_id=str(meeting_code)
            )
            db_participant.token = token
            db_participant.zego_app_id = ZEGO_APP_ID
        else:
            print("WARNING: ZEGO credentials missing. Sending mock token.")
            db_participant.token = "mock-token"
            db_participant.zego_app_id = 0
    except Exception as e:
        print(f"ERROR: Exception while generating Zego token: {e}")
        db_participant.token = "mock-token"
        db_participant.zego_app_id = 0

    return db_participant

@app.post("/api/meetings/{meeting_code}/end", response_model=schemas.Meeting)
async def end_meeting_endpoint(
    meeting_code: str, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    # Enforce authentication for ending meetings
    if current_user is None or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")
        
    ended_meeting = crud.end_meeting(db=db, meeting_id=meeting.id)
    
    # Broadcast MEETING_ENDED over control plane WS
    await manager.broadcast(meeting_code, {
        "type": "MEETING_ENDED",
        "message": "The host has ended the meeting."
    })
    
    # Terminate all active WS connections
    await manager.close_all_connections(meeting_code)
    return ended_meeting


# --- CHAT & MEDIA HISTORY ENDPOINTS ---
@app.get("/api/meetings/{meeting_code}/chat", response_model=List[schemas.ChatMessageResponse])
def get_meeting_chat(meeting_code: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return crud.get_chat_history(db=db, meeting_id=meeting.id)

@app.post("/api/meetings/{meeting_code}/recording/start")
def start_recording(meeting_code: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.recording_status = "recording"
    db.commit()
    return {"status": "recording"}

@app.post("/api/meetings/{meeting_code}/recording/stop")
def stop_recording(meeting_code: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.recording_status = "completed"
    meeting.recording_url = f"https://zoomclone.daily.co/recordings/{meeting.id}"
    db.commit()
    return {"status": "completed", "recording_url": meeting.recording_url}

@app.get("/api/users", response_model=List[schemas.User])
def get_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()
