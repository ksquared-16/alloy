# Child-Grain Queue Conversion — Design + Migration Plan

**Path:** `docs/sprints/06_2026/child_grain_queue_conversion_design.md`  
**Date:** 2026-06-06  
**Status:** **Frozen — architecture gate before queue membership / count changes**  
**Scope:** Design + phased migration only. **No runtime queue conversion in this sprint.**

**Authority:** This document is the **final architecture gate** before Phase 6 **implementation** may change queue membership, lane counts, or row IDs. Until implementation phases below are explicitly shipped and signed off, production membership remains on legacy case-grain / `filters_compat_v1` paths.

**Prerequisites (shipped — align to, do not redesign):**

| Area | Doc / code |
|------|------------|
| Status / lifecycle grain | [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) |
| Enrollment disposition matrix | [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) |
| Stage, location, access | [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) |
| Developer contract | [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) |
| Queue row context (partial) | [`completed/queue_row_context_consumption_closeout.md`](./completed/queue_row_context_consumption_closeout.md) |
| Drawer subject pipe + display | [`completed/drawer_active_subject_context_closeout.md`](./completed/drawer_active_subject_context_closeout.md), [`completed/drawer_subject_display_closeout.md`](./completed/drawer_subject_display_closeout.md) |
| Prior child/candidate runtime | [`05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`](../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md) · `childGrainEnrollmentQueue.ts` · `candidateGrainWaitlistQueue.ts` |

**Hard boundary (this sprint):**

| Do | Do not |
|----|--------|
| Freeze row IDs, membership predicates, grouping, migration phases | Change `QueueService` membership queries |
| Cross-link doctrine docs | Ship lane count / KPI changes |
| Define target `QueueRowContext` payloads | Remove `filters_compat_v1` yet |

---

## Executive summary

Enrollment operator lanes must count and list **lifecycle subjects** (OCM enrollment tracks and placement candidates), not household case pipeline status. Case context, sibling summaries, drawer shell, and access redaction stay mandatory on every non-case row.

**Locked conversion spine:**

```
status_definitions (disposition → enrollment_stage_key)
        ↓
OCM.outcome_status_key (+ enrollment_stage_key when column ships)
placement_candidates (waitlist candidate grain)
        ↓
Lane membership predicate (per stage × grain × location scope)
        ↓
Stable row id (ocmrow / pcrow) + case_anchor
        ↓
Optional same-stage grouping (presentation only)
        ↓
QueueRowContext (honest row_subject + summaries + drawer_open)
        ↓
Drawer / navigator (case shell + active_subject / active_subject_group)
```

**Implementation** follows phases **A → F** at the end of this document. **Phase 6 implementation sprints** may begin only after this doc is merged and product sign-off on count semantics is recorded.

---

## 1. Row identity

### 1.1 Principles (locked)

| Principle | Rule |
|-----------|------|
| **Membership unit** | One matching OCM enrollment track or one active placement candidate — not one opportunity |
| **Case anchor** | Always `opportunities.id` — drawer shell, `case_context.case_id`, `drawer_open.entity_id` |
| **Row id stability** | Row `id` must be stable across refreshes and unique within a lane; must not collide across siblings |
| **Legacy compat** | `opportunity_id` column on row payload remains set for joins, filters, and transitional clients |
| **Selection / URL** | Work-unit queue selection and session cache key off row `id` — child lanes must not use bare `opportunity_id` as row id |

### 1.2 OCM (child / enrollment-track) row id

**Format (existing — adopt as canonical):**

```
ocmrow:{opportunity_id}:{ocm_id}
```

| Field | Value |
|-------|-------|
| `opportunity_id` | `opportunities.id` (case anchor) |
| `ocm_id` | `opportunity_customer_members.id` |

**Code reference:** `enrollmentOffersChildQueueRowId()` in `web/lib/queues/childGrainEnrollmentQueue.ts`.

**Payload:**

