"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMeeting } from '@/lib/api';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const meetingCode = params.meeting_code as string;

  const [meeting, setMeeting] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!meetingCode) return;
    getMeeting(meetingCode)
      .then(m => setMeeting(m))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [meetingCode]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setJoining(true);
    router.push(`/meeting/${meetingCode}?name=${encodeURIComponent(displayName.trim())}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0,1,2].map(i => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[#0b5cff]"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-red-500" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Meeting Not Found</h1>
          <p className="text-sm text-gray-500 mb-6">
            The meeting code <span className="font-mono font-semibold text-gray-700">{meetingCode}</span> doesn&apos;t exist or has ended.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-[#0b5cff] text-white rounded-lg font-semibold text-sm hover:bg-[#094dd6] transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden w-full max-w-md">
        {/* Header */}
        <div className="bg-[#0b5cff] px-8 py-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
                <path d="M4 12C4 10.343 5.343 9 7 9H22C23.657 9 25 10.343 25 12V28C25 29.657 23.657 31 22 31H7C5.343 31 4 29.657 4 28V12Z" fill="white"/>
                <path d="M26 16.2L34 11A1 1 0 0136 11.8V28.2A1 1 0 0134 29L26 23.8V16.2Z" fill="white"/>
              </svg>
            </div>
          </div>
          <h1 className="text-white text-xl font-bold leading-tight">
            You&apos;ve been invited to join a meeting
          </h1>
          {meeting && (
            <p className="text-white/80 text-sm mt-2 font-medium">{meeting.title}</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
            <span className="text-white/70 text-xs">Meeting ID:</span>
            <span className="text-white text-xs font-mono font-semibold">{meetingCode}</span>
          </div>
        </div>

        {/* Form */}
        <div className="px-8 py-7">
          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#333] mb-2">
                Your Name
              </label>
              <input
                id="join-name-input"
                type="text"
                required
                autoFocus
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border-2 border-[#e5e5e5] rounded-xl text-sm text-[#333] placeholder-gray-400 focus:border-[#0b5cff] focus:ring-0 outline-none transition-all font-medium"
              />
              <p className="text-xs text-gray-400 mt-1.5 ml-0.5">
                This name will be visible to all meeting participants
              </p>
            </div>

            <button
              id="join-submit-btn"
              type="submit"
              disabled={!displayName.trim() || joining}
              className="w-full py-3 bg-[#0b5cff] text-white rounded-xl font-semibold text-sm hover:bg-[#094dd6] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Joining…
                </span>
              ) : 'Join Meeting'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-[#f0f0f0] text-center">
            <p className="text-xs text-gray-400">
              By joining, you agree to our{' '}
              <span className="text-[#0b5cff] cursor-pointer hover:underline">Terms of Service</span>
              {' '}and{' '}
              <span className="text-[#0b5cff] cursor-pointer hover:underline">Privacy Policy</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
