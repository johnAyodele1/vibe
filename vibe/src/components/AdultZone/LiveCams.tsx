import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { useTipSheetStore } from './useTipSheetStore';
import { CamLiveChat } from './CamLiveChat';
import { WheelPreview, type WheelItem } from './WheelEditor';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { formatAmount } from '../../lib/pricing';

const CamViewerRoom = React.lazy(() => import('./CamViewerRoom'));
const CallRoom = React.lazy(() => import('./CallRoom'));

interface ProviderUser {
  _id?: string;
  username?: string;
  profilePhoto?: string;
}

interface CamSession {
  _id: string;
  title?: string;
  totalViewerCount?: number;
  streamKey?: string;
  avatarUrl?: string;
  providerId?: ProviderUser;
}

interface ProviderProfileData {
  id: string;
  stageName: string;
  avatarUrl: string;
}

interface WheelSlice {
  id: string;
  label: string;
  creditCost: number;
  probability?: number;
  color?: string;
}

interface WheelData {
  isActive?: boolean;
  items: WheelSlice[];
}

const LiveCams: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const filters = ['All', 'Girls', 'Guys', 'Couples', 'Trans', 'New', 'Top Rated', 'Free', 'HD'];
  const [sessions, setSessions] = useState<CamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  // Watch State
  const [activeSession, setActiveSession] = useState<CamSession | null>(null);
  const [agoraToken, setAgoraToken] = useState<string | null>(null);
  const [agoraAppId, setAgoraAppId] = useState<number | null>(null);
  const [agoraRoomId, setAgoraRoomId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);

  const [providerProfile, setProviderProfile] = useState<ProviderProfileData | null>(null);
  const [wheel, setWheel] = useState<WheelData | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [landedIndex, setLandedIndex] = useState<number | null>(null);
  const [lastSpinResult, setLastSpinResult] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);

  // 1-to-1 Call States
  const isInitiatingRef = useRef(false);
  const privateCallDataRef = useRef<any>(null);
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [privateCallState, setPrivateCallState] = useState<'idle' | 'calling' | 'active'>('idle');
  const [privateCallData, setPrivateCallData] = useState<any>(null);
  const [privateCallRate, setPrivateCallRate] = useState<number | null>(null);
  const [privateZegoToken, setPrivateZegoToken] = useState<string | null>(null);
  const [privateZegoAppId, setPrivateZegoAppId] = useState<number | null>(null);
  const [privateZegoRoomId, setPrivateZegoRoomId] = useState<string | null>(null);

  useEffect(() => {
    privateCallDataRef.current = privateCallData;
  }, [privateCallData]);

  const openTipSheet = (prov: { userId: string; stageName: string; avatarUrl: string; isOnline: boolean }, amt?: number | null) =>
    useTipSheetStore.getState().openSheet(prov, amt);
  const socketRef = useRef<Socket | null>(null);

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const handleCloseWatch = useCallback(() => {
    if (activeSession && socketRef.current) {
      socketRef.current.emit('cam:leave', activeSession._id);
      socketRef.current.off('cam:viewerCount');
      socketRef.current.off('cam:viewer_count');
      socketRef.current.off('cam:wheel_spin');
    }
    setActiveSession(null);
    setAgoraToken(null);
    setAgoraAppId(null);
    setAgoraRoomId(null);
    setWheel(null);
    setProviderProfile(null);
    setSpinning(false);
    setLandedIndex(null);
    setLastSpinResult(null);
  }, [activeSession]);

  const resetPrivateCallState = () => {
    privateCallDataRef.current = null;
    setPrivateCallData(null);
    setPrivateCallState('idle');
    setPrivateCallRate(null);
    setPrivateZegoToken(null);
    setPrivateZegoAppId(null);
    setPrivateZegoRoomId(null);
  };

  const handleInitiatePrivateCall = async () => {
    if (isInitiatingRef.current || isInitiatingCall || privateCallState !== 'idle') return;
    const targetProviderId = providerProfile?.id || (typeof activeSession?.providerId === 'object' ? activeSession.providerId._id : activeSession?.providerId);
    if (!targetProviderId) {
      toast.error('Provider not found');
      return;
    }

    isInitiatingRef.current = true;
    setIsInitiatingCall(true);

    try {
      // 1. Get or start conversation
      const convRes = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ recipientId: targetProviderId })
      });
      const convData = await convRes.json();
      if (!convData.success || !convData.conversationId) {
        toast.error(convData.error || 'Failed to start conversation with provider');
        setIsInitiatingCall(false);
        return;
      }

      // 2. Initiate video call
      const callRes = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/initiate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          conversationId: convData.conversationId,
          type: 'video'
        })
      });
      const callDataRes = await callRes.json();

      if (callDataRes.callId) {
        const rate = (providerProfile as any)?.videoCallPrice || (providerProfile as any)?.pricePerMinute || callDataRes.perMinuteRate;
        if (!rate) {
          toast.error('Provider call rate not configured');
          setIsInitiatingCall(false);
          return;
        }

        privateCallDataRef.current = callDataRes;
        setPrivateCallData(callDataRes);
        setPrivateCallRate(rate);
        setPrivateCallState('calling');

        // Pre-fetch Zego/WebRTC token
        const tokenRes = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${callDataRes.roomId}&type=call`, {
          headers: getHeaders()
        });
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
          setPrivateZegoToken(tokenData.token);
          setPrivateZegoAppId(tokenData.appId);
          setPrivateZegoRoomId(callDataRes.roomId);
        }
      } else {
        const errorMsg = typeof callDataRes.error === 'string' ? callDataRes.error : (callDataRes.error?.message || 'This provider is busy or unavailable. Try again later.');
        toast.error(errorMsg);
      }
    } catch (err) {
      toast.error('Failed to initiate 1-to-1 video call');
    } finally {
      isInitiatingRef.current = false;
      setIsInitiatingCall(false);
    }
  };

  const handleCancelPrivateCall = async () => {
    const currentCall = privateCallDataRef.current || privateCallData;
    if (currentCall?.callId) {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${currentCall.callId}/end`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ reason: 'cancelled_by_caller' })
        });
      } catch (e) {
        console.error(e);
      }
    }
    resetPrivateCallState();
  };

  const handleEndPrivateCall = async () => {
    const currentCall = privateCallDataRef.current || privateCallData;
    if (currentCall?.callId) {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${currentCall.callId}/end`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ reason: 'hung_up' })
        });
      } catch (e) {
        console.error(e);
      }
    }
    resetPrivateCallState();
  };

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/adult/cams?status=live`, {
        headers: getHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setSessions(data.data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      await fetchSessions();
      if (!isMounted) return;
    };
    void load();
    return () => { isMounted = false; };
  }, [fetchSessions, activeFilter]);

  // Set up socket integration
  useEffect(() => {
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('call:accepted', async () => {
      const activeData = privateCallDataRef.current;
      if (activeData?.roomId) {
        try {
          const tokenRes = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${activeData.roomId}&type=call`, {
            headers: getHeaders()
          });
          const tokenData = await tokenRes.json();
          if (tokenData.token) {
            setPrivateZegoToken(tokenData.token);
            setPrivateZegoAppId(tokenData.appId);
            setPrivateZegoRoomId(activeData.roomId);
            setPrivateCallState('active');
          } else {
            toast.error('Failed to get call connection token');
            handleCancelPrivateCall();
          }
        } catch (e) {
          toast.error('Call token error');
          handleCancelPrivateCall();
        }
      } else {
        setPrivateCallState('active');
      }
    });

    socket.on('call:declined', () => {
      resetPrivateCallState();
      toast.error('Provider declined the private call request');
    });

    socket.on('call:ended', () => {
      resetPrivateCallState();
    });

    socket.on('call:missed', () => {
      resetPrivateCallState();
      toast.info('No answer from provider');
    });

    socket.on('cam:session_started', (newSession: { sessionId: string; title?: string; viewerCount?: number; streamKey?: string; providerId?: string; providerName?: string; avatarUrl?: string }) => {
      // Map to shape expected in card list
      const formatted: CamSession = {
        _id: newSession.sessionId,
        title: newSession.title || 'Live Cam',
        totalViewerCount: newSession.viewerCount || 0,
        streamKey: newSession.streamKey,
        providerId: {
          _id: newSession.providerId,
          username: newSession.providerName,
          profilePhoto: newSession.avatarUrl
        }
      };

      setSessions(prev => {
        // Prevent duplicate entries
        if (prev.some(s => s._id === formatted._id)) return prev;
        return [formatted, ...prev];
      });
    });

    socket.on('cam:session_ended', (data: { sessionId: string }) => {
      setSessions(prev => prev.filter(s => s._id !== data.sessionId));
      if (activeSession && activeSession._id === data.sessionId) {
        toast.info('The stream session has ended');
        handleCloseWatch();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, activeSession, handleCloseWatch]);

  const handleWatchNow = async (session: CamSession) => {
    if (!token) {
      toast.error('Authentication required to watch streams');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/adult/cams/${session._id}/token`, {
        headers: getHeaders()
      });
      const resData = await res.json();
      if (resData.token) {
        setAgoraToken(resData.token);
        setAgoraAppId(resData.appId);
        setAgoraRoomId(resData.roomId);
        setActiveSession(session);
        setViewerCount(session.totalViewerCount || 0);

        // Fetch provider profile for tipping details
        try {
          const pRes = await fetch(`${API_BASE_URL}/v1/adult/providers/${session.providerId?._id || session.providerId}`, {
            headers: getHeaders()
          });
          const pData = await pRes.json();
          if (pData.success) {
            setProviderProfile(pData.data);
          }
        } catch (err) {
          console.error('Failed to fetch provider details:', err);
        }

        // Fetch provider's active wheel
        try {
          const wRes = await fetch(`${API_BASE_URL}/v1/adult/providers/${session.providerId?._id || session.providerId}/wheel`, {
            headers: getHeaders()
          });
          const wData = await wRes.json();
          if (wData.success && wData.data && wData.data.isActive) {
            setWheel(wData.data);
          } else {
            setWheel(null);
          }
        } catch (err) {
          console.error('Failed to fetch wheel:', err);
          setWheel(null);
        }

        // Join live room on socket
        if (socketRef.current) {
          socketRef.current.emit('cam:join', session._id);
          socketRef.current.on('cam:viewerCount', (count: number) => {
            setViewerCount(count);
          });
          socketRef.current.on('cam:viewer_count', (data: { count?: number }) => {
            if (data && typeof data.count === 'number') {
              setViewerCount(data.count);
            }
          });

          // Listen to wheel spins from others
          socketRef.current.on('cam:wheel_spin', (data: { spinnerName: string; itemId: string; itemLabel: string; creditsPaid: number }) => {
            // Find landed slice index
            try {
              const fetchWheelFresh = async () => {
                const wRes = await fetch(`${API_BASE_URL}/v1/adult/providers/${session.providerId?._id || session.providerId}/wheel`, {
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}` }
                });
                const wData = await wRes.json();
                if (wData.success && wData.data && wData.data.items) {
                  const idx = wData.data.items.findIndex((item: WheelSlice) => item.id === data.itemId);
                  if (idx !== -1) {
                    setLandedIndex(idx);
                    setSpinning(true);
                    setTimeout(() => {
                      setLastSpinResult(data.itemLabel);
                      setSpinning(false);
                    }, 4200);
                  }
                }
              };
              void fetchWheelFresh();
            } catch (e) {
              console.error(e);
            }
          });
        }
      } else {
        toast.error(resData.error || 'Failed to fetch viewer token');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to connect to stream server');
    }
  };

  const handleSpinWheel = async () => {
    if (!activeSession || !wheel) return;
    setSpinning(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/providers/${activeSession.providerId?._id || activeSession.providerId}/wheel/spin`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ camSessionId: activeSession._id })
      });
      const data = await response.json();
      if (response.status === 402) {
        toast.error('Insufficient tokens. Please get more tokens.');
        setSpinning(false);
        return;
      }
      if (response.ok) {
        // Trigger local SVG rotation matching landed index
        const idx = wheel.items.findIndex((item: WheelSlice) => item.id === data.itemId);
        if (idx !== -1) {
          setLandedIndex(idx);
          setTimeout(() => {
            setLastSpinResult(data.itemLabel);
            setSpinning(false);
            toast.success(`🎡 Landed on: "${data.itemLabel}"!`);
          }, 4200);
        } else {
          setSpinning(false);
          toast.success(`🎡 Spun wheel and landed on "${data.itemLabel}"!`);
        }
      } else {
        toast.error(data.error || 'Spin transaction failed');
        setSpinning(false);
      }
    } catch {
      toast.error('Error spinning the wheel');
      setSpinning(false);
    }
  };

  const formattedWheelItems: WheelItem[] = (wheel?.items || []).map((item, idx) => ({
    id: item.id,
    label: item.label,
    creditCost: item.creditCost,
    probability: item.probability || 1,
    color: item.color || ['#c8102e', '#e8496a', '#c9a84c', '#a78bfa', '#22c55e', '#3b82f6', '#f97316', '#ec4899'][idx % 8]
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Filter Bar */}
      <div className="flex gap-3 overflow-x-auto pb-6 no-scrollbar mb-8">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap border transition-all ${
              activeFilter === filter
                ? 'bg-[var(--az-accent-primary)] border-transparent text-white'
                : 'bg-[var(--az-bg-secondary)] border-[var(--az-border)] text-[var(--az-text-secondary)] hover:border-[var(--az-accent-rose)]'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <h2 className="text-3xl font-serif italic text-[var(--az-text-primary)] mb-8 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-[var(--az-accent-primary)] az-pulse-red" />
        Live Performers
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="aspect-[3/4] bg-[var(--az-bg-secondary)] rounded-xl animate-pulse" />)
        ) : sessions.length === 0 ? (
          <div className="col-span-full py-20 text-center">
            <p className="text-[var(--az-text-secondary)] font-serif italic">No live performers right now.</p>
          </div>
        ) : sessions.map((s) => {
          const provider = s.providerId || {};
          return (
            <div
              key={s._id}
              className="group bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden az-card-hover"
            >
              <div className="aspect-[3/4] relative overflow-hidden bg-black">
                <img
                  src={provider.profilePhoto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop"}
                  alt={provider.username}
                  className="absolute inset-0 w-full h-full object-cover object-top opacity-70 group-hover:scale-110 transition-transform duration-700"
                />

                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="bg-[var(--az-accent-primary)] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-[0_0_8px_var(--az-glow)] az-pulse-red">
                    LIVE
                  </span>
                </div>

                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded flex items-center gap-1">
                  <span className="text-[10px] text-white font-mono">👁️ {s.totalViewerCount || 0}</span>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent">
                  <h3
                    onClick={(e) => {
                      e.stopPropagation();
                      if (provider._id) {
                        navigate(`/adult/providers/${provider._id}`);
                      }
                    }}
                    className="text-lg font-serif italic text-white flex items-center gap-2 cursor-pointer hover:underline"
                  >
                    {provider.username || 'Provider'} <span className="text-sm">🌍</span>
                  </h3>
                  <p className="text-xs text-[var(--az-text-secondary)] font-sans mt-1 line-clamp-1">{s.title || 'Live'}</p>
                </div>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleWatchNow(s)}
                  className="flex-grow py-2 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-accent-primary)] text-[var(--az-text-primary)] text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors border border-[var(--az-border)]"
                >
                  Watch Now
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* WATCH STREAM FULL SCREEN MODAL */}
      {activeSession && agoraToken && agoraAppId && agoraRoomId && (
        <div className="fixed inset-0 bg-[#0a0608] z-[10000] flex flex-col md:flex-row text-white overflow-hidden">
          {/* Main stream video viewport (Takes full height/width on mobile, left side on desktop) */}
          <div className="relative flex-1 h-full bg-[#050305] flex items-center justify-center z-0">
            <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500 font-serif italic">Streaming session starting...</div>}>
              <CamViewerRoom
                appId={agoraAppId}
                token={agoraToken}
                roomId={agoraRoomId}
                userId={user?.id || ''}
                userName={user?.firstName || 'Viewer'}
                providerAvatar={providerProfile?.avatarUrl || activeSession?.providerId?.profilePhoto || activeSession?.avatarUrl}
                providerName={providerProfile?.stageName || activeSession?.providerId?.username || 'Performer'}
                onUserCountUpdate={setViewerCount}
              />
            </React.Suspense>

            {/* Floating Close Header & Spectators metrics */}
            <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5">
              <div className="text-left">
                <h4 className="font-serif italic text-base font-bold text-white leading-tight">
                  {providerProfile?.stageName || activeSession.providerId?.username || 'Live Cam'}
                </h4>
                <span className="text-[10px] text-yellow-400 font-mono tracking-widest uppercase">
                  👁️ {viewerCount} spectators
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleInitiatePrivateCall}
                  disabled={isInitiatingCall || privateCallState !== 'idle'}
                  data-testid="live-cam-video-call-btn"
                  className="px-3 py-1.5 bg-pink-600/80 hover:bg-pink-600 border border-pink-500/30 text-white rounded-full text-xs font-medium backdrop-blur-sm transition-all flex items-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
                  aria-label="Start 1-to-1 video call"
                  title="1-to-1 Video Call"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                  <span>{isInitiatingCall ? 'Calling...' : '1-to-1 Call'}</span>
                </button>

                <button
                  onClick={handleCloseWatch}
                  className="w-10 h-10 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-[var(--az-border)] transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>


            {/* Support Performer and direct tip quick trigger (Bottom overlay footer on the video player) */}
            <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-center bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5">
              <div className="text-xs text-[var(--az-text-secondary)] font-serif italic truncate mr-2">
                Support {providerProfile?.stageName || activeSession.providerId?.username || 'Performer'} by sending tips
              </div>
              <button
                onClick={() => {
                  if (providerProfile) {
                    openTipSheet({
                      userId: providerProfile.id,
                      stageName: providerProfile.stageName,
                      avatarUrl: providerProfile.avatarUrl,
                      isOnline: true
                    });
                  } else {
                    const customEvent = new CustomEvent('open-tip-sheet', { detail: { providerId: activeSession.providerId?._id } });
                    window.dispatchEvent(customEvent);
                  }
                }}
                className="px-6 py-2.5 bg-[var(--az-accent-gold)] text-black font-bold uppercase tracking-wider text-[10px] rounded-full shadow-[0_0_15px_rgba(234,179,8,0.2)] hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                💎 TIP PERFORMER
              </button>
            </div>

            {/* Mobile-Only Action Overlay Buttons on the screen corner */}
            <div className="md:hidden absolute bottom-24 right-4 z-20 flex flex-col gap-3">
              {/* Wheel toggle button if active */}
              {wheel && (
                <button
                  onClick={() => setWheelOpen(!wheelOpen)}
                  className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-xl shadow-lg relative"
                >
                  🎡
                </button>
              )}

              {/* Chat drawer toggle button */}
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-xl shadow-lg"
              >
                💬
              </button>
            </div>

            {/* Mobile Chat backdrop overlay */}
            {chatOpen && (
              <div
                className="md:hidden fixed inset-0 bg-black/40 z-40 transition-opacity"
                onClick={() => setChatOpen(false)}
              />
            )}

            {/* Mobile bottom slide-up glassmorphic drawer for ephemeral chat */}
            <div className={`md:hidden fixed bottom-0 left-0 right-0 h-[45%] bg-[#0d070a]/92 backdrop-blur-xl border-t border-white/10 rounded-t-3xl transition-transform duration-300 z-50 flex flex-col ${chatOpen ? 'translate-y-0' : 'translate-y-full'}`}>
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto my-3 shrink-0 cursor-pointer" onClick={() => setChatOpen(false)} />
              <div className="flex-1 p-3 min-h-0">
                <CamLiveChat
                  sessionId={activeSession._id}
                  currentUserId={user?.id || ''}
                  currentUserName={user?.firstName || 'Guest'}
                  onViewerCountUpdate={setViewerCount}
                />
              </div>
            </div>

            {/* Mobile slide-up/fade overlay modal for spinning the SVG wheel */}
            {wheel && wheelOpen && (
              <div
                className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
                onClick={() => setWheelOpen(false)}
              >
                <div
                  className="bg-[#120a10] border border-[var(--az-border)] rounded-3xl p-6 w-full max-w-sm flex flex-col items-center relative animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button onClick={() => setWheelOpen(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/50">✕</button>
                  <h3 className="text-base font-serif italic text-white mb-2">Performer Spin Wheel</h3>

                  <WheelPreview items={formattedWheelItems} spinning={spinning} landedIndex={landedIndex} />

                  <button
                    onClick={handleSpinWheel}
                    disabled={spinning}
                    className="w-full h-11 bg-[var(--az-accent-crimson)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {spinning ? 'SPINNING...' : `SPIN WHEEL (💎 ${wheel.items[0]?.creditCost || 5})`}
                  </button>

                  {lastSpinResult && (
                    <span className="text-xs text-pink-400 font-medium font-sans mt-3 text-center">
                      Last landed: "{lastSpinResult}"
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Right Sidebar Panel (Takes 400px width on desktop view, hidden on mobile) */}
          <div className="hidden md:flex flex-col w-[380px] h-full bg-[#0a0608] border-l border-white/5 shrink-0 z-10 divide-y divide-white/5 overflow-y-auto no-scrollbar">
            {/* Top Widget: SVG Spin Wheel if active */}
            {wheel && (
              <div className="p-4 flex flex-col items-center bg-[#10070c]/50">
                <h4 className="text-xs font-serif italic text-pink-400 uppercase tracking-widest">Interactive Wheel</h4>
                <WheelPreview items={formattedWheelItems} spinning={spinning} landedIndex={landedIndex} />
                <button
                  onClick={handleSpinWheel}
                  disabled={spinning}
                  className="w-full h-10 bg-[var(--az-accent-crimson)] hover:bg-red-700 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1 shrink-0"
                >
                  {spinning ? 'SPINNING...' : `SPIN THE WHEEL (💎 ${wheel.items[0]?.creditCost || 5}+)`}
                </button>
                {lastSpinResult && (
                  <span className="text-[10px] text-white/50 mt-2 font-sans font-medium text-center leading-none">
                    Last result: <strong className="text-pink-400">"{lastSpinResult}"</strong>
                  </span>
                )}
              </div>
            )}

            {/* Bottom Widget: Ephemeral Live Chat Feed */}
            <div className="flex-1 p-3 min-h-0 flex flex-col">
              <span className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase mb-2 pl-1 block">Live Chat Feed</span>
              <div className="flex-1 min-h-0">
                <CamLiveChat
                  sessionId={activeSession._id}
                  currentUserId={user?.id || ''}
                  currentUserName={user?.firstName || 'Guest'}
                  onViewerCountUpdate={setViewerCount}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing Private Call Ringing Overlay (Top-level, independent of activeSession) */}
      {privateCallState === 'calling' && (
        <div
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
        >
          <div className="w-28 h-28 rounded-full border-4 border-pink-500 animate-pulse mb-4 overflow-hidden">
            <img
              src={providerProfile?.avatarUrl || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.profilePhoto : activeSession?.avatarUrl) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop"}
              alt="Provider"
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-2xl font-serif italic text-white mb-1">
            {providerProfile?.stageName || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.username : 'Performer')}
          </h3>
          <p className="text-xs text-pink-400 uppercase tracking-widest font-mono animate-pulse">Requesting 1-to-1 Video Call...</p>
          {privateCallRate !== null && (
            <p className="text-xs text-yellow-400 mt-2 font-mono">Rate: 💎 {formatAmount(privateCallRate)} credits / min</p>
          )}

          <button
            onClick={handleCancelPrivateCall}
            className="mt-8 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all"
          >
            Cancel Call ✕
          </button>
        </div>
      )}

      {/* Active Private 1-to-1 Call Overlay (Top-level, independent of activeSession) */}
      {privateCallState === 'active' && privateZegoToken && privateZegoAppId && privateZegoRoomId && (
        <div
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 z-[12000] bg-black"
        >
          <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading call...</div>}>
            <CallRoom
              key={privateZegoRoomId}
              appId={privateZegoAppId}
              token={privateZegoToken}
              roomId={privateZegoRoomId}
              userId={user?.id || ''}
              userName={user?.firstName || 'User'}
              callType="video"
              onCallEnd={handleEndPrivateCall}
              partnerName={providerProfile?.stageName || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.username : 'Performer')}
              partnerAvatar={providerProfile?.avatarUrl || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.profilePhoto : activeSession?.avatarUrl)}
              providerAvatar={providerProfile?.avatarUrl || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.profilePhoto : activeSession?.avatarUrl)}
              providerName={providerProfile?.stageName || (typeof activeSession?.providerId === 'object' ? activeSession.providerId.username : 'Performer')}
            />
          </React.Suspense>
        </div>
      )}
    </div>
  );
};

export default LiveCams;
