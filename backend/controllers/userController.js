const User = require("../models/User");

// @desc    Get current user profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Update user profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      "firstName",
      "lastName",
      "bio",
      "interests",
      "location",
      "preferences",
      "settings",
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
    }).select("-password");

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: { user },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get users for discovery/matching
// @access  Private
const discover = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Get users that match preferences and haven't been liked/disliked
    const currentUser = await User.findById(req.user._id);

    const query = {
      gender:
        currentUser.preferences.genderPreference === "Everyone"
          ? { $exists: true }
          : currentUser.preferences.genderPreference,
      dateOfBirth: {
        $lte: new Date(
          Date.now() -
            currentUser.preferences.ageRange.min * 365.25 * 24 * 60 * 60 * 1000,
        ),
        $gte: new Date(
          Date.now() -
            (currentUser.preferences.ageRange.max + 1) *
              365.25 *
              24 *
              60 *
              60 *
              1000,
        ),
      },
      _id: {
        $ne: req.user._id,
        $nin: [
          ...currentUser.likedUsers,
          ...currentUser.dislikedUsers,
          ...currentUser.favouritedUsers,
        ],
      },
    };

    // Add location-based filtering if coordinates exist
    if (currentUser.location.coordinates[0] !== 0) {
      query.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: currentUser.location.coordinates,
          },
          $maxDistance: currentUser.preferences.maxDistance * 1000, // Convert km to meters
        },
      };
    }

    console.log("Discovery query:", JSON.stringify(query, null, 2));
    console.log("Current user:", currentUser._id, currentUser.preferences);

    const users = await User.find(query)
      .select("firstName lastName age photos bio location interests")
      .skip(skip)
      .limit(limit)
      .sort({ lastActive: -1 });

    // Increment view count for each discovered user
    if (users.length > 0) {
      const userIds = users.map((user) => user._id);
      await User.updateMany({ _id: { $in: userIds } }, { $inc: { views: 1 } });
    }

    res.json({ success: true, data: { users } });
  } catch (error) {
    console.error("Discover users error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Like a user
// @access  Private
const like = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot like yourself",
      });
    }

    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already liked
    if (currentUser.likedUsers.includes(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "User already liked",
      });
    }

    // Add to liked users
    currentUser.likedUsers.push(targetUserId);
    await currentUser.save();

    // Always create conversation for liked users (for private messaging)
    const Conversation = require("../models/Conversation");
    const mongoose = require("mongoose");
    let conversation = await Conversation.findDirectConversation(
      req.user._id,
      targetUserId,
    );

    if (!conversation) {
      try {
        const newConversation = new Conversation({
          participants: [
            req.user._id,
            new mongoose.Types.ObjectId(targetUserId),
          ],
        });
        await newConversation.save();
        conversation = await newConversation.updateParticipantInfo();
        console.log("Conversation saved:", conversation._id);
      } catch (error) {
        console.error("Error creating conversation:", error);
        return res
          .status(500)
          .json({ success: false, message: "Failed to create conversation" });
      }
    }

    // Ensure participant info is populated
    if (
      !conversation.participantInfo ||
      conversation.participantInfo.length === 0
    ) {
      conversation = await conversation.updateParticipantInfo();
    }

    const conversationId = conversation._id.toString();
    console.log("Final conversation ID:", conversationId);

    // Add match for current user (every like that starts a chat counts as a match)
    const isAlreadyMatched = currentUser.matches.some(
      (m) => m.user.toString() === targetUserId,
    );
    if (!isAlreadyMatched) {
      currentUser.matches.push({
        user: targetUserId,
        matchedAt: new Date(),
      });
    }

    // Check if it's a mutual match
    let isMatch = false;
    if (targetUser.likedUsers.includes(req.user._id.toString())) {
      const isTargetAlreadyMatched = targetUser.matches.some(
        (m) => m.user.toString() === req.user._id.toString(),
      );
      if (!isTargetAlreadyMatched) {
        targetUser.matches.push({
          user: req.user._id,
          matchedAt: new Date(),
        });
      }
      isMatch = true;
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.json({
      success: true,
      message: isMatch ? "It's a match!" : "User liked",
      data: { isMatch, conversationId },
    });
  } catch (error) {
    console.error("Like user error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Dislike a user
// @access  Private
const dislike = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot dislike yourself",
      });
    }

    const currentUser = await User.findById(req.user._id);

    // Check if already disliked
    if (currentUser.dislikedUsers.includes(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "User already disliked",
      });
    }

    // Add to disliked users
    currentUser.dislikedUsers.push(targetUserId);
    await currentUser.save();

    res.json({ success: true, message: "User disliked" });
  } catch (error) {
    console.error("Dislike user error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Super like (Favourite) a user
// @access  Private
const superLike = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot super like yourself",
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUser = await User.findById(req.user._id);

    // Check if already favourited
    if (currentUser.favouritedUsers.includes(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "User already in favourites",
      });
    }

    // Add to favourited users
    currentUser.favouritedUsers.push(targetUserId);
    await currentUser.save();

    res.json({ success: true, message: "User added to favourites" });
  } catch (error) {
    console.error("Super like error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get favourited users
// @access  Private
const getFavourites = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "favouritedUsers",
      "firstName lastName age photos bio location interests lastActive isOnline",
    );

    res.json({
      success: true,
      data: { favourites: user.favouritedUsers },
    });
  } catch (error) {
    console.error("Get favourites error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Delete user account
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Delete user and all related data
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  discover,
  like,
  dislike,
  superLike,
  getFavourites,
  deleteAccount,
};
