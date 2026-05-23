import os
from dotenv import load_dotenv

# ==============================================================================
# ENVIRONMENT & CONFIGURATION INITIALIZATION
# ==============================================================================
# load_dotenv reads the local '.env' file in the backend root directory 
# and loads variables into os.environ.
load_dotenv()

# ==============================================================================
# JWT (JSON WEB TOKEN) AUTHENTICATION SETTINGS
# ==============================================================================
# SECRET_KEY is used for signing the JWT tokens (cryptographic validation).
# ALWAYS override with a secure random string in production via env var.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "zoom_clone_secret_key_change_me_in_production_123456789")

# ALGORITHM defines the cryptographic signing algorithm (HS256 = HMAC-SHA256).
ALGORITHM = "HS256"

# ACCESS_TOKEN_EXPIRE_MINUTES — token lifespan (24 hours).
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

# ==============================================================================
# ZEGO CLOUD WEBRTC VIDEO/AUDIO SERVICE INTEGRATION
# ==============================================================================
# Get these from: https://console.zegocloud.com → Your Project
ZEGO_APP_ID = int(os.getenv("ZEGO_APP_ID", "0"))
ZEGO_SERVER_SECRET = os.getenv("ZEGO_SERVER_SECRET", "")

# ==============================================================================
# CORS — ALLOWED FRONTEND ORIGINS
# ==============================================================================
# Comma-separated list of allowed origins from ALLOWED_ORIGINS env var.
# In production set to your frontend URL: https://yourdomain.com
# In development defaults to localhost on port 3000.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

