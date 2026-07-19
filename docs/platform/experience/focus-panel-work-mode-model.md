---
owner: platform
status: active
last_reviewed: 2026-07-19
---

# Focus Panel Work-mode Model — the canonical composition contract (A)

> Resolves the input-contract boundary for the atomic Focus Panel composition (Runtime V1 mission A).

## The boundary question, answered

**Is `OperationalSubjectViewModel` the intended permanent Focus Panel contract, or a broader
drawer/record aggregate consumed incidentally?**

It is the **broader aggregate, consumed incidentally.** `OperationalSubjectViewModel` is
`OpportunityDrawerViewModel` verbatim (`lib/adminV2/viewModel/drawer/types.ts` — "same shape during
migration"): a full drawer/record payload (first-paint contract, above-fold render model, shell,
summaries, activity preview, timing…). The **intended forward, card-facing contract is
`OperationalContext`** — `buildOperationalContext` states it outright: *"New card code must consume
`OperationalContext`, never the drawer VM directly… a thin seam during migration."*

The grid (`OpportunityFocusPanelModeGrid`) is mid-migration: it still derives from the drawer VM in
two places — `deriveOpportunityFocusPanelPresentation(displayVm)` (card models) and
`buildOperationalContext({ subjectVm: displayVm })` (card context) — and leaks the VM to cards through
`compat.subjectVm`. That is the unfinished part of the migration, not the target state.

**Decision:** extract a canonical `FocusPanelWorkModeModel` that BOTH the provisioning answer and the
settlement/drawer VM produce. The grid consumes only that. No synthetic drawer VM is ever constructed;
no card reads the drawer VM directly.

## Architecture

```
Provisioning answer   ─┐
                       ├─→  FocusPanelWorkModeModel  ─→  one grid + one set of card renderers
Settlement/drawer VM  ─┘         (source-agnostic)
```

`FocusPanelWorkModeModel` (`lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel.ts`) carries:

- **composition** — the configured cells (set + order + geometry), from the published Focus Panel
  LayoutDoc. Configuration-driven, never data-driven.
- **subject identity**, **Current Work**, **Situation**, **Decision**, **Action**, **primary
  commands** — all via `context: OperationalContext` (+ `cardModels`).
- **card readiness states** — `cardReadiness: Map<cardKey, "ready" | "reserved" | "not_applicable">`.

### Composition is configuration-driven (the core invariant)

The set of rendered cells comes from the org's published composition, **never** from which data is
present. Consequences:

| Card geometry state | Meaning | Rendering |
|---|---|---|
| configured + **ready** | in composition, authoritative data in hand | render the card with content |
| configured + **reserved** | in composition, settlement pending | reserve the cell geometry; fill in place, no reflow |
| configured + **not_applicable** | in composition, genuinely inapplicable to this subject | keep the cell; render the muted/empty treatment |
| **not configured** | not in the published composition | absent from the model; never rendered |

**A missing settlement value must never remove a configured card cell.** This replaces the current
data-driven `visible: false` drop (a card hidden because its summary data was empty), which is exactly
what made the panel visibly assemble card-by-card as settlement arrived.

### The two producers emit the SAME composition

- **`fromProvisioningAnswer`** (commit-critical): `current_work` (+ Situation/Decision/Action/subject
  identity) = **ready** from the answer; every settlement-owned card = **reserved**. Sets only
  semantically-authoritative fields — no placeholder/demo data.
- **`fromDrawerVm`** (enriched): every configured card = **ready** (or **not_applicable**), from the
  composed VM via `buildOperationalContext`.

Because composition is configuration-driven, both emit identical cells / order / geometry. The
pending→enriched transition changes only each cell's readiness (and thus its content) — same grid,
same card ids, same components, same ordering, same geometry. No card-by-card assembly.

## Migration plan (phased, each browser-certified on cold + prepared frames)

1. **Contract** — `FocusPanelWorkModeModel` + `FocusPanelCardReadiness` (this commit).
2. **Producers** — `focusPanelWorkModeModelFromDrawerVm` (wraps the existing derivations; behavior-
   neutral) and `focusPanelWorkModeModelFromProvisioningAnswer` (commit-critical, authoritative fields
   only). The committed subject already carries the Current Work slice
   (`stage_work_runtime` + `published_stage_inputs` + `work_intent_runtime`) via
   `OperationalSubjectContext`.
3. **Grid** — `OpportunityFocusPanelModeGrid` consumes `FocusPanelWorkModeModel`, renders each
   configured cell by readiness (ready → `FocusPanelCardRenderer`; reserved → reserved geometry).
   Remove the data-driven `visible` drop; composition comes from configuration.
4. **Card independence** — eliminate `compat.subjectVm`; every card reads `OperationalContext` only.
5. **Purify** — delete the standalone pending Current Work path (`LayoutRuntimeCurrentWorkWidget` /
   `CurrentWorkRuntimeCard`) once the canonical model renders the summary grid at commit.

## Non-negotiables

- No synthetic drawer VM. No demo/placeholder data as a production contract.
- The grid must not branch on `source`.
- Pending and enriched are the same grid, card ids, components, ordering, and geometry.
