import { Request, Response } from 'express';
import Party, { ITicketTier } from '../models/Party';
import { createPartySchema } from '../validators/partiesAndClubs.validator';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

// Generate 6-digit random PIN if needed
const generateGuardPin = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashGuardPin = async (pin: string): Promise<string> => {
  return bcrypt.hash(pin, 10);
};

// GET /api/v1/parties
export const getParties = async (req: Request, res: Response) => {
  try {
    const { city, country, state, genre, from, to, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {
      status: 'approved',
      startDate: { $gte: new Date() },
    };

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
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from as string);
      if (to) filter.startDate.$lte = new Date(to as string);
    }

    const [parties, total] = await Promise.all([
      Party.find(filter)
        .sort({ isFeatured: -1, startDate: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Party.countDocuments(filter),
    ]);

    const formattedParties = parties.map((p) => {
      const isSoldOut = p.ticketTiers.every((t) => t.sold >= t.quantity || !t.isActive);
      const minPrice = p.ticketTiers.reduce((min, t) => (t.price < min ? t.price : min), Infinity);
      return {
        ...p,
        isSoldOut,
        startingPrice: minPrice === Infinity ? 0 : minPrice,
      };
    });

    return res.json({
      success: true,
      parties: formattedParties,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    console.error('Error fetching parties:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch parties' });
  }
};

// GET /api/v1/parties/:partyId
export const getPartyById = async (req: Request, res: Response) => {
  try {
    const { partyId } = req.params;
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const isAdmin = (req as any).adultUser?.isAdmin || (req as any).user?.isAdmin;

    if (typeof partyId !== 'string' || !mongoose.Types.ObjectId.isValid(partyId)) {
      return res.status(400).json({ success: false, error: 'Invalid party ID' });
    }

    const party = await Party.findById(partyId).lean();
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    // Enforce public visibility constraint
    if (party.status !== 'approved' && !isAdmin && party.organizerId?.toString() !== userId?.toString()) {
      return res.status(404).json({ success: false, error: 'Party not found or not approved' });
    }

    // Increment view count asynchronously
    void Party.findByIdAndUpdate(party._id, { $inc: { viewCount: 1 } });

    const formattedTiers = party.ticketTiers.map((t) => ({
      ...t,
      remaining: Math.max(0, t.quantity - t.sold),
      isSoldOut: t.sold >= t.quantity,
    }));

    return res.json({
      success: true,
      party: {
        ...party,
        ticketTiers: formattedTiers,
      },
    });
  } catch (err: any) {
    console.error('Error fetching party detail:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch party detail' });
  }
};

// POST /api/v1/parties
export const createParty = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const userName = (req as any).adultUser?.displayName || (req as any).user?.displayName || (req as any).user?.firstName;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parseResult = createPartySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid party data',
      });
    }

    const {
      title,
      description,
      tagline,
      coverImage,
      gallery,
      organizerName: reqOrganizerName,
      organizerPhone,
      venueName,
      venueAddress,
      location,
      startDate,
      endDate,
      timezone = 'Africa/Lagos',
      ticketTiers,
      guardAccessCode,
      genres,
      vibes,
    } = parseResult.data;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({ success: false, error: 'Start date must be before end date' });
    }

    const processedTiers: ITicketTier[] = ticketTiers.map((t: any, index: number) => ({
      tierId: t.tierId || `tier-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
      name: t.name || 'General Admission',
      description: t.description || '',
      price: Math.max(0, parseFloat(t.price) || 0),
      quantity: Math.max(1, parseInt(t.quantity, 10) || 1),
      sold: 0,
      perPersonLimit: Math.max(1, parseInt(t.perPersonLimit, 10) || 4),
      isActive: t.isActive !== false,
    }));

    const rawPin = (guardAccessCode && String(guardAccessCode).trim().length === 6)
      ? String(guardAccessCode).trim()
      : generateGuardPin();

    const guardAccessCodeHash = await hashGuardPin(rawPin);

    const party = await Party.create({
      title: title.trim(),
      description: description.trim(),
      tagline: tagline ? tagline.trim() : undefined,
      coverImage,
      gallery: gallery || [],
      organizerId: userId,
      organizerName: reqOrganizerName || userName || 'Organizer',
      organizerPhone: organizerPhone || '',
      venueName: venueName.trim(),
      venueAddress: venueAddress.trim(),
      location: location || {},
      startDate: start,
      endDate: end,
      timezone,
      ticketTiers: processedTiers,
      platformFeeRate: 0.05, // Non-editable 5% platform fee
      status: 'pending_review',
      guardAccessCodeHash,
      genres: Array.isArray(genres) ? genres.map((g: string) => g.toLowerCase()) : [],
      vibes: Array.isArray(vibes) ? vibes.map((v: string) => v.toLowerCase()) : [],
    });

    return res.status(201).json({
      success: true,
      party,
      guardPin: rawPin, // Return raw PIN once so organizer can copy it for guards
      message: 'Party submitted for review. Admin typically reviews within 24 hours.',
    });
  } catch (err: any) {
    console.error('Error creating party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create party' });
  }
};

// PUT /api/v1/parties/:partyId
export const updateParty = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const { partyId } = req.params;

    const party = await Party.findById(partyId);
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    if (party.organizerId.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not the organizer of this party' });
    }

    if (party.status !== 'draft' && party.status !== 'pending_review') {
      return res.status(400).json({ success: false, error: 'Cannot update party after approval or cancellation' });
    }

    const {
      title,
      description,
      tagline,
      coverImage,
      gallery,
      venueName,
      venueAddress,
      location,
      startDate,
      endDate,
      timezone,
      ticketTiers,
      guardAccessCode,
      genres,
      vibes,
    } = req.body;

    if (title) party.title = title.trim();
    if (description) party.description = description.trim();
    if (tagline !== undefined) party.tagline = tagline;
    if (coverImage) party.coverImage = coverImage;
    if (gallery) party.gallery = gallery;
    if (venueName) party.venueName = venueName.trim();
    if (venueAddress) party.venueAddress = venueAddress.trim();
    if (location) party.location = location;
    if (startDate) party.startDate = new Date(startDate);
    if (endDate) party.endDate = new Date(endDate);
    if (party.startDate >= party.endDate) {
      return res.status(400).json({ success: false, error: 'Start date must be before end date' });
    }
    if (timezone) party.timezone = timezone;
    if (genres) party.genres = genres.map((g: string) => g.toLowerCase());
    if (vibes) party.vibes = vibes.map((v: string) => v.toLowerCase());

    if (guardAccessCode && String(guardAccessCode).trim().length === 6) {
      party.guardAccessCodeHash = await hashGuardPin(String(guardAccessCode).trim());
    }

    if (Array.isArray(ticketTiers) && ticketTiers.length > 0) {
      const existingTierMap = new Map(party.ticketTiers.map((tier) => [tier.tierId, tier]));

      for (const t of ticketTiers) {
        const existing = t.tierId ? existingTierMap.get(t.tierId) : undefined;
        const newQty = Math.max(1, parseInt(t.quantity, 10) || 1);
        const currentSold = existing ? existing.sold : 0;
        if (newQty < currentSold) {
          return res.status(400).json({
            success: false,
            error: `Cannot reduce tier quantity below tickets already sold (${currentSold}) for tier "${t.name || existing?.name}"`,
          });
        }
      }

      party.ticketTiers = ticketTiers.map((t: any, index: number) => {
        const existing = t.tierId ? existingTierMap.get(t.tierId) : undefined;
        const currentSold = existing ? existing.sold : 0;
        return {
          tierId: t.tierId || `tier-${Date.now()}-${index}`,
          name: t.name || existing?.name || 'General Admission',
          description: t.description ?? existing?.description ?? '',
          price: Math.max(0, parseFloat(t.price) || 0),
          quantity: Math.max(1, parseInt(t.quantity, 10) || 1),
          sold: currentSold,
          perPersonLimit: Math.max(1, parseInt(t.perPersonLimit, 10) || 4),
          isActive: t.isActive !== false,
        };
      });
    }

    await party.save();

    return res.json({ success: true, party, message: 'Party updated successfully' });
  } catch (err: any) {
    console.error('Error updating party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to update party' });
  }
};

// DELETE /api/v1/parties/:partyId
export const cancelParty = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const isAdmin = (req as any).adultUser?.isAdmin || (req as any).user?.isAdmin;
    const { partyId } = req.params;

    const party = await Party.findById(partyId);
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    if (!isAdmin && party.organizerId.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You cannot cancel this party' });
    }

    party.status = 'cancelled';
    await party.save();

    return res.json({ success: true, party, message: 'Party cancelled successfully' });
  } catch (err: any) {
    console.error('Error cancelling party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to cancel party' });
  }
};

// ADMIN: GET /admin/parties
export const adminGetParties = async (req: Request, res: Response) => {
  try {
    const { status = 'pending_review', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const [parties, total] = await Promise.all([
      Party.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Party.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        parties,
        total,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err: any) {
    console.error('Admin error fetching parties:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch admin parties' });
  }
};

// ADMIN: GET /admin/parties/:id
export const adminGetPartyDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const party = await Party.findById(id).populate('organizerId', 'displayName email phone profilePhoto').lean();
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    return res.json({ success: true, party });
  } catch (err: any) {
    console.error('Admin error fetching party detail:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch party detail' });
  }
};

// ADMIN: PUT /admin/parties/:id/approve
export const adminApproveParty = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).adultUser?._id || (req as any).user?._id;
    const { id } = req.params;

    // Enforce state transition rule: pending_review -> approved
    const party = await Party.findOneAndUpdate(
      { _id: id, status: 'pending_review' },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: adminId,
          rejectionReason: null,
        },
      },
      { new: true }
    ).lean();

    if (!party) {
      return res.status(400).json({ success: false, error: 'Party not found or not in pending review status' });
    }

    return res.json({ success: true, party, message: 'Party approved and is now live!' });
  } catch (err: any) {
    console.error('Admin error approving party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to approve party' });
  }
};

// ADMIN: PUT /admin/parties/:id/reject
export const adminRejectParty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Enforce state transition rule: pending_review -> rejected
    const party = await Party.findOneAndUpdate(
      { _id: id, status: 'pending_review' },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason || 'Does not comply with event guidelines',
        },
      },
      { new: true }
    ).lean();

    if (!party) {
      return res.status(400).json({ success: false, error: 'Party not found or not in pending review status' });
    }

    return res.json({ success: true, party, message: 'Party rejected' });
  } catch (err: any) {
    console.error('Admin error rejecting party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to reject party' });
  }
};

// ADMIN: PUT /admin/parties/:id/feature
export const adminToggleFeatureParty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Enforce business invariant: only approved live parties can be featured
    const party = await Party.findOne({ _id: id, status: 'approved' });
    if (!party) {
      return res.status(400).json({ success: false, error: 'Party not found or not in approved status' });
    }

    party.isFeatured = !party.isFeatured;
    await party.save();

    return res.json({ success: true, isFeatured: party.isFeatured, message: `Party ${party.isFeatured ? 'featured' : 'unfeatured'}` });
  } catch (err: any) {
    console.error('Admin error featuring party:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to toggle featured party' });
  }
};
