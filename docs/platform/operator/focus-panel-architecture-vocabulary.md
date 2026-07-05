# Focus Panel Architecture Vocabulary

**Status:** Canonical (June 2026). Lexical layers for Alloy OS operational surfaces.

This document defines the **product vocabulary** new engineers should learn first. Legacy code may still say *drawer* in infrastructure paths; that is intentional during migration — not the mental model.

---

## One sentence

**One Focus Panel**, composed differently for different **operational subjects**.

---

## Canonical terms

| Term | Meaning |
|------|---------|
| **Focus Panel** | The docked operational surface where an operator works a selected subject — header identity, modes, cards, embedded workspace. Product-facing name. |
| **Operational Subject** | What the operator is working on right now — the queue row selection, default subject on Work Unit entry, or linked navigation target. Not a separate UI product. |
| **Subject Composition** | Derived card grid + mode layout for one operational subject (`SubjectComposition`: mode, cards, grid spec). |
| **Activity Cockpit** | The **canonical Activity mode**: a one-viewport operational workspace that **composes existing runtimes** (not rebuilt) — a **Recent Activity ribbon**, a **Communications hero**, a **Work panel** with **Work Items / Notes** tabs, and a **persistent Documents utility**. Surfaces scroll **internally**; the workspace itself does not page-scroll. Component: `OpportunityFocusPanelEmbeddedWorkspace`. |
| **Embedded Workspace** | The set of full operational surfaces (timeline, communications, documents, notes, workflow, audit) defined in `embeddedWorkspaceTabs.ts`. Formerly the primary Activity-mode tab strip; now **composed into the Activity Cockpit**. The full surfaces remain reachable via the cockpit's *View all* affordances (ribbon → Timeline, Documents → files) and the top-level **Work** tab — not a separate nav row. |

Supporting primitives (unchanged): **Mode**, **Universal Card**, **Context Frame**, **Perspective**, **Queue** (preview only).

### Activity Cockpit (canonical Activity mode)

Activity mode is a **one-viewport operational cockpit**, not a tab strip. It **composes existing runtimes** — nothing here is a new or duplicated capability:

| Region | Composed from |
|--------|---------------|
| **Recent Activity ribbon** (top, compact, horizontal; `View all` opens the full timeline) | `LayoutRuntimeActivityTimelineWidget` (`horizontal_timeline`) fed by `resolveLayoutRuntimeActivityTimeline` — labels resolved, never raw keys |
| **Communications hero** (largest, left) | `CommunicationsDrawerSection` (embedded communications runtime — channel-adaptive composer: email = subject + body, SMS = body-only; multiple associated recipients) |
| **Work panel** (right, above Documents) — **tabs: Work Items · Notes** | `LayoutRuntimeTasksWidget` (Work Items) + notes pane |
| **Documents** (persistent operational utility, always visible) | documents pane — uploaded / missing / required / upload at a glance |

**Composition principles:**
- **Reuse, don't rebuild** — the cockpit wires existing runtimes together; it owns no messaging, timeline, or document logic of its own.
- **Internal scrolling over page scrolling** — the workspace fits the viewport; the conversation, work list, and documents scroll **inside** their surfaces. The page holds still (an OS cockpit, not a webpage).
- **No raw keys** — every status/stage/enum renders through the presentation label resolver (`formatLayoutRuntimeStatusLabel`).
- **Embedded Workspace surfaces reachable, not primary** — the full surfaces (timeline, communications, documents, notes, workflow, audit) remain reachable via the cockpit's *View all* affordances and the top-level Work tab; they are no longer the primary Activity experience and the cockpit renders no separate nav row.

### Subject identity ownership (Runtime V1)

