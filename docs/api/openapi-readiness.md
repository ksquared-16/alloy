# Alloy API — OpenAPI Readiness Gate

**Status:** Phase 3 finalized — **API Platform Complete**. This is the canonical decision doc for
**when** and **for what** Alloy generates OpenAPI. It consolidates the contract work
already completed (Actions → Analytics Metrics → Entity Read → reference-data families) and
defines the exact readiness bar a route family must clear before it enters an OpenAPI spec.

> **The v0 spec now exists:** [`openapi/alloy-api.v0.yaml`](openapi/alloy-api.v0.yaml) (see
> [`openapi/README.md`](openapi/README.md)). It documents exactly the gate-passing families
> listed in §4 below. Validate with `node scripts/validate-openapi.mjs`.
>
> **A typed internal client is generated from it:**
> [`internal-typescript-client.md`](internal-typescript-client.md)
> (`web/lib/api/generated/alloyApiTypes.ts` + `web/lib/api/alloyApiClient.ts`). New code/tests
> calling gate-passing families should prefer it; regenerate types after any spec change with
> `node scripts/generate-openapi-types.mjs`.

> **One-line policy:** OpenAPI is generated **only** for routes that already emit the
> standard `{ ok, data, correlation_id }` / `{ ok, error: { code, message, details? }, correlation_id }`
> envelope, have their active consumers unwrapping it, and have contract tests. Everything
> else is excluded by default until it clears the gate.

Related: [`api-architecture.md`](api-architecture.md) (governing doctrine — §8 is the OpenAPI doctrine) ·
[`api-platform-governance.md`](api-platform-governance.md) (Definition of Done, admission, lifecycle, CI) ·
[`api-data-access-performance.md`](api-data-access-performance.md) (pagination/sync/freshness schemas required in the spec — §11) ·
[`api-response-contract.md`](api-response-contract.md) (the envelope + helpers) ·
[`api-contract-migration-status.md`](api-contract-migration-status.md) (live per-route tracker) ·
[`api-documentation-audit.md`](api-documentation-audit.md) (findings + recommendations) ·
[`internal-typescript-client.md`](internal-typescript-client.md) (generated client) ·
[`api-index.md`](api-index.md) (generated full inventory).

---

## 0. Platform Complete vs Platform Expansion

As of Phase 3 finalization, the **internal API Platform is complete**. "Complete" means the
**foundation** exists and is self-governing — not that every route is normalized. The distinction
matters because it changes how future work is classified and prioritized.

**Platform Complete (foundation — done):**

- API inventory + first-class documentation (`docs/api/`).
- Standard response contract + shared helpers (`apiOk` / `apiError` / `apiZodError`).
- API architecture doctrine + data-access/freshness/performance doctrine.
- Live migration tracker + this readiness gate.
- OpenAPI v0 spec for the gate-passing families.
- Generated TypeScript types + a thin typed internal client (`AlloyApiError`).
- ≥1 production consumer migrated as proof.
- Contract test suite (`web/tests/api/openapiContract.test.ts`) + envelope/client tests.
- Self-governing CI command (`cd web && npm run api:check`).
- Governance doctrine ([`api-platform-governance.md`](api-platform-governance.md)) defining the
  Definition of Done and the API lifecycle.

**Platform Expansion (additions — not foundational):**

These are **valuable but optional additions** that ride on the finished foundation. None of them
are required to call the platform complete, and none should reopen foundational work:

- New normalized route families (e.g. the `{ <plural> }` list-route batch, sibling analytics).
- New OpenAPI additions (each must clear the gate in §6 and the DoD in governance).
- Migrating more existing consumers to the typed client.
- Future SDK / public `/api/v1` surface (after a public-contract review).
- Future developer portal.
- Future GraphQL or alternate transport (if ever).

> **Operating rule going forward:** API Platform work is now **paused**. When it resumes, the
> default mode is **expansion** — apply the readiness gate (§6) and the Definition of Done
> (governance §1), run `npm run api:check`, and add to the spec/client/tests. Do **not** treat
> expansion as a reason to re-litigate the foundation.

---

## 1. Why a gate (not "OpenAPI now")

OpenAPI was deliberately deferred through Phases 2–2D. Generating a spec across the full
461-route surface today would produce a **misleading contract**: the surface still mixes
bare records, `{ <plural>: [...] }` lists, `{ items, adapters }`, `{ ok }` envelopes, and a
few legacy bare-string error bodies. A spec is only as trustworthy as the envelope it
documents. The gate exists so the **first** published OpenAPI describes a surface that is
already uniform, tested, and consumed through one unwrap path — so Alloy (and later external
developers) can build a typed client against it without per-route special cases.

---

## 2. What is normalized today

