/**
 * @file hooks/useMeetingRoom.ts
 * @description Master custom hook for the meeting room page.
 *
 * This hook is the heart of the meeting room. It encapsulates every piece of
 * stateful logic so that the page component (page.tsx) becomes a thin,
 * readable orchestrator that only wires together hooks and renders JSX.
 *
 * ─── What this hook manages ───────────────────────────────────────────────
 *
 *  1. SESSION SETUP
 *     - Calls the /join REST API (with retry logic)
 *     - Restores the participant session from sessionStorage on browser reload
 *     - Establishes and maintains the WebSocket control channel
 *
 *  2. WEBSOCKET MESSAGE DISPATCH
 *     - Parses every incoming WS event and routes it to the right state update
 *     - Handles: participant lists, chat, reactions, host commands, kicked/ended
 *
 *  3. ZEGO WEBRTC ENGINE
 *     - Dynamically imports the Zego SDK (prevents SSR issues)
 *     - Logs in to the Zego room
 *     - Creates a local MediaStream (Firefox-safe via custom source API)
 *     - Subscribes to remote participant streams
 *     - Publishes the local stream to the room
 *
 *  4. DEVICE TOGGLES
 *     - toggleMic()   — enables/disables audio tracks and notifies via WS
 *     - toggleVideo() — stops/restarts video tracks (kills hardware LED when off)
 *
 *  5. HOST ACTIONS
 *     - sendHostCommand() — mute all, mute user, end meeting
 *     - admitUser() / admitAll() — admit waiting room participants
 *
 *  6. CLEANUP
 *     - doCleanup() — stops all media tracks, logs out of Zego, closes WebSocket
 *     - Called on unmount, page hide, and meeting end
 *
 * ─── Shared mutable refs ──────────────────────────────────────────────────
 *
 *  React state triggers re-renders, which is ideal for UI values. But for
 *  values used inside async callbacks and event listeners (which close over
 *  a stale snapshot), we keep a parallel mutable ref (e.g. `isMutedRef`)
 *  that is always up-to-date.
 *
 *  Pattern used throughout:
 *    setIsMuted(v)       → updates the React state (triggers re-render)
 *    isMutedRef.current  → reads the current value inside callbacks
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { joinMeeting, getMeetingChat } from '@/lib/api';
import { acquireLocalStream } from '@/lib/media';
import { useSpeakingDetection } from './useSpeakingDetection';
import { useChatMessages } from './useChatMessages';
import { Participant, FloatingReaction, ParticipantStatus } from '@/types/meeting';

// ===========================================================================
// TYPES
// ===========================================================================

interface UseMeetingRoomProps {
  meetingCode: string;
  displayName: string;
  isHostParam: boolean;
}

export interface UseMeetingRoomReturn {
  // ── Loading / Error state ──
  loading: boolean;
  error: string;

  // ── Participant data ──
  localParticipant: Participant | null;
  participants: Participant[];
  admittedParticipants: Participant[];
  waitingParticipants: Participant[];
  localParticipantId: string;
  isHost: boolean;

  // ── Media streams ──
  streams: Record<string, MediaStream>;
  streamKey: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isMockMedia: boolean;

  // ── Speaking detection ──
  speakingIds: Set<string>;

  // ── Meeting status ──
  myStatus: ParticipantStatus;
  inviteLink: string;
  copied: boolean;

  // ── Floating reactions ──
  floatingReactions: FloatingReaction[];

  // ── Hand raise ──
  isHandRaised: boolean;

  // ── Panel visibility ──
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isReactionsOpen: boolean;
  isMoreOpen: boolean;

  // ── Chat ──
  chatMessages: any[];
  chatInput: string;
  chatRecipient: string;
  setChatInput: (v: string) => void;
  setChatRecipient: (v: string) => void;
  sendChatMessage: () => void;
  otherParticipants: Participant[];

  // ── Actions ──
  toggleMic: () => void;
  toggleVideo: () => Promise<void>;
  toggleChat: () => void;
  toggleParticipants: () => void;
  toggleHandRaised: () => void;
  handleCopyLink: () => void;
  sendReaction: (emoji: string) => void;
  sendHostCommand: (command: string, targetId?: string) => void;
  admitUser: (targetId: string) => void;
  admitAll: () => void;
  muteParticipant: (targetId: string) => void;
  doCleanup: () => void;
  setIsReactionsOpen: (v: boolean) => void;
  setIsMoreOpen: (v: boolean) => void;
}

// ===========================================================================
// HOOK
// ===========================================================================

export function useMeetingRoom({
  meetingCode,
  displayName,
  isHostParam,
}: UseMeetingRoomProps): UseMeetingRoomReturn {
  const router = useRouter();

  // ── React state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [streamKey, setStreamKey] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isMockMedia, setIsMockMedia] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myStatus, setMyStatus] = useState<ParticipantStatus>('waiting');
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // ── Mutable refs (for use inside async callbacks and event listeners) ──────
  // See file header for explanation of the state + ref pattern.
  const ws = useRef<WebSocket | null>(null);
  const zgEngineRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamsRef = useRef<Record<string, MediaStream>>({});
  const localParticipantIdRef = useRef<string>('');
  const participantRef = useRef<any>(null);
  const isMutedRef = useRef(true);
  const isVideoOffRef = useRef(true);
  const isMountedRef = useRef(true);
  const zegoInitialized = useRef(false);

  // ── Sub-hooks ──────────────────────────────────────────────────────────────
  const { speakingIds, startSpeakingDetection, stopSpeakingDetection } = useSpeakingDetection();
  const chatState = useChatMessages({ wsRef: ws });

  // ── Mount/unmount tracking ─────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Keep streamsRef in sync with state (for use in cleanup callbacks) ──────
  useEffect(() => { streamsRef.current = streams; }, [streams]);
  // Keep mutable refs in sync with React state
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);

  // ── Bfcache (Back-Forward Cache) restoration guard ─────────────────────────
  // If the user navigates back to the meeting page via the browser's
  // back button, the page may be restored from bfcache with a stale WebSocket.
  // Forcing a reload restores a fresh, working connection.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log('[useMeetingRoom] bfcache restoration detected — reloading');
        window.location.reload();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // ── Copy invite link to clipboard ─────────────────────────────────────────
  const handleCopyLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/join/${meetingCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [meetingCode]);

  // ===========================================================================
  // ZEGO WEBRTC ENGINE
  // ===========================================================================

  /**
   * Initializes the Zego Express WebRTC engine for the local participant.
   *
   * Guards against double-initialization (zegoInitialized ref) because this
   * function can be triggered from two places:
   *  1. Immediately after joining if the participant is already admitted
   *  2. Later, when a waiting-room participant gets admitted by the host
   *
   * The function handles two distinct paths:
   *
   *  MOCK MODE (appID === 0 || token === 'mock-token'):
   *    Used in local dev when no Zego credentials are configured.
   *    Acquires a real MediaStream and shows it locally without publishing.
   *
   *  ZEGO MODE:
   *    Logs into the Zego room, creates a local stream, and publishes it.
   *    Firefox uses the `custom source` path to bypass WASM permission issues.
   *    Chrome uses the native `camera` path with a custom-source fallback.
   */
  const initializeZego = useCallback(async (participant: any, socket: WebSocket) => {
    // Prevent double-initialization
    if (zegoInitialized.current) return;
    zegoInitialized.current = true;

    const appID = participant.zego_app_id;
    const token = participant.token;
    let localStream: MediaStream | null = null;

    // Determine initial device states from participant metadata
    const audioEnabled = participant.is_host ? true : (participant.audio_enabled ?? true);
    const videoEnabled = participant.is_host ? true : (participant.video_enabled ?? true);

    // ── MOCK MODE ────────────────────────────────────────────────────────────
    if (appID === 0 || token === 'mock-token') {
      console.warn('[useMeetingRoom] Mock media mode — no Zego credentials');
      setIsMockMedia(true);

      try {
        // Release any previously acquired hardware
        localStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} });
        localStreamRef.current = null;

        // Brief pause for OS to release the camera handle
        await new Promise(resolve => setTimeout(resolve, 200));

        localStream = await acquireLocalStream();
        localStreamRef.current = localStream;

        // Apply initial mute/video state to tracks
        localStream.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
        localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });

        setStreams(prev => ({ ...prev, [participant.id]: localStream! }));
        setIsVideoOff(!videoEnabled);
        setIsMuted(!audioEnabled);
        isMutedRef.current = !audioEnabled;
        isVideoOffRef.current = !videoEnabled;

        startSpeakingDetection(localStream, participant.id);

        // Notify server of initial device state
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'STATE_UPDATE',
            audio_enabled: audioEnabled,
            video_enabled: videoEnabled,
          }));
        }
      } catch (e) {
        console.error('[useMeetingRoom] Mock mode camera allocation failed:', e);
      }
      return;
    }

    // ── ZEGO LIVE MODE ───────────────────────────────────────────────────────
    if (zgEngineRef.current) {
      console.warn('[useMeetingRoom] Zego engine already exists — skipping re-init');
      return;
    }

    // Dynamic import prevents Next.js SSR from trying to load the browser-only SDK
    const { ZegoExpressEngine } = await import('zego-express-engine-webrtc');
    const zegoEngine = new ZegoExpressEngine(
      appID,
      `wss://webliveroom${appID}-api.zegocloud.com/ws`
    );
    zgEngineRef.current = zegoEngine;

    // ── Subscribe to remote streams ──────────────────────────────────────────
    // This event fires when another participant joins or leaves the room.
    zegoEngine.on('roomStreamUpdate', async (
      _roomID: string,
      updateType: 'ADD' | 'DELETE',
      streamList: any[]
    ) => {
      if (updateType === 'ADD') {
        for (const s of streamList) {
          try {
            const remote = await zegoEngine.startPlayingStream(s.streamID);
            setStreams(prev => ({ ...prev, [s.streamID]: remote }));
          } catch (e) {
            console.error('[useMeetingRoom] Failed to subscribe remote stream:', e);
          }
        }
      } else {
        for (const s of streamList) {
          try { zegoEngine.stopPlayingStream(s.streamID); } catch {}
          setStreams(prev => {
            const next = { ...prev };
            delete next[s.streamID];
            return next;
          });
        }
      }
    });

    // Login to the Zego room using the server-issued token
    await zegoEngine.loginRoom(
      meetingCode,
      token,
      { userID: participant.id, userName: displayName },
      { userUpdate: true }
    );

    // ── Acquire local stream ──────────────────────────────────────────────────
    try {
      // Release any previously held hardware tracks
      localStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} });
      localStreamRef.current = null;

      // Small OS-level cooldown before re-acquiring the camera
      await new Promise(resolve => setTimeout(resolve, 150));

      // CRITICAL: Detect browser to choose the right stream creation path.
      //
      // WHY WE CAN'T ALWAYS USE zegoEngine.createStream({ camera }):
      //   Firefox blocks getUserMedia calls made from within Zego's WASM
      //   context because WASM doesn't inherit JS-level permission grants.
      //   This causes an AbortError on Firefox even with permission granted.
      //
      // SOLUTION FOR FIREFOX:
      //   We acquire tracks via native JS getUserMedia (which Firefox allows),
      //   then pass the MediaStream to Zego via createStream({ custom: { source } }).
      //   Zego wraps it in a stream it owns, making startPublishingStream happy.
      const isFirefox = typeof navigator !== 'undefined' &&
        navigator.userAgent.toLowerCase().includes('firefox');

      if (isFirefox) {
        // Firefox path: JS getUserMedia → Zego custom stream wrapper
        const rawStream = await acquireLocalStream();
        localStream = await zegoEngine.createStream({ custom: { source: rawStream } } as any);
      } else {
        // Chrome/Safari path: native Zego camera creation
        try {
          localStream = await zegoEngine.createStream({ camera: { audio: true, video: true } });
        } catch (zegoErr) {
          // Fallback: if Zego's camera path fails on Chrome, use the custom source path
          console.warn('[useMeetingRoom] Zego createStream (camera) failed, trying custom path:', zegoErr);
          await new Promise(resolve => setTimeout(resolve, 300));
          const rawStream = await acquireLocalStream();
          localStream = await zegoEngine.createStream({ custom: { source: rawStream } } as any);
        }
      }

      localStreamRef.current = localStream;
    } catch (e) {
      console.error('[useMeetingRoom] Stream acquisition failed:', e);
    }

    // ── Publish stream to the room ───────────────────────────────────────────
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
      localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });

      await zegoEngine.startPublishingStream(participant.id, localStream);

      // Sync Zego engine mute state with initial track state
      try { zegoEngine.mutePublishStreamAudio(localStream, !audioEnabled); } catch {}
      try { zegoEngine.mutePublishStreamVideo(localStream, !videoEnabled); } catch {}

      setStreams(prev => ({ ...prev, [participant.id]: localStream! }));
      setIsVideoOff(!videoEnabled);
      setIsMuted(!audioEnabled);
      isMutedRef.current = !audioEnabled;
      isVideoOffRef.current = !videoEnabled;

      startSpeakingDetection(localStream, participant.id);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'STATE_UPDATE',
          audio_enabled: audioEnabled,
          video_enabled: videoEnabled,
        }));
      }
    }
  }, [meetingCode, displayName, startSpeakingDetection]);

  // Trigger Zego initialization when a waiting participant gets admitted
  useEffect(() => {
    if (myStatus === 'admitted' && !zegoInitialized.current && participantRef.current && ws.current) {
      initializeZego(participantRef.current, ws.current);
    }
  }, [myStatus, initializeZego]);

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Tears down all resources: animation frames, AudioContext, Zego engine,
   * MediaStream tracks, and the WebSocket connection.
   *
   * Must be called on:
   *  - Component unmount (useEffect cleanup)
   *  - Meeting end / kicked events
   *  - Manual "Leave" or "End" button press
   */
  const doCleanup = useCallback(() => {
    zegoInitialized.current = false;

    // Stop the Web Audio API speaking detection loop
    stopSpeakingDetection();

    if (zgEngineRef.current) {
      try {
        if (localStreamRef.current) {
          zgEngineRef.current.stopPublishingStream(localParticipantIdRef.current);
          zgEngineRef.current.destroyStream(localStreamRef.current);
        }
        zgEngineRef.current.logoutRoom(meetingCode);
      } catch {}
      zgEngineRef.current = null;
    } else if (localStreamRef.current) {
      // No Zego engine (mock mode) — stop tracks directly
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    // Stop any remote streams
    Object.keys(streamsRef.current).forEach(id => {
      if (zgEngineRef.current && id !== localParticipantIdRef.current) {
        try { zgEngineRef.current.stopPlayingStream(id); } catch {}
      }
    });

    // Close the WebSocket
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, [meetingCode, stopSpeakingDetection]);

  // ===========================================================================
  // SESSION SETUP
  // ===========================================================================

  useEffect(() => {
    if (!meetingCode || !displayName) return;

    let socket: WebSocket | null = null;
    let isCurrent = true; // Guards against state updates after unmount
    const abortController = new AbortController();

    // Stop processing if the page is being unloaded (navigation away)
    const handleUnload = () => { isCurrent = false; };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handleUnload);
      window.addEventListener('beforeunload', handleUnload);
    }

    const setup = async () => {
      try {
        // Short stabilization delay — prevents double-calls during React StrictMode
        // hydration in development mode
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCurrent) return;

        setError('');
        setLoading(true);

        // ── Join with network retry ────────────────────────────────────────────
        // The /join request can fail transiently on first load (cold-start backend,
        // intermittent network). We retry up to 3 times with a growing delay.
        const joinWithRetry = async (pid: string | null, retries = 3, delayMs = 150): Promise<any> => {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              if (!isCurrent) throw new Error('Component unmounted');
              return await joinMeeting(meetingCode, displayName, isHostParam, pid, abortController.signal);
            } catch (err: any) {
              if (axios.isCancel(err) || !isCurrent) throw err;
              const isNetwork = !err.response || err.code === 'ERR_NETWORK';
              if (isNetwork && attempt < retries) {
                console.warn(`[useMeetingRoom] Join attempt ${attempt} failed, retrying in ${delayMs}ms`);
                await new Promise(r => setTimeout(r, delayMs));
              } else {
                throw err;
              }
            }
          }
        };

        // ── Session restoration ────────────────────────────────────────────────
        // Store the participant ID in sessionStorage so a browser refresh
        // reconnects with the same participant ID instead of creating a duplicate.
        const savedPid = typeof window !== 'undefined'
          ? sessionStorage.getItem(`meeting_${meetingCode}_pid`)
          : null;

        let participant: any;
        try {
          participant = await joinWithRetry(savedPid);
        } catch (joinErr: any) {
          if (axios.isCancel(joinErr) || !isCurrent) throw joinErr;
          console.warn('[useMeetingRoom] Session restore failed — trying fresh join');
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(`meeting_${meetingCode}_pid`);
          }
          participant = await joinWithRetry(null);
        }

        if (!isCurrent) return;

        // Persist participant ID for future refresh restoration
        if (participant?.id && typeof window !== 'undefined') {
          sessionStorage.setItem(`meeting_${meetingCode}_pid`, participant.id);
        }

        participantRef.current = participant;
        setLocalParticipant(participant);
        localParticipantIdRef.current = participant.id;
        setIsMuted(!participant.audio_enabled);
        setIsVideoOff(!participant.video_enabled);

        const initialStatus: ParticipantStatus =
          participant.status === 'admitted' ? 'admitted' : 'waiting';
        setMyStatus(initialStatus);

        // Pre-load chat history from REST (WS doesn't replay past messages)
        try {
          const history = await getMeetingChat(meetingCode, abortController.signal);
          if (isCurrent) chatState.setChatMessages(history || []);
        } catch {}

        if (!isCurrent) return;

        // ── WebSocket connection ───────────────────────────────────────────────
        // NEXT_PUBLIC_WS_URL is set per-environment:
        //   Dev:  ws://127.0.0.1:8000
        //   Prod: wss://your-backend.onrender.com
        const jwtToken = localStorage.getItem('token');
        const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000';
        const wsUrl = `${wsBase}/ws/meeting/${meetingCode}?name=${encodeURIComponent(displayName)}&participant_id=${participant.id}${jwtToken ? `&token=${jwtToken}` : ''}`;
        socket = new WebSocket(wsUrl);
        ws.current = socket;

        // ── WebSocket message router ────────────────────────────────────────
        socket.onmessage = (event) => {
          if (!isCurrent) return;
          try {
            const data = JSON.parse(event.data);

            // Participant list update
            if (data.participants) {
              // De-duplicate by ID before setting state (WS can send duplicates)
              const unique = data.participants.filter(
                (p: any, i: number, arr: any[]) => arr.findIndex(t => t.id === p.id) === i
              );
              setParticipants(unique);

              // Detect when this participant transitions from 'waiting' to 'admitted'
              const myId = localParticipantIdRef.current;
              const me = unique.find((p: any) => p.id === myId);
              if (me?.status === 'admitted' && myStatus !== 'admitted') {
                console.log('[useMeetingRoom] Admitted — initializing WebRTC');
                setMyStatus('admitted');
                if (participantRef.current && ws.current) {
                  initializeZego(participantRef.current, ws.current);
                }
              }
            }

            // Incoming chat message
            if (data.type === 'CHAT_MESSAGE') {
              chatState.appendChatMessage(data);
            }

            // Floating emoji reaction
            else if (data.type === 'REACTION') {
              const id = Math.random().toString(36).slice(2);
              const x = 15 + Math.random() * 70;
              setFloatingReactions(prev => [...prev, { id, emoji: data.emoji, x, sender: data.sender_name }]);
              setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3200);
            }

            // Host command received
            else if (data.type === 'HOST_COMMAND') {
              const myId = localParticipantIdRef.current;
              const isTarget = data.target_id === myId;

              const muteLocally = () => {
                setIsMuted(true);
                isMutedRef.current = true;
                localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
                zgEngineRef.current?.mutePublishStreamAudio(localStreamRef.current, true);
                ws.current?.send(JSON.stringify({
                  type: 'STATE_UPDATE',
                  audio_enabled: false,
                  video_enabled: !isVideoOffRef.current,
                }));
              };

              if (data.command === 'mute_all' && !participant.is_host) {
                muteLocally();
              } else if (data.command === 'mute_user' && isTarget) {
                muteLocally();
              } else if (data.command === 'end_meeting') {
                doCleanup();
                router.push('/');
              }
            }

            // Meeting ended or user was kicked
            else if (data.type === 'MEETING_ENDED' || data.type === 'KICKED') {
              if (data.type === 'KICKED') {
                alert('You have been removed from the meeting by the host.');
              }
              doCleanup();
              router.push('/');
            }

          } catch (e) {
            console.error('[useMeetingRoom] WS message parse error:', e);
          }
        };

        // Initialize Zego immediately if already admitted (no waiting room)
        if (initialStatus === 'admitted') {
          await initializeZego(participant, socket);
        }

        setLoading(false);

      } catch (err: any) {
        if (!isCurrent) return;
        if (axios.isCancel(err)) {
          console.log('[useMeetingRoom] Join request cancelled');
          return;
        }
        console.error('[useMeetingRoom] Setup failed:', err);
        setError(err.message || 'Failed to join meeting.');
        setLoading(false);
      }
    };

    setup();

    // ── Cleanup on unmount ─────────────────────────────────────────────────
    return () => {
      isCurrent = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handleUnload);
        window.removeEventListener('beforeunload', handleUnload);
      }
      abortController.abort();
      doCleanup();
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, displayName, isHostParam]);

  // ===========================================================================
  // DEVICE TOGGLES
  // ===========================================================================

  /**
   * Toggles the microphone mute state.
   *
   * IMPLEMENTATION NOTE:
   * We only disable the audio track (t.enabled = false) rather than stopping it.
   * This keeps the track alive so the camera LED doesn't change and getUserMedia
   * doesn't need to be called again to re-enable.
   */
  const toggleMic = useCallback(() => {
    const newMute = !isMutedRef.current;
    setIsMuted(newMute);
    isMutedRef.current = newMute;

    // Enable/disable the audio track
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMute; });

    // Tell the Zego engine about the mute so remote participants see the indicator
    if (zgEngineRef.current && localStreamRef.current) {
      try { zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, newMute); } catch {}
    }

    // Notify other participants via WebSocket
    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({
      type: 'STATE_UPDATE',
      audio_enabled: !newMute,
      video_enabled: !isVideoOffRef.current,
    }));
  }, []);

  /**
   * Toggles the camera on/off.
   *
   * IMPLEMENTATION NOTE:
   * Unlike audio, we STOP the video track when turning off (not just disable it).
   * Stopping the track releases the hardware, which turns off the physical camera
   * LED — an important privacy signal for users.
   *
   * When turning back on, we acquire a fresh track via getUserMedia and inject
   * it into the existing published Zego stream using replaceTrack(), which avoids
   * re-negotiating the WebRTC ICE connection.
   */
  const toggleVideo = useCallback(async () => {
    const newVideoOff = !isVideoOffRef.current;
    setIsVideoOff(newVideoOff);
    isVideoOffRef.current = newVideoOff;

    if (newVideoOff) {
      // ── TURNING OFF: stop tracks to release the camera hardware ───────────
      localStreamRef.current?.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      if (zgEngineRef.current && localStreamRef.current) {
        try { zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, true); } catch {}
      }
    } else {
      // ── TURNING ON: acquire a fresh track and inject into the stream ──────
      try {
        // Stop any stale tracks first
        localStreamRef.current?.getVideoTracks().forEach(t => { try { t.stop(); } catch {} });

        // Brief OS cooldown before re-acquiring
        await new Promise(resolve => setTimeout(resolve, 200));

        const freshStream = await acquireLocalStream();
        const newTrack = freshStream.getVideoTracks()[0];

        if (newTrack && zgEngineRef.current && localStreamRef.current) {
          // Try Zego's replaceTrack first (swaps the track without ICE re-negotiation)
          try {
            await (zgEngineRef.current as any).replaceTrack(localStreamRef.current, newTrack);
          } catch {
            // Fallback: addTrack if replaceTrack is not in this SDK version
            localStreamRef.current.addTrack(newTrack);
            freshStream.getAudioTracks().forEach(t => t.stop()); // release the extra audio
          }
          zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, false);
        } else if (newTrack && localStreamRef.current) {
          // Mock mode (no Zego engine) — just add the track
          localStreamRef.current.addTrack(newTrack);
        }

        // Increment streamKey to force VideoTile to re-bind the new track
        setStreamKey(k => k + 1);
        setStreams(prev => ({
          ...prev,
          [localParticipantIdRef.current]: localStreamRef.current!,
        }));
      } catch (e) {
        console.error('[useMeetingRoom] Camera re-enable failed:', e);
        setIsVideoOff(true);
        isVideoOffRef.current = true;
        return;
      }
    }

    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({
      type: 'STATE_UPDATE',
      audio_enabled: !isMutedRef.current,
      video_enabled: !newVideoOff,
    }));
  }, []);

  // ===========================================================================
  // HOST ACTIONS
  // ===========================================================================

  /** Sends a host command over WebSocket (mute_all, mute_user, end_meeting). */
  const sendHostCommand = useCallback((command: string, targetId?: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'HOST_COMMAND', command, target_id: targetId }));
    }
  }, []);

  /** Admits a single participant from the waiting room. */
  const admitUser = useCallback((targetId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ADMIT_USER', target_id: targetId }));
    }
  }, []);

  /** Admits all waiting-room participants at once. */
  const admitAll = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ADMIT_ALL' }));
    }
  }, []);

  /** Mutes a specific participant (host only). */
  const muteParticipant = useCallback((targetId: string) => {
    sendHostCommand('mute_user', targetId);
  }, [sendHostCommand]);

  // ===========================================================================
  // REACTIONS
  // ===========================================================================

  /** Sends an emoji reaction — shown locally immediately and broadcast via WS. */
  const sendReaction = useCallback((emoji: string) => {
    const id = Math.random().toString(36).slice(2);
    const x = 15 + Math.random() * 70;
    setFloatingReactions(prev => [...prev, { id, emoji, x, sender: displayName }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3200);
    setIsReactionsOpen(false);

    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({
      type: 'REACTION', emoji,
    }));
  }, [displayName]);

  // ===========================================================================
  // HAND RAISE
  // ===========================================================================

  /** Toggles the hand-raised state and broadcasts it to all participants. */
  const toggleHandRaised = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);

    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({
      type: 'STATE_UPDATE',
      audio_enabled: !isMutedRef.current,
      video_enabled: !isVideoOffRef.current,
      hand_raised: newState,
    }));
  }, [isHandRaised]);

  // ===========================================================================
  // SIDEBAR PANEL TOGGLES
  // ===========================================================================

  // Each sidebar closes the others when opened (only one panel at a time)

  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    setIsParticipantsOpen(false);
    setIsReactionsOpen(false);
    setIsMoreOpen(false);
  }, []);

  const toggleParticipants = useCallback(() => {
    setIsParticipantsOpen(prev => !prev);
    setIsChatOpen(false);
    setIsReactionsOpen(false);
    setIsMoreOpen(false);
  }, []);

  // ===========================================================================
  // DERIVED STATE
  // ===========================================================================

  const admittedParticipants = participants.filter(p => p.status === 'admitted');
  const waitingParticipants = participants.filter(p => p.status === 'waiting');
  const otherParticipants = participants.filter(p => p.id !== localParticipantIdRef.current);
  const isHost = localParticipant?.is_host ?? false;
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${meetingCode}`
    : '';

  // ===========================================================================
  // RETURN
  // ===========================================================================

  return {
    loading,
    error,
    localParticipant,
    participants,
    admittedParticipants,
    waitingParticipants,
    localParticipantId: localParticipantIdRef.current,
    isHost,
    streams,
    streamKey,
    isMuted,
    isVideoOff,
    isMockMedia,
    speakingIds,
    myStatus,
    inviteLink,
    copied,
    floatingReactions,
    isHandRaised,
    isChatOpen,
    isParticipantsOpen,
    isReactionsOpen,
    isMoreOpen,
    chatMessages: chatState.chatMessages,
    chatInput: chatState.chatInput,
    chatRecipient: chatState.chatRecipient,
    setChatInput: chatState.setChatInput,
    setChatRecipient: chatState.setChatRecipient,
    sendChatMessage: chatState.sendChatMessage,
    otherParticipants,
    toggleMic,
    toggleVideo,
    toggleChat,
    toggleParticipants,
    toggleHandRaised,
    handleCopyLink,
    sendReaction,
    sendHostCommand,
    admitUser,
    admitAll,
    muteParticipant,
    doCleanup,
    setIsReactionsOpen,
    setIsMoreOpen,
  };
}
