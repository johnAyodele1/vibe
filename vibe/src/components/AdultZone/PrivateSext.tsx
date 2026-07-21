import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { useUIStore } from './useUIStore';

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

  // Voice recording states (hold to record)
  const { setHideGlobalHeader, setHideFooter } = useUIStore();
  const [recState, setRecState] = useState<'idle' | 'recording' | 'cancelling' | 'locked'>('idle');
  const [recDuration, setRecDuration] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [shakeMic, setShakeMic] = useState(false);
  const [amplitudeData, setAmplitudeData] = useState<number[]>(Array(15).fill(4));

  const startX = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recDurationRef = useRef<number>(0);

  // Calling states
  const [callState, setCallState] = useState<'incoming' | 'outgoing' | 'active' | 'summary' | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [callDuration, setCallDuration] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState<number>(user?.credits || 0);
  const [callRate, setCallRate] = useState<number>(0);
  const [callSummary, setCallSummary] = useState<{ duration: string; cost: number } | null>(null);

  // WebRTC refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Shake / error visual feedbacks
  const [insufficientCreditsMsgId, setInsufficientCreditsMsgId] = useState<string | null>(null);
  const [shakeGiftButton, setShakeGiftButton] = useState(false);

  // UI responsive states
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Socket setup
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
      setCallState('incoming');
    });

    s.on('call:accepted', async (payload: { callId: string; webrtcRoomId: string }) => {
      setCallState('active');
      setCallDuration(0);
      initializeWebRTC(payload.webrtcRoomId);
    });

    s.on('call:declined', () => {
      setCallState(null);
      toast.error('Call declined');
    });

    s.on('call:ended', (payload: { callId: string; durationSeconds: number; creditsDeducted: number }) => {
      cleanupWebRTC();
      setCallSummary({
        duration: `${Math.floor(payload.durationSeconds / 60)} min ${payload.durationSeconds % 60} sec`,
        cost: payload.creditsDeducted
      });
      setCallState('summary');
    });

    s.on('call:missed', () => {
      setCallState(null);
      toast.info('Call missed');
    });

    s.on('call:offer', async (data: { offer: any }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        s.emit('call:answer', { callId: activeCallId, answer });
      }
    });

    s.on('call:answer', async (data: { answer: any }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    s.on('call:ice-candidate', async (data: { candidate: any }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
    };
  }, [token, selectedConv?.conversationId]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // WebRTC signalling helper functions
  const initializeWebRTC = async (webrtcRoomId: string) => {
    console.log("Initializing WebRTC call room:", webrtcRoomId);
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // Get local stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('call:ice-candidate', { callId: activeCallId, candidate: event.candidate });
        }
      };

      peerConnectionRef.current = pc;

      // Caller creates offer
      if (callState === 'outgoing') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call:offer', { callId: activeCallId, offer });
      }

      socketRef.current?.emit('call:join', { callId: activeCallId });
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to establish media connection: ' + err.message);
    }
  };

  const cleanupWebRTC = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current = null;
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
        // Normalize values to range 4px to 32px height
        const heights = Array.from(dataArray).slice(0, 15).map(val => {
          return Math.max(4, Math.min(32, (val / 255) * 32));
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
        setAmplitudeData(Array.from({ length: 15 }, () => Math.max(4, Math.min(32, Math.random() * 28 + 4))));
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

  // Start holding mic to record
  const triggerStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const duration = recDurationRef.current;
        stopAudioVisualizer();

        if (duration < 1) {
          // Too short
          toast.dismiss();
          setShakeMic(true);
          setTimeout(() => setShakeMic(false), 400);
          setShowTooltip(true);
          setTimeout(() => setShowTooltip(false), 2000);
          return;
        }

        // Upload and send voice note
        setIsUploading(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const file = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });

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
              mediaMimeType: 'audio/webm',
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
          setIsUploading(false);
        }
      };

      mediaRecorder.start();
      setRecState('recording');
      setRecDuration(0);
      recDurationRef.current = 0;
      startAudioVisualizer(stream);
    } catch (err) {
      toast.error('Microphone access denied or not available');
    }
  };

  // Timer effect for voice recording
  useEffect(() => {
    let interval: any = null;
    if (recState === 'recording' || recState === 'cancelling' || recState === 'locked') {
      interval = setInterval(() => {
        setRecDuration(prev => {
          const next = prev + 1;
          recDurationRef.current = next;
          // Lock to record after 3 seconds
          if (next >= 3 && recState === 'recording') {
            setRecState('locked');
          }
          return next;
        });
      }, 1000);
    } else {
      setRecDuration(0);
      recDurationRef.current = 0;
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recState]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    startX.current = e.touches[0].clientX;
    triggerStartRecording();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (recState !== 'recording' && recState !== 'cancelling') return;
    const currentX = e.touches[0].clientX;
    const deltaX = startX.current - currentX;

    if (deltaX > 80) {
      setRecState('cancelling');
    } else {
      setRecState('recording');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (recState === 'cancelling') {
      handleCancelRecording();
    } else if (recState === 'recording') {
      handleStopAndSend();
    }
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerStartRecording();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (recState === 'recording') {
      handleStopAndSend();
    } else if (recState === 'cancelling') {
      handleCancelRecording();
    }
  };

  const handleStopAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecState('idle');
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {}
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    stopAudioVisualizer();
    setRecState('idle');
    toast.info('Recording cancelled');
  };

  const handleSendRecording = () => {
    handleStopAndSend();
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

  // Audio / Video call trigger
  const handleInitiateCall = async (type: 'video' | 'audio') => {
    if (!selectedConv) return;
    setCallType(type);
    setCallState('outgoing');

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
        initializeWebRTC(data.webrtcRoomId);
      } else {
        setCallState(null);
        toast.error('Call initialization failed');
      }
    } catch (err) {
      setCallState(null);
      toast.error('Insufficient balance to place call');
    }
  };

  const handleAcceptCall = async () => {
    if (!activeCallId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${activeCallId}/accept`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.webrtcRoomId) {
        setCallState('active');
        initializeWebRTC(data.webrtcRoomId);
      }
    } catch (err) {
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
      setCallState(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEndCall = async () => {
    if (!activeCallId) return;
    try {
      await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${activeCallId}/end`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ reason: 'hung_up' })
      });
      cleanupWebRTC();
    } catch (err) {
      cleanupWebRTC();
      setCallState(null);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    if (!c.otherUser) return false;
    const nameMatch = c.otherUser.displayName.toLowerCase().includes(searchText.toLowerCase());
    const previewMatch = c.lastMessage?.content?.toLowerCase().includes(searchText.toLowerCase()) || false;
    return nameMatch || previewMatch;
  });

  return (
    <div className="h-[100dvh] md:h-[calc(100vh-64px)] w-full flex overflow-hidden bg-[#0a0508] text-[var(--az-text-primary)] font-sans chat-page-mobile">

      {/* 1. LEFT PANEL: CONVERSATION LIST */}
      <div className={`w-full md:w-80 flex-shrink-0 flex-col border-r border-[var(--az-border)] bg-[#070406] ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
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
      <div className={`flex-grow flex flex-col bg-[#0e070c] ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
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
            <div data-testid="message-feed" className="flex-grow overflow-y-auto p-6 space-y-6 flex flex-col no-scrollbar message-feed message-feed-container">
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

              <div ref={messagesEndRef} />
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
              {recState !== 'idle' ? (
                /* RECORDING BAR LAYOUT */
                <div data-testid="recording-bar" className="recording-bar flex items-center justify-between h-14 bg-[#150a12] rounded-full px-4 border border-[var(--az-border)] transition-all duration-200 w-full">
                  {/* Left: cancel button */}
                  <button
                    data-testid="recording-cancel-btn"
                    onClick={handleCancelRecording}
                    className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                      recState === 'cancelling' ? 'text-red-500' : 'text-[var(--az-text-muted)] hover:text-white'
                    }`}
                  >
                    🗑️ <span className="hidden xs:inline">{recState === 'cancelling' ? 'Release' : 'Cancel'}</span>
                  </button>

                  {/* Center: Live waveform animation */}
                  <div data-testid="recording-waveform" className="recording-waveform flex-grow flex items-center justify-center gap-1 px-4 max-w-xs h-8">
                    {recState === 'cancelling' ? (
                      <span className="text-[10px] text-red-500 animate-pulse">← Release to cancel</span>
                    ) : (
                      amplitudeData.map((h, i) => (
                        <span
                          key={i}
                          className={`w-0.5 rounded transition-all duration-75 ${
                            recState === 'cancelling' ? 'bg-gray-600' : 'bg-[var(--az-accent-primary)]'
                          }`}
                          style={{ height: `${h}px` }}
                        />
                      ))
                    )}
                  </div>

                  {/* Right: duration counter + mic/send button */}
                  <div className="flex items-center gap-3">
                    <span data-testid="recording-timer" className="recording-timer text-sm font-mono text-[var(--az-text-primary)]">
                      {Math.floor(recDuration / 60)}:{(recDuration % 60).toString().padStart(2, '0')}
                    </span>

                    {recState === 'locked' ? (
                      <button
                        onClick={handleSendRecording}
                        className="w-10 h-10 bg-[var(--az-accent-primary)] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
                      >
                        ✓
                      </button>
                    ) : (
                      <div className="relative">
                        {recDuration >= 3 && recState === 'recording' && (
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1a0a11] border border-[var(--az-accent-gold)] rounded px-1.5 py-0.5 text-[8px] text-[var(--az-accent-gold)] uppercase tracking-widest font-bold flex items-center gap-1 animate-bounce">
                            🔒 Locked
                          </div>
                        )}
                        <button
                          onMouseUp={handleMouseUp}
                          onTouchEnd={handleTouchEnd}
                          className="w-12 h-12 bg-[var(--az-accent-primary)] text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 animate-pulse"
                          style={{ transform: 'scale(1.2)' }}
                        >
                          🔴
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* IDLE normal layout */
                <div className="flex items-center gap-3 bg-[#150a12] rounded-full px-4 py-1.5 border border-[var(--az-border)] w-full">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="text-lg opacity-70 hover:opacity-100 transition-opacity p-1"
                  >
                    😀
                  </button>

                  {/* Image upload trigger */}
                  <label className="text-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer p-1">
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
                    className="flex-grow bg-transparent border-none outline-none text-sm text-[var(--az-text-primary)] py-2"
                  />

                  {/* Hold to record or release */}
                  <button
                    data-testid="mic-button"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onMouseUp={handleMouseUp}
                    onTouchEnd={handleTouchEnd}
                    className={`mic-button p-1 rounded-full transition-all ${
                      shakeMic ? 'animate-shake-mic' : ''
                    } opacity-70 hover:opacity-100 relative`}
                    title="Hold to record voice note"
                  >
                    🎙️
                    {showTooltip && (
                      <div className="absolute -top-10 right-0 bg-red-600 text-white text-[10px] font-bold rounded py-1 px-2 whitespace-nowrap animate-fadeIn shadow-lg z-50">
                        Hold to record
                      </div>
                    )}
                  </button>

                  <button
                    onClick={handleSendText}
                    className="w-8 h-8 bg-pink-600 hover:bg-pink-700 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-pink-500/20 active:scale-95 transition-all"
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
      {callState && (
        <div className="fixed inset-0 bg-black z-[10000] flex flex-col items-center justify-between p-8 text-center text-white">

          {/* Incoming Call Layout */}
          {callState === 'incoming' && (
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
                  className="w-16 h-16 bg-green-600 hover:bg-green-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform animate-bounce"
                >
                  ✓
                </button>
              </div>
            </div>
          )}

          {/* Outgoing Call Layout */}
          {callState === 'outgoing' && (
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

          {/* Active Call Layout with WebRTC Feeds */}
          {callState === 'active' && (
            <div className="relative w-full h-full flex flex-col justify-between">

              {/* Fullscreen remote feed */}
              <div className="absolute inset-0 bg-[#0f070c] flex items-center justify-center z-0">
                {callType === 'video' ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center">
                    <img src={selectedConv?.otherUser?.avatarUrl || FALLBACK_AVATAR} className="w-36 h-36 rounded-full object-cover border-4 border-pink-500 animate-pulse" />
                    {/* Animated voice amplitude waves */}
                    <div className="flex gap-1.5 justify-center items-end h-8 mt-6">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className="w-1.5 bg-pink-500 rounded animate-voiceBar" style={{ animationDelay: `${i * 0.1}s` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Picture-in-Picture Local Feed */}
              {callType === 'video' && (
                <div className="absolute top-4 right-4 w-28 h-36 bg-black border-2 border-pink-500 rounded-xl overflow-hidden z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Floating Top Info bar */}
              <div className="z-10 flex justify-between items-center bg-black/40 backdrop-blur-md p-4 rounded-xl mt-4">
                <div className="text-left">
                  <h4 className="font-bold text-sm">{selectedConv?.otherUser?.displayName}</h4>
                  <span className="text-[10px] text-yellow-400">💎 Live Credit Ticker</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-mono block">
                    {Math.floor(callDuration / 60).toString().padStart(2, '0')}:
                    {(callDuration % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-pink-300">Wallet balance: {creditsRemaining} 💎</span>
                </div>
              </div>

              {/* Floating Bottom Control bar */}
              <div className="z-10 flex justify-center gap-6 mb-4">
                <button
                  onClick={handleEndCall}
                  className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-red-500/20"
                >
                  🔴
                </button>
              </div>

            </div>
          )}

          {/* Call Ending Summary */}
          {callState === 'summary' && callSummary && (
            <div className="flex-grow flex flex-col items-center justify-center max-w-sm">
              <span className="text-5xl mb-4">⭐</span>
              <h2 className="text-2xl font-serif italic text-pink-300 mb-2">Call Summary</h2>
              <p className="text-xs text-gray-400 mb-6">Your private call has ended successfully.</p>

              <div className="w-full bg-[#160b13] border border-pink-500/20 rounded-xl p-4 space-y-3 mb-8">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Duration:</span>
                  <span className="font-bold">{callSummary.duration}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-pink-500/10 pt-3">
                  <span className="text-gray-400">Credits Charged:</span>
                  <span className="font-bold text-yellow-400">💎 {callSummary.cost}</span>
                </div>
              </div>

              <button
                onClick={() => setCallState(null)}
                className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-colors"
              >
                Close Summary
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default PrivateSext;
