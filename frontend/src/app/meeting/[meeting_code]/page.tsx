/**
 * @file app/meeting/[meeting_code]/page.tsx
 * @description Meeting room page — thin orchestrator component.
 *
 * This component's ONLY job is to:
 *  1. Extract URL parameters (meeting code, display name, host flag)
 *  2. Call useMeetingRoom() to get all state and actions
 *  3. Render the appropriate screen (loading / error / waiting room / main room)
 *  4. Wire up child components with props
 *
 * All business logic, WebSocket management, Zego WebRTC setup, device toggling,
 * and state management has been moved to:
 *
 *  hooks/useMeetingRoom.ts  — master hook (session, Zego, WS, device toggles)
 *  hooks/useSpeakingDetection.ts — Web Audio API FFT loop
 *  hooks/useChatMessages.ts — chat state and send
 *  lib/media.ts             — acquireLocalStream utility
 *  types/meeting.ts         — all shared TypeScript types
 */

'use client';

import React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

// ── Custom hook (all the logic lives here) ──────────────────────────────────
import { useMeetingRoom } from '@/hooks/useMeetingRoom';

// ── Reusable UI atoms ────────────────────────────────────────────────────────
import { SpinnerRing } from '@/components/ui/LoadingSpinner';

// ── Meeting room sub-components ──────────────────────────────────────────────
import WaitingRoomScreen from '@/components/meeting/WaitingRoomScreen';
import FloatingEmoji from '@/components/meeting/FloatingEmoji';
import ReactionsPanel from '@/components/meeting/ReactionsPanel';
import MorePanel from '@/components/meeting/MorePanel';
import MeetingHeader from '@/components/meeting/MeetingHeader';
import VideoGrid from '@/components/meeting/VideoGrid';
import MeetingFooter from '@/components/meeting/MeetingFooter';
import ChatSidebar from '@/components/meeting/ChatSidebar';
import ParticipantsSidebar from '@/components/meeting/ParticipantsSidebar';

// ===========================================================================
// PAGE COMPONENT
// ===========================================================================

/**
 * MeetingRoom — the entry point for any active meeting session.
 *
 * This is intentionally kept as thin as possible. If you need to change
 * meeting behaviour, look at `useMeetingRoom.ts`. If you need to change
 * how the video grid looks, look at `VideoGrid.tsx`, etc.
 */
