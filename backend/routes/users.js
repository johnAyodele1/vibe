const updateOnlineStatus = require("../middleware/onlineStatus");
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const {
  getProfile,
  updateProfile,
  discover,
  like,
  dislike,
  deleteAccount,
} = require("../controllers/userController");

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get("/profile", authenticateToken, updateOnlineStatus, getProfile);

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", authenticateToken, updateOnlineStatus, updateProfile);

// @route   GET /api/users/discover
// @desc    Get users for discovery/matching
// @access  Private
router.get("/discover", authenticateToken, updateOnlineStatus, discover);

// @route   POST /api/users/:id/like
// @desc    Like a user
// @access  Private
router.post("/:id/like", authenticateToken, updateOnlineStatus, like);

// @route   POST /api/users/:id/dislike
// @desc    Dislike a user
// @access  Private
router.post("/:id/dislike", authenticateToken, updateOnlineStatus, dislike);

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete("/account", authenticateToken, updateOnlineStatus, deleteAccount);

module.exports = router;
