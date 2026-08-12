import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import PushSubscription from '../models/PushSubscription';
import { sendPushToUser } from '../shared/push';
import { initVAPID } from '../config/vapid';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';

// Mock web-push
let sendNotificationMock = jest.fn().mockResolvedValue({ statusCode: 201 });
jest.mock('web-push', () => {
  return {
    __esModule: true,
    default: {
      sendNotification: (args: any, payload: any, options: any) => sendNotificationMock(args, payload, options),
      setVapidDetails: () => {},
      generateVAPIDKeys: () => ({
        publicKey: 'BElba0uW8Z1IeZ704gM083BBelba0uW8Z1IeZ704gM083BBelba0uW8Z1IeZ704gM083BBelba0uW8Z1IeZ704gM083A',
        privateKey: 'mock-private-key'
      })
    }
  };
});

describe('Push Notification — Full Resurrection', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let userId: string;
  let providerToken: string;
  let providerId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a standard user (member)
    const user = new AdultUser({
      email: 'member@test.com',
      passwordHash: 'hash123',
      username: 'testmember',
      displayName: 'Member User',
      dateOfBirth: new Date('1995-01-01'),
      role: 'user',
      country: 'USA',
      credits: 100,
    });
    await user.save();
    userId = user._id.toString();
    userToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create a provider
    const provider = new AdultUser({
      email: 'provider@test.com',
      passwordHash: 'hash123',
      username: 'testprovider',
      displayName: 'Provider User',
      dateOfBirth: new Date('1990-01-01'),
      role: 'provider',
      country: 'USA',
      credits: 0,
      providerProfile: {
        stageName: 'Crimson Rose',
        verificationStatus: 'approved',
        categories: ['dating'],
        onboarding: { isComplete: true },
        photos: ['photo1.png', 'photo2.png']
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

  beforeEach(async () => {
    await PushSubscription.deleteMany({});
    sendNotificationMock.mockReset();
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });
  });

  describe('VAPID configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('initVAPID() logs error and returns false with missing keys', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      const result = await initVAPID();
      expect(result).toBe(false);
    });

    it('initVAPID() returns true with valid keys', async () => {
      // A valid uncompressed P-256 public key is 65 bytes. Base64url decoded length should be 65.
      const valid65BytePubKey = Buffer.alloc(65, 1).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      process.env.VAPID_PUBLIC_KEY = valid65BytePubKey;
      process.env.VAPID_PRIVATE_KEY = 'privateKey';
      process.env.VAPID_SUBJECT = 'mailto:admin@vibe.com';

      const result = await initVAPID();
      expect(result).toBe(true);
    });
  });

  describe('Multi-device fan-out (SPEC tests A–E)', () => {
    it('Test A: 1 device registered → 1 push sent', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: 'dh', auth: 'auth' } }
        })
        .expect(200);

      const result = await sendPushToUser(userId, { type: 'test', title: 'Hello' });
      expect(result.sent).toBe(1);
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    });

    it('Test B: 2 devices registered → 2 pushes sent, both delivered', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      const result = await sendPushToUser(userId, { type: 'test', title: 'Hello' });
      expect(result.sent).toBe(2);
      expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    });

    it('Test C: logout Device B → only Device A receives', async () => {
      // Register both
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      // Logout Device B
      await request(app)
        .delete('/api/v1/adult/devices/current')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceId: 'device-b' })
        .expect(200);

      const result = await sendPushToUser(userId, { type: 'test', title: 'Hello' });
      expect(result.sent).toBe(1);
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    });

    it('Test D: re-login Device B → both receive again', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      // Register B, then un-register, then register again
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      await request(app)
        .delete('/api/v1/adult/devices/current')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceId: 'device-b' });

      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      const result = await sendPushToUser(userId, { type: 'test', title: 'Hello' });
      expect(result.sent).toBe(2);
    });

    it('Test E: 3 devices → all 3 receive', async () => {
      for (const d of ['a', 'b', 'c']) {
        await request(app)
          .post('/api/v1/adult/devices/register')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            deviceId: `device-${d}`,
            platform: 'ios',
            notificationPermission: 'granted',
            subscription: { endpoint: `https://push.com/${d}`, keys: { p256dh: 'dh', auth: 'auth' } }
          });
      }

      const result = await sendPushToUser(userId, { type: 'test', title: 'Hello' });
      expect(result.sent).toBe(3);
    });
  });

  describe('New push triggers', () => {
    it('profile view views provider, sends rate-limited view push notification to provider', async () => {
      // Provider registers device
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          deviceId: 'device-prov',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/prov', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      // Member views provider profile
      await request(app)
        .get(`/api/v1/adult/providers/${providerId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // Add a small delay for async push notification to fire
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify push notification is sent to provider
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);

      // Subsequent view within cooldown does NOT trigger push
      await request(app)
        .get(`/api/v1/adult/providers/${providerId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sendNotificationMock).toHaveBeenCalledTimes(1); // Still 1
    });

    it('does not send view push notification for self-views', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          deviceId: 'device-prov',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/prov', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      // Provider views their own profile
      await request(app)
        .get(`/api/v1/adult/providers/${providerId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(sendNotificationMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /push/diagnose', () => {
    it('returns full diagnostic details of registered devices', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      const res = await request(app)
        .get('/api/v1/adult/push/diagnose?deviceId=device-a')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.userId).toBe(userId);
      expect(res.body.deviceId).toBe('device-a');
      expect(res.body.allDevicesCount).toBe(1);
      expect(res.body.thisDevice.exists).toBe(true);
      expect(res.body.thisDevice.isActive).toBe(true);
      expect(res.body.thisDevice.hasEndpoint).toBe(true);
    });
  });

  describe('Token failure handling', () => {
    it('deactivates dead subscription immediately upon 410 Gone error', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-fail',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/fail', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      sendNotificationMock.mockRejectedValueOnce({ statusCode: 410, message: 'Gone' });

      await sendPushToUser(userId, { type: 'test' });

      const device = await PushSubscription.findOne({ userId, deviceId: 'device-fail' });
      expect(device?.isActive).toBe(false);
      expect(device?.notificationsEnabled).toBe(false);
    });

    it('increments failCount on temporary errors and deactivates after 5 failures', async () => {
      await request(app)
        .post('/api/v1/adult/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-temp',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/temp', keys: { p256dh: 'dh', auth: 'auth' } }
        });

      // Mock 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        sendNotificationMock.mockRejectedValueOnce({ statusCode: 500, message: 'Temp Error' });
        await sendPushToUser(userId, { type: 'test' });
      }

      const device = await PushSubscription.findOne({ userId, deviceId: 'device-temp' });
      expect(device?.failCount).toBe(5);
      expect(device?.isActive).toBe(false);
      expect(device?.notificationsEnabled).toBe(false);
    });
  });
});
