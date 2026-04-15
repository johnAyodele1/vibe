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
  signupValidation,
  loginValidation,
} = require("../controllers/authController");

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

// @route   POST /api/auth/google
// @desc    Google OAuth login/signup
// @access  Public
router.post("/google", googleLogin);

// @route   GET /api/auth/google-client-id
// @desc    Get Google Client ID
// @access  Public
router.get("/google-client-id", getGoogleClientId);

module.exports = router;
