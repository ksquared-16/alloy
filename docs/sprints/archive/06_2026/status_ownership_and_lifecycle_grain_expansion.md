# Status Ownership & Lifecycle Grain — Architecture Contract

**Path:** `docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md`  
**Date:** 2026-06-06 (initial discovery) · **2026-06-07** (contract refinement)  
**Status:** **Frozen — runtime contracts for Layout Configuration, queues, stages, work, attention, automations, and BOS**  
**Scope:** Status ownership, lifecycle grain, **lifecycle subject**, queue row context, drawer context, status display, and layout compatibility. **Architecture / documentation only.**

**Prerequisites (shipped — do not redesign):**

- Lifecycle Builder Hardening
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- Needs Attention Phase 1 (readiness projection + resolver v2)
- [`completed/operational_work_and_action_execution_closeout.md`](./completed/operational_work_and_action_execution_closeout.md)

**Parallel work (must not block):**

- **Layout Configuration** — may proceed using contracts in §4–§6 and §10; must not hardcode enrollment-specific subject logic.
- **Program interest configurable model** — audit + location-scoped settings design complete; programs under Settings → Locations (not standalone); see [`program_interest_configurable_model_audit.md`](./program_interest_configurable_model_audit.md), [`location_scoped_programs_configuration_design.md`](./location_scoped_programs_configuration_design.md).
- **Entity status + lifecycle stage + location scope** — extends this contract with status vocabulary, placement ownership, cascade, access redaction, and **integration with Lifecycle Builder, work-unit queues, `QueueRowContext`, drawer, and Layout Configuration** (§7 of that doc); see [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md).
- **Enrollment lifecycle + status matrix** — configurable labels vs fixed layers, disposition mapping metadata, default seed matrix, display naming; see [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md).

**Canonical inputs:**

- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md) §7–§8
- [`../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`](../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md)

**Authority:** Product copy, queue contracts, layout blocks, resolver extensions, and workflow design align with §2–§10 unless an explicit exception is recorded in §11.

---

## No implementation in this sprint

This sprint **freezes contracts only**. It does **not** change production runtime behavior.

| Do **not** (this sprint) | Do **(this sprint)** |
|--------------------------|----------------------|
| Migrate statuses | Update this architecture document |
| Refactor queues | Add contract sections with examples |
| Implement child-grain queues (new runtime paths) | Identify impacted future implementation phases |
| Alter `lifecycleVisibilityEvaluator` behavior | Document what Layout Configuration must avoid hardcoding |
| Change drawer / queue production UX | Freeze `lifecycle_subject` and row context shape |

**Runtime note:** Some child/candidate grain queue paths exist from prior convergence work (`childGrainEnrollmentQueue`, `candidateGrainWaitlistQueue`). This sprint **does not extend or refactor** them — it defines the **target contract** those paths and Layout Configuration must converge on.

---

## Executive summary

Alloy enrollment (and future verticals) requires **multiple lifecycle subjects** under one household case. Queue membership, counts, row labels, and drawer focus must follow the **subject that caused the row** — not always `opportunities.status_key`.

| Contract | Locked rule |
|----------|-------------|
| **Lifecycle subject** | Generic entity whose stage/status creates queue membership (`case`, `child`, `candidate`, future `customer` / `vendor` / `associate` / `agent`) |
| **Queue membership grain** | Work unit queue membership and **counts** use the work unit's lifecycle subject grain |
| **Queue row context** | Child/candidate rows **must** include case/family context for operator comprehension |
| **Drawer context** | Row click opens **case drawer** with **active subject** highlighted |
| **Status display** | Primary stage/status in queue/drawer comes from **row lifecycle subject**; case status is intentionally **boring** (open/closed/archived) |
| **Operational work** | Repeatable obligations (e.g. contact attempts 1–3) are **work**, not lifecycle statuses |
| **Layout configuration** | Configurable system blocks; runtime resolves subject from work unit grain — no hardcoded child/opportunity logic in layout JSON |

**Target spine (frozen):**

```
status_definitions (vocabulary, per entity_type)
        ↓
Authoritative status per lifecycle_subject
        ↓
Events (grain-specific status changed)
        ↓
Work unit queue (lifecycle_subject grain + stage lens)
        ↓
QueueRowContext (subject + case context + summaries)
        ↓
Drawer (case shell + active_subject focus)
        ↓
Consumers (readiness, attention, work, automations, BOS)
```

