import { Request, Response } from 'express';
import Club from '../models/Club';
import { createClubSchema } from '../validators/partiesAndClubs.validator';
import mongoose from 'mongoose';

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const parseClubTime = (timeStr?: string, defaultMins = 0): number => {
  if (!timeStr) return defaultMins;
  const parts = timeStr.split(':');
  if (parts.length < 2) return defaultMins;
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
};

export const isClubOpenNow = (
  clubHours: Array<{ day: number; isOpen: boolean; openTime?: string; closeTime?: string }>
): boolean => {
  if (!clubHours || !Array.isArray(clubHours)) return false;

  const now = new Date();
  const lagosTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
  const lagosNow = new Date(lagosTimeString);

  const currentDay = lagosNow.getDay();
  const currentMinutes = lagosNow.getHours() * 60 + lagosNow.getMinutes();

  const todayHours = clubHours.find((h) => h.day === currentDay);
  if (todayHours && todayHours.isOpen) {
    const openMins = parseClubTime(todayHours.openTime, 22 * 60);
    const closeMins = parseClubTime(todayHours.closeTime, 4 * 60);

    if (openMins < closeMins) {
      if (currentMinutes >= openMins && currentMinutes <= closeMins) return true;
    } else if (currentMinutes >= openMins) {
      return true;
    }
  }

  const prevDay = (currentDay + 6) % 7;
  const prevHours = clubHours.find((h) => h.day === prevDay);
  if (prevHours && prevHours.isOpen) {
    const openMins = parseClubTime(prevHours.openTime, 22 * 60);
    const closeMins = parseClubTime(prevHours.closeTime, 4 * 60);
    if (openMins > closeMins && currentMinutes <= closeMins) return true;
  }

  return false;
};

export const isClubOpenTonight = (
  clubHours: Array<{ day: number; isOpen: boolean; openTime?: string; closeTime?: string }>
): boolean => {
  if (!clubHours || !Array.isArray(clubHours)) return false;

  const now = new Date();
  const lagosTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
  const lagosNow = new Date(lagosTimeString);
  const currentDay = lagosNow.getDay();

  const todayHours = clubHours.find((h) => h.day === currentDay);
  if (!todayHours || !todayHours.isOpen) return false;

  const eveningStart = 18 * 60;
  const openMins = parseClubTime(todayHours.openTime, 22 * 60);
  const closeMins = parseClubTime(todayHours.closeTime, 4 * 60);

  // "Open Tonight" means today's schedule overlaps the evening window.
  // A daytime-only schedule such as 09:00-17:00 must not be labelled tonight.
  if (openMins >= eveningStart || closeMins > eveningStart) return true;

  return false;
};

// GET /api/v1/clubs
export const getClubs = async (req: Request, res: Response) => {
  try {
    const { city, country, state, openTonight, genre, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { status: 'active' };

    if (city) filter['location.city'] = new RegExp(`^${(city as string).trim()}$`, 'i');
    if (state) filter['location.state.code'] = (state as string).trim().toUpperCase();
    if (country) filter['location.country.code'] = (country as string).trim().toUpperCase();
    if (genre) filter.genres = { $in: [(genre as string).toLowerCase()] };

    if (openTonight === 'true') {
      const lagosNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      const currentDay = lagosNow.getDay();
      // Keep the filter aligned with isClubOpenTonight: today's schedule must
      // overlap the 18:00-24:00 evening window. This excludes 09:00-17:00 clubs.
      filter.operatingHours = {
        $elemMatch: {
          day: currentDay,
          isOpen: true,
          $or: [
            { openTime: { $gte: '18:00' } },
            { closeTime: { $gt: '18:00' } },
          ],
        },
      };
    }

    const [clubs, total] = await Promise.all([
      Club.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Club.countDocuments(filter),
    ]);

    const formattedClubs = clubs.map((club) => ({
      ...club,
      isOpenNow: isClubOpenNow(club.operatingHours),
      isOpenTonight: isClubOpenTonight(club.operatingHours),
    }));

    return res.json({
      success: true,
      clubs: formattedClubs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    console.error('Error fetching clubs:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch clubs' });
  }
};

// GET /api/v1/clubs/:clubId
export const getClubById = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const isAdmin = (req as any).adultUser?.isAdmin || (req as any).user?.isAdmin;

    let club;
    if (typeof clubId === 'string' && mongoose.Types.ObjectId.isValid(clubId)) club = await Club.findById(clubId).lean();
    if (!club) club = await Club.findOne({ slug: clubId }).lean();

    if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
    if (club.status !== 'active' && !isAdmin && club.ownerId?.toString() !== userId?.toString()) {
      return res.status(404).json({ success: false, error: 'Club not found or not active' });
    }

    void Club.findByIdAndUpdate(club._id, { $inc: { viewCount: 1 } });

    return res.json({
      success: true,
      club: {
        ...club,
        isOpenNow: isClubOpenNow(club.operatingHours),
        isOpenTonight: isClubOpenTonight(club.operatingHours),
      },
    });
  } catch (err: any) {
    console.error('Error fetching club detail:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch club detail' });
  }
};

