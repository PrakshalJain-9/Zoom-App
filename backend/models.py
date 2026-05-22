from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    meetings = relationship("Meeting", back_populates="host")


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    meeting_code = Column(String, unique=True, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    duration = Column(Integer, default=60) # in minutes
    is_instant = Column(Boolean, default=False)
    video_url = Column(String, nullable=True)
    passcode = Column(String, nullable=True)
    is_ended = Column(Boolean, default=False)
    recording_status = Column(String, default="none") # none, recording, paused, completed
    recording_url = Column(String, nullable=True)
    daily_room_url = Column(String, nullable=True)
    host_id = Column(String, ForeignKey("users.id"))

    host = relationship("User", back_populates="meetings")
    participants = relationship("Participant", back_populates="meeting")
    chat_messages = relationship("ChatMessage", back_populates="meeting", cascade="all, delete-orphan")


class Participant(Base):
    __tablename__ = "participants"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    meeting_id = Column(String, ForeignKey("meetings.id"))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    display_name = Column(String)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)
    left_at = Column(DateTime, nullable=True)
    is_host = Column(Boolean, default=False)
    audio_enabled = Column(Boolean, default=True)
    video_enabled = Column(Boolean, default=True)
    hand_raised = Column(Boolean, default=False)
    status = Column(String, default="waiting")

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    meeting_id = Column(String, ForeignKey("meetings.id"), index=True)
    sender_name = Column(String)
    message_text = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    meeting = relationship("Meeting", back_populates="chat_messages")

