import React, { useState } from "react";
import styles from "./UserProfileView.module.css";
import { useNavigate } from "react-router-dom";

const Icon = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => <span className={`material-symbols-outlined ${className}`}>{name}</span>;

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  // Toggle this to see the light mode version
  const [isDark, setIsDark] = useState(true);

  return (
    // Outer wrapper for background context only
    <div
      style={{
        backgroundColor: isDark ? "#221014" : "#ececec",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div className={`${styles.container} ${isDark ? "dark" : ""}`}>
        {/* Top App Bar */}
        <div className={styles.header}>
          <button
            className={styles.iconBtn}
            onClick={() => navigate("/settings")}
          >
            <Icon name="settings" className="text-2xl" />
          </button>
          <h2 className={styles.headerTitle}>My Profile</h2>
          {/* Toggle dark mode for testing */}
          <button onClick={() => setIsDark(!isDark)} className={styles.iconBtn}>
            <Icon
              name={isDark ? "light_mode" : "dark_mode"}
              className="text-primary text-2xl"
            />
          </button>
        </div>

        {/* Hero Section */}
        <div className={styles.heroWrapper}>
          <div className={styles.heroImageContainer}>
            <div
              className={styles.heroBg}
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAju8IsbsKIerllTnWebKBL6CzrVwas4-XpetWSPAiP3kFsCTTNSmmW6642mipGu_Cp3Xby-t4cskzLDmiowSGat4BSQpmQXOtGxYQxd7uoTLZ03otdL964SEeOzsdqD8aIIw02FYjukuUyafx1bI6bqhLeyHHdl2nA039fpmLOXx33wW23yxXuBm3BqBowx48rgP5a8Lp8KCyZ3pbe_UsEhIM5dpPVppucFYtGOehjV1Ep1uxER1sAATqtodOw4NGLgl_xHrBt_bU')",
              }}
            />
            <div className={styles.heroGradient}></div>

            <button className={styles.editFab}>
              <Icon name="edit" />
            </button>

            <div className={styles.heroContent}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>Jessica, 24</h1>
                <Icon name="verified" className="text-primary text-2xl" />
              </div>
              <p className={styles.heroLocation}>
                <Icon name="location_on" className="text-[18px]" />3 miles away
              </p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>1.2k</p>
              <p className={styles.statLabel}>Views</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statValue}>45</p>
              <p className={styles.statLabel}>Matches</p>
            </div>
            <div className={`${styles.statCard} ${styles.boostCard}`}>
              <Icon name="bolt" className="text-primary mb-1" />
              <p className={`${styles.statLabel} text-primary`}>Boost</p>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>About Me</h3>
          <p className={styles.bioText}>
            Here for a good time, not a long time. 🍷 Lover of spicy food,
            spontaneous road trips, and finding the best rooftop bars in the
            city.
          </p>
        </div>

        {/* Interests Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Interests</h3>
          <div className={styles.tags}>
            <span className={styles.tag}>Nightlife 🍸</span>
            <span className={styles.tag}>Travel ✈️</span>
            <span className={styles.tag}>Sushi 🍣</span>
            <span className={styles.tag}>Casual</span>
            <button className={styles.addTag}>
              <Icon name="add" className="text-lg" />
            </button>
          </div>
        </div>

        {/* Photo Gallery */}
        <div className={styles.photoHeader}>
          <h3 className={styles.sectionTitle}>My Photos</h3>
          <button className={styles.seeAll}>See All</button>
        </div>

        <div className={`${styles.galleryScroll} ${styles.noScrollbar}`}>
          <div className={styles.galleryContent}>
            {/* Add Button */}
            <div className={styles.photoItem}>
              <div className={styles.addPhotoBox}>
                <Icon name="add_a_photo" className="text-3xl mb-1" />
                <span className="text-xs font-bold">Add</span>
              </div>
            </div>

            {/* Photos */}
            {[3, 4, 5].map((id) => (
              <div key={id} className={styles.photoItem}>
                <div
                  className={styles.photoThumb}
                  style={{
                    backgroundImage: `url("http://googleusercontent.com/profile/picture/${id}")`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Premium Upsell */}
        <div className={styles.premiumWrapper}>
          <div className={styles.premiumCard}>
            <div className={styles.premiumGlow}></div>
            <div className="relative z-10">
              <h4 className="text-white text-lg font-bold mb-1">
                Go Premium 👑
              </h4>
              <p className="text-white/70 text-sm">See who likes you & more</p>
            </div>
            <button className={styles.upgradeBtn}>Upgrade</button>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className={styles.bottomNavFixed}>
          <div className={styles.navBar}>
            <button className={styles.navBtn}>
              <Icon
                name="style"
                className="text-[28px] text-gray-500 hover:text-white transition-colors"
              />
            </button>
            <button className={styles.navBtn}>
              <div className="absolute top-3 right-3 size-2.5 bg-primary rounded-full border-2 border-[#181113]"></div>
              <Icon
                name="favorite"
                className="text-[28px] text-gray-500 hover:text-white transition-colors"
              />
            </button>
            <button className={styles.navBtn} onClick={() => navigate("/chat")}>
              <Icon
                name="chat_bubble"
                className="text-[28px] text-gray-500 hover:text-white transition-colors"
              />
            </button>
            <button className={styles.navBtn}>
              <div className="absolute inset-0 bg-white/5 rounded-full scale-75"></div>
              <Icon name="person" className="text-[28px] text-primary" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
