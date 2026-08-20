## 2026-08-19 - Aggregate Wallet Totals on MongoDB Engine
**Learning:** Fetching all `CreditTransaction` documents into Node.js memory (`CreditTransaction.find({ userId })`) and running array `.filter().reduce()` scales poorly ($O(N)$ memory transfer and instantiation) as user transaction history grows.
**Action:** Use MongoDB `$match` and `$group` aggregation pipelines with conditional sums (`$cond`) for lifetime calculations to perform aggregation directly on the database engine in $O(1)$ response payload size.

## 2026-08-19 - MongoDB Aggregation Pipeline for Provider Earnings
**Learning:** In MongoDB aggregation `$cond` expressions, missing object fields return BSON type `'missing'`, which does NOT equal BSON `null` in `$eq`/`$ne` comparison expressions. Evaluating `{ $ne: ['$inPayoutRequest', null] }` returns `true` when `$inPayoutRequest` is missing, misclassifying un-requested transactions.
**Action:** When checking optional document fields in MongoDB aggregation pipelines, check both `{ $eq: ['$field', null] }` and `{ $eq: [{ $type: '$field' }, 'missing'] }` to safely handle missing fields.

## 2026-08-20 - Batching N+1 Queries with .lean() in Conversation Lists
**Learning:** In conversation listing endpoints (`getConversations`), running `await AdultUser.findById` inside a loop over fetched conversations causes an N+1 database roundtrip bottleneck. Furthermore, hydrated Mongoose documents add unnecessary CPU overhead for read-only response building.
**Action:** Extract participant IDs, batch query all users in a single `AdultUser.find({ _id: { $in: ids } }).lean()`, store in a `Map`, and use `.lean()` on `AdultConversation.find()` with safe object/Map property access handling for `unreadCounts`.
