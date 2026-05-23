"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { joinMeeting, getMeetingChat } from '@/lib/api';
import axios from 'axios';
import { ShieldAlert } from 'lucide-react';

// Import modular sub-components representing specific sections of the UI
import WaitingRoomScreen from '@/components/meeting/WaitingRoomScreen';
import ReactionsPanel from '@/components/meeting/ReactionsPanel';
import MorePanel from '@/components/meeting/MorePanel';
import FloatingEmoji from '@/components/meeting/FloatingEmoji';
import MeetingHeader from '@/components/meeting/MeetingHeader';
import MeetingFooter from '@/components/meeting/MeetingFooter';
import VideoGrid from '@/components/meeting/VideoGrid';
import ChatSidebar from '@/components/meeting/ChatSidebar';
import ParticipantsSidebar from '@/components/meeting/ParticipantsSidebar';

// ===========================================================================
// MEDIA ACQUISITION UTILITY
// ===========================================================================
/**
 * Acquires the local camera + microphone stream with a multi-stage,
 * browser-resilient fallback strategy.
 *
 * WHY THIS IS NEEDED:
 * Firefox's camera subsystem can throw `AbortError: Starting videoinput failed`
 * when the hardware isn't ready — even when the user has already granted
 * permission. This is a race condition in Firefox's internal media manager,
 * not a permissions problem. The fix is:
 *
 *   Stage 1 — Retry combined audio+video with exponential back-off.
 *             AbortErrors are transient; a short wait usually resolves them.
 *
 *   Stage 2 — Request audio and video SEPARATELY using Promise.allSettled,
 *             then merge the tracks into a single MediaStream. Firefox is
 *             less likely to abort two smaller requests than one combined one.
 *
 *   Stage 3 — Audio-only fallback so the user can at least participate in
 *             the meeting if the camera hardware is truly unavailable.
 *
 * @param maxRetries Number of combined-request attempts before falling back.
 * @returns A MediaStream (may be video+audio, audio-only, or empty).
 */
async function acquireLocalStream(maxRetries = 3): Promise<MediaStream> {
  // Retry delays in ms — give the camera hardware more breathing room each time
  const retryDelays = [400, 900, 1800];

  // ── Stage 1: combined audio+video with exponential back-off ──────────────
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Wait before each retry — the camera hardware needs time to reset
      await new Promise(r => setTimeout(r, retryDelays[attempt - 1]));
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        // Use ideal (not exact) constraints so Firefox can negotiate
        // the closest supported resolution instead of hard-failing
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      console.log(`acquireLocalStream: succeeded on attempt ${attempt + 1}`);
      return stream;
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.name === 'NotReadableError';
      if (!isAbort || attempt === maxRetries - 1) {
        // Not an abort/not-readable error — likely a real permission denial
        // or we've exhausted retries. Fall through to Stage 2.
        console.warn(`acquireLocalStream: stage 1 exhausted after ${attempt + 1} attempts:`, err);
        break;
      }
      console.warn(`acquireLocalStream: attempt ${attempt + 1} got ${err.name}, retrying...`);
    }
  }

  // ── Stage 2: separate audio + video requests, merged into one stream ──────
  // Requesting audio and video independently sidesteps a Firefox bug where
  // the combined request fails even though each device is individually free.
  console.warn('acquireLocalStream: trying separate audio + video requests (stage 2)');
  try {
    const [audioResult, videoResult] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } }),
    ]);

    const tracks: MediaStreamTrack[] = [];
    if (audioResult.status === 'fulfilled') {
      tracks.push(...audioResult.value.getAudioTracks());
    }
    if (videoResult.status === 'fulfilled') {
      tracks.push(...videoResult.value.getVideoTracks());
    }

    if (tracks.length > 0) {
      console.log(`acquireLocalStream: stage 2 produced ${tracks.length} track(s)`);
      return new MediaStream(tracks);
    }
  } catch (stageErr) {
    console.warn('acquireLocalStream: stage 2 failed:', stageErr);
  }

  // ── Stage 3: audio-only (camera may be genuinely unavailable) ────────────
  // The user can still participate in the call with their microphone.
  console.warn('acquireLocalStream: falling back to audio-only (stage 3)');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (audioErr) {
    // All stages failed — return an empty stream so the page doesn't crash
    console.error('acquireLocalStream: all stages failed:', audioErr);
    return new MediaStream();
  }
}

