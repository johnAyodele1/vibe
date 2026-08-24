import mongoose from 'mongoose';
import PushSubscription from '../models/PushSubscription';

let isMigrationExecuted = false;

/**
 * Ensures the `pushsubscriptions` collection has a safe unique sparse index on `endpoint`
 * and unsets any legacy `endpoint: null` or string `'null'`/`'undefined'` field values.
 * Safe to call on application startup or dynamically before push operations.
 */
export const repairPushSubscriptionIndex = async (): Promise<void> => {
  if (isMigrationExecuted) {
    return;
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      return;
    }

    const collection = db.collection('pushsubscriptions');

    // 1. Unset legacy null or 'null'/'undefined' string values from any subscription records
    await collection.updateMany(
      {
        $or: [
          { endpoint: null },
          { endpoint: 'null' },
          { endpoint: 'undefined' },
        ],
      },
      {
        $unset: { endpoint: 1, keys: 1 },
      }
    );

    // 2. Ensure model indexes are initialized
    await PushSubscription.init().catch(() => {});

    // 3. Check current index definitions
    const indexes = await collection.indexes().catch(() => []);
    const endpointIndex = indexes.find((idx: any) => idx.name === 'endpoint_1' || (idx.key && idx.key.endpoint === 1));

    if (endpointIndex && (!endpointIndex.sparse || !endpointIndex.unique)) {
      console.warn('[PushMigration] Detected endpoint_1 index missing sparse/unique requirements. Dropping and re-creating as unique sparse index...');
      try {
        await collection.dropIndex(endpointIndex.name);
      } catch (dropErr: any) {
        console.warn('[PushMigration] Drop legacy index note:', dropErr.message);
      }

      try {
        await collection.createIndex(
          { endpoint: 1 },
          { unique: true, sparse: true, name: 'endpoint_1' }
        );
        console.log('[PushMigration] Successfully re-created endpoint_1 index as unique sparse.');
      } catch (createErr: any) {
        console.warn('[PushMigration] Re-creating index note:', createErr.message);
      }
    } else if (!endpointIndex) {
      try {
        await collection.createIndex(
          { endpoint: 1 },
          { unique: true, sparse: true, name: 'endpoint_1' }
        );
      } catch (createErr: any) {
        console.warn('[PushMigration] Creating missing endpoint_1 index note:', createErr.message);
      }
    }

    // 4. Explicitly verify that the endpoint index exists and is both unique AND sparse
    const indexesAfter = await collection.indexes().catch(() => []);
    const isRepaired = indexesAfter.some(
      (idx: any) =>
        (idx.name === 'endpoint_1' || (idx.key && idx.key.endpoint === 1)) &&
        idx.unique === true &&
        idx.sparse === true
    );

    if (!isRepaired) {
      throw new Error('endpoint_1 index repair could not be verified (index is missing or non-sparse/non-unique)');
    }

    // Only mark completed when verification succeeds so transient failures are retried automatically
    isMigrationExecuted = true;
  } catch (err: any) {
    console.error('[PushMigration] Index repair encountered non-fatal error:', err.message);
    // Do NOT set isMigrationExecuted = true so future calls will retry the repair
  }
};
