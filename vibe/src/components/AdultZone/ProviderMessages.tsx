import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Avatar } from './Avatar';
import { detectContactSharing } from '@yourapp/content-filter';
import { useContentFilter } from '../../hooks/useContentFilter';
import { ProviderContentWarning } from './ContentFilterWarning';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { useUIStore } from './useUIStore';
import MessageTick, { getMessageStatus } from './MessageTick';
import { usePricingStore, formatNaira } from '../../lib/pricing';
import { uploadMedia } from '../../lib/media/uploadMedia';

const CallRoom = React.lazy(() => import('./CallRoom'));

const FALLBACK_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop";

interface Conversation {
  conversationId: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl: string;
    isOnline: boolean;
    accountType: string;
    bio?: string;
    country?: string;
  } | null;
  lastMessage: {
    content: string;
    mediaType: string;
    senderId: string;
    sentAt: string;
  } | null;
  unreadCount: number;
  isMuted: boolean;
  isBlocked: boolean;
}

interface Message {
  id: string;
  senderId: string;
  receiverId?: string;
  content: string;
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaDurationSeconds?: number;
  mediaFileSizeBytes?: number;
  mediaMimeType?: string;
  mediaType: string;
  creditCost: number;
  isUnlocked: boolean;
  deliveredAt?: string | null;
  isOptimistic?: boolean;
  isFailed?: boolean;
  gift?: {
    giftId: string;
    giftName: string;
    giftIconUrl: string;
    giftValue: number;
    message?: string;
  };
  giftRequest?: {
    giftId: string;
    giftName: string;
    giftIconUrl: string;
    giftValue: number;
    message?: string;
    status: 'pending' | 'fulfilled' | 'different_sent' | 'dismissed';
    fulfilledGiftId?: string;
    fulfilledGiftName?: string;
    fulfilledAt?: string;
  };
  serviceRequest?: {
    baseRate: number;
    extras: { label: string; amount: number }[];
    totalAmount: number;
    note?: string;
    status: 'pending' | 'paid' | 'completed' | 'auto_completed' | 'reported';
    paidAt?: string;
    completedAt?: string;
    reportedAt?: string;
    eligibleForPayout: boolean;
  };
  photoRequest?: {
    status: 'pending' | 'fulfilled' | 'declined';
    note?: string;
    fulfilledMessageId?: string | null;
  };
  serviceTonightRequest?: {
    status: 'pending' | 'fulfilled' | 'declined';
    note?: string;
    fulfilledMessageId?: string | null;
  };
  systemText?: string;
  reactions?: { userId: string; emoji: string; reactedAt?: string }[];
  isDeleted: boolean;
  createdAt: string;
  readAt?: string | null;
}

interface Gift {
  _id: string;
  name: string;
  iconUrl: string;
  creditCost: number;
  category: 'romantic' | 'spicy' | 'luxury' | 'fun';
}

