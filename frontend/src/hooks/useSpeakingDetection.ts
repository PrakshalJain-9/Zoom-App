/**
 * @file hooks/useSpeakingDetection.ts
 * @description Custom React hook for real-time speaking detection via the Web Audio API.
 *
 * HOW IT WORKS:
 * The Web Audio API gives us an AnalyserNode that performs a Fast Fourier
 * Transform (FFT) on the microphone's audio data. We sample the frequency
 * amplitude values on every animation frame. If the average amplitude
 * exceeds a threshold, the participant is considered "speaking".
 *
 * The result (`speakingIds`) is a Set of participant IDs that are currently
 * speaking. UI components use this to show a green speaking border around tiles.
 *
 * TEARDOWN:
 * The hook returns a `stopSpeakingDetection` function that cancels the
 * animation frame loop and closes the AudioContext. This must be called on
 * component unmount to prevent memory leaks.
 */

import { useState, useRef, useCallback } from 'react';

// ===========================================================================
// TYPES
// ===========================================================================

interface UseSpeakingDetectionReturn {
  /** Set of participant IDs currently detected as speaking */
  speakingIds: Set<string>;
  /**
   * Starts the FFT audio analysis loop for the given stream.
   * Call this once the local MediaStream is ready.
   * @param stream - The local MediaStream from getUserMedia
   * @param participantId - The local participant's ID
   */
  startSpeakingDetection: (stream: MediaStream, participantId: string) => void;
  /** Cancels the RAF loop and closes the AudioContext */
  stopSpeakingDetection: () => void;
}

// ===========================================================================
// HOOK
// ===========================================================================

/**
 * Detects whether the local participant is speaking using the Web Audio API.
 *
 * Usage:
 * ```tsx
 * const { speakingIds, startSpeakingDetection, stopSpeakingDetection } = useSpeakingDetection();
 *
 * // After acquiring localStream:
 * startSpeakingDetection(localStream, participantId);
 *
 * // On unmount:
 * stopSpeakingDetection();
 * ```
 */
export function useSpeakingDetection(): UseSpeakingDetectionReturn {
  // The set of participant IDs currently detected as speaking
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());

  // Refs to hold the AudioContext and animation frame ID so they survive re-renders
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafIdRef = useRef<number>(0);

  /**
   * Starts the speaking detection loop for the given media stream.
   * Creates an AudioContext → AnalyserNode pipeline and runs an FFT
   * amplitude check on every animation frame.
   */
  const startSpeakingDetection = useCallback((stream: MediaStream, participantId: string) => {
    // Guard: Web Audio API may not be available in all environments (e.g. SSR)
    if (typeof window === 'undefined') return;

    try {
      // Use the vendor-prefixed AudioContext for older Safari versions
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // AnalyserNode configuration:
      //   fftSize: 512 gives 256 frequency bins — enough resolution for voice detection
      //   smoothingTimeConstant: 0.8 dampens the values to prevent rapid flickering
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      // Connect the microphone stream into the analyser node
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Uint8Array buffer to receive the FFT frequency amplitude data
      const data = new Uint8Array(analyser.frequencyBinCount);

      /**
       * RAF loop: runs ~60 times/second, reads the FFT data, and updates
       * the speaking state if the average amplitude crosses the threshold (6).
       * A threshold of 6 filters out ambient noise while catching normal speech.
       */
      const check = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;

        setSpeakingIds(prev => {
          const next = new Set(prev);
          if (avg > 6) {
            next.add(participantId);    // Participant is speaking
          } else {
            next.delete(participantId); // Participant is silent
          }
          return next;
        });

        // Schedule next frame
        rafIdRef.current = requestAnimationFrame(check);
      };

      rafIdRef.current = requestAnimationFrame(check);
    } catch {
      // Silently fail — speaking detection is a visual nicety, not critical
    }
  }, []);

  /**
   * Stops the speaking detection loop and releases the AudioContext.
   * Must be called on component unmount to prevent memory leaks.
   */
  const stopSpeakingDetection = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  return { speakingIds, startSpeakingDetection, stopSpeakingDetection };
}
