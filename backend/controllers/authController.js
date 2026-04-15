const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../middleware/auth");

// Validation rules
const signupValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
  body("firstName").trim().isLength({ min: 1 }),
  body("lastName").optional().trim(),
  body("dateOfBirth").isISO8601(),
  body("gender").isIn(["Male", "Female", "Non-binary", "Other"]),
];

const loginValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password").exists(),
];

// @desc    Register user
// @access  Public
const signup = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName, dateOfBirth, gender } =
      req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Create new user
    const user = new User({
      email,
      password, // Will be hashed by pre-save middleware
      firstName,
      lastName,
      dateOfBirth,
      gender,
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          age: user.age,
          gender: user.gender,
          bio: user.bio,
          photos: user.photos,
          location: user.location,
          isVerified: user.isVerified,
          isPremium: user.isPremium,
          profileCompletion: user.profileCompletion,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during signup",
    });
  }
};

// @desc    Login user
// @access  Public
const login = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          age: user.age,
          gender: user.gender,
          bio: user.bio,
          photos: user.photos,
          location: user.location,
          isVerified: user.isVerified,
          isPremium: user.isPremium,
          profileCompletion: user.profileCompletion,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// @desc    Refresh access token
// @access  Public (with refresh token)
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    // Verify refresh token
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET ||
        process.env.JWT_SECRET ||
        "fallback_secret"
    );

    // Check if user exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user._id);

    res.json({
      success: true,
      data: {
        accessToken,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

// @desc    Logout user
// @access  Private
const logout = async (req, res) => {
  try {
    // Update user's online status
    req.user.isOnline = false;
    req.user.lastActive = new Date();
    await req.user.save();

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during logout",
    });
  }
};

// @desc    Get current user
// @access  Private
const me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("matches.user", "firstName lastName age photos");

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Google OAuth Login/Signup
// @access  Public
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID Token is required",
      });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name, picture } = payload;

    // Check if user already exists by googleId
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if user exists by email (link account if not already linked)
      user = await User.findOne({ email });

      if (user) {
        user.googleId = googleId;
        if (!user.photos || user.photos.length === 0) {
          user.photos = [{ url: picture, isMain: true }];
        }
        await user.save();
      } else {
        // Create new user
        user = new User({
          email,
          googleId,
          firstName: given_name || "User",
          lastName: family_name || "",
          photos: [{ url: picture, isMain: true }],
          // dateOfBirth and gender are optional for now as per schema change
        });
        await user.save();
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    res.json({
      success: true,
      message: "Google login successful",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          age: user.age,
          gender: user.gender,
          bio: user.bio,
          photos: user.photos,
          location: user.location,
          isVerified: user.isVerified,
          isPremium: user.isPremium,
          profileCompletion: user.profileCompletion,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during Google login",
    });
  }
};

module.exports = {
  signup,
  login,
  refresh,
  logout,
  me,
  googleLogin,
  signupValidation,
  loginValidation,
};
