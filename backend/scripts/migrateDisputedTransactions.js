const mongoose = require('mongoose');

async function migrateDisputedTransactions() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';
  console.log(`[Migration] Connecting to MongoDB: ${mongoUri}`);

  await mongoose.connect(mongoUri);

  try {
    const Report = mongoose.model('Report', new mongoose.Schema({}, { strict: false }));
    const CreditTransaction = mongoose.model('CreditTransaction', new mongoose.Schema({}, { strict: false }));

    const upheldReports = await Report.find({
      type: 'service_dispute',
      status: 'resolved',
      resolution: 'upheld'
    });

    console.log(`[Migration] Found ${upheldReports.length} upheld dispute reports to check.`);

    let updatedCount = 0;
    for (const report of upheldReports) {
      if (!report.serviceRequestId || !report.reported) continue;

      const result = await CreditTransaction.updateMany(
        {
          userId: report.reported,
          'metadata.serviceRequestId': report.serviceRequestId,
          type: 'service_payment_received',
          status: { $ne: 'reverted' }
        },
        {
          $set: {
            status: 'reverted',
            inDispute: false,
            disputeResolution: 'upheld',
            eligibleForPayout: false,
            disputeResolvedAt: report.resolvedAt || new Date()
          }
        }
      );

      updatedCount += result.modifiedCount;
    }

    console.log(`[Migration] Updated ${updatedCount} transactions to status: 'reverted'.`);
    console.log('[Migration] Migration completed successfully.');
  } catch (err) {
    console.error('[Migration] Error during migration:', err);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  migrateDisputedTransactions();
}

module.exports = migrateDisputedTransactions;
