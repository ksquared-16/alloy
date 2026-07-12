---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Alloy OS — Runtime Completion & Freeze

**Status:** ✅ **RUNTIME COMPLETE — FROZEN (June 2026).**
**Scope:** Documentation + architecture freeze only. No redesign, no new runtime primitives, no feature work.
**Audience:** future Cursor threads, engineers, configuration-runtime authors.

> This is the **single canonical reference** for the completed Alloy OS Runtime. After this freeze, all work moves to **Configuration Runtime**, the **Field System**, and **frontend implementation/polish**. The runtime itself is not to be redesigned.

**Companion docs (do not duplicate — this doc synthesizes + freezes them):**

| Doc | Role |
|-----|------|
| [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md) | Operational Mode default state, subject resolution, Browse retirement |
| [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) | Behavior synthesis (doctrine → spec) |
| [`canonical-interaction-model.md`](./canonical-interaction-model.md) | Primitives (the spine) |
| [`interaction-grammar.md`](./interaction-grammar.md) | Laws (ownership + movement) |
| [`universal-card-system.md`](./universal-card-system.md) | System 4 card design freeze |
| [`runtime-perspective-compatibility-layer.md`](./runtime-perspective-compatibility-layer.md) | Interim perspective derivation |
| `../../sprints/archive/06_2026/alloy_os_operational_workflow_validation.md` (historical: `../../sprints/archive/06_2026/alloy_os_operational_workflow_validation.md`) | Final design pressure test |

---

## Deliverable 1 — Runtime Completion Summary

Seven systems make up the completed runtime. Each is summarized by purpose, ownership, runtime behavior, major decisions, frozen constraints, and future configuration owner.

### 1.1 Runtime Shell

- **Purpose:** The universal workspace chrome — navigation, scope, and the surface that hosts every operational domain identically.
- **Ownership:** Platform.
- **Runtime behavior:** `/workspace` is the operator home. Selecting a business process / work unit renders the Work Unit Context + operational surface. The shell never remounts on record selection.
- **Major decisions:** Work-centric, not record-centric. One shell for all domains (enrollment, billing, attendance, scheduling, …). No department-first navigation.
- **Frozen constraints:** One shell. No per-domain shell forks. Navigation is business-process driven.
- **Future configuration owner:** Business Processes (which processes/groups appear, order, default landing).

### 1.2 Work Unit Context

- **Purpose:** The fixed top section inside a work unit: title, KPI strip, perspective rail. Its bottom **is** the operational-surface top.
- **Ownership:** Platform (render); Analytics + Business Processes (content).
- **Runtime behavior:** Compact ~112px stacked bar (flag on). Sticky; does not scroll. Search/filter live in the **Queue column header**, not here.
- **Major decisions:** Inline KPI value+label pairs (no boxed cards). Active perspective pill = Bend Pine. Empty/em-dash KPIs filtered out.
- **Frozen constraints:** WUC owns title + KPI + perspective rail only. Its right edge is authoritative for operational-surface right alignment (`--alloy-os-op-surface-right`).
- **Future configuration owner:** Analytics (KPI placements), Business Processes (perspective definitions + title).

### 1.3 Operational Surface

- **Purpose:** The shared plane below the WUC holding **Queue · Focus Panel · BOS** as peer regions.
- **Ownership:** Platform.
- **Runtime behavior:** All three share one top Y (`--alloy-os-op-surface-top`) and one bottom Y (`--alloy-os-op-surface-bottom`, viewport − 16px); each scrolls internally. **Operational Mode is the default state:** condensed queue + resolved subject + open Focus Panel. Legacy State 1 (expanded full-width queue) and Browse Mode are **retired from operator UX** — implementations retained as dormant infrastructure.
- **Major decisions:** Peer regions, not a modal over a backdrop. No dim, no click-away outer margin in split. Geometry is measured + published as CSS vars; never hardcoded per domain.
- **Frozen constraints:** Three peer regions. Shared top/bottom Y. BOS never shrinks. No floating/center-floated panel.
- **Future configuration owner:** None — geometry is permanent platform infrastructure.

### 1.4 Queue UX

