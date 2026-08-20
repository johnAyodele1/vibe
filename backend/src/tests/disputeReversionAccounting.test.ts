import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import CreditTransaction from '../models/CreditTransaction';
import Report from '../models/Report';
import CustomerRefund from '../models/CustomerRefund';
import { calculateProviderBalanceBreakdown } from '../shared/earnings';

describe('Dispute Reversion & Accounting Invariants Test Suite', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;
  let providerToken: string;
  let memberToken: string;
  let providerId: string;
  let memberId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Admin User & Token
    const admin = await AdultUser.create({
      email: 'admin@vibe.com',
      passwordHash: 'hashedpass',
      role: 'user',
      username: 'admin',
      displayName: 'System Admin',
      dateOfBirth: new Date('1990-01-01'),
      country: 'Nigeria',
      credits: 0,
      subscriptionTier: 'none',
      isActive: true,
      isBanned: false,
      twoFactorEnabled: false,
      emailVerified: true,
    });

    const jwt = require('jsonwebtoken');
    const secret = process.env.ADULT_JWT_SECRET || 'adult_secret';

    adminToken = jwt.sign(
      { sub: admin._id.toString(), userId: admin._id.toString(), email: admin.email, role: 'admin', isAdmin: true },
      secret
    );

    // Create Provider
    const provider = await AdultUser.create({
      email: 'provider@vibe.com',
      passwordHash: 'hashedpass',
      role: 'provider',
      username: 'janejane',
      displayName: 'Jane Provider',
      dateOfBirth: new Date('1995-01-01'),
      country: 'Nigeria',
      credits: 0,
      subscriptionTier: 'none',
      isActive: true,
      isBanned: false,
      twoFactorEnabled: false,
      emailVerified: true,
      providerProfile: {
        stageName: 'Jane Live',
        categories: ['sext'],
        isLive: false,
        pricePerMinute: 5,
        tipMinimum: 1,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        contentTags: [],
        rating: { average: 5, count: 10 },
        tonightRate: 500,
      },
    });
    providerId = provider._id.toString();

    providerToken = jwt.sign(
      { sub: providerId, userId: providerId, email: provider.email, role: 'provider' },
      secret
    );

    // Create Member
    const member = await AdultUser.create({
      email: 'member@vibe.com',
      passwordHash: 'hashedpass',
      role: 'user',
      username: 'johnmember',
      displayName: 'John Member',
      dateOfBirth: new Date('1992-01-01'),
      country: 'Nigeria',
      credits: 1000,
      subscriptionTier: 'none',
      isActive: true,
      isBanned: false,
      twoFactorEnabled: false,
      emailVerified: true,
    });
    memberId = member._id.toString();

    memberToken = jwt.sign(
      { sub: memberId, userId: memberId, email: member.email, role: 'user' },
      secret
    );
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await CreditTransaction.deleteMany({});
    await AdultMessage.deleteMany({});
    await Report.deleteMany({});
    await CustomerRefund.deleteMany({});
    await AdultUser.updateOne({ _id: providerId }, { $set: { credits: 0, 'providerProfile.totalEarnings': 0 } });
    await AdultUser.updateOne({ _id: memberId }, { $set: { credits: 1000 } });
  });

  it('SCENARIO 1: Full Dispute & Customer Reversion Lifecycle (Steps 1 to 5)', async () => {
    // Initial baseline: Provider has prior 4500 withdrawable earnings
    await CreditTransaction.create({
      userId: providerId,
      type: 'tip_received',
      amount: 4500,
      platformFee: 0,
      usdAmount: 0,
      description: 'Prior tips',
      status: 'completed',
      eligibleForPayout: true,
    });

    let breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(4500);
    expect(breakdown.withdrawableCredits).toBe(4500);
    expect(breakdown.unsettledCredits).toBe(0);
    expect(breakdown.disputedCredits).toBe(0);

    // STEP 1: Customer pays 💎500 service
    const serviceMsg = await AdultMessage.create({
      conversationId: `${memberId}_${providerId}`,
      senderId: providerId,
      receiverId: memberId,
      content: 'Service request',
      messageType: 'service_request',
      serviceRequest: {
        baseRate: 500,
        extras: [],
        totalAmount: 500,
        status: 'paid',
        eligibleForPayout: false,
      },
    });

    const tx = await CreditTransaction.create({
      userId: providerId,
      type: 'service_payment_received',
      amount: 425, // 85% provider share
      platformFee: 75, // 15% platform fee
      usdAmount: 0,
      description: 'Service payment received',
      relatedUserId: memberId,
      status: 'completed',
      eligibleForPayout: false,
      metadata: { serviceRequestId: serviceMsg._id },
    });

    await AdultUser.updateOne({ _id: providerId }, { $inc: { credits: 425 } });

    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(4925);
    expect(breakdown.withdrawableCredits).toBe(4500);
    expect(breakdown.unsettledCredits).toBe(425);
    expect(breakdown.disputedCredits).toBe(0);
    expect(breakdown.displayedUnsettledCredits).toBe(425);

    // STEP 2: Service becomes disputed
    const reportRes = await request(app)
      .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'Service not delivered', details: 'Provider did not show up' });

    expect(reportRes.status).toBe(200);
    expect(reportRes.body.success).toBe(true);

    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(4925); // Total Accumulated STILL includes the disputed 425
    expect(breakdown.withdrawableCredits).toBe(4500);
    expect(breakdown.unsettledCredits).toBe(0);
    expect(breakdown.disputedCredits).toBe(425);
    expect(breakdown.displayedUnsettledCredits).toBe(425); // REQUIRED: Disputed amount visibly appears in Unsettled Payment!

    // Verify Provider Earnings API response includes displayedUnsettled
    const providerEarningsRes = await request(app)
      .get('/api/v1/adult/providers/me/earnings')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(providerEarningsRes.status).toBe(200);
    expect(providerEarningsRes.body.data.unsettledCredits).toBe(425);
    expect(providerEarningsRes.body.data.disputedCredits).toBe(425);

    // STEP 3: Admin resolves for customer (Upheld / Revert)
    const reportId = reportRes.body.reportId;
    const resolveRes = await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'upheld', adminNotes: 'Customer provided evidence provider was absent' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);

    // Assert original transaction state = REVERTED
    const updatedTx = await CreditTransaction.findById(tx._id);
    expect(updatedTx?.status).toBe('reverted');
    expect(updatedTx?.disputeResolution).toBe('upheld');
    expect(updatedTx?.amount).toBe(425); // Original historical transaction amount preserved in DB!

    // Assert active accounting balance effects
    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(4500); // Reduced by 425!
    expect(breakdown.disputedCredits).toBe(0);
    expect(breakdown.unsettledCredits).toBe(0);
    expect(breakdown.displayedUnsettledCredits).toBe(0);
    expect(breakdown.withdrawableCredits).toBe(4500);

    // Assert CustomerRefund pending record
    const refundRecord = await CustomerRefund.findOne({ disputeReportId: reportId });
    expect(refundRecord).toBeDefined();
    expect(refundRecord?.status).toBe('REFUND_PENDING');
    expect(refundRecord?.amount).toBe(500);

    // STEP 4: Admin records that refund was sent / completed
    const refundCompleteRes = await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/refund-complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reference: 'REF-889922' });

    expect(refundCompleteRes.status).toBe(200);
    expect(refundCompleteRes.body.success).toBe(true);

    const completedRefund = await CustomerRefund.findOne({ disputeReportId: reportId });
    expect(completedRefund?.status).toBe('REFUND_COMPLETED');
    expect(completedRefund?.reference).toBe('REF-889922');

    // Assert original transaction STILL exists in DB as REVERTED
    const originalTxAgain = await CreditTransaction.findById(tx._id);
    expect(originalTxAgain).toBeDefined();
    expect(originalTxAgain?.status).toBe('reverted');

    // STEP 5: Run wallet/earnings calculation again
    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(4500);
    expect(breakdown.disputedCredits).toBe(0);
    expect(breakdown.unsettledCredits).toBe(0);
    expect(breakdown.displayedUnsettledCredits).toBe(0);
    expect(breakdown.withdrawableCredits).toBe(4500);
  });

  it('SCENARIO 2: Provider Wins Resolution (Dismissed)', async () => {
    const serviceMsg = await AdultMessage.create({
      conversationId: `${memberId}_${providerId}`,
      senderId: providerId,
      receiverId: memberId,
      content: 'Service request',
      messageType: 'service_request',
      serviceRequest: { baseRate: 500, extras: [], totalAmount: 500, status: 'paid', eligibleForPayout: false },
    });

    const tx = await CreditTransaction.create({
      userId: providerId,
      type: 'service_payment_received',
      amount: 425,
      platformFee: 75,
      usdAmount: 0,
      description: 'Service payment received',
      relatedUserId: memberId,
      status: 'completed',
      eligibleForPayout: false,
      metadata: { serviceRequestId: serviceMsg._id },
    });

    // Report dispute
    const reportRes = await request(app)
      .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'Invalid dispute claim' });

    let breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(425);
    expect(breakdown.disputedCredits).toBe(425);

    // Admin resolves for provider (Dismissed)
    const reportId = reportRes.body.reportId;
    const resolveRes = await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'dismissed', adminNotes: 'Service was fulfilled properly' });

    expect(resolveRes.status).toBe(200);

    const updatedTx = await CreditTransaction.findById(tx._id);
    expect(updatedTx?.status).toBe('completed');
    expect(updatedTx?.inDispute).toBe(false);
    expect(updatedTx?.eligibleForPayout).toBe(true);

    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(425); // Total Accumulated unchanged
    expect(breakdown.disputedCredits).toBe(0);
    expect(breakdown.withdrawableCredits).toBe(425); // Becomes normal withdrawable provider earning!

    // Assert NO customer refund was created
    const refundRecord = await CustomerRefund.findOne({ disputeReportId: reportId });
    expect(refundRecord).toBeNull();
  });

  it('SCENARIO 3: Disputed Money Was Already Withdrawable', async () => {
    // Completed service payment that became eligible for payout
    const serviceMsg = await AdultMessage.create({
      conversationId: `${memberId}_${providerId}`,
      senderId: providerId,
      receiverId: memberId,
      content: 'Completed service request',
      messageType: 'service_request',
      serviceRequest: { baseRate: 500, extras: [], totalAmount: 500, status: 'completed', eligibleForPayout: true },
    });

    const tx = await CreditTransaction.create({
      userId: providerId,
      type: 'service_payment_received',
      amount: 425,
      platformFee: 75,
      usdAmount: 0,
      description: 'Completed service',
      relatedUserId: memberId,
      status: 'completed',
      eligibleForPayout: true,
      metadata: { serviceRequestId: serviceMsg._id },
    });

    let breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(425);
    expect(breakdown.withdrawableCredits).toBe(425);
    expect(breakdown.disputedCredits).toBe(0);

    // Disputed
    const reportRes = await request(app)
      .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'Late dispute' });

    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(425); // Total Accumulated unchanged
    expect(breakdown.withdrawableCredits).toBe(0); // Withdrawable decreases
    expect(breakdown.disputedCredits).toBe(425); // Disputed increases
    expect(breakdown.displayedUnsettledCredits).toBe(425); // UI Unsettled increases

    // Resolve for customer
    const reportId = reportRes.body.reportId;
    await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'upheld', adminNotes: 'Reverted' });

    breakdown = await calculateProviderBalanceBreakdown(providerId);
    expect(breakdown.totalAccumulatedCredits).toBe(0); // Total Accumulated decreases
    expect(breakdown.disputedCredits).toBe(0);
    expect(breakdown.withdrawableCredits).toBe(0);
  });

  it('SCENARIO 4: Idempotency & Concurrent Safety', async () => {
    const serviceMsg = await AdultMessage.create({
      conversationId: `${memberId}_${providerId}`,
      senderId: providerId,
      receiverId: memberId,
      content: 'Service request',
      messageType: 'service_request',
      serviceRequest: { baseRate: 500, extras: [], totalAmount: 500, status: 'paid', eligibleForPayout: false },
    });

    await CreditTransaction.create({
      userId: providerId,
      type: 'service_payment_received',
      amount: 425,
      platformFee: 75,
      usdAmount: 0,
      description: 'Service payment received',
      relatedUserId: memberId,
      status: 'completed',
      eligibleForPayout: false,
      metadata: { serviceRequestId: serviceMsg._id },
    });

    const reportRes = await request(app)
      .post(`/api/v1/adult/sext/service-requests/${serviceMsg._id}/report`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'Service dispute' });

    const reportId = reportRes.body.reportId;

    // Resolve 1st time
    const res1 = await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'upheld', adminNotes: 'First resolution' });

    expect(res1.status).toBe(200);

    // Resolve 2nd time
    const res2 = await request(app)
      .put(`/api/v1/admin/disputes/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'upheld', adminNotes: 'Second resolution' });

    expect(res2.status).toBe(200);
    expect(res2.body.alreadyResolved).toBe(true);

    // Assert exactly ONE CustomerRefund record created
    const refunds = await CustomerRefund.find({ disputeReportId: reportId });
    expect(refunds.length).toBe(1);
  });
});
