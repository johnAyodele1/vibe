const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const {
  getConversations,
  getMessages,
  sendMessage,
} = require("../controllers/messageController");

const router = express.Router();

// @route   GET /api/messages/conversations
// @desc    Get user's conversations
// @access  Private
router.get("/conversations", authenticateToken, getConversations);

// @route   GET /api/messages/:conversationId
// @desc    Get messages for a conversation
// @access  Private
router.get("/:conversationId", authenticateToken, getMessages);

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post("/", authenticateToken, sendMessage);

module.exports = router;
