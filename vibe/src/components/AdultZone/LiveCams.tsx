import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';

const CamViewerRoom = React.lazy(() => import('./CamViewerRoom'));

const LiveCams: React.FC = () => {
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const filters = ['All', 'Girls', 'Guys', 'Couples', 'Trans', 'New', 'Top Rated', 'Free', 'HD'];
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  // Watch State
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [agoraToken, setAgoraToken] = useState<string | null>(null);
  const [agoraAppId, setAgoraAppId] = useState<number | null>(null);
  const [agoraRoomId, setAgoraRoomId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);

  const socketRef = useRef<Socket | null>(null);

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  const fetchSessions = async () => {
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
  };

  useEffect(() => {
    fetchSessions();
  }, [activeFilter]);

  // Set up socket integration
  useEffect(() => {
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('cam:session_started', (newSession) => {
      // Map to shape expected in card list
      const formatted = {
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

    socket.on('cam:session_ended', (data) => {
      setSessions(prev => prev.filter(s => s._id !== data.sessionId));
      if (activeSession && activeSession._id === data.sessionId) {
        toast.info('The stream session has ended');
        handleCloseWatch();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, activeSession?._id]);

  const handleWatchNow = async (session: any) => {
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

        // Join live room on socket
        if (socketRef.current) {
          socketRef.current.emit('cam:join', session._id);
          socketRef.current.on('cam:viewerCount', (count) => {
            setViewerCount(count);
          });
          socketRef.current.on('cam:viewer_count', (data) => {
            if (data && typeof data.count === 'number') {
              setViewerCount(data.count);
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

  const handleCloseWatch = () => {
    if (activeSession && socketRef.current) {
      socketRef.current.emit('cam:leave', activeSession._id);
      socketRef.current.off('cam:viewerCount');
      socketRef.current.off('cam:viewer_count');
    }
    setActiveSession(null);
    setAgoraToken(null);
    setAgoraAppId(null);
    setAgoraRoomId(null);
  };

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
                  className="w-full h-full object-cover opacity-70 group-hover:scale-110 transition-transform duration-700"
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
                  <h3 className="text-lg font-serif italic text-white flex items-center gap-2">
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
        <div className="fixed inset-0 bg-black z-[10000] flex flex-col items-center justify-between text-white">
          <div className="absolute inset-0 bg-[#0a0608] z-0">
            <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading stream viewer...</div>}>
              <CamViewerRoom
                appId={agoraAppId}
                token={agoraToken}
                roomId={agoraRoomId}
                userId={user?.id || ''}
                userName={user?.firstName || 'Viewer'}
                onUserCountUpdate={setViewerCount}
              />
            </React.Suspense>
          </div>

          {/* Floating Close Header & Tips Controls */}
          <div className="absolute top-4 inset-x-4 z-10 flex justify-between items-center bg-black/40 backdrop-blur-md p-4 rounded-xl">
            <div className="text-left">
              <h4 className="font-bold text-sm">{activeSession.providerId?.username || 'Live Cam'}</h4>
              <span className="text-[10px] text-yellow-400">👁️ {viewerCount} viewing</span>
            </div>
            <button
              onClick={handleCloseWatch}
              className="w-10 h-10 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-[var(--az-border)] transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Tips / Interaction Footer */}
          <div className="absolute bottom-4 inset-x-4 z-10 flex justify-between items-center bg-black/40 backdrop-blur-md p-4 rounded-xl">
            <div className="text-xs text-[var(--az-text-secondary)] font-serif italic">
              Support {activeSession.providerId?.username || 'Performer'} by sending tips
            </div>
            <button
              onClick={() => {
                // Tipping flows are globally connected to the TipSheet window events
                const customEvent = new CustomEvent('open-tip-sheet', { detail: { providerId: activeSession.providerId?._id } });
                window.dispatchEvent(customEvent);
              }}
              className="px-6 py-2.5 bg-[var(--az-accent-gold)] text-black font-bold uppercase tracking-wider text-[10px] rounded-full shadow-[0_0_15px_rgba(234,179,8,0.2)] hover:scale-105 active:scale-95 transition-all"
            >
              💎 TIP PERFORMER
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveCams;
