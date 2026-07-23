import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';

describe('Hook Up Tonight — Backend & Geocoding Integration', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let providerToken: string;
  let providerId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Register a normal user to obtain their token
    const userRes = await request(app)
      .post('/api/adult/auth/register')
      .send({
        email: 'user@hookup.com',
        password: 'Password123!@#',
        username: 'normaluser',
        displayName: 'Test User',
        dateOfBirth: '1995-01-01',
        role: 'user',
        country: 'NG',
      });
    userToken = userRes.body.data.accessToken;

    // Set user profile location
    await AdultUser.findByIdAndUpdate(userRes.body.data.user.id, {
      location: {
        country: { code: 'NG', name: 'Nigeria' },
        state: { code: 'LA', name: 'Lagos' },
        city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 }
      }
    });

    // Register a provider
    const providerRes = await request(app)
      .post('/api/adult/auth/register')
      .send({
        email: 'provider@hookup.com',
        password: 'Password123!@#',
        username: 'performer',
        displayName: 'Stage Name',
        dateOfBirth: '1990-05-15',
        role: 'provider',
        country: 'NG',
      });
    providerToken = providerRes.body.data.accessToken;
    providerId = providerRes.body.data.user.id;

    // Complete provider onboarding steps to make them active & verified
    await AdultUser.findByIdAndUpdate(providerId, {
      status: 'active',
      isVerified: true,
      'providerProfile.onboarding.isComplete': true,
      'providerProfile.servicesOffered': ['hookup'],
      'providerProfile.categories': ['Tonight Only'],
      'providerProfile.tonightRate': 150,
      'providerProfile.isLive': true,
      'providerProfile.location': {
        country: { code: 'NG', name: 'Nigeria' },
        state: { code: 'LA', name: 'Lagos' },
        city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
        coordinates: {
          type: 'Point',
          coordinates: [3.3792, 6.5244]
        }
      }
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('GET /api/v1/adult/profiles/me returns logged-in user with their location', async () => {
    const res = await request(app)
      .get('/api/v1/adult/profiles/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.location).toBeDefined();
    expect(res.body.data.location.country.code).toBe('NG');
    expect(res.body.data.location.city.name).toBe('Lagos');
  });

  it('GET /api/v1/adult/hookup/nearby returns active hookup providers inside grid view', async () => {
    const res = await request(app)
      .get('/api/v1/adult/hookup/nearby?country=NG&state=LA&city=Lagos&intention=Tonight Only&isOnline=true')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.providers).toBeDefined();
    expect(res.body.data.providers.length).toBeGreaterThan(0);

    const providerObj = res.body.data.providers[0];
    expect(providerObj.role).toBe('provider');
    expect(providerObj.providerProfile.isLive).toBe(true);
    expect(providerObj.providerProfile.servicesOffered).toContain('hookup');
  });

  it('GET /api/v1/adult/hookup/nearby returns exact schema inside map view', async () => {
    const res = await request(app)
      .get('/api/v1/adult/hookup/nearby?view=map&country=NG&state=LA&city=Lagos')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.providers).toBeDefined();
    expect(res.body.providers.length).toBeGreaterThan(0);

    const mapProv = res.body.providers[0];
    expect(mapProv.id).toBe(providerId);
    expect(mapProv.stageName).toBe('Stage Name');
    expect(mapProv.isOnline).toBe(true);
    expect(mapProv.tonightRate).toBe(150);
    expect(mapProv.coordinates).toEqual([6.5244, 3.3792]);
  });

  it('Provider onboarding step 5 saves location and initializes default coordinates', async () => {
    // We mock onboarding steps completed 1-4 first
    await AdultUser.findByIdAndUpdate(providerId, {
      'providerProfile.onboarding.completedSteps': [1, 2, 3, 4]
    });

    const res = await request(app)
      .put('/api/v1/adult/providers/me/onboarding/step/5')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        country: { code: 'US', name: 'United States' },
        state: { code: 'CA', name: 'California' },
        city: { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
        coverageArea: 'city'
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updatedProvider = await AdultUser.findById(providerId);
    expect(updatedProvider?.providerProfile?.location?.country?.code).toBe('US');
    expect(updatedProvider?.providerProfile?.location?.city?.name).toBe('Los Angeles');
    expect(updatedProvider?.providerProfile?.location?.coordinates?.coordinates).toBeDefined();
    expect(updatedProvider?.providerProfile?.location?.coordinates?.coordinates?.length).toBe(2);
    expect(updatedProvider?.providerProfile?.location?.coordinates?.coordinates[0]).toBeCloseTo(-118.24, 1);
    expect(updatedProvider?.providerProfile?.location?.coordinates?.coordinates[1]).toBeCloseTo(34.05, 1);
  });
});
