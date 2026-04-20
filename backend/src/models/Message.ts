import mongoose, { Schema, UpdateWriteOpResult } from 'mongoose';
import { IMessage, IMessageModel } from '../types/models';

const messageSchema = new Schema<IMessage, IMessageModel>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation is required'],
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required'],
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio'],
      default: 'text',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for efficient queries
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, createdAt: -1 });

// Virtual for message age
messageSchema.virtual('isRecent').get(function (this: IMessage) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.createdAt > fiveMinutesAgo;
});

// Static method to mark messages as read
messageSchema.statics.markAsRead = function (conversationId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId): Promise<UpdateWriteOpResult> {
  return this.updateMany(
    {
      conversation: conversationId,
      receiver: userId,
      isRead: false,
    },
    {
      isRead: true,
      readAt: new Date(),
    }
  );
};

// Static method to get unread count for user
messageSchema.statics.getUnreadCount = function (userId: string | mongoose.Types.ObjectId): Promise<number> {
  return this.countDocuments({
    receiver: userId,
    isRead: false,
    isDeleted: false,
  });
};

// Instance method to soft delete message
messageSchema.methods.softDelete = function (this: IMessage): Promise<IMessage> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

export const Message = mongoose.model<IMessage, IMessageModel>('Message', messageSchema);
export default Message;
