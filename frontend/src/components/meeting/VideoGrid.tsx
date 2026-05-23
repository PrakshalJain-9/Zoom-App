"use client";

import React from 'react';
import ParticipantVideo from './ParticipantVideo';

interface VideoGridProps {
  /** List of all admitted participants in the meeting room */
  admittedParticipants: any[];
  /** The unique ID representing the local client participant */
  localParticipantId: string;
  /** Whether the local user currently has their hand raised */
  isHandRaised: boolean;
  /** Map of participant IDs to their active WebRTC MediaStreams */
  streams: Record<string, MediaStream>;
  /** Set containing IDs of participants currently detected as speaking */
  speakingIds: Set<string>;
  /** Key incremented to force local video track re-render triggers */
  streamKey: number;
  /** Action handler to toggle/lower the local hand raised status */
  toggleHandRaised: () => void;
}

/**
 * VideoGrid Component
 * 
 * Computes grid rows and columns dynamically to ensure that
 * participant tiles take up equal, optimized, screen-filling dimensions.
 * Binds active WebRTC streams to ParticipantVideo tiles.
 * Displays the persistent "Lower hand" shortcut pill when hand raising is active.
 */
export default function VideoGrid({
  admittedParticipants,
  localParticipantId,
  isHandRaised,
  streams,
  speakingIds,
  streamKey,
  toggleHandRaised
}: VideoGridProps) {
  const n = admittedParticipants.length;

  // Grid Geometry Distribution Logic:
  // - 1 participant: Full screen (1 column, 1 row)
  // - 2 participants: Side-by-side (2 columns, 1 row)
  // - 3 to 4 participants: Quad grid (2 columns, 2 rows)
  // - 5 to 6 participants: 3x2 grid (3 columns, 2 rows)
  // - 7+ participants: Gallery view (3 columns, automatic vertical rows)
  const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : 3;
  const rows = n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 2 : Math.ceil(n / 3);

  return (
    <main className="flex-1 relative bg-[#242424] overflow-hidden select-none">
      {/* Grid container with custom inline styling to inject dynamic rows/cols */}
      <div
        className="absolute inset-0 p-2 grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {admittedParticipants.map((p) => {
          const isLocal = p.id === localParticipantId;
          // Merge hand state locally to bypass roundtrip latency for local indicators
          const participantWithHandState = isLocal ? { ...p, hand_raised: isHandRaised } : p;
          
          return (
            <ParticipantVideo
              key={p.id}
              participant={participantWithHandState}
              stream={streams[p.id] || null}
              isLocal={isLocal}
              isSpeaking={speakingIds.has(p.id)}
              streamKey={isLocal ? streamKey : 0}
            />
          );
        })}
      </div>

      {/* Floating Lower Hand prompt button positioned in lower-center area */}
      {isHandRaised && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={toggleHandRaised}
            className="flex items-center gap-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] border border-[#555] text-white text-sm font-semibold px-5 py-2 rounded-full shadow-xl transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-base">✋</span>
            Lower hand
          </button>
        </div>
      )}
    </main>
  );
}
