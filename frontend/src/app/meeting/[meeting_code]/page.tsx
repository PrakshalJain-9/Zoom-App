"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getMeeting, joinMeeting, getMeetingChat } from '@/lib/api';
import axios from 'axios';
import {
  Mic, MicOff, Video, VideoOff, ShieldAlert,
  Users, MessageSquare, CircleDot,
  Smile, MoreHorizontal, Info, ShieldCheck,
  Link, Clock, CheckCheck, UserCheck, X,
  LayoutGrid, Maximize2, Volume2, Settings, LogOut
} from 'lucide-react';

// ─────────────────────────────────────────────────────
// VideoTile – binds MediaStream to <video> element
// ─────────────────────────────────────────────────────
function VideoTile({
  stream, isLocal, isVideoOff, isSpeaking, streamKey
}: {
  stream: MediaStream | null;
  isLocal: boolean;
  isVideoOff: boolean;
  isSpeaking?: boolean;
  streamKey?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) {
        videoRef.current.play().catch(err => {
          if (err.name !== 'AbortError') console.error("Video play error:", err);
        });
      }
    }
  }, [stream, streamKey]);

  return (
    <video
      ref={videoRef}
      autoPlay={true}
      playsInline={true}
      muted={isLocal}
      className={`absolute inset-0 w-full h-full object-cover bg-gray-900 rounded-lg ${isLocal ? 'scale-x-[-1]' : ''} ${isVideoOff || !stream ? 'pointer-events-none opacity-0 z-0' : 'z-20'}`}
    />
  );
}

