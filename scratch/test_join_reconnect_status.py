import requests
import sqlite3
import os

BASE_URL = "http://127.0.0.1:8000/api"
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend/zoom_clone.db"))

def test_join_reconnect_status():
    # 1. Create a meeting
    print("1. Creating meeting...")
    res = requests.post(f"{BASE_URL}/meetings", json={"title": "Test Status Meeting", "duration": 30, "host_id": "host@zoomclone.com"})
    if res.status_code != 201:
        print(f"Error creating meeting: {res.text}")
        return
    meeting = res.json()
    meeting_code = meeting["meeting_code"]
    meeting_id = meeting["id"]
    print(f"   Meeting created: code={meeting_code}")

    # 2. Join meeting first time (simulate fresh guest join)
    print("\n2. Joining meeting first time...")
    join_payload = {
        "display_name": "Guest User",
        "is_host": False
    }
    res = requests.post(f"{BASE_URL}/meetings/{meeting_code}/join", json=join_payload)
    if res.status_code != 200:
        print(f"   Error joining: {res.text}")
        return
    participant = res.json()
    pid = participant["id"]
    print(f"   Joined: participant_id={pid}, status={participant['status']}")
    assert participant["status"] == "waiting", f"Expected 'waiting', got {participant['status']}"

    # 3. Restore session (simulate reconnect while still in 'waiting' status)
    print("\n3. Reconnecting while still waiting...")
    restore_payload = {
        "display_name": "Guest User",
        "is_host": False,
        "participant_id": pid
    }
    res = requests.post(f"{BASE_URL}/meetings/{meeting_code}/join", json=restore_payload)
    if res.status_code != 200:
        print(f"   Error restoring: {res.text}")
        return
    participant_restored = res.json()
    print(f"   Restored status (still waiting): {participant_restored['status']}")
    assert participant_restored["status"] == "waiting", f"Expected 'waiting' to be preserved, got {participant_restored['status']}"

    # 4. Simulate host admitting the participant (update status to 'admitted' in DB)
    print("\n4. Simulating host admitting user in database...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE participants SET status = 'admitted' WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    print("   Status updated to 'admitted'.")

    # 5. Restore session again (simulate reconnect after being admitted)
    print("\n5. Reconnecting after being admitted...")
    res = requests.post(f"{BASE_URL}/meetings/{meeting_code}/join", json=restore_payload)
    if res.status_code != 200:
        print(f"   Error restoring: {res.text}")
        return
    participant_admitted = res.json()
    print(f"   Restored status (admitted): {participant_admitted['status']}")
    assert participant_admitted["status"] == "admitted", f"Expected 'admitted' to be preserved, got {participant_admitted['status']}"
    print("\nSUCCESS: Status preservation verified correctly!")

if __name__ == "__main__":
    test_join_reconnect_status()
