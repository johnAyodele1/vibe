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

## 2026-08-20 - Batching Message Participants and using .lean() in Provider Dashboard
**Learning:** In `getProviderDashboard`, sequentially calling `await AdultUser.findById` inside a `for` loop over recent messages created an $N+1$ database query bottleneck ($N+1$ roundtrips), while fetching `CamSession` and `AdultMessage` without `.lean()` instantiated heavy Mongoose documents unnecessarily for read-only formatting.
**Action:** Extract distinct participant IDs, batch query via `AdultUser.find({ _id: { $in: ids } }).select('displayName providerProfile').lean()`, index into a `Map` for $O(1)$ lookups, and append `.lean()` to read-only queries.

## 2026-08-21 - Systemic .lean() for Read Queries & React.memo for High-Frequency Components
**Learning:** Unhydrated read queries (`.lean()`) reduce CPU overhead and response serialization time by bypassing Mongoose document instance hydration across backend JSON API routes. On the frontend, un-memoized child components rendered inside chat message lists (like `MessageTick`, `Avatar`, `VideoFallbackOverlay`, and `VoiceNotePlayer`) re-render unnecessarily whenever parent feed state updates.
**Action:** Always append `.lean()` to read-only Mongoose queries where document instance methods (`.save()`, `.populate()`) are not required. Wrap high-frequency list child UI components in `React.memo` to skip DOM diffing during parent state updates.

## 2026-08-23 - Eliminating Database Waterfall Latency with Promise.all
**Learning:** Sequentially awaiting independent database queries or write updates (such as pagination counts alongside data queries, or dual user updates in match/interaction handlers) introduces avoidable database waterfall latency that scales linearly with roundtrip count.
**Action:** Wrap independent database operations in `Promise.all` to execute them concurrently, reducing endpoint response time by up to ~50%.

## 2026-08-28 - Conditional Database Filter to Skip Duplicate Writes
**Learning:** Performing atomic updates (like `$addToSet`) without checking if the target item already exists in the target array executes a database write operation and acquires write locks on every request—even for duplicate requests.
**Action:** Include `{ arrayField: { $ne: itemId } }` in the `findOneAndUpdate` query filter so duplicate requests return `null` immediately without performing redundant database writes or acquiring write locks.
