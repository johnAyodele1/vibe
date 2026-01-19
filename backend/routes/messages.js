const updateOnlineStatus = require("../middleware/onlineStatus");
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
} = require("../controllers/messageController");

const router = express.Router();

// @route   GET /api/messages/conversations
// @desc    Get user's conversations
// @access  Private
router.get(
  "/conversations",
  authenticateToken,
  updateOnlineStatus,
  getConversations,
);

// @route   GET /api/messages/conversation/:conversationId
// @desc    Get a specific conversation
// @access  Private
router.get(
  "/conversation/:conversationId",
  authenticateToken,
  updateOnlineStatus,
  getConversation,
);

// @route   GET /api/messages/:conversationId
// @desc    Get messages for a conversation
// @access  Private
router.get(
  "/:conversationId",
  authenticateToken,
  updateOnlineStatus,
  getMessages,
);

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post("/", authenticateToken, updateOnlineStatus, sendMessage);

module.exports = router;