---

## 1. Current-state audit

*Unchanged baseline from discovery — summarizes production today; target contracts in §3–§6 may differ where noted.*

### 1.1 Opportunity (case) status model

| Aspect | Current state |
|--------|---------------|
| **Authoritative field** | `opportunities.status_key` |
| **Vocabulary** | `status_definitions` where `entity_type = 'opportunities'` |
| **Pipeline keys (legacy active)** | `new_inquiry`, `contact_attempted`, `tour_scheduled`, … `enrolled`, `lost` |
| **Case convergence keys (partial)** | `open`, `closed`, `inactive`, `archived` |
| **Events** | `opportunity_status_changed` |
| **Target role** | **Case container only** — not per-child enrollment truth (§5) |

**Tension:** Case status still encodes pipeline semantics (`tour_scheduled`, `waitlisted`, `enrolled`) in many tenants. Contract refinement **freezes the target**: those semantics belong on **child/candidate lifecycle subjects**, not case status.

### 1.2 Child (inquiry / enrollment) status model

| Aspect | Current state |
|--------|---------------|
| **Authoritative field** | `opportunity_customer_members.outcome_status_key` |
| **Vocabulary** | `status_definitions` where `entity_type = 'opportunity_customer_members'` |
| **Events** | `child_lifecycle_status_changed` |
| **Lifecycle subject type** | `child` |

### 1.3 Stage membership logic (today)

Builder stages map **opportunity** `status_keys` to stage queue views. Child disposition keys are configured in `queue_definition` v2 for some domains — **not** yet in Lifecycle Builder stage checkboxes.

**Target (frozen):** Stage membership = predicate on the work unit's declared **lifecycle subject grain** and status field (§3, §4).

### 1.4 Work unit filtering logic (today)

`enrollmentPipelineQueueDefinitionV2` mixes grains: case lanes (lead, tour follow-up), candidate waitlist, child enrolling/enrolled. Builder-owned `lifecycle_wu_{stage}` uses case visibility today.

### 1.5–1.7

See discovery audit: visibility vs assignment home, OCM fields, mixed-household behavior (`buildOpportunityChildLifecycleSummary`). Production gaps vs target contract are expected until implementation phases §12.

---

## 2. Status ownership framework

### 2.1 Ownership model (frozen)

| Lifecycle subject type | Authoritative field | Owns |
|------------------------|---------------------|------|
| **case** (`opportunities`) | `status_key` | Case Open/Closed/Inactive/Archived — household coordination shell |
| **child person** (`persons`, `child_lifecycle` profile) | `status_key` | **Child identity** — Active, Withdrawn, Graduated, … — **not** enrollment stage |
| **child enrollment track** (`opportunity_customer_members`) | `enrollment_stage_key` (target) / `outcome_status_key` (disposition, transitional) | **Enrollment lifecycle stage** on this case (Lead, Tour, Enrolled, …) — children do not “tour” as identity |
| **candidate** (`placement_candidates`) | candidate `status` + ordering | Waitlist position — not enrollment stage label |
| **Future subjects** | Entity-specific `status_key` | Vertical lifecycle (vendor onboarding, associate credentialing, …) |

**Rejected:** Single household status column; Tour/Enrolled as **child identity** status; replacing Lifecycle Builder stages with new status labels; derived status as source of truth without disposition/stage columns.

**See:** [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) §1–§2.5 for five-layer model and schema conflicts.

### 2.2 Status change authority

Unchanged from discovery — only actions/workflows mutate authoritative fields; Builder, Readiness, Attention, Work, BOS do not.

### 2.3 Transitional state

Pipeline keys on `opportunities.status_key` remain in production until **case status migration** implementation phase. Contracts in §5 define **target** case vocabulary regardless.

---

## 3. Lifecycle subject model

### 3.1 Definition

A **`lifecycle_subject`** is the entity whose lifecycle stage and status **create work unit queue membership** for a given work unit / queue view.