// ─────────────────────────────────────────────────────
// ParticipantVideo – tile wrapper with speaking ring + avatar fallback
// ─────────────────────────────────────────────────────
function ParticipantVideo({
  participant, stream, isLocal, isSpeaking, streamKey
}: {
  participant: any;
  stream: MediaStream | null;
  isLocal: boolean;
  isSpeaking?: boolean;
  streamKey?: number;
}) {
  const isVideoOff = !participant.video;
  const isMuted = !participant.audio;

  return (
    <div className={`w-full aspect-video bg-[#000000] rounded-xl shadow-xl relative overflow-hidden flex flex-col items-center justify-center group transition-all duration-150 ${isSpeaking ? 'ring-2 ring-[#0e71eb] ring-offset-1 ring-offset-[#1a1a1a]' : 'border border-gray-800'}`}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />

      {(isVideoOff || !stream) && (
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gray-700 flex items-center justify-center text-4xl md:text-5xl font-semibold mb-4 shadow-lg border-2 border-gray-600 z-10 select-none">
          {(participant.name || 'G').charAt(0).toUpperCase()}
        </div>
      )}

      <VideoTile
        stream={stream}
        isLocal={isLocal}
        isVideoOff={isVideoOff}
        isSpeaking={isSpeaking}
        streamKey={streamKey}
      />

      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 z-30">
        {isMuted && <MicOff size={14} className="text-red-500" />}
        {isSpeaking && !isMuted && <Mic size={14} className="text-[#0e71eb] animate-pulse" />}
        <span>{participant.name || 'Guest'} {isLocal && "(You)"}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// ControlBtn – bottom bar button
// ─────────────────────────────────────────────────────
function ControlBtn({ icon, label, onClick, hasCaret, badge, active }: any) {
  return (
    <div className="flex relative">
      <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center w-[64px] h-[64px] rounded-lg transition-colors group ${active ? 'bg-[#0e71eb]/20' : 'hover:bg-[#333333]'}`}
      >
        <div className="mb-1 relative">
          {icon}
          {badge && (
            <span className="absolute -top-1.5 -right-2 bg-gray-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] flex items-center justify-center">
              {badge}
            </span>
          )}
        </div>
        <span className={`text-[11px] font-medium transition-colors ${active ? 'text-[#0e71eb]' : 'text-gray-300 group-hover:text-white'}`}>
          {label}
        </span>
      </button>
      {hasCaret && (
        <button className="h-[64px] px-1 hover:bg-[#333333] rounded-r-lg flex items-center justify-center transition-colors">
          <span className="text-gray-400 text-[10px]">▲</span>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// ReactionsPanel – emoji grid that floats above footer
// ─────────────────────────────────────────────────────
const EMOJI_REACTIONS = [
  { emoji: '👍', label: 'Thumbs Up' }, { emoji: '👏', label: 'Clap' },
  { emoji: '❤️', label: 'Love' }, { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' }, { emoji: '🎉', label: 'Celebrate' },
  { emoji: '🙏', label: 'Thank You' }, { emoji: '🔥', label: 'Fire' },
  { emoji: '✋', label: 'Raise Hand' }, { emoji: '💯', label: 'Perfect' },
  { emoji: '😢', label: 'Sad' }, { emoji: '🚀', label: 'Rocket' },
];

function ReactionsPanel({ onReact, onClose }: { onReact: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-50 bg-[#1e1e1e] border border-[#444] rounded-2xl shadow-2xl p-4 w-80 animate-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-sm font-semibold">Send a Reaction</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
          <X size={15} />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {EMOJI_REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            title={label}
            className="text-2xl hover:scale-125 transition-transform cursor-pointer p-1.5 rounded-lg hover:bg-white/10 flex items-center justify-center"
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 text-center mt-3">Reactions are visible to all participants</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// MorePanel – host settings + general options
// ─────────────────────────────────────────────────────
function MorePanel({
  onClose, isHost, onMuteAll, onEndMeeting
}: {
  onClose: () => void;
  isHost: boolean;
  onMuteAll: () => void;
  onEndMeeting: () => void;
}) {
  return (
    <div className="fixed bottom-[88px] right-4 z-50 bg-[#1e1e1e] border border-[#444] rounded-2xl shadow-2xl overflow-hidden w-68 animate-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between p-3 border-b border-[#333]">
        <span className="text-white text-sm font-semibold">More options</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
          <X size={15} />
        </button>
      </div>
      <div className="py-1.5">
        <MenuRow icon={<LayoutGrid size={15} className="text-gray-400" />} label="Switch to Gallery View" hint="Toggle layout" />
        <MenuRow icon={<Maximize2 size={15} className="text-gray-400" />} label="Enter Full Screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => { })} />
        <MenuRow icon={<Volume2 size={15} className="text-gray-400" />} label="Audio Settings" hint="Manage devices" />
        <MenuRow icon={<Video size={15} className="text-gray-400" />} label="Video Settings" hint="Manage camera" />
        <MenuRow icon={<Settings size={15} className="text-gray-400" />} label="Preferences" hint="Advanced settings" />
        {isHost && (
          <>
            <div className="border-t border-[#333] my-1.5 mx-3" />
            <MenuRow
              icon={<MicOff size={15} className="text-orange-400" />}
              label="Mute All Participants"
              labelClass="text-orange-300"
              onClick={() => { onMuteAll(); onClose(); }}
            />
            <MenuRow
              icon={<LogOut size={15} className="text-red-400" />}
              label="End Meeting for All"
              labelClass="text-red-400"
              onClick={() => { if (confirm('End the meeting for all participants?')) { onEndMeeting(); onClose(); } }}
            />
          </>
        )}
        <div className="border-t border-[#333] my-1.5 mx-3" />
        <div className="px-4 py-2 text-[10px] text-gray-600 font-medium">Zoom Clone · Next.js + FastAPI + ZegoCloud</div>
      </div>
    </div>
  );
}

function MenuRow({ icon, label, hint, onClick, labelClass }: { icon: React.ReactNode; label: string; hint?: string; onClick?: () => void; labelClass?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 hover:bg-white/8 flex items-center gap-3 transition-colors group"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className={`text-sm ${labelClass || 'text-gray-200'}`}>{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────
// FloatingEmoji – animated emoji that floats up then fades
// ─────────────────────────────────────────────────────
function FloatingEmoji({ emoji, x, sender }: { emoji: string; x: number; sender: string }) {
  return (
    <div
      className="fixed bottom-[88px] z-50 flex flex-col items-center pointer-events-none"
      style={{ left: `${x}%`, animation: 'floatUp 3s ease-out forwards' }}
    >
      <span className="text-4xl drop-shadow-lg">{emoji}</span>
      <span className="text-[10px] text-white/80 bg-black/50 rounded px-1 mt-1">{sender}</span>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0)   scale(1);   opacity: 1; }
          70%  { transform: translateY(-200px) scale(1.2); opacity: 0.9; }
          100% { transform: translateY(-350px) scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// WaitingRoom screen – pixel-perfect Zoom card
// ─────────────────────────────────────────────────────
function WaitingRoomScreen({ displayName, meetingCode }: { displayName: string; meetingCode: string }) {
  return (
    <div className="min-h-screen bg-[#242424] flex items-center justify-center px-4">
      <div className="bg-white text-gray-900 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#0e71eb] flex items-center justify-center shadow-md">
            <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
              <path d="M6 13.5C6 11.567 7.567 10 9.5 10h12C23.433 10 25 11.567 25 13.5v13C25 28.433 23.433 30 21.5 30h-12C7.567 30 6 28.433 6 26.5v-13z" fill="white" />
              <path d="M26 16.2l7.2-4.8A1 1 0 0135 12.2v15.6a1 1 0 01-1.8.6L26 23.8V16.2z" fill="white" />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2 leading-snug">
          Please wait, the meeting host will let you in soon.
        </h1>
        <p className="text-sm text-gray-500 mb-1">
          Meeting ID: <span className="font-mono font-medium text-gray-700">{meetingCode}</span>
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Joining as <span className="font-medium text-gray-700">{displayName}</span>
        </p>
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block w-2.5 h-2.5 rounded-full bg-[#0e71eb]"
              style={{ animation: `zoom-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <style>{`
          @keyframes zoom-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%  { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <p className="text-xs text-gray-400 mt-8">
          Your microphone and camera will turn on when you're admitted.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main MeetingRoom component
// ─────────────────────────────────────────────────────
export default function MeetingRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const meetingCode = params.meeting_code as string;
  const displayName = searchParams.get('name') || 'Guest';
  const isHostParam = searchParams.get('host') === 'true';

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localParticipant, setLocalParticipant] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [streamKey, setStreamKey] = useState(0); // force VideoTile re-bind after track replace
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isMockMedia, setIsMockMedia] = useState(false);
  const [isMeetingInfoOpen, setIsMeetingInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reload page on Bfcache restore (pageshow event with persisted = true)
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

  // Waiting room
  const [myStatus, setMyStatus] = useState<'waiting' | 'admitted'>('waiting');
  const zegoInitialized = useRef(false);

  // Sidebars
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatRecipient, setChatRecipient] = useState<string>('everyone');

  // Reactions & More panels
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; x: number; sender: string }>>([]);

  // Speaking detection
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafIdRef = useRef<number>(0);

  // Refs
  const ws = useRef<WebSocket | null>(null);
  const zgEngineRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamsRef = useRef<Record<string, MediaStream>>({});
  const localParticipantIdRef = useRef<string>('');
  const infoRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const participantRef = useRef<any>(null);
  const isMutedRef = useRef(true);
  const isVideoOffRef = useRef(true);
  const hasInitialized = useRef(false);
  const isMountedRef = useRef(true);

  // Track mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Sync refs
  useEffect(() => { streamsRef.current = streams; }, [streams]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setIsMeetingInfoOpen(false);
      }
    };
    if (isMeetingInfoOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMeetingInfoOpen]);

  // Auto-scroll chat
  useEffect(() => {
    if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);

  // ─── Invite link – strips host= param ────────────────
  const handleCopyLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    // Generate a clean guest invite link (no host flag)
    const guestUrl = `${window.location.origin}/meeting/${meetingCode}?name=Guest`;
    navigator.clipboard.writeText(guestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [meetingCode]);

  // ─── Speaking detection via Web Audio API ────────────
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

      const check = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeakingIds(prev => {
          const next = new Set(prev);
          if (avg > 6) next.add(participantId);
          else next.delete(participantId);
          return next;
        });
        rafIdRef.current = requestAnimationFrame(check);
      };
      rafIdRef.current = requestAnimationFrame(check);
    } catch { /* Safari / permission blocked */ }
  }, []);

  // ─── initializeZego – deferred until admitted ────────
  const initializeZego = useCallback(async (participant: any, socket: WebSocket) => {
    if (zegoInitialized.current) return;
    zegoInitialized.current = true;

    const appID = participant.zego_app_id;
    const token = participant.token;
    let localStream: MediaStream | null = null;

    if (appID === 0 || token === 'mock-token') {
      console.warn('Mock media mode');
      setIsMockMedia(true);
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = localStream;
        localStream.getAudioTracks().forEach(t => t.enabled = participant.audio_enabled);
        localStream.getVideoTracks().forEach(t => t.enabled = participant.video_enabled);
        setStreams(prev => ({ ...prev, [participant.id]: localStream! }));
        setIsVideoOff(!participant.video_enabled);
        setIsMuted(!participant.audio_enabled);
        startSpeakingDetection(localStream, participant.id);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: participant.audio_enabled, video_enabled: participant.video_enabled }));
        }
      } catch (e) { console.error('Camera error:', e); }
    } else {
      if (zgEngineRef.current) {
        console.warn("Zego engine already exists, skipping login phase.");
        return;
      }
      const { ZegoExpressEngine } = await import('zego-express-engine-webrtc');
      const zegoEngine = new ZegoExpressEngine(appID, `wss://webliveroom${appID}-api.zegocloud.com/ws`);
      zgEngineRef.current = zegoEngine;

      zegoEngine.on('roomStreamUpdate', async (roomID: string, updateType: 'ADD' | 'DELETE', streamList: any[]) => {
        if (updateType === 'ADD') {
          for (const s of streamList) {
            try {
              const remote = await zegoEngine.startPlayingStream(s.streamID);
              setStreams(prev => ({ ...prev, [s.streamID]: remote }));
            } catch (e) { console.error('play error:', e); }
          }
        } else {
          for (const s of streamList) {
            try { zegoEngine.stopPlayingStream(s.streamID); } catch { }
            setStreams(prev => { const n = { ...prev }; delete n[s.streamID]; return n; });
          }
        }
      });

      await zegoEngine.loginRoom(meetingCode, token, { userID: participant.id, userName: displayName }, { userUpdate: true });
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        localStream = await zegoEngine.createStream({ camera: { audio: true, video: true } });
        localStreamRef.current = localStream;
      } catch (e) {
        console.error("Zego stream creation failed:", e);
      }

      if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = participant.audio_enabled);
        localStream.getVideoTracks().forEach(t => t.enabled = participant.video_enabled);
        await zegoEngine.startPublishingStream(participant.id, localStream);
        setStreams(prev => ({ ...prev, [participant.id]: localStream! }));
        setIsVideoOff(!participant.video_enabled);
        setIsMuted(!participant.audio_enabled);
        startSpeakingDetection(localStream, participant.id);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: participant.audio_enabled, video_enabled: participant.video_enabled }));
        }
      }
    }
  }, [meetingCode, displayName, startSpeakingDetection]);

  // ─── Trigger Zego when status transitions to admitted ─
  useEffect(() => {
    if (myStatus === 'admitted' && !zegoInitialized.current && participantRef.current && ws.current) {
      initializeZego(participantRef.current, ws.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStatus]);

  // ─── Main setup effect ───────────────────────────────
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
        // Stabilization delay to avoid double calls during hydration or navigation transitions
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCurrent) return;

        if (isCurrent) {
          setError('');
          setLoading(true);
        }

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
          // Fallback to fresh join without the participant_id
          participant = await joinWithRetry(null);
        }
        
        if (!isCurrent) return;

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
          const history = await getMeetingChat(meetingCode, abortController.signal);
          if (isCurrent) setChatMessages(history || []);
        } catch { }

        if (!isCurrent) return;

        const jwtToken = localStorage.getItem('token');
        // Connect WebSocket (even while waiting — to receive ADMIT signal)
        const wsUrl = `ws://127.0.0.1:8000/ws/meeting/${meetingCode}?name=${encodeURIComponent(displayName)}&participant_id=${participant.id}${jwtToken ? `&token=${jwtToken}` : ''}`;
        socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onmessage = (event) => {
          if (!isCurrent) return;
          try {
            const data = JSON.parse(event.data);

            console.log(data);
            // Update participants list
            if (data.participants) {
              const unique = data.participants.filter(
                (p: any, i: number, arr: any[]) => arr.findIndex(t => t.id === p.id) === i
              );
              setParticipants(unique);

              // Check if THIS user was just admitted
              const myId = localParticipantIdRef.current;
              const me = unique.find((p: any) => p.id === myId);
              if (me?.status === 'admitted' && myStatus !== 'admitted') {
                console.log("Admitted! Initializing Zego...");
                setMyStatus('admitted'); // triggers the useEffect above for Zego init
                if (participantRef.current && ws.current) {
                  initializeZego(participantRef.current, ws.current);
                }
              }
            }

            if (data.type === 'CHAT_MESSAGE') {
              setChatMessages(prev => [...prev, data]);
            } else if (data.type === 'REACTION') {
              // Show floating emoji from this sender
              const id = Math.random().toString(36).slice(2);
              const x = 15 + Math.random() * 70;
              setFloatingReactions(prev => [...prev, { id, emoji: data.emoji, x, sender: data.sender_name }]);
              setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3200);
            } else if (data.type === 'HOST_COMMAND') {
              if (data.command === 'mute_all' && !participant.is_host) {
                setIsMuted(true);
                isMutedRef.current = true;
                if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                if (zgEngineRef.current && localStreamRef.current) zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, true);
                if (ws.current?.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: false, video_enabled: !isVideoOffRef.current }));
                }
              } else if (data.command === 'mute_user') {
                if (data.target_id === localParticipantIdRef.current) {
                  setIsMuted(true);
                  isMutedRef.current = true;
                  if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                  if (zgEngineRef.current && localStreamRef.current) zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, true);
                  if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: false, video_enabled: !isVideoOffRef.current }));
                  }
                }
              } else if (data.command === 'end_meeting') {
                doCleanup(); router.push('/');
              }
            } else if (data.type === 'MEETING_ENDED' || data.type === 'KICKED') {
              if (data.type === 'KICKED') alert('You have been removed from the meeting by the host.');
              doCleanup(); router.push('/');
            }
          } catch (e) { console.error('WS parse error:', e); }
        };

        // If already admitted (host), init Zego immediately
        if (initialStatus === 'admitted') {
          await initializeZego(participant, socket);
        }

        if (isCurrent) setLoading(false);
      } catch (err: any) {
        if (!isCurrent) return;
        if (axios.isCancel(err)) {
          console.log("joinMeeting request was cancelled/aborted.");
          return;
        }
        console.error('Setup error:', err);
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
      if (socket) socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, displayName, isHostParam]);

  // ─── Cleanup helper ──────────────────────────────────
  const doCleanup = () => {
    zegoInitialized.current = false;
    cancelAnimationFrame(rafIdRef.current);
    audioCtxRef.current?.close().catch(() => { });
    if (zgEngineRef.current) {
      try {
        if (localStreamRef.current) {
          zgEngineRef.current.stopPublishingStream(localParticipantIdRef.current);
          zgEngineRef.current.destroyStream(localStreamRef.current);
        }
        zgEngineRef.current.logoutRoom(meetingCode);
      } catch { }
      zgEngineRef.current = null;
    } else if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    Object.keys(streamsRef.current).forEach(id => {
      if (zgEngineRef.current && id !== localParticipantIdRef.current) {
        try { zgEngineRef.current.stopPlayingStream(id); } catch { }
      }
    });
    if (ws.current) { ws.current.close(); ws.current = null; }
  };

  // ─── Toggle Mic (enabled flag only, track stays alive) ─
  const toggleMic = useCallback(() => {
    const newMute = !isMutedRef.current;
    setIsMuted(newMute);
    isMutedRef.current = newMute;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newMute);
    }
    if (zgEngineRef.current && localStreamRef.current) {
      try { zgEngineRef.current.mutePublishStreamAudio(localStreamRef.current, newMute); } catch { }
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: !newMute, video_enabled: !isVideoOffRef.current }));
    }
  }, []);

  // ─── Toggle Video (stops track to kill camera LED) ────
  const toggleVideo = useCallback(async () => {
    const newVideoOff = !isVideoOffRef.current;
    setIsVideoOff(newVideoOff);
    isVideoOffRef.current = newVideoOff;

    if (newVideoOff) {
      // STOP: kill video track → camera LED turns off
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop();
          localStreamRef.current!.removeTrack(t);
        });
      }
      if (zgEngineRef.current && localStreamRef.current) {
        try { zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, true); } catch { }
      }
    } else {
      // RESTART: new getUserMedia, replace track
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        const newVidStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newVidStream.getVideoTracks()[0];
        if (localStreamRef.current) {
          localStreamRef.current.addTrack(newTrack);
        }
        if (zgEngineRef.current && localStreamRef.current) {
          try { zgEngineRef.current.mutePublishStreamVideo(localStreamRef.current, false); } catch { }
        }
        // Force VideoTile to re-bind srcObject by bumping streamKey
        setStreamKey(k => k + 1);
        setStreams(prev => ({
          ...prev,
          [localParticipantIdRef.current]: localStreamRef.current!
        }));
      } catch (e) {
        console.error('Camera restart failed:', e);
        setIsVideoOff(true);
        isVideoOffRef.current = true;
        return;
      }
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'STATE_UPDATE', audio_enabled: !isMutedRef.current, video_enabled: !newVideoOff }));
    }
  }, []);

  // ─── Chat ─────────────────────────────────────────────
  const sendChatMessage = () => {
    if (!chatInput.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const targetId = chatRecipient === 'everyone' ? null : chatRecipient;
    ws.current.send(JSON.stringify({ type: 'CHAT_MESSAGE', message_text: chatInput.trim(), target_user_id: targetId }));
    setChatInput('');
  };

  // ─── Reactions ────────────────────────────────────────
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

  // ─── Host commands ────────────────────────────────────
  const sendHostCommand = (command: string, targetId?: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'HOST_COMMAND', command, target_id: targetId }));
    }
  };

  const muteParticipant = (targetId: string) => {
    sendHostCommand('mute_user', targetId);
  };

  const admitUser = (targetId: string) => {

    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log("The request is sent through the websocket===========================================")
      ws.current.send(JSON.stringify({ type: 'ADMIT_USER', target_id: targetId }));
    }
  };

  const admitAll = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ADMIT_ALL' }));
    }
  };

  // ─── Sidebar toggles ──────────────────────────────────
  const toggleChat = () => { setIsChatOpen(p => !p); setIsParticipantsOpen(false); setIsReactionsOpen(false); setIsMoreOpen(false); };
  const toggleParticipants = () => { setIsParticipantsOpen(p => !p); setIsChatOpen(false); setIsReactionsOpen(false); setIsMoreOpen(false); };

  // ─── Render guards ────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-[#0e71eb] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg">Connecting...</p>
      </div>
    );
  }

  if (error || !localParticipant) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Unable to Join</h1>
        <p className="text-gray-400 mb-8">{error || 'Could not retrieve room token.'}</p>
        <button onClick={() => router.push('/')} className="px-6 py-2 bg-[#0e71eb] rounded-lg font-medium hover:bg-[#1a85ff] transition-colors">
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (myStatus === 'waiting') {
    return <WaitingRoomScreen displayName={displayName} meetingCode={meetingCode} />;
  }

  // ─── Derived state ────────────────────────────────────
  const otherParticipants = participants.filter(p => p.id !== localParticipantIdRef.current);
  const admittedParticipants = participants.filter(p => p.status === 'admitted');
  const waitingParticipants = participants.filter(p => p.status === 'waiting');
  const isHost = localParticipant?.is_host;

  // ─── Invite link display (no host param) ─────────────
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/meeting/${meetingCode}?name=Guest`
    : '';

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col text-white font-sans overflow-hidden">

      {/* Floating emoji reactions overlay */}
      {floatingReactions.map(r => <FloatingEmoji key={r.id} emoji={r.emoji} x={r.x} sender={r.sender} />)}

      {/* Panels (rendered outside footer so they float above) */}
      {isReactionsOpen && <ReactionsPanel onReact={sendReaction} onClose={() => setIsReactionsOpen(false)} />}
      {isMoreOpen && (
        <MorePanel
          onClose={() => setIsMoreOpen(false)}
          isHost={isHost}
          onMuteAll={() => sendHostCommand('mute_all')}
          onEndMeeting={() => { doCleanup(); router.push('/'); }}
        />
      )}

      {/* Top Header */}
      <header className="h-12 flex items-center justify-between px-4 absolute top-0 w-full z-30 bg-gradient-to-b from-black/60 to-transparent">
        <div className="relative" ref={infoRef}>
          <div
            onClick={() => setIsMeetingInfoOpen(p => !p)}
            className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <ShieldCheck size={18} className="text-green-500 fill-green-500/20" />
            <span className="text-xs font-semibold tracking-wide">Meeting Info</span>
            <Info size={14} className="text-gray-400 ml-1" />
          </div>

          {isMeetingInfoOpen && (
            <div className="absolute top-12 left-0 w-80 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#333333] rounded-xl shadow-2xl p-5 text-sm z-50 text-gray-200">
              <h3 className="font-semibold text-white text-base mb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-green-500" /> Meeting Information
              </h3>
              <div className="space-y-3.5">
                <div>
                  <div className="text-xs text-gray-400 font-medium mb-0.5">Meeting Code</div>
                  <div className="font-mono text-white font-semibold tracking-wider text-sm select-all">{meetingCode}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium mb-1">Invite Link (share this)</div>
                  <div className="flex items-center gap-2 bg-[#2c2c2c] border border-[#444444] rounded-lg p-2">
                    <span className="text-xs truncate flex-1 text-gray-300 font-mono">{inviteLink}</span>
                    <button onClick={handleCopyLink} className="px-2.5 py-1 bg-[#0e71eb] hover:bg-[#1a85ff] text-white text-xs font-semibold rounded-md transition-colors shrink-0">
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                {isHost && waitingParticipants.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <div className="text-xs text-yellow-400 font-semibold mb-1 flex items-cen ter gap-1">
                      <Clock size={12} /> {waitingParticipants.length} waiting to join
                    </div>
                    <button onClick={() => { admitAll(); setIsMeetingInfoOpen(false); }}
                      className="w-full text-xs bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/40 text-yellow-300 font-semibold rounded-md px-3 py-1.5 transition-colors">
                      Admit All
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isMockMedia && (
            <div className="px-3 py-1 bg-yellow-600/70 backdrop-blur-md rounded text-xs font-semibold animate-pulse">
              ⚠️ Mock Media Mode
            </div>
          )}
          <button onClick={handleCopyLink} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold transition-colors">
            <Link size={14} className="text-[#0e71eb]" />
            {copied ? <span className="text-green-400">Copied!</span> : <span>Invite</span>}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row relative mt-12 mb-20 overflow-hidden">

        {/* Video Grid */}
        <main className="flex-1 flex items-center justify-center relative p-4 md:p-8">
          <div className={`w-full max-w-6xl h-full grid gap-4 ${admittedParticipants.length > 1 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1'} items-center justify-center z-0`}>
            {admittedParticipants.map((p) => {
              const isLocal = p.id === localParticipantIdRef.current;
              return (
                <ParticipantVideo
                  key={p.id}
                  participant={p}
                  stream={streams[p.id] || null}
                  isLocal={isLocal}
                  isSpeaking={speakingIds.has(p.id)}
                  streamKey={isLocal ? streamKey : 0}
                />
              );
            })}
          </div>
        </main>

        {/* Sidebar Panel */}
        {(isChatOpen || isParticipantsOpen) && (
          <aside className="w-[300px] border-l border-[#333333] bg-[#1e1e1e] flex flex-col z-10 shrink-0 h-full overflow-hidden">

            {/* Participants */}
            {isParticipantsOpen && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-[#333333] flex justify-between items-center shrink-0">
                  <h2 className="font-semibold text-base">Participants ({participants.length})</h2>
                  <button onClick={() => setIsParticipantsOpen(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {isHost && waitingParticipants.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={11} /> Waiting ({waitingParticipants.length})
                        </span>
                        <button onClick={admitAll} className="text-xs bg-[#0e71eb] hover:bg-[#1a85ff] text-white font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1">
                          <CheckCheck size={12} /> Admit All
                        </button>
                      </div>
                      {waitingParticipants.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-yellow-700/50 flex items-center justify-center font-bold text-yellow-200 text-xs select-none">
                              {(p.name || 'G').charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[120px] font-medium text-yellow-100">{p.name || 'Guest'}</span>
                          </div>
                          <button onClick={() => admitUser(p.id)} className="text-xs bg-[#0e71eb] hover:bg-[#1a85ff] text-white font-semibold px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 shrink-0">
                            <UserCheck size={11} /> Admit
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-[#333333] my-3" />
                    </div>
                  )}
                  <div>
                    {isHost && waitingParticipants.length > 0 && (
                      <span className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <CheckCheck size={11} /> In Meeting ({admittedParticipants.length})
                      </span>
                    )}
                    {admittedParticipants.map(p => {
                      const isLocal = p.id === localParticipantIdRef.current;
                      return (
                        <div key={p.id} className={`flex items-center justify-between text-sm py-2 px-2 rounded-lg ${speakingIds.has(p.id) ? 'bg-[#0e71eb]/10' : ''}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white select-none transition-colors ${speakingIds.has(p.id) ? 'bg-[#0e71eb]' : 'bg-gray-700'}`}>
                              {(p.name || 'G').charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[150px] font-medium">
                              {p.name || 'Guest'} {isLocal && <span className="text-gray-400">(You)</span>}
                              {p.is_host && <span className="ml-1 text-[10px] text-[#0e71eb] font-bold">(Host)</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 shrink-0">
                            {speakingIds.has(p.id) && <Mic size={13} className="text-[#0e71eb] animate-pulse" />}
                            {isHost && !isLocal && p.audio && (
                              <button
                                onClick={() => muteParticipant(p.id)}
                                className="text-[10.5px] bg-red-600 hover:bg-red-700 text-white font-medium px-2 py-0.5 rounded transition-all mr-1 active:scale-95 shrink-0"
                              >
                                Mute
                              </button>
                            )}
                            {!speakingIds.has(p.id) && (p.audio ? <Mic size={13} /> : <MicOff size={13} className="text-red-500" />)}
                            {p.video ? <Video size={13} /> : <VideoOff size={13} className="text-red-500" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Chat */}
            {isChatOpen && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-[#333333] flex justify-between items-center shrink-0">
                  <h2 className="font-semibold text-base">In-Meeting Chat</h2>
                  <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 text-xs mt-4">No messages yet.</div>
                  ) : chatMessages.map((msg, i) => {
                    const isMe = msg.sender_name === displayName;
                    return (
                      <div key={i} className="flex flex-col text-xs">
                        <div className="flex items-baseline justify-between text-gray-400 mb-0.5">
                          <span className="font-semibold flex items-center gap-1">
                            <span className={isMe ? 'text-[#0e71eb]' : 'text-green-500'}>{msg.sender_name}</span>
                            {msg.target_user_id && <span className="text-[10px] text-yellow-500 font-semibold">(DM)</span>}
                          </span>
                          <span className="text-[10px]">
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <div className={`p-2 rounded-lg break-words whitespace-pre-wrap ${msg.target_user_id ? 'bg-[#2e2616] border border-yellow-600/20 text-yellow-100' : 'bg-[#2c2c2c] text-white'}`}>
                          {msg.message_text}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-[#333333] shrink-0 bg-[#1e1e1e]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-400 font-semibold shrink-0">To:</span>
                    <select value={chatRecipient} onChange={e => setChatRecipient(e.target.value)}
                      className="bg-[#2c2c2c] border border-[#444444] rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#0e71eb] flex-1 max-w-[180px]">
                      <option value="everyone">Everyone</option>
                      {otherParticipants.filter(p => p.status === 'admitted').map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <form onSubmit={e => { e.preventDefault(); sendChatMessage(); }} className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                      placeholder="Type message here..." className="flex-1 text-xs bg-[#2c2c2c] border border-[#444444] rounded-md px-2.5 py-2 text-white focus:outline-none focus:border-[#0e71eb]" />
                    <button type="submit" className="px-3 py-2 bg-[#0e71eb] hover:bg-[#1a85ff] text-white text-xs font-semibold rounded-md transition-colors">Send</button>
                  </form>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Control Bar */}
      <footer className="h-20 bg-[#222222] border-t border-[#333333] flex items-center justify-between px-4 fixed bottom-0 w-full z-20">
        <div className="flex items-center gap-1">
          <ControlBtn
            icon={isMuted ? <MicOff size={22} className="text-red-500" /> : <Mic size={22} />}
            label={isMuted ? 'Unmute' : 'Mute'}
            onClick={toggleMic}
            hasCaret
          />
          <ControlBtn
            icon={isVideoOff ? <VideoOff size={22} className="text-red-500" /> : <Video size={22} />}
            label={isVideoOff ? 'Start Video' : 'Stop Video'}
            onClick={toggleVideo}
            hasCaret
          />
        </div>

        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          <ControlBtn icon={<ShieldCheck size={22} />} label="Security" />
          <ControlBtn
            icon={<Users size={22} />}
            label="Participants"
            badge={participants.length > 0 ? participants.length.toString() : undefined}
            onClick={toggleParticipants}
            active={isParticipantsOpen}
          />
          {isHost && waitingParticipants.length > 0 && (
            <div className="relative">
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full text-[9px] font-bold text-black flex items-center justify-center z-10 animate-pulse">
                {waitingParticipants.length}
              </span>
              <ControlBtn
                icon={<UserCheck size={22} className="text-yellow-400" />}
                label="Waiting"
                onClick={toggleParticipants}
              />
            </div>
          )}
          <ControlBtn
            icon={<MessageSquare size={22} />}
            label="Chat"
            onClick={toggleChat}
            active={isChatOpen}
          />
          <ControlBtn
            icon={<Link size={22} className={copied ? 'text-green-400' : undefined} />}
            label={copied ? 'Copied!' : 'Invite'}
            onClick={handleCopyLink}
          />
          <ControlBtn icon={<CircleDot size={22} />} label="Record" />
          <ControlBtn
            icon={<Smile size={22} className={isReactionsOpen ? 'text-[#0e71eb]' : undefined} />}
            label="Reactions"
            onClick={() => { setIsReactionsOpen(p => !p); setIsMoreOpen(false); }}
            active={isReactionsOpen}
          />
          <ControlBtn
            icon={<MoreHorizontal size={22} className={isMoreOpen ? 'text-[#0e71eb]' : undefined} />}
            label="More"
            onClick={() => { setIsMoreOpen(p => !p); setIsReactionsOpen(false); }}
            active={isMoreOpen}
          />
        </div>

        <div className="flex items-center">
          <button
            onClick={() => { doCleanup(); router.push('/'); }}
            className="px-4 py-2 bg-[#e02828] hover:bg-[#c42222] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Leave
          </button>
        </div>
      </footer>
    </div>
  );
}
