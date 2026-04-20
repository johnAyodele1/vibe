const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      minlength: [6, "Password must be at least 6 characters long"],
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    dateOfBirth: {
      type: Date,
      required: function () {
        return !this.googleId;
      },
    },
    gender: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      enum: ["Male", "Female", "Non-binary", "Other"],
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      trim: true,
    },
    photos: [
      {
        url: {
          type: String,
          required: true,
        },
        isMain: {
          type: Boolean,
          default: false,
        },
        order: {
          type: Number,
          default: 0,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0], // [longitude, latitude]
      },
      city: String,
      country: String,
    },
    interests: [
      {
        type: String,
        trim: true,
        maxlength: [30, "Interest cannot exceed 30 characters"],
      },
    ],
    preferences: {
      genderPreference: {
        type: String,
        enum: ["Male", "Female", "Everyone"],
        default: "Everyone",
      },
      ageRange: {
        min: {
          type: Number,
          default: 18,
          min: 18,
          max: 100,
        },
        max: {
          type: Number,
          default: 50,
          min: 18,
          max: 100,
        },
      },
      maxDistance: {
        type: Number,
        default: 50, // km
        min: 1,
        max: 500,
      },
    },
    settings: {
      notifications: {
        matches: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        likes: { type: Boolean, default: true },
      },
      privacy: {
        showOnlineStatus: { type: Boolean, default: true },
        showDistance: { type: Boolean, default: true },
        showAge: { type: Boolean, default: true },
      },
    },
    likedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    favouritedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    dislikedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    matches: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        matchedAt: {
          type: Date,
          default: Date.now,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    profileCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for location-based queries
userSchema.index({ location: "2dsphere" });

// Virtual for user's age
userSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to calculate profile completion
userSchema.pre("save", function (next) {
  const fields = [
    "firstName",
    "dateOfBirth",
    "gender",
    "bio",
    "location.city",
    "interests",
    "photos",
  ];

  let completedFields = 0;
  const totalFields = fields.length;

  if (this.firstName) completedFields++;
  if (this.dateOfBirth) completedFields++;
  if (this.gender) completedFields++;
  if (this.bio && this.bio.length > 10) completedFields++;
  if (this.location && this.location.city) completedFields++;
  if (this.interests && this.interests.length > 0) completedFields++;
  if (this.photos && this.photos.length > 0) completedFields++;

  this.profileCompletion = Math.round((completedFields / totalFields) * 100);
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get user's matches
userSchema.methods.getMatches = function () {
  return this.matches.filter((match) => match.isActive);
};

// Instance method to check if user has liked another user
userSchema.methods.hasLiked = function (userId) {
  return this.likedUsers.includes(userId);
};

// Instance method to check if user has disliked another user
userSchema.methods.hasDisliked = function (userId) {
  return this.dislikedUsers.includes(userId);
};

// Static method to find users for discovery
userSchema.statics.findDiscoverableUsers = function (
  currentUser,
  options = {}
) {
  const { limit = 20, skip = 0 } = options;

  const minDate = new Date(
    Date.now() -
      (currentUser.preferences.ageRange.max + 1) * 365.25 * 24 * 60 * 60 * 1000,
  );
  const maxDate = new Date(
    Date.now() -
      currentUser.preferences.ageRange.min * 365.25 * 24 * 60 * 60 * 1000,
  );

  return this.find({
    _id: {
      $ne: currentUser._id,
      $nin: [
        ...currentUser.likedUsers,
        ...currentUser.dislikedUsers,
        ...currentUser.favouritedUsers,
      ],
    },
    gender:
      currentUser.preferences.genderPreference === "Everyone"
        ? { $exists: true }
        : currentUser.preferences.genderPreference,
    dateOfBirth: {
      $gte: minDate,
      $lte: maxDate,
    },
  })
    .select("firstName lastName age photos bio location interests")
    .limit(limit)
    .skip(skip)
    .sort({ lastActive: -1 });
};

module.exports = mongoose.model("User", userSchema);