| Property | Meaning |
|----------|---------|
| **Generic** | Not hardcoded to opportunity, child, or candidate — enrollment is the first vertical instance |
| **Authoritative** | Subject carries the status field that membership predicates evaluate |
| **Stage-bound** | Each work unit queue view declares which subject grain it uses |
| **Case-anchored** | Non-case subjects still link to a **case anchor** (e.g. opportunity id) for household context |

### 3.2 Lifecycle subject types (platform vocabulary)

| `subject_type` | Entity / table | Status field | Enrollment example |
|----------------|----------------|--------------|-------------------|
| `case` | `opportunities` | `status_key` | Smith Household enrollment case |
| `child` | `opportunity_customer_members` | enrollment stage on OCM track | Child B — **Tour** stage (not child identity “touring”) |
| `candidate` | `placement_candidates` | `status` (+ child disposition filters) | Child C — waitlist row |
| `customer` | `customers` (future) | TBD | Household account lifecycle |
| `vendor` | vendor entity (future) | TBD | Vendor onboarding |
| `associate` | staff entity (future) | TBD | Credentialing |
| `agent` | agent entity (future) | TBD | Licensing |

**Internal contract shape (documentation — not a migration):**

```typescript
type LifecycleSubjectType =
    | "case"
    | "child"
    | "candidate"
    | "customer"
    | "vendor"
    | "associate"
    | "agent";

type LifecycleSubjectRef = {
    subject_type: LifecycleSubjectType;
    subject_id: string;
    /** Process scope — e.g. enrollment department lifecycle */
    lifecycle_key: string;
    /** Builder stage or queue domain stage */
    stage_key: string;
    /** Authoritative status for this subject */
    status_key: string;
    /** When subject_type !== case — links to household/case shell */
    case_anchor?: {
        entity_type: "opportunities";
        entity_id: string;
    };
};
```

### 3.3 Queue membership grain

**Locked:** Work unit queue **membership** and **counts** are based on the work unit queue's **lifecycle subject grain**, not always the opportunity.

| Work unit / queue (examples) | Subject grain | Count unit | Membership predicate (conceptual) |
|------------------------------|---------------|------------|-----------------------------------|
| New Lead follow-up | `case` | families / cases | `opportunities.status_key` ∈ stage set |
| Touring | `child` | **children** | `OCM.outcome_status_key` ∈ touring set |
| Waitlist | `candidate` | **candidates** (children) | candidate active + child disposition |
| Enrolled | `child` | **children** | `OCM.outcome_status_key` = enrolled |
| Needs Attention | `case` (overlay) | families | resolver — not stage membership |

**Count rule:** Lane badge and KPI totals use the queue's `count_unit` — **never** assume one row per household when grain is `child` or `candidate`.

### 3.4 Lifecycle key

`lifecycle_key` identifies the configured process (e.g. `enrollment` for enrollment department). Stages (`tour`, `waitlist`, `enrolled`) are scoped under a lifecycle. Future verticals add new lifecycle keys without renaming work units.

### 3.5 Multi-queue visibility

One case anchor may produce **multiple queue rows** across work units when different lifecycle subjects match different stage lenses. This is **expected** — not duplicate records.

---

## 4. Lifecycle subject + queue row context contract

### 4.1 UX rule (locked)

> A work unit queue row may be **child-grain** or **candidate-grain** for membership and counting, but it **must** include **case/family context** so operators understand why the row appears and how siblings relate.

Without case context, child-grain rows feel orphaned and break mixed-household comprehension.

### 4.2 Queue row context contract

Runtime (or API normalization layer) should attach a **`QueueRowContext`** to every queue row. Layout Configuration consumes this contract — it does not compute grain logic.

