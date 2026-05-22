import os
if os.path.exists("zoom_clone.db"):
    try:
        os.remove("zoom_clone.db")
    except Exception as e:
        print(f"Warning: Could not delete zoom_clone.db: {e}")

import json
import sys
import datetime
import threading
import time
import asyncio
import requests
import websockets
import uvicorn

# We will start the Uvicorn server on port 8001
BASE_URL = "http://127.0.0.1:8001"
WS_URL = "ws://127.0.0.1:8001"

def start_server():
    uvicorn.run("main:app", host="127.0.0.1", port=8001, log_level="warning")

async def async_websocket_tests(meeting_code, token):
    # Bob connects (no token)
    bob_url = f"{WS_URL}/ws/meeting/{meeting_code}?name=Bob+Guest"
    alice_url = f"{WS_URL}/ws/meeting/{meeting_code}?name=Alice+Host&token={token}"
    
    print("Step 8.1: Connecting Bob Guest...")
    async with websockets.connect(bob_url) as ws_bob:
        print("Step 8.2: Bob waiting for self USER_JOINED...")
        event_join = json.loads(await ws_bob.recv())
        assert event_join["type"] == "USER_JOINED"
        assert event_join["name"] == "Bob Guest"
        assert len(event_join["participants"]) == 1
        print("Step 8.3: Bob connected successfully.")
        
        print("Step 8.4: Connecting Alice Host...")
        async with websockets.connect(alice_url) as ws_alice:
            print("Step 8.5: Bob waiting for Alice USER_JOINED...")
            event_alice_join = json.loads(await ws_bob.recv())
            assert event_alice_join["type"] == "USER_JOINED"
            assert event_alice_join["name"] == "Alice Host"
            assert event_alice_join["is_host"] is True
            assert len(event_alice_join["participants"]) == 2

            print("Step 8.6: Alice waiting for self USER_JOINED snapshot...")
            event_alice_snapshot = json.loads(await ws_alice.recv())
            assert event_alice_snapshot["type"] == "USER_JOINED"
            assert len(event_alice_snapshot["participants"]) == 2

            print("Step 8.7: Bob sending CHAT_MESSAGE...")
            await ws_bob.send(json.dumps({
                "type": "CHAT_MESSAGE",
                "message_text": "Hello everyone!"
            }))

            print("Step 8.8: Bob receiving CHAT_MESSAGE back...")
            chat_bob = json.loads(await ws_bob.recv())
            assert chat_bob["type"] == "CHAT_MESSAGE"
            assert chat_bob["sender_name"] == "Bob Guest"
            assert chat_bob["message_text"] == "Hello everyone!"

            print("Step 8.9: Alice receiving CHAT_MESSAGE from Bob...")
            chat_alice = json.loads(await ws_alice.recv())
            assert chat_alice["type"] == "CHAT_MESSAGE"
            assert chat_alice["sender_name"] == "Bob Guest"
            assert chat_alice["message_text"] == "Hello everyone!"
            print("✅ Chat messages broadcast successfully to all connections.")

            print("Step 8.10: Bob sending STATE_UPDATE (Mute audio)...")
            await ws_bob.send(json.dumps({
                "type": "STATE_UPDATE",
                "audio_enabled": False
            }))

            print("Step 8.11: Bob receiving PARTICIPANTS_UPDATE...")
            state_bob = json.loads(await ws_bob.recv())
            assert state_bob["type"] == "PARTICIPANTS_UPDATE"
            bob_item = next(p for p in state_bob["participants"] if p["name"] == "Bob Guest")
            assert bob_item["audio"] is False

            print("Step 8.12: Alice receiving PARTICIPANTS_UPDATE...")
            state_alice = json.loads(await ws_alice.recv())
            assert state_alice["type"] == "PARTICIPANTS_UPDATE"
            bob_item_alice = next(p for p in state_alice["participants"] if p["name"] == "Bob Guest")
            assert bob_item_alice["audio"] is False
            print("✅ Media state updates are synced in-memory and broadcast correctly.")

            print("Step 8.13: Alice sending HOST_COMMAND (mute_all)...")
            await ws_alice.send(json.dumps({
                "type": "HOST_COMMAND",
                "command": "mute_all"
            }))

            print("Step 8.14: Bob waiting for HOST_COMMAND mute_all...")
            mute_cmd_bob = json.loads(await ws_bob.recv())
            print(f"Step 8.15: Bob received: {mute_cmd_bob}")
            assert mute_cmd_bob["type"] == "HOST_COMMAND"
            assert mute_cmd_bob["command"] == "mute_all"

            print("Step 8.16: Bob waiting for PARTICIPANTS_UPDATE mute_all...")
            update_bob = json.loads(await ws_bob.recv())
            print(f"Step 8.17: Bob received: {update_bob}")
            assert update_bob["type"] == "PARTICIPANTS_UPDATE"
            bob_muted = next(p for p in update_bob["participants"] if p["name"] == "Bob Guest")
            assert bob_muted["audio"] is False
            print("✅ Host-mute-all command executed and synchronized successfully.")

            print("Step 8.18: Alice sending HOST_COMMAND (end_meeting)...")
            await ws_alice.send(json.dumps({
                "type": "HOST_COMMAND",
                "command": "end_meeting"
            }))

            print("Step 8.19: Bob waiting for MEETING_ENDED...")
            ended_bob = json.loads(await ws_bob.recv())
            print(f"Step 8.20: Bob received: {ended_bob}")
            assert ended_bob["type"] == "MEETING_ENDED"

            print("Step 8.21: Bob waiting for disconnection...")
            try:
                await ws_bob.recv()
                print("Step 8.22: Bob did not disconnect?")
            except websockets.exceptions.ConnectionClosed:
                print("Step 8.23: Bob disconnected as expected.")

