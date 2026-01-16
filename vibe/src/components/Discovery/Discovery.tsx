import React, { useState, useRef } from "react";
import styles from "./Discovery.module.css";

// Mock Data to demonstrate the "Next Profile" logic
const PROFILES = [
  {
    id: 1,
    name: "Sarah",
    age: 24,
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCAbJa-LAnat18Ngvy8K66iiLW9ctodyzkejLEtwGVfPjj9vzGvkvqTRa5RftLusA4Ju4Ev_F-XPkNjpVuL2eEXzHVYgwvodJetGcK4rR0bX4Rk3qWRzwt-CfOC7ei3GeToay8d17ol5jtQxnRfS-4aZh82RVmNPwHKUWpYnfmUyTMNjRpUxY5DsrAnJvwgOlEWFq6FUXg6XeB-KoKTtE9J6p-DtviSGPhMLa01rkriLst_luRhYL1ATtl8yqI_jw1BfblaPIc2AQs", // Using the url from your input
    isOnline: true,
    distance: "3 miles away",
    bio: "Looking for something casual. Love techno and wine nights. 🍷🎧 Let's vibe!",
    tags: ["Wine", "Techno", "Casual"],
    isNew: true,
  },
  {
    id: 2,
    name: "Jessica",
    age: 22,
    image:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800",
    bio: "Next profile example...",
    tags: [],
    isNew: false,
  },
];

const Discovery: React.FC = () => {
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const currentProfile = PROFILES[currentProfileIndex];
  const nextProfile = PROFILES[(currentProfileIndex + 1) % PROFILES.length];

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
      // Swipe detected, move to next profile
      setCurrentProfileIndex((prevIndex) => (prevIndex + 1) % PROFILES.length);
    }

    setIsDragging(false);
    setDragOffset(0);
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
          <div className={styles.stackContainer}>
            {/* 1. Deepest Background Card (Aesthetic only) */}
            <div className={`${styles.card} ${styles.cardDeep}`}></div>

            {/* 2. The Next Profile (The Peek) */}
            {/* This uses .cardNext to shift right and rotate */}
            <div
              className={`${styles.card} ${styles.cardNext}`}
              style={{ backgroundImage: `url('${nextProfile.image}')` }}
            >
              <div className={styles.cardNextOverlay} />
            </div>

            {/* 3. The Front Profile (Interactive) */}
            <div
              ref={cardRef}
              className={`${styles.card} ${styles.cardFront}`}
              style={{
                backgroundImage: `url('${currentProfile.image}')`,
                transform: isDragging
                  ? `translateX(${dragOffset}px) rotate(${dragOffset * 0.1}deg)`
                  : undefined,
                transition: isDragging ? "none" : undefined,
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
            >
              <div className={styles.gradientOverlay}></div>

              {/* Status Badge */}
              {currentProfile.isNew && (
                <div className={styles.newBadge}>New</div>
              )}

              {/* Card Information */}
              <div className={styles.cardContent}>
                <div className={styles.nameRow}>
                  <h2 className={styles.name}>
                    {currentProfile.name}, {currentProfile.age}
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
                  {currentProfile.isOnline && (
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
                  )}
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
                    <span>{currentProfile.distance}</span>
                  </div>
                </div>

                <p className={styles.bio}>{currentProfile.bio}</p>

                <div className={styles.tagContainer}>
                  {currentProfile.tags.map((tag) => (
                    <div key={tag} className={styles.tag}>
                      {tag}
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
          </div>
        </main>

        {/* Action Buttons */}
        <div className={styles.actionArea}>
          <div className={styles.actionGrid}>
            <button
              className={`${styles.actionBtn} ${styles.passBtn}`}
              aria-label="Pass"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "36px" }}
              >
                close
              </span>
            </button>
            <button
              className={`${styles.actionBtn} ${styles.superBtn}`}
              aria-label="Super Like"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px", fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
            </button>
            <button
              className={`${styles.actionBtn} ${styles.likeBtn}`}
              aria-label="Like"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "32px", fontVariationSettings: "'FILL' 1" }}
              >
                favorite
              </span>
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav className={styles.navbar}>
          <div className={styles.navContent}>
            <a href="#" className={`${styles.navItem} ${styles.active}`}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px", fontVariationSettings: "'FILL' 1" }}
              >
                style
              </span>
            </a>

            <a href="#" className={styles.navItem}>
              <div className={styles.badgeWrapper}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "28px" }}
                >
                  favorite
                </span>
                <span className={styles.badge}>3</span>
              </div>
            </a>

            <a href="#" className={styles.navItem}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px" }}
              >
                chat_bubble
              </span>
            </a>

            <a href="#" className={styles.navItem}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px" }}
              >
                person
              </span>
            </a>
          </div>
        </nav>
      </div>
    </>
  );
};

export default Discovery;
