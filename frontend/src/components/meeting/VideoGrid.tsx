"use client";

import React from 'react';
import ParticipantVideo from './ParticipantVideo';

interface VideoGridProps {
  admittedParticipants: any[];
  localParticipantId: string;
  isHandRaised: boolean;
  streams: Record<string, MediaStream>;
  speakingIds: Set<string>;
  streamKey: number;
  toggleHandRaised: () => void;
}

/**
 * VideoGrid Component
 *
 * Responsive grid layout:
 * - Mobile (< 640px): always 1 column, tiles stack vertically — prevents
 *   two squished tiles side-by-side on a phone screen.
 * - Desktop: dynamic cols based on participant count (2, 2x2, 3x2, gallery).
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

  // Desktop grid geometry
  const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : 3;
  const rows = n <= 1 ? 1 : n <= 2 ? 1 : n <= 4 ? 2 : Math.ceil(n / 3);

  return (
    <main className="flex-1 relative bg-[#242424] overflow-hidden select-none">

      {/* ── Mobile: single column stacked tiles ─────────────────────────────
          Each tile takes 50% height when 2 people, 100% when alone.
          overflow-y-auto handles 3+ participants.
      ──────────────────────────────────────────────────────────────────── */}
      <div className="sm:hidden absolute inset-0 p-2 flex flex-col gap-2 overflow-y-auto">
        {admittedParticipants.map((p) => {
          const isLocal = p.id === localParticipantId;
          return (
            <div
              key={p.id}
              className="flex-shrink-0 rounded-lg overflow-hidden"
              style={{ height: n === 1 ? '100%' : '50%', minHeight: 160 }}
            >
              <ParticipantVideo
                participant={isLocal ? { ...p, hand_raised: isHandRaised } : p}
                stream={streams[p.id] || null}
                isLocal={isLocal}
                isSpeaking={speakingIds.has(p.id)}
                streamKey={isLocal ? streamKey : 0}
              />
            </div>
          );
        })}
      </div>

      {/* ── Desktop: dynamic multi-column grid ─────────────────────────────
          Column and row count is computed from participant count.
      ──────────────────────────────────────────────────────────────────── */}
      <div
        className="hidden sm:grid absolute inset-0 p-2 gap-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {admittedParticipants.map((p) => {
          const isLocal = p.id === localParticipantId;
          return (
            <ParticipantVideo
              key={p.id}
              participant={isLocal ? { ...p, hand_raised: isHandRaised } : p}
              stream={streams[p.id] || null}
              isLocal={isLocal}
              isSpeaking={speakingIds.has(p.id)}
              streamKey={isLocal ? streamKey : 0}
            />
          );
        })}
      </div>

      {/* Floating "Lower hand" pill — centered at bottom */}
      {isHandRaised && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={toggleHandRaised}
            className="flex items-center gap-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] border border-[#555] text-white text-sm font-semibold px-5 py-2 rounded-full shadow-xl transition-all active:scale-95"
          >
            <span className="text-base">✋</span>
            Lower hand
          </button>
        </div>
      )}
    </main>
  );
}
