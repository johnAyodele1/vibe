import mongoose from 'mongoose';

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

    // 2. Check current index definitions
    const indexes = await collection.indexes().catch(() => []);
    const endpointIndex = indexes.find((idx: any) => idx.name === 'endpoint_1');

    if (endpointIndex && !endpointIndex.sparse) {
      console.warn('[PushMigration] Detected legacy non-sparse endpoint_1 index. Dropping and re-creating as unique sparse index...');
      try {
        await collection.dropIndex('endpoint_1');
      } catch (dropErr: any) {
        console.warn('[PushMigration] Drop legacy index note:', dropErr.message);
      }

      try {
        await collection.createIndex(
          { endpoint: 1 },
          { unique: true, sparse: true, name: 'endpoint_1' }
        );
        console.log('[PushMigration] Successfully repaired endpoint_1 index to unique sparse.');
      } catch (createErr: any) {
        console.warn('[PushMigration] Re-creating index note:', createErr.message);
      }
    }

    isMigrationExecuted = true;
  } catch (err: any) {
    console.error('[PushMigration] Index repair encountered non-fatal error:', err.message);
  }
};
