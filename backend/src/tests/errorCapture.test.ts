import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { AppError } from '../models/AppError.model';
import { assignPriority } from '../shared/errorPriority';
import { captureError } from '../utils/captureError';
import { generateAccessToken } from '../middleware/auth';
import { errorCaptureMiddleware } from '../middleware/errorCapture';

describe('Centralized Error Monitoring System', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;
  let regularToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Start MongoMemoryServer
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Set admin env vars
    process.env.ADMIN_EMAIL = 'admin@test.com';
    process.env.ADMIN_PASSWORD = 'adminpassword';
    process.env.JWT_SECRET = 'test_secret';

    // Login as admin to get token
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'adminpassword',
      });
    adminToken = res.body.data.token;
    testUserId = new mongoose.Types.ObjectId().toString();
    regularToken = generateAccessToken(testUserId, false);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AppError.deleteMany({});
  });

  describe('Error Priority Assignment', () => {
    it('should assign CRITICAL priority to payment, wallet, or database errors with 500+', () => {
      const err = { message: 'Database connection failed', statusCode: 500 };
      const req = { path: '/api/v1/adult/cams/some-path' } as any;
      expect(assignPriority(err, req)).toBe('critical');

      const err2 = { message: 'Something went wrong', statusCode: 500 };
      const req2 = { path: '/api/v1/adult/wallet/tip' } as any;
      expect(assignPriority(err2, req2)).toBe('critical');
    });

    it('should assign CRITICAL priority to auth errors with 500+', () => {
      const err = { message: 'JWT secret misconfigured', statusCode: 500 };
      const req = { path: '/api/auth/login' } as any;
      expect(assignPriority(err, req)).toBe('critical');
    });

    it('should assign HIGH priority to other 500+ errors', () => {
      const err = { message: 'Some runtime exception', statusCode: 500 };
      const req = { path: '/api/users/profile' } as any;
      expect(assignPriority(err, req)).toBe('high');
    });

    it('should assign HIGH priority to third-party integration failures', () => {
      const err = { message: 'Cloudinary upload failed', statusCode: 400 };
      const req = { path: '/api/upload' } as any;
      expect(assignPriority(err, req)).toBe('high');
    });

    it('should assign LOW priority to standard client errors', () => {
      const err = { message: 'Not found', statusCode: 404 };
      const req = { path: '/api/non-existent' } as any;
      expect(assignPriority(err, req)).toBe('low');

      const err2 = { message: 'Validation failed', statusCode: 400 };
      const req2 = { path: '/api/users/register' } as any;
      expect(assignPriority(err2, req2)).toBe('low');
    });
  });

  describe('Error Capture Middleware - Unit Level', () => {
    it('should correctly capture, sanitize, and save a new error', async () => {
      const mockReq: any = {
        method: 'POST',
        path: '/api/v1/adult/media/upload',
        params: { id: '123' },
        query: { draft: 'true' },
        body: {
          password: 'secretpassword123',
          accessToken: 'jwt-access-token-string',
          note: 'This is a long test string '.repeat(100),
          normalField: 'all good'
        },
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Jest-Test-Suite'
        },
        user: {
          sub: testUserId,
          role: 'member'
        }
      };

      const mockRes: any = {
        statusCode: 500,
        status: function(code: number) {
          this.statusCode = code;
          return this;
        },
        json: function(data: any) {
          this.body = data;
          return this;
        }
      };

      const mockNext = jest.fn();
      const mockErr = new Error('Database down');

      await errorCaptureMiddleware(mockErr, mockReq, mockRes, mockNext);

      // Verify DB record
      const savedError = await AppError.findOne({ fingerprint: { $exists: true } });
      expect(savedError).toBeDefined();
      expect(savedError?.priority).toBe('critical'); // contains database/500
      expect(savedError?.errorId).toMatch(/^ERR-[0-9A-F]{4}$/);
      expect(savedError?.statusCode).toBe(500);

      // Verify sanitization
      const reqData = savedError?.request;
      expect(reqData?.method).toBe('POST');
      expect(reqData?.route).toBe('/api/v1/adult/media/upload');
      expect(reqData?.body.password).toBe('[REDACTED]');
      expect(reqData?.body.accessToken).toBe('[REDACTED]');
      expect(reqData?.body.normalField).toBe('all good');
      expect(reqData?.body.note).toContain('...[truncated]');
      expect(reqData?.body.note.length).toBeLessThan(250);

      // Verify user context
      expect(savedError?.userId?.toString()).toBe(testUserId);
    });

    it('should increment error count for identical errors within 1 hour (deduplication)', async () => {
      const mockReq = { method: 'GET', path: '/api/test-dedup', headers: {} } as any;
      const mockRes = { status: () => mockRes, json: () => {} } as any;
      const mockNext = () => {};
      const mockErr = new Error('Timeout error');

      // First trigger
      await errorCaptureMiddleware(mockErr, mockReq, mockRes, mockNext);
      // Second trigger
      await errorCaptureMiddleware(mockErr, mockReq, mockRes, mockNext);

      const records = await AppError.find({ message: 'Timeout error' });
      expect(records).toHaveLength(1);
      expect(records[0].count).toBe(2);
    });

    it('should escalate error to critical and set escalated flags after 10+ occurrences', async () => {
      const mockReq = { method: 'GET', path: '/api/test-escalation', headers: {} } as any;
      const mockRes = { status: () => mockRes, json: () => {} } as any;
      const mockNext = () => {};
      const mockErr = new Error('Regular non-critical API failure');

      // Trigger 10 times
      for (let i = 0; i < 10; i++) {
        await errorCaptureMiddleware(mockErr, mockReq, mockRes, mockNext);
      }

      const record = await AppError.findOne({ message: 'Regular non-critical API failure' });
      expect(record).toBeDefined();
      expect(record?.count).toBe(10);
      expect(record?.priority).toBe('critical');
      expect(record?.escalated).toBe(true);
      expect(record?.escalatedAt).toBeDefined();
    });
  });

  describe('Manual Error Capture (captureError)', () => {
    it('should save error details when triggered outside Express route', async () => {
      const err = new Error('Redis connection timed out');
      await captureError(err, {
        operation: 'redis_fallback_check',
        userId: testUserId,
        zone: 'admin',
        data: { port: 6379 }
      });

      const record = await AppError.findOne({ message: 'Redis connection timed out' });
      expect(record).toBeDefined();
      expect(record?.operation).toBe('redis_fallback_check');
      expect(record?.priority).toBe('medium'); // defaults to medium
      expect(record?.zone).toBe('admin');
      expect(record?.request?.body?.port).toBe(6379);
    });
  });

  describe('Admin Errors API Endpoints', () => {
    beforeEach(async () => {
      // Seed some test errors
      await AppError.create([
        {
          errorId: 'ERR-1111',
          fingerprint: 'fp1',
          priority: 'low',
          message: 'Low error 1',
          resolved: false,
          createdAt: new Date(Date.now() - 5000),
        },
        {
          errorId: 'ERR-2222',
          fingerprint: 'fp2',
          priority: 'critical',
          message: 'Critical error 1',
          resolved: false,
          createdAt: new Date(Date.now() - 1000),
        },
        {
          errorId: 'ERR-3333',
          fingerprint: 'fp3',
          priority: 'high',
          message: 'High error 1',
          resolved: false,
          createdAt: new Date(Date.now() - 2000),
        },
        {
          errorId: 'ERR-4444',
          fingerprint: 'fp4',
          priority: 'low',
          message: 'Resolved low error',
          resolved: true,
          resolvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        }
      ]);
    });

    it('GET /api/admin/errors - should return errors sorted critical -> high -> low', async () => {
      const res = await request(app)
        .get('/api/admin/errors')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.errors).toHaveLength(3); // excludes resolved: true by default
      expect(res.body.errors[0].errorId).toBe('ERR-2222'); // critical
      expect(res.body.errors[1].errorId).toBe('ERR-3333'); // high
      expect(res.body.errors[2].errorId).toBe('ERR-1111'); // low

      expect(res.body.counts.critical).toBe(1);
      expect(res.body.counts.high).toBe(1);
      expect(res.body.counts.low).toBe(1);
    });

    it('GET /api/admin/errors - should return resolved errors if resolved=true', async () => {
      const res = await request(app)
        .get('/api/admin/errors?resolved=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].errorId).toBe('ERR-4444');
    });

    it('GET /api/admin/errors/:errorId - should return full error record with stack', async () => {
      const record = await AppError.create({
        errorId: 'ERR-STAK',
        fingerprint: 'fp_stack',
        priority: 'critical',
        message: 'Stack trace test error',
        stack: 'Error: Stack trace test error\n at Object.<anonymous> ...',
        resolved: false,
      });

      const res = await request(app)
        .get(`/api/admin/errors/${record.errorId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errorId).toBe('ERR-STAK');
      expect(res.body.data.stack).toBeDefined();
    });

    it('PUT /api/admin/errors/:errorId/resolve - should mark error as resolved with note', async () => {
      const res = await request(app)
        .put('/api/admin/errors/ERR-2222/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Fixed bad routing' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const record = await AppError.findOne({ errorId: 'ERR-2222' });
      expect(record?.resolved).toBe(true);
      expect(record?.resolutionNote).toBe('Fixed bad routing');
      expect(record?.resolvedAt).toBeDefined();
    });

    it('DELETE /api/admin/errors/resolved - should purge resolved errors older than 7 days', async () => {
      // First verify resolved old error exists
      const beforeCount = await AppError.countDocuments({ resolved: true });
      expect(beforeCount).toBe(1);

      const res = await request(app)
        .delete('/api/admin/errors/resolved')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(1);

      const afterCount = await AppError.countDocuments({ resolved: true });
      expect(afterCount).toBe(0);
    });
  });
});
