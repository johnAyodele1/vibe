const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { getMatches, unmatch } = require("../controllers/matchController");

const router = express.Router();

// @route   GET /api/matches
// @desc    Get user's matches
// @access  Private
router.get("/", authenticateToken, getMatches);

// @route   DELETE /api/matches/:id
// @desc    Unmatch with a user
// @access  Private
router.delete("/:id", authenticateToken, unmatch);

module.exports = router;
