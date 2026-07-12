# Editable Card — Bulk Convergence Plan

**Path:** `docs/sprints/06_2026/premium-operational-experience/editable-card-convergence-plan.md`
**Status:** Plan (June 2026). Pattern-family convergence onto the canonical Editable Card Runtime.
**Companion:** [`editable-card-runtime.md`](../../../platform/experience/editable-card-runtime.md) (the runtime) · `web/tests/experience/editing/editableCardContractHarness.tsx` (the reusable behavioral harness).

---

## Phase 1 — Inventory (record-surface editable components)

The single save coordinator is confirmed: `drawerOperatingSaveCoordinator`. `personDrawerEditingCoordinator` is a `@deprecated` re-export of it — **no competing coordinator**.

| Component | Lifecycle ownership | Save trigger | Mode | Save path | Tests | Local state |
|-----------|---------------------|--------------|------|-----------|-------|-------------|
| `EditablePersonContactCard` | **canonical** ✅ | blur/explicit | authoritative | `patchLinkedPersonFromOpportunityDrawer` | behavioral (contract) | via runtime |
| `PersonEmployeePlacementSection` | coordinator-local **hybrid** | blur+debounce *and* Save-All | optimistic+rollback | `patchLinkedPersonFromOpportunityDrawer` | source-string | `draft/saving/saveError/savedFlash/baseline` |
| `PersonDrawerChildSummary` | coordinator-local | Save-All | optimistic+rollback | `patchPersonDrawerFields` | behavioral | `draft/saving` |
| `PersonDrawerParentSummary` | coordinator-local | Save-All | optimistic+rollback | `patchPersonDrawerFields` | behavioral | `draft/saving` |
| `PersonDrawerHouseholdAddress` | coordinator-local | blur per-field | optimistic+rollback | household address endpoints | source-string | `values/saving` |
| `OpportunityInquiryChildrenSection` | coordinator-local | row blur | authoritative | `patchInquiryChild*` | source-string | `savingById/errorById/savedById` (per row) |
| `PersonDrawerParentAddress` | self-managed | blur per-field | authoritative | `patchPersonDrawerFields` | source-string | `values/saving` |
| `OpportunityDecisionSplitPanel` | self-managed | explicit Apply | pessimistic | decision-split endpoint | source-string | `outcomes/saving/error/…` |
| `OpportunityPacketReviewModal` | self-managed | explicit Apply | pessimistic | `patchPacketReview` | behavioral | `notes/saving/saveErr` |
| `AdminEntityDrawerLegacy` | self-managed (legacy) | varies | pessimistic | various | source-string | scattered |
| ~15 `adminV2/settings/*` editors | self-managed | explicit | pessimistic | settings PATCH endpoints | mixed | various |

Totals: **1 canonical · 6 coordinator-local · ~23 self-managed** (4 modal/panel + ~15 settings + misc).

## Phase 2 — Pattern families (by implementation)

| Family | Pattern | Members | Migration recipe | Mechanical? | Risk |
|--------|---------|---------|------------------|-------------|------|
| **A — Self-saving** | card triggers own save; owns flags | `EditablePersonContactCard` ✅ (only pure member) | proven recipe (done) | yes | low |
| **B — Coordinated Save-All** | shared Save-All saves all dirty sections | `PersonEmployeePlacementSection` (deferSave), `PersonDrawerChildSummary`, `PersonDrawerParentSummary`, `PersonDrawerHouseholdAddress`, `OpportunityInquiryChildrenSection` (per-row) | **needs coordinated-mode runtime** then mechanical | after unlock | low–med |
| **C — Modal/panel editors** | modal explicit-apply, scoped | `OpportunityDecisionSplitPanel`, `OpportunityPacketReviewModal` | own lifecycle; case-by-case | no | med |
| **D — Settings/config editors** | admin config, **not record editing** | ~15 `adminV2/settings/*` | out of scope — a settings-editor pattern, not the record-surface runtime | no | — |

## Phase 3 — Bulk batch decision (corrected by the inventory)

The original assumption — "migrate the largest low-risk family mechanically" — needs one correction the inventory surfaced:

