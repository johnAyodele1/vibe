import React, { useState } from "react";
import styles from "./Auth.module.css";
import { useNavigate } from "react-router-dom";

const Connect: React.FC = () => {
  const navigate = useNavigate();
  const [authType, setAuthType] = useState<"signup" | "login">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [dateType, setDateType] = useState("text");

  return (
    <div className={styles.wrapper}>
      {/* Background Image with Overlay */}
      <div className={styles.backgroundContainer}>
        <div className={styles.bgOverlaySolid} />
        <div className={styles.bgOverlayGradient} />
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCA7bLZBJdrOwv6AOKlSBhG7eZaffGIemEbDiYxjpjw3TuwrW5RyUJNNV7S8PXhuCN1iS3qm6XcFbIkLvNbaKCoKBwo2FgJqIwH4y9QvaUh7jdjUFnrYEEzvhI3Vcdzf_Bf2Am-oORbArx3VwcQdJ7gCjX9cyOw0SBwub0zLILuuNHO_8yq3fcn-EoINHklsq0d4P-rIl_mh8KA-u61orT-kE0JY7hy9mYtNVU57x0fUS0o_LbYnsVJZV7SA0O8621asVOihmIvC0g"
          alt="Abstract blurred dark red and purple lights in a night club atmosphere"
          className={styles.bgImage}
        />
      </div>

      {/* Content Wrapper */}
      <div className={styles.content}>
        {/* Hero Section */}
        <div className={styles.hero}>
          <div className={styles.heroIconWrapper}>
            <div className={styles.heroIcon}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px", color: "white" }}
              >
                favorite
              </span>
            </div>
          </div>
          <h1 className={styles.title}>Connect Instantly.</h1>
          <p className={styles.subtitle}>Find your match nearby, tonight.</p>
        </div>

        {/* Segmented Buttons (Auth Toggle) */}
        <div className={styles.toggleContainer}>
          <div className={styles.toggleWrapper}>
            <div
              onClick={() => setAuthType("signup")}
              className={`${styles.toggleOption} ${
                authType === "signup" ? styles.toggleOptionActive : ""
              }`}
            >
              Sign Up
            </div>
            <div
              onClick={() => setAuthType("login")}
              className={`${styles.toggleOption} ${
                authType === "login" ? styles.toggleOptionActive : ""
              }`}
            >
              Log In
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className={styles.formStack}>
          {/* Email Field */}
          <div className={styles.inputWrapper}>
            <input
              type="email"
              placeholder="Email or Phone Number"
              className={styles.input}
            />
            <div className={styles.iconSuffix}>
              <span className="material-symbols-outlined">mail</span>
            </div>
          </div>

          {/* Password Field */}
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              className={styles.input}
            />
            <div
              className={`${styles.iconSuffix} ${styles.iconSuffixInteractive}`}
              onClick={() => setShowPassword(!showPassword)}
            >
              <span className="material-symbols-outlined">
                {showPassword ? "visibility" : "visibility_off"}
              </span>
            </div>
          </div>

          {/* Date of Birth (Sign Up Only) */}
          {authType === "signup" && (
            <div className={styles.inputWrapper}>
              <input
                type={dateType}
                placeholder="Date of Birth"
                className={styles.input}
                onFocus={() => setDateType("date")}
                onBlur={() => setDateType("text")}
              />
              <div className={styles.iconSuffix}>
                <span className="material-symbols-outlined">
                  calendar_today
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          className={styles.primaryBtn}
          onClick={() => navigate("/profile")}
        >
          {authType === "signup" ? "Get Started" : "Log In"}
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "20px" }}
          >
            arrow_forward
          </span>
        </button>

        {/* Divider */}
        <div className={styles.divider}>
          <div className={styles.line} />
          <span className={styles.dividerText}>Or continue with</span>
          <div className={styles.line} />
        </div>

        {/* Social Login */}
        <div className={styles.socialRow}>
          {/* Apple */}
          <button className={styles.socialBtn}>
            <svg
              className={styles.svgIcon}
              viewBox="0 0 24 24"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.36-1.09-.56-2.1-.48-3.08.36-1.04.84-2.17.2-2.88-.84-3.15-4.43-1.66-8.54 2.22-8.54 1.35 0 2.29.6 3.03.6 1.05 0 1.95-.7 3.32-.7 1.48.06 2.45.69 3.05 1.55-.17.07-1.88 1.1-1.89 3.19.01 2.53 2.22 3.4 2.25 3.42-.03.11-.34 1.16-1.11 2.27-.69 1.01-1.42 2-2.48 2.04l-.05.01-.3.28zm-3.66-16.14c.28 1.54-1.12 3.09-2.58 3.13-1.39-.03-2.73-1.57-2.48-3.09.28-1.5 1.7-2.9 3.03-2.92 1.39.02 2.62 1.54 2.03 2.88z" />
            </svg>
          </button>
          {/* Google */}
          <button className={styles.socialBtn}>
            <svg
              className={styles.svgIcon}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          </button>
          {/* Instagram */}
          <button className={styles.socialBtn}>
            <svg
              className={styles.svgIcon}
              viewBox="0 0 24 24"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.069-4.85.069-3.204 0-3.584-.012-4.849-.069-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
          </button>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p>
            By continuing, you agree to our{" "}
            <a href="#" className={styles.link}>
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className={styles.link}>
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default Connect;
