import React, { useState, useEffect } from "react";
import styles from "./PublicProfileView.module.css";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
  isVerified: boolean;
  isOnline: boolean;
  location?: {
    city?: string;
    country?: string;
  };
}

const PublicProfileView: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setError("No authentication token found");
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
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
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  const handleBlock = async () => {
    if (!window.confirm("Are you sure you want to block this user?")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_BASE_URL}/users/${userId}/block`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (data.success) {
        toast.success("User blocked successfully");
        navigate("/chat");
      } else {
        toast.error(data.message || "Failed to block user");
      }
    } catch (err) {
      toast.error("An error occurred. Please try again.");
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) {
      toast.error("Please provide a reason for reporting");
      return;
    }

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_BASE_URL}/users/${userId}/report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reportReason }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("User reported successfully");
        setIsReporting(false);
        setReportReason("");
      } else {
        toast.error(data.message || "Failed to report user");
      }
    } catch (err) {
      toast.error("An error occurred. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Icon name="refresh" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className={styles.errorContainer}>
        <p>{error || "User not found"}</p>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className={`${styles.container} dark`}>
      <div className={styles.header}>
        <button className={styles.iconBtn} onClick={() => navigate(-1)}>
          <Icon name="arrow_back_ios" className="text-xl" />
        </button>
        <h2 className={styles.headerTitle}>{user.firstName}'s Profile</h2>
        <div style={{ width: "40px" }}></div>
      </div>

      <div className={styles.heroWrapper}>
        <div className={styles.heroImageContainer}>
          <div
            className={styles.heroBg}
            style={{
              backgroundImage: `url('${
                user.photos?.find((photo) => photo.isMain)?.url ||
                "/placeholder.svg"
              }')`,
            }}
          />
          <div className={styles.heroGradient}></div>

          <div className={styles.heroContent}>
            <div className={styles.heroNameRow}>
              <h1 className={styles.heroName}>
                {user.firstName}, {user.age}
              </h1>
              {user.isVerified && (
                <Icon name="verified" className="text-primary text-2xl" />
              )}
            </div>
            <p className={styles.heroLocation}>
              <Icon name="location_on" className="text-[18px]" />
              {user.location?.city ? `${user.location.city}, ${user.location.country}` : "Location not set"}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>About</h3>
        <p className={styles.bioText}>{user.bio || "No bio added yet."}</p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Interests</h3>
        <div className={styles.tags}>
          {user.interests?.map((interest, index) => (
            <span key={index} className={styles.tag}>
              {interest}
            </span>
          ))}
        </div>
      </div>

      {/* Photo Gallery */}
      <div className={styles.photoHeader}>
        <h3 className={styles.sectionTitle}>{user.firstName}'s Photos</h3>
      </div>

      <div className={`${styles.galleryScroll} ${styles.noScrollbar}`}>
        <div className={styles.galleryContent}>
          {user.photos && user.photos.length > 0 ? (
            user.photos
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
          ) : (
            <div className={styles.photoItem}>
              <div className={styles.photoThumb}>
                <Icon name="photo" className="text-4xl text-gray-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA Buttons for Blocking/Reporting */}
      <div className={styles.actionSection}>
        <button className={styles.reportBtn} onClick={() => setIsReporting(true)}>
          <Icon name="report" /> Report User
        </button>
        <button className={styles.blockBtn} onClick={handleBlock}>
          <Icon name="block" /> Block User
        </button>
      </div>

      {isReporting && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Report User</h3>
            <textarea
              placeholder="Tell us why you are reporting this user..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className={styles.reportInput}
            />
            <div className={styles.modalActions}>
              <button onClick={() => setIsReporting(false)}>Cancel</button>
              <button className={styles.submitReportBtn} onClick={handleReport}>Submit Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicProfileView;
