import { Request, Response } from 'express';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import { generateAgoraToken } from '../services/agora.service';
import { checkActiveCamSession, endCamSessionAtomic } from '../services/sessionInvariantService';

export const getCams = async (req: Request, res: Response) => {
  const { page = 1, limit = 20, status } = req.query;
  const query: any = { status: status ? status : { $in: ['live', 'pending'] } };

  // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document instantiation and model hydration overhead.
  const sessions = await CamSession.find(query)
    .populate({
      path: 'providerId',
      match: {
        status: 'active',
        'providerProfile.onboarding.isComplete': true,
        isVerified: true
      },
      select: 'providerProfile username profilePhoto'
    })
    .lean();

  const filtered = sessions.filter(s => s.providerId !== null);
  const total = filtered.length;
  const paginated = filtered.slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit));

  const ns = req.app.get('adultNamespace');

  const mappedSessions = paginated.map((session: any) => {
    let currentViewerCount = session.totalViewerCount || 0;
    if (ns && session.status === 'live') {
      const room = ns.adapter?.rooms?.get(`cam:${session._id.toString()}`);
      if (room) {
        const uniqueViewers = new Set<string>();
        const providerIdStr = session.providerId?._id ? session.providerId._id.toString() : '';
        const socketsMap = ns.sockets?.sockets || ns.sockets;

        for (const socketId of room) {
          const socket = socketsMap?.get ? (socketsMap.get(socketId) || socketsMap.get(`/adult#${socketId}`) || socketsMap.get(socketId.replace(/^\/adult#/, ''))) : null;
          if (socket && socket.data && socket.data.user) {
            const uId = socket.data.user._id.toString();
            if (uId !== providerIdStr) {
              uniqueViewers.add(uId);
            }
          }
        }
        currentViewerCount = uniqueViewers.size;
      } else {
        currentViewerCount = 0;
      }
    }
    // Optimization (⚡ Bolt): session is already an un-hydrated plain object from .lean().
    return {
      ...session,
      totalViewerCount: currentViewerCount,
      peakViewerCount: session.peakViewerCount || 0
    };
  });

  res.json({ success: true, data: { sessions: mappedSessions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
};

export const startStream = async (req: Request, res: Response) => {
  const provider = req.adultUser;
  if (
    !provider ||
    provider.role !== 'provider' ||
    provider.status !== 'active' ||
    provider.providerProfile?.onboarding?.isComplete !== true ||
    provider.isVerified !== true
  ) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not an approved active provider' } });
  }

  const appId = process.env.AGORA_APP_ID || '123456';
  const appCertificate = process.env.AGORA_APP_CERTIFICATE || '12345678901234567890123456789012';

  const active = await checkActiveCamSession(provider._id);
  if (active) {
    return res.status(409).json({
      success: false,
      error: 'You are already streaming on another device.'
    });
  }

  const { title, tags, sessionType, privateShowRate, resolution, chatEnabled, recordingEnabled } = req.body;
  const roomId = `cam_${provider._id.toString()}_${Date.now()}`;

  const token = generateAgoraToken(appId, appCertificate, roomId, provider._id.toString(), 'publisher', 7200);

  const session = new CamSession({
    providerId: provider._id,
    title: title || 'Live Cam',
    tags: tags || [],
    sessionType: sessionType || 'public',
    privateShowRate: privateShowRate !== undefined ? privateShowRate : 0,
    resolution: resolution || '1080p',
    chatEnabled: chatEnabled !== undefined ? chatEnabled : true,
    recordingEnabled: recordingEnabled !== undefined ? recordingEnabled : false,
    streamKey: roomId, // roomId is stored in streamKey
    streamPlaybackUrl: roomId,
    status: 'pending',
    startedAt: new Date(),
  });

  try {
    await session.save();
  } catch (err: any) {
    if (err.code === 11000 || err.name === 'MongoServerError' || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
      return res.status(409).json({
        success: false,
        error: 'You are already streaming on another device.'
      });
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    data: {
      sessionId: session._id,
      roomId,
      streamKey: roomId,
      token,
      appId,
    },
  });
};

export const endStream = async (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = await CamSession.findById(sessionId);

  if (!session || session.providerId.toString() !== req.adultUser?._id.toString()) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  const ns = req.app.get('adultNamespace');
  const endedSession = await endCamSessionAtomic(sessionId, 'provider_ended', ns);

  const durationSeconds = endedSession ? endedSession.durationSeconds : 0;
  const totalTips = endedSession ? endedSession.totalTipsReceived : session.totalTipsReceived;

  res.json({ success: true, data: { summary: { duration: durationSeconds, totalTips } } });
};

export const joinStream = async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = await CamSession.findById(sessionId);
    if (!session || session.status !== 'live') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not live' } });

    await CamViewer.findOneAndUpdate(
        { sessionId, userId: req.adultUser?._id },
        { joinedAt: new Date() },
        { upsert: true }
    );

    await CamSession.findByIdAndUpdate(sessionId, { $inc: { totalViewerCount: 1 } });

    res.json({ success: true, data: { playbackUrl: session.streamPlaybackUrl } });
};

export const getCamViewerToken = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const user = req.adultUser;
  const userId = user ? user._id.toString() : `guest_${Math.floor(Math.random() * 100000)}`;

  const session = await CamSession.findById(sessionId);
  if (!session || session.status !== 'live') {
    return res.status(404).json({ error: 'Stream not found or has ended' });
  }

  const appId = process.env.AGORA_APP_ID || '123456';
  const appCertificate = process.env.AGORA_APP_CERTIFICATE || '12345678901234567890123456789012';

  const roomId = session.streamKey;
  const token = generateAgoraToken(appId, appCertificate, roomId, userId, 'subscriber', 3600);

  return res.json({
    token,
    appId,
    roomId,
  });
};

export const getMyActiveSession = async (req: Request, res: Response) => {
  try {
    const provider = req.adultUser;
    if (!provider || provider.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can access this endpoint' } });
    }

    const activeSession = await checkActiveCamSession(provider._id);

    return res.json({ success: true, data: { activeSession } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