Three internal pillars are **fully** on the standard envelope, with active consumers
unwrapping in lockstep and contract tests in `web/tests/api/`. All use the shared helpers in
[`web/lib/api/`](../../web/lib/api) (`apiOk` / `apiError` / `apiZodError`); analytics adds
`metricValidationError`, entity reads add the client-side `unwrapEntityRecord` helper.

| Pillar | Routes | Methods | Success shape | Phase |
|--------|--------|---------|---------------|-------|
| **Actions** | `actions/execute`, `actions/preflight`, `actions/inventory` | POST, POST, GET | `data.execution_result` / `data` (preflight) / `data.items` | 2B |
| **Analytics Metrics** | `analytics/metrics`, `metrics/[id]`, `…/copy`, `…/preview`, `…/snapshot`, `…/trend` | GET, POST, PATCH | `data.{items,adapters}` / `data.item` / `data.evaluation` / `data.{evaluation,snapshot_id}` / `data.{series,comparison}` | 2C |
| **Entity Read** | `entity/[type]/[id]` | GET | `data.entity` (record shape preserved verbatim; incl. `{ _create: true }`) | 2D |
| **Config reference data** | `customer-person-role-types` (+`/[id]`), `person-relationship-type-settings` (+`/[id]`) | GET, POST, PATCH, DELETE | `data.items` (GET) / `data.item` (POST/PATCH) | 2F |

**Audit result (updated Phase 2F):** of 461 `app/api/**/route.ts` handlers, exactly **14** import
the envelope helpers — the three core pillars plus the two Phase 2F config reference-data families
(4 route files), plus the two supporting libs `lib/admin/opportunityEntityRecord.ts` and
`lib/metrics/platform/adminApiHelpers.ts`. There are **no partial or accidental adopters**
elsewhere: the normalized set is clean and bounded.

Failure envelopes for all three pillars use stable SCREAMING_SNAKE_CASE codes
(`BAD_REQUEST`, `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`, plus the
domain-specific `ACTION_BLOCKED`), preserve their prior HTTP status codes, and never return a
bare-string body. Correlation ids are always present (body + `x-correlation-id` header).

---

## 3. What is still legacy / non-uniform

Everything **not** in §2 is still on a pre-contract shape and is **not** an OpenAPI target.
This is expected — Phase 2 intentionally migrated a representative slice, not the whole
surface. The major buckets:

- **Mixed CRUD list/object routes** (~the bulk of the remaining handlers): `{ <plural>: [...] }`
  lists and bare resource objects (persons, customers, jobs, schedules, locations, vendors,
  subscriptions, payments/financials, tours, processing, child-*, placement-candidates). The
  mechanical normalization of this bucket has **started** (Phase 2F took the two config
  reference-data families above); the rest still carry the legacy shapes.
- **Sibling analytics routes** not yet normalized: `visualizations`, `placements`, `rollups`,
  `render`, `snapshots/run`, `surfaces`. The shared `MetricSetupFlow` `writeRecord` helper is
  deliberately **envelope-tolerant** (`json.data?.item ?? json.item`) because it still writes
  to these.
- **Public / tokenized** forms + tours capture routes (`/api/public/forms/[token]/*`, booking) —
  external-facing already, but not reviewed for a stable public contract.
- **Internal / debug / dev / bootstrap** routes — not part of any external contract.
- **Legacy drawer-only flows** — see §5; documented as sunset, not modernization targets.

The live per-route status (and the next recommended mechanical batch — the `{ <plural> }` list
routes) is tracked in [`api-contract-migration-status.md`](api-contract-migration-status.md).

---

## 4. OpenAPI v0 — eligible surface

OpenAPI **v0** documents **only** the normalized pillars. These are stable, well-scoped,
read/do-work oriented, and already consumed through a single unwrap path:

| Eligible (v0) | Method(s) | Notes for the spec |
|---|---|---|
| `POST /api/admin/actions/execute` | POST | `ACTION_BLOCKED` failure carries structured `error.details` (completion/preflight context). |
| `POST /api/admin/actions/preflight` | POST | Zod-validated body → `VALIDATION_ERROR` via `apiZodError`. |
| `GET /api/admin/actions/inventory` | GET | `data.items`. |
| `GET/POST /api/admin/analytics/metrics` | GET, POST | List read + create. |
| `GET/PATCH /api/admin/analytics/metrics/[id]` | GET, PATCH | Single read + update. |
| `POST /api/admin/analytics/metrics/[id]/copy` | POST | `data.{item,copied}`. |
| `POST /api/admin/analytics/metrics/[id]/preview` | POST | `data.evaluation`. |
| `POST /api/admin/analytics/metrics/[id]/snapshot` | POST | `data.{evaluation,snapshot_id}`. |
| `GET /api/admin/analytics/metrics/[id]/trend` | GET | `data.{series,comparison}`. |
| `GET /api/admin/entity/[type]/[id]` | GET | `data.entity`; record shape preserved verbatim. Opportunity surfaces (`drawer_visible`/`drawer_primary`/`full`/`relationship_member_persons`) wrap identically and add `X-Alloy-*` perf headers (document as response headers). |
| `/api/admin/customer-person-role-types` (+ `/[id]`) | GET, POST, PATCH, DELETE | Config reference data (Phase 2F). `data.items` / `data.item`; DELETE = `NOT_IMPLEMENTED` (405). |
| `/api/admin/person-relationship-type-settings` (+ `/[id]`) | GET, POST, PATCH, DELETE | Config reference data (Phase 2F). Identical contract to the row above. |

