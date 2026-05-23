from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional
import datetime
import jwt

import crud
import models
from database import SessionLocal
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# ==============================================================================
# OAUTH2 SECURITY SCHEME CONFIGURATION
# ==============================================================================
# OAuth2PasswordBearer specifies that the client must provide a 'Bearer <token>' 
# in the HTTP 'Authorization' request header.
# tokenUrl defines the API endpoint where clients submit username/password to retrieve a token.
# auto_error=False ensures that we do not raise automatic 401 exceptions if the token is missing.
# This is necessary because some routes allow optional authentication (e.g. Guest users joining).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# ==============================================================================
# DATABASE LIFECYCLE MANAGEMENT DEPENDENCY
# ==============================================================================
def get_db():
    """
    FastAPI Dependency that provides an active SQLAlchemy database session context.
    
    Using a Python generator ('yield') ensures the database session is opened upon 
    request receipt and guarantees session closure at the end of the request-response cycle,
    preventing connection leaks or database lockups.
    """
    db = SessionLocal()
    try:
        # yield suspends execution and returns the DB session for use in routes
        yield db
    finally:
        # Code after yield is run after the HTTP request is finished.
        # We explicitly close the database connection to return it to the pool.
        db.close()

# ==============================================================================
# JWT SIGNING AND TOKEN GENERATION
# ==============================================================================
def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """
    Generates a cryptographically signed JSON Web Token (JWT).
    
    Args:
        data: Key-value payload pairs (claims) to encode inside the JWT (e.g., {"sub": user.email}).
        expires_delta: Optional custom lifetime duration for the token.
        
    Returns:
        A signed string JWT token.
    """
    to_encode = data.copy()
    
    # Calculate token expiration timestamp
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    # Append the expiration claim ('exp') into the payload
    to_encode.update({"exp": expire})
    
    # Sign and encode using the secret key and the algorithm specified in config
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ==============================================================================
# USER AUTHENTICATION & EXTRACTION DEPENDENCY
# ==============================================================================
def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[models.User]:
    """
    Extracts the authenticated User database instance using the request's JWT token.
    
    Args:
        token: The raw JWT string token extracted from HTTP headers.
        db: Database session injected via get_db dependency.
        
    Returns:
        The matched models.User database model object if authenticated, or None if:
        - The token is missing (useful for guest flows)
        - The token is expired
        - The cryptographic signature is invalid
        - The email payload is invalid/missing in the database
    """
    if not token:
        # If no token is provided in the header, return None (allows guest operations)
        return None
    try:
        # Decode the token using our secret key and specified signature algorithm
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # 'sub' (subject) claim holds the user's email address
        email: str = payload.get("sub")
        if email is None:
            return None
    except jwt.PyJWTError:
        # Any JWT decode/signature/expiry failure returns None instead of crashing
        return None
        
    # Lookup the user profile in database using their email claim
    return crud.get_user_by_email(db, email=email)
