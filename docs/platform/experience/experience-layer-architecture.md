---
owner: experience
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Experience Layer — Architecture

**Path:** `docs/platform/experience/experience-layer-architecture.md`
**Status:** **Canonical architecture** (June 2026). The build plan for the Experience Layer of Alloy OS.
**Governs:** how the [Operational Experience Doctrine](./operational-experience-doctrine.md) and [Operational Motion Doctrine](./operational-motion-doctrine.md) become reusable platform capabilities that every future workflow inherits automatically.
**Required-deliverable index:** §1 Architecture · §2 New modules · §3 Removed/merged modules · §4 Dependency relationships · §5 Implementation sequence.

---

## Framing

The Experience Layer is a **platform tier**, peer to Cards, Surfaces, Drawers, Actions, Work Units, and Runtime. Workflows (Enrollment, Processing, Attendance, Billing, Scheduling, Staffing) consume it; they never re-implement it.

Two facts from the codebase shape the whole architecture and **lower its risk substantially**:

1. **The reveal engine already exists and is already capable.** `computeWorkUnitRevealGate()` already consumes `kpi_ready` and already blocks on it (see `web/lib/adminV2/runtime/*RevealGate*` and `docs/system/adminv2-runtime-performance-doctrine.md`). The illusion break is not a missing engine — it is that *call sites pass `kpi_ready: true` / `suppress_kpi_strip`*, opting out. **The fix is ownership, not invention.**
2. **The optimistic save engine already exists and is proven.** `drawerOperatingSaveAll()` already does optimistic-apply → parallel-confirm → per-section-rollback ([drawerOperatingSaveCoordinator.ts](../../../web/lib/admin/drawer/drawerOperatingSaveCoordinator.ts)). The Editable Card Runtime is a **state machine + acknowledgement wrapper** over this engine, not a new save system.

So the Experience Layer is built by **(a) centralizing ownership of behaviors today scattered across pages and CSS, and (b) wrapping proven engines in reusable, documented modules** — not by rewriting the runtime. This is the lowest-regression path to the doctrine.

---

# §1 — Architecture of the Experience Layer

Six capabilities, in **three tiers** by dependency depth. Lower tiers are leaves; higher tiers consume them. **Build bottom-up.**

```
                          ┌─────────────────────────────────────────────┐
  TIER 3 — Transitions    │  Continuity System      Navigation Continuity │
  (consume Tier 1+2)      │  (Capability 2)         (Capability 6)         │
                          └───────────────┬─────────────────┬─────────────┘
                                          │                 │
                          ┌───────────────▼─────────────────▼─────────────┐
  TIER 2 — Surface        │  Reveal System   Interaction   Editable Card   │
  contracts (consume      │  (Capability 3)   System        Runtime         │
  Tier 1)                 │                  (Capability 4) (Capability 5)  │
                          └───────────────────────┬───────────────────────┘
                                                  │
                          ┌───────────────────────▼───────────────────────┐
  TIER 1 — Foundation     │           Motion System (Capability 1)         │
  (leaf; consumed by all) │   tokens · easings · 5 choreographies · a11y   │
                          └───────────────────────────────────────────────┘
```

| Capability | Tier | Owner (Experience Doctrine) | Generalizes / wraps | New module root |
|------------|:----:|-----------------------------|---------------------|-----------------|
| 1 — **Motion System** | 1 | Motion System | The 50+ scattered CSS durations/easings | `web/lib/motion/` + `@theme` tokens |
| 3 — **Reveal System** | 2 | Runtime | `*RevealGate.ts` family + `workUnitPageRevealPolicy` | `web/lib/experience/reveal/` |
| 4 — **Interaction System** | 2 | Focus System | Ad-hoc hover/press/focus/saving CSS + states | `web/lib/experience/interaction/` |
| 5 — **Editable Card Runtime** | 2 | Card Runtime | `drawerOperatingSaveCoordinator` + the two editing patterns | `web/lib/experience/editing/` |
| 2 — **Continuity System** | 3 | Navigation | hold-prior-payload + drawer phase machine + reveal | `web/lib/experience/continuity/` |
| 6 — **Navigation Continuity** | 3 | Navigation | `shellNavigation` (`window.location.assign`) + slug host | `web/lib/experience/navigation/` |

Each capability is a **module with one public API, one owner, one doctrine section, and a migration path** (the four required per-capability artifacts). APIs sketched below; full signatures land with each module's implementation.

### Capability 1 — Motion System (Tier 1, foundation)

