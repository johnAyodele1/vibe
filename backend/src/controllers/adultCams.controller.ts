import { Request, Response } from 'express';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import { generateAgoraToken } from '../services/agora.service';

export const getCams = async (req: Request, res: Response) => {
  const { page = 1, limit = 20, status = 'live' } = req.query;
  const query: any = { status };

  const sessions = await CamSession.find(query)
    .populate({
      path: 'providerId',
      match: {
        status: 'active',
        'providerProfile.onboarding.isComplete': true,
        isVerified: true
      },
      select: 'providerProfile username profilePhoto'
    });

  const filtered = sessions.filter(s => s.providerId !== null);
  const total = filtered.length;
  const paginated = filtered.slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit));

  res.json({ success: true, data: { sessions: paginated, total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
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

  const active = await CamSession.findOne({ providerId: provider._id, status: 'live' });
  if (active) {
    const roomId = active.streamKey;
    const token = generateAgoraToken(appId, appCertificate, roomId, provider._id.toString(), 'publisher', 7200);
    return res.json({
      success: true,
      data: {
        sessionId: active._id,
        roomId,
        streamKey: roomId,
        token,
        appId,
        isExisting: true
      }
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
    status: 'live',
    startedAt: new Date(),
  });

  await session.save();

  const ns = req.app.get('adultNamespace');
  if (ns) {
    ns.emit('cam:session_started', {
      sessionId: session._id,
      providerId: provider._id,
      roomId,
      streamKey: roomId,
      providerName: provider.providerProfile?.stageName || provider.displayName || provider.username,
      avatarUrl: provider.profilePhoto || '/placeholder.svg',
      viewerCount: 0,
      title: session.title,
      tags: tags || []
    });
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
  const { sessionId } = req.params;
  const session = await CamSession.findById(sessionId);

  if (!session || session.providerId.toString() !== req.adultUser?._id.toString()) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  session.status = 'ended';
  session.endedAt = new Date();
  session.durationSeconds = Math.floor((session.endedAt.getTime() - (session.startedAt?.getTime() || 0)) / 1000);
  await session.save();

  const ns = req.app.get('adultNamespace');
  if (ns) {
    ns.emit('cam:session_ended', { sessionId: session._id });
  }

  res.json({ success: true, data: { summary: { duration: session.durationSeconds, totalTips: session.totalTipsReceived } } });
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
