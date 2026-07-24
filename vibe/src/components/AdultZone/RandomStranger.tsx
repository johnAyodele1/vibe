import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';

const RandomMatchRoom = React.lazy(() => import('./RandomMatchRoom'));

type RandomState = 'idle' | 'queued' | 'matched' | 'ended';

const RandomStranger: React.FC = () => {
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const [state, setState] = useState<RandomState>('idle');
  const [matchData, setMatchData] = useState<any>(null);

  const socketRef = useRef<Socket | null>(null);

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  // Listen for socket match events
  useEffect(() => {
    if (!token) return;

    const s = io(`${SOCKET_URL}/adult`, {
      auth: { token }
    });

    s.on('connect', () => {
      console.log('Random Match Socket connected:', s.id);
    });

    s.on('random:match_found', (data: any) => {
      console.log('Random Match found:', data);
      setMatchData(data);
      setState('matched');
      toast.success('Stranger matched! Connecting video...');
    });

    s.on('random:partner_left', () => {
      toast.info('Stranger disconnected. Re-queuing...');
      handleNext();
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
    };
  }, [token]);

  const handleStart = async () => {
    if (!token) {
      toast.error('Authentication required');
      return;
    }
    setState('queued');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ mode: 'video' })
      });
      const data = await res.json();
      if (data.success && data.data && data.data.status === 'matched') {
        // Matched immediately
        setMatchData(data.data);
        setState('matched');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to join matching queue');
      setState('idle');
    }
  };

  const handleNext = async () => {
    if (matchData) {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/random/${matchData.matchId}/next`, {
          method: 'POST',
          headers: getHeaders()
        });
      } catch (err) {
        console.error(err);
      }
    }
    setMatchData(null);
    setState('queued');
    // Re-queue
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ mode: 'video' })
      });
      const data = await res.json();
      if (data.success && data.data && data.data.status === 'matched') {
        setMatchData(data.data);
        setState('matched');
      }
    } catch (err) {
      console.error(err);
      setState('idle');
    }
  };

  const handleEnd = async () => {
    if (matchData) {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/random/${matchData.matchId}/end`, {
          method: 'POST',
          headers: getHeaders()
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
          method: 'DELETE',
          headers: getHeaders()
        });
      } catch (err) {
        console.error(err);
      }
    }
    setMatchData(null);
    setState('idle');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-4 py-20 text-center">
      {state === 'idle' && (
        <div className="max-w-md w-full">
          <div className="w-24 h-24 bg-[var(--az-bg-secondary)] border-2 border-[var(--az-accent-primary)] rounded-full flex items-center justify-center text-4xl mb-8 mx-auto shadow-[0_0_30px_var(--az-glow)]">
            🎲
          </div>

          <h1 className="text-4xl font-serif italic text-[var(--az-text-primary)] mb-2">Find Your Match</h1>
          <p className="text-[var(--az-text-secondary)] font-serif italic mb-10">Anonymous. Consensual. Electric.</p>

          <div className="bg-[var(--az-bg-secondary)] p-8 rounded-2xl border border-[var(--az-border)] text-left space-y-6 mb-10 shadow-2xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">Looking for:</label>
              <div className="flex gap-2">
                {['Girls', 'Guys', 'Anyone'].map(opt => (
                  <button key={opt} className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${opt === 'Anyone' ? 'bg-[var(--az-accent-primary)] border-transparent text-white' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">Mode:</label>
              <div className="flex gap-2">
                {['Text Only', 'Cam', 'Both'].map(opt => (
                  <button key={opt} className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${opt === 'Both' ? 'bg-[var(--az-accent-primary)] border-transparent text-white' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="w-full py-5 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-[0.2em] rounded-full shadow-[0_0_25px_var(--az-glow)] hover:scale-105 active:scale-95 transition-all"
          >
            START MATCHING
          </button>
        </div>
      )}

      {state === 'queued' && (
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 mb-10">
            <div className="absolute inset-0 border-4 border-[var(--az-accent-primary)] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-4 border-4 border-[var(--az-accent-rose)] border-b-transparent rounded-full animate-spin-slow" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">🔍</div>
          </div>
          <h2 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-2 animate-pulse">Finding your stranger...</h2>
          <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">The best things are worth the wait.</p>

          <button
            onClick={handleEnd}
            className="mt-12 text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] hover:text-[var(--az-text-secondary)] underline"
          >
            Cancel and Go Back
          </button>
        </div>
      )}

      {state === 'matched' && matchData && (
        <div className="w-full max-w-4xl bg-black rounded-3xl overflow-hidden shadow-2xl border border-[var(--az-border)] relative">
          <React.Suspense fallback={<div className="flex items-center justify-center h-96 text-pink-500">Loading stream...</div>}>
            <RandomMatchRoom
              appId={matchData.appId}
              token={matchData.token}
              roomId={matchData.roomId}
              matchId={matchData.matchId}
              userId={user?.id || ''}
              onNext={handleNext}
              onEnd={handleEnd}
            />
          </React.Suspense>
        </div>
      )}

      <div className="mt-20 max-w-sm text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest leading-relaxed">
        <span className="text-[var(--az-accent-rose)]">⚠️ SAFETY FIRST:</span> NEVER SHARE PERSONAL INFORMATION WITH STRANGERS. INSTANT BLOCK AND REPORT TOOLS ARE ALWAYS AVAILABLE.
      </div>
    </div>
  );
};

export default RandomStranger;
