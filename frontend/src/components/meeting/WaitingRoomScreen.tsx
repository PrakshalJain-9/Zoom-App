"use client";

import React from 'react';

interface WaitingRoomScreenProps {
  /** The display name of the participant waiting */
  displayName: string;
  /** The unique code of the meeting room */
  meetingCode: string;
}

/**
 * WaitingRoomScreen Component
 * 
 * Renders the lobby/waiting room card.
 * Styled after Zoom's classic waiting layout (light card, centered logo, bouncy blue dots).
 * Prompts the user that they will be let in shortly and explains hardware access.
 */
export default function WaitingRoomScreen({
  displayName,
  meetingCode
}: WaitingRoomScreenProps) {
  return (
    <div className="min-h-screen bg-[#242424] flex items-center justify-center px-4 select-none">
      <div className="bg-white text-gray-900 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        
        {/* Centered blue Zoom video icon wrapper */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#0e71eb] flex items-center justify-center shadow-md">
            <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
              <path
                d="M6 13.5C6 11.567 7.567 10 9.5 10h12C23.433 10 25 11.567 25 13.5v13C25 28.433 23.433 30 21.5 30h-12C7.567 30 6 28.433 6 26.5v-13z"
                fill="white"
              />
              <path
                d="M26 16.2l7.2-4.8A1 1 0 0135 12.2v15.6a1 1 0 01-1.8.6L26 23.8V16.2z"
                fill="white"
              />
            </svg>
          </div>
        </div>

        {/* Informative message */}
        <h1 className="text-xl font-semibold text-gray-900 mb-2 leading-snug">
          Please wait, the meeting host will let you in soon.
        </h1>
        
        <p className="text-sm text-gray-500 mb-1">
          Meeting ID: <span className="font-mono font-medium text-gray-700">{meetingCode}</span>
        </p>
        
        <p className="text-sm text-gray-500 mb-8">
          Joining as <span className="font-medium text-gray-700">{displayName}</span>
        </p>

        {/* Custom Bouncing Dot Loader */}
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-2.5 h-2.5 rounded-full bg-[#0e71eb]"
              style={{ animation: `zoom-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>

        {/* Bouncy keyframe styling */}
        <style>{`
          @keyframes zoom-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%  { transform: scale(1); opacity: 1; }
          }
        `}</style>
        
        <p className="text-xs text-gray-400 mt-8">
          Your microphone and camera will turn on when you're admitted.
        </p>
      </div>
    </div>
  );
}
