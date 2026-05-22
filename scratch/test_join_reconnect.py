import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_reconnect():
    # 1. Create a meeting
    print("Creating meeting...")
    res = requests.post(f"{BASE_URL}/meetings", json={"title": "Test Reconnect Meeting", "duration": 30, "host_id": "host@zoomclone.com"})
    print(f"Create meeting response status: {res.status_code}")
    if res.status_code != 201:
        print(f"Error creating meeting: {res.text}")
        return
    meeting = res.json()
    meeting_code = meeting["meeting_code"]
    print(f"Meeting created: code={meeting_code}")

    # 2. Join meeting first time (simulate fresh join)
    print("\nJoining meeting first time...")
    join_payload = {
        "display_name": "Test User",
        "is_host": False
    }
    res = requests.post(f"{BASE_URL}/meetings/{meeting_code}/join", json=join_payload)
    print(f"Join 1 status: {res.status_code}")
    if res.status_code != 200:
        print(f"Error joining first time: {res.text}")
        return
    participant = res.json()
    pid = participant["id"]
    print(f"Joined: participant_id={pid}, status={participant['status']}")

    # 3. Join meeting second time with the participant_id (simulate restore)
    print("\nJoining meeting second time (reconnect/restore)...")
    restore_payload = {
        "display_name": "Test User",
        "is_host": False,
        "participant_id": pid
    }
    res = requests.post(f"{BASE_URL}/meetings/{meeting_code}/join", json=restore_payload)
    print(f"Join 2 status: {res.status_code}")
    print(f"Join 2 response: {res.text}")

if __name__ == "__main__":
    test_reconnect()
