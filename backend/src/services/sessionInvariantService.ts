import mongoose, { Types } from 'mongoose';
import AdultCall from '../models/AdultCall';
import CamSession from '../models/CamSession';

/**
 * Checks if a user is currently in an active call (as caller or receiver).
 * Automatically cleans up stale ringing calls older than 60 seconds.
 */
export const checkActiveCall = async (userId: string | Types.ObjectId) => {
  const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const activeCall = await AdultCall.findOne({
    $or: [
      { isActiveSession: true, activeParticipants: uid },
      { status: { $in: ['ringing', 'active'] }, $or: [{ callerId: uid }, { receiverId: uid }] }
    ]
  });

  if (!activeCall) return null;

  // Stale ringing call check (> 60 seconds in ringing state without acceptance)
  if (activeCall.status === 'ringing') {
    const createdAtTime = activeCall.get('createdAt')
      ? new Date(activeCall.get('createdAt')).getTime()
      : Date.now();
    if (Date.now() - createdAtTime > 60000) {
      activeCall.status = 'missed';
      activeCall.endReason = 'timeout';
      activeCall.endedAt = new Date();
      activeCall.isActiveSession = false;
      activeCall.activeParticipants = [];
      await activeCall.save();
      return null;
    }
  }

  return activeCall;
};

/**
 * Checks if a provider has an active livestream (status: 'live').
 * The database session state is the authoritative source of truth.
 */
export const checkActiveCamSession = async (providerId: string | Types.ObjectId) => {
  const pid = typeof providerId === 'string' ? new Types.ObjectId(providerId) : providerId;

  return await CamSession.findOne({
    providerId: pid,
    status: 'live',
  });
};
