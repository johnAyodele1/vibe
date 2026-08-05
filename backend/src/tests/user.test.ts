import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import { generateAccessToken } from '../middleware/auth';
import { IUser } from '../types/models';

describe('User & Interaction Endpoints', () => {
  let token: string;
  let userId: string;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    const user = await User.create({
      email: 'user@example.com',
      password: 'password123',
      firstName: 'User',
      dateOfBirth: '1995-01-01',
      gender: 'Male',
      preferences: {
        genderPreference: 'Everyone',
        ageRange: { min: 18, max: 50 },
        maxDistance: 50
      },
      location: {
        type: 'Point',
        coordinates: [0, 0]
      }
    });
    userId = (user._id as Types.ObjectId).toString();
    token = generateAccessToken(userId);
  });

  describe('Profile Endpoints', () => {
    it('GET /api/users/profile - should get current user profile', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user._id).toBe(userId);
    });

    it('GET /api/users/:id - should get user by id', async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user._id).toBe(userId);
    });

    it('PUT /api/users/profile - should update user profile', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.firstName).toBe('Updated');
    });

    it('POST /api/users/:id/block - should block another user', async () => {
      const otherUser = await User.create({
        email: 'block@example.com',
        password: 'password123',
        firstName: 'Block',
        dateOfBirth: '1995-01-01',
        gender: 'Female'
      });

      const res = await request(app)
        .post(`/api/users/${otherUser._id}/block`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const user = await User.findById(userId);
      expect(user?.blockedUsers.some((id) => id.toString() === otherUser._id.toString())).toBe(true);
    });

    it('POST /api/users/:id/report - should report a user', async () => {
      const otherUser = await User.create({
        email: 'report@example.com',
        password: 'password123',
        firstName: 'Report',
        dateOfBirth: '1995-01-01',
        gender: 'Female'
      });

      const res = await request(app)
        .post(`/api/users/${otherUser._id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Inappropriate behaviour' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('reported');
    });

    it('DELETE /api/users/account - should delete account', async () => {
        const res = await request(app)
          .delete('/api/users/account')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        const user = await User.findById(userId);
        expect(user).toBeNull();
      });
  });

  describe('Discovery Endpoint', () => {
    it('GET /api/users/discover - should return users matching preferences and location', async () => {
      // Ensure index is ready
      await User.ensureIndexes();

      // User within distance and matching gender
      await User.create({
        email: 'match@example.com',
        password: 'password123',
        firstName: 'Match',
        dateOfBirth: '1995-01-01',
        gender: 'Female',
        location: {
          type: 'Point',
          coordinates: [0.01, 0.01] // Close to 0,0
        }
      });

      // User outside distance
      await User.create({
        email: 'far@example.com',
        password: 'password123',
        firstName: 'Far',
        dateOfBirth: '1995-01-01',
        gender: 'Female',
        location: {
          type: 'Point',
          coordinates: [1, 1] // ~150km away
        }
      });

      const res = await request(app)
        .get('/api/users/discover')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeGreaterThan(0);
      const userNames = res.body.data.users.map((u: Partial<IUser>) => u.firstName);
      expect(userNames).toContain('Match');
    });

    it('GET /api/users/discover - should filter by gender preference', async () => {
        await User.findByIdAndUpdate(userId, { 'preferences.genderPreference': 'Female' });

        await User.create({
          email: 'female@example.com',
          password: 'password123',
          firstName: 'FemaleUser',
          dateOfBirth: '1995-01-01',
          gender: 'Female',
          location: { type: 'Point', coordinates: [0, 0] }
        });

        await User.create({
            email: 'male@example.com',
            password: 'password123',
            firstName: 'MaleUser',
            dateOfBirth: '1995-01-01',
            gender: 'Male',
            location: { type: 'Point', coordinates: [0, 0] }
          });

        const res = await request(app)
          .get('/api/users/discover')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.users.length).toBe(1);
        expect(res.body.data.users[0].firstName).toBe('FemaleUser');
      });
  });

  describe('Interaction Endpoints', () => {
    let otherUserId: string;

    beforeEach(async () => {
        const otherUser = await User.create({
            email: 'other@example.com',
            password: 'password123',
            firstName: 'Other',
            dateOfBirth: '1995-01-01',
            gender: 'Female'
          });
          otherUserId = (otherUser._id as Types.ObjectId).toString();
    });

    it('POST /api/users/:id/like - should like another user', async () => {
      const res = await request(app)
        .post(`/api/users/${otherUserId}/like`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isMatch).toBe(false);
    });

    it('POST /api/users/:id/dislike - should dislike another user', async () => {
        const res = await request(app)
          .post(`/api/users/${otherUserId}/dislike`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User disliked');
    });

    it('POST /api/users/:id/super-like - should super-like (favourite) another user', async () => {
        const res = await request(app)
          .post(`/api/users/${otherUserId}/super-like`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User added to favourites');
    });

    it('GET /api/users/favourites - should get favourited users', async () => {
        await request(app)
          .post(`/api/users/${otherUserId}/super-like`)
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .get('/api/users/favourites')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.favourites.length).toBe(1);
        expect(res.body.data.favourites[0]._id).toBe(otherUserId);
    });
  });
});