const ProviderMessages: React.FC = () => {
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken') || '';

  // Conversation list & messages state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [msgPage, setMsgPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // Form states
  const [inputText, setInputText] = useState('');

  // Content Filtering (Provider-side)
  const { filterWarning, checkContent, dismissWarning, setFilterWarning } = useContentFilter('service_provider');

  // Dialog states
  const [showPaidMediaDialog, setShowPaidMediaDialog] = useState(false);
  const [paidMediaFile, setPaidMediaFile] = useState<File | null>(null);
  const [paidMediaPreview, setPaidMediaPreview] = useState<string>('');
  const [paidMediaCost, setPaidMediaCost] = useState<number>(50);
  const [paidMediaCaption, setPaidMediaCaption] = useState<string>('');
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);

  // Fulfilling photo requests trigger state
  const [activePhotoRequestFulfillId, setActivePhotoRequestFulfillId] = useState<string | null>(null);
  const [activeServiceTonightRequestFulfillId, setActiveServiceTonightRequestFulfillId] = useState<string | null>(null);

  // Gift Request states
  const [showGiftRequestDialog, setShowGiftRequestDialog] = useState(false);
  const [giftsCatalogue, setGiftsCatalogue] = useState<Gift[]>([]);
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [giftRequestNote, setGiftRequestNote] = useState('');
  const [activeGiftTab, setActiveGiftTab] = useState<string>('all');
  const [isGiftsLoading, setIsGiftsLoading] = useState(false);

  // Service Request states
  const [showServiceRequestDialog, setShowServiceRequestDialog] = useState(false);
  const [serviceExtras, setServiceExtras] = useState<Array<{ label: string; amount: number }>>([]);
  const [serviceRequestNote, setServiceRequestNote] = useState('');
  const tonightRate = (user as any)?.providerProfile?.tonightRate || 100;
  const [dynTonightRate, setDynTonightRate] = useState<number>(0);

  // Double-click / duplicate submission prevention states
  const [isSendingPaidMedia, setIsSendingPaidMedia] = useState(false);
  const [isSendingGiftRequest, setIsSendingGiftRequest] = useState(false);
  const [isSendingServiceRequest, setIsSendingServiceRequest] = useState(false);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (showServiceRequestDialog) {
      const fetchTonightRate = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/tonight-rate`, {
            headers: getHeaders()
          });
          const data = await res.json();
          if (data && data.tonightRate !== undefined) {
            setDynTonightRate(data.tonightRate);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchTonightRate();
    }
  }, [showServiceRequestDialog]);

  // S3 general upload states for regular attachments
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Voice recording states (TAP-TO-START / TAP-TO-SEND)
  const { setHideGlobalHeader, setHideFooter } = useUIStore();
  const [recState, setRecState] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [recDuration, setRecDuration] = useState(0);
  const [amplitudeData, setAmplitudeData] = useState<number[]>(Array(30).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recDurationRef = useRef<number>(0);

  // Calling states (Providers only receive, can accept/decline or end)
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'active' | 'summary'>('idle');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [callDuration, setCallDuration] = useState(0);
  const [callRate, setCallRate] = useState<number>(0);
  const [callSummary, setCallSummary] = useState<{ duration: string; cost: number; wasBilled: boolean; status?: string } | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [callData, setCallData] = useState<any>(null);

  // Zego states
  const [zegoToken, setZegoToken] = useState<string | null>(null);
  const [zegoAppId, setZegoAppId] = useState<number | null>(null);
  const [zegoRoomId, setZegoRoomId] = useState<string | null>(null);

  // UI responsive states
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Socket setup
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

  // Emoji picker states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recentEmojis] = useState<string[]>(['❤️', '🔥', '😂', '😮', '😢', '👍', '💋', '👅', '🍑', '🍆']);

  const scrollToBottom = (behavior: 'smooth' | 'instant' = 'instant') => {
    if (messagesEndRef.current?.scrollIntoView) {
      if (behavior === 'instant') {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Fetch conversations on mount / search
  useEffect(() => {
    fetchConversations(true);
  }, [user?.id]);

  // Auto-mark unread messages as read when loaded or changed
  useEffect(() => {
    if (!selectedConv || !messages?.length) return;

    const hasUnread = messages.some(
      m => m.senderId !== (user?.id || (user as any)?._id) && !m.readAt
    );

    if (hasUnread) {
      markConversationRead(selectedConv.conversationId);
    }
  }, [selectedConv?.conversationId, messages]);

  // Global auto-accept call check on load/mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const autoAcceptCallId = searchParams.get('autoAcceptCallId');
    const callerId = searchParams.get('callerId');
    const type = searchParams.get('type') || 'video';

    if (autoAcceptCallId && callerId && conversations.length > 0) {
      const conv = conversations.find(c => c.otherUser?.id === callerId);
      if (conv) {
        // Clear search parameters from address bar immediately to prevent re-execution
        window.history.replaceState(null, '', window.location.pathname);

        selectConversation(conv);

        // Pre-fill calling states so accept call flow can resolve
        setCallType(type as any);
        setActiveCallId(autoAcceptCallId);
        setCallRate(5);
        setCallData({
          callId: autoAcceptCallId,
          roomId: `room_${autoAcceptCallId}`,
          callerName: conv.otherUser?.displayName || 'User'
        });

        // Trigger the accept API call
        const triggerAutoAccept = async () => {
          const hasPermissions = await checkMediaPermissions(type as any);
          if (!hasPermissions) {
            await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${autoAcceptCallId}/decline`, {
              method: 'PUT',
              headers: getHeaders()
            });
            return;
          }
          setAcceptLoading(true);
          try {
            const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${autoAcceptCallId}/accept`, {
              method: 'PUT',
              headers: getHeaders()
            });
            const data = await res.json();

            const tokenRes = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${data.roomId}&type=call`, {
              headers: getHeaders()
            });
            const tokenData = await tokenRes.json();
            if (tokenData.token) {
              setZegoToken(tokenData.token);
              setZegoAppId(tokenData.appId);
              setZegoRoomId(data.roomId);
              setCallState('active');
            } else {
              setAcceptLoading(false);
              toast.error('Failed to get call token');
            }
          } catch (err) {
            setAcceptLoading(false);
            console.error('Auto-accept call error:', err);
          }
        };

        // Let selectConversation render and initialize before auto-accept
        setTimeout(() => {
          triggerAutoAccept();
        }, 500);
      }
    }
  }, [conversations]);

  // Handle window resizing for responsive navigation and layout adjustments
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileView('chat');
      }
      scrollToBottom('smooth');
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  // Sync Global Header and Footer hide states based on selected conversation and view mode
  useEffect(() => {
    const isMobileChat = window.innerWidth < 768 && selectedConv !== null && mobileView === 'chat';
    setHideGlobalHeader(isMobileChat);
    setHideFooter(selectedConv !== null && mobileView === 'chat');
  }, [selectedConv, mobileView, setHideGlobalHeader, setHideFooter]);

  // Ensure header and footer are restored on component unmount
  useEffect(() => {
    return () => {
      setHideGlobalHeader(false);
      setHideFooter(false);
    };
  }, [setHideGlobalHeader, setHideFooter]);

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  const fetchConversations = async (initial = false) => {
    try {
      if (initial) {
        setIsConversationsLoading(true);
      }
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, { headers: getHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      if (initial) {
        setIsConversationsLoading(false);
      }
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    activeConvIdRef.current = conv.conversationId;
    setMessages([]);
    setMobileView('chat');
    setMsgPage(1);
    setHasMoreMessages(true);
    await markConversationRead(conv.conversationId);
    await fetchMessages(conv.conversationId, 1);
    if (socketRef.current) {
      socketRef.current.emit('conv:join', { conversationId: conv.conversationId });
    }
  };

  const markConversationRead = async (convId: string) => {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${convId}/read`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setConversations(prev => prev.map(c => c.conversationId === convId ? { ...c, unreadCount: 0 } : c));

      // Update local unread received messages as read
      setMessages(prev => prev.map(m =>
        m.senderId !== (user?.id || (user as any)?._id) && !m.readAt
          ? { ...m, readAt: new Date().toISOString() }
          : m
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineServiceTonightRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/service-tonight-requests/${msgId}/decline`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceTonightRequest: { ...m.serviceTonightRequest!, status: 'declined' } } : m));
      toast.info('Service request declined');
    } catch (err) {
      console.error('Failed to decline service request:', err);
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const fetchMessages = async (convId: string, page: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${convId}/messages?page=${page}&limit=30`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (activeConvIdRef.current !== convId) return;
      if (Array.isArray(data)) {
        if (page === 1) {
          setMessages(data.reverse());
          setTimeout(() => {
            scrollToBottom('instant');
          }, 50);
        } else {
          setMessages(prev => [...data.reverse(), ...prev]);
        }
        if (data.length < 30) {
          setHasMoreMessages(false);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadMoreMessages = async () => {
    if (!selectedConv || !hasMoreMessages) return;
    const nextPage = msgPage + 1;
    setMsgPage(nextPage);
    await fetchMessages(selectedConv.conversationId, nextPage);
  };

  // Setup Socket connection
  useEffect(() => {
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const s = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('Provider connected to /adult socket:', s.id);
    });

    s.on('sext:new_message', (payload: { message: Message }) => {
      const myUserId = user?.id || (user as any)?._id;
      if (selectedConv && payload.message.conversationId === selectedConv.conversationId && payload.message.senderId !== myUserId) {
        setMessages(prev => [...prev, payload.message]);
        markConversationRead(selectedConv.conversationId);
        s.emit('sext:message_delivered', { messageId: payload.message.id });
      }
      fetchConversations();
    });

    s.on('sext:message_updated', (payload: { messageId: string, giftRequest?: any, serviceRequest?: any }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === payload.messageId) {
          const updated = { ...m };
          if (payload.giftRequest) updated.giftRequest = payload.giftRequest;
          if (payload.serviceRequest) updated.serviceRequest = payload.serviceRequest;
          return updated;
        }
        return m;
      }));
    });

    s.on('sext:media_unlocked', (payload: { messageId: string, mediaUrl: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, isUnlocked: true, mediaUrl: payload.mediaUrl } : m));
    });

    s.on('sext:photo_request_updated', (payload: { messageId: string, status: 'fulfilled' | 'declined', fulfilledMessageId?: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? {
        ...m,
        photoRequest: m.photoRequest ? {
          ...m.photoRequest,
          status: payload.status,
          fulfilledMessageId: payload.fulfilledMessageId || null
        } : undefined
      } : m));
    });

    s.on('sext:service_tonight_request_updated', (payload: { messageId: string, status: 'fulfilled' | 'declined', fulfilledMessageId?: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? {
        ...m,
        serviceTonightRequest: m.serviceTonightRequest ? {
          ...m.serviceTonightRequest,
          status: payload.status,
          fulfilledMessageId: payload.fulfilledMessageId || null
        } : undefined
      } : m));
    });

    s.on('sext:message_reacted', (payload: { messageId: string, reactions: any[] }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m));
    });

    s.on('sext:message_deleted', (payload: { messageId: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m));
    });

    s.on('sext:message_status_update', (payload: { messageId: string, status: string, deliveredAt: string }) => {
      if (payload.status === 'delivered') {
        setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, deliveredAt: payload.deliveredAt } : m));
      }
    });

    s.on('sext:messages_seen', (payload: { conversationId: string, seenAt: string }) => {
      if (payload.conversationId !== selectedConv?.conversationId) return;

      // Update all sent messages that don't have readAt with a 30ms stagger delay
      setMessages(prev => {
        const unreadSent = prev.filter(m => m.senderId === (user?.id || (user as any)?._id) && !m.readAt);
        if (unreadSent.length === 0) return prev;

        // Schedule staggered state updates for each unread sent message
        unreadSent.forEach((m, idx) => {
          setTimeout(() => {
            setMessages(current => current.map(msg => msg.id === m.id ? { ...msg, readAt: payload.seenAt } : msg));
          }, idx * 30);
        });

        return prev;
      });
    });

    s.on('sext:new_message_notification', (payload: { conversationId: string, messageId: string }) => {
      s.emit('sext:message_delivered', { messageId: payload.messageId });
      fetchConversations();
    });

    // Inbound Call signaling for provider
    s.on('call:incoming', (payload: { callId: string; callerName: string; type: 'video' | 'audio'; rate: number; webrtcRoomId: string }) => {
      setCallType(payload.type);
      setActiveCallId(payload.callId);
      setCallRate(payload.rate);
      setCallData({
        callId: payload.callId,
        roomId: payload.webrtcRoomId,
        perMinuteRate: payload.rate,
        callerName: payload.callerName
      });
      setCallState('ringing');
    });

    s.on('call:accepted', async () => {
      setCallDuration(0);
      setCallState('active');
    });

    s.on('call:ended', (payload: { callId: string; durationSeconds: number; creditsDeducted: number }) => {
      cleanupWebRTC();
      setCallSummary({
        duration: `${Math.floor(payload.durationSeconds / 60)} min ${payload.durationSeconds % 60} sec`,
        cost: payload.creditsDeducted,
        wasBilled: payload.creditsDeducted > 0
      });
      setCallState('summary');
    });

    s.on('call:missed', () => {
      cleanupWebRTC();
      setCallSummary({
        duration: '0 sec',
        cost: 0,
        wasBilled: false,
        status: 'missed'
      });
      setCallState('summary');
      toast.info('Call missed');
    });

    // Real-time online status updates
    const handleStatusChange = (userId: string, isOnline: boolean) => {
      setConversations(prev => prev.map(conv => {
        if (conv.otherUser && conv.otherUser.id === userId) {
          return {
            ...conv,
            otherUser: {
              ...conv.otherUser,
              isOnline
            }
          };
        }
        return conv;
      }));
      setSelectedConv(current => {
        if (current && current.otherUser && current.otherUser.id === userId) {
          return {
            ...current,
            otherUser: {
              ...current.otherUser,
              isOnline
            }
          };
        }
        return current;
      });
    };

    s.on('user:status', (payload: { userId: string; isOnline: boolean }) => {
      handleStatusChange(payload.userId, payload.isOnline);
    });

    s.on('provider:online', (payload: { providerId: string; isOnline: boolean }) => {
      handleStatusChange(payload.providerId, true);
    });

    s.on('provider:offline', (payload: { providerId: string; isOnline: boolean }) => {
      handleStatusChange(payload.providerId, false);
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
    };
  }, [token, selectedConv?.conversationId]);

  // Scroll behaviors — scroll to bottom instantly when entering a chat and messages are loaded
  useEffect(() => {
    if (!selectedConv) {
      activeConvIdRef.current = null;
      return;
    }
    if (activeConvIdRef.current !== selectedConv.conversationId) {
      if (messages.length > 0) {
        activeConvIdRef.current = selectedConv.conversationId;
        setTimeout(() => {
          scrollToBottom('instant');
        }, 50);
        setTimeout(() => {
          scrollToBottom('instant');
        }, 150);
      }
    }
  }, [messages, selectedConv]);

  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length > prevMessagesLengthRef.current) {
      const feed = feedRef.current;
      if (feed) {
        const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
        if (distanceFromBottom < 150) {
          scrollToBottom('smooth');
        }
      } else {
        scrollToBottom('smooth');
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Duration timer for calls
  useEffect(() => {
    let interval: any = null;
    if (callState === 'active') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const cleanupWebRTC = () => {
    setZegoToken(null);
    setZegoAppId(null);
    setZegoRoomId(null);
    setAcceptLoading(false);
  };

  const checkMediaPermissions = async (type: 'video' | 'audio') => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return true;
    }
    try {
      const constraints = {
        audio: true,
        video: type === 'video',
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') {
        toast.error(
          type === 'video'
            ? 'Camera and microphone access denied. Please allow permissions and try again.'
            : 'Microphone access denied. Please allow permissions and try again.'
        );
      } else {
        toast.error('Could not access media devices. Please check your browser settings.');
      }
      return false;
    }
  };

  const handleDeclineCall = async () => {
    if (!activeCallId) return;
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${activeCallId}/decline`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setCallState('idle');
    } catch (err) {
      console.error(err);
      setCallState('idle');
    }
  };

  const handleAcceptCall = async () => {
    if (!activeCallId || !callData) return;
    const hasPermissions = await checkMediaPermissions(callType);
    if (!hasPermissions) {
      await handleDeclineCall();
      return;
    }
    setAcceptLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${activeCallId}/accept`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const data = await res.json();

      const tokenRes = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${data.roomId || callData.roomId}&type=call`, {
        headers: getHeaders()
      });
      const tokenData = await tokenRes.json();
      if (tokenData.token) {
        setZegoToken(tokenData.token);
        setZegoAppId(tokenData.appId);
        setZegoRoomId(data.roomId || callData.roomId);
        setCallState('active');
      } else {
        setAcceptLoading(false);
        toast.error('Failed to get call token');
      }
    } catch (err) {
      setAcceptLoading(false);
      console.error(err);
    }
  };

  const handleEndCall = useCallback(async () => {
    if (!activeCallId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${activeCallId}/end`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'hung_up' })
      });
      const data = await res.json();
      cleanupWebRTC();
      setCallSummary({
        duration: `${Math.floor((data.durationSeconds || 0) / 60)} min ${(data.durationSeconds || 0) % 60} sec`,
        cost: data.creditsDeducted || 0,
        wasBilled: (data.creditsDeducted || 0) > 0
      });
      setCallState('summary');
    } catch (err) {
      cleanupWebRTC();
      setCallState('idle');
    }
  }, [activeCallId, token]);

  // Retry Send Message
  const handleRetrySend = async (msg: Message) => {
    const tempId = msg.id;
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: true, isFailed: false } : m));

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv!.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: msg.mediaType || 'text',
          content: msg.content
        })
      });
      const data = await res.json();
      if (res.status === 400 && data.error) {
        toast.error(data.error);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }
      if (data.id) {
        setMessages(prev => prev.map(m => m.id === tempId ? data : m));
        fetchConversations();

        const s = socketRef.current;
        if (s) {
          s.emit('sext:message_delivered', { messageId: data.id });
        }
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: false, isFailed: true } : m));
        toast.error('Message failed to send');
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: false, isFailed: true } : m));
      toast.error('Message failed to send');
    }
  };

  // Send Text Message
  const handleSendText = async () => {
    if (!selectedConv || (!inputText.trim() && !uploadPreview)) return;

    if (uploadPreview) {
      await handleUploadAndSend();
      return;
    }

    // Run final content check
    const result = detectContactSharing(inputText);
    if (result.detected) {
      setFilterWarning({ show: true, category: result.category });
      toast.error('Message blocked: sharing contact information is not allowed.');
      return;
    }

    const contentToSend = inputText;
    setInputText('');
    dismissWarning(); // dismiss warning popup

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      senderId: user?.id || (user as any)?._id || '',
      content: contentToSend,
      mediaType: 'text',
      creditCost: 0,
      isUnlocked: true,
      isOptimistic: true,
      isFailed: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      readAt: null
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: 'text',
          content: contentToSend
        })
      });
      const data = await res.json();
      if (res.status === 400 && data.error) {
        toast.error(data.error);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }
      if (data.id) {
        setMessages(prev => prev.map(m => m.id === tempId ? data : m));
        fetchConversations();

        const s = socketRef.current;
        if (s) {
          s.emit('sext:message_delivered', { messageId: data.id });
        }
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: false, isFailed: true } : m));
        toast.error('Message failed to send');
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isOptimistic: false, isFailed: true } : m));
      toast.error('Message failed to send');
    }
  };

  // File Upload flow
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File is too large. Max size is ${isVideo ? '100MB' : '10MB'}`);
      return;
    }

    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  };

  const handleUploadAndSend = async () => {
    if (!uploadFile || !selectedConv) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const isVideo = uploadFile.type.startsWith('video/');
      const context = isVideo ? 'chat_video' : 'chat_image';

      const result = await uploadMedia(uploadFile, context, false, (percent) => {
        setUploadProgress(10 + Math.round(percent * 0.7)); // scale from 10 to 80
      });

      setUploadProgress(80);

      const mediaType = isVideo ? 'video' : 'image';

      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: mediaType,
          mediaUrl: result.url,
          cloudinaryPublicId: result.publicId,
          mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : result.url,
          creditCost: 0
        })
      });

      const messageData = await res.json();
      if (messageData.id) {
        setMessages(prev => [...prev, messageData]);
        setUploadFile(null);
        setUploadPreview('');
        toast.success('Attachment uploaded and sent!');
      }
    } catch (err) {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Send Paid Media dialog flow
  const handlePaidMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File is too large. Max size is ${isVideo ? '100MB' : '10MB'}`);
      return;
    }

    setPaidMediaFile(file);
    setPaidMediaPreview(URL.createObjectURL(file));
  };

  const handleSendPaidMediaSubmit = async () => {
    if (!paidMediaFile || !selectedConv) return;
    if (isSendingPaidMedia) return;
    if (paidMediaCost < 1) {
      toast.error('Unlock price must be at least 1 credit.');
      return;
    }

    setIsSendingPaidMedia(true);
    setIsMediaUploading(true);
    setMediaUploadProgress(10);

    try {
      const isVideo = paidMediaFile.type.startsWith('video/');
      const context = isVideo ? 'paid_video' : 'paid_image';

      const result = await uploadMedia(paidMediaFile, context, true, (percent) => {
        setMediaUploadProgress(10 + Math.round(percent * 0.7)); // scale from 10 to 80
      });

      setMediaUploadProgress(80);

      const mediaType = isVideo ? 'locked_video' : 'locked_image';

      if (activePhotoRequestFulfillId) {
        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${activePhotoRequestFulfillId}/fulfill`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            mediaUrl: result.url,
            cloudinaryPublicId: result.publicId,
            mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : result.url,
            creditCost: paidMediaCost,
            isLocked: true
          })
        });
        const data = await res.json();
        if (data.requestMessage) {
          setMessages(prev => prev.map(m => m.id === activePhotoRequestFulfillId ? {
            ...m,
            photoRequest: { ...m.photoRequest!, status: 'fulfilled', fulfilledMessageId: data.imageMessage._id }
          } : m));
          setMessages(prev => [...prev, data.imageMessage]);
          toast.success('Photo request fulfilled with paid media!');
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            type: mediaType,
            content: paidMediaCaption || '[Premium Locked Content]',
            mediaUrl: result.url,
            cloudinaryPublicId: result.publicId,
            mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : result.url,
            creditCost: paidMediaCost
          })
        });
        const data = await res.json();
        if (data.id) {
          setMessages(prev => [...prev, data]);
          toast.success('Locked media payload sent successfully!');
        }
      }

      setShowPaidMediaDialog(false);
      setPaidMediaFile(null);
      setPaidMediaPreview('');
      setPaidMediaCaption('');
      setPaidMediaCost(50);
      setActivePhotoRequestFulfillId(null);
      fetchConversations();
    } catch (err) {
      toast.error('Failed to send media');
    } finally {
      setIsSendingPaidMedia(false);
      setIsMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };

  // Send Gift Request Picker Dialog
  const openGiftRequestPicker = async () => {
    setShowGiftRequestDialog(true);
    setIsGiftsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/gifts/catalogue`, { headers: getHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setGiftsCatalogue(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGiftsLoading(false);
    }
  };

  const handleSendGiftRequest = async () => {
    if (!selectedGift || !selectedConv) return;
    if (isSendingGiftRequest) return;
    setIsSendingGiftRequest(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/gift-request`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          giftId: selectedGift._id,
          message: giftRequestNote
        })
      });
      const data = await res.json();
      if (data.id) {
        setMessages(prev => [...prev, data]);
        setShowGiftRequestDialog(false);
        setSelectedGift(null);
        setGiftRequestNote('');
        toast.success(`Requested a ${selectedGift.name}!`);
      }
    } catch (err) {
      toast.error('Failed to request gift');
    } finally {
      setIsSendingGiftRequest(false);
    }
  };

  // Send Service Request Dialog
  const handleAddExtraChargeRow = () => {
    if (serviceExtras.length >= 5) return;
    setServiceExtras(prev => [...prev, { label: '', amount: 10 }]);
  };

  const handleRemoveExtraChargeRow = (idx: number) => {
    setServiceExtras(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSendServiceRequestSubmit = async () => {
    if (!selectedConv) return;
    if (isSendingServiceRequest) return;
    const cleanedExtras = serviceExtras.filter(e => e.label.trim());

    setIsSendingServiceRequest(true);
    try {
      let url = `${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/service-request`;
      let method = 'POST';
      let body: any = {
        extras: cleanedExtras,
        note: serviceRequestNote
      };

      if (activeServiceTonightRequestFulfillId) {
        url = `${API_BASE_URL}/v1/adult/sext/service-tonight-requests/${activeServiceTonightRequestFulfillId}/fulfill`;
        method = 'PUT';
        body = {
          baseRate: tonightRate,
          extras: cleanedExtras,
          note: serviceRequestNote
        };
      }

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || 'A service request is already active in this conversation');
        return;
      }

      if (activeServiceTonightRequestFulfillId) {
        if (data.requestMessage) {
          setMessages(prev => prev.map(m => m.id === activeServiceTonightRequestFulfillId ? {
            ...m,
            serviceTonightRequest: { ...m.serviceTonightRequest!, status: 'fulfilled', fulfilledMessageId: data.invoiceMessage._id }
          } : m));
          setMessages(prev => [...prev, {
            id: data.invoiceMessage._id,
            senderId: data.invoiceMessage.senderId,
            receiverId: data.invoiceMessage.receiverId,
            content: `🌙 Service request: 💎 ${data.invoiceMessage.serviceRequest?.totalAmount}`,
            mediaType: 'service_request',
            serviceRequest: data.invoiceMessage.serviceRequest,
            isUnlocked: true,
            creditCost: 0,
            isDeleted: false,
            createdAt: data.invoiceMessage.createdAt
          }]);
          setShowServiceRequestDialog(false);
          setServiceExtras([]);
          setServiceRequestNote('');
          setActiveServiceTonightRequestFulfillId(null);
          toast.success('Tonight service request fulfilled!');
        }
      } else {
        if (data.id) {
          setMessages(prev => [...prev, data]);
          setShowServiceRequestDialog(false);
          setServiceExtras([]);
          setServiceRequestNote('');
          toast.success('Tonight service charge request sent!');
        }
      }
    } catch (err) {
      toast.error('Failed to send service request');
    } finally {
      setIsSendingServiceRequest(false);
    }
  };

  // Handle Actionable Photo Requests received from members
  const handleFulfillPhotoRequestFree = async (msgId: string) => {
    if (processingIds[msgId]) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setProcessingIds(prev => ({ ...prev, [msgId]: true }));
      toast.loading('Uploading and fulfilling request...');
      try {
        const result = await uploadMedia(file, 'chat_image', false);

        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${msgId}/fulfill`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            mediaUrl: result.url,
            cloudinaryPublicId: result.publicId,
            creditCost: 0,
            isLocked: false
          })
        });
        const data = await res.json();
        if (data.requestMessage) {
          setMessages(prev => prev.map(m => m.id === msgId ? {
            ...m,
            photoRequest: { ...m.photoRequest!, status: 'fulfilled', fulfilledMessageId: data.imageMessage._id }
          } : m));
          setMessages(prev => [...prev, data.imageMessage]);
          toast.dismiss();
          toast.success('Photo request fulfilled with free photo!');
        }
      } catch (err) {
        toast.dismiss();
        toast.error('Failed to fulfill request');
      } finally {
        setProcessingIds(prev => ({ ...prev, [msgId]: false }));
      }
    };
    input.click();
  };

  const handleDeclinePhotoRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${msgId}/decline`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, photoRequest: { ...m.photoRequest!, status: 'declined' } } : m));
      toast.info('Photo request declined');
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  // Reactions
  const handleReactToMessage = async (msgId: string, emoji: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${msgId}/react`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji })
      });
      const reactions = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${msgId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m));
    } catch (err) {
      toast.error('Cannot delete this message');
    }
  };

  // Audio Visualizers for recordings
  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const animate = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const heights = Array.from(dataArray).slice(0, 30).map(val => {
          return Math.max(4, (val / 255) * 32);
        });
        setAmplitudeData(heights);
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.error('AudioContext visualizer failed:', e);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = setInterval(() => {
        setAmplitudeData(Array.from({ length: 30 }, () => Math.max(4, Math.random() * 28 + 4)));
      }, 100);
    }
  };

  const stopAudioVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const handleStartRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      toast.error('Please allow microphone access to send voice messages.');
      return;
    }

    streamRef.current = stream;
    audioChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      stopAudioVisualizer();
      const duration = recDurationRef.current;

      if (duration < 1) {
        toast.error('Recording too short!');
        handleCancelRecording();
        return;
      }

      setRecState('sending');
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        const file = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: recorder.mimeType });

        const result = await uploadMedia(file, 'voice_note', false);

        const amplitudeWaveform = Array.from({ length: 25 }, () => Math.random());

        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv!.conversationId}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            type: 'voice_note',
            mediaUrl: result.url,
            mediaDurationSeconds: duration,
            mediaMimeType: recorder.mimeType,
            content: amplitudeWaveform.join(',')
          })
        });
        const msg = await res.json();
        if (msg.id) {
          setMessages(prev => [...prev, msg]);
        }
      } catch (err) {
        toast.error('Failed to send voice note');
      } finally {
        setRecState('idle');
        setRecDuration(0);
        recDurationRef.current = 0;
      }
    };

    recorder.start();

    setRecState('recording');
    setRecDuration(0);
    recDurationRef.current = 0;

    startAudioVisualizer(stream);
  };

  useEffect(() => {
    let interval: any = null;
    let maxTimeout: any = null;

    if (recState === 'recording') {
      interval = setInterval(() => {
        setRecDuration(prev => {
          const next = prev + 1;
          recDurationRef.current = next;
          return next;
        });
      }, 1000);

      maxTimeout = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          handleStopAndSend();
        }
      }, 5 * 60 * 1000);
    } else {
      setRecDuration(0);
      recDurationRef.current = 0;
    }

    return () => {
      if (interval) clearInterval(interval);
      if (maxTimeout) clearTimeout(maxTimeout);
    };
  }, [recState]);

  const handleStopAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    stopAudioVisualizer();
    setRecState('idle');
    setRecDuration(0);
    recDurationRef.current = 0;
    toast.info('Recording cancelled');
  };

  // Calculations
  const totalServiceChargeAmount = (dynTonightRate || tonightRate) + serviceExtras.reduce((sum, item) => sum + item.amount, 0);

  // Filters
  const filteredConversations = conversations.filter(c => {
    if (!c.otherUser) return false;
    const nameMatch = c.otherUser.displayName.toLowerCase().includes(searchText.toLowerCase());
    const previewMatch = c.lastMessage?.content?.toLowerCase().includes(searchText.toLowerCase()) || false;
    return nameMatch || previewMatch;
  });

  const handleScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    if (feed.scrollTop < 60 && hasMoreMessages) {
      const previousScrollHeight = feed.scrollHeight;
      loadMoreMessages().then(() => {
        requestAnimationFrame(() => {
          const newScrollHeight = feed.scrollHeight;
          feed.scrollTop = newScrollHeight - previousScrollHeight;
        });
      });
    }
  };

  if (isConversationsLoading) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--az-accent-gold)] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Loading Inbox Messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] md:h-[calc(100vh-64px)] w-full flex overflow-hidden bg-[#0a0508] text-[var(--az-text-primary)] font-sans chat-page-mobile">

      {/* 1. LEFT PANEL: CONVERSATION LIST */}
      <div className={`w-full md:w-80 flex-shrink-0 flex-col border-r border-[var(--az-border)] bg-[#070406] h-full min-h-0 overflow-hidden ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-[var(--az-border)] flex items-center justify-between">
          <h2 className="text-xl font-serif italic text-pink-500">Inbox Messages</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="text-gray-400 hover:text-white text-lg p-1"
            >
              🔍
            </button>
          </div>
        </div>

        {isSearchExpanded && (
          <div className="p-3 border-b border-[var(--az-border)]/50">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-[#150a11] border border-[var(--az-border)] text-sm rounded-lg px-3 py-1.5 outline-none focus:border-pink-500"
            />
          </div>
        )}

        <div className="flex-grow overflow-y-auto no-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500 h-64">
              <span className="text-4xl mb-3">💬</span>
              <p className="text-sm font-semibold">No active chats</p>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const other = c.otherUser;
              if (!other) return null;
              const isSelected = selectedConv?.conversationId === c.conversationId;

              return (
                <div
                  key={c.conversationId}
                  onClick={() => selectConversation(c)}
                  className={`p-4 flex gap-4 cursor-pointer hover:bg-[#1a0c16] transition-colors border-b border-[var(--az-border)]/30 relative ${isSelected ? 'bg-[#1a0c16] border-l-4 border-pink-500' : ''}`}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={other.avatarUrl}
                      name={other.displayName}
                      size={48}
                      className="border border-[var(--az-border)]"
                    />
                    {other.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#070406] rounded-full animate-pulse" />
                    )}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-center mb-1 gap-2 min-w-0">
                      <h4 className="font-bold text-sm truncate flex-1 min-w-0">{other.displayName}</h4>
                      {c.lastMessage && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {new Date(c.lastMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-pink-400 font-bold' : 'text-gray-400'}`}>
                      {c.lastMessage ? c.lastMessage.content : 'No messages yet...'}
                    </p>
                  </div>

                  {c.unreadCount > 0 && (
                    <span className="flex-shrink-0 bg-pink-600 text-white font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. CHAT FEED & HEADER WINDOW */}
      <div className={`flex-grow flex flex-col bg-[#0e070c] h-full min-h-0 overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {selectedConv ? (
          <>
            {/* HEADER */}
            <div data-testid="conversation-header" className="conversation-header p-4 bg-[#140b13] border-b border-[var(--az-border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden text-lg text-pink-400 p-1 conversation-header__back"
                >
                  ←
                </button>
                <div className="relative flex-shrink-0">
                  <Avatar
                    src={selectedConv.otherUser?.avatarUrl}
                    name={selectedConv.otherUser?.displayName}
                    size={36}
                    className="border border-pink-500/50 conversation-header__avatar"
                  />
                  {selectedConv.otherUser?.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-[#140b13]" />
                  )}
                </div>
                <div className="conversation-header__info min-w-0">
                  <h3 className="font-bold text-sm conversation-header__name truncate">{selectedConv.otherUser?.displayName}</h3>
                  <span className={`text-[9px] uppercase tracking-widest font-bold conversation-header__status ${
                    selectedConv.otherUser?.isOnline ? '' : 'conversation-header__status--offline'
                  }`}>
                    {selectedConv.otherUser?.isOnline ? 'Online Now' : 'Offline'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 conversation-header__actions flex-shrink-0">
                <button
                  data-testid="send-paid-media-btn"
                  onClick={() => setShowPaidMediaDialog(true)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  <span className="text-xs">💎</span>
                  <span className="hidden sm:inline">Send Paid Media</span>
                </button>
              </div>
            </div>

            {/* MESSAGES SCROLL area */}
            <div ref={feedRef} onScroll={handleScroll} data-testid="message-feed" className="flex-grow overflow-y-auto p-6 space-y-6 flex flex-col no-scrollbar message-feed message-feed-container">
              {hasMoreMessages && (
                <button
                  onClick={loadMoreMessages}
                  className="text-xs text-pink-400 text-center mx-auto hover:underline"
                >
                  Load older messages
                </button>
              )}

              {messages.map((m) => {
                const isMe = m.senderId === user?.id || m.senderId === (user as any)?._id;

                const toggleReaction = (emoji: string) => {
                  handleReactToMessage(m.id, emoji);
                };

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col group w-full ${
                      m.mediaType === 'gift' || m.mediaType === 'gift_request' || m.mediaType === 'service_request' || m.mediaType === 'request_photo' || m.mediaType === 'locked_image' || m.mediaType === 'locked_video'
                        ? 'items-center'
                        : isMe ? 'items-end' : 'items-start'
                    }`}
                  >

                    {m.systemText || m.mediaType === 'system' ? (
                      <div className="mx-auto my-2 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                        ── {m.systemText || m.content} ──
                      </div>
                    ) : m.mediaType === 'locked_image' || m.mediaType === 'locked_video' ? (
                      /* LOCKED MEDIA - PROVIDER SENT VIEW */
                      <div data-testid="message-locked-media" className="relative w-64 h-80 rounded-2xl overflow-hidden border border-amber-500/30 bg-[#160c14] flex flex-col items-center justify-center p-4 shadow-xl message-locked-media">
                        <div
                          className="absolute inset-0 bg-cover bg-center filter blur-xl opacity-30 scale-110"
                          style={{ backgroundImage: `url(${m.mediaThumbnailUrl || FALLBACK_AVATAR})` }}
                        />
                        <div className="z-10 flex flex-col items-center text-center">
                          <span className="text-3xl mb-3">🔒</span>
                          <p className="text-xs font-serif italic text-amber-300 tracking-widest uppercase mb-1">YOUR LOCKED PAYLOAD</p>
                          <p className="text-[10px] text-gray-400 mb-6 uppercase tracking-wider">PREVIEW SILHOUETTE EFFECT</p>
                          <p className="text-sm font-bold text-amber-400 italic">💎 {m.creditCost} credits to unlock</p>
                        </div>
                      </div>
                    ) : m.mediaType === 'gift' ? (
                      <div data-testid="message-gift-card" className="w-72 bg-gradient-to-br from-pink-900/60 to-purple-900/40 border border-pink-500/50 rounded-2xl p-4 shadow-lg text-center relative overflow-hidden flex flex-col items-center message-gift-card">
                        <div className="absolute top-1 right-2 text-[8px] text-yellow-400 font-bold uppercase tracking-widest">GIFT SENT</div>
                        <span className="text-5xl my-2">🎁</span>
                        <h5 className="font-serif italic text-pink-300 text-base">{m.gift?.giftName}</h5>
                        <p className="text-yellow-400 font-bold text-xs mt-1">💎 {m.gift?.giftValue} Credits</p>
                        {m.gift?.message && (
                          <p className="text-xs italic text-gray-300 mt-2 border-t border-pink-500/20 pt-2 w-full break-words">"{m.gift.message}"</p>
                        )}
                      </div>
                    ) : m.mediaType === 'gift_request' ? (
                      /* GIFT REQUEST (PROVIDER VIEW) */
                      <div data-testid="gift-request-message" className="w-72 bg-gradient-to-br from-[#200e1b] to-[#120711] border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl text-center relative overflow-hidden flex flex-col items-center">
                        <div className="absolute top-1.5 right-2.5 text-[8px] text-amber-400 font-bold uppercase tracking-widest">WISH REQUEST</div>
                        <span className="text-5xl my-3 animate-bounce">🎁</span>
                        <h5 className="font-serif italic text-white text-base">You requested a {m.giftRequest?.giftName}</h5>
                        <p className="text-amber-400 font-bold font-mono text-xs mt-1">💎 {m.giftRequest?.giftValue} Credits</p>
                        {m.giftRequest?.message && (
                          <p className="text-[11px] italic text-gray-300 my-3 border-t border-pink-500/10 pt-3 w-full break-words">"{m.giftRequest.message}"</p>
                        )}
                        <div className="w-full mt-4">
                          <span className={`block text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-xl border ${
                            m.giftRequest?.status === 'pending'
                              ? 'bg-amber-950/20 border-amber-500/30 text-amber-400'
                              : 'bg-green-950/20 border-green-500/30 text-green-400'
                          }`}>
                            {m.giftRequest?.status === 'pending' ? '⏳ Waiting for response...' : '🎁 Gift sent!'}
                          </span>
                        </div>
                      </div>
                    ) : m.mediaType === 'service_request' ? (
                      /* SERVICE REQUEST (PROVIDER SENT VIEW) */
                      <div data-testid="service-request-message" className="w-72 bg-gradient-to-br from-[#1b0a14] to-[#0d040a] border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col text-left">
                        <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                          <span className="text-lg">🌙</span>
                          <span className="font-bold text-[10px] uppercase tracking-wider text-amber-400">Tonight Service Charge</span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between text-gray-300">
                            <span>Tonight rate:</span>
                            <span className="font-mono font-bold text-white">💎 {m.serviceRequest?.baseRate}</span>
                          </div>
                          {m.serviceRequest?.extras?.map((ext: { label: string; amount: number }, idx: number) => (
                            <div key={idx} className="flex justify-between text-gray-400">
                              <span>{ext.label}:</span>
                              <span className="font-mono text-white">💎 {ext.amount}</span>
                            </div>
                          ))}
                          <div className="border-t border-white/5 my-2 pt-2 flex justify-between items-center text-sm font-bold">
                            <span className="text-white">TOTAL:</span>
                            <span className="font-mono text-amber-400">💎 {m.serviceRequest?.totalAmount}</span>
                          </div>
                          <span className="text-[10px] text-gray-500 block text-right">
                            ≈ {formatNaira(m.serviceRequest?.totalAmount! * usePricingStore.getState().diamondNairaRate)}
                          </span>
                        </div>

                        {m.serviceRequest?.note && (
                          <p className="text-[11px] text-gray-400 italic mt-3 bg-white/5 p-2 rounded-lg border-l-2 border-amber-400 break-words">
                            "{m.serviceRequest.note}"
                          </p>
                        )}

                        <div className="mt-4">
                          <span
                            data-testid="service-request-status"
                            className={`block text-xs font-bold uppercase tracking-widest text-center py-2 rounded-xl border ${
                              m.serviceRequest?.status === 'pending'
                                ? 'bg-amber-950/20 border-amber-500/30 text-amber-400'
                                : m.serviceRequest?.status === 'paid'
                                ? 'bg-green-950/20 border-green-500/30 text-green-400'
                                : m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed'
                                ? 'bg-green-950/20 border-green-500/30 text-green-400'
                                : 'bg-red-950/20 border-red-500/30 text-red-400'
                            }`}
                          >
                            {m.serviceRequest?.status === 'pending' && '⏳ Awaiting payment'}
                            {m.serviceRequest?.status === 'paid' && '✅ Payment received'}
                            {(m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed') && '🌙 Service completed'}
                            {m.serviceRequest?.status === 'reported' && '⚠️ Reported'}
                          </span>
                        </div>

                        {m.serviceRequest?.status === 'paid' && (
                          <p className="text-[10px] text-gray-500 italic mt-2 text-center">
                            Payment is held until member confirms completion or 72 hours after payment.
                          </p>
                        )}
                      </div>
                    ) : m.mediaType === 'request_photo' ? (
                      /* PHOTO REQUEST received by provider - ACTIONABLE CARD */
                      <div data-testid="message-photo-request" className="w-64 bg-[#1b0d19] border-2 border-dashed border-pink-500/40 rounded-xl p-4 flex flex-col gap-3 message-photo-request">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📷</span>
                          <span className="font-bold text-xs tracking-wider text-pink-400 uppercase">Photo Request</span>
                        </div>
                        {m.photoRequest?.note && (
                          <p className="text-xs text-gray-300 italic break-words">"{m.photoRequest.note}"</p>
                        )}

                        {m.photoRequest?.status === 'pending' ? (
                          <div className="flex flex-col gap-2 mt-2">
                            <button
                              data-testid="photo-request-accept-paid"
                              onClick={() => {
                                setActivePhotoRequestFulfillId(m.id);
                                setPaidMediaCaption("Here's your requested photo 📸");
                                setShowPaidMediaDialog(true);
                              }}
                              disabled={processingIds[m.id]}
                              className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                            >
                              💰 Accept & Send Paid
                            </button>
                            <button
                              data-testid="photo-request-send-free"
                              onClick={() => handleFulfillPhotoRequestFree(m.id)}
                              disabled={processingIds[m.id]}
                              className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white rounded text-[10px] font-bold uppercase disabled:opacity-50"
                            >
                              {processingIds[m.id] ? 'Fulfilling...' : 'Send Free Photo'}
                            </button>
                            <button
                              data-testid="photo-request-decline"
                              onClick={() => handleDeclinePhotoRequest(m.id)}
                              disabled={processingIds[m.id]}
                              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px] font-bold uppercase disabled:opacity-50"
                            >
                              {processingIds[m.id] ? 'Declining...' : 'Decline'}
                            </button>
                          </div>
                        ) : m.photoRequest?.status === 'fulfilled' ? (
                          <div className="text-[10px] text-green-400 font-bold tracking-wider uppercase mt-2">
                            ✓ Photo Request fulfilled
                          </div>
                        ) : (
                          <div className="text-[10px] text-red-400 font-bold tracking-wider uppercase mt-2">
                            ✗ Photo Request declined
                          </div>
                        )}
                      </div>
                    ) : m.mediaType === 'request_service' ? (
                      /* SERVICE TONIGHT REQUEST received by provider - ACTIONABLE CARD */
                      <div data-testid="message-service-tonight-request" className="w-64 bg-[#140b13] border-2 border-dashed border-purple-500/40 rounded-xl p-4 flex flex-col gap-3 message-service-tonight-request">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🌙</span>
                          <span className="font-bold text-xs tracking-wider text-purple-400 uppercase">Service Request</span>
                        </div>
                        {m.serviceTonightRequest?.note && (
                          <p className="text-xs text-gray-300 italic break-words">"{m.serviceTonightRequest.note}"</p>
                        )}

                        {m.serviceTonightRequest?.status === 'pending' ? (
                          <div className="flex flex-col gap-2 mt-2">
                            <button
                              onClick={() => {
                                setActiveServiceTonightRequestFulfillId(m.id);
                                setShowServiceRequestDialog(true);
                              }}
                              disabled={processingIds[m.id]}
                              className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                            >
                               Accept & Send Rates
                            </button>
                            <button
                              onClick={() => handleDeclineServiceTonightRequest(m.id)}
                              disabled={processingIds[m.id]}
                              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px] font-bold uppercase disabled:opacity-50"
                            >
                              {processingIds[m.id] ? 'Declining...' : 'Decline'}
                            </button>
                          </div>
                        ) : m.serviceTonightRequest?.status === 'fulfilled' ? (
                          <div className="text-[10px] text-green-400 font-bold tracking-wider uppercase mt-2">
                            ✓ Service Request fulfilled
                          </div>
                        ) : (
                          <div className="text-[10px] text-red-400 font-bold tracking-wider uppercase mt-2">
                            ✗ Service Request declined
                          </div>
                        )}
                      </div>
                    ) : m.mediaType === 'image' ? (
                      <div data-testid="message-bubble" className={`max-w-xs rounded-xl overflow-hidden border border-pink-500/20 message-bubble ${m.isFailed ? 'msg-bubble--failed' : ''}`}>
                        <img src={m.mediaUrl} className="max-h-72 object-cover" alt="attachment" />
                      </div>
                    ) : m.mediaType === 'video' ? (
                      <div data-testid="message-bubble" className={`max-w-xs rounded-xl overflow-hidden border border-pink-500/20 bg-black message-bubble ${m.isFailed ? 'msg-bubble--failed' : ''}`}>
                        <video src={m.mediaUrl} controls className="max-h-72 object-cover" />
                      </div>
                    ) : m.mediaType === 'voice_note' || m.mediaType === 'voice' ? (
                      <div data-testid="message-voice-note" className={`p-3.5 rounded-2xl flex items-center gap-3 w-64 message-voice-note ${isMe ? 'bg-pink-700 text-white' : 'bg-[#1e101a] text-gray-200 border border-pink-500/20'} ${m.isFailed ? 'msg-bubble--failed' : ''}`}>
                        <button className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
                          ▶
                        </button>
                        <div className="flex-grow flex items-end gap-0.5 h-6">
                          {Array.from({ length: 15 }).map((_, idx) => (
                            <span
                              key={idx}
                              className="w-1.5 bg-pink-300 rounded-t"
                              style={{ height: `${Math.max(15, (idx % 4) * 20)}%` }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-mono opacity-80">
                          0:{m.mediaDurationSeconds ? String(m.mediaDurationSeconds).padStart(2, '0') : '05'}
                        </span>
                      </div>
                    ) : (
                      // STANDARD TEXT MESSAGE
                      <div data-testid="message-bubble" className={`p-3.5 max-w-xs text-sm rounded-2xl shadow-md leading-relaxed message-bubble break-words ${isMe ? 'bg-pink-600 text-white rounded-tr-none' : 'bg-[#1b0d19] border border-pink-500/20 text-gray-200 rounded-tl-none'} ${m.isFailed ? 'msg-bubble--failed' : ''}`}>
                        {m.content}
                      </div>
                    )}

                    {/* Time & seen tick mark */}
                    <div className="msg-meta flex items-center gap-1.5 mt-1 text-[9px] text-gray-400 uppercase tracking-widest font-mono">
                      <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && !m.isFailed && (
                        <MessageTick status={getMessageStatus(m)} />
                      )}
                      {isMe && m.isFailed && (
                        <span className="msg-tick--failed text-red-500 font-bold ml-1">✗ Failed</span>
                      )}
                    </div>
                    {isMe && m.isFailed && (
                      <button className="msg-retry" onClick={() => handleRetrySend(m)}>
                        ↻ Tap to retry
                      </button>
                    )}

                    {/* Hover tools */}
                    <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {['❤️', '🔥', '😂', '👍'].map(em => (
                        <button
                          key={em}
                          onClick={() => toggleReaction(em)}
                          className="hover:scale-125 transition-transform text-xs"
                        >
                          {em}
                        </button>
                      ))}
                      {isMe && (
                        <button
                          onClick={() => handleDeleteMessage(m.id)}
                          className="text-[10px] text-red-500 hover:underline ml-2"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Render existing reactions */}
                    {m.reactions && m.reactions.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {m.reactions.map((r, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-pink-900/30 border border-pink-500/20 rounded-full text-[10px]">
                            {r.emoji}
                          </span>
                        ))}
                      </div>
                    )}

                  </div>
                );
              })}

              <div ref={messagesEndRef} style={{ height: 1 }} />
            </div>

            {/* QUICK ACTIONS BAR ABOVE INPUT */}
            {uploadPreview && (
              <div className="p-3 bg-[#1e0f1d] border-t border-[var(--az-border)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img src={uploadPreview} className="w-12 h-12 rounded object-cover" alt="upload preview" />
                  <div>
                    <span className="text-xs block font-bold text-pink-400">Selected Attachment</span>
                  </div>
                </div>

                <button
                  onClick={() => { setUploadFile(null); setUploadPreview(''); }}
                  className="text-red-400 hover:text-red-500 font-bold text-xs px-2 py-1 bg-red-950/20 rounded"
                >
                  Cancel
                </button>
              </div>
            )}

            {isUploading && (
              <div className="px-6 py-2 bg-pink-950/40 text-[10px] flex items-center justify-between font-mono text-pink-300 tracking-wider">
                <span>UPLOADING TO PRIVATE STORAGE...</span>
                <span>{uploadProgress}%</span>
              </div>
            )}

            {/* BOTTOM INPUT BAR */}
            <div data-testid="chat-input-bar" className="chat-input-bar p-4 border-t border-[var(--az-border)] bg-[#10070e] flex flex-col gap-2 flex-shrink-0 relative">
              {/* Content violation warnings */}
              {filterWarning.show && (
                <ProviderContentWarning
                  onDismiss={dismissWarning}
                />
              )}

              {recState === 'sending' ? (
                <div className="recording-bar flex items-center justify-center gap-3 h-14 bg-[#150a12] rounded-full px-4 border border-[var(--az-border)] w-full">
                  <span className="animate-spin text-sm">⏳</span>
                  <span className="text-xs font-mono text-pink-300">Sending voice note...</span>
                </div>
              ) : recState === 'recording' ? (
                <div data-testid="recording-bar" className="recording-bar flex items-center justify-between h-14 bg-[#150a12] rounded-full px-4 border border-[var(--az-border)] transition-all duration-200 w-full">
                  <button
                    data-testid="recording-cancel-btn"
                    onClick={handleCancelRecording}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      handleCancelRecording();
                    }}
                    className="recording-bar__cancel flex items-center justify-center p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    aria-label="Cancel recording"
                  >
                    🗑️
                  </button>

                  <div className="recording-bar__center flex-grow flex items-center gap-3 px-2 min-w-0">
                    <span data-testid="recording-dot" className="recording-dot w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-ping" />

                    <div data-testid="recording-waveform" className="recording-waveform flex-grow flex items-center gap-0.5 h-8 overflow-hidden">
                      {amplitudeData.map((h, i) => (
                        <div
                          key={i}
                          className="recording-waveform__bar w-[3px] rounded-full bg-[var(--az-accent-rose)] transition-all duration-75 flex-shrink-0"
                          style={{ height: `${h}px` }}
                        />
                      ))}
                    </div>

                    <span data-testid="recording-timer" className="recording-timer text-xs font-mono text-[var(--az-text-primary)] flex-shrink-0">
                      {Math.floor(recDuration / 60)}:{(recDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  <button
                    data-testid="recording-send-btn"
                    onClick={handleStopAndSend}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      handleStopAndSend();
                    }}
                    className="recording-bar__send w-10 h-10 bg-[var(--az-accent-primary)] hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 flex-shrink-0"
                    aria-label="Send voice message"
                  >
                    →
                  </button>
                </div>
              ) : (
                <div className="chat-input-row flex items-center gap-3 bg-[#150a12] rounded-full px-4 py-1.5 border border-[var(--az-border)] w-full">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="chat-input__emoji text-lg opacity-70 hover:opacity-100 transition-opacity p-1 flex-shrink-0"
                  >
                    😀
                  </button>

                  <label className="chat-input__media text-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer p-1 flex-shrink-0">
                    📸
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  <input
                    data-testid="chat-text-input"
                    type="text"
                    placeholder="Send a message..."
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      checkContent(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    className="chat-input__field flex-grow bg-transparent border-none outline-none text-sm text-[var(--az-text-primary)] py-2 min-w-0"
                  />

                  <button
                    data-testid="mic-button"
                    onClick={() => {
                      if (recState === 'idle') {
                        handleStartRecording();
                      } else if (recState === 'recording') {
                        handleStopAndSend();
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      if (recState === 'idle') {
                        handleStartRecording();
                      } else if (recState === 'recording') {
                        handleStopAndSend();
                      }
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                    }}
                    className="chat-input__mic p-1 rounded-full transition-all opacity-70 hover:opacity-100 relative flex-shrink-0"
                    title="Tap to record voice note"
                  >
                    🎙️
                  </button>

                  <button
                    onClick={() => handleSendText()}
                    className="chat-input__send w-8 h-8 bg-pink-600 hover:bg-pink-700 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-pink-500/20 active:scale-95 transition-all flex-shrink-0"
                  >
                    →
                  </button>
                </div>
              )}

              {/* Emoji Picker Modal */}
              {showEmojiPicker && (
                <div className="absolute bottom-24 left-10 z-50 bg-[#160c14] border border-[var(--az-border)] rounded-xl p-3 shadow-2xl w-64">
                  <div className="text-xs font-serif italic text-pink-300 mb-2 border-b border-pink-500/20 pb-1 flex justify-between">
                    <span>Recent Emojis</span>
                    <button onClick={() => setShowEmojiPicker(false)}>×</button>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {recentEmojis.map(em => (
                      <button
                        key={em}
                        onClick={() => {
                          setInputText(prev => prev + em);
                          setShowEmojiPicker(false);
                        }}
                        className="text-lg hover:scale-125 transition-transform"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Provider Quick Actions (Always Visible, no conditional gating) */}
              <div className="provider-quick-actions">
                <button
                  data-testid="gift-request-btn"
                  onClick={openGiftRequestPicker}
                  onTouchStart={(e) => { e.preventDefault(); openGiftRequestPicker(); }}
                  className="provider-quick-action-btn provider-quick-action-btn--gift"
                >
                  <span className="btn-icon">🎁</span>
                  SEND GIFT REQUEST
                </button>
                <button
                  onClick={() => setShowPaidMediaDialog(true)}
                  onTouchStart={(e) => { e.preventDefault(); setShowPaidMediaDialog(true); }}
                  className="provider-quick-action-btn provider-quick-action-btn--media"
                >
                  <span className="btn-icon">💰</span>
                  SEND PAID MEDIA
                </button>
                <button
                  data-testid="service-request-btn"
                  onClick={() => setShowServiceRequestDialog(true)}
                  onTouchStart={(e) => { e.preventDefault(); setShowServiceRequestDialog(true); }}
                  className="provider-quick-action-btn provider-quick-action-btn--service"
                >
                  <span className="btn-icon">🌙</span>
                  SEND SERVICE CHARGE
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-grow p-8 text-center text-gray-500">
            <span className="text-6xl mb-4 text-pink-500/30">💌</span>
            <h3 className="text-lg font-serif italic text-[var(--az-text-primary)]">Inbox Messages</h3>
            <p className="text-xs max-w-xs mt-2">Select an active conversation to respond and manage your business transactions.</p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODALS AND DIALOGS */}
      {/* ======================================================== */}

      {/* SEND PAID MEDIA DIALOG */}
      {showPaidMediaDialog && (
        <div data-testid="send-paid-media-dialog" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-md bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowPaidMediaDialog(false);
                setPaidMediaFile(null);
                setPaidMediaPreview('');
                setActivePhotoRequestFulfillId(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-2xl font-serif italic text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Send Paid Media
            </h3>
            <p className="text-xs text-[var(--az-text-secondary)] mb-6">
              Upload a photo or short video. Set your unlock price below.
            </p>

            <div className="space-y-4">
              {paidMediaPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-white/5 aspect-video bg-black flex items-center justify-center">
                  <img src={paidMediaPreview} className="max-h-48 object-contain" alt="Selected premium content" />
                  <button
                    onClick={() => { setPaidMediaFile(null); setPaidMediaPreview(''); }}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 text-xs hover:scale-105"
                  >
                    🗑️
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-pink-500/10 hover:border-pink-500/30 rounded-xl p-8 text-center cursor-pointer flex flex-col items-center justify-center bg-black/20 transition-all">
                  <span className="text-4xl">📁</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-3">Select photo or video</span>
                  <span className="text-[10px] text-gray-500 mt-1">images max 10MB • videos max 100MB</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handlePaidMediaFileChange}
                    className="hidden"
                  />
                </label>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Unlock Price (Credits)
                </label>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">💎</span>
                  <input
                    data-testid="send-paid-media-price-input"
                    type="number"
                    min={1}
                    value={paidMediaCost}
                    onChange={(e) => setPaidMediaCost(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-black/40 border border-[var(--az-border)] rounded-xl px-4 py-3 text-white text-lg font-mono focus:border-amber-400 outline-none"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Members pay this to view your content. (≈ {formatNaira(paidMediaCost * usePricingStore.getState().diamondNairaRate)} value)
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Caption (Optional)
                </label>
                <input
                  type="text"
                  maxLength={150}
                  placeholder="Add a teaser caption..."
                  value={paidMediaCaption}
                  onChange={(e) => setPaidMediaCaption(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white"
                />
              </div>

              {isMediaUploading && (
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${mediaUploadProgress}%` }} />
                </div>
              )}

              <button
                data-testid="send-paid-media-submit"
                onClick={handleSendPaidMediaSubmit}
                disabled={!paidMediaFile || isMediaUploading || isSendingPaidMedia}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-40"
              >
                {isSendingPaidMedia || isMediaUploading ? 'Sending...' : 'Send Locked Media'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GIFT REQUEST PICKER DIALOG */}
      {showGiftRequestDialog && (
        <div data-testid="gift-request-dialog" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-md bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative animate-fadeIn">
            <button
              onClick={() => { setShowGiftRequestDialog(false); setSelectedGift(null); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-serif italic text-pink-300 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Request a Gift
            </h3>
            <p className="text-xs text-[var(--az-text-secondary)] mb-4">
              Pick a gift you'd like {selectedConv?.otherUser?.displayName} to send you.
            </p>

            {/* Category selection */}
            <div className="flex gap-2 border-b border-pink-500/20 pb-3 mb-4 overflow-x-auto no-scrollbar">
              {['all', 'romantic', 'spicy', 'luxury', 'fun'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveGiftTab(tab)}
                  className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider transition-colors ${activeGiftTab === tab ? 'bg-pink-600 text-white' : 'bg-[#22101e] text-pink-300 hover:bg-pink-900/30'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Gift list grid */}
            <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1 no-scrollbar mb-6">
              {isGiftsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-3 bg-[#200e1b] rounded-xl border border-pink-500/5 animate-pulse flex flex-col items-center justify-center text-center h-[90px]"
                  >
                    <div className="w-8 h-8 bg-pink-500/10 rounded-full mb-2" />
                    <div className="w-12 h-3 bg-pink-500/10 rounded mb-1.5" />
                    <div className="w-8 h-2 bg-pink-500/10 rounded" />
                  </div>
                ))
              ) : giftsCatalogue.length === 0 ? (
                <p className="col-span-3 text-center py-10 text-xs text-[var(--az-text-muted)] font-serif italic">No gifts found.</p>
              ) : (
                giftsCatalogue
                  .filter(g => activeGiftTab === 'all' || g.category === activeGiftTab)
                  .map(g => {
                    const isSelected = selectedGift?._id === g._id;
                    const iconsMap: any = { rose: '🌹', balloon: '🎈', teddy: '🧸', lingerie: '👙', champagne: '🍾', ring: '💍' };
                    return (
                      <div
                        key={g._id}
                        onClick={() => setSelectedGift(g)}
                        className={`p-3 bg-[#200e1b] rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isSelected ? 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]' : 'border-pink-500/10 hover:border-pink-500/30'}`}
                      >
                        <span className="text-3xl mb-1">{iconsMap[g.iconUrl] || '🎁'}</span>
                        <span className="text-[10px] font-bold block truncate w-full">{g.name}</span>
                        <span className="text-[9px] text-yellow-400 font-mono mt-1">💎 {g.creditCost}</span>
                      </div>
                    );
                  })
              )}
            </div>

            {selectedGift && (
              <div className="border-t border-pink-500/10 pt-4 animate-fadeIn">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Personal Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={150}
                  placeholder="Add a personal note..."
                  value={giftRequestNote}
                  onChange={(e) => setGiftRequestNote(e.target.value)}
                  className="w-full bg-[#1e0d1b] border border-pink-500/20 text-xs rounded-lg px-3 py-2 outline-none text-white focus:border-amber-400 mb-4"
                />

                <button
                  data-testid="gift-request-send-btn"
                  onClick={handleSendGiftRequest}
                  disabled={isSendingGiftRequest}
                  className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all disabled:opacity-50"
                >
                  {isSendingGiftRequest ? 'Requesting...' : 'Send Gift Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SERVICE REQUEST BUILDER DIALOG */}
      {showServiceRequestDialog && (
        <div data-testid="service-request-dialog" className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-md bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative animate-fadeIn max-h-[90vh] overflow-y-auto no-scrollbar">
            <button
              onClick={() => { setShowServiceRequestDialog(false); setServiceExtras([]); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-2xl font-serif italic text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Send Service Request
            </h3>
            <p className="text-xs text-[var(--az-text-secondary)] mb-6">
              Request payment for your Hook Up Tonight arrangement.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Base Rate (Tonight Rate)
                </label>
                <div className="flex justify-between items-center p-3 bg-black/40 border border-white/5 rounded-xl">
                  <span className="text-xs text-gray-400">Your tonight rate (from profile):</span>
                  <span className="text-xs font-mono font-bold text-amber-400">💎 {dynTonightRate || tonightRate} credits (≈ {formatNaira((dynTonightRate || tonightRate) * usePricingStore.getState().diamondNairaRate)})</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Additional Charges (Optional)
                  </label>
                  {serviceExtras.length < 5 && (
                    <button
                      data-testid="service-request-add-extra"
                      type="button"
                      onClick={handleAddExtraChargeRow}
                      className="text-[10px] text-pink-400 hover:text-pink-300 font-bold underline"
                    >
                      + Add Extra Charge
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {serviceExtras.map((ext, idx) => (
                    <div key={idx} className="flex gap-2 items-center animate-fadeIn">
                      <input
                        type="text"
                        maxLength={50}
                        placeholder="Description (e.g. Hotel, Transport)"
                        value={ext.label}
                        onChange={(e) => {
                          const updated = [...serviceExtras];
                          updated[idx].label = e.target.value;
                          setServiceExtras(updated);
                        }}
                        className="flex-grow bg-black/40 border border-[var(--az-border)] rounded-xl px-3 py-2 text-xs text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        placeholder="Credits"
                        value={ext.amount}
                        onChange={(e) => {
                          const updated = [...serviceExtras];
                          updated[idx].amount = Math.max(1, parseInt(e.target.value) || 1);
                          setServiceExtras(updated);
                        }}
                        className="w-20 bg-black/40 border border-[var(--az-border)] rounded-xl px-3 py-2 text-xs text-white text-center font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveExtraChargeRow(idx)}
                        className="text-red-500 hover:text-red-400 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Personal Note (Optional)
                </label>
                <textarea
                  maxLength={200}
                  rows={2}
                  placeholder="Add a note for this arrangement..."
                  value={serviceRequestNote}
                  onChange={(e) => setServiceRequestNote(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-pink-500 resize-none"
                />
              </div>

              <div className="border-t border-white/5 pt-4 flex justify-between items-center">
                <span className="text-sm font-bold text-white uppercase tracking-wider">TOTAL:</span>
                <span data-testid="service-request-total" className="text-2xl font-mono font-bold text-amber-400">
                  💎 {totalServiceChargeAmount} credits <span className="text-xs text-gray-500 font-sans font-normal">(≈ {formatNaira(totalServiceChargeAmount * usePricingStore.getState().diamondNairaRate)})</span>
                </span>
              </div>

              <button
                data-testid="service-request-submit"
                onClick={handleSendServiceRequestSubmit}
                disabled={isSendingServiceRequest}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-900/20 active:scale-95 disabled:opacity-50"
              >
                {isSendingServiceRequest ? 'Sending...' : 'Send Service Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL CALL TAKE-OVER OVERLAY */}
      {callState !== 'idle' && (
        <div className={`fixed inset-0 bg-black z-[10000] flex flex-col text-center text-white ${
          callState === 'active' ? 'p-0 justify-stretch items-stretch' : 'items-center justify-between p-8'
        }`}>

          {/* Incoming Call Layout */}
          {callState === 'ringing' && (
            <div className="flex-grow flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-pink-500 animate-pulse mb-6 flex items-center justify-center overflow-hidden">
                <Avatar src={selectedConv?.otherUser?.avatarUrl} name={selectedConv?.otherUser?.displayName} size={128} />
              </div>
              <h2 className="text-3xl font-serif italic mb-2 truncate max-w-xs px-4 text-center" title={selectedConv?.otherUser?.displayName}>{selectedConv?.otherUser?.displayName}</h2>
              <p className="text-xs text-pink-400 uppercase tracking-widest animate-pulse">Incoming {callType} Call...</p>
              <p className="text-xs text-yellow-400 mt-2 font-mono">Rate: 💎 {callRate} credits / min</p>

              <div className="flex gap-8 mt-12">
                <button
                  onClick={handleDeclineCall}
                  className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                >
                  ✕
                </button>
                <button
                  onClick={handleAcceptCall}
                  disabled={acceptLoading}
                  className="incoming-call-accept w-16 h-16 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform animate-bounce"
                >
                  {acceptLoading ? (
                    <span className="animate-spin text-xl">⏳</span>
                  ) : (
                    '✓'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Active Call Layout with ZegoCloud WebRTC */}
          {callState === 'active' && (
            <div className="relative w-full h-full bg-[#0a0608]">
              <div className="absolute inset-0 bg-[#0a0608] z-0">
                {callState === 'active' && zegoToken && zegoAppId && zegoRoomId && user?.id && (
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-pink-500">Loading call...</div>}>
                    <CallRoom
                      key={zegoRoomId}
                      appId={zegoAppId}
                      token={zegoToken}
                      roomId={zegoRoomId}
                      userId={user.id}
                      userName={user.firstName || 'User'}
                      callType={callType}
                      onCallEnd={handleEndCall}
                      partnerName={selectedConv?.otherUser?.displayName}
                      partnerAvatar={selectedConv?.otherUser?.avatarUrl}
                    />
                  </React.Suspense>
                )}
              </div>

              {/* Credit ticker / Call Info — top-right corner, does not interfere with ZegoCloud */}
              <div
                className="call-credit-ticker"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  zIndex: 1001,             /* above ZegoCloud UI */
                  pointerEvents: 'none',      /* clicks pass through to ZegoCloud */
                  background: 'rgba(10, 6, 8, 0.75)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(201, 168, 76, 0.4)',
                  borderRadius: '100px',
                  padding: '6px 14px',
                  font: "600 14px/1 'JetBrains Mono', monospace",
                  color: '#c9a84c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>💎 Credits (Earned)</span>
                <span style={{ borderLeft: '1px solid rgba(201,168,76,0.3)', paddingLeft: '8px' }}>
                  {Math.floor(callDuration / 60).toString().padStart(2, '0')}:
                  {(callDuration % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Caller name overlay — top-left corner */}
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  zIndex: 1001,
                  pointerEvents: 'none',
                  background: 'rgba(10, 6, 8, 0.75)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '100px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  color: '#fff',
                }}
              >
                {selectedConv?.otherUser?.displayName}
              </div>
            </div>
          )}

          {/* Call Ending Summary */}
          {callState === 'summary' && callSummary && (
            <div className="flex-grow flex flex-col items-center justify-center max-w-sm flex">
              <span className="text-5xl mb-4">
                {callSummary.status === 'declined' || callSummary.status === 'missed' ? '📵' : callType === 'video' ? '📹' : '📞'}
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
                    {callSummary.cost === 0 && (
                      <p className="text-[10px] text-gray-400 text-center mt-2 font-mono uppercase tracking-wider">
                        No charge — calls under 10 seconds are free
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 w-full">
                {user?.role !== 'provider' && callSummary.cost > 0 && (
                  <div className="flex flex-col items-center mb-2">
                    <span className="text-xs text-pink-300 mb-1">Rate this call:</span>
                    <div className="flex gap-1 text-lg">
                      {['⭐', '⭐', '⭐', '⭐', '⭐'].map((star, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            toast.success('Thank you for your rating!');
                          }}
                          className="hover:scale-125 transition-transform"
                        >
                          {star}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => {
                      setCallState('idle');
                      setCallSummary(null);
                    }}
                    className="flex-grow py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default ProviderMessages;