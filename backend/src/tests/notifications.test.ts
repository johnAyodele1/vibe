import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import cron from 'node-cron';

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn((schedule, callback) => {
    return { start: jest.fn(), callback };
  }),
}));

// Mock email service at the top level
const mockSendEmail = jest.fn().mockResolvedValue(true);
jest.mock('../services/email.service', () => ({
  sendEmail: mockSendEmail,
}));

// Import initNotificationJob AFTER mocking
import { initNotificationJob } from '../jobs/notification.job';
import * as emailService from '../services/email.service';

describe('Notification Cron Job', () => {
  let mongoServer: MongoMemoryServer;
  let cronCallback: Function;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Capture the cron callback when initNotificationJob is called
    initNotificationJob();
    cronCallback = (cron.schedule as jest.Mock).mock.calls[0][1];
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    jest.clearAllMocks();
    mockSendEmail.mockResolvedValue(true);
  });

  it('should send "new match" email when only unseen matches exist', async () => {
    const initialTime = new Date('2023-01-01');
    const user = await User.create({
      email: 'test-match@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      gender: 'Male',
      dateOfBirth: new Date('1990-01-01'),
      lastNotificationSentAt: initialTime
    });

    user.matches.push({
      user: new mongoose.Types.ObjectId(),
      matchedAt: new Date(),
      isActive: true,
      isSeen: false
    });
    await user.save();

    await cronCallback();

    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test-match@example.com',
      subject: 'You have a new match'
    }));

    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.lastNotificationSentAt.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should send "new message" email when only unread messages exist', async () => {
    const initialTime = new Date('2023-01-01');
    const user = await User.create({
      email: 'test-message@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      gender: 'Male',
      dateOfBirth: new Date('1990-01-01'),
      lastNotificationSentAt: initialTime
    });

    await Message.create({
      sender: new mongoose.Types.ObjectId(),
      receiver: user._id,
      content: 'Hello',
      conversation: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    });

    await cronCallback();

    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test-message@example.com',
      subject: 'You have a new message'
    }));

    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.lastNotificationSentAt.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should send combined email when both exist', async () => {
    const initialTime = new Date('2023-01-01');
    const user = await User.create({
      email: 'test-both@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      gender: 'Male',
      dateOfBirth: new Date('1990-01-01'),
      lastNotificationSentAt: initialTime
    });

    user.matches.push({
      user: new mongoose.Types.ObjectId(),
      matchedAt: new Date(),
      isActive: true,
      isSeen: false
    });
    await user.save();

    await Message.create({
      sender: new mongoose.Types.ObjectId(),
      receiver: user._id,
      content: 'Hello',
      conversation: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    });

    await cronCallback();

    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test-both@example.com',
      subject: 'You have a new message and new match'
    }));

    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.lastNotificationSentAt.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should not send email if matches/messages are older than lastNotificationSentAt', async () => {
    const futureTime = new Date('2099-01-01');
    const user = await User.create({
      email: 'test-none@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      gender: 'Male',
      dateOfBirth: new Date('1990-01-01'),
      lastNotificationSentAt: futureTime
    });

    user.matches.push({
      user: new mongoose.Types.ObjectId(),
      matchedAt: new Date('2023-01-01'),
      isActive: true,
      isSeen: false
    });
    await user.save();

    await Message.create({
      sender: new mongoose.Types.ObjectId(),
      receiver: user._id,
      content: 'Hello',
      conversation: new mongoose.Types.ObjectId(),
      createdAt: new Date('2023-01-01')
    });

    await cronCallback();

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});
