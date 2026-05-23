/**
 * @file lib/media.ts
 * @description Browser media acquisition utility.
 *
 * This module is intentionally framework-agnostic (no React hooks, no state).
 * It can be imported by any hook or component that needs camera/microphone access.
 *
 * WHY THIS IS NEEDED:
 * Firefox's camera subsystem can throw `AbortError: Starting videoinput failed`
 * when the hardware isn't ready — even after the user has granted permission.
 * This is a race condition in Firefox's internal media manager, not a
 * permissions problem. The fix is a multi-stage fallback strategy:
 *
 *   Stage 1 — Retry combined audio+video with exponential back-off.
 *             AbortErrors are transient; a short wait usually resolves them.
 *
 *   Stage 2 — Request audio and video SEPARATELY using Promise.allSettled,
 *             then merge the resulting tracks into one MediaStream. Firefox is
 *             less likely to abort two smaller requests than one combined one.
 *
 *   Stage 3 — Audio-only fallback. The user can still participate in the call
 *             with their microphone even if the camera is truly unavailable.
 */

/**
 * Acquires the local camera + microphone MediaStream with a resilient,
 * multi-stage fallback strategy designed for Firefox compatibility.
 *
 * @param maxRetries - Number of combined-request attempts before Stage 2.
 *                     Default is 3.
 * @returns A MediaStream. May contain video+audio, audio-only, or be empty
 *          if all acquisition stages fail.
 */
export async function acquireLocalStream(maxRetries = 3): Promise<MediaStream> {
  // Retry delay schedule in milliseconds.
  // Each attempt waits longer to give camera hardware time to fully reset.
  const retryDelays = [400, 900, 1800];

  // ── Stage 1: Combined audio+video with exponential back-off ──────────────
  // Most browsers succeed here on the first attempt. Firefox may need 1–2 retries.
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Wait before retrying — the camera hardware needs time to reset
      await new Promise(r => setTimeout(r, retryDelays[attempt - 1]));
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,   // Reduce room echo
          noiseSuppression: true,   // Reduce background noise
        },
        video: {
          // Use `ideal` (not `exact`) constraints so Firefox can negotiate
          // the closest supported resolution instead of hard-failing
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
      console.log(`[media] acquireLocalStream: succeeded on attempt ${attempt + 1}`);
      return stream;
    } catch (err: any) {
      // AbortError and NotReadableError are transient — worth retrying
      const isTransient = err?.name === 'AbortError' || err?.name === 'NotReadableError';
      if (!isTransient || attempt === maxRetries - 1) {
        // Not transient, or we've used all retries — move to Stage 2
        console.warn(`[media] Stage 1 exhausted after ${attempt + 1} attempt(s):`, err);
        break;
      }
      console.warn(`[media] Attempt ${attempt + 1} got ${err.name}, retrying...`);
    }
  }

  // ── Stage 2: Separate audio + video requests merged into one stream ───────
  // Requesting audio and video independently sidesteps a Firefox bug where
  // the combined request fails even though each device is individually free.
  console.warn('[media] Trying separate audio + video requests (Stage 2)');
  try {
    const [audioResult, videoResult] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      }),
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      }),
    ]);

    const tracks: MediaStreamTrack[] = [];
    if (audioResult.status === 'fulfilled') {
      tracks.push(...audioResult.value.getAudioTracks());
    }
    if (videoResult.status === 'fulfilled') {
      tracks.push(...videoResult.value.getVideoTracks());
    }

    if (tracks.length > 0) {
      console.log(`[media] Stage 2 produced ${tracks.length} track(s)`);
      return new MediaStream(tracks);
    }
  } catch (stageErr) {
    console.warn('[media] Stage 2 failed:', stageErr);
  }

  // ── Stage 3: Audio-only fallback ──────────────────────────────────────────
  // The camera may be genuinely unavailable (another app is using it,
  // or the device has no camera). The user can still join with audio.
  console.warn('[media] Falling back to audio-only (Stage 3)');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (audioErr) {
    // All three stages failed. Return an empty stream so the page doesn't crash.
    // The user will appear with no video/audio until they manually enable devices.
    console.error('[media] All stages failed:', audioErr);
    return new MediaStream();
  }
}