**Spec conventions for v0:**
- Components: shared `ApiSuccess<T>` / `ApiFailure` schemas; reuse the §3 error-code enum from
  [`api-response-contract.md`](api-response-contract.md).
- `correlation_id` documented as always-present on these routes (body + `x-correlation-id` header).
- The entity-read `data.entity` body is **wide and type-dependent**; v0 may type it as an open
  object and defer field-level allow-listing (see §6) rather than block on a full record schema.
- Auth: document the admin-context + scope model (deny-by-default → `404`/`403`), do not imply a
  public/unauthenticated contract.

---

## 5. Explicitly excluded from OpenAPI (until they clear the gate)

These are **out of scope for v0 by design**, not oversights:

- **Mixed CRUD list routes** — non-uniform envelopes; would force per-route special cases.
- **Public / tokenized forms & tours** — external-facing but **not reviewed** for a stable
  public contract (field exposure, rate limits, versioning) yet.
- **Internal / debug / dev / bootstrap** routes — not a contract surface for anyone.
- **Legacy drawer-only flows** — `AdminEntityDrawerLegacy.tsx` and its inline call sites mount
  **only** under the emergency kill switch (`FORCE_LEGACY_OPPORTUNITY_DRAWER` /
  `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH`). They received **mechanical envelope-read
  alignment only** (so rollback keeps working against the normalized routes) and are **not**
  modernization targets. When the kill switch is retired, delete them rather than spec them.
- **Sibling analytics routes** (`visualizations`, `placements`, `rollups`, `render`,
  `snapshots/run`, `surfaces`) — not yet normalized; sharing a consumer with the migrated
  metrics routes does not make them eligible.

Sunset classification rules and the legacy-drawer reality are detailed in
[`api-contract-migration-status.md`](api-contract-migration-status.md) §"Legacy / sunset surfaces".

---

## 6. The readiness gate — what must be true before a route family enters OpenAPI

A route family graduates into the spec **only** when **all** of the following hold. This is the
checklist to apply to each future batch (next up: the `{ <plural> }` list routes).

1. **Envelope.** Every response (success + every error exit) uses `apiOk` / `apiError` /
   `apiZodError` (or a thin wrapper over them). No bare records, no bare-string bodies, no
   `{ <plural>: [...] }` top level.
2. **Stable error codes.** Failures use SCREAMING_SNAKE_CASE codes from the baseline set (or a
   documented domain code), with HTTP status preserved. Clients branch on `ok` + `error.code`,
   never on `message`.
3. **Correlation id.** Present on body and `x-correlation-id` header for the family.
4. **Consumers unwrap in lockstep.** Every active consumer reads `json.data.*` (or a shared
   unwrap helper). No active surface still depends on the legacy shape. Envelope-tolerant
   shims (e.g. `json.data?.x ?? json.x`) are acceptable only as a documented transition and must
   be listed in the migration tracker.
5. **Contract tests.** `web/tests/api/contractRoutes.test.ts` (or a sibling) proves the success
   envelope, the bad-request / forbidden / not-found envelopes, no bare-string error, and a
   representative consumer unwrap.
6. **Docs updated.** The family is marked **Full** in
   [`api-contract-migration-status.md`](api-contract-migration-status.md) and reflected in
   [`api-response-contract.md`](api-response-contract.md) §5.
7. **Org-scoping sanity.** The family is not flagged by `scripts/auditOrgScopingGuard.mjs`
   (advisory), or the flags are triaged as false positives.

**Broader-OpenAPI bar (beyond v0):** before generating OpenAPI across additional families,
also require — (a) the `{ <plural> }` list-route batch normalized (largest mechanical bucket),
(b) public/tokenized routes reviewed for a deliberate external contract, and (c) the org-scoping
guard promoted from advisory toward a CI gate so the spec's auth claims are enforced, not just
asserted.

---

## 7. Validation for this consolidation phase

```bash
cd web && npm run test -- tests/api/   # pillar contract tests (success/failure envelopes, no bare strings)
cd web && npm run typecheck            # changed files type-clean
```

`api-index.md` / `api-inventory.json` are **not** regenerated in this phase (the working tree
carries unrelated parallel-sprint changes; regenerating would introduce route churn unrelated
to the contract gate). Regenerate only from a clean tree.