```typescript
type QueueRowContext = {
    // --- Why this row exists (membership) ---
    row_subject: {
        subject_type: LifecycleSubjectType;
        subject_id: string;
        display_name: string;           // e.g. "Child B"
    };
    row_stage: string;                  // operator stage label — e.g. "Touring"
    row_lifecycle_key: string;          // e.g. "enrollment"
    row_status_key: string;             // authoritative status for row_subject
    row_status_label: string;         // operator label for row status

    // --- Household / case shell (always for non-case grains) ---
    case_context: {
        case_id: string;
        display_name: string;           // e.g. "Smith Household"
        case_type_label: string;        // e.g. "Enrollment Case"
        case_status_key: string;        // boring case status — §5
        case_status_label: string;
    };
    primary_contact: {
        display_name: string;           // e.g. "Sarah Smith"
        phone?: string | null;
        email?: string | null;
    } | null;

    // --- Sibling / related subject awareness ---
    related_subjects_summary: Array<{
        subject_type: LifecycleSubjectType;
        subject_id: string;
        display_name: string;
        status_label: string;           // e.g. "Enrolled", "Touring", "Waitlisted"
    }>;

    // --- Consumer summaries (read-only projections) ---
    attention_summary: {
        needs_attention: boolean;
        primary_reason_label: string | null;
    } | null;
    work_summary: {
        open_count: number;
        primary_open_label: string | null;
    } | null;
    next_best_action: {
        label: string;
        action_key?: string;
        source: "recommendation" | "action_placement" | "none";
    } | null;

    // --- Navigation ---
    drawer_open: {
        entity_type: "opportunities";
        entity_id: string;              // always case drawer
        active_subject?: LifecycleSubjectRef;       // single-subject row / child click in group
        active_subject_group?: LifecycleSubjectRef[]; // same-case + same-stage group open
        stage_focus_key?: string;                   // builder stage when group opens
    };

    // --- Grouped presentation (optional — same case + same enrollment stage) ---
    row_presentation_mode?: "single_subject" | "grouped_subjects"; // default single when omitted
    row_subjects?: Array<QueueRowContext["row_subject"]>;
    row_grouping_key?: string;          // case_id:stage_key[:scope]
    row_count?: number;                 // enrollment tracks represented (grouped card)
    row_count_unit?: "enrollment_track" | "cases" | "children" | "candidates";
};
```

**Grouped row rule:** When multiple OCM tracks on one case share the same enrollment stage, membership still counts **each track**. Renderer may emit one grouped `QueueRowContext` with `row_subjects[]` — see §4.3.1 and entity status contract §3.3–§3.4.

### 4.3 Example — Smith Household (mixed stages)

**Truth:**

| Child | Lifecycle subject | Status |
|-------|-------------------|--------|
| Child A | `child` | Enrolled |
| Child B | `child` | Touring |
| Child C | `child` / `candidate` | Waitlisted |

**Case:** `open` (active enrollment case) — not `enrolled` or `tour_scheduled`.

**Queue counts (same household, three lanes):**

| Lane | Grain | Count contribution |
|------|-------|------------------|
| Touring | child | **1** (Child B only — baseline §3.1) |
| Waitlist | candidate | **1** (Child C) |
| Enrolled | child | **1** (Child A) |

### 4.3.1 Example — Smith Household (same stage: A + B both Tour)

**Truth:** Child A and Child B are **two** Tour enrollment tracks on one **Open** case. Child C **Enrolled**.

| Lane | Membership matches | Count truth | UI |
|------|---------------------|-------------|-----|
| Tour | A, B | **2** enrollment tracks | 1 grouped card **or** 2 single-child rows |
| Enrolled | C | **1** | 1 row |

**Grouped Tour card:**

- Primary: **2 children — Tour**
- Children in stage: A, B
- Other children: C — Enrolled
- `row_count`: 2 · `row_count_unit`: `enrollment_track`
- Click card → drawer with `active_subject_group` [A, B], `stage_focus_key`: `tour`
- Click Child A in card → same drawer, `active_subject` = A

Grouped display does **not** reduce lane count to 1 household.

**Example row — Touring lane (Child B only — mixed-stage baseline):**

