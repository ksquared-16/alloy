---
owner: platform
status: canonical
last_reviewed: 2026-07-18
supersedes: []
---

# Work Unit Configuration Runtime Constitution

**Status:** Canonical. This is the constitutional reference for all Work Unit surface work. Every
visible Work Unit region is a **configured Surface region** with **exactly one owner** per
responsibility. Future engineering must *extend* this model, never introduce a parallel owner.

---

## 1. Ownership doctrine

| Responsibility | Sole owner |
|---|---|
| Committed operational subject (Record of Attention) | **Runtime Focus** (K1→K2→K3 kernel) |
| Authored composition · variants · ordering · applicability · actions · editable fields | **Settings → Surfaces** (published `entity_layouts` / `action_placements`) |
| Which published variant applies in a context | **`resolveSurfaceVariant`** — the single applicability resolver |
| Record data · loading · caching · mutations · refresh · Settlement | **Record / Data Runtime** |
| Rendering the resolved composition | **Surface Runtime** (the region renderers) |

**Invariants**
1. No responsibility above may have a second owner. A migration that creates a second owner is invalid.
2. Legacy ownership is **deleted as part of the migration that supersedes it** — never left dormant.
3. Variant applicability is expressed **only** through `resolveSurfaceVariant`
   (`(businessProcessKey, workViewId, entityType, subjectType, surface) → published variant`), which is
   published-only and deterministic (Work View ≻ stage ≻ status; ties by version then layoutId).
4. Runtime provides **data**; Configuration provides **composition**. Runtime never authors presentation.

---

## 2. Region matrix

### Header  — **CUT OVER & CERTIFIED (P1)**
| Aspect | Owner |
|---|---|
| Configuration owner | Settings → Surfaces → `WorkUnitHeaderSurfaceEditor` → published `entity_layouts(work_unit_header)` |
| Resolver | `resolveSurfaceVariant` (via `resolveOperationalPresentation`, server-side, no HTTP) |
| Renderer | `WorkUnitHeader` → `WorkspaceHeader` (pure, from `model.header`) |
| Runtime owner | D1 provisioning (`resolveOperationalPresentation`) — geometry at first sight (U-P7) |
| Data owner | MetricEngine via the OIP warm cache (`prefetchOipMetricsWarm`) — KPI **values** (U-S5) |
| Mutation owner | n/a (read-only composition; authored in Settings → Surfaces) |
| Applicable variant | `(businessProcess, workView)` → published `work_unit_header` layout; org-global default when unscoped |
| Fallback | `DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG` (`headerSource: "builtin_default"`) |
| Performance boundary | KPI **geometry** in the commit; **values** settle after into reserved space; never reflow. One batched `metrics/resolve` per settlement cycle. |
| Certification | published-only · deterministic fallback · BP/Work-View precedence · order-independence · no-stale-after-movement · `metrics/resolve` deterministically 3→1 |

Deleted legacy owner: the `metric_placements` Work Unit Header path (`workUnitHeaderCards`,
`useWorkUnitHeaderSurfaceConfig`, `WorkUnitHeaderSurfaceBuilder`, the `work_unit_header` entries in
`headerSurfacePersistence`, and the non-existent `WorkUnitCommandSurface`). The `workspace_header`
metric_placements path is authoring-only (its builder is unmounted, its runtime strip retired) and is
explicitly **not** a Work Unit Header authority.

### Queue  — resolver + variants cut over (P2-A/B); certification in progress
| Aspect | Owner |
|---|---|
| Configuration owner | Settings → Surfaces → `QueueRowSurfaceEditor` → published `entity_layouts(surface="queue")` |
| Variant selection | **`resolveSurfaceVariant`** (queue-level, P2-A) + **`resolveQueueRowVariant`** (per-row, P2-B) — published-only, deterministic, Work-View aware. The former ad-hoc `filter+sort` is deleted. |
| Renderer | `CondensedQueueRow` (slots from the resolved variant, else queue-level default) |
| Runtime owner | D1 provisioning answer (rows at first sight, no reflow) |
| Data owner | provisioning page rows |
| Selected-row presentation | **Runtime-owned** (committed Focus) — layered onto the configured row; never overrides configured visibility/labels/columns |
| Fallback | queue-level default → canonical generic slots (`queueRowSource: "canonical_fallback"`) |

