import mongoose, { Types } from 'mongoose';
import AdultCall from '../models/AdultCall';
import CamSession from '../models/CamSession';
import AdultUser from '../models/AdultUser';

/**
 * Atomically ends a CamSession and synchronizes providerProfile.isLive = false.
 * Idempotent: Only transitions if status is currently live, pending, or scheduled.
 */
export const endCamSessionAtomic = async (
  sessionId: string | Types.ObjectId,
  reason: string = 'ended',
  ns?: any
) => {
  if (mongoose.connection.readyState !== 1) return null;

  const session = await CamSession.findOne({
    _id: sessionId,
    status: { $in: ['live', 'pending', 'scheduled'] },
  });
  if (!session) return null;

  const now = new Date();
  const startedAt = session.startedAt || session.get('createdAt') || now;
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));

  const updatedSession = await CamSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: { $in: ['live', 'pending', 'scheduled'] },
    },
    {
      $set: {
        status: 'ended',
        endedAt: now,
        durationSeconds,
      },
    },
    { new: true }
  );

  if (!updatedSession) return null;

  // Sync provider isLive status
  await AdultUser.findByIdAndUpdate(updatedSession.providerId, {
    $set: {
      'providerProfile.isLive': false,
    },
  });

  if (ns) {
    ns.to(`cam:${sessionId.toString()}`).emit('cam:session_ended', {
      sessionId: sessionId.toString(),
      reason,
    });
    ns.emit('cam:session_ended', {
      sessionId: sessionId.toString(),
      reason,
    });
  }

  return updatedSession;
};

/**
 * Specifically targets and atomically ends the CamSession associated with a 1-to-1 call.
 * Reuses call.camSessionId if set, or falls back to finding active live/pending sessions belonging solely
 * to the call's receiver (provider). Excludes callerId's sessions and excludes scheduled sessions.
 * Idempotent and safe to execute multiple times.
 */
export const endCamSessionForCall = async (
  call: any,
  reason: string = 'call_ended',
  ns?: any
) => {
  if (mongoose.connection.readyState !== 1 || !call) return;

  // Stream teardown applies only if the call was accepted/active
  // (Ringing calls that are declined or cancelled before acceptance preserve the provider's public live stream)
  const wasCallAcceptedOrActive = !!(call.startedAt || call.status === 'active' || reason === 'accepted_private_call');
  if (!wasCallAcceptedOrActive) {
    return;
  }

  // 1. If call explicitly recorded a camSessionId, target that session directly
  if (call.camSessionId) {
    await endCamSessionAtomic(call.camSessionId, reason, ns);
    return;
  }

  // 2. Fallback: Find live/pending CamSession belonging exclusively to the receiver (provider)
  // Excludes callerId's sessions and excludes 'scheduled' sessions.
  if (call.receiverId) {
    const activeSession = await CamSession.findOne({
      providerId: call.receiverId,
      status: { $in: ['live', 'pending'] },
    });
    if (activeSession) {
      await endCamSessionAtomic(activeSession._id, reason, ns);
    }
  }
};

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
  const uidStr = userId.toString();

  const activeCall = await AdultCall.findOne({
    $or: [
      { isActiveSession: true, activeParticipants: { $in: [uid, uidStr] } },
      { status: { $in: ['ringing', 'active'] }, $or: [{ callerId: { $in: [uid, uidStr] } }, { receiverId: { $in: [uid, uidStr] } }] }
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

  const session = await CamSession.findOne({
    providerId: pid,
    status: { $in: ['live', 'pending'] },
  });

  if (!session) return null;

  const now = Date.now();
  const createdTime = new Date(session.get('createdAt') || session.startedAt || now).getTime();

  // If session is pending:
  if (session.status === 'pending') {
    if (now - createdTime > 15000) {
      // Over 15s without host socket going live -> auto-end orphaned startup attempt
      await endCamSessionAtomic(session._id, 'startup_timeout');
      return null;
    }
    // Within 15s startup window: session is actively initializing
    return session;
  }

  // If session is live: verify host socket health via adultSocket helper
  if (session.status === 'live') {
    try {
      const { isHostSocketActive } = require('../socket/adultSocket');
      if (typeof isHostSocketActive === 'function') {
        const active = isHostSocketActive(session._id.toString());
        if (!active) {
          await endCamSessionAtomic(session._id, 'provider_disconnected');
          return null;
        }
      }
    } catch (err) {
      // Ignore require circularity if socket module is still initializing
    }
  }

  return session;
};