| Field | Value |
|-------|-------|
| `id` | `ocmrow:…` |
| `opportunity_id` | case anchor (duplicate for compat) |
| `entity_type` | `opportunity` (queue entity remains opportunity-shaped for CRM compact compat) |
| `row_subject.subject_id` | `ocm_id` |
| `row_subject.subject_type` | `child` (presentation) — lifecycle ref uses enrollment track semantics |

**`LifecycleSubjectRef` for drawer:**

```typescript
{
  subject_type: "child",
  subject_id: ocm_id,
  lifecycle_key: "enrollment",
  stage_key: "<builder stage>",      // e.g. tour, enrolling, enrolled
  status_key: ocm.outcome_status_key,
  case_anchor: { entity_type: "opportunities", entity_id: opportunity_id }
}
```

### 1.3 Candidate (waitlist) row id

**Format (existing — adopt as canonical):**

```
pcrow:{opportunity_id}:{placement_candidate_id}
```

| Field | Value |
|-------|-------|
| `placement_candidate_id` | `placement_candidates.id` |

**Code reference:** `placementWaitlistCandidateRowProjection.ts` (`pcrow` builder).

**Synthetic fallback (transitional only):**

`synthetic-waitlist:{opportunity_id}` — legacy bridge when candidate row missing but opportunity still waitlisted at case grain. **Phase F** removes synthetic rows once membership is candidate-only.

**`LifecycleSubjectRef`:**

```typescript
{
  subject_type: "candidate",
  subject_id: placement_candidate_id,
  lifecycle_key: "enrollment",
  stage_key: "waitlist",
  status_key: candidate.status, // active | paused
  case_anchor: { entity_type: "opportunities", entity_id: opportunity_id }
}
```

### 1.4 Case-grain row id (Lead / Qualification — transitional)

**Format (current production):**

```
{opportunity_id}   // bare opportunities.id
```

Case-grain lanes keep bare opportunity id until **Phase C** enables child-grain lead tracks or **Phase 5** case-status migration completes. When a case lane later emits one row per OCM lead track, use `ocmrow:…` — never reuse bare opportunity id for a child-grain lane.

### 1.5 Grouped same-stage row id

When presentation groups multiple OCM tracks on one card:

```
group:{case_id}:{stage_key}:{scope_suffix}
```

| `scope_suffix` | When |
|----------------|------|
| `all` | Same stage, same case, single visible location scope |
| `{location_id}` | Group only children sharing stage **and** `OCM.location_id` |
| `{location_id}:{program_key}` | Optional finer scope when lane config requires |

**Rules:**

- Group id is **presentation-only** — membership still evaluated per OCM track before grouping.
- Ungrouped mode: N tracks ⇒ N `ocmrow` ids (recommended default for **Phase C** rollout; grouping opt-in via queue `ui.group_same_stage` flag).
- Navigator expands grouped rows into **virtual entries** per `row_subjects[]` for prev/next — each virtual entry carries its own `active_subject` (already supported via `drawer_subject_context` on navigator records).

### 1.6 Compatibility matrix

| Consumer | Requirement |
|----------|-------------|
| **Drawer open** | `drawer_open.entity_id` = opportunity id; `active_subject.subject_id` = ocm or candidate id |
| **Navigator** | Queue list item `id` matches row `id`; `drawer_subject_context` from `drawer_open` |
| **Row selection / WU cache** | Keys on row `id` — must update when switching case → ocmrow for a lane |
| **Tests** | Assert `ocmrow` / `pcrow` parsing helpers; grouped id not used as DB key |
| **`scheduleTour` / actions** | Existing `pcrow:` / `ocmrow:` prefix parsers must remain valid |

---

## 2. Queue membership by enrollment stage

