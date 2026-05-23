"use client";

import React from 'react';
import {
  Mic, MicOff, Video, VideoOff, Users, UserCheck,
  MessageSquare, Smile, Share2, Shield, MoreHorizontal, X
} from 'lucide-react';
import ControlBtn from './ControlBtn';

interface MeetingFooterProps {
  /** Flag representing if local microphone is currently muted */
  isMuted: boolean;
  /** Flag representing if local camera feed is currently stopped */
  isVideoOff: boolean;
  /** Total number of admitted participants */
  admittedCount: number;
  /** Total number of participants currently waiting in the lobby */
  waitingCount: number;
  /** Whether the participants sidebar is open */
  isParticipantsOpen: boolean;
  /** Whether the chat sidebar is open */
  isChatOpen: boolean;
  /** Whether the reactions popup is visible */
  isReactionsOpen: boolean;
  /** Whether the more settings panel is visible */
  isMoreOpen: boolean;
  /** Whether the local user is the host of this meeting room */
  isHost: boolean;
  /** Triggered when the user toggles microphone mute state */
  onToggleMic: () => void;
  /** Triggered when the user toggles camera active state */
  onToggleVideo: () => void;
  /** Triggered when the user toggles participants list sidebar */
  onToggleParticipants: () => void;
  /** Triggered when the user toggles meeting room chat sidebar */
  onToggleChat: () => void;
  /** Triggered when the user clicks reactions popover toggle */
  onToggleReactions: () => void;
  /** Triggered when the user clicks more options popover toggle */
  onToggleMore: () => void;
  /** Triggered when the user clicks Leave/End button */
  onLeaveOrEnd: () => void;
}

/**
 * MeetingFooter Component
 * 
 * Organizes control bar buttons into a layout matching Zoom.
 * - Left cluster: Audio & Video controls (with caret modifiers).
 * - Center cluster: Control options (Participants list, Chat panel, Reaction triggers, Screen Share, Host tools).
 * - Right cluster: Leave / End button.
 */
export default function MeetingFooter({
  isMuted,
  isVideoOff,
  admittedCount,
  waitingCount,
  isParticipantsOpen,
  isChatOpen,
  isReactionsOpen,
  isMoreOpen,
  isHost,
  onToggleMic,
  onToggleVideo,
  onToggleParticipants,
  onToggleChat,
  onToggleReactions,
  onToggleMore,
  onLeaveOrEnd
}: MeetingFooterProps) {
  return (
    <footer className="h-[64px] flex-shrink-0 bg-[#1c1c1c] flex items-center justify-between px-3 z-20 border-t border-[#2e2e2e] relative select-none">
      
      {/* Left cluster: Mic & Cam controllers */}
      <div className="flex items-center gap-0.5 z-10">
        <ControlBtn
          icon={isMuted ? (
            <MicOff size={20} className="text-[#e03030]" />
          ) : (
            <Mic size={20} className="text-white" />
          )}
          label={isMuted ? 'Unmute' : 'Mute'}
          onClick={onToggleMic}
          hasCaret
        />
        
        <ControlBtn
          icon={isVideoOff ? (
            <VideoOff size={20} className="text-[#e03030]" />
          ) : (
            <Video size={20} className="text-white" />
          )}
          label={isVideoOff ? 'Start Video' : 'Stop Video'}
          onClick={onToggleVideo}
          hasCaret
        />
      </div>

      {/* Center cluster: Participants, Chat, Emojis, Share, and Settings */}
      {/* absolute position keeps it centered regardless of sidebar layouts */}
      <div className="flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2 z-10">
        <ControlBtn
          icon={<Users size={20} className="text-white" />}
          label="Participants"
          badge={admittedCount > 0 ? admittedCount.toString() : undefined}
          onClick={onToggleParticipants}
          active={isParticipantsOpen}
        />
        
        {/* Host Alert: shows yellow "Waiting" button if users are in the lobby */}
        {isHost && waitingCount > 0 && (
          <div className="relative">
            <span className="absolute -top-0.5 right-0 w-3.5 h-3.5 bg-yellow-400 rounded-full text-[8px] font-bold text-black flex items-center justify-center z-10 animate-pulse">
              {waitingCount}
            </span>
            <ControlBtn
              icon={<UserCheck size={20} className="text-yellow-400" />}
              label="Waiting"
              onClick={onToggleParticipants}
            />
          </div>
        )}
        
        <ControlBtn
          icon={<MessageSquare size={20} className="text-white" />}
          label="Chat"
          onClick={onToggleChat}
          active={isChatOpen}
        />
        
        <ControlBtn
          icon={<Smile size={20} className={isReactionsOpen ? 'text-[#4a9eff]' : 'text-white'} />}
          label="React"
          onClick={onToggleReactions}
          active={isReactionsOpen}
          hasCaret
        />
        
        <ControlBtn
          icon={
            <div className="w-5 h-5 bg-[#00c853] rounded flex items-center justify-center">
              <Share2 size={12} className="text-white" />
            </div>
          }
          label="Share"
          onClick={() => {}}
          hasCaret
        />
        
        {/* Host Tools quick trigger */}
        {isHost && (
          <ControlBtn
            icon={<Shield size={20} className="text-white" />}
            label="Host tools"
            onClick={onToggleMore}
            hasCaret
          />
        )}
        
        <ControlBtn
          icon={<MoreHorizontal size={20} className="text-white" />}
          label="More"
          onClick={onToggleMore}
          active={isMoreOpen}
        />
      </div>

      {/* Right cluster: End/Leave meeting red button wrapper */}
      <div className="flex items-center z-10">
        <button
          onClick={onLeaveOrEnd}
          className="flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors group cursor-pointer"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,48,48,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div className="w-8 h-8 rounded-full bg-[#e03030] flex items-center justify-center group-hover:bg-[#c42222] transition-colors shadow">
            <X size={16} className="text-white" />
          </div>
          <span className="text-[11px] text-[#e03030] font-semibold tracking-wide">
            {isHost ? 'End' : 'Leave'}
          </span>
        </button>
      </div>
    </footer>
  );
}
