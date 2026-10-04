import mongoose from 'mongoose';

const ACTIVE_STATUSES = ['requested', 'verifying', 'processing'];

export const repairPartyPayoutIndexes = async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const collection = db.collection('party_payout_requests');

  // The previous implementation enforced one payout per party forever.
  // New payouts are organizer-level batches, so the legacy unique party index
  // must be removed before creating the active-request index.
  const indexes = await collection.indexes();

  for (const index of indexes) {
    if (index.name === 'partyId_1') {
      try {
        await collection.dropIndex(index.name);
      } catch (error: any) {
        if (error?.code !== 27 && !String(error?.message || '').includes('index not found')) {
          throw error;
        }
      }
    }
  }

  await collection.updateMany(
    { isActive: { $exists: false } },
    [
      {
        $set: {
          isActive: { $in: ['$status', ACTIVE_STATUSES] },
        },
      },
    ]
  );

  // Legacy data may contain more than one active party payout for an organizer.
  // Keep the most recent active request and safely release the others before
  // creating the unique active-request constraint.
  const duplicateOrganizers = await collection.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$organizerId',
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  for (const group of duplicateOrganizers) {
    const requests = await collection
      .find({ _id: { $in: group.ids }, isActive: true })
      .sort({ requestedAt: -1, _id: -1 })
      .toArray();

    const [keep, ...superseded] = requests;
    if (!keep) continue;

    if (superseded.length) {
      await collection.updateMany(
        { _id: { $in: superseded.map((request) => request._id) } },
        {
          $set: {
            status: 'rejected',
            isActive: false,
            rejectedAt: new Date(),
            adminNotes: 'Superseded during party payout accounting migration.',
          },
        }
      );
    }
  }

  await collection.createIndex(
    { organizerId: 1, isActive: 1 },
    {
      unique: true,
      partialFilterExpression: { isActive: true },
      name: 'one_active_party_payout_per_organizer',
    }
  );

  await collection.createIndex(
    { status: 1, requestedAt: -1 },
    { name: 'party_payout_status_requested_at' }
  );

  await collection.createIndex(
    { organizerId: 1, requestedAt: -1 },
    { name: 'party_payout_organizer_requested_at' }
  );

  console.log('[PartyPayoutMigration] Party payout indexes verified.');
};
