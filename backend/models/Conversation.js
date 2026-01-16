const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    participantInfo: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        firstName: String,
        lastName: String,
        photos: [
          {
            url: String,
            isMain: Boolean,
          },
        ],
        isOnline: {
          type: Boolean,
          default: false,
        },
        lastActive: Date,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only two participants for direct conversations
conversationSchema.pre("save", function (next) {
  if (this.participants.length !== 2) {
    return next(new Error("Conversations must have exactly 2 participants"));
  }
  next();
});

// Index for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ "participantInfo.user": 1 });

// Virtual for conversation display name (other participant's name)
conversationSchema.virtual("displayName").get(function () {
  // This would be calculated based on the current user
  return "Conversation";
});

// Static method to find direct conversation between two users
conversationSchema.statics.findDirectConversation = function (
  userId1,
  userId2
) {
  return this.findOne({
    participants: { $all: [userId1, userId2], $size: 2 },
    isActive: true,
  });
};

// Instance method to update participant info
conversationSchema.methods.updateParticipantInfo = async function () {
  const User = mongoose.model("User");

  const participantInfo = [];

  for (const participantId of this.participants) {
    const user = await User.findById(participantId).select(
      "firstName lastName photos isOnline lastActive"
    );

    if (user) {
      const mainPhoto = user.photos.find((photo) => photo.isMain);
      participantInfo.push({
        user: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        photos: mainPhoto ? [{ url: mainPhoto.url, isMain: true }] : [],
        isOnline: user.isOnline,
        lastActive: user.lastActive,
      });
    }
  }

  this.participantInfo = participantInfo;
  return this.save();
};

// Instance method to update last message
conversationSchema.methods.updateLastMessage = async function (message) {
  this.lastMessage = message._id;
  this.lastMessageAt = message.createdAt;
  return this.save();
};

// Instance method to get unread count for a user
conversationSchema.methods.getUnreadCount = function (userId) {
  return this.unreadCount.get(userId.toString()) || 0;
};

// Instance method to increment unread count for a user
conversationSchema.methods.incrementUnreadCount = function (userId) {
  const currentCount = this.getUnreadCount(userId);
  this.unreadCount.set(userId.toString(), currentCount + 1);
  return this.save();
};

// Instance method to reset unread count for a user
conversationSchema.methods.resetUnreadCount = function (userId) {
  this.unreadCount.set(userId.toString(), 0);
  return this.save();
};

module.exports = mongoose.model("Conversation", conversationSchema);
