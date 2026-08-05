import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import { generateAccessToken } from '../middleware/auth';

describe('Auth Endpoints', () => {
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
  });

  const userData = {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    dateOfBirth: '1990-01-01',
    gender: 'Male',
  };

  describe('POST /api/auth/signup', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(userData.email);
      expect(res.body.data.tokens).toBeDefined();
    });

    it('should not register a user with an existing email', async () => {
      await User.create(userData);
      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login an existing user', async () => {
      await request(app).post('/api/auth/signup').send(userData);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token', async () => {
      const signupRes = await request(app).post('/api/auth/signup').send(userData);
      const refreshToken = signupRes.body.data.tokens.refreshToken as string;

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user', async () => {
      const signupRes = await request(app).post('/api/auth/signup').send(userData);
      const token = signupRes.body.data.tokens.accessToken as string;

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should get current user info', async () => {
      const signupRes = await request(app).post('/api/auth/signup').send(userData);
      const token = signupRes.body.data.tokens.accessToken as string;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(userData.email);
    });
  });

  describe('GET /api/auth/google-client-id', () => {
    it('should return 404 if not configured', async () => {
        const res = await request(app).get('/api/auth/google-client-id');
        expect(res.status).toBe(404);
    });
  });
});
