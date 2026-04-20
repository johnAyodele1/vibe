import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, IUserModel, IMatch } from '../types/models';
import { userSchema } from './user.schema';

// Index for location-based queries
userSchema.index({ location: '2dsphere' });

// Virtual for user's age
userSchema.virtual('age').get(function (this: IUser) {
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
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    if (this.password) {
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (error: unknown) {
    if (error instanceof Error) {
        next(error);
    } else {
        next(new Error('Unknown error during password hashing'));
    }
  }
});

// Pre-save middleware to calculate profile completion
userSchema.pre<IUser>('save', function (next) {
  const fields = [
    'firstName',
    'dateOfBirth',
    'gender',
    'bio',
    'location.city',
    'interests',
    'photos',
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
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get user's matches
userSchema.methods.getMatches = function () {
  return this.matches.filter((match: IMatch) => match.isActive);
};

// Instance method to check if user has liked another user
userSchema.methods.hasLiked = function (userId: string | mongoose.Types.ObjectId) {
  return this.likedUsers.some((id: mongoose.Types.ObjectId) => id.toString() === userId.toString());
};

// Instance method to check if user has disliked another user
userSchema.methods.hasDisliked = function (userId: string | mongoose.Types.ObjectId) {
  return this.dislikedUsers.some((id: mongoose.Types.ObjectId) => id.toString() === userId.toString());
};

// Static method to find users for discovery
userSchema.statics.findDiscoverableUsers = function (
  currentUser: IUser,
  options: { limit?: number; skip?: number } = {}
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
      currentUser.preferences.genderPreference === 'Everyone'
        ? { $exists: true }
        : currentUser.preferences.genderPreference,
    dateOfBirth: {
      $gte: minDate,
      $lte: maxDate,
    },
  })
    .select('firstName lastName age photos bio location interests')
    .limit(limit)
    .skip(skip)
    .sort({ lastActive: -1 });
};

export const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;
