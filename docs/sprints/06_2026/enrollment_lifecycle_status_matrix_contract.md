# Enrollment Lifecycle + Status Matrix — Architecture Contract

**Path:** `docs/sprints/06_2026/enrollment_lifecycle_status_matrix_contract.md`  
**Date:** 2026-06-09  
**Status:** **Frozen — configurable enrollment vocabulary + mapping doctrine**  
**Scope:** How customers configure status labels without breaking Alloy’s fixed lifecycle layers. **Documentation + seed matrix only** — no broad status migration in this sprint.

**Doctrine (locked):**

> **Alloy owns the operating model. The customer owns the labels.**

Customers may rename, add, hide, and reorder **disposition** labels within configured **stages**. Every configurable status must map into Alloy’s **fixed layers** so queues, drawers, layout blocks, automations, BOS, readiness, attention, and work operate consistently.

**Builds on (frozen):**

- [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) — five-layer domain model, placement, display, builder integration (§7)
- [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) — lifecycle subject, queue row context, drawer focus
- [`docs/system/work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) — `QueueRowContext` runtime output
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md) — operator vs internal terminology
- [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md) — Lifecycle Builder surfaces and metadata keys
- [`enrollment_status_stage_binding_reality_check_v1.md`](./enrollment_status_stage_binding_reality_check_v1.md) — transitional `enrollment_operator_stage` on status definitions

**Authority:** Enrollment status configuration, Lifecycle Builder stage cards, seed migrations, layout field labels, and queue membership convergence align with this document unless an explicit exception is recorded in §12.

---

## No implementation in this sprint

| Do (this sprint) | Do not (this sprint) |
|------------------|----------------------|
| Freeze layer model + mapping doctrine | Migrate production `status_key` values |
| Propose default disposition matrix + seed guidance | Ship `enrollment_stage_key` column |
| Document display + builder behavior | Change queue membership SQL |
| Cross-link parent contracts | Populate `QueueRowContext.placement_context` |
| Note schema gaps and risky aliases | Implement `location_program_offerings` |

---

## Executive summary

Alloy enrollment uses **six fixed conceptual layers** plus **placement context**. Only **enrollment disposition** (layer E) is the primary home for customer-specific pipeline labels. **Enrollment lifecycle stage** (layer D) is configured in Lifecycle Builder — customers customize display labels and visibility, not the durable `stage_key` classification Alloy runtime reasons about.

| Layer | Customer labels? | Alloy classification |
|-------|------------------|----------------------|
| Person status | Yes (within identity semantics) | `person_generic` profile |
| Case / opportunity status | Yes (within container semantics) | Open / Closed / Inactive / Archived |
| Child identity status | Yes (within roster semantics) | Active / Withdrawn / Graduated — **not** Tour/Waitlist |
| Enrollment lifecycle stage | Display label + order | `lead`, `qualification`, `tour`, `waitlist`, `enrolling`, `enrolled` |
| Enrollment disposition | Yes — primary customization surface | Maps to `stage_key` + active/terminal flags |
| Placement context | Site/program/room/schedule values | OCM + candidate columns |

**Queue row** = one primary **enrollment track** (OCM focus). **Case context** = shared household. **Other children** = secondary related tracks. The same family may appear in multiple queues when different children sit in different enrollment stages.

---

## 1. Fixed layers

### A. Person status

| | |
|---|---|
| **Purpose** | Identity / account lifecycle for adults (parents, guardians, staff). |
| **Authoritative field** | `persons.status_key` with `metadata.applies_to_profiles` = `person_generic` |
| **Recommended default labels** | Active · Inactive · Archived |
| **Configurable?** | **Yes** — labels and org-specific keys, but must map to **person identity semantics**. |
| **Must not** | Encode enrollment pipeline (Lead, Tour, Waitlist, Enrolled). |

### B. Case / opportunity status

| | |
|---|---|
| **Purpose** | Household **case container** — coordination shell, not per-child enrollment truth. |
| **Authoritative field** | `opportunities.status_key` (`entity_type = opportunities`) |
| **Recommended default labels** | Open · Closed · Inactive · Archived (+ Duplicate · Lost · Converted where configured) |
| **Configurable?** | **Yes** — within **case container semantics**. |
| **Must not** | Drive enrollment lane membership; replace per-child enrollment stage/disposition. |

**Transitional:** Legacy pipeline keys on case rows (`new_inquiry`, `tour_scheduled`, `waitlisted`, `enrolled`, …) remain in some tenants until case status migration — **not** target vocabulary for new configuration.

### C. Child identity status

| | |
|---|---|
| **Purpose** | Durable **child person** roster and care operations — not enrollment process on a case. |
| **Authoritative field** | `persons.status_key` with `metadata.applies_to_profiles` = `child_lifecycle` |
| **Recommended default labels** | Active · Inactive · Withdrawn · Graduated · Archived |
| **Configurable?** | **Yes** — within **roster / care semantics**. |
| **Must not** | Include enrollment-process labels (Tour, Waitlist, Enrolling, Enrolled, Lead, Qualification). |

**UI rule:** Label **Child status** or **Roster status** — never “Touring child” as identity.

### D. Enrollment lifecycle stage

| | |
|---|---|
| **Purpose** | Operational **stage / lane** for a child’s **enrollment track** on this case (OCM). |
| **Configured in** | Lifecycle Builder (`departments.metadata.lifecycle_builder_v1`) |
| **Canonical `stage_key` values** | `lead` · `qualification` · `tour` · `waitlist` · `enrolling` · `enrolled` |
| **Operator stage labels (defaults)** | Lead · Qualification · Tour · Waitlist · Enrolling · Enrolled |
| **Configurable?** | **Display label**, sort order, lane visibility, grain, required info, actions — **not** removal of required system `stage_key` classification. |
| **Target storage on OCM** | `opportunity_customer_members.enrollment_stage_key` (column not shipped) |
| **Transitional storage** | Derived: disposition `outcome_status_key` ∈ builder stage `included_status_keys` |

**Code alias (transitional):** Internal catalog type `LifecycleOperatorStage` uses `enrollment` as the builder key for the Enrolling stage in some modules (`ENROLLMENT_STAGE_STATUS_KEYS.enrollment`). Architecture treats **`enrolling`** as the canonical stage key; converge code aliases in a later implementation phase.

### E. Enrollment disposition

| | |
|---|---|
| **Purpose** | Granular configurable labels **inside** an OCM enrollment track — where customer-specific copy belongs. |
| **Authoritative field (transitional)** | `opportunity_customer_members.outcome_status_key` |
| **Vocabulary** | `status_definitions` where `entity_type = opportunity_customer_members` |
| **Configurable?** | **Yes** — rename, add, hide, reorder within a stage; map each disposition to a `stage_key`. |
| **Must not** | Be confused with child identity status or case pipeline status. |

**Examples (illustrative, not exhaustive):** New inquiry · Needs qualification · Tour scheduled · Tour completed · Waiting for family decision · Waitlisted · Offer accepted · Registration pending · Paperwork pending · Start date scheduled · Enrolled · Not moving forward · Family withdrew · Aged out / no longer eligible.

### F. Placement context

| | |
|---|---|
| **Purpose** | Where this enrollment track belongs — site, program, room/cohort, schedule interest. |
| **Authoritative fields** | OCM: `location_id`, `desired_program_type`, `program_room_cohort_key`, `desired_schedule_type`; waitlist candidate: site/cohort ordering |
| **Configurable?** | Values come from org location inventory, program derivation, option sets — not free-text status labels. |
| **Must not** | Be bypassed for enrollment queue scoping when lane policy requires placement. |

---

## 2. Mapping model

Every **enrollment disposition** (`entity_type = opportunity_customer_members`) should carry normalized metadata so runtime can reason without parsing operator labels.

### 2.1 Required mapping fields (target metadata on `status_definitions`)

| Field | Type | Meaning |
|-------|------|---------|
| `alloy_layer` | string | **Seeded in migration** — `enrollment_disposition` (distinguishes from case/person layers). Synonym in earlier drafts: `status_layer` |
| `entity_scope` | string | `enrollment_track` (OCM row) |
| `enrollment_stage_key` | string | Builder stage: `lead` \| `qualification` \| `tour` \| `waitlist` \| `enrolling` \| `enrolled` |
| `is_active_disposition` | boolean | Track is still in active enrollment workflow |
| `is_terminal` | boolean | No further forward progression expected on this track |
| `outcome_category` | string? | `success` \| `lost` \| `withdrawn` \| `deferred` \| `duplicate` \| null |
| `automation_meaning` | string? | Optional stable token for workflows/BOS (e.g. `tour_scheduled`, `family_withdrew`) |

**Transitional metadata (shipped today):** `metadata.enrollment_operator_stage` on **opportunity** status rows binds case CRM keys to builder stages for Settings → Enrollment Process UI. OCM dispositions should use **`enrollment_stage_key`** on disposition rows as the long-term model. See [`enrollment_status_stage_binding_reality_check_v1.md`](./enrollment_status_stage_binding_reality_check_v1.md).

### 2.2 Mapping examples

**Tour scheduled**

```json
{
  "status_layer": "enrollment_disposition",
  "entity_scope": "enrollment_track",
  "enrollment_stage_key": "tour",
  "is_active_disposition": true,
  "is_terminal": false,
  "automation_meaning": "tour_scheduled"
}
```

**Family withdrew**

```json
{
  "status_layer": "enrollment_disposition",
  "entity_scope": "enrollment_track",
  "enrollment_stage_key": "tour",
  "is_active_disposition": false,
  "is_terminal": true,
  "outcome_category": "withdrawn",
  "automation_meaning": "family_withdrew"
}
```

Note: terminal dispositions may retain the **last active stage** for reporting, or use a dedicated terminal bucket per org policy — runtime uses `is_terminal` + `outcome_category`, not label text.

### 2.3 Normalized runtime read order

```
OCM row
  ├── enrollment_stage_key (target column) OR derive from disposition metadata
  ├── outcome_status_key (disposition)
  └── placement fields

status_definitions (OCM)
  └── metadata.enrollment_stage_key + terminal flags

Lifecycle Builder stage
  └── included_status_keys (transitional membership predicate)
```

**Actions/workflows** set **disposition**; stage updates via mapped metadata sync or explicit stage column when shipped.

---

## 3. Customer configurability

### Customers may

- Rename status **labels** at any layer (within semantic guardrails).
- Add **enrollment dispositions** under a stage.
- Hide inactive dispositions from pickers (`is_active = false`).
- Reorder dispositions within a stage (`sort_order`).
- Configure which dispositions map to which **`enrollment_stage_key`**.
- Customize Lifecycle Builder **stage display labels** and lane visibility.

### Customers may not

- Make **person status** drive enrollment queue membership.
- Put Tour / Waitlist / Enrolling / Enrolled on **child identity** status.
- Remove required **system classifications** (`stage_key`, terminal flags) without breaking runtime guards.
- Use **opportunity status** as authoritative per-child enrollment truth.
- Bypass **placement context** when work-unit lane policy requires site/program scope.
- Replace Lifecycle Builder stages with a flat unmapped status list.

---

## 4. Display behavior

### 4.1 Queue row

| Element | Source | Notes |
|---------|--------|-------|
| **Primary label** | Enrollment **stage** or **disposition** for focused OCM track | From `QueueRowContext.row_stage` / disposition label |
| **Case status** | Secondary | Open / Closed — boring container |
| **Child identity status** | Hidden by default | Show when inactive / withdrawn / graduated |
| **Related children** | Each sibling’s enrollment stage/disposition | Not identity “Touring” |
| **Placement** | Optional summary line | Site/program when in scope |

**Membership reason** = enrollment stage/disposition on OCM track, not case `status_key`.

#### Same case + same enrollment stage (grouped presentation)

When **multiple children** on one opportunity share the **same enrollment stage** (e.g. Child A and Child B both **Tour**), data truth and UX presentation diverge by design:

| Layer | Rule |
|-------|------|
| **Data truth** | Each OCM enrollment track remains its own lifecycle subject. Two Tour children = **two Tour-subjects**. Lane **counts** = **2** enrollment tracks (when `count_unit` = children / enrollment_track), **not** 1 household. |
| **UX grouping** | Queue renderer **may** visually group same-case + same-stage tracks into one **household card** for usability. Grouping is **presentation-only** — it does not merge authoritative rows. |
| **Un-grouped fallback** | Renderer that does not support grouping renders **two separate rows**, each with one primary child. |

**Example grouped Tour card (Smith Household — A and B both Tour, C Enrolled):**

```
Smith Household
Primary: 2 children — Tour

Children in this stage:
  Child A
  Child B

Other children:
  Child C — Enrolled
```

**Primary subject rule:** A grouped row must **not** pretend there is only one primary child. Use `row_subjects[]` / `active_subject_group` — not a single `row_subject` alone. See [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) § grouped rows.

**Click behavior:**

| Action | Drawer behavior |
|--------|-----------------|
| Click grouped row | Case drawer; `stage_focus` = Tour; **Child A and Child B highlighted** (`active_subject_group`) |
| Click Child A inside card | Same case drawer; **Child A** = `active_subject` |
| Click Child B inside card | Same case drawer; **Child B** = `active_subject` |

**Reporting:** Grouped display does **not** change count truth — Tour count = **2**; household count = **1** only when reporting dimension is case/family.

### 4.2 Drawer

| Surface | Primary | Secondary |
|---------|---------|-----------|
| Header / lifecycle visual | Active subject **enrollment stage** (shared when group focus) | Case Open/Closed |
| Children block | Per child: **enrollment stage/disposition** + placement | Child identity when relevant |
| Person fields | Adult person status | — |
| Child person card | Roster status when operationally relevant | Not enrollment disposition |

Opening a child-grain queue row opens the **case drawer** with **active_subject** = that OCM track.

**Group focus (same stage):** When queue row carries `active_subject_group` (or drawer opened from grouped card), drawer supports:

- `active_subject` — one focused child (single-child click or default within group)
- `active_subject_group` — multiple focused children in the **same enrollment stage**
- Lifecycle visual shows the **shared stage** (Tour)
- Children block **highlights all** focused subjects; siblings outside the group remain in `related_subjects_summary`

---

## 5. Lifecycle Builder behavior

Lifecycle Builder **stages** are containers. **Enrollment dispositions** map into stages via metadata (and transitional `included_status_keys`).

| Builder artifact | Role |
|------------------|------|
| Stage (`stage_key`) | Lane mental model, queue view publication, grain |
| Stage status set | Transitional membership: disposition keys included in stage |
| Required information | Stage-scoped field rules |
| Actions matrix | Stage-scoped action visibility |
| Attention profiles | Stage or disposition triggers (V2) |
| Work requirements | Attach to **stage** — not disposition labels |

**Automations / BOS** react to **normalized transitions** (`automation_meaning`, `outcome_category`, stage change events) — not raw label strings.

**BOS reads** the mapping layer — not org-wide unclassified status lists.

---

## 6. Default enrollment disposition matrix (recommended seed)

Practical starter set for childcare enrollment orgs. Keys are **stable**; labels are **customer-editable**. Aligns with existing seeds where possible; improves ambiguous keys.

### 6.1 Active dispositions by stage

| Stage (`enrollment_stage_key`) | `status_key` (stable) | Default label | Notes |
|-------------------------------|----------------------|---------------|-------|
| **lead** | `new_inquiry` | New inquiry | Existing seed |
| **qualification** | `needs_qualification` | Needs qualification | New key — prefer over case-grain `contact_attempted` on OCM |
| **qualification** | `qualified` | Qualified | Ready for tour / next step |
| **tour** | `tour_requested` | Tour requested | Existing seed |
| **tour** | `tour_scheduled` | Tour scheduled | Existing seed |
| **tour** | `tour_completed` | Tour completed | Existing seed |
| **tour** | `decision_pending` | Waiting for family decision | Replaces vague “follow up” copy on OCM |
| **waitlist** | `waitlisted` | Waitlisted | Existing seed |
| **waitlist** | `waitlist_paused` | Waitlist paused | Pairs with `placement_candidates.status = paused` |
| **enrolling** | `offer_pending` | Offer pending | Existing seed |
| **enrolling** | `registration_pending` | Registration pending | Forms / intake gate |
| **enrolling** | `paperwork_pending` | Paperwork pending | Packet / compliance gate |
| **enrolling** | `start_date_scheduled` | Start date scheduled | Pre-start roster handoff |
| **enrolled** | `enrolled` | Enrolled | Existing seed — success disposition |

### 6.2 Terminal / non-active dispositions

| `status_key` | Default label | `enrollment_stage_key` (reporting) | `outcome_category` | Notes |
|--------------|---------------|-------------------------------------|--------------------|-------|
| `not_a_fit` | Not a fit | `qualification` | `lost` | Disposition — not child identity |
| `not_moving_forward` | Not moving forward | prior stage or `lead` | `lost` | Neutral decline |
| `family_withdrew` | Family withdrew | prior stage | `withdrawn` | Prefer over OCM key `withdrawn` (roster collision) |
| `deferred` | Deferred | `lead` | `deferred` | Existing seed |
| `not_enrolling` | Not enrolling | `lead` | `lost` | Existing seed — case-level decline mirrored on track |
| `aged_out` | No longer eligible | `qualification` | `lost` | Age/policy terminal |

**Deprecated / alias (do not use for new config):**

| Key | Action |
|-----|--------|
| `interested` | Alias → `new_inquiry` (migration `20260601100000`) |
| `enrolling` | Legacy disposition key — stage label conflict; use `registration_pending` / `paperwork_pending` under **enrolling** stage |
| `withdrawn` (OCM) | Ambiguous with child roster — migrate label to `family_withdrew` |

### 6.3 Case status seeds (separate layer — not disposition)

Default case keys remain **Open / Closed / Inactive / Archived** — not pipeline stages. Do not seed `tour_scheduled` on `opportunities` for new greenfield orgs.

### 6.4 Child identity seeds (separate layer)

`active`, `inactive`, `withdrawn`, `graduated`, `archived` on `persons` (`child_lifecycle` profile) — never Tour/Waitlist/Enrolled.

---

## 7. Implementation roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **1** | This document + default matrix | **This sprint** |
| **2** | `status_definitions.metadata` supports `status_layer`, `enrollment_stage_key`, terminal flags; Settings UI exposes mapping | Planned |
| **3** | `opportunity_customer_members.enrollment_stage_key` column + backfill from disposition metadata | Planned |
| **4** | Layout blocks consume normalized stage + disposition labels (`inquiry_child.enrollment_stage_key` field ref) | Planned |
| **5** | Queue membership shifts from opportunity `status_key` / transitional sets to OCM enrollment track | Planned |
| **6** | Automations / BOS use normalized transition model (`automation_meaning`, stage change events) | Planned |

**Phase 5–6 queue membership design (frozen before implementation):** [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md) — per-stage predicates, row IDs, grouping, migration phases A–F.

**Parallel (not blocked):** Placement cascade UI, layout runtime cutover, case status migration, child-grain `QueueRowContext`, access redaction.

---

## 8. Schema gaps

| Gap | Impact | Phase |
|-----|--------|-------|
| No `opportunity_customer_members.enrollment_stage_key` | Stage derived indirectly from disposition | 3 |
| `outcome_status_key` name implies generic “outcome” | Conflates disposition with stage in UI | 2–4 (label + optional rename to `enrollment_disposition_key`) |
| OCM disposition metadata not enforced | Orgs can map dispositions without `enrollment_stage_key` | 2 |
| `metadata.enrollment_operator_stage` on **opportunity** rows | Case-grain binding separate from OCM disposition mapping | 2 (unify doctrine) |
| `metadata.lifecycle_stage` (intake/qualification/execution) | Universal CRM enum — **not** enrollment operator stage | Document only |
| Event `child_lifecycle_status_changed` | Name suggests child person lifecycle | 6 — evolve payload: stage + disposition + layer |
| `QueueRowContext` lacks `row_disposition_*` fields | Disposition label may overload `row_status_label` | 4–5 |
| `placement_context` on queue rows | Typed but not populated | Separate sprint |

**Existing columns (no change this sprint):** `status_definitions` (`status_key`, `status_label`, `metadata`, `entity_type`, `org_id`); OCM placement columns; `placement_candidates.status`.

---

## 9. Risky aliases and naming debt

| Alias / surface | Risk | Recommendation |
|-----------------|------|----------------|
| `child.status` (layout refKey) | Reads as child identity; maps to `inquiry_child.outcome_status_key` | Bind enrollment **stage** to `inquiry_child.enrollment_stage_key`; identity to person child status field |
| `inquiry_child.outcome_status_key` label “Enrollment status” | Collapses stage + disposition | **Enrollment disposition** (picker); separate **Enrollment stage** display |
| `outcome_status_key` column | “Outcome” sounds terminal | Target rename: `enrollment_disposition_key` (column rename optional) |
| OCM `withdrawn` | Collides with child roster **Withdrawn** | Seed `family_withdrew` for enrollment track |
| `enrolling` as disposition key vs `enrolling` stage | Operator confusion | Disposition keys: `registration_pending`, `paperwork_pending`; stage key: `enrolling` |
| `ENROLLMENT_STAGE_STATUS_KEYS.enrollment` | Code key ≠ architecture `enrolling` | Converge in phase 2–3 |
| Case keys in `ENROLLMENT_STAGE_STATUS_KEYS.lead` (`open`, `new`) | Case grain mixed into stage catalog | OCM dispositions only for child-grain lanes |
| `child_lifecycle_status_changed` event | Misleading name | `enrollment_track_disposition_changed` (future) |
| `RelatedSubjectSummary.status_label` | Generic | `enrollment_stage_label` + optional `disposition_label` + `child_identity_status_label` |

### 9.1 Recommended operator-facing names

| Internal / storage | Operator label |
|--------------------|----------------|
| `persons.status_key` (generic) | Person status |
| `persons.status_key` (child_lifecycle) | Child status / Roster status |
| `opportunities.status_key` | Case status |
| `enrollment_stage_key` | Enrollment stage |
| `outcome_status_key` / `enrollment_disposition_key` | Enrollment disposition |
| `location_id` + program + room | Placement |

### 9.2 Recommended field keys (layout / field catalog)

| Target field key | Layer |
|------------------|-------|
| `inquiry_child.enrollment_stage_key` | Enrollment stage (new field ref — phase 4) |
| `inquiry_child.enrollment_disposition_key` or keep `outcome_status_key` | Enrollment disposition |
| `child.identity_status` or person-scoped child status | Child identity |
| `opportunity.status_key` | Case status |

---

## 10. Relationship to queue and work-unit contracts

- **Queue membership (target):** OCM enrollment track matches builder stage via `enrollment_stage_key` + disposition terminal flags — not `opportunities.status_key`.
- **Queue row context:** Primary enrollment labels on `row_subject` (single) or `row_subjects` (grouped); case context secondary — see [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) §4–§5.
- **Same-stage siblings:** Two Tour OCM tracks on one case → count **2**, optional **one grouped card** — see §4.1 and entity status contract §3.4.
- **Work unit surface:** Layout blocks consume normalized context — see [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md).
- **Placement:** Enrollment lanes may filter by placement scope — see entity status contract §4.6–§6.

---

## 11. Success criteria

| Criterion | Status |
|-----------|--------|
| Fixed layers A–F documented | **Yes** — §1 |
| Mapping model with metadata fields | **Yes** — §2 |
| Customer may / may not rules | **Yes** — §3 |
| Queue + drawer display contract | **Yes** — §4 |
| Lifecycle Builder role | **Yes** — §5 |
| Default disposition matrix | **Yes** — §6 |
| Phased roadmap | **Yes** — §7 |
| Schema gaps + aliases | **Yes** — §8–§9 |
| No broad migration in this sprint | **Yes** |

---

## 12. Document maintenance

Update when:

- `enrollment_stage_key` ships on OCM
- `status_definitions` mapping metadata ships in Settings
- Default seed migrations change
- Queue membership phase 5 completes
- Lifecycle Builder canonical stage keys change

---

## Related documents

| Doc | Role |
|-----|------|
| [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) | Parent five-layer model + placement |
| [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) | Lifecycle subject + queue/drawer contracts |
| [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) | Runtime `QueueRowContext` |
| [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md) | Builder metadata keys |
| [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md) | Operator vocabulary |
| [`enrollment_status_stage_binding_reality_check_v1.md`](./enrollment_status_stage_binding_reality_check_v1.md) | Transitional case status ↔ stage binding |
