from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

import crud
import schemas
import models
from dependencies import get_db, get_current_user, create_access_token

# Define router with a prefix so endpoints map to '/api/auth/*'
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# ==============================================================================
# ROUTE: POST /api/auth/anonymous-session
# ==============================================================================
@router.post("/anonymous-session")
def create_anonymous_session(db: Session = Depends(get_db)):
    """
    Creates a temporary guest/anonymous user session.
    
    This endpoint allows participants who click an invite link (but are not registered users)
    to get a JWT authentication token. They are temporarily seeded into the database 
    with a random name and email format.
    """
    # Generate unique guest display name (e.g. Guest-3f5a2b)
    guest_name = f"Guest-{uuid.uuid4().hex[:6]}"
    
    # Generate random unique email to bypass database unique key constraints
    guest_email = f"guest_{uuid.uuid4().hex[:8]}@zoomclone.local"
    
    # Create the guest user profile in the database
    user = crud.create_user(db, schemas.UserCreate(
        name=guest_name, 
        email=guest_email, 
        password=uuid.uuid4().hex
    ))
    
    # Create and sign JWT token using the guest email address as subject
    token = create_access_token(data={"sub": user.email})
    
    return {"access_token": token, "token_type": "bearer", "user_id": user.id}

# ==============================================================================
# ROUTE: POST /api/auth/register
# ==============================================================================
@router.post("/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new standard user in the system.
    
    Checks if email already exists in the SQLite database before attempting creation
    to prevent integrity constraints.
    """
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        # Halt execution and return client-side warning if email matches
        raise HTTPException(status_code=400, detail="Email already registered")
        
    return crud.create_user(db=db, user=user)

# ==============================================================================
# ROUTE: POST /api/auth/login
# ==============================================================================
@router.post("/login", response_model=schemas.Token)
def login_user(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    """
    Authenticates user credentials and issues a JWT token.
    
    Verifies that the user exists and compares the input plaintext password 
    against the salted and PBKDF2 hashed password stored in the database.
    """
    user = crud.get_user_by_email(db, email=login_data.email)
    
    # Compare password hash using secure verification helpers (preventing timing attacks)
    if not user or not crud.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            # Standard authorization header context
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Generate and sign token
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# ==============================================================================
# ROUTE: GET /api/auth/me
# ==============================================================================
@router.get("/me", response_model=schemas.User)
def get_me(current_user: models.User = Depends(get_current_user)):
    """
    Retrieves the currently authenticated user's profile details.
    
    Utilizes get_current_user dependency which decodes the Bearer JWT token.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user
