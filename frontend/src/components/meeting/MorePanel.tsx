"use client";

import React from 'react';
import {
  LayoutGrid, Maximize2, Volume2, Video, Settings, MicOff, LogOut, X
} from 'lucide-react';

interface MorePanelProps {
  /** Callback fired to close the options tray */
  onClose: () => void;
  /** Whether the local user is the meeting host (unlocked host controls) */
  isHost: boolean;
  /** Action handler to mute all meeting participants */
  onMuteAll: () => void;
  /** Action handler to terminate the meeting room for all participants */
  onEndMeeting: () => void;
}

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  labelClass?: string;
}

/** Helper component rendering a single row entry inside the options popover */
function MenuRow({ icon, label, hint, onClick, labelClass }: MenuRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 hover:bg-white/8 flex items-center gap-3 transition-colors group cursor-pointer"
      style={{ background: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className={`text-sm ${labelClass || 'text-gray-200'}`}>{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
      </div>
    </button>
  );
}

/**
 * MorePanel Component
 * 
 * Renders the options menu located above the control bar.
 * Hosts see additional features like "Mute All" and "End Meeting for All".
 * Includes utility links to toggle fullscreen, trigger device preferences, and switch views.
 */
export default function MorePanel({
  onClose,
  isHost,
  onMuteAll,
  onEndMeeting
}: MorePanelProps) {
  return (
    <div
      className="fixed bottom-[88px] right-4 z-50 bg-[#1e1e1e] border border-[#444] rounded-2xl shadow-2xl overflow-hidden w-68 animate-in slide-in-from-bottom-2 duration-150 select-none"
    >
      {/* Header section with dismiss button */}
      <div className="flex items-center justify-between p-3 border-b border-[#333]">
        <span className="text-white text-sm font-semibold">More options</span>
        
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Menu Options List */}
      <div className="py-1.5">
        <MenuRow
          icon={<LayoutGrid size={15} className="text-gray-400" />}
          label="Switch to Gallery View"
          hint="Toggle layout"
        />
        
        <MenuRow
          icon={<Maximize2 size={15} className="text-gray-400" />}
          label="Enter Full Screen"
          onClick={() => {
            document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        />
        
        <MenuRow
          icon={<Volume2 size={15} className="text-gray-400" />}
          label="Audio Settings"
          hint="Manage devices"
        />
        
        <MenuRow
          icon={<Video size={15} className="text-gray-400" />}
          label="Video Settings"
          hint="Manage camera"
        />
        
        <MenuRow
          icon={<Settings size={15} className="text-gray-400" />}
          label="Preferences"
          hint="Advanced settings"
        />

        {/* Host controls section */}
        {isHost && (
          <>
            <div className="border-t border-[#333] my-1.5 mx-3" />
            
            <MenuRow
              icon={<MicOff size={15} className="text-orange-400" />}
              label="Mute All Participants"
              labelClass="text-orange-300"
              onClick={() => {
                onMuteAll();
                onClose();
              }}
            />
            
            <MenuRow
              icon={<LogOut size={15} className="text-red-400" />}
              label="End Meeting for All"
              labelClass="text-red-400"
              onClick={() => {
                if (confirm('End the meeting for all participants?')) {
                  onEndMeeting();
                  onClose();
                }
              }}
            />
          </>
        )}

        <div className="border-t border-[#333] my-1.5 mx-3" />
        <div className="px-4 py-2 text-[10px] text-gray-600 font-medium">
          Zoom Clone · Next.js + FastAPI + ZegoCloud
        </div>
      </div>
    </div>
  );
}