- **Purpose:** Preview/selection surface for the active perspective.
- **Ownership:** Platform (presenter); Experience Builder (row field selection, future); Record System (data).
- **Runtime behavior:** **Default entry = Operational Mode** — condensed **440px** rail; each row is an **80px four-line, two-column** presenter (`CompressedQueueRow`). On Work Unit open, runtime resolves **Default Operational Subject** via strategy (not “first row”) and opens Focus Panel. Queue header shows branded perspective title + count + search/filter + future strategy override. Row click warm-swaps subject.
- **Major decisions:** Compressed row is an intentionally different presentation, not a squeezed expanded row. Grain-aware (family/household vs child). Children render `Name (age) · Name (age) +N more`. Avatar in a fixed column; status pill in an isolated right column.
- **Frozen constraints:** Queues are **preview/selection only** — never operational truth. Row height 80px (76 min / 84 max). Width 440px (430–450 band). No false empty states while loading/held.
- **Future configuration owner:** Experience Builder (`queue_row_layout` per perspective/grain), Perspective config (search/filter/group/sort options, children display max).

### 1.5 Focus Panel

- **Purpose:** The docked peer that hosts the universal drawer (Subject + Mission → Summary / Work / Activity modes → Cards).
- **Ownership:** Platform (shell + geometry); Experience Builder (card composition); Business Processes (mission/mode default).
- **Runtime behavior:** `position:fixed` peer. Left = queue right + 16px gutter + 1px pad. **Right edge aligns with the WUC right edge** (`right: calc(100vw − --alloy-os-op-surface-right)`). Top/bottom = shared surface Y. **Opens automatically** on Work Unit entry when Default Operational Subject resolves. Stable across record swaps (open → swap → close, no remount/flash). Perspective change re-resolves subject for new lens.
- **Major decisions:** Width is implied by left/right (no fixed width) so the panel and WUC terminate at the same X. Drawer geometry is re-measured on split toggle in `useLayoutEffect` so it never reuses pre-split full-band bounds.
- **Frozen constraints:** Docked peer, not a modal. Right edge bound to WUC. Never consumes BOS. Subject/Mission/Mode spine is frozen.
- **Future configuration owner:** Experience Builder (which cards, order, span, visibility), Business Processes (default mission/mode per stage).

### 1.6 Universal Card System (System 4)

- **Purpose:** Reusable **business primitives** that answer one operational question each — the content of the Focus Panel body.
- **Ownership:** Platform (anatomy, tiers, density, grid engine, states); Experience Builder (composition); Analytics (metric cards); Actions/Workflow (card actions); Record System (data).
- **Runtime behavior:** **Design frozen — no production code until checklist approved.** Concept B responsive grid (≤4 cols ≥1040px, 16px gaps, min 240px / 160px micro), collapses by tier priority.
- **Major decisions:** A card is a business primitive, not a field container. Header/body/footer anatomy. Coordinated reveal (no per-section skeletons).
- **Frozen constraints:** Anatomy, tiers, density, grid engine, states are platform-owned and frozen. No card implementation until the System 4 checklist is approved.
- **Future configuration owner:** Experience Builder (card composition + fields/widgets), Analytics (metric/KPI cards).

### 1.7 Operational Workflow Validation

- **Purpose:** Final design pressure test — proves the frozen runtime operates Enrollment, Billing, Scheduling, and Attendance with **zero new primitives**.
- **Ownership:** Platform (validation artifact).
- **Runtime behavior:** Each domain composes Summary/Work/Activity from the frozen card system. Stage changes are Mission + card composition, not new primitives. Grain switch uses the frozen Subject cross-fade.
- **Major decisions:** Verdict = **the runtime is sufficient**. No missing primitive found across four domains.
- **Frozen constraints:** No new runtime primitive may be introduced to support a domain; domains are expressed via configuration.
- **Future configuration owner:** Business Processes + Experience Builder per domain.

---

## Deliverable 2 — Current Runtime Implementation

Status legend: **✅ Implemented** · **🟡 Partial** · **🧊 Design frozen only** · **🚩 Behind flag** · **✨ Polish only**

