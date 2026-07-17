---
owner: sprint
status: completed
last_reviewed: 2026-07-17
concept: configuration-publication-runtime-v1
supersedes: []
---

# Configuration Publication Runtime V1 — Closeout & Certification

**Branch:** `agent/cursor/2-configuration-publication-distribution-v1`  
**Worktree:** `wt2-configuration-publication-distribution-v1`  
**Tip:** `e85ee94f5` (assignment doctrine correction)  
**Verdict:** Ready for promotion authorization (local only; no push/PR/deploy performed) after the Organization routing correction.

Earlier certification that treated `/settings/commercial/programs` as acceptable
canonical product IA is **rejected**. Programs must live at
`/organization/programs`.

## Certification verdict

**Ready for promotion** after Kelly authorizes push/PR, provided
`/organization/programs` is the only Programs page owner and legacy Commercial
entry points redirect. The publication/assignment architecture remains accepted
and is not reopened.

Operator surface URL: `/organization/programs` (selection: `?programId=`).
Compatibility: `/settings/commercial/programs` → redirect.
## 1. Generic substrate vs Programs adapters

### Platform-generic (`web/lib/configPublication/`)

| Element | Role |
|---|---|
| `types.ts` | Publication record, revision identity, delivery plan, impact preview, field policy, effective-source types, domain adapter interface |
| `deliveryPlan.ts` | Deterministic target normalization, target-set checksum, idempotency key |
| `effectiveResolution.ts` | Server-authoritative field resolution with explicit presence |

### Platform-generic (schema control plane)

| Element | Role |
|---|---|
| `configuration_publications` | Immutable publication envelope over a domain revision |
| `configuration_distribution_runs` | Deterministic run identity |
| `configuration_distribution_targets` | Per-location delivery state |
| `configuration_delivery_attempts` | Append-only attempt history |
| `configuration_consumptions` | Location → published revision pointer |
| `record_configuration_delivery_failure_v1` | Generic failure recording |
| `finalize_configuration_distribution_run_v1` | Generic run completion / partial_failure |

### Programs-specific (`web/lib/programs/publication/`, migration domain tables, API, UI)

| Element | Role |
|---|---|
| `programs`, `program_drafts`, `program_revisions` | Domain system of record |
| `programPublicationModel.ts` | Payload shape, checksum, validation, field policies |
| `programPublicationAdapter.ts` | Preview impacts for Programs |
| `programPublicationService.ts` | Draft/publish/assign/retry orchestration |
| `assign_program_publication_target_v1` | Programs assignment write that preserves local offer truth |
| `/api/admin/configuration/programs` | Authorized Programs publication API |
| `ProgramsPublicationWorkspace.tsx` | Organization Programs Configuration Collection |

**Leak check:** `web/lib/configPublication/` contains no Programs identifiers, no Apply vocabulary, and no Location-offering mutation logic. The generic registry owner is Organization Configuration Runtime (`organizationRuntime.ts`); the V1 consumer is Programs (`distributionMode: "assignment"`).

## 2. Revision integrity

- Drafts are editable via `program_drafts` (`update_draft`); editing a validated draft returns it to `draft`.
- `program_revisions`, `configuration_publications`, and `configuration_delivery_attempts` are immutable via `BEFORE UPDATE OR DELETE` triggers.
- Publish snapshots a validated draft into a new revision + publication (`publish_program_revision_v1`); it never mutates an existing revision payload.
- Location assignments store explicit `program_revision_id` and `configuration_consumption_id` on `location_program_categories`.

## 3. Assignment and delivery

- Programs registry: `distributionMode: "assignment"`; no `applyProviderKey`.
- Operator UI: “Assign to Locations”, “Confirm assignment”, delivery statuses `delivered` / `unchanged` / `failed`.
- Plan identity is org + domain + publication + provider version + sorted target-set checksum.
- Retry loads only `failed` targets under the same run; successful targets are not re-executed incorrectly.
- Partial failure is a first-class run status with per-location reasons.

## 4. Ownership preservation

Assignment upserts organization-owned label/revision links only. `ON CONFLICT` does **not** set `is_active` or `metadata`. New rows start `is_active = false` so offering remains Location-owned. Capacity, staffing, rooms, schedules, placements, attendance, and billing are outside publication ownership. Effective values resolve through field policy: published revision + permitted overrides only.

## 5. Product experience

- Visual language reuses Configuration Runtime primitives (`ConfigurationPrimaryButton`, `ConfigurationQueueItem`, `ConfigObjectHeader`, `ConfigConsequenceLine`).
- Page reads as Organization-owned publishable Programs, not a Commercial utility grid.
- Compatibility URL still contains `commercial`; operator chrome does not.
- Browser evidence (authenticated, API-intercepted journey for UI/control proof):

