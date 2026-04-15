import React, { useState } from "react";
import styles from "./Auth.module.css";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { GoogleLogin } from "@react-oauth/google";

const Connect: React.FC = () => {
  const navigate = useNavigate();
  const { login, signup, googleLogin } = useAuth();
  const [authType, setAuthType] = useState<"signup" | "login">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [dateType, setDateType] = useState("text");
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    try {
      if (credentialResponse.credential) {
        const success = await googleLogin(credentialResponse.credential);
        if (success) {
          toast.success("Logged in with Google!");
          // Check if profile is complete, if not redirect to profile creation
          // But for now follow standard flow
          navigate("/discovery");
        } else {
          toast.error("Google login failed");
        }
      }
    } catch (error) {
      console.error("Google login error:", error);
      toast.error("Google login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authType === "signup") {
        // Validate required fields
        if (
          !email ||
          !password ||
          !firstName ||
          !lastName ||
          !dateOfBirth ||
          !gender
        ) {
          toast.error("Please fill in all fields");
          return;
        }

        const success = await signup({
          email,
          password,
          firstName,
          lastName,
          dateOfBirth,
          gender,
        });

        if (success) {
          toast.success("Account created successfully!");
          navigate("/profile");
        } else {
          toast.error("Signup failed");
        }
      } else {
        // Login
        if (!email || !password) {
          toast.error("Please enter email and password");
          return;
        }

        const success = await login(email, password);

        if (success) {
          toast.success("Logged in successfully!");
          navigate("/discovery");
        } else {
          toast.error("Login failed");
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        <form
          id="auth-form"
          onSubmit={handleSubmit}
          className={styles.formStack}
        >
          {/* Email Field */}
          <div className={styles.inputWrapper}>
            <input
              type="email"
              placeholder="Email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          {/* First Name (Sign Up Only) */}
          {authType === "signup" && (
            <div className={styles.inputWrapper}>
              <input
                type="text"
                placeholder="First Name"
                className={styles.input}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <div className={styles.iconSuffix}>
                <span className="material-symbols-outlined">person</span>
              </div>
            </div>
          )}

          {/* Last Name (Sign Up Only) */}
          {authType === "signup" && (
            <div className={styles.inputWrapper}>
              <input
                type="text"
                placeholder="Last Name"
                className={styles.input}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <div className={styles.iconSuffix}>
                <span className="material-symbols-outlined">person</span>
              </div>
            </div>
          )}

          {/* Gender (Sign Up Only) */}
          {authType === "signup" && (
            <div className={styles.inputWrapper}>
              <select
                className={styles.input}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
              </select>
              <div className={styles.iconSuffix}>
                <span className="material-symbols-outlined">wc</span>
              </div>
            </div>
          )}

          {/* Date of Birth (Sign Up Only) */}
          {authType === "signup" && (
            <div className={styles.inputWrapper}>
              <input
                type={dateType}
                placeholder="Date of Birth"
                className={styles.input}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                onFocus={() => setDateType("date")}
              />
              <div className={styles.iconSuffix}>
                <span className="material-symbols-outlined">
                  calendar_today
                </span>
              </div>
            </div>
          )}
        </form>

        {/* Primary Action Button */}
        <button
          type="submit"
          form="auth-form"
          className={styles.primaryBtn}
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : authType === "signup"
            ? "Get Started"
            : "Log In"}
          {!loading && (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "20px" }}
            >
              arrow_forward
            </span>
          )}
        </button>

        {/* Divider */}
        <div className={styles.divider}>
          <div className={styles.line} />
          <span className={styles.dividerText}>Or continue with</span>
          <div className={styles.line} />
        </div>

        {/* Social Login */}
        <div className={styles.socialRow}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              toast.error("Google Login Failed");
            }}
            theme="filled_black"
            shape="pill"
            text="continue_with"
          />
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
