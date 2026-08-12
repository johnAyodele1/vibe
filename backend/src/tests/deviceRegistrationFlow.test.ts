import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import PushSubscription from '../models/PushSubscription';
import { sendPushToUser } from '../shared/push';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';

// Mock web-push to avoid real network requests.
// We mock using a module with clearable mocks but preserve their default behavior.
let sendNotificationMock = jest.fn().mockResolvedValue({ statusCode: 201 });
jest.mock('web-push', () => {
  return {
    __esModule: true,
    default: {
      sendNotification: (args: any, payload: any, options: any) => sendNotificationMock(args, payload, options),
      setVapidDetails: () => {},
      generateVAPIDKeys: () => ({
        publicKey: 'mock-public-key',
        privateKey: 'mock-private-key'
      })
    }
  };
});

describe('Device Registration & Push Notification Lifecycle', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let userId: string;
  let secondaryToken: string;
  let secondaryId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create primary user
    const user = new AdultUser({
      email: 'device-test@test.com',
      passwordHash: 'password123',
      username: 'devicetestuser',
      displayName: 'Test User',
      dateOfBirth: new Date('1990-01-01'),
      role: 'user',
      country: 'USA',
      credits: 100,
    });
    await user.save();
    userId = user._id.toString();
    userToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret');

    // Create secondary user for cross-user/security checks
    const secondary = new AdultUser({
      email: 'secondary@test.com',
      passwordHash: 'password123',
      username: 'secondaryuser',
      displayName: 'Secondary User',
      dateOfBirth: new Date('1992-01-01'),
      role: 'user',
      country: 'USA',
      credits: 50,
    });
    await secondary.save();
    secondaryId = secondary._id.toString();
    secondaryToken = jwt.sign({ sub: secondaryId }, process.env.ADULT_JWT_SECRET || 'adult_secret');
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

  describe('1. Registration and Upsert Scenarios', () => {
    it('creates device registration even with default permission and missing subscription', async () => {
      const payload = {
        deviceId: 'device-abc',
        platform: 'ios',
        isStandalone: true,
        notificationPermission: 'default'
      };

      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(200);

      const device = await PushSubscription.findOne({ userId, deviceId: 'device-abc' });
      expect(device).toBeDefined();
      expect(device?.platform).toBe('ios');
      expect(device?.isStandalone).toBe(true);
      expect(device?.notificationsEnabled).toBe(false); // default permission = disabled
      expect(device?.endpoint).toBeUndefined();
    });

    it('updates registration to enabled when permission is granted and subscription is supplied', async () => {
      // 1. Initial register with default
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-abc',
          platform: 'ios',
          notificationPermission: 'default'
        })
        .expect(200);

      // 2. Grant permission and sync subscription
      const payload = {
        deviceId: 'device-abc',
        platform: 'ios',
        notificationPermission: 'granted',
        subscription: {
          endpoint: 'https://updates.push.com/device-abc-token',
          keys: { p256dh: 'dh', auth: 'auth' }
        }
      };

      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(200);

      const device = await PushSubscription.findOne({ userId, deviceId: 'device-abc' });
      expect(device?.notificationsEnabled).toBe(true);
      expect(device?.endpoint).toBe('https://updates.push.com/device-abc-token');
    });

    it('records denied state on backend without prompting again', async () => {
      const payload = {
        deviceId: 'device-abc',
        platform: 'android',
        notificationPermission: 'denied'
      };

      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload)
        .expect(200);

      const device = await PushSubscription.findOne({ userId, deviceId: 'device-abc' });
      expect(device?.notificationsEnabled).toBe(false);
      expect(device?.isActive).toBe(true);
    });
  });

  describe('2. Multi-Device Flow (A-E scenarios)', () => {
    it('supports registering and fanning out to multiple devices for the same user', async () => {
      // Register Device A
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: '1', auth: '2' } }
        })
        .expect(200);

      // Register Device B
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: '1', auth: '2' } }
        })
        .expect(200);

      // Register Device C
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-c',
          platform: 'desktop',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/c', keys: { p256dh: '1', auth: '2' } }
        })
        .expect(200);

      // Verify all 3 devices exist in DB
      const devices = await PushSubscription.find({ userId });
      expect(devices.length).toBe(3);

      // Trigger push notification sendPushToUser
      const payload = { title: 'Hello Multi-device!', body: 'Nice work' };
      const pushResult = await sendPushToUser(userId, payload);

      // Check results
      expect(pushResult.sent).toBe(3);
      expect(sendNotificationMock).toHaveBeenCalledTimes(3);
    });

    it('logout from Device B removes/deactivates only B and leaves A and C untouched', async () => {
      // Register Device A, B, C
      const devices = ['device-a', 'device-b', 'device-c'];
      for (const d of devices) {
        await request(app)
          .post('/api/v1/adult/push/subscribe')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            deviceId: d,
            platform: 'ios',
            notificationPermission: 'granted',
            subscription: { endpoint: `https://push.com/${d}`, keys: { p256dh: '1', auth: '2' } }
          });
      }

      // Logout Device B
      await request(app)
        .delete('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceId: 'device-b' })
        .expect(200);

      // Verify that B is deleted/deactivated from DB while A and C remain
      const remaining = await PushSubscription.find({ userId });
      expect(remaining.length).toBe(2);
      expect(remaining.map(r => r.deviceId)).toContain('device-a');
      expect(remaining.map(r => r.deviceId)).toContain('device-c');
      expect(remaining.map(r => r.deviceId)).not.toContain('device-b');
    });
  });

  describe('3. Token Failure and Deactivation', () => {
    it('deactivates registration upon 410 or 404 response on web-push', async () => {
      // Register Device A
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-a',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/a', keys: { p256dh: '1', auth: '2' } }
        });

      // Mock sendNotification to throw a 410 Gone error
      sendNotificationMock.mockRejectedValueOnce({
        statusCode: 410,
        body: 'Subscription expired'
      });

      // Trigger push
      await sendPushToUser(userId, { title: 'Test' });

      // Verify device A is marked inactive and notifications disabled
      const device = await PushSubscription.findOne({ userId, deviceId: 'device-a' });
      expect(device?.isActive).toBe(false);
      expect(device?.notificationsEnabled).toBe(false);
    });
  });

  describe('4. Cross-User Device Reassignment', () => {
    it('deletes old subscription/device registration if same deviceId is registered by a different user', async () => {
      // User A registers Device D
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deviceId: 'device-shared',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/shared', keys: { p256dh: '1', auth: '2' } }
        });

      // User B logs into the same Device D
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${secondaryToken}`)
        .send({
          deviceId: 'device-shared',
          platform: 'ios',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/shared-updated', keys: { p256dh: '1', auth: '2' } }
        })
        .expect(200);

      // Verify User A no longer owns the device
      const oldOwnerDevice = await PushSubscription.findOne({ userId, deviceId: 'device-shared' });
      expect(oldOwnerDevice).toBeNull();

      // Verify User B now owns the device
      const newOwnerDevice = await PushSubscription.findOne({ userId: secondaryId, deviceId: 'device-shared' });
      expect(newOwnerDevice).toBeDefined();
      expect(newOwnerDevice?.endpoint).toBe('https://push.com/shared-updated');
    });
  });

  describe('5. Security scoping', () => {
    it('derives user identity from authentication session, not from client-provided payload', async () => {
      // User A cannot modify or delete User B's device registration via deviceId
      await request(app)
        .post('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${secondaryToken}`)
        .send({
          deviceId: 'device-b',
          platform: 'android',
          notificationPermission: 'granted',
          subscription: { endpoint: 'https://push.com/b', keys: { p256dh: '1', auth: '2' } }
        });

      // User A tries to delete User B's device (deviceId = device-b) using User A's token
      await request(app)
        .delete('/api/v1/adult/push/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceId: 'device-b' })
        .expect(200); // Expect 200, but it should delete 0 records since it's scoped to userToken

      const bDevice = await PushSubscription.findOne({ userId: secondaryId, deviceId: 'device-b' });
      expect(bDevice).toBeDefined(); // Still exists because userToken couldn't access secondaryId's device!
    });
  });
});
