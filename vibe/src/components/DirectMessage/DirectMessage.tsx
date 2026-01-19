import React, { useState, useEffect, useRef } from "react";
import styles from "./DirectMessage.module.css";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";

// TODO: Use configurable backend URL for socket connection
import { useAuth } from "../../contexts/AuthContext";
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
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

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

    const newSocket = io({
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
      setCallStatus("receiving");
      // Store the offer data for when user accepts
      (window as any).pendingCallOffer = data;
    });

    newSocket.on("call:answer", async (data: any) => {
      console.log("Received call answer:", data);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer),
        );
        // Connection state will be handled by onconnectionstatechange
      }
    });

    newSocket.on("call:ice-candidate", async (data: any) => {
      console.log("Received ICE candidate:", data);
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
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

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      setPeerConnection(pc);

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
        });
      }
    } catch (error) {
      console.error("Error starting call:", error);
      toast.error("Failed to start call");
    }
  };

  const handleCallAnswer = async (data: any) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      setPeerConnection(pc);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket) {
        socket.emit("call:answer", {
          conversationId,
          answer: answer,
        });
      }
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
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }
    setCallStatus("ended");
    setTimeout(() => setCallStatus("idle"), 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
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
                onClick={startCall}
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
                onClick={() => toast("Video call feature coming soon!")}
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
                    {callStatus === "receiving" && "Incoming call..."}
                    {callStatus === "connected" && "Connected"}
                    {callStatus === "ended" && "Call ended"}
                  </p>
                </div>
              </div>

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
                      onClick={() =>
                        handleCallAnswer((window as any).pendingCallOffer)
                      }
                    >
                      <span className="material-symbols-outlined">call</span>
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