| System | Status | Notes |
|--------|--------|-------|
| Runtime shell / workspace | ✅ | Existing AdminV2 workspace shell; work-unit surface |
| Work Unit Context (Concept B bar) | ✅ 🚩 | `WorkUnitCommandSurface` flag branch (`.adminv2-os-context`) |
| Operational surface geometry | ✅ 🚩 | Peer Queue · Focus Panel · BOS; measured CSS vars |
| Queue State 1 (expanded) | ✅ dormant | Retired from operator UX — `QueueBlock` retained |
| Queue Operational Mode (condensed + auto subject) | 🟡 planned | Doctrine: [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md) |
| Queue State 2 (compressed) | ✅ 🚩 | `CompressedQueueRow` + `CompressedQueueHeader` |
| Compressed queue header (branded title/count) | ✅ 🚩 | `resolveCompressedQueueHeader` |
| Focus Panel dock geometry | ✅ 🚩 | `computeAlloyOsFocusPanelBounds` + edge alignment |
| Record switching (no remount) | ✅ 🚩 | Split controller; perspective-change closes panel |
| Runtime Perspective | 🟡 🚩 | **Compatibility layer** — derived, not a schema |
| Universal Card System | 🧊 | Design freeze; **no production code** |
| Operational workflow validation | 🧊 | Canvas + sprint doc; design pressure test |
| Queue/Focus Panel visual polish | ✨ | Spacing, hover, animation remain |

### Files

**Runtime flag + geometry**
- `web/lib/adminV2/runtime/alloyOsRuntimeFlag.ts` — flag, split predicate, width/row constants
- `web/lib/bos/drawerWorkspaceGeometry.ts` — `computeAlloyOsFocusPanelBounds`, `isAlloyOsSplitGeometryActive`, `applyAlloyOsQueuePeerGeometryVars`, op-surface bounds
- `web/app/adminV2/components/AlloyOsRuntimeSplitController.tsx` — root attributes + measured CSS vars (`--alloy-os-op-surface-top` / `-col-top` / `-right`)
- `web/app/adminV2/components/alloyOsRuntime.css` — flag-gated split CSS
- `web/lib/adminV2/runtime/useAlloyOsRuntimeSplitActive.ts` — reactive split hook

**Queue UX**
- `web/app/adminV2/components/workspace/blocks/CompressedQueueRow.tsx`
- `web/app/adminV2/components/workspace/blocks/CompressedQueueHeader.tsx`
- `web/lib/adminV2/runtime/compressedQueueRowFields.ts` — grain-aware field resolution + `CompressedQueueRowLayout` types
- `web/lib/adminV2/runtime/compressedQueueHeader.ts`
- `web/lib/adminV2/runtime/compressedQueueRowCue.ts`
- `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` — queue header host

**Perspective (compat)**
- `web/lib/adminV2/runtime/perspective/deriveRuntimePerspective.ts`
- `web/lib/adminV2/runtime/perspective/RuntimePerspectiveContext.tsx`

**Drawer contract (runtime-sensitive)**
- `web/lib/adminV2/runtime/contract/*`

### Tests
- `web/tests/adminV2/runtime/queueUxConceptB.test.ts` — row/width/header CSS + token contract
- `web/tests/adminV2/runtime/compressedQueueRowFields.test.ts` — grain-aware 4-line layout
- `web/tests/adminV2/runtime/compressedQueueHeader.test.ts` — branded title/count
- `web/tests/adminV2/runtime/alloyOsRuntimeSplitLayout.test.ts` — dock geometry + outside-click
- `web/tests/adminV2/runtime/alloyOsSplitGeometryActive.test.ts` — split inference
- `web/tests/adminV2/runtime/workspaceLayoutSurface.test.ts` — op-surface vars
- `web/tests/adminV2/runtime/runtimePerspective.test.ts` / `runtimePerspectiveLanes.test.ts`
- `web/tests/adminV2/runtime/adminV2RuntimeContract.test.ts`
- Runtime-performance protected suite (see `.cursor/rules/adminv2-runtime-performance.mdc`)

### Feature flags
- `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1` → `ALLOY_OS_RUNTIME_ENABLED`. **Default off.** With the flag off, every path is a no-op and legacy behavior is unchanged.
- Root attributes: `data-alloy-os-runtime="on"`, `data-alloy-os-runtime-perspective`, `data-alloy-os-runtime-split="true"`.

### Known gaps (intentional)
- Universal Cards not implemented (design freeze).
- Focus Panel header (Subject/Mission) is spec'd, not final-built.
- Group / Sort / Bulk queue controls deferred.
- Hover "Open"/overflow on compressed rows not added.
- **Operational Mode as default Work Unit entry** — doctrine accepted; runtime auto-subject resolution not yet implemented.
- **Default Operational Subject Strategy** — configuration deferred; platform resolver catalog not yet in code.
- **Browse Mode / full-width queue entry** — retired from UX; dormant code paths remain.

