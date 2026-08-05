import { Document, Types, Model, UpdateWriteOpResult } from 'mongoose';

export interface IPhoto {
  url: string;
  isMain: boolean;
  order: number;
  uploadedAt: Date;
}

export interface ILocation {
  type: 'Point';
  coordinates: [number, number];
  city?: string;
  country?: string;
}

export interface IAgeRange {
  min: number;
  max: number;
}

export interface IPreferences {
  genderPreference: 'Male' | 'Female' | 'Everyone';
  ageRange: IAgeRange;
  maxDistance: number;
}

export interface INotificationSettings {
  matches: boolean;
  messages: boolean;
  likes: boolean;
}

export interface IPrivacySettings {
  showOnlineStatus: boolean;
  showDistance: boolean;
  showAge: boolean;
}

export interface ISettings {
  notifications: INotificationSettings;
  privacy: IPrivacySettings;
}

export interface IMatch {
  user: Types.ObjectId | IUser;
  matchedAt: Date;
  isActive: boolean;
  isSeen: boolean;
}

export interface IUser extends Document {
  email: string;
  password?: string;
  googleId?: string;
  firstName: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: 'Male' | 'Female' | 'Non-binary' | 'Other';
  bio?: string;
  photos: IPhoto[];
  location: ILocation;
  interests: string[];
  preferences: IPreferences;
  settings: ISettings;
  likedUsers: Types.ObjectId[];
  favouritedUsers: Types.ObjectId[];
  dislikedUsers: Types.ObjectId[];
  blockedUsers: Types.ObjectId[];
  matches: IMatch[];
  isVerified: boolean;
  isBlocked: boolean;
  isPremium: boolean;
  views: number;
  profileCompletion: number;
  lastActive: Date;
  isOnline: boolean;
  fcmTokens: string[];
  lastNotificationSentAt: Date;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  age?: number; // Virtual
  comparePassword(candidatePassword: string): Promise<boolean>;
  getMatches(): IMatch[];
  hasLiked(userId: string | Types.ObjectId): boolean;
  hasDisliked(userId: string | Types.ObjectId): boolean;
}

export interface IUserModel extends Model<IUser> {
  findDiscoverableUsers(currentUser: IUser, options?: { limit?: number; skip?: number }): Promise<Partial<IUser>[]>;
}

export interface IMessage extends Document {
  conversation: Types.ObjectId | IConversation;
  sender: Types.ObjectId | IUser;
  receiver: Types.ObjectId | IUser;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  edited: boolean;
  editedAt?: Date;
  replyTo?: Types.ObjectId | IMessage;
  createdAt: Date;
  updatedAt: Date;
  softDelete(): Promise<IMessage>;
}

export interface IMessageModel extends Model<IMessage> {
  markAsRead(conversationId: string | Types.ObjectId, userId: string | Types.ObjectId): Promise<UpdateWriteOpResult>;
  getUnreadCount(userId: string | Types.ObjectId): Promise<number>;
}

export interface IParticipantInfo {
  user: Types.ObjectId | IUser;
  firstName: string;
  lastName: string;
  photos: { url: string; isMain: boolean }[];
  isOnline: boolean;
  lastActive?: Date;
}

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId | IMessage;
  lastMessageAt: Date;
  participantInfo: IParticipantInfo[];
  isActive: boolean;
  unreadCount: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
  updateParticipantInfo(): Promise<IConversation>;
  updateLastMessage(message: IMessage): Promise<IConversation>;
  getUnreadCount(userId: string | Types.ObjectId): number;
  incrementUnreadCount(userId: string | Types.ObjectId): Promise<IConversation>;
  resetUnreadCount(userId: string | Types.ObjectId): Promise<IConversation>;
}

export interface IConversationModel extends Model<IConversation> {
  findDirectConversation(user1Id: string | Types.ObjectId, user2Id: string | Types.ObjectId): Promise<IConversation | null>;
}

export interface IReport extends Document {
  reporter: Types.ObjectId | IUser;
  reported: Types.ObjectId | IUser;
  reason: string;
  description?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}
