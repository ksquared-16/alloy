# API documentation audit

**Date:** June 2026. **Scope:** All 456 `route.ts` handlers under `web/app/api/**`.
**Method:** Static inventory via `scripts/generate-api-inventory.mjs` + targeted source reads. Signals are **heuristic** — each finding lists what to verify, not a confirmed defect. No runtime behavior was changed by this sprint.

**Outcome goal:** Make the surface reviewable. This is a findings list and a Phase 2 plan, not a remediation.

> **Phase 2 update (Contract Normalization, June 2026):** The standard response
> envelope, shared helpers, tests, and an org-scoping guard spike now exist, and a
> representative route slice is migrated. See [`api-response-contract.md`](api-response-contract.md).
> Findings below are annotated with their Phase 2 status.

---

## 1. Coverage summary

| Metric | Value |
|--------|-------|
| Route handlers | 456 |
| Documented in this folder | 456 (all, via domain docs + generated index) |
| Service-role client (`createAdminClient`/`createServiceRoleClient`) | 442 / 456 |
| Write routes (insert/update/upsert/delete/rpc) | 156 |
| Validation: manual / schema / zod / none | 293 / 64 / 4 / 95 |
| Stability: admin-only / public-tokenized / experimental / internal / webhook | 405 / 27 / 8 / 13 / 3 |

---

## 2. Undocumented routes

Before this sprint there was **no `docs/api/` folder**; the only API references were `docs/platform/governance/api-contracts.md` (a representative map) and `docs/system/api-contracts.md` (a selected table). Neither enumerated the full surface.

- **Finding:** ~456 routes existed without a first-class inventory.
- **Resolution:** All routes are now in the generated [`api-index.md`](api-index.md); each domain has a curated doc. No code change required.
- **Follow-up:** Keep the index regenerated when route families change (documented in [`README.md`](README.md)).

---

## 3. Duplicate / overlapping routes

| Routes | Nature | Recommendation |
|--------|--------|----------------|
| `/api/admin/v2/view-models/drawer/{opportunity,person,child}/[id]` vs `/api/admin/view-models/drawer/{…}/[id]` | The `v2/*` handlers are one-line `export { GET } from "…"` **re-export aliases** of the non-`v2` routes | Intentional compatibility alias. Document as alias (done in [`workspace-api.md`](workspace-api.md)); consider removing one path once callers converge. |
| `/api/admin/communications/announcements/recipient-preview` vs `/api/admin/communications/announcements/[id]/recipient-preview` | Two recipient-preview endpoints (pre-create vs per-announcement) | Confirm both are needed; if the bare route only serves draft preview, name it explicitly. |
| `/api/admin/documents/[id]` vs `/api/admin/pos/documents/[id]` | Different subsystems (general docs vs POS docs) | **Not** a duplicate; naming is just similar. No action. |

No true functional duplicates (same behavior, two live paths) were found beyond the `v2` re-export aliases.

---

## 4. Routes with unclear / undetected auth

Static scan found **9 routes with no recognized auth helper**. All are public-by-design or webhook:

| Route | Expected model | Verify |
|-------|----------------|--------|
| `/api/book-v2/{opportunity-discount,quote-refine,service-details,validate-promo}` | Public booking — input validation + public org | Confirm public-org scoping + abuse/rate limits |
| `/api/marketing/demo-request` | Public lead capture | Confirm spam/abuse controls |
| `/api/verticals` | Public catalog read | Confirm no tenant data leaks |
| `/api/action-links/{resolve,consume-reschedule}` | Token-authenticated | Confirm token validation before side effects |
| `/api/webhooks/twilio/sms-status/[binding_id]` | Provider signature (inside `handleTwilioSmsStatus`) | Confirm per-binding signature verification |

**No admin route** was found without a gate after expanding detection to include `requireAdminOrgContextLight`, `requireUsersRolesManageAuth`, `requireAnalyticsV2Admin*`, `loadConfigLayoutAssistAdminContext`, and re-export inheritance.

