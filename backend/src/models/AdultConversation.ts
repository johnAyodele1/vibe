import mongoose, { Schema } from 'mongoose';

const adultConversationSchema = new Schema(
  {
    _id: { type: String, required: true }, // [userId1, userId2].sort().join('_') or 'support_<userId>'
    type: {
      type: String,
      enum: ['normal', 'support', 'official_notification'],
      default: 'normal',
      index: true,
    },
    participants: [{ type: Schema.Types.ObjectId, ref: 'AdultUser', required: true }],
    participantProfiles: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        displayName: String,
        avatarUrl: String,
        accountType: String, // 'member' | 'provider'
        isOnline: { type: Boolean, default: false }
      }
    ],
    supportMetadata: {
      status: {
        type: String,
        enum: ['open', 'closed', 'resolved'],
        default: 'open'
      },
      tags: [{ type: String }],
      assignedAdmin: { type: Schema.Types.ObjectId, ref: 'AdultUser', default: null },
      reportId: { type: Schema.Types.ObjectId, ref: 'Report', default: null },
      serviceRequestId: { type: Schema.Types.ObjectId, ref: 'AdultMessage', default: null },
      issueContext: { type: Schema.Types.Mixed, default: null },
      welcomeSent: { type: Boolean, default: false }
    },
    lastMessage: {
      content: { type: String, default: '' },
      mediaType: { type: String, default: null },
      senderId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
      sentAt: { type: Date, default: Date.now }
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    },
    mutedBy: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
    blockedBy: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
    deletedBy: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }]
  },
  { timestamps: true, id: false }
);

export const AdultConversation = mongoose.model('AdultConversation', adultConversationSchema);
export default AdultConversation;
