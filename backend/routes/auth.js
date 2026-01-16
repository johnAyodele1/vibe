const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const {
  signup,
  login,
  refresh,
  logout,
  me,
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

module.exports = router;
