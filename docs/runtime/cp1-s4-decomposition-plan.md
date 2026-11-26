# CP-1 / S4 — Enriched Drawer VM Decomposition Plan (implementation-ready)

> Companion to `RUNTIME-V1-CERTIFICATION-SPRINT.md` (D-013). This is the **precise, line-ranged**
> extraction plan for S4 — the behavior-preserving decomposition of the monolithic opportunity enriched
> drawer VM composition into three owned modules with a REAL import boundary. Implement directly from this.
> **Guardrail:** behavior-identical (same VM output, same route/client signatures, same `phases_ms` keys).
> Do NOT merely split the file into pieces that still import each other — the A↛B boundary is the point.

**Target modules** (new files under `web/lib/adminV2/viewModel/drawer/opportunity/`):
- **A `initialPanelResource.ts`** — Tier-2 only (visible Summary panel enrichment). **MUST import no Tier-3.**
- **B `deferredDetailResource.ts`** — Tier-3 only (deep/deferred).
- **C `sharedCanonicalDeps.ts`** — data both A and B need, kept NARROW (no dumping ground).
- Contracts in `drawerVmComposition.types.ts` (reuse sub-types from `drawer/types.ts`).
- `composeOpportunityDrawerViewModel.ts` → thin **orchestrator**.

## 1. Phase → tier → module (lines in `composeOpportunityDrawerViewModel.ts` unless noted)

| Phase | Lines | Tier | VM field(s) | Module |
|---|---|---|---|---|
| opportunity_select (oppRow + not-found guard) | 149-167 | 1 | `entity` | **C** |
| record_layout (layout + work_units + guard) | 169-198 | 1 | `layout.*`, generation | **C** |
| visible_entity (visible payload + sub-phases + dept/queue) | 201-234 | 1 | `above_fold.record`, header title, `workspace.department_id` | **C** |
| household_persons attach + status_and_dept (deptMetadata+statusDefs batch) | 236-250 | 1/2 | household + status inputs | **C** |
| readiness (memo + evaluate) | 256-265 | 2 | feeds attention | **A** |
| shell compile + firstViewportPlan | 267-289 | 1 | `layout.shell/tabs` | **C** (plan consumed by A) |
| first_paint_dependencies resolve + `Object.assign(record, patches)` | 291-309 | 2 (+scheduling leak) | see sub-deps | **A** (scheduling→B) |
| ↳ attention_bundle | deps 102-120 / apply 196-200 | 2 | `summaries.attention`, `record._operational_attention` | **A** |
| ↳ header_actions | deps 121-136 / apply 202-208 | 2 | `actions.*` | **A** |
| ↳ scheduled_sends (reminders) | deps 137-144 / apply 210-216 | 2 | `summaries.reminders` | **A** |
| ↳ tour_bookings | deps 145-147 / apply 218-227 | 2 | `summaries.active_tour_bookings`, tour_display_source, header_menu | **A** |
| ↳ **scheduling_projection** | deps 148-150 / apply 229-237 | **3** | `record._scheduling_projection`, `first_paint.data.scheduling_projection` | **B** (the one Tier2→Tier3 edge to break) |
| first_paint finalizers (metadata-only) | fpd 163-194 | 1/2 | `first_paint.*` | **A** |
| serialization start + reminders/actions/tour extraction | 311-318 | 2 | — | **A** |
| aboveFoldRenderModel + structure-settled guard | 320-330 | 2 | `above_fold.render_model` | **A** |
| first_paint contract build + settled guard | 332-342 | 2 | `first_paint` | **A** |
| header menu actions + tabs/default_tab | 344-351 | 2 | `actions.header_menu/manage_menu` | **A** |
| oper_trust_preview (hints) | 353-356 | 2 | `header.oper_trust_preview` | **A** |
| layout assembly + first-paint-valid guard | 358-367 | 1 | `layout` | orchestrator |
| attentionRaw read | 369 | 2 | `summaries.attention` | **A** |
| lifecycle_rail build | 371-376 | 1 | `workspace.lifecycle_rail`, configuredStages | **C** |
| stage_context (resolveStageOperatingPlanPurpose) | 377-380 | 3 | `workspace.stage_context` | **B** |
| currentStageKey/Label derive | 381-383 | 1 | stage identity for B | **C** |
| activity_comms_preview (deferrable) | 384-401,423 | 3 | `activity.communicationsPreviewVm` | **B** |
| stage_work slice (resolveOpportunityStageWorkSlice, deferrable) + load-state | 402-430 | 3 | `workspace.stage_work_runtime/...` | **B** |
| tasks summary parse + residual filter + record writes | 431-439 | 1 (filter needs B) | `summaries.tasks`, `record._inquiry_summary_tasks` | **A** parses (`tasks_raw`); **orchestrator** filters with B |
| status_can_mutate (from gate) | 440-443 | 2 | `header.status_can_mutate` | **A** |
| VM assembly (generation + fields) | 445-521 | — | whole VM | **orchestrator** |
| serialization_ms/total_ms + finishCompose | 524-526 | — | `timing`, shadow | **orchestrator** |

## 2. Contracts (reuse sub-types from `drawer/types.ts`)
- **SharedCanonicalDeps**: orgId, opportunityId, record (mutable baseline), layout {mode,tabs,default_tab,shell}, layoutVersion, workspaceIdentity {departmentId,workUnitId,queueDefinition,rawQueueDefinition,wuMetadata}, deptMetadata, statusDefs, statusKey, lifecycle_rail, currentStageKey, currentStageLabel, firstViewportPlan, readinessInputs.
- **InitialPanelResource** (Tier-2): header, actions, first_paint (Tier-2 keys), above_fold, summaries {tasks_raw (UNFILTERED), active_tour_bookings, reminders, bos, attention}, record_patches (attention only, NOT scheduling).
- **DeferredDetailResource** (Tier-3): workspace_detail {stage_context, work_intent_runtime, stage_work_runtime, published_stage_inputs, stage_work}, activity, scheduling_projection, record_patches (_scheduling_projection, _stage_work_runtime, _work_intent_runtime).

