import uuid
from typing import List, Dict, Optional
from fastapi import WebSocket

# ==============================================================================
# WEBSOCKET CONNECTION & CONTROL PLANE STATE REGISTRY
# ==============================================================================
class ConnectionManager:
    """
    Manages active, real-time WebSocket connections for the Zoom Clone meeting rooms.
    
    Serves as the memory control plane database. Since this is an in-memory manager:
    - It maintains state in a python dictionary ('active_connections')
    - It is imported as a singleton instance throughout the app
    - Python's single-threaded async event loop prevents race conditions when editing the registry
    """
    def __init__(self):
        # Maps meeting_code (str) -> list of connected WebSockets with details (List[Dict])
        # Each client dict contains:
        # - "ws": The active FastAPI WebSocket connection instance
        # - "name": String display name of the participant
        # - "is_host": Boolean indicating if they are the creator of this meeting
        # - "id": Unique string identifier (used as Zego userID)
        # - "audio": Mic state (True=unmuted, False=muted)
        # - "video": Camera state (True=on, False=off)
        # - "hand_raised": Persistent status (True=hand raised, False=lowered)
        # - "status": Status code string ("waiting" in waiting room or "admitted" inside meeting)
        self.active_connections: Dict[str, List[Dict]] = {}

    async def connect(
        self, 
        websocket: WebSocket, 
        meeting_code: str, 
        display_name: str, 
        is_host: bool, 
        participant_id: Optional[str] = None,
        audio: bool = True,
        video: bool = True,
        status: str = "waiting"
    ) -> str:
        """
        Accepts the WebSocket handshake and registers the client connection in the pool.
        Generates/persists participant_id and broadcasts USER_JOINED event to the room.
        
        Args:
            websocket: The FastAPI WebSocket connection object.
            meeting_code: The 10-digit meeting identifier (e.g., '123-456-7890').
            display_name: The user's chosen display name.
            is_host: Whether this user has host authority.
            participant_id: Optional existing ID (for reconnection/restore flows).
            audio: Initial microphone state.
            video: Initial camera state.
            status: Initial room status ("admitted" / "waiting").
            
        Returns:
            The participant ID string.
        """
        # Accept the incoming connection handshake from the client
        await websocket.accept()
        
        # Initialize room sublist in the dictionary if they are the first connector
        if meeting_code not in self.active_connections:
            self.active_connections[meeting_code] = []
        
        # Generate new user ID if none is restored
        if not participant_id:
            participant_id = str(uuid.uuid4())
            
        # Structure connection metadata
        connection_info = {
            "ws": websocket, 
            "name": display_name, 
            "is_host": is_host,
            "id": participant_id,
            "audio": audio,
            "video": video,
            "hand_raised": False,
            "status": status
        }
        
        # Register the client connection in the memory pool
        self.active_connections[meeting_code].append(connection_info)
        
        # Capture current meeting room participants snapshot to send to the joining user
        participants_list = self.get_participants_snapshot(meeting_code)
        
        # Broadcast user joining event to all clients in the room
        await self.broadcast(meeting_code, {
            "type": "USER_JOINED", 
            "name": display_name,
            "id": participant_id,
            "is_host": is_host,
            "participants": participants_list
        })
        return participant_id

    def disconnect(self, websocket: WebSocket, meeting_code: str) -> Optional[str]:
        """
        Deregisters a WebSocket connection from the in-memory registry.
        Cleans up empty room dictionary keys to prevent memory leaks.
        
        Args:
            websocket: The WebSocket instance that disconnected.
            meeting_code: The meeting code room to clean up.
            
        Returns:
            The display name of the participant who left, or None.
        """
        if meeting_code in self.active_connections:
            display_name = None
            
            # Find and record leaving user display name for logs/broadcasts
            for p in self.active_connections[meeting_code]:
                if p["ws"] == websocket:
                    display_name = p["name"]
                    break
            
            # Rebuild list excluding the disconnected websocket
            self.active_connections[meeting_code] = [p for p in self.active_connections[meeting_code] if p["ws"] != websocket]
            
            # Delete room key entirely if no active connections remain
            if len(self.active_connections[meeting_code]) == 0:
                del self.active_connections[meeting_code]
                
            return display_name
        return None

    def get_participants_snapshot(self, meeting_code: str) -> List[Dict]:
        """
        Generates a clean serialization-ready JSON list of participants in a room.
        Excludes the raw 'ws' WebSocket connection objects to prevent JSON encoding errors.
        """
        if meeting_code not in self.active_connections:
            return []
        return [
            {
                "id": p["id"],
                "name": p["name"],
                "is_host": p["is_host"],
                "audio": p["audio"],
                "video": p["video"],
                "hand_raised": p["hand_raised"],
                "status": p["status"]
            } 
            for p in self.active_connections[meeting_code]
        ]

    async def broadcast(self, meeting_code: str, message: dict, sender_ws: WebSocket = None):
        """
        Sends a JSON message to room connections.
        
        Supports Private Routing:
        - If 'target_user_id' is set in the message, it filters and sends ONLY to that participant
          and the sender_ws (to keep sender UI in sync).
        - Otherwise, broadcasts to all connections in the meeting room.
        
        Defensive Exception Handling:
        - Catches and silences individual socket send errors (e.g. broken connection).
        - Prevents a bad socket connection for one user from crashing the broadcast to all other users.
        """
        print(f"DEBUG: [broadcast] Broadcasting {message.get('type')} to room {meeting_code}...")
        if meeting_code in self.active_connections:
            target_user_id = message.get("target_user_id")
            for connection in self.active_connections[meeting_code]:
                name = connection.get("name", "Unknown")
                conn_id = connection.get("id")
                
                # Check for private message routing constraints
                if target_user_id:
                    # Skip if the user is neither the target nor the sender
                    if conn_id != target_user_id and connection["ws"] != sender_ws:
                        continue
                
                print(f"DEBUG: [broadcast] Sending message to participant {name}...")
                try:
                    await connection["ws"].send_json(message)
                    print(f"DEBUG: [broadcast] Sent successfully to participant {name}")
                except Exception as e:
                    # Log connection send failures but continue loop for remaining clients
                    print(f"DEBUG: [broadcast] Error sending to participant {name}: {e}")
        print(f"DEBUG: [broadcast] Broadcast {message.get('type')} complete for room {meeting_code}")

    async def send_personal_message(self, websocket: WebSocket, message: dict):
        """
        Sends a private message to a specific connection socket.
        Useful for error responses or heartbeat acknowledgements.
        """
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def close_all_connections(self, meeting_code: str):
        """
        Forces all WebSockets inside a meeting room to close.
        Triggered when a host ends the meeting, forcing clients back to dashboard.
        """
        print(f"DEBUG: [close_all_connections] Closing connections for room {meeting_code}...")
        if meeting_code in self.active_connections:
            for connection in self.active_connections[meeting_code]:
                name = connection.get("name", "Unknown")
                print(f"DEBUG: [close_all_connections] Closing websocket for user {name}...")
                try:
                    # Closes socket. Clients will capture this as disconnection state.
                    await connection["ws"].close()
                    print(f"DEBUG: [close_all_connections] Websocket closed for user {name}")
                except Exception as e:
                    print(f"DEBUG: [close_all_connections] Error closing websocket for user {name}: {e}")
                    
            # Clear room state entry from dict
            del self.active_connections[meeting_code]
        print(f"DEBUG: [close_all_connections] Done closing all connections for room {meeting_code}")

# Instantiate the singleton manager instance
manager = ConnectionManager()
