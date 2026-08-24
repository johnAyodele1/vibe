import { Request, Response } from 'express';
import { joinQueue, leaveQueue } from '../services/randomMatch.service';
import { RandomMatch } from '../models/RandomMatch';
import { getIO } from '../socket';

export const joinMatchQueue = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { mode = 'video' } = req.body;
    const result = await joinQueue(user._id.toString(), mode);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const leaveMatchQueue = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    await leaveQueue(user._id.toString());
    return res.json({ success: true, message: 'Removed from matching queue' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const endMatchSession = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { matchId } = req.params;
    // Optimization (⚡ Bolt): Update match session status atomically in 1 query roundtrip via findByIdAndUpdate with .lean()
    const match = await RandomMatch.findByIdAndUpdate(
      matchId,
      { status: 'ended', endedAt: new Date() },
      { new: true }
    ).lean();

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match session not found' });
    }

    // Notify partner that session ended
    const partnerId = match.userA.toString() === user._id.toString() ? match.userB.toString() : match.userA.toString();
    const io = getIO();
    if (io) {
      io.of('/adult').to(`user:${partnerId}`).emit('random:partner_left');
    }

    return res.json({ success: true, message: 'Match session ended successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const nextStranger = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { matchId } = req.params;
    // Optimization (⚡ Bolt): Update match session status atomically in 1 query roundtrip via findByIdAndUpdate with .lean()
    const match = await RandomMatch.findByIdAndUpdate(
      matchId,
      { status: 'ended', endedAt: new Date() },
      { new: true }
    ).lean();

    if (match) {
      // Notify partner
      const partnerId = match.userA.toString() === user._id.toString() ? match.userB.toString() : match.userA.toString();
      const io = getIO();
      if (io) {
        io.of('/adult').to(`user:${partnerId}`).emit('random:partner_left');
      }
    }

    return res.json({ success: true, message: 'Skipped match' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
