# Alloy OS — System 5C — Card Content Templates & Field Inclusion Doctrine

**Revision:** 1  
**Status:** Approved doctrine (June 2026) — **documented; template authoring not fully built**  
**Extends:** [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5) · [`universal-card-archetypes.md`](./universal-card-archetypes.md) (System 5A) · [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (System 5B)

---

## Position in the stack

| System | Owns |
|--------|------|
| **System 5** | Visual design language — hierarchy, tokens, shared grammar |
| **System 5A** | Archetypes — Action, Status, Profile, Collection, … |
| **System 5B** | Interaction models — Expand, Embedded Workspace, Drill View, Change Subject, External |
| **System 5C** | **Content templates & field inclusion** — what information appears at compact, expanded, drill, and workspace depths |

**Core law:** A Universal Card is **not** defined by fields. A Universal Card is defined by:

1. **Archetype** (System 5A)
2. **Content template** (System 5C)
3. **Interaction model** (System 5B)
4. **Expansion behavior** (System 5B)
5. **Subject / domain context**

Fields enter cards **only through a content template**. New fields do **not** automatically appear in compact cards.

---

## 1. Purpose

Alloy must answer: *What information belongs inside this card?*

The answer is **not** “show configured fields.”

The answer is:

```
Field Catalog → Content Template → Card Archetype → Interaction / Expansion → Workspace
```

Content templates are the **mapping layer** between raw record fields and operational meaning. They prevent:

- Compact cards becoming field dumps
- Missing operational data being hidden
- Layout sections bypassing card grammar
- Every new field appearing everywhere by default

---

## 2. Content template definition

A **content template** is a named, reusable specification for how a card (or card family) presents information at each interaction depth.

### A content template owns

| Surface | Responsibility |
|---------|----------------|
| Compact summary | Primary insight, status chip, max rows, computed slots |
| Supporting insight | Second line when operationally useful |
| Missing-information labels | When absence matters; display `—` |
| Expanded detail sections | Ordered groups for Expand interaction |
| Drill fields | Fields required to complete a focused task |
| Embedded workspace handoff | Which workspace + default subview |
| Empty-state copy | Deterministic, domain-specific fallbacks |
| Priority rules | What surfaces in compact vs only in expansion |

### Template identity

Templates are referenced by stable keys, e.g.:

- `enrollment.children`
- `attendance.children`
- `parent.contact`
- `schedule.summary`
- `billing.ledger_summary`
- `readiness.blocker`
- `communications.summary`
- `documents.requirements`

Experience Builder selects a template per card slot; Business Processes may override template variants by stage or mission.

---

## 3. Field inclusion rules

Fields may appear in **four places**:

| Depth | Purpose | Density rule |
|-------|---------|--------------|
| **1. Compact card** | Operationally relevant at a glance | Minimal — meaning first, not schema |
| **2. Expanded card** | Structured supporting detail | More rows; still template-governed |
| **3. Drill view** | Fields needed to complete a focused task | Task-scoped only |
| **4. Embedded workspace** | Domain-owned full detail | Workspace component owns layout |

### Rules

1. **Compact cards** show only operationally relevant information.
2. **Expanded cards** show structured supporting detail — not unbounded field grids.
3. **Drill views** show fields required to complete the focused task (Resolve, Complete, Approve).
4. **Embedded workspaces** show domain-owned detail; cards hand off, they do not duplicate.
5. **Missing fields** display labels with `—` when the absence is useful to the operator.
6. **Missing fields do not clutter compact cards** unless they are operationally meaningful (blocker, required-for-stage, communication-critical).

### Prohibited

- Raw layout section keys as card titles
- Auto-including every Field Catalog field in compact view
- Hiding required missing data in expansion-only views without compact signal
- Using expansion as an unconfigured field dump

---

## 4. Missing information doctrine

Missing information must be **visible when it matters**.

| Scenario | Compact | Expanded / Profile | Other surfaces |
|----------|---------|-------------------|----------------|
| Parent phone missing | Flag only if communication-critical | `Phone —` in Parent Contact template | Communications / Readiness if required |
| Child allergy plan missing | Only if blocking enrollment | Readiness expansion if required | Child workspace for full detail |
| Schedule pattern missing | Only if schedule work is active | Schedule expanded sections | Scheduling workspace |
| Billing email missing | Only if invoicing blocked | Billing profile expansion | Billing workspace |

**Law (from System 5A):** Missing information is shown, never omitted, when the operator needs to confirm or act. Compact cards signal urgency; expanded views show full label/value truth including `—`.

---

## 5. Template types (catalog examples)

| Template key | Archetype | Domain | Compact focus |
|--------------|-----------|--------|---------------|
| `enrollment.children` | Collection | Enrollment | Child name, status signal, highest blocker |
| `attendance.children` | Collection | Attendance | Present/absent today, exception count |
| `parent.contact` | Profile | Household | Primary contact, best phone/email, missing flag |
| `schedule.summary` | Summary / Status | Scheduling | Pattern, next day, exception |
| `billing.ledger_summary` | Summary / Metric | Billing | Balance, overdue count |
| `readiness.blocker` | Status / Action | Readiness | Named blocker, required-before label |
| `communications.summary` | Summary | Communications | Last outreach, reply state |
| `documents.requirements` | Summary / Status | Documents | Outstanding forms, completion state |

Templates are **platform-defined defaults**. Experience Builder selects and parameterizes; Business Processes override requiredness and stage visibility.

---

## 6. Scenario A — Children card

### Compact

| Property | Value |
|----------|-------|
| Archetype | Collection |
| Template | `enrollment.children` |
| Interaction (primary action) | Expand (System 5B) |

**Show:**

- Child name
- Age (or age band if compact)
- Enrollment / status signal
- Highest blocker or readiness signal per child

**Do not show:**

- Every child field
- Long medical detail
- Full schedule detail

### Expanded (Expand interaction)

- Child name
- DOB / age
- Enrollment status
- Readiness state
- Program interest
- Room / program assignment
- Schedule pattern (summary)
- Missing required info (named)
- Medical flags **only if operationally relevant**

### Workspace (Change Subject or Embedded)

- Child workspace or enrollment-child workspace for full record detail

### New field example: “Allergy Action Plan”

1. Field added to **Field Catalog**.
2. **Business Process / Readiness** decides whether it is required for current stage.
3. **Children content template** decides placement:
   - Compact: only if blocking or urgent
   - Expanded: if useful enrollment context
   - Child workspace: full document / detail
4. If required and missing: **Readiness card** also references it (Status template + Drill View).

---

## 7. Scenario B — Schedule card

### Compact

| Property | Value |
|----------|-------|
| Archetype | Summary or Status |
| Template | `schedule.summary` |
| Interaction | Expand or Embedded Workspace (`View schedule →`) |

**Show:**

- Schedule pattern (e.g. M–W–F)
- Next attendance day
- Exception / coverage issue if any
- Room / program if needed for today’s decision

### Expanded

- Weekly pattern
- Drop-off / pickup windows
- Room assignment
- Program
- Start date
- Exceptions
- Upcoming transitions

### Workspace

- Scheduling workspace / calendar (Embedded Workspace)

### New field example: “Preferred Nap Window”

1. Field added to **Field Catalog**.
2. **Schedule template** decides expanded placement.
3. Compact shows it **only if** it affects staffing or scheduling today.
4. **Scheduling workspace** owns full schedule detail.

---

## 8. Scenario C — Parent / Guardian card

### Compact

| Property | Value |
|----------|-------|
| Archetype | Profile |
| Template | `parent.contact` |
| Interaction | Expand |

**Show:**

- Primary contact name
- Relationship (if distinct from household title)
- Best phone / email
- Missing contact flag if important for stage

### Expanded

- Primary / secondary guardian
- Phone, email (each with `—` if missing)
- Address
- Preferred language
- Communication preference
- Authorized pickup relationship
- All missing values as `—`

### Workspace

- Person / Parent workspace (Change Subject on row click)

### New field example: “Preferred Language”

1. Field added to **Field Catalog**.
2. **Parent Contact template** decides:
   - Compact: if communication-sensitive for current mission
   - Expanded: profile label/value row
   - Communications workspace: consumed for message behavior
3. If missing and required: **Readiness** or **Communications** card surfaces it per BP rules.

---

## 9. Configuration contract

### Experience Builder (future)

Per card slot:

| Config | Source system |
|--------|---------------|
| Card key | Platform registry |
| Archetype | System 5A |
| Content template | System 5C catalog |
| Compact fields / computed slots | Template + overrides |
| Expanded sections | Template + overrides |
| Workspace target | System 5B registry |
| Interaction model | System 5B |
| Density | System 4 / 5 |
| Visibility, order | Builder |
| Missing-field labels | Template |

### Business Processes

- Required fields by stage / mission
- Blockers and readiness rules
- Stage-specific template overrides
- Default card actions and mission copy

### Field Catalog

- Field definition, entity/grain, data type, label
- Allowed values
- Requiredness metadata where applicable

### System 5C owns

- Field inclusion doctrine
- Template grammar
- Compact vs expanded rules
- Missing-information display rules
- Scenario mapping (Children, Schedule, Parent, …)

---

## 10. Relationship to System 5B

| Layer | Question answered |
|-------|-------------------|
| **5A** | *What shape is this card?* (Action, Profile, Collection, …) |
| **5C** | *What information appears at each depth?* |
| **5B** | *What happens when the operator clicks the action?* |

Example — Children card:

- **5A:** Collection archetype (rows + status)
- **5C:** `enrollment.children` template (compact: 3 rows; expanded: full list + readiness)
- **5B:** `View children →` = **Expand**; child row click = **Change Subject**

---

## 11. Hard boundaries

- Do **not** make compact cards field dumps.
- Do **not** hide missing operational data.
- Do **not** let new fields automatically appear everywhere.
- Do **not** let layout sections bypass content templates.
- Do **not** make expansion arbitrary.
- Do **not** implement runtime until **5B + 5C** are accepted and implementation is explicitly requested.

---

## 12. Implementation notes (future code anchors)

**Status:** Not built. Proposed types and modules for smallest config-shaped implementation after doctrine acceptance.

### Platform types (proposed)

```typescript
/** Stable template key — maps to inclusion rules per depth. */
type FocusPanelContentTemplateKey =
  | "enrollment.children"
  | "attendance.children"
  | "parent.contact"
  | "schedule.summary"
  | "billing.ledger_summary"
  | "readiness.blocker"
  | "communications.summary"
  | "documents.requirements";

/** One slot in compact or expanded view — field ref or computed resolver id. */
type CardFieldSlot = {
  slotKey: string;
  fieldRef?: string;
  computedKey?: string;
  label?: string;
  showWhenMissing?: boolean;
  compactOnly?: boolean;
};

/** Ordered group inside expanded or drill body. */
type CardExpansionSection = {
  sectionKey: string;
  title: string;
  slots: CardFieldSlot[];
};

type FocusPanelContentTemplate = {
  templateKey: FocusPanelContentTemplateKey;
  archetype: FocusPanelCardArchetype;
  defaultInteractionModel: CardInteractionModel;
  compactSlots: CardFieldSlot[];
  supportingSlot?: CardFieldSlot;
  expandedSections: CardExpansionSection[];
  drillSections?: CardExpansionSection[];
  embeddedWorkspaceTargetId?: string;
  emptyStateCopy: Record<string, string>;
  maxCompactRows?: number;
};
```

### Proposed module paths

| Anchor | Proposed path |
|--------|---------------|
| Template registry | `web/lib/adminV2/runtime/focusPanel/cardContentTemplateRegistry.ts` |
| Template type | `web/lib/adminV2/runtime/focusPanel/focusPanelContentTemplate.ts` |
| Field slots | `web/lib/adminV2/runtime/focusPanel/cardFieldSlot.ts` |
| Expansion sections | `web/lib/adminV2/runtime/focusPanel/cardExpansionSection.ts` |
| Template resolver | `web/lib/adminV2/runtime/focusPanel/resolveFocusPanelCardContent.ts` |
| Interaction model | `web/lib/adminV2/runtime/focusPanel/cardInteractionModel.ts` (shared with 5B) |
| Embedded workspace targets | `web/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTargetRegistry.ts` |
| Experience Builder schema | `web/lib/adminV2/configuration/focusPanelCardCompositionSchema.ts` |

### Current implementation (partial, pre-5C)

`deriveOpportunityFocusPanelCards.ts` currently builds compact card copy and structured payloads (profile rows, collection items, status issues) **directly in code** — not yet through a template registry. That is acceptable interim behavior until templates are wired. System 5C defines the target contract Experience Builder will configure.

---

## Cross-references

- Interaction models: [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md)
- Archetypes: [`universal-card-archetypes.md`](./universal-card-archetypes.md)
- Visual design: [`operational-surface-design-system.md`](./operational-surface-design-system.md)
- Field / config platform: [`../modules/configuration-platform.md`](../modules/configuration-platform.md)
