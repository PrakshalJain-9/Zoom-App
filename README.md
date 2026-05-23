# ZoomClone — Full-Stack Video Conferencing App

A production-ready Zoom-inspired video conferencing application built with **Next.js**, **FastAPI**, and **Zego WebRTC**.

[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2015-black?logo=next.js)](https://nextjs.org)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![WebRTC](https://img.shields.io/badge/WebRTC-Zego%20Express%20SFU-blue)](https://www.zegocloud.com)
[![Deploy Frontend](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)
[![Deploy Backend](https://img.shields.io/badge/Deploy-Render-purple?logo=render)](https://render.com)

---

## ✨ Features

- 🎥 **Real-time Video & Audio** — Peer-to-peer streaming via Zego WebRTC
- 🏠 **Waiting Room** — Guests wait until the host admits them
- 💬 **In-meeting Chat** — Public broadcast + private DM messaging
- 😀 **Emoji Reactions** — Floating animated emoji overlays
- ✋ **Hand Raise** — Guests can signal to the host
- 🎙️ **Host Controls** — Mute all, mute individual, admit/kick participants, end meeting
- 📅 **Meeting Scheduler** — Schedule future meetings with date/time
- ⏰ **Smart Meeting Alerts** — Orange "Start Now" banner for overdue meetings
- 🔒 **JWT Authentication** — Secure host sessions with anonymous guest fallback
- 📱 **Fully Responsive** — Mobile-first design, works on phones, tablets, desktop
- 🦊 **Firefox Compatible** — 3-stage media acquisition strategy for Firefox's WASM bug

---

## 🏗️ Architecture

The project uses **two separate communication planes** — the same architecture that Zoom uses:

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                          │
│   WebSocket  →  FastAPI Backend  →  SQLite DB               │
│   Handles: participant lists, mute, admit, chat, reactions  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       MEDIA PLANE                           │
│   Browser  ──publish──▶  Zego Cloud SFU  ◀──publish──  Browser │
│                    └──────forwards──────┘                   │
│   Zego SFU selectively forwards each stream to subscribers  │
│   Does NOT pass through our backend                         │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Backend | FastAPI (Python 3.11+) |
| Database | SQLite via SQLAlchemy ORM |
| Real-time Control | WebSocket (built into FastAPI) |
| Video/Audio | Zego Express WebRTC SDK (SFU) |
| Authentication | JWT (PyJWT) |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |

---

## 📁 Project Structure

```
zoom-clone/
├── frontend/                  ← Next.js app
│   └── src/
│       ├── types/
│       │   └── meeting.ts     ← All shared TypeScript types
│       ├── lib/
│       │   ├── api.ts         ← Axios HTTP client + API functions
│       │   └── media.ts       ← Camera/mic acquisition (Firefox-safe)
│       ├── hooks/
│       │   ├── useMeetingRoom.ts      ← Master meeting hook
│       │   ├── useSpeakingDetection.ts← Web Audio API FFT
│       │   ├── useChatMessages.ts     ← Chat state
│       │   └── useMeetings.ts         ← Dashboard meeting list
│       ├── components/
│       │   ├── ui/            ← Reusable atoms (LoadingSpinner)
│       │   ├── meetings/      ← Meeting list sub-components
│       │   └── meeting/       ← In-room components (VideoGrid, Footer…)
│       └── app/
│           ├── page.tsx       ← Dashboard
│           └── meeting/[code]/page.tsx ← Meeting room
│
└── backend/                   ← FastAPI app
    ├── main.py                ← App entry, CORS, startup seeding
    ├── models.py              ← SQLAlchemy ORM models
    ├── schemas.py             ← Pydantic request/response schemas
    ├── crud.py                ← All database operations
    ├── manager.py             ← In-memory WebSocket connection pool
    ├── zego_token.py          ← Zego room token generator
    ├── routers/
    │   ├── auth.py            ← Login, register, anonymous session
    │   └── meetings.py        ← Meeting CRUD + /join endpoint
    └── websocket/
        └── handler.py         ← WebSocket event router
```

---

## 🔄 How It Works — Complete Flow

### 1. Dashboard
1. User opens the app → frontend calls `GET /api/auth/me`
2. If unauthenticated (401) → creates an anonymous session (`POST /api/auth/anonymous-session`)
3. Meetings are fetched from `GET /api/meetings` and classified:
   - **Overdue within 30 min** → orange "Start Now" banner at the top
   - **Future** → regular upcoming list
   - **Past** → Previous tab

### 2. Starting/Joining a Meeting
1. Frontend navigates to `/meeting/{code}?name=Host&host=true`
2. `useMeetingRoom` hook calls `POST /api/meetings/{code}/join`
3. Backend creates/restores a `Participant` row and returns a **Zego token**
4. Frontend opens a **WebSocket** to `ws://backend/ws/meeting/{code}`
5. Backend registers the connection in the in-memory `ConnectionManager`

### 3. Waiting Room → Admitted
1. Guests arrive with `status = "waiting"` → shown the Waiting Room screen
2. Host clicks **Admit** → frontend sends `ADMIT_USER` via WebSocket
3. Backend updates DB + in-memory state, broadcasts `PARTICIPANTS_UPDATE` to all
4. Guest's frontend detects own status changed to `"admitted"` → starts WebRTC

### 4. SFU Media via Zego: Every participant publishes their stream up to Zego Cloud's SFU servers. The SFU forwards each stream down to all other subscribers. Your backend is not involved in media at any point — it only issues the Zego room token.
2. Logs into the Zego room using the server-issued token
3. **Firefox path**: `getUserMedia` via plain JS → wrapped in Zego `createStream({ custom: { source } })`
4. **Chrome/Safari path**: `zegoEngine.createStream({ camera: { audio, video } })`
5. Calls `startPublishingStream()` → video is live for all participants
6. `roomStreamUpdate` event subscribes to incoming remote streams automatically

### 5. During the Meeting

| Feature | How it works |
|---|---|
| Speaking indicator | Web Audio API FFT samples mic amplitude at 60fps |
| Mute mic | `track.enabled = false` — track stays alive, no hardware re-acquisition |
| Stop camera | `track.stop()` — physically turns off camera LED |
| Start camera | `acquireLocalStream()` → `replaceTrack()` in existing Zego stream |
| Chat | WS → backend persists public messages in DB, routes private DMs |
| Reactions | WS → all clients receive emoji → FloatingEmoji animation |
| Host mute all | WS HOST_COMMAND → each client disables own audio track |
| End meeting | WS HOST_COMMAND → backend sets `is_ended=True` → broadcasts `MEETING_ENDED` → all clients disconnect |

### 6. Leaving
- **Guest leaves**: `doCleanup()` stops all tracks, logs out of Zego, closes WS → backend records `left_at`
- **Host ends meeting**: sends `end_meeting` command → backend forces all connections closed

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- A [Zego Cloud](https://console.zegocloud.com) account (free tier works)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env (copy from .env.example and fill in values)
cp .env.example .env

# Start the backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000" >> .env.local

npm install
npm run dev
# Opens at http://localhost:3000
```

### Default Login
```
Email:    host@zoomclone.com
Password: password123
```
(Created automatically on first backend startup)

---

## 🌐 Deployment

### Backend → Render

1. Push `backend/` to GitHub
2. Create a **Web Service** on [Render](https://render.com)
3. Set **Build Command**: `pip install -r requirements.txt`
4. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables:

| Variable | Value |
|---|---|
| `SECRET_KEY` | any random long string |
| `ALGORITHM` | `HS256` |
| `ZEGO_APP_ID` | your Zego App ID (number) |
| `ZEGO_SERVER_SECRET` | your Zego Server Secret |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` |

### Frontend → Vercel

1. Push `frontend/` to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set **Root Directory** to `frontend`
4. Add environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.onrender.com/api` |
| `NEXT_PUBLIC_WS_URL` | `wss://your-backend.onrender.com` |

---

## 🌐 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login with email + password → JWT |
| `POST` | `/api/auth/anonymous-session` | Create a guest session → JWT |
| `GET` | `/api/auth/me` | Get current user info |

### Meetings
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/meetings` | Create a new meeting |
| `GET` | `/api/meetings` | List meetings for current user |
| `GET` | `/api/meetings/{code}` | Get meeting details |
| `POST` | `/api/meetings/{code}/join` | Join a meeting (returns Zego token) |
| `GET` | `/api/meetings/{code}/chat` | Load chat history |

### WebSocket
| URL | Description |
|---|---|
| `ws://host/ws/meeting/{code}?name=X&participant_id=Y&token=Z` | Meeting control channel |

### WebSocket Events (Client → Server)
| Type | Payload |
|---|---|
| `STATE_UPDATE` | `{ audio_enabled, video_enabled, hand_raised }` |
| `CHAT_MESSAGE` | `{ message_text, target_user_id }` |
| `REACTION` | `{ emoji }` |
| `ADMIT_USER` | `{ target_id }` |
| `ADMIT_ALL` | `{}` |
| `HOST_COMMAND` | `{ command: "mute_all" \| "mute_user" \| "end_meeting", target_id? }` |
| `HEARTBEAT` | `{}` |

### WebSocket Events (Server → Client)
| Type | Meaning |
|---|---|
| `PARTICIPANTS_UPDATE` | Full participant list snapshot |
| `CHAT_MESSAGE` | New chat message |
| `REACTION` | Emoji reaction from a participant |
| `HOST_COMMAND` | Mute/end command from host |
| `MEETING_ENDED` | Host ended the meeting |
| `KICKED` | You were removed by the host |
| `USER_LEFT` | A participant disconnected |

---

## 🗄️ Database Schema

```
users          ── id, name, email, hashed_password, is_active
meetings       ── id, meeting_code, title, start_time, duration,
                  is_instant, is_ended, host_id (FK → users)
participants   ── id, meeting_id (FK), display_name, is_host,
                  audio_enabled, video_enabled, hand_raised,
                  status (waiting|admitted), joined_at, left_at
chat_messages  ── id, meeting_id (FK), sender_name,
                  message_text, timestamp
```

---

## 🔧 Key Technical Decisions

### Firefox WebRTC Fix
Firefox blocks `getUserMedia` inside Zego's WASM context. The fix is a 3-stage acquisition strategy in [`lib/media.ts`](frontend/src/lib/media.ts):
1. **Stage 1** — Combined audio+video with exponential back-off (3 retries)
2. **Stage 2** — Separate audio and video requests via `Promise.allSettled`
3. **Stage 3** — Audio-only fallback

The acquired stream is wrapped using `zegoEngine.createStream({ custom: { source: rawStream } })` which lets us bypass WASM permission issues while still giving Zego a stream it owns for publishing.

### Two-Layer State Pattern
React state for UI renders + parallel mutable `useRef` for inside async callbacks:
```ts
const [isMuted, setIsMuted] = useState(true); // triggers re-render
const isMutedRef = useRef(true);               // always current inside WS event handlers
```

### Modular Hook Architecture
All business logic is in custom hooks, keeping the page component thin:
- `useMeetingRoom` — master hook (~400 lines, heavily commented)
- `useSpeakingDetection` — isolated Web Audio API logic
- `useChatMessages` — isolated chat state
- `useMeetings` — isolated dashboard data

---

## 📝 License

MIT
