---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Alloy OS — System 5B — Card Interaction & Expansion Doctrine

**Revision:** 1  
**Status:** Approved doctrine (June 2026) — **documented; runtime expansion not fully built**  
**Extends:** [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5) · [`universal-card-archetypes.md`](./universal-card-archetypes.md) (System 5A) · [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md) (System 5C)

---

## Position in the stack

| System | Owns |
|--------|------|
| **System 5** | Operational surface design — hierarchy, color, spacing, typography, shared card grammar |
| **System 5A** | Universal Card Archetypes — purpose-specific visual composition |
| **System 5B** | **Card interaction & expansion** — what happens when an operator opens, expands, drills, or changes subject |
| **System 5C** | Content templates & field inclusion — what information appears at each interaction depth |

**Law:** System 5B defines **behavior**, not pixels. Every card action must declare exactly one interaction model. Configuration must know what an action *means* before Experience Builder wires card composition.

**Cross-references:** [`canonical-interaction-model.md`](./canonical-interaction-model.md) · [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) · [`universal-card-system.md`](./universal-card-system.md) · [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md)

---

## 1. Purpose

Operators interact with Universal Cards through actions: **View**, **Open**, **Expand**, **View Ledger**, **View Children**, **Open Thread**, **Resolve**, **Schedule**, **Manage**.

Without a declared interaction model, these labels become ambiguous navigation — cards open random records, modes reset unexpectedly, and workspaces duplicate inside cards.

System 5B freezes **five and only five** interaction models. Every card primary action maps to exactly one.

---

## 2. Core law

**Cards do not open random records.**

Cards operate inside the **current operational surface** unless the operator explicitly selects a different subject.

A card action may do **only one** of:

| # | Model | One-line definition |
|---|--------|---------------------|
| 1 | **Expand** | More detail, same subject, same mode, same card context |
| 2 | **Embedded Workspace** | Domain workspace inside Focus Panel; subject preserved |
| 3 | **Drill View** | Focused subordinate detail; not a workspace, not a new subject |
| 4 | **Change Subject** | Operator explicitly selected another business object |
| 5 | **External / Full Workspace** | Destination cannot fit in Focus Panel; explicit exit with return context |

**No other behavior is permitted.**

---

## 3. Interaction Model 1 — Expand

### Use when

The operator needs more detail, but the **subject and mode remain the same**.

### Examples

- Children card → full children list
- Household → all guardians, contacts, addresses
- Documents → missing / completed forms
- Readiness → required-info checklist

### Behavior

| Rule | Requirement |
|------|-------------|
| Subject | Unchanged |
| Focus Panel mode | Unchanged (Summary / Work / Activity) |
| Card context | Same card; body expands inline or into local detail region |
| Navigation | None |
| New runtime primitive | None |

### Ownership split

| Owner | Owns |
|-------|------|
| **Configuration** | default expanded · max rows · visible fields · empty labels · section order inside expansion |
| **Platform** | expansion animation · density ceilings · missing data display (`—`) · archetype grammar |

### Expansion content

What appears inside expansion is governed by **archetype + content template + domain** — see System 5C and §8 below.

---

## 4. Interaction Model 2 — Embedded Workspace

### Use when

The operator needs a **domain workspace** while staying on the current subject.

### Examples

- Billing → Ledger workspace
- Communications → Thread workspace
- Documents → Document workspace
- Scheduling → Calendar workspace
- Attendance → Attendance workspace

### Behavior

| Rule | Requirement |
|------|-------------|
| Subject | Remains active |
| Focus Panel | Enters embedded workspace state; composition changes |
| Header | Still identifies original subject |
| Workspace title | Identifies domain: `Wright Family · Billing`, `Emma Wright · Attendance` |
| Back | Returns to prior mode / card context |
| Record drawer | This is **not** a new record drawer |

### Ownership split

| Owner | Owns |
|-------|------|
| **Configuration** | which workspace opens · default subview · visible tabs/sections · card-to-workspace mapping · workspace density |
| **Platform** | embedded workspace shell · back behavior · subject preservation · mode persistence · workspace containment |

### Law

Do **not** recreate full domain UI inside card bodies. Embedded workspaces use the **existing domain workspace component** (e.g. `CommunicationsDrawerSection`), contained by the Focus Panel shell.

---

## 5. Interaction Model 3 — Drill View

### Use when

The operator needs **focused detail** subordinate to the current subject — not a full workspace.

### Examples

- Readiness blocker detail
- Task detail
- Workflow step detail
- Document requirement detail

### Behavior

