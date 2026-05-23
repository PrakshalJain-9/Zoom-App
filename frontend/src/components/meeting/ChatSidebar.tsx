"use client";

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ChatSidebarProps {
  /** Visibility toggle of this sidebar */
  isOpen: boolean;
  /** Callback fired to close/collapse this sidebar panel */
  onClose: () => void;
  /** Array containing chat messages data models */
  chatMessages: any[];
  /** Display name of the local participant */
  displayName: string;
  /** List of all other participants (excluding local user) */
  otherParticipants: any[];
  /** Current message recipient target ('everyone' or a participant ID) */
  chatRecipient: string;
  /** Callback triggered when user updates message recipient target */
  onRecipientChange: (recipient: string) => void;
  /** Value of the text message input field */
  chatInput: string;
  /** Callback triggered when text input changes */
  onInputChange: (val: string) => void;
  /** Action handler to broadcast the typed message */
  onSendMessage: () => void;
}

/**
 * ChatSidebar Component
 * 
 * Implements the Zoom right-aligned panel for text communication.
 * Manages individual message formatting (rendering DM targets differently).
 * Handles automatic smooth scroll-to-bottom logic whenever new messages arrive or sidebar is toggled.
 */
export default function ChatSidebar({
  isOpen,
  onClose,
  chatMessages,
  displayName,
  otherParticipants,
  chatRecipient,
  onRecipientChange,
  chatInput,
  onInputChange,
  onSendMessage
}: ChatSidebarProps) {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat panel to bottom on new message additions or sidebar opens
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <h2 className="font-semibold text-[15px] text-gray-900">In-Meeting Chat</h2>
        
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages stream view */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {chatMessages.length === 0 ? (
          <div className="text-center text-gray-400 text-xs mt-8">No messages yet.</div>
        ) : (
          chatMessages.map((msg, i) => {
            const isMe = msg.sender_name === displayName;
            
            return (
              <div key={i} className="flex flex-col text-xs">
                {/* Meta details: Sender name, timestamp, and DM tags */}
                <div className="flex items-baseline justify-between text-gray-400 mb-0.5">
                  <span className={`font-semibold ${isMe ? 'text-[#0e71eb]' : 'text-gray-700'}`}>
                    {msg.sender_name}
                    {msg.target_user_id && (
                      <span className="ml-1 text-[10px] text-orange-500 font-bold">(DM)</span>
                    )}
                  </span>
                  
                  <span className="text-[10px] text-gray-400">
                    {msg.timestamp ? (
                      new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : ''}
                  </span>
                </div>

                {/* Text Bubble - custom colors applied to personal DM channels */}
                <div
                  className={`p-2.5 rounded-lg break-words whitespace-pre-wrap text-gray-900 ${
                    msg.target_user_id
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-[#f0f0f0]'
                  }`}
                >
                  {msg.message_text}
                </div>
              </div>
            );
          })
        )}
        
        {/* Scroll anchor tag element */}
        <div ref={chatEndRef} />
      </div>

      {/* Inputs controls section */}
      <div className="p-3 border-t border-[#e5e5e5] bg-white">
        {/* Recipient Selector menu */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-gray-400 font-bold shrink-0">To:</span>
          
          <select
            value={chatRecipient}
            onChange={e => onRecipientChange(e.target.value)}
            className="bg-white border border-[#ccc] rounded px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:border-[#0e71eb] flex-1 max-w-[160px] cursor-pointer"
          >
            <option value="everyone">Everyone</option>
            {otherParticipants
              .filter(p => p.status === 'admitted')
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {/* Messaging Input form */}
        <form
          onSubmit={e => {
            e.preventDefault();
            onSendMessage();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={e => onInputChange(e.target.value)}
            placeholder="Type message here..."
            className="flex-1 text-sm bg-white border border-[#ccc] rounded px-2.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0e71eb]"
          />
          
          <button
            type="submit"
            className="px-3 py-2 bg-[#0e71eb] hover:bg-[#094dd6] text-white text-xs font-bold rounded transition-colors cursor-pointer"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
