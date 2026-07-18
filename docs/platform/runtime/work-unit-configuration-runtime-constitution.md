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

**P2-V — config-consumption verification (Product concern resolved):**
A Product review asked whether the rendered queue rows actually come from the published Queue Row Surface.
Ground truth from the D1 answer: `provenance.queueRowSource="published"`, `queuePublished=true`,
`fallbackSlots=[]`, with operator-authored slot labels (`subject`→"Household name", `status`→"Stage") that
the hard-coded fallback never produces — **config is authoritative**. The apparent "mismatch" was an
**observability gap**: `workUnitSurfaceModelFromSnapshot` dropped the provenance, so the resolved
surface/source/variant were invisible in the DOM. Fixed by threading provenance to the model and emitting
`data-queue-row-source` / `data-queue-surface-id` / `data-queue-row-resolved-source` / `data-queue-row-variant`
on `QueueRegion`. The New Leads queue now renders `data-queue-row-source="published"`,
`data-queue-surface-id="queue-row-{dept}-{proc}"`, `data-queue-row-variant="crm_compact"` — **the queue proves
its own source in the browser** (`p2v-final-cert.spec.ts`).
- **Compact anatomy is by design.** The published surface's rich builder canvas is mapped onto the fixed
  compact 6-slot `CondensedQueueRow` (`mapQueueRowSurfaceToCompactConfig`) — config drives slot visibility,
  labels, and field→slot assignment (via `builderSlot` canvas region); the 4-line card structure is a
  reusable component implementation. Only field keys in `COMPACT_ROW_EFFECTIVE_FIELD_KEYS` are runtime-effective.
- **Faithful even to config redundancy.** The New Leads contact line renders the phone twice
  (`… 9652 · … 9652`) because the published surface's contact slot carries a redundant field — proof-positive
  the render mirrors config. Fix belongs to the operator in the builder (de-dupe the field); no tenant config
  was mutated here.

> **VERDICT — WORK UNIT QUEUE CONFIGURATION RUNTIME · CUT OVER · CERTIFIED · DOCUMENTED · LEGACY QUEUE OWNERSHIP DELETED · CONFIG CONSUMPTION BROWSER-PROVABLE.**
> One owner per responsibility (applicability, per-row variant, rendering, runtime/data); the ad-hoc
> selector and the drawer follower are deleted; docs, performance (no regression), and browser evidence
> are recorded. Request ownership is single-owner with duplicates deduped and independent scopes preserved.
> The rendered queue is driven by the published Queue Row Surface and now declares its resolved
> surface/source/variant in the DOM.

