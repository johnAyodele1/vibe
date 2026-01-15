import React, { useState } from "react";
import styles from "./ChatInterface.module.css";
import { useNavigate } from "react-router-dom";

interface Match {
  id: number;
  name: string;
  age: number;
  image: string;
  isNew: boolean;
}

interface Message {
  id: number;
  name: string;
  age: number;
  image: string;
  time: string;
  content: string;
  unreadCount?: number;
  isOnline: boolean;
  isTyping: boolean;
  isRead: boolean;
  type?: "text" | "photo";
}

const MATCHES: Match[] = [
  {
    id: 1,
    name: "Jessica",
    age: 24,
    image: "https://i.pravatar.cc/150?img=5",
    isNew: true,
  },
  {
    id: 2,
    name: "Ashley",
    age: 22,
    image: "https://i.pravatar.cc/150?img=9",
    isNew: true,
  },
  {
    id: 3,
    name: "Chloe",
    age: 26,
    image: "https://i.pravatar.cc/150?img=1",
    isNew: false,
  },
  {
    id: 4,
    name: "Mia",
    age: 23,
    image: "https://i.pravatar.cc/150?img=3",
    isNew: false,
  },
  {
    id: 5,
    name: "Zoe",
    age: 25,
    image: "https://i.pravatar.cc/150?img=6",
    isNew: false,
  },
];

const MESSAGES: Message[] = [
  {
    id: 1,
    name: "Sarah",
    age: 23,
    image: "https://i.pravatar.cc/150?img=32",
    time: "10:45 PM",
    content: "Are you free tonight? 😈",
    unreadCount: 1,
    isOnline: true,
    isTyping: false,
    isRead: false,
  },
  {
    id: 2,
    name: "Mike",
    age: 27,
    image: "https://i.pravatar.cc/150?img=11",
    time: "Yesterday",
    content: "Sent a photo",
    isOnline: false,
    isTyping: false,
    isRead: true,
    type: "photo",
  },
  {
    id: 3,
    name: "Alex",
    age: 21,
    image: "https://i.pravatar.cc/150?img=24",
    time: "Typing...",
    content: "",
    unreadCount: 0,
    isOnline: true,
    isTyping: true,
    isRead: false,
  },
  {
    id: 4,
    name: "Clara",
    age: 25,
    image: "https://i.pravatar.cc/150?img=20",
    time: "Mon",
    content: "Can't wait to meet you! 😉",
    isOnline: true,
    isTyping: false,
    isRead: true,
  },
  {
    id: 5,
    name: "David",
    age: 29,
    image: "https://i.pravatar.cc/150?img=13",
    time: "Sun",
    content: "Where did you get that drink?",
    isOnline: false,
    isTyping: false,
    isRead: true,
  },
];

const ChatInterface: React.FC = () => {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(true);

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
            onClick={() => setIsDarkMode(!isDarkMode)}
            aria-label="Toggle Theme"
          >
            <span className="material-symbols-outlined">tune</span>
          </button>
        </header>

        <main className={styles.main}>
          <div className={styles.searchContainer}>
            <div className={styles.searchWrapper}>
              <div className={styles.searchIcon}>
                <span className="material-symbols-outlined">search</span>
              </div>
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
              <span className={styles.badge}>3 New</span>
            </div>

            <div className={styles.matchesScroll}>
              {MATCHES.map((match) => (
                <div key={match.id} className={styles.matchItem}>
                  <div
                    className={`${styles.avatarRing} ${
                      match.isNew ? styles.ringActive : ""
                    }`}
                  >
                    <div className={styles.avatarContainer}>
                      <img
                        src={match.image}
                        alt={match.name}
                        className={styles.avatarImg}
                      />
                    </div>
                  </div>
                  <span
                    className={`${styles.matchName} ${
                      !match.isNew ? styles.matchNameRead : ""
                    }`}
                  >
                    {match.name}, {match.age}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.messageList}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Recent Messages</h3>
            </div>

            {MESSAGES.map((msg) => (
              <div
                key={msg.id}
                className={styles.messageItem}
                onClick={() => navigate("/direct-message")}
              >
                <div className={styles.messageAvatarWrapper}>
                  <div className={styles.messageAvatar}>
                    <img
                      src={msg.image}
                      alt={msg.name}
                      className={styles.avatarImg}
                    />
                  </div>
                  {msg.isOnline && <span className={styles.onlineIndicator} />}
                </div>

                <div className={styles.messageContent}>
                  <div className={styles.messageHeader}>
                    <h3 className={styles.userName}>
                      {msg.name}, {msg.age}
                    </h3>
                    {msg.isTyping ? (
                      <span className={styles.typing}>Typing...</span>
                    ) : (
                      <span
                        className={`${styles.time} ${
                          msg.isRead ? styles.timeRead : ""
                        }`}
                      >
                        {msg.time}
                      </span>
                    )}
                  </div>

                  <div className={styles.messageFooter}>
                    {msg.isTyping ? (
                      <div className={styles.typingDots}>
                        <span className={styles.dot}></span>
                        <span className={styles.dot}></span>
                        <span className={styles.dot}></span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          overflow: "hidden",
                        }}
                      >
                        {msg.type === "photo" && (
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "16px", color: "#64748b" }}
                          >
                            photo_camera
                          </span>
                        )}
                        {msg.isRead && !msg.type && (
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "16px", color: "#f42559" }}
                          >
                            done_all
                          </span>
                        )}
                        <p
                          className={`${styles.lastMessage} ${
                            msg.isRead ? styles.lastMessageRead : ""
                          }`}
                        >
                          {msg.content}
                        </p>
                      </div>
                    )}

                    {msg.unreadCount && msg.unreadCount > 0 && (
                      <span className={styles.unreadCount}>
                        {msg.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className={styles.ctaContainer}>
            <p className={styles.ctaText}>You're all caught up!</p>
            <button className={styles.ctaButton}>Keep Swiping</button>
          </div>
        </main>

        <nav className={styles.bottomNav}>
          <div className={styles.navInner}>
            <button className={styles.navBtn}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px" }}
              >
                local_fire_department
              </span>
            </button>
            <button className={styles.navBtn}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px" }}
              >
                favorite
              </span>
            </button>
            <button className={`${styles.navBtn} ${styles.navBtnActive}`}>
              <div style={{ position: "relative" }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "28px",
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  chat_bubble
                </span>
                <span className={styles.navBadge}>
                  <span className={styles.navDot}></span>
                </span>
              </div>
            </button>
            <button
              className={styles.navBtn}
              onClick={() => navigate("/my-profile")}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px" }}
              >
                person
              </span>
            </button>
          </div>
        </nav>
      </div>
    </>
  );
};

export default ChatInterface;
