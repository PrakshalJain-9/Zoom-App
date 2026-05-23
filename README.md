# ZoomClone — Full-Stack Video Conferencing App

A production-ready Zoom-inspired video conferencing application built with Next.js, FastAPI, and Zego WebRTC (SFU).

---

## Features

- Real-time video and audio via Zego Cloud SFU
- Waiting room — guests wait until the host admits them
- In-meeting chat — public broadcast and private DMs
- Emoji reactions with floating animations
- Hand raise — guests can signal to the host
- Host controls — mute all, mute individual, admit, kick, end meeting
- Meeting scheduler — schedule future meetings with date and time
- Smart meeting alerts — "Start Now" banner for overdue meetings within 30 minutes
- JWT authentication with anonymous guest fallback
- Fully responsive — mobile, tablet, and desktop
- Firefox compatible — 3-stage media acquisition to work around Firefox's WASM bug

---

## Architecture

The project runs on two separate communication channels, which is the same separation Zoom uses:

**Control Plane** — WebSocket through your FastAPI backend and SQLite database. Carries participant lists, mute/admit commands, chat messages, reactions, and meeting end signals.

**Media Plane** — Zego Cloud SFU. Each participant publishes their audio/video stream up to Zego's servers, and the SFU selectively forwards each stream down to all other subscribers. Your own backend is not involved in media at any point — it only generates a short-lived Zego room token.

```
Control:  Browser  ──WebSocket──▶  FastAPI  ──▶  SQLite
Media:    Browser  ──publish───▶  Zego SFU  ──▶  Other browsers
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Backend | FastAPI (Python 3.11+) |
| Database | SQLite via SQLAlchemy ORM |
| Real-time control | WebSocket (FastAPI built-in) |
| Video / Audio | Zego Express WebRTC SDK — SFU architecture |
| Authentication | JWT (PyJWT) |
| Frontend deploy | Vercel |
| Backend deploy | Render |

---

## Project Structure

```
zoom-clone/
├── frontend/
│   └── src/
│       ├── types/meeting.ts              — All shared TypeScript interfaces
│       ├── lib/
│       │   ├── api.ts                    — Axios client and API functions
│       │   └── media.ts                  — Camera/mic acquisition (Firefox-safe)
│       ├── hooks/
│       │   ├── useMeetingRoom.ts         — Master hook: session, Zego, WS, toggles
│       │   ├── useSpeakingDetection.ts   — Web Audio API FFT speaking detection
│       │   ├── useChatMessages.ts        — Chat state and send
│       │   └── useMeetings.ts            — Dashboard meeting list and classification
│       ├── components/
│       │   ├── ui/                       — Reusable atoms (LoadingSpinner)
│       │   ├── meetings/                 — Meeting list sub-components
│       │   └── meeting/                  — In-room components (VideoGrid, Footer, Chat...)
│       └── app/
│           ├── page.tsx                  — Dashboard
│           └── meeting/[code]/page.tsx   — Meeting room (thin orchestrator)
│
└── backend/
    ├── main.py           — App entry, CORS middleware, startup seeding, router registration
    ├── models.py         — SQLAlchemy ORM models (User, Meeting, Participant, ChatMessage)
    ├── schemas.py        — Pydantic request/response schemas
    ├── crud.py           — All database read/write operations
    ├── manager.py        — In-memory WebSocket connection pool (ConnectionManager)
    ├── zego_token.py     — Generates short-lived Zego room tokens server-side
    ├── routers/
    │   ├── auth.py       — POST /auth/login, /auth/anonymous-session, GET /auth/me
    │   └── meetings.py   — Meeting CRUD and POST /join
    └── websocket/
        └── handler.py    — WebSocket endpoint and all event routing
```

---

## How It Works

### 1. Dashboard

1. App calls `GET /api/auth/me` to check if the user is logged in
2. If unauthenticated (401), creates an anonymous session via `POST /api/auth/anonymous-session`
3. Meetings are fetched from `GET /api/meetings` and classified:
   - Overdue within 30 minutes → "Start Now" banner at the top of the list
   - Future meetings → regular upcoming list
   - Past meetings → Previous tab

### 2. Starting or Joining a Meeting

1. Browser navigates to `/meeting/{code}?name=Host&host=true`
2. The `useMeetingRoom` hook calls `POST /api/meetings/{code}/join`
3. Backend creates or restores a Participant row and returns a Zego room token
4. Frontend opens a WebSocket connection to `ws://backend/ws/meeting/{code}`
5. Backend registers the connection in the in-memory `ConnectionManager`

### 3. Waiting Room

1. Guests arrive with `status = "waiting"` and are shown the waiting room screen
2. Host clicks Admit → frontend sends `ADMIT_USER` over WebSocket
3. Backend updates the database and its in-memory state, then broadcasts `PARTICIPANTS_UPDATE` to everyone
4. Guest's frontend detects its own status changed to `"admitted"` and starts WebRTC

### 4. WebRTC Setup (SFU via Zego)

1. Dynamically imports the Zego SDK (prevents Next.js SSR errors)
2. Logs into the Zego room using the server-issued token
3. Firefox path — `getUserMedia` via plain JS, then wrapped in `zegoEngine.createStream({ custom: { source } })` to bypass Zego's WASM permission issue
4. Chrome/Safari path — `zegoEngine.createStream({ camera: { audio, video } })` with a custom-source fallback
5. Calls `startPublishingStream()` — video and audio are now live for all participants
6. The `roomStreamUpdate` event fires automatically when others join or leave, triggering `startPlayingStream()`