The single source of all movement. Tokens (4 durations, 4 easings), 5 named choreographies (`reveal·navigate·swap·acknowledge·recede`), reduced-motion as a token-level state. Mirrors the typography-token precedent (`presentationTypography.ts`) and color-token precedent (`styles/tokens/colors.ts`): CSS custom properties in the `@theme` block + a TS module for component consumption.

**Public API (sketch).** `motionTokens.ts` exports duration/easing constants and choreography className helpers: `motionChoreography('reveal' | 'navigate' | 'swap' | 'acknowledge' | 'recede')`, `MOTION_DURATION`, `MOTION_EASING`. CSS exposes `--motion-*` vars + `.motion-*` utility classes + keyframes. No component ever writes a raw duration again.

### Capability 3 — Reveal System (Tier 2)

Generalizes the AdminV2 reveal gates into one surface-agnostic contract: a surface declares its **regions**, each region reports **ready/empty/error**, and the surface reveals atomically when all are settled — using the Motion `reveal` choreography. **Removes the call site's ability to opt a region out** (the KPI bypass). Workspace, work unit, drawer, cards, KPI regions, and editable regions all register the same way.

**Public API (sketch).** `createRevealContract({ regions })` → `{ register(region, state), isRevealed, reasonIfBlocked, onReveal }`. The existing `computeWorkUnitRevealGate` becomes one *instance* of this contract; the generic engine subsumes the per-surface gates.

### Capability 4 — Interaction System (Tier 2)

One vocabulary for click-acknowledgement, selection, hover, focus, pressed, saving, saved, error, background-update, optimistic-change. Each is a Motion `acknowledge` (or `settle`) preset bound to a standard state. No interaction invents its own feedback.

**Public API (sketch).** `useInteractionState()` → `{ press, select, hover, focus }` returning Motion-bound classNames; `acknowledge(kind)` for saving/saved/error/optimistic. Consumed by buttons, rows, tiles, cards, fields.

### Capability 5 — Editable Card Runtime (Tier 2)

One canonical editing state machine — `viewing → focused → editing → dirty → saving → saved → viewing` — wrapping the proven `drawerOperatingSaveCoordinator`. Owns dirty-detection, optimistic apply, the single acknowledgement (via Interaction System), the universal dirty-guard, and legible rollback. **Both current editing patterns migrate onto this; custom save flows are deleted.**

**Public API (sketch).** `useEditableRuntime({ sectionId, read, write, optimistic })` → `{ state, value, setValue, commit, cancel, isDirty }`, auto-registering with the save coordinator and the dirty-guard. The state machine is a pure reducer (testable in isolation).

> **Realized by:** Capabilities 2 and 6 are unified and fully designed in [`navigation-runtime-doctrine.md`](./navigation-runtime-doctrine.md) (the Track 1 keystone). The sketches below are their embryonic form.

### Capability 2 — Continuity System (Tier 3)

The "operator never leaves" engine: freeze-current → hold-prior-payload → prepare-destination-invisibly → atomic-swap (Motion `navigate`/`swap`), plus scroll/focus preservation per surface. Generalizes the drawer phase machine's hold-prior-payload to *all* surface transitions.

**Public API (sketch).** `withContinuity(transition)` orchestrating freeze/hold/prepare/swap around any context change; `preserveScrollFocus(surfaceKey)`.

### Capability 6 — Navigation Continuity (Tier 3)

Turns route navigation into **operational transition**: soft navigation behind a resilience contract, a navigation-surviving cache tier, the persistent shell. Replaces `window.location.assign()` once the work-unit surface is resilient to soft nav; full reload remains an instrumented fallback.

**Public API (sketch).** `operationalTransition(targetHref, { warm })` replacing `adminV2CommitNavigation`; `navigationSurvivingCache` (sessionStorage-backed) for VM/bootstrap snapshots.

---

# §2 — New platform modules

