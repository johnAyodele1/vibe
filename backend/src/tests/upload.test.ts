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
                { url: 'url1', publicId: 'public1', isMain: true, order: 0, uploadedAt: new Date() },
                { url: 'url2', publicId: 'public2', isMain: false, order: 1, uploadedAt: new Date() }
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

    it('DELETE /api/upload/photo/:publicId - should return 404 for missing photo', async () => {
      const res = await request(app)
        .delete('/api/upload/photo/nonexistent-public-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Photo not found');
    });

    it('DELETE /api/upload/photo/:publicId(*) - should handle publicId values with slashes', async () => {
      await User.findByIdAndUpdate(userId, {
        photos: [
          {
            url: 'url1',
            publicId: 'vibe-photos/test-photo-with-slash',
            isMain: true,
            order: 0,
            uploadedAt: new Date(),
          },
        ],
      });

      const res = await request(app)
        .delete('/api/upload/photo/vibe-photos/test-photo-with-slash')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const user = await User.findById(userId);
      expect(user?.photos.length).toBe(0);
    });
  });
});