/**
 * MeetingRoom Component
 * 
 * Main coordinator page for the Zoom meeting room.
 * - Manages WebSockets connection state for real-time controls.
 * - Integrates Zego Express SDK WebRTC client engine.
 * - Implements speaking activity trackers via browser Web Audio API context.
 * - Handles device toggles (stopping tracks to switch camera LED on/off).
 * - Distrib  utes logic across modular sub-components.
 */
export default function MeetingRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Retrieve parameters from URL router
  const meetingCode = params.meeting_code as string;
  const displayName = searchParams.get('name') || 'Guest';
  const isHostParam = searchParams.get('host') === 'true';

  // Core Connection & Hydration States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localParticipant, setLocalParticipant] = useState<any>(null);
  
  // Real-time metadata registry lists
  const [participants, setParticipants] = useState<any[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  
  // Track sequence key to force-rebind HTML5 video elements upon camera track restarts
  const [streamKey, setStreamKey] = useState(0);
  
  // Device Hardware Toggle flags
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  
  // Status flags reflecting connection environment type (Zego vs browser Mock Media)
  const [isMockMedia, setIsMockMedia] = useState(false);
  const [copied, setCopied] = useState(false);

  // Bfcache (Back-Forward Cache) Restoration Support
  // Reload page instantly if user returns via browser forward/back buttons to restore connection sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log("Page restored from Bfcache. Reloading...");
        window.location.reload();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Lobby Status ('waiting' | 'admitted')
  const [myStatus, setMyStatus] = useState<'waiting' | 'admitted'>('waiting');
  const zegoInitialized = useRef(false);

  // Sidebars panel visibility states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  
  // Chat messaging data lists
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatRecipient, setChatRecipient] = useState<string>('everyone');

  // Popup overlay panels toggles
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  
  // Reactions overlay arrays
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; x: number; sender: string }>>([]);

  // Persistent Raise Hand flag state
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Speaking detection variables (FFT analytics using Web Audio API analyzer node)
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafIdRef = useRef<number>(0);

  // Network connection refs
  const ws = useRef<WebSocket | null>(null);
  const zgEngineRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamsRef = useRef<Record<string, MediaStream>>({});
  const localParticipantIdRef = useRef<string>('');
  const participantRef = useRef<any>(null);
  
  // Snapshot cache refs to ensure WebRTC event loops reference accurate values
  const isMutedRef = useRef(true);
  const isVideoOffRef = useRef(true);
  const isMountedRef = useRef(true);

  // Mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Synchronize dynamic state values with mutable reference copies
  useEffect(() => { streamsRef.current = streams; }, [streams]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);

  // Copy meeting invite link to clipboard helper
  const handleCopyLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    const inviteUrl = `${window.location.origin}/join/${meetingCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [meetingCode]);

  // ─── Speaking activity analyzer via Web Audio API ────────────
  const startSpeakingDetection = useCallback((stream: MediaStream, participantId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      // Recursive loop checking frequency band amplitudes
      const check = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        
        setSpeakingIds(prev => {
          const next = new Set(prev);
          if (avg > 6) {
            next.add(participantId);
          } else {
            next.delete(participantId);
          }
          return next;
        });
        rafIdRef.current = requestAnimationFrame(check);
      };
      rafIdRef.current = requestAnimationFrame(check);
    } catch {
      // Catch exceptions on unsupported browsers or hardware limitations
    }
  }, []);

  // ─── WebRTC Engine Setup: Zego initialization ────────
  const initializeZego = useCallback(async (participant: any, socket: WebSocket) => {
    if (zegoInitialized.current) return;
    zegoInitialized.current = true;

    const appID = participant.zego_app_id;
    const token = participant.token;
    let localStream: MediaStream | null = null;

    // Default configuration: Hosts start with devices unmuted, guests check metadata
    const audioEnabled = participant.is_host ? true : (participant.audio_enabled ?? true);
    const videoEnabled = participant.is_host ? true : (participant.video_enabled ?? true);

    if (appID === 0 || token === 'mock-token') {
      // Mock / Offline mode fallback for local debugging or dev testing
      console.warn('Initializing room in Mock Media mode');
      setIsMockMedia(true);
      
      try {
        // Stop current active local streams to unlock camera hardware
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
          localStreamRef.current = null;
        }

        // Small cooldown to let the OS release camera hardware before re-acquiring.
        // acquireLocalStream() handles retries internally, so no extra delay needed here.
        await new Promise(resolve => setTimeout(resolve, 200));

        // Use the resilient multi-stage helper — handles Firefox AbortErrors automatically
        localStream = await acquireLocalStream();
        localStreamRef.current = localStream;
        
        // Enforce user preference states on tracks
        localStream.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
        localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });
        
        setStreams(prev => ({ ...prev, [participant.id]: localStream! }));
        setIsVideoOff(!videoEnabled);
        setIsMuted(!audioEnabled);
        isMutedRef.current = !audioEnabled;
        isVideoOffRef.current = !videoEnabled;
        
        // Begin analyzer loop
        startSpeakingDetection(localStream, participant.id);
        
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'STATE_UPDATE',
            audio_enabled: audioEnabled,
            video_enabled: videoEnabled
          }));
        }
      } catch (e) {
        console.error('Camera allocation failed in Mock mode:', e);
      }

    } else {
      // Dynamic import of Zego WebRTC Express library to prevent SSR build issues
      if (zgEngineRef.current) {
        console.warn("Zego engine already exists, skipping login phase.");
        return;
      }
      
      const { ZegoExpressEngine } = await import('zego-express-engine-webrtc');
      const zegoEngine = new ZegoExpressEngine(appID, `wss://webliveroom${appID}-api.zegocloud.com/ws`);
      zgEngineRef.current = zegoEngine;

      // Event listener: Stream state modifications on Zego servers
      zegoEngine.on('roomStreamUpdate', async (roomID: string, updateType: 'ADD' | 'DELETE', streamList: any[]) => {
        if (updateType === 'ADD') {
          for (const s of streamList) {
            try {
              // Subscribe and render incoming participant stream
              const remote = await zegoEngine.startPlayingStream(s.streamID);
              setStreams(prev => ({ ...prev, [s.streamID]: remote }));
            } catch (e) {
              console.error('Failed to subscribe remote stream:', e);
            }
          }
        } else {
          for (const s of streamList) {
            try {
              zegoEngine.stopPlayingStream(s.streamID);
            } catch {}
            setStreams(prev => {
              const n = { ...prev };
              delete n[s.streamID];
              return n;
            });
          }
        }
      });

      // Login to Zego WebRTC room
      await zegoEngine.loginRoom(
        meetingCode,
        token,
        { userID: participant.id, userName: displayName },
        { userUpdate: true }
      );
      
      try {
        // ── Step 1: Release any existing hardware tracks ────────────────────
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
          localStreamRef.current = null;
        }

        // ── Step 2: Detect browser ─────────────────────────────────────────
        // CRITICAL: zegoEngine.startPublishingStream() ONLY accepts streams
        // created by zegoEngine.createStream(). Passing a raw getUserMedia
        // MediaStream results in the "stream is not from zego" error.
        //
        // However, zegoEngine.createStream({ camera }) internally calls
        // getUserMedia via its WASM layer, which Firefox blocks because the
        // WASM execution context doesn't carry JS-level permission grants.
        //
        // SOLUTION: The Zego SDK supports a `custom` mode where we supply our
        // own MediaStreamTracks. This lets us:
        //  1. Acquire tracks via direct JS getUserMedia (works on Firefox)
        //  2. Wrap them in a Zego-owned stream via createStream({ custom: { ... } })
        //  3. Pass the Zego stream to startPublishingStream (no rejection)
        const isFirefox = typeof navigator !== 'undefined' &&
          navigator.userAgent.toLowerCase().includes('firefox');

        // Allow OS to release the previous camera handle
        await new Promise(resolve => setTimeout(resolve, 150));

        if (isFirefox) {
          // ── Firefox: acquire tracks via JS getUserMedia, wrap in Zego stream ─
          // Step A: Get raw stream with retry logic (handles AbortError)
          const rawStream = await acquireLocalStream();

          // Step B: Wrap the raw MediaStream in a Zego-owned stream object.
          // The correct Zego custom API shape is: { custom: { source: MediaStream } }
          // This avoids Zego calling getUserMedia internally (which fails in
          // Firefox's WASM permission model) while still giving Zego a stream
          // it owns and can pass through startPublishingStream.
          localStream = await zegoEngine.createStream({ custom: { source: rawStream } } as any);
        } else {
          // ── Chrome/Safari: use Zego's native camera stream creation ─────────
          try {
            localStream = await zegoEngine.createStream({ camera: { audio: true, video: true } });
          } catch (zegoErr) {
            // If Zego's camera creation fails on Chrome too, fall back to
            // the same custom-source approach used for Firefox
            console.warn('zegoEngine.createStream (camera) failed, trying custom source path:', zegoErr);
            await new Promise(resolve => setTimeout(resolve, 300));
            const rawStream = await acquireLocalStream();
            localStream = await zegoEngine.createStream({ custom: { source: rawStream } } as any);
          }
        }

        localStreamRef.current = localStream;
      } catch (e) {
        console.error('Camera stream acquisition failed on this browser:', e);
      }

      if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
        localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });
        
        // Start publishing WebRTC stream to other room participants
        await zegoEngine.startPublishingStream(participant.id, localStream);
        
        // Ensure engine mute settings align with initial track settings
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
            video_enabled: videoEnabled
          }));
        }
      }
    }
  }, [meetingCode, displayName, startSpeakingDetection]);

  // Connect WebRTC streams once status changes to 'admitted'
  useEffect(() => {
    if (myStatus === 'admitted' && !zegoInitialized.current && participantRef.current && ws.current) {
      initializeZego(participantRef.current, ws.current);
    }
  }, [myStatus, initializeZego]);

  // ─── Main coordinator setup effect ───────────────────────────
  useEffect(() => {
    if (!meetingCode || !displayName) return;

    let socket: WebSocket | null = null;
    let isCurrent = true;
    const abortController = new AbortController();

    const handleUnload = () => {
      isCurrent = false;
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handleUnload);
      window.addEventListener('beforeunload', handleUnload);
    }

    const setup = async () => {
      try {
        // Stabilization delay to avoid double calls during React hydration
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCurrent) return;

        setError('');
        setLoading(true);

        // Join REST helper with transient network failure retry buffers
        const joinWithRetry = async (pid: string | null, retries = 3, delayMs = 150): Promise<any> => {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              if (!isCurrent) throw new Error("Component unmounted");
              return await joinMeeting(meetingCode, displayName, isHostParam, pid, abortController.signal);
            } catch (err: any) {
              if (axios.isCancel(err) || !isCurrent) {
                throw err;
              }
              const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message === 'Network Error';
              if (isNetworkError && attempt < retries) {
                console.warn(`Network Error on join attempt ${attempt}. Retrying in ${delayMs}ms...`, err);
                await new Promise(resolve => setTimeout(resolve, delayMs));
              } else {
                throw err;
              }
            }
          }
        };

        const savedPid = typeof window !== 'undefined' ? sessionStorage.getItem(`meeting_${meetingCode}_pid`) : null;
        let participant;
        try {
          participant = await joinWithRetry(savedPid);
        } catch (joinErr: any) {
          if (axios.isCancel(joinErr) || !isCurrent) {
            throw joinErr;
          }
          console.warn("Session restore failed. Falling back to fresh join...", joinErr);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(`meeting_${meetingCode}_pid`);
          }
          participant = await joinWithRetry(null);
        }
        
        if (!isCurrent) return;

        // Persist participant ID to sessionStorage to allow browser reload restoration
        if (participant && participant.id && typeof window !== 'undefined') {
          sessionStorage.setItem(`meeting_${meetingCode}_pid`, participant.id);
        }

        participantRef.current = participant;
        setLocalParticipant(participant);
        localParticipantIdRef.current = participant.id;
        setIsMuted(!participant.audio_enabled);
        setIsVideoOff(!participant.video_enabled);

        const initialStatus: 'waiting' | 'admitted' = participant.status === 'admitted' ? 'admitted' : 'waiting';
        setMyStatus(initialStatus);

        try {
          // Pre-fetch message histories
          const history = await getMeetingChat(meetingCode, abortController.signal);
          if (isCurrent) setChatMessages(history || []);
        } catch {}

        if (!isCurrent) return;

        const jwtToken = localStorage.getItem('token');
        // Establish WebSocket control channel.
        // NEXT_PUBLIC_WS_URL is set per-environment in .env.local:
        //   Dev:  ws://127.0.0.1:8000
        //   Prod: wss://your-backend-domain.com
        const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000';
        const wsUrl = `${wsBase}/ws/meeting/${meetingCode}?name=${encodeURIComponent(displayName)}&participant_id=${participant.id}${jwtToken ? `&token=${jwtToken}` : ''}`;
        socket = new WebSocket(wsUrl);

        ws.current = socket;

        // Message Event processing Hub
        socket.onmessage = (event) => {
          if (!isCurrent) return;
          try {
            const data = JSON.parse(event.data);

            if (data.participants) {
              const unique = data.participants.filter(
                (p: any, i: number, arr: any[]) => arr.findIndex(t => t.id === p.id) === i
              );
              setParticipants(unique);

              // Check if waiting room guest is newly admitted
              const myId = localParticipantIdRef.current;
              const me = unique.find((p: any) => p.id === myId);
              if (me?.status === 'admitted' && myStatus !== 'admitted') {
                console.log("Admitted by host. Initializing WebRTC stream...");
                setMyStatus('admitted');
                if (participantRef.current && ws.current) {
                  initializeZego(participantRef.current, ws.current);
                }
              }
            }

            if (data.type === 'CHAT_MESSAGE') {
              setChatMessages(prev => [...prev, data]);
            } else if (data.type === 'REACTION') {
              // Float emoji animation
              const id = Math.random().toString(36).slice(2);
              const x = 15 + Math.random() * 70;
              setFloatingReactions(prev => [...prev, { id, emoji: data.emoji, x, sender: data.sender_name }]);
              setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3200);
            } else if (data.type === 'HOST_COMMAND') {
              if (data.command === 'mute_all' && !participant.is_host) {
                // Host muted everyone
                setIsMuted(true);
                isMutedRef.current = true;
                if (localStreamRef.current) {
                  localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                }
                if (zgEngineRef.current && localStreamRef.current) {
                  zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, true);
                }
                if (ws.current?.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({
                    type: 'STATE_UPDATE',
                    audio_enabled: false,
                    video_enabled: !isVideoOffRef.current
                  }));
                }
              } else if (data.command === 'mute_user') {
                if (data.target_id === localParticipantIdRef.current) {
                  // Direct mute command from host targeting this user
                  setIsMuted(true);
                  isMutedRef.current = true;
                  if (localStreamRef.current) {
                    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                  }
                  if (zgEngineRef.current && localStreamRef.current) {
                    zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, true);
                  }
                  if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                      type: 'STATE_UPDATE',
                      audio_enabled: false,
                      video_enabled: !isVideoOffRef.current
                    }));
                  }
                }
              } else if (data.command === 'end_meeting') {
                doCleanup();
                router.push('/');
              }
            } else if (data.type === 'MEETING_ENDED' || data.type === 'KICKED') {
              if (data.type === 'KICKED') {
                alert('You have been removed from the meeting by the host.');
              }
              doCleanup();
              router.push('/');
            }
          } catch (e) {
            console.error('WebSocket event parse error:', e);
          }
        };

        if (initialStatus === 'admitted') {
          await initializeZego(participant, socket);
        }

        setLoading(false);
      } catch (err: any) {
        if (!isCurrent) return;
        if (axios.isCancel(err)) {
          console.log("joinMeeting request was cancelled/aborted.");
          return;
        }
        console.error('Coordinator setup failure:', err);
        setError(err.message || 'Failed to join meeting.');
        setLoading(false);
      }
    };

    setup();

    return () => {
      isCurrent = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handleUnload);
        window.removeEventListener('beforeunload', handleUnload);
      }
      abortController.abort();
      doCleanup();
      if (socket) {
        socket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, displayName, isHostParam]);

  // ─── Cleanup helper ──────────────────────────────────
  const doCleanup = () => {
    zegoInitialized.current = false;
    cancelAnimationFrame(rafIdRef.current);
    audioCtxRef.current?.close().catch(() => {});
    
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
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    
    Object.keys(streamsRef.current).forEach(id => {
      if (zgEngineRef.current && id !== localParticipantIdRef.current) {
        try {
          zgEngineRef.current.stopPlayingStream(id);
        } catch {}
      }
    });
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  };

  // ─── Toggle Microphone state (only toggles track enabled flag) ───
  const toggleMic = useCallback(() => {
    const newMute = !isMutedRef.current;
    setIsMuted(newMute);
    isMutedRef.current = newMute;
    
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newMute);
    }
    if (zgEngineRef.current && localStreamRef.current) {
      try {
        zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, newMute);
      } catch {}
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        audio_enabled: !newMute,
        video_enabled: !isVideoOffRef.current
      }));
    }
  }, []);

  // ─── Toggle Video state (completely destroys track to kill hardware LED) ───
  const toggleVideo = useCallback(async () => {
    const newVideoOff = !isVideoOffRef.current;
    setIsVideoOff(newVideoOff);
    isVideoOffRef.current = newVideoOff;

    if (newVideoOff) {
      // Kill track so camera hardware LED turns off physically
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop();
          localStreamRef.current!.removeTrack(t);
        });
      }
      if (zgEngineRef.current && localStreamRef.current) {
        try {
          zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, true);
        } catch {}
      }
    } else {
      // Re-enable camera: acquire a fresh video track and inject it into the
      // existing Zego stream. We use replaceTrack (Zego SDK API) instead of
      // addTrack so the published stream updates without re-negotiating ICE.
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        // Small cooldown so OS releases the camera handle
        await new Promise(resolve => setTimeout(resolve, 200));

        // Acquire a fresh video track with retry logic (Firefox-resilient)
        const freshStream = await acquireLocalStream();
        const newTrack = freshStream.getVideoTracks()[0];

        if (newTrack && zgEngineRef.current && localStreamRef.current) {
          // Use Zego's replaceTrack to swap the video track inside the existing
          // published stream without disrupting audio or the WebRTC connection
          try {
            await (zgEngineRef.current as any).replaceTrack(localStreamRef.current, newTrack);
          } catch {
            // replaceTrack may not be in all SDK versions; fall back to addTrack
            localStreamRef.current.addTrack(newTrack);
            freshStream.getAudioTracks().forEach(t => t.stop()); // release audio
          }
          zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, false);
        } else if (newTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(newTrack);
        }
        
        // Force rendering updates on children tiles
        setStreamKey(k => k + 1);
        setStreams(prev => ({
          ...prev,
          [localParticipantIdRef.current]: localStreamRef.current!
        }));
      } catch (e) {
        console.error('Camera track re-fetch failed:', e);
        setIsVideoOff(true);
        isVideoOffRef.current = true;
        return;
      }
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        audio_enabled: !isMutedRef.current,
        video_enabled: !newVideoOff
      }));
    }
  }, []);

  // ─── Chat send messaging ──────────────────────────────
  const sendChatMessage = () => {
    if (!chatInput.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const targetId = chatRecipient === 'everyone' ? null : chatRecipient;
    
    ws.current.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      message_text: chatInput.trim(),
      target_user_id: targetId
    }));
    setChatInput('');
  };

  // ─── Reactions messaging triggers ────────────────────
  const sendReaction = (emoji: string) => {
    const id = Math.random().toString(36).slice(2);
    const x = 15 + Math.random() * 70;
    setFloatingReactions(prev => [...prev, { id, emoji, x, sender: displayName }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3200);
    setIsReactionsOpen(false);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'REACTION', emoji }));
    }
  };

  // ─── Host Administration commands ─────────────────────
  const sendHostCommand = (command: string, targetId?: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'HOST_COMMAND',
        command,
        target_id: targetId
      }));
    }
  };

  const muteParticipant = (targetId: string) => {
    sendHostCommand('mute_user', targetId);
  };

  const admitUser = (targetId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ADMIT_USER', target_id: targetId }));
    }
  };

  const admitAll = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ADMIT_ALL' }));
    }
  };

  // ─── Sidebar state orchestrations ────────────────────
  const toggleChat = () => {
    setIsChatOpen(prev => !prev);
    setIsParticipantsOpen(false);
    setIsReactionsOpen(false);
    setIsMoreOpen(false);
  };
  
  const toggleParticipants = () => {
    setIsParticipantsOpen(prev => !prev);
    setIsChatOpen(false);
    setIsReactionsOpen(false);
    setIsMoreOpen(false);
  };

  // ─── Raise / Lower Hand status updates ───────────────
  const toggleHandRaised = () => {
    const newHandState = !isHandRaised;
    setIsHandRaised(newHandState);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        audio_enabled: !isMutedRef.current,
        video_enabled: !isVideoOffRef.current,
        hand_raised: newHandState,
      }));
    }
  };

  // ─── Render screen guards ────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white select-none">
        <div className="w-12 h-12 border-4 border-[#0e71eb] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg font-semibold tracking-wide">Connecting...</p>
      </div>
    );
  }

  if (error || !localParticipant) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white select-none">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Unable to Join</h1>
        <p className="text-gray-400 mb-8">{error || 'Could not retrieve room token.'}</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2 bg-[#0e71eb] rounded-lg font-semibold hover:bg-[#1a85ff] transition-colors cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Lobby card view for pending participants
  if (myStatus === 'waiting') {
    return <WaitingRoomScreen displayName={displayName} meetingCode={meetingCode} />;
  }

  // ─── Derived state metadata mappings ──────────────────
  const otherParticipants = participants.filter(p => p.id !== localParticipantIdRef.current);
  const admittedParticipants = participants.filter(p => p.status === 'admitted');
  const waitingParticipants = participants.filter(p => p.status === 'waiting');
  const isHost = localParticipant?.is_host;
  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/join/${meetingCode}` : '';

  return (
    <div
      className="h-screen bg-[#242424] flex flex-col text-white overflow-hidden"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Floating emoji reactions canvas overlay */}
      {floatingReactions.map(r => (
        <FloatingEmoji key={r.id} emoji={r.emoji} x={r.x} sender={r.sender} />
      ))}

      {/* Emoji selector popover */}
      {isReactionsOpen && (
        <ReactionsPanel
          onReact={sendReaction}
          onClose={() => setIsReactionsOpen(false)}
          onRaiseHand={toggleHandRaised}
          isHandRaised={isHandRaised}
        />
      )}

      {/* Advanced host option popup */}
      {isMoreOpen && (
        <MorePanel
          onClose={() => setIsMoreOpen(false)}
          isHost={isHost}
          onMuteAll={() => sendHostCommand('mute_all')}
          onEndMeeting={() => {
            if (isHost) {
              sendHostCommand('end_meeting');
            } else {
              doCleanup();
              router.push('/');
            }
          }}
        />
      )}

      {/* Top Banner Bar */}
      <MeetingHeader
        meetingCode={meetingCode}
        inviteLink={inviteLink}
        isHost={isHost}
        waitingParticipantsCount={waitingParticipants.length}
        isMockMedia={isMockMedia}
        copied={copied}
        onCopyLink={handleCopyLink}
        onAdmitAll={admitAll}
      />

      {/* Main viewport body (splits video grid and right sidebars) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Responsive Grid layout containing WebRTC visual tags */}
        <VideoGrid
          admittedParticipants={admittedParticipants}
          localParticipantId={localParticipantIdRef.current}
          isHandRaised={isHandRaised}
          streams={streams}
          speakingIds={speakingIds}
          streamKey={streamKey}
          toggleHandRaised={toggleHandRaised}
        />

        {/* Sidebars tray */}
        {(isChatOpen || isParticipantsOpen) && (
          <aside className="w-[320px] flex-shrink-0 bg-[#f0f0f0] text-gray-900 flex flex-col overflow-hidden border-l border-[#333]">
            {/* Participants manager panel */}
            <ParticipantsSidebar
              isOpen={isParticipantsOpen}
              onClose={() => setIsParticipantsOpen(false)}
              admittedParticipants={admittedParticipants}
              waitingParticipants={waitingParticipants}
              isHost={isHost}
              localParticipantId={localParticipantIdRef.current}
              isHandRaised={isHandRaised}
              speakingIds={speakingIds}
              onAdmit={admitUser}
              onAdmitAll={admitAll}
              onMuteParticipant={muteParticipant}
              onMuteAll={() => sendHostCommand('mute_all')}
              onCopyLink={handleCopyLink}
              copied={copied}
            />

            {/* Messaging threads panel */}
            <ChatSidebar
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              chatMessages={chatMessages}
              displayName={displayName}
              otherParticipants={otherParticipants}
              chatRecipient={chatRecipient}
              onRecipientChange={setChatRecipient}
              chatInput={chatInput}
              onInputChange={setChatInput}
              onSendMessage={sendChatMessage}
            />
          </aside>
        )}
      </div>

      {/* Control bar bottom toolbar */}
      <MeetingFooter
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        admittedCount={admittedParticipants.length}
        waitingCount={waitingParticipants.length}
        isParticipantsOpen={isParticipantsOpen}
        isChatOpen={isChatOpen}
        isReactionsOpen={isReactionsOpen}
        isMoreOpen={isMoreOpen}
        isHost={isHost}
        onToggleMic={toggleMic}
        onToggleVideo={toggleVideo}
        onToggleParticipants={toggleParticipants}
        onToggleChat={toggleChat}
        onToggleReactions={() => {
          setIsReactionsOpen(prev => !prev);
          setIsMoreOpen(false);
        }}
        onToggleMore={() => {
          setIsMoreOpen(prev => !prev);
          setIsReactionsOpen(false);
        }}
        onLeaveOrEnd={() => {
          if (isHost) {
            if (confirm('End the meeting for all participants?')) {
              sendHostCommand('end_meeting');
            }
          } else {
            doCleanup();
            router.push('/');
          }
        }}
      />
    </div>
  );
}
