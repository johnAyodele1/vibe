import React, { useState, useEffect, useRef } from "react";
import styles from "./DirectMessage.module.css";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";

// TODO: Use configurable backend URL for socket connection
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";

type CallStatus = "idle" | "calling" | "receiving" | "connected" | "ended";

interface Message {
  _id: string;
  content: string;
  messageType: string;
  sender: {
    _id: string;
    firstName: string;
    lastName: string;
    photos: {
      url: string;
      isMain: boolean;
    }[];
  };
  receiver: string;
  conversation: string;
  createdAt: string;
  isRead: boolean;
}

interface Conversation {
  _id: string;
  participants: string[];
  participantInfo: {
    user: {
      _id: string;
      firstName: string;
      lastName: string;
      photos: {
        url: string;
        isMain: boolean;
      }[];
      isOnline: boolean;
      lastActive: string;
    };
  }[];
}

const DirectMessage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Call state
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const isVideoCallRef = useRef(false);
  const isCallerRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const currentUserId = (user as any)?._id || "";
  const token = localStorage.getItem("accessToken");

  console.log("DirectMessage rendered with conversationId:", conversationId);

  // Synchronize body background color
  useEffect(() => {
    const originalColor = document.body.style.backgroundColor;
    const messengerColor = getComputedStyle(document.documentElement).getPropertyValue('--background-messenger').trim();
    if (messengerColor) {
      document.body.style.backgroundColor = messengerColor;
    }
    return () => {
      document.body.style.backgroundColor = originalColor;
    };
  }, []);

  // Get the other participant
  const otherParticipant = conversation?.participantInfo.find((p) =>
    p.user._id?.toString()
      ? p.user._id.toString() !== currentUserId
      : String(p.user._id) !== currentUserId,
  )?.user;

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup typing timeout on unmount or conversation change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId]);

  // FIXED: Bind local stream to video/audio elements whenever it changes
  useEffect(() => {
    if (localStream) {
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = localStream;
        console.log("Bound local stream to audio element");
      }
      if (localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = localStream;
        console.log("Bound local stream to video element");
      }
    }
  }, [localStream, isVideoCall]);

  // FIXED: Bind remote stream to video/audio elements whenever it changes
  useEffect(() => {
    if (remoteStream) {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        console.log("Bound remote stream to audio element");
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        console.log("Bound remote stream to video element");
      }
    }
  }, [remoteStream]);

  // Initialize socket connection
  useEffect(() => {
    if (!socket || !conversationId || !token) return;

    socket.emit("join:conversation", { conversationId });

    const handleMessage = (message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) {
          return prev;
        }
        return [...prev, message];
      });
    };

    const handleTyping = ({ userId }: { userId: string }) => {
      if (userId !== currentUserId) {
        setTypingUser(userId);
        setIsTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setTypingUser(null);
          setIsTyping(false);
        }, 2000);
      }
    };

    const handleStopTyping = ({ userId }: { userId: string }) => {
      if (userId !== currentUserId) {
        setTypingUser(null);
        setIsTyping(false);
      }
    };

    const handleUserStatus = ({ userId, isOnline }: { userId: string, isOnline: boolean }) => {
      setConversation(prev => {
        if (!prev) return prev;
        const updatedParticipantInfo = prev.participantInfo.map(p => {
          if (p.user._id === userId) {
            return {
              ...p,
              user: { ...p.user, isOnline }
            };
          }
          return p;
        });
        return {
          ...prev,
          participantInfo: updatedParticipantInfo
        };
      });
    };

    const handleCallOffer = async (data: any) => {
      console.log("Received call offer:", data);
      isVideoCallRef.current = data.isVideoCall || false;
      setIncomingOffer(data);
      setIsVideoCall(data.isVideoCall || false);
      setCallStatus("receiving");
    };

    const handleCallAnswer = async (data: any) => {
      console.log("Received call answer:", data);
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          const pendingCandidates = pendingCandidatesRef.current;
          for (const candidate of pendingCandidates) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.error("Error adding queued ICE candidate:", e);
            }
          }
          pendingCandidatesRef.current = [];
        } catch (e) {
          console.error("Error setting remote description:", e);
        }
      }
    };

    const handleIceCandidate = async (data: any) => {
      console.log("Received ICE candidate:", data);
      const pc = peerConnectionRef.current;
      if (pc) {
        const candidate = new RTCIceCandidate(data.candidate);
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.error("Error adding ICE candidate:", e);
          }
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      }
    };

    const handleCallEnd = () => {
      console.log("Remote peer ended the call");
      endCall();
    };

    socket.on("message", handleMessage);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("user:status", handleUserStatus);
    socket.on("call:offer", handleCallOffer);
    socket.on("call:answer", handleCallAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);
    socket.on("call:end", handleCallEnd);

    return () => {
      socket.off("message", handleMessage);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("user:status", handleUserStatus);
      socket.off("call:offer", handleCallOffer);
      socket.off("call:answer", handleCallAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      socket.off("call:end", handleCallEnd);
    };
  }, [socket, conversationId, token]);

  // Fetch conversation and messages
  useEffect(() => {
    const fetchData = async () => {
      if (!conversationId || !token) return;

      try {
        // Fetch messages
        const messagesResponse = await fetch(
          `${API_BASE_URL}/messages/${conversationId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const messagesData = await messagesResponse.json();
        if (messagesData.success) {
          setMessages(messagesData.data.messages);
        }

        // Fetch conversation details
        const convResponse = await fetch(
          `${API_BASE_URL}/messages/conversation/${conversationId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const convData = await convResponse.json();
        if (convData.success) {
          setConversation(convData.data.conversation);
        }
      } catch (error) {
        console.error("Error fetching conversation data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [conversationId, token]);

  const sendMessage = async () => {
    if (!inputValue.trim() || !conversation || !otherParticipant || !token)
      return;

    try {
      const response = await fetch(`${API_BASE_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: otherParticipant._id,
          content: inputValue,
          messageType: "text",
        }),
      });

      const data = await response.json();
      if (data.success) {
        setInputValue("");
        // Optimistically add the message to the UI immediately
        setMessages((prev) => [...prev, data.data.message]);
        // Emit socket event to notify receiver in real-time
        if (socket) {
          socket.emit("message", data.data.message);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (!socket || !conversationId || !currentUserId) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.trim()) {
      // Emit typing event when there's text
      socket.emit("typing", { conversationId, userId: currentUserId });

      // Set timeout to stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stopTyping", { conversationId, userId: currentUserId });
      }, 2000);
    } else {
      // Stop typing immediately when input is cleared
      socket.emit("stopTyping", { conversationId, userId: currentUserId });
    }
  };

  // FIXED: Simplified peer connection creation
  const createPeerConnection = () => {
    // Always create a fresh PC per call
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: "turn:free.expressturn.com:3478",
          username: "000000002085505077",
          credential: "rdWeUE3lAtTerYhl+nWzD+H81oM=",
        },
      ],
    });

    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log("Sending ICE candidate:", event.candidate);
        socket.emit("call:ice-candidate", {
          conversationId,
          candidate: event.candidate,
        });
      }
    };

    // FIXED: Simplified ontrack - just update state, let useEffect handle binding
    pc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind, event.streams[0]);
      const incomingStream = event.streams[0];

      // Update state - useEffect will handle the binding
      setRemoteStream(incomingStream);
      console.log("Remote stream state updated");
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        console.log("Peer connection established");
        setCallStatus("connected");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        console.log("Peer connection failed/disconnected");
        setCallStatus("ended");
      }
    };

    // Additional debugging
    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log("ICE gathering state:", pc.iceGatheringState);
    };

    return pc;
  };

  const startCall = async (videoCall = false) => {
    // Guard against duplicate offers
    if (callStatus !== "idle") {
      console.log("Call already in progress, ignoring start call");
      return;
    }

    try {
      // Set caller role and video mode
      isCallerRef.current = true;
      setIsVideoCall(videoCall);
      isVideoCallRef.current = videoCall;

      // Get user media first
      const constraints = videoCall
        ? { audio: true, video: { width: 640, height: 480 } }
        : { audio: true };

      console.log("Requesting user media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log(
        "Local stream obtained:",
        stream.getTracks().map((t) => `${t.kind} (${t.id})`),
      );

      // Update state - useEffect will handle binding
      setLocalStream(stream);

      // Create peer connection and add tracks
      const pc = createPeerConnection();

      // Add all tracks to the peer connection
      stream.getTracks().forEach((track) => {
        console.log("Adding track to peer connection:", track.kind, track.id);
        pc.addTrack(track, stream);
      });

      // Now create the offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallStatus("calling");

      console.log("Sending offer to remote peer");
      if (socket) {
        socket.emit("call:offer", {
          conversationId,
          offer: offer,
          isVideoCall: videoCall,
        });
      }
    } catch (error) {
      console.error("Error starting call:", error);
      toast.error(`Failed to start ${videoCall ? "video" : "audio"} call`);
      setCallStatus("idle");
    }
  };

  const handleCallAnswer = async () => {
    // Guard against duplicate answers
    if (callStatus !== "receiving" || !incomingOffer) {
      console.log(
        "Not in receiving state or no incoming offer, ignoring answer",
      );
      return;
    }

    try {
      // Set callee role
      isCallerRef.current = false;
      const videoCall = isVideoCallRef.current;

      // Get user media first
      const constraints = videoCall
        ? { audio: true, video: { width: 640, height: 480 } }
        : { audio: true };

      console.log("Answerer requesting user media:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log(
        "Answerer local stream obtained:",
        stream.getTracks().map((t) => `${t.kind} (${t.id})`),
      );

      // Update state - useEffect will handle binding
      setLocalStream(stream);

      // Create peer connection
      const pc = createPeerConnection();

      // Add tracks BEFORE setting remote description
      stream.getTracks().forEach((track) => {
        console.log("Answerer adding track:", track.kind, track.id);
        pc.addTrack(track, stream);
      });

      // Set remote description from the offer
      console.log("Setting remote description from offer");
      await pc.setRemoteDescription(
        new RTCSessionDescription(incomingOffer.offer),
      );

      // Create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log("Sending answer to remote peer");
      if (socket) {
        socket.emit("call:answer", {
          conversationId,
          answer: answer,
        });
      }

      // Clear incoming offer
      setIncomingOffer(null);
    } catch (error) {
      console.error("Error answering call:", error);
      toast.error("Failed to answer call");
      setCallStatus("idle");
    }
  };

  const endCall = () => {
    // Notify remote peer that call is ending
    if (socket && callStatus !== "idle" && callStatus !== "ended") {
      socket.emit("call:end", { conversationId });
    }

    // Stop all local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        console.log("Stopped local track:", track.kind);
      });
      setLocalStream(null);
    }

    // Clear remote stream
    setRemoteStream(null);

    // Clear all media element srcObjects to prevent resource leaks
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset all refs
    isVideoCallRef.current = false;
    isCallerRef.current = false;
    pendingCandidatesRef.current = [];

    setCallStatus("ended");
    setIncomingOffer(null);
    setIsVideoCall(false);
    setTimeout(() => setCallStatus("idle"), 1000);
  };

  // Call timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (callStatus === "connected" && callStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor(
          (now.getTime() - callStartTime.getTime()) / 1000,
        );
        setCallDuration(diff);
      }, 1000);
    } else {
      setCallDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus, callStartTime]);

  // Update call start time when connected
  useEffect(() => {
    if (callStatus === "connected" && !callStartTime) {
      setCallStartTime(new Date());
    } else if (callStatus !== "connected") {
      setCallStartTime(null);
    }
  }, [callStatus, callStartTime]);

  // Format call duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Ringtone functionality using Web Audio API
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const playRingtone = () => {
    if (ringtoneIntervalRef.current) return; // Already playing

    const playBeep = () => {
      try {
        const audioContext =
          ringtoneContextRef.current ||
          new (window.AudioContext || (window as any).webkitAudioContext)();

        if (!ringtoneContextRef.current) {
          ringtoneContextRef.current = audioContext;
        }

        // Resume audio context if suspended (required by some browsers)
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5,
        );

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (error) {
        console.error("Error playing ringtone:", error);
      }
    };

    // Play double beep pattern every 3 seconds
    const playRingPattern = () => {
      playBeep();
      setTimeout(() => {
        playBeep();
      }, 300);
    };

    playRingPattern();
    ringtoneIntervalRef.current = setInterval(playRingPattern, 3000);
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    // Close audio context to free resources
    if (
      ringtoneContextRef.current &&
      ringtoneContextRef.current.state !== "closed"
    ) {
      ringtoneContextRef.current.close();
      ringtoneContextRef.current = null;
    }
  };

  // Handle ringtone when call status changes
  useEffect(() => {
    if (callStatus === "receiving") {
      playRingtone();
    } else {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [callStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
      stopRingtone();
    };
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
      `}</style>

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.leftSection}>
              <button
                className={styles.backBtn}
                onClick={() => navigate("/chat")}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "20px" }}
                >
                  arrow_back_ios_new
                </span>
              </button>

              <div className={styles.profileContainer}>
                <div
                  className={styles.avatar}
                  style={{
                    backgroundImage: `url("${
                      otherParticipant?.photos.find((p) => p.isMain)?.url ||
                      "https://via.placeholder.com/150"
                    }")`,
                  }}
                />
                {otherParticipant && (
                  <div className={styles.onlineBadgeWrapper}>
                    <div
                      className={`${styles.statusDot} ${
                        otherParticipant.isOnline
                          ? styles.onlineDot
                          : styles.offlineDot
                      }`}
                      aria-label={
                        otherParticipant.isOnline ? "Online" : "Offline"
                      }
                    ></div>
                  </div>
                )}
              </div>

              <div className={styles.userInfo}>
                <h1 className={styles.userName}>
                  {otherParticipant
                    ? `${otherParticipant.firstName} ${otherParticipant.lastName}`
                    : "Loading..."}
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "16px",
                      color: "#f42559",
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    verified
                  </span>
                </h1>
                <span
                  className={`${styles.userStatus} ${
                    otherParticipant?.isOnline
                      ? styles.onlineStatus
                      : styles.offlineStatus
                  }`}
                >
                  {otherParticipant?.isOnline ? "Online Now" : "Offline"}
                </span>
              </div>
            </div>

            <div className={styles.actions}>
              <button
                className={`${styles.iconBtn} ${styles.btnSecondary}`}
                onClick={() => startCall(false)}
                disabled={callStatus !== "idle"}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontWeight: 300 }}
                >
                  call
                </span>
              </button>
              <button
                className={`${styles.iconBtn} ${styles.btnPrimary}`}
                onClick={() => startCall(true)}
                disabled={callStatus !== "idle"}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  videocam
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className={styles.chatStream} id="chat-container">
          {loading ? (
            <div style={{ padding: "20px", textAlign: "center" }}>
              Loading messages...
            </div>
          ) : (
            <>
              <div className={styles.dateDivider}>
                <span className={styles.datePill}>Today</span>
              </div>

              {messages.map((msg) => {
                const isSentByMe = msg.sender._id === currentUserId;
                const time = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={msg._id}
                    className={`${styles.messageRow} ${
                      isSentByMe ? styles.sent : ""
                    }`}
                  >
                    {!isSentByMe && (
                      <div
                        className={styles.msgAvatarSmall}
                        style={{
                          backgroundImage: `url("${
                            msg.sender.photos.find((p) => p.isMain)?.url ||
                            "https://via.placeholder.com/150"
                          }")`,
                        }}
                      />
                    )}

                    <div className={styles.msgContentWrapper}>
                      <div
                        className={`${styles.bubble} ${
                          isSentByMe ? styles.bubbleSent : styles.bubbleReceived
                        }`}
                      >
                        <p>{msg.content}</p>
                      </div>

                      <span className={styles.timestamp}>
                        {time}
                        {isSentByMe && msg.isRead && (
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "12px", color: "#f42559" }}
                          >
                            done_all
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isTyping &&
                conversation &&
                typingUser === otherParticipant?._id && (
                  <div className={styles.messageRow}>
                    <div
                      className={styles.msgAvatarSmall}
                      style={{
                        backgroundImage: `url("${
                          otherParticipant?.photos.find((p) => p.isMain)?.url ||
                          "https://via.placeholder.com/150"
                        }")`,
                      }}
                    />
                    <div className={styles.msgContentWrapper}>
                      <div className={styles.bubbleReceived}>
                        <div className={styles.typingBubble}>
                          <span className={styles.typingDot}></span>
                          <span className={styles.typingDot}></span>
                          <span className={styles.typingDot}></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </>
          )}
        </main>

        <footer className={styles.footer}>
          <div className={styles.inputBar}>
            <button
              className={styles.utilityBtn}
              onClick={() => toast("Add attachment feature coming soon!")}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px" }}
              >
                add_circle
              </span>
            </button>

            <div className={styles.inputFieldWrapper}>
              <input
                className={styles.inputField}
                type="text"
                placeholder="Message..."
                value={inputValue}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
              />
            </div>

            <div className={styles.actionGroup}>
              <button
                className={styles.cameraBtn}
                onClick={() => toast("Camera feature coming soon!")}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "22px" }}
                >
                  photo_camera
                </span>
              </button>
              <button
                className={styles.sendBtn}
                onClick={sendMessage}
                disabled={!inputValue.trim()}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "20px", marginLeft: "2px" }}
                >
                  arrow_upward
                </span>
              </button>
            </div>
          </div>
        </footer>

        {/* Call Overlay */}
        {callStatus !== "idle" && (
          <div className={styles.callOverlay}>
            <div className={styles.callContainer}>
              {isVideoCall && callStatus === "connected" ? (
                <div className={styles.videoContainer}>
                  <div className={styles.remoteVideoWrapper}>
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={styles.remoteVideo}
                    />

                    <div className={styles.callInfoOverlay}>
                      <p className={styles.callStatusText}>
                        {formatDuration(callDuration)}
                      </p>
                    </div>

                    <div className={styles.localVideoWrapper}>
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={styles.localVideo}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.callHeader}>
                  <div className={styles.callAvatar}>
                    <div
                      className={styles.callAvatarImg}
                      style={{
                        backgroundImage: `url("${
                          otherParticipant?.photos.find((p) => p.isMain)?.url ||
                          "https://via.placeholder.com/150"
                        }")`,
                      }}
                    />
                  </div>
                  <div className={styles.callInfo}>
                    <h3 className={styles.callName}>
                      {otherParticipant
                        ? `${otherParticipant.firstName} ${otherParticipant.lastName}`
                        : "Unknown"}
                    </h3>
                    <p className={styles.callStatusText}>
                      {callStatus === "calling" && "Calling..."}
                      {callStatus === "receiving" &&
                        `Incoming ${isVideoCall ? "video" : "audio"} call...`}
                      {callStatus === "connected" &&
                        formatDuration(callDuration)}
                      {callStatus === "ended" && "Call ended"}
                    </p>
                  </div>
                </div>
              )}

              <div className={styles.callControls}>
                {callStatus === "receiving" ? (
                  <>
                    <button
                      className={`${styles.callBtn} ${styles.declineBtn}`}
                      onClick={endCall}
                    >
                      <span className="material-symbols-outlined">
                        call_end
                      </span>
                    </button>
                    <button
                      className={`${styles.callBtn} ${styles.acceptBtn}`}
                      onClick={handleCallAnswer}
                    >
                      <span className="material-symbols-outlined">
                        {isVideoCall ? "videocam" : "call"}
                      </span>
                    </button>
                  </>
                ) : (
                  <button
                    className={`${styles.callBtn} ${styles.hangupBtn}`}
                    onClick={endCall}
                  >
                    <span className="material-symbols-outlined">call_end</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hidden audio elements */}
        <audio ref={localAudioRef} muted autoPlay />
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </>
  );
};

export default DirectMessage;
