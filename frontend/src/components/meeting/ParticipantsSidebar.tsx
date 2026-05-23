"use client";

import React from 'react';
import { LayoutGrid, X, Mic, MicOff, Video, VideoOff } from 'lucide-react';

interface ParticipantsSidebarProps {
  /** Visibility toggle of this sidebar */
  isOpen: boolean;
  /** Callback fired to close/collapse this sidebar panel */
  onClose: () => void;
  /** List of participants successfully admitted to the meeting */
  admittedParticipants: any[];
  /** List of participants currently waiting in the lobby/waiting room */
  waitingParticipants: any[];
  /** Whether the local user is the host */
  isHost: boolean;
  /** Unique ID representing the local participant */
  localParticipantId: string;
  /** Whether the local user has their hand raised */
  isHandRaised: boolean;
  /** Set containing IDs of participants currently speaking */
  speakingIds: Set<string>;
  /** Host callback to admit a single participant from waiting room */
  onAdmit: (id: string) => void;
  /** Host callback to admit all waiting participants instantly */
  onAdmitAll: () => void;
  /** Host callback to remote-mute a participant's audio */
  onMuteParticipant: (id: string) => void;
  /** Host callback to mute all participants simultaneously */
  onMuteAll: () => void;
  /** Callback to copy invite link to clipboard */
  onCopyLink: () => void;
  /** Temporary state reflecting if the invite link was successfully copied */
  copied: boolean;
}

/**
 * ParticipantsSidebar Component
 * 
 * Implements the Zoom right-aligned panel for participant listing.
 * Displays:
 * - A waiting list section (visible to host only) allowing individual or bulk admissions.
 * - An admitted participants list with microphone/camera hardware status indicators, speaking alerts, and hand raising markers.
 * - Quick invite copying and mute controls at the bottom tray.
 */
export default function ParticipantsSidebar({
  isOpen,
  onClose,
  admittedParticipants,
  waitingParticipants,
  isHost,
  localParticipantId,
  isHandRaised,
  speakingIds,
  onAdmit,
  onAdmitAll,
  onMuteParticipant,
  onMuteAll,
  onCopyLink,
  copied
}: ParticipantsSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white select-none">
      
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <h2 className="font-semibold text-[15px] text-gray-900">
          Participants ({admittedParticipants.length})
        </h2>
        
        <div className="flex items-center gap-2">
          <button className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <LayoutGrid size={16} />
          </button>
          
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Lobby / Waiting section - visible to Host only if users are in waiting status */}
      {isHost && waitingParticipants.length > 0 && (
        <div className="border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Waiting ({waitingParticipants.length})
            </span>
            
            <button
              onClick={onAdmitAll}
              className="text-xs text-[#0e71eb] font-bold hover:underline cursor-pointer"
            >
              Admit All
            </button>
          </div>
          
          <div className="max-h-[160px] overflow-y-auto">
            {waitingParticipants.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-100">
                <div className="flex items-center gap-2.5">
                  {/* Initials Avatar badge */}
                  <div className="w-8 h-8 rounded-full bg-[#0e71eb] flex items-center justify-center font-bold text-white text-sm select-none">
                    {(p.name || 'G').charAt(0).toUpperCase()}
                  </div>
                  
                  <span className="text-sm font-semibold text-gray-800">{p.name || 'Guest'}</span>
                </div>
                
                <button
                  onClick={() => onAdmit(p.id)}
                  className="text-xs bg-[#0e71eb] hover:bg-[#094dd6] text-white font-bold px-3 py-1 rounded-full transition-colors cursor-pointer"
                >
                  Admit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admitted participants list panel */}
      <div className="flex-1 overflow-y-auto">
        {admittedParticipants.map(p => {
          const isLocal = p.id === localParticipantId;
          const pHandRaised = isLocal ? isHandRaised : p.hand_raised;
          const isSpeaking = speakingIds.has(p.id);
          
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Avatar with speaking detection highlight ring */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm select-none shrink-0 ${
                    isSpeaking ? 'bg-[#0e71eb] ring-2 ring-[#0e71eb]/30' : 'bg-[#1a7f3c]'
                  }`}
                >
                  {(p.name || 'G').charAt(0).toUpperCase()}
                </div>
                
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate block">
                    {p.name || 'Guest'}
                    {p.is_host && (
                      <span className="ml-1 text-[#0e71eb] text-[11px] font-semibold">
                        (Host{isLocal ? ', me' : ''})
                      </span>
                    )}
                    {!p.is_host && isLocal && (
                      <span className="ml-1 text-gray-400 text-[11px] font-semibold">(me)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Hardware status icons & actions */}
              <div className="flex items-center gap-2 shrink-0 select-none">
                {pHandRaised && <span className="text-base">✋</span>}
                
                {/* Host Control: allow host to mute other unmuted users on hover */}
                {isHost && !isLocal && p.audio && (
                  <button
                    onClick={() => onMuteParticipant(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-[11px] text-[#0e71eb] hover:text-[#094dd6] font-bold transition-all mr-1 cursor-pointer"
                  >
                    Mute
                  </button>
                )}
                
                {p.audio ? (
                  <Mic size={14} className={isSpeaking ? 'text-[#0e71eb]' : 'text-gray-400'} />
                ) : (
                  <MicOff size={14} className="text-[#e03030]" />
                )}
                
                {p.video ? (
                  <Video size={14} className="text-gray-400" />
                ) : (
                  <VideoOff size={14} className="text-[#e03030]" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom control shortcuts tray */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[#e5e5e5] bg-white">
        <button
          onClick={onCopyLink}
          className="flex-1 py-1.5 border border-[#ccc] rounded text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-center"
        >
          {copied ? 'Copied!' : 'Invite'}
        </button>
        
        {isHost && (
          <button
            onClick={onMuteAll}
            className="flex-1 py-1.5 border border-[#ccc] rounded text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-center"
          >
            Mute All
          </button>
        )}
        
        <button
          className="flex-1 py-1.5 border border-[#ccc] rounded text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-center"
        >
          More
        </button>
      </div>
    </div>
  );
}