### Intentional compatibility layers
- **Runtime Perspective** is derived from existing `queue_definition` / lanes — not a new schema or config UI.
- **Compressed row field selection** uses default `CompressedQueueRowLayout` per grain — future Experience Builder config.
- **Queue header eyebrow** ("Active lens") + count unit are compat strings — future Perspective config.

---

## Deliverable 3 — Runtime Doctrine

### Mission
Operators move through **work**, not software. The runtime presents operational meaning; schema lives underneath. One universal runtime serves every domain.

### Runtime philosophy
- Records own truth; projections observe; cards talk through records.
- Queues are preview/selection, never truth.
- Configuration expresses the platform; the runtime stays universal.
- The runtime never exposes raw configuration as the primary experience.

### Permanent runtime primitives (frozen spine)
```
Workspace → Perspective → Queue → Row → Drawer → Subject → Mission
  → Summary / Work / Activity (Modes) → Card → Section → Field
```
These are the only runtime primitives. **No new runtime primitive may be added without explicit approval.**

### Terminology (canonical / final)
- **Workspace** — only `/workspace`, the operational home.
- **Work Unit Context** — the fixed top section inside a work unit (title + KPI + perspective rail). *Not* "Workspace Context."
- **Operational Surface** — the Queue · Focus Panel · BOS plane below the WUC.
- **Focus Panel** — the docked peer hosting the universal drawer. *Not* "drawer modal" in split.
- **Universal Cards** — business primitives inside the Focus Panel body.
- **Subject** = Record of Attention; **Mission** = Context Frame.

### Operational Mode (default state)

Perspective active, **Default Operational Subject resolved**, Focus Panel open, queue condensed to 440px rail. This is the **only normal operator entry state** for a Work Unit.

