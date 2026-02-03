import React, { useState, useEffect } from "react";
import styles from "./Settings.module.css";
import { useNavigate } from "react-router-dom";
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
  email: string;
  age: number;
  isPremium: boolean;
  photos: Array<{
    url: string;
    isMain: boolean;
  }>;
  preferences: {
    genderPreference: string;
    ageRange: {
      min: number;
      max: number;
    };
    maxDistance: number;
  };
  settings: {
    notifications: {
      matches: boolean;
      messages: boolean;
      likes: boolean;
    };
    privacy: {
      showOnlineStatus: boolean;
      showDistance: boolean;
      showAge: boolean;
    };
  };
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true); // Default to dark based on HTML
  const [user, setUser] = useState<User | null>(null);

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        navigate("/");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.data.user);
      } else {
        toast.error("Failed to load profile");
      }
    } catch (error) {
      console.error("Fetch profile error:", error);
      toast.error("Network error");
    }
  };

  const updateUserSettings = async (updates: Partial<User>) => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        navigate("/");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.data.user);
        toast.success("Settings updated");
      } else {
        toast.error(data.message || "Failed to update settings");
      }
    } catch (error) {
      console.error("Update settings error:", error);
      toast.error("Network error");
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear tokens and navigate even if logout request fails
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      navigate("/");
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete your account? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        navigate("/");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        toast.success("Account deleted successfully");
        navigate("/");
      } else {
        toast.error(data.message || "Failed to delete account");
      }
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error("Network error");
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  return (
    // Outer Wrapper for Background context and centering
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
          <div className="w-12"></div> {/* Spacer */}
          <h2 className={styles.headerTitle}>Settings</h2>
          <div className="flex w-12 items-center justify-end">
            <button
              className={styles.doneBtn}
              onClick={() => navigate("/my-profile")}
            >
              Done
            </button>
          </div>
        </div>

        {/* Profile Header Section */}
        <div className={styles.profileSection}>
          <div className={styles.userInfo}>
            <div
              className={styles.avatar}
              style={{
                backgroundImage:
                  user?.photos && user.photos.length > 0
                    ? `url("${
                        user.photos.find((photo) => photo.isMain)?.url ||
                        user.photos[0].url
                      }")`
                    : 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAvjzjVf_4mGJbjO-RfA2CpjAXhoG5k38swJ0m6FGCqe-L_RWI6uCcFdPyh1-CNs7FJoEWvfJRlvOjJBO7NzBhPXm5lAvBUOzUeVSx0IPaUY8l_URDQVNRFslBaoZZmhr7PvbM3hSijqUJZvNeSCo9HUx_cTA2PgZP55HUbe-zB-EiaJSYriTbBxYHAYAgnSz4-_-gER_f8dd9ZfyDDP2a3qyQClRxq06bVcN4doWG5A8tBT0vh9Tey2SsrBf94_WO1GYu5mYNiRCY")',
              }}
            ></div>
            <div>
              <p className={styles.userName}>
                {user
                  ? `${user.firstName} ${user.lastName}, ${user.age}`
                  : "Loading..."}
              </p>
              <p className={styles.userStatus}>
                {user?.isPremium ? "Premium Member" : "Basic Member"}
              </p>
            </div>
          </div>

          {/* Premium Card */}
          <div className={styles.premiumCard}>
            <div className={styles.fireIconBg}>
              <Icon name="local_fire_department" className="text-9xl" />
            </div>
            <div className={styles.premiumContent}>
              <div className="flex flex-col gap-1">
                <div className={styles.premiumTitle}>
                  <Icon name="verified" className="text-primary" />
                  Get Hookup+
                </div>
                <p className={styles.premiumDesc}>
                  See who likes you & go incognito.
                </p>
              </div>
              <button className={styles.upgradeBtn}>Upgrade Now</button>
            </div>
          </div>
        </div>

        {/* Section: Account Settings */}
        <div>
          <h3 className={styles.sectionTitle}>Account Settings</h3>
          <div className={styles.listGroup}>
            {/* Phone */}
            <div className={styles.listItem}>
              <div className={styles.itemLabel}>
                <Icon
                  name="phone_iphone"
                  className="text-gray-400 dark:text-[#ba9ca3]"
                />
                Phone Number
              </div>
              <div className={styles.itemValue}>
                <span>Unknown</span>
                <Icon name="arrow_forward_ios" className="text-lg opacity-50" />
              </div>
            </div>
            {/* Email */}
            <div className={styles.listItem}>
              <div className={styles.itemLabel}>
                <Icon
                  name="mail"
                  className="text-gray-400 dark:text-[#ba9ca3]"
                />
                Email
              </div>
              <div className={styles.itemValue}>
                <span>{user?.email || "Loading..."}</span>
                <Icon name="arrow_forward_ios" className="text-lg opacity-50" />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Discovery */}
        <div>
          <h3 className={styles.sectionTitle}>Discovery</h3>
          <div className={styles.listGroup}>
            {/* Distance Slider */}
            <div className={styles.sliderContainer}>
              <div className={styles.sliderHeader}>
                <p className={styles.itemLabel}>Maximum Distance</p>
                <p className="font-bold text-sm text-gray-500 dark:text-[#ba9ca3]">
                  {user?.preferences.maxDistance || 50} km
                </p>
              </div>
              <div className={styles.sliderTrack}>
                <div className={styles.trackBg}></div>
                <div
                  className={styles.trackFill}
                  style={{
                    width: `${
                      (((user?.preferences.maxDistance || 50) - 1) /
                        (500 - 1)) *
                      100
                    }%`,
                  }}
                ></div>
                <input
                  type="range"
                  min="1"
                  max="500"
                  value={user?.preferences.maxDistance || 50}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    updateUserSettings({
                      preferences: {
                        genderPreference:
                          user?.preferences.genderPreference || "Everyone",
                        ageRange: user?.preferences.ageRange || {
                          min: 18,
                          max: 50,
                        },
                        maxDistance: value,
                      },
                    });
                  }}
                  className={styles.sliderInput}
                />
              </div>
            </div>

            {/* Age Slider */}
            <div className={styles.sliderContainer}>
              <div className={styles.sliderHeader}>
                <p className={styles.itemLabel}>Age Range</p>
                <p className="font-bold text-sm text-gray-500 dark:text-[#ba9ca3]">
                  {user?.preferences.ageRange.min || 18} -{" "}
                  {user?.preferences.ageRange.max || 50}
                </p>
              </div>
              <div className={styles.sliderTrack}>
                <div className={styles.trackBg}></div>
                <div
                  className={styles.trackFill}
                  style={{ left: "10%", right: "60%", width: "auto" }}
                ></div>
                <div
                  className={styles.thumb}
                  style={{ left: "10%", marginLeft: "-0.75rem" }}
                ></div>
                <div
                  className={styles.thumb}
                  style={{ right: "60%", marginRight: "-0.75rem" }}
                ></div>
              </div>
            </div>

            {/* Show Me */}
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>Show Me</p>
              <select
                className={styles.itemValueSelect}
                value={user?.preferences.genderPreference || "Everyone"}
                onChange={(e) => {
                  const value = e.target.value;
                  updateUserSettings({
                    preferences: {
                      genderPreference: value,
                      ageRange: user?.preferences.ageRange || {
                        min: 18,
                        max: 50,
                      },
                      maxDistance: user?.preferences.maxDistance || 50,
                    },
                  });
                }}
              >
                <option value="Everyone">Everyone</option>
                <option value="Male">Men</option>
                <option value="Female">Women</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section: Privacy */}
        <div>
          <h3 className={styles.sectionTitle}>
            <Icon name="lock" className="text-sm" />
            Privacy Control
          </h3>
          <div className={styles.listGroup}>
            {/* Incognito */}
            <div className={styles.listItem}>
              <div className="flex flex-col">
                <p className={styles.itemLabel}>Incognito Mode</p>
                <p className={styles.subText}>
                  Only show me to people I've liked
                </p>
              </div>
              <label className={styles.toggleWrapper}>
                <input type="checkbox" className={styles.toggleInput} />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
            {/* Ghost Mode */}
            <div className={styles.listItem}>
              <div className="flex flex-col">
                <p className={styles.itemLabel}>Ghost Mode</p>
                <p className={styles.subText}>Hide my online status</p>
              </div>
              <label className={styles.toggleWrapper}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={!(user?.settings.privacy.showOnlineStatus ?? true)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateUserSettings({
                      settings: {
                        notifications: user?.settings.notifications || {
                          matches: true,
                          messages: true,
                          likes: false,
                        },
                        privacy: {
                          showOnlineStatus: !checked,
                          showDistance:
                            user?.settings.privacy.showDistance ?? true,
                          showAge: user?.settings.privacy.showAge ?? true,
                        },
                      },
                    });
                  }}
                />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
            {/* Block Contacts */}
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>Block Contacts</p>
              <Icon
                name="arrow_forward_ios"
                className="text-lg text-gray-400 dark:text-[#543b41]"
              />
            </div>
          </div>
        </div>

        {/* Section: Notifications */}
        <div>
          <h3 className={styles.sectionTitle}>Notifications</h3>
          <div className={styles.listGroup}>
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>New Matches</p>
              <label className={styles.toggleWrapper}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={user?.settings.notifications.matches ?? true}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateUserSettings({
                      settings: {
                        notifications: {
                          matches: checked,
                          messages:
                            user?.settings.notifications.messages ?? true,
                          likes: user?.settings.notifications.likes ?? false,
                        },
                        privacy: user?.settings.privacy || {
                          showOnlineStatus: true,
                          showDistance: true,
                          showAge: true,
                        },
                      },
                    });
                  }}
                />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>Messages</p>
              <label className={styles.toggleWrapper}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={user?.settings.notifications.messages ?? true}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateUserSettings({
                      settings: {
                        notifications: {
                          matches: user?.settings.notifications.matches ?? true,
                          messages: checked,
                          likes: user?.settings.notifications.likes ?? false,
                        },
                        privacy: user?.settings.privacy || {
                          showOnlineStatus: true,
                          showDistance: true,
                          showAge: true,
                        },
                      },
                    });
                  }}
                />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>Super Likes</p>
              <label className={styles.toggleWrapper}>
                <input
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={user?.settings.notifications.likes ?? false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateUserSettings({
                      settings: {
                        notifications: {
                          matches: user?.settings.notifications.matches ?? true,
                          messages:
                            user?.settings.notifications.messages ?? true,
                          likes: checked,
                        },
                        privacy: user?.settings.privacy || {
                          showOnlineStatus: true,
                          showDistance: true,
                          showAge: true,
                        },
                      },
                    });
                  }}
                />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section: Actions */}
        <div className={styles.actions}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Log Out
          </button>

          <div className={styles.versionInfo}>
            <button className={styles.deleteBtn} onClick={handleDeleteAccount}>
              Delete Account
            </button>
            <div className="flex flex-col items-center mt-4">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBYK3ohVZgSiHY4PeOQ_IYaUDBHOp20bFxqfwhOcelOyIGVMWWGLoXGumpYJPoXzbYnnXIMvo_46GkUp7AQACMt0trpDVqJWFkbj4BCGzdM5BCPmjy3TzNHImejwWiOor5J73r_mKc5346yby1eaZNkvQFI2m9Jh6FfSS-CGdWAQwuCMLcLHsv4kT2LrpwtcoPQWnujzHOzHvW2fpA-0CVeGZWx0lpJt8FHggiYw9N1Raswy4Riq8oKTS_OChejHuSI2ClsSQIeTc4"
                alt="Logo"
                className={styles.logo}
              />
              <p className={styles.versionText}>Version 4.2.0 (1832)</p>
            </div>
          </div>

          {/* Theme Toggle for Demo Purpose */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="mt-4 text-xs text-gray-400 underline"
          >
            Switch Theme ({isDark ? "Dark" : "Light"})
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
