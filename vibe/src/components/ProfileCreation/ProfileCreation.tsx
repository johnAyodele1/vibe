import React, { useState, useEffect } from "react";
import styles from "./ProfileCreation.module.css";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../contexts/AuthContext";

// Helper component for Material Symbols to keep code clean
const Icon = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => <span className={`material-symbols-outlined ${className}`}>{name}</span>;

const ProfileCreation: React.FC = () => {
  const navigate = useNavigate();
  const { checkAuthStatus } = useAuth();
  const [isDark, setIsDark] = useState(true); // Default to Dark mode as per prompt
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<string[]>(["", "", "", "", "", ""]); // Array for 6 photos
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Late Night 🌙",
    "Drinks 🍸",
  ]);
  const [activeGender, setActiveGender] = useState("Women");
  const [ageRange, setAgeRange] = useState({ min: 18, max: 28 });
  const [distance, setDistance] = useState(25);
  const [dragging, setDragging] = useState<{
    type: "ageMin" | "ageMax" | "distance" | null;
    sliderRef: HTMLElement | null;
  }>({ type: null, sliderRef: null });
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState({
    lat: 0,
    lng: 0,
    city: "",
    country: "",
  });
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] =
    useState(false);

  // Slider refs
  const ageSliderRef = React.useRef<HTMLDivElement>(null);
  const distanceSliderRef = React.useRef<HTMLDivElement>(null);

  // Load existing profile data on component mount
  useEffect(() => {
    loadExistingProfile();
  }, []);

  // Load existing profile data if user has partial profile
  const loadExistingProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      if (data.success && data.data.user) {
        const user = data.data.user;

        // Prefill bio
        if (user.bio) setBio(user.bio);

        // Prefill interests
        if (user.interests && user.interests.length > 0) {
          const formattedInterests = user.interests.map((interest: string) => {
            // Map backend interests back to display format
            const interestMap: { [key: string]: string } = {
              "Late Night": "Late Night 🌙",
              Drinks: "Drinks 🍸",
              Clubbing: "Clubbing 🪩",
              Concerts: "Concerts 🎸",
              Art: "Art 🎨",
              Fitness: "Fitness 💪",
              Travel: "Travel ✈️",
              Gaming: "Gaming 🎮",
            };
            return interestMap[interest] || interest;
          });
          setSelectedInterests(formattedInterests);
        }

        // Prefill location
        if (user.location && user.location.coordinates) {
          setLocation({
            lat: user.location.coordinates[1], // latitude
            lng: user.location.coordinates[0], // longitude
            city: user.location.city || "",
            country: user.location.country || "",
          });
        }

        // Prefill preferences
        if (user.preferences) {
          // Gender preference
          if (user.preferences.genderPreference) {
            const genderMap: { [key: string]: string } = {
              Male: "Men",
              Female: "Women",
              Everyone: "Everyone",
            };
            setActiveGender(
              genderMap[user.preferences.genderPreference] || "Women",
            );
          }

          // Age range
          if (user.preferences.ageRange) {
            setAgeRange({
              min: user.preferences.ageRange.min || 18,
              max: user.preferences.ageRange.max || 28,
            });
          }

          // Distance
          if (user.preferences.maxDistance) {
            setDistance(user.preferences.maxDistance);
          }
        }

        // Prefill photos
        if (user.photos && user.photos.length > 0) {
          const photoUrls = user.photos.map((photo: any) => photo.url);
          // Pad with empty strings to maintain 6 slots
          while (photoUrls.length < 6) {
            photoUrls.push("");
          }
          setPhotos(photoUrls);
        }
      }
    } catch (error) {
      console.error("Error loading existing profile:", error);
      // Don't show error toast here as this is just for prefilling
    }
  };

  // Update slider positions when values change
  useEffect(() => {
    if (ageSliderRef.current) {
      const minPos = ((ageRange.min - 18) / (100 - 18)) * 100;
      const maxPos = ((ageRange.max - 18) / (100 - 18)) * 100;
      const fillWidth = maxPos - minPos;

      const fill = ageSliderRef.current.querySelector(
        `.${styles.sliderFill}`,
      ) as HTMLElement;
      const handleMin = ageSliderRef.current.querySelector(
        '[data-handle="ageMin"]',
      ) as HTMLElement;
      const handleMax = ageSliderRef.current.querySelector(
        '[data-handle="ageMax"]',
      ) as HTMLElement;

      if (fill) {
        fill.style.left = `${minPos}%`;
        fill.style.width = `${fillWidth}%`;
      }
      if (handleMin) handleMin.style.left = `${minPos}%`;
      if (handleMax) handleMax.style.left = `${maxPos}%`;
    }
  }, [ageRange]);

  useEffect(() => {
    if (distanceSliderRef.current) {
      const pos = ((distance - 1) / (500 - 1)) * 100;

      const fill = distanceSliderRef.current.querySelector(
        `.${styles.sliderFill}`,
      ) as HTMLElement;
      const handle = distanceSliderRef.current.querySelector(
        `.${styles.sliderHandle}`,
      ) as HTMLElement;

      if (fill) {
        fill.style.width = `${pos}%`;
      }
      if (handle) handle.style.left = `${pos}%`;
    }
  }, [distance]);

  // Helper function to get platform-specific location settings instructions
  const getLocationSettingsInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isChrome = /chrome/.test(userAgent) && !/edg/.test(userAgent);
    const isFirefox = /firefox/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);

    if (isIOS && isSafari) {
      return "Settings > Safari > Location";
    } else if (isIOS && !isSafari) {
      return "Settings > [Browser Name] > Location";
    } else if (isAndroid && isChrome) {
      return "Settings > Site settings > Location";
    } else if (isAndroid) {
      return "Settings > Apps > [Browser Name] > Permissions > Location";
    } else if (isChrome) {
      return "Chrome settings > Privacy and security > Site settings > Location";
    } else if (isFirefox) {
      return "Firefox settings > Privacy & Security > Permissions > Location > Settings";
    } else {
      return "Browser settings > Privacy/Security > Location/Site permissions";
    }
  };

  const getCurrentLocation = () => {
    setGettingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocation((prev) => ({ ...prev, lat: latitude, lng: longitude }));

          // Get city/country from coordinates using reverse geocoding
          try {
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            );
            const data = await response.json();
            setLocation((prev) => ({
              ...prev,
              city: data.city || data.locality || "",
              country: data.countryName || "",
            }));
          } catch (error) {
            console.error("Reverse geocoding error:", error);
            toast.error("Could not get location details");
          }
          setGettingLocation(false);
        },
        (error) => {
          console.error("Geolocation error:", error);
          let errorMessage = "Could not get your location.";

          if (error.code === error.PERMISSION_DENIED) {
            const settingsPath = getLocationSettingsInstructions();
            errorMessage = `Location access denied. Please go to ${settingsPath} and allow location access for this website, then try again.`;
            setLocationPermissionDenied(true);
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errorMessage =
              "Location information is unavailable. Please check your device settings.";
          } else if (error.code === error.TIMEOUT) {
            errorMessage = "Location request timed out. Please try again.";
          } else {
            errorMessage =
              "Could not get your location. Please check permissions.";
          }

          toast.error(errorMessage);
          setGettingLocation(false);
        },
      );
    } else {
      toast.error("Geolocation is not supported by this browser");
      setGettingLocation(false);
    }
  };

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  // Handle photo upload
  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload/photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        // Add the new photo URL to the photos array
        setPhotos((prev) => {
          const newPhotos = [...prev];
          const emptyIndex = newPhotos.findIndex((photo) => photo === "");
          if (emptyIndex !== -1) {
            newPhotos[emptyIndex] = data.data.photo.url;
          }
          return newPhotos;
        });
        toast.success("Photo uploaded successfully");
      } else {
        toast.error(data.message || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Network error during upload");
    }
  };

  // Handle interest selection
  const handleInterestToggle = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest],
    );
  };

  // Slider interaction handlers
  const startDrag = (
    type: "ageMin" | "ageMax" | "distance",
    sliderRef: HTMLElement,
  ) => {
    setDragging({ type, sliderRef });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging.sliderRef || !dragging.type) return;

    const rect = dragging.sliderRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));

    if (dragging.type === "ageMin") {
      const newMin = Math.round(18 + percentage * (ageRange.max - 18));
      setAgeRange((prev) => ({ ...prev, min: Math.min(newMin, prev.max - 1) }));
    } else if (dragging.type === "ageMax") {
      const newMax = Math.round(18 + percentage * (100 - 18));
      setAgeRange((prev) => ({ ...prev, max: Math.max(newMax, prev.min + 1) }));
    } else if (dragging.type === "distance") {
      const newDistance = Math.round(1 + percentage * 499);
      setDistance(newDistance);
    }
  };

  const handleMouseUp = () => {
    setDragging({ type: null, sliderRef: null });
  };

  useEffect(() => {
    const handleMouseMoveWrapper = (e: MouseEvent) => handleMouseMove(e);
    const handleMouseUpWrapper = () => handleMouseUp();

    if (dragging.sliderRef) {
      document.addEventListener("mousemove", handleMouseMoveWrapper);
      document.addEventListener("mouseup", handleMouseUpWrapper);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMoveWrapper);
      document.removeEventListener("mouseup", handleMouseUpWrapper);
    };
  }, [dragging]);

  // Handle form submission
  const handleSubmit = async () => {
    // Basic validation
    if (photos.filter((p) => p).length < 2) {
      toast.error("Please upload at least 2 photos");
      return;
    }
    if (!location.city || location.lat === 0 || location.lng === 0) {
      toast.error("Please allow location access and wait for it to load");
      return;
    }
    if (gettingLocation) {
      toast.error("Please wait for your location to be determined");
      return;
    }

    setLoading(true);
    try {
      const profileData = {
        bio,
        interests: selectedInterests.map((interest) => interest.split(" ")[0]), // Remove emojis
        location: {
          type: "Point",
          coordinates: [location.lng, location.lat], // [longitude, latitude]
          city: location.city,
          country: location.country,
        },
        preferences: {
          genderPreference:
            activeGender === "Everyone"
              ? "Everyone"
              : activeGender === "Men"
                ? "Male"
                : "Female",
          ageRange,
          maxDistance: distance,
        },
      };

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(profileData),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Profile updated successfully!");
        // Refresh auth status to update user data in context
        await checkAuthStatus();
        // Navigate to profile page after a brief delay to let user see success message
        setTimeout(() => {
          navigate("/my-profile");
        }, 1500);
      } else {
        toast.error(data.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Profile update error:", error);
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    // Top-level container handling the dark mode class
    <div className={`${isDark ? "dark" : ""} w-full`}>
      <div className={styles.container}>
        {/* Sticky Header */}
        <div className={styles.header}>
          <div className={styles.navBar}>
            <button className={`${styles.iconButton} group`}>
              <Icon
                name="arrow_back_ios_new"
                className="text-2xl group-hover:-translate-x-0.5 transition-transform"
              />
            </button>
            <span className={styles.pageTitle}>Create Profile</span>
            {/* Toggle for demo purposes */}
            <button
              onClick={() => setIsDark(!isDark)}
              className={styles.iconButton}
            >
              <Icon name={isDark ? "light_mode" : "dark_mode"} />
            </button>
          </div>

          {/* Progress Stepper */}
          <div className={styles.progressContainer}>
            <div
              className={`${styles.progressBar} ${styles.progressBarActive}`}
            ></div>
            <div className={styles.progressBar}></div>
            <div className={styles.progressBar}></div>
            <div className={styles.progressBar}></div>
          </div>
        </div>

        {/* Main Scrollable Form */}
        <div className={styles.contentWrapper}>
          {/* SECTION 1: VISUALS (PHOTOS) */}
          <section className="flex flex-col gap-5">
            <div className={styles.sectionHeader}>
              <h1>Show yourself off.</h1>
              <p>Add at least 2 photos to get started.</p>
            </div>

            <div className={styles.photoGrid}>
              {photos.map((photo, index) => {
                if (photo) {
                  return (
                    <div
                      key={index}
                      className={`${styles.photoCard} ${
                        index === 0 ? styles.photoCardMain : ""
                      } group`}
                    >
                      <div
                        className={styles.photoImage}
                        style={{
                          backgroundImage: `url('${photo}')`,
                        }}
                      ></div>
                      {index === 0 && (
                        <>
                          <div className={styles.photoOverlay}></div>
                          <div className={styles.mainBadge}>MAIN</div>
                        </>
                      )}
                      <button className={styles.editButton}>
                        <Icon name="edit" className="text-sm" />
                      </button>
                      {index > 0 && (
                        <button
                          className={styles.removeButton}
                          onClick={() => {
                            setPhotos((prev) =>
                              prev.map((p, i) => (i === index ? "" : p)),
                            );
                          }}
                        >
                          <Icon name="close" className="text-[14px]" />
                        </button>
                      )}
                    </div>
                  );
                } else {
                  return (
                    <div key={index} className={`${styles.uploadCard} group`}>
                      <label className={styles.uploadLabel}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className={styles.uploadInput}
                        />
                        <div className={styles.uploadIcon}>
                          <Icon name="add" className="text-xl font-bold" />
                        </div>
                      </label>
                    </div>
                  );
                }
              })}
            </div>
            <p className="text-xs text-center font-medium text-slate-400 dark:text-white/30 uppercase tracking-wide">
              Hold & Drag to reorder
            </p>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 2: INTERESTS */}
          <section className="flex flex-col gap-5">
            <div className={styles.sectionHeader}>
              <h2>What's your vibe?</h2>
              <p>Select tags that describe your ideal night.</p>
            </div>

            <div className={styles.tagContainer}>
              {[
                "Late Night 🌙",
                "Drinks 🍸",
                "Clubbing 🪩",
                "Concerts 🎸",
                "Art 🎨",
                "Fitness 💪",
                "Travel ✈️",
                "Gaming 🎮",
              ].map((interest) => (
                <button
                  key={interest}
                  onClick={() => handleInterestToggle(interest)}
                  className={`${styles.tag} ${
                    selectedInterests.includes(interest) ? styles.tagActive : ""
                  }`}
                >
                  {interest}{" "}
                  {selectedInterests.includes(interest) && (
                    <Icon name="check" className="text-[16px]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 3: PREFERENCES */}
          <section className="flex flex-col gap-8">
            <div className={styles.sectionHeader}>
              <h2>Who are you looking for?</h2>
            </div>

            {/* Gender Control */}
            <div className={styles.genderControl}>
              {["Men", "Women", "Everyone"].map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGender(g)}
                  className={`${styles.genderBtn} ${
                    activeGender === g ? styles.genderBtnActive : ""
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Age Range Slider */}
            <div className="flex flex-col gap-4">
              <div className={styles.sliderHeader}>
                <span className="text-slate-500 dark:text-white/60">
                  Age Range
                </span>
                <span className={styles.sliderBadge}>
                  {ageRange.min} - {ageRange.max}
                </span>
              </div>
              <div className={styles.sliderTrack} ref={ageSliderRef}>
                <div className={styles.sliderRail}></div>
                <div className={styles.sliderFill}></div>
                {/* Handle Min */}
                <div
                  data-handle="ageMin"
                  className={styles.sliderHandle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const track = e.currentTarget.parentElement as HTMLElement;
                    startDrag("ageMin", track);
                  }}
                ></div>
                {/* Handle Max */}
                <div
                  data-handle="ageMax"
                  className={styles.sliderHandle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const track = e.currentTarget.parentElement as HTMLElement;
                    startDrag("ageMax", track);
                  }}
                ></div>
              </div>
            </div>

            {/* Distance Slider */}
            <div className="flex flex-col gap-4">
              <div className={styles.sliderHeader}>
                <span className="text-slate-500 dark:text-white/60">
                  Distance
                </span>
                <span className={styles.sliderBadge}>Up to {distance}km</span>
              </div>
              <div
                className={styles.sliderTrack}
                ref={distanceSliderRef}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = Math.max(0, Math.min(1, x / rect.width));
                  const newDistance = Math.round(1 + percentage * 499);
                  setDistance(newDistance);
                }}
              >
                <div className={styles.sliderRail}></div>
                <div className={styles.sliderFill}></div>
                <div
                  className={styles.sliderHandle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const track = e.currentTarget.parentElement as HTMLElement;
                    startDrag("distance", track);
                  }}
                ></div>
              </div>
            </div>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 4: LOCATION */}
          <section className="flex flex-col gap-5">
            <div className={styles.sectionHeader}>
              <h2>Where are you?</h2>
              <p>Your location helps us find matches nearby.</p>
            </div>
            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <Icon name="location_on" className="text-slate-500" />
              <div className="flex-1">
                {gettingLocation ? (
                  <span className="text-slate-600 dark:text-slate-300">
                    Getting your location...
                  </span>
                ) : location.city ? (
                  <span className="text-slate-900 dark:text-slate-100">
                    {location.city}, {location.country}
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    Tap to enable location access
                  </span>
                )}
              </div>
              {location.city ? (
                <button
                  onClick={getCurrentLocation}
                  disabled={gettingLocation}
                  className="text-blue-500 hover:text-blue-600 disabled:opacity-50"
                >
                  <Icon name="refresh" />
                </button>
              ) : !locationPermissionDenied ? (
                <button
                  onClick={getCurrentLocation}
                  disabled={gettingLocation}
                  className="text-blue-500 hover:text-blue-600 disabled:opacity-50 font-medium"
                >
                  Enable
                </button>
              ) : null}
            </div>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 5: BIO */}
          <section className="flex flex-col gap-5 pb-10">
            <div className={styles.sectionHeader}>
              <h2>Say it with your chest.</h2>
              <p>Don't be shy, keep it spicy.</p>
            </div>
            <div className={styles.bioContainer}>
              <textarea
                className={styles.bioInput}
                placeholder="I'm here for a good time, not a long time..."
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={150}
              ></textarea>
              <div className={styles.charCount}>{bio.length}/150</div>
            </div>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className={styles.footer}>
          <button
            className={styles.continueBtn}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Saving..." : "Continue"}
            <Icon name="arrow_forward" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileCreation;
