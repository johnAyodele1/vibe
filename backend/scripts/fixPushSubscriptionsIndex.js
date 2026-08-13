// backend/scripts/fixPushSubscriptionsIndex.js
// Run with: node backend/scripts/fixPushSubscriptionsIndex.js

const mongoose = require('mongoose');

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';
  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  try {
    // Drop the broken non-sparse unique index on endpoint
    await db.collection('pushsubscriptions').dropIndex('endpoint_1');
    console.log('✅ Dropped endpoint_1 index from pushsubscriptions');
  } catch (err) {
    if (err.code === 27 || err.message.includes('index not found')) {
      console.log('Index endpoint_1 not found — already dropped or never existed');
    } else {
      console.error('Error dropping index:', err.message);
    }
  }

  try {
    // Recreate as sparse unique so multiple null/undefined endpoints don't conflict
    await db.collection('pushsubscriptions').createIndex(
      { endpoint: 1 },
      { unique: true, sparse: true }  // sparse: true skips null/undefined values
    );
    console.log('✅ Created sparse unique index on endpoint');
  } catch (err) {
    console.error('Error creating index:', err.message);
  }

  try {
    // Clean up any "undefined" / "null" string endpoints (the bug)
    const delUndefined = await db.collection('pushsubscriptions').deleteMany({ endpoint: 'undefined' });
    console.log(`🧹 Cleaned up ${delUndefined.deletedCount} push subscriptions with string "undefined" endpoint`);

    const delNullStr = await db.collection('pushsubscriptions').deleteMany({ endpoint: 'null' });
    console.log(`🧹 Cleaned up ${delNullStr.deletedCount} push subscriptions with string "null" endpoint`);
  } catch (err) {
    console.error('Error cleaning up invalid endpoint strings:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done');
};

run().catch(console.error);
