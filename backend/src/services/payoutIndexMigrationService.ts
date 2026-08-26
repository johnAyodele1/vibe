import mongoose from 'mongoose';
import PayoutRequest from '../models/PayoutRequest';
import CreditTransaction from '../models/CreditTransaction';

let isMigrationExecuted = false;

/**
 * Ensures the `payoutrequests` collection has a unique partial index on `{ providerId: 1 }`
 * for active statuses (`['pending', 'queued', 'verifying', 'processing']`).
 * If legacy duplicate active requests exist prior to index creation, keeps the earliest active request
 * and rejects/unfreezes subsequent duplicate active requests to allow index creation to succeed smoothly.
 */
export const repairPayoutIndex = async (): Promise<void> => {
  if (isMigrationExecuted) {
    return;
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      return;
    }

    const collection = db.collection('payoutrequests');

    // 1. Resolve pre-existing duplicate active requests per provider
    const activeStatuses = ['pending', 'queued', 'verifying', 'processing'];
    const activeDuplicates = await PayoutRequest.aggregate([
      { $match: { status: { $in: activeStatuses } } },
      { $group: { _id: '$providerId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    for (const group of activeDuplicates) {
      const providerActiveRequests = await PayoutRequest.find({
        _id: { $in: group.ids }
      }).sort({ requestedAt: 1 });

      if (providerActiveRequests.length > 1) {
        // Keep providerActiveRequests[0] (earliest), reject subsequent duplicates
        const duplicatesToReject = providerActiveRequests.slice(1);
        for (const dup of duplicatesToReject) {
          dup.status = 'rejected';
          dup.rejectedReason = 'System deduplication: Superceded by earlier active payout request.';
          dup.rejectedAt = new Date();
          await dup.save();

          // Unfreeze covered transactions
          if (dup.eligibleTransactionIds && dup.eligibleTransactionIds.length > 0) {
            await CreditTransaction.updateMany(
              { _id: { $in: dup.eligibleTransactionIds } },
              { $unset: { inPayoutRequest: '' } }
            );
          }
        }
      }
    }

    // 2. Ensure model indexes are registered
    await PayoutRequest.init().catch(() => {});

    // 3. Inspect existing indexes
    const indexes = await collection.indexes().catch(() => []);
    const indexName = 'unique_active_payout_per_provider';
    const activeIdx = indexes.find((idx: any) => idx.name === indexName || (idx.key && idx.key.providerId === 1 && idx.unique));

    if (!activeIdx) {
      console.warn(`[PayoutMigration] Index ${indexName} missing. Creating unique partial index...`);
      try {
        await collection.createIndex(
          { providerId: 1 },
          {
            name: indexName,
            unique: true,
            partialFilterExpression: { status: { $in: activeStatuses } },
          }
        );
        console.log(`[PayoutMigration] Successfully created ${indexName} index.`);
      } catch (createErr: any) {
        console.warn('[PayoutMigration] Error creating active payout index:', createErr.message);
      }
    }

    // 4. Explicitly verify existence of unique active payout index
    const indexesAfter = await collection.indexes().catch(() => []);
    const verified = indexesAfter.some(
      (idx: any) =>
        (idx.name === indexName || (idx.key && idx.key.providerId === 1)) &&
        idx.unique === true &&
        idx.partialFilterExpression &&
        idx.partialFilterExpression.status
    );

    if (!verified) {
      throw new Error(`Active payout index ${indexName} could not be verified in collection indexes.`);
    }

    isMigrationExecuted = true;
  } catch (err: any) {
    console.error('[PayoutMigration] Index repair encountered non-fatal error:', err.message);
  }
};
