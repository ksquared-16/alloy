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
| **Embedded Workspace** | Activity-mode horizontal tab workspace inside the Focus Panel (timeline, communications, documents, …). Replaces informal "Activity workspace" naming. |

Supporting primitives (unchanged): **Mode**, **Universal Card**, **Context Frame**, **Perspective**, **Queue** (preview only).

---

## Lexical layers (do not collapse)

Alloy uses layered names on purpose. Each layer answers a different question:

```
Operator product layer     Focus Panel · Operational Subject · Subject Composition · Embedded Workspace
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
| **Embedded Workspace** | Where does Activity-mode drill-in live? | Canonical — `embeddedWorkspaceTabs.ts`, `OpportunityFocusPanelEmbeddedWorkspace` |
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
| **D** | `AdminDrawerContext` → operational subject context + payload infra rename | Deferred — reveal/payload contract |

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

- [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) — **sunset matrix + freeze rule + editing gap** (convergence lock)
- [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md)
- [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md)
- [`operational-surface-design-system.md`](./operational-surface-design-system.md)
- [`drawer-system.md`](./drawer-system.md) — infrastructure matrix (legacy naming)
- [`canonical-interaction-model.md`](./canonical-interaction-model.md) — interaction spine
