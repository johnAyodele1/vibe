import React, { useState, useEffect, useRef } from "react";
import styles from "./DirectMessage.module.css";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";

// TODO: Use configurable backend URL for socket connection
import { useAuth } from "../../contexts/AuthContext";
import { SOCKET_URL } from "../../config";
import io, { Socket } from "socket.io-client";

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
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Call state
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
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

  // Get the other participant
  const otherParticipant = conversation?.participantInfo.find(
    (p) => p.user._id !== currentUserId,
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

  // Initialize socket connection
  useEffect(() => {
    if (!conversationId || !token) return;

    // Use configured socket URL for proper backend connection
    const socketUrl = SOCKET_URL;

    const newSocket = io(socketUrl, {
      auth: { token },
    });

    newSocket.on("connect", () => {
      console.log("Connected to socket");
      newSocket.emit("join:conversation", { conversationId });
    });

    newSocket.on("message", (message: Message) => {
      setMessages((prev) => {
        // Avoid duplicates by checking if message already exists
        if (prev.some((m) => m._id === message._id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    newSocket.on("typing", ({ userId }: { userId: string }) => {
      if (userId !== currentUserId) {
        setTypingUser(userId);
        setIsTyping(true);
        // Clear previous timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        // Set timeout to clear typing indicator after 2 seconds
        typingTimeoutRef.current = setTimeout(() => {
          setTypingUser(null);
          setIsTyping(false);
        }, 2000);
      }
    });

    newSocket.on("stopTyping", ({ userId }: { userId: string }) => {
      if (userId !== currentUserId) {
        setTypingUser(null);
        setIsTyping(false);
      }
    });

    // Call event listeners
    newSocket.on("call:offer", async (data: any) => {
      console.log("Received call offer:", data);
      setIncomingOffer(data);
      setIsVideoCall(data.isVideoCall || false);
      setCallStatus("receiving");
    });

    newSocket.on("call:answer", async (data: any) => {
      console.log("Received call answer:", data);
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log("Set remote description for answer");
          setCallStatus("connected");
        } catch (e) {
          console.error("Error setting remote description:", e);
        }
      }
    });

    newSocket.on("call:ice-candidate", async (data: any) => {
      console.log("Received ICE candidate:", data);
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log("Added ICE candidate");
        } catch (e) {
          console.error("Error adding ICE candidate:", e);
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [conversationId, token]);

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

  // WebRTC functions
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("call:ice-candidate", {
          conversationId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track:", event.streams[0]);
      setRemoteStream(event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      if (remoteVideoRef.current && isVideoCall) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setCallStatus("connected");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        setCallStatus("ended");
      }
    };

    return pc;
  };

  const startCall = async (videoCall = false) => {
    try {
      setIsVideoCall(videoCall);
      const constraints = videoCall
        ? { audio: true, video: { width: 640, height: 480 } }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }
      if (localVideoRef.current && videoCall) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallStatus("calling");

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
    }
  };

  const handleCallAnswer = async () => {
    if (!incomingOffer) return;

    try {
      const constraints = isVideoCall
        ? { audio: true, video: { width: 640, height: 480 } }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }
      if (localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(
        new RTCSessionDescription(incomingOffer.offer),
      );

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket) {
        socket.emit("call:answer", {
          conversationId,
          answer: answer,
        });
      }

      setCallStatus("connected");
    } catch (error) {
      console.error("Error answering call:", error);
      toast.error("Failed to answer call");
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
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
                {otherParticipant?.isOnline && (
                  <div className={styles.onlineBadgeWrapper}>
                    <div className={styles.onlineDot}></div>
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
                <span className={styles.userStatus}>
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
