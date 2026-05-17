import { Request, Response } from 'express';
import Room from '../models/Room';

export const getRooms = async (req: Request, res: Response) => {
  const rooms = await Room.find({ isActive: true }).sort({ 'activeUsers.length': -1 });
  res.json({ success: true, data: { rooms } });
};

export const createRoom = async (req: Request, res: Response) => {
  const { name, description, category, mood, tags } = req.body;
  const room = new Room({
    name,
    description,
    category,
    mood,
    tags,
    createdBy: req.adultUser?._id,
  });
  await room.save();
  res.status(201).json({ success: true, data: { room } });
};

export const joinRoom = async (req: Request, res: Response) => {
  const { id } = req.params;
  const room = await Room.findById(id);
  if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });

  room.activeUsers.push({ userId: req.adultUser?._id, joinedAt: new Date() });
  await room.save();

  res.json({ success: true, message: 'Joined room' });
};
