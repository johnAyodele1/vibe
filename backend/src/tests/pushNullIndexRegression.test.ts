import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AdultUser from '../models/AdultUser';
import PushSubscription from '../models/PushSubscription';
import { sendPushToUser } from '../shared/push';
import webpush from 'web-push';

let sendNotificationMock = jest.fn();
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification: (...args: any[]) => sendNotificationMock(...args),
    setVapidDetails: jest.fn(),
    generateVAPIDKeys: jest.fn(() => ({
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key',
    })),
  },
}));

describe('Push subscription endpoint index regression', () => {
  let mongoServer: MongoMemoryServer;
  let userId: string;

  beforeAll(async () => {
    process.env.VAPID_SUBJECT = 'mailto:test@vibe.com';
    process.env.VAPID_PUBLIC_KEY = 'mock-public-key';
    process.env.VAPID_PRIVATE_KEY = 'mock-private-key';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user = await AdultUser.create({
      email: 'push-index-regression@test.com',
      passwordHash: 'hash123',
      username: 'pushindexregression',
      displayName: 'Push Index Regression',
      dateOfBirth: new Date('1990-01-01'),
      role: 'provider',
      country: 'USA',
      credits: 0,
    });
    userId = user._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await PushSubscription.deleteMany({});
    sendNotificationMock.mockReset();
  });

  it('does not fail gift-related push fan-out when a legacy non-sparse endpoint index exists', async () => {
    const existingEndpointIndex = (await PushSubscription.collection.indexes()).find(index => index.name === 'endpoint_1');
    if (existingEndpointIndex) {
      await PushSubscription.collection.dropIndex('endpoint_1');
    }

    await PushSubscription.collection.createIndex(
      { endpoint: 1 },
      { unique: true, name: 'endpoint_1' },
    );

    await PushSubscription.create([
      {
        userId,
        deviceId: 'legacy-index-device-a',
        endpoint: 'https://push.example/device-a',
        keys: { p256dh: 'p256dh-a', auth: 'auth-a' },
        isActive: true,
        notificationsEnabled: true,
      },
      {
        userId,
        deviceId: 'legacy-index-device-b',
        endpoint: 'https://push.example/device-b',
        keys: { p256dh: 'p256dh-b', auth: 'auth-b' },
        isActive: true,
        notificationsEnabled: true,
      },
    ]);

    sendNotificationMock
      .mockRejectedValueOnce({ statusCode: 410, message: 'Gone' })
      .mockRejectedValueOnce({ statusCode: 410, message: 'Gone' });

    await expect(
      sendPushToUser(userId, { type: 'gift_request', title: 'Gift request' }),
    ).resolves.toMatchObject({ sent: 0, failed: 2 });

    const devices = await PushSubscription.find({ userId }).sort({ deviceId: 1 });
    expect(devices).toHaveLength(2);
    expect(devices.every(device => device.isActive === false && device.notificationsEnabled === false)).toBe(true);

    const endpointIndex = (await PushSubscription.collection.indexes()).find(index => index.name === 'endpoint_1');
    expect(endpointIndex?.unique).toBe(true);
    expect(endpointIndex?.sparse).not.toBe(true);

    const endpointBearingDevices = devices.filter(device => !!device.endpoint);
    expect(endpointBearingDevices).toHaveLength(1);
  });

  afterEach(async () => {
    const endpointIndex = (await PushSubscription.collection.indexes()).find(index => index.name === 'endpoint_1');
    if (endpointIndex) {
      await PushSubscription.collection.dropIndex('endpoint_1');
    }
    await PushSubscription.collection.createIndex(
      { endpoint: 1 },
      { unique: true, sparse: true, name: 'endpoint_1' },
    );
  });
});
