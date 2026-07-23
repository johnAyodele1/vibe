import { Request, Response } from 'express';
import { generateZegoToken } from '../services/zego.service';

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

    const appIdStr = process.env.ZEGO_APP_ID || '123456';
    const appId = parseInt(appIdStr, 10);
    const serverSecret = process.env.ZEGO_SERVER_SECRET || '12345678901234567890123456789012'; // fallback 32 bytes

    const token = generateZegoToken(appId, userId, serverSecret, 3600, JSON.stringify({ room_id: roomId }));

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
