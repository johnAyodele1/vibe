import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
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
  const { socket } = useSocket();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [showModal, setShowModal] = useState(false);

  const currentUserId = (user as any)?._id || "";
  const token = localStorage.getItem("accessToken");

  // Initialize socket connection for global call listening
  useEffect(() => {
    if (!socket || !isAuthenticated || !token) return;

    const handleCallOffer = async (data: any) => {
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
            convData.data.conversation.participantInfo.find((p: any) => {
              const participantId = p.user?._id;
              if (!participantId) return false;
              return String(participantId) !== currentUserId;
            })?.user;

          if (otherParticipant) {
            setIncomingCall({
              conversationId: data.conversationId,
              offer: data.offer,
              isVideoCall: data.isVideoCall || false,
              callerName: `${otherParticipant.firstName} ${otherParticipant.lastName}`,
              callerImage:
                otherParticipant.photos?.find((p: any) => p.isMain)?.url ||
                "/placeholder.svg",
            });
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error("Error fetching caller info:", error);
      }
    };

    const handleCallEnd = (data: any) => {
      if (incomingCall && incomingCall.conversationId === data.conversationId) {
        setShowModal(false);
        setIncomingCall(null);
      }
    };

    const handleCallReject = (data: any) => {
      if (incomingCall && incomingCall.conversationId === data.conversationId) {
        setShowModal(false);
        setIncomingCall(null);
      }
    };

    socket.on("call:offer", handleCallOffer);
    socket.on("call:end", handleCallEnd);
    socket.on("call:reject", handleCallReject);

    return () => {
      socket.off("call:offer", handleCallOffer);
      socket.off("call:end", handleCallEnd);
      socket.off("call:reject", handleCallReject);
    };
  }, [socket, isAuthenticated, token, location.pathname, currentUserId]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;

    setShowModal(false);
    // Navigate to DM page - the DirectMessage component will handle the call setup
    navigate(`/direct-message/${incomingCall.conversationId}`);
    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    if (incomingCall && socket) {
      socket.emit("call:reject", { conversationId: incomingCall.conversationId });
    }
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
          incomingCall?.callerImage || "/placeholder.svg"
        }
        isVideoCall={incomingCall?.isVideoCall || false}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />
    </>
  );
};

export default CallManager;

