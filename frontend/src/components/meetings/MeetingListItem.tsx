/**
 * @file components/meetings/MeetingListItem.tsx
 * @description A single row in the upcoming or past meetings list.
 *
 * Displays:
 *  - Date label (Today / Tomorrow / Mon, May 26)
 *  - Time label (2:30 PM)
 *  - Meeting title
 *  - Meeting ID
 *  - A "Start" button that appears on hover (upcoming tab only)
 */

import React from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { Video } from 'lucide-react';
import { Meeting } from '@/types/meeting';

// ===========================================================================
// HELPERS
// ===========================================================================

/**
 * Parses a UTC date string from the backend.
 * Appends 'Z' if missing so JavaScript treats it as UTC, not local time.
 */
function parseStartTime(dateString: string): Date {
  return new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
}

/** Returns a human-readable date label: "Today", "Tomorrow", or "Mon, May 26". */
function formatMeetingDate(dateString: string): string {
  if (!dateString) return '';
  const date = parseStartTime(dateString);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

/** Returns a formatted time string, e.g. "2:30 PM". */
function formatMeetingTime(dateString: string): string {
  if (!dateString) return '';
  return format(parseStartTime(dateString), 'h:mm a');
}

// ===========================================================================
// COMPONENT
// ===========================================================================

interface MeetingListItemProps {
  meeting: Meeting;
  /** Whether this item is in the "upcoming" tab (shows Start button on hover) */
  isUpcomingTab: boolean;
  /** Called when the host clicks "Start" */
  onStart: (meetingCode: string) => void;
}

/**
 * A single meeting row with date, time, title, ID, and a hover Start button.
 */
export function MeetingListItem({ meeting, isUpcomingTab, onStart }: MeetingListItemProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f0f0] hover:bg-[#f8f8f8] transition-colors group cursor-pointer">
      <div className="flex items-center gap-3.5">
        {/* ── Time column ── */}
        <div className="w-[72px] flex-shrink-0 text-right">
          <div className="text-[12px] font-semibold text-[#555] uppercase tracking-wider leading-none">
            {formatMeetingDate(meeting.start_time)}
          </div>
          <div className="text-[12px] text-[#888] mt-0.5">
            {formatMeetingTime(meeting.start_time)}
          </div>
        </div>

        {/* ── Vertical divider ── */}
        <div className="w-px h-8 bg-[#e0e0e0] flex-shrink-0" />

        {/* ── Meeting info ── */}
        <div>
          <div className="text-[13px] font-semibold text-[#222] leading-tight">
            {meeting.title}
          </div>
          <div className="text-[11px] text-[#999] mt-0.5">
            ID: {meeting.meeting_code}
          </div>
        </div>
      </div>

      {/* ── Start button (upcoming tab, revealed on row hover) ── */}
      {isUpcomingTab && (
        <button
          onClick={e => {
            // Prevent the row click from propagating if the row has an onClick
            e.stopPropagation();
            onStart(meeting.meeting_code);
          }}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-4 py-1.5 bg-[#0b5cff] hover:bg-[#094dd6] text-white text-[12px] font-semibold rounded-full transition-all"
        >
          <Video size={12} />
          Start
        </button>
      )}
    </div>
  );
}
