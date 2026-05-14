import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import styles from "./PremiumZone.module.css";
import { API_BASE_URL } from "../../config";
import LoadingScreen from "../LoadingScreen/LoadingScreen";

interface Model {
  _id: string;
  firstName: string;
  lastName: string;
  age: number;
  photos: { url: string; isMain: boolean }[];
  bio: string;
  location: { city?: string };
  modelProfile: {
    pricePerHour: number;
    services: string[];
    isLive: boolean;
    rating: number;
  };
  isOnline: boolean;
  lastActive: string;
}

const PremiumZone: React.FC = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [city, setCity] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const servicesList = ["Fuckmate", "Date", "Companionship", "Virtual", "Travel Buddy"];

  const fetchModels = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      let url = `${API_BASE_URL}/users/models?page=1&limit=50`;
      if (minPrice) url += `&minPrice=${minPrice}`;
      if (maxPrice) url += `&maxPrice=${maxPrice}`;
      if (city) url += `&city=${city}`;
      if (isLive) url += `&isLive=true`;
      if (selectedServices.length > 0) url += `&services=${selectedServices.join(",")}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setModels(data.data.models);
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      toast.error("Failed to load premium profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleServiceToggle = (service: string) => {
    setSelectedServices(prev =>
      prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
    );
  };

  const applyFilters = () => {
    setShowFilters(false);
    fetchModels();
  };

  const startConversation = async (modelId: string) => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_BASE_URL}/messages/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantId: modelId }),
      });
      const data = await response.json();
      if (data.success) {
        navigate(`/direct-message/${data.data.conversation._id}`);
      }
    } catch (error) {
      toast.error("Failed to start conversation");
    }
  };

  if (loading && models.length === 0) return <LoadingScreen />;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Premium Zone</h1>
          <p className={styles.subtitle}>Exclusive models & services</p>
        </div>
        <button className={styles.filterBtn} onClick={() => setShowFilters(true)}>
          <span className="material-symbols-outlined">tune</span>
        </button>
      </header>

      <main className={styles.grid}>
        {models.map(model => (
          <div key={model._id} className={styles.card} onClick={() => navigate(`/user/${model._id}`)}>
            <div
              className={styles.image}
              style={{ backgroundImage: `url(${model.photos.find(p => p.isMain)?.url || "/placeholder.svg"})` }}
            >
              {model.modelProfile.isLive && (
                <div className={styles.liveBadge}>
                  <span className={styles.pulse}></span>
                  LIVE
                </div>
              )}
              <div className={styles.priceTag}>
                ${model.modelProfile.pricePerHour}/hr
              </div>
            </div>
            <div className={styles.cardInfo}>
              <div className={styles.nameRow}>
                <h3 className={styles.name}>{model.firstName}, {model.age}</h3>
                <div className={styles.rating}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#FFD700', fontVariationSettings: "'FILL' 1" }}>star</span>
                  {model.modelProfile.rating}
                </div>
              </div>
              <p className={styles.location}>
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>location_on</span>
                {model.location.city || "Nearby"}
              </p>
              <div className={styles.services}>
                {model.modelProfile.services.slice(0, 2).map(s => (
                  <span key={s} className={styles.serviceTag}>{s}</span>
                ))}
              </div>
              <button
                className={styles.chatBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  startConversation(model._id);
                }}
              >
                Connect Now
              </button>
            </div>
          </div>
        ))}
      </main>

      {showFilters && (
        <div className={styles.filterOverlay} onClick={() => setShowFilters(false)}>
          <div className={styles.filterDrawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2>Filters</h2>
              <button onClick={() => setShowFilters(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className={styles.filterSection}>
              <h3>Price Range ($/hr)</h3>
              <div className={styles.inputRow}>
                <input type="number" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
                <input type="number" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
              </div>
            </div>

            <div className={styles.filterSection}>
              <h3>Location</h3>
              <input type="text" placeholder="City name..." value={city} onChange={e => setCity(e.target.value)} />
            </div>

            <div className={styles.filterSection}>
              <h3>Services</h3>
              <div className={styles.servicesGrid}>
                {servicesList.map(s => (
                  <button
                    key={s}
                    className={selectedServices.includes(s) ? styles.activeService : ""}
                    onClick={() => handleServiceToggle(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.filterSection}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={isLive} onChange={e => setIsLive(e.target.checked)} />
                Live Now Only
              </label>
            </div>

            <button className={styles.applyBtn} onClick={applyFilters}>Apply Filters</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PremiumZone;
