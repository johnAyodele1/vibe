import React, { useState, useEffect } from "react";
import styles from "./UserProfileView.module.css";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../../config";

const Icon = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => <span className={`material-symbols-outlined ${className}`}>{name}</span>;

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  age: number;
  bio?: string;
  photos: Array<{
    url: string;
    isMain: boolean;
    order: number;
    uploadedAt: string;
  }>;
  interests: string[];
  matches: any[];
  views: number;
  isVerified: boolean;
  isPremium: boolean;
  location?: {
    city?: string;
    country?: string;
  };
}

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  // Toggle this to see the light mode version
  const [isDark, setIsDark] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setError("No authentication token found");
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.data.user);
        setError(null);
      } else {
        setError(data.message || "Failed to load profile");
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: isDark ? "#221014" : "#ececec",
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div className={`${styles.container} ${isDark ? "dark" : ""}`}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <Icon
              name="refresh"
              className="text-4xl animate-spin text-primary mb-4"
            />
            <p className="text-lg">Loading your profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: isDark ? "#221014" : "#ececec",
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div className={`${styles.container} ${isDark ? "dark" : ""}`}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <Icon name="error" className="text-4xl text-red-500 mb-4" />
            <p className="text-lg mb-4">{error}</p>
            <button
              onClick={fetchUserProfile}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                backgroundImage: user?.photos?.find((photo) => photo.isMain)
                  ?.url
                  ? `url('${user.photos.find((photo) => photo.isMain)?.url}')`
                  : "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAju8IsbsKIerllTnWebKBL6CzrVwas4-XpetWSPAiP3kFsCTTNSmmW6642mipGu_Cp3Xby-t4cskzLDmiowSGat4BSQpmQXOtGxYQxd7uoTLZ03otdL964SEeOzsdqD8aIIw02FYjukuUyafx1bI6bqhLeyHHdl2nA039fpmLOXx33wW23yxXuBm3BqBowx48rgP5a8Lp8KCyZ3pbe_UsEhIM5dpPVppucFYtGOehjV1Ep1uxER1sAATqtodOw4NGLgl_xHrBt_bU')",
              }}
            />
            <div className={styles.heroGradient}></div>

            <button
              className={styles.editFab}
              onClick={() => navigate("/profile")}
            >
              <Icon name="edit" />
            </button>

            <div className={styles.heroContent}>
              <div className={styles.heroNameRow}>
                <h1 className={styles.heroName}>
                  {user?.firstName} {user?.lastName}, {user?.age}
                </h1>
                {user?.isVerified && (
                  <Icon name="verified" className="text-primary text-2xl" />
                )}
              </div>
              <p className={styles.heroLocation}>
                <Icon name="location_on" className="text-[18px]" />
                {user?.location?.city && user?.location?.country
                  ? `${user.location.city}, ${user.location.country}`
                  : "Location not set"}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>
                {user?.views && user.views >= 1000
                  ? `${(user.views / 1000).toFixed(1)}k`
                  : user?.views || 0}
              </p>
              <p className={styles.statLabel}>Views</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statValue}>
                {user?.matches?.filter((match) => match.isActive).length || 0}
              </p>
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
          <p className={styles.bioText}>{user?.bio || "No bio added yet."}</p>
        </div>

        {/* Interests Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Interests</h3>
          <div className={styles.tags}>
            {user?.interests && user.interests.length > 0 ? (
              user.interests.map((interest, index) => (
                <span key={index} className={styles.tag}>
                  {interest}
                </span>
              ))
            ) : (
              <span className={styles.tag}>No interests added yet</span>
            )}
            <button
              className={styles.addTag}
              onClick={() => navigate("/profile")}
            >
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
              <button
                className={styles.addPhotoBox}
                onClick={() => navigate("/profile")}
              >
                <Icon name="add_a_photo" className="text-3xl mb-1" />
                <span className="text-xs font-bold">Add</span>
              </button>
            </div>

            {/* Photos */}
            {user?.photos && user.photos.length > 0
              ? user.photos
                  .sort((a, b) => a.order - b.order)
                  .map((photo, index) => (
                    <div key={index} className={styles.photoItem}>
                      <div
                        className={styles.photoThumb}
                        style={{
                          backgroundImage: `url("${photo.url}")`,
                        }}
                      />
                    </div>
                  ))
              : // Show placeholder photos if no user photos
                [1, 2, 3].map((id) => (
                  <div key={id} className={styles.photoItem}>
                    <div className={styles.photoThumb}>
                      <Icon name="photo" className="text-4xl text-gray-400" />
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* Premium Upsell - Only show if user is not premium */}
        {!user?.isPremium && (
          <div className={styles.premiumWrapper}>
            <div className={styles.premiumCard}>
              <div className={styles.premiumGlow}></div>
              <div className="relative z-10">
                <h4 className="text-white text-lg font-bold mb-1">
                  Go Premium 👑
                </h4>
                <p className="text-white/70 text-sm">
                  See who likes you & more
                </p>
              </div>
              <button className={styles.upgradeBtn}>Upgrade</button>
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <div className={styles.bottomNavFixed}>
          <div className={styles.navBar}>
            <button
              className={styles.navBtn}
              onClick={() => navigate("/discovery")}
            >
              <Icon
                name="style"
                className="text-[28px] text-gray-500 hover:text-white transition-colors"
              />
            </button>
            <button
              className={styles.navBtn}
              onClick={() => navigate("/discovery")}
            >
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
