import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================
# Use an absolute path to the SQLite database file so that it is always resolved
# correctly regardless of the working directory of the uvicorn process or any
# child processes spawned by the --reload reloader.
#
# Using a relative path like "sqlite:///./zoom_clone.db" can cause issues when
# uvicorn's WatchFiles reloader spawns worker processes — those workers may have
# a different CWD and therefore try to open/create a different (possibly
# read-only or non-existent) file.
#
# __file__ resolves to this file's location, so Path(__file__).parent gives
# us the backend/ directory reliably every time.
_BACKEND_DIR = Path(__file__).resolve().parent
_DB_FILE = _BACKEND_DIR / "zoom_clone.db"

SQLALCHEMY_DATABASE_URL = f"sqlite:///{_DB_FILE}"

# Create the SQLAlchemy engine.
# check_same_thread=False is required for SQLite when used with FastAPI/Starlette
# because requests may be processed from different threads.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """
    Called every time a new raw DBAPI connection is established.

    - WAL (Write-Ahead Logging) mode: Allows concurrent readers while a writer
      is active. Much more resilient than the default journal mode under load.
    - foreign_keys ON: Enforce FK constraints which SQLite disables by default.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Session factory — used by the get_db() FastAPI dependency to yield scoped sessions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class — all SQLAlchemy ORM models inherit from this.
Base = declarative_base()

