import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Avatar } from './Avatar';
import { detectContactSharing } from '@yourapp/content-filter';
import { useContentFilter } from '../../hooks/useContentFilter';
import { ContentFilterWarning, ProviderContentWarning } from './ContentFilterWarning';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { useUIStore } from './useUIStore';
import MessageTick, { getMessageStatus } from './MessageTick';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePricingStore, formatNaira, formatAmount } from '../../lib/pricing';
import { uploadMedia } from '../../lib/media/uploadMedia';
import { compressToWebP } from '../../lib/media/compressImage';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { useAdultCall } from './AdultCallContext';
import { ChatSafetyNotice } from './ChatSafetyNotice';

// Default avatars/placeholders
const FALLBACK_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop";

export const OfficialBadge: React.FC<{ badgeType?: 'blue' | 'gold' | string; className?: string }> = ({
  badgeType = 'blue',
  className = 'w-4 h-4 inline-block shrink-0 ml-1',
}) => {
  const isGold = badgeType === 'gold';
  const titleText = isGold ? 'Official Gold Channel' : 'Official Blue Channel';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label={titleText}
    >
      <title>{titleText}</title>
      <path
        className={isGold ? 'text-amber-400' : 'text-blue-500'}
        d="M12 2l2.4 1.8 3-.2 1.2 2.8 2.8 1.2-.2 3L23 13l-1.8 2.4.2 3-2.8 1.2-1.2 2.8-3-.2L12 24l-2.4-1.8-3 .2-1.2-2.8-2.8-1.2.2-3L1 11l1.8-2.4-.2-3 2.8-1.2 1.2-2.8 3 .2L12 2z"
      />
      <path
        fill="#ffffff"
        d="M10 15.5l-3.5-3.5 1.4-1.4 2.1 2.1 5.6-5.6 1.4 1.4z"
      />
    </svg>
  );
};

interface Conversation {
  conversationId: string;
  type?: string;
  isOfficial?: boolean;
  position?: number;
  officialConfig?: {
    avatarUrl: string;
    badge: string;
    badgeType: 'blue' | 'gold' | string;
    enabled: boolean;
  };
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl: string;
    isOnline: boolean;
    accountType: string;
    isOfficial?: boolean;
    officialBadge?: 'blue' | 'gold' | string;
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
  conversationId?: string;
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

const PrivateSext: React.FC = () => {
  const { user } = useAdultAuth();
  const { initiateCall, isInitiating } = useAdultCall();
  const token = localStorage.getItem('adultAccessToken') || '';
  const navigate = useNavigate();
  const location = useLocation();

  // Conversation list & messages state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [msgPage, setMsgPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // Form states
  const [inputText, setInputText] = useState('');
  const [showGiftPicker, setShowGiftPicker] = useState(false);

  // Content Filtering
  const { filterWarning, checkContent, dismissWarning, setFilterWarning } = useContentFilter();
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [giftNote, setGiftNote] = useState('');
  const [giftsCatalogue, setGiftsCatalogue] = useState<Gift[]>([]);
  const [activeGiftTab, setActiveGiftTab] = useState<string>('all');
  const [isGiftsLoading, setIsGiftsLoading] = useState(false);
  const [showPhotoRequestModal, setShowPhotoRequestModal] = useState(false);
  const [photoRequestNote, setPhotoRequestNote] = useState('');
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false);
  const [serviceRequestNote, setServiceRequestNote] = useState('');
  const [serviceRequestError, setServiceRequestError] = useState<{ title: string; message: string; action?: string; actionUrl?: string } | null>(null);

