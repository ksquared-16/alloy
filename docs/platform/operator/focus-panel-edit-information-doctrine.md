# Focus Panel Edit Information Doctrine

**Status:** Approved / frozen (June 2026) — Phase 1 complete; edit mutations deferred to Phase 2  
**Scope:** Alloy OS Focus Panel (System 5 Universal Cards)  
**Related:** [card-interaction-expansion-doctrine.md](./card-interaction-expansion-doctrine.md), [universal-universal-card-archetypes.md](./universal-universal-card-archetypes.md), [card-content-template-field-inclusion-doctrine.md](./card-content-template-field-inclusion-doctrine.md), [operational-action-doctrine.md](./operational-action-doctrine.md)

---

## Law

**Cards summarize. Expansions and drills edit.**

The Focus Panel is the operational command surface for a subject record. Cards answer business questions at a glance. Editing canonical field truth happens in **expansions**, **profile drills**, or **embedded workspaces** — never by reopening the legacy full-width drawer as the default edit path.

---

## Current-state blocker (June 2026)

When **`focusPanelActive`** is on, `OpportunityDrawerVmRuntime` renders the Focus Panel body **instead of** the LayoutDoc overview, so the `LayoutRuntime*` operational edit stack (`LayoutRuntimeBlockEditProvider`, inline field controls, `drawerOperatingSaveCoordinator`, `EditablePersonContactCard`, inquiry children grid, relationship action buttons) is **not mounted**. The Focus Panel is therefore **read-only for most operational data** today.

**Next implementation priority (in order) — not "more cards":**

1. Card expansion (runtime)
2. Focused item state (selected child / contact / document / task)
3. Card-level actions (section / row / contact, not header-only)
4. Inline operational editing (port `LayoutRuntime*` edit behavior into cards)
5. Save / dirty behavior
6. Collection editing

**First editable card: Household.** **Second: Children.** Rationale and full sunset sequencing: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

---

## Non-goals (this phase)

- No full inline edit system across all card types.
- No new drawer modes or split-geometry changes.
- No bypass of permissions, lifecycle rules, or workflow events.
- Configuration Builder authoring of edit templates (deferred).

---

## Edit affordance by archetype

| Archetype | Summary role | Edit affordance | Save path |
|-----------|--------------|-----------------|-----------|
| **Profile** | Identity + contact fields | **Expansion / Profile drill** — Edit on expansion header or field row | Canonical field PATCH via existing admin field edit paths |
| **Collection** | Row list (e.g. children) | **Row click** changes subject or opens row drill; edit on row expansion | Subject switch + child profile drill |
| **Status** | Blockers / readiness issues | **Drill** to resolving work (task, document, status action) | Domain action / workflow — not free-text card edit |
| **Action** | Primary next step | **Header or card CTA** executes registered action | Action registry / preflight |
| **Summary** | Narrative insight | Read-only in Summary mode; link to Work drill if actionable | N/A |
| **Metric** | KPI readout | Drill to underlying queue/work only | N/A |
| **Timeline** | Activity history | Activity mode tab — compose/reply in comms workspace | Communications platform |
| **Launcher** | Work entry points | Opens embedded workspace or BOS handoff | Domain workspace owns mutation |
| **Embedded workspace** | Scheduling, documents, forms | **Domain owns editing** inside embedded surface | Domain APIs (scheduling, documents, forms) |

---

## Operator flows (reference)

### Parent phone number

1. **Household / Profile card** shows phone summary (`—` when missing).
2. Operator expands Household or opens Profile drill.
3. Inline editable expansion (Phase 2) or profile drill shows phone field.
4. Save updates canonical `person.primary_phone` (or configured field binding).
5. Card summary recomposes from refreshed VM.

### Children

1. **Collection card** summarizes child rows.
2. Expand shows child rows with human status labels.
3. Row click **changes subject** to Child Focus Panel (subject switch, not drawer).
4. Child Profile expansion/drill edits child fields.

### Schedule

1. **Schedule / Tour card** opens embedded Scheduling workspace or drill.
2. Edits occur in scheduling workspace — not generic card text fields.

---

## Missing fields (`—`)

When permissions allow mutation, missing profile values should expose **Edit** in expansion (not on collapsed micro/compact summary). Collapsed cards stay read-only previews.

---

## Implementation phases

### Phase 1 (current)

- Document edit law and archetype placement.
- Centralize human display labels (`focusPanelDisplayLabels.ts`).
- Header + chip polish; no edit mutations.

### Phase 2

- Profile expansion: reuse existing layout runtime field edit components where safe.
- Collection row → subject switch wiring audit.
- `data-edit-affordance="expansion"` markers on Profile/Collection expansions.

### Phase 3

- Experience Builder: field inclusion + edit template per card content template.
- Embedded workspace registry (scheduling, documents) with explicit edit ownership.

### Deferred to configuration

- Per-tenant edit field allowlists.
- Card-level edit template authoring in Configuration Workspace.
- Vertical-specific label catalogs (map `new_inquiry` → tenant label override).

---

## Regression guards

- Raw status keys must not render in Focus Panel chips or header.
- Edit affordances must not appear on collapsed Summary cards except Action CTAs.
- Subject switch must not remount operational surface or reset queue selection.

---

## Implementation freeze (June 2026)

**Approved and frozen** — do not redesign without explicit platform review.

| Surface | Frozen state |
|---------|----------------|
| **Entry** | Operational Mode default — condensed queue, resolved subject, auto-open Focus Panel |
| **Header** | Subject Identity Block — icon tile, title, context chips, structured Mission, BOS + Manage |
| **Status** | Read-only chip — no direct dropdown; changes via operational actions ([operational-action-doctrine.md](./operational-action-doctrine.md)) |
| **Manage** | Registry-backed `header_menu` — same catalog as command rail; no placeholder admin stubs |
| **Cards** | System 5 Universal Cards + archetypes (5A) |
| **Interaction** | 5B / 5C documented; full expansion/template authoring not yet built |
| **Browse** | Full-width queue dormant — not default operator path |

**Out of scope for further visual passes:** split geometry, queue compression, operational entry gate, BOS rail, WUC shell, card derivation logic.
