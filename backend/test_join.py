import os
import sys
import requests

# Add backend directory to sys.path
sys.path.append(os.path.abspath('/home/prakshal-jain/AntiGravityProjects/zoom-clone/backend'))

from database import SessionLocal
import models

db = SessionLocal()
try:
    # Get the latest meeting
    meeting = db.query(models.Meeting).order_by(models.Meeting.start_time.desc()).first()
    if not meeting:
        print("No meetings found in DB!")
        sys.exit(0)
    
    print(f"Latest Meeting Code: {meeting.meeting_code}")
    
    # Get participants for this meeting
    participants = db.query(models.Participant).filter(models.Participant.meeting_id == meeting.id).all()
    print(f"Participants count: {len(participants)}")
    for p in participants:
        print(f"Participant ID: {p.id}, Name: {p.display_name}, Left at: {p.left_at}, Status: {p.status}")
        
        # Test the join endpoint for this participant to see if it succeeds
        url = f"http://127.0.0.1:8000/api/meetings/{meeting.meeting_code}/join"
        payload = {
            "display_name": p.display_name,
            "is_host": p.is_host,
            "participant_id": p.id
        }
        print(f"Sending POST to {url} with participant_id {p.id}...")
        try:
            response = requests.post(url, json=payload)
            print(f"Response status: {response.status_code}")
            if response.status_code == 200:
                print(f"Success! Response JSON: {response.json()}")
            else:
                print(f"Failed! Response: {response.text}")
        except Exception as ex:
            print(f"Request failed: {ex}")
        print("-" * 50)
        
except Exception as e:
    print("Error:", e)
finally:
    db.close()