```json
{
  "row_subject": {
    "subject_type": "child",
    "subject_id": "ocm-child-b-uuid",
    "display_name": "Child B"
  },
  "row_stage": "Touring",
  "row_lifecycle_key": "enrollment",
  "row_status_key": "tour_scheduled",
  "row_status_label": "Touring",
  "case_context": {
    "case_id": "opp-smith-uuid",
    "display_name": "Smith Household",
    "case_type_label": "Enrollment Case",
    "case_status_key": "open",
    "case_status_label": "Active"
  },
  "primary_contact": {
    "display_name": "Sarah Smith"
  },
  "related_subjects_summary": [
    { "subject_type": "child", "subject_id": "ocm-a", "display_name": "Child A", "status_label": "Enrolled" },
    { "subject_type": "child", "subject_id": "ocm-b", "display_name": "Child B", "status_label": "Touring" },
    { "subject_type": "child", "subject_id": "ocm-c", "display_name": "Child C", "status_label": "Waitlisted" }
  ],
  "attention_summary": { "needs_attention": true, "primary_reason_label": "Tour date passed" },
  "work_summary": { "open_count": 1, "primary_open_label": "Record tour outcome" },
  "next_best_action": { "label": "Record tour outcome", "action_key": "record_tour_outcome", "source": "recommendation" },
  "drawer_open": {
    "entity_type": "opportunities",
    "entity_id": "opp-smith-uuid",
    "active_subject": {
      "subject_type": "child",
      "subject_id": "ocm-child-b-uuid",
      "lifecycle_key": "enrollment",
      "stage_key": "tour",
      "status_key": "tour_scheduled",
      "case_anchor": { "entity_type": "opportunities", "entity_id": "opp-smith-uuid" }
    }
  }
}
```

### 4.4 Drawer context contract

**Locked navigation rule:**

| User action | Result |
|-------------|--------|
| Click queue row (any grain) | Open **case/opportunity drawer** for `case_context.case_id` |
| Active subject | `drawer_open.active_subject` — Child B highlighted / focused |
| Lifecycle visual | Stage context reflects **active subject's** stage (`Touring`), not case pipeline status |
| Family context | Full children list + `related_subjects_summary` remains visible |
| Case details | Case status, contacts, threads, case-scoped actions always available |

**Do not** open a separate child-only drawer shell for enrollment — case drawer is the shell; subject focus is runtime state (query param, session context, or drawer VM `active_subject`).

```typescript
type DrawerSubjectContext = {
    active_subject: LifecycleSubjectRef;
    focus_mode: "case_default" | "subject_highlight";
    lifecycle_visual_stage_key: string;   // from active_subject
    related_subjects: QueueRowContext["related_subjects_summary"];
};
```

### 4.5 Queue preview vs authority

Queue rows remain **previews**. `QueueRowContext` is a **presentation contract** — authoritative truth stays on lifecycle subject status fields and case anchor record.

---

## 5. Status display contract

Operators see multiple "status-like" concepts. **Do not collapse them in UI or copy.**

### 5.1 Concept separation (locked)

| Concept | What it is | Example | Where shown |
|---------|------------|---------|-------------|
| **Case status** | Case container / household coordination state | Active, Closed, Archived | Case header (secondary); not primary queue chip for child rows |
| **Lifecycle stage** | Operator stage in configured process | Touring, Waitlist, Enrolled | Primary queue row stage label; lifecycle visual |
| **Subject outcome status** | Authoritative disposition for lifecycle subject | `tour_scheduled`, `waitlisted`, `enrolled` on OCM | Row status chip; child drawer slots |
| **Operational work state** | Human obligation progress | Contact Attempt 2/3; open work count | Work summary block — **not** a CRM status |
| **Attention state** | Awareness overlay | "Tour date passed"; "Required info missing" | Attention summary — **not** membership |

### 5.2 Primary display rule (locked)

> The **primary** stage/status shown in a work unit queue row or drawer focus header comes from the **lifecycle subject that caused the row to appear** (`row_subject` + `row_stage` + `row_status_label`) — **not** blindly from `opportunities.status_key`.

| Surface | Primary label source |
|---------|---------------------|
| Child-grain touring row | Child B — **Touring** (`outcome_status_key`) |
| Candidate waitlist row | Child C — **Waitlisted** |
| Case-grain new lead row | Case — **New Lead** (case `status_key` until migration) |
| Case drawer header (child-focused open) | **Child B — Touring** with case status subordinate |

### 5.3 Case status — intentionally boring (target)

Case `status_key` should converge to **container semantics only**:

| Target case status | Meaning |
|--------------------|---------|
| **Active / Open** | Household case in progress |
| **Closed** | Resolved — lost, fully complete, or inactive |
| **Archived** | Historical — hidden from default queues |
| **Duplicate** | Merged duplicate case |
| **Converted / Fully enrolled** | All policy-defined children terminal (optional automation) |
| **Lost / No longer interested** | Case closed — not enrolling |

