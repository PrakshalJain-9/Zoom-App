/**
 * @file components/ui/LoadingSpinner.tsx
 * @description Reusable loading indicator components.
 *
 * Two variants are provided:
 *  - `BouncingDots`  — Three animated dots (used in UpcomingMeetings)
 *  - `SpinnerRing`   — A circular spinning ring (used in the meeting loading screen)
 *
 * By centralizing these here, we avoid duplicating animation CSS across files
 * and ensure a consistent loading UX across the whole app.
 */

import React from 'react';

// ===========================================================================
// BOUNCING DOTS LOADER
// ===========================================================================

/**
 * Three pulsing blue dots arranged horizontally.
 * Used in the UpcomingMeetings component while meetings are being fetched.
 */
export function BouncingDots() {
  return (
    <div className="flex items-center justify-center py-16 gap-2">
      {/* Each dot has a staggered animation delay for a wave effect */}
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-[#0b5cff] opacity-60"
          style={{
            animation: `zoom-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      {/* Keyframe animation defined inline to avoid polluting global CSS */}
      <style>{`
        @keyframes zoom-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// SPINNING RING LOADER
// ===========================================================================

/**
 * A circular blue spinning ring with an optional label.
 * Used as the full-screen loading state while connecting to a meeting.
 *
 * @param label - Text shown below the spinner. Defaults to "Connecting..."
 */
export function SpinnerRing({ label = 'Connecting...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white select-none">
      {/* Spinning border ring — uses `border-t-transparent` to create the gap */}
      <div className="w-12 h-12 border-4 border-[#0e71eb] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-lg font-semibold tracking-wide">{label}</p>
    </div>
  );
}
