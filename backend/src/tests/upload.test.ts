import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import { generateAccessToken } from '../middleware/auth';

describe('Upload Endpoints', () => {
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
      gender: 'Male'
    });
    userId = (user._id as Types.ObjectId).toString();
    token = generateAccessToken(userId);
  });

  describe('Photo Management', () => {
    it('POST /api/upload/photo - should fail without a file', async () => {
      const res = await request(app)
        .post('/api/upload/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('PUT /api/upload/set-main/:index - should set main photo', async () => {
        await User.findByIdAndUpdate(userId, {
            photos: [
                { url: 'url1', isMain: true, order: 0, uploadedAt: new Date() },
                { url: 'url2', isMain: false, order: 1, uploadedAt: new Date() }
            ]
        });

        const res = await request(app)
          .put('/api/upload/set-main/1')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        const user = await User.findById(userId);
        expect(user?.photos[1].isMain).toBe(true);
        expect(user?.photos[0].isMain).toBe(false);
    });
  });
});
