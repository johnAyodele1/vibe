## 2026-08-24 - Dual Admin Privilege Check Pattern in Adult Zone
**Vulnerability:** `PATCH /api/adult/providers/:id/status` lacked admin authorization checks, allowing any authenticated user to update provider verification status.
**Learning:** In the Adult Zone auth architecture (`AdultUser`), administrative privileges can be represented either via `role = 'admin'` or `isAdmin = true`. Middleware checking roles previously only compared strict role strings (`role !== 'user'/'provider'`), causing missing 'admin' route enforcement.
**Prevention:** Always extend `requireAdultRole('admin')` to evaluate `req.adultUser?.role === 'admin' || req.adultUser?.isAdmin === true` and mirror this check inside controller logic for defense in depth.
