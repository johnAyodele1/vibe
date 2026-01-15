import React, { useState } from "react";
import styles from "./ProfileCreation.module.css";
import { useNavigate } from "react-router-dom";

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
  // Simple state to simulate interactivity
  const [isDark, setIsDark] = useState(true); // Default to Dark mode as per prompt
  const [activeGender, setActiveGender] = useState("Women");

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
              {/* Photo 1 (Main) */}
              <div
                className={`${styles.photoCard} ${styles.photoCardMain} group`}
              >
                <div
                  className={styles.photoImage}
                  style={{
                    backgroundImage:
                      "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAPJd37cAtMc602eB7E-NhMEOO74wpmXpvhWx8t1dTEGpfD4r83IuAItM0eX2kGSO0_C-IyG3SFdfLzoaO11h8x-iqqifckDPOQC3TvtI6YChr0Dia3l4WgsLWUA3GSlLnjyZdeH5Yb9BMEyNPpC0vIPwbV01PR01igw4S4QE5Abz4Sc_gS1KaydLwYusAaDGKsiOn_gOtRUQrIeDd7lr433VPJ7dRA5YPRKp_kAosmXzIGnSnzSUs0n9lUBcUVua_Qzshefq8u29I')",
                  }}
                ></div>
                <div className={styles.photoOverlay}></div>
                <div className={styles.mainBadge}>MAIN</div>
                <button className={styles.editButton}>
                  <Icon name="edit" className="text-sm" />
                </button>
              </div>

              {/* Photo 2 */}
              <div className={`${styles.photoCard} group`}>
                <div
                  className={styles.photoImage}
                  style={{
                    backgroundImage:
                      "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDUTHX4FsHz4eEGRBpHW87UYPrvlI7ThY77lTpYJJdUUdfwmhsLSBiJZBXYRaWKkKeaeDMJfRpnV0StD0J0jiIZTbAwsn_r0yFAyDkwuSBYGDIF3SLxPNQNg_njy0Ibp1kFFukSgvCa5ZU2hia4bv1TDkLtoyyVWmG05E3TuDTTTBywxcXx5mU88BGtvpE3BYnxN-WzGeO94SviQS2LoLEhuBBv1JzXGqkFQWOuUHj6MU92zXKkk-RzMWzRTr0bTxkLj4MmOx4K8gY')",
                  }}
                ></div>
                <button className={styles.removeButton}>
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>

              {/* Empty Slots */}
              {[1, 2, 3].map((_, i) => (
                <div key={i} className={`${styles.uploadCard} group`}>
                  <div className={styles.uploadIcon}>
                    <Icon name="add" className="text-xl font-bold" />
                  </div>
                </div>
              ))}
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
              <button className={`${styles.tag} ${styles.tagActive}`}>
                Late Night 🌙 <Icon name="check" className="text-[16px]" />
              </button>
              <button className={`${styles.tag} ${styles.tagActive}`}>
                Drinks 🍸 <Icon name="check" className="text-[16px]" />
              </button>
              <button className={styles.tag}>Clubbing 🪩</button>
              <button className={styles.tag}>Concerts 🎸</button>
              <button className={styles.tag}>Art 🎨</button>
              <button className={styles.tag}>Fitness 💪</button>
              <button className={styles.tag}>Travel ✈️</button>
              <button className={styles.tag}>Gaming 🎮</button>
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
                <span className={styles.sliderBadge}>18 - 28</span>
              </div>
              <div className={styles.sliderTrack}>
                <div className={styles.sliderRail}></div>
                {/* Active track width approx 30% */}
                <div
                  className={styles.sliderFill}
                  style={{ width: "30%", left: 0 }}
                ></div>
                {/* Handle 1 */}
                <div className={styles.sliderHandle} style={{ left: 0 }}></div>
                {/* Handle 2 (at 30%) */}
                <div
                  className={styles.sliderHandle}
                  style={{ left: "30%" }}
                ></div>
              </div>
            </div>

            {/* Distance Slider */}
            <div className="flex flex-col gap-4">
              <div className={styles.sliderHeader}>
                <span className="text-slate-500 dark:text-white/60">
                  Distance
                </span>
                <span className={styles.sliderBadge}>Up to 25km</span>
              </div>
              <div className={styles.sliderTrack}>
                <div className={styles.sliderRail}></div>
                <div
                  className={styles.sliderFill}
                  style={{ width: "40%" }}
                ></div>
                <div
                  className={styles.sliderHandle}
                  style={{ left: "40%" }}
                ></div>
              </div>
            </div>
          </section>

          <div className={styles.divider}></div>

          {/* SECTION 4: BIO */}
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
              ></textarea>
              <div className={styles.charCount}>0/150</div>
            </div>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className={styles.footer}>
          <button
            className={styles.continueBtn}
            onClick={() => navigate("/my-profile")}
          >
            Continue
            <Icon name="arrow_forward" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileCreation;
