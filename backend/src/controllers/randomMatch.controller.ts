import { Request, Response } from 'express';
import { joinQueue, leaveQueue, addExclusion } from '../services/randomMatch.service';
import { RandomMatch } from '../models/RandomMatch';
import { getIO } from '../socket';

export const joinMatchQueue = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { preference = 'anyone', mode = 'both' } = req.body;

    const validPreferences = ['girls', 'guys', 'anyone'];
    const validModes = ['text', 'video', 'both'];

    if (!validPreferences.includes(preference)) {
      return res.status(400).json({ success: false, error: 'Invalid preference option' });
    }
    if (!validModes.includes(mode)) {
      return res.status(400).json({ success: false, error: 'Invalid connection mode' });
    }

    const result = await joinQueue(user._id.toString(), preference, mode);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error joining match queue:', error);
    return res.status(500).json({ success: false, error: 'Unable to start random matching. Please try again.' });
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
    console.error('Error leaving match queue:', error);
    return res.status(500).json({ success: false, error: 'Unable to leave matching queue.' });
  }
};

export const endMatchSession = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { matchId } = req.params;
    const match = await RandomMatch.findById(matchId);

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match session not found' });
    }

    const userIdStr = user._id.toString();
    const isUserA = match.userA.toString() === userIdStr;
    const isUserB = match.userB.toString() === userIdStr;

    if (!isUserA && !isUserB) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this match session' });
    }

    // Idempotent end check
    if (match.status === 'ended') {
      return res.json({ success: true, message: 'Match session already ended' });
    }

    match.status = 'ended';
    match.endedAt = new Date();
    await match.save();

    const partnerId = isUserA ? match.userB.toString() : match.userA.toString();
    const io = getIO();
    if (io) {
      io.of('/adult').to(`user:${partnerId}`).emit('random:partner_left');
    }

    return res.json({ success: true, message: 'Match session ended successfully' });
  } catch (error: any) {
    console.error('Error ending match session:', error);
    return res.status(500).json({ success: false, error: 'Unable to end match session.' });
  }
};

export const nextStranger = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { matchId } = req.params;
    const { preference = 'anyone', mode = 'both' } = req.body;
    const userIdStr = user._id.toString();

    const match = await RandomMatch.findById(matchId);

    if (match) {
      const isUserA = match.userA.toString() === userIdStr;
      const isUserB = match.userB.toString() === userIdStr;

      if (!isUserA && !isUserB) {
        return res.status(403).json({ success: false, error: 'Not authorized to skip this match session' });
      }

      if (match.status === 'matched') {
        match.status = 'ended';
        match.endedAt = new Date();
        await match.save();

        const partnerId = isUserA ? match.userB.toString() : match.userA.toString();

        // Exclude immediate rematch with same partner for 60 seconds
        addExclusion(userIdStr, partnerId, 60000);

        const io = getIO();
        if (io) {
          io.of('/adult').to(`user:${partnerId}`).emit('random:partner_left');
        }
      }
    }

    // Automatically re-queue requester with updated preference and mode
    const result = await joinQueue(userIdStr, preference, mode);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error skipping to next stranger:', error);
    return res.status(500).json({ success: false, error: 'Unable to skip to next stranger.' });
  }
};
