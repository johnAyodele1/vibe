import mongoose, { Schema } from 'mongoose';

const adultCallSchema = new Schema(
  {
    conversationId: { type: String, required: true },
    callerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true },
    type: { type: String, enum: ['video', 'audio'], required: true },
    status: { type: String, enum: ['ringing', 'active', 'ended', 'missed', 'declined', 'failed'], default: 'ringing' },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    creditsDeducted: { type: Number, default: 0 },
    perMinuteRate: {
      type: Number,
      required: true,
      min: [0.01, 'Call per-minute rate must be greater than zero'],
    },
    billedMinutes: { type: Number, default: 0 },
    lastBilledAt: { type: Date, default: null },
    endedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser', default: null },
    endReason: { type: String, default: '' },
    webrtcRoomId: { type: String, required: true },
    camSessionId: { type: Schema.Types.ObjectId, ref: 'CamSession', default: null },
    isActiveSession: { type: Boolean, default: true },
    activeParticipants: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
  },
  { timestamps: true }
);

adultCallSchema.index(
  { activeParticipants: 1 },
  { name: 'unique_active_call_participants', unique: true, partialFilterExpression: { isActiveSession: true } }
);

export const AdultCall = mongoose.model('AdultCall', adultCallSchema);
export default AdultCall;
