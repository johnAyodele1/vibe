import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { useUIStore } from './useUIStore';

const CallRoom = React.lazy(() => import('./CallRoom'));

// Default avatars/placeholders
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

const PrivateSext: React.FC = () => {
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
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [giftNote, setGiftNote] = useState('');
  const [giftsCatalogue, setGiftsCatalogue] = useState<Gift[]>([]);
  const [activeGiftTab, setActiveGiftTab] = useState<string>('all');
  const [showPhotoRequestModal, setShowPhotoRequestModal] = useState(false);
  const [photoRequestNote, setPhotoRequestNote] = useState('');

  // S3 upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [isLockedUpload, setIsLockedUpload] = useState(false);
  const [uploadCost, setUploadCost] = useState<number>(10);
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

  // Calling states
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'active' | 'summary'>('idle');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [callDuration, setCallDuration] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState<number>(user?.credits || 0);
  const [callRate, setCallRate] = useState<number>(0);
  const [callSummary, setCallSummary] = useState<{ duration: string; cost: number; wasBilled: boolean; status?: string } | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [callData, setCallData] = useState<any>(null);

  // Zego states
  const [zegoToken, setZegoToken] = useState<string | null>(null);
  const [zegoAppId, setZegoAppId] = useState<number | null>(null);
  const [zegoRoomId, setZegoRoomId] = useState<string | null>(null);

  // Shake / error visual feedbacks
  const [insufficientCreditsMsgId, setInsufficientCreditsMsgId] = useState<string | null>(null);
  const [shakeGiftButton, setShakeGiftButton] = useState(false);

  // UI responsive states
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Socket setup
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (behavior: 'smooth' | 'instant' = 'instant') => {
    if (behavior === 'instant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Outside click refs for context menus/emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recentEmojis] = useState<string[]>(['❤️', '🔥', '😂', '😮', '😢', '👍', '💋', '👅', '🍑', '🍆']);

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
      // On resize (e.g. keyboard open/close), scroll messages to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      console.log('Private Sext connected to /adult socket:', s.id);
    });

    s.on('sext:new_message', (payload: { message: Message }) => {
      if (selectedConv && payload.message.senderId !== user?.id) {
        // Append message if in current conversation
        setMessages(prev => [...prev, payload.message]);
        markConversationRead(selectedConv.conversationId);
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

    s.on('sext:message_reacted', (payload: { messageId: string, reactions: any[] }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m));
    });

    s.on('sext:message_deleted', (payload: { messageId: string }) => {
      setMessages(prev => prev.map(m => m.id === payload.messageId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m));
    });

    s.on('wallet:updated', (payload: { balance: number }) => {
      setCreditsRemaining(payload.balance);
    });

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

    s.on('call:declined', () => {
      cleanupWebRTC();
      setCallSummary({
        duration: '0 sec',
        cost: 0,
        wasBilled: false,
        status: 'declined'
      });
      setCallState('summary');
      toast.error('Call declined');
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

  // On initial load — scroll to bottom instantly
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('instant');
    }
  }, [selectedConv?.conversationId]);

  // On new message — scroll to bottom smoothly but only if near bottom
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

  // Upload S3 Flow
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
      // Fallback query matching our endpoint: /adult/media/presigned-url?type=image&filename=xxx
      const realPresignedUrlRes = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=${uploadFile.type.startsWith('video/') ? 'video' : 'image'}&filename=${encodeURIComponent(uploadFile.name)}`, {
        headers: getHeaders()
      });
      const presignedData = await realPresignedUrlRes.json();

      setUploadProgress(40);

      // 2. Upload direct
      await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: uploadFile,
        headers: {
          'Content-Type': uploadFile.type
        }
      });

      setUploadProgress(80);

      // 3. Send message with S3 publicUrl
      const isVideo = uploadFile.type.startsWith('video/');
      const mediaType = isLockedUpload
        ? (isVideo ? 'locked_video' : 'locked_image')
        : (isVideo ? 'video' : 'image');

      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/messages/${selectedConv.conversationId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          type: mediaType,
          content: isLockedUpload ? '[Locked Premium Media]' : '',
          mediaUrl: presignedData.publicUrl,
          mediaThumbnailUrl: isVideo ? "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=300&auto=format&fit=crop" : presignedData.publicUrl,
          creditCost: isLockedUpload ? uploadCost : 0
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

  // Audio Visualizer loop using Web Audio API AnalyserNode
  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64; // Small fft size for visual simplicity
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const animate = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        // Normalize values to range 4px to 32px height for 30 bars
        const heights = Array.from(dataArray).slice(0, 30).map(val => {
          return Math.max(4, (val / 255) * 32);
        });
        setAmplitudeData(heights);
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.error('AudioContext visualizer failed:', e);
      // Fallback random generation
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

    // Start MediaRecorder
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

    recorder.start(); // NO TIMESLICE ARGUMENT!

    setRecState('recording');
    setRecDuration(0);
    recDurationRef.current = 0;

    startAudioVisualizer(stream);
  };

  // Timer effect for voice recording (Counts up, NO auto-stop until 5 minutes)
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

      // Auto-stop at 5 minutes maximum
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

  // Media Unlock Flow
  const handleUnlockMedia = async (msgId: string, cost: number) => {
    const clientCost = Math.ceil(cost * 1.15);
    if (creditsRemaining < clientCost) {
      setInsufficientCreditsMsgId(msgId);
      setTimeout(() => setInsufficientCreditsMsgId(null), 800);
      toast.error('Insufficient credits! Top up your wallet to unlock.');
      return;
    }

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
    }
  };

  // Gift catalog fetch & send
  const openGiftPicker = async () => {
    setShowGiftPicker(true);
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

  const handleSendGift = async () => {
    if (!selectedGift || !selectedConv) return;

    if (creditsRemaining < selectedGift.creditCost) {
      setShakeGiftButton(true);
      setTimeout(() => setShakeGiftButton(null as any), 800);
      toast.error('Not enough credits to send this gift.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/send-gift`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          giftId: selectedGift._id,
          message: giftNote
        })
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, {
          id: data.message._id,
          senderId: user?.id || '',
          content: `Sent you a ${selectedGift.name}`,
          mediaType: 'gift',
          creditCost: selectedGift.creditCost,
          isUnlocked: true,
          gift: data.message.gift,
          isDeleted: false,
          createdAt: new Date().toISOString()
        }]);
        setShowGiftPicker(false);
        setSelectedGift(null);
        setGiftNote('');
        toast.success('🎁 Gift sent successfully!');
      }
    } catch (err) {
      toast.error('Failed to send gift');
    }
  };

  // Photo Request
  const handleSendPhotoRequest = async () => {
    if (!selectedConv) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations/${selectedConv.conversationId}/request-photo`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ note: photoRequestNote })
      });
      const data = await res.json();
      if (data.id) {
        setMessages(prev => [...prev, data]);
        setShowPhotoRequestModal(false);
        setPhotoRequestNote('');
        toast.success('Photo request sent!');
      }
    } catch (err) {
      toast.error('Failed to send request');
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
    }
  };

  const handleDismissGiftRequest = async (msgId: string) => {
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
    }
  };

  const handlePayServiceRequest = async (msgId: string) => {
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
    }
  };

  const handleCompleteServiceRequest = async (msgId: string) => {
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
    }
  };

  const handleReportServiceRequest = async (msgId: string) => {
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

  // Reaction picker
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

  // Message deletion
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

  // Audio / Video call trigger
  const handleInitiateCall = async (type: 'video' | 'audio') => {
    if (!selectedConv) return;
    const hasPermissions = await checkMediaPermissions(type);
    if (!hasPermissions) return;

    setCallType(type);
    setCallState('calling');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/initiate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          conversationId: selectedConv.conversationId,
          type
        })
      });
      const data = await res.json();
      if (data.callId) {
        setActiveCallId(data.callId);
        setCallData(data);
        setCallRate(data.perMinuteRate);

        // Fetch token right away so we are ready when they accept
        const tokenRes = await fetch(`${API_BASE_URL}/v1/adult/zego/token?roomId=${data.roomId}&type=call`, {
          headers: getHeaders()
        });
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
          setZegoToken(tokenData.token);
          setZegoAppId(tokenData.appId);
          setZegoRoomId(data.roomId);
        } else {
          setCallState('idle');
          toast.error('Failed to get call token');
        }
      } else {
        setCallState('idle');
        toast.error('Call initialization failed');
      }
    } catch (err) {
      setCallState('idle');
      toast.error('Insufficient balance to place call');
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

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    if (!c.otherUser) return false;
    const nameMatch = c.otherUser.displayName.toLowerCase().includes(searchText.toLowerCase());
    const previewMatch = c.lastMessage?.content?.toLowerCase().includes(searchText.toLowerCase()) || false;
    return nameMatch || previewMatch;
  });

  const handleScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;

    // When user scrolls to within 60px of the top, load more
    if (feed.scrollTop < 60 && hasMoreMessages) {
      const previousScrollHeight = feed.scrollHeight;
      loadMoreMessages().then(() => {
        // After loading, restore scroll position so the view doesn't jump
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
                  onClick={() => handleInitiateCall('audio')}
                  className="text-lg hover:scale-110 transition-transform p-1.5 conversation-header__action-btn"
                  title="Audio Call"
                >
                  📞
                </button>
                <button
                  onClick={() => handleInitiateCall('video')}
                  className="text-lg hover:scale-110 transition-transform p-1.5 conversation-header__action-btn"
                  title="Video Call"
                >
                  📹
                </button>
                <span className="text-yellow-400 font-bold text-xs flex items-center gap-1 conversation-header__credits">
                  💎 {creditsRemaining}
                </span>
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
                const isMe = m.senderId === user?.id;

                // Handle reactions bar click helper
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

                    {/* Render different bubbles according to messageType */}
                    {m.systemText || m.mediaType === 'system' ? (
                      <div className="mx-auto my-2 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                        ── {m.systemText || m.content} ──
                      </div>
                    ) : m.mediaType === 'locked_image' || m.mediaType === 'locked_video' ? (
                      <div data-testid="message-locked-media" className="relative w-64 h-80 rounded-2xl overflow-hidden border border-pink-500/30 bg-[#160c14] flex flex-col items-center justify-center p-4 shadow-xl message-locked-media">
                        {/* Blurred media background */}
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
                                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-full text-[10px] uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all"
                              >
                                Unlock for {Math.ceil(m.creditCost * 1.15)} 💎
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
                        <p className="text-yellow-400 font-bold text-xs mt-1">💎 {m.gift?.giftValue} Credits</p>
                        {m.gift?.message && (
                          <p className="text-xs italic text-gray-300 mt-2 border-t border-pink-500/20 pt-2 w-full">"{m.gift.message}"</p>
                        )}
                      </div>
                    ) : m.mediaType === 'gift_request' ? (
                      /* GIFT REQUEST (MEMBER / RECEIVER VIEW) */
                      <div data-testid="gift-request-message" className="w-72 bg-gradient-to-br from-[#200e1b] to-[#120711] border border-amber-500/40 rounded-2xl p-5 shadow-2xl text-center relative overflow-hidden flex flex-col items-center">
                        <div className="absolute top-1.5 right-2.5 text-[8px] text-amber-400 font-bold uppercase tracking-widest">WISH REQUEST</div>
                        <span className="text-5xl my-3 animate-bounce">🎁</span>
                        <h5 className="font-serif italic text-white text-base">is wishing for a gift</h5>
                        <p className="text-pink-300 font-bold text-sm mt-1">{m.giftRequest?.giftName}</p>
                        <p className="text-amber-400 font-bold font-mono text-xs mt-1">💎 {m.giftRequest?.giftValue} Credits</p>
                        {m.giftRequest?.message && (
                          <p className="text-xs italic text-gray-300 my-3 border-t border-pink-500/10 pt-3 w-full">"{m.giftRequest.message}"</p>
                        )}
                        <div className="w-full space-y-2 mt-4">
                          {m.giftRequest?.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => handleFulfillGiftRequest(m.id)}
                                className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-xl text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-transform"
                              >
                                Send {m.giftRequest?.giftName}
                              </button>
                              <button
                                onClick={openGiftPicker}
                                className="w-full py-1.5 border border-pink-500/30 text-pink-300 rounded-xl text-[10px] uppercase font-bold"
                              >
                                Send a different gift
                              </button>
                              <button
                                onClick={() => handleDismissGiftRequest(m.id)}
                                className="text-[10px] text-gray-400 hover:text-white underline mt-2 block mx-auto bg-transparent border-none cursor-pointer"
                              >
                                Maybe later
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
                      /* SERVICE REQUEST (MEMBER / RECEIVER VIEW) */
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
                            ≈ ${(m.serviceRequest?.totalAmount! * 0.1).toFixed(2)} USD
                          </span>
                        </div>

                        {m.serviceRequest?.note && (
                          <p className="text-[11px] text-gray-400 italic mt-3 bg-white/5 p-2 rounded-lg border-l-2 border-amber-400">
                            "{m.serviceRequest.note}"
                          </p>
                        )}

                        <div className="mt-4 space-y-2">
                          {m.serviceRequest?.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Confirm payment of 💎 ${m.serviceRequest?.totalAmount} credits (≈ $${(m.serviceRequest?.totalAmount! * 0.1).toFixed(2)} USD)?`)) {
                                    handlePayServiceRequest(m.id);
                                  }
                                }}
                                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-xl text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-transform"
                              >
                                Pay 💎 {m.serviceRequest?.totalAmount} Credits
                              </button>
                              <button
                                onClick={() => handleDeclineServiceRequest(m.id)}
                                className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-[10px] uppercase font-bold"
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
                                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-bold uppercase"
                              >
                                Confirm Service Delivered
                              </button>
                              <button
                                onClick={() => handleReportServiceRequest(m.id)}
                                className="w-full py-1 bg-transparent border border-red-500/30 text-red-400 hover:bg-red-950/20 rounded-xl text-[10px] font-bold uppercase"
                              >
                                Report an Issue
                              </button>
                            </div>
                          ) : m.serviceRequest?.status === 'completed' || m.serviceRequest?.status === 'auto_completed' ? (
                            <div className="text-xs text-green-400 font-bold uppercase tracking-widest text-center py-2 bg-green-950/20 border border-green-500/30 rounded-xl">
                              🌙 Service Completed
                            </div>
                          ) : (
                            <div className="text-xs text-red-400 font-bold uppercase tracking-widest text-center py-2 bg-red-950/20 border border-red-500/30 rounded-xl">
                              ⚠️ Issue Reported
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
                          <p className="text-xs text-gray-300 italic">"{m.photoRequest.note}"</p>
                        )}

                        {m.photoRequest?.status === 'pending' ? (
                          !isMe ? (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => {
                                  // Mock fulfill photo request
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
                          {/* Beautiful waveform visualizer bars */}
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

                    {/* Hover tools / floating reaction bar & delete */}
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
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isLockedUpload}
                        onChange={(e) => setIsLockedUpload(e.target.checked)}
                        className="rounded border-gray-600 text-pink-500 focus:ring-pink-500"
                      />
                      <span className="text-[10px] text-gray-300">Lock and charge credits</span>
                    </label>
                  </div>
                </div>

                {isLockedUpload && (
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
              {recState === 'sending' ? (
                /* SENDING / UPLOADING LOADER BAR */
                <div className="recording-bar flex items-center justify-center gap-3 h-14 bg-[#150a12] rounded-full px-4 border border-[var(--az-border)] w-full">
                  <span className="animate-spin text-sm">⏳</span>
                  <span className="text-xs font-mono text-pink-300">Sending voice note...</span>
                </div>
              ) : recState === 'recording' ? (
                /* RECORDING BAR LAYOUT */
                <div data-testid="recording-bar" className="recording-bar flex items-center justify-between h-14 bg-[#150a12] rounded-full px-4 border border-[var(--az-border)] transition-all duration-200 w-full">
                  {/* Left: cancel button (bin) */}
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

                  {/* Center: Live waveform animation + Timer */}
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

                  {/* Right: Send button (stops and sends) */}
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
                /* IDLE normal layout */
                <div className="chat-input-row flex items-center gap-3 bg-[#150a12] rounded-full px-4 py-1.5 border border-[var(--az-border)] w-full">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="chat-input__emoji text-lg opacity-70 hover:opacity-100 transition-opacity p-1 flex-shrink-0"
                  >
                    😀
                  </button>

                  {/* Image upload trigger */}
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
                    placeholder="Send a naughty message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    className="chat-input__field flex-grow bg-transparent border-none outline-none text-sm text-[var(--az-text-primary)] py-2 min-w-0"
                  />

                  {/* Tap to start recording */}
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

              {/* Emoji Picker Modal Overlay */}
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
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-grow p-8 text-center text-gray-500">
            <span className="text-6xl mb-4 text-pink-500/30">💌</span>
            <h3 className="text-lg font-serif italic text-[var(--az-text-primary)]">Sexting Inbox</h3>
            <p className="text-xs max-w-xs mt-2">Choose an ongoing conversation from the sidebar or select a provider to start high-heat private messages.</p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. MODALS AND OVERLAYS (GIFTS, PHOTO REQUESTS, CALL SCREEN) */}
      {/* ======================================================== */}

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
            <p className="text-[10px] text-yellow-400 uppercase tracking-widest font-bold mb-4">Your balance: 💎 {creditsRemaining} credits</p>

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
                  className={`w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold text-xs uppercase tracking-widest rounded-full transition-all ${shakeGiftButton ? 'animate-shake' : ''}`}
                >
                  Confirm Send ({selectedGift.creditCost} 💎)
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
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-colors"
            >
              Send Photo Request
            </button>
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

          {/* Outgoing Call Layout */}
          {callState === 'calling' && (
            <div className="flex-grow flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-pink-500 mb-6">
                <img src={selectedConv?.otherUser?.avatarUrl || FALLBACK_AVATAR} className="w-full h-full object-cover animate-pulse" />
              </div>
              <h2 className="text-3xl font-serif italic mb-2">{selectedConv?.otherUser?.displayName}</h2>
              <p className="text-xs text-gray-400 uppercase tracking-widest animate-pulse">Calling...</p>

              <button
                onClick={handleEndCall}
                className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform mt-12"
              >
                ✕
              </button>
            </div>
          )}

          {/* Active Call Layout with ZegoCloud WebRTC */}
          {callState === 'active' && (
            <div className="relative w-full h-full bg-[#0a0608]">

              {/* Fullscreen Zego room */}
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

              {/* Credit ticker — top-right corner, does not interfere with ZegoCloud */}
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
                <span>💎 {creditsRemaining.toLocaleString()}</span>
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

export default PrivateSext;
