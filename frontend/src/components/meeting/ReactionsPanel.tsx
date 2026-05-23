"use client";

import React from 'react';
import { MoreHorizontal } from 'lucide-react';

/** Zoom quick emojis preset */
const QUICK_EMOJIS = [
  { emoji: '👋', label: 'Wave' },
  { emoji: '👍', label: 'Thumbs Up' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '🎉', label: 'Celebrate' },
];

interface ReactionsPanelProps {
  /** Callback fired when an emoji is clicked */
  onReact: (emoji: string) => void;
  /** Callback to close the popover */
  onClose: () => void;
  /** Callback fired when Raise Hand is clicked */
  onRaiseHand: () => void;
  /** Whether the local participant currently has their hand raised */
  isHandRaised: boolean;
}

/**
 * ReactionsPanel Component
 * 
 * Renders the Zoom-style popup panel containing floating emoji shortcuts,
 * Raise/Lower Hand triggers, and auxiliary meeting status flags.
 * Includes slide animations and drop shadow stylings.
 */
export default function ReactionsPanel({
  onReact,
  onClose,
  onRaiseHand,
  isHandRaised
}: ReactionsPanelProps) {
  return (
    <div
      className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 duration-150 select-none"
      style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
    >
      <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl overflow-hidden" style={{ minWidth: 260 }}>
        
        {/* Quick Emoji selection row */}
        <div className="flex items-center gap-1 px-3 py-2.5">
          {QUICK_EMOJIS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(emoji);
                onClose();
              }}
              title={label}
              className="text-[26px] hover:scale-125 transition-transform cursor-pointer p-1 rounded-lg hover:bg-white/10 flex items-center justify-center"
            >
              {emoji}
            </button>
          ))}
          
          <button className="ml-auto text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer">
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#3a3a3a]" />

        {/* Raise / Lower Hand action button */}
        <button
          onClick={() => {
            onRaiseHand();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/8 transition-colors text-white text-sm font-medium cursor-pointer"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="text-xl">✋</span>
          <span>{isHandRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        {/* Be Right Back (BRB) status indicator trigger */}
        <button
          onClick={onClose}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/8 transition-colors text-white text-sm font-medium cursor-pointer"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="text-xl">🏃</span>
          <span>Be right back</span>
        </button>
      </div>
    </div>
  );
}