Canonical enrollment stages: `lead` · `qualification` · `tour` · `waitlist` · `enrolling` · `enrolled` ([`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) §4).

**Enrollment pipeline v2 queue keys** (`web/lib/config/enrollmentPipelineQueueDefinitionV2.ts`):

| Operator stage | Queue key | Current `grain` in seed | Target membership grain |
|----------------|-----------|-------------------------|-------------------------|
| Lead | `new_leads` | `case` | **case** (then optional per-child lead tracks) |
| Qualification | `communications_followup` | `case` | **case** (then **child** when OCM qualification dispositions drive lane) |
| Tour | `tours` (+ `tours_follow_up`) | `case` | **child** (OCM enrollment track) |
| Waitlist | `waitlist` | `candidate` | **candidate** |
| Enrolling | `enrollment_offers` | `child` | **child** (OCM) |
| Enrolled | `enrollment_completed` | `child` | **child** (OCM) |

**Status resolution (target):**

1. Prefer `opportunity_customer_members.enrollment_stage_key` when column present (Phase 3 schema).
2. Else derive stage from `outcome_status_key` via `status_definitions.metadata.enrollment_stage_key` for `entity_type = opportunity_customer_members`.
3. Terminal / lost dispositions (`outcome_category` ∈ lost, withdrawn, deferred) **exclude** from active lane membership unless lane explicitly includes archive.

### 2.1 Lead

| Field | Value |
|-------|-------|
| **subject_type** | `case` (Phase 6C) · future: `child` / enrollment_track per OCM when intake always creates OCM rows |
| **source table** | `opportunities` (+ optional `opportunity_customer_members` for per-child lead dispositions) |
| **predicate (transitional)** | `opportunities.status_key` ∈ lead disposition set (`new_inquiry`, `open`, `new`, …) per `filters_compat_v1` |
| **predicate (target)** | Case: boring `open` + no child past lead OR any OCM with `enrollment_stage_key = lead` and non-terminal disposition |
| **status / disposition mapping** | `new_inquiry`, `deferred`, `not_enrolling` (case or OCM); labels from matrix §6.1 |
| **location scope** | Case: `opportunities.location_id` or primary site from access profile; child path: OCM `location_id` when child-grain lead ships |
| **count_unit** | `cases` (transitional) → `enrollment_track` when child-grain lead ships |

**Note:** Lead remains **household coordination** until case-status migration (Phase 5). Do not split lead lane to child-grain before operators have boring case status and OCM lead dispositions on all inquiry children.

### 2.2 Qualification

| Field | Value |
|-------|-------|
| **subject_type** | `case` (Phase 6C) → **child** (target) |
| **source table** | `opportunities` → `opportunity_customer_members` |
| **predicate (transitional)** | `opportunities.status_key` ∈ `{ contact_attempted, contacted, qualification }` |
| **predicate (target)** | OCM `enrollment_stage_key = qualification` AND `outcome_status_key` ∈ `{ needs_qualification, qualified, … }` AND NOT terminal |
| **status / disposition mapping** | `needs_qualification`, `qualified`, `not_a_fit`, `aged_out` (terminal → exclude) |
| **location scope** | OCM `location_id` (primary placement intent) |
| **count_unit** | `cases` → `enrollment_track` |

**Operational work:** Contact attempts 1–3 are **work**, not qualification statuses — lane membership does not key off attempt count ([`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) §5.4).

### 2.3 Tour

| Field | Value |
|-------|-------|
| **subject_type** | `child` (OCM enrollment track) |
| **source table** | `opportunity_customer_members` joined to `opportunities`, `persons` |
| **predicate** | `enrollment_stage_key = tour` OR `outcome_status_key` ∈ tour disposition set: `tour_requested`, `tour_scheduled`, `tour_completed`, `decision_pending` (+ org-configured tour dispositions) AND NOT terminal |
| **status / disposition mapping** | Matrix §6.1 tour rows; `row_stage` label = operator **Tour** stage |
| **location scope** | OCM `location_id` — row appears in lane when OCM location ∈ user visible sites (§5) |
| **count_unit** | `enrollment_track` (preferred) — alias `children` in queue_definition until KPI copy updated |

