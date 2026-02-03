import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../contexts/AuthContext";
import io from "socket.io-client";
import CallModal from "../CallModal/CallModal";

interface IncomingCall {
  conversationId: string;
  offer: any;
  isVideoCall: boolean;
  callerName: string;
  callerImage: string;
}

const CallManager: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [showModal, setShowModal] = useState(false);

  const currentUserId = (user as any)?._id || "";
  const token = localStorage.getItem("accessToken");

  // Initialize socket connection for global call listening
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // Determine socket URL - use direct backend connection for mobile/external access
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const socketUrl = isLocalhost
      ? undefined
      : `${window.location.protocol}//${window.location.hostname}:5000`;

    const newSocket = io(socketUrl, {
      auth: { token },
    });

    newSocket.on("connect", () => {
      console.log("Global call socket connected");
    });

    // Listen for incoming calls
    newSocket.on("call:offer", async (data: any) => {
      console.log("Global call offer received:", data);

      // If we're already on the direct message page for this conversation, let DirectMessage handle it
      const currentPath = location.pathname;
      const isOnDMPage =
        currentPath.startsWith("/direct-message/") &&
        currentPath.includes(data.conversationId);

      if (isOnDMPage) {
        console.log("Already on DM page, ignoring global call handler");
        return;
      }

      // Fetch caller info
      try {
        const response = await fetch(
          `${API_BASE_URL}/messages/conversation/${data.conversationId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const convData = await response.json();

        if (convData.success) {
          const otherParticipant =
            convData.data.conversation.participantInfo.find(
              (p: any) => p.user._id !== currentUserId,
            )?.user;

          if (otherParticipant) {
            setIncomingCall({
              conversationId: data.conversationId,
              offer: data.offer,
              isVideoCall: data.isVideoCall || false,
              callerName: `${otherParticipant.firstName} ${otherParticipant.lastName}`,
              callerImage:
                otherParticipant.photos?.find((p: any) => p.isMain)?.url ||
                "https://via.placeholder.com/100",
            });
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error("Error fetching caller info:", error);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, token, location.pathname, currentUserId]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;

    setShowModal(false);
    // Navigate to DM page - the DirectMessage component will handle the call setup
    navigate(`/direct-message/${incomingCall.conversationId}`);
    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    setShowModal(false);
    setIncomingCall(null);
    toast.info("Call declined");
  };

  return (
    <>
      <CallModal
        isOpen={showModal}
        callerName={incomingCall?.callerName || ""}
        callerImage={
          incomingCall?.callerImage || "https://via.placeholder.com/100"
        }
        isVideoCall={incomingCall?.isVideoCall || false}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />
    </>
  );
};

export default CallManager;
