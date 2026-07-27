import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultConversation from '../models/AdultConversation';
import ContentViolation from '../models/ContentViolation';
import AdultMessage from '../models/AdultMessage';
import jwt from 'jsonwebtoken';

describe('Content Filter — Backend & Integration', () => {
  let mongoServer: MongoMemoryServer;
  let providerToken: string;
  let memberToken: string;
  let providerUser: any;
  let memberUser: any;
  let conversationId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.disconnect(); // Ensure clean start
    await mongoose.connect(mongoUri);

    // Create a provider user
    providerUser = await AdultUser.create({
      username: 'provider_test',
      email: 'provider@vibe.com',
      passwordHash: 'hashedpassword',
      displayName: 'Provider Test',
      role: 'provider',
      ageVerified: true,
      isActive: true,
      country: 'US',
      dateOfBirth: new Date('1995-05-15'),
    });

    // Create a member user
    memberUser = await AdultUser.create({
      username: 'member_test',
      email: 'member@vibe.com',
      passwordHash: 'hashedpassword',
      displayName: 'Member Test',
      role: 'user',
      ageVerified: true,
      isActive: true,
      country: 'US',
      dateOfBirth: new Date('1998-08-20'),
    });

    // Generate JWT tokens
    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';
    providerToken = jwt.sign({ sub: providerUser._id.toString() }, secret);
    memberToken = jwt.sign({ sub: memberUser._id.toString() }, secret);

    // Create an adult conversation between them with the correct string _id format
    const convId = [providerUser._id.toString(), memberUser._id.toString()].sort().join('_');
    const conversation = await AdultConversation.create({
      _id: convId,
      participants: [providerUser._id, memberUser._id],
    });
    conversationId = conversation._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear violations and reset conversation counts before each test
    await ContentViolation.deleteMany({});
    await AdultMessage.deleteMany({});
    await AdultConversation.findByIdAndUpdate(conversationId, {
      unreadCounts: new Map(),
      lastMessage: null,
    });
  });

  it('provider phone number share is blocked with 400', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'Call me on 080123456789',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('blocked');
    expect(res.body.violationType).toBe('phone');

    // Verify a ContentViolation record was logged
    const violation = await ContentViolation.findOne({ userId: providerUser._id });
    expect(violation).toBeDefined();
    expect(violation?.violationType).toBe('phone');
    expect(violation?.matchedText).toBe('080123456789');
  });

  it('member phone number share is allowed but flagged and soft-blocked', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        content: 'Hit me up 080987654321',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.isFlagged).toBe(true);
    expect(res.body.flagReason).toBe('phone');

    // Verify DB model has isFlagged: true
    const messageDoc = await AdultMessage.findById(res.body.id);
    expect(messageDoc).toBeDefined();
    expect(messageDoc?.isFlagged).toBe(true);
    expect(messageDoc?.flagReason).toBe('phone');

    // Verify ContentViolation record exists
    const violation = await ContentViolation.findOne({ userId: memberUser._id });
    expect(violation).toBeDefined();
    expect(violation?.violationType).toBe('phone');

    // Soft-block check: unreadCount on conversation should not increase for the provider recipient
    const conv = await AdultConversation.findById(conversationId);
    const unread = conv?.unreadCounts?.get(providerUser._id.toString()) || 0;
    expect(unread).toBe(0);

    // Soft-block check: recipient's fetch getMessages must NOT return the flagged message
    const recipientGetRes = await request(app)
      .get(`/api/v1/adult/sext/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${providerToken}`);
    expect(recipientGetRes.status).toBe(200);
    const recipientMsgs = recipientGetRes.body;
    const foundFlaggedRecipient = recipientMsgs.find((m: any) => m.id === res.body.id);
    expect(foundFlaggedRecipient).toBeUndefined(); // Excluded/hidden for recipient

    // Soft-block check: sender's fetch getMessages MUST return the flagged message (so they can see it)
    const senderGetRes = await request(app)
      .get(`/api/v1/adult/sext/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(senderGetRes.status).toBe(200);
    const senderMsgs = senderGetRes.body;
    const foundFlaggedSender = senderMsgs.find((m: any) => m.id === res.body.id);
    expect(foundFlaggedSender).toBeDefined();
    expect(foundFlaggedSender.isFlagged).toBe(true);
  });

  it('creates ContentViolation record when flagged platform message is sent', async () => {
    const res = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        content: 'Add me on Snapchat: test_snap',
      });

    expect(res.status).toBe(201);
    expect(res.body.isFlagged).toBe(true);
    expect(res.body.flagReason).toBe('platform');

    // Verify violation logged
    const violation = await ContentViolation.findOne({ userId: providerUser._id });
    expect(violation).toBeDefined();
    expect(violation?.violationType).toBe('platform');
    expect(violation?.matchedText).toBe('Snapchat');
  });

  it('3+ violations from a provider in 7 days triggers admin notification limit check', async () => {
    // We already have 0 violations. Let's send 2 allowed violations (platform, etc) so that we reach 3.
    // Violation 1
    await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ content: 'hit me on wa' });

    // Violation 2
    await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ content: 'let is talk on telegram' });

    // Violation 3: This should trigger the threshold emit
    // Mock the socket emission behavior to spy on ns.emit
    const nsEmitSpy = jest.fn() as any;
    app.set('adultNamespace', {
      to: () => ({ emit: jest.fn() }),
      emit: nsEmitSpy,
    });

    const res = await request(app)
      .post(`/api/v1/adult/sext/messages/${conversationId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ content: 'add my instagram: @foo' });

    expect(res.status).toBe(201);

    const count = await ContentViolation.countDocuments({ userId: providerUser._id });
    expect(count).toBe(3);

    // Verify socket emission for threshold reached
    expect(nsEmitSpy).toHaveBeenCalledWith('admin:violation_threshold', expect.objectContaining({
      userId: providerUser._id,
      count: 3,
      accountType: 'service_provider',
    }));
  });
});