**Lanes:** Merge `tours` + `tours_follow_up` UI sections into one operator **Tour** stage lens at builder level; queue keys may remain two entries with same child predicate until config consolidation.

### 2.4 Waitlist

| Field | Value |
|-------|-------|
| **subject_type** | `candidate` |
| **source table** | `placement_candidates` (+ OCM join for child name, disposition, location) |
| **predicate** | `placement_candidates.status` ∈ `{ active, paused }` AND linked OCM `enrollment_stage_key = waitlist` (or disposition `waitlisted`, `waitlist_paused`) |
| **status / disposition mapping** | Candidate status for queue position; OCM disposition for chip label |
| **location scope** | Candidate `site_id` / cohort scope — **not** opportunity `location_id` |
| **count_unit** | `candidates` (children on waitlist) |

**Existing runtime:** `candidateGrainWaitlistQueue.ts` — align predicates to stage_key doctrine in Phase A, do not rewrite ranking engine.

### 2.5 Enrolling

| Field | Value |
|-------|-------|
| **subject_type** | `child` (OCM) |
| **source table** | `opportunity_customer_members` |
| **predicate** | `enrollment_stage_key = enrolling` OR `outcome_status_key` ∈ `{ offer_pending, registration_pending, paperwork_pending, start_date_scheduled }` |
| **status / disposition mapping** | Matrix §6.1 enrolling rows |
| **location scope** | OCM `location_id` |
| **count_unit** | `enrollment_track` |

**Existing runtime:** `childGrainEnrollmentQueue.ts` — extend stage predicate beyond `offer_pending` / `enrolling` legacy keys when matrix migration lands.

### 2.6 Enrolled

| Field | Value |
|-------|-------|
| **subject_type** | `child` (OCM) |
| **source table** | `opportunity_customer_members` |
| **predicate** | `enrollment_stage_key = enrolled` AND `outcome_status_key = enrolled` (success disposition) |
| **status / disposition mapping** | Matrix §6.1 enrolled |
| **location scope** | OCM `location_id` (roster site) |
| **count_unit** | `enrollment_track` |

### 2.7 Needs Attention (overlay — not a stage)

Remains **case-scoped** resolver overlay (`needs_attention` queue). Child-grain lanes may **display** case attention on card footer until subject-scoped attention ships (§6). Membership for NA lane does not switch to child grain in Phase 6.

---

## 3. Same-family / same-stage grouping

**Scenario:** Child A = Tour, Child B = Tour, Child C = Enrolled (Smith household).

### 3.1 Locked data truth

| Question | Answer |
|----------|--------|
| Enrollment tracks in Tour stage | **2** (A and B) |
| Tour lane `count_unit` total | **2** — not 1 household |
| Case context | Smith household — boring **Open** |
| Child C | **Not** in Tour membership — appears in `related_subjects_summary` only |

### 3.2 Default display (locked recommendation)

| Mode | Default in Phase 6C | Rationale |
|------|---------------------|-----------|
| **Separate rows** | **Yes** — two `ocmrow` cards | Lowest risk for selection, navigator, count clarity |
| **Grouped household card** | **Opt-in** per queue `ui.group_same_stage_subjects` | Operator preference / dense lanes |

When grouping enabled and A + B share `case_id` + `stage_key` + location scope:

- One card, `row_presentation_mode: grouped_subjects`
- Primary line: **2 children — Tour** (or configured template)
- `row_subjects[]`: A and B; `row_count: 2`, `row_count_unit: enrollment_track`

### 3.3 When grouping is allowed

| Condition | Required |
|-----------|----------|
| Same `opportunities.id` | Yes |
| Same `enrollment_stage_key` | Yes |
| Same visible location scope | Yes — do not group Loc 1 Tour with Loc 2 Tour unless user has both and config allows cross-site group |
| Same lane / queue key | Yes |
| Access | User can see **full** detail for all subjects in group — if one sibling would be `redacted`, split into separate rows or omit redacted sibling from group |

