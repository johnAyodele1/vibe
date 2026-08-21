## 2026-08-21 - Provider Verification Status Authorization Bypass
**Vulnerability:** The `PATCH /api/adult/providers/:id/status` endpoint allowed any authenticated adult user (members and providers) to update any provider's verification status to `approved` or `rejected` due to missing admin authorization checks.
**Learning:** Route handlers expecting admin privileges must enforce explicit role checks (`requireAdultRole('admin')` or `user.role === 'admin' || user.isAdmin`) both at the route middleware level and within controller logic.
**Prevention:** Always verify role requirements during route definition and ensure admin endpoints are not mounted under generic authenticated user middlewares without explicit authorization checks.
