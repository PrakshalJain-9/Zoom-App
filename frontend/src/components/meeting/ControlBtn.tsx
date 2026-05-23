"use client";

import React from 'react';
import { ChevronUp } from 'lucide-react';

interface ControlBtnProps {
  /** The icon component to display (e.g. Mic, Video, Users) */
  icon: React.ReactNode;
  /** Button label text shown under the icon */
  label: string;
  /** Click action handler */
  onClick?: () => void;
  /** Whether to show a Zoom-style '^' caret dropdown button on the right */
  hasCaret?: boolean;
  /** Numerical badge count text (e.g. participant count or unread messages) */
  badge?: string;
  /** Active toggle state (adds dark background highlighting) */
  active?: boolean;
  /** High priority danger styling (e.g. Leave/End) */
  danger?: boolean;
}

/**
 * ControlBtn Component
 * 
 * Reusable control bar button tailored to match Zoom's interface.
 * Suppports inline action triggers, side carets for peripheral settings,
 * badge bubbles for metrics, and state-based styling overrides.
 */
export default function ControlBtn({
  icon,
  label,
  onClick,
  hasCaret,
  badge,
  active,
  danger
}: ControlBtnProps) {
  return (
    <div className="flex items-stretch select-none">
      <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center px-3 py-2 min-w-[52px] gap-1 rounded-lg transition-all duration-100 group ${
          danger ? 'hover:bg-[#e03030]/10'
          : active ? 'bg-white/10'
          : 'hover:bg-white/8'
        }`}
        onMouseEnter={e => {
          if (!danger && !active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <div className="relative">
          {icon}
          {/* Badge indicator shown as small bubble in top-right of icon */}
          {badge && (
            <span className="absolute -top-1.5 -right-2 bg-[#0e71eb] text-white text-[9px] font-bold px-1 py-px rounded-full min-w-[14px] flex items-center justify-center">
              {badge}
            </span>
          )}
        </div>
        
        <span className={`text-[11px] font-normal leading-none whitespace-nowrap ${
          danger ? 'text-[#e03030]'
          : active ? 'text-white'
          : 'text-[#d1d1d1] group-hover:text-white'
        }`}>
          {label}
        </span>
      </button>

      {/* Optional dropdown arrow for auxiliary options (e.g. device selections) */}
      {hasCaret && (
        <button
          className="flex items-center justify-center w-4 hover:bg-white/8 rounded-r transition-all cursor-pointer"
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <ChevronUp size={10} className="text-[#aaa]" />
        </button>
      )}
    </div>
  );
}
