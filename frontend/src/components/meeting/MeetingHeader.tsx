"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Info, ShieldCheck, Clock, Link } from 'lucide-react';

interface MeetingHeaderProps {
  /** The meeting room ID/code */
  meetingCode: string;
  /** Generated clean invite link pointing to the join landing page */
  inviteLink: string;
  /** Whether the current user is host (unlocks Quick Admit options) */
  isHost: boolean;
  /** Number of participants currently waiting in the lobby */
  waitingParticipantsCount: number;
  /** Whether the meeting is running on mock Zego media context */
  isMockMedia: boolean;
  /** Temporary state reflecting if the invite link was successfully copied */
  copied: boolean;
  /** Callback to trigger invite link copying */
  onCopyLink: () => void;
  /** Host callback to admit all waiting participants instantly */
  onAdmitAll: () => void;
}

/**
 * MeetingHeader Component
 * 
 * Renders the top menu bar of the Zoom meeting.
 * Encapsulates the click-outside dropdown menu displaying critical details
 * like Meeting ID, invite URL, and pending participant admission notifications.
 */
export default function MeetingHeader({
  meetingCode,
  inviteLink,
  isHost,
  waitingParticipantsCount,
  isMockMedia,
  copied,
  onCopyLink,
  onAdmitAll
}: MeetingHeaderProps) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  // Close the meeting info popover on clicks outside of its container bounds
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setIsInfoOpen(false);
      }
    };

    if (isInfoOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isInfoOpen]);

  return (
    <header className="h-9 flex-shrink-0 flex items-center justify-between px-3 bg-[#1c1c1c] z-30 select-none border-b border-black/10">
      
      {/* Left section: Meeting ID and info tray toggle */}
      <div className="relative" ref={infoRef}>
        <div
          onClick={() => setIsInfoOpen(prev => !prev)}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
          
          <span className="text-xs text-gray-300 font-semibold tracking-wide">
            {meetingCode}
          </span>
          <Info size={13} className="text-gray-500 hover:text-gray-300 transition-colors" />
        </div>

        {/* Dropdown Information Panel */}
        {isInfoOpen && (
          <div className="absolute top-10 left-0 w-80 bg-[#1e1e1e]/98 backdrop-blur-md border border-[#3a3a3a] rounded-xl shadow-2xl p-5 text-sm z-50 text-gray-200 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="font-semibold text-white text-base mb-3 flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-400" />
              Meeting Information
            </h3>
            
            <div className="space-y-3.5">
              {/* Meeting ID display */}
              <div>
                <div className="text-xs text-gray-400 font-semibold mb-0.5">Meeting ID</div>
                <div className="font-mono text-white font-bold tracking-wider text-sm select-all">
                  {meetingCode}
                </div>
              </div>

              {/* Copy Invite Link control */}
              <div>
                <div className="text-xs text-gray-400 font-semibold mb-1">Invite Link</div>
                <div className="flex items-center gap-2 bg-[#2c2c2c] border border-[#444444] rounded-lg p-2">
                  <span className="text-xs truncate flex-1 text-gray-300 font-mono select-none">
                    {inviteLink}
                  </span>
                  
                  <button
                    onClick={onCopyLink}
                    className="px-2.5 py-1 bg-[#0e71eb] hover:bg-[#1a85ff] text-white text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Host alert box if guests are waiting in the waiting room */}
              {isHost && waitingParticipantsCount > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="text-xs text-yellow-400 font-bold mb-1.5 flex items-center gap-1.5">
                    <Clock size={12} className="animate-pulse" />
                    {waitingParticipantsCount} {waitingParticipantsCount === 1 ? 'person is' : 'people are'} waiting to join
                  </div>
                  
                  <button
                    onClick={() => {
                      onAdmitAll();
                      setIsInfoOpen(false);
                    }}
                    className="w-full text-xs bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/40 text-yellow-300 font-semibold rounded-md px-3 py-1.5 transition-colors cursor-pointer"
                  >
                    Admit All
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Center: Server connection warnings / diagnostics status */}
      <div className="flex items-center gap-2">
        {isMockMedia && (
          <div className="px-2 py-0.5 bg-yellow-600/70 rounded text-[10px] font-bold tracking-wide uppercase select-none">
            ⚠️ Mock Media
          </div>
        )}
      </div>

      {/* Right: Quick Invite copy button */}
      <button
        onClick={onCopyLink}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-semibold transition-colors cursor-pointer"
      >
        <Link size={12} className="text-[#0e71eb]" />
        {copied ? (
          <span className="text-green-400">Copied!</span>
        ) : (
          <span className="text-gray-300 group-hover:text-white">Invite</span>
        )}
      </button>
    </header>
  );
}
