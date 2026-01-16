const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

// @desc    Get user's conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true,
    })
      .populate("lastMessage")
      .populate("participantInfo.user", "firstName lastName photos isOnline")
      .sort({ lastMessageAt: -1 });

    res.json({ success: true, data: { conversations } });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get messages for a conversation
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: req.params.conversationId,
      isDeleted: false,
    })
      .populate("sender", "firstName lastName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: req.params.conversationId,
        receiver: req.user._id,
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, data: { messages: messages.reverse() } });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Send a message
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { receiverId, content, messageType = "text" } = req.body;

    // Find or create conversation
    let conversation = await Conversation.findDirectConversation(
      req.user._id,
      receiverId
    );

    if (!conversation) {
      conversation = new Conversation({
        participants: [req.user._id, receiverId],
      });
      await conversation.save();
      await conversation.updateParticipantInfo();
    }

    // Create message
    const message = new Message({
      conversation: conversation._id,
      sender: req.user._id,
      receiver: receiverId,
      content,
      messageType,
    });

    await message.save();

    // Populate sender info
    await message.populate("sender", "firstName lastName photos");

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
};
