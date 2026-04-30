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
  const [photoMetadata, setPhotoMetadata] = useState<{ [key: number]: { url: string; publicId: string } }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: number]: number }>({});
  const [localPreviews, setLocalPreviews] = useState<{ [key: number]: string }>({});
  const fileInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Late Night 🌙",
    "Drinks 🍸",
  ]);
  const [activeGender, setActiveGender] = useState("Women");
  const [userGender, setUserGender] = useState("");
  const [userBirthday, setUserBirthday] = useState("");
  const [ageRange, setAgeRange] = useState({ min: 18, max: 28 });
  const [distance, setDistance] = useState(25);
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
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [manualLocation, setManualLocation] = useState({
    city: "",
    country: "",
    lat: "",
    lng: "",
  });

  // Hierarchical location states
  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLoadingLocationData, setIsLoadingLocationData] = useState(false);

  // Load existing profile data and initial countries on component mount
  useEffect(() => {
    loadExistingProfile();
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      const response = await fetch("https://countriesnow.space/api/v0.1/countries");
      const data = await response.json();
      if (!data.error) {
        setCountries(data.data);
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchStates = async (countryName: string) => {
    setIsLoadingLocationData(true);
    try {
      const response = await fetch("https://countriesnow.space/api/v0.1/countries/states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: countryName }),
      });
      const data = await response.json();
      if (!data.error) {
        setStates(data.data.states);
      } else {
        setStates([]);
      }
    } catch (error) {
      console.error("Error fetching states:", error);
      setStates([]);
    } finally {
      setIsLoadingLocationData(false);
    }
  };

  const fetchCities = async (countryName: string, stateName: string) => {
    setIsLoadingLocationData(true);
    try {
      const response = await fetch("https://countriesnow.space/api/v0.1/countries/state/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: countryName, state: stateName }),
      });
      const data = await response.json();
      if (!data.error) {
        setCities(data.data.map((city: string) => ({ name: city })));
      } else {
        setCities([]);
      }
    } catch (error) {
      console.error("Error fetching cities:", error);
      setCities([]);
    } finally {
      setIsLoadingLocationData(false);
    }
  };

  const geocodeLocation = async (city: string, state: string, country: string) => {
    setIsGeocoding(true);
    try {
      const query = `${city}, ${state}, ${country}`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setManualLocation((prev) => ({
          ...prev,
          city,
          country,
          lat,
          lng: lon,
        }));
        // Also update the main location state
        setLocation((prev) => ({
          ...prev,
          city,
          country,
          lat: parseFloat(lat),
          lng: parseFloat(lon),
        }));
      } else {
        toast.error("Could not find coordinates for this location.");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast.error("Error determining location coordinates.");
    } finally {
      setIsGeocoding(false);
    }
  };

  // Load existing profile data if user has partial profile
  const loadExistingProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      if (data.success && data.data.user) {
        const user = data.data.user;

        // Prefill gender and birthday
        if (user.gender) setUserGender(user.gender);
        if (user.dateOfBirth) {
          const date = new Date(user.dateOfBirth);
          setUserBirthday(date.toISOString().split("T")[0]);
        }

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
          const lat = user.location.coordinates[1];
          const lng = user.location.coordinates[0];
          const city = user.location.city || "";
          const country = user.location.country || "";

          setLocation({ lat, lng, city, country });
          setManualLocation({
            city,
            country,
            lat: lat.toString(),
            lng: lng.toString(),
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
          const metadata: { [key: number]: { url: string; publicId: string } } = {};
          
          user.photos.forEach((photo: any, index: number) => {
            metadata[index] = {
              url: photo.url,
              publicId: photo.publicId,
            };
          });
          
          // Pad with empty strings to maintain 6 slots
          while (photoUrls.length < 6) {
            photoUrls.push("");
          }
          setPhotos(photoUrls);
          setPhotoMetadata(metadata);
        }
      }
    } catch (error) {
      console.error("Error loading existing profile:", error);
      // Don't show error toast here as this is just for prefilling
    }
  };

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
            const city = data.city || data.locality || "";
            const country = data.countryName || "";

            setLocation((prev) => ({
              ...prev,
              city,
              country,
            }));

            setManualLocation({
              city,
              country,
              lat: latitude.toString(),
              lng: longitude.toString(),
            });
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
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 },
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

  // Handle photo deletion
  const handlePhotoDelete = async (index: number) => {
    const metadata = photoMetadata[index];
    if (!metadata?.publicId) {
      // If no publicId, just remove locally (for new photos not yet saved)
      setPhotos((prev) => prev.map((p, i) => (i === index ? "" : p)));
      setPhotoMetadata((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `${API_BASE_URL}/upload/photo/${metadata.publicId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();
      if (data.success) {
        setPhotos((prev) => prev.map((p, i) => (i === index ? "" : p)));
        setPhotoMetadata((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        toast.success("Photo deleted successfully");
      } else {
        toast.error(data.message || "Failed to delete photo");
      }
    } catch (error) {
      console.error("Photo delete error:", error);
      toast.error("Error deleting photo. Please try again.");
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    index?: number,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const targetIndex =
      typeof index === "number"
        ? index
        : photos.findIndex((photo) => photo === "");

    if (targetIndex === -1) return;

    // Create local preview
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviews((prev) => ({ ...prev, [targetIndex]: previewUrl }));
    setUploadProgress((prev) => ({ ...prev, [targetIndex]: 0 }));

    const formData = new FormData();
    formData.append("photo", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress((prev) => ({
          ...prev,
          [targetIndex]: percentComplete,
        }));
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          setPhotos((prev) => {
            const newPhotos = [...prev];
            newPhotos[targetIndex] = data.data.photo.url;
            return newPhotos;
          });
          // Store photo metadata with publicId
          setPhotoMetadata((prev) => ({
            ...prev,
            [targetIndex]: {
              url: data.data.photo.url,
              publicId: data.data.photo.publicId,
            },
          }));
          toast.success("Photo uploaded successfully");
        } else {
          toast.error(data.message || "Upload failed");
        }
      } else {
        toast.error("Upload failed");
      }
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[targetIndex];
        return next;
      });
      setLocalPreviews((prev) => {
        const next = { ...prev };
        delete next[targetIndex];
        return next;
      });
    };

    xhr.onerror = () => {
      toast.error("Network error during upload");
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[targetIndex];
        return next;
      });
      setLocalPreviews((prev) => {
        const next = { ...prev };
        delete next[targetIndex];
        return next;
      });
    };

    xhr.open("POST", `${API_BASE_URL}/upload/photo`);
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${localStorage.getItem("accessToken")}`,
    );
    xhr.send(formData);
  };

  // Handle interest selection
  const handleInterestToggle = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest],
    );
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Basic validation
    if (photos.filter((p) => p).length < 2) {
      toast.error("Please upload at least 2 photos");
      return;
    }

    let finalLocation = { ...location };

    if (isManualLocation) {
      if (
        !manualLocation.city ||
        !manualLocation.country ||
        !manualLocation.lat ||
        !manualLocation.lng
      ) {
        toast.error("Please fill in all manual location fields");
        return;
      }
      finalLocation = {
        city: manualLocation.city,
        country: manualLocation.country,
        lat: parseFloat(manualLocation.lat),
        lng: parseFloat(manualLocation.lng),
      };

      if (isNaN(finalLocation.lat) || isNaN(finalLocation.lng)) {
        toast.error("Please enter valid numerical values for Latitude and Longitude");
        return;
      }
    }

    if (
      !finalLocation.city ||
      finalLocation.lat === 0 ||
      finalLocation.lng === 0
    ) {
      toast.error("Please allow location access or enter it manually");
      return;
    }

    if (gettingLocation) {
      toast.error("Please wait for your location to be determined");
      return;
    }

    if (!userGender) {
      toast.error("Please select your gender");
      return;
    }

    if (!userBirthday) {
      toast.error("Please enter your date of birth");
      return;
    }

    if (!bio.trim() || bio.trim().length <= 10) {
      toast.error("Please add a bio (at least 11 characters)");
      return;
    }

    setLoading(true);
    try {
      const profileData = {
        gender: userGender,
        dateOfBirth: userBirthday,
        bio,
        interests: selectedInterests.map((interest) => interest.split(" ")[0]), // Remove emojis
        location: {
          type: "Point",
          coordinates: [finalLocation.lng, finalLocation.lat], // [longitude, latitude]
          city: finalLocation.city,
          country: finalLocation.country,
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
        const updatedUser = data.data?.user;
        await checkAuthStatus();

        const isComplete = updatedUser
          ?
              typeof updatedUser.profileCompletion === 'number'
                ? updatedUser.profileCompletion >= 80
                : updatedUser.firstName &&
                  updatedUser.dateOfBirth &&
                  updatedUser.gender &&
                  updatedUser.location?.city &&
                  updatedUser.bio &&
                  updatedUser.bio.trim().length > 0 &&
                  updatedUser.photos &&
                  updatedUser.photos.length >= 2
          : false;

        if (isComplete) {
          // Navigate to discovery page after a brief delay to let user see success message
          setTimeout(() => {
            navigate("/discovery");
          }, 1500);
        }
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
            <button
              className={`${styles.iconButton} group`}
              onClick={() => navigate(-1)}
            >
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
          {/* SECTION 0: BASIC INFO */}
          <section className="flex flex-col gap-5">
            <div className={styles.sectionHeader}>
              <h1>First things first.</h1>
              <p>Tell us a bit about yourself.</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-500 dark:text-white/60 uppercase tracking-wider">
                  I am a
                </label>
                <select
                  className="p-4 rounded-2xl bg-slate-100 dark:bg-white/10 border-none outline-none focus:ring-2 focus:ring-[#f42559] transition-all font-semibold"
                  value={userGender}
                  onChange={(e) => setUserGender(e.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-500 dark:text-white/60 uppercase tracking-wider">
                  My Birthday
                </label>
                <input
                  type="date"
                  className="p-4 rounded-2xl bg-slate-100 dark:bg-white/10 border-none outline-none focus:ring-2 focus:ring-[#f42559] transition-all font-semibold"
                  value={userBirthday}
                  onChange={(e) => setUserBirthday(e.target.value)}
                />
              </div>
            </div>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 1: VISUALS (PHOTOS) */}
          <section className="flex flex-col gap-5">
            <div className={styles.sectionHeader}>
              <h1>Show yourself off.</h1>
              <p>Add at least 2 photos to get started.</p>
            </div>

            <div className={styles.photoGrid}>
              {photos.map((photo, index) => {
                const isUploading = uploadProgress[index] !== undefined;
                const progress = uploadProgress[index] || 0;
                const previewUrl = localPreviews[index];

                if (photo || isUploading) {
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
                          backgroundImage: `url('${photo || previewUrl}')`,
                        }}
                      ></div>
                      {isUploading && (
                        <div className={styles.progressOverlay}>
                          <div className={styles.progressCircle}>
                            <svg viewBox="0 0 36 36" className={styles.circularChart}>
                              <path
                                className={styles.circleBg}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className={styles.circle}
                                strokeDasharray={`${progress}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <text x="18" y="20.35" className={styles.percentage}>
                                {progress}%
                              </text>
                            </svg>
                          </div>
                        </div>
                      )}
                      {index === 0 && (
                        <>
                          <div className={styles.photoOverlay}></div>
                          <div className={styles.mainBadge}>MAIN</div>
                        </>
                      )}
                      <button
                        className={styles.editButton}
                        onClick={() => fileInputRefs.current[index]?.click()}
                      >
                        <Icon name="edit" className="text-sm" />
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        ref={(el) => (fileInputRefs.current[index] = el)}
                        onChange={(e) => handlePhotoUpload(e, index)}
                        className="hidden"
                      />
                      {index > 0 && (
                        <button
                          className={styles.removeButton}
                          onClick={() => handlePhotoDelete(index)}
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
              <div className={styles.sliderTrack}>
                <div className={styles.sliderRail}></div>
                <div
                  className={styles.sliderFill}
                  style={{
                    left: `${((ageRange.min - 18) / (100 - 18)) * 100}%`,
                    right: `${100 - ((ageRange.max - 18) / (100 - 18)) * 100}%`,
                    width: "auto",
                  }}
                ></div>
                <input
                  type="range"
                  min="18"
                  max="100"
                  value={ageRange.min}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setAgeRange((prev) => ({
                      ...prev,
                      min: Math.min(val, prev.max - 1),
                    }));
                  }}
                  className={styles.sliderInput}
                />
                <input
                  type="range"
                  min="18"
                  max="100"
                  value={ageRange.max}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setAgeRange((prev) => ({
                      ...prev,
                      max: Math.max(val, prev.min + 1),
                    }));
                  }}
                  className={styles.sliderInput}
                />
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
              <div className={styles.sliderTrack}>
                <div className={styles.sliderRail}></div>
                <div
                  className={styles.sliderFill}
                  style={{
                    width: `${((distance - 1) / (500 - 1)) * 100}%`,
                  }}
                ></div>
                <input
                  type="range"
                  min="1"
                  max="500"
                  value={distance}
                  onChange={(e) => {
                    setDistance(parseInt(e.target.value));
                  }}
                  className={styles.sliderInput}
                />
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

            {!isManualLocation ? (
              <>
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
                <button
                  onClick={() => setIsManualLocation(true)}
                  className="text-xs text-blue-500 hover:underline text-left mt-1 self-start"
                >
                  Enter location manually
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Manual Location</h3>
                    {(isLoadingLocationData || isGeocoding) && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsManualLocation(false)}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Use Automatic
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <select
                    className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none focus:border-blue-500 transition-colors w-full"
                    value={selectedCountry}
                    onChange={(e) => {
                      const country = e.target.value;
                      setSelectedCountry(country);
                      setSelectedState("");
                      setSelectedCity("");
                      setStates([]);
                      setCities([]);
                      if (country) fetchStates(country);
                    }}
                  >
                    <option value="">Select Country</option>
                    {countries.map((c: any) => (
                      <option key={c.iso2} value={c.country}>
                        {c.country}
                      </option>
                    ))}
                  </select>

                  <select
                    className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none focus:border-blue-500 transition-colors w-full disabled:opacity-50"
                    value={selectedState}
                    disabled={!selectedCountry || states.length === 0}
                    onChange={(e) => {
                      const state = e.target.value;
                      setSelectedState(state);
                      setSelectedCity("");
                      setCities([]);
                      if (state) fetchCities(selectedCountry, state);
                    }}
                  >
                    <option value="">Select State</option>
                    {states.map((s: any) => (
                      <option key={s.state_code || s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none focus:border-blue-500 transition-colors w-full disabled:opacity-50"
                    value={selectedCity}
                    disabled={!selectedState || cities.length === 0}
                    onChange={(e) => {
                      const city = e.target.value;
                      setSelectedCity(city);
                      if (city)
                        geocodeLocation(city, selectedState, selectedCountry);
                    }}
                  >
                    <option value="">Select City/LGA</option>
                    {cities.map((c: any) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  {manualLocation.lat && manualLocation.lng && (
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between px-1">
                      <span>Lat: {parseFloat(manualLocation.lat).toFixed(4)}</span>
                      <span>Lng: {parseFloat(manualLocation.lng).toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
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
