import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import jwt from 'jsonwebtoken';

describe('Hook Up Tonight — Location Filters and Nearby API', () => {
  let mongoServer: MongoMemoryServer;
  let memberToken: string;
  let providerToken: string;
  let providerId: string;

  beforeAll(async () => {
    // Start Memory Server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a regular member user with saved location
    const member = new AdultUser({
      email: 'member@hookup.com',
      passwordHash: 'password123',
      username: 'hookupmember',
      displayName: 'Simple Member',
      dateOfBirth: new Date('2000-01-01'),
      role: 'user',
      country: 'Nigeria',
      location: {
        country: { code: 'NG', name: 'Nigeria' },
        state: { code: 'LA', name: 'Lagos' },
        city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 }
      }
    });
    await member.save();
    memberToken = jwt.sign({ sub: member._id.toString() }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create an active, verified, onboarding-complete provider offering hookup service
    const provider = new AdultUser({
      email: 'provider@hookup.com',
      passwordHash: 'password123',
      username: 'hookupprovider',
      displayName: 'Lucia Rose',
      dateOfBirth: new Date('1995-01-01'),
      role: 'provider',
      country: 'Nigeria',
      status: 'active',
      isVerified: true,
      providerProfile: {
        stageName: 'Lucia Rose',
        onboarding: { isComplete: true, currentStep: 7, completedSteps: [1,2,3,4,5,6,7] },
        servicesOffered: ['hookup'],
        tonightRate: 150,
        isLive: true,
        location: {
          country: { code: 'NG', name: 'Nigeria' },
          state: { code: 'LA', name: 'Lagos' },
          city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
          coordinates: {
            type: 'Point',
            coordinates: [3.3792, 6.5244]
          }
        }
      }
    });
    await provider.save();
    providerId = provider._id.toString();
    providerToken = jwt.sign({ sub: providerId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('gets the logged-in member profile location on GET /api/v1/adult/profiles/me', async () => {
    const res = await request(app)
      .get('/api/v1/adult/profiles/me')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.location.country.code).toBe('NG');
    expect(res.body.data.location.city.name).toBe('Lagos');
  });

  it('queries providers successfully on GET /api/v1/adult/hookup/nearby', async () => {
    const res = await request(app)
      .get('/api/v1/adult/hookup/nearby?country=NG&state=LA&city=Lagos')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
    expect(res.body.data.providers[0].stageName).toBe('Lucia Rose');
    expect(res.body.data.providers[0].isOnline).toBe(true);
    expect(res.body.data.providers[0].tonightRate).toBe(150);
  });

  it('queries map coordinate dots successfully on GET /api/v1/adult/hookup/nearby with view=map', async () => {
    const res = await request(app)
      .get('/api/v1/adult/hookup/nearby?country=NG&state=LA&city=Lagos&view=map')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers.length).toBeGreaterThan(0);
    expect(res.body.providers[0].stageName).toBe('Lucia Rose');
    expect(res.body.providers[0].coordinates).toEqual([6.5244, 3.3792]);
  });
});
