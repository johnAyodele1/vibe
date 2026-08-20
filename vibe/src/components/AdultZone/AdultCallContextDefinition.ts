import { createContext } from 'react';

export type CallState = 'idle' | 'calling' | 'incoming' | 'accepting' | 'active' | 'summary' | 'ending' | 'failed';

export interface ActiveCallInfo {
  callId: string;
  conversationId?: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  receiverId?: string;
  receiverName?: string;
  receiverAvatar?: string;
  type: 'video' | 'audio';
  webrtcRoomId: string;
  rate: number;
  isCaller: boolean;
  endReason?: string;
}

export interface CallSummaryInfo {
  status: 'ended' | 'declined' | 'missed' | 'failed' | 'cancelled';
  duration: string;
  durationSeconds: number;
  cost: number;
  endReason?: string;
}

export interface AdultCallContextType {
  callState: CallState;
  activeCall: ActiveCallInfo | null;
  callSummary: CallSummaryInfo | null;
  zegoToken: string | null;
  zegoAppId: number | null;
  zegoRoomId: string | null;
  isInitiating: boolean;
  initiateCall: (
    recipientId: string,
    type?: 'video' | 'audio',
    rate?: number,
    conversationId?: string,
    partnerInfo?: { displayName?: string; avatarUrl?: string }
  ) => Promise<boolean>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: (reason?: string, durationSeconds?: number) => Promise<void>;
  resetCallState: () => void;
}

export const AdultCallContext = createContext<AdultCallContextType | null>(null);
