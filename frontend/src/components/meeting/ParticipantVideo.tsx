"use client";

import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import VideoTile from './VideoTile';

interface Participant {
  id: string;
  name: string;
  audio: boolean;
  video: boolean;
  hand_raised?: boolean;
  is_host?: boolean;
}

interface ParticipantVideoProps {
  /** The metadata object for this participant */
  participant: Participant;
  /** WebRTC stream assigned to this participant */
  stream: MediaStream | null;
  /** Flag identifying if this tile represents the current user */
  isLocal: boolean;
  /** Flag representing if this participant is speaking (triggers outline styling) */
  isSpeaking?: boolean;
  /** Track sequence key used to trigger VideoTile rebinding */
  streamKey?: number;
}

/**
 * ParticipantVideo Component
 * 
 * Manages the layout for a single participant's tile.
 * Displays the name in full when video is off, showing a mirrored video feed when video is on.
 * Integrates visual markers for host status, mute state, hand raises, and active speaker outlines.
 */
export default function ParticipantVideo({
  participant,
  stream,
  isLocal,
  isSpeaking,
  streamKey
}: ParticipantVideoProps) {
  const isVideoOff = !participant.video;
  const isMuted = !participant.audio;
  const handRaised = participant.hand_raised;

  return (
    <div
      className={`w-full h-full min-h-0 bg-[#1c1c1c] rounded-lg shadow-xl relative overflow-hidden flex items-center justify-center transition-all duration-150 ${
        isSpeaking ? 'outline outline-2 outline-[#0e71eb]' : ''
      }`}
    >
      {/* Zoom-style Centered Text Avatar when video feed is inactive/off */}
      {(isVideoOff || !stream) && (
        <span className="text-white font-bold text-3xl md:text-5xl select-none z-10 text-center px-4">
          {participant.name || 'Guest'}
        </span>
      )}

      {/* Render the underlying Video DOM binder */}
      <VideoTile
        stream={stream}
        isLocal={isLocal}
        isVideoOff={isVideoOff}
        isSpeaking={isSpeaking}
        streamKey={streamKey}
      />

      {/* Persistent Hand Raise indicator overlay (top-left) */}
      {handRaised && (
        <div className="absolute top-2.5 left-2.5 z-40 text-2xl leading-none select-none">
          ✋
        </div>
      )}

      {/* Bottom overlay styling for name tags (gradient shade for text legibility) */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/70 to-transparent z-30 pointer-events-none" />
      
      {/* Name and audio state status strip (bottom-left) */}
      <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 z-40 select-none">
        {isMuted ? (
          <MicOff size={12} className="text-[#e03030] shrink-0" />
        ) : isSpeaking ? (
          <Mic size={12} className="text-[#0e71eb] shrink-0 animate-pulse" />
        ) : null}
        
        <span className="text-white text-[12px] font-medium drop-shadow">
          {isLocal ? `${participant.name || 'Guest'} (you)` : participant.name || 'Guest'}
          {participant.is_host && (
            <span className="ml-1 text-[10px] text-[#0e71eb] font-semibold">(Host)</span>
          )}
        </span>
      </div>
    </div>
  );
}