**Case status must not pretend to be:**

| Wrong on case | Why |
|---------------|-----|
| Touring | Child B can be touring while Child A is enrolled |
| Waitlisted | Per-child — lives on child/candidate subject |
| Enrolled | Per-child — lives on child subject |
| Contact attempt 2 of 3 | Operational work — §5.4 |

Legacy pipeline keys (`tour_scheduled`, `waitlisted`, `enrolled` on opportunity) are **transitional** — display contract applies fully after case migration phase.

### 5.4 Operational work is not lifecycle status

**Locked boundary:** Repeatable operational requirements are **Operational Work**, not status vocabulary.

**Example — New Lead stage:**

| Layer | Correct modeling |
|-------|------------------|
| **Lifecycle stage** | New Lead |
| **Operational work** | Contact Attempt 1/3, 2/3, 3/3 (work instances or checklist items) |
| **Attention** | "Contact requirement incomplete" / "Contact overdue" |
| **Readiness** | Required information complete? |
| **Automation** | May advance stage **only if explicitly configured** — not implicit on attempt count |

**Do not create statuses:** `contact_attempt_1`, `contact_attempt_2`, `contact_attempt_3`.

| If operator asks… | Answer from… |
|-------------------|--------------|
| "How many contact attempts?" | Open/completed **work** instances |
| "Are they still a new lead?" | **Lifecycle stage** / subject status |
| "Is intake info missing?" | **Readiness** |
| "Should I call today?" | **Attention** + **BOS** recommendation |

### 5.5 Display hierarchy (queue row)

Recommended visual priority:

1. **Row subject name** + **lifecycle stage** (why row is here)
2. **Attention** indicator (if any)
3. **Work** open count (if any)
4. **Case name** + **primary contact** (context)
5. **Related subjects summary** (siblings)
6. **Case status** (de-emphasized — "Active")

---

## 6. Mixed-household model (canonical example)

### 6.1 Smith Household reference

| Child | Subject | Status | Lanes |
|-------|---------|--------|-------|
| Child A | child | **Enrolled** | Enrolled queue → count 1 |
| Child B | child | **Touring** | Touring queue → count 1 |
| Child C | child + candidate | **Waitlisted** | Waitlist queue → count 1 |

**Case status:** `open` (Active).

### 6.2 Operator questions answered

| Question | Answer |
|----------|--------|
| Why does Smith appear three times? | Three different lifecycle subjects in three stage queues |
| What is Smith's "status"? | **No single answer** — show related subjects summary |
| Which drawer opens from Touring row? | Smith Household case drawer, **Child B focused** |
| What is the touring count? | **1 child** — Child B only |
| Should case show "Enrolled"? | **No** — case shows Active; Child A enrolled is in summary |

### 6.3 Attention, readiness, work (target)

| Layer | Smith household behavior |
|-------|--------------------------|
| **Readiness** | Record scope — may gap on case or child fields |
| **Attention** | Case resolver + future `mixed_child_disposition`; row-level attention in `attention_summary` |
| **Work** | Case-scoped by default; Child B row may show tour outcome work |
| **Automation** | Optional rollup: all enrolled → case `closed` — explicit workflow only |

---

## 7. Operational Work integration

Unchanged core doctrine: work is execution home; does not own status.

**Additional boundary (§5.4):** Work tracks obligations (contact attempts, record tour outcome, collect documents). Stage progression is a **separate** lifecycle subject status change — optionally linked by automation policy.

| Work context field (future) | Purpose |
|-----------------------------|---------|
| `context_snapshot.lifecycle_subject` | Subject work applies to |
| `context_snapshot.lifecycle_stage_key` | Stage at creation |
| `context_snapshot.case_anchor_id` | Household link |

Work completion **does not** imply stage advance unless an action/workflow mutates subject status.

---

## 8. Attention integration

Attention consumes status at declared grain; does not create work or mutate status.

| Display | Source |
|---------|--------|
| Row `attention_summary` | Resolver output for case anchor + optional subject-scoped reasons (future) |
| Primary queue chip | **Not** attention — lifecycle subject stage (§5) |

