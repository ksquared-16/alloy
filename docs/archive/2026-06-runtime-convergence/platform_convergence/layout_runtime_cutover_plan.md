# Layout Runtime Production Cutover Plan

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md`  
**Date:** 2026-06-07  
**Status:** Planning document — **no implementation in this sprint**  
**Audience:** Runtime convergence, AdminV2, convergence review

**Prerequisites (merged on staging):**

| Layer | Review doc | Status |
|-------|------------|--------|
| Phase 0–1 runtime foundation | [`convergence_review_runtime_phase1.md`](./convergence_review_runtime_phase1.md) | APPROVED |
| Phase 2–4 opportunity shadow parity | [`convergence_review_runtime_phase3_4.md`](./convergence_review_runtime_phase3_4.md) | APPROVED |
| FC-1 field catalog | [`convergence_review_fc1.md`](./convergence_review_fc1.md) | APPROVED |
| Layout V2 config defaults | Layout V2 foundation merge (`36af8691`) | On staging |
| Person + Child proof foundation | [`convergence_review_person_child_drawer_foundation.md`](./convergence_review_person_child_drawer_foundation.md) | APPROVED |

**Governing doctrine (must not regress):**

- [`layout_contract_v1.md`](./layout_contract_v1.md)
- [`entity_relationship_reference_model.md`](./entity_relationship_reference_model.md)
- [`docs/system/adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md)
- [`docs/system/drawer-view-model-runtime-contract.md`](../system/drawer-view-model-runtime-contract.md)
- [`docs/sprints/archive/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/archive/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) §7 — domain model for `QueueRowContext`, `active_subject`, placement, and layout block consumption

---

## Executive summary

Proof foundations for **Opportunity**, **Person**, and **Child** drawer layout runtime are complete behind default-off flags. **No production drawer body currently renders from `LayoutRuntimeRenderer`.** This plan defines the first flagged production cutover: entity-by-entity, drawer-first, queue-later.

**Recommended cutover order:** Opportunity drawer → Person drawer → Child drawer → queue rows (separate phase). Navigation, seeds, and a dedicated performance pass remain out of scope for the first cutover wave.

---

## 1. Cutover order

| Phase | Surface | Entity | Rationale |
|-------|---------|--------|-----------|
| **C1** | Drawer overview body | **Opportunity** | Richest proof + shadow parity harness (Phase 3/4); VM composer exists; highest convergence value; single enrollment lifecycle anchor |
| **C2** | Drawer overview body | **Person** | Parent/guardian operating context; `record_drawer_layouts` runtime variants bridged; depends on widget registry items from Phase 1 execution plan |
| **C3** | Drawer overview body | **Child** (`customer_members`) | Durable child model; relationship/reference proof complete; future modules (schedule, billing, attendance) remain placeholders until widget phase |
| **C4** | Queue row preview | **Opportunity** (pipeline + waitlist variants) | Requires `queue_context` resolution + `QueueRowContext`; waitlist candidate card VM exists as proof only |
| **C5** | Queue row preview | Person / Child | Only after drawer cutovers stable; lower traffic than enrollment pipeline |
| **—** | Navigation, sidebar, seeds | — | **Explicitly deferred** |
| **—** | Performance optimization pass | All | **After** C1–C3 per-org pilot validation |

Each phase is **org-scoped** and **flag-gated**. Phases do not merge into a single big-bang switch.

---

## 2. Feature flags

Current flags (`web/lib/layout/featureFlag.ts`):

| Flag | Env var(s) | Default | Role in cutover |
|------|------------|---------|-----------------|
| Layout V2 preview | `LAYOUT_V2_PREVIEW_ENABLED`, `NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED` | **off** | Config/proof APIs and `/adminV2/layout-proof/*` — **does not** mount production drawer body |
| Layout runtime read | `LAYOUT_RUNTIME_ENABLED`, `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED` | **off** | **Primary cutover gate** — when on, production drawer may mount layout runtime body (requires additional per-entity gate — see below) |
| Shadow parity | `LAYOUT_RUNTIME_SHADOW_ENABLED`, `NEXT_PUBLIC_LAYOUT_RUNTIME_SHADOW_ENABLED` | **off** | Diagnostic only; `isLayoutRuntimeShadowReadPathEnabled()` also allows preview — **never enables live cutover** |

**Planned cutover flag layering (implementation phase — not built yet):**

| Flag (proposed) | Purpose |
|-----------------|--------|
| `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1` | C1 — opportunity drawer body only |
| `LAYOUT_RUNTIME_PERSON_DRAWER=1` | C2 — person drawer body only |
| `LAYOUT_RUNTIME_CHILD_DRAWER=1` | C3 — child drawer body only |
| `LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1` | C4 — opportunity queue rows only |

Global `LAYOUT_RUNTIME_ENABLED` remains the master kill switch. Per-entity flags allow staged rollout and surgical rollback.

**Org-scoped adoption (future):** `entity_layouts` publish + org metadata adoption record — only orgs with a published layout doc **and** explicit adoption should cut over. Orgs without a published doc **must** fall back (§3).

---

## 3. Per-entity fallback behavior

When layout runtime is off, or entity flag is off, or no published/effective layout resolves:

| Entity | Fallback chain (in order) |
|--------|---------------------------|
| **Opportunity** | VM hardcoded inquiry workflow overview → bridged `record_drawer_layouts` / workflow_v1 → Layer 0 `entityPresentation.ts` opportunities drawer |
| **Person** | VM person drawer sections (`resolvePersonDrawerVmOverviewSections`) → `record_drawer_layouts` runtime variant → Layer 0 persons drawer |
| **Child** | Person-as-child operating chrome + VM sections → Layer 0 `customer_members` drawer |
| **Queue (all)** | `queueUiConfig` row preview + `ui-v2/*Presentation*` plans → Layer 0 table columns |

**Invariant:** Fallback must produce **operator-visible UI**, never a blank or false-empty drawer. `null` queue rows and `rowsLoading` semantics from AdminV2 performance doctrine are unchanged.

**Resolver contract:** `resolveLayout({ orgId, entityType, surface, queueContext? })` returns `{ doc, source }` where `source ∈ { org, default, registry, builtin }`. Cutover reads the same doc the proof surface uses; no parallel resolver.

---

## 4. Rollback process

### Immediate rollback (< 5 minutes)

1. Set `LAYOUT_RUNTIME_ENABLED=0` and `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=0` in the deployment environment.
2. Set the per-entity cutover flag(s) to `0` if deployed separately.
3. Redeploy or hot-reload env (Vercel env var change + redeploy).
4. Verify: open drawer on a pilot org — VM/legacy body renders.

### Partial rollback (single entity)

Disable only `LAYOUT_RUNTIME_<ENTITY>_DRAWER` while leaving others on for continued pilot on unaffected entities.

### Existing kill switches (retain)

- `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH` — VM path control; do not remove during cutover sprint.
- Layout preview flag — independent; disabling does not affect production runtime if runtime flag was on.

### Rollback verification checklist

- [ ] Drawer opens without layout-runtime import errors
- [ ] Above-fold reveal completes (no infinite "Preparing…")
- [ ] Queue lane does not show false empty while loading
- [ ] No Sentry spike on drawer open route

### Post-rollback

File convergence review note; shadow parity report for the failing org/opportunity id; do not revert layout doc publishes (config remains valid for next attempt).

---

## 5. Parity thresholds

Shadow parity readiness levels (`enrichShadowParityReport.ts`) — **gate for cutover**:

| Level | Parity score | Field coverage | Cutover allowed? |
|-------|--------------|----------------|----------------|
| `not_ready` | < 50% | any | **No** |
| `partial` | 50–79% | any | **No** — proof only |
| `approaching` | ≥ 80% | ≥ 65% | **Pilot only** with documented gap acceptance |
| `ready` | ≥ 95% | ≥ 85% | **Yes** for org-scoped pilot |

**Additional hard gates (all entities):**

- Zero **high-impact** section/repeater blockers in `topGaps` for pilot cohort sample (≥ 10 real records per stage).
- No new `child_inquiry.*` refKeys in published layout doc.
- No operator-visible raw UUID / OCM / `customer_member` table names.
- Protected AdminV2 reveal tests pass unchanged (§9).

**Person / Child:** Shadow parity harness for person/child VM ↔ layout compare **does not exist yet**. C2/C3 cutover is blocked until equivalent shadow validation is implemented and reaches `approaching` on a pilot org sample.

**Opportunity:** Real-record shadow API exists: `GET /api/admin/layout-proof/opportunity-drawer-shadow?opportunityId=<uuid>` (flag-gated).

---

## 6. Known gaps

### Opportunity

| Gap | Impact | Mitigation before C1 |
|-----|--------|---------------------|
| Widget registry incomplete (`customSectionContent` injection still in VM) | Medium | Phase 1 widget convergence — map `children_list`, `tour_summary`, `tasks`, `actions`, etc. |
| Reveal contract still registry-driven | **High** | Phase 2 reveal convergence — layout plan drives `evaluateComposedDrawerPayload` |
| Future tab placeholders (Children, Parents, Communications, Tasks) | Low | Widget or tab metadata; placeholders acceptable in pilot if VM tabs unchanged |
| Settings editors still write `record_drawer_layouts` for some paths | Medium | Migration script publishes equivalent `entity_layouts` before pilot |
| Production renderer is proof-grade (`LayoutRuntimePlanView`) not full `LayoutRuntimeRenderer` | **High** | Extract production renderer shared by proof + runtime; editable fields, mutations, audit |

### Person

| Gap | Impact | Mitigation before C2 |
|-----|--------|---------------------|
| No VM ↔ layout shadow parity harness | **High** | Build person shadow compare (mirror Phase 3/4) |
| Parent vs child operating chrome variants | Medium | Layout variant discriminator in resolver (`presentation_emphasis`) |
| `person_operating_sections` (summary, household, employee) still TS-mounted | Medium | Widget registry: `parent_summary`, `child_summary`, `household`, `employee_status` |
| Future modules: communications, documents, enrollment_activity | Low | Placeholder widgets until modules converge |

### Child

| Gap | Impact | Mitigation before C3 |
|-----|--------|---------------------|
| No VM ↔ layout shadow parity harness | **High** | Build child shadow compare |
| Future modules: schedule, attendance, billing, parents tab | **High for billing/attendance** | Must remain placeholders — **do not** fake operational modules |
| Location context (site/classroom/room) requires enrollment participation resolver | Medium | Computed projections + reference fields via enrollment-child context |
| Child drawer often opens via person seed / cross-drawer navigation | Medium | Manual QA cross-drawer matrix (§10) |

### Queue (C4 — later)

| Gap | Impact |
|-----|--------|
| `queue_context` variant matching not in production resolver | High |
| Waitlist candidate card VM vs layout doc parity unproven in production path | High |
| Queue lane reveal / `rowsHeld` semantics | High — protected infrastructure |

### Cross-cutting

| Gap | Impact |
|-----|--------|
| No org-scoped adoption metadata table/flag yet | Medium |
| Performance: extra layout resolve fetch on cold drawer open | Medium — measure in perf pass |
| Layer 0 `entityPresentation.ts` still authoritative for 16+ entity types | Low for C1–C3 scope |

---

## 7. What gets cut over first

**First production change (C1a — shadow mode, no operator delta):**

- Mount **hidden** layout runtime render alongside VM body in `OpportunityDrawerVmRuntime` (or AdminEntityDrawer shadow slot).
- Compare telemetry in staging only; operator sees VM body only.
- Requires: `LAYOUT_RUNTIME_ENABLED=1` + shadow infrastructure; **no** visible UI switch.

**First operator-visible change (C1b — pilot org):**

- Opportunity drawer **overview tab body** renders from `LayoutRuntimeDrawerBodyView` fed by resolved `entity_layouts` doc.
- **Read-only display parity** — layout runtime body shows field values only; no inline editing or save paths in C1b. Any editable sections in the VM overview remain VM/legacy-owned until a later sprint. Drawer shell save orchestration (header actions, status mutation, registry modals) stays VM-owned.
- Render-phase failures are caught by `OpportunityDrawerLayoutRuntimeBodyErrorBoundary` → VM overview fallback (same as fetch/resolve failures).
- Header, tabs, lifecycle rail, actions, status mutation, and reveal gates **remain VM-owned** until reveal convergence complete.
- Pilot: 1–2 orgs with published opportunity drawer layout + shadow readiness `approaching` or better.

**Not in first cutover:**

- Person drawer, Child drawer, queue rows, navigation, seeds, settings editor rewrite, Layer 0 retirement.

---

## 8. What remains legacy

Until explicitly retired per entity:

| System | Remains legacy through |
|--------|------------------------|
| `AdminEntityDrawer` / `AdminEntityDrawerLegacy` shell orchestration | Full drawer cutover + reveal convergence |
| VM composers (`composeOpportunityDrawerViewModel`, person VM sections) | Entity body cutover; header/actions longer |
| `web/lib/adminV2/runtime/contract/registry/*` reveal registries | Phase 2 reveal convergence |
| `entityPresentation.ts` Layer 0 | Phase 7 — last entity publishes layout |
| `record_drawer_layouts` config store | Bridge until settings migration complete |
| Hardcoded inquiry JSX (`OpportunityDrawerInquiryWorkflowOverview`) | C1b completion |
| Queue `ui-v2/*Presentation*` | C4 |
| Workspace / department block registry | Out of Layout V1 scope |
| Navigation / sidebar / deep-link openDrawer | Separate sprint |

---

## 9. Tests that must pass

### Before any cutover PR merges

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/layout/
```

**Layout suite (current baseline):** 195 tests / 21 files (includes person/child proof, shadow parity, FC-1, waitlist proof).

### Before C1b (opportunity visible cutover)

Protected AdminV2 runtime suite (from adminv2-runtime-performance rule):

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

**Additional C1 gates:**

- `tests/layout/opportunityDrawerShadowParity.test.ts`
- `tests/layout/realOpportunityShadowValidation.test.ts`
- `tests/layout/layoutRuntimePlanProofRenderer.test.tsx`
- `tests/adminV2/opportunityRecordDrawerShellContract.test.ts`
- `tests/adminV2/viewModel/opportunityDrawerViewModelComposer.test.ts`

### Before C2 / C3

- `tests/layout/personChildDrawerRuntimeProof.test.tsx` (proof foundation)
- **New:** person shadow parity + child shadow parity test suites (to be authored)
- `tests/admin/person/personDrawerPresentationProfile.test.ts` (regression)
- Person/child protected reveal tests when person drawer coordinated reveal exists

### Before C4 (queue)

- `tests/layout/queueCard.test.ts`
- `tests/layout/waitlistCandidateCard.test.ts`
- `tests/adminV2/workUnitQueueLaneRevealState.test.ts`

**Zero assertion weakening** in protected tests unless an explicit layout-derived key migration is documented and convergence-reviewed.

---

## 10. Manual QA verification

### Environment

- Staging with flags documented in PR
- Pilot org with published layout doc(s)
- At least one org **without** published layout (fallback verification)

### Opportunity drawer (C1b)

- [ ] Open lead from work-unit queue — drawer reveals as one coordinated surface (no section pop-in)
- [ ] Overview fields match pre-cutover values for primary contact, status, children repeater
- [ ] Primary contact shows **name handle**, not UUID
- [ ] Children repeater shows **Child** label; no OCM / `inquiry_child` exposed
- [ ] Edit field in layout-driven section — save persists (when editable items enabled)
- [ ] Workflow tabs order unchanged
- [ ] Lifecycle rail, header actions, tour panel still function
- [ ] Warm navigation back to same drawer — no stale layout flash
- [ ] Kill switch off — legacy body returns instantly

### Person drawer (C2)

- [ ] Parent operating context: household, parent summary widgets render
- [ ] Child operating context: child summary, suppressed parent sections
- [ ] Cross-open from opportunity person link — correct emphasis
- [ ] Relationship section shows related handles, not flattened fields

### Child drawer (C3)

- [ ] Operator label "Child" throughout
- [ ] Site / classroom / room show as location references, not child columns
- [ ] Parents repeater shows person names
- [ ] Schedule / attendance / billing show **placeholder only** (no fake data)
- [ ] Open from person drawer child link — consistent household context

### Queue (C4 — later)

- [ ] Pipeline row preview matches layout doc columns
- [ ] Waitlist candidate card variant resolves via `queue_context`
- [ ] No false empty queue while rows loading
- [ ] Row click still selects correct record

### Regression spot-checks (all phases)

- [ ] `/adminV2/settings/layouts` edits publish and reflect in proof surface
- [ ] Feature flags default off on fresh deploy
- [ ] No new console errors on drawer open

---

## Implementation sequencing (recommended)

```
[C1a] Shadow mount (telemetry only)
  → Phase 1 widget registry (opportunity widgets)
  → Phase 2 reveal convergence (layout-driven readiness)
  → [C1b] Opportunity drawer body pilot
  → Person/Child shadow parity harness
  → Phase 1 widgets (person/child)
  → [C2] Person drawer pilot
  → [C3] Child drawer pilot
  → [C4] Opportunity queue pilot
  → Performance pass
  → Layer 0 retirement (entity-by-entity)
```

**Do not skip C1a.** Operator-visible C1b without reveal convergence risks AdminV2 performance doctrine violations.

---

## Convergence review gates

Each cutover phase requires:

1. Updated shadow parity report sample attached to PR
2. Convergence review doc (or addendum) with APPROVED verdict
3. Confirmation: no navigation / seed / queue (unless C4) / performance-weakening changes bundled
4. Rollback steps validated on staging

---

## Related documents

- [`runtime_convergence_execution_plan.md`](./runtime_convergence_execution_plan.md) — phase definitions
- [`runtime_to_layout_mapping.md`](./runtime_to_layout_mapping.md) — legacy → layout mapping
- [`child_namespace_decision.md`](./child_namespace_decision.md) — naming for cutover QA
- [`docs/system/adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md) — non-negotiable reveal rules

---

*Plan only. No cutover implementation until a subsequent sprint explicitly schedules C1a.*
