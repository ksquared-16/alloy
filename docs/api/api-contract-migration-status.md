# Alloy API Contract Migration Status

> Internal-consistency tracker for the Alloy API contract. OpenAPI is intentionally
> **deferred** until the internal surface is consistent enough that Alloy itself can
> build against it reliably (typed client ergonomics, predictable error handling).
>
> Canonical contract + helpers: [`api-response-contract.md`](api-response-contract.md).
> OpenAPI eligibility + the readiness gate: [`openapi-readiness.md`](openapi-readiness.md).
> Full route inventory: [`api-index.md`](api-index.md) / [`api-inventory.json`](api-inventory.json).

## Contract shape

```ts
// success
{ ok: true, data, correlation_id }
// failure
{ ok: false, error: { code: string, message: string, details?: unknown }, correlation_id }
```

Helpers: `apiOk` / `apiError` / `apiZodError` in `web/lib/api/` (`apiResponse.ts`,
`apiErrors.ts`, `correlationId.ts`).

## Priority order

Normalize in this order. Do **not** spend effort on a lower tier while a higher tier
is inconsistent, and do **not** normalize a route consumed only by a lower tier.

1. **Active workspace / work-unit / focus-panel APIs** — the runtime operators use today.
2. **Actions / workflow execution APIs** — Alloy's "do work" surface; best public-API candidate.
3. **Analytics / metrics APIs**.
4. **Entity resolver APIs used by active runtime**.
5. **Public / tokenized APIs**.
6. **Legacy drawer / admin surfaces** — only if still actively imported (see sunset list).

## Migrated routes

| Route | Method | Status | Notes |
| --- | --- | --- | --- |
| `/api/admin/actions/execute` | POST | ✅ Full | Phase 2B. Success = canonical `data` only; all failures via `apiError`; `ACTION_BLOCKED` carries preflight context under `error.details`. All active consumers migrated. See [`actions-execute-envelope-audit.md`](actions-execute-envelope-audit.md). |
| `/api/admin/actions/preflight` | POST | ✅ Full | Zod body schema → `apiZodError`; success via `apiOk`. |
| `/api/admin/actions/inventory` | GET | ✅ Full | `apiOk({ items })`; consumers updated in lockstep. |
| `/api/admin/analytics/metrics` | GET, POST | ✅ Full | Analytics family normalization. `apiOk`/`apiError`; validation via `metricValidationError` (real message in `error.message`, zod issues in `error.details`). |
| `/api/admin/analytics/metrics/[id]` | GET, PATCH | ✅ Full | `NOT_FOUND` / `FORBIDDEN` / `VALIDATION_ERROR` / `BAD_REQUEST` envelopes. |
| `/api/admin/analytics/metrics/[id]/copy` | POST | ✅ Full | `apiOk({ item, copied })`; `NOT_FOUND` / `BAD_REQUEST` failures. |
| `/api/admin/analytics/metrics/[id]/preview` | POST | ✅ Full | `apiOk({ evaluation })`; `NOT_FOUND` / `VALIDATION_ERROR`. |
| `/api/admin/analytics/metrics/[id]/snapshot` | POST | ✅ Full | `apiOk({ evaluation, snapshot_id })`; `INTERNAL` on snapshot failure. |
| `/api/admin/analytics/metrics/[id]/trend` | GET | ✅ Full | `apiOk({ series, comparison })`; `NOT_FOUND` / `VALIDATION_ERROR`. |
| `/api/admin/entity/[type]/[id]` | GET | ✅ Full | Phase 2D. Success = `apiOk({ entity })` for every entity type + the `{ _create: true }` new-record sentinel; opportunity surfaces (`drawer_visible` / `drawer_primary` / `full` / `relationship_member_persons`) wrap the same way and preserve the `X-Alloy-*` perf headers. All errors via `apiError`. Active consumers unwrap `json.data.entity` (shared `unwrapEntityRecord`). |

## Active consumers migrated for `actions/execute` (Phase 2B)

These are all **active** workspace / VM-runtime surfaces (priority 1–2):

- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` — work-unit runtime (queue-row + modals).
- `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` — registry action client (VM header actions, record-section actions, workspace rail).
- `web/lib/admin/actions/entryLifecycleActionClient.ts` — `create_lead` / `mark_lost` / `move_to_qualification` (workspace modals).
- `web/lib/admin/actions/submitAddPersonFromDrawer.ts` — add-person flow (`AddPersonModal`, VM modals).
- `web/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx` — VM opportunity drawer runtime.

Each unwraps intentionally: `json.data?.execution_result` on success, `json.error?.message`
on failure, and `json.error?.details?.{action_preflight,completion_requirements}` for
blocked-action surfaces.

## Active consumers migrated for analytics metrics

All **active** analytics builder/settings surfaces (priority 3) unwrap the envelope:

- `web/app/adminV2/settings/analytics/MetricBuilderPanel.tsx` — direct POST/PATCH to `metrics` / `metrics/[id]`; reads `json.data.item`, `json.error?.message`.
- `web/lib/metrics/platform/fetchMetricPlatform.ts` — `fetchMetricDefinitions` (`json.data.{items,adapters}`), `previewMetricDefinition` (`json.data.evaluation`).
- `web/lib/metrics/platform/fetchMetricRender.ts` — `copyMetricToOrg` (`json.data.{item,copied}`).
- `web/app/adminV2/settings/analytics/MetricSetupFlow.tsx` — shared `writeRecord<T>` helper is **envelope-tolerant** (`json.data?.item ?? json.item`) because it also writes to the not-yet-migrated `visualizations` / `placements` sibling routes.

> Sibling analytics routes (`visualizations`, `placements`, `rollups`, `render`,
> `snapshots/run`, `surfaces`) are **not** part of this batch and remain on the legacy
> shape. The shared `zodErrorResponse` / `requireAnalyticsV2AdminMutate` helpers are
> unchanged for them; the migrated metrics routes use `metricValidationError` and
> `apiError` instead.

## Active consumers migrated for entity read (Phase 2D)

The entity GET success shape changed from a bare record to `{ ok, data: { entity }, correlation_id }`.
Every body reader unwraps via the shared helper `web/lib/api/unwrapEntityRecord.ts`
(`json.data.entity`), feeding the **identical** record object to downstream snapshot
caches, readiness predicates, and `_create` checks — so composed-payload readiness and
drawer reveal gates are unchanged.

- `web/lib/admin/prefetchPersonDrawerSnapshot.ts` — person prefetch + coalesced fetch (warm snapshot cache). _(protected runtime infra)_
- `web/lib/admin/drawer/composedDrawerPayload/loadComposedPersonDrawerPayload.ts` — composed person payload fetch. _(protected runtime infra)_
- `web/lib/admin/opportunityDrawerPrimaryPrefetch.ts` — `fetchOpportunityDrawerPrimaryEntity` (`?surface=drawer_primary`).
- `web/lib/admin/opportunityDrawerFullPrefetch.ts` — `fetchOpportunityDrawerFullEntity` (`?surface=full`).
- `web/lib/admin/refreshOpportunityDrawerInquiryChildren.ts` — section refresh (`?surface=drawer_visible`).
- `web/lib/admin/refreshOpportunityDrawerAfterInquiryChildMutation.ts` — dev-only post-mutation audit read.
- `web/components/admin/JobRrsOverviewTab.tsx` — job resolver overview (`?surface=overview`); `_rrs` now read from `data.entity._rrs`. Error parsing also reads `error.message`.
- `web/components/admin/AdminEntityDrawerLegacy.tsx` — **mechanical envelope-read alignment only** at the 5 entity-GET fetch/hydrate sites (kill-switch rollback path; not a modernization). Composed person path already unwraps via the prefetch module.

> `opportunityDrawerIntentPrefetch.ts` is **prefetch-only** (warms the HTTP cache without
> parsing the body) and needs no unwrap. The `persons/{id}/related`, entity create-form,
> entity-label, and entity-layout routes are **separate** routes and are out of scope.
> `scripts/smoke/api_field_registry_smoke.ts` (dev tool) also unwraps `data.entity`.

## Legacy / sunset surfaces

We are moving away from the legacy drawer model. These surfaces are **not** API
normalization priorities unless still imported by active workspace runtime.

| Surface | Status | Action |
|---|---|---|
| `AdminEntityDrawerLegacy.tsx` | sunset candidate | Do not migrate unless active import path requires it |
| legacy drawer consumers | sunset candidate | Quarantine / document |
| old admin drawer flows | sunset candidate | Do not normalize ahead of active workspace APIs |

### `AdminEntityDrawerLegacy.tsx` — current reality

- **Default path:** not rendered. `AdminEntityDrawer.tsx` routes Opportunity → `EnrollmentSubjectSurfaceRuntime` and Person/Child → `PersonSubjectSurfaceRuntime` (VM runtimes). `opportunityDrawerHardCutoverEnabled()` is `true` by default, so opportunities never mount the legacy monolith on canonical workspace hosts.
- **Live only via rollback:** the legacy drawer (and its inline `actions/execute` call sites) mount **only** under the emergency kill switch (`FORCE_LEGACY_OPPORTUNITY_DRAWER` or `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH`). See `opportunityDrawerHardCutoverGate.ts` and `legacyDrawerVmEntityQuarantine.ts`.
- **Phase 2B handling:** because that rollback import path is still live, the legacy drawer's `actions/execute` reads received a **mechanical envelope-read alignment only** (`json.data?.execution_result`, `json.error?.message`, `json.error?.details?.*`). This is the minimum needed to keep the rollback path from breaking against the normalized route — **not** a modernization. No UX, structure, or behavior changes were made.
- **Phase 2D handling:** same principle for entity reads — the 5 entity-GET fetch/hydrate sites now unwrap `unwrapEntityRecord(...)` (→ `json.data.entity`) before `setData` / `putDrawerEntitySnapshot`. Mechanical alignment only; the rollback path keeps working against the normalized success envelope.
- **Going forward:** do **not** modernize this file. New action/drawer behavior belongs in the VM runtime. When the kill switch is retired, this file (and its inline execute call sites) should be deleted rather than maintained.

### How to classify a route as a sunset candidate

If a route is consumed **only** by legacy drawer / old `/admin` drawer code (no active
`/workspace`, work-unit, focus-panel, or VM-runtime importer), do **not** normalize it in
the current sprint — record it here as a sunset candidate instead.

_No execute-adjacent routes met that bar this sprint: `actions/execute` is consumed by
active workspace + VM-runtime surfaces, so it is correctly prioritized at tier 2._
