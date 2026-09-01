import { Request, Response } from 'express';
import Club from '../models/Club';
import { createClubSchema } from '../validators/partiesAndClubs.validator';
import mongoose from 'mongoose';

// Utility to generate a URL-friendly slug
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Check if a club is currently open in Africa/Lagos timezone considering openTime & closeTime (overnight schedules included)
export const isClubOpenNow = (
  clubHours: Array<{ day: number; isOpen: boolean; openTime?: string; closeTime?: string }>
): boolean => {
  if (!clubHours || !Array.isArray(clubHours)) return false;

  const now = new Date();
  const lagosTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
  const lagosNow = new Date(lagosTimeString);

  const currentDay = lagosNow.getDay(); // 0 = Sun, 6 = Sat
  const currentMinutes = lagosNow.getHours() * 60 + lagosNow.getMinutes();

  const parseTime = (timeStr?: string, defaultMins = 0): number => {
    if (!timeStr) return defaultMins;
    const parts = timeStr.split(':');
    if (parts.length < 2) return defaultMins;
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };

  // 1. Check schedule for current day
  const todayHours = clubHours.find((h) => h.day === currentDay);
  if (todayHours && todayHours.isOpen) {
    const openMins = parseTime(todayHours.openTime, 22 * 60);
    const closeMins = parseTime(todayHours.closeTime, 4 * 60);

    if (openMins < closeMins) {
      if (currentMinutes >= openMins && currentMinutes <= closeMins) return true;
    } else {
      if (currentMinutes >= openMins) return true;
    }
  }

  // 2. Check schedule for previous day (overnight hours spanning past midnight)
  const prevDay = (currentDay + 6) % 7;
  const prevHours = clubHours.find((h) => h.day === prevDay);
  if (prevHours && prevHours.isOpen) {
    const openMins = parseTime(prevHours.openTime, 22 * 60);
    const closeMins = parseTime(prevHours.closeTime, 4 * 60);

    if (openMins > closeMins && currentMinutes <= closeMins) {
      return true;
    }
  }

  return false;
};

export const isClubOpenTonight = isClubOpenNow;

// GET /api/v1/clubs
export const getClubs = async (req: Request, res: Response) => {
  try {
    const { city, country, state, openToday, genre, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { status: 'active' };

    if (city) {
      filter['location.city'] = new RegExp(`^${(city as string).trim()}$`, 'i');
    }
    if (state) {
      filter['location.state.code'] = (state as string).trim().toUpperCase();
    }
    if (country) {
      filter['location.country.code'] = (country as string).trim().toUpperCase();
    }
    if (genre) {
      filter.genres = { $in: [(genre as string).toLowerCase()] };
    }

    const clubs = await Club.find(filter).sort({ createdAt: -1 }).lean();

    let resultClubs = clubs;
    if (openToday === 'true') {
      resultClubs = clubs.filter((c) => isClubOpenTonight(c.operatingHours));
    }

    const total = resultClubs.length;
    const paginatedClubs = resultClubs.slice(skip, skip + limitNum).map((club) => ({
      ...club,
      isOpenNow: isClubOpenNow(club.operatingHours),
      isOpenTonight: isClubOpenNow(club.operatingHours),
    }));

    return res.json({
      success: true,
      clubs: paginatedClubs,
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

    if (typeof clubId === 'string' && mongoose.Types.ObjectId.isValid(clubId)) {
      club = await Club.findById(clubId).lean();
    }
    if (!club) {
      club = await Club.findOne({ slug: clubId }).lean();
    }

    if (!club) {
      return res.status(404).json({ success: false, error: 'Club not found' });
    }

    // Enforce public visibility constraint
    if (club.status !== 'active' && !isAdmin && club.ownerId?.toString() !== userId?.toString()) {
      return res.status(404).json({ success: false, error: 'Club not found or not active' });
    }

    // Increment view count asynchronously
    void Club.findByIdAndUpdate(club._id, { $inc: { viewCount: 1 } });

    return res.json({
      success: true,
      club: {
        ...club,
        isOpenNow: isClubOpenNow(club.operatingHours),
        isOpenTonight: isClubOpenNow(club.operatingHours),
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
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parseResult = createClubSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid club data',
      });
    }

    const {
      name,
      description,
      tagline,
      coverImage,
      logoImage,
      gallery,
      location,
      website,
      instagram,
      phone,
      operatingHours,
      entryFee,
      genres,
      vibes,
    } = parseResult.data;

    let baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;
    while (await Club.exists({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const club = await Club.create({
      name: name.trim(),
      slug,
      description,
      tagline,
      coverImage,
      logoImage,
      gallery: gallery || [],
      location: location || {},
      website,
      instagram,
      phone,
      operatingHours: operatingHours || [],
      entryFee: entryFee || { hasEntryFee: false },
      genres: Array.isArray(genres) ? genres.map((g: string) => g.toLowerCase()) : [],
      vibes: Array.isArray(vibes) ? vibes.map((v: string) => v.toLowerCase()) : [],
      ownerId: userId,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      club,
      message: 'Club submitted successfully and is pending admin verification.',
    });
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
    if (!club) {
      return res.status(404).json({ success: false, error: 'Club not found' });
    }

    if (!isAdmin && club.ownerId?.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not the owner of this club' });
    }

    const allowedUpdates = [
      'name',
      'description',
      'tagline',
      'coverImage',
      'logoImage',
      'gallery',
      'location',
      'website',
      'instagram',
      'phone',
      'operatingHours',
      'entryFee',
      'genres',
      'vibes',
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        (club as any)[field] = req.body[field];
      }
    });

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
    if (status && status !== 'all') {
      filter.status = status;
    }

    const [clubs, total] = await Promise.all([
      Club.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Club.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        clubs,
        total,
        page: pageNum,
        limit: limitNum,
      },
    });
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

    // Enforce state transition rule: pending -> active
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'pending' },
      {
        $set: {
          status: 'active',
          verifiedAt: new Date(),
          verifiedBy: adminId,
          rejectionReason: null,
        },
      },
      { new: true }
    ).lean();

    if (!club) {
      return res.status(400).json({ success: false, error: 'Club not found or not in pending status' });
    }

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

    // Enforce state transition rule: pending -> rejected
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason || 'Does not meet platform guidelines',
        },
      },
      { new: true }
    ).lean();

    if (!club) {
      return res.status(400).json({ success: false, error: 'Club not found or not in pending status' });
    }

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

    // Enforce state transition rule: active -> suspended
    const club = await Club.findOneAndUpdate(
      { _id: clubId, status: 'active' },
      {
        $set: {
          status: 'suspended',
        },
      },
      { new: true }
    ).lean();

    if (!club) {
      return res.status(400).json({ success: false, error: 'Club not found or not in active status' });
    }

    return res.json({ success: true, club, message: 'Club suspended' });
  } catch (err: any) {
    console.error('Admin error suspending club:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to suspend club' });
  }
};
