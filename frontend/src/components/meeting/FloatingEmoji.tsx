"use client";

import React from 'react';

interface FloatingEmojiProps {
  /** Emoji character to float (e.g. '🎉', '👍') */
  emoji: string;
  /** Horizontal position percentage across the screen (15-85) to scatter emojis */
  x: number;
  /** Display name of the participant who triggered this reaction */
  sender: string;
}

/**
 * FloatingEmoji Component
 * 
 * Renders an animated emoji bubble that floats upwards and slowly fades away.
 * Employs custom CSS keyframe animations, self-contained inside the component scope.
 * Leverages pointer-events-none so it doesn't obstruct clicks on remote video feeds.
 */
export default function FloatingEmoji({
  emoji,
  x,
  sender
}: FloatingEmojiProps) {
  return (
    <div
      className="fixed bottom-[88px] z-50 flex flex-col items-center pointer-events-none select-none"
      style={{ left: `${x}%`, animation: 'floatUp 3s ease-out forwards' }}
    >
      <span className="text-4xl drop-shadow-lg">{emoji}</span>
      
      {/* Sender tag indicator below the emoji icon */}
      <span className="text-[10px] text-white/80 bg-black/50 rounded px-1 mt-1 font-medium tracking-wide">
        {sender}
      </span>
      
      {/* Component-scoped animation style definition */}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0)   scale(1);   opacity: 1; }
          70%  { transform: translateY(-200px) scale(1.2); opacity: 0.9; }
          100% { transform: translateY(-350px) scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