### 3.4 Click behavior

| Action | Result |
|--------|--------|
| Grouped card click | Open case drawer; `active_subject_group` = [A, B]; `stage_focus_key = tour`; lifecycle visual = Tour; both highlighted in children block |
| Child A line click | Same drawer; `active_subject` = A only; `focus_mode: subject_highlight` |
| Child B line click | Same drawer; `active_subject` = B |
| Separate row click | `active_subject` = that OCM; no group |

### 3.5 `drawer_open.active_subject_group`

Mirrors `web/lib/workUnits/lifecycleSubjectContracts.ts`:

- `drawer_open.active_subject_group`: full `LifecycleSubjectRef[]` for grouped open
- `drawer_open.stage_focus_key`: builder stage when group opens
- `DrawerSubjectContext.focus_mode`: `subject_group_highlight` when group present

---

## 4. Cross-stage household display

**Scenario:** Child A = Enrolled, Child B = Tour, Child C = Waitlist (mixed stages, possibly mixed locations).

### 4.1 Per-lane membership (what appears)

| Lane | Rows | Row subject | `related_subjects_summary` |
|------|------|-------------|------------------------------|
| **Tour** | **1** (`ocmrow:…:B`) | Child B — Tour | A — Enrolled; C — Waitlist (Loc 2, redacted if out of scope) |
| **Waitlist** | **1** (`pcrow:…:C`) | Child C — Waitlist | A — Enrolled; B — Tour |
| **Enrolled** | **1** (`ocmrow:…:A`) | Child A — Enrolled | B — Tour; C — Waitlist (redacted if needed) |
| **Lead / Qualification** | **0** (unless case still in those stages at case grain) | — | — |

**Rule:** Same `opportunity_id` in **multiple lanes** is expected — each row opens the **same case drawer** with different `active_subject`.

### 4.2 Related children summary rules