| Module | Path | Exports (primary) | Consumes |
|--------|------|-------------------|----------|
| Motion tokens (TS) | `web/lib/motion/motionTokens.ts` | `MOTION_DURATION`, `MOTION_EASING`, `motionChoreography()`, `MOTION_CHOREOGRAPHY` | — |
| Motion CSS | `web/app/globals.css` (`@theme` + keyframes) | `--motion-*` vars, `.motion-*` classes, choreography keyframes | — |
| Reveal contract | `web/lib/experience/reveal/revealContract.ts` | `createRevealContract()`, `RevealRegionState` | Motion |
| Reveal React binding | `web/lib/experience/reveal/useRevealContract.ts` | `useRevealContract()` | reveal contract |
| Interaction states | `web/lib/experience/interaction/interactionStates.ts` | `INTERACTION_FEEDBACK`, `acknowledge()` | Motion |
| Interaction React binding | `web/lib/experience/interaction/useInteractionState.ts` | `useInteractionState()` | interaction states |
| Editable state machine | `web/lib/experience/editing/editableRuntime.ts` | `editableReducer`, `EditableState` (pure) | — |
| Editable React runtime | `web/lib/experience/editing/useEditableRuntime.ts` | `useEditableRuntime()` | state machine, save coordinator, Interaction |
| Universal dirty-guard | `web/lib/experience/editing/dirtyGuard.ts` | `registerDirtyGuard()`, `confirmDiscardIfDirty()` | save coordinator |
| Continuity orchestrator | `web/lib/experience/continuity/continuity.ts` | `withContinuity()`, `preserveScrollFocus()` | Motion, reveal |
| Navigation transition | `web/lib/experience/navigation/operationalTransition.ts` | `operationalTransition()` | continuity |
| Navigation cache | `web/lib/experience/navigation/navigationSurvivingCache.ts` | `navigationSurvivingCache` | — |

**Note on placement:** `web/lib/experience/` is a new namespace dedicated to the Experience Layer, keeping it discoverable and ownable as a platform tier. Motion lives at `web/lib/motion/` per the Motion Doctrine's stated path (it is foundational and consumed beyond the Experience Layer, e.g. public site).

---

# §3 — Existing modules to remove or merge

The Experience Layer is partly a **consolidation**. These are absorbed or deleted as their replacement lands — never both kept in parallel.

| Existing | Disposition | Replaced by | When |
|----------|-------------|-------------|------|
| Scattered CSS durations/easings across `globals.css`, `adminV2.css`, `workspace.css`, `bosIdentity.css` | **Merge → tokens** | Motion System (Cap 1) | Phase 2 (motion adoption) |
| `EditablePersonContactCard` self-managed editing (Pattern B) | **Remove** | Editable Card Runtime (Cap 5) | Phase 4 |
| `LayoutRuntimeDrawerEditProvider` bespoke save/dirty wiring | **Merge → runtime** | Editable Card Runtime wraps it | Phase 4 |
| Per-drawer dirty-guard (`PersonDrawerUnsavedChangesModal` wiring only on Person) | **Merge → universal** | `dirtyGuard.ts` (Cap 5) | Phase 1 (pulled early — stops data loss) |
| Per-page KPI deferral wiring (`scheduleAdminV2BackgroundWork` for KPI; `kpi_ready: true` / `suppress_kpi_strip` at call sites) | **Remove the opt-out** | Reveal System owns region readiness (Cap 3) | Phase 1 |
| `workspaceRevealGate` / `workUnitRevealGate` / `deptRevealGate` (three near-duplicate gates) | **Merge** | One `createRevealContract` engine; gates become instances | Phase 3 (after motion) |
| Ad-hoc hover/press/focus transition CSS on buttons/rows/tiles | **Merge → tokens + Interaction** | Interaction System (Cap 4) | Phase 2 |
| `adminV2CommitNavigation` (`window.location.assign`) | **Replace (with fallback retained)** | `operationalTransition` (Cap 6) | Phase 5 (keystone, flagged) |
| `WorkUnitWorkspaceColdShell` on the *outbound* path | **Remove (outbound only)** | Continuity hold-prior-payload (Cap 2) | Phase 1 (interim suppress), Phase 5 (structural) |
| Scattered skeleton stagger delays (55/70/90/110/120/165ms) | **Remove** | One coherent reveal; no above-fold stagger | Phase 2 |

**Merge, never fork:** the rule is that a capability and the thing it replaces never ship as two live options. The new module lands, consumers migrate, the old path is deleted in the same track.

---

# §4 — Dependency relationships

**Build order is the reverse of consume order: leaves first.**

```
Motion System (1)
   ├──► Reveal System (3) ───────────────┐
   ├──► Interaction System (4) ──────┐    │
   └──► Editable Card Runtime (5) ◄──┘    │   (editing uses Interaction's acknowledge)
            │                             │
            └──────────────┐             │
                           ▼             ▼
                    Continuity System (2)
                           │
                           ▼
                    Navigation Continuity (6)
```

| Capability | Depends on | Depended on by |
|------------|------------|----------------|
| 1 Motion | — | 2, 3, 4, 5, 6 (all) |
| 3 Reveal | 1 | 2 |
| 4 Interaction | 1 | 5 |
| 5 Editable Card Runtime | 1, 4, (save coordinator) | — |
| 2 Continuity | 1, 3 | 6 |
| 6 Navigation Continuity | 1, 2 | — |