// POST /api/v1/clubs
export const createClub = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parseResult = createClubSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.issues[0]?.message || 'Invalid club data' });
    }

    const {
      name, description, tagline, coverImage, logoImage, gallery, location,
      website, instagram, phone, operatingHours, entryFee, genres, vibes,
    } = parseResult.data;

    let baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;
    while (await Club.exists({ slug })) slug = `${baseSlug}-${counter++}`;

    let club;
    try {
      club = await Club.create({
        name: name.trim(), slug, description, tagline, coverImage, logoImage,
        gallery: gallery || [], location: location || {}, website, instagram, phone,
        operatingHours: operatingHours || [], entryFee: entryFee || { hasEntryFee: false },
        genres: Array.isArray(genres) ? genres.map((g: string) => g.toLowerCase()) : [],
        vibes: Array.isArray(vibes) ? vibes.map((v: string) => v.toLowerCase()) : [],
        ownerId: userId, status: 'pending',
      });
    } catch (createErr: any) {
      if (createErr.code !== 11000) throw createErr;
      slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
      club = await Club.create({
        name: name.trim(), slug, description, tagline, coverImage, logoImage,
        gallery: gallery || [], location: location || {}, website, instagram, phone,
        operatingHours: operatingHours || [], entryFee: entryFee || { hasEntryFee: false },
        genres: Array.isArray(genres) ? genres.map((g: string) => g.toLowerCase()) : [],
        vibes: Array.isArray(vibes) ? vibes.map((v: string) => v.toLowerCase()) : [],
        ownerId: userId, status: 'pending',
      });
    }

    return res.status(201).json({ success: true, club, message: 'Club submitted successfully and is pending admin verification.' });
  } catch (err: any) {
    console.error('Error creating club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to submit club' });
  }
};

// PUT /api/v1/clubs/:clubId
export const updateClub = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const isAdmin = (req as any).adultUser?.isAdmin || (req as any).user?.isAdmin;
    const { clubId } = req.params;

    const club = await Club.findById(clubId);
    if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
    if (!isAdmin && club.ownerId?.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not the owner of this club' });
    }

    const parseResult = createClubSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.issues[0]?.message || 'Invalid club update data' });
    }

    const data = parseResult.data;
    if (data.name !== undefined && data.name.trim() !== club.name) {
      const newName = data.name.trim();
      const baseSlug = generateSlug(newName);
      let newSlug = baseSlug;
      let counter = 1;
      while (await Club.exists({ slug: newSlug, _id: { $ne: club._id } })) newSlug = `${baseSlug}-${counter++}`;
      club.name = newName;
      club.slug = newSlug;
    }

    const allowedUpdates = [
      'description', 'tagline', 'coverImage', 'logoImage', 'gallery', 'location',
      'website', 'instagram', 'phone', 'operatingHours', 'entryFee', 'genres', 'vibes',
    ] as const;

    for (const field of allowedUpdates) {
      if (data[field] !== undefined) (club as any)[field] = data[field];
    }

    await club.save();
    return res.json({ success: true, club, message: 'Club updated successfully' });
  } catch (err: any) {
    console.error('Error updating club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to update club' });
  }
};

// ADMIN: GET /admin/clubs
export const adminGetClubs = async (req: Request, res: Response) => {
  try {
    const { status = 'pending', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;

    const [clubs, total] = await Promise.all([
      Club.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Club.countDocuments(filter),
    ]);

    return res.json({ success: true, data: { clubs, total, page: pageNum, limit: limitNum } });
  } catch (err: any) {
    console.error('Admin error fetching clubs:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch admin clubs' });
  }
};

// ADMIN: PUT /admin/clubs/:clubId/approve
export const adminApproveClub = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).adultUser?._id || (req as any).user?._id;
    const { clubId } = req.params;
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'pending' },
      { $set: { status: 'active', verifiedAt: new Date(), verifiedBy: adminId, rejectionReason: null } },
      { new: true }
    ).lean();
    if (!club) return res.status(400).json({ success: false, error: 'Club not found or not in pending status' });
    return res.json({ success: true, club, message: 'Club approved successfully' });
  } catch (err: any) {
    console.error('Admin error approving club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to approve club' });
  }
};

// ADMIN: PUT /admin/clubs/:clubId/reject
export const adminRejectClub = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { reason } = req.body;
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: reason || 'Does not meet platform guidelines' } },
      { new: true }
    ).lean();
    if (!club) return res.status(400).json({ success: false, error: 'Club not found or not in pending status' });
    return res.json({ success: true, club, message: 'Club rejected' });
  } catch (err: any) {
    console.error('Admin error rejecting club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to reject club' });
  }
};

// ADMIN: PUT /admin/clubs/:clubId/suspend
export const adminSuspendClub = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'active' },
      { $set: { status: 'suspended' } },
      { new: true }
    ).lean();
    if (!club) return res.status(400).json({ success: false, error: 'Club not found or not in active status' });
    return res.json({ success: true, club, message: 'Club suspended' });
  } catch (err: any) {
    console.error('Admin error suspending club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to suspend club' });
  }
};
