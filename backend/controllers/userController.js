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
      _id: { $ne: req.user._id },
      gender:
        currentUser.preferences.genderPreference === "Everyone"
          ? { $exists: true }
          : currentUser.preferences.genderPreference,
      age: {
        $gte: currentUser.preferences.ageRange.min,
        $lte: currentUser.preferences.ageRange.max,
      },
      _id: {
        $nin: [...currentUser.likedUsers, ...currentUser.dislikedUsers],
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

    const users = await User.find(query)
      .select("firstName lastName age photos bio location interests")
      .skip(skip)
      .limit(limit)
      .sort({ lastActive: -1 });

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

    // Check if it's a match (mutual like)
    let isMatch = false;
    if (targetUser.likedUsers.includes(req.user._id.toString())) {
      // Create match for both users
      currentUser.matches.push({
        user: targetUserId,
        matchedAt: new Date(),
      });
      targetUser.matches.push({
        user: req.user._id,
        matchedAt: new Date(),
      });

      await Promise.all([currentUser.save(), targetUser.save()]);
      isMatch = true;
    }

    res.json({
      success: true,
      message: isMatch ? "It's a match!" : "User liked",
      data: { isMatch },
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

module.exports = {
  getProfile,
  updateProfile,
  discover,
  like,
  dislike,
};