**Queue fallback ledger (P2-C — audit complete, no dead fallbacks):**
- `pipeline_queue_row` / `LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID` — **live & required**: the default queue-row surface for departments without a per-department lifecycle process (`queueRowSurfaceIdForDepartment` returns it). Owned by the same published `entity_layouts` + `resolveSurfaceVariant` path (no second resolver). *Sunset:* every department resolves a per-department surface id.
- `waitlist_queue_row` — live & required (waitlist default), same model.
- exact-key→pipeline fallback in `resolveQueueRowLayoutServer` — compatibility-only (orgs mid-migration). *Sunset:* all `queue_row_*` surfaces published.
- `mapQueueRowSurfaceToCompactConfig(null)` · builtin default envelopes — canonical (not legacy), the "never unavailable" guarantee.

**Queue request ownership (P2-E):**
- `work-unit-queue-summaries` — **deterministically 1** via `dedupeAdminFetch` (verified 1/1/1/1). One owner.
- `queue-view-totals` — one canonical fetcher `fetchQueueViewTotalsBatched` (scope-keyed in-flight dedup + 4s cache). The residual second request is a **distinct-scope consumer** (workspace surface vs work-unit settlement), not a duplicate of identical data; collapsing it would change Workspace behavior (out of P2 scope). One owner, two legitimate scopes.

### Focus Panel  — pending **P3** (subject ownership already cut over)
| Aspect | Owner |
|---|---|
| Configuration owner | Settings → Surfaces → `FocusPanelSummarySurfaceEditor` → published `entity_layouts(focus_panel_summary)` |
| Resolver | `usePublishedFocusPanelSummaryDoc` → **to be repointed to `resolveSurfaceVariant` (P3)** |
| Renderer | `FocusPanelCardGrid` (registered cards chosen + ordered by config) |
| Runtime owner | `useRecordWorkRuntime(committedSubjectId)` — subject from Runtime Focus (sole owner) |
| Data owner | record VM (`loadOpportunityDrawerViaViewModel`) + Settlement |
| Mutation owner | `drawerOperatingSaveCoordinator` → `PATCH /api/admin/opportunities/{id}` |
| Applicable variant | summary mode published today; P3 brings work/activity modes under the published variant |
| Fallback | `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` |
| Performance boundary | atomic visible swap on **commit-critical** coherence; deferred Settlement fills after; no mixed-subject frame |

Person / Child / Household / Enrollment are **entity contexts rendered as configured cards inside the
Opportunity Focus Panel**, bound to the committed subject graph — **not** separate subjects or hosts.
Opportunity is the only committed operational subject.

### Actions  — configuration-driven today
Config owner: `action_placements` + `action_definitions` (Settings → Surfaces). Resolver:
`resolveActionsForContext({surface:"record_header"})`. Runtime: `applyRegistryResolvedActionClient`
(executes registry-resolved actions only; never defines the menu).

### Editing  — pending **P4** (partial today)
Config owner: published `LayoutDoc` `editable` flags + field policy (layout-runtime path). Data/Mutation
owner: `PATCH /api/admin/opportunities/{id}` + the headless `drawerOperatingSaveCoordinator`
(atomic Save-All, in-place patch-event refresh). P4 delta: drive inline Focus Panel card editability
from configuration (retire hard-coded `editable:` flags), wire/retire `fieldEditabilityInDrawer`.

---

## 3. Legacy Ownership Elimination Doctrine

- A configured region has **one** configuration owner, **one** resolver, **one** renderer, **one**
  runtime/data owner. Any code that resolves, composes, or renders that region through a different
  authority is legacy and is deleted in the same migration.
- "Retired at runtime but retained for authoring" is a **deferred-deletion ledger** entry, never an
  ambiguous second owner. It must state: exact files/symbols, proof it is not runtime-consumed, why it
  remains, the follow-up owner, and that it is not an authority for the migrated region.
- The drawer (`AdminDrawerContext`, drawer host, drawer followers, drawer URL state) is **not** an
  authority for any Work Unit region. Its remaining consumers are removed per the runtime cutover.

---

## 4. Certification requirements (every region cutover)

1. One owner — repository search proves no second resolver/renderer/owner remains.
2. Former owner deleted (files/symbols), stale tests/comments/docs removed.
3. Published-only, deterministic fallback, BP/Work-View applicability, order-independence, no-stale.
4. Browser evidence: Settings → Surfaces variant · Work Unit rendering it · applicability · fallback.
5. Production-like performance comparison vs baseline — no material regression; request/duplicate/payload accounted.
6. Constitutional audit entry (current owner, deleted owner, files, repo-search proof, docs, perf, evidence).

---

## Related
- `resolveSurfaceVariant` — `web/lib/layout/resolveSurfaceVariant.ts` (the sole applicability resolver).
- `docs/platform/operator/focus-panel-architecture-vocabulary.md` — operator vocabulary.
- `docs/platform/runtime/alloy-runtime-kernel.md` — K1–K3 (frozen; subject ownership).
