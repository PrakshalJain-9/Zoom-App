import os
import sys

# Add backend directory to sys.path to import schemas and models
sys.path.append(os.path.abspath('/home/prakshal-jain/AntiGravityProjects/zoom-clone/backend'))

from database import SessionLocal
import models
import schemas

db = SessionLocal()
try:
    participants = db.query(models.Participant).all()
    print(f"Total participants in DB: {len(participants)}")
    
    for p in participants:
        try:
            p_schema = schemas.Participant.model_validate(p)
            # print(f"Successfully validated participant {p.id}")
        except Exception as e:
            print(f"FAILED validation for participant {p.id}:")
            print(f"  Name: {p.display_name}")
            print(f"  Joined at: {p.joined_at}")
            print(f"  Left at: {p.left_at}")
            print(f"  Is host: {p.is_host}")
            print(f"  Audio enabled: {p.audio_enabled}")
            print(f"  Video enabled: {p.video_enabled}")
            print(f"  Hand raised: {p.hand_raised}")
            print(f"  Status: {p.status}")
            print(f"  Error: {e}")
            print("-" * 50)
            
except Exception as e:
    print("Database or general error:", e)
finally:
    db.close()