  // Double-click / duplicate submission prevention states
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [isSendingPhotoRequest, setIsSendingPhotoRequest] = useState(false);
  const [isSendingServiceRequest, setIsSendingServiceRequest] = useState(false);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});

  // S3 upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [isLockedUpload, setIsLockedUpload] = useState(false);
  const [uploadCost, setUploadCost] = useState<number>(10);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Voice recording states
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

  // Credits remaining
  const [creditsRemaining, setCreditsRemaining] = useState<number>(user?.credits || 0);

  useEffect(() => {
    if (typeof user?.credits === 'number') {
      setCreditsRemaining(user.credits);
    }
  }, [user?.credits]);

  // Shake / error visual feedbacks
  const [insufficientCreditsMsgId, setInsufficientCreditsMsgId] = useState<string | null>(null);
  const [shakeGiftButton, setShakeGiftButton] = useState(false);

  // UI responsive states
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Socket setup
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

  const scrollToBottom = (behavior: 'smooth' | 'instant' = 'instant') => {
    if (messagesEndRef.current?.scrollIntoView) {
      if (behavior === 'instant') {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recentEmojis] = useState<string[]>(['❤️', '🔥', '😂', '😮', '😢', '👍', '💋', '👅', '🍑', '🍆']);

  useEffect(() => {
    fetchConversations();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedConv || !messages?.length) return;

    const hasUnread = messages.some(
      m => m.senderId !== (user?.id || (user as any)?._id) && !m.readAt
    );

    if (hasUnread) {
      markConversationRead(selectedConv.conversationId);
    }
  }, [selectedConv?.conversationId, messages]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const conversationIdParam = searchParams.get('conversation');

    let targetConvId = conversationIdParam;
    if (!targetConvId) {
      const pathSegments = location.pathname.split('/').filter(Boolean);
      if (pathSegments.length === 2 && pathSegments[0] === 'sext') {
        targetConvId = pathSegments[1];
      } else if (pathSegments.length === 3 && pathSegments[0] === 'adult' && pathSegments[1] === 'sext') {
        targetConvId = pathSegments[2];
      }
    }

    if (targetConvId && conversations.length > 0) {
      const matchingConv = conversations.find(c => c.conversationId === targetConvId);
      if (matchingConv) {
        if (activeConvIdRef.current !== targetConvId) {
          selectConversation(matchingConv);
        }
      } else {
        const fetchAndSelect = async () => {
          try {
            const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${targetConvId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            const data = await res.json();
            if (data && data.conversationId) {
              setConversations(prev => {
                if (prev.some(c => c.conversationId === data.conversationId)) return prev;
                return [data, ...prev];
              });
            }
          } catch (err) {
            console.error('Failed to fetch specific conversation:', err);
          }
        };
        fetchAndSelect();
      }
    }
  }, [conversations, location]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileView('chat');
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const isMobileChat = window.innerWidth < 768 && selectedConv !== null && mobileView === 'chat';
    setHideGlobalHeader(isMobileChat);
    setHideFooter(selectedConv !== null && mobileView === 'chat');
  }, [selectedConv, mobileView, setHideGlobalHeader, setHideFooter]);

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

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, { headers: getHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsConversationsLoading(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    activeConvIdRef.current = conv.conversationId;
    setShowServiceRequestModal(false);
    setServiceRequestNote('');
    setShowPhotoRequestModal(false);
    setPhotoRequestNote('');
    setShowGiftPicker(false);
    setMessages([]);
    setMobileView('chat');
    setMsgPage(1);
    setHasMoreMessages(true);

    const basePath = location.pathname.includes('/adult/inbox') ? '/adult/inbox' : (location.pathname.includes('/adult/sext') ? '/adult/sext' : (location.pathname.includes('/inbox') ? '/inbox' : '/sext'));
    navigate(`${basePath}?conversation=${conv.conversationId}`, { replace: true });

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
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/service-tonight-requests/${msgId}/decline`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceTonightRequest: { ...m.serviceTonightRequest!, status: 'declined' } } : m));
      toast.info('Service request cancelled');
    } catch (err) {
      console.error(err);
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

  // Setup Socket connection for messaging events
  useEffect(() => {
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const s = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('Private Sext connected to /adult socket:', s.id);
      if (activeConvIdRef.current) s.emit('conv:join', { conversationId: activeConvIdRef.current });
    });

    s.on('sext:new_message', (payload: { message: Message }) => {
      const myUserId = user?.id || (user as any)?._id;
      const activeConversationId = activeConvIdRef.current;
      if (activeConversationId && payload.message.conversationId === activeConversationId && payload.message.senderId !== myUserId) {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
        });
        markConversationRead(activeConversationId);
        s.emit('sext:message_delivered', { messageId: payload.message.id });
      }
      fetchConversations();
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

      setMessages(prev => {
        const unreadSent = prev.filter(m => m.senderId === (user?.id || (user as any)?._id) && !m.readAt);
        if (unreadSent.length === 0) return prev;

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

    s.on('wallet:updated', (payload: { balance: number }) => {
      setCreditsRemaining(payload.balance);
    });

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
  }, [token]);

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

  const handleSendText = async () => {
    if (!selectedConv || (!inputText.trim() && !uploadPreview)) return;

    if (uploadPreview) {
      await handleUploadAndSend();
      return;
    }

    const result = detectContactSharing(inputText);
    if (result.detected) {
      setFilterWarning({ show: true, category: result.category });
      toast.error('Message blocked: sharing contact information is not allowed.');
      return;
    }

    const contentToSend = inputText;
    setInputText('');
    dismissWarning();

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    if (user?.role !== 'provider' && isVideo) {
      toast.error('Only photo attachments are allowed for standard members.');
      return;
    }

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
      let fileToUpload = uploadFile;

      if (!isVideo) {
        try {
          fileToUpload = await compressToWebP(uploadFile);
        } catch (err) {
          console.error('Image compression failed, uploading original', err);
        }
      }

      const finalIsLocked = user?.role === 'provider' ? isLockedUpload : false;
      const context = finalIsLocked
        ? (isVideo ? 'paid_video' : 'paid_image')
        : (isVideo ? 'chat_video' : 'chat_image');

      const result = await uploadMedia(fileToUpload, context, finalIsLocked, (percent) => {
        setUploadProgress(10 + Math.round(percent * 0.7));
      });

      setUploadProgress(80);

      const mediaType = finalIsLocked
        ? (isVideo ? 'locked_video' : 'locked_image')
        : (isVideo ? 'video' : 'image');

      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: mediaType,
          content: finalIsLocked ? '[Locked Premium Media]' : '',
          mediaUrl: result.url,
          cloudinaryPublicId: result.publicId,
          mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : result.url,
          creditCost: finalIsLocked ? uploadCost : 0
        })
      });

      const messageData = await res.json();
      if (messageData.id) {
        setMessages(prev => [...prev, messageData]);
        setUploadFile(null);
        setUploadPreview('');
        setIsLockedUpload(false);
        toast.success('Media uploaded and sent!');
      }
    } catch (err) {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

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

      if (audioChunksRef.current.length === 0) {
        toast.error('No audio data collected!');
        handleCancelRecording();
        return;
      }

      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      if (audioBlob.size === 0) {
        toast.error('Empty audio blob!');
        handleCancelRecording();
        return;
      }

      setRecState('sending');
      try {
        const ext = mimeType.includes('webm') ? 'webm'
                  : mimeType.includes('mp4')  ? 'm4a'
                  : mimeType.includes('ogg')  ? 'ogg'
                  : 'webm';
        const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });

        const result = await uploadMedia(file, 'voice_note', false);

        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv!.conversationId}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            type: 'voice_note',
            mediaUrl: result.url,
            mediaDurationSeconds: duration,
            mediaMimeType: recorder.mimeType,
            content: '[Voice Note]'
          })
        });
        const msg = await res.json();
        if (res.status === 400 && msg.error) {
          toast.error(msg.error);
        } else if (msg.id) {
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
      try {
        mediaRecorderRef.current.requestData();
      } catch (err) {
        console.error('requestData failed', err);
      }
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

  const handleUnlockMedia = async (msgId: string, cost: number) => {
    if (processingIds[msgId]) return;
    const clientCost = cost;
    if (creditsRemaining < clientCost) {
      setInsufficientCreditsMsgId(msgId);
      setTimeout(() => setInsufficientCreditsMsgId(null), 800);
      toast.error('Insufficient credits! Top up your wallet to unlock.');
      return;
    }

    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${msgId}/unlock`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isUnlocked: true, mediaUrl: data.mediaUrl } : m));
        toast.success('Content unlocked!');
      }
    } catch (err) {
      toast.error('Failed to unlock content');
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const openGiftPicker = async () => {
    setShowGiftPicker(true);
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

  const handleSendGift = async () => {
    if (!selectedGift || !selectedConv || isSendingGift) return;

    if (creditsRemaining < selectedGift.creditCost) {
      setShakeGiftButton(true);
      setTimeout(() => setShakeGiftButton(null as any), 800);
      toast.error('Not enough credits to send this gift.');
      return;
    }

    setIsSendingGift(true);

    const giftToRestore = selectedGift;
    const noteToRestore = giftNote;

    setShowGiftPicker(false);
    setSelectedGift(null);
    setGiftNote('');

    const tempId = `temp_gift_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId: selectedConv.conversationId,
      senderId: user?.id || (user as any)?._id || '',
      receiverId: selectedConv.otherUser?.id,
      content: `Sent you a ${giftToRestore.name}`,
      mediaType: 'gift',
      creditCost: giftToRestore.creditCost,
      isUnlocked: true,
      isOptimistic: true,
      isFailed: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      gift: {
        giftId: giftToRestore._id,
        giftName: giftToRestore.name,
        giftIconUrl: giftToRestore.iconUrl,
        giftValue: giftToRestore.creditCost,
        message: noteToRestore
      }
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/send-gift`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          giftId: giftToRestore._id,
          message: noteToRestore
        })
      });
      const data = await res.json();
      if (data && data.message) {
        const realMsg = data.message;
        const formattedRealMsg: Message = {
          id: realMsg._id,
          conversationId: realMsg.conversationId || selectedConv.conversationId,
          senderId: realMsg.senderId,
          receiverId: realMsg.receiverId,
          content: `Sent you a ${giftToRestore.name}`,
          mediaType: 'gift',
          creditCost: giftToRestore.creditCost,
          isUnlocked: true,
          gift: realMsg.gift,
          isDeleted: false,
          createdAt: realMsg.createdAt || new Date().toISOString()
        };
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== realMsg._id);
          return filtered.map(m => m.id === tempId ? formattedRealMsg : m);
        });
        toast.success('🎁 Gift sent successfully!');
        fetchConversations();
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setShowGiftPicker(true);
        setSelectedGift(giftToRestore);
        setGiftNote(noteToRestore);
        toast.error(data?.error || 'Failed to send gift');
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setShowGiftPicker(true);
      setSelectedGift(giftToRestore);
      setGiftNote(noteToRestore);
      toast.error('Failed to send gift');
    } finally {
      setIsSendingGift(false);
    }
  };

  const handleSendPhotoRequest = async () => {
    if (!selectedConv || isSendingPhotoRequest) return;

    setIsSendingPhotoRequest(true);

    const noteToRestore = photoRequestNote;

    setShowPhotoRequestModal(false);
    setPhotoRequestNote('');

    const tempId = `temp_photo_req_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId: selectedConv.conversationId,
      senderId: user?.id || (user as any)?._id || '',
      receiverId: selectedConv.otherUser?.id,
      content: 'Requested a photo',
      mediaType: 'request_photo',
      creditCost: 0,
      isUnlocked: true,
      isOptimistic: true,
      isFailed: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      photoRequest: {
        status: 'pending',
        note: noteToRestore
      }
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/request-photo`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ note: noteToRestore })
      });
      const data = await res.json();
      if (data && data.id) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== data.id);
          return filtered.map(m => m.id === tempId ? { ...data, isOptimistic: false, conversationId: data.conversationId || selectedConv.conversationId } : m);
        });
        toast.success('Photo request sent!');
        fetchConversations();
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setShowPhotoRequestModal(true);
        setPhotoRequestNote(noteToRestore);
        toast.error(data?.error || 'Failed to send photo request');
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setShowPhotoRequestModal(true);
      setPhotoRequestNote(noteToRestore);
      toast.error('Failed to send request');
    } finally {
      setIsSendingPhotoRequest(false);
    }
  };

  const handleSendServiceRequest = async () => {
    if (!selectedConv || isSendingServiceRequest) return;

    setIsSendingServiceRequest(true);
    setServiceRequestError(null);

    const noteToRestore = serviceRequestNote;

    setShowServiceRequestModal(false);
    setServiceRequestNote('');

    const tempId = `temp_service_tonight_req_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId: selectedConv.conversationId,
      senderId: user?.id || (user as any)?._id || '',
      receiverId: selectedConv.otherUser?.id,
      content: 'Requested a tonight service',
      mediaType: 'request_service',
      creditCost: 0,
      isUnlocked: true,
      isOptimistic: true,
      isFailed: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      serviceTonightRequest: {
        status: 'pending',
        note: noteToRestore
      }
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/request-service`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ note: noteToRestore })
      });
      const data = await res.json();

      if (res.ok && data && data.id) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== data.id);
          return filtered.map(m => m.id === tempId ? { ...data, isOptimistic: false, conversationId: data.conversationId || selectedConv.conversationId } : m);
        });
        toast.success('Tonight service request sent!');
        fetchConversations();
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));

        const errorType = data.error || data.code;
        const errorMessages: Record<string, { title: string; message: string; action?: string; actionUrl?: string }> = {
          NOT_A_PROVIDER: {
            title: 'Not Authorised',
            message: 'Only service providers can perform this operation.'
          },
          RECIPIENT_NOT_A_PROVIDER: {
            title: 'Recipient is Not a Performer',
            message: 'Services can only be requested from service providers.'
          },
          NO_TONIGHT_RATE: {
            title: 'No Tonight Rate Set',
            message: 'The provider has not set their tonight arrangement rate yet.',
            action: 'Go to Settings',
            actionUrl: '/adult/provider/settings?tab=pricing'
          },
          ACTIVE_REQUEST_EXISTS: {
            title: 'Request Already Pending',
            message: 'You already have an active tonight arrangement request pending with this provider. Wait for it to be resolved.'
          }
        };

        const knownError = errorMessages[errorType];
        if (knownError) {
          setServiceRequestError({
            title: knownError.title,
            message: knownError.message,
            action: knownError.action,
            actionUrl: knownError.actionUrl
          });
        } else {
          setShowServiceRequestModal(true);
          setServiceRequestNote(noteToRestore);
          setServiceRequestError({
            title: 'Service Request Failed',
            message: data.message || 'Could not request tonight service. Please try again later.'
          });
        }
      }
    } catch (err) {
      console.error('Error requesting tonight service:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setShowServiceRequestModal(true);
      setServiceRequestNote(noteToRestore);
      setServiceRequestError({
        title: 'Connection Error',
        message: 'Could not connect to the server. Please try again.'
      });
    } finally {
      setIsSendingServiceRequest(false);
    }
  };

  const handleDeclinePhotoRequest = async (msgId: string) => {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${msgId}/decline`, {
        method: 'PUT',
        headers: getHeaders()
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, photoRequest: { ...m.photoRequest!, status: 'declined' } } : m));
      toast.info('Photo request declined');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFulfillPhotoRequest = async (msgId: string, url: string, isLocked: boolean, cost: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${msgId}/fulfill`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          mediaUrl: url,
          creditCost: cost,
          isLocked
        })
      });
      const data = await res.json();
      if (data.requestMessage) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, photoRequest: { ...m.photoRequest!, status: 'fulfilled' } } : m));
        toast.success('Request fulfilled!');
      }
    } catch (err) {
      toast.error('Failed to fulfill request');
    }
  };

  const handleFulfillGiftRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/gift-requests/${msgId}/fulfill`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, giftRequest: { ...m.giftRequest!, status: 'fulfilled' } } : m));
        toast.success('Gift request fulfilled!');
        fetchConversations();
      } else {
        toast.error(data.error || 'Failed to fulfill gift request');
      }
    } catch (err) {
      toast.error('Failed to fulfill gift request');
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const handleDismissGiftRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/gift-requests/${msgId}/dismiss`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, giftRequest: { ...m.giftRequest!, status: 'dismissed' } } : m));
        toast.info('Gift request dismissed');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const handlePayServiceRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/service-requests/${msgId}/pay`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceRequest: { ...m.serviceRequest!, status: 'paid' } } : m));
        toast.success('Service charge paid successfully!');
        fetchConversations();
      } else {
        toast.error(data.error || 'Failed to pay service request');
      }
    } catch (err) {
      toast.error('Failed to pay service request');
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const handleCompleteServiceRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/service-requests/${msgId}/complete`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceRequest: { ...m.serviceRequest!, status: 'completed' } } : m));
        toast.success('Service marked as completed!');
      }
    } catch (err) {
      toast.error('Failed to complete service request');
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const handleReportServiceRequest = async (msgId: string) => {
    if (processingIds[msgId]) return;
    setProcessingIds(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/service-requests/${msgId}/report`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceRequest: { ...m.serviceRequest!, status: 'reported' } } : m));
        toast.warning('Issue reported to support');
      }
    } catch (err) {
      toast.error('Failed to report issue');
    } finally {
      setProcessingIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const handleDeclineServiceRequest = async (msgId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/service-requests/${msgId}/decline`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, serviceRequest: { ...m.serviceRequest!, status: 'completed' } } : m));
        toast.info('Service request declined');
      }
    } catch (err) {
      console.error(err);
    }
  };

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

  // Audio / Video call trigger via global AdultCallContext
  const handleStartCall = async (type: 'video' | 'audio') => {
    if (!selectedConv || !selectedConv.otherUser) return;
    await initiateCall(
      selectedConv.otherUser.id,
      type,
      undefined,
      selectedConv.conversationId,
      {
        displayName: selectedConv.otherUser.displayName,
        avatarUrl: selectedConv.otherUser.avatarUrl,
      }
    );
  };

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
          <h2 className="text-xl font-serif italic text-pink-500">Messages</h2>
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
              <p className="text-sm font-semibold">No messages yet</p>
              <p className="text-xs mt-1">Select a provider from home to chat!</p>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const other = c.otherUser;
              if (!other) return null;
              const isSelected = selectedConv?.conversationId === c.conversationId;
              const isOfficialChannel = c.isOfficial || other.isOfficial || c.type === 'official_notification' || c.type === 'support' || c.conversationId === 'official_notifications' || c.conversationId.startsWith('support_');
              const badgeType = other.officialBadge || c.officialConfig?.badgeType || 'blue';

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
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <h4 className="font-bold text-sm truncate">{other.displayName}</h4>
                        {isOfficialChannel && <OfficialBadge badgeType={badgeType} />}
                      </div>
                      {c.lastMessage && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {new Date(c.lastMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-pink-400 font-bold' : 'text-gray-400'}`}>
                      {c.lastMessage ? c.lastMessage.content.replace('Requested a tonight service', 'Requested activity service') : 'No messages yet...'}
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
            {(() => {
              const isSelectedOfficial = selectedConv.isOfficial || selectedConv.otherUser?.isOfficial || selectedConv.type === 'official_notification' || selectedConv.type === 'support' || selectedConv.conversationId === 'official_notifications' || selectedConv.conversationId.startsWith('support_');
              const selectedBadgeType = selectedConv.otherUser?.officialBadge || selectedConv.officialConfig?.badgeType || 'blue';

              return (
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
                      <div className="flex items-center gap-1 min-w-0">
                        <h3 className="font-bold text-sm conversation-header__name truncate">{selectedConv.otherUser?.displayName}</h3>
                        {isSelectedOfficial && <OfficialBadge badgeType={selectedBadgeType} />}
                      </div>
                      <span className={`text-[9px] uppercase tracking-widest font-bold conversation-header__status ${
                        selectedConv.otherUser?.isOnline ? '' : 'conversation-header__status--offline'
                      }`}>
                        {selectedConv.otherUser?.isOnline ? 'Online Now' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 conversation-header__actions flex-shrink-0">
                    {selectedConv.conversationId !== 'official_notifications' && selectedConv.type !== 'official_notification' && (
                      <>
                        <button
                          onClick={() => handleStartCall('audio')}
                          disabled={isInitiating}
                          className="text-lg hover:scale-110 transition-transform p-1.5 conversation-header__action-btn disabled:opacity-50"
                          title="Audio Call"
                        >
                          📞
                        </button>
                        <button
                          onClick={() => handleStartCall('video')}
                          disabled={isInitiating}
                          className="text-lg hover:scale-110 transition-transform p-1.5 conversation-header__action-btn disabled:opacity-50"
                          title="Video Call"
                        >
                          📹
                        </button>
                      </>
                    )}
                    <span className="text-yellow-400 font-bold text-xs flex items-center gap-1 conversation-header__credits">
                      💎 {formatAmount(creditsRemaining)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Safety Notice Banner below header */}
            <ChatSafetyNotice
              userId={user?.id}
              conversationId={selectedConv.conversationId}
              role="member"
            />

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
                const isMe = m.senderId === user?.id;

                const toggleReaction = (emoji: string) => {
                  handleReactToMessage(m.id, emoji);
                };

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col group w-full ${
                      m.mediaType === 'gift' || m.mediaType === 'request_photo' || m.mediaType === 'locked_image' || m.mediaType === 'locked_video'
                        ? 'items-center'
                        : isMe ? 'items-end' : 'items-start'
                    } ${insufficientCreditsMsgId === m.id ? 'animate-shake' : ''}`}
                  >

                    {m.systemText || m.mediaType === 'system' ? (
                      <div className="mx-auto my-2 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                        ── {m.systemText || m.content} ──
                      </div>
                    ) : m.mediaType === 'locked_image' || m.mediaType === 'locked_video' ? (
                      <div data-testid="message-locked-media" className="relative w-64 h-80 rounded-2xl overflow-hidden border border-pink-500/30 bg-[#160c14] flex flex-col items-center justify-center p-4 shadow-xl message-locked-media">
                        <div
                          className="absolute inset-0 bg-cover bg-center filter blur-xl opacity-30 scale-110"
                          style={{ backgroundImage: `url(${m.mediaThumbnailUrl || FALLBACK_AVATAR})` }}
                        />

                        {m.isUnlocked ? (
                          m.mediaType === 'locked_video' ? (
                            <video src={m.mediaUrl} controls className="w-full h-full object-cover rounded-xl z-10" />
                          ) : (
                            <img src={m.mediaUrl} className="w-full h-full object-cover rounded-xl z-10" alt="unlocked content" />
                          )
                        ) : (
                          <div className="z-10 flex flex-col items-center text-center">
                            <span className="text-3xl mb-3">🔒</span>
                            <p className="text-xs font-serif italic text-pink-300 tracking-widest uppercase mb-1">LOCKED MEDIA</p>
                            <p className="text-[10px] text-gray-400 mb-6 uppercase tracking-wider">PREVIEW SILHOUETTE EFFECT</p>

                            {!isMe ? (
                              <button
                                onClick={() => handleUnlockMedia(m.id, m.creditCost)}
                                disabled={processingIds[m.id]}
                                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-full text-[10px] uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Unlocking...' : `Unlock for ${formatAmount(m.creditCost)} 💎`}
                              </button>
                            ) : (
                              <p className="text-[10px] text-amber-400 italic">Your premium locked content</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : m.mediaType === 'gift' ? (
                      <div data-testid="message-gift-card" className="w-72 bg-gradient-to-br from-pink-900/60 to-purple-900/40 border border-pink-500/50 rounded-2xl p-4 shadow-lg text-center relative overflow-hidden flex flex-col items-center message-gift-card">
                        <div className="absolute top-1 right-2 text-[8px] text-yellow-400 font-bold uppercase tracking-widest">GIFT SENT</div>
                        <span className="text-5xl my-2">🎁</span>
                        <h5 className="font-serif italic text-pink-300 text-base">{m.gift?.giftName}</h5>
                        <p className="text-yellow-400 font-bold text-xs mt-1">💎 {formatAmount(m.gift?.giftValue)} Credits</p>
                        {m.gift?.message && (
                          <p className="text-xs italic text-gray-300 mt-2 border-t border-pink-500/20 pt-2 w-full break-words">"{m.gift.message}"</p>
                        )}
                      </div>
                    ) : m.mediaType === 'gift_request' ? (
                      <div data-testid="gift-request-message" className="w-72 bg-gradient-to-br from-[#200e1b] to-[#120711] border border-amber-500/40 rounded-2xl p-5 shadow-2xl text-center relative overflow-hidden flex flex-col items-center">
                        <div className="absolute top-1.5 right-2.5 text-[8px] text-amber-400 font-bold uppercase tracking-widest">WISH REQUEST</div>
                        <span className="text-5xl my-3 animate-bounce">🎁</span>
                        <h5 className="font-serif italic text-white text-base">is wishing for a gift</h5>
                        <p className="text-pink-300 font-bold text-sm mt-1">{m.giftRequest?.giftName}</p>
                        <p className="text-amber-400 font-bold font-mono text-xs mt-1">💎 {formatAmount(m.giftRequest?.giftValue)} Credits</p>
                        {m.giftRequest?.message && (
                          <p className="text-xs italic text-gray-300 my-3 border-t border-pink-500/10 pt-3 w-full break-words">"{m.giftRequest.message}"</p>
                        )}
                        <div className="w-full space-y-2 mt-4">
                          {m.giftRequest?.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => handleFulfillGiftRequest(m.id)}
                                disabled={processingIds[m.id]}
                                className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-xl text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Sending...' : `Send ${m.giftRequest?.giftName}`}
                              </button>
                              <button
                                onClick={openGiftPicker}
                                disabled={processingIds[m.id]}
                                className="w-full py-1.5 border border-pink-500/30 text-pink-300 rounded-xl text-[10px] uppercase font-bold disabled:opacity-50"
                              >
                                Send a different gift
                              </button>
                              <button
                                onClick={() => handleDismissGiftRequest(m.id)}
                                disabled={processingIds[m.id]}
                                className="text-[10px] text-gray-400 hover:text-white underline mt-2 block mx-auto bg-transparent border-none cursor-pointer disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Dismissing...' : 'Maybe later'}
                              </button>
                            </>
                          ) : m.giftRequest?.status === 'fulfilled' ? (
                            <div className="text-xs text-green-400 font-bold uppercase tracking-widest bg-green-950/20 py-2 border border-green-500/30 rounded-xl">
                              ✅ Gift Sent
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 font-bold uppercase tracking-widest bg-white/5 py-2 rounded-xl">
                              Decline
                            </div>
                          )}
                        </div>
                      </div>
                    ) : m.mediaType === 'service_request' ? (
                      <div data-testid="service-request-message" className="w-72 bg-gradient-to-br from-[#1b0a14] to-[#0d040a] border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col text-left">
                        <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                          <span className="font-bold text-[10px] uppercase tracking-wider text-amber-400">Activity Service Charge</span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between text-gray-300">
                            <span>Activity rate:</span>
                            <span className="font-mono font-bold text-white">💎 {formatAmount(m.serviceRequest?.baseRate)}</span>
                          </div>
                          {m.serviceRequest?.extras?.map((ext: { label: string; amount: number }, idx: number) => (
                            <div key={idx} className="flex justify-between text-gray-400">
                              <span>{ext.label}:</span>
                              <span className="font-mono text-white">💎 {formatAmount(ext.amount)}</span>
                            </div>
                          ))}
                          <div className="border-t border-white/5 my-2 pt-2 flex justify-between items-center text-sm font-bold">
                            <span className="text-white">TOTAL:</span>
                            <span className="font-mono text-amber-400">💎 {formatAmount(m.serviceRequest?.totalAmount)}</span>
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

                        <div className="mt-4 space-y-2">
                          {m.serviceRequest?.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Confirm payment of 💎 ${formatAmount(m.serviceRequest?.totalAmount)} credits (≈ ${formatNaira(m.serviceRequest?.totalAmount! * usePricingStore.getState().diamondNairaRate)})?`)) {
                                    handlePayServiceRequest(m.id);
                                  }
                                }}
                                disabled={processingIds[m.id]}
                                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-xl text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Paying...' : `Pay 💎 ${formatAmount(m.serviceRequest?.totalAmount)} Credits`}
                              </button>
                              <button
                                onClick={() => handleDeclineServiceRequest(m.id)}
                                disabled={processingIds[m.id]}
                                className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-[10px] uppercase font-bold disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          ) : m.serviceRequest?.status === 'paid' ? (
                            <div className="space-y-2">
                              <div className="text-xs text-green-400 font-bold uppercase tracking-widest text-center py-1 bg-green-950/20 border border-green-500/30 rounded-xl">
                                ✅ Paid
                              </div>
                              <p className="text-[10px] text-gray-400 text-center italic">Confirm once the service is delivered:</p>
                              <button
                                onClick={() => handleCompleteServiceRequest(m.id)}
                                disabled={processingIds[m.id]}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-bold uppercase disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Completing...' : 'Confirm Service Delivered'}
                              </button>
                              <button
                                onClick={() => handleReportServiceRequest(m.id)}
                                disabled={processingIds[m.id]}
                                className="w-full py-1 bg-transparent border border-red-500/30 text-red-400 hover:bg-red-950/20 rounded-xl text-[10px] font-bold uppercase disabled:opacity-50"
                              >
                                {processingIds[m.id] ? 'Reporting...' : 'Report an Issue'}
                              </button>
                            </div>
                          ) : m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed' ? (
                            <div className="text-xs text-green-400 font-bold uppercase tracking-widest text-center py-2 bg-green-950/20 border border-green-500/30 rounded-xl">
                              Service Completed
                            </div>
                          ) : (
                            <div className="space-y-2 mt-2">
                              <div className="text-xs text-red-400 font-bold uppercase tracking-widest text-center py-2 bg-red-950/20 border border-red-500/30 rounded-xl">
                                ⚠️ Issue Reported — Under Review
                              </div>
                              <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-3 text-[11px] text-gray-300 leading-relaxed text-left">
                                Your payment of 💎 {formatAmount(m.serviceRequest?.totalAmount)} is under review. You can still request a full withdrawal — your payment will be held until admin resolves this dispute.
                              </div>
                              <a href="/support" onClick={(e) => { e.preventDefault(); alert("Please contact support at support@vibe.com"); }} className="block text-center text-pink-400 hover:underline text-[11px] font-bold mt-2">
                                Contact Support
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : m.mediaType === 'request_photo' ? (
                      <div data-testid="message-photo-request" className="w-64 bg-[#1b0d19] border-2 border-dashed border-pink-500/40 rounded-xl p-4 flex flex-col gap-3 message-photo-request">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📷</span>
                          <span className="font-bold text-xs tracking-wider text-pink-400 uppercase">Photo Request</span>
                        </div>
                        {m.photoRequest?.note && (
                          <p className="text-xs text-gray-300 italic break-words">"{m.photoRequest.note}"</p>
                        )}

                        {m.photoRequest?.status === 'pending' ? (
                          !isMe ? (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => {
                                  const url = prompt("Enter Image URL to send:", "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80");
                                  if (url) {
                                    handleFulfillPhotoRequest(m.id, url, false, 0);
                                  }
                                }}
                                className="flex-1 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded text-[10px] font-bold uppercase tracking-wider"
                              >
                                Send Photo
                              </button>
                              <button
                                onClick={() => handleDeclinePhotoRequest(m.id)}
                                className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px] font-bold uppercase"
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400 italic text-center mt-2">Waiting for their response...</div>
                          )
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
                      <div data-testid="message-service-tonight-request" className="w-64 bg-[#140b13] border-2 border-dashed border-purple-500/40 rounded-xl p-4 flex flex-col gap-3 message-service-tonight-request">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs tracking-wider text-purple-400 uppercase">Service Request</span>
                        </div>
                        {m.serviceTonightRequest?.note && (
                          <p className="text-xs text-gray-300 italic break-words">"{m.serviceTonightRequest.note}"</p>
                        )}

                        {m.serviceTonightRequest?.status === 'pending' ? (
                          isMe ? (
                            <div className="text-[10px] text-gray-400 italic text-center mt-2 flex flex-col gap-2">
                              <span>Waiting for provider to send service rates...</span>
                              <button
                                onClick={() => handleDeclineServiceTonightRequest(m.id)}
                                className="py-1 bg-white/5 hover:bg-white/10 text-gray-400 rounded text-[9px] uppercase font-bold"
                              >
                                Cancel Request
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400 italic text-center mt-2">Waiting for response...</div>
                          )
                        ) : m.serviceTonightRequest?.status === 'fulfilled' ? (
                          <div className="text-[10px] text-green-400 font-bold tracking-wider uppercase mt-2">
                            ✓ Activity Request fulfilled
                          </div>
                        ) : (
                          <div className="text-[10px] text-red-400 font-bold tracking-wider uppercase mt-2">
                            ✗ Activity Request declined
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
                    ) : m.mediaType === 'voice_note' || m.mediaType === 'voice' || (m as any).type === 'voice_note' || (m as any).type === 'voice' ? (
                      <VoiceNotePlayer
                        mediaUrl={m.mediaUrl || (m as any).url || (m.content && m.content.startsWith('http') ? m.content : undefined)}
                        mediaDurationSeconds={m.mediaDurationSeconds || (m as any).duration}
                        isMe={isMe}
                        isFailed={m.isFailed}
                      />
                    ) : m.mediaType === 'system' || (m as any).isOfficialSystemMessage ? (
                      // SYSTEM / OFFICIAL ACKNOWLEDGEMENT MESSAGE
                      <div className="w-full max-w-md my-2 p-3 bg-blue-950/30 border border-blue-500/30 rounded-xl text-center text-xs text-blue-200 shadow-lg">
                        <div className="font-bold text-[10px] uppercase tracking-wider text-blue-400 mb-1 flex items-center justify-center gap-1">
                          <span>🔵</span> Official System Notice
                        </div>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    ) : (
                      <div data-testid="message-bubble" className={`p-3.5 max-w-xs text-sm rounded-2xl shadow-md leading-relaxed message-bubble break-words ${isMe ? 'bg-pink-600 text-white rounded-tr-none' : 'bg-[#1b0d19] border border-pink-500/20 text-gray-200 rounded-tl-none'} ${m.isFailed ? 'msg-bubble--failed' : ''}`}>
                        {m.content}
                      </div>
                    )}

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

            {uploadPreview && (
              <div className="p-3 bg-[#1e0f1d] border-t border-[var(--az-border)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img src={uploadPreview} className="w-12 h-12 rounded object-cover" alt="upload preview" />
                  <div>
                    <span className="text-xs block font-bold text-pink-400">Selected Attachment</span>
                    {user?.role === 'provider' && (
                      <label className="flex items-center gap-2 mt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLockedUpload}
                          onChange={(e) => setIsLockedUpload(e.target.checked)}
                          className="rounded border-gray-600 text-pink-500 focus:ring-pink-500"
                        />
                        <span className="text-[10px] text-gray-300">Lock and charge credits</span>
                      </label>
                    )}
                  </div>
                </div>

                {user?.role === 'provider' && isLockedUpload && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-amber-400 font-bold">Price (💎):</span>
                    <input
                      type="number"
                      value={uploadCost}
                      onChange={(e) => setUploadCost(parseInt(e.target.value) || 10)}
                      className="w-16 bg-black border border-amber-500/50 text-xs text-center rounded py-1 outline-none text-amber-400"
                    />
                  </div>
                )}

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
              {selectedConv.conversationId === 'official_notifications' || selectedConv.type === 'official_notification' ? (
                <div className="p-3 bg-pink-950/20 border border-pink-500/30 rounded-xl text-center text-xs text-pink-300 font-medium">
                  📢 Only admins can send messages to this channel.
                </div>
              ) : (
                <>
                  {filterWarning.show && (
                    user?.role === 'provider' ? (
                      <ProviderContentWarning
                        onDismiss={dismissWarning}
                      />
                    ) : (
                      <ContentFilterWarning
                        category={filterWarning.category}
                        onDismiss={dismissWarning}
                      />
                    )
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
                        <span data-testid="recording-dot" className="recording-dot w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-ping" aria-hidden="true" />

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

                      <label className="chat-input__media text-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer p-1 flex-shrink-0" title={user?.role === 'provider' ? "Upload photo or video" : "Upload photo"}>
                        📸
                        <input
                          type="file"
                          accept={user?.role === 'provider' ? "image/*,video/*" : "image/*"}
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

                  {selectedConv.type !== 'support' && !selectedConv.conversationId.startsWith('support_') && (
                    <div className="flex justify-center gap-8 mt-2 border-t border-[var(--az-border)]/20 pt-2 chat-quick-actions">
                      <button
                        onClick={openGiftPicker}
                        className="text-[10px] font-bold uppercase tracking-widest text-amber-400 hover:text-amber-500 flex items-center gap-1.5 transition-colors"
                      >
                        🎁 Send Gift
                      </button>
                      <button
                        onClick={() => setShowPhotoRequestModal(true)}
                        className="text-[10px] font-bold uppercase tracking-widest text-pink-400 hover:text-pink-500 flex items-center gap-1.5 transition-colors"
                      >
                        📸 Request Photo
                      </button>
                      <button
                        onClick={() => setShowServiceRequestModal(true)}
                        className="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-500 flex items-center gap-1.5 transition-colors"
                      >
                        Request Service
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-grow p-8 text-center text-gray-500">
            <span className="text-6xl mb-4 text-pink-500/30">💌</span>
            <h3 className="text-lg font-serif italic text-[var(--az-text-primary)]">Private Inbox</h3>
            <p className="text-xs max-w-xs mt-2">Choose an ongoing conversation from the sidebar or select a provider to start high-heat private messages.</p>
          </div>
        )}
      </div>

      {/* GIFT catalogue Picker */}
      {showGiftPicker && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-md bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowGiftPicker(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-serif italic text-pink-300 mb-2">Send a Gift</h3>
            <p className="text-[10px] text-yellow-400 uppercase tracking-widest font-bold mb-4">Your balance: 💎 {formatAmount(creditsRemaining)} credits</p>

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
                        <span className="text-[9px] text-yellow-400 font-mono mt-1">💎 {formatAmount(g.creditCost)}</span>
                      </div>
                    );
                  })
              )}
            </div>

            {selectedGift && (
              <div className="border-t border-pink-500/10 pt-4 animate-fadeIn">
                <p className="text-xs text-gray-300 mb-2">Adding Note to {selectedGift.name}:</p>
                <input
                  type="text"
                  placeholder="Optional romantic/spicy message..."
                  value={giftNote}
                  onChange={(e) => setGiftNote(e.target.value)}
                  className="w-full bg-[#1e0d1b] border border-pink-500/20 text-xs rounded-lg px-3 py-2 outline-none text-white focus:border-amber-400 mb-4"
                />

                <button
                  onClick={handleSendGift}
                  disabled={isSendingGift}
                  className={`w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold text-xs uppercase tracking-widest rounded-full transition-all disabled:opacity-50 ${shakeGiftButton ? 'animate-shake' : ''}`}
                >
                  {isSendingGift ? 'Sending...' : `Confirm Send (${formatAmount(selectedGift.creditCost)} 💎)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHOTO REQUEST modal */}
      {showPhotoRequestModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-sm bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowPhotoRequestModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-serif italic text-pink-300 mb-1">Request a Photo</h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-4">Let them know exactly what you'd like to see.</p>

            <textarea
              rows={4}
              maxLength={200}
              placeholder="E.g., Can I get a hot selfie in that outfit? 😉"
              value={photoRequestNote}
              onChange={(e) => setPhotoRequestNote(e.target.value)}
              className="w-full bg-[#1e0d1b] border border-pink-500/20 text-xs rounded-lg p-3 outline-none text-white focus:border-pink-500 mb-4 no-scrollbar resize-none"
            />

            <button
              onClick={handleSendPhotoRequest}
              disabled={isSendingPhotoRequest}
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-colors disabled:opacity-50"
            >
              {isSendingPhotoRequest ? 'Sending...' : 'Send Photo Request'}
            </button>
          </div>
        </div>
      )}

      {/* SERVICE REQUEST modal */}
      {showServiceRequestModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="w-full max-w-sm bg-[#160b13] border border-pink-500/30 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowServiceRequestModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-serif italic text-pink-300 mb-1">Request an Activity</h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-4">Request a personalized activity arrangement for the day.</p>

            <textarea
              rows={4}
              maxLength={200}
              placeholder="E.g., Are you available for a private show or date tonight? 😉"
              value={serviceRequestNote}
              onChange={(e) => setServiceRequestNote(e.target.value)}
              className="w-full bg-[#1e0d1b] border border-pink-500/20 text-xs rounded-lg p-3 outline-none text-white focus:border-pink-500 mb-4 no-scrollbar resize-none"
            />

            <button
              onClick={handleSendServiceRequest}
              disabled={isSendingServiceRequest}
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-colors disabled:opacity-50"
            >
              {isSendingServiceRequest ? 'Sending...' : 'Send Activity Request'}
            </button>
          </div>
        </div>
      )}

      {/* SERVICE REQUEST ERROR MODAL */}
      {serviceRequestError && (
        <div data-testid="service-error-overlay" className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#160b13] border border-red-500/40 rounded-2xl p-6 shadow-2xl relative text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 data-testid="service-error-title" className="text-xl font-serif italic text-red-500 mb-2">{serviceRequestError.title}</h3>
            <p data-testid="service-error-message" className="text-xs text-gray-300 mb-6 leading-relaxed">{serviceRequestError.message}</p>
            {serviceRequestError.action && serviceRequestError.actionUrl && (
              <a
                href={serviceRequestError.actionUrl}
                className="inline-block px-5 py-2 mb-4 bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-900/20 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
              >
                {serviceRequestError.action} →
              </a>
            )}
            <button
              onClick={() => setServiceRequestError(null)}
              className="block w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-gray-400 hover:text-white border border-gray-800 font-medium text-xs rounded-full transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateSext;
