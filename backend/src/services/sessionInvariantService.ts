import mongoose, { Types } from 'mongoose';
import AdultCall from '../models/AdultCall';
import CamSession from '../models/CamSession';

/**
 * Explicit state transition to expire a stale ringing call (>60s without acceptance).
 */
export const expireStaleRingingCall = async (call: any) => {
  if (call && call.status === 'ringing') {
    const createdAtTime = call.get('createdAt')
      ? new Date(call.get('createdAt')).getTime()
      : Date.now();
    if (Date.now() - createdAtTime > 60000) {
      call.status = 'missed';
      call.endReason = 'timeout';
      call.endedAt = new Date();
      call.isActiveSession = false;
      call.activeParticipants = [];
      await call.save();
      return true;
    }
  }
  return false;
};

/**
 * Read-only lookup to check if a user is currently in an active call (as caller or receiver).
 * Performs auto-expiration of stale ringing calls if encountered.
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

  // Check and perform explicit state transition if stale ringing call encountered
  if (activeCall.status === 'ringing') {
    const expired = await expireStaleRingingCall(activeCall);
    if (expired) return null;
  }

  return activeCall;
};

/**
 * Read-only lookup to check if a provider has an active livestream (status: 'live').
 */
export const checkActiveCamSession = async (providerId: string | Types.ObjectId) => {
  const pid = typeof providerId === 'string' ? new Types.ObjectId(providerId) : providerId;

  return await CamSession.findOne({
    providerId: pid,
    status: 'live',
  });
};