**Critical path:** Motion → Reveal → Continuity → Navigation. Editing (5) and Interaction (4) are a parallel branch that can proceed once Motion exists. This means **two independent build streams after Motion**: the *transition* stream (Reveal → Continuity → Navigation) and the *editing* stream (Interaction → Editable Runtime). They reconverge only at the doctrine level.

---

# §5 — Implementation sequence (regression-minimizing)

The sequence follows the roadmap's four tracks but is re-keyed to **module dependency** and **risk**. Each step is independently shippable and reversible; nothing forks.

### Step 0 — Foundation: Motion System ✅ *(BUILT — zero behavioral risk)*
Shipped `web/lib/motion/motionTokens.ts` + `:root` motion vars and the 5 choreography primitives (`.motion-reveal/navigate/swap/acknowledge/recede`) + `settle` + interaction primitives + reduced-motion handling in `globals.css`, with `web/tests/motion/motionTokens.test.ts` (8 tests, passing). **Additive only** — introduces tokens without changing any existing animation; nothing consumes it yet, so it cannot regress. Satisfies all four per-capability artifacts (ownership, documented API, doctrine, migration). The reduced-motion block is also a net accessibility gain (`globals.css` had none).

### Step 1 — Phase 0 quick-wins *(Small, low risk, stops active harm — pull forward)*
- **Universal dirty-guard** (`dirtyGuard.ts`): lift the Person-drawer guard into the save coordinator as a platform invariant. *Stops silent edit loss.* Uses the existing `drawerOperatingIsDirty()`.
- **KPI reveal enforcement** ✅ **DONE**: removed the workspace hardcoded `kpi_region_ready` bypass and routed real KPI structural readiness into `computeWorkspaceRevealGate`; verified + test-locked the work-unit gate (already correct). Slow per-dept growth values settle post-reveal (Motion `settle`), not blocked. Tests in `web/tests/adminV2/kpiRevealGating.test.ts`. *Stops the half-built workspace.*
- **Suppress outbound skeleton** ⚠️ **PARTIAL**: `WorkUnitSlugRouteHost` holds instead of flashing its cold shell once the URL has left this work unit (`isLeavingWorkUnitSurface` guard). Closes the soft-transition window; the dominant full-reload document-swap flash remains Track 1's. Tests in `web/tests/admin/workUnitOutboundHold.test.ts`. *Stops the leaving-skeleton on the soft path.*

These need only Motion's `settle` for the KPI case; otherwise they are wiring corrections. Lowest risk, highest immediate perception.

### Step 2 — Phase 2: Motion adoption
Migrate the four CSS files onto tokens; collapse 50+ durations → 4; wire drawer `recede`/`swap` and the `settle` for deferred values; add the motion lint. Per-surface, reversible, visually verifiable.

### Step 3 — Reveal System generalization
Extract `createRevealContract`; refactor the three gates to instances; register cards/KPI/editable regions. Behind parity tests against the current gates so reveal timing cannot regress.

### Step 4 — Interaction + Editable Card Runtime *(editing stream)*
Ship Interaction System; ship Editable Card Runtime over the save coordinator; migrate Pattern B → runtime; delete the fork. Parity tests on save semantics; Pattern A is already production-proven.

### Step 5 — Continuity + Navigation Continuity *(keystone, flagged)*
Work-unit soft-nav resilience → navigation-surviving cache → `operationalTransition` behind a flag with `window.location.assign` retained as instrumented fallback. Last, because the surfaces it carries are already premium and its blast radius is the largest. Watch cancelled-navigation rate as the regression signal.

### Regression-control rules (all steps)
1. **Leaf-first, additive-first.** A module ships and is tested before any consumer migrates to it.
2. **No forks.** Replacement and replaced never both live; migration completes within the track.
3. **Parity tests at every seam** that changes proven behavior (reveal timing, save semantics, navigation success rate).
4. **Fallback for the keystone.** Soft navigation never removes the full-reload safety path until the cancelled-nav rate proves it unnecessary.
5. **Doctrine updates ride the code.** Strengthening a law updates the locked performance docs in the same PR.

---

## Per-capability artifact checklist (definition of "built")

Each capability is "built" only when it has all four:

- [ ] **Clear ownership** — one subsystem in the Experience Doctrine ownership map.
- [ ] **Documented API** — public exports with signatures, in-module doc comment + a section here.
- [ ] **Implementation doctrine** — the rules it enforces (in the Experience/Motion doctrine it serves).
- [ ] **Migration strategy** — what it replaces (§3) and the parity guarantee.

---

## When this doc must be updated

A capability's module path or public API changes; a new capability enters the layer; or the dependency graph changes.
