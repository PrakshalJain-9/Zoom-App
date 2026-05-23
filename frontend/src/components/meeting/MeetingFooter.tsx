"use client";

import React from 'react';
import {
  Mic, MicOff, Video, VideoOff, Users, UserCheck,
  MessageSquare, Smile, Share2, MoreHorizontal, X
} from 'lucide-react';

interface MeetingFooterProps {
  isMuted: boolean;
  isVideoOff: boolean;
  admittedCount: number;
  waitingCount: number;
  isParticipantsOpen: boolean;
  isChatOpen: boolean;
  isReactionsOpen: boolean;
  isMoreOpen: boolean;
  isHost: boolean;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onToggleReactions: () => void;
  onToggleMore: () => void;
  onLeaveOrEnd: () => void;
}

// ─── Single control button (icon + label) ─────────────────────────────────────
function Btn({
  icon, label, onClick, active = false, danger = false, badge
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 px-2 sm:px-3 py-1.5 rounded-lg transition-colors min-w-[44px]
        ${danger ? 'text-[#e03030]' : active ? 'bg-[#2e2e2e] text-white' : 'text-white hover:bg-[#2a2a2a]'}`}
    >
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 bg-[#0b5cff] text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
          {badge}
        </span>
      )}
      {icon}
      <span className="text-[9px] sm:text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * MeetingFooter Component
 *
 * Mobile: single scrollable row of all controls (no absolute centering — that breaks on narrow screens).
 * Desktop: 3-cluster layout (left mic/cam | centre controls | right leave).
 */
export default function MeetingFooter({
  isMuted, isVideoOff, admittedCount, waitingCount,
  isParticipantsOpen, isChatOpen, isReactionsOpen, isMoreOpen, isHost,
  onToggleMic, onToggleVideo, onToggleParticipants, onToggleChat,
  onToggleReactions, onToggleMore, onLeaveOrEnd
}: MeetingFooterProps) {

  return (
    <footer
      className="flex-shrink-0 bg-[#1c1c1c] border-t border-[#2e2e2e] select-none z-20"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* ── Mobile layout: all buttons in one scrollable row ── */}
      <div className="flex sm:hidden items-center justify-between px-1 py-1 overflow-x-auto gap-0.5 min-h-[60px]">
        {/* Mic */}
        <Btn
          icon={isMuted ? <MicOff size={18} className="text-[#e03030]" /> : <Mic size={18} />}
          label={isMuted ? 'Unmute' : 'Mute'}
          onClick={onToggleMic}
        />
        {/* Video */}
        <Btn
          icon={isVideoOff ? <VideoOff size={18} className="text-[#e03030]" /> : <Video size={18} />}
          label={isVideoOff ? 'Start Video' : 'Stop Video'}
          onClick={onToggleVideo}
        />
        {/* Participants */}
        <Btn
          icon={<Users size={18} />}
          label="Participants"
          onClick={onToggleParticipants}
          active={isParticipantsOpen}
          badge={admittedCount > 0 ? admittedCount.toString() : undefined}
        />
        {/* Waiting (host only) */}
        {isHost && waitingCount > 0 && (
          <Btn
            icon={<UserCheck size={18} className="text-yellow-400" />}
            label="Waiting"
            onClick={onToggleParticipants}
            badge={waitingCount.toString()}
          />
        )}
        {/* React */}
        <Btn
          icon={<Smile size={18} className={isReactionsOpen ? 'text-[#4a9eff]' : ''} />}
          label="React"
          onClick={onToggleReactions}
          active={isReactionsOpen}
        />
        {/* Share */}
        <Btn
          icon={<div className="w-[18px] h-[18px] bg-[#00c853] rounded flex items-center justify-center"><Share2 size={10} className="text-white" /></div>}
          label="Share"
          onClick={() => {}}
        />
        {/* More */}
        <Btn
          icon={<MoreHorizontal size={18} />}
          label="More"
          onClick={onToggleMore}
          active={isMoreOpen}
        />
        {/* Leave/End */}
        <button
          onClick={onLeaveOrEnd}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[44px]"
        >
          <div className="w-8 h-8 rounded-full bg-[#e03030] flex items-center justify-center">
            <X size={15} className="text-white" />
          </div>
          <span className="text-[9px] text-[#e03030] font-semibold">
            {isHost ? 'End' : 'Leave'}
          </span>
        </button>
      </div>

      {/* ── Desktop layout: 3 clusters ── */}
      <div className="hidden sm:flex items-center justify-between px-3 min-h-[64px]">
        {/* Left: Mic + Video */}
        <div className="flex items-center gap-0.5">
          <Btn
            icon={isMuted ? <MicOff size={20} className="text-[#e03030]" /> : <Mic size={20} />}
            label={isMuted ? 'Unmute' : 'Mute'}
            onClick={onToggleMic}
          />
          <Btn
            icon={isVideoOff ? <VideoOff size={20} className="text-[#e03030]" /> : <Video size={20} />}
            label={isVideoOff ? 'Start Video' : 'Stop Video'}
            onClick={onToggleVideo}
          />
        </div>

        {/* Centre: main controls */}
        <div className="flex items-center gap-0.5">
          <Btn
            icon={<Users size={20} />}
            label="Participants"
            onClick={onToggleParticipants}
            active={isParticipantsOpen}
            badge={admittedCount > 0 ? admittedCount.toString() : undefined}
          />
          {isHost && waitingCount > 0 && (
            <Btn
              icon={<UserCheck size={20} className="text-yellow-400" />}
              label="Waiting"
              onClick={onToggleParticipants}
              badge={waitingCount.toString()}
            />
          )}
          <Btn
            icon={<MessageSquare size={20} />}
            label="Chat"
            onClick={onToggleChat}
            active={isChatOpen}
          />
          <Btn
            icon={<Smile size={20} className={isReactionsOpen ? 'text-[#4a9eff]' : ''} />}
            label="React"
            onClick={onToggleReactions}
            active={isReactionsOpen}
          />
          <Btn
            icon={<div className="w-5 h-5 bg-[#00c853] rounded flex items-center justify-center"><Share2 size={12} className="text-white" /></div>}
            label="Share"
            onClick={() => {}}
          />
          <Btn
            icon={<MoreHorizontal size={20} />}
            label="More"
            onClick={onToggleMore}
            active={isMoreOpen}
          />
        </div>

        {/* Right: Leave/End */}
        <button
          onClick={onLeaveOrEnd}
          className="flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-[#e03030] flex items-center justify-center group-hover:bg-[#c42222] transition-colors shadow">
            <X size={16} className="text-white" />
          </div>
          <span className="text-[11px] text-[#e03030] font-semibold">
            {isHost ? 'End' : 'Leave'}
          </span>
        </button>
      </div>
    </footer>
  );
}
