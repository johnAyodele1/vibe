## 2026-08-19 - Aggregate Wallet Totals on MongoDB Engine
**Learning:** Fetching all `CreditTransaction` documents into Node.js memory (`CreditTransaction.find({ userId })`) and running array `.filter().reduce()` scales poorly ($O(N)$ memory transfer and instantiation) as user transaction history grows.
**Action:** Use MongoDB `$match` and `$group` aggregation pipelines with conditional sums (`$cond`) for lifetime calculations to perform aggregation directly on the database engine in $O(1)$ response payload size.

## 2026-08-19 - MongoDB Aggregation Pipeline for Provider Earnings
**Learning:** In MongoDB aggregation `$cond` expressions, missing object fields return BSON type `'missing'`, which does NOT equal BSON `null` in `$eq`/`$ne` comparison expressions. Evaluating `{ $ne: ['$inPayoutRequest', null] }` returns `true` when `$inPayoutRequest` is missing, misclassifying un-requested transactions.
**Action:** When checking optional document fields in MongoDB aggregation pipelines, check both `{ $eq: ['$field', null] }` and `{ $eq: [{ $type: '$field' }, 'missing'] }` to safely handle missing fields.

## 2026-08-20 - Batching N+1 Queries with .lean() in Conversation Lists
**Learning:** In conversation listing endpoints (`getConversations`), running `await AdultUser.findById` inside a loop over fetched conversations causes an N+1 database roundtrip bottleneck. Furthermore, hydrated Mongoose documents add unnecessary CPU overhead for read-only response building.
**Action:** Extract participant IDs, batch query all users in a single `AdultUser.find({ _id: { $in: ids } }).lean()`, store in a `Map`, and use `.lean()` on `AdultConversation.find()` with safe object/Map property access handling for `unreadCounts`.

## 2026-08-20 - Batching Multi-Document N+1 Queries in Admin Disputes Endpoint
**Learning:** In `adminGetDisputes`, `Promise.all(disputes.map(async ...))` executed up to 4 separate database roundtrips per dispute item ($4N + 1$ queries total), causing high network latency and database overhead as dispute records scale.
**Action:** Extract unique participant IDs (`reporter`, `reported`), transaction IDs (`originalTxId`), and report IDs (`_id`), batch query `AdultUser`, `CreditTransaction`, and `CustomerRefund` using `$in` and `.lean()`, index into `Map`s for $O(1)$ lookups, reducing database roundtrips from $O(N)$ to $O(1)$ static queries.