def run_tests():
    print("==================================================")
    print("🚀 STARTING BACKEND & SQLITE FUNCTIONAL TESTS")
    print("==================================================")

    # Start server in thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(1.5) # Wait for uvicorn to bind

    # 1. TEST USER VALIDATION (Password length)
    print("\n[Test 1] Verifying Password Length Validation...")
    bad_user_payload = {
        "name": "Weak User",
        "email": "weak@zoomclone.com",
        "password": "123" # too short!
    }
    res = requests.post(f"{BASE_URL}/api/auth/register", json=bad_user_payload)
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"
    detail = res.json()["detail"][0]
    assert "Password must be at least 6 characters long" in detail["msg"], f"Unexpected validation msg: {detail['msg']}"
    print("✅ Password length validation works (Pydantic @field_validator caught it).")

    # 2. TEST USER REGISTRATION (Success)
    print("\n[Test 2] Verifying User Registration...")
    user_payload = {
        "name": "Alice Host",
        "email": "alice@zoomclone.com",
        "password": "securepassword123"
    }
    res = requests.post(f"{BASE_URL}/api/auth/register", json=user_payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    user_data = res.json()
    assert user_data["name"] == "Alice Host"
    assert user_data["email"] == "alice@zoomclone.com"
    assert "id" in user_data
    print("✅ User registered successfully.")

    # 3. TEST USER LOGIN & JWT AUTHENTICATION
    print("\n[Test 3] Verifying Login & JWT Generation...")
    login_payload = {
        "email": "alice@zoomclone.com",
        "password": "securepassword123"
    }
    res = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    token_data = res.json()
    assert token_data["token_type"] == "bearer"
    assert "access_token" in token_data
    token = token_data["access_token"]
    print("✅ Logged in successfully. Token generated.")

    # 4. TEST USER LOGIN FAIL
    print("\n[Test 4] Verifying Invalid Credentials...")
    bad_login_payload = {
        "email": "alice@zoomclone.com",
        "password": "wrongpassword"
    }
    res = requests.post(f"{BASE_URL}/api/auth/login", json=bad_login_payload)
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("✅ Invalid credentials rejected correctly with 401.")

    # 5. TEST GET CURRENT USER PROFILE
    print("\n[Test 5] Verifying Profile Retrieval...")
    headers = {"Authorization": f"Bearer {token}"}
    res = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    profile = res.json()
    assert profile["email"] == "alice@zoomclone.com"
    print("✅ Profile retrieved correctly using JWT.")

    # 6. TEST CREATE MEETING WITH PASSCODE
    print("\n[Test 6] Verifying Meeting Creation (with passcode)...")
    meeting_payload = {
        "title": "Weekly Planning Sync",
        "description": "Aligning on Sprint 4 tasks",
        "duration": 45,
        "passcode": "secret99",
        "host_id": "alice@zoomclone.com"
    }
    res = requests.post(f"{BASE_URL}/api/meetings", json=meeting_payload, headers=headers)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}"
    meeting = res.json()
    assert meeting["title"] == "Weekly Planning Sync"
    assert meeting["passcode"] == "secret99"
    assert "meeting_code" in meeting
    assert meeting["is_ended"] is False
    meeting_code = meeting["meeting_code"]
    print(f"✅ Meeting created. Code: {meeting_code}, Passcode: {meeting['passcode']}")

    # 7. TEST JOIN MEETING PASSCODE VALIDATION
    print("\n[Test 7] Verifying Passcode Verification on Joining...")
    join_payload_bad = {
        "display_name": "Bob Guest",
        "passcode": "wrongcode"
    }
    res = requests.post(f"{BASE_URL}/api/meetings/{meeting_code}/join", json=join_payload_bad)
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"
    
    join_payload_good = {
        "display_name": "Bob Guest",
        "passcode": "secret99"
    }
    res = requests.post(f"{BASE_URL}/api/meetings/{meeting_code}/join", json=join_payload_good)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    participant = res.json()
    assert participant["display_name"] == "Bob Guest"
    assert participant["is_host"] is False
    assert "token" in participant
    assert participant["token"] is not None
    assert "zego_app_id" in participant
    print("✅ Passcode check behaves perfectly: incorrect passcode rejected (403), correct passcode joins successfully with Zego token.")
    # 8. TEST WEBSOCKET CONTROL PLANE SIGNALING
    print("\n[Test 8] Verifying WebSocket Control Plane & JSON Events...")
    asyncio.run(async_websocket_tests(meeting_code, token))
    print("✅ WebSocket Control Plane verified (Chat, State Update, Mute All, End Meeting).")

    # 9. TEST CHAT ARCHIVE / FETCH HISTORY REST API
    print("\n[Test 9] Verifying Chat History persistence in SQLite...")
    res = requests.get(f"{BASE_URL}/api/meetings/{meeting_code}/chat")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    history = res.json()
    assert len(history) == 1
    assert history[0]["sender_name"] == "Bob Guest"
    assert history[0]["message_text"] == "Hello everyone!"
    print("✅ Chat message is archived in SQLite and successfully fetched via REST.")

    # 10. VERIFY MEETING IS ENDED IN SQLITE
    print("\n[Test 10] Verifying Meeting End Status in SQLite...")
    res = requests.get(f"{BASE_URL}/api/meetings/{meeting_code}")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    meeting_status = res.json()
    assert meeting_status["is_ended"] is True, "Meeting should be marked ended"
    print("✅ Meeting end status stored correctly in the database.")

    print("\n==================================================")
    print("🎉 ALL TESTS PASSED FLAWLESSLY!")
    print("==================================================")

if __name__ == "__main__":
    try:
        run_tests()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ TEST FAILURE: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
