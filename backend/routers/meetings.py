from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

import crud
import schemas
import models
from dependencies import get_db, get_current_user
from config import ZEGO_APP_ID
from services.zego import get_zego_rtc_token
from manager import manager

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

# ==============================================================================
# ROUTE: POST /api/meetings
# ==============================================================================
@router.post("", response_model=schemas.Meeting, status_code=status.HTTP_201_CREATED)
def create_meeting(
    meeting: schemas.MeetingCreate, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Creates a new meeting schedule.
    
    Determines and binds the Host ID:
    - First attempts to bind to the currently authenticated user (via JWT header).
    - If no JWT is present, attempts to resolve host_id parameter from database lookup.
    - Falls back to seeding and binding to a default host account ("host@zoomclone.com").
    """
    # Resolve meeting creator/host binding
    if current_user:
        host = current_user
    else:
        # Check lookup by email or user ID if provided
        if "@" in meeting.host_id:
            host = crud.get_user_by_email(db, email=meeting.host_id)
        else:
            host = crud.get_user(db, user_id=meeting.host_id)
            
        if not host:
            # Automatic fallback to default host to ensure meeting is created without errors
            default_email = "host@zoomclone.com"
            host = crud.get_user_by_email(db, email=default_email)
            if not host:
                host = crud.create_user(db, schemas.UserCreate(
                    name="Default Host", 
                    email=default_email,
                    password="password123"
                ))
                
    meeting.host_id = host.id
    
    # Initialize URL values (unused since Zego handles local RTC connection streams)
    meeting.daily_room_url = None
    meeting.video_url = None
        
    return crud.create_meeting(db=db, meeting=meeting)

# ==============================================================================
# ROUTE: GET /api/meetings
# ==============================================================================
@router.get("", response_model=List[schemas.Meeting])
def read_meetings(
    skip: int = 0,
    limit: int = 100,
    current_user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves all meetings scheduled/run by the currently logged-in host user.
    """
    if current_user:
        return db.query(models.Meeting).filter(models.Meeting.host_id == current_user.id).offset(skip).limit(limit).all()
    return []

# ==============================================================================
# ROUTE: GET /api/meetings/{meeting_code}
# ==============================================================================
@router.get("/{meeting_code}", response_model=schemas.Meeting)
def get_meeting(meeting_code: str, db: Session = Depends(get_db)):
    """
    Retrieves details of a meeting by its code (e.g. '123-456-7890').
    Used to verify meeting existence before redirecting users to the join lobby.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

# ==============================================================================
# ROUTE: POST /api/meetings/{meeting_code}/join
# ==============================================================================
@router.post("/{meeting_code}/join", response_model=schemas.Participant)
def join_meeting(
    meeting_code: str, 
    join_req: schemas.MeetingJoinRequest, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Lobby join validation logic. Registers participant record and returns Zego token.
    
    Main Flows handled:
    1. Passcode validation (if a passcode exists on the meeting).
    2. Persistent Session Restoration: If client provides participant_id, we restore 
       their existing database participant session instead of creating a new one (resolves browser refreshes!).
    3. Secure Role Verification: Completely ignores the client-side 'is_host' parameter.
       Determines host privilege strictly by comparing current JWT user ID to meeting host ID.
    4. Duplicate user cleanup: If a user with the same credentials/name joins again,
       mark old active entries as left to prevent ghost streams in the user layout.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if meeting.is_ended:
        raise HTTPException(status_code=400, detail="This meeting has already ended")
        
    if meeting.passcode and meeting.passcode != join_req.passcode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect meeting passcode")

    # RESTORE PERSISTENT SESSION (Handles browser reloads / network disconnect rejoins)
    if join_req.participant_id:
        existing_p = db.query(models.Participant).filter(
            models.Participant.id == join_req.participant_id,
            models.Participant.meeting_id == meeting.id
        ).first()
        if existing_p:
            existing_p.left_at = None  # Clear left timestamp to make active
            if not existing_p.status:
                existing_p.status = "admitted" if existing_p.is_host else "waiting"
            db.commit()
            db.refresh(existing_p)
            
            # Re-generate fresh Zego RTC token
            existing_p.token = get_zego_rtc_token(str(existing_p.id), str(meeting_code))
            existing_p.zego_app_id = ZEGO_APP_ID if existing_p.token != "mock-token" else 0
            return existing_p
        
    # --- SECURE ROLE VERIFICATION ---
    join_is_host = False
    if current_user and meeting.host_id == current_user.id:
        join_is_host = True

    # CLEAN UP DUPLICATE CONNECTION LOGS
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
    
    # Mark old connections as left to avoid ghost video boxes
    for p in existing_active:
        p.left_at = datetime.datetime.utcnow()
    if existing_active:
        db.commit()

    # Create new participant entry
    participant_create = schemas.ParticipantCreate(
        display_name=join_req.display_name,
        meeting_id=meeting.id,
        user_id=current_user.id if current_user else None,
        is_host=join_is_host,
        status="admitted" if join_is_host else "waiting"
    )
    db_participant = crud.add_participant(db=db, participant=participant_create)

    # Generate token
    db_participant.token = get_zego_rtc_token(str(db_participant.id), str(meeting_code))
    db_participant.zego_app_id = ZEGO_APP_ID if db_participant.token != "mock-token" else 0

    return db_participant

# ==============================================================================
# ROUTE: POST /api/meetings/{meeting_code}/end
# ==============================================================================
@router.post("/{meeting_code}/end", response_model=schemas.Meeting)
async def end_meeting_endpoint(
    meeting_code: str, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Terminates the meeting session.
    
    Secured: Checks that the current user matches the meeting's host ID.
    Operations:
    - Marks 'is_ended' as true in SQLite database.
    - Sends a MEETING_ENDED event over WebSocket control plane.
    - Closes all active WebSocket connections, sending participants back to home dashboard.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    # Enforce authorization
    if current_user is None or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")
        
    ended_meeting = crud.end_meeting(db=db, meeting_id=meeting.id)
    
    # Send broadcast event to close active UI rooms
    await manager.broadcast(meeting_code, {
        "type": "MEETING_ENDED",
        "message": "The host has ended the meeting."
    })
    
    # Terminate active WebSocket sockets
    await manager.close_all_connections(meeting_code)
    return ended_meeting

# ==============================================================================
# ROUTE: GET /api/meetings/{meeting_code}/chat
# ==============================================================================
@router.get("/{meeting_code}/chat", response_model=List[schemas.ChatMessageResponse])
def get_meeting_chat(meeting_code: str, db: Session = Depends(get_db)):
    """
    Retrieves stored public chat history for a meeting from the database.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return crud.get_chat_history(db=db, meeting_id=meeting.id)

# ==============================================================================
# ROUTE: POST /api/meetings/{meeting_code}/recording/start
# ==============================================================================
@router.post("/{meeting_code}/recording/start")
def start_recording(meeting_code: str, db: Session = Depends(get_db)):
    """
    Simulates starting cloud recording of the meeting room.
    Updates database state to 'recording'.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.recording_status = "recording"
    db.commit()
    return {"status": "recording"}

# ==============================================================================
# ROUTE: POST /api/meetings/{meeting_code}/recording/stop
# ==============================================================================
@router.post("/{meeting_code}/recording/stop")
def stop_recording(meeting_code: str, db: Session = Depends(get_db)):
    """
    Simulates stopping cloud recording of the meeting room.
    Saves a dummy recording URL to the database and sets status to 'completed'.
    """
    meeting = crud.get_meeting_by_code(db, meeting_code=meeting_code)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.recording_status = "completed"
    meeting.recording_url = f"https://zoomclone.daily.co/recordings/{meeting.id}"
    db.commit()
    return {"status": "completed", "recording_url": meeting.recording_url}
