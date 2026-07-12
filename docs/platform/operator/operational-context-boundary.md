# Alloy OS — Operational Context Boundary (Runtime Spine)

**Status:** Design freeze (June 2026). Platform abstraction correction — adopt before the first operational card ships.
**Supersedes (conceptually):** "drawer" as the runtime composition boundary.
**Companions:** [`operational-grammar.md`](./operational-grammar.md) · [`card-language.md`](./card-language.md) · [`universal-card-archetypes.md`](./universal-universal-card-archetypes.md) · [`household-reference-card.md`](./household-reference-card.md) · [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md)

---

## 1. Why this exists

The card system must not be built on **"drawer."** Drawer is a *presentation host* (an infrastructure shell that reveals a panel), not a *conceptual runtime boundary*. If cards are written against `drawerId`, `displayVm`, `record`, and `DrawerTabKey`, every future card inherits drawer terminology and drawer assumptions — the exact coupling the convergence is meant to remove.

This document replaces the conceptual boundary **now**, at the doctrine level, so that every card from Household forward is specified against the correct abstraction. Existing composed ViewModels may remain *internally* during migration, but the **boundary cards build against** is the **Operational Context**.

---

## 2. The canonical runtime spine

```
Queue
  ↓        (select a subject — preview → intent)
Operational Context
  ↓        (the loaded situation: subject + process + composed truth + capabilities)
Focus Panel
  ↓        (the cognitive presentation of one Operational Context: Summary / Work / Activity)
Cards
           (operational answers composed onto the Focus Panel; each answers one question)
```

| Level | Definition | Owns | Loads? |
|-------|-----------|------|--------|
| **Queue** | Preview/selection surface. Rows are previews, never operational truth. | Selection intent | Queue rows only |
| **Operational Context** | The fully-composed situation the operator is working within: **subject** + **business process** + **composed subject truth** + **capabilities/permissions** + **status**. Loaded **once** per subject. | The single source of observed truth for all cards | **Yes — the only routine load level** |
| **Focus Panel** | The cognitive presentation of one Operational Context. Three modes (Summary / Work / Activity) select *which cards compose*; mode is not a tab and not a route. | Composition, mode, reveal gate | No (reads the already-loaded context) |
| **Cards** | Operational answers. Each observes the Operational Context and answers exactly one question. | Projection + local perspective state | **Never independently** |

> **Drawer's new role:** the drawer shell is *infrastructure* that may host the Focus Panel during migration. It is never the boundary a card targets. See [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

---

## 3. What an Operational Context is

An **Operational Context** is the answer to *"what situation is the operator in right now?"* It is established by selecting a subject (from a Queue, Search, or a Change-Subject interaction) and is composed **once**.

```
OperationalContext
├── subject            { type, id, label }          // who/what this is about
├── businessProcess    { key, label, stageKey? }    // the process framing
├── perspective        { missionLabel, ordering, visibility }   // operational view (perspectives_v1)
├── truth              <composed subject record>     // observed, read-once, never re-fetched per card
├── capabilities       { canMutate, permittedActions, maskedChannels }   // what the operator may do/see
└── status             { ready | composing | error | permission_limited }
```

- **`truth`** is the composed, observed record. Cards **read** from it; cards never write to it directly and never trigger their own fetch to enrich it.
- **`capabilities`** carries permission outcomes (e.g., contact channels masked for a limited role) so cards render permission states without their own authorization round-trips.
- **`status`** is owned by the Focus Panel reveal gate. The card's "loading" state is **not** a card-owned spinner — it is the context not yet being `ready` (see the Household freeze, Performance model).

---

## 4. The seam today (migration-safe)

The composed ViewModel already exposes the correct alias — adopt it instead of drawer names:

| Drawer-era name | Operational Context name (use this) | Location |
|-----------------|-------------------------------------|----------|
| `OpportunityDrawerViewModel` | `OperationalSubjectViewModel` | `web/lib/adminV2/viewModel/drawer/types.ts` |
| `OpportunityDrawerViewModelResult` | `OperationalSubjectViewModelResult` | same |
| `displayVm` (prop) | `context` / `subject` (prop) | card components |
| `drawerId` (prop) | `context.subject.id` | card components |
| `record` (prop) | `context.truth` | card components |
| `DrawerTabKey` (mode) | `FocusPanelMode` | already exists |

**Migration rule:** new card code targets the `OperationalContext` accessor — **not** `OpportunityDrawerViewModel`, `drawerId`, or `record` directly. The internal ViewModel remains the implementation of `truth` for now; the *name and shape cards depend on* is the Operational Context.

> **Seam status — implemented (June 2026):** the boundary now exists as a thin adapter, not a refactor:
>
> - `web/lib/adminV2/runtime/operationalContext/types.ts` — the `OperationalContext` contract.
> - `web/lib/adminV2/runtime/operationalContext/buildOperationalContext.ts` — the **only** sanctioned adapter from the composed subject payload to `OperationalContext`.
>
> `OpportunityFocusPanelModeGrid` builds the context once (`useMemo`) and passes it to cards; the **Household card** is the first consumer (`HouseholdCard` + `buildHouseholdCardEvidence` read `context.truth` / `context.subject` / `context.capabilities`, never the drawer VM). The drawer VM system was **not** renamed or refactored — only the forward-facing card contract was added.
>
> **Cutover (June 2026, Phase D0):** the **card renderer** (`FocusPanelCardRenderer`) now takes `context: OperationalContext` as its data contract — subject id and truth derive from the context, not from a standalone `drawerId`/`record`. Both renderer call sites (runtime grid + Surfaces preview editor) build the context via the adapter. Drill cards (`timeline/documents/notes/workflow_steps`) still read `displayVm` as **quarantined internal compatibility** pending re-projection. Full ledger + staged removal: [`focus-panel-runtime-cutover-report.md`](./focus-panel-runtime-cutover-report.md).

---

## 5. Laws

1. **Cards observe; they never fetch.** All routine data is read from `OperationalContext.truth`, composed once.
2. **One context, many cards.** Every card on a Focus Panel observes the *same* Operational Context instance.
3. **Perspective and mode never load.** Changing card perspective (collapse/expand/focus) or Focus Panel mode (Summary/Work/Activity) is local state + composition — never I/O.
4. **Only a new subject loads.** A Change-Subject interaction establishes a *new* Operational Context; that is the only routine new load. Deep workspaces (ledger, full profile) may load their own domain data, but as a separate context — not as "more card."
5. **Drawer terminology is forbidden in card contracts.** No `drawerId`, `displayVm`, `DrawerTabKey` in card props or card-facing types.

---

## 6. Cross-references

- Household reference (first card built on this boundary): [`household-reference-card.md`](./household-reference-card.md)
- Cutover ledger (drawer dependency classification + staged removal): [`focus-panel-runtime-cutover-report.md`](./focus-panel-runtime-cutover-report.md)
- Convergence & sunset sequencing: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md)
- Focus Panel vocabulary: [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md)
- Interaction models (Expand / Drill / Change Subject / Embedded / External): [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md)