**Worker route to verify explicitly:** `/api/admin/communication-scheduled-sends/process-due` — confirm it is protected by an internal/cron token or portal gate so an external scheduler cannot trigger sends.

---

## 5. Routes with unclear org scoping

The structural risk across the whole surface: **442/456 routes use a service-role client that bypasses RLS**, so org isolation depends entirely on every query filtering `org_id` (and FK-chain assertions for org-less rows). This is the correct established pattern, but it means scoping is **not enforced by the database** for these routes.

- **Highest-attention reads** (return data joined across entities): `/api/admin/entity/[type]/[id]`, `/api/admin/global-search`, `/api/admin/related/[entity]/[id]`, document/payment reads. These already use `assertEntityDrawerRecordReadable` / `assertRowOrg`; keep those assertions on any new branch/type.
- **Org-less primary tables** (`discount_redemptions`, `pricing_addons`, catalog tables) rely on FK-chain or vertical scoping — document the rule per type (started in [`entity-record-api.md`](entity-record-api.md)).
- **Recommendation:** Add a lint/test that flags a tenant `.from(...)` read without a corresponding `org_id` filter in route handlers (Phase 2).
- **Phase 2 status — spike landed.** `scripts/auditOrgScopingGuard.mjs` is a heuristic scan that flags service-role routes touching tenant tables without a visible org-scope signal. It is **advisory** (does not fail CI); `tests/api/orgScopingGuard.test.ts` only enforces that the migrated subset is clean. First run flagged 2 advisory candidates to verify (`/api/admin/subscriptions/[id]`, `/api/book-v2/availability`) — likely scope enforced in helpers (false positives). Promoting this to a CI gate is a later phase.

---

## 6. Inconsistent response envelopes

Confirmed inconsistency:

- **Success shapes vary:** bare resource object (`entity/[type]/[id]`), `{ <plural>: [...] }` lists, `{ items, adapters }` (analytics), `{ ok: true, … }` (actions/BOS). ~146 routes use an `{ ok }` envelope; list/object routes do not.
- **Error shapes vary:** ~394 routes return `{ error: string }` + status, but some return a **bare JSON string** body (`NextResponse.json("Not found", { status: 404 })` in `entity/[type]/[id]`), and action routes return `{ ok:false, error, correlation_id }`.
- **Impact:** A future public API or typed client cannot rely on one envelope.
- **Recommendation (Phase 2):** Adopt a single response contract. The **`{ ok, data?, error?, correlation_id? }`** shape used by `POST /api/admin/actions/execute` and the BOS routes is the best in-repo model; the analytics platform's `zodErrorResponse` is the best error model. Do not retrofit broadly in this sprint.
- **Phase 2 status — contract established.** Shared helpers (`apiOk`/`apiError`/`apiZodError`) in `web/lib/api/` define the canonical `{ ok, data, correlation_id }` / `{ ok, error: { code, message, details? }, correlation_id }` envelope. Migrated slice: `actions/preflight` (full), `actions/inventory` (full), `analytics/metrics` GET (full), `entity/[type]/[id]` (errors only — **bare-string finding resolved**; status codes preserved), `actions/execute` (**full — Phase 2B**: success + all failures normalized, `ACTION_BLOCKED` for unmet requirements, all 15 consumers migrated; see [`actions-execute-envelope-audit.md`](actions-execute-envelope-audit.md)). Per-route status: [`api-response-contract.md`](api-response-contract.md) §5.

---

## 7. Routes missing validation

- **95 routes** show no validation signal (no zod/schema/`400`). Many are pure GET reads where param validation is light, which is acceptable.
- **Mutating routes with no detected validation:** `DELETE /api/admin/pos/documents/[id]` was the only write-capable route with no validation signal — verify it checks ownership/org before delete.
- **Best-validated area:** the analytics platform (`validate*` + `zodErrorResponse`) and the few zod routes — use as the pattern when hardening.
- **Recommendation (Phase 2):** Standardize request validation (schema-first) starting with write routes; the static signal here is a triage list, not a defect list.

---

## 8. Routes that should remain internal only

