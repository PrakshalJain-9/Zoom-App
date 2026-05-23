/**
 * @file hooks/useChatMessages.ts
 * @description Custom React hook managing in-meeting chat state and message sending.
 *
 * Responsibilities:
 *  - Stores the list of received chat messages
 *  - Manages the chat input field value
 *  - Manages the recipient selector (everyone / specific participant)
 *  - Provides sendChatMessage() which writes a WS message to the socket
 *
 * The hook takes a WebSocket ref so it can send messages without needing to
 * re-subscribe to the socket itself (the socket lifecycle is owned by useMeetingRoom).
 */

import { useState, useCallback, MutableRefObject } from 'react';
import { ChatMessage } from '@/types/meeting';

// ===========================================================================
// TYPES
// ===========================================================================

interface UseChatMessagesProps {
  /** Ref to the active WebSocket connection (managed by useMeetingRoom) */
  wsRef: MutableRefObject<WebSocket | null>;
}

interface UseChatMessagesReturn {
  /** Ordered list of all chat messages received during the session */
  chatMessages: ChatMessage[];
  /** Current value of the chat text input */
  chatInput: string;
  /**
   * Who the next message will be sent to.
   * 'everyone' = broadcast | participant ID = private DM
   */
  chatRecipient: string;
  /** Appends an incoming message to the list (called by the WS event handler) */
  appendChatMessage: (msg: ChatMessage) => void;
  /** Replaces the full chat history (called on initial load from REST API) */
  setChatMessages: (msgs: ChatMessage[]) => void;
  /** Updates the chat input field value */
  setChatInput: (value: string) => void;
  /** Updates the selected recipient */
  setChatRecipient: (recipient: string) => void;
  /**
   * Sends the current chatInput as a chat message over WebSocket,
   * then clears the input field.
   * Does nothing if the input is empty or the socket is not open.
   */
  sendChatMessage: () => void;
}

// ===========================================================================
// HOOK
// ===========================================================================

/**
 * Manages all chat state for a meeting room session.
 *
 * Usage:
 * ```tsx
 * const { chatMessages, chatInput, sendChatMessage, ... } = useChatMessages({ wsRef });
 *
 * // When a WS message of type CHAT_MESSAGE arrives:
 * appendChatMessage(parsedMessage);
 *
 * // When history is loaded from the REST API:
 * setChatMessages(history);
 * ```
 */
export function useChatMessages({ wsRef }: UseChatMessagesProps): UseChatMessagesReturn {
  // The ordered list of messages received (either from WS events or REST history)
  const [chatMessages, setChatMessagesState] = useState<ChatMessage[]>([]);

  // The text currently typed in the chat input box
  const [chatInput, setChatInput] = useState('');

  // The recipient: 'everyone' for broadcast, or a participant ID for private DM
  const [chatRecipient, setChatRecipient] = useState<string>('everyone');

  /**
   * Appends a single incoming message to the end of the message list.
   * Used by the WebSocket message handler when a CHAT_MESSAGE event arrives.
   */
  const appendChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessagesState(prev => [...prev, msg]);
  }, []);

  /**
   * Replaces the full message history.
   * Called once on mount after the REST API returns previous chat messages.
   */
  const setChatMessages = useCallback((msgs: ChatMessage[]) => {
    setChatMessagesState(msgs || []);
  }, []);

  /**
   * Sends the current chatInput value as a CHAT_MESSAGE over WebSocket.
   * - Trims whitespace before sending.
   * - Clears the input after a successful send.
   * - No-op if the WebSocket is not in OPEN state or input is blank.
   */
  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;

    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    // Build the WS payload. target_user_id=null means broadcast to everyone.
    const targetId = chatRecipient === 'everyone' ? null : chatRecipient;
    socket.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      message_text: text,
      target_user_id: targetId,
    }));

    // Clear the input after sending
    setChatInput('');
  }, [chatInput, chatRecipient, wsRef]);

  return {
    chatMessages,
    chatInput,
    chatRecipient,
    appendChatMessage,
    setChatMessages,
    setChatInput,
    setChatRecipient,
    sendChatMessage,
  };
}
