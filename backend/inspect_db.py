import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath('/home/prakshal-jain/AntiGravityProjects/zoom-clone/backend'))

from database import SessionLocal
import models

db = SessionLocal()
try:
    print("=== MEETINGS ===")
    meetings = db.query(models.Meeting).all()
    for m in meetings:
        print(f"ID: {m.id}, Code: {m.meeting_code}, Host ID: {m.host_id}, Ended: {m.is_ended}")
        
    print("\n=== PARTICIPANTS ===")
    participants = db.query(models.Participant).order_by(models.Participant.joined_at.desc()).all()
    for p in participants:
        print(f"ID: {p.id}, Meeting ID: {p.meeting_id}, Name: {p.display_name}, Status: {p.status}, Left: {p.left_at}, Host: {p.is_host}, Hand: {p.hand_raised}, Audio: {p.audio_enabled}, Video: {p.video_enabled}")
except Exception as e:
    print("Error:", e)
finally:
    db.close()