### 5. During the Meeting

| Feature | How it works |
|---|---|
| Speaking indicator | Web Audio API FFT samples mic amplitude at 60 fps; amplitude above threshold adds the participant to `speakingIds` |
| Mute mic | `track.enabled = false` — track stays alive, no hardware re-acquisition needed |
| Stop camera | `track.stop()` — physically releases the hardware and turns off the camera LED |
| Start camera | `acquireLocalStream()` to get a fresh track, then `replaceTrack()` in the existing Zego stream |
| Chat | WebSocket → backend persists public messages in DB and routes private DMs to a single target |
| Reactions | WebSocket → all clients receive the emoji and trigger a FloatingEmoji animation |
| Host mute all | `HOST_COMMAND mute_all` → each client disables its own audio track locally |
| End meeting | `HOST_COMMAND end_meeting` → backend sets `is_ended = True` in DB, broadcasts `MEETING_ENDED`, closes all WebSocket connections |

### 6. Leaving

- **Guest leaves** — `doCleanup()` stops all media tracks, logs out of Zego, and closes the WebSocket. Backend records `left_at` and broadcasts the updated participant list.
- **Host ends meeting** — sends `end_meeting` command. Backend forces all connections closed and every participant is redirected to the dashboard.

---

## Database Schema

```
users
  id, name, email, hashed_password, is_active

meetings
  id, meeting_code, title, start_time, duration,
  is_instant, is_ended, host_id (FK → users)

participants
  id, meeting_id (FK), display_name, is_host,
  audio_enabled, video_enabled, hand_raised,
  status (waiting | admitted), joined_at, left_at

chat_messages
  id, meeting_id (FK), sender_name, message_text, timestamp
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A [Zego Cloud](https://console.zegocloud.com) account (free tier works)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # fill in ZEGO_APP_ID, ZEGO_SERVER_SECRET, SECRET_KEY

uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend

# .env.local
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000

npm install
npm run dev
# http://localhost:3000
```

### Default host account (created automatically on first backend start)

```
Email:    host@zoomclone.com
Password: password123
```

---

## Deployment

### Backend on Render

1. Push the `backend/` folder to GitHub
2. Create a Web Service on Render
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Environment variables:

| Variable | Value |
|---|---|
| `SECRET_KEY` | any long random string |
| `ALGORITHM` | `HS256` |
| `ZEGO_APP_ID` | your Zego App ID |
| `ZEGO_SERVER_SECRET` | your Zego Server Secret |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` |

### Frontend on Vercel

1. Push the `frontend/` folder to GitHub
2. Import the repo in Vercel, set Root Directory to `frontend`
3. Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.onrender.com/api` |
| `NEXT_PUBLIC_WS_URL` | `wss://your-backend.onrender.com` |

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with email and password, returns JWT |
| POST | `/api/auth/anonymous-session` | Create a guest session, returns JWT |
| GET | `/api/auth/me` | Get the current authenticated user |

### Meetings

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/meetings` | Create a new meeting |
| GET | `/api/meetings` | List all meetings for the current user |
| GET | `/api/meetings/{code}` | Get meeting details |
| POST | `/api/meetings/{code}/join` | Join a meeting — returns participant info and Zego token |
| GET | `/api/meetings/{code}/chat` | Load previous chat messages |

### WebSocket

Connect to: `ws://host/ws/meeting/{code}?name=X&participant_id=Y&token=Z`

**Client sends:**

| Type | Payload |
|---|---|
| `STATE_UPDATE` | `{ audio_enabled, video_enabled, hand_raised }` |
| `CHAT_MESSAGE` | `{ message_text, target_user_id }` |
| `REACTION` | `{ emoji }` |
| `ADMIT_USER` | `{ target_id }` |
| `ADMIT_ALL` | `{}` |
| `HOST_COMMAND` | `{ command: "mute_all" or "mute_user" or "end_meeting", target_id? }` |
| `HEARTBEAT` | `{}` |

**Server sends:**

| Type | Meaning |
|---|---|
| `PARTICIPANTS_UPDATE` | Full participant list snapshot |
| `CHAT_MESSAGE` | New chat message |
| `REACTION` | Emoji reaction from a participant |
| `HOST_COMMAND` | Mute or end command from the host |
| `MEETING_ENDED` | Host ended the meeting |
| `KICKED` | You were removed by the host |
| `USER_LEFT` | A participant disconnected |

---

## Key Technical Notes

**Firefox WebRTC** — Firefox blocks `getUserMedia` inside Zego's WASM context. The fix (`lib/media.ts`) uses a 3-stage strategy: combined retry, separate audio/video requests, then audio-only fallback. The acquired stream is wrapped with `zegoEngine.createStream({ custom: { source: rawStream } })`.

**State + ref pattern** — React state drives re-renders; parallel `useRef` copies are read inside async callbacks and WebSocket event handlers where state would be stale.

**Modular hooks** — All logic is in custom hooks. The page component only wires hooks to components.

**SFU not P2P** — Video and audio flow through Zego's cloud SFU, not directly between browsers. Each participant uploads one stream; the SFU distributes it. This is how the app scales beyond two participants without degrading.
