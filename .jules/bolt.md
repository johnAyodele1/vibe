## 2026-08-19 - Aggregate Wallet Totals on MongoDB Engine
**Learning:** Fetching all `CreditTransaction` documents into Node.js memory (`CreditTransaction.find({ userId })`) and running array `.filter().reduce()` scales poorly ($O(N)$ memory transfer and instantiation) as user transaction history grows.
**Action:** Use MongoDB `$match` and `$group` aggregation pipelines with conditional sums (`$cond`) for lifetime calculations to perform aggregation directly on the database engine in $O(1)$ response payload size.