### Focus Panel  — **CUT OVER & CERTIFIED (P3)**
| Aspect | Owner |
|---|---|
| Configuration owner | Settings → Surfaces → `FocusPanelSummarySurfaceEditor` → published `entity_layouts(focus_panel_summary)` |
| Variant selection | **`resolveSurfaceVariant`** (via `resolvePublishedFocusPanelSummaryRecord` in the focus-panel-summary endpoint, P3-A) — published-only, deterministic, Business-Process / Work-View aware. The former ad-hoc `highestVersion(published)` org-global pick is deleted (it survives only for the editor's *draft*). |
| Applicability context | committed **Work View + stage** threaded from `OperationalSubjectContext` via `FocusPanelSummaryDocProvider` (P3-B); resolved once, shared by the grid, the pending skeleton, and the nested cards |
| Renderer | `OpportunityFocusPanelModeGrid` / `FocusPanelCardGrid` (registered cards chosen + ordered by the resolved doc) |
| Runtime owner | `useRecordWorkRuntime(committedSubjectId)` — subject from Runtime Focus (sole owner) |
| Data owner | record VM (`loadOpportunityDrawerViaViewModel`) + Settlement |
| Mutation owner | `drawerOperatingSaveCoordinator` → `PATCH /api/admin/opportunities/{id}` |
| Fallback | `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` (code-built default when no published doc applies) |
| Performance boundary | doc resolution is **post-commit Settlement** (off the critical path); atomic visible swap on commit-critical coherence; deferred Settlement fills after; no mixed-subject frame |

Person / Child / Household / Enrollment / Current Work / Activity are **entity contexts rendered as
configured cards inside the Opportunity Focus Panel**, bound to the committed subject graph — **not**
separate subjects or hosts. Opportunity is the only committed operational subject.

**Focus Panel fallback ledger (P3-C — audit complete, no dead fallbacks):**
- `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` — **live & required** canonical default (code-built); the "never unavailable" guarantee when no published doc applies. Consumed by the grid + pending skeleton + editor seed. Not legacy.
- `highestVersion(draft)` in the endpoint — **authoring-only**: selects the editor's continue-editing draft, never a runtime variant (drafts never resolve at runtime; `resolveSurfaceVariant` is published-only). Not a second runtime resolver.
- Work / Activity modes render via the derived grid (`deriveOpportunityFocusPanelPresentation`), not the published summary surface — runtime-derived render modes, not a competing config resolver. *Forward:* bring these under the published variant.

**Focus Panel request ownership (P3-E):**
| Request | Owner | Classification | Requests |
|---|---|---|---|
| `focus-panel-summary` | `FocusPanelSummaryDocProvider` (per-scope module cache) | **independent scope** — one resolution per committed `(workView, stage)`; deduped within scope, shared by all consumers | **1 per committed scope** (verified: 1 on commit, 1 on Work-View change) |

Same doctrine as the Queue (P2-E): the second request on a Work-View change is a **distinct applicability
scope**, not a duplicate; the provider serves one shared resolution per scope, never one fetch per consumer.

**P3 constitutional audit (P3-I):**
- **Current owner** — applicability: `resolveSurfaceVariant` (via `resolvePublishedFocusPanelSummaryRecord`, server-side in the endpoint). Context: `FocusPanelSummaryDocProvider` (committed Work-View + stage). Renderer: `OpportunityFocusPanelModeGrid`. Runtime/data: `useRecordWorkRuntime` + Settlement.
- **Deleted owner** — the endpoint's ad-hoc `highestVersion(published)` org-global selection (replaced by `resolveSurfaceVariant`); the org-global context-free fetch (replaced by the per-scope provider). The drawer is not a Focus Panel authority (the record renders inline; `recordDrawerHostCount === 0`).
- **Files** — `app/api/admin/entity-layouts/focus-panel-summary/route.ts` (repoint), `lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryVariant.ts` (selector), `lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc.ts` (provider + per-scope cache), `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` (provider mount).
- **Repo-search proof** — one applicability resolver (`resolveSurfaceVariant`); no competing published-doc selection (`highestVersion` serves only the draft); `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` is the canonical default, not a second resolver.
- **Docs** — this region entry + the fallback ledger + the request-ownership ledger.
- **Performance (P3-G, warm, slot 3)** — post-P2 vs post-P3 p50: ack 13→13 ms, legible 14→14 ms, commit 4749→4658 ms (−91 ms, within noise). Critical-path provisioning **1 request / 0 duplicates** both; 14/14 operational, 0 continuity breaks. Doc resolution is post-commit Settlement, off the critical path — **no regression**.
- **Browser evidence (P3-H)** — `playwright/tests/p3-focuspanel-cert.spec.ts`: Focus Panel resolves on subject commit; **0 drawer/modal hosts render the record**; the focus-panel-summary request carries the committed `workViewId`+`stageKey`; a Work-View change (`new_leads → new_work_view_2`) triggers exactly one fresh scoped re-resolution; card content settles (4 cards, real content, 0 skeleton pulses).
- **Applicability certified by unit suite** — `focusPanelVariantApplicability.test.ts` (8): behavior-neutrality, published-only, deterministic tie-break, Work-View scope, Business-Process gating, order-independence, no-stale after movement.

> **VERDICT — WORK UNIT FOCUS PANEL CONFIGURATION RUNTIME · CUT OVER · CERTIFIED · DOCUMENTED · LEGACY FOCUS PANEL OWNERSHIP DELETED.**
> One owner per responsibility (applicability `resolveSurfaceVariant`, context provider, rendering,
> runtime/data); the ad-hoc `highestVersion` selector and the context-free org-global fetch are deleted;
> Opportunity remains the sole committed subject and Person/Child/Household/Enrollment/Work/Activity remain
> configured cards; docs, performance (no regression), and browser evidence are recorded. Request ownership
> is single-owner with independent applicability scopes preserved.

### Actions  — **CONFIGURATION-DRIVEN & AUDITED (P4)**
| Aspect | Owner |
|---|---|
| Configuration owner | `action_placements` + `action_definitions` (Settings → Surfaces) |
| Resolver | `resolveActionsForContext({surface:"record_header" \| "record_section"})` — reads placements+definitions from the DB; no hard-coded menus |
| Renderer | header/Manage menu ← `displayVm.actions.header_menu` (built from the resolved config bundle); Current Work card actions ← `record_header` slots + published work-template `action_ref`s |
| Runtime (execution) | `applyRegistryResolvedActionClient` — **executes registry-resolved actions only, never defines the menu** |

P4 audit: the header/Manage/Current-Work action surfaces are **fully config-driven** from `action_placements`.
Two card-local exceptions hard-code buttons through injected `mutation` seams rather than `action_placements`:
`TourCard` (Schedule/Reschedule/Cancel/Confirm) and `CommunicationsCard` (cancel-scheduled-send). These are
**domain mutation affordances** tied to a specific card's transaction seam (not a generic action menu) —
classified reusable-component chrome with a documented *forward* path to `action_placements` if generalized.
`demoFocusPanelSummaryViewModel`'s literal `header_menu` is a fixture, not the runtime path.

### Editing  — **CONFIGURATION-DRIVEN & AUDITED (P4)**
| Aspect | Owner |
|---|---|
| Editability **policy** (which fields editable) | **published `NestedSurfaceConfig`** via `resolveIdentityFieldPolicy` → `editable \| read-only \| hidden` (config; authored in `FocusPanelCardInspector`) |
| Permission gate | `canMutate` / `statusCanMutate` — **auth/role** (`hasPortalAdminMutateAccess` / server `status_can_mutate`). Correctly a permission decision, **not** a presentation-config decision. |
| Persistence capability | per-ref save binding (`identityFieldMutationBinding`) — a **runtime capability**: a field with no mutation path cannot be saved regardless of config. |
| Card lifecycle capability | `focusPanelCardLifecycle` capability manifest (`supportsInlineEdit`, `editableEvidenceGroups`, …) — a **reusable component-implementation contract** declaring which modes each card component implements; the tenant *policy* of what is editable is the config layer above. Not a hard-coded tenant policy. |
| Data / Mutation owner | `PATCH /api/admin/opportunities/{id}` + headless `drawerOperatingSaveCoordinator` (atomic Save-All, ordered parallel section save, rollback, in-place patch-event refresh) — **runtime-owned mutation mechanics**. |
| Validation **rules** | config-driven field required/read-only policy (`fieldRequirementPolicy`), **server-enforced** at PATCH (`enforceDrawerFieldPoliciesOnPatch`). |
| Observability | fields emit `data-identity-policy` (config decision) + `data-identity-editable` (final state after auth+save gates) — "why is this editable?" is **browser-provable**. |

Deleted legacy owner (P4-A): the `fieldEditabilityInDrawer` chrome builders
(`buildDrawerFieldPolicyChromeFromEntityData` and helpers) — zero production callers; the inline Focus Panel
owns editability through the published field policy, not drawer chrome. The mature `interaction_policy` /
LayoutDoc-`editable` engines remain, but they are the **drawer/modal/layout-runtime** surfaces' owners, not
the inline Focus Panel's — the inline panel's single editability policy owner is `resolveIdentityFieldPolicy`
over published `NestedSurfaceConfig`.

*Known presentation gap (documented, not yet closed):* required/validation **presentation** in the Focus
Panel is thin — the rules are published config and server-enforced, but the operator sees a generic post-save
error rather than a pre-save required marker driven by config. Config-driven validation *presentation* is the
one remaining Editing enhancement; it does not affect ownership (rules are already config-owned + enforced).

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

## 5. Final Constitutional Audit — Work Unit Configuration Runtime

Every visible Work Unit region is a configured Surface region with exactly one owner per responsibility;
mutation is Runtime-owned; legacy ownership is deleted.

| Region | Configuration owner | Resolver | Renderer | Runtime owner | Mutation owner | Deleted legacy owner |
|---|---|---|---|---|---|---|
| **Header** | Settings→Surfaces `work_unit_header` | `resolveSurfaceVariant` (server, no HTTP) | `WorkUnitHeader`→`WorkspaceHeader` | D1 `resolveOperationalPresentation` | n/a (read-only) | `metric_placements` WU-header path (`workUnitHeaderCards`, `useWorkUnitHeaderSurfaceConfig`, `WorkUnitHeaderSurfaceBuilder`, `WorkUnitHeaderCalculations`) |
| **Queue** | Settings→Surfaces `queue`/`queue_row_*` | `resolveSurfaceVariant` + `resolveQueueRowVariant` | `CondensedQueueRow` | D1 provisioning answer | n/a (read-only) | ad-hoc `filter+sort` selector; queue-row→`openDrawer` follower |
| **Focus Panel** | Settings→Surfaces `focus_panel_summary` | `resolveSurfaceVariant` (via `resolvePublishedFocusPanelSummaryRecord`) | `OpportunityFocusPanelModeGrid` | `useRecordWorkRuntime` (Focus subject) | `drawerOperatingSaveCoordinator`→PATCH | ad-hoc `highestVersion` pick; context-free org-global fetch |
| **Editing** | published `NestedSurfaceConfig` (`resolveIdentityFieldPolicy`) | field policy + auth gate + save binding | Identity/Household/Children card fields | `useEditableCardRuntime` | `drawerOperatingSaveCoordinator`→PATCH; field-policy enforced server-side | `fieldEditabilityInDrawer` chrome builders (dead) |
| **Actions** | `action_placements`+`action_definitions` | `resolveActionsForContext` | `displayVm.actions.header_menu` / Current Work | `applyRegistryResolvedActionClient` (execute-only) | action registry `/api/admin/actions/execute` | n/a (already config-driven) |

**Deleted files / symbols:** `workUnitHeaderCards.ts`, `useWorkUnitHeaderSurfaceConfig.ts`,
`WorkUnitHeaderCalculations.tsx`, `WorkUnitHeaderSurfaceBuilder`, `workUnitHeaderSurfaceDefinition`,
`WORK_UNIT_HEADER_TEMPLATE` (P1); queue-row `openDrawer` follower + ad-hoc queue selector (P2);
Focus Panel `highestVersion` runtime pick + org-global fetch (P3); `fieldEditabilityInDrawer`
builders + test (P4). The drawer (`AdminDrawerContext`, host, followers) is not an authority for any region.

**Tests:** `resolveSurfaceVariant.test.ts` (11), `headerVariantApplicability.test.ts` (6),
`queueRowVariantApplicability.test.ts` (7), `focusPanelVariantApplicability.test.ts` (8),
`oipWarmCacheDedup.test.ts` (6) — all green; project `tsc` 0 errors.

**Performance (warm, slot 3, production-like p50):** ack 13 ms, legible 14 ms, commit ~4.6–4.8 s;
critical-path provisioning **1 request / 0 duplicates**; 0 continuity breaks. No regression across P1→P4
(each phase measured pre/post; deltas within noise). Region resolution is server-side pure or post-commit
Settlement — off the commit critical path.

**Browser evidence:** `p2-queue-cert.spec.ts`, `p2v-final-cert.spec.ts` (queue: `data-queue-row-source="published"`,
`data-queue-surface-id`, `data-queue-row-variant`), `p3-focuspanel-cert.spec.ts` (Focus Panel resolves,
`workViewId`+`stageKey` threaded, 0 drawer/modal hosts render the record), identity fields emit
`data-identity-policy` + `data-identity-editable`.

**Single-owner proof:** each region has exactly one applicability resolver (`resolveSurfaceVariant`, or its
per-row/record wrappers), one renderer, one runtime/data owner, one mutation owner. Repository search confirms
no second resolver/renderer/owner survives per region (see each region's audit block above).

**Final perf (warm, slot 3, final HEAD, p50/p95):** ack 14/16 ms, legible 15/17 ms, commit 4712/5684 ms —
within run-to-run warm variance across P1→P4 (commit p50 bounced 4658–4749 ms); critical-path provisioning
**1 request / 0 duplicates**; 12/12 operational; 0 continuity breaks. No material regression.

> **VERDICT — WORK UNIT CONFIGURATION RUNTIME · COMPLETE.**
> Every visible Work Unit region — Header, Queue, Focus Panel, Editing, Actions — is driven by published
> configuration through the single applicability resolver `resolveSurfaceVariant` (or its per-row/record
> wrappers) and the published field/action policy; every mutation is Runtime-owned (`drawerOperatingSaveCoordinator`
> → PATCH, action registry); every responsibility has exactly one owner; legacy ownership (the metric-placements
> header path, the ad-hoc queue selector + drawer follower, the Focus Panel `highestVersion` pick + org-global
> fetch, the dead `fieldEditabilityInDrawer` builders) is deleted; documentation matches reality; performance is
> measured with no regression; and browser evidence proves config consumption (queue source, Focus Panel
> resolution, editability policy) in the DOM. Remaining enhancement, not an ownership gap: config-driven
> validation *presentation* (rules are already config-owned + server-enforced).

## Related
- `resolveSurfaceVariant` — `web/lib/layout/resolveSurfaceVariant.ts` (the sole applicability resolver).
- `docs/platform/operator/focus-panel-architecture-vocabulary.md` — operator vocabulary.
- `docs/platform/runtime/alloy-runtime-kernel.md` — K1–K3 (frozen; subject ownership).