Readiness → `missing_required_info` projection remains read-only bridge per NA Phase 1.

---

## 9. Automation integration

Automations mutate authoritative lifecycle subject fields — never `QueueRowContext` or layout state.

| Trigger | Target grain |
|---------|--------------|
| `opportunity_status_changed` | case |
| `child_lifecycle_status_changed` | child |
| Work completed | **No default status change** |

Stage advance from contact attempts requires **explicit** workflow configuration.

---

## 10. Layout Configuration compatibility

Layout Configuration may proceed **in parallel** with this contract freeze. It must align with runtime contracts — not block on queue refactors.

### 10.1 Principles (locked)

| Principle | Detail |
|-----------|--------|
| **No grain hardcoding in layout JSON** | Layout declares **blocks** and placement — not `if child then …` |
| **Runtime resolves subject** | Work unit metadata / queue grain → `LifecycleSubjectRef` + `QueueRowContext` |
| **Blocks consume contracts** | Each block reads from normalized context payload |
| **Case drawer is universal shell** | Layout sections target case drawer; `active_subject` drives focus |

### 10.2 Configurable system blocks (target)

Full builder → queue → `QueueRowContext` → drawer → layout block integration is in [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) §7. Layout Configuration should support these **system block types** (names illustrative):

| Block key | Consumes | Hardcode risk to avoid |
|-----------|----------|------------------------|
| `lifecycle_visual` | `active_subject.stage_key`, process config | Enrollment-only stage names in layout |
| `focused_subject` | `active_subject`, `row_status_label` | Assuming `opportunity` entity only |
| `family_case_context` | `case_context`, `primary_contact` | — |
| `related_subjects_summary` | `related_subjects_summary[]` | Parsing `_inquiry_children` directly in layout |
| `operational_work_summary` | `work_summary` | Embedding work definition keys |
| `attention_summary` | `attention_summary` | Duplicating resolver rules |
| `next_best_action` | `next_best_action` | BOS logic in layout JSON |
| `readiness_gaps` | `ReadinessResult` attach | Re-evaluating rules in UI |

### 10.3 What Layout Configuration must avoid

| Avoid | Instead |
|-------|---------|
| `entity_type === 'opportunity_customer_members'` branches in layout config | `focused_subject` block driven by runtime |
| Queue row templates that only show `opportunities.status_key` | `row_stage` + `row_status_label` from `QueueRowContext` |
| Separate drawer layouts per grain | One case drawer + `active_subject` focus state |
| Count assumptions (1 row = 1 family) | Respect work unit `count_unit` from queue definition |
| Contact attempt labels as status chips | `operational_work_summary` block |

### 10.4 Runtime payload for layout (target)

```typescript
type WorkUnitSurfaceContext = {
    work_unit_id: string;
    queue_grain: LifecycleSubjectType;
    lifecycle_key: string;
    // Queue list rows
    rows: Array<{ id: string; queue_row_context: QueueRowContext }>;
    // Drawer (when open)
    drawer?: DrawerSubjectContext & {
        case_record: unknown;
        readiness?: ReadinessResult;
        attention?: OpportunityAttentionResult;
        work_instances?: unknown[];
    };
};
```

Layout renderer selects blocks; **platform-owned resolvers** populate `WorkUnitSurfaceContext`.

---

## 11. Risks and architectural traps

| Trap | Mitigation |
|------|------------|
| **Layout hardcodes enrollment grains** | System blocks + `WorkUnitSurfaceContext` (§10) |
| **Queue row without case context** | Mandatory `case_context` for non-case grains (§4.1) |
| **Primary chip from case status on child row** | Status display contract (§5.2) |
| **Contact attempts as statuses** | Operational work boundary (§5.4) |
| **Separate child drawer app** | Case drawer + `active_subject` (§4.4) |
| **Count = households when grain is child** | `count_unit` per queue (§3.3) |
| **Collapsing lifecycle_subject into opportunity** | Generic `subject_type` enum (§3) |
| **Implementing queues before contract** | This doc frozen first; implementation §12 |
| **Blocking Layout Config on queue refactor** | Parallel safe with §10 guardrails |

*Plus traps from discovery §8:* derived status as SoT, attention creates status, `work_unit_id` visibility gate, etc.