| State | Artifact |
|---|---|
| Programs landing | `~/.local/state/alloy-dev/evidence/wt2-configuration-publication-distribution-v1/screenshots/01-programs-landing.png` |
| Draft detail | `02-program-detail-draft.png` |
| Published revision | `03-published-revision.png` |
| Assignment selection | `04-location-assignment-selection.png` |
| Impact preview | `05-impact-preview.png` |
| Partial failure | `06-partial-failure.png` |
| Retry success | `07-retry-success.png` |
| History/audit | `08-history-audit.png` |

**Cold-load flake:** An earlier Playwright attempt against a freshly started
localhost timed out waiting for `programs-publication-runtime` (5s) while the
page was still compiling/auth hydrating; the immediate retry passed. That
single cold-load timeout was not reproducible on the certification run, which
passed on the first attempt in 14.5s with a 60s root-surface wait. Classified
as a non-reproducible cold-load flake, not a product defect.

## 6. Terminology

Operator-facing: Programs, Publish, revision, Assign, delivery, retry. “Apply” is absent from Programs publication/distribution semantics. Legacy Commercial remains only in compatibility route paths and internal Commercial module surfaces outside this sprint’s operator chrome.

## 7. Validation results

Recorded at closeout:

| Gate | Result |
|---|---|
| Focused publication/Programs Vitest | 20/20 passed |
| ESLint (changed publication surfaces) | passed |
| Production typecheck | passed |
| Test typecheck | passed |
| Production build | passed |
| Route verify `/organization/programs` | PASS (certification re-run) |
| Legacy redirect `/settings/commercial/programs` | PASS → `/organization/programs` |
| Authenticated browser journey | PASS first attempt (14.5s); earlier cold-load flake documented |
| Migration replay + schema export | passed (local isolated DB; earlier in sprint) |
| `docs:lint` | completed; report is pre-existing repo baseline (not introduced by this sprint) |

## 8. Documentation owners updated

- `docs/platform/modules/configuration-platform.md` — Publication Runtime V1 + assignment
- `docs/platform/modules/commercial-configuration.md` — Programs publication backend
- `docs/system/organization-configuration-runtime-v2.md` — assignment adapter
- `docs/platform/core/configuration-ownership-and-inheritance.md` — publication axis
- `docs/platform/operator/configuration-workspace-platform-doctrine.md` — save vs publish
- `docs/platform/foundation/platform-decisions.md` — assignment, not Apply
- Generated schema docs regenerated from migration replay

No parallel doctrine files were introduced as peer runtimes.

## 9. Intentionally deferred

- `/organization/locations` convergence (today: `/settings/locations` frozen surface)
- `/organization/processes` convergence (today: `/settings/processes`)
- Live DB-backed browser certification against deployed migration
- Publication for Data Model, Fields, Statuses, Surfaces, Actions, Operational Calculations, Access, Communications, Automation
- Scheduled / future-dated activation
- Approvals, branching, rollback engine
- Cross-domain publication
- AI publication
- Compatibility storage deletion / full Programs identity migration off vocabulary fallbacks
- Downstream scheduling, attendance, staffing, capacity, billing, funding runtimes
- Broad Configuration-page redesign
- Broad Locations/Processes redesign (routing convergence only when separately authorized)

### Locations and Processes route reconciliation

| Domain | Current operator URL | Status | Smallest safe convergence |
|---|---|---|---|
| Locations | `/settings/locations` (`?locationId=` selection) | Frozen Locations Configuration Runtime; rewrite to `adminV2/settings/locations` | Add `/organization/locations` rewrite + redirect from `/settings/locations` in a dedicated routing sprint; do not reopen Locations UI |
| Processes | `/settings/processes` | Active Business Processes surface under Settings namespace | Add `/organization/processes` rewrite + redirect from `/settings/processes` once nav copy and breadcrumbs are audited; no process redesign |

Redirects for Locations/Processes were **not** established in this sprint to avoid breaking frozen Locations bookmarks and Process IA without a dedicated pass. Doctrine now records the intended hierarchy so route ownership is not contradictory.

## 10. Known limitations

1. Browser journey proves operator controls with intercepted publication API responses because remote migration deploy is out of scope.
2. Worktree may be behind `origin/staging` at certification; rebase/sync before promotion.
3. Organization landing still declares Programs publication mode statically; live Draft/Published evidence is authoritative on the Programs workspace, not yet projected as dynamic Organization card health.
4. `/organization/locations` and `/organization/processes` are documented but not yet implemented as canonical URLs.

## Recommendation

**Ready for promotion** after Kelly authorizes sync/rebase against current
`origin/staging`, push, and PR — only if `/organization/programs` remains the
canonical Programs route and legacy Commercial Programs URLs redirect. Do not
deploy until the migration is applied in the target environment and a live
(non-intercepted) assignment journey is re-certified.