| Rule | Requirement |
|------|-------------|
| Subject | Unchanged |
| Domain | Unchanged |
| Focus Panel | Enters focused drill state |
| Back | Returns to parent card or mode |
| Workspace | Drill views are **not** workspaces |
| Subject change | Drill views are **not** separate subjects |

### Ownership split

| Owner | Owns |
|-------|------|
| **Configuration** | drill target · fields shown · action buttons · requiredness display |
| **Platform** | drill shell · back stack · subject preservation · action placement |

---

## 6. Interaction Model 4 — Change Subject

### Use only when

The operator **explicitly selects another business object**.

### Examples

- Click child name → child becomes subject
- Click invoice row → invoice becomes subject
- Click payment row → payment becomes subject
- Click guardian / person → person becomes subject

### Behavior

| Rule | Requirement |
|------|-------------|
| Subject | Changes to selected business object |
| Runtime recompose | Subject → Business Process → Mission → Layout → Summary / Work / Activity |
| Uniqueness | **Only** this model changes the operational subject |
| UX | Must feel intentional — never accidental navigation |

### Ownership split

| Owner | Owns |
|-------|------|
| **Configuration** | which related rows are subject-selectable · subject type mapping · relationship label |
| **Platform** | subject swap · warm transition · back-to-prior-subject · subject identity rules |

---

## 7. Interaction Model 5 — External / Full Workspace

### Use rarely

When the destination **cannot fit meaningfully** inside the Focus Panel.

### Examples

- Full financial report
- Regulatory report
- Large analytics workspace
- External document viewer
- Full-screen scheduling grid

### Behavior

| Rule | Requirement |
|------|-------------|
| Destination | Full workspace, modal, or external route |
| Return context | Must be preserved |
| Labeling | Explicit: `Open full report`, `Open in Billing`, `Open full schedule` |

### Ownership split

| Owner | Owns |
|-------|------|
| **Configuration** | destination · label · return behavior if available |
| **Platform** | safe routing · return context · permissions |

---

## 8. Expansion content doctrine

Expansion content is decided by **archetype + domain + subject + content template** — not by dumping layout sections or raw field lists.

### Default expansion grammar by archetype

| Archetype | Expansion content |
|-----------|-------------------|
| **Action** | Blocker details · reason · due date · responsible party · available actions |
| **Status** | Issue list · health breakdown · related tasks · related blockers · recent state changes |
| **Profile** | Structured label/value groups · missing values as `—` · contact/address/role groups · edit affordances if permitted |
| **Collection** | Full related list · per-row status · filters/sort if needed · row click may **Change Subject** |
| **Summary** | Domain summary · recent changes · next relevant action · may hand off to **Embedded Workspace** |
| **Metric** | Trend · comparison · breakdown · may open analytics workspace |
| **Timeline** | Longer chronological feed · filters by event type · related events |
| **Launcher** | Rarely expands · usually executes or opens Work mode |

### Embedded workspace expansion (domain-owned)

When expansion *is* a workspace, the domain owns workspace content:

| Card domain | Workspace |
|-------------|-----------|
| Billing | Ledger — balance, invoices, lines, payments, credits, history |
| Attendance | Daily status, monthly history, exceptions, late pickups, notes |
| Communications | Thread history for current subject; composer not default |
| Documents | Requirements, uploads, signatures, blockers |

---

## 9. Worked examples

### Billing Summary Card

**Compact:**

```
Current Balance
1 overdue invoice
View Ledger →
```

**Interaction:** Embedded Workspace  
**Expansion:** Billing Ledger workspace (balance, invoices, ledger lines, payments, credits, history)  
**Row click (invoice):** Change Subject → Invoice Focus Panel

---

### Children Collection Card

**Compact:**

```
2 children enrolling
Emyrson — waiting on forms
McKenzie — ready
View children →
```

**Interaction:** Expand  
**Expansion:** Full children list — name, age, enrollment status, readiness, program/room, schedule  
**Row click (child):** Change Subject → Child Focus Panel

---

### Readiness Status Card

**Compact:**

```
Medical form outstanding
Required before tour
Resolve →
```

**Interaction:** Drill View  
**Expansion:** Required-info checklist — medical form, emergency contact, immunization, packet sent, due date, responsible party

---

### Communications Summary Card

**Compact:**

```
Last outreach 4 days ago
No reply received
Open thread →
```

**Interaction:** Embedded Workspace  
**Expansion:** Embedded Communications workspace for current subject  
**Law:** Timeline remains in Activity; composer is not default unless operator explicitly starts a message

---

### Attendance Summary Card

**Compact:**

```
Present today
2 late pickups this month
View attendance →
```