Detail: [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

### Legacy State 1 / Browse Mode (dormant)

Expanded full-width queue without an active Focus Panel subject. **Retired from operator UX.** `QueueBlock` expanded presenter and browse entry paths remain in codebase for dormant/future use — not exposed in runtime chrome, not configured in Experience Builder.

### Record switching
Opening/swapping a record keeps the same perspective → panel stays open, no remount, no flash. **Perspective change** re-resolves queue + default subject for the new lens (does not return to full-width browse).

### Queue ownership
Platform owns the presenter + geometry. Experience Builder will own row field selection. Record System owns data. **Queues never hold operational truth.**

### Focus Panel ownership
Platform owns shell + geometry. Experience Builder owns card composition. Business Processes own default mission/mode. Right edge is bound to the WUC right edge.

### Card ownership
Platform owns anatomy/tiers/density/grid/states. Experience Builder owns composition. Analytics owns metric cards. Actions/Workflow own card actions.

### BOS ownership
Platform owns the rail overlay + its top/bottom alignment to the shared surface Y. BOS is the right peer and **never shrinks**. Width/right are anchor-measured (≈320px).

### No future runtime primitives
The spine above is complete. Domains are expressed through **configuration**, not new primitives. Any proposed new runtime primitive requires explicit architectural approval and a doctrine amendment.

---

## Deliverable 4 — Ownership Matrix

| Platform Primitive | Platform Owner | Configuration Owner | Data Owner | Current Implementation | Future Refactor |
|--------------------|----------------|---------------------|------------|------------------------|-----------------|
| **Queue** | Runtime presenter + geometry | Perspective (filter/sort/group), Experience Builder (row layout) | Record System / queue responders | `QueueBlock`, `CompressedQueueRow` (🚩) | `queue_row_layout` config drives fields |
| **Focus Panel** | Shell + dock geometry | Experience Builder (cards), Business Processes (mission) | Record System | `computeAlloyOsFocusPanelBounds` + split controller (🚩) | Composition from config, not defaults |
| **Cards** | Anatomy/tiers/density/grid/states | Experience Builder (composition) | Record System | 🧊 design freeze | Build after System 4 checklist |
| **Perspectives** | Runtime abstraction | Business Processes | `queue_definition` / lanes | Derived compat layer (🚩) | `perspectives` config owned by BP |
| **KPIs** | WUC strip render | Analytics placements | Metrics service | `model.kpis` (em-dash filtered) | Analytics-owned placement config |
| **Fields** | Field render primitive | Experience Builder + Field System | Record System | Existing field rendering | Field System ownership |
| **Actions** | Action invocation path | Actions/Workflow config | Action log / events | Existing canonical action path | Config-driven card actions |
| **Statuses** | Status/state machine | Status & State config | Record System | Existing status system | Config-owned vocabularies |
| **Communications** | Comms surfaces | Communications config | Comms data | Existing comms platform | Card-embedded comms |
| **Timeline** | Activity mode render | Experience Builder (supporting cards) | Activity/event data | Existing activity | Horizontal timeline + embeds |
| **BOS** | Rail overlay + alignment | BOS config / scope | BOS / assistant data | `.adminv2-bos-rail-overlay` (🚩 align) | Config-driven scope/assist |

---

## Deliverable 5 — Frontend Roadmap (polish only)

No configuration work. Frontend implementation/polish remaining:

- **Queue spacing** — final vertical rhythm, group-header spacing.
- **Queue visual polish** — row hover, selected-rail motion, density tuning.
- **Focus Panel header implementation** — Subject + Mission header (currently spec'd, not final-built).
- **Card implementation** — build Universal Cards after System 4 checklist approval.
- **Animation polish** — split transition, panel reveal, perspective change.
- **Responsive polish** — narrow-rail collapse, grid breakpoints.
- **Hover polish** — compressed row "Open"/overflow affordance.
- **Accessibility** — focus order across peer regions, ARIA for queue header/controls, reduced-motion.

---

## Deliverable 6 — Configuration Handoff

What **Configuration Runtime** must own (identification only — **do not implement here**):

| Area | Configuration responsibility |
|------|------------------------------|
| **Business Processes** | Process/stage definitions, perspectives (which lenses, order, default mission), navigation surfacing |
| **Experience Builder** | Card composition (which cards, order, span, visibility), queue row layout, fields/widgets per surface |
| **Fields** | Field System ownership — definitions, catalogs, visibility, validation |
| **Statuses** | Status/state vocabularies, transitions, attention rules |
| **Analytics** | KPI/metric placements, metric cards |
| **Actions** | Action exposure per surface/card, canonical invocation routing |
| **Workflows** | Registered event keys, execution paths, card workflow entry points |
| **Communications** | Templates, audiences, card-embedded comms |
| **BOS** | Assistant scope, perspective seeding, assist routing config |
| **Entity Model** | Entity/grain definitions; lead vs child authority |
| **Record System** | Record of Truth, resolvers/responders, org/department/site scoping |

---

## Deliverable 7 — Documentation

- This document is the **canonical runtime completion reference**; future threads start here.
- `alloy-runtime-specification.md` remains the behavior synthesis and is current with edge-alignment + gutter geometry.
- Terminology is unified: **Workspace**, **Work Unit Context**, **Operational Surface**, **Focus Panel**, **Universal Cards** use final names across operator docs. "Workspace Context" is obsolete (superseded by **Work Unit Context**); "drawer modal" is not used for the docked split panel (**Focus Panel**).
- `docs/README.md` links this document in the operator load order.

---

## Deliverable 8 — Final Runtime Verdict

> **The Alloy OS Runtime is considered complete.**

The runtime spine, operational surface, queue UX, Focus Panel dock, and the Universal Card System (design freeze) have passed architectural validation across Enrollment, Billing, Scheduling, and Attendance with **zero new primitives required**.

Everything after this freeze moves into:

1. **Configuration Runtime** (Business Processes, Experience Builder, Perspectives, Analytics, Actions, Workflows, Communications, BOS, Entity/Record System).
2. **Field System.**
3. **Frontend implementation/polish** (Deliverable 5).

**Do not continue runtime redesign. Do not add runtime primitives without explicit approval. Stop.**

---

## Presentation Runtime carry-forward (July 2026)

The /surfaces **authoring** work (PRs #61/#63/#64/#68) is complete: the composition model is frozen and the builders author real, persisted configuration (stacked queue rows, grain/conditions, custom fields by namespace, nested surface editing). The **next runtime work** is *adoption* — making the live runtime consume that config without redesigning the model. The authoritative plan, deferral list, and "do not redesign" boundary live in [`presentation-runtime-carry-forward.md`](./presentation-runtime-carry-forward.md). This does not reopen the runtime freeze — it is bounded consumption of already-frozen authoring.