> **Family A (pure self-saving) has exactly one member, already migrated.** The *largest* record-surface family is **B (coordinated Save-All)** — and it is **not mechanical until the runtime supports a coordinated mode** (where the edit phase is driven by the coordinator's Save-All lifecycle, not by self-`commit()`). `PersonEmployeePlacementSection` proves this: it's a hybrid whose `deferSave` path registers `applyOptimistic`/`save`/`rollbackOptimistic` with the coordinator and shows status from the *external* Save-All.

So the first bulk batch is **Family B**, gated on a small runtime extension. Families C and D are deliberately later (C is modal-scoped; D is a different domain — config, not record editing — and should get its own settings-editor pattern, not this runtime).

## Phase 4 — Contract test harness ✅ (built + validated)

`web/tests/experience/editing/editableCardContractHarness.tsx` — `runEditableCardContract(adapter)` asserts the full behavioral contract (enter-edit→dirty + coordinator registration, save success→ack, save failure→edit retained/no silent loss) via jsdom interaction. Each card supplies a ~20-line adapter (`mount`/`edit`/`save`/`arrangeSuccess`/`arrangeFailure`). Validated by refactoring `EditablePersonContactCard`'s test onto it (5/5).

## The unlock — coordinated-mode runtime extension ✅ BUILT

`coordinated?: boolean` is now on `useEditableCardRuntime`. When set, the section it registers with `drawerOperatingSaveCoordinator` **also drives the phase machine** (verified: `web/tests/experience/editing/useEditableCardRuntimeCoordinated.test.tsx`, 4 tests against the real `drawerOperatingSaveAll()` — saving→saved, rollback retains dirty+error, swallowed-failure bug fixed, clean card skipped). The harness gained `runSaveAllInAct()` so Family-B adapters reuse the contract. **Family B is now a mechanical migration.** Mechanics:
- `applyOptimistic` → `opts.applyOptimistic()` (optimistic patch).
- `save` → dispatch `saveStart`; `await opts.save()`; on `!ok` **throw** (so the coordinator rolls the section back — note: the current self-commit registration swallows `!ok`, a latent bug to fix here); on `ok` dispatch `saveSuccess` + schedule the ack.
- `rollbackOptimistic` → dispatch `saveFailure(error)` + `opts.rollbackOptimistic()`.

This is a focused, isolated addition to the proven runtime, behaviorally testable against `drawerOperatingSaveAll()` (apply→confirm→rollback). Once it lands, **Family B migrates mechanically**: per card, replace `draft/saving/saveError/savedFlash` + the manual `registerPersonDrawerEditSection` block with `useEditableCardRuntime({ coordinated: true, dirty, save, applyOptimistic, rollbackOptimistic, sectionId })`, add a harness adapter, delete the source-string test.

## Blocker found during Family-B execution — the shared optimistic helper reverts the draft

Attempting `PersonDrawerChildSummary` surfaced that req 5/6 ("rollback restores server baseline **while retaining the operator draft**; failed Save-All leaves the card dirty with a legible error") **cannot be met per-card.** All Family-B summary cards delegate rollback to the shared `createPersonDrawerOptimisticSectionHandlers`, whose `rollbackOptimistic` calls `revertDraft()` — discarding the operator's edit (the same silent-loss pattern, in shared form). Worse, `applyOptimistic` mutates the **parent's** record via `onPersonUpdated`, so "restore server truth but keep the draft" is entangled with parent-record ownership across the whole family.

So Family-B migration is **gated on fixing the shared helper's rollback semantics** — a focused, family-wide change (separate record-restore from draft-retain), not a mechanical per-card edit. The lifecycle migration (`useEditableCardRuntime({coordinated:true})` + `EditableCardStatus`) compiles and uses the verified coordinated mechanism, but cannot pass the full behavioral contract until the helper retains the draft. `ChildSummary` was reverted to avoid a half-verified live migration.

## Sequencing (corrected)

1. **Coordinated-mode extension** + tests (the runtime unlock). ✅ done.
2. **Shared `EditableCardStatus`** acknowledgement component. ✅ done.
3. **Fix the shared optimistic helper** (`createPersonDrawerOptimisticSectionHandlers`): rollback restores server baseline but **retains the operator draft** → dirty + legible error. Behaviorally test it. *(The new prerequisite for Family B — fixes the whole family's rollback at once.)*
4. **Family B bulk** — now mechanical: per card swap to `useEditableCardRuntime({coordinated:true})` + `EditableCardStatus`, add a harness adapter, delete source-string tests. Verify with the full contract (incl. retain-edit).
5. **Family C** — modal editors, case-by-case.
6. **Family D** — out of scope; a settings-editor pattern, separately.

## When this doc must be updated

A family is migrated; the coordinated-mode extension lands; or a new editable pattern is found.