**Interaction:** Embedded Workspace  
**Expansion:** Attendance workspace — daily status, monthly history, exceptions, late pickups, notes

---

## 10. Configuration contract

Experience Builder eventually configures **per card**:

| Config surface | Examples |
|----------------|----------|
| Archetype | Collection, Profile, Status (System 5A) |
| Interaction model | Expand, Embedded Workspace, Drill View, … |
| Expansion target | section keys, drill target id, workspace target id |
| Visible fields / slots | compact, expanded, drill (System 5C templates) |
| Default expanded | boolean |
| Workspace target | `communications.thread`, `billing.ledger`, … |
| Drill target | `readiness.blocker`, `task.detail`, … |
| Subject-change target | entity type + relationship |
| Action label | `View Ledger →`, `Open thread →` |
| Permissions | who may expand, drill, or change subject |

Business Processes configure:

- Card inclusion by stage / mission
- Default action per stage
- Required-info rules and blocker definitions
- Workflow-specific drill targets

System 5B owns:

- Allowed interaction models (five only)
- Expansion grammar by archetype
- Subject preservation law
- Embedded workspace doctrine
- Missing-information visibility (with System 5C)
- Back behavior expectations

---

## 11. Hard boundaries

- Do **not** invent card interactions ad hoc.
- Do **not** make `Open` mean route navigation by default.
- Do **not** change subject unless the user selected another business object.
- Do **not** recreate workspaces inside card bodies.
- Do **not** hide missing data.
- Do **not** make every expansion a tabbed drawer.
- Do **not** implement runtime behavior until this doctrine is reviewed and implementation is explicitly requested.

---

## 12. Implementation notes (future code anchors)

**Status:** Not built. These are intended module names and types for the smallest config-shaped implementation after doctrine acceptance.

### Platform types (proposed)

```typescript
/** System 5B — exactly five interaction models. */
type CardInteractionModel =
  | "expand"
  | "embedded_workspace"
  | "drill_view"
  | "change_subject"
  | "external_workspace";

/** Per-card action declaration — Experience Builder selects; platform validates. */
type FocusPanelCardInteractionConfig = {
  cardKey: string;
  interactionModel: CardInteractionModel;
  actionLabel: string;
  expansionTargetId?: string;
  embeddedWorkspaceTargetId?: string;
  drillTargetId?: string;
  subjectChangeTarget?: SubjectChangeTarget;
  externalDestinationId?: string;
};
```

### Proposed module paths

| Anchor | Proposed path | Role |
|--------|---------------|------|
| Interaction model enum | `web/lib/adminV2/runtime/focusPanel/cardInteractionModel.ts` | Five-model enum + validation |
| Card expansion config | `web/lib/adminV2/runtime/focusPanel/cardExpansionConfig.ts` | Expansion targets, default expanded, max rows |
| Embedded workspace registry | `web/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTargetRegistry.ts` | Maps target id → domain workspace component + title pattern |
| Drill target registry | `web/lib/adminV2/runtime/focusPanel/drillTargetRegistry.ts` | Maps drill id → drill shell + field template |
| Subject-change registry | `web/lib/adminV2/runtime/focusPanel/subjectChangeRegistry.ts` | Entity type, relationship, back-stack rules |
| Experience Builder schema | `web/lib/adminV2/configuration/focusPanelCardCompositionSchema.ts` | archetype + interaction + template + visibility |

### Runtime integration points (when built)

| Existing anchor | Future responsibility |
|-----------------|----------------------|
| `FocusPanelCardRenderer` | Read interaction model; dispatch expand / drill / workspace — not ad hoc `onClick` |
| `OpportunityFocusPanelActivityWorkspace` | Embedded Workspace host for Activity-mode domain tabs |
| `OpportunityFocusPanelModeGrid` | Back stack + embedded workspace state |
| `deriveOpportunityFocusPanelCards.ts` | Compact content only; expansion/drill content from templates (System 5C) |
| `system5CardArchetypes.ts` | Default interaction model per card key (overridable by config) |

### Current implementation (partial, pre-5B)

The live Focus Panel already uses **Embedded Workspace** for Activity → Communications (`CommunicationsDrawerSection`). Footer actions on cards are **visual affordances only** — they do not yet declare or enforce System 5B interaction models. That wiring is intentionally deferred until this doctrine is accepted.

---

## Cross-references

- System 5C field inclusion: [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md)
- Archetypes: [`universal-card-archetypes.md`](./universal-card-archetypes.md)
- Visual design: [`operational-surface-design-system.md`](./operational-surface-design-system.md)
