import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string()
      .min(12)
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
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

export const tipSchema = z.object({
  body: z.object({
    recipientId: z.string(),
    amount: z.number().int().positive(),
    message: z.string().max(100).optional(),
    isAnonymous: z.boolean().optional(),
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
