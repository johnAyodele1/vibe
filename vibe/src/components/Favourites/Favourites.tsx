import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Favourites.module.css";
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
  }[];
  bio: string;
  location: {
    city?: string;
  };
  isOnline: boolean;
}

const Favourites: React.FC = () => {
  const navigate = useNavigate();
  const [favourites, setFavourites] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavourites = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/users/favourites`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (data.success) {
          setFavourites(data.data.favourites);
        }
      } catch (error) {
        console.error("Error fetching favourites:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFavourites();
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
      `}</style>

      <div className={styles.container}>
        <header className={styles.header}>
          <button className={styles.iconBtn} onClick={() => navigate(-1)}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>

          <div className={styles.brand}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#facc15", fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            <h1 className={styles.brandTitle}>FAVOURITES</h1>
          </div>

          <div style={{ width: 40 }} />
        </header>

        <main className={styles.main}>
          <h2 className={styles.sectionTitle}>Your Favourites</h2>
          <p className={styles.sectionSubtitle}>
            People you've super liked. They won't know unless you message them!
          </p>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#fff" }}>
              Loading...
            </div>
          ) : favourites.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={`material-symbols-outlined ${styles.emptyIcon}`}>
                star_outline
              </span>
              <h3 className={styles.emptyTitle}>No favourites yet</h3>
              <p className={styles.emptyText}>
                Super like people you really vibe with to see them here.
              </p>
              <button
                className={styles.exploreBtn}
                onClick={() => navigate("/discovery")}
              >
                Start Exploring
              </button>
            </div>
          ) : (
            <div className={styles.favouritesGrid}>
              {favourites.map((user) => (
                <div
                  key={user._id}
                  className={styles.favouriteCard}
                  onClick={() => navigate(`/discovery`)} // Or to a specific profile view if implemented
                >
                  <div
                    className={styles.cardImage}
                    style={{
                      backgroundImage: `url('${
                        user.photos.find((p) => p.isMain)?.url ||
                        user.photos[0]?.url ||
                        "https://via.placeholder.com/400"
                      }')`,
                    }}
                  />
                  <div className={styles.starBadge}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px", fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  </div>
                  <div className={styles.cardOverlay}>
                    <p className={styles.userName}>
                      {user.firstName}, {user.age}
                    </p>
                    <div className={styles.userLocation}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "14px" }}
                      >
                        location_on
                      </span>
                      <span>{user.location.city || "Nearby"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <BottomNavigation activeTab="likes" />
      </div>
    </>
  );
};

export default Favourites;
