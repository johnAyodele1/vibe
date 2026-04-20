import React, { useState, useEffect } from "react";
import styles from "./ChatInterface.module.css";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import BottomNavigation from "../BottomNavigation/BottomNavigation";

interface Match {
  _id: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    age: number;
    photos: {
      url: string;
      isMain: boolean;
    }[];
    isOnline: boolean;
    lastActive: string;
  };
  matchedAt: string;
  isActive: boolean;
  isNew?: boolean;
}

interface Conversation {
  _id: string;
  participants: string[];
  lastMessage: {
    _id: string;
    content: string;
    messageType: string;
    createdAt: string;
    sender: {
      _id: string;
      firstName: string;
      lastName: string;
    };
  };
  lastMessageAt: string;
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
  unreadCount: { [key: string]: number };
}

const ChatInterface: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Synchronize body background color
  useEffect(() => {
    if (isDarkMode) {
      const originalColor = document.body.style.backgroundColor;
      const discoveryColor = getComputedStyle(document.documentElement).getPropertyValue('--background-discovery').trim();
      if (discoveryColor) {
        document.body.style.backgroundColor = discoveryColor;
      }
      return () => {
        document.body.style.backgroundColor = originalColor;
      };
    }
  }, [isDarkMode]);

  // Fetch matches and conversations
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        // Fetch matches
        const matchesResponse = await fetch(`${API_BASE_URL}/matches`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const matchesData = await matchesResponse.json();
        if (matchesData.success) {
          // Mark matches from last 24 hours as new
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const processedMatches = matchesData.data.matches.map(
            (match: Match) => ({
              ...match,
              isNew: new Date(match.matchedAt) > oneDayAgo,
            }),
          );
          setMatches(processedMatches);
        }

        // Fetch conversations
        const conversationsResponse = await fetch(
          `${API_BASE_URL}/messages/conversations`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const conversationsData = await conversationsResponse.json();
        if (conversationsData.success) {
          setConversations(conversationsData.data.conversations);
        }
      } catch (error) {
        console.error("Error fetching chat data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Listen for real-time status updates
  useEffect(() => {
    if (!socket) return;

    const handleStatusUpdate = ({ userId, isOnline }: { userId: string, isOnline: boolean }) => {
      const targetId = String(userId);

      // Update matches
      setMatches(prevMatches =>
        prevMatches.map(match =>
          String(match.user._id) === targetId
            ? { ...match, user: { ...match.user, isOnline } }
            : match
        )
      );

      // Update conversations
      setConversations(prevConversations =>
        prevConversations.map(conv => {
          const updatedParticipantInfo = conv.participantInfo.map(p =>
            String(p.user._id) === targetId
              ? { ...p, user: { ...p.user, isOnline } }
              : p
          );
          return { ...conv, participantInfo: updatedParticipantInfo };
        })
      );
    };

    socket.on("user:status", handleStatusUpdate);

    return () => {
      socket.off("user:status", handleStatusUpdate);
    };
  }, [socket]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
      `}</style>

      <div className={`${styles.container} ${isDarkMode ? styles.dark : ""}`}>
        <header className={styles.header}>
          <h2 className={styles.title}>Messages</h2>
          <button
            className={styles.tuneButton}
            onClick={() => {
              setIsDarkMode(!isDarkMode);
              toast.info("Theme toggled successfully!");
            }}
            aria-label="Toggle Theme"
          >
            <span className="material-symbols-outlined">tune</span>
          </button>
        </header>

        <main className={styles.main}>
          <div className={styles.searchContainer}>
            <div className={styles.searchWrapper}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search matches..."
              />
            </div>
          </div>

          <section>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>New Matches</h3>
              <span className={styles.badge}>
                {matches.filter((m) => m.isNew).length} New
              </span>
            </div>

            <div className={styles.matchesScroll}>
              {loading ? (
                <div style={{ padding: "20px", textAlign: "center" }}>
                  Loading...
                </div>
              ) : matches.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center" }}>
                  No matches yet
                </div>
              ) : (
                matches.map((match) => (
                  <div key={match._id} className={styles.matchItem}>
                    <div
                      className={`${styles.avatarRing} ${
                        match.isNew ? styles.ringActive : ""
                      }`}
                    >
                      <div className={styles.matchAvatarWrapper}>
                        <div className={styles.avatarContainer}>
                          <img
                            src={
                              match.user.photos.find((p) => p.isMain)?.url ||
                              "https://via.placeholder.com/150"
                            }
                            alt={match.user.firstName}
                            className={styles.avatarImg}
                          />
                        </div>
                        <span
                          className={`${styles.statusIndicatorSmall} ${
                            match.user.isOnline ? styles.online : styles.offline
                          }`}
                          aria-label={
                            match.user.isOnline ? "Online" : "Offline"
                          }
                        />
                      </div>
                    </div>
                    <span
                      className={`${styles.matchName} ${
                        !match.isNew ? styles.matchNameRead : ""
                      }`}
                    >
                      {match.user.firstName} {match.user.lastName},{" "}
                      {match.user.age}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.messageList}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Recent Messages</h3>
            </div>

            {loading ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                No conversations yet
              </div>
            ) : (
              conversations.map((conversation) => {
                // Get current user ID
                const currentUserId = (user as any)?._id || "";
                const otherParticipantInfo = conversation.participantInfo.find(
                  (p) =>
                    p.user._id?.toString()
                      ? p.user._id.toString() !== currentUserId
                      : String(p.user._id) !== currentUserId,
                );
                const otherParticipant = otherParticipantInfo?.user;
                const unreadCount =
                  conversation.unreadCount[currentUserId] || 0;
                const lastMessage = conversation.lastMessage;
                const timeAgo = new Date(
                  conversation.lastMessageAt,
                ).toLocaleDateString();

                if (!otherParticipant) return null;

                return (
                  <div
                    key={conversation._id}
                    className={styles.messageItem}
                    onClick={() => {
                      toast.success(
                        `Opening chat with ${otherParticipant.firstName}`,
                      );
                      navigate(`/direct-message/${conversation._id}`);
                    }}
                  >
                    <div className={styles.messageAvatarWrapper}>
                      <div className={styles.messageAvatar}>
                        <img
                          src={
                            otherParticipant.photos.find((p: any) => p.isMain)
                              ?.url || "https://via.placeholder.com/150"
                          }
                          alt={otherParticipant.firstName}
                          className={styles.avatarImg}
                        />
                      </div>
                      <span
                        className={`${styles.statusIndicator} ${otherParticipant.isOnline ? styles.online : styles.offline}`}
                        aria-label={otherParticipant.isOnline ? "Online" : "Offline"}
                      />
                    </div>

                    <div className={styles.messageContent}>
                      <div className={styles.messageHeader}>
                        <h3 className={styles.userName}>
                          {otherParticipant.firstName}{" "}
                          {otherParticipant.lastName}
                        </h3>
                        <span className={styles.time}>{timeAgo}</span>
                      </div>

                      <div className={styles.messageFooter}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            overflow: "hidden",
                          }}
                        >
                          {lastMessage?.messageType === "photo" && (
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "16px", color: "#64748b" }}
                            >
                              photo_camera
                            </span>
                          )}
                          <p className={styles.lastMessage}>
                            {lastMessage?.content || "Start a conversation!"}
                          </p>
                        </div>

                        {unreadCount > 0 && (
                          <span className={styles.unreadCount}>
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <div className={styles.ctaContainer}>
            <p className={styles.ctaText}>You're all caught up!</p>
            <button
              className={styles.ctaButton}
              onClick={() => {
                toast("Keep swiping!");
                navigate("/discovery");
              }}
            >
              Keep Swiping
            </button>
          </div>
        </main>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab="chat" />
      </div>
    </>
  );
};

export default ChatInterface;