export default function MeetingRoom() {
  // ── URL parameters ─────────────────────────────────────────────────────────
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const meetingCode = params.meeting_code as string;
  const displayName = searchParams.get('name') || 'Guest';
  const isHostParam = searchParams.get('host') === 'true';

  // ── All state and actions from the master hook ─────────────────────────────
  const {
    loading, error,
    localParticipant, admittedParticipants, waitingParticipants,
    localParticipantId, isHost,
    streams, streamKey, isMuted, isVideoOff, isMockMedia,
    speakingIds, myStatus, inviteLink, copied,
    floatingReactions, isHandRaised,
    isChatOpen, isParticipantsOpen, isReactionsOpen, isMoreOpen,
    chatMessages, chatInput, chatRecipient,
    otherParticipants,
    setChatInput, setChatRecipient, sendChatMessage,
    toggleMic, toggleVideo, toggleChat, toggleParticipants,
    toggleHandRaised, handleCopyLink, sendReaction, sendHostCommand,
    admitUser, admitAll, muteParticipant,
    doCleanup, setIsReactionsOpen, setIsMoreOpen,
  } = useMeetingRoom({ meetingCode, displayName, isHostParam });

  // ── Screen guards ──────────────────────────────────────────────────────────

  // Full-screen spinner while connecting to the meeting
  if (loading) {
    return <SpinnerRing label="Connecting..." />;
  }

  // Error screen — shown when join fails or no room token is returned
  if (error || !localParticipant) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center text-white select-none">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Unable to Join</h1>
        <p className="text-gray-400 mb-8">{error || 'Could not retrieve room token.'}</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2 bg-[#0e71eb] rounded-lg font-semibold hover:bg-[#1a85ff] transition-colors cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Waiting room — shown to guests until the host admits them
  if (myStatus === 'waiting') {
    return <WaitingRoomScreen displayName={displayName} meetingCode={meetingCode} />;
  }

  // ── Main meeting room ──────────────────────────────────────────────────────
  return (
    <div
      className="h-[100dvh] bg-[#242424] flex flex-col text-white overflow-hidden"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* ── Floating emoji reactions overlay ─────────────────────────────────
          These are absolutely positioned and animate upward across the screen.
          They are created locally on send and cleaned up after 3.2 seconds.
      ──────────────────────────────────────────────────────────────────────── */}
      {floatingReactions.map(r => (
        <FloatingEmoji key={r.id} emoji={r.emoji} x={r.x} sender={r.sender} />
      ))}

      {/* ── Emoji reactions popup panel ──────────────────────────────────────
          Shown when the user clicks the "React" button in the footer.
          Positioned above the footer via absolute positioning in the component.
      ──────────────────────────────────────────────────────────────────────── */}
      {isReactionsOpen && (
        <ReactionsPanel
          onReact={sendReaction}
          onClose={() => setIsReactionsOpen(false)}
          onRaiseHand={toggleHandRaised}
          isHandRaised={isHandRaised}
        />
      )}

      {/* ── More options panel ────────────────────────────────────────────────
          Shown when the user clicks "More" in the footer.
          Contains host-level controls (mute all, end meeting) and guest controls.
      ──────────────────────────────────────────────────────────────────────── */}
      {isMoreOpen && (
        <MorePanel
          onClose={() => setIsMoreOpen(false)}
          isHost={isHost}
          onMuteAll={() => sendHostCommand('mute_all')}
          onEndMeeting={() => {
            if (isHost) {
              sendHostCommand('end_meeting');
            } else {
              doCleanup();
              router.push('/');
            }
          }}
        />
      )}

      {/* ── Top header bar ────────────────────────────────────────────────────
          Shows meeting ID, invite link, mock mode banner, and admit-all button.
      ──────────────────────────────────────────────────────────────────────── */}
      <MeetingHeader
        meetingCode={meetingCode}
        inviteLink={inviteLink}
        isHost={isHost}
        waitingParticipantsCount={waitingParticipants.length}
        isMockMedia={isMockMedia}
        copied={copied}
        onCopyLink={handleCopyLink}
        onAdmitAll={admitAll}
      />

      {/* ── Body: video grid + optional right sidebars ────────────────────── */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* Video tiles grid — fills available space */}
        <VideoGrid
          admittedParticipants={admittedParticipants}
          localParticipantId={localParticipantId}
          isHandRaised={isHandRaised}
          streams={streams}
          speakingIds={speakingIds}
          streamKey={streamKey}
          toggleHandRaised={toggleHandRaised}
        />

        {/* Right sidebar — chat OR participants (only one shown at a time) */}
        {(isChatOpen || isParticipantsOpen) && (
          <aside className="w-[320px] flex-shrink-0 bg-[#f0f0f0] text-gray-900 flex flex-col overflow-hidden border-l border-[#333]">
            <ParticipantsSidebar
              isOpen={isParticipantsOpen}
              onClose={() => toggleParticipants()}
              admittedParticipants={admittedParticipants}
              waitingParticipants={waitingParticipants}
              isHost={isHost}
              localParticipantId={localParticipantId}
              isHandRaised={isHandRaised}
              speakingIds={speakingIds}
              onAdmit={admitUser}
              onAdmitAll={admitAll}
              onMuteParticipant={muteParticipant}
              onMuteAll={() => sendHostCommand('mute_all')}
              onCopyLink={handleCopyLink}
              copied={copied}
            />
            <ChatSidebar
              isOpen={isChatOpen}
              onClose={() => toggleChat()}
              chatMessages={chatMessages}
              displayName={displayName}
              otherParticipants={otherParticipants}
              chatRecipient={chatRecipient}
              onRecipientChange={setChatRecipient}
              chatInput={chatInput}
              onInputChange={setChatInput}
              onSendMessage={sendChatMessage}
            />
          </aside>
        )}
      </div>

      {/* ── Bottom control bar ─────────────────────────────────────────────── */}
      <MeetingFooter
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        admittedCount={admittedParticipants.length}
        waitingCount={waitingParticipants.length}
        isParticipantsOpen={isParticipantsOpen}
        isChatOpen={isChatOpen}
        isReactionsOpen={isReactionsOpen}
        isMoreOpen={isMoreOpen}
        isHost={isHost}
        onToggleMic={toggleMic}
        onToggleVideo={toggleVideo}
        onToggleParticipants={toggleParticipants}
        onToggleChat={toggleChat}
        onToggleReactions={() => {
          setIsReactionsOpen(!isReactionsOpen);
          setIsMoreOpen(false);
        }}
        onToggleMore={() => {
          setIsMoreOpen(!isMoreOpen);
          setIsReactionsOpen(false);
        }}
        onLeaveOrEnd={() => {
          if (isHost) {
            if (confirm('End the meeting for all participants?')) {
              sendHostCommand('end_meeting');
            }
          } else {
            doCleanup();
            router.push('/');
          }
        }}
      />
    </div>
  );
}
