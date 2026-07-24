import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { useUIStore } from './useUIStore';

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
  systemText?: string;
  reactions?: { userId: string; emoji: string; reactedAt?: string }[];
  isDeleted: boolean;
  createdAt: string;
  readAt?: string;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [msgPage, setMsgPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // Form states
  const [inputText, setInputText] = useState('');

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

  // Gift Request states
  const [showGiftRequestDialog, setShowGiftRequestDialog] = useState(false);
  const [giftsCatalogue, setGiftsCatalogue] = useState<Gift[]>([]);
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [giftRequestNote, setGiftRequestNote] = useState('');
  const [activeGiftTab, setActiveGiftTab] = useState<string>('all');

  // Service Request states
  const [showServiceRequestDialog, setShowServiceRequestDialog] = useState(false);
  const [serviceExtras, setServiceExtras] = useState<Array<{ label: string; amount: number }>>([]);
  const [serviceRequestNote, setServiceRequestNote] = useState('');
  const tonightRate = (user as any)?.providerProfile?.tonightRate || 100;

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
    fetchConversations();
  }, [user?.id]);

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

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, { headers: getHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
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
      if (Array.isArray(data)) {
        if (page === 1) {
          setMessages(data.reverse());
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
      if (selectedConv && payload.message.senderId !== user?.id) {
        setMessages(prev => [...prev, payload.message]);
        markConversationRead(selectedConv.conversationId);
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

    s.on('sext:message_reacted', (payload: { messageId: string, reactions: any[] }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m));
    });

    s.on('sext:message_deleted', (payload: { messageId: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m));
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



    socketRef.current = s;

    return () => {
      s.disconnect();
    };
  }, [token, selectedConv?.conversationId]);

  // Scroll behaviors
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('instant');
    }
  }, [selectedConv?.conversationId]);

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

  // Send Text Message
  const handleSendText = async () => {
    if (!selectedConv || (!inputText.trim() && !uploadPreview)) return;

    if (uploadPreview) {
      await handleUploadAndSend();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: 'text',
          content: inputText
        })
      });
      const data = await res.json();
      if (data.id) {
        setMessages(prev => [...prev, data]);
        setInputText('');
        fetchConversations();
      }
    } catch (err) {
      toast.error('Failed to send message');
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
      const realPresignedUrlRes = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=${uploadFile.type.startsWith('video/') ? 'video' : 'image'}&filename=${encodeURIComponent(uploadFile.name)}`, {
        headers: getHeaders()
      });
      const presignedData = await realPresignedUrlRes.json();

      setUploadProgress(40);

      await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: uploadFile,
        headers: {
          'Content-Type': uploadFile.type
        }
      });

      setUploadProgress(80);

      const isVideo = uploadFile.type.startsWith('video/');
      const mediaType = isVideo ? 'video' : 'image';

      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: mediaType,
          mediaUrl: presignedData.publicUrl,
          mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : presignedData.publicUrl,
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
    if (paidMediaCost < 1) {
      toast.error('Unlock price must be at least 1 credit.');
      return;
    }

    setIsMediaUploading(true);
    setMediaUploadProgress(10);

    try {
      const isVideo = paidMediaFile.type.startsWith('video/');
      const presignedRes = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=${isVideo ? 'video' : 'image'}&filename=${encodeURIComponent(paidMediaFile.name)}`, {
        headers: getHeaders()
      });
      const presignedData = await presignedRes.json();

      setMediaUploadProgress(45);

      await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: paidMediaFile,
        headers: {
          'Content-Type': paidMediaFile.type
        }
      });

      setMediaUploadProgress(80);

      const mediaType = isVideo ? 'locked_video' : 'locked_image';

      if (activePhotoRequestFulfillId) {
        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${activePhotoRequestFulfillId}/fulfill`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            mediaUrl: presignedData.publicUrl,
            mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : presignedData.publicUrl,
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
            mediaUrl: presignedData.publicUrl,
            mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : presignedData.publicUrl,
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
      setIsMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };

  // Send Gift Request Picker Dialog
  const openGiftRequestPicker = async () => {
    setShowGiftRequestDialog(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/gifts/catalogue`, { headers: getHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setGiftsCatalogue(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendGiftRequest = async () => {
    if (!selectedGift || !selectedConv) return;
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
    const cleanedExtras = serviceExtras.filter(e => e.label.trim());

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/service-request`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          extras: cleanedExtras,
          note: serviceRequestNote
        })
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(data.error || 'A service request is already active in this conversation');
        return;
      }
      if (data.id) {
        setMessages(prev => [...prev, data]);
        setShowServiceRequestDialog(false);
        setServiceExtras([]);
        setServiceRequestNote('');
        toast.success('Tonight service charge request sent!');
      }
    } catch (err) {
      toast.error('Failed to send service request');
    }
  };

  // Handle Actionable Photo Requests received from members
  const handleFulfillPhotoRequestFree = async (msgId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      toast.loading('Uploading and fulfilling request...');
      try {
        const presignedRes = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=image&filename=${encodeURIComponent(file.name)}`, {
          headers: getHeaders()
        });
        const presignedData = await presignedRes.json();

        await fetch(presignedData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type }
        });

        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/photo-requests/${msgId}/fulfill`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            mediaUrl: presignedData.publicUrl,
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
      }
    };
    input.click();
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

        const pData = await (await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=audio&filename=${file.name}`, { headers: getHeaders() })).json();

        await fetch(pData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type }
        });

        const amplitudeWaveform = Array.from({ length: 25 }, () => Math.random());

        const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv!.conversationId}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            type: 'voice_note',
            mediaUrl: pData.publicUrl,
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
  const totalServiceChargeAmount = tonightRate + serviceExtras.reduce((sum, item) => sum + item.amount, 0);

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
                    <img
                      src={other.avatarUrl || FALLBACK_AVATAR}
                      className="w-12 h-12 rounded-full object-cover border border-[var(--az-border)]"
                      alt={other.displayName}
                    />
                    {other.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#070406] rounded-full" />
                    )}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="font-bold text-sm truncate">{other.displayName}</h4>
                      {c.lastMessage && (
                        <span className="text-[10px] text-gray-400">
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
                  <img
                    src={selectedConv.otherUser?.avatarUrl || FALLBACK_AVATAR}
                    className="w-9 h-9 rounded-full object-cover border border-pink-500/50 conversation-header__avatar"
                    alt={selectedConv.otherUser?.displayName}
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
                          <p className="text-xs italic text-gray-300 mt-2 border-t border-pink-500/20 pt-2 w-full">"{m.gift.message}"</p>
                        )}
                      </div>
                    ) : m.mediaType === 'gift_request' ? (
                      /* GIFT REQUEST (PROVIDER VIEW) */
                      <div data-testid="gift-request-message" className="message-gift-request w-72">
                        <span className="gift-request__icon">🎁</span>
                        <h4 className="gift-request__title">You requested a {m.giftRequest?.giftName}</h4>
                        <p className="gift-request__amount">💎 {m.giftRequest?.giftValue} credits</p>
                        {m.giftRequest?.message && (
                          <p className="gift-request__note">"{m.giftRequest.message}"</p>
                        )}
                        <span className="text-[10px] bg-white/5 text-gray-400 px-3 py-1 rounded-full uppercase tracking-wider font-mono">
                          {m.giftRequest?.status === 'pending' ? '⏳ Waiting for response...' : '🎁 Gift sent!'}
                        </span>
                      </div>
                    ) : m.mediaType === 'service_request' ? (
                      /* SERVICE REQUEST (PROVIDER SENT VIEW) */
                      <div data-testid="service-request-message" className="message-service-request w-72">
                        <div className="service-request__header">
                          <span className="service-request__icon">🌙</span>
                          <span className="service-request__label">Service Request</span>
                        </div>

                        <div className="service-request__breakdown">
                          <div className="service-request__row">
                            <span className="service-request__row-label">Tonight Rate:</span>
                            <span className="service-request__row-amount">💎 {m.serviceRequest?.baseRate}</span>
                          </div>
                          {m.serviceRequest?.extras.map((ext, i) => (
                            <div key={i} className="service-request__row">
                              <span className="service-request__row-label">{ext.label}:</span>
                              <span className="service-request__row-amount">💎 {ext.amount}</span>
                            </div>
                          ))}
                        </div>

                        <div className="service-request__divider" />

                        <div className="service-request__total-row">
                          <span className="service-request__total-label">TOTAL:</span>
                          <span className="service-request__total-amount">💎 {m.serviceRequest?.totalAmount}</span>
                        </div>

                        {m.serviceRequest?.note && (
                          <p className="text-xs italic text-gray-400 mt-3">"{m.serviceRequest.note}"</p>
                        )}

                        <div className="mt-3">
                          <span
                            data-testid="service-request-status"
                            className={`service-request__status ${
                              m.serviceRequest?.status === 'pending'
                                ? 'service-request__status--pending'
                                : m.serviceRequest?.status === 'paid'
                                ? 'service-request__status--paid'
                                : m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed'
                                ? 'service-request__status--complete'
                                : 'service-request__status--reported'
                            }`}
                          >
                            {m.serviceRequest?.status === 'pending' && '⏳ Awaiting payment'}
                            {m.serviceRequest?.status === 'paid' && '✅ Payment received'}
                            {(m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed') && '🌙 Service completed'}
                            {m.serviceRequest?.status === 'reported' && '⚠️ Reported'}
                          </span>
                        </div>

                        {m.serviceRequest?.status === 'paid' && (
                          <p className="text-[10px] text-gray-500 italic mt-2">
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
                          <p className="text-xs text-gray-300 italic">"{m.photoRequest.note}"</p>
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
                              className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black rounded text-[10px] font-bold uppercase tracking-wider"
                            >
                              💰 Accept & Send Paid
                            </button>
                            <button
                              data-testid="photo-request-send-free"
                              onClick={() => handleFulfillPhotoRequestFree(m.id)}
                              className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white rounded text-[10px] font-bold uppercase"
                            >
                              Send Free Photo
                            </button>
                            <button
                              data-testid="photo-request-decline"
                              onClick={() => handleDeclinePhotoRequest(m.id)}
                              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px] font-bold uppercase"
                            >
                              Decline
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
                    ) : m.mediaType === 'image' ? (
                      <div data-testid="message-bubble" className="max-w-xs rounded-xl overflow-hidden border border-pink-500/20 message-bubble">
                        <img src={m.mediaUrl} className="max-h-72 object-cover" alt="attachment" />
                      </div>
                    ) : m.mediaType === 'video' ? (
                      <div data-testid="message-bubble" className="max-w-xs rounded-xl overflow-hidden border border-pink-500/20 bg-black message-bubble">
                        <video src={m.mediaUrl} controls className="max-h-72 object-cover" />
                      </div>
                    ) : m.mediaType === 'voice_note' || m.mediaType === 'voice' ? (
                      <div data-testid="message-voice-note" className={`p-3.5 rounded-2xl flex items-center gap-3 w-64 message-voice-note ${isMe ? 'bg-pink-700 text-white' : 'bg-[#1e101a] text-gray-200 border border-pink-500/20'}`}>
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
                      <div data-testid="message-bubble" className={`p-3.5 max-w-xs text-sm rounded-2xl shadow-md leading-relaxed message-bubble ${isMe ? 'bg-pink-600 text-white rounded-tr-none' : 'bg-[#1b0d19] border border-pink-500/20 text-gray-200 rounded-tl-none'}`}>
                        {m.content}
                      </div>
                    )}

                    {/* Time & seen tick mark */}
                    <div className="flex items-center gap-1.5 mt-1 text-[9px] text-gray-400 uppercase tracking-widest font-mono">
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && (
                        <span>· SEEN</span>
                      )}
                    </div>

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
                    onChange={(e) => setInputText(e.target.value)}
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
                    onClick={handleSendText}
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
                  Members pay this to view your content. (≈ ${Math.round(paidMediaCost * 0.1 * 100) / 100} USD value)
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
                disabled={!paidMediaFile || isMediaUploading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-40"
              >
                {isMediaUploading ? 'Uploading payload...' : 'Send Locked Media'}
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
              {giftsCatalogue
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
                })}
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
                  className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all"
                >
                  Send Gift Request
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
                  <span className="text-xs font-mono font-bold text-amber-400">💎 {tonightRate} credits (≈ ${Math.round(tonightRate * 0.1 * 100) / 100})</span>
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
                  💎 {totalServiceChargeAmount} credits <span className="text-xs text-gray-500 font-sans font-normal">(≈ ${Math.round(totalServiceChargeAmount * 0.1 * 100) / 100})</span>
                </span>
              </div>

              <button
                data-testid="service-request-submit"
                onClick={handleSendServiceRequestSubmit}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-900/20 active:scale-95"
              >
                Send Service Request
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
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-pink-500 animate-pulse mb-6">
                <img src={selectedConv?.otherUser?.avatarUrl || FALLBACK_AVATAR} className="w-full h-full object-cover" />
              </div>
              <h2 className="text-3xl font-serif italic mb-2">{selectedConv?.otherUser?.displayName}</h2>
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
                          <span className="font-bold text-yellow-400">💎 {callSummary.cost}  ≈  ${(callSummary.cost * 0.1).toFixed(2)}</span>
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