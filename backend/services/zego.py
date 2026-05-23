from config import ZEGO_APP_ID, ZEGO_SERVER_SECRET
from zego_token import get_zego_token as generate_raw_zego_token

# ==============================================================================
# ZEGO CLOUD WEBRTC TOKEN SERVICE
# ==============================================================================
def get_zego_rtc_token(user_id: str, room_id: str) -> str:
    """
    Generates a secure WebRTC token for Zego client SDK initialization.
    
    This function checks if the environment credentials (ZEGO_APP_ID and ZEGO_SERVER_SECRET) 
    are properly set in the config. If they are missing, it logs a warning and falls back 
    to a dummy "mock-token", allowing offline/local-only development without breaking the join flow.
    
    Args:
        user_id: Unique string ID of the joining participant (maps to participant.id in SQLite).
        room_id: The 10-character meeting room code (e.g. '123-456-7890').
        
    Returns:
        A cryptographically generated Zego token string or a fallback 'mock-token'.
    """
    if ZEGO_APP_ID and ZEGO_SERVER_SECRET:
        try:
            # Generate the token using the SDK-specific helper function in zego_token.py
            return generate_raw_zego_token(
                app_id=ZEGO_APP_ID,
                server_secret=ZEGO_SERVER_SECRET,
                user_id=user_id,
                room_id=room_id
            )
        except Exception as e:
            # Catch token generation errors (like value overflows) and return fallback token
            print(f"ERROR: Exception while generating Zego token in service: {e}")
            return "mock-token"
    else:
        # Gracefully handle missing credentials, preventing server crash
        print("WARNING: ZEGO credentials missing. Sending mock token.")
        return "mock-token"
