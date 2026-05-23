from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Optional
import json
import jwt
import datetime

import crud
import models
import schemas
from database import SessionLocal
from config import SECRET_KEY, ALGORITHM
from manager import manager

router = APIRouter(tags=["websockets"])

# ==============================================================================
# ROUTE: WS /ws/meeting/{meeting_code}
# ==============================================================================
@router.websocket("/ws/meeting/{meeting_code}")
async def websocket_endpoint(
    websocket: WebSocket, 
    meeting_code: str, 
    name: str = "Guest", 
    token: Optional[str] = None,
    participant_id: Optional[str] = None
):
    """
    WebSocket connection endpoint managing the real-time control plane.
    
    This acts as the signaling hub for a Zoom room session:
    - Negotiates the connection handshake
    - Authenticates the Host user using JWT token parameters
    - Restores previous media/room status (audio, video, admitted status) if re-connecting
    - Enters an asynchronous read loop ('while True') parsing JSON control signals
    - Manages cleanup via 'except WebSocketDisconnect' block
    """
    db = SessionLocal()
    initial_audio = True
    initial_video = True
    try:
        # Validate that the target meeting exists and is active
        meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
        if not meeting or meeting.is_ended:
            await websocket.accept()
            await websocket.send_json({"type": "ERROR", "message": "Meeting not found or already ended."})
            await websocket.close()
            return

        # Authenticate token payload to verify if this socket belongs to the Host
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
                pass  # Ignore decode errors; user is treated as Guest
        meeting_id = meeting.id

        # Determine starting room status:
        # - Host is immediately 'admitted'
        # - Guests start in 'waiting' state unless restored
        initial_status = "admitted" if is_host else "waiting"
        
        # Restore state if re-connecting (reconnection flow)
        if participant_id:
            db_p = db.query(models.Participant).filter(models.Participant.id == participant_id).first()
            if db_p:
                initial_audio = db_p.audio_enabled
                initial_video = db_p.video_enabled
                initial_status = db_p.status if db_p.status else initial_status
    finally:
        db.close()

    # Register the connection in-memory
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
        # Keep connection alive; read loop receiving messages
        while True:
            # Block until a message string arrives
            message_text = await websocket.receive_text()
            try:
                event = json.loads(message_text)
            except Exception:
                await manager.send_personal_message(websocket, {"type": "ERROR", "message": "Invalid JSON format"})
                continue
            
            # Short-lived database session is used for each message transaction to avoid holding locks
            db = SessionLocal()
            try:
                event_type = event.get("type")
                
                # ----------------------------------------------------------------------
                # EVENT: CHAT_MESSAGE (Public & Private)
                # ----------------------------------------------------------------------
                if event_type == "CHAT_MESSAGE":
                    msg_text = event.get("message_text")
                    target_user_id = event.get("target_user_id") # target_user_id makes it a private message
                    
                    if msg_text:
                        # Persist in DB only if it's a public chat message (no target_user_id)
                        if not target_user_id:
                            chat_create = schemas.ChatMessageCreate(
                                meeting_id=meeting_id,
                                sender_name=name,
                                message_text=msg_text
                            )
                            crud.save_chat_message(db, chat_create)
                        
                        # Broadcast message. If target_user_id is set, manager.broadcast routes it privately
                        await manager.broadcast(meeting_code, {
                            "type": "CHAT_MESSAGE",
                            "sender_name": name,
                            "message_text": msg_text,
                            "timestamp": datetime.datetime.utcnow().isoformat(),
                            "target_user_id": target_user_id
                        }, sender_ws=websocket)

                # ----------------------------------------------------------------------
                # EVENT: STATE_UPDATE (Mute Mic, Disable Camera, Hand Raising)
                # ----------------------------------------------------------------------
                elif event_type == "STATE_UPDATE":
                    updates = schemas.ParticipantUpdate(
                        audio_enabled=event.get("audio_enabled"),
                        video_enabled=event.get("video_enabled"),
                        hand_raised=event.get("hand_raised")
                    )
                    # Persist state changes in database
                    crud.update_participant_state(db, meeting_id, name, updates)
                    
                    # Synchronize changes in active connection manager registry
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
                    
                    # Broadcast updated list snapshot to all room participants
                    participants_list = manager.get_participants_snapshot(meeting_code)
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                # ----------------------------------------------------------------------
                # EVENT: ADMIT_USER (Host admits a single participant from waiting room)
                # ----------------------------------------------------------------------
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
                    
                    # Update status in DB
                    db_p = db.query(models.Participant).filter(models.Participant.id == target_id).first()
                    if db_p:
                        db_p.status = "admitted"
                        db.commit()

                    # Update status in-memory
                    if meeting_code in manager.active_connections:
                        for p in manager.active_connections[meeting_code]:
                            if p["id"] == target_id:
                                p["status"] = "admitted"
                                break

                    # Broadcast the new status to everyone in the room
                    participants_list = manager.get_participants_snapshot(meeting_code)
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                # ----------------------------------------------------------------------
                # EVENT: ADMIT_ALL (Host admits all waiting users at once)
                # ----------------------------------------------------------------------
                elif event_type == "ADMIT_ALL":
                    if not is_host:
                        await manager.send_personal_message(websocket, {
                            "type": "ERROR",
                            "message": "Forbidden: Only the host can admit users."
                        })
                        continue

                    # Bulk update all waiting users in DB and connection manager memory
                    if meeting_code in manager.active_connections:
                        for p in manager.active_connections[meeting_code]:
                            if p["status"] == "waiting":
                                p["status"] = "admitted"
                                db_p = db.query(models.Participant).filter(models.Participant.id == p["id"]).first()
                                if db_p:
                                    db_p.status = "admitted"
                        db.commit()

                    # Broadcast new list snapshot
                    participants_list = manager.get_participants_snapshot(meeting_code)
                    await manager.broadcast(meeting_code, {
                        "type": "PARTICIPANTS_UPDATE",
                        "participants": participants_list
                    })

                # ----------------------------------------------------------------------
                # EVENT: HOST_COMMAND (Mute user, mute all, kick, end meeting)
                # ----------------------------------------------------------------------
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
                    
                    # 1. MUTE ALL PARTICIPANTS
                    if command == "mute_all":
                        if meeting_code in manager.active_connections:
                            for p in manager.active_connections[meeting_code]:
                                # Only mute guest participants, keep host's mic active
                                if not p["is_host"]:
                                    print(f"DEBUG: [HOST_COMMAND] Muting participant {p['name']}...")
                                    p["audio"] = False
                                    updates = schemas.ParticipantUpdate(audio_enabled=False)
                                    crud.update_participant_state(db, meeting_id, p["name"], updates)
                        
                        # Broadcast HOST_COMMAND 'mute_all' event.
                        # Client-side listener catches this and disables local audio track/icons.
                        await manager.broadcast(meeting_code, {
                            "type": "HOST_COMMAND",
                            "command": "mute_all"
                        })
                        
                        # Sync participant lists
                        participants_list = manager.get_participants_snapshot(meeting_code)
                        await manager.broadcast(meeting_code, {
                            "type": "PARTICIPANTS_UPDATE",
                            "participants": participants_list
                        })

                    # 2. MUTE SPECIFIC USER
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
                                        break
                            
                            # Send command to specific target
                            await manager.broadcast(meeting_code, {
                                "type": "HOST_COMMAND",
                                "command": "mute_user",
                                "target_id": target_id
                            })
                            
                            participants_list = manager.get_participants_snapshot(meeting_code)
                            await manager.broadcast(meeting_code, {
                                "type": "PARTICIPANTS_UPDATE",
                                "participants": participants_list
                            })

                    # 3. KICK SPECIFIC USER
                    elif command == "kick_user":
                        target_name = event.get("target_name")
                        target_ws = None
                        if meeting_code in manager.active_connections:
                            for p in manager.active_connections[meeting_code]:
                                if p["name"] == target_name:
                                    target_ws = p["ws"]
                                    break
                        if target_ws:
                            # Send a KICKED message so client displays an alert
                            await manager.send_personal_message(target_ws, {
                                "type": "KICKED",
                                "message": "You have been removed from the meeting by the host."
                            })
                            # Close the connection
                            await target_ws.close()

                    # 4. END THE MEETING FOR ALL CONNECTED PARTICIPANTS
                    elif command == "end_meeting":
                        print(f"DEBUG: [end_meeting] Received by WS for user {name}. Ending meeting in CRUD...")
                        crud.end_meeting(db, meeting_id)
                        print(f"DEBUG: [end_meeting] Meeting ended in database. Broadcasting MEETING_ENDED...")
                        
                        # Tell all participants meeting has been terminated
                        await manager.broadcast(meeting_code, {
                            "type": "MEETING_ENDED",
                            "message": "The host has ended the meeting."
                        })
                        print(f"DEBUG: [end_meeting] Broadcast complete. Closing all connections...")
                        # Terminate all active WS connections
                        await manager.close_all_connections(meeting_code)
                        print(f"DEBUG: [end_meeting] Connections closed. Breaking loop.")
                        break

                # ----------------------------------------------------------------------
                # EVENT: REACTION (Emoji bubble overlays)
                # ----------------------------------------------------------------------
                elif event_type == "REACTION":
                    emoji = event.get("emoji", "")
                    if emoji:
                        # Broadcast emoji reaction back to all connections in the room to trigger CSS float animations
                        await manager.broadcast(meeting_code, {
                            "type": "REACTION",
                            "emoji": emoji,
                            "sender_name": name,
                            "sender_id": participant_id
                        })

                # ----------------------------------------------------------------------
                # EVENT: HEARTBEAT PING (Keepalive checks)
                # ----------------------------------------------------------------------
                elif event_type == "HEARTBEAT":
                    await manager.send_personal_message(websocket, {"type": "HEARTBEAT_ACK"})
            except Exception as e:
                import traceback
                print(f"ERROR processing event: {e}")
                traceback.print_exc()
                await manager.send_personal_message(websocket, {"type": "ERROR", "message": f"Server error: {str(e)}"})
            finally:
                db.close()

    except WebSocketDisconnect:
        # Handles sudden disconnections (browser closed, tab crash, network timeout)
        print(f"DEBUG: [WebSocketDisconnect] Caught disconnect for user {name} in room {meeting_code}")
        db = SessionLocal()
        try:
            # Remove connection from connection pool
            left_name = manager.disconnect(websocket, meeting_code)
            print(f"DEBUG: [WebSocketDisconnect] Disconnected user: {left_name}")
            if left_name:
                # Update SQLite database to set left_at timestamp
                crud.record_participant_left(db, meeting_id, left_name)
                
                # Broadcast updated participants snapshot with USER_LEFT
                participants_list = manager.get_participants_snapshot(meeting_code)
                await manager.broadcast(meeting_code, {
                    "type": "USER_LEFT",
                    "name": left_name,
                    "participants": participants_list
                })
        except Exception as e:
            print(f"DEBUG: [WebSocketDisconnect] Error in disconnect block: {e}")
        finally:
            db.close()