Stability `internal` (13) plus high-privilege bootstrap/dev:

- Diagnostics: `/api/admin/debug/*`, `/api/admin/access-scope-debug`, `/api/admin/db-relationships`, `/api/admin/deletion-eligibility`, layout `*-shadow` / `layout-proof/*`, `lifecycle-queue-filter-audit`, `persistence-audit`, `workflows/debug-vendor-enrichment`.
- Maintenance/test: `/api/admin/lifecycle-catalog/{repair,repair-work-units,cleanup-test}` — `cleanup-test` is explicitly test-only.
- High-privilege provisioning: `/api/admin/tenant-bootstrap`, `/api/admin/vertical-bootstrap`, `/api/admin/dev/create-org` (**must be production-guarded**), `/api/admin/send-password-reset`.

**Recommendation:** Never expose these via a public API. Confirm `dev/create-org` and debug routes are disabled or strictly gated in production.

---

## 9. Candidates for future public / developer API exposure

Stable, well-scoped, read-oriented surfaces that could anchor a v1 public API once envelopes are normalized:

| Candidate | Why |
|-----------|-----|
| `GET /api/admin/entity/[type]/[id]` | Canonical record read; well-scoped; clear contract (needs envelope normalization + field allow-listing) |
| `GET /api/admin/global-search` | Cohesive, scoped search contract |
| Actions: `GET /api/admin/actions`, `POST /api/admin/actions/{preflight,execute}` | Already use the cleanest `{ ok, correlation_id }` envelope; natural "do work" API |
| Analytics platform (`/api/admin/analytics/*`) | Best validation + structured envelopes already |
| Forms public capture (`/api/public/forms/[token]/*`) | Already external-facing and tokenized |

**Not candidates yet:** anything `internal`/bootstrap, the legacy `admin/agent/v*` routes, and any route with bare-string errors until normalized.

---

## 10. Other observations

- **Legacy BOS commit routes** (`/api/admin/agent/v0|v1|v2/*`) are flag-gated and overlap conceptually with the newer assist routes — consolidation candidate.
- **Legacy stores** (`messages`/`messages_outbox`) run parallel to `communication_*`; comms routes should keep writing canonical stores.
- **`contacts`** remains compatibility infrastructure; entity routes prefer `persons` + `customer_persons`.

---

## 11. Phase 2 recommendations (priority order)

1. **Normalize the response envelope** to a single `{ ok, data?, error?, correlation_id? }` contract (model: actions/execute + analytics error helper). Prerequisite for any public API. — **✅ foundation + representative slice done (Phase 2).** Remaining: incrementally migrate the rest, batch by consumer coupling (next batch below).
2. **Org-scoping guard test** — fail CI when a tenant route reads/writes a tenant table without an `org_id` filter or FK assertion. — **◑ spike landed (advisory).** Promote to CI gate after triaging the global warning list.
3. **Schema-first request validation** on write routes (extend the analytics platform pattern). — pending (preflight now schema-validated as a model).
4. **Then** author **OpenAPI** (Phase 3) for the public-candidate subset only (§9). Holding OpenAPI back is deliberate: today's mixed envelopes would produce a misleading spec. Start once the envelope migration covers the public-candidate subset.
5. **Production guard audit** for §8 internal/bootstrap/dev routes. — pending.

### Recommended next migration batch

- ~~`actions/execute` **failure** envelope + its ~15 client call sites~~ — **✅ done (Phase 2B).** Route + all consumers migrated; `ACTION_BLOCKED` carries preflight context under `error.details`.
- `analytics/metrics` **POST/PATCH** + `metrics/[id]` together, with `MetricBuilderPanel` / `MetricSetupFlow` updated in lockstep.
- `entity/[type]/[id]` **success** payload (high drawer fan-out — coordinate with the AdminV2 runtime reveal suite).
- List routes returning `{ <plural>: [...] }` (low coupling, high count) — good mechanical batch.

> OpenAPI remains **Phase 3**, after the envelope migration reaches the public-candidate subset.
