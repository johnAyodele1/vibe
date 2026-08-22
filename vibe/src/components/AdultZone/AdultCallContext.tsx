import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { usePricingStore, formatNaira, formatAmount } from '../../lib/pricing';
import { AdultCallContext, CallState, ActiveCallInfo, CallSummaryInfo } from './AdultCallContextDefinition';

const CallRoom = React.lazy(() => import('./CallRoom'));

export { useAdultCall } from './useAdultCall';

const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const normalizeCallError = (errorData: any): string => {
  if (!errorData) return 'Failed to initiate call.';
  let rawMsg = '';
  if (typeof errorData === 'string') {
    rawMsg = errorData;
  } else if (typeof errorData === 'object') {
    rawMsg = errorData.message || errorData.error?.message || errorData.error || errorData.msg || '';
    if (typeof rawMsg !== 'string') rawMsg = '';
  }

  const lower = rawMsg.toLowerCase();

  // Block internal Zod/schema/validation/Mongoose errors
  if (
    lower.includes('does not match the expected pattern') ||
    lower.includes('validation failed') ||
    lower.includes('casterror') ||
    lower.includes('cast to objectid') ||
    lower.includes('zoderror')
  ) {
    return 'Failed to initiate call.';
  }

  // Business error mappings
  if (lower.includes('insufficient credits') || lower.includes('insufficient balance')) {
    return 'Insufficient credits to start call. Please top up your wallet.';
  }
  if (lower.includes('busy') || lower.includes('provider is busy')) {
    return 'This provider is busy. Try again later.';
  }
  if (lower.includes('already on a call') || lower.includes('another device')) {
    return 'You are already on a call on another device.';
  }
  if (lower.includes('token') || lower.includes('connection token')) {
    return 'Failed to obtain call connection token';
  }
  if (lower.includes('recipient not found') || lower.includes('provider not found')) {
    return 'Provider not found';
  }

  if (rawMsg.trim().length > 0) {
    return rawMsg;
  }

  return 'Failed to initiate call.';
};