---

## 12. Phased roadmap

### Phase 0 — Discovery ✅

Initial audit and ownership model.

### Phase 1 — Contract refinement ✅ (this sprint)

Freeze `lifecycle_subject`, `QueueRowContext`, drawer context, status display, layout compatibility, operational work vs status boundary.

### Phase 2 — Layout Configuration alignment (parallel)

- Implement system blocks against `WorkUnitSurfaceContext` shape (stub/runtime attach OK)
- Case drawer `active_subject` focus state
- No queue grain refactor required to start

### Phase 3 — Queue row context API (implementation)

- Normalize `QueueRowContext` in QueueService / workspace APIs
- `related_subjects_summary` from `buildOpportunityChildLifecycleSummary` + subject list
- Wire `drawer_open.active_subject` through queue row click

### Phase 4 — Builder lifecycle subject grain (config)

- Stage save: `lifecycle_subject_grain` + status sets per grain
- Ready check validates grain-appropriate filters
- Touring stage defaults to **child** grain per contract

### Phase 5 — Case status migration

- Boring case statuses (`open` / `closed` / …)
- Remove pipeline semantics from opportunity `status_key`
- Status display contract fully live

### Phase 6 — Child/candidate queue convergence

- **Design gate (frozen):** [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md) — row IDs, membership per stage, grouping, location scope, `QueueRowContext` targets, migration phases A–F, risks
- Align existing `childGrainEnrollmentQueue` / `candidateGrainWaitlistQueue` to `QueueRowContext`
- Extend touring to child-grain membership (**implementation** — after design gate merge)
- Count units verified per lane

### Phase 7 — Attention / work / automation depth

- `mixed_child_disposition`, subject-scoped work, grain-aware BOS
- Contact-attempt work templates (not statuses)

---

## 13. Future implementation sprint (after contract freeze)

The **next implementation sprint** should:

1. **Define `QueueRowContext` TypeScript types** in `web/lib/` (queue or workspace module) matching §4.2
2. **Attach partial context** to existing queue rows without changing membership predicates (case context + related summary first)
3. **Add `active_subject` to drawer open path** (query param or drawer VM) — Layout Config can highlight focused child
4. **Update queue row preview** to prefer `row_stage` / `row_status_label` over raw `opportunities.status_key` where context exists
5. **Document work unit `count_unit`** in builder/queue publish path for child lanes
6. **Not** migrate case statuses or switch touring to child-grain SQL until Phase 5–6

**Exit criteria for implementation sprint:**

- Clicking Child B touring row opens case drawer with Child B focused
- Touring lane count = children in touring status, not households
- Layout blocks read `WorkUnitSurfaceContext` — no new enrollment branches in layout JSON

---

## 14. Success criteria

| Criterion | Status |
|-----------|--------|
| `lifecycle_subject` generic model | **Yes** — §3 |
| Queue membership grain + counts | **Yes** — §3.3 |
| Queue row context contract + example | **Yes** — §4 |
| Drawer context contract | **Yes** — §4.4 |
| Status display contract | **Yes** — §5 |
| Operational work ≠ status (contact attempts) | **Yes** — §5.4 |
| Layout Configuration compatibility | **Yes** — §10 |
| Smith mixed household example | **Yes** — §4.3, §6 |
| No implementation in this sprint | **Yes** — top section |
| Future implementation sprint scoped | **Yes** — §13 |

---

## 15. Document maintenance

Update when:

- `QueueRowContext` ships in API/types
- Layout system blocks ship
- Case status migration completes
- Builder `lifecycle_subject_grain` ships

**Do not** update for layout spacing/typography-only changes.

---

## Related documents

| Doc | Role |
|-----|------|
| [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md) | Operator vocabulary |
| [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md) | Attention doctrine |
| [`completed/operational_work_and_action_execution_closeout.md`](./completed/operational_work_and_action_execution_closeout.md) | Work execution |
| [`operational_work_creation_model_discovery.md`](./operational_work_creation_model_discovery.md) | Work instantiation |
| [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) | Status vocabulary, location/program/room, access redaction, builder/queue/layout integration (§7) |
| [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) | Configurable enrollment labels, disposition ↔ stage mapping, default matrix, naming debt |
