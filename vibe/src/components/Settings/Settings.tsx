import React, { useState } from "react";
import styles from "./Settings.module.css";
import { useNavigate } from "react-router-dom";

const Icon = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => <span className={`material-symbols-outlined ${className}`}>{name}</span>;

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true); // Default to dark based on HTML

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
                  'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAvjzjVf_4mGJbjO-RfA2CpjAXhoG5k38swJ0m6FGCqe-L_RWI6uCcFdPyh1-CNs7FJoEWvfJRlvOjJBO7NzBhPXm5lAvBUOzUeVSx0IPaUY8l_URDQVNRFslBaoZZmhr7PvbM3hSijqUJZvNeSCo9HUx_cTA2PgZP55HUbe-zB-EiaJSYriTbBxYHAYAgnSz4-_-gER_f8dd9ZfyDDP2a3qyQClRxq06bVcN4doWG5A8tBT0vh9Tey2SsrBf94_WO1GYu5mYNiRCY")',
              }}
            ></div>
            <div>
              <p className={styles.userName}>Alex, 24</p>
              <p className={styles.userStatus}>Basic Member</p>
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
                <span>867-5309</span>
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
                <span>alex@example.com</span>
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
                  25 mi
                </p>
              </div>
              <div className={styles.sliderTrack}>
                <div className={styles.trackBg}></div>
                <div
                  className={styles.trackFill}
                  style={{ width: "32%" }}
                ></div>
                {/* Visual Thumb representation */}
                <div
                  className={styles.thumb}
                  style={{ transform: "translateX(100px)" }}
                ></div>
              </div>
            </div>

            {/* Age Slider */}
            <div className={styles.sliderContainer}>
              <div className={styles.sliderHeader}>
                <p className={styles.itemLabel}>Age Range</p>
                <p className="font-bold text-sm text-gray-500 dark:text-[#ba9ca3]">
                  20 - 30
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
              <div className={styles.itemValue}>
                <span>Everyone</span>
                <Icon name="arrow_forward_ios" className="text-lg opacity-50" />
              </div>
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
                  defaultChecked
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
                  defaultChecked
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
                  defaultChecked
                />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
            <div className={styles.listItem}>
              <p className={styles.itemLabel}>Super Likes</p>
              <label className={styles.toggleWrapper}>
                <input type="checkbox" className={styles.toggleInput} />
                <div className={styles.toggleTrack}></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section: Actions */}
        <div className={styles.actions}>
          <button className={styles.logoutBtn}>Log Out</button>

          <div className={styles.versionInfo}>
            <button className={styles.deleteBtn}>Delete Account</button>
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
