/**
 * @file components/UpcomingMeetings.tsx
 * @description Meeting list component — renders upcoming and past meetings.
 *
 * This component is intentionally kept as a pure presentation component.
 * It delegates all data fetching and classification logic to `useMeetings()`,
 * and delegates sub-rendering to focused child components.
 *
 * ─── Data flow ────────────────────────────────────────────────────────────
 *
 *  useMeetings()
 *    └── Returns: actionableMeetings, futureMeetings, pastMeetings, loading
 *
 *  UpcomingMeetings (this file)
 *    ├── <ActionableMeetingBanner />  — orange "Start Now" cards at the top
 *    ├── <MeetingListItem />          — regular meeting rows
 *    └── <EmptyMeetingsState />       — umbrella illustration when list is empty
 *
 * ─── Sub-components ───────────────────────────────────────────────────────
 *  components/meetings/ActionableMeetingBanner.tsx
 *  components/meetings/MeetingListItem.tsx
 *  components/meetings/EmptyMeetingsState.tsx
 *
 * ─── Hook ─────────────────────────────────────────────────────────────────
 *  hooks/useMeetings.ts
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Data hook ────────────────────────────────────────────────────────────────
import { useMeetings } from '@/hooks/useMeetings';

// ── Sub-components ───────────────────────────────────────────────────────────
import { ActionableMeetingBanner } from '@/components/meetings/ActionableMeetingBanner';
import { MeetingListItem } from '@/components/meetings/MeetingListItem';
import { EmptyMeetingsState } from '@/components/meetings/EmptyMeetingsState';
import { BouncingDots } from '@/components/ui/LoadingSpinner';

// ===========================================================================
// COMPONENT
// ===========================================================================

export default function UpcomingMeetings() {
  // Active tab controls which list is displayed
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const router = useRouter();

  // All data and classification logic lives in the custom hook
  const {
    actionableMeetings,
    futureMeetings,
    pastMeetings,
    loading,
    now,
    isOverdue,
  } = useMeetings();

  // The list shown in the regular (non-banner) section of the active tab
  const currentList = activeTab === 'upcoming' ? futureMeetings : pastMeetings;

  /** Navigate the host into the meeting room as the host. */
  const handleStart = (meetingCode: string) => {
    router.push(`/meeting/${meetingCode}?name=Host&host=true`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Tab bar: Upcoming | Previous ────────────────────────────────────── */}
      <div className="flex border-b border-[#e5e5e5] px-5 bg-white">
        {(['upcoming', 'past'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2.5 mr-4 text-[13px] font-medium border-b-2 transition-all capitalize ${
              activeTab === tab
                ? 'border-[#0b5cff] text-[#0b5cff]'
                : 'border-transparent text-[#666] hover:text-[#333]'
            }`}
          >
            {tab === 'upcoming' ? 'Upcoming' : 'Previous'}
          </button>
        ))}
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          // Loading indicator while meetings are being fetched
          <BouncingDots />
        ) : (
          <>
            {/* ── Actionable meetings banner (Upcoming tab only) ─────────────
                Shows at the TOP of the list, above regular future meetings.
                These are meetings that have started or are starting soon.
                The host cannot miss them — they sit above the fold.
            ──────────────────────────────────────────────────────────────── */}
            {activeTab === 'upcoming' && (
              <ActionableMeetingBanner
                meetings={actionableMeetings}
                now={now}
                isOverdue={isOverdue}
                onStart={handleStart}
              />
            )}

            {/* ── Regular meeting list OR empty state ───────────────────────── */}
            {currentList.length === 0 ? (
              <EmptyMeetingsState
                activeTab={activeTab}
                hasActionable={actionableMeetings.length > 0}
                onSchedule={() => {}} // Parent (page.tsx) controls the schedule modal
              />
            ) : (
              <div>
                {currentList.map(meeting => (
                  <MeetingListItem
                    key={meeting.id}
                    meeting={meeting}
                    isUpcomingTab={activeTab === 'upcoming'}
                    onStart={handleStart}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
