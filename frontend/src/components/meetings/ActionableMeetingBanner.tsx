/**
 * @file components/meetings/ActionableMeetingBanner.tsx
 * @description Highlighted banner cards for meetings that need immediate host action.
 *
 * Shown at the top of the Upcoming tab (above the regular list) for meetings that:
 *  - Are overdue (past their start time but within the 30-minute grace period)
 *  - Are starting within the next 5 minutes ("Starting soon")
 *
 * These cards mirror Zoom's orange/amber highlight behaviour to grab the host's
 * attention so they don't miss the start of their meeting.
 *
 * Visual treatment:
 *  - Overdue  → orange accent (#ff6b35) — more urgent
 *  - Starting soon → amber accent (#f59e0b) — less urgent
 */

import React from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { Video, Clock, AlertCircle } from 'lucide-react';
import { Meeting } from '@/types/meeting';

// ===========================================================================
// HELPERS
// ===========================================================================

/** Parses a UTC date string into a local Date object. */
function parseStartTime(dateString: string): Date {
  return new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
}

function formatMeetingDate(dateString: string): string {
  if (!dateString) return '';
  const date = parseStartTime(dateString);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

function formatMeetingTime(dateString: string): string {
  if (!dateString) return '';
  return format(parseStartTime(dateString), 'h:mm a');
}

/**
 * Formats how long ago a meeting was supposed to start.
 * e.g. "Started 5 min ago", "Started 1 hr ago"
 * Returns null if the meeting hasn't started yet.
 */
function getOverdueLabel(dateString: string, now: Date): string | null {
  const start = parseStartTime(dateString);
  const diffMs = now.getTime() - start.getTime();
  if (diffMs <= 0) return null; // hasn't started yet
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `Started ${diffMin} min ago`;
  return `Started ${Math.floor(diffMin / 60)} hr ago`;
}

// ===========================================================================
// COMPONENT
// ===========================================================================

interface ActionableMeetingBannerProps {
  /** Meetings that need immediate attention */
  meetings: Meeting[];
  /** Current time — used to compute how overdue a meeting is */
  now: Date;
  /** Whether a given meeting is past its start time (within grace period) */
  isOverdue: (meeting: Meeting) => boolean;
  /** Called when the host clicks "Start" */
  onStart: (meetingCode: string) => void;
}

/**
 * Renders a highlighted list of meetings that need the host's immediate action.
 * Each card shows the meeting title, timing info, overdue status, and a Start button.
 */
export function ActionableMeetingBanner({
  meetings,
  now,
  isOverdue,
  onStart,
}: ActionableMeetingBannerProps) {
  if (meetings.length === 0) return null;

  return (
    // Amber tinted background to visually separate from the regular list
    <div className="border-b border-[#f0d0a0] bg-[#fffbf0]">
      {meetings.map(meeting => {
        const overdue = isOverdue(meeting);
        const overdueLabel = overdue ? getOverdueLabel(meeting.start_time, now) : null;

        // Colour palette: orange for overdue, amber for starting soon
        const accentColor = overdue ? '#ff6b35' : '#f59e0b';
        const btnClasses = overdue
          ? 'bg-[#ff6b35] hover:bg-[#e5592a]'
          : 'bg-[#0b5cff] hover:bg-[#094dd6]';

        return (
          <div
            key={meeting.id}
            className="px-5 py-3.5 border-b border-[#fde8b0] last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">

                {/* ── Status icon circle ── */}
                <div
                  className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${accentColor}26` }} // 15% opacity version of accent
                >
                  {overdue
                    ? <AlertCircle size={14} style={{ color: accentColor }} />
                    : <Clock       size={14} style={{ color: accentColor }} />
                  }
                </div>

                {/* ── Meeting details ── */}
                <div>
                  {/* Attention label — e.g. "Started 5 min ago" or "Starting in a few minutes" */}
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wide mb-0.5"
                    style={{ color: accentColor }}
                  >
                    {overdue
                      ? overdueLabel ?? 'Ready to start'
                      : 'Starting in a few minutes'
                    }
                  </div>
                  <div className="text-[13px] font-semibold text-[#222] leading-tight">
                    {meeting.title}
                  </div>
                  <div className="text-[11px] text-[#888] mt-0.5 flex items-center gap-2">
                    <span>
                      {formatMeetingDate(meeting.start_time)} · {formatMeetingTime(meeting.start_time)}
                    </span>
                    <span className="text-[#bbb]">·</span>
                    <span>ID: {meeting.meeting_code}</span>
                  </div>
                </div>
              </div>

              {/* ── Start button — always visible (not hover-gated) ── */}
              <button
                onClick={() => onStart(meeting.meeting_code)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 text-white text-[12px] font-semibold rounded-full transition-all shadow-sm ${btnClasses}`}
              >
                <Video size={12} />
                Start
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
