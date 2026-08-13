import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('Database Migration & Index Cleanup', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should drop old index, recreate as sparse unique, and clean up "undefined" / "null" string endpoints', async () => {
    const db = mongoose.connection.db;
    const collection = db.collection('pushsubscriptions');

    // 1. Setup mock old state with index and invalid records
    await collection.createIndex({ endpoint: 1 });
    const indexesBefore = await collection.indexes();
    const hasEndpoint1Before = indexesBefore.some(idx => idx.name === 'endpoint_1');
    expect(hasEndpoint1Before).toBe(true);

    // Insert mock data
    await collection.insertMany([
      { deviceId: 'dev1', endpoint: 'https://updates.push.com/ok-endpoint-1' },
      { deviceId: 'dev2', endpoint: 'undefined' },
      { deviceId: 'dev3', endpoint: 'null' },
    ]);

    // 2. Execute the migration logic
    try {
      await db.collection('pushsubscriptions').dropIndex('endpoint_1');
    } catch (err: any) {
      // should not fail
    }

    await db.collection('pushsubscriptions').createIndex(
      { endpoint: 1 },
      { unique: true, sparse: true }
    );

    // Clean up
    const delUndefined = await db.collection('pushsubscriptions').deleteMany({ endpoint: 'undefined' });
    const delNullStr = await db.collection('pushsubscriptions').deleteMany({ endpoint: 'null' });

    // 3. Assertions
    const indexesAfter = await collection.indexes();
    const endpointIndex = indexesAfter.find(idx => idx.name === 'endpoint_1');
    expect(endpointIndex).toBeDefined();
    expect(endpointIndex?.sparse).toBe(true);
    expect(endpointIndex?.unique).toBe(true);

    expect(delUndefined.deletedCount).toBe(1);
    expect(delNullStr.deletedCount).toBe(1);

    const remaining = await collection.find({}).toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].deviceId).toBe('dev1');
  });
});
