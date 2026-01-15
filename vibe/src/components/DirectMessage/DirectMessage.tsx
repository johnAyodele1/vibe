import React, { useState } from "react";
import styles from "./DirectMessage.module.css";
import { useNavigate } from "react-router-dom";

interface Message {
  id: number;
  text?: string;
  sender: "me" | "them";
  time: string;
  isRead?: boolean;
  avatar?: string;
}

const MESSAGES: Message[] = [
  {
    id: 1,
    sender: "them",
    text: "Hey! Just saw your profile. Are you free tonight?",
    time: "7:42 PM",
    avatar: "https://i.pravatar.cc/150?img=11",
  },
  {
    id: 2,
    sender: "me",
    text: "Hey Alex. Yeah, I just got off work. What did you have in mind?",
    time: "7:45 PM",
    isRead: true,
  },
  {
    id: 3,
    sender: "them",
    text: "There's a new speakeasy downtown. Want to grab a drink?",
    time: "7:48 PM",
    avatar: "https://i.pravatar.cc/150?img=12",
  },
];

const DirectMessage: React.FC = () => {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("Sounds perfect...");

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
                    backgroundImage: `url("https://i.pravatar.cc/150?img=10")`,
                  }}
                />
                <div className={styles.onlineBadgeWrapper}>
                  <div className={styles.onlineDot}></div>
                </div>
              </div>

              <div className={styles.userInfo}>
                <h1 className={styles.userName}>
                  Alex, 24
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
                <span className={styles.userStatus}>Online Now</span>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={`${styles.iconBtn} ${styles.btnSecondary}`}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontWeight: 300 }}
                >
                  call
                </span>
              </button>
              <button className={`${styles.iconBtn} ${styles.btnPrimary}`}>
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
          <div className={styles.dateDivider}>
            <span className={styles.datePill}>Today</span>
          </div>

          {MESSAGES.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageRow} ${
                msg.sender === "me" ? styles.sent : ""
              }`}
            >
              {msg.sender === "them" && (
                <div
                  className={styles.msgAvatarSmall}
                  style={{ backgroundImage: `url("${msg.avatar}")` }}
                />
              )}

              <div className={styles.msgContentWrapper}>
                <div
                  className={`${styles.bubble} ${
                    msg.sender === "me"
                      ? styles.bubbleSent
                      : styles.bubbleReceived
                  }`}
                >
                  <p>{msg.text}</p>
                </div>

                <span className={styles.timestamp}>
                  {msg.time}
                  {msg.sender === "me" && msg.isRead && (
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
          ))}

          <div className={styles.messageRow}>
            <div
              className={styles.msgAvatarSmall}
              style={{
                backgroundImage: `url("https://i.pravatar.cc/150?img=13")`,
                opacity: 0.5,
              }}
            />
            <div className={styles.typingContainer}>
              <div className={styles.dot}></div>
              <div className={styles.dot}></div>
              <div className={styles.dot}></div>
            </div>
          </div>
        </main>

        <footer className={styles.footer}>
          <div className={styles.inputBar}>
            <button className={styles.utilityBtn}>
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
                onChange={(e) => setInputValue(e.target.value)}
              />
            </div>

            <div className={styles.actionGroup}>
              <button className={styles.cameraBtn}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "22px" }}
                >
                  photo_camera
                </span>
              </button>
              <button className={styles.sendBtn}>
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
      </div>
    </>
  );
};

export default DirectMessage;