The **Focus Panel shell owns subject identity**. On a queue-row click the clicked-row **seed**
(`opportunityQueuePreviewSeed`) becomes the visible subject **synchronously** — the shell header
switches before any payload resolves. **Cards hydrate after the shell commits**, inside the
already-switched shell. A slower or stale payload may render only as body content under a pending
state; it can never change the visible subject identity. Latest click always wins. The legacy
drawer-title path is unreachable while a runtime subject is selected. See
[Surface ViewModel Composition → Queue-click contract](./surface-view-model-composition.md#queue-click-contract-focus-panel-shell-owns-subject-identity).

---

## Lexical layers (do not collapse)

Alloy uses layered names on purpose. Each layer answers a different question:

```
Operator product layer     Focus Panel · Operational Subject · Subject Composition · Activity Cockpit · Embedded Workspace
Presentation components    web/components/admin/focusPanel/*
Runtime derivation         web/lib/adminV2/runtime/focusPanel/*
Subject resolution         web/lib/adminV2/runtime/operationalSubject/*
Infrastructure (legacy)    AdminDrawerContext · composedDrawerPayload · AdminEntityDrawer · vmDrawer/*
```

| Layer | Question it answers | Rename policy |
|-------|---------------------|---------------|
| **Focus Panel** | What does the operator see? | Canonical — use in new code, docs, comments |
| **Operational Subject** | What record/context is selected? | Canonical |
| **Subject Composition** | How are cards arranged for this subject/mode? | Canonical type in `subjectComposition.ts` |
| **Activity Cockpit** | What is Activity mode? | Canonical — the composed one-viewport workspace in `OpportunityFocusPanelEmbeddedWorkspace` |
| **Embedded Workspace** | Where do the full Activity surfaces live? | Canonical surface set — `embeddedWorkspaceTabs.ts`; reachable from the Activity Cockpit via *View all* affordances |
| **Drawer (infra)** | How is payload fetched, cached, revealed? | Keep until migration phase D — changing breaks reveal gates |

**Rule:** New feature work speaks Focus Panel. Infrastructure renames require the runtime-sensitive test suite (see `adminv2-runtime-performance.mdc`).

---

## Code map (canonical paths)

| Concept | Primary module |
|---------|----------------|
| Focus Panel chrome | `web/components/admin/focusPanel/` |
| Card derivation | `web/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts` |
| Subject composition type | `web/lib/adminV2/runtime/focusPanel/subjectComposition.ts` |
| Embedded workspace tabs | `web/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTabs.ts` |
| Docked split signal | `useFocusPanelDocked()` → `useAlloyOsRuntimeSplitActive()` |
| Focus Panel VM alias | `OpportunityFocusPanelViewModel` (= `OpportunityDrawerViewModel` during migration) |
| Default subject resolution | `web/lib/adminV2/runtime/operationalSubject/` |

**Deprecated re-exports (compat only):**

- `activityWorkspaceTabs.ts` → import `embeddedWorkspaceTabs.ts`
- `OpportunityFocusPanelActivityWorkspace.tsx` → import `OpportunityFocusPanelEmbeddedWorkspace.tsx`

---

## Subject Surface presentation layer (Phase C)

Presentation-facing runtime components now have canonical names under
`web/components/admin/subjectSurface/`. These are **compatibility shims** — they re-export the
existing `vmDrawer/*` implementations unchanged. New presentation code should import the canonical
name; the `vmDrawer/*` files remain the implementation (and reveal/payload/cache infrastructure)
during migration.

| Canonical (use in new code) | Implementation (shimmed) | Notes |
|------------------------------|--------------------------|-------|
| `EnrollmentSubjectSurfaceRuntime` | `vmDrawer/OpportunityDrawerVmRuntime` | Enrollment/opportunity Focus Panel runtime |
| `PersonSubjectSurfaceRuntime` | `vmDrawer/PersonsDrawerVmRuntime` | Person/child Focus Panel runtime |
| `SubjectSurfaceRuntime` / `FocusPanelRuntime` | `AdminEntityDrawer` | Router resolving operational subject → runtime |
| `FocusPanelShell` | `drawer/EntityDrawerOperatingShell` | Focus Panel operating chrome |
| `OperationalSubjectViewModel` | `OpportunityDrawerViewModel` | Composed VM for displayed subject |
| `SubjectComposition` | `focusPanel/subjectComposition` | Card grid + mode layout (Phase B) |

Old → new naming map (retire from new code):

| Old | Canonical |
|-----|-----------|
| `OpportunityDrawerVmRuntime` | `EnrollmentSubjectSurfaceRuntime` |
| `PersonsDrawerVmRuntime` | `PersonSubjectSurfaceRuntime` |
| `OpportunityDrawerViewModel` | `OperationalSubjectViewModel` |
| `EntityDrawerOperatingShell` | `FocusPanelShell` |

Barrel: `import { EnrollmentSubjectSurfaceRuntime } from "@/components/admin/subjectSurface"`.

Deprecated compat exports (`OpportunityDrawerVmRuntime`, `PersonsDrawerVmRuntime`) remain available
from the barrel and resolve to the identical module.

---

## Migration phases

| Phase | Scope | Status |
|-------|--------|--------|
| **A** | EmbeddedWorkspace renames + compat re-exports | Done (June 2026) |
| **B** | `useFocusPanelDocked`, `OpportunityFocusPanelViewModel`, `SubjectComposition` | Done (June 2026) |
| **C** | `subjectSurface/` presentation shims (SubjectSurfaceRuntime, FocusPanelShell, OperationalSubjectViewModel) | Done (June 2026) |
| **D0** | Card layer consumes Operational Context; card renderer takes `context` (subject id + truth derived); dead Person Focus Panel surfaces removed | Done (June 2026) |
| **D1/D2 (contract)** | Renderer contract context-first; stale props removed; drawer/VM compat isolated behind `FocusPanelCardCompat` (off main contract); opportunity naming removed from the card path | Done (June 2026) |
| **D1 (re-projection)** | Re-project drill cards (timeline/documents/notes/workflow_steps) + embedded workspace as context-native; retire `OpportunityDrawerVmTabPanes` + `compat` | Pending |
| **D2 (header)** | Header + focus-panel component props adopt `OperationalSubjectViewModel`/`SubjectComposition`; drop `displayVm`/`drawerId`/`DrawerTabKey` from components | Pending |
| **E** | Person/child Subject Composition (real person card blueprints) | Pending |
| **F** | `AdminDrawerContext` → operational subject context; `establishOperationalContext` open verb; payload infra rename | Deferred — reveal/payload contract |
| **G** | Physical deletion of `vmDrawer/*` drawer bodies + legacy shell | Deferred — runtime sprint |

> Full dependency ledger and gates: [`focus-panel-runtime-cutover-report.md`](./focus-panel-runtime-cutover-report.md).

Do **not** bulk-rename composed payload, cache keys, prefetch, or queue reveal gates without explicit runtime sprint approval. Phase C is **shim-only**: it adds vocabulary, not behavior.

---

## What we tell new developers

1. Alloy is **not** drawer-first. Queues preview; the **Focus Panel** is where work happens.
2. The same shell composes differently per **operational subject** and **mode**.
3. **Drawer** in file paths often means *payload infrastructure*, not product language.
4. Read `operational-mode-default-state-doctrine.md` and `operational-surface-design-system.md` for behavior freeze.

---

## Sunset position

The Focus Panel is the **canonical operator surface**; the drawer is reveal/open-state **infrastructure** only. Drawer/tab overview, LayoutDoc drawer authoring, and the lead summary blueprint are legacy/transitional and frozen to new product investment. Universal Cards absorb drawer sections over time. Sunset status matrix, freeze rule, and the editing gap blocker: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

---

## Related

- [`focus-panel-runtime-cutover-report.md`](./focus-panel-runtime-cutover-report.md) — **cutover ledger** (drawer dependency classification + staged removal D0→G)
- [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) — **sunset matrix + freeze rule + editing gap** (convergence lock)
- [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md)
- [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md)
- [`operational-surface-design-system.md`](./operational-surface-design-system.md)
- [`drawer-system.md`](./drawer-system.md) — infrastructure matrix (legacy naming)
- [`canonical-interaction-model.md`](./canonical-interaction-model.md) — interaction spine
