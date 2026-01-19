// Middleware to update user online status on each request
const User = require("../models/User");

const updateOnlineStatus = async (req, res, next) => {
  if (req.user && req.user._id) {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true,
      lastActive: new Date(),
    });
  }
  next();
};

module.exports = updateOnlineStatus;
