import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../config';
import { formatAmount } from '../../lib/pricing';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderBadge: string | null;
  content: string;
  timestamp: number;
  type: 'chat' | 'tip' | 'system' | 'spin';
  amount?: number;
  fromName?: string;
}

interface CamLiveChatProps {
  sessionId: string;
  currentUserId: string;
  currentUserName: string;
  onViewerCountUpdate?: (count: number) => void;
}

export const CamLiveChat: React.FC<CamLiveChatProps> = ({
  sessionId,
  currentUserId,
  currentUserName,
  onViewerCountUpdate
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const MAX_MESSAGES = 100;

  useEffect(() => {
    const token = localStorage.getItem('adultAccessToken') || '';
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.emit('cam:join', { sessionId });

    socket.on('cam:new_message', (message: ChatMessage) => {
      setMessages(prev => {
        const updated = [...prev, message];
        return updated.slice(-MAX_MESSAGES);
      });
      // Auto scroll
      requestAnimationFrame(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
      });
    });

    // Handle generic custom event triggers like wheel spin or tip
    socket.on('cam:wheel_spin', (data: { spinnerName: string; itemLabel: string; creditsPaid: number }) => {
      const message: ChatMessage = {
        id: `spin_${Date.now()}_${Math.random()}`,
        senderId: 'system',
        senderName: 'System',
        senderBadge: null,
        content: `🎡 ${data.spinnerName} spun the wheel and got: "${data.itemLabel}" (💎 ${formatAmount(data.creditsPaid)})`,
        timestamp: Date.now(),
        type: 'spin'
      };
      setMessages(prev => [...prev, message].slice(-MAX_MESSAGES));
      requestAnimationFrame(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
      });
    });

    socket.on('cam:viewer_count', (data: { count: number }) => {
      if (onViewerCountUpdate && typeof data.count === 'number') {
        onViewerCountUpdate(data.count);
      }
    });

    socket.on('cam:viewerCount', (count: number) => {
      if (onViewerCountUpdate) {
        onViewerCountUpdate(count);
      }
    });

    return () => {
      socket.emit('cam:leave', { sessionId });
      socket.off('cam:new_message');
      socket.off('cam:wheel_spin');
      socket.off('cam:viewer_count');
      socket.off('cam:viewerCount');
      socket.disconnect();
    };
  }, [sessionId, onViewerCountUpdate]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || !socketRef.current) return;

    // Optimistically add own message
    const optimistic: ChatMessage = {
      id: `local_${Date.now()}_${Math.random()}`,
      senderId: currentUserId,
      senderName: currentUserName,
      senderBadge: null,
      content: text,
      timestamp: Date.now(),
      type: 'chat'
    };

    setMessages(prev => [...prev.slice(-99), optimistic]);
    setInputText('');

    socketRef.current.emit('cam:chat_message', { sessionId, content: text });

    // Auto scroll
    requestAnimationFrame(() => {
      if (feedRef.current) {
        feedRef.current.scrollTop = feedRef.current.scrollHeight;
      }
    });
  };

  return (
    <div className="cam-live-chat flex flex-col h-full bg-[#0a0608]/85 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
      {/* Messages Feed */}
      <div className="cam-chat-feed flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar" ref={feedRef}>
        {messages.length === 0 && (
          <p className="cam-chat-empty text-center text-xs text-white/35 py-10 font-sans font-normal">
            Be the first to say hello! 👋
          </p>
        )}
        {messages.map((msg) => {
          if (msg.type === 'tip') {
            return (
              <div key={msg.id} className="cam-chat-msg cam-chat-msg--tip p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl animate-fadeIn">
                <span className="cam-tip-notif font-bold text-xs text-yellow-400 font-sans block">
                  🎉 <strong>{msg.fromName || msg.senderName}</strong> tipped 💎 {formatAmount(msg.amount)}!
                </span>
              </div>
            );
          }
          if (msg.type === 'spin') {
            return (
              <div key={msg.id} className="cam-chat-msg cam-chat-msg--spin p-3 bg-pink-500/10 border border-pink-500/30 rounded-xl animate-fadeIn">
                <span className="cam-tip-notif font-bold text-xs text-pink-400 font-sans block">
                  {msg.content}
                </span>
              </div>
            );
          }
          return (
            <div key={msg.id} className="cam-chat-msg text-xs leading-relaxed text-white/80 font-sans break-words">
              <span className="cam-chat-name font-bold text-white mr-1.5 inline-flex items-center">
                {msg.senderName}
                {msg.senderBadge && (
                  <span className="cam-chat-badge ml-1 text-xs shrink-0" title={msg.senderBadge}>
                    {msg.senderBadge === 'diamond' ? '💎' : msg.senderBadge === 'gold' ? '⭐' : '⭐'}
                  </span>
                )}:
              </span>
              <span className="cam-chat-content select-text font-normal">{msg.content}</span>
            </div>
          );
        })}
      </div>

      {/* Input row */}
      <div className="cam-chat-input-row flex gap-2 p-3 border-t border-white/5 bg-[#120a10]">
        <input
          type="text"
          maxLength={200}
          placeholder="Say something..."
          className="cam-chat-input flex-1 h-10 bg-white/5 border border-white/10 rounded-full px-4 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50 transition-colors"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="cam-chat-send w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center transition-colors disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  );
};
export default CamLiveChat;
