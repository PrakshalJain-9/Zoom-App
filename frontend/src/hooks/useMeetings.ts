/**
 * @file hooks/useMeetings.ts
 * @description Custom hook for fetching and classifying the meeting list.
 *
 * Responsibilities:
 *  - Fetches the current user from the auth API (with anonymous session fallback)
 *  - Fetches all meetings for the current user from the REST API
 *  - Classifies meetings into upcoming / past / actionable buckets
 *  - Refreshes the "current time" every minute so classification stays live
 *
 * This hook is the data layer for the UpcomingMeetings component.
 * By extracting it here, UpcomingMeetings becomes a pure presentation component
 * that just receives data and renders it.
 */

import { useState, useEffect, useCallback } from 'react';
import { getMeetings, api } from '@/lib/api';
import { Meeting } from '@/types/meeting';

// ===========================================================================
// CONSTANTS
// ===========================================================================

/**
 * Grace period (ms) during which a past-scheduled meeting still shows in
 * the Upcoming tab with a prominent "Start Now" banner.
 *
 * This mimics Zoom's behaviour: a meeting doesn't vanish from the host's
 * view the instant the scheduled time passes. 30 minutes gives the host
 * enough time to actually start their session.
 */
const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes

// ===========================================================================
// TYPES
// ===========================================================================

interface UseMeetingsReturn {
  /** Meetings within the 30-min grace window that need immediate host action */
  actionableMeetings: Meeting[];
  /** Future meetings that haven't started yet */
  futureMeetings: Meeting[];
  /** Meetings past the grace window (ended or no longer actionable) */
  pastMeetings: Meeting[];
  /** True while data is being fetched */
  loading: boolean;
  /** Current time — updated every 60s for live classification */
  now: Date;
  /** The authenticated user object, or null if not yet fetched */
  currentUser: any;
  /** Call this to manually re-fetch the meeting list (e.g. after scheduling) */
  refetch: () => void;
  /** Helpers */
  isOverdue: (meeting: Meeting) => boolean;
  isStartingSoon: (meeting: Meeting) => boolean;
}

// ===========================================================================
// HOOK
// ===========================================================================

export function useMeetings(): UseMeetingsReturn {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // `now` is refreshed every 60s so meeting classification updates live
  const [now, setNow] = useState(() => new Date());

  // Refresh the current time every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  /** Fetches all meetings from the REST API. */
  const fetchMeetings = useCallback(async () => {
    try {
      const data = await getMeetings();
      setMeetings(data);
    } catch (error) {
      console.error('[useMeetings] Failed to fetch meetings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Public refetch function exposed to parent components. */
  const refetch = useCallback(() => {
    setLoading(true);
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    const init = async () => {
      // Step 1: Try to get the authenticated user from the session
      try {
        const userRes = await api.get('/auth/me');
        setCurrentUser(userRes.data);
      } catch (err: any) {
        console.error('[useMeetings] Failed to fetch current user:', err);

        // Step 2: If 401, the session has expired — try creating an anonymous session
        if (err.response?.status === 401) {
          try {
            const authRes = await api.post('/auth/anonymous-session');
            const newToken = authRes.data.access_token;
            if (typeof window !== 'undefined') {
              localStorage.setItem('token', newToken);
            }
            // Retry fetching the user with the new token
            const retryRes = await api.get('/auth/me');
            setCurrentUser(retryRes.data);
          } catch (authErr) {
            console.error('[useMeetings] Anonymous session creation failed:', authErr);
          }
        }
      }

      // Step 3: Load the meeting list regardless of auth status
      fetchMeetings();
    };

    init();
  }, [fetchMeetings]);

  // ── Classification Helpers ─────────────────────────────────────────────────

  /**
   * Parses a UTC date string from the backend.
   * Appends 'Z' if missing to ensure correct UTC → local conversion.
   */
  const parseStartTime = (dateString: string): Date =>
    new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');

  /**
   * A meeting is "upcoming" if:
   *  1. It hasn't been explicitly ended by the host
   *  2. It belongs to the current user (hosts only see their own)
   *  3. Its start time is in the future OR within the 30-minute grace window
   */
  const isUpcoming = useCallback((m: Meeting): boolean => {
    if (m.is_ended) return false;
    if (!currentUser || m.host_id !== currentUser.id) return false;
    const startTime = parseStartTime(m.start_time);
    const msOverdue = now.getTime() - startTime.getTime();
    return msOverdue < GRACE_PERIOD_MS;
  }, [currentUser, now]);

  /**
   * A meeting is "overdue" when it has passed its scheduled start time
   * but is still within the grace period. These get the orange "Start Now" banner.
   */
  const isOverdue = useCallback((m: Meeting): boolean => {
    if (m.is_ended) return false;
    const startTime = parseStartTime(m.start_time);
    const msOverdue = now.getTime() - startTime.getTime();
    return msOverdue > 0 && msOverdue < GRACE_PERIOD_MS;
  }, [now]);

  /**
   * A meeting is "starting soon" when it begins within the next 5 minutes.
   * These also get highlighted (with an amber/yellow indicator).
   */
  const isStartingSoon = useCallback((m: Meeting): boolean => {
    const startTime = parseStartTime(m.start_time);
    const msUntilStart = startTime.getTime() - now.getTime();
    return msUntilStart >= 0 && msUntilStart <= 5 * 60_000;
  }, [now]);

  // ── Build classified lists ─────────────────────────────────────────────────

  // All meetings owned by the current user that are still actionable
  const upcomingMeetings = [...meetings.filter(isUpcoming)].sort((a, b) =>
    parseStartTime(a.start_time).getTime() - parseStartTime(b.start_time).getTime()
  );

  // All meetings that are no longer in the upcoming window
  const pastMeetings = [...meetings.filter(m => {
    if (!currentUser || m.host_id !== currentUser.id) return false;
    return !isUpcoming(m);
  })].sort((a, b) =>
    parseStartTime(b.start_time).getTime() - parseStartTime(a.start_time).getTime()
  );

  // Meetings needing immediate attention (overdue or starting ≤5min away)
  const actionableMeetings = upcomingMeetings.filter(m => isOverdue(m) || isStartingSoon(m));

  // Future meetings that don't yet need action
  const futureMeetings = upcomingMeetings.filter(m => !isOverdue(m) && !isStartingSoon(m));

  return {
    actionableMeetings,
    futureMeetings,
    pastMeetings,
    loading,
    now,
    currentUser,
    refetch,
    isOverdue,
    isStartingSoon,
  };
}
