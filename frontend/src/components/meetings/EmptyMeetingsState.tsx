/**
 * @file components/meetings/EmptyMeetingsState.tsx
 * @description Displayed when there are no meetings in the selected tab.
 *
 * Shows a Zoom-style umbrella SVG illustration with a contextual message.
 * The "Schedule a meeting" link is shown only on the Upcoming tab.
 */

import React from 'react';

interface EmptyMeetingsStateProps {
  /** Which tab is active — affects the message text */
  activeTab: 'upcoming' | 'past';
  /**
   * Whether there are actionable meetings shown above the empty list.
   * If true on the upcoming tab, the message reads "No other meetings scheduled."
   */
  hasActionable: boolean;
  /** Called when the user clicks "Schedule a meeting" */
  onSchedule: () => void;
}

/**
 * Empty state illustration for the meetings list.
 *
 * Renders an umbrella SVG (matching Zoom's design language) and
 * appropriate text based on which tab is empty.
 */
export function EmptyMeetingsState({ activeTab, hasActionable, onSchedule }: EmptyMeetingsStateProps) {
  // Determine the contextual message
  const message = activeTab === 'upcoming'
    ? hasActionable ? 'No other meetings scheduled.' : 'No meetings scheduled.'
    : 'No previous meetings.';

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      {/* Umbrella illustration — a subtle visual cue matching Zoom's style */}
      <div className="relative w-24 h-20 mb-2">
        <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Shadow ellipse */}
          <ellipse cx="60" cy="90" rx="30" ry="4" fill="#E8E8E8" />
          {/* Canopy */}
          <path d="M60 20 C35 20 15 38 15 60 L60 60 L105 60 C105 38 85 20 60 20Z" fill="#DDDFF5" />
          {/* Canopy scalloped edge */}
          <path d="M15 60 C15 60 22 55 30 60 C38 65 45 55 53 60 C61 65 68 55 75 60" stroke="#9B9EC8" strokeWidth="1.5" fill="none" />
          {/* Handle stem */}
          <line x1="60" y1="60" x2="60" y2="88" stroke="#9B9EC8" strokeWidth="2" />
          {/* Handle curve */}
          <path d="M60 88 C60 88 65 93 70 88" stroke="#9B9EC8" strokeWidth="2" fill="none" />
        </svg>
      </div>

      <p className="text-[13px] text-[#666]">{message}</p>

      {/* "Schedule a meeting" CTA — only shown on the Upcoming tab */}
      {activeTab === 'upcoming' && (
        <button
          onClick={onSchedule}
          className="flex items-center gap-1 text-[13px] text-[#0b5cff] font-medium hover:underline"
        >
          + Schedule a meeting
        </button>
      )}
    </div>
  );
}
