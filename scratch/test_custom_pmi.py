import sys
import os

# Add backend folder to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from database import SessionLocal
import crud
import schemas

def test_pmi_creation_and_deduplication():
    db = SessionLocal()
    try:
        pmi_code = "555-123-4567"
        print(f"Creating first meeting under PMI {pmi_code}...")
        m1 = crud.create_meeting(db, schemas.MeetingCreate(
            title="PMI Room Run 1",
            duration=60,
            is_instant=True,
            host_id="host@zoomclone.com",
            meeting_code=pmi_code
        ))
        print(f"First meeting created: {m1.id}, code={m1.meeting_code}")

        # Add participant to first meeting
        p1 = crud.add_participant(db, schemas.ParticipantCreate(
            meeting_id=m1.id,
            display_name="Alice Test",
            user_id=m1.host_id,
            is_host=True
        ))
        print(f"Added participant {p1.id} to first meeting.")

        print(f"Creating second meeting under same PMI {pmi_code}...")
        m2 = crud.create_meeting(db, schemas.MeetingCreate(
            title="PMI Room Run 2",
            duration=60,
            is_instant=True,
            host_id="host@zoomclone.com",
            meeting_code=pmi_code
        ))
        print(f"Second meeting created successfully: {m2.id}, code={m2.meeting_code}")

        # Check if first meeting is deleted
        m1_check = crud.get_meeting_by_code(db, pmi_code)
        assert m1_check is not None, "Meeting should exist"
        assert m1_check.id == m2.id, f"Meeting ID should be the second one ({m2.id}), got {m1_check.id}"
        print("✅ Success: The second meeting replaced the first one and avoided constraint conflict!")
        
    except Exception as e:
        print(f"❌ Test Failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_pmi_creation_and_deduplication()
