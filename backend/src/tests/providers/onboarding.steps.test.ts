import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../app';
import AdultUser from '../../models/AdultUser';
import CamSession from '../../models/CamSession';
import jwt from 'jsonwebtoken';

describe('Onboarding Step Validation', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let providerId: string;
  let otherProviderToken: string;
  let otherProviderId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AdultUser.deleteMany({});
    await CamSession.deleteMany({});

    // Create main provider user
    const provider = new AdultUser({
      email: 'provider@onboard.com',
      passwordHash: 'password123',
      username: 'onboardprovider',
      displayName: 'Lucia Rose',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
    });
    await provider.save();
    providerId = provider._id.toString();

    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create another provider user
    const other = new AdultUser({
      email: 'other@onboard.com',
      passwordHash: 'password123',
      username: 'otherprovider',
      displayName: 'Other Provider',
      dateOfBirth: new Date('1990-01-01'),
      role: 'provider',
      country: 'Nigeria',
    });
    await other.save();
    otherProviderId = other._id.toString();

    otherProviderToken = jwt.sign({ sub: otherProviderId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  describe('Step prerequisite enforcement', () => {
    it('can save step 1 without any prerequisites', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful provider bio at least 10 chars',
          gender: 'female',
          dateOfBirth: '1995-01-01',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.currentStep).toBe(2);
      expect(res.body.completedSteps).toContain(1);
    });

    it('cannot save step 2 if step 1 not completed — returns 403', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/2')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          photos: [],
          videoPreview: '',
        });

      expect(res.status).toBe(403);
    });

    it('cannot save step 3 if step 2 not completed — returns 403', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/3')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          servicesOffered: ['live_cam'],
        });

      expect(res.status).toBe(403);
    });

    it('cannot save step 4 if step 3 not completed — returns 403', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
        });

      expect(res.status).toBe(403);
    });

    it('cannot save step 5 if step 4 not completed — returns 403', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/5')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          country: { code: 'NG', name: 'Nigeria' },
          state: { name: 'Lagos' },
          city: { name: 'Ikeja' },
        });

      expect(res.status).toBe(403);
    });

    it('cannot save step 6 if step 5 not completed — returns 403', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/6')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          payoutMethod: 'pending',
        });

      expect(res.status).toBe(403);
    });

    it('cannot skip to step 4 by calling API directly without steps 1-3', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Step 1 — Profile validation', () => {
    it('saves bio, gender, dateOfBirth successfully', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          gender: 'female',
          dateOfBirth: '1995-05-15',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await AdultUser.findById(providerId);
      expect(dbUser?.bio).toBe('Beautiful and elegant bio that satisfies validation.');
      expect(dbUser?.providerProfile?.gender).toBe('female');
      expect(dbUser?.dateOfBirth.toISOString().split('T')[0]).toBe('1995-05-15');
    });

    it('returns 400 if bio is under 10 chars', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Short',
          gender: 'female',
          dateOfBirth: '1995-05-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.bio).toContain('Bio must be at least 10 characters');
    });

    it('returns 400 if bio is over 1000 chars', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'A'.repeat(1001),
          gender: 'female',
          dateOfBirth: '1995-05-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.bio).toContain('Bio cannot exceed 1000 characters');
    });

    it('returns 400 if dateOfBirth makes provider under 18', async () => {
      const underageDate = new Date();
      underageDate.setFullYear(underageDate.getFullYear() - 17);

      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          gender: 'female',
          dateOfBirth: underageDate.toISOString().split('T')[0],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.dateOfBirth).toContain('Must be 18 years or older');
    });

    it('returns 400 if dateOfBirth is in the future', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);

      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          gender: 'female',
          dateOfBirth: futureDate.toISOString().split('T')[0],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.dateOfBirth).toContain('cannot be in the future');
    });

    it('returns 400 if gender is missing', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          dateOfBirth: '1995-05-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.gender).toBeDefined();
    });

    it('advances currentStep to 2 on success', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          gender: 'female',
          dateOfBirth: '1995-05-15',
        });

      expect(res.body.currentStep).toBe(2);
    });

    it('adds 1 to completedSteps on success', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/1')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bio: 'Beautiful and elegant bio that satisfies validation.',
          gender: 'female',
          dateOfBirth: '1995-05-15',
        });

      expect(res.body.completedSteps).toContain(1);
    });
  });

  describe('Step 3 — Services validation', () => {
    beforeEach(async () => {
      // Complete steps 1-2 first
      await AdultUser.findByIdAndUpdate(providerId, {
        bio: 'Valid provider bio long enough',
        'providerProfile.gender': 'female',
        'providerProfile.onboarding': {
          currentStep: 3,
          completedSteps: [1, 2],
          isComplete: false,
          completedAt: null,
        }
      });
    });

    it('saves servicesOffered array successfully', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/3')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          servicesOffered: ['live_cam', 'private_call'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await AdultUser.findById(providerId);
      expect(dbUser?.providerProfile?.servicesOffered).toContain('live_cam');
      expect(dbUser?.providerProfile?.servicesOffered).toContain('private_call');
    });

    it('returns 400 if servicesOffered is empty array', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/3')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          servicesOffered: [],
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 if servicesOffered contains invalid value', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/3')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          servicesOffered: ['invalid_service'],
        });

      expect(res.status).toBe(400);
    });

    it('accepts all valid service values', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/3')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          servicesOffered: ['live_cam', 'private_call', 'sext', 'hookup', 'random'],
        });

      expect(res.status).toBe(200);
    });
  });

  describe('Step 4 — Pricing validation', () => {
    beforeEach(async () => {
      // Complete steps 1-3 first with hookup & private_call services
      await AdultUser.findByIdAndUpdate(providerId, {
        bio: 'Valid provider bio long enough',
        'providerProfile.gender': 'female',
        'providerProfile.servicesOffered': ['private_call', 'hookup'],
        'providerProfile.onboarding': {
          currentStep: 4,
          completedSteps: [1, 2, 3],
          isComplete: false,
          completedAt: null,
        }
      });
    });

    it('requires perMinuteRate if private_call in services', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          tonightRate: 150,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.perMinuteRate).toBeDefined();
    });

    it('returns 400 if perMinuteRate below 0', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: -1,
          tonightRate: 150,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.perMinuteRate).toContain('Per-minute rate must be greater than 0 diamonds');
    });

    it('requires tonightRate if hookup in services', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.tonightRate).toBeDefined();
    });

    it('does not require perMinuteRate if private_call not in services', async () => {
      await AdultUser.findByIdAndUpdate(providerId, {
        'providerProfile.servicesOffered': ['hookup'],
      });

      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          tonightRate: 150,
        });

      expect(res.status).toBe(200);
    });

    it('does not require tonightRate if hookup not in services', async () => {
      await AdultUser.findByIdAndUpdate(providerId, {
        'providerProfile.servicesOffered': ['private_call'],
      });

      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
        });

      expect(res.status).toBe(200);
    });

    it('validates tipMenu items have amount >= 1', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
          tonightRate: 150,
          tipMenu: [{ amount: 0, action: 'Test' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors['tipMenu.0.amount']).toContain('at least 1');
    });

    it('accepts valid pricing without tip menu', async () => {
      const res = await request(app)
        .put('/api/v1/adult/providers/me/onboarding/step/4')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          perMinuteRate: 3.99,
          tonightRate: 150,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
