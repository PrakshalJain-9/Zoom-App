from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List

import crud
import models
import schemas
from database import SessionLocal, engine
from dependencies import get_db
from config import ALLOWED_ORIGINS

# ==============================================================================
# DATABASE SCHEMA SETUP
# ==============================================================================
# Base.metadata.create_all dynamically generates the SQLite tables based on 
# SQLAlchemy models defined in models.py (Users, Meetings, Participants, ChatMessages).
# It does nothing if the database tables already exist.
models.Base.metadata.create_all(bind=engine)

# ==============================================================================
# FASTAPI APPLICATION SETUP
# ==============================================================================
app = FastAPI(title="Zoom Clone REST & WS Control Plane API")

# ==============================================================================
# CORS (CROSS-ORIGIN RESOURCE SHARING) CONFIGURATION
# ==============================================================================
# Since our Next.js frontend runs on localhost:3000 and the FastAPI backend 
# runs on localhost:8000, they are on separate origins.
# CORS headers are required to allow web requests to flow between them.
app.add_middleware(
    CORSMiddleware,
    # Origins are read from ALLOWED_ORIGINS env var (see config.py / .env)
    # Dev default: http://localhost:3000  |  Prod: https://your-frontend.com
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# GLOBAL EXCEPTION HANDLER - Ensures CORS headers survive 500 errors
# ==============================================================================
# When FastAPI raises an unhandled exception (500 Internal Server Error),
# Starlette's CORS middleware may not get a chance to attach CORS response
# headers. From the browser's perspective, the missing headers look like a
# CORS policy violation, which masks the real error in console logs.
#
# This handler intercepts ALL unhandled exceptions and returns a proper JSON
# error response WITH the necessary CORS header so the browser can report
# the actual error message instead of a misleading "Network Error".
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", ALLOWED_ORIGINS[0])
    # Only echo back the origin if it is in our allowlist
    response_origin = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": response_origin,
            "Access-Control-Allow-Credentials": "true",
        },
    )

# ==============================================================================
# APP LIFECYCLE: DATABASE SEEDING & SQLITE MIGRATIONS
# ==============================================================================
@app.on_event("startup")
def seed_database():
    """
    Triggers when FastAPI starts running.
    
    Performs two critical operations:
    1. Dynamic schema migration: SQLite does not support standard alembic auto-migrations easily.
       We inspect the table schema using SQLAlchemy 'PRAGMA table_info' to verify if the 'status' 
       column exists in the 'participants' table. If it's missing (legacy DB), we run an ALTER TABLE command.
    2. Data Seeding: Looks up if a default Host user profile exists ("host@zoomclone.com").
       If missing, registers the default account so the frontend can immediately log in/schedule meetings.
    """
    db = SessionLocal()
    # SQLite migration: add 'status' column to participants table if missing
    try:
        with engine.connect() as conn:
            # Query columns metadata from the database
            cols = [row[1] for row in conn.execute(
                __import__("sqlalchemy").text("PRAGMA table_info(participants)")
            )]
            # If status column is not present, alter table to append it
            if "status" not in cols:
                conn.execute(__import__("sqlalchemy").text(
                    "ALTER TABLE participants ADD COLUMN status VARCHAR DEFAULT 'waiting'"
                ))
                conn.commit()
    except Exception as e:
        print(f"Migration warning: {e}")

    # Seed default user host (Email: host@zoomclone.com, Password: password123)
    default_email = "host@zoomclone.com"
    user = crud.get_user_by_email(db, email=default_email)
    if not user:
        crud.create_user(db, schemas.UserCreate(
            name="Default Host", 
            email=default_email, 
            password="password123"
        ))
    db.close()

# ==============================================================================
# SUB-ROUTER REGISTRATIONS (MODULAR CODE STRUCTURE)
# ==============================================================================
# We import sub-routers to register them under the primary app instance.
# This prevents main.py from bloating and separates routing domains.
from routers.auth import router as auth_router
from routers.meetings import router as meetings_router
from websocket.handler import router as ws_router

app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(ws_router)

# ==============================================================================
# SYSTEM DIAGNOSTIC ENDPOINTS
# ==============================================================================
@app.get("/api/users", response_model=List[schemas.User], tags=["users"])
def get_users(db: Session = Depends(get_db)):
    """
    Administrative API endpoint to retrieve all registered accounts in the system.
    """
    return db.query(models.User).all()
