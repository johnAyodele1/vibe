import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import styles from "./Discovery.module.css";
import { API_BASE_URL } from "../../config";
import BottomNavigation from "../BottomNavigation/BottomNavigation";

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  age: number;
  photos: {
    url: string;
    isMain: boolean;
    order: number;
    uploadedAt: string;
  }[];
  bio: string;
  location: {
    city?: string;
    state?: string;
  };
  interests: string[];
  lastActive: string;
}

const Discovery: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const [loadingAction, setLoadingAction] = useState<
    null | "like" | "dislike" | "super"
  >(null);
  const [actionSuccess, setActionSuccess] = useState<
    null | "like" | "dislike" | "super"
  >(null);
  // Fetch users from backend
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/users/discover`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        console.log("Discovered users:", data.data.users);
        if (data.success) {
          setUsers(data.data.users);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const currentProfile = users[currentProfileIndex];
  const nextProfile = users[(currentProfileIndex + 1) % users.length];

  const handleSwipeStart = (clientX: number) => {
    setIsDragging(true);
    setDragStartX(clientX);
    setDragOffset(0);
  };

  const handleSwipeMove = (clientX: number) => {
    if (!isDragging) return;
    const offset = clientX - dragStartX;
    setDragOffset(offset);
  };

  const handleSwipeEnd = () => {
    if (!isDragging) return;

    const threshold = 100; // Minimum swipe distance
    if (Math.abs(dragOffset) > threshold) {
      // Swipe detected
      if (dragOffset > 0) {
        // Swipe right - like
        handleLike();
      } else {
        // Swipe left - dislike
        handleDislike();
      }
    }

    setIsDragging(false);
    setDragOffset(0);
  };

  const handleLike = async () => {
    if (!currentProfile) return;
    setLoadingAction("like");
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `${API_BASE_URL}/users/${currentProfile._id}/like`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();
      if (data.success) {
        setActionSuccess("like");
        setTimeout(() => {
          setActionSuccess(null);
        }, 1000);
        setTimeout(() => {
          setCurrentProfileIndex((prevIndex) => (prevIndex + 1) % users.length);
        }, 500);
        const conversationId = data.data.conversationId;
        if (conversationId && conversationId !== "null") {
          if (data.data.isMatch) {
            toast.success("It's a match! 💕");
            navigate(`/direct-message/${conversationId}`);
          } else {
            toast.success("Liked! Starting a chat 💬");
            navigate(`/direct-message/${conversationId}`);
          }
        } else {
          toast.error("Failed to start chat - please try again");
        }
      }
    } catch (error) {
      toast.error("Failed to like user");
    } finally {
      setTimeout(() => setLoadingAction(null), 1000);
    }
  };

  const handleDislike = async () => {
    if (!currentProfile) return;
    setLoadingAction("dislike");
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API_BASE_URL}/users/${currentProfile._id}/dislike`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setActionSuccess("dislike");
      setTimeout(() => {
        setActionSuccess(null);
      }, 1000);
      setTimeout(() => {
        setCurrentProfileIndex((prevIndex) => (prevIndex + 1) % users.length);
      }, 500);
    } catch (error) {
      // Optionally show error toast
    } finally {
      setTimeout(() => setLoadingAction(null), 1000);
    }
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleSwipeStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling
    handleSwipeMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleSwipeEnd();
  };

  // Mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    handleSwipeStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      handleSwipeMove(e.clientX);
    }
  };

  const handleMouseUp = () => {
    handleSwipeEnd();
  };

  // Add global mouse move and up listeners when dragging
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove as any);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove as any);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <>
      {/* Font Injection */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
      `}</style>

      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <button className={styles.iconBtn} aria-label="Profile">
            <span className="material-symbols-outlined">person</span>
          </button>

          <div className={styles.brand}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#f42559", fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
            <h1 className={styles.brandTitle}>SPARK</h1>
          </div>

          <button className={styles.iconBtn} aria-label="Filters">
            <span className="material-symbols-outlined">tune</span>
          </button>
        </header>

        {/* Main Card Stack */}
        <main className={styles.main}>
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "400px",
              }}
            >
              <span>Loading...</span>
            </div>
          ) : users.length === 0 ? (
            <div className={styles.noMatchesCard}>
              <div className={styles.noMatchesContent}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "64px",
                    color: "#f42559",
                    marginBottom: "20px",
                  }}
                >
                  favorite_border
                </span>
                <h2 style={{ color: "#fff", marginBottom: "16px" }}>
                  You don't have any matches yet
                </h2>
                <p
                  style={{
                    color: "#ccc",
                    marginBottom: "24px",
                    textAlign: "center",
                  }}
                >
                  Update your preferences to search wider and get more matches!
                </p>
                <button
                  className={styles.updateBtn}
                  style={{
                    backgroundColor: "#f42559",
                    color: "#fff",
                    border: "none",
                    padding: "12px 24px",
                    borderRadius: "8px",
                    fontSize: "16px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    width: "100%",
                    maxWidth: "300px",
                  }}
                >
                  Update Preferences
                </button>
                <p
                  style={{
                    color: "#ccc",
                    fontSize: "14px",
                    textAlign: "center",
                  }}
                >
                  Or upgrade to Plus to get notified when you get a match!
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.stackContainer}>
              {/* 1. Deepest Background Card (Aesthetic only) */}
              <div className={`${styles.card} ${styles.cardDeep}`}></div>

              {/* 2. The Next Profile (The Peek) */}
              {/* This uses .cardNext to shift right and rotate */}
              {nextProfile && nextProfile.photos && nextProfile.photos[0] && (
                <div
                  className={`${styles.card} ${styles.cardNext}`}
                  style={{
                    backgroundImage: `url('${nextProfile.photos[0].url}')`,
                  }}
                >
                  <div className={styles.cardNextOverlay} />
                </div>
              )}

              {/* 3. The Front Profile (Interactive) */}
              {currentProfile &&
                currentProfile.photos &&
                currentProfile.photos[0] && (
                  <div
                    ref={cardRef}
                    className={`${styles.card} ${styles.cardFront}`}
                    style={{
                      backgroundImage: `url('${currentProfile.photos[0].url}')`,
                      transform: isDragging
                        ? `translateX(${dragOffset}px) rotate(${
                            dragOffset * 0.1
                          }deg)`
                        : undefined,
                      transition: isDragging ? "none" : undefined,
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                  >
                    <div className={styles.gradientOverlay}></div>

                    {/* Card Information */}
                    <div className={styles.cardContent}>
                      <div className={styles.nameRow}>
                        <h2 className={styles.name}>
                          {currentProfile.firstName} {currentProfile.lastName},{" "}
                          {currentProfile.age}
                        </h2>
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "20px",
                            color: "#60a5fa",
                            fontVariationSettings: "'FILL' 1",
                            marginBottom: "4px",
                          }}
                        >
                          verified
                        </span>
                      </div>

                      <div className={styles.infoRow}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span className={styles.statusDot}></span>
                          <span style={{ fontWeight: 600 }}>Active Now</span>
                        </div>
                        <span>•</span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "16px" }}
                          >
                            location_on
                          </span>
                          <span>
                            {currentProfile.location.city},{" "}
                            {currentProfile.location.state}
                          </span>
                        </div>
                      </div>

                      <p className={styles.bio}>{currentProfile.bio}</p>

                      <div className={styles.tagContainer}>
                        {currentProfile.interests.map((interest: string) => (
                          <div key={interest} className={styles.tag}>
                            {interest}
                          </div>
                        ))}
                      </div>

                      <div className={styles.expandIcon}>
                        <span
                          className={`material-symbols-outlined ${styles.bounce}`}
                        >
                          keyboard_arrow_down
                        </span>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}
        </main>

        {/* Action Buttons */}
        <div className={styles.actionArea}>
          <div className={styles.actionGrid}>
            {/* Dislike Button */}
            <button
              className={`${styles.actionBtn} ${styles.passBtn}`}
              aria-label="Pass"
              onClick={handleDislike}
              disabled={!currentProfile || loadingAction !== null}
              style={
                loadingAction === "dislike"
                  ? { border: "3px solid #f42559", position: "relative" }
                  : {}
              }
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "36px", transition: "color 0.2s" }}
              >
                {loadingAction === "dislike" ? (
                  <span className={styles.loadingCircle}></span>
                ) : actionSuccess === "dislike" ? (
                  <span style={{ color: "#4ade80" }}>done</span>
                ) : (
                  "close"
                )}
              </span>
            </button>
            {/* Super Like Button (no loading for now) */}
            <button
              className={`${styles.actionBtn} ${styles.superBtn}`}
              aria-label="Super Like"
              disabled={!currentProfile || loadingAction !== null}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px", fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
            </button>
            {/* Like Button */}
            <button
              className={`${styles.actionBtn} ${styles.likeBtn}`}
              aria-label="Like"
              onClick={handleLike}
              disabled={!currentProfile || loadingAction !== null}
              style={
                loadingAction === "like"
                  ? { border: "3px solid #f42559", position: "relative" }
                  : {}
              }
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "32px",
                  fontVariationSettings: "'FILL' 1",
                  transition: "color 0.2s",
                }}
              >
                {loadingAction === "like" ? (
                  <span className={styles.loadingCircle}></span>
                ) : actionSuccess === "like" ? (
                  <span style={{ color: "#4ade80" }}>done</span>
                ) : (
                  "favorite"
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation activeTab="discovery" notificationCount={3} />
      </div>
    </>
  );
};

export default Discovery;
