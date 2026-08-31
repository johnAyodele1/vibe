import { z } from 'zod';

export const createClubSchema = z.object({
  name: z.string().min(2, 'Club name must be at least 2 characters').max(100),
  description: z.string().max(2000).optional(),
  tagline: z.string().max(120).optional(),
  coverImage: z.string().url('Invalid cover image URL').optional().or(z.literal('')),
  logoImage: z.string().url('Invalid logo image URL').optional().or(z.literal('')),
  gallery: z.array(z.object({
    url: z.string().url(),
    caption: z.string().optional(),
  })).max(10).optional(),
  location: z.object({
    country: z.object({ name: z.string().optional(), code: z.string().optional() }).optional(),
    state: z.object({ name: z.string().optional(), code: z.string().optional() }).optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    coordinates: z.object({ lat: z.number().optional(), lng: z.number().optional() }).optional(),
  }).optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  phone: z.string().optional(),
  operatingHours: z.array(z.object({
    day: z.number().min(0).max(6),
    isOpen: z.boolean(),
    openTime: z.string().optional(),
    closeTime: z.string().optional(),
  })).optional(),
  entryFee: z.object({
    hasEntryFee: z.boolean(),
    amount: z.number().nonnegative().optional(),
    description: z.string().optional(),
  }).optional(),
  genres: z.array(z.string()).optional(),
  vibes: z.array(z.string()).optional(),
});

export const createPartySchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  tagline: z.string().max(120).optional(),
  coverImage: z.string().url('Cover image must be a valid URL'),
  gallery: z.array(z.object({
    type: z.enum(['image', 'video']),
    url: z.string().url(),
    thumbnail: z.string().optional(),
    order: z.number().optional(),
  })).max(12).optional(),
  venueName: z.string().min(2, 'Venue name is required'),
  venueAddress: z.string().min(5, 'Venue address is required'),
  location: z.object({
    country: z.object({ name: z.string().optional(), code: z.string().optional() }).optional(),
    state: z.object({ name: z.string().optional(), code: z.string().optional() }).optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    coordinates: z.object({ lat: z.number().optional(), lng: z.number().optional() }).optional(),
  }).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
  timezone: z.string().default('Africa/Lagos'),
  ticketTiers: z.array(z.object({
    tierId: z.string().optional(),
    name: z.string().min(1, 'Tier name is required'),
    description: z.string().optional(),
    price: z.number().nonnegative('Price must be non-negative'),
    quantity: z.number().int().positive('Quantity must be greater than 0'),
    perPersonLimit: z.number().int().positive().default(4),
    isActive: z.boolean().default(true),
  })).min(1, 'At least one ticket tier is required').max(5),
  organizerPhone: z.string().optional(),
  guardAccessCode: z.string().regex(/^\d{6}$/, 'Guard access PIN must be exactly 6 digits').optional(),
  genres: z.array(z.string()).optional(),
  vibes: z.array(z.string()).optional(),
});

export const purchaseTicketsSchema = z.object({
  tierId: z.string().min(1, 'tierId is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Quantity cannot exceed 10'),
  paymentReference: z.string().min(3, 'paymentReference or paymentIntentId required').optional(),
  paymentIntentId: z.string().optional(),
  paymentProvider: z.enum(['paystack', 'stripe', 'wallet', 'simulated']).optional().default('simulated'),
});

export const checkinScanSchema = z.object({
  ticketCode: z.string().min(6, 'ticketCode is required'),
  action: z.enum(['entered', 'exited', 're_entered']),
});
