import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { formatAmount } from '../../lib/pricing';
import { io, Socket } from 'socket.io-client';

import { WheelEditor } from './WheelEditor';

const ProviderStreamRoom = React.lazy(() => import('./ProviderStreamRoom'));

interface ChatMessageItem {
  id: string;
  senderName?: string;
  user?: string;
  content?: string;
  text?: string;
  type?: string;
  amount?: number;
  tip?: number;
}

const ProviderLive: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('adultAccessToken') || '';
  const { user } = useAdultAuth();

  const queryParams = new URLSearchParams(location.search);
  const autoStart = queryParams.get('autoStart') === 'true' || location.state?.autoStartStream === true;

  const [isLive, setIsLive] = useState(false);
  const [duration, setDuration] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [sessionTips, setSessionTips] = useState(0);
  const [showWheelEditor, setShowWheelEditor] = useState(false);

  // Agora States
  const [agoraToken, setAgoraToken] = useState<string | null>(null);
  const [agoraAppId, setAgoraAppId] = useState<number | null>(null);
  const [agoraRoomId, setAgoraRoomId] = useState<string | null>(null);
  const [agoraSessionId, setAgoraSessionId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      setDuration(0);
    };
  }, [isLive]);

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!token || !user) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('cam:tip_received', (data: { recipientId?: string; amount?: number; fromName?: string }) => {
      const userObj = user as unknown as { id?: string; _id?: string };
      const myId = userObj.id || userObj._id;
      if (data && data.recipientId === myId) {
        const tipAmt = data.amount || 0;
        const fromName = data.fromName || 'Someone';

        setSessionTips(prev => prev + tipAmt);
        setChatMessages(prev => [
          ...prev,
          {
            id: 'tip-rec-' + Date.now(),
            senderName: fromName,
            content: `Tipped ${tipAmt} credits!`,
            type: 'tip',
            amount: tipAmt
          }
        ]);
        toast.success(`🎉 Received a tip of 💎 ${tipAmt} from ${fromName}!`);
      }
    });

    socket.on('cam:new_message', (message: ChatMessageItem) => {
      // If it's a live tip in the room, increment cumulative tips!
      if (message.type === 'tip') {
        const amt = message.amount || 0;
        setSessionTips(prev => prev + amt);
      }
      setChatMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    socket.on('cam:wheel_spin', (data: { spinnerName?: string; itemLabel?: string; creditsPaid?: number }) => {
      setChatMessages(prev => [
        ...prev,
        {
          id: 'spin-' + Date.now() + '-' + Math.random(),
          senderName: 'System',
          content: `🎡 ${data.spinnerName || 'Someone'} spun the wheel and got: "${data.itemLabel || ''}" (💎 ${formatAmount(data.creditsPaid || 0)})`,
          type: 'spin'
        }
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  const handleStartStream = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/adult/cams/stream/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          title: 'Live Cam Session',
          sessionType: 'public',
        })
      });
      const resData = await res.json();
      if (resData.success && resData.data) {
        const { sessionId, roomId, token: zToken, appId } = resData.data;
        setAgoraToken(zToken);
        setAgoraAppId(appId);
        setAgoraRoomId(roomId);
        setAgoraSessionId(sessionId);
        setIsLive(true);
        toast.success('Successfully started live streaming session!');

        // Join live room on socket
        if (socketRef.current) {
          socketRef.current.emit('cam:join', sessionId);
          socketRef.current.on('cam:viewerCount', (count: number) => {
            setViewerCount(count);
          });
          socketRef.current.on('cam:viewer_count', (data: { count?: number }) => {
            if (data && typeof data.count === 'number') {
              setViewerCount(data.count);
            }
          });
        }
      } else {
        const errorMsg = typeof resData.error === 'string' ? resData.error : (resData.error?.message || 'Failed to start stream');
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to connect to stream server');
    }
  }, [getHeaders]);

  useEffect(() => {
    if (autoStart && !isLive && token && user) {
      let isMounted = true;
      const start = async () => {
        await Promise.resolve();
        if (isMounted) {
          void handleStartStream();
        }
      };
      void start();
      // Remove ?autoStart param from URL immediately
      const params = new URLSearchParams(window.location.search);
      if (params.has('autoStart')) {
        params.delete('autoStart');
        const newRelativePathQuery = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(null, '', newRelativePathQuery);
      }
      return () => {
        isMounted = false;
      };
    }
  }, [autoStart, isLive, token, user, handleStartStream]);

  const handleEndStream = async () => {
    if (!window.confirm('Are you sure you want to end this webcam session?')) return;
    try {
      if (agoraSessionId) {
        await fetch(`${API_BASE_URL}/adult/cams/stream/${agoraSessionId}/end`, {
          method: 'PATCH',
          headers: getHeaders()
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (agoraSessionId && socketRef.current) {
        socketRef.current.emit('cam:leave', agoraSessionId);
        socketRef.current.off('cam:viewerCount');
        socketRef.current.off('cam:viewer_count');
      }
      setIsLive(false);
      setAgoraToken(null);
      setAgoraAppId(null);
      setAgoraRoomId(null);
      setAgoraSessionId(null);
      setViewerCount(0);
      toast.info(`Session ended. Tips accumulated: 💎 ${formatAmount(sessionTips)}`);
    }
  };

  const handleSendChat = () => {
    const text = inputText.trim();
    if (!text) return;
    if (isLive && agoraSessionId && socketRef.current) {
      socketRef.current.emit('cam:chat_message', { sessionId: agoraSessionId, content: text });
    } else {
      setChatMessages(prev => [
        ...prev,
        {
          id: 'msg-offline-' + Date.now(),
          senderName: 'Me (Offline)',
          content: text,
          type: 'chat'
        }
      ]);
    }
    setInputText('');
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Video Preview Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-black border border-[var(--az-border)] rounded-3xl aspect-video relative overflow-hidden flex flex-col justify-between p-6 shadow-2xl">
            {/* Top Row indicators */}
            <div className="flex justify-between items-center z-10">
              {isLive ? (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[var(--az-accent-primary)] text-white text-[10px] font-bold uppercase rounded-full shadow-[0_0_10px_var(--az-glow)] animate-pulse">
                    🔴 Live Room
                  </span>
                  <span className="font-mono text-xs bg-black/60 px-2.5 py-1 rounded-full text-white">
                    {formatDuration(duration)}
                  </span>
                </div>
              ) : (
                <span className="px-3 py-1 bg-[var(--az-bg-secondary)] text-[var(--az-text-secondary)] text-[10px] font-bold uppercase rounded-full">
                  Offline Preview
                </span>
              )}

              <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full">
                <span className="text-[10px] text-white font-mono">👁️ {viewerCount}</span>
              </div>
            </div>

            {/* Video preview / Agora host container */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isLive && agoraToken && agoraAppId && agoraRoomId && agoraSessionId ? (
                <div className="w-full h-full">
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading stream host...</div>}>
                    <ProviderStreamRoom
                      appId={agoraAppId}
                      token={agoraToken}
                      roomId={agoraRoomId}
                      userId={user?.id || ''}
                      userName={user?.firstName || 'Provider'}
                      sessionId={agoraSessionId}
                      providerAvatar={(user as any)?.avatarUrl || (user as any)?.profilePhoto}
                      providerName={user?.firstName || 'Provider'}
                      onEnd={handleEndStream}
                    />
                  </React.Suspense>
                </div>
              ) : (
                <div className="text-center space-y-2 pointer-events-none">
                  <span className="text-5xl opacity-40">📹</span>
                  <p className="text-xs text-[var(--az-text-muted)] font-serif italic">Camera Offline</p>
                </div>
              )}
            </div>

            {/* Bottom Stream Control Bar */}
            <div className="flex justify-end items-center z-10 border-t border-[var(--az-border)]/20 pt-4 mt-auto bg-black/35 backdrop-blur-sm -mx-6 -mb-6 p-6">
              {!isLive ? (
                <button
                  onClick={handleStartStream}
                  className="px-10 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all"
                >
                  Start Webcam Session
                </button>
              ) : (
                <button
                  onClick={handleEndStream}
                  className="px-10 py-3 bg-red-950 text-red-400 border border-red-500/30 hover:bg-red-900 font-bold text-xs uppercase tracking-widest rounded-full transition-all"
                >
                  End Session
                </button>
              )}
            </div>
          </div>

          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-serif italic text-white">Cumulative Session Tips</h4>
              <p className="text-xs text-[var(--az-text-secondary)] mt-0.5">Tip metrics accumulated from public viewing arena</p>
            </div>
            <span className="text-3xl font-mono font-bold text-[var(--az-accent-gold)]">💎 {formatAmount(sessionTips)}</span>
          </div>

          <div className="stream-tools mt-4">
            <h3 className="stream-tools__title text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Stream Tools</h3>
            <button
              onClick={() => setShowWheelEditor(true)}
              className="stream-tool-link flex items-center gap-4 p-4 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl cursor-pointer hover:border-pink-500/50 transition-all text-left w-full"
            >
              <span className="stream-tool-link__icon text-2xl">🎡</span>
              <div className="stream-tool-link__text flex-1">
                <span className="stream-tool-link__label block font-semibold text-sm text-white">Spin Wheel Editor</span>
                <span className="stream-tool-link__desc block text-xs text-[var(--az-text-secondary)] mt-1">Update your wheel while live</span>
              </div>
              <span className="stream-tool-link__arrow text-gray-400">→</span>
            </button>
          </div>
        </div>

        {/* Right: Live Chat arena */}
        <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 h-[500px] flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-serif italic text-white mb-2">Live Room Chat</h3>
            <p className="text-[10px] text-[var(--az-text-secondary)] border-b border-[var(--az-border)]/30 pb-3">Spectators interact here in real-time</p>
          </div>

          <div ref={chatEndRef} className="flex-grow overflow-y-auto py-4 space-y-3 pr-1 no-scrollbar">
            {chatMessages.length === 0 && (
              <p className="text-center text-xs text-[var(--az-text-muted)] py-10 font-serif italic">
                No messages yet.
              </p>
            )}
            {chatMessages.map(msg => {
              const isTip = msg.type === 'tip' || msg.tip;
              const isSpin = msg.type === 'spin';
              const sender = msg.senderName || msg.user || 'Spectator';
              const text = msg.content || msg.text || '';
              const tipAmount = msg.amount || msg.tip || 0;

              if (isTip) {
                return (
                  <div key={msg.id} className="p-2 bg-yellow-950/20 border border-yellow-500/30 rounded-lg text-[var(--az-accent-gold)] font-bold mb-1 text-xs">
                    🎉 {sender} tipped 💎 {formatAmount(tipAmount)} credits!
                  </div>
                );
              }

              if (isSpin) {
                return (
                  <div key={msg.id} className="p-2 bg-pink-950/20 border border-pink-500/30 rounded-lg text-pink-400 font-bold mb-1 text-xs">
                    {text}
                  </div>
                );
              }

              return (
                <div key={msg.id} className="text-xs space-y-0.5">
                  <span className="font-bold text-[var(--az-accent-rose)]">{sender}: </span>
                  <span className="text-[var(--az-text-primary)]">{text}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 border-t border-[var(--az-border)]/30 pt-4">
            <input
              type="text"
              placeholder="Chat with spectators..."
              className="flex-grow bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            />
            <button onClick={handleSendChat} className="px-4 py-2.5 bg-[var(--az-accent-rose)] hover:bg-pink-700 text-white font-bold text-xs uppercase rounded-xl">
              Send
            </button>
          </div>
        </div>

      </div>

      {/* Slide-in panel or bottom-sheet for Spin Wheel Editor */}
      {showWheelEditor && (
        <div className="stream-panel-overlay fixed inset-0 bg-black/60 z-[10500] flex justify-end" onClick={() => setShowWheelEditor(false)}>
          <div className="stream-panel w-[450px] max-w-full bg-[#140b13] border-l border-[var(--az-border)] h-full overflow-y-auto p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="stream-panel__header flex justify-between items-center pb-4 border-b border-[var(--az-border)] mb-6">
              <h3 className="text-lg font-serif italic text-white flex items-center gap-2">
                <span>🎡</span> Spin Wheel Editor
              </h3>
              <button
                onClick={() => setShowWheelEditor(false)}
                className="w-8 h-8 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-gray-400 flex items-center justify-center hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1">
              <WheelEditor />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderLive;
