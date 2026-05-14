import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import styles from "./PremiumZone.module.css";
import { API_BASE_URL } from "../../config";

interface ServiceProfile {
  _id: string;
  firstName: string;
  lastName: string;
  age: number;
  photos: { url: string; isMain: boolean }[];
  bio: string;
  offeredServices: string[];
  hourlyRate: number;
  serviceLocation: string;
  isOnline: boolean;
  isLive?: boolean;
  lastActive: string;
}

const PremiumZone: React.FC = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ServiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ServiceProfile | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [serviceType, setServiceType] = useState<string>("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      const queryParams = new URLSearchParams();
      if (serviceType) queryParams.append("serviceType", serviceType);
      if (minPrice) queryParams.append("minPrice", minPrice);
      if (maxPrice) queryParams.append("maxPrice", maxPrice);
      if (location) queryParams.append("location", location);

      const response = await fetch(`${API_BASE_URL}/users/services?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setProfiles(data.data.profiles);
      }
    } catch (error) {
      console.error("Error fetching service profiles:", error);
      toast.error("Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [serviceType]);

  const handleContact = async (profileId: string) => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_BASE_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: profileId,
          content: "Hi, I'm interested in your services!",
        }),
      });
      const data = await response.json();
      if (data.success) {
        navigate(`/direct-message/${data.data.message.conversation}`);
      }
    } catch (error) {
      toast.error("Failed to start conversation");
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button onClick={() => navigate(-1)} className={styles.iconBtn}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className={styles.title}>VIBE PREMIUM</h1>
        <button onClick={() => setShowFilters(!showFilters)} className={styles.iconBtn}>
          <span className="material-symbols-outlined">tune</span>
        </button>
      </header>

      <div className={styles.filters}>
        <button
          className={`${styles.filterPill} ${serviceType === "" ? styles.filterPillActive : ""}`}
          onClick={() => setServiceType("")}
        >
          All
        </button>
        <button
          className={`${styles.filterPill} ${serviceType === "Live Cam" ? styles.filterPillActive : ""}`}
          onClick={() => setServiceType("Live Cam")}
        >
          Live Cam
        </button>
        <button
          className={`${styles.filterPill} ${serviceType === "Fuckmate" ? styles.filterPillActive : ""}`}
          onClick={() => setServiceType("Fuckmate")}
        >
          Fuckmate
        </button>
        <button
          className={`${styles.filterPill} ${serviceType === "Date" ? styles.filterPillActive : ""}`}
          onClick={() => setServiceType("Date")}
        >
          Date
        </button>
      </div>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
          </div>
        ) : profiles.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: "4rem", color: "rgba(255,255,255,0.5)" }}>
            No profiles found matching your criteria.
          </div>
        ) : (
          <div className={styles.grid}>
            {profiles.map((profile) => (
              <div
                key={profile._id}
                className={styles.card}
                onClick={() => setSelectedProfile(profile)}
              >
                <img
                  src={profile.photos.find(p => p.isMain)?.url || "/placeholder.svg"}
                  alt={profile.firstName}
                  className={styles.image}
                />
                <div className={styles.overlay}>
                  <div className={styles.name}>
                    {profile.firstName}, {profile.age}
                  </div>
                  <div className={styles.price}>
                    ${profile.hourlyRate}/hr
                  </div>
                  <div className={styles.location}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
                    {profile.serviceLocation}
                  </div>
                </div>
                {profile.isLive && (
                  <div className={styles.badge} style={{ backgroundColor: '#ff0000', color: 'white' }}>
                    LIVE
                  </div>
                )}
                {profile.isOnline && !profile.isLive && (
                  <div className={styles.badge}>
                    <div className={styles.onlineDot}></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedProfile && (
        <div className={styles.modal}>
          <button className={styles.modalClose} onClick={() => setSelectedProfile(null)}>
            <span className="material-symbols-outlined">close</span>
          </button>

          <img
            src={selectedProfile.photos.find(p => p.isMain)?.url || "/placeholder.svg"}
            alt={selectedProfile.firstName}
            className={styles.modalImage}
          />

          <div className={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 className={styles.modalName}>{selectedProfile.firstName}, {selectedProfile.age}</h2>
                <p className={styles.location} style={{ fontSize: '1rem' }}>
                  <span className="material-symbols-outlined">location_on</span>
                  {selectedProfile.serviceLocation}
                </p>
              </div>
              <div className={styles.modalPrice}>${selectedProfile.hourlyRate}/hr</div>
            </div>

            <div style={{ margin: '1.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedProfile.offeredServices.map(service => (
                <span key={service} style={{ background: 'rgba(244, 37, 89, 0.1)', color: '#f42559', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '0.875rem', fontWeight: 600 }}>
                  {service}
                </span>
              ))}
            </div>

            <p className={styles.modalBio}>{selectedProfile.bio}</p>

            <div className={styles.modalActions}>
              <button className={`${styles.actionBtn} ${styles.callBtn}`} onClick={() => toast.info("Calls coming soon to premium zone")}>
                <span className="material-symbols-outlined">videocam</span>
                Live Cam
              </button>
              <button className={`${styles.actionBtn} ${styles.chatBtn}`} onClick={() => handleContact(selectedProfile._id)}>
                <span className="material-symbols-outlined">chat_bubble</span>
                Message
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
            onClick={() => setShowFilters(false)}
          />
          <div className={styles.filterModal}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem' }}>Filters</h3>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Location</label>
              <input
                className={styles.input}
                placeholder="City or Country"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Price Range ($/hr)</label>
              <div className={styles.priceInputs}>
                <input
                  className={styles.input}
                  placeholder="Min"
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <input
                  className={styles.input}
                  placeholder="Max"
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>

            <button className={styles.applyBtn} onClick={() => { fetchProfiles(); setShowFilters(false); }}>
              Apply Filters
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PremiumZone;
