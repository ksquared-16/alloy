---
owner: modules
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Documents and forms

**Status:** Canonical platform module doc.

Forms engine, document handling, enrollment packets — industry-agnostic core with enrollment as reference implementation.

---

## Capabilities

| Area | Status | Entry |
|------|--------|-------|
| Form definitions & versions | Complete | `/admin/forms` |
| Public links & submissions | Complete | Public API routes |
| Packet sessions | Complete | Enrollment packet flows |
| Review rollup MVP | Complete | Packet review console |
| DCP / UX hardening | In Progress | Sprint `later-phase/` |
| Record identity resolution | Complete (promotion candidate) | Processing Case identity review for public lead-capture and Manual Create Lead; locally certified, awaiting staging reconciliation |

---

## Architecture

- **Definitions** — `form_definitions`, `form_definition_versions`
- **Capture** — `form_submissions`, public link tokens
- **Packets** — `packet_sessions` chain steps for multi-form enrollment
- **Documents** — file storage separate from form field capture

---

## Digital Mailroom product model

Digital Mailroom is the operator product for bringing external information into Alloy.
Processing remains the engine underneath; it is not the operator-facing architecture.

**Canonical entry:** AdminV2 sidebar **Processing** → `ProcessingModal` (BOS workspace modal).
Standalone `/admin/processing` is a deep-link host only; the modal is the product surface.

The operator never leaves the modal for `/admin/forms`. Processing owns form authoring and publishing
in-modal via Studio → Forms → Builder.

### Mode pattern (Work vs Studio)

Digital Mailroom reuses the Communications operational modal pattern:

| Level | Component | Work | Studio |
|-------|-----------|------|--------|
| Header | `OperationalModalHeader` | Title + subtitle + Close | same |
| Mode (L1) | `AlloyModeSwitch` via `OperationalWorkspaceModeNav` | **Work** | **Studio** |
| Section (L2) | `CommsModalTabBar` via `OperationalWorkspaceModeNav` | Overview · **Queue** | Forms · Packets · Fields · Branding |
| Execution | `DigitalMailroomShell` children | landing or queue workspace | asset library / builder |

**Visual dividers (locked):**

- **Horizontal** — `border-b border-stone-200` under the level-2 tab row (`OperationalWorkspaceModeNav`)
- **Vertical** — `border-r border-stone-200` between Queue column and review workspace (`PosProcessingWorkspace`)

Shared nav: `web/app/adminV2/components/OperationalWorkspaceModeNav.tsx`

### Tab hierarchy

```
ProcessingModal
└── DigitalMailroomShell
    ├── OperationalModalHeader ("Digital Mailroom")
    ├── OperationalWorkspaceModeNav
    └── execution
        ├── mode=work,  workView=overview  → ProcessingOverviewLanding
        ├── mode=work,  workView=work       → PosProcessingWorkspace (Queue)
        └── mode=studio, studioTab=*        → ProcessingFormsStudio (+ ProcessingFormBuilder)
```

Sub-tab label under Work is **Queue** (not "Work"). Top-level mode label remains **Work**.

### Product spine

1. **Overview** — launch point for importing, resuming active work, or opening Studio assets.
2. **Work → Queue** — folder-aware operational queue + document review.
3. **Studio** — reusable assets: Forms (live), Packets / Fields / Branding (placeholders).
4. **Builder** — canvas-first editor opened from Studio Forms; stays in-modal.

Overview is not a dashboard. It answers: *What am I trying to accomplish?*

The uploaded PDF is evidence. The generated native form is the source of truth.

### Work pipeline

Import Form → Review Alloy's understanding → Generate native form → Studio Builder.

Review uses human language ("Where should this answer go?", "Store on Child"). Implementation
labels stay under Advanced or off-screen.

### Identity resolution and public intake

For lead-capture submissions, the public submit route opens/reuses a Processing Case and persists source facts and candidate resolutions. It does **not** create or link `persons`, `customers`, `customer_members`, or `opportunities` at submit time. Operators review candidates/corrections, build and approve an immutable Commit Plan, then explicitly invoke the executor.

Plausible matches, ambiguity, and contradictions form a blocking **identity-review gate** before plan build, approval, or commit; source adapters may recommend/preselect trusted deterministic matches but may not bypass the gate.

Manual Create Lead uses the same source-agnostic Processing spine. `applyFormIntakeSafe` is retired and throw-only; the C1 comparison helpers are retained for audit, not runtime authority. There is no source-cutover feature flag.

### Studio — Forms and Builder

Canvas-first interaction translated from Surface Builder:

1. **Canvas** — primary artifact
2. **Sections** — primary organizational unit (left rail)
3. **Questions** — primary editable primitive (add via library modal)
4. **Properties** — contextual inspector (360px, last)

Studio folders are configurable definitions with `id`, `label`, `description`, `order`, `accent`,
`hidden`, and `system` behavior. Current defaults are starter folders only.

Intake prefill and embed doctrine: sprint closeouts in `docs/sprints/completed/`.

### Work layout (locked 2026-07-08)

Work review for document imports uses three parent surfaces:

1. **Queue** (~22%) — folder-aware work list
2. **Source document** (~55%) — PDF or recognized regions (hero); scrollable multi-page
3. **Review questions** (~23%) — question resolution inspector

Shared panel chrome: `ProcessingParentPanel`. Folder icons: `ProcessingFolderIcon`.

Visual tokens: Midnight Forge, Bend Pine, Stone, White in shell chrome.

**Lock:** Digital Mailroom V1 UI is approved and frozen. Extend behavior **inside** this shell only.
See `docs/sprints/archive/07_2026/processing-v1-lock-closeout.md`.

---

## Integration points

- Opportunity drawer — packet review modal, form status
- Workflows — submission events
- Field policy — forms parity with settings **planned**
- Processing Identity Resolution — public lead-capture and Manual Create Lead source adapters; facts/resolutions/approval/executor

---

## Related

- `../../platform/modules/documents-and-forms.md` (transitional expanded reference)
- `../../foundation/platform-capabilities.md`
