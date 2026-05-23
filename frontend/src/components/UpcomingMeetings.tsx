"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { getMeetings, api } from '@/lib/api';
import { format, isToday, isTomorrow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Video, Clock, AlertCircle } from 'lucide-react';

// ===========================================================================
// CONSTANTS
// ===========================================================================
/**
 * Grace period (in milliseconds) during which a past-scheduled meeting
 * remains in the "Upcoming" tab and gets a prominent "Start Now" banner.
 *
 * Zoom keeps meetings actionable for ~24 hours after their scheduled start.
 * We use 30 minutes to closely mirror that attention-drawing behaviour
 * without cluttering the Upcoming list with stale sessions.
 */
const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes

export default function UpcomingMeetings() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  /**
   * `now` is stored in state and refreshed every 60 seconds so that the
   * "Starting Soon" / grace-period classification updates live without a
   * page reload.
   */
  const [now, setNow] = useState(() => new Date());

  const router = useRouter();

  // Refresh the current time every minute so the classification is live
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Auth + Data Loading ────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const userRes = await api.get('/auth/me');
        setCurrentUser(userRes.data);
      } catch (err: any) {
        console.error('Failed to fetch current user', err);
        if (err.response?.status === 401) {
          try {
            const authRes = await api.post('/auth/anonymous-session');
            const newToken = authRes.data.access_token;
            if (typeof window !== 'undefined') {
              localStorage.setItem('token', newToken);
            }
            const retryUserRes = await api.get('/auth/me');
            setCurrentUser(retryUserRes.data);
          } catch (authErr) {
            console.error('Failed to re-initialize anonymous session', authErr);
          }
        }
      }
      fetchMeetings();
    };
    init();
  }, []);

  const fetchMeetings = async () => {
    try {
      const data = await getMeetings();
      setMeetings(data);
    } catch (error) {
      console.error('Failed to fetch meetings', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const parseStartTime = (dateString: string) =>
    new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');

  const formatMeetingDate = (dateString: string) => {
    if (!dateString) return '';
    const date = parseStartTime(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const formatMeetingTime = (dateString: string) => {
    if (!dateString) return '';
    return format(parseStartTime(dateString), 'h:mm a');
  };

  /**
   * Returns a human-readable label showing how overdue a meeting is.
   * e.g. "Started 5 min ago", "Started 1 hr ago"
   */
  const getOverdueLabel = (dateString: string) => {
    const start = parseStartTime(dateString);
    const diffMs = now.getTime() - start.getTime();
    if (diffMs <= 0) return null; // hasn't started yet
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `Started ${diffMin} min ago`;
    return `Started ${Math.floor(diffMin / 60)} hr ago`;
  };

  const handleStart = (meetingCode: string) => {
    router.push(`/meeting/${meetingCode}?name=Host&host=true`);
  };

  // ── Meeting classification ─────────────────────────────────────────────────
  /**
   * A meeting belongs to the "Upcoming" bucket when ANY of these are true:
   *   1. Its scheduled start time is in the future (hasn't started yet).
   *   2. It has started but is within GRACE_PERIOD_MS of its start time
   *      AND has not been explicitly ended.
   *
   * This prevents a meeting from vanishing from the host's view the moment
   * its clock-time passes, matching Zoom's "Start" button behaviour.
   */
  const isUpcoming = useCallback((m: any) => {
    if (m.is_ended) return false;
    if (!currentUser || m.host_id !== currentUser.id) return false;
    const startTime = parseStartTime(m.start_time);
    const msOverdue = now.getTime() - startTime.getTime();
    // Still upcoming if future, OR within the 30-min grace window
    return msOverdue < GRACE_PERIOD_MS;
  }, [currentUser, now]);

  /**
   * A meeting is "starting soon / overdue" when it's within the grace period
   * AND has passed its scheduled start time. These get a highlighted banner.
   */
  const isOverdue = useCallback((m: any) => {
    if (m.is_ended) return false;
    const startTime = parseStartTime(m.start_time);
    const msOverdue = now.getTime() - startTime.getTime();
    return msOverdue > 0 && msOverdue < GRACE_PERIOD_MS;
  }, [now]);

  /** Whether the meeting starts within the next 5 minutes (highlight it) */
  const isStartingSoon = useCallback((m: any) => {
    const startTime = parseStartTime(m.start_time);
    const msUntilStart = startTime.getTime() - now.getTime();
    return msUntilStart >= 0 && msUntilStart <= 5 * 60_000;
  }, [now]);

  // Build sorted lists
  const upcomingMeetings = [...meetings.filter(isUpcoming)].sort((a, b) => {
    return parseStartTime(a.start_time).getTime() - parseStartTime(b.start_time).getTime();
  });

  const pastMeetings = [...meetings.filter(m => {
    if (!currentUser || m.host_id !== currentUser.id) return false;
    return !isUpcoming(m);
  })].sort((a, b) => {
    return parseStartTime(b.start_time).getTime() - parseStartTime(a.start_time).getTime();
  });

  // Meetings that need immediate host attention (overdue or starting in ≤5min)
  const actionableMeetings = upcomingMeetings.filter(m => isOverdue(m) || isStartingSoon(m));
  // Regular future meetings
  const futureMeetings = upcomingMeetings.filter(m => !isOverdue(m) && !isStartingSoon(m));

  const currentList = activeTab === 'upcoming' ? futureMeetings : pastMeetings;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="flex border-b border-[#e5e5e5] px-5 bg-white">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`py-2.5 mr-4 text-[13px] font-medium border-b-2 transition-all ${
            activeTab === 'upcoming'
              ? 'border-[#0b5cff] text-[#0b5cff]'
              : 'border-transparent text-[#666] hover:text-[#333]'
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`py-2.5 text-[13px] font-medium border-b-2 transition-all ${
            activeTab === 'past'
              ? 'border-[#0b5cff] text-[#0b5cff]'
              : 'border-transparent text-[#666] hover:text-[#333]'
          }`}
        >
          Previous
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[#0b5cff] opacity-60"
                style={{ animation: `zoom-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
            <style>{`
              @keyframes zoom-bounce {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        ) : (
          <>
            {/* ── "Start Now" banner — shown on BOTH tabs when meetings need action ── */}
            {/*
              These cards mirror Zoom's orange/amber highlight for meetings
              whose time has passed but haven't been started or ended yet.
              They sit above the tab content so the host can't miss them.
            */}
            {activeTab === 'upcoming' && actionableMeetings.length > 0 && (
              <div className="border-b border-[#f0d0a0] bg-[#fffbf0]">
                {actionableMeetings.map(meeting => {
                  const overdue = isOverdue(meeting);
                  const soon = isStartingSoon(meeting);
                  const overdueLabel = overdue ? getOverdueLabel(meeting.start_time) : null;

                  return (
                    <div
                      key={meeting.id}
                      className="px-5 py-3.5 border-b border-[#fde8b0] last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          {/* Status icon */}
                          <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                            overdue ? 'bg-[#ff6b35]/15' : 'bg-[#f59e0b]/15'
                          }`}>
                            {overdue
                              ? <AlertCircle size={14} className="text-[#ff6b35]" />
                              : <Clock size={14} className="text-[#f59e0b]" />
                            }
                          </div>

                          {/* Meeting details */}
                          <div>
                            {/* Attention label */}
                            <div className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
                              overdue ? 'text-[#ff6b35]' : 'text-[#f59e0b]'
                            }`}>
                              {overdue
                                ? overdueLabel ?? 'Ready to start'
                                : 'Starting in a few minutes'
                              }
                            </div>
                            <div className="text-[13px] font-semibold text-[#222] leading-tight">
                              {meeting.title}
                            </div>
                            <div className="text-[11px] text-[#888] mt-0.5 flex items-center gap-2">
                              <span>{formatMeetingDate(meeting.start_time)} · {formatMeetingTime(meeting.start_time)}</span>
                              <span className="text-[#bbb]">·</span>
                              <span>ID: {meeting.meeting_code}</span>
                            </div>
                          </div>
                        </div>

                        {/* Start button — always visible, not hover-only */}
                        <button
                          onClick={() => handleStart(meeting.meeting_code)}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 text-white text-[12px] font-semibold rounded-full transition-all shadow-sm ${
                            overdue
                              ? 'bg-[#ff6b35] hover:bg-[#e5592a]'
                              : 'bg-[#0b5cff] hover:bg-[#094dd6]'
                          }`}
                        >
                          <Video size={12} />
                          Start
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Regular list (future upcoming or past) ── */}
            {currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                {/* Zoom-style umbrella empty state illustration */}
                <div className="relative w-24 h-20 mb-2">
                  <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    <ellipse cx="60" cy="90" rx="30" ry="4" fill="#E8E8E8"/>
                    <path d="M60 20 C35 20 15 38 15 60 L60 60 L105 60 C105 38 85 20 60 20Z" fill="#DDDFF5" />
                    <path d="M15 60 C15 60 22 55 30 60 C38 65 45 55 53 60 C61 65 68 55 75 60" stroke="#9B9EC8" strokeWidth="1.5" fill="none"/>
                    <line x1="60" y1="60" x2="60" y2="88" stroke="#9B9EC8" strokeWidth="2"/>
                    <path d="M60 88 C60 88 65 93 70 88" stroke="#9B9EC8" strokeWidth="2" fill="none"/>
                  </svg>
                </div>
                <p className="text-[13px] text-[#666]">
                  {activeTab === 'upcoming'
                    ? (actionableMeetings.length > 0
                        ? 'No other meetings scheduled.'
                        : 'No meetings scheduled.')
                    : 'No previous meetings.'
                  }
                </p>
                {activeTab === 'upcoming' && (
                  <button
                    onClick={() => {}}
                    className="flex items-center gap-1 text-[13px] text-[#0b5cff] font-medium hover:underline"
                  >
                    + Schedule a meeting
                  </button>
                )}
              </div>
            ) : (
              <div>
                {currentList.map((meeting: any) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f0f0] hover:bg-[#f8f8f8] transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Time column */}
                      <div className="w-[72px] flex-shrink-0 text-right">
                        <div className="text-[12px] font-semibold text-[#555] uppercase tracking-wider leading-none">
                          {formatMeetingDate(meeting.start_time)}
                        </div>
                        <div className="text-[12px] text-[#888] mt-0.5">
                          {formatMeetingTime(meeting.start_time)}
                        </div>
                      </div>
                      {/* Divider */}
                      <div className="w-px h-8 bg-[#e0e0e0] flex-shrink-0" />
                      {/* Meeting info */}
                      <div>
                        <div className="text-[13px] font-semibold text-[#222] leading-tight">
                          {meeting.title}
                        </div>
                        <div className="text-[11px] text-[#999] mt-0.5">
                          ID: {meeting.meeting_code}
                        </div>
                      </div>
                    </div>

                    {/* Start button — hover reveal for future meetings */}
                    {activeTab === 'upcoming' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStart(meeting.meeting_code); }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-4 py-1.5 bg-[#0b5cff] hover:bg-[#094dd6] text-white text-[12px] font-semibold rounded-full transition-all"
                      >
                        <Video size={12} />
                        Start
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
