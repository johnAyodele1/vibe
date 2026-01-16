const User = require("../models/User");

// @desc    Get user's matches
// @access  Private
const getMatches = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate(
        "matches.user",
        "firstName lastName age photos isOnline lastActive"
      )
      .select("matches");

    const matches = user.matches.filter((match) => match.isActive);

    res.json({ success: true, data: { matches } });
  } catch (error) {
    console.error("Get matches error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Unmatch with a user
// @access  Private
const unmatch = async (req, res) => {
  try {
    const matchUserId = req.params.id;

    // Remove match from current user
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { matches: { user: matchUserId } },
    });

    // Remove match from other user
    await User.findByIdAndUpdate(matchUserId, {
      $pull: { matches: { user: req.user._id } },
    });

    res.json({ success: true, message: "Unmatched successfully" });
  } catch (error) {
    console.error("Unmatch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getMatches,
  unmatch,
};
