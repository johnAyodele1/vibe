import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { formatAmount } from '../../lib/pricing';
import { AdultCallContext, CallState, ActiveCallInfo } from './AdultCallContextDefinition';

const CallRoom = React.lazy(() => import('./CallRoom'));

export { useAdultCall } from './useAdultCall';

export const AdultCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const [callState, setCallState] = useState<CallState>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);

  const [zegoToken, setZegoToken] = useState<string | null>(null);
  const [zegoAppId, setZegoAppId] = useState<number | null>(null);
  const [zegoRoomId, setZegoRoomId] = useState<string | null>(null);

  const activeCallRef = useRef<ActiveCallInfo | null>(null);
  const callStateRef = useRef<CallState>('idle');
  const socketRef = useRef<Socket | null>(null);
  const isInitiatingRef = useRef(false);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);

  const resetCallState = useCallback(() => {
    activeCallRef.current = null;
    setActiveCall(null);
    setCallState('idle');
    setZegoToken(null);
    setZegoAppId(null);
    setZegoRoomId(null);
    setIsInitiating(false);
    isInitiatingRef.current = false;
  }, []);

  const endCallOnBackend = useCallback(async (callId: string, reason = 'hung_up') => {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${callId}/end`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ reason })
      });
    } catch (err) {
      console.error('[AdultCall] Failed to end call on backend:', err);
    }
  }, [getHeaders]);

  const fetchConnectionToken = useCallback(async (roomId: string): Promise<{ token: string; appId: number } | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${roomId}&type=call`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.token) {
        return { token: data.token, appId: data.appId };
      }
      return null;
    } catch (err) {
      console.error('[AdultCall] Failed to fetch connection token:', err);
      return null;
    }
  }, [getHeaders]);

  // Initiate a call
  const initiateCall = useCallback(async (
    recipientId: string,
    type: 'video' | 'audio' = 'video',
    overrideRate?: number,
    existingConvId?: string
  ): Promise<boolean> => {
    if (isInitiatingRef.current || isInitiating || callStateRef.current !== 'idle') {
      return false;
    }

    isInitiatingRef.current = true;
    setIsInitiating(true);

    try {
      let conversationId = existingConvId;
      if (!conversationId) {
        const convRes = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/start`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ recipientId })
        });
        const convData = await convRes.json();
        if (!convData.success || !convData.conversationId) {
          toast.error(convData.error || 'Failed to start conversation');
          resetCallState();
          return false;
        }
        conversationId = convData.conversationId;
      }

      const callRes = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/initiate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ conversationId, type })
      });
      const callData = await callRes.json();

      if (callData.callId) {
        const rate = overrideRate || callData.perMinuteRate || 5;
        const callInfo: ActiveCallInfo = {
          callId: callData.callId,
          conversationId,
          callerId: user?.id || '',
          callerName: user?.firstName || (user as any)?.displayName || 'User',
          callerAvatar: user?.profilePhoto || '/placeholder.svg',
          receiverId: recipientId,
          type,
          webrtcRoomId: callData.webrtcRoomId || callData.roomId,
          rate,
          isCaller: true,
        };

        activeCallRef.current = callInfo;
        setActiveCall(callInfo);
        setCallState('calling');

        // Pre-fetch token in background
        fetchConnectionToken(callInfo.webrtcRoomId).then((conn) => {
          if (conn) {
            setZegoToken(conn.token);
            setZegoAppId(conn.appId);
            setZegoRoomId(callInfo.webrtcRoomId);
          }
        });

        return true;
      } else {
        const msg = typeof callData.error === 'string'
          ? callData.error
          : callData.error?.message || 'Provider is busy or unavailable.';
        toast.error(msg);
        resetCallState();
        return false;
      }
    } catch {
      toast.error('Failed to initiate call');
      resetCallState();
      return false;
    } finally {
      isInitiatingRef.current = false;
      setIsInitiating(false);
    }
  }, [isInitiating, getHeaders, user, fetchConnectionToken, resetCallState]);

  const transitionToTerminalCall = useCallback((reason: string) => {
    const currentCall = activeCallRef.current;
    if (!currentCall) {
      resetCallState();
      return;
    }
    const updatedCall: ActiveCallInfo = {
      ...currentCall,
      endReason: reason,
    };
    activeCallRef.current = updatedCall;
    setActiveCall(updatedCall);
    const nextState: CallState = reason === 'connection_failed' ? 'failed' : 'ending';
    setCallState(nextState);
    setZegoToken(null);
    setZegoAppId(null);
    setZegoRoomId(null);
    setIsInitiating(false);
    isInitiatingRef.current = false;
  }, [resetCallState]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall || callStateRef.current !== 'incoming') return;

    setCallState('accepting');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${currentCall.callId}/accept`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const data = await res.json();

      if (res.ok && (data.webrtcRoomId || data.roomId)) {
        const roomId = data.webrtcRoomId || data.roomId;
        const conn = await fetchConnectionToken(roomId);

        if (conn) {
          const updatedCall: ActiveCallInfo = {
            ...currentCall,
            webrtcRoomId: roomId,
            rate: data.perMinuteRate || currentCall.rate,
          };
          activeCallRef.current = updatedCall;
          setActiveCall(updatedCall);
          setZegoToken(conn.token);
          setZegoAppId(conn.appId);
          setZegoRoomId(roomId);
          setCallState('active');
        } else {
          toast.error('Failed to establish call media connection');
          await endCallOnBackend(currentCall.callId, 'connection_failed');
          transitionToTerminalCall('connection_failed');
        }
      } else {
        toast.error(data.error || 'Call is no longer available');
        transitionToTerminalCall('declined');
      }
    } catch {
      toast.error('Failed to accept call');
      if (currentCall) {
        await endCallOnBackend(currentCall.callId, 'connection_failed');
      }
      transitionToTerminalCall('connection_failed');
    }
  }, [getHeaders, fetchConnectionToken, endCallOnBackend, transitionToTerminalCall]);

  // Decline incoming call
  const declineCall = useCallback(async () => {
    const currentCall = activeCallRef.current;
    if (currentCall) {
      try {
        await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${currentCall.callId}/decline`, {
          method: 'PUT',
          headers: getHeaders()
        });
      } catch (err) {
        console.error('[AdultCall] Decline error:', err);
      }
      transitionToTerminalCall('declined');
    } else {
      resetCallState();
    }
  }, [getHeaders, transitionToTerminalCall, resetCallState]);

  // Cancel outgoing call
  const cancelCall = useCallback(async () => {
    const currentCall = activeCallRef.current;
    if (currentCall) {
      await endCallOnBackend(currentCall.callId, 'cancelled_by_caller');
      transitionToTerminalCall('cancelled_by_caller');
    } else {
      resetCallState();
    }
  }, [endCallOnBackend, transitionToTerminalCall, resetCallState]);

  // End active call
  const endCall = useCallback(async (reason = 'hung_up') => {
    const currentCall = activeCallRef.current;
    if (currentCall) {
      await endCallOnBackend(currentCall.callId, reason);
      transitionToTerminalCall(reason);
    } else {
      resetCallState();
    }
  }, [endCallOnBackend, transitionToTerminalCall, resetCallState]);

  // Socket event listener setup
  useEffect(() => {
    if (!isAuthenticated || !token || !user?.id) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('call:incoming', (payload: { callId: string; callerId: string; callerName: string; callerAvatar?: string; type?: 'video' | 'audio'; webrtcRoomId: string; rate: number }) => {
      if (callStateRef.current !== 'idle') {
        return;
      }

      const incomingInfo: ActiveCallInfo = {
        callId: payload.callId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        callerAvatar: payload.callerAvatar || '/placeholder.svg',
        type: payload.type || 'video',
        webrtcRoomId: payload.webrtcRoomId,
        rate: payload.rate,
        isCaller: false,
      };

      activeCallRef.current = incomingInfo;
      setActiveCall(incomingInfo);
      setCallState('incoming');
    });

    socket.on('call:accepted', async (payload: { callId: string; webrtcRoomId: string }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== payload.callId) return;

      const targetRoomId = payload.webrtcRoomId || currentCall.webrtcRoomId;

      if (!zegoToken || zegoRoomId !== targetRoomId) {
        const conn = await fetchConnectionToken(targetRoomId);
        if (conn) {
          setZegoToken(conn.token);
          setZegoAppId(conn.appId);
          setZegoRoomId(targetRoomId);
        } else {
          toast.error('Failed to connect to call');
          await endCallOnBackend(currentCall.callId, 'connection_failed');
          transitionToTerminalCall('connection_failed');
          return;
        }
      }

      setCallState('active');
    });

    socket.on('call:declined', (payload: { callId: string }) => {
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId === payload.callId) {
        toast.error('Provider declined the call');
        transitionToTerminalCall('declined');
      }
    });

    socket.on('call:missed', (payload: { callId: string }) => {
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId === payload.callId) {
        toast.info('No answer');
        transitionToTerminalCall('missed');
      }
    });

    socket.on('call:ended', (payload: { callId: string; reason?: string }) => {
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId === payload.callId) {
        transitionToTerminalCall(payload.reason || 'hung_up');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, token, user?.id, fetchConnectionToken, endCallOnBackend, resetCallState, transitionToTerminalCall, zegoToken, zegoRoomId]);

  const getReasonDetails = (reason?: string) => {
    switch (reason) {
      case 'declined':
        return { title: 'Call Declined', subtitle: 'The recipient declined the call.' };
      case 'missed':
        return { title: 'No Answer', subtitle: 'The recipient did not answer the call.' };
      case 'cancelled_by_caller':
        return { title: 'Call Cancelled', subtitle: 'You cancelled the call.' };
      case 'connection_failed':
        return { title: 'Connection Failed', subtitle: 'Could not establish media connection.' };
      case 'insufficient_credits':
        return { title: 'Insufficient Credits', subtitle: 'Call ended because credits ran out.' };
      case 'hung_up':
      case 'remote_ended':
      default:
        return { title: 'Call Ended', subtitle: 'The call has ended.' };
    }
  };

  return (
    <AdultCallContext.Provider value={{
      callState,
      activeCall,
      zegoToken,
      zegoAppId,
      zegoRoomId,
      isInitiating,
      initiateCall,
      acceptCall,
      declineCall,
      cancelCall,
      endCall,
    }}>
      {children}

      {/* Global Call Overlays (Rendered at Root Layout Level) */}

      {/* 1. Incoming Call Alert Modal */}
      {callState === 'incoming' && activeCall && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-incoming-call-modal"
        >
          <div className="w-28 h-28 rounded-full border-4 border-pink-500 animate-pulse mb-4 overflow-hidden shadow-lg">
            <img
              src={activeCall.callerAvatar}
              alt={activeCall.callerName}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-2xl font-serif italic text-white mb-1 truncate max-w-xs px-4" title={activeCall.callerName}>
            {activeCall.callerName}
          </h3>
          <p className="text-xs text-pink-400 uppercase tracking-widest font-mono animate-pulse">
            Incoming {activeCall.type} call...
          </p>
          <p className="text-xs text-yellow-400 mt-2 font-mono">
            Rate: 💎 {formatAmount(activeCall.rate)} credits / min
          </p>

          <div className="flex gap-8 mt-8">
            <button
              onClick={declineCall}
              data-testid="decline-call-btn"
              className="w-14 h-14 bg-red-600 hover:bg-red-700 text-white text-xl rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
              title="Decline Call"
              aria-label="Decline Call"
            >
              ✕
            </button>
            <button
              onClick={acceptCall}
              data-testid="accept-call-btn"
              className="w-14 h-14 bg-green-600 hover:bg-green-700 text-white text-xl rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all animate-bounce"
              title="Accept Call"
              aria-label="Accept Call"
            >
              ✓
            </button>
          </div>
        </div>
      )}

      {/* 2. Outgoing Ringing Overlay */}
      {callState === 'calling' && activeCall && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-outgoing-call-modal"
        >
          <div className="w-28 h-28 rounded-full border-4 border-pink-500 animate-pulse mb-4 overflow-hidden">
            <img
              src={activeCall.receiverAvatar || activeCall.callerAvatar}
              alt="Recipient"
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-2xl font-serif italic text-white mb-1">
            {activeCall.receiverName || 'Provider'}
          </h3>
          <p className="text-xs text-pink-400 uppercase tracking-widest font-mono animate-pulse">
            Requesting 1-to-1 {activeCall.type} call...
          </p>
          <p className="text-xs text-yellow-400 mt-2 font-mono">
            Rate: 💎 {formatAmount(activeCall.rate)} credits / min
          </p>

          <button
            onClick={cancelCall}
            data-testid="cancel-call-btn"
            className="mt-8 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all"
          >
            Cancel Call ✕
          </button>
        </div>
      )}

      {/* 3. Accepting Loading Overlay */}
      {callState === 'accepting' && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
        >
          <div className="w-12 h-12 rounded-full border-4 border-pink-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm font-serif italic text-pink-400">Connecting private call...</p>
        </div>
      )}

      {/* 4. Active Call Room Overlay */}
      {callState === 'active' && activeCall && zegoToken && zegoAppId && zegoRoomId && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 z-[12000] bg-black"
          data-testid="global-active-call-room"
        >
          <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading call...</div>}>
            <CallRoom
              key={zegoRoomId}
              appId={zegoAppId}
              token={zegoToken}
              roomId={zegoRoomId}
              userId={user?.id || ''}
              userName={user?.firstName || 'User'}
              callType={activeCall.type}
              onCallEnd={() => endCall('hung_up')}
              partnerName={activeCall.isCaller ? activeCall.receiverName : activeCall.callerName}
              partnerAvatar={activeCall.isCaller ? activeCall.receiverAvatar : activeCall.callerAvatar}
              providerAvatar={activeCall.isCaller ? activeCall.receiverAvatar : activeCall.callerAvatar}
              providerName={activeCall.isCaller ? activeCall.receiverName : activeCall.callerName}
            />
          </React.Suspense>
        </div>
      )}

      {/* 5. Terminal Call Screen Overlay (Call Ended / Declined / Missed / Failed) */}
      {(callState === 'ending' || callState === 'failed') && activeCall && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/95 backdrop-blur-lg z-[13000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-terminal-call-modal"
        >
          <div className="w-28 h-28 rounded-full border-4 border-zinc-700 mb-4 overflow-hidden shadow-2xl relative">
            <img
              src={(activeCall.isCaller ? activeCall.receiverAvatar : activeCall.callerAvatar) || '/placeholder.svg'}
              alt={activeCall.isCaller ? activeCall.receiverName || 'Partner' : activeCall.callerName}
              className="w-full h-full object-cover grayscale opacity-80"
            />
          </div>

          <h3 className="text-2xl font-serif italic text-white mb-1 truncate max-w-xs px-4">
            {activeCall.isCaller ? activeCall.receiverName || 'Provider' : activeCall.callerName}
          </h3>

          <div className="my-2">
            <span className={`text-xs font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full ${callState === 'failed' ? 'bg-red-950/80 text-red-400 border border-red-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
              {getReasonDetails(activeCall.endReason).title}
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans mt-1 max-w-xs">
            {getReasonDetails(activeCall.endReason).subtitle}
          </p>

          <button
            onClick={resetCallState}
            data-testid="dismiss-terminal-call-btn"
            className="mt-8 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all border border-zinc-700 active:scale-95"
          >
            Dismiss ✕
          </button>
        </div>
      )}
    </AdultCallContext.Provider>
  );
};