`summaries` splits: `tasks` (needs B's filter → orchestrator) vs the rest (A). `workspace` splits: identity (C) vs deep runtime (B).

## 3. Import-direction breaks
- Composer's 32 imports: → **C** (supabase/gate, fetchEffectiveRecordDrawerLayout, fetchDepartmentMetadataForActivity, visible-payload+household, resolveWorkUnitQueueDefinitionForDrawer, fetchEffectiveStatusDefinitionsTagged, OPPORTUNITY_CANONICAL_ADMIN_SELECT, shell compile, buildOpportunityWorkspaceLifecycleRail, QueueDefinitionV1). → **A** (oper-trust sanitize, readiness memo/evaluate, above-fold builder, header builders, header-menu actions, status-can-mutate, summaries builders, first-viewport/tour-display, first-paint contract + `*FromFirstPaintData` + `resolveOpportunityDrawerFirstPaintDependencies`, strip/settled). → **B** (`resolveStageOperatingPlanPurpose`, `resolveOpportunityStageWorkSlice`, `resolveFamilyCommunicationWorkspacePreview`). → **orchestrator** (compose-version, generation, shadow log, VM types, `filterResidualOperationalTasks`).
- first-paint-deps' 16 imports: all → **A** EXCEPT **`loadSchedulingProjectionsForFirstPaint` → B** (the single A→Tier3 edge — remove `scheduling_projection` from A's resolver; B resolves it; orchestrator merges into `first_paint`).
- **A imports zero Tier-3** after (a) moving `loadSchedulingProjectionsForFirstPaint` to B and (b) keeping `filterResidualOperationalTasks` in the orchestrator.

## 4. Duplication to DELETE in S2 (mark only — do NOT delete in S4)
- `visible_entity` (L201-208) re-derives `record._inquiry_children` that the Answer's `focusPanelSubjectSnapshot.inquiryChildren` already carries.
- household attach (L237-242, `phases.household_persons_ms`) re-resolves the roster the snapshot's `primaryContact` already seeds.
- stage-work re-resolution (L407-424) re-computes the Answer's `focusPanelStageWork`.
The committed panel renders Household/Children/Current-Work from the Answer; the VM should only ENRICH deeper family/settlement.

## 5. Orchestrator rewire
`const C = await resolveSharedCanonicalDeps(...)` (owns all "skipped" guards) → `const [A,B] = await Promise.all([buildInitialPanelResource(C,...), buildDeferredDetailResource(C,{deferCommunicationsPreview,deferStageWork})])` → orchestrator owns cross-tier joins: `summaries.tasks = filterResidualOperationalTasks(A.tasks_raw, B.workspace_detail.stage_work_runtime)`; merge B.scheduling into `first_paint` + paint record (RISK #1 — orchestrator-merge keeps behavior-identical); `record = {...C.record, ...A.record_patches, ...B.record_patches}` then snapshot+strip `above_fold.record` ONCE; `workspace = {...C.workspaceIdentity, lifecycle_rail, ...B.workspace_detail}`; generation after A; merge `phases_ms`. Same exported name/params/return → **route + client unchanged**. The `…/stage-work` route already calls `resolveOpportunityStageWorkSlice` directly (B reuses it).

## 6. Behavior-preservation risks
1. **scheduling_projection** is Tier-3 but lives in the Tier-2 `first_paint` contract + paint record → orchestrator must merge it back (keep behavior-identical in S4; true client decouple is a later slice, and S3 defers it).
2. **summaries.tasks** filter + `_inquiry_summary_tasks` record writes stay in the orchestrator (needs B). Default path deferStageWork=true → stage_work_runtime null → no-op filter; preserve.
3. **Single mutable `record`** (biggest ordering risk): ownership C=baseline+household, A=attention+tasks-parse, B=stage_work+scheduling; snapshot `above_fold.record` ONCE in orchestrator after all patches.
4. tour_bookings → 3 A consumers from one first-paint-data source; keep single source.
5. lifecycle_rail fans across tiers (header configuredStages A, stage_context B, currentStageKey/Label B, workspace.lifecycle_rail VM) → C-owned, computed once before A/B.
6. deptMetadata/statusDefs cross-tier → resolve once in C, pass by value; A/B must not re-fetch.
7. `phases` shared mutable object → each module returns its own `phases_ms`; orchestrator merges, preserving exact keys (visible_*, children_*, first_paint_dependencies_ms, activity_comms_preview_ms, serialization_ms, total_ms).

## S4 Definition of Done
- 3 modules + orchestrator per above; A imports no Tier-3 (boundary test: `drawerVmCompositionBoundaries.test.ts`).
- `npm run typecheck` EXIT 0; serialized production build clean; the 6 regression tests (shadow/cutover/firstViewport/familyContacts/progressiveStatus/focusPanelFirstPaintGuards) green.
- Record before/after graph (before: composer fan-out 32 / fan-in 4; first-paint-deps 16/2; `OpportunityDrawerViewModel` type fan-in 41). No increase in the initial client bundle graph.
- ARCHITECTURE.md §7/§8 updated. Reveal browser-cert = **environment-deferred (EEC)**.
- No duplicated Household/Children/stage-work deleted (that is S2).
