import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./BottomNavigation.module.css";

const Icon = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => <span className={`material-symbols-outlined ${className}`}>{name}</span>;

interface BottomNavigationProps {
  activeTab?: "discovery" | "likes" | "chat" | "profile";
  notificationCount?: number;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab = "profile",
  notificationCount = 0,
}) => {
  const navigate = useNavigate();

  return (
    <div className={styles.bottomNavFixed}>
      <div className={styles.navBar}>
        <button
          className={styles.navBtn}
          onClick={() => navigate("/discovery")}
        >
          {notificationCount > 0 && (
            <div className="absolute top-3 right-3 size-2.5 bg-primary rounded-full border-2 border-[#181113]"></div>
          )}
          <Icon
            name="favorite"
            className={`text-[28px] ${
              activeTab === "likes" ? "text-primary" : "text-gray-500"
            } hover:text-white transition-colors`}
          />
        </button>
        <button className={styles.navBtn} onClick={() => navigate("/chat")}>
          <Icon
            name="chat_bubble"
            className={`text-[28px] ${
              activeTab === "chat" ? "text-primary" : "text-gray-500"
            } hover:text-white transition-colors`}
          />
        </button>
        <button
          className={styles.navBtn}
          onClick={() => navigate("/my-profile")}
        >
          {activeTab === "profile" && (
            <div className="absolute inset-0 bg-white/5 rounded-full scale-75"></div>
          )}
          <Icon
            name="person"
            className={`text-[28px] ${
              activeTab === "profile" ? "text-primary" : "text-gray-500"
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation;
