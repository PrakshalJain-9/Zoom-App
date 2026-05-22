from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    name: str
    email: str

class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v

class UserLogin(BaseModel):
    email: str
    password: str

class User(UserBase):
    id: str
    is_active: bool

    class Config:
        from_attributes = True

# --- AUTH SCHEMAS ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- MEETING SCHEMAS ---
class MeetingBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    duration: Optional[int] = 60
    is_instant: Optional[bool] = False
    video_url: Optional[str] = None
    passcode: Optional[str] = None
    is_ended: Optional[bool] = False
    recording_status: Optional[str] = "none"
    recording_url: Optional[str] = None
    daily_room_url: Optional[str] = None

class MeetingCreate(MeetingBase):
    host_id: str # Host ID can be UUID or email
    meeting_code: Optional[str] = None

class Meeting(MeetingBase):
    id: str
    meeting_code: str
    host_id: str

    class Config:
        from_attributes = True

# --- PARTICIPANT SCHEMAS ---
class ParticipantBase(BaseModel):
    display_name: str

class MeetingJoinRequest(BaseModel):
    display_name: str
    passcode: Optional[str] = None
    is_host: Optional[bool] = False
    participant_id: Optional[str] = None

class ParticipantCreate(ParticipantBase):
    meeting_id: str
    user_id: Optional[str] = None
    is_host: Optional[bool] = False
    status: Optional[str] = "waiting"

class ParticipantUpdate(BaseModel):
    audio_enabled: Optional[bool] = None
    video_enabled: Optional[bool] = None
    hand_raised: Optional[bool] = None
    status: Optional[str] = None

class Participant(ParticipantBase):
    id: str
    meeting_id: str
    user_id: Optional[str] = None
    joined_at: datetime
    left_at: Optional[datetime] = None
    is_host: bool
    audio_enabled: bool
    video_enabled: bool
    hand_raised: bool
    status: str
    token: Optional[str] = None
    zego_app_id: Optional[int] = None

    @field_validator('is_host', mode='before')
    @classmethod
    def validate_is_host(cls, v):
        return False if v is None else bool(v)

    @field_validator('audio_enabled', mode='before')
    @classmethod
    def validate_audio(cls, v):
        return True if v is None else bool(v)

    @field_validator('video_enabled', mode='before')
    @classmethod
    def validate_video(cls, v):
        return True if v is None else bool(v)

    @field_validator('hand_raised', mode='before')
    @classmethod
    def validate_hand(cls, v):
        return False if v is None else bool(v)

    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v):
        return "waiting" if v is None else str(v)

    class Config:
        from_attributes = True

# --- CHAT MESSAGE SCHEMAS ---
class ChatMessageBase(BaseModel):
    message_text: str

class ChatMessageCreate(ChatMessageBase):
    meeting_id: str
    sender_name: str

class ChatMessageResponse(ChatMessageBase):
    id: str
    meeting_id: str
    sender_name: str
    timestamp: datetime

    class Config:
        from_attributes = True
