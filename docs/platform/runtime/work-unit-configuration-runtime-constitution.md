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

### Queue  — **CUT OVER & CERTIFIED (P2)**
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

The acceptance criterion is **one owner**, not one HTTP request. A request is a **duplicate** — and must
deduplicate — only when it carries the **same responsibility and the same target set** as another. Two
requests that carry **different target sets representing different responsibilities are independent
scopes**, not duplicates, and must NOT be artificially collapsed (collapsing them would delete a
legitimate responsibility). The ledger therefore classifies each request as *duplicate* (→ dedupe to 1)
or *independent scope* (→ one owner, N legitimate requests).

| Request | Owner | Classification | Requests |
|---|---|---|---|
| `work-unit-queue-summaries` | `dedupeAdminFetch` | **duplicate** (identical responsibility+targets) → deduped | deterministically **1** (verified 1/1/1/1) |
| `queue-view-totals` | `fetchQueueViewTotalsBatched` (scope-keyed in-flight dedup + 4 s cache) | **independent scope** — Workspace totals (all views) vs Work-Unit totals (this unit): different target sets, different responsibilities | **1 per scope** (deduped *within* each scope) |

`queue-view-totals` is a single owner serving two legitimate scopes. Forcing it to one HTTP request would
stop the Workspace surface fetching its own totals when a Work Unit is active — deleting a distinct
responsibility and changing Workspace behavior. That is out of scope and is not a dedup defect.

**P2 constitutional audit (P2-I):**
- **Current owner** — queue-level applicability: `resolveSurfaceVariant` (via `resolveQueueRowLayoutServer`, server-side, no HTTP). Per-row: `resolveQueueRowVariant`. Renderer: `CondensedQueueRow`. Runtime/data: the D1 provisioning answer.
- **Deleted owner** — the ad-hoc queue-row `filter+sort` applicability selection (replaced by `resolveSurfaceVariant`) and the legacy queue-row→`openDrawer` follower (a second subject owner that produced 4418/4421 duplicate requests; deleted in `useCommittedWorkUnitSurfaceRuntime`). The drawer is not a queue authority.
- **Files** — `lib/layout/runtime/queueRowLayoutServer.ts` (repoint), `lib/presentation/runtime/resolveQueueRowVariant.ts` + `queueRowVariantResolve.ts` (per-row), `lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts` (P2-B wiring), `lib/runtime/provisioning/operationalPresentation.ts` + `workUnitProvisioningAnswer.ts` (threading BP/Work-View).
- **Repo-search proof** — one applicability resolver (`resolveSurfaceVariant`) + one per-row resolver (`resolveQueueRowVariant`); `listOrgLayouts` is the candidate *data read*, not a competing selector; no surviving drawer follower for queue rows.
- **Docs** — this region entry + the fallback ledger + the request-ownership ledger.
- **Performance (P2-G, warm, slot 3, production-like)** — pre-P2 vs post-P2 p50: ack 13→13 ms, legible 14→14 ms, commit 4781→4749 ms (−32 ms, within noise). Critical-path provisioning **1 request / 0 duplicates** in both (20 post + 8 pre samples), 100% operational, 0 continuity breaks. Behavior-neutral: **no regression**.
- **Browser evidence (P2-H)** — `playwright/tests/p2-queue-cert.spec.ts`: WU.QUEUE + rows render via the Presentation Runtime; selected-row Runtime-owned (`data-queue-row-active`, 1 active); Work View change re-resolves (`new_leads → new_work_view_2`); **0 drawer hosts inside WU.SURFACE**; Settings → Surfaces Queue Rows section is the config owner. 5 screenshots captured.
- **Not live-captured, certified by unit suite instead** — authored per-row variant override and the empty-queue terminal (this tenant authors no queue variants and every view has rows; per the constraint, no uncontrolled tenant config was mutated to manufacture them). Covered by `queueRowVariantApplicability.test.ts` (7) + the authoritative-empty model path.

> **VERDICT — WORK UNIT QUEUE CONFIGURATION RUNTIME · CUT OVER · CERTIFIED · DOCUMENTED · LEGACY QUEUE OWNERSHIP DELETED.**
> One owner per responsibility (applicability, per-row variant, rendering, runtime/data); the ad-hoc
> selector and the drawer follower are deleted; docs, performance (no regression), and browser evidence
> are recorded. Request ownership is single-owner with duplicates deduped and independent scopes preserved.

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
5. Production-like performance comparison vs baseline — no material regression. Every request accounted
   for and classified **duplicate** (must dedupe to 1) vs **independent scope** (one owner, N legitimate
   requests with different target sets). The bar is **one owner per responsibility**, not one HTTP request;
   distinct responsibilities are never artificially collapsed.
6. Constitutional audit entry (current owner, deleted owner, files, repo-search proof, docs, perf, evidence).

---

## Related
- `resolveSurfaceVariant` — `web/lib/layout/resolveSurfaceVariant.ts` (the sole applicability resolver).
- `docs/platform/operator/focus-panel-architecture-vocabulary.md` — operator vocabulary.
- `docs/platform/runtime/alloy-runtime-kernel.md` — K1–K3 (frozen; subject ownership).
