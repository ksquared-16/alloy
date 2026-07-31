# Code Retirement Ledger — Phase 0

Every compatibility shim, adapter, and containment layer Phase 0 introduced,
with the **named condition** under which it may be deleted.

The point of this ledger is that nothing here is permanent by default. A shim
with no stated deletion condition becomes architecture by accident.

| # | Artifact | Introduced by | Deletion condition | Blocked on |
| --- | --- | --- | --- | --- |
| R-1 | `resolveIdentityPhotoUrl.ts` — the legacy photo compatibility adapter | 6E | (a) no `persons.metadata` row still carries a legacy photo URL, verified by the coordinated data migration, AND (b) every consumer reads a VM field populated by `resolveProfilePhotosForActor` | Phase 2 UI convergence + a data migration |
| R-2 | `RESOLVED_PHOTO_URL_KEY` injection via `applyResolvedPhotoUrls` | 6E | When view models take a resolved photo field directly from the resolver instead of being patched post-hoc | Phase 2 |
| R-3 | `classifyLegacyPhotoUrl` + the `external_stable_url` allowance | 6 | When no person metadata carries any URL — only `profile_photo_document_id` | Data migration |
| R-4 | `backend/app/services/legacy_dispatch_guard.py` | 7 | On decommissioning of the GHL cleaning vertical — see `LEGACY-DISPATCH-DECOMMISSIONING.md` | Kelly's decommission decision + one operational check in GHL |
| R-5 | `backend/app/routes/dispatch.py` (both routes) | pre-existing | Same as R-4 | Same as R-4 |
| R-6 | `web/scripts/vendorObjectPathRemediation.ts` | 6C | After the six legacy vendor objects are dispositioned. They are already unreachable (6B made signing row-driven and none has a `documents` row), so this is cleanup, not exposure | Kelly's disposition decision |
| R-7 | `recordCategoryFallback` telemetry in the eligibility types | 2 | When zero fallbacks are recorded over a full billing cycle — i.e. every send path supplies an explicit category | Phase 1 instrumentation |
| R-8 | `OPTIONAL_TOKEN_PATHS` in the canonical renderer | 5 | When the token catalogue marks optionality declaratively instead of by a hard-coded path list | Phase 3 template platform |

## Not retirement — permanent by design

Recorded so they are not mistaken for debt:

- `contracts/communications/*.json` and the parity tests on each side. These are
  the cross-runtime seam, not a shim.
- `assertDocumentAccess` as the single document authorization decision.
- `enqueueCanonicalOutboundMessage` as the single enqueue choke point.
- `evaluateEligibility` as a pure, versioned evaluator.

## Debt created by Phase 0 and NOT retired here

These are not shims — they are gaps Phase 0 opened or left open, and they belong
to later phases:

| Gap | Consequence today | Owner |
| --- | --- | --- |
| Template **preview** endpoint still uses the separate B0 token engine (`buildTemplatePreview`), not the canonical renderer | preview/send parity is proven at unit level (`previewOutboundMessage === renderOutboundMessage`) but not enforced at the preview surface — a template can still preview differently from how it sends | Phase 3 |
| Avatar freshness under a 15-minute expiry | avatars must be resolved per request; any surface that has not adopted `resolveProfilePhotosForActor` shows initials rather than a photo | Phase 2 |
| Legacy dispatch guard state is process-local | lockout / rate-limit / idempotency are defeated by a multi-instance deployment | R-4 (decommission) or a revival project |
| 25 pre-existing communications test failures | all source-shape `readFileSync` assertions, including at least one verified false positive (`DROP POLICY IF EXISTS` flagged as destructive DDL) | not Phase 0 scope |
