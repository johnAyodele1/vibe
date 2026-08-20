const mongoose = require('mongoose');

async function migrateDisputedTransactions() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[Migration] CRITICAL ERROR: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  console.log(`[Migration] Connecting to MongoDB: ${mongoUri.replace(/:([^@]+)@/, ':***@')}`);

  try {
    await mongoose.connect(mongoUri);

    const Report = mongoose.model('Report', new mongoose.Schema({}, { strict: false }));
    const CreditTransaction = mongoose.model('CreditTransaction', new mongoose.Schema({}, { strict: false }));
    const CustomerRefund = mongoose.model('CustomerRefund', new mongoose.Schema({}, { strict: false }));

    const upheldReports = await Report.find({
      type: 'service_dispute',
      status: 'resolved',
      resolution: 'upheld'
    });

    console.log(`[Migration] Found ${upheldReports.length} upheld dispute reports to audit.`);

    let updatedCount = 0;
    let refundsCreated = 0;

    for (const report of upheldReports) {
      if (!report.reported) {
        console.error(`[Migration] ERROR: Report ${report._id} is missing reported provider ID.`);
        process.exit(1);
      }

      // Strict canonical lookup using report.originalTxId
      if (!report.originalTxId) {
        console.error(`[Migration] ERROR: Report ${report._id} is missing canonical originalTxId.`);
        process.exit(1);
      }

      const tx = await CreditTransaction.findById(report.originalTxId);
      if (!tx) {
        console.error(`[Migration] ERROR: Referenced original transaction ${report.originalTxId} for report ${report._id} not found in database.`);
        process.exit(1);
      }

      // Update original transaction state if not already reverted
      if (tx.status !== 'reverted') {
        tx.status = 'reverted';
        tx.inDispute = false;
        tx.disputeResolution = 'upheld';
        tx.eligibleForPayout = false;
        tx.disputeResolvedAt = report.resolvedAt || new Date();
        await tx.save();
        updatedCount++;
        console.log(`[Migration] Reverted transaction ${tx._id} for report ${report._id}.`);
      }

      // Ensure CustomerRefund audit record exists
      let refund = await CustomerRefund.findOne({ disputeReportId: report._id });
      if (!refund) {
        const amountInDispute = report.amountInDispute || Math.abs(tx.amount || 0);
        const providerAmountHeld = report.providerAmountHeld || Math.floor(amountInDispute * 0.85);
        const platformFee = Math.max(0, amountInDispute - providerAmountHeld);

        await CustomerRefund.create({
          originalTxId: tx._id,
          serviceRequestId: report.serviceRequestId,
          disputeReportId: report._id,
          customerId: report.reporter,
          providerId: report.reported,
          amount: amountInDispute,
          providerAmountReverted: providerAmountHeld,
          platformFeeReverted: platformFee,
          status: 'REFUND_PENDING',
          adminId: report.resolvedBy,
          resolvedAt: report.resolvedAt || new Date(),
        });
        refundsCreated++;
        console.log(`[Migration] Created pending customer refund record for report ${report._id}.`);
      }
    }

    console.log(`[Migration] Audit completed. Updated ${updatedCount} transactions, created ${refundsCreated} missing refund records.`);
  } catch (err) {
    console.error('[Migration] Error during migration:', err);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  migrateDisputedTransactions();
}

module.exports = migrateDisputedTransactions;
