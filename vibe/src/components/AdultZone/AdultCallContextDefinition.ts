import { createContext } from 'react';

export type CallState = 'idle' | 'calling' | 'incoming' | 'accepting' | 'active' | 'ending' | 'failed';

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
}

export interface AdultCallContextType {
  callState: CallState;
  activeCall: ActiveCallInfo | null;
  zegoToken: string | null;
  zegoAppId: number | null;
  zegoRoomId: string | null;
  isInitiating: boolean;
  initiateCall: (recipientId: string, type?: 'video' | 'audio', rate?: number, conversationId?: string) => Promise<boolean>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: (reason?: string) => Promise<void>;
}

export const AdultCallContext = createContext<AdultCallContextType | null>(null);