| Rule | Detail |
|------|--------|
| **Who is included** | All inquiry children on the case with lifecycle stage **≠** row subject stage (siblings not in this lane's membership) |
| **Labels** | Enrollment **stage** label preferred over disposition micro-copy (`Tour`, not `Tour scheduled`) on summary lines |
| **Order** | Active enrolled first, then stage order, then name |
| **Placement** | Include `location_label` / `program_label` when deterministic and visible |
| **Visibility** | `full` \| `redacted` \| `hidden` per §5 — default `full` until access resolver ships |
| **Cap** | UI may cap display at 3 lines + “+N more” — API should return full list for drawer |

### 4.3 Case status on card

`case_context.case_status_label` stays boring (**Open**) — never pipeline stage on case chip.

---

## 5. Placement / location scope

Reference: [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) §3–§5.

### 5.1 User with Location 1 access only

| Behavior | Rule |
|----------|------|
| Tour row (B @ Loc 1) | **Visible** — full placement on card |
| Waitlist row (C @ Loc 2) | **Hidden** from list OR row omitted entirely |
| Enrolled row (A @ Loc 1) | **Visible** |
| Sibling summary for B's row | C shown as **Waitlist — other location** (`visibility: redacted`) or **hidden** per org policy |
| Counts | Tour = 1, Enrolled = 1, Waitlist = 0 for this user |

### 5.2 User with Location 2 access only

Symmetric to §5.1 — B may be hidden from Tour; C visible on Waitlist.

### 5.3 Regional / admin user (multi-site)

| Behavior | Rule |
|----------|------|
| All three rows | Visible when OCM/candidate site ∈ profile |
| Mixed-location siblings | Full summary lines with location labels |
| Grouping | Do not group across locations unless `ui.group_same_stage_subjects` allows `scope_suffix = all` |

### 5.4 Mixed-location siblings on one case

| Principle | Rule |
|-----------|------|
| Membership | Evaluated per OCM/candidate site — not per opportunity |
| Case `location_id` | **Not** used for child/candidate lane membership after conversion |
| Redacted sibling | `RelatedSubjectSummary.visibility = redacted` — stage label only, no child name |
| Hidden sibling | Omitted from summary and counts |

### 5.5 Count behavior by location

Lane badge = count of **visible** membership units in scope after access filter. KPI `pipeline_total` remains case-grain internal lane — do not sum child lanes into case total without grain label.

---

## 6. Attention / work behavior

### 6.1 Today (Phase 6 implementation start)

| Scope | Behavior |
|-------|----------|
| **Attention** | Case-scoped `opportunityAttentionResolver` — `attention_summary` on row reflects case NA |
| **Work** | Case-scoped open work rollup |
| **Next best action** | Case / opportunity recommendation preview |

### 6.2 Target (parallel Phase 7 — not blocking Phase 6 membership)

| Scope | Behavior |
|-------|----------|
| **Case-scoped attention** | NA lane + optional footer on child rows (“Household needs attention”) |
| **Subject-scoped attention** | Readiness / requirement gaps on active OCM or candidate — primary chip when `subject_needs_attention` |
| **Subject-scoped work** | Open tasks tied to `lifecycle_subject` |
| **Grouped row aggregation** | `attention_summary.needs_attention = any(row_subjects need attention)`; label = highest priority subject or “Multiple children need attention” |
| **Queue card display** | Primary line = row subject stage; attention chip = subject-first when subject-scoped data present, else case footer |

### 6.3 Queue card fields (Phase 6C target)

| Field | Source |
|-------|--------|
| Primary title | `row_subject.display_name` + stage |
| Status chip | `row_status_label` (disposition) |
| Case line | `case_context.display_name` + boring case status |
| Siblings | `related_subjects_summary` |
| Placement | `placement_context` on **active** subject |
| Attention | `attention_summary` (case until Phase 7) |
| Work | `work_summary` (case until Phase 7) |
| NBA | `next_best_action` |

---

## 7. QueueRowContext target payloads

Contract version: `1.1-partial` → bump to `1.2-partial` when honest child `row_subject` ships (Phase B).

### 7.1 Single child row (Tour — Child B)

```json
{
  "contract_version": "1.2-partial",
  "row_presentation_mode": "single_subject",
  "row_subject": {
    "subject_type": "child",
    "subject_id": "<ocm_b_id>",
    "display_name": "Child B"
  },
  "row_stage": "Tour",
  "lifecycle_key": "enrollment",
  "row_status_key": "tour_scheduled",
  "row_status_label": "Tour scheduled",
  "row_count": 1,
  "row_count_unit": "enrollment_track",
  "case_context": {
    "case_id": "<opp_id>",
    "display_name": "Smith Household",
    "case_type_label": "Enrollment",
    "case_status_key": "open",
    "case_status_label": "Open"
  },
  "primary_contact": { "display_name": "Sarah Smith", "phone": "…", "email": "…" },
  "related_subjects_summary": [
    {
      "subject_type": "child",
      "subject_id": "<ocm_a_id>",
      "display_name": "Child A",
      "status_label": "Enrolled",
      "location_label": "Location 1",
      "visibility": "full"
    },
    {
      "subject_type": "candidate",
      "subject_id": "<pc_c_id>",
      "display_name": "Child C",
      "status_label": "Waitlist",
      "visibility": "redacted",
      "location_label": "Location 2"
    }
  ],
  "placement_context": {
    "location_id": "<loc_1>",
    "location_label": "Location 1",
    "program_label": "Preschool"
  },
  "attention_summary": { "needs_attention": false, "primary_reason_label": null },
  "work_summary": { "open_count": 0, "primary_open_label": null },
  "next_best_action": { "label": "Confirm tour", "source": "action_placement" },
  "drawer_open": {
    "entity_type": "opportunities",
    "entity_id": "<opp_id>",
    "active_subject": {
      "subject_type": "child",
      "subject_id": "<ocm_b_id>",
      "lifecycle_key": "enrollment",
      "stage_key": "tour",
      "status_key": "tour_scheduled",
      "case_anchor": { "entity_type": "opportunities", "entity_id": "<opp_id>" }
    }
  }
}
```

### 7.2 Grouped same-stage row (A + B Tour)

Key deltas:

- `row_presentation_mode`: `grouped_subjects`
- `row_subjects[]`: A, B
- `row_grouping_key`: `group:<opp_id>:tour:loc_1`
- `row_count`: 2
- `row_subject`: first child or synthetic “2 children” display per presentation helper
- `drawer_open.active_subject_group`: [A ref, B ref]
- `drawer_open.stage_focus_key`: `tour`
- `related_subjects_summary`: C only

### 7.3 Candidate row (Waitlist — Child C)

- `row_subject.subject_type`: `candidate`
- `row_subject.subject_id`: `placement_candidate_id`
- `row_stage`: `Waitlist`
- `placement_context` from candidate site / cohort projection
- `drawer_open.active_subject`: candidate ref, `stage_key: waitlist`

### 7.4 Mixed sibling summary (on any row)

- Include siblings **not** in current lane membership
- Never duplicate the row's own subject in summary
- Apply `visibility` per §5
- Drawer `DrawerSubjectContext.related_subjects` mirrors summary for focus strip

---

## 8. Runtime migration plan (Phases A–F)

These phases are **implementation** — none ship in the design sprint.

| Phase | Name | Deliverable | Membership changes? | Rollback |
|-------|------|-------------|---------------------|----------|
| **A** | Query builders behind flag | Child/candidate SQL builders per §2; env `ALLOY_QUEUE_CHILD_GRAIN_LANES` lane list | **No** — builders unused in production path | Flag off |
| **B** | Honest `row_subject` | `buildChildGrainQueueRowContext()` / `buildCandidateGrainQueueRowContext()`; attach when row already child/candidate sourced | **No** if membership still case-compat | `ALLOY_QUEUE_ROW_CONTEXT_DISABLED` |
| **C** | Enable selected lanes | Flip membership per lane: Tour → child, Waitlist → candidate (already partial), Enrolling/Enrolled → child; Lead/Qualification remain case until Phase 5 | **Yes** — counts shift | Per-lane flag + `filters_compat_v1` |
| **D** | Count unit / KPI | `count_unit` on summaries; pill labels “children” / “families”; `pipeline_total` grain label | **Yes** — display counts | Config rollback |
| **E** | Drawer / nav complete | Navigator virtual rows for grouped cards; subject-scoped placement on all lanes; selection cache migration for ocmrow ids | **No** | Revert nav expansion |
| **F** | Remove legacy dependency | Drop `filters_compat_v1` opportunity status membership for converted lanes; remove `synthetic-waitlist:` rows; case status boring | **Yes** — final | DB config migration revert |

**Recommended lane enable order in Phase C:** Enrolled → Enrolling → Tour → Waitlist (predicate alignment) → Qualification (child) → Lead.

**Testing gate before each lane flip:**

- Lane count QA spreadsheet vs SQL truth query
- Smith household mixed-stage manual scenario
- Location-scoped user matrix (§5)
- Drawer open + navigator for ocmrow/pcrow ids
- Determinism tests for row id + context attach

**AdminV2 runtime:** Follow [`adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md) — no partial above-fold reveal; stale-response guards on row id changes.

---

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Count shifts** | Operators see higher Tour/Waitlist numbers | Pre-flip comms; shadow counts in QA; per-lane flip |
| **Duplicate family perception** | Same household in 3 lanes feels like duplicates | Case context line + doctrine training; not a data bug |
| **Row id assumptions** | Client code assuming `id === opportunity_id` | Audit `scheduleTour`, filters, URL sync; phased ocmrow |
| **Stale layouts** | Layout blocks still read `_status_display` | `applyQueueRowContextToLayoutRecord` + presentation helpers |
| **Access redaction** | Leaking cross-site child names | Default redacted until resolver; §5 matrix QA |
| **Attention/work rollups** | Misleading NA on child row | Label as household attention until Phase 7 |
| **Performance** | N children ⇒ N rows / queries | Batch OCM fetch per opportunity set; index `outcome_status_key`, `enrollment_stage_key`; load tests on Tour lane |
| **Grouped navigator** | Prev/next skips siblings in group | Virtual navigator entries in Phase E |
| **Schema lag** | No `enrollment_stage_key` column yet | Derive from disposition metadata until Phase 3 schema |
| **Synthetic waitlist rows** | Double count during bridge | Remove in Phase F; monitor synthetic id count |

---

## 10. Open questions

| # | Question | Owner | Default if unresolved |
|---|----------|-------|------------------------|
| 1 | Merge `tours` + `tours_follow_up` queue keys into one UI section before child flip? | Product | Keep two keys, same child predicate |
| 2 | Default grouped same-stage on or off for Tour lane? | Product | **Off** (separate rows) |
| 3 | Redacted sibling: show “Waitlist — other location” vs hide entirely? | Product / compliance | **Redacted** label for admin training |
| 4 | Qualification lane flip to child-grain before or after case status migration? | Eng | **After** Phase 5 case boring status |
| 5 | `count_unit` string in API: `enrollment_track` vs `children` | Eng | Emit both: canonical `enrollment_track`, display alias `children` |
| 6 | Bump contract to `1.2-partial` on honest child subject vs keep `1.1` | Eng | Bump when Phase B ships |
| 7 | Lead lane per-child when only one OCM exists but case still `new_inquiry` | Product | Case row until all children have OCM tracks |

---

## 11. Implementation roadmap (post-design)

| Sprint | Scope |
|--------|-------|
| **Design gate (this doc)** | Merge + sign-off — **no code** |
| **Phase A implementation** | Builders + flags + unit tests — no lane flip |
| **Phase B implementation** | Honest context on existing child/candidate rows |
| **Phase C implementation** | Per-lane membership flip with QA checklist |
| **Phase D–E** | KPI + navigator + grouped presentation opt-in |
| **Phase F** | Legacy compat removal (depends Phase 5 case status) |
| **Phase 7 (parallel)** | Subject-scoped attention/work |

**Exit criteria for Phase 6 implementation (full):**

- Tour lane count = OCM tracks in tour stage, not households
- Clicking Child B tour row opens drawer with B focused and correct lifecycle visual
- Mixed Smith household shows correct per-lane rows and summaries
- Location-scoped users see correct visibility and counts
- No false empty states during `rowsLoading` / warm nav (AdminV2 doctrine)

---

## 12. Related documents (cross-links)

| Document | Link |
|----------|------|
| Grain expansion § Phase 6 | [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) §12 |
| Entity status § child-grain queues | [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) §7.6 |
| Enrollment matrix Phase 5–6 | [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) §7 |
| Developer contract | [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) |
| Queue consumption closeout | [`completed/queue_row_context_consumption_closeout.md`](./completed/queue_row_context_consumption_closeout.md) |
| Drawer closeouts | [`completed/drawer_active_subject_context_closeout.md`](./completed/drawer_active_subject_context_closeout.md), [`completed/drawer_subject_display_closeout.md`](./completed/drawer_subject_display_closeout.md) |

---

## Document maintenance

Update when:

- Phase A–F implementation ships or lane flip order changes
- `enrollment_stage_key` column lands
- Open questions in §10 are resolved
- Contract version bumps for child-grain `row_subject`

**Do not** update for queue card CSS-only polish.
