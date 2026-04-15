const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const {
  signup,
  login,
  refresh,
  logout,
  me,
  googleLogin,
  getGoogleClientId,
  googleCallback,
  signupValidation,
  loginValidation,
} = require("../controllers/authController");
const passport = require("passport");

const router = express.Router();

// @route   POST /api/auth/signup
// @desc    Register user
// @access  Public
router.post("/signup", signupValidation, signup);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", loginValidation, login);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public (with refresh token)
router.post("/refresh", refresh);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post("/logout", authenticateToken, logout);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", authenticateToken, me);

// @route   GET /api/auth/google
// @desc    Google OAuth login/signup
// @access  Public
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth", session: false }),
  googleCallback
);

// @route   POST /api/auth/google
// @desc    Google OAuth login/signup (Legacy - for mobile/external apps if needed)
// @access  Public
router.post("/google", googleLogin);

// @route   GET /api/auth/google-client-id
// @desc    Get Google Client ID
// @access  Public
router.get("/google-client-id", getGoogleClientId);

module.exports = router;
