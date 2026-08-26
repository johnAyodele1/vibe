import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';

const RandomMatchRoom = React.lazy(() => import('./RandomMatchRoom'));

type RandomState = 'idle' | 'queued' | 'matched' | 'ended';
type GenderPreference = 'girls' | 'guys' | 'anyone';
type ConnectionMode = 'text' | 'video' | 'both';

interface RandomMatchPayload {
  matchId: string;
  appId: string | number;
  token: string;
  roomId: string;
  status?: string;
  mode?: ConnectionMode;
}

const RandomStranger: React.FC = () => {
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const [preference, setPreference] = useState<GenderPreference>('anyone');
  const [mode, setMode] = useState<ConnectionMode>('both');
  const [state, setState] = useState<RandomState>('idle');
  const [matchData, setMatchData] = useState<RandomMatchPayload | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeMatchIdRef.current = matchData?.matchId || null;
  }, [matchData]);

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const handleNext = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);

    const currentMatch = matchData;
    setMatchData(null);
    setState('queued');

    try {
      if (currentMatch) {
        await fetch(`${API_BASE_URL}/v1/adult/random/${currentMatch.matchId}/next`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ preference, mode }),
        });
      } else {
        const res = await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ preference, mode }),
        });
        const data = await res.json();
        if (data.success && data.data && data.data.status === 'matched') {
          setMatchData(data.data as RandomMatchPayload);
          setState('matched');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Unable to skip to next stranger.');
      setState('idle');
    } finally {
      setIsPending(false);
    }
  }, [matchData, preference, mode, isPending, getHeaders]);

  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  useEffect(() => {
    if (!token) return;

    const s = io(`${SOCKET_URL}/adult`, {
      auth: { token }
    });

    s.on('connect', () => {
      console.log('Random Match Socket connected:', s.id);
      setSocket(s);
    });

    s.on('random:match_found', (data: RandomMatchPayload) => {
      console.log('Random Match found:', data);
      setMatchData(data);
      setState('matched');
      toast.success('Stranger matched! Establishing session...');
    });

    s.on('random:partner_left', () => {
      toast.info('Stranger disconnected. Re-queuing...');
      void handleNextRef.current();
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  const handleStart = async () => {
    if (!token) {
      toast.error('Authentication required');
      return;
    }
    if (isPending) return;

    setIsPending(true);
    setState('queued');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ preference, mode }),
      });
      const data = await res.json();
      if (data.success && data.data && data.data.status === 'matched') {
        setMatchData(data.data as RandomMatchPayload);
        setState('matched');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to join matching queue');
      setState('idle');
    } finally {
      setIsPending(false);
    }
  };

  const handleEnd = async () => {
    if (isPending) return;
    setIsPending(true);

    const currentMatch = matchData;
    setMatchData(null);
    setState('idle');

    try {
      if (currentMatch) {
        await fetch(`${API_BASE_URL}/v1/adult/random/${currentMatch.matchId}/end`, {
          method: 'POST',
          headers: getHeaders()
        });
      } else {
        await fetch(`${API_BASE_URL}/v1/adult/random/queue`, {
          method: 'DELETE',
          headers: getHeaders()
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
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
              <div className="flex gap-2" role="radiogroup" aria-label="Partner preference">
                {(
                  [
                    { label: 'Girls', value: 'girls' },
                    { label: 'Guys', value: 'guys' },
                    { label: 'Anyone', value: 'anyone' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={preference === opt.value}
                    onClick={() => setPreference(opt.value)}
                    className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${
                      preference === opt.value
                        ? 'bg-[var(--az-accent-primary)] border-transparent text-white shadow-md'
                        : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)] hover:bg-[var(--az-bg-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">Mode:</label>
              <div className="flex gap-2" role="radiogroup" aria-label="Connection mode">
                {(
                  [
                    { label: 'Text Only', value: 'text' },
                    { label: 'Cam', value: 'video' },
                    { label: 'Both', value: 'both' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={mode === opt.value}
                    onClick={() => setMode(opt.value)}
                    className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${
                      mode === opt.value
                        ? 'bg-[var(--az-accent-primary)] border-transparent text-white shadow-md'
                        : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)] hover:bg-[var(--az-bg-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={isPending}
            className="w-full py-5 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-[0.2em] rounded-full shadow-[0_0_25px_var(--az-glow)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
          >
            {isPending ? 'JOINING QUEUE...' : 'START MATCHING'}
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
            disabled={isPending}
            className="mt-12 text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] hover:text-[var(--az-text-secondary)] underline disabled:opacity-50"
          >
            Cancel and Go Back
          </button>
        </div>
      )}

      {state === 'matched' && matchData && (
        <div className="w-full max-w-4xl bg-black rounded-3xl overflow-hidden shadow-2xl border border-[var(--az-border)] relative">
          <React.Suspense fallback={<div className="flex items-center justify-center h-96 text-pink-500">Loading room...</div>}>
            <RandomMatchRoom
              appId={matchData.appId}
              token={matchData.token}
              roomId={matchData.roomId}
              matchId={matchData.matchId}
              userId={user?.id || ''}
              socket={socket}
              mode={matchData.mode || mode}
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