export const AdultCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  const [callState, setCallState] = useState<CallState>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [callSummary, setCallSummary] = useState<CallSummaryInfo | null>(null);
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
    setCallSummary(null);
    setCallState('idle');
    setZegoToken(null);
    setZegoAppId(null);
    setZegoRoomId(null);
    setIsInitiating(false);
    isInitiatingRef.current = false;
  }, []);

  const endCallOnBackend = useCallback(async (callId: string, reason = 'hung_up'): Promise<{ success: boolean; creditsDeducted?: number; durationSeconds?: number }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${callId}/end`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      return {
        success: res.ok,
        creditsDeducted: typeof data.creditsDeducted === 'number' ? data.creditsDeducted : undefined,
        durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
      };
    } catch (err) {
      console.error('[AdultCall] Failed to end call on backend:', err);
      return { success: false };
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

  const transitionToTerminalCall = useCallback((reason: string, durationSeconds = 0, creditsDeducted = 0) => {
    const currentCall = activeCallRef.current;
    if (!currentCall) {
      resetCallState();
      return;
    }

    let status: 'ended' | 'declined' | 'missed' | 'failed' | 'cancelled' = 'ended';
    if (reason === 'declined') status = 'declined';
    else if (reason === 'missed' || reason === 'no_answer') status = 'missed';
    else if (reason === 'cancelled_by_caller') status = 'cancelled';
    else if (reason === 'connection_failed') status = 'failed';

    const serverChargedCredits = Number.isFinite(creditsDeducted) && creditsDeducted >= 0
      ? creditsDeducted
      : 0;

    const summary: CallSummaryInfo = {
      status,
      duration: formatDuration(durationSeconds),
      durationSeconds,
      cost: status === 'ended' ? serverChargedCredits : 0,
      endReason: reason,
    };

    const updatedCall: ActiveCallInfo = {
      ...currentCall,
      endReason: reason,
    };

    activeCallRef.current = updatedCall;
    setActiveCall(updatedCall);
    setCallSummary(summary);
    setCallState('summary');
    setZegoToken(null);
    setZegoAppId(null);
    setZegoRoomId(null);
    setIsInitiating(false);
    isInitiatingRef.current = false;
  }, [resetCallState]);

  // Initiate a call. The backend is the only source of the call rate.
  const initiateCall = useCallback(async (
    recipientId: string,
    type: 'video' | 'audio' = 'video',
    overrideRate?: number,
    existingConvId?: string,
    partnerInfo?: { displayName?: string; avatarUrl?: string },
    camSessionId?: string
  ): Promise<boolean> => {
    void overrideRate;

    if (isInitiatingRef.current || isInitiating || callStateRef.current !== 'idle') {
      return false;
    }

    isInitiatingRef.current = true;
    setIsInitiating(true);

    try {
      let conversationId = existingConvId;
      if (!conversationId) {
        const convRes = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ recipientId })
        });
        const convData = await convRes.json();
        if (!convData.success || !convData.conversationId) {
          const errMsg = normalizeCallError(convData);
          toast.error(errMsg);
          resetCallState();
          return false;
        }
        conversationId = convData.conversationId;
      }

      const callRes = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/initiate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ conversationId, type, camSessionId })
      });
      const callData = await callRes.json();

      if (callData.callId) {
        const rate = Number(callData.perMinuteRate);
        if (!Number.isFinite(rate) || rate <= 0) {
          toast.error('Call pricing is not configured for this provider.');
          await endCallOnBackend(callData.callId, 'pricing_unavailable');
          resetCallState();
          return false;
        }

        const receiverName = partnerInfo?.displayName || callData.receiver?.displayName || 'Provider';
        const receiverAvatar = partnerInfo?.avatarUrl || callData.receiver?.avatarUrl || '/placeholder.svg';

        const callInfo: ActiveCallInfo = {
          callId: callData.callId,
          conversationId,
          callerId: user?.id || '',
          callerName: user?.firstName || (user as any)?.displayName || 'User',
          callerAvatar: user?.profilePhoto || '/placeholder.svg',
          receiverId: recipientId,
          receiverName,
          receiverAvatar,
          type,
          webrtcRoomId: callData.webrtcRoomId || callData.roomId,
          rate,
          isCaller: true,
        };

        activeCallRef.current = callInfo;
        setActiveCall(callInfo);
        setCallState('calling');

        // Pre-fetch token in background and report failure if unable to acquire media token
        const conn = await fetchConnectionToken(callInfo.webrtcRoomId);
        if (conn) {
          setZegoToken(conn.token);
          setZegoAppId(conn.appId);
          setZegoRoomId(callInfo.webrtcRoomId);
        } else {
          toast.error('Failed to obtain call connection token');
          await endCallOnBackend(callData.callId, 'connection_failed');
          resetCallState();
          return false;
        }

        return true;
      } else {
        const msg = normalizeCallError(callData);
        toast.error(msg);
        resetCallState();
        return false;
      }
    } catch (err: any) {
      const msg = normalizeCallError(err);
      toast.error(msg);
      resetCallState();
      return false;
    } finally {
      isInitiatingRef.current = false;
      setIsInitiating(false);
    }
  }, [isInitiating, getHeaders, user, fetchConnectionToken, endCallOnBackend, resetCallState]);

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
          const acceptedRate = Number(data.perMinuteRate);
          if (!Number.isFinite(acceptedRate) || acceptedRate <= 0) {
            toast.error('Call pricing is not configured for this provider.');
            const result = await endCallOnBackend(currentCall.callId, 'pricing_unavailable');
            transitionToTerminalCall('connection_failed', result.durationSeconds || 0, result.creditsDeducted || 0);
            return;
          }

          const updatedCall: ActiveCallInfo = {
            ...currentCall,
            webrtcRoomId: roomId,
            rate: acceptedRate,
          };
          activeCallRef.current = updatedCall;
          setActiveCall(updatedCall);
          setZegoToken(conn.token);
          setZegoAppId(conn.appId);
          setZegoRoomId(roomId);
          setCallState('active');
        } else {
          toast.error('Failed to establish call media connection');
          const result = await endCallOnBackend(currentCall.callId, 'connection_failed');
          transitionToTerminalCall('connection_failed', result.durationSeconds || 0, result.creditsDeducted || 0);
        }
      } else {
        toast.error(data.error || 'Call is no longer available');
        transitionToTerminalCall('declined');
      }
    } catch {
      toast.error('Failed to accept call');
      if (currentCall) {
        const result = await endCallOnBackend(currentCall.callId, 'connection_failed');
        transitionToTerminalCall('connection_failed', result.durationSeconds || 0, result.creditsDeducted || 0);
      }
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
  const endCall = useCallback(async (reason = 'hung_up', durationSeconds = 0) => {
    const currentCall = activeCallRef.current;
    if (currentCall) {
      const result = await endCallOnBackend(currentCall.callId, reason);
      const serverDuration = result.durationSeconds ?? durationSeconds;
      const serverCreditsDeducted = result.creditsDeducted ?? 0;
      transitionToTerminalCall(reason, serverDuration, serverCreditsDeducted);
    } else {
      resetCallState();
    }
  }, [endCallOnBackend, transitionToTerminalCall, resetCallState]);

  // Socket event listener setup (Stable socket connection)
  useEffect(() => {
    if (!isAuthenticated || !token || !user?.id) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('call:incoming', (payload: { callId: string; callerId: string; callerName: string; callerAvatar?: string; receiverId?: string; receiverName?: string; receiverAvatar?: string; type?: 'video' | 'audio'; webrtcRoomId: string; rate: number }) => {
      if (callStateRef.current !== 'idle') {
        return;
      }

      const incomingRate = Number(payload.rate);
      if (!Number.isFinite(incomingRate) || incomingRate <= 0) {
        return;
      }

      const incomingInfo: ActiveCallInfo = {
        callId: payload.callId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        callerAvatar: payload.callerAvatar || '/placeholder.svg',
        receiverId: payload.receiverId || user?.id,
        receiverName: payload.receiverName || user?.firstName || (user as any)?.displayName || 'User',
        receiverAvatar: payload.receiverAvatar || user?.profilePhoto || '/placeholder.svg',
        type: payload.type || 'video',
        webrtcRoomId: payload.webrtcRoomId,
        rate: incomingRate,
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

      const conn = await fetchConnectionToken(targetRoomId);
      if (conn) {
        setZegoToken(conn.token);
        setZegoAppId(conn.appId);
        setZegoRoomId(targetRoomId);
        setCallState('active');
      } else {
        toast.error('Failed to connect to call');
        const result = await endCallOnBackend(currentCall.callId, 'connection_failed');
        transitionToTerminalCall('connection_failed', result.durationSeconds || 0, result.creditsDeducted || 0);
      }
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

    socket.on('call:ended', (payload: { callId: string; reason?: string; durationSeconds?: number; creditsDeducted?: number }) => {
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId === payload.callId) {
        transitionToTerminalCall(
          payload.reason || 'hung_up',
          payload.durationSeconds || 0,
          typeof payload.creditsDeducted === 'number' ? payload.creditsDeducted : 0
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, token, user?.id, fetchConnectionToken, endCallOnBackend, transitionToTerminalCall]);

  // Status Reconciliation Polling while in 'calling' or 'incoming'
  useEffect(() => {
    if (callState !== 'calling' && callState !== 'incoming') return;
    const currentCall = activeCallRef.current;
    if (!currentCall?.callId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${currentCall.callId}`, {
          headers: getHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        if (data.status === 'active' && callStateRef.current !== 'active') {
          const conn = await fetchConnectionToken(data.webrtcRoomId);
          if (conn) {
            setZegoToken(conn.token);
            setZegoAppId(conn.appId);
            setZegoRoomId(data.webrtcRoomId);
            setCallState('active');
          }
        } else if (data.status === 'declined' || data.status === 'missed' || data.status === 'ended' || data.status === 'failed') {
          transitionToTerminalCall(
            data.endReason || data.status,
            data.durationSeconds || 0,
            typeof data.creditsDeducted === 'number' ? data.creditsDeducted : 0
          );
        }
      } catch {
        // Ignore polling error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [callState, getHeaders, fetchConnectionToken, transitionToTerminalCall]);

  const activeCallPartner = activeCall ? {
    id: activeCall.isCaller ? activeCall.receiverId : activeCall.callerId,
    displayName: (activeCall.isCaller ? activeCall.receiverName : activeCall.callerName) || 'Partner',
    avatarUrl: (activeCall.isCaller ? activeCall.receiverAvatar : activeCall.callerAvatar) || '/placeholder.svg',
  } : null;

  return (
    <AdultCallContext.Provider value={{
      callState,
      activeCall,
      callSummary,
      zegoToken,
      zegoAppId,
      zegoRoomId,
      isInitiating,
      initiateCall,
      acceptCall,
      declineCall,
      cancelCall,
      endCall,
      resetCallState,
    }}>
      {children}

      {/* Global Call Overlays (Rendered at Root Layout Level) */}

      {/* 1. Incoming Call Alert Modal */}
      {callState === 'incoming' && activeCall && activeCallPartner && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-incoming-call-modal"
        >
          <div className="w-28 h-28 rounded-full border-4 border-pink-500 animate-pulse mb-4 overflow-hidden shadow-lg">
            <img
              src={activeCallPartner.avatarUrl}
              alt={activeCallPartner.displayName}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-2xl font-serif italic text-white mb-1 truncate max-w-xs px-4" title={activeCallPartner.displayName}>
            {activeCallPartner.displayName}
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
      {callState === 'calling' && activeCall && activeCallPartner && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[11000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-outgoing-call-modal"
        >
          <div className="w-28 h-28 rounded-full border-4 border-pink-500 animate-pulse mb-4 overflow-hidden shadow-lg">
            <img
              src={activeCallPartner.avatarUrl}
              alt={activeCallPartner.displayName}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-2xl font-serif italic text-white mb-1 truncate max-w-xs px-4" title={activeCallPartner.displayName}>
            {activeCallPartner.displayName}
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
      {callState === 'active' && activeCall && zegoToken && zegoAppId && zegoRoomId && activeCallPartner && (
        <div
          className="fixed inset-0 z-[12000] bg-black w-full h-full"
          data-testid="global-active-call-room"
        >
          <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading call...</div>}>
            <CallRoom
              key={zegoRoomId}
              appId={zegoAppId}
              token={zegoToken}
              roomId={zegoRoomId}
              userId={user?.id || ''}
              userName={user?.firstName || (user as any)?.displayName || 'User'}
              callType={activeCall.type}
              onCallEnd={(durationSeconds) => endCall('hung_up', durationSeconds)}
              partnerName={activeCallPartner.displayName}
              partnerAvatar={activeCallPartner.avatarUrl}
              providerAvatar={activeCallPartner.avatarUrl}
              providerName={activeCallPartner.displayName}
            />
          </React.Suspense>
        </div>
      )}

      {/* 5. Restored Previous Call Ending Summary Modal */}
      {callState === 'summary' && callSummary && (
        <div
          style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}
          className="fixed inset-0 bg-black/95 backdrop-blur-lg z-[13000] flex flex-col items-center justify-center p-6 text-white text-center"
          data-testid="global-terminal-call-modal"
        >
          <div className="w-full max-w-sm flex flex-col items-center justify-center">
            <span className="text-5xl mb-4">
              {callSummary.status === 'declined' || callSummary.status === 'missed' ? '📵' : activeCall?.type === 'video' ? '📹' : '📞'}
            </span>
            <h2 className="text-2xl font-serif italic text-pink-300 mb-2">
              {callSummary.status === 'declined'
                ? 'Call Declined'
                : callSummary.status === 'missed'
                ? 'No Answer'
                : 'Call Ended'}
            </h2>

            <div className="w-full bg-[#160b13] border border-pink-500/20 rounded-xl p-6 space-y-4 mb-8 text-left">
              {callSummary.status === 'declined' || callSummary.status === 'missed' ? (
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-red-400">
                    {callSummary.status === 'declined' ? 'Call was declined' : 'No answer from provider'}
                  </p>
                  <p className="text-xs text-gray-400">No charge</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Duration:</span>
                    <span className="font-bold">{callSummary.duration}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-pink-500/10 pt-3">
                    {user?.role === 'provider' ? (
                      <>
                        <span className="text-gray-400">Credits Earned:</span>
                        <span className="font-bold text-yellow-400">💎 {callSummary.cost}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-400">Credits Charged:</span>
                        <span className="font-bold text-yellow-400">💎 {callSummary.cost}  ≈  {formatNaira(callSummary.cost * usePricingStore.getState().diamondNairaRate)}</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={resetCallState}
              data-testid="dismiss-terminal-call-btn"
              className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all shadow-lg shadow-pink-500/20 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdultCallContext.Provider>
  );
};
