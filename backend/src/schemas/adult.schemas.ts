import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    username: z.string().min(3),
    displayName: z.string().min(1),
    dateOfBirth: z.string().refine((dob) => {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age >= 18;
    }, { message: 'Must be at least 18 years old' }),
    role: z.enum(['user', 'provider']),
    country: z.string(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

export const verifyEmailQuerySchema = z.object({
  query: z.object({
    token: z.string().min(1),
  }),
});

export const applyAsProviderSchema = z.object({
  body: z.object({
    stageName: z.string().min(2),
    idVerificationDocUrl: z.string().url().optional(),
    categories: z.array(z.string()).min(1),
    contentTags: z.array(z.string()),
    pricePerMinute: z.number().nonnegative().optional(),
    tipMinimum: z.number().nonnegative().optional(),
  }),
});

export const updateProviderProfileSchema = z.object({
  body: z.object({
    stageName: z.string().min(2).optional(),
    bio: z.string().max(500).optional(),
    country: z.string().optional(),
    profilePhoto: z.string().url().optional(),
    categories: z.array(z.string()).optional(),
    contentTags: z.array(z.string()).optional(),
    pricePerMinute: z.number().nonnegative().optional(),
    tipMinimum: z.number().nonnegative().optional(),
    videoCallPrice: z.number().nonnegative().optional(),
    audioCallPrice: z.number().nonnegative().optional(),
    privateSextPrice: z.number().nonnegative().optional(),
  }),
});

export const updateProviderStatusSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    status: z.enum(['approved', 'rejected']),
  }),
});

export const purchaseCreditsSchema = z.object({
  body: z.object({
    bundleId: z.string().min(1),
  }),
});

export const tipSchema = z.object({
  body: z.object({
    recipientId: z.string(),
    amount: z.number().int().positive(),
    message: z.string().max(100).optional(),
    isAnonymous: z.boolean().optional(),
  }),
});

export const subscribeSchema = z.object({
  body: z.object({
    tier: z.enum(['gold', 'platinum', 'diamond']),
  }),
});

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().min(1),
    mood: z.enum(['chill', 'wild', 'explicit']),
    tags: z.array(z.string()).optional(),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    receiverId: z.string(),
    content: z.string(),
    messageType: z.enum(['text', 'image', 'voice', 'gift', 'system']),
    mediaUrl: z.string().url().optional(),
    unlockCost: z.number().nonnegative().optional(),
  }),
});

export const startStreamSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    tags: z.array(z.string()),
    sessionType: z.enum(['public', 'private', 'vip_only', 'premium_only']),
    privateShowRate: z.number().nonnegative(),
    resolution: z.enum(['720p', '1080p', '4K']),
    chatEnabled: z.boolean(),
    recordingEnabled: z.boolean(),
  }),
});
