from sqlalchemy.orm import Session
import models, schemas
import uuid
import random
import hashlib
import secrets
import datetime

# --- PASSWORD HASHING (PBKDF2 SHA256) ---
def get_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 100000
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${dk.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        parts = hashed_password.split('$')
        if len(parts) != 4 or parts[0] != 'pbkdf2_sha256':
            return False
        iterations = int(parts[1])
        salt = parts[2]
        stored_hash = parts[3]
        dk = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt.encode('utf-8'), iterations)
        return secrets.compare_digest(dk.hex(), stored_hash)
    except Exception:
        return False

# --- USER CRUD ---
def get_user(db: Session, user_id: str):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(name=user.name, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- MEETING CRUD ---
def generate_meeting_code():
    return f"{random.randint(100,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"

def create_meeting(db: Session, meeting: schemas.MeetingCreate):
    meeting_data = meeting.model_dump() if hasattr(meeting, "model_dump") else meeting.dict()
    custom_code = meeting_data.pop("meeting_code", None)
    
    if custom_code:
        existing_meeting = db.query(models.Meeting).filter(models.Meeting.meeting_code == custom_code).first()
        if existing_meeting:
            # Delete associated participants and chat messages to clear references
            db.query(models.Participant).filter(models.Participant.meeting_id == existing_meeting.id).delete()
            db.query(models.ChatMessage).filter(models.ChatMessage.meeting_id == existing_meeting.id).delete()
            db.delete(existing_meeting)
            db.commit()
        meeting_code = custom_code
    else:
        meeting_code = generate_meeting_code()
        # ensure uniqueness
        while get_meeting_by_code(db, meeting_code):
            meeting_code = generate_meeting_code()
        
    db_meeting = models.Meeting(
        **meeting_data,
        meeting_code=meeting_code
    )
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def get_meeting_by_code(db: Session, meeting_code: str):
    return db.query(models.Meeting).filter(models.Meeting.meeting_code == meeting_code).first()

def get_meetings(db: Session, skip: int = 0, limit: int = 100):
    # Only get non-ended meetings or all? Zoom clone dashboard typically displays recent schedules.
    # Let's get all sorted by start time
    return db.query(models.Meeting).order_by(models.Meeting.start_time.desc()).offset(skip).limit(limit).all()

def end_meeting(db: Session, meeting_id: str):
    db_meeting = db.query(models.Meeting).filter(models.Meeting.id == meeting_id).first()
    if db_meeting:
        db_meeting.is_ended = True
        db.commit()
        db.refresh(db_meeting)
    return db_meeting

# --- PARTICIPANT CRUD ---
def add_participant(db: Session, participant: schemas.ParticipantCreate):
    meeting = db.query(models.Meeting).filter(models.Meeting.id == participant.meeting_id).first()
    is_host = False
    if meeting and participant.user_id and meeting.host_id == participant.user_id:
        is_host = True
        
    participant_data = participant.model_dump() if hasattr(participant, "model_dump") else participant.dict()
    # Set default is_host if not explicitly provided
    if "is_host" not in participant_data or participant_data["is_host"] is None:
        participant_data["is_host"] = is_host
        
    if "status" not in participant_data or participant_data["status"] is None:
        participant_data["status"] = "admitted" if participant_data["is_host"] else "waiting"
        
    db_participant = models.Participant(**participant_data)
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant

def record_participant_left(db: Session, meeting_id: str, display_name: str):
    db_participant = db.query(models.Participant).filter(
        models.Participant.meeting_id == meeting_id,
        models.Participant.display_name == display_name,
        models.Participant.left_at == None
    ).order_by(models.Participant.joined_at.desc()).first()
    
    if db_participant:
        db_participant.left_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(db_participant)
    return db_participant

def update_participant_state(db: Session, meeting_id: str, display_name: str, updates: schemas.ParticipantUpdate):
    print(f"DEBUG: [update_participant_state] Querying participant {display_name} in meeting {meeting_id}...")
    db_participant = db.query(models.Participant).filter(
        models.Participant.meeting_id == meeting_id,
        models.Participant.display_name == display_name,
        models.Participant.left_at == None
    ).order_by(models.Participant.joined_at.desc()).first()
    
    if db_participant:
        print(f"DEBUG: [update_participant_state] Participant found. Applying updates...")
        update_data = updates.model_dump(exclude_unset=True) if hasattr(updates, "model_dump") else updates.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_participant, key, value)
        print(f"DEBUG: [update_participant_state] Committing changes...")
        db.commit()
        print(f"DEBUG: [update_participant_state] Refreshing object...")
        db.refresh(db_participant)
        print(f"DEBUG: [update_participant_state] Finished successfully.")
    else:
        print(f"DEBUG: [update_participant_state] Participant {display_name} not found.")
    return db_participant

def get_active_participants(db: Session, meeting_id: str):
    return db.query(models.Participant).filter(
        models.Participant.meeting_id == meeting_id,
        models.Participant.left_at == None
    ).all()

# --- CHAT MESSAGE CRUD ---
def save_chat_message(db: Session, chat: schemas.ChatMessageCreate):
    chat_data = chat.model_dump() if hasattr(chat, "model_dump") else chat.dict()
    db_msg = models.ChatMessage(**chat_data)
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg

def get_chat_history(db: Session, meeting_id: str, limit: int = 100):
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.meeting_id == meeting_id
    ).order_by(models.ChatMessage.timestamp.asc()).limit(limit).all()
