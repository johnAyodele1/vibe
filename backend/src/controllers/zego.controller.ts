import { Request, Response } from 'express';
import { generateAgoraToken } from '../services/agora.service';

export const getZegoToken = async (req: Request, res: Response) => {
  try {
    const { roomId, type } = req.query;
    const user = req.adultUser;

    if (!user) {
      return res.status(401).json({ error: 'Auth required' });
    }

    const userId = user._id.toString();

    if (!roomId) {
      return res.status(400).json({ error: 'roomId required' });
    }

    if (!type || !['call', 'stream', 'random'].includes(type as string)) {
      return res.status(400).json({ error: 'type must be call, stream, or random' });
    }

    const appId = process.env.AGORA_APP_ID || '123456';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '12345678901234567890123456789012';

    // In Agora, channelName is roomId. Let's use uidOrAccount as the userId string.
    const token = generateAgoraToken(appId, appCertificate, roomId as string, userId, 'publisher', 3600);

    return res.json({
      token,
      appId,
      userId,
      roomId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Token generation failed' });
  }
};
