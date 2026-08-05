import React from "react";
import styles from "./Onboarding.module.css";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../../config";

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.wrapper}>
      {/* Phone container */}
      <div className={styles.container}>
        {/* Header / Logo */}
        <div className={styles.header}>
          <h1 className={styles.logo}>VIBE</h1>
        </div>

        {/* Hero Section */}
        <div className={styles.hero}>
          <div
            className={styles.heroImage}
            role="img"
            aria-label="Abstract energetic dark purple and pink neon lighting visuals"
          />
          <div className={styles.heroOverlayTop} />
          <div className={styles.heroOverlayBottom} />
        </div>

        {/* Content Bottom Sheet */}
        <div className={styles.contentSheet}>
          {/* Headline & Subtext */}
          <div className={styles.headlineGroup}>
            <h2 className={styles.title}>Find your chemistry tonight.</h2>
            <p className={styles.subtitle}>
              Casual connections, verified profiles, zero stress.
            </p>
          </div>

          {/* Feature Carousel */}
          <div className={styles.features}>
            <div className={styles.featureRow}>
              {/* Item 1 */}
              <div className={styles.featureItem}>
                <div className={styles.iconCircle}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "32px" }}
                  >
                    bolt
                  </span>
                </div>
                <p className={styles.featureLabel}>Match Instantly</p>
              </div>

              {/* Item 2 */}
              <div className={styles.featureItem}>
                <div className={styles.iconCircle}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "32px" }}
                  >
                    verified_user
                  </span>
                </div>
                <p className={styles.featureLabel}>Safe & Discreet</p>
              </div>

              {/* Item 3 */}
              <div className={styles.featureItem}>
                <div className={styles.iconCircle}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "32px" }}
                  >
                    favorite_border
                  </span>
                </div>
                <p className={styles.featureLabel}>No Strings</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.buttonGroup}>
            <button className={`${styles.btnBase} ${styles.btnPrimary}`}>
              <span
                className={styles.btnText}
                onClick={() => navigate("/auth")}
              >
                Get Started Free
              </span>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "20px" }}
              >
                arrow_forward
              </span>
            </button>
            <button
              className={`${styles.btnBase} ${styles.btnSecondary}`}
              onClick={() => navigate("/auth")}
            >
              <span className={styles.btnSecondaryText}>
                I already have an account
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className={styles.divider}>
            <div className={styles.line} />
            <span className={styles.dividerText}>Or continue with</span>
            <div className={styles.line} />
          </div>

          {/* Social Login Row */}
          <div className={styles.socialRow}>
            <button
              className={styles.googleBtn}
              onClick={() => (window.location.href = `${API_BASE_URL}/auth/google`)}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className={styles.googleIcon}
              />
              <span>Continue with Google</span>
            </button>
          </div>

          {/* Footer / Legal */}
          <p className={styles.footer}>
            By signing up, you agree to our{" "}
            <a className={styles.link} href="#">
              Terms of Service
            </a>{" "}
            and{" "}
            <a className={styles.link} href="#">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
