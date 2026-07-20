import { Request, Response } from 'express';
import CamSession from '../models/CamSession';
import CamViewer from '../models/CamViewer';
import CamGoal from '../models/CamGoal';
import PrivateShowRequest from '../models/PrivateShowRequest';
import { generateStreamKey, buildIngestUrl, buildPlaybackUrl } from '../services/mediaServerService';

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

  const active = await CamSession.findOne({ providerId: provider._id, status: 'live' });
  if (active) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Already live' } });

  const { title, tags, sessionType, privateShowRate, resolution, chatEnabled, recordingEnabled } = req.body;
  const streamKey = generateStreamKey(provider._id.toString());

  const session = new CamSession({
    providerId: provider._id,
    title,
    tags,
    sessionType,
    privateShowRate,
    resolution,
    chatEnabled,
    recordingEnabled,
    streamKey,
    streamPlaybackUrl: buildPlaybackUrl(streamKey),
    status: 'live',
    startedAt: new Date(),
  });

  await session.save();

  res.status(201).json({
    success: true,
    data: {
      sessionId: session._id,
      streamKey,
      streamIngestUrl: buildIngestUrl(streamKey),
      streamPlaybackUrl: session.streamPlaybackUrl,
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

  res.json({ success: true, data: { summary: { duration: session.durationSeconds, totalTips: session.totalTipsReceived } } });
};

export const joinStream = async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = await CamSession.findById(sessionId);
    if (!session || session.status !== 'live') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not live' } });

    // Check access control (VIP/Premium) here...

    await CamViewer.findOneAndUpdate(
        { sessionId, userId: req.adultUser?._id },
        { joinedAt: new Date() },
        { upsert: true }
    );

    await CamSession.findByIdAndUpdate(sessionId, { $inc: { totalViewerCount: 1 } });

    res.json({ success: true, data: { playbackUrl: session.streamPlaybackUrl } });
};
