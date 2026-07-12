# Entity Status + Lifecycle Stage + Location Scope — Architecture Contract

**Path:** `docs/sprints/archive/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md`  
**Date:** 2026-06-08 · **2026-06-09** (enrollment stage vs child identity correction)  
**Status:** **Frozen — architecture for layout config, queue/drawer redesign, and convergence sprints**  
**Scope:** Status vocabulary, lifecycle stage vs status, mixed households, location/program/room ownership, access control, layout compatibility. **Documentation + low-risk type extensions only.**

**Builds on (frozen):**

- [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md)
- [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) — configurable labels ↔ fixed layers; default disposition matrix; mapping metadata
- [`docs/system/work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`program_interest_configurable_model_audit.md`](./program_interest_configurable_model_audit.md)
- [`location_scoped_programs_configuration_design.md`](./location_scoped_programs_configuration_design.md)

**Parallel work (must not block):**

- Layout Configuration runtime cutover
- Queue / drawer UI redesign
- Platform convergence field catalog

**Authority:** Status migrations, queue membership, location cascade UI, and layout block wiring align with this document unless an explicit exception is recorded in §13.

**Integration:** This document is the **domain model** Lifecycle Builder, work-unit queues, `QueueRowContext`, drawer VM, and Layout Configuration consume — not a parallel spec. See §7.

---

## No implementation in this sprint

| Do (this sprint) | Do not (this sprint) |
|------------------|----------------------|
| Freeze vocabulary and ownership model | Migrate `status_key` values |
| Document location/program/room cascade target | Ship dependent-select UI everywhere |
| Extend TypeScript contracts (optional fields) | Change queue membership SQL |
| Phased roadmap + risks | Child-grain touring conversion |
| Layout block consumption rules | Hardcode enrollment logic in layout JSON |

---

## Executive summary

Alloy separates **five layers** operators often conflate:

| Layer | What it is | Authoritative storage |
|-------|------------|------------------------|
| **Person status** | Human identity / roster | `persons.status_key` (profile-scoped) |
| **Case status** | Household case container | `opportunities.status_key` |
| **Child identity status** | Durable child person roster — **not** enrollment pipeline | `persons.status_key` (`child_lifecycle` profile on the child person) |
| **Enrollment lifecycle stage** | Child’s **enrollment track** inside a case (OCM context) | Lifecycle Builder stage lens + OCM enrollment track (see §1.5) |
| **Placement context** | Site/program/room for that enrollment track | OCM + placement candidate columns |

**Critical rule (locked):** Children do not “tour.” The **family enrollment process** moves; each child’s **enrollment track** on the opportunity may be at **Tour**, **Waitlist**, or **Enrolled** while the **child person** remains **Active**. Never model Tour / Waitlist / Enrolling / Enrolled as generic **child identity** statuses.

**Locked rules:**

1. **Case status is boring** — Open, Closed, Inactive, Archived (plus duplicate/lost/converted where configured).
2. **Enrollment stage belongs to OCM enrollment track** — not `persons.status_key`, not global “child status.”
3. **Lifecycle Builder stages are configured** — Lead, Qualification, Tour, Waitlist, Enrolling, Enrolled — **do not replace** with new ad-hoc status labels.
4. **Person / child identity status** — roster and care operations only.
5. **Location/program/room are child-placement contextual** — siblings may differ by site.
6. **Queue membership for enrollment lanes** — OCM enrollment stage mapping (via builder config), **not** `opportunities.status_key`.
7. **Queue rows show family context** — child-grain membership includes case + sibling enrollment-stage summary.
8. **Access scope filters rows and redacts sibling detail** — never leaks cross-site PII to restricted users.

---

## 1. Entity status vocabulary (target)

Statuses live in `status_definitions` per `entity_type`. Keys are org-configurable. **Enrollment operator stages** come from Lifecycle Builder — they are **not** a replacement vocabulary for builder stage keys. **Configurable label doctrine** (customer labels, Alloy layers, disposition mapping, default seed matrix): [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md).

### 1.1 Person status (`persons.status_key`)

**Role:** Human identity and roster — parents, guardians, staff. **Not** enrollment pipeline.

| Profile | `metadata.applies_to_profiles` | Target keys | Meaning |
|---------|-------------------------------|-------------|---------|
| **Generic** | `person_generic` | `active`, `inactive`, `archived` | Adult identity / roster |

**Does not own:** Lead, Tour, Waitlist, Enrolled — those are **enrollment lifecycle stages** on the child’s OCM track.

### 1.2 Opportunity / Case status (`opportunities.status_key`)

**Role:** **Household case container** — coordination shell, not per-child enrollment truth.

| Target key | Operator label | Meaning |
|------------|----------------|---------|
| `open` | Open | Case in progress; children may be at different enrollment stages |
| `closed` | Closed | Resolved (lost, fully complete, or policy terminal) |
| `inactive` | Inactive | Dormant / paused case |
| `archived` | Archived | Historical; hidden from default queues |
| `duplicate` | Duplicate | Merged duplicate case |
| `lost` | Lost / not enrolling | Case closed — family not enrolling |
| `converted` | Fully enrolled | Optional — all children terminal per org policy |

**Legacy pipeline keys** (`tour_scheduled`, `waitlisted`, `enrolled`, …) remain in transitional tenants until migration — **must not** be target vocabulary for new configuration.

**Does not own:** Per-child enrollment stages (Tour, Enrolled, …).

### 1.3 Child identity status (`persons.status_key` — `child_lifecycle` profile)

**Role:** **Durable child person** roster and care operations — enrolled-child operations, withdrawals, graduation. This is **not** the enrollment pipeline stage for an inquiry on a case.

| Target key | Operator label | Meaning |
|------------|----------------|---------|
| `active` | Active | Child person active in roster / care context |
| `inactive` | Inactive | Not currently active in care operations |
| `withdrawn` | Withdrawn | Withdrawn from program (roster) |
| `graduated` | Graduated | Completed program / graduated |
| `archived` | Archived | Historical child person record |

**Optional transitional:** `future_start` where orgs distinguish pre-start roster.

**Authoritative row:** `persons` linked to `customer_members` / child person — **not** `opportunity_customer_members`.

**Does not own:** Tour, Waitlist, Enrolling, Enrolled, Lead, Qualification — those are **enrollment lifecycle stages** on the OCM enrollment track for a **specific opportunity**.

**UI rule:** Label as **Child status** or **Roster status** — never “Touring child” as identity.

### 1.4 Enrollment lifecycle stage (OCM enrollment track)

**Role:** Where this child’s **enrollment participation** sits in the configured enrollment lifecycle for **this case** — queue membership, lifecycle visual, lane labels.

**Configured operator stages (Lifecycle Builder — do not rename in architecture docs):**

| `stage_key` (builder) | Operator stage label | Queue lane example |
|-----------------------|----------------------|-------------------|
| `lead` | Lead | New lead follow-up (often case-grain) |
| `qualification` | Qualification | Qualification lane |
| `tour` | Tour | Tour queue |
| `waitlist` | Waitlist | Waitlist lane |
| `enrolling` | Enrolling | Enrolling lane |
| `enrolled` | Enrolled | Enrolled lane |

**Ownership:** Child’s enrollment track on `opportunity_customer_members` (OCM) inside the opportunity — **not** global child identity.

**Membership rule:** Enrollment lane queue membership = OCM row matches builder stage config (`included_status_keys` or future `enrollment_stage_key`) + location access — **never** `opportunities.status_key` pipeline keys.

**Transitional storage (today):** Granular keys on `opportunity_customer_members.outcome_status_key` (`tour_scheduled`, `waitlisted`, `enrolled`, …) map to builder stages via Lifecycle Builder status sets. UI may still say “Touring” — **architecture treats these as enrollment-stage membership signals**, not child identity.

**Target storage (recommended):** explicit `enrollment_stage_key` on OCM holding builder `stage_key`; keep granular disposition separately (see §1.6).

**Events (today):** `child_lifecycle_status_changed` on disposition changes — name is legacy; event payload should evolve toward stage + disposition.

### 1.5 Enrollment disposition (granular, within stage)

**Role:** Fine-grained enrollment state **within** a lifecycle stage — tour scheduled vs tour completed, offer pending, etc.

| Stage | Representative disposition keys (`outcome_status_key` today) |
|-------|--------------------------------------------------------------|
| Lead / Qualification | `new_inquiry`, `interested` |
| Tour | `tour_requested`, `tour_scheduled`, `tour_completed`, `tour_completed_pending_decision` |
| Waitlist | `waitlisted` (+ `placement_candidates` for ordering) |
| Enrolling | `offer_pending`, `enrolling` |
| Enrolled | `enrolled` |
| Terminal decline | `not_enrolling`, `declined`, `withdrawn`, `deferred` |

**Entity type in status_definitions:** `opportunity_customer_members`.

### 1.6 Schema target — enrollment stage vs disposition (recommended)

| Concept | Transitional (today) | Target |
|---------|----------------------|--------|
| Enrollment **stage** (builder) | Derived: `outcome_status_key` ∈ stage `included_status_keys` | **`opportunity_customer_members.enrollment_stage_key`** — stores builder `stage_key` (`lead`, `qualification`, `tour`, `waitlist`, `enrolling`, `enrolled`) |
| Enrollment **disposition** (granular) | `outcome_status_key` (conflated with stage in UI) | **`enrollment_disposition_key`** (rename of `outcome_status_key`) or keep column name with clarified semantics |
| Child **identity** status | `persons.status_key` (`child_lifecycle`) | Same — **never** Tour/Enrolled keys here |
| Case status | `opportunities.status_key` | Boring container keys only |

**Migration principle:** Actions/workflows set **disposition**; stage updates via workflow or derived sync from builder mapping until explicit `enrollment_stage_key` column ships. **Do not** add Tour/Enrolled as `persons.status_key` values.

### 1.7 Placement candidate / waitlist (`placement_candidates.status`)

**Role:** **Waitlist orchestration grain** — not enrollment disposition.

| Key | Meaning |
|-----|---------|
| `active` | On waitlist, eligible for ordering |
| `paused` | Temporarily held |
| `withdrawn` | Removed from waitlist |
| `placed` | Placed / converted (may align with child enrolled) |

**Authoritative for:** Queue position, cohort, site scope on waitlist lane.  
**Does not replace:** waitlist **enrollment stage** / disposition on OCM.

### 1.8 Summary ownership matrix

| Layer | Field | Enrollment stage? | Child identity? | Case container? | Waitlist rank? |
|-------|-------|-------------------|-----------------|-----------------|----------------|
| Person (adult) | `persons.status_key` | No | No | No | No |
| Child person | `persons.status_key` (`child_lifecycle`) | No | **Yes** | No | No |
| Opportunity | `status_key` | No | No | **Yes** | No |
| OCM enrollment track | `enrollment_stage_key` (target) / disposition via `outcome_status_key` | **Yes** | No | No | No |
| Placement candidate | `status` | No | No | No | **Yes** |

---

## 2. Enrollment lifecycle stage vs status

### 2.1 Definitions

| Term | Definition |
|------|------------|
| **Status** | Persisted CRM disposition on an entity row — case, person, candidate — mutated by actions/workflows |
| **Child identity status** | `persons.status_key` on the child person — Active, Withdrawn, Graduated, … |
| **Enrollment lifecycle stage** | Configured builder stage (Lead, Tour, Enrolled, …) for **this child’s OCM track** on this case |
| **Enrollment disposition** | Granular key within a stage (`tour_scheduled`, `offer_pending`, …) — transitional: `outcome_status_key` |
| **Lifecycle subject** | Entity whose enrollment stage/disposition creates **queue membership** — usually OCM `child` grain |
| **Queue lane label** | Operator copy from builder queue view — aligns to **enrollment stage**, not child identity |

### 2.2 Authority

| Question | Answer |
|----------|--------|
| What owns enrollment stage membership? | **OCM enrollment track** — builder stage config applied to OCM disposition/stage fields |
| What is child `status_key`? | **Identity / roster** on child **person** — not enrollment stage |
| What is case `status_key`? | **Container** — Open / Closed / Inactive / Archived |
| Is enrollment stage stored? | **Target:** `enrollment_stage_key` on OCM; **today:** derived from `outcome_status_key` ∈ stage status set |
| Can a stage contain multiple dispositions? | **Yes** — Tour stage: `tour_scheduled`, `tour_completed`, … |
| Does stage imply disposition? | **No** — advancing stage in UI mutates disposition/stage via **actions**, not layout JSON |
| Replace builder stages with new status labels? | **No** — use configured Lead / Qualification / Tour / Waitlist / Enrolling / Enrolled |

### 2.3 Display contract (extends status ownership §5)

| Surface | Primary label source |
|---------|-------------------|
| **Queue row chip** | **Enrollment stage** label (e.g. Tour, Enrolled) + lane — from `QueueRowContext.row_stage` / `enrollment_stage_label` |
| **Drawer header (focused)** | Child name + **enrollment stage** for active OCM track — not child identity “Touring” |
| **Drawer lifecycle visual** | **Active child enrollment `stage_key`** from builder — not `opportunities.status_key` |
| **Case status in drawer** | Secondary — **Open** / Closed |
| **Children block** | Per child: **enrollment stage** + **child identity status** (when shown) + placement — separate fields |

### 2.4 Lifecycle Builder mapping

```
Lifecycle Builder Stage (operator mental model)
    ├── lifecycle_subject_grain: case | child | candidate
    ├── status_key set (for that grain's authoritative field)
    ├── queue view (lane label, count_unit)
    └── required information / actions (stage-scoped config)
```

**Universal lifecycle metadata** on opportunity status definitions (`metadata.lifecycle_stage`: intake, qualification, execution, …) is a **cross-industry CRM hint** — not the enrollment operator stage label. Enrollment operator stages use **configured builder stage keys** (`lead`, `qualification`, `tour`, `waitlist`, `enrolling`, `enrolled`).

### 2.5 Schema and code surfaces that conflict today

| Surface | Conflict | Target alignment |
|---------|----------|------------------|
| `opportunity_customer_members.outcome_status_key` | Named “status”; stores disposition keys that **imply** enrollment stage (`enrolled`, `tour_scheduled`) | Treat as **enrollment disposition**; add `enrollment_stage_key` for builder stage |
| `child.status` layout refKey alias | Maps to `inquiry_child.outcome_status_key` — reads as **child status** | Enrollment stage field: `inquiry_child.enrollment_stage_key` (target); identity: `child.identity_status` or person-scoped field |
| `inquiry_child.outcome_status_key` field label | Often “Status” / “Enrollment status” in Settings | Label: **Enrollment disposition**; separate **Enrollment stage** and **Child status** |
| `persons.status_key` (`child_lifecycle`) | Correct for identity — but UI sometimes conflated with enrollment | **Child status** only — Active / Withdrawn / Graduated / … |
| `opportunities.status_key` pipeline keys | Case row shows `tour_scheduled` etc. | Migrate to Open / Closed; enrollment lanes use OCM only |
| Event `child_lifecycle_status_changed` | Name suggests child person lifecycle | Payload should distinguish enrollment track vs child identity |
| Queue row copy “Touring child” | Implies child identity tours | **Tour enrollment stage** for this case’s OCM track |
| `RelatedSubjectSummary.status_label` | Generic — often disposition label | Prefer `enrollment_stage_label` + optional `child_identity_status_label` |

**No column today:** `opportunity_customer_members.enrollment_stage_key` — recommended target (§1.6).

### 2.6 `QueueRowContext` impact

| Field | Today (partial) | Target after correction |
|-------|-----------------|-------------------------|
| `row_stage` | Queue lane / builder label | **Enrollment stage** operator label (Tour, Enrolled) |
| `row_status_key` / `row_status_label` | Often case or disposition key | **Enrollment stage key** + label for row OCM track; disposition optional in `row_disposition_*` |
| `active_subject.stage_key` | Builder stage | **Enrollment `stage_key`** for focused OCM track |
| `active_subject.status_key` | Disposition / legacy | **`enrollment_disposition_key`** or stage key — document which is populated |
| `case_context.case_status_*` | Case container | **Open** / Closed — unchanged |
| `related_subjects_summary[].status_label` | Mixed enrollment copy | **`enrollment_stage_label`**; optional `child_identity_status_label`; not “Touring” as identity |

**Adapter rule:** Child-grain rows set `row_subject` to child + **enrollment stage** for membership reason; never imply child `persons.status_key` = Tour.

### 2.7 Layout Configuration impact

| Block | Impact |
|-------|--------|
| `focused_subject` | Primary chip = **enrollment stage** for active OCM track |
| `lifecycle_visual` | Builder stage for **enrollment track** — Tour, Enrolled, … |
| `status_chip` | `subject_scope` must distinguish **case** vs **enrollment_stage** vs **child_identity** |
| `related_subjects_summary` | Show sibling **enrollment stages** in family context; child identity separate column/line when needed |
| `family_case_context` | Case **Open** — not enrollment stage |
| Field refs | Target: `inquiry_child.enrollment_stage_key`; identity via person/child person field — **do not** bind `child.status` → OCM disposition for enrollment stage |

---

## 3. Mixed household model (canonical)

### 3.1 Reference scenario — Smith Household

| Entity | Case / identity / enrollment |
|--------|------------------------------|
| Opportunity | **Open** |
| Child A | child identity: **Active** · enrollment stage: **Enrolled** · Loc 1 |
| Child B | child identity: **Active** · enrollment stage: **Tour** · Loc 1 |
| Child C | child identity: **Active** · enrollment stage: **Waitlist** · Loc 2 |

**Language rule:** Say “Child B — **Tour** enrollment stage,” not “Child B is Touring” as identity status.

### 3.2 Work unit queues

| Lane | Builder stage | Grain | Membership | Smith household |
|------|---------------|-------|------------|-----------------|
| Tour | `tour` | child (OCM) | OCM enrollment stage / disposition ∈ Tour stage set | **1 row** — Child B (focused), case context Smith **Open** |
| Waitlist | `waitlist` | candidate | Candidate active + OCM waitlist stage | **1 row** — Child C @ Loc 2 (admin); hidden for Loc 1 user |
| Enrolled | `enrolled` | child (OCM) | OCM enrollment stage Enrolled | **1 row** — Child A (focused) |

**Queue row (Child B, Tour lane):**

- `row_subject`: Child B — enrollment stage **Tour** (not “child status Touring”)
- `row_stage`: Tour (lane label from builder)
- `case_context`: Smith Household — **Open**
- `related_subjects_summary`: A — **Enrolled** (Loc 1); C — **Waitlist** (Loc 2, redacted if out of scope)
- `placement_context`: Loc 1 program/room when set

**Queue row (Child A, Enrolled lane):**

- `row_subject`: Child A — enrollment stage **Enrolled**
- `related_subjects_summary`: B — **Tour** (Loc 1)

**Rule:** Same opportunity id may appear in **multiple lanes** — opening either row opens the **same opportunity drawer** with different `active_subject`.

### 3.3 Variant — same stage, multiple children (Smith A + B both Tour)

| Entity | Case / identity / enrollment |
|--------|------------------------------|
| Opportunity | **Open** |
| Child A | child identity: **Active** · enrollment stage: **Tour** · Loc 1 |
| Child B | child identity: **Active** · enrollment stage: **Tour** · Loc 1 |
| Child C | child identity: **Active** · enrollment stage: **Enrolled** · Loc 1 |

**Data truth (locked):** Child A and Child B are **two separate OCM enrollment tracks** — two Tour lifecycle subjects. Tour lane membership predicate matches **each** track independently.

| Question | Answer |
|----------|--------|
| How many Tour-subjects? | **2** (A and B) |
| Tour lane count (`count_unit` = children / enrollment_track)? | **2** — not 1 household |
| How many queue **cards** may the UI show? | **1 grouped card** or **2 single-child rows** — renderer choice |
| Case context | Smith Household — **Open** (unchanged) |
| Other children on grouped card | Child C — **Enrolled** (not in Tour group) |

**Grouped Tour card (recommended UX):**

- Primary line: **2 children — Tour** (or “Smith Household — 2 children touring”)
- Children in this stage: Child A, Child B
- Other children: Child C — Enrolled

**QueueRowContext (grouped presentation):**

- `row_presentation_mode`: `grouped_subjects`
- `row_subjects[]`: Child A + Child B (both Tour OCM ids)
- `row_grouping_key`: `{case_id}:{stage_key}:{optional_location_scope}`
- `row_count`: 2 · `row_count_unit`: `enrollment_track`
- `related_subjects_summary`: Child C — Enrolled (siblings **not** in the focused group)
- `drawer_open.active_subject_group`: both A and B; `stage_focus_key`: `tour`

**Click behavior:**

- Grouped row click → case drawer, Tour stage focus, **both A and B highlighted**
- Child A click inside card → same drawer, **A** = `active_subject`
- Child B click inside card → same drawer, **B** = `active_subject`
- Ungrouped renderer → two rows, each with one `row_subject`; count still **2**

**Reporting:** Grouped card is **not** one membership unit — dashboards counting enrollment tracks still count **2** for Tour; household rollup counts **1** case.

### 3.4 Same-stage grouping doctrine (locked)

| Principle | Rule |
|-----------|------|
| Membership grain | One queue membership match = one OCM enrollment track |
| Count truth | Sum of matching tracks — grouping does not dedupe |
| Presentation | Optional household card when `case_id` + `stage_key` (+ scope) match |
| Primary subject | Never fake a single child when multiple match — use `row_subjects` / `active_subject_group` |
| Drawer | Supports single `active_subject` and multi `active_subject_group` |
| Layout `focused_subject` | One child: “Child A — Tour”; multiple: “2 children — Tour” |

See [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) §4.1 and [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) § grouped rows.

### 3.5 Drawer (single-subject focus — §3.1 Child B Tour)

| Element | Behavior |
|---------|----------|
| **Shell** | Always opportunity/case drawer |
| **Opportunity status** | **Open** (boring case status) |
| **Header primary** | Child B + enrollment stage **Tour** (active OCM track) |
| **Lifecycle visual** | **Tour** stage for Child B’s enrollment track |
| **Children block** | Each child: enrollment stage + child identity status (if shown) + location |

**Group focus (§3.3):** Header may read “2 children — Tour”; lifecycle visual = shared **Tour** stage; children block highlights A and B when `active_subject_group` is set.
| **Location/program block** | Scoped to **active subject** placement (Child B → Loc 1) |

### 3.4 Reporting

| Grain | Count enrollments | Count touring | Count waitlisted |
|-------|-------------------|---------------|------------------|
| **Household** | 1 opp with mixed children | — | — |
| **Child** | 1 enrolled child | 1 touring child | 1 waitlisted child |
| **Location** | Per `OCM.location_id` / candidate `site_id` | Loc 1: 1 touring | Loc 2: 1 waitlisted |

Reporting must declare **grain** and **location scope** — never imply one case status equals one household outcome.

### 3.5 Attention

| Signal | Scope today | Target |
|--------|-------------|--------|
| Stale / SLA / readiness | Case-primary resolver | Keep + add **subject-scoped** plugins |
| Mixed disposition | Future `mixed_child_disposition` | Case-level conflict when children diverge |
| Cross-location sibling | Future | Optional awareness — not missing PII |

Attention **surfaces**; does not mutate status.

### 3.6 Operational work

| Rule | Detail |
|------|--------|
| Default subject | Opportunity (case) for household obligations |
| Per-child work | `context_snapshot` + future OCM subject link |
| Location | Copied in snapshot from OCM at creation — not inferred from case |

Contact attempts remain **work**, not statuses (see status ownership §5.4).

---

## 4. Location, program, and room ownership

### 4.1 Principle

> **Placement context is child-scoped.** A household case may span multiple sites; queue visibility and field cascades follow **the active subject's placement**, not a single opportunity-level site.

### 4.2 Field ownership (target)

| Field | Authoritative row | Meaning |
|-------|-------------------|---------|
| `location_id` (site) | **OCM** | School/site for **this child's** enrollment intent |
| `desired_program_type` | **OCM** | Program key (`childcare_program_type` item_key) |
| `program_room_cohort_key` | **OCM** | Room/unit — today often `locations.id` for `unit` row |
| `desired_schedule_type` | **OCM** | Schedule key |
| `site_id` | **placement_candidates** | Waitlist site scope |
| `program_room_cohort_key` | **placement_candidates** | Cohort key for ordering |
| `opportunities.location_id` | Opportunity | **Coordination default** / legacy / tour context — **not** sole SoT for child lanes |

### 4.3 Cross-location household example

| Child | Location | Queue visibility (Loc 1 user) |
|-------|----------|------------------------------|
| A Enrolled stage | Loc 1 | Full row in enrolled lane |
| B Tour stage | Loc 1 | Full row in tour lane |
| C Waitlist stage | Loc 2 | **Hidden** from lists; summary may show "1 waitlisted at another location" |

### 4.4 Authoritative configuration tables (today → target)

| Concept | Today | Target V1 |
|---------|-------|-----------|
| **Site** | `locations` (`location_type = site`) | Same |
| **Room / unit** | `locations` (`location_type = unit`, `parent_location_id`) | Same |
| **Program vocabulary** | `option_sets` / `option_set_items` (`childcare_program_type`) | Tab under Settings → Locations |
| **Schedule vocabulary** | `childcare_schedule_type` option set | Same |
| **Site → programs offered** | **Missing** | `location_program_offerings` or site metadata JSON (design choice in location-scoped programs doc) |
| **Program → rooms** | Implicit via unit `metadata.category` | Rooms tab grouped by site + program |
| **Cohort entity** | String key on OCM / candidate | Room = `locations` unit row |

**No hardcoded enrollment-only cascade in layout JSON** — field metadata declares `depends_on` + `option_source` (see §4.5, §7.5).

### 4.5 Program / room cascade (runtime contract)

```
Location (site) selected
    → filter Programs to offerings at that site
Program selected
    → filter Rooms to units under site where program band matches
Room selected
    → optional cohort key for waitlist candidate creation
```

**Surfaces:** Create Lead intake, drawer inquiry-child editor, layout-configured forms, action intake — **one cascade resolver**, not per-surface forks.

**Field catalog metadata (target):**

```typescript
type DependentSelectFieldConfig = {
  option_source: "locations" | "programs_for_location" | "rooms_for_location_program" | "option_set";
  option_set_key?: string;
  depends_on_field_key?: string; // e.g. location_id → desired_program_type → program_room_cohort_key
};
```

### 4.6 Verification pass — placement/program UI (2026-06-09)

**Queue / enrollment model (confirmed):** One queue row = **primary OCM enrollment track** (focused child + stage). `case_context` = shared opportunity. `related_subjects_summary` = **secondary sibling enrollment tracks**. Same family may appear in multiple stage queues with a **different primary child** per lane.

#### Layout-configured drawer runtime (`variant=production`)

When a published layout includes editable repeater columns:

- `inquiry_child.location_id`
- `inquiry_child.desired_program_type`
- `inquiry_child.program_room_cohort_key`

| Field | Renderer | Mechanism |
|-------|----------|-----------|
| Location | **`<select>`** | `option_source: locations` → `LayoutRuntimePlacementDataProvider.siteOptions` |
| Program | **`<select>`** | `option_source: programs_for_location` → `resolveProgramsOfferedForSite` |
| Room | **`<select>`** | `option_source: rooms_for_location_program` → `resolveRoomsForSiteAndProgram` |

**Requires:** `LayoutRuntimeDrawerEditProvider` (wraps `LayoutRuntimePlacementDataProvider`) + column `editable: true` (default via `enrichLayoutDocChildFieldsEditable`).

**Not text inputs** for these refKeys when production edit path is active — see `LayoutRuntimeFieldInput` + `resolveLayoutRuntimeFieldControl`.

**Proof/preview caveat:** Layout proof/preview without edit provider shows **read-only display** strings; proof fixtures may use labels instead of ids in `inquiry_child.location_id` until enrichment normalizes raw OCM ids.

#### Cascade behavior (layout runtime edit)

| Rule | Status |
|------|--------|
| Site selected → program options = programs for that site | **Yes** — `resolveProgramsOfferedForSite` |
| Program selected → room options filtered by site + program | **Yes** — `resolveRoomsForSiteAndProgram` |
| Location change clears incompatible program + room | **Yes** — `applyInquiryChildPlacementFieldChange` in `LayoutRuntimeDrawerEditProvider.setFieldValue` |
| Program change clears incompatible room | **Yes** — same cascade helper |

#### Configuration source — V1 (transitional)

| Question | Answer (today) |
|----------|----------------|
| `location_program_offerings` table? | **No** — not shipped |
| Programs per location configured in Admin UI? | **No dedicated offerings editor** — Settings → Locations is flat hierarchy; Programs/Offerings **tab not shipped** (design in [`location_scoped_programs_configuration_design.md`](./location_scoped_programs_configuration_design.md)) |
| Program catalog vocabulary | **`childcare_program_type`** option set (`option_sets` / `option_set_items`) |
| Programs offered at a site (V1) | **Derived** — distinct `metadata.category` on **active `unit` rows** under site, joined to option set for labels |
| Rooms | **`locations`** `unit` rows under site; filter by `metadata.category` = program key |
| Layout JSON hardcodes program options? | **No** — `option_source` metadata + shared resolvers |

**Transitional limitation:** A site only “offers” programs that have at least one active room with matching `metadata.category`. Sites wanting a program without a room yet need V2 `location_program_offerings`.

#### Hardcoded / transitional surfaces (audit)

| Surface | Location | Program | Room cascade | Verdict |
|---------|----------|---------|--------------|---------|
| Layout runtime drawer edit | Site-scoped select | Site-scoped select | Site + program select | **Correct** |
| `ConfiguredCreateFormFields` / Add Child | Cascade hook | Site-scoped | Site + program | **Correct** |
| Create Lead / Action Intake (`ActionIntakeFieldGroups`) | Placement select | `site_program` placement | `site_room` | **Correct** |
| `OpportunityInquiryChildrenSection` | Site select | Site-scoped via `resolveProgramsOfferedForSite` | Site + program via `buildInquiryChildRoomOptionsForSite` | **Correct** (2026-06-09) |
| Layout preview (`variant=preview`) | Read-only | Read-only | Read-only | **N/A** (no edit provider) |
| Queue row preview fixtures | Display strings | Display strings | Display strings | **Display-only** |
| `buildPartialQueueRowContext` | No `placement_context` yet | — | — | **Types only** |

#### `SubjectPlacementContext` / `QueueRowContext.placement_context`

| Field | Type support | Populated in API today? |
|-------|--------------|-------------------------|
| `location_id` / `location_label` | **Yes** | **No** — adapter TODO; enrich on row separately |
| `program_key` / `program_label` | **Yes** | **No** |
| `room_id` / `room_label` | **Yes** | **No** |
| `schedule_key` / `schedule_label` | **Yes** | **No** |

`RelatedSubjectSummary` may include `location_id` / `location_label` when adapter ships; enrollment **stage** labels are separate from placement (§2).

### 4.7 Target configurable model (frozen)

| Rule | Detail |
|------|--------|
| Locations configure **program offerings** (target) | Explicit per-site offerings in Settings → Locations **Programs / Offerings** tab, or V2 `location_program_offerings` |
| Programs selected from **program catalog** | `childcare_program_type` option set (org vocabulary) |
| Rooms/cohorts belong to **location + program** | `locations` units under site with `metadata.category` = program key |
| Layout fields use **`option_source` metadata** | `locations` → `programs_for_location` → `rooms_for_location_program` — not hardcoded options in layout JSON |
| Cascade resolver | Single module: `inquiryChildPlacementOptions.ts` + `LayoutRuntimePlacementDataProvider` |
| V1 transitional | Derive offerings from **room inventory** until offerings editor ships |

---

## 5. Access control and redaction

### 5.1 Scope dimensions (existing)

| Dimension | Effect on queues |
|-----------|----------------|
| **Department scope** | Work unit / department visibility |
| **Site scope** | `RecordScopeConstraints.locationIds` — filters opportunities, OCM joins, candidate `site_id` |
| **Workspace site filter** | Narrows to site subtree (header selection) |

### 5.2 Row visibility rules (target)

| User access | Child A/B (Loc 1) | Child C (Loc 2) |
|-------------|-------------------|-----------------|
| Loc 1 only | Rows visible in queues | **No row** in waitlist lane; no OCM detail |
| Loc 1 + 2 | All rows | All rows |
| Admin / all sites | All rows | All rows |

**Implementation pattern:** Membership query applies location predicate on **subject grain** (OCM `location_id`, candidate `site_id`); case-grain lanes use opportunity `location_id` only when **no child subjects** are in scope (legacy) — prefer child-grain lanes for enrollment.

### 5.3 Related subjects summary — visibility levels

Extend `RelatedSubjectSummary` (types shipped in `lifecycleSubjectContracts.ts`):

| `visibility` | Drawer / queue summary behavior |
|--------------|--------------------------------|
| `full` | Name + status + location label |
| `redacted` | "1 other child" / count only — no name, no site detail |
| `hidden` | Omitted from list (still counted in household totals if policy allows) |

**Drawer rule:** Restricted user opening Child B sees full context for Loc 1 siblings; Child C appears as **"1 waitlisted at another location"** without name or program detail.

### 5.4 Counts under scope

| Count type | Rule |
|------------|------|
| Lane badge (`count_unit: children`) | Count **visible** child/candidate rows only |
| Department KPI | Same scope predicates — no org-wide leak |
| Cross-location household | Never inflate Loc 1 touring count with Loc 2 children |

---

## 6. Layout Configuration compatibility

Runtime resolves **active subject**, **placement context**, and **visibility** — layout JSON declares blocks only.

### 6.1 System blocks → contract fields

| Block key | Reads | Must not compute in layout |
|-----------|-------|----------------------------|
| `focused_subject` | `active_subject`, `row_status_label`, `placement_context` | OCM table joins |
| `family_case_context` | `case_context`, `primary_contact` | Customer name heuristics |
| `related_subjects_summary` | `related_subjects_summary[]` with `visibility` | Parse `inquiry_children` |
| `lifecycle_visual` | `active_subject.stage_key`, process config | `opportunities.status_key` |
| `location_program_room` | `placement_context` on active subject | Static dropdown options |
| `attention_summary` | `attention_summary` | Resolver rules |
| `work_summary` | `work_summary` | Task queries |
| `next_best_action` | `next_best_action` | BOS catalog |

### 6.2 Runtime payload (target extension)

`WorkUnitSurfaceContext` / `QueueRowContext` gain optional:

- `placement_context` on row subject
- `visibility` on related subjects
- `access_scope` echo (site ids applied) for layout debug

See `web/lib/workUnits/lifecycleSubjectContracts.ts` — optional fields documented; adapters populate in later phases.

### 6.3 Layout JSON rules

| Forbidden | Use instead |
|-----------|-------------|
| `if entity_type === inquiry_child` branches | `focused_subject` block |
| Hardcoded program keys | `option_source` metadata |
| Single `opportunities.location_id` for child block | `placement_context.location_id` |
| Show all siblings always | Respect `visibility` |

---

## 7. Integration with Lifecycle Builder, Work Units, and Layout Configuration

> **This contract is not separate from lifecycle or layout work.** Status ownership, location scope, and cascade rules are the **domain inputs** that Lifecycle Builder configures, work-unit queues resolve into membership, runtime normalizes into `QueueRowContext`, the drawer focuses via `active_subject`, and Layout Configuration blocks render without recomputing grain logic.

**Upstream config:** Lifecycle Builder (`departments.metadata` lifecycle activation board) — see [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md).  
**Runtime contract:** [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md), `web/lib/workUnits/lifecycleSubjectContracts.ts`.  
**Layout cutover:** [`layout_runtime_cutover_plan.md`](../archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md) (C4 queue rows require `QueueRowContext`).

### 7.1 Lifecycle Builder integration

#### Rules (locked)

| Rule | Detail |
|------|--------|
| Stage is not authoritative | **No `lifecycle_stage` column** on opportunities, OCM, or candidates — stage is a **configured lens** |
| Stage is a lens over status | Each builder stage declares which **status keys** on which **subject grain** qualify for that stage's queue view |
| Status is authoritative | Mutations change `status_key` / `outcome_status_key` / candidate `status` via actions and workflows |
| Stage ⊃ status (optional) | One stage may include **multiple** status keys; one status maps to **one** primary stage per lifecycle (org config) |
| Work is not status | Stage may declare **work requirements** (e.g. contact attempts) — operational work, not status keys |

#### Target stage config shape (builder publish path)

Each stage in the lifecycle activation board must eventually declare:

| Field | Purpose |
|-------|---------|
| `lifecycle_key` | Process scope (e.g. `enrollment`) |
| `stage_key` | Stable builder key (e.g. `tour`, `case_follow_up`) |
| `subject_type` | `case` \| `child` \| `candidate` — **lifecycle subject grain** for this queue view |
| `included_status_keys` | Status keys on that grain's authoritative field that qualify for membership |
| `location_scope` (optional) | Filter membership by subject placement (`OCM.location_id`, candidate `site_id`) when stage is site-scoped |
| `program_scope` (optional) | Future — filter by program offering on OCM |
| `room_scope` (optional) | Future — filter by room/cohort on OCM or candidate |
| `count_unit` | `case` \| `children` \| `candidates` — lane badge / KPI grain (operator-facing) |
| `work_requirements` (optional) | Stage-scoped operational work templates — e.g. contact attempt series |

Maps to existing builder concepts: **queue view** (operator label), `lifecycle_subject_grain`, status-stages API PATCH, work unit row under department.

#### Example A — Enrollment Tour stage (child grain / OCM track)

| Config field | Value |
|--------------|-------|
| `lifecycle_key` | `enrollment` |
| `stage_key` / queue label | `tour` / **Tour** |
| `subject_type` | `child` (OCM enrollment track) |
| `included_status_keys` | `tour_requested`, `tour_scheduled`, `tour_completed`, `tour_completed_pending_decision` (dispositions within Tour) |
| `count_unit` | `children` |
| Authoritative membership | OCM enrollment stage = Tour (via disposition set today; `enrollment_stage_key` target) |
| Location scope | Subject `OCM.location_id` (when user/site filter applied) |

**Builder UX:** Administrator configures **Tour** stage on the **enrollment lifecycle** — not child identity status, not `opportunities.status_key = tour_scheduled`. Children do not “tour”; the enrollment track is at Tour for that child on this case.

#### Example B — Case Follow-Up stage (case grain + work)

| Config field | Value |
|--------------|-------|
| `lifecycle_key` | `enrollment` (or `case_coordination`) |
| `stage_key` / queue label | `case_follow_up` / **New Lead Follow-Up** |
| `subject_type` | `case` |
| `included_status_keys` | `open` (target boring case status) |
| `count_unit` | `case` |
| Authoritative field | `opportunities.status_key` |
| `work_requirements` | Contact attempt series (e.g. 3 attempts) — **operational_tasks**, not status keys |

**Builder UX:** Stage shows households in **open** case status; lane count = **families/cases**. Contact progress appears in **work_summary** / work block — not as `contact_attempt_2` status chips.

#### Builder → runtime flow

```
Lifecycle Builder stage config (departments.metadata)
    → work unit queue_definition (lane key, grain, count_unit, status filters)
    → QueueService membership query (subject status ∈ included_status_keys + location access)
    → enrich row (case anchor, siblings, placement)
    → buildPartialQueueRowContext / future full adapter
    → QueueRowContext on API item
    → Layout blocks + drawer VM
```

---

### 7.2 Work-unit queue integration

#### Rules (locked)

| Rule | Detail |
|------|--------|
| Membership | **Stage config** + **subject status** ∈ `included_status_keys` + **location access** on subject placement |
| Row primary identity | **Lifecycle subject** that matched — `QueueRowContext.row_subject` |
| Row family context | **Case anchor** — `case_context`, `primary_contact`, `related_subjects_summary` |
| Counts | **`count_unit` from stage/queue definition** — not always `opportunities` |
| Mixed households | **Multiple membership matches** across lanes when different subjects match different stages |
| Same-stage siblings | **Multiple tracks, same stage** on one case — count = N tracks; UI may **group** into one card (§3.3–§3.4) |

#### Canonical scenario (Smith household — mixed stages)

| Entity | Enrollment stage / case | Location |
|--------|-------------------------|----------|
| Opportunity | **Open** | — |
| Child A | identity Active · stage **Enrolled** | Location 1 |
| Child B | identity Active · stage **Tour** | Location 1 |
| Child C | identity Active · stage **Waitlist** | Location 2 |

#### Same-stage variant (Smith — A + B both Tour, C Enrolled)

| Entity | Enrollment stage / case | Location |
|--------|-------------------------|----------|
| Opportunity | **Open** | — |
| Child A | identity Active · stage **Tour** | Location 1 |
| Child B | identity Active · stage **Tour** | Location 1 |
| Child C | identity Active · stage **Enrolled** | Location 1 |

| Queue / lane | Membership matches | Count truth | UI options |
|--------------|-------------------|-------------|------------|
| **Tour** | A + B (2 OCM tracks) | **2** enrollment tracks | **1 grouped card** (“2 children — Tour”) **or** 2 separate rows |
| **Enrolled** | C | **1** | 1 row — Child C |

Grouped Tour card: `related_subjects_summary` = C **Enrolled** only; A and B in `row_subjects[]`. Drawer group open highlights A + B.

#### Queue appearance by lane and user (mixed-stage baseline §3.1)

| Queue / lane | Grain | Loc 1 user | Admin / regional (all sites) |
|--------------|-------|------------|------------------------------|
| **Tour** | child (OCM) | **1 membership match** — Child B, stage **Tour**, Loc 1. `case_context`: Smith **Open**. Siblings: A **Enrolled**, C **redacted**. Opens **same** opportunity drawer with Child B active. Count: **1** track. | Same; C may show full in sibling summary. |
| **Waitlist** | candidate | **No row** for Child C (Loc 2 out of scope). Count: **0**. | **1 row** — Child C, stage **Waitlist**, Loc 2. |
| **Enrolled** | child (OCM) | **1 row** — Child A, stage **Enrolled**, Loc 1. Siblings: B **Tour**, C redacted. Opens **same** drawer with Child A active. Count: **1**. | Full sibling summary. |
| **Lead / case follow-up** | case | **1 row** — Smith Household **Open**. Case chip only. Count: **1** case. | Same. |

**Multi-lane rule:** Up to three enrollment rows (Tour + Enrolled for Loc 1; + Waitlist for admin) share one opportunity drawer; **opportunity status stays Open** regardless of which row opened.

#### Membership predicate (conceptual)

```
membership(subject, stage, user_scope) =
  subject.grain === stage.subject_type
  AND subject.status_key ∈ stage.included_status_keys
  AND (stage.location_scope IS NULL OR subject.placement.location_id ∈ user_scope.location_ids)
```

---

### 7.3 QueueRowContext integration

`QueueRowContext` is the **normalized runtime payload** produced **after** queue membership resolution and row enrichment — the bridge between queue SQL and Layout Configuration / drawer VM.

#### Field mapping (locked)

| Domain concept | `QueueRowContext` field | Source |
|----------------|-------------------------|--------|
| Lifecycle subject (membership) | `row_subject` (single) or `row_subjects[]` (grouped) | Matching child / case / candidate entity(ies) |
| Presentation mode | `row_presentation_mode` | `single_subject` (default) or `grouped_subjects` |
| Grouping key | `row_grouping_key` | `{case_id}:{stage_key}` + optional location/program scope |
| Count on row | `row_count`, `row_count_unit` | Number of enrollment tracks represented (grouped card = N) |
| Lifecycle stage (lane) | `row_stage`, `lifecycle_key` | Builder stage / queue lane label |
| Subject status | `row_status_key`, `row_status_label` | Authoritative field on primary subject; grouped rows use shared stage label |
| Placement | `placement_context` | OCM or candidate placement columns |
| Case anchor | `case_context`, `primary_contact` | Opportunity + customer/contact enrichment |
| Sibling awareness | `related_subjects_summary[]` | All inquiry children + candidates; **visibility** per access |
| Drawer launch | `drawer_open` | `entity_type: opportunities`, `entity_id: case_id`, `active_subject` and/or `active_subject_group`, optional `stage_focus_key` |
| Attention / work / BOS | `attention_summary`, `work_summary`, `next_best_action` | Resolvers — read-only projections |

#### Partial vs target

| Aspect | Today (`1.0-partial`) | Target |
|--------|---------------------|--------|
| `row_subject.subject_type` | Often `case` even on child/candidate lanes | Honest `child` / `candidate` id + type |
| `placement_context` | **Partial** on case-grain rows when `_inquiry_children` placement is deterministic | Full from OCM / candidate on honest child-grain `row_subject` |
| `related_subjects_summary.visibility` | Types only | `full` / `redacted` / `hidden` from access resolver |
| `active_subject` in `drawer_open` | Often case | Matches `row_subject` for child/candidate lanes |
| `row_subjects` / grouped mode | Not implemented | Same-case + same-stage sibling grouping (§3.3–§3.4) |
| `active_subject_group` | Not implemented | Multi-child drawer highlight |

**Layout rule:** Layout Configuration and layout runtime **consume** `_queue_row_context` — they **must not** infer status, stage, or location from raw `opportunities` rows or layout JSON branches.

**Wiring today:** `QueueService` attaches context after enrichment — see work-unit-surface-context-contract. Rollback: `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1`.

---

### 7.4 Drawer integration

#### Rules (locked)

| Rule | Detail |
|------|--------|
| Shell | **Every queue row click** opens the **case/opportunity drawer** (`drawer_open.entity_type = opportunities`) |
| Focus | Drawer receives **`active_subject`** or **`active_subject_group`** from `drawer_open` |
| Header primary | Single: Child B — Tour. Grouped: **2 children — Tour** (§3.3) |
| Lifecycle visual | **Active subject** `stage_key` / process config — not case pipeline status |
| Case status | **Secondary** — "Active", "Closed" from `case_context` |
| Children block | **Visible siblings** with status + location; **redacted** entries where permissions require |
| Location/program/room | **Active child/candidate `placement_context`** — not blind `opportunities.location_id` |

#### Drawer open flow

```
Queue row click
  → open opportunities drawer (case_id)
  → set active_subject from drawer_open.active_subject
  → lifecycle_visual reads active_subject.stage_key
  → location_program_room reads placement_context for active_subject
  → related_subjects_summary respects visibility (redaction before layout render)
```

**Warm navigation:** Preserve case shell; swap `active_subject` when operator focuses another sibling in children block — lifecycle visual and placement blocks rebind to new subject without closing drawer.

---

### 7.5 Layout Configuration integration

Configured layouts (published `entity_layouts` / drawer variants) **place system blocks and scoped fields** — they do not own lifecycle logic.

#### System block mapping (locked)

| Block key | Consumes | Notes |
|-----------|----------|-------|
| `focused_subject` | `active_subject` / `row_subject`, `row_status_label`, `placement_context` | Primary identity in queue + drawer |
| `lifecycle_visual` | `active_subject.stage_key`, lifecycle process config | **Not** `opportunities.status_key` pipeline |
| `status_chip` | Config: `subject_scope` → `row_status_label` (child/case/candidate) or `case_context.case_status_label` | Block metadata declares which status surface |
| `family_case_context` | `case_context`, `primary_contact` | Household shell |
| `related_subjects_summary` | `related_subjects_summary[]` with `visibility` | Pre-redacted siblings |
| `location_program_room` | `placement_context` | Cascade via field `option_source` metadata |
| `attention_summary` | `attention_summary` | Read-only projection |
| `work_summary` | `work_summary` | Operational work — contact attempts, tasks |
| `next_best_action` | `next_best_action` | BOS / action placement |

#### Layout JSON rules (locked)

| Rule | Detail |
|------|--------|
| No lifecycle logic in JSON | Blocks bind to contract fields; runtime resolves subject + scope |
| Field scope metadata | Status fields declare `entity_scope`: `person` \| `case` \| `child` \| `candidate` in field catalog — layout picks correct field ref |
| Dependent selects | `option_source` + `depends_on_field_key` — shared cascade resolver; **no** `if enrollment` in layout |
| Redaction before render | Access resolver sets `visibility` on siblings **before** `LayoutRuntimeRenderer` — layout never sees cross-site PII for restricted users |
| Queue vs drawer | Queue row blocks read `item._queue_row_context`; drawer blocks read drawer VM + same context paths |

**Parallel sprint:** Layout Configuration may author block layouts and field placements against **stub/fixture** `WorkUnitSurfaceContext` and partial `_queue_row_context` today — see [`layout_runtime_cutover_plan.md`](../archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md) C1–C4.

---

### 7.6 Implementation dependency map

| Layer | Needs from this contract | Can proceed now? |
|-------|--------------------------|----------------|
| **Lifecycle Builder** | `subject_type` + `included_status_keys` + `count_unit` per stage; work requirements separate from status | **Partially** — grain + status sets align with existing activation board; full placement scope fields are **later** |
| **Queue runtime** | Membership = stage + status + location; attach `QueueRowContext` + `placement_context` | **Yes, partial** — context wired case-grain; honest child/candidate `row_subject` **later** |
| **Layout Configuration** | System block catalog + field `entity_scope` + `option_source` metadata | **Yes** — author against contract fields and fixtures |
| **Drawer VM** | `active_subject` + `placement_context` + redacted `related_subjects_summary` | **Yes, partial** — case-focused today; child focus + placement **later** |
| **Status migration** | Boring case vocabulary (`open` / `closed` / …) | **Later** — Phase 5 |
| **Child-grain queues** | Child/candidate membership predicates on OCM / candidate + location | **Design frozen** — [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md); implementation Phase 6 A–F |
| **Location cascade** | `option_source` + `depends_on_field_key` on inquiry_child fields | **Yes** — metadata + resolver API; settings offerings **later** |

---

## 8. Current-state vs target gaps

| Area | Today | Target |
|------|-------|--------|
| Case status | Pipeline keys common | Boring container keys |
| Queue primary chip | Often `_status_display` from opportunity | `QueueRowContext.row_status_label` |
| Child-grain `row_subject` | Still `case` in partial adapter | Honest child/candidate ids |
| Location on case | `opportunities.location_id` in queries | OCM/candidate primary for enrollment lanes |
| Program cascade | Org-wide option set | Location-scoped offerings |
| Create Lead program field | Text input | Dependent select |
| Sibling cross-site | Inconsistent filtering | Redaction contract |
| `related_subjects_summary` | No visibility field | `full` / `redacted` / `hidden` |

---

## 9. Phased implementation roadmap

### Phase 0 — Architecture (this sprint) ✅

Freeze vocabulary, stage vs status, location ownership, access redaction, layout rules.

### Phase 1 — Types + adapter extensions (low risk)

- Populate `placement_context`, `visibility` on `QueueRowContext` when data present
- Child-grain `row_subject` in adapter (phase 6 from prior roadmap)
- No membership SQL changes

### Phase 2 — Layout blocks on contract

- Focused subject, family context, siblings, lifecycle visual consume `_queue_row_context`
- Location/program block uses `placement_context` + cascade resolver API

### Phase 3 — Location-scoped programs settings

- Settings → Locations tabs (programs, rooms)
- `location_program_offerings` or metadata model from design doc
- Wire `option_source` on inquiry_child field definitions

### Phase 4 — Dependent selects (intake, drawer, forms)

- Shared cascade resolver
- Create Lead + action intake + layout forms
- Remove textbox program fields

### Phase 5 — Case status migration

- Pipeline keys → container keys
- Workflows and attention thresholds updated

### Phase 6 — Queue membership by child location

- Child/candidate lane SQL predicates on OCM `location_id` / candidate `site_id`
- Scoped counts verified per site filter

### Phase 7 — Access redaction in production

- `related_subjects_summary` visibility in resolver
- Drawer cross-location messaging

---

## 10. Risks and migration concerns

| Risk | Mitigation |
|------|------------|
| **Dual location** (opp vs OCM) | Document SoT; migrate reads to OCM; deprecate case-level program fields |
| **Room key shapes** (uuid vs string) | Normalize in placement resolver; single `room_id` in contract |
| **Scoped user confusion** | Redaction copy — never silent omission without count |
| **Stage/status collapse in UI** | Enforce display contract in redesign QA |
| **Reporting mixed grain** | Require grain + location dimensions on all enrollment KPIs |
| **Layout hardcoding** | Block-only consumption; CI check on layout JSON patterns |
| **Waitlist without candidate row** | OCM waitlisted disposition + optional candidate creation |
| **Person vs OCM status confusion** | Separate labels: "Child status (enrollment)" vs "Person status" |
| **Transitional pipeline keys** | Migration scripts per org; builder uses target sets only after cutover |

---

## 11. Open questions

| # | Question | Default if unresolved |
|---|----------|---------------------|
| OQ-1 | Dedicated `location_program_offerings` table vs site metadata JSON? | Metadata first (location-scoped programs design) |
| OQ-2 | Should `converted` case status be automatic when all children enrolled? | Org workflow policy — not builder default |
| OQ-3 | Show redacted sibling count on queue row or drawer only? | Drawer + optional queue subtitle |
| OQ-4 | Candidate `placed` vs child `enrolled` — single action or two? | Two fields; workflow links them |
| OQ-5 | Opportunity `location_id` after migration — tour default only? | Coordination + tour booking context |
| OQ-6 | Cross-industry program cascade without childcare option sets? | Generic `option_source` + vertical presets |

---

## 12. Related documents

| Doc | Role |
|-----|------|
| [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) | Lifecycle subject + queue row context |
| [`location_scoped_programs_configuration_design.md`](./location_scoped_programs_configuration_design.md) | Settings UX for programs/rooms |
| [`program_interest_configurable_model_audit.md`](./program_interest_configurable_model_audit.md) | Current program field audit |
| [`../archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md`](../archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md) | Layout runtime parallel work |
| [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md) | Builder stage / queue view config plane |
| [`../system/work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) | `QueueRowContext` developer contract |
| [`../system/entity-model.md`](../system/entity-model.md) | Entity location semantics |

---

## 13. Document maintenance

Update when: `enrollment_stage_key` ships on OCM, location offerings ship, case migration completes, child-grain `row_subject` ships, redaction resolver ships, layout block catalog stabilizes, or Lifecycle Builder stage keys change.
