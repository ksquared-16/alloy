# Canonical Action Catalog v1

**Path:** `docs/sprints/05_2026/canonical_action_catalog_v1.md`  
**Status:** Phase 0A stubs seeded (`20260602160000_canonical_action_catalog_v1_stubs.sql`) — inactive global definitions only  
**Version:** `canonical_action_catalog_v1`  
**Scope:** Childcare enrollment pipeline — canonical business capabilities (not UI placements).

**Related:**

- [`alloy_operational_doctrine_v1.md`](./alloy_operational_doctrine_v1.md)
- [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md)
- [`action_button_lifecycle_alignment_audit.md`](./action_button_lifecycle_alignment_audit.md)
- [`action_definition_legacy_mapping_v1.md`](./action_definition_legacy_mapping_v1.md)

---

## Purpose

This catalog is the **single vocabulary** for business operations in the childcare lead-to-enrollment lifecycle. Future surfaces must reference these keys:

| Surface | References |
|---------|------------|
| Action button | `action_placements` → `action_definitions.key` |
| BOS recommendation | `recommended_action.key` → catalog key (or alias map until migrated) |
| Task completion | Task template `completion_action_key` |
| Workflow step | `workflow_actions.payload.action_key` |
| Admin / public API | `POST /api/admin/actions/execute` `{ action_key }` |

**Doctrine:** Action definition = canonical capability. Action button = placement. Do not encode business logic only in UI components.

---

## Catalog conventions

### Fields (per action)

| Field | Meaning |
|-------|---------|
| **action_key** | Stable snake_case identifier — never renamed once seeded |
| **label** | Default operator-facing label (tenant `entity_labels` may override copy) |
| **category** | `communication` · `record` · `lifecycle` · `workflow` · `financial` · `placement` · `entry` · `exit` |
| **lifecycle_stage** | Matrix stage, or `universal` · `multi` · `platform` |
| **entity_type** | Primary entity: `opportunity` · `opportunity_customer_member` · `person` · `customer` |
| **universal** | `true` = available across active pipeline stages unless hidden by policy |
| **trigger_types** | Intended invokers: `button` · `bos` · `task` · `workflow` · `api` |
| **requirement_gates** | Preconditions before execute (fields, status, policy) |
| **side_effects** | Status, activity, workflow events, financial, placement |
| **default_placements** | Suggested `action_placements` surfaces/slots (not mandatory) |
| **implementation_status** | `existing` · `partial` · `missing` · `legacy_replacement` |
| **notes** | Migration / design notes |

### Lifecycle stages (matrix)

`new_lead` · `qualification` · `tour` · `waitlist` · `enrollment` · `active` · `lost` · `withdrawn`

**Multi-stage:** action allowed in several stages (e.g. `mark_lost`).

### Implementation status legend

| Status | Meaning |
|--------|---------|
| **existing** | `action_definitions` row + executable handler path |
| **partial** | Row and/or UI/API exists but not catalog-complete (ui_intent, hardcoded parallel path, missing gates) |
| **missing** | No `action_definitions` row; no unified execute path |
| **legacy_replacement** | New key supersedes deprecated definition(s) |

### Suggested default placements

| Surface | Use |
|---------|-----|
| `record_header` / `primary` \| `secondary` \| `overflow` | Drawer header actions |
| `record_section` / `{section_key}` | Section-scoped (e.g. tour block) |
| `queue_row` / `row_inline` | Pipeline queue chips |
| `right_rail` | Workspace department / work-unit rail |
| *(none)* | API / workflow / BOS only |

---

## Summary counts

| Status | Count |
|--------|------:|
| **existing** | 0 |
| **partial** | 8 |
| **missing** | 26 |
| **Total catalog actions** | 34 |

Partial keys today: `send_form`, `schedule_tour`, `reschedule_tour`, `confirm_tour`, `record_tour_outcome`, `send_enrollment_packet`, `mark_lost`, `review_enrollment_packet`, `request_missing_information`, `assign_classroom`, `assign_schedule`, `set_start_date`, `reserve_spot`.

*(Platform adjunct actions in [Appendix A](#appendix-a--platform-adjunct-actions-not-in-matrix) are excluded from this count.)*

---

## Universal actions

Available across active pipeline stages unless customer policy or stage overlay hides them. Enrollment+ adds **Upload document**.

### `call_parent`

| Field | Value |
|-------|-------|
| **label** | Call parent |
| **category** | communication |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, bos, task, api |
| **requirement_gates** | Parent/guardian phone on record or selected contact |
| **side_effects** | Log contact activity; optional task auto-complete |
| **default_placements** | `record_header` secondary; `queue_row` row_inline |
| **implementation_status** | **existing** (Phase 1B — tel: intent; no autonomous dial) |
| **notes** | Routes to `tel:` when phone on file. Legacy `quick_message` retained. BOS phone intents should map here. |

### `send_email`

| Field | Value |
|-------|-------|
| **label** | Send email |
| **category** | communication |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, bos, task, workflow, api |
| **requirement_gates** | Parent email or deliverable contact |
| **side_effects** | Open composer → operator sends → thread + activity |
| **default_placements** | `record_header` secondary; `queue_row` row_inline |
| **implementation_status** | **existing** (Phase 1B — Quick Message composer, email channel) |
| **notes** | Reuses Quick Message modal. Legacy `quick_message` retained without default placements. |

### `send_sms`

| Field | Value |
|-------|-------|
| **label** | Send SMS |
| **category** | communication |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, bos, task, workflow, api |
| **requirement_gates** | Parent mobile or SMS-capable contact |
| **side_effects** | Open composer → operator sends → thread + activity |
| **default_placements** | `record_header` secondary; `queue_row` row_inline |
| **implementation_status** | **existing** (Phase 1B — Quick Message composer, SMS channel) |
| **notes** | Reuses Quick Message modal. BOS draft SMS intents should map here. |

### `add_note`

| Field | Value |
|-------|-------|
| **label** | Add note |
| **category** | record |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, task, api |
| **requirement_gates** | Note body required |
| **side_effects** | Activity timeline entry; no status change |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **existing** (Phase 1B — `append_note` execute path) |
| **notes** | Distinct from `update_status_add_note`. Note body required via structured error. |

### `create_task`

| Field | Value |
|-------|-------|
| **label** | Create task |
| **category** | record |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, bos, workflow, api |
| **requirement_gates** | Task title; optional assignee, due date |
| **side_effects** | Create work item linked to opportunity / person |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **existing** (Phase 1B — opens tasks panel / drawer task focus) |
| **notes** | Opens My Tasks panel; drawer operational-tasks focus when record open. Full BOS task recommendations deferred. |

### `upload_document`

| Field | Value |
|-------|-------|
| **label** | Upload document |
| **category** | record |
| **lifecycle_stage** | universal (required Enrollment+) |
| **entity_type** | opportunity |
| **universal** | true (policy may restrict to enrollment / active) |
| **trigger_types** | button, api |
| **requirement_gates** | File + document type |
| **side_effects** | `documents` row linked to opportunity / customer |
| **default_placements** | `record_header` secondary (enrollment+ condition) |
| **implementation_status** | **existing** (Phase 1B — drawer documents tab intent; enrollment+ placement) |
| **notes** | Opens opportunity drawer documents tab; upload UI unchanged. |

### `send_form`

| Field | Value |
|-------|-------|
| **label** | Send form |
| **category** | workflow |
| **lifecycle_stage** | universal |
| **entity_type** | opportunity |
| **universal** | true |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Form definition selected; parent contact method for delivery |
| **side_effects** | Mint/send form link; activity + optional workflow |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **existing** (Phase 1B — default placement added; composer unchanged) |
| **notes** | Global `send_form` ui_intent (`20260529200000`). Composer via drawer + `adminv2:open-send-form`. |

---

## Entry

### `create_lead`

| Field | Value |
|-------|-------|
| **label** | Create lead |
| **category** | entry |
| **lifecycle_stage** | *(none — creates new_lead)* |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Parent first + last name; phone or email |
| **side_effects** | Create opportunity + person/customer links; `status_key = new_inquiry`; activity |
| **default_placements** | `right_rail` primary (enrollment dept) |
| **implementation_status** | **existing** (Phase 1A — `20260602170000`) |
| **notes** | Replaces `create_inquiry` ui_intent stub over time. Intake auto-op creates leads without this action — manual/API parity via execute API. |

---

## Qualification & early pipeline

Matrix lifecycle actions for **New Lead** and **Qualification**. `schedule_tour` and `mark_lost` also apply in later stages (see multi-stage notes).

### `move_to_qualification`

| Field | Value |
|-------|-------|
| **label** | Move to qualification |
| **category** | lifecycle |
| **lifecycle_stage** | new_lead |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Parent phone or email; parent identity fields |
| **side_effects** | Status → `qualification`; activity |
| **default_placements** | `record_header` primary (new_lead); `queue_row` row_inline |
| **implementation_status** | **existing** (Phase 1B — `20260602180000`) |
| **notes** | Replaces `qualify_opportunity` and status side effect of `contact_attempted` over time. Does not imply contact occurred — use universal comms separately. Legacy `contact_attempted` records remain valid. |

### `schedule_tour`

| Field | Value |
|-------|-------|
| **label** | Schedule tour |
| **category** | workflow |
| **lifecycle_stage** | qualification (also waitlist) |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, bos, workflow, api |
| **requirement_gates** | Tour date + time; location; parent contact for reminders |
| **side_effects** | Create/update `tour_bookings`; status → `tour_scheduled`; workflow + activity |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **existing** (Phase 2 alignment — `20260602190000`) |
| **notes** | `open_form` → `OpportunityTourScheduleActionModal` (slot booking when site set). Legacy metadata execute path retained for no-site fallback. Org overrides preserved. |

### `move_to_waitlist`

| Field | Value |
|-------|-------|
| **label** | Move to waitlist |
| **category** | lifecycle |
| **lifecycle_stage** | multi — qualification, tour, enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Child age/program; desired start; schedule; location/program interest; optional waitlist fee policy |
| **side_effects** | Status → `waitlisted`; placement candidate creation; activity; optional fee invoice |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **missing** |
| **notes** | Replaces `add_to_waitlist_placeholder`. Waitlist orchestration module exists — wire execute path. |

### `mark_lost`

| Field | Value |
|-------|-------|
| **label** | Mark lost |
| **category** | exit |
| **lifecycle_stage** | multi — new_lead, qualification, tour, waitlist, enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | **Lost reason required** (transition rules) |
| **side_effects** | Status → `lost`; activity with reason |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **existing** (Phase 1A — `20260602170000`) |
| **notes** | `open_form` → `update_status` to `lost` with `lost_reason` required via transition rules + payload validation. Visible on pipeline stages via `status_key_in` placement conditions. |

---

## Tour

### `confirm_tour`

| Field | Value |
|-------|-------|
| **label** | Confirm tour |
| **category** | workflow |
| **lifecycle_stage** | tour |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Active tour booking in confirmable state |
| **side_effects** | Booking status → confirmed; activity; optional reminder workflow |
| **default_placements** | `record_section` / tour block (or header when booking active) |
| **implementation_status** | **existing** (Phase 2 alignment — `20260602190000`) |
| **notes** | `ui_intent` / execute → `confirmTourBooking`. Tour bar and registry share booking API. |

### `reschedule_tour`

| Field | Value |
|-------|-------|
| **label** | Reschedule tour |
| **category** | workflow |
| **lifecycle_stage** | tour |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Existing tour booking; new slot |
| **side_effects** | Booking reschedule; metadata/tour_date update; activity |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **existing** (Phase 2 alignment — `20260602190000`) |
| **notes** | Same modal as schedule; placement when `metadata.tour_date` exists. Tour bar reschedule uses slot panel directly. |

### `record_tour_outcome`

| Field | Value |
|-------|-------|
| **label** | Record tour outcome |
| **category** | lifecycle |
| **lifecycle_stage** | tour |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Tour booking completed or no-show; outcome enum required |
| **side_effects** | Booking terminal state; opportunity status per outcome (enroll path, waitlist, lost, follow-up task); activity |
| **implementation_status** | **existing** (Phase 2 alignment — `20260602190000`) |
| **notes** | `open_form` → outcome modal → execute → `/complete` or `/no-show` service paths. Tour bar buttons emit same canonical key. |

### `send_enrollment_packet`

| Field | Value |
|-------|-------|
| **label** | Send enrollment packet |
| **category** | workflow |
| **lifecycle_stage** | multi — tour, waitlist, enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Packet definition configured; recipient contact |
| **side_effects** | Create `form_packet_sessions`; send comms; activity events |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **partial** |
| **notes** | Global `ui_intent`; `OpportunityEnrollmentPacketModal` in drawer. Upgrade to executable workflow action. |

---

## Waitlist

### `contact_family`

| Field | Value |
|-------|-------|
| **label** | Contact family |
| **category** | communication |
| **lifecycle_stage** | waitlist |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, bos, task, workflow |
| **requirement_gates** | Contact method; optional “opening available” BOS signal |
| **side_effects** | Comms + activity; may complete waitlist follow-up task |
| **default_placements** | `record_header` primary (waitlist); `queue_row` |
| **implementation_status** | **missing** |
| **notes** | Operator pattern today: generic Message. Catalog key wraps channel choice or opens comms hub with waitlist context. |

### `remove_from_waitlist`

| Field | Value |
|-------|-------|
| **label** | Remove from waitlist |
| **category** | lifecycle |
| **lifecycle_stage** | waitlist |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Currently waitlisted; optional reason |
| **side_effects** | Status transition out of waitlist; deactivate/adjust placement candidates; activity |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **missing** |
| **notes** | Distinct from Mark Lost. Target status depends on prior stage or operator choice (qualification / lost). |

### `collect_waitlist_fee`

| Field | Value |
|-------|-------|
| **label** | Collect waitlist fee |
| **category** | financial |
| **lifecycle_stage** | waitlist |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Customer waitlist fee policy enabled |
| **side_effects** | Invoice / payment intent; activity |
| **default_placements** | `record_header` secondary (policy-gated) |
| **implementation_status** | **missing** |
| **notes** | Billing module integration deferred. |

### `waive_waitlist_fee`

| Field | Value |
|-------|-------|
| **label** | Waive waitlist fee |
| **category** | financial |
| **lifecycle_stage** | waitlist |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Permission to waive; optional reason |
| **side_effects** | Policy waiver record; activity |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **missing** |
| **notes** | Pairs with `collect_waitlist_fee`. |

---

## Enrollment

### `review_enrollment_packet`

| Field | Value |
|-------|-------|
| **label** | Review enrollment packet |
| **category** | workflow |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, task, api |
| **requirement_gates** | Pending packet session exists |
| **side_effects** | Opens review modal / console; PATCH review decision; workflow event |
| **default_placements** | `record_header` primary when pending review |
| **implementation_status** | **existing** (Phase 3) |
| **notes** | `OpportunityPacketReviewOverview` + API; registry `ui_intent` routes to existing modal. Activity key: `review_enrollment_packet`. |

### `request_missing_information`

| Field | Value |
|-------|-------|
| **label** | Request missing information |
| **category** | workflow |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, bos, task, workflow |
| **requirement_gates** | Identified missing fields or packet needs_correction |
| **side_effects** | Send form/packet section / comms; create follow-up task |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **existing** (Phase 3) |
| **notes** | Routes to send-form composer (`request_missing_information` ui_intent). BOS `missing_information` objective parallel. |

### `approve_enrollment`

| Field | Value |
|-------|-------|
| **label** | Approve enrollment |
| **category** | lifecycle |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Paperwork approved; classroom; schedule; start date; child identity; parent contact; deposit/registration per policy |
| **side_effects** | Status → `enrolled` (or ready-to-activate); enrollment date automation; activity; welcome comms workflow |
| **default_placements** | `record_header` primary (enrollment) |
| **implementation_status** | **stub** (Phase 3b) |
| **notes** | **legacy_replacement** for `mark_won`, `convert_to_enrolled_placeholder`. Requirement engine attachment critical. Not activated until gates exist. |

### `reserve_spot`

| Field | Value |
|-------|-------|
| **label** | Reserve spot |
| **category** | placement |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Program/location capacity policy; child member on opportunity |
| **side_effects** | Placement hold / candidate state; activity |
| **default_placements** | `record_section` / placement or queue row (waitlist/enrollment) |
| **implementation_status** | **stub** (Phase 3b) |
| **notes** | Waitlist orchestration + placement candidates exist; no unified action def yet. |

### `assign_classroom`

| Field | Value |
|-------|-------|
| **label** | Assign classroom |
| **category** | placement |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Room/cohort available for program |
| **side_effects** | Update member placement fields; activity |
| **default_placements** | `record_section` / inquiry_children or placement panel |
| **implementation_status** | **existing** (Phase 3) |
| **notes** | Registry ui_intent focuses inquiry children `program_room_cohort_key`; OCM PATCH unchanged. |

### `assign_schedule`

| Field | Value |
|-------|-------|
| **label** | Assign schedule |
| **category** | placement |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Schedule template selected |
| **side_effects** | Schedule assignment record; activity |
| **default_placements** | `record_section` / participation |
| **implementation_status** | **existing** (Phase 3) |
| **notes** | Registry ui_intent focuses inquiry children `desired_schedule_type`. |

### `set_start_date`

| Field | Value |
|-------|-------|
| **label** | Set start date |
| **category** | placement |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Valid start date vs program rules |
| **side_effects** | Member start date; may trigger activation automation |
| **default_placements** | `record_section` / participation |
| **implementation_status** | **existing** (Phase 3) |
| **notes** | Registry ui_intent focuses inquiry children `desired_start_date`. Required before `approve_enrollment`. |

### `collect_registration_fee`

| Field | Value |
|-------|-------|
| **label** | Collect registration fee |
| **category** | financial |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Registration fee policy enabled |
| **side_effects** | Invoice / payment; activity |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **missing** |

### `waive_registration_fee`

| Field | Value |
|-------|-------|
| **label** | Waive registration fee |
| **category** | financial |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Waive permission; reason |
| **side_effects** | Waiver record; activity |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **missing** |

### `collect_deposit`

| Field | Value |
|-------|-------|
| **label** | Collect deposit |
| **category** | financial |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, workflow, api |
| **requirement_gates** | Deposit policy enabled |
| **side_effects** | Payment intent / recorded payment; activity |
| **default_placements** | `record_header` secondary |
| **implementation_status** | **missing** |

### `record_deposit`

| Field | Value |
|-------|-------|
| **label** | Record deposit |
| **category** | financial |
| **lifecycle_stage** | enrollment |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Amount, method, date |
| **side_effects** | Manual payment record; activity |
| **default_placements** | `record_header` overflow |
| **implementation_status** | **missing** |
| **notes** | For offline/check deposits; distinct from `collect_deposit` (provider checkout). |

---

## Active

### `withdraw_child`

| Field | Value |
|-------|-------|
| **label** | Withdraw child |
| **category** | lifecycle |
| **lifecycle_stage** | active |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Withdrawal date; withdrawal reason |
| **side_effects** | Member status → withdrawn; opportunity outcome update; activity |
| **default_placements** | `record_header` secondary (active/enrolled) |
| **implementation_status** | **missing** |
| **notes** | Person drawer may have field-level lifecycle; not canonical opportunity action. |

---

## Exit / re-entry

### `reopen_lead`

| Field | Value |
|-------|-------|
| **label** | Reopen lead |
| **category** | exit |
| **lifecycle_stage** | lost |
| **entity_type** | opportunity |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Currently lost; optional reason |
| **side_effects** | Status → new_lead or qualification; activity |
| **default_placements** | `record_header` primary (lost) |
| **implementation_status** | **missing** |

### `reenroll_child`

| Field | Value |
|-------|-------|
| **label** | Re-enroll child |
| **category** | exit |
| **lifecycle_stage** | withdrawn |
| **entity_type** | opportunity_customer_member |
| **universal** | false |
| **trigger_types** | button, api |
| **requirement_gates** | Policy allows re-enrollment; child identity |
| **side_effects** | New or reopened opportunity path; activity |
| **default_placements** | `record_header` primary (withdrawn member context) |
| **implementation_status** | **missing** |
| **notes** | May create new opportunity or reopen existing — customer policy. |

---

## Appendix A — Platform adjunct actions (not in matrix)

Retained for navigation and AI assist; **not** childcare lifecycle canonical actions. Do not delete without replacement placements.

| action_key | label | category | implementation_status | notes |
|------------|-------|----------|----------------------|-------|
| `open_record` | Open | record | existing | `open_drawer`; queue navigation |
| `ask_bos` | Ask BOS | platform | partial | `ui_intent`; BOS handoff |
| `quick_message` | Message | communication | partial | **Deprecated** → split to `send_email` / `send_sms` / `call_parent` or channel-param message |
| `update_status_add_note` | Update status | lifecycle | partial | **Deprecated** admin escape → lifecycle actions + `add_note` |
| `view_needs_attention` | View needs attention | platform | partial | Navigation ui_intent |
| `review_automations` | Review automations | platform | partial | Admin navigation |

---

## Appendix B — Data capture helpers (not lifecycle actions)

These mutate household composition but are **not** matrix lifecycle actions. Keep as forms; do not present as pipeline stage transitions.

| Legacy key | Recommended treatment |
|------------|------------------------|
| `add_child` | Inline section / `open_form` helper; optional rename `add_inquiry_child` |
| `add_sibling` | Same |
| `add_family_member` | Section-level contact capture |
| `add_related_person` | Section-level parent/contact |

---

## Appendix C — BOS recommendation key aliases (Phase 5 target)

Until BOS catalog migrates, map prose keys → canonical:

| BOS catalog key | Target canonical |
|-----------------|------------------|
| `send_first_response` | `send_email` or `send_sms` (context channel) |
| `complete_follow_up` | `create_task` or universal comms |
| `complete_scheduled_event_follow_up` | `record_tour_outcome` or `send_email` |
| `request_external_response` | `send_sms` / `send_email` |
| `complete_internal_action` | `open_record` + task |
| `reengage_priority_record` | universal comms |
| `reply_to_inbound` | `send_email` / `send_sms` |
| `escalate_operational_review` | `create_task` |

---

## Phase 0A — Inactive catalog stubs (shipped)

**Migration:** `supabase/migrations/20260602160000_canonical_action_catalog_v1_stubs.sql`

| Operation | Count | Notes |
|-----------|------:|-------|
| **INSERT** | 30 | Global `org_id` NULL, `is_active = false`, `action_type = ui_intent`, `payload_schema.catalog_status = stub` |
| **UPDATE** | 4 | Merge `payload_schema.catalog` only — preserve `is_active` and execution payload |
| **Total catalog keys** | 34 | All childcare v1 catalog actions |

**Updated globals (metadata only, still active):** `send_form`, `schedule_tour`, `mark_lost`, `send_enrollment_packet`.

**Catalog metadata location:** `action_definitions.payload_schema.catalog` (table has no `config_json`). Fields: `catalog_version`, `doctrine_source`, `implementation_status`, `lifecycle_stage`, `lifecycle_stages`, `action_category`, `scope`, `universal`, `expected_triggers`.

**Runtime:** Stubs do not resolve in UI (`is_active = false`). No `action_placements` added. Legacy keys unchanged.

---

## Proposed Supabase migration plan (remaining)

### Migration A — `canonical_action_catalog_v1_seed` (definitions only) — **DONE as 0A**

1. Insert **global** (`org_id` NULL) rows for all **missing** catalog keys with:
   - `is_active = false` (or `true` with `ui_intent` + `"catalog_status":"stub"`) until handlers ship
   - `payload_schema.catalog_version = "v1"`
   - `payload_schema.lifecycle_stage`
   - `payload_schema.universal = true|false`
2. **Do not** add placements in this migration.
3. Add partial index or check constraint documentation for catalog keys (optional metadata GIN).

### Migration B — `legacy_action_deprecation_v1`

1. Set `is_active = false` on deprecated keys (see legacy mapping doc).
2. Store `payload_schema.canonical_replacement = "<key>"` on legacy rows.
3. Leave existing **placements** untouched until Phase 1 placement migration.

### Migration C — `rename_labels_only` (safe, optional)

1. Update labels: `create_inquiry` → "Create lead" (key unchanged until Phase 1).
2. No key renames in DB until execute paths dual-read aliases.

### Migration D — `lifecycle_placement_conditions_v1` (Phase 1+, not Phase 0)

1. Extend `condition_config` schema: `lifecycle_stage_in`, `status_key_in`.
2. Reseed placements per matrix stage — separate migration after handlers exist.

### Out of scope for Phase 0 migrations

- `executeAdminAction` handler implementations
- BOS catalog code changes
- Tour bar refactor
- Mass placement DELETE/INSERT

---

## Recommended implementation phases (post-review)

| Phase | Focus | Catalog keys |
|-------|-------|--------------|
| **0** | This catalog + legacy mapping + review | — |
| **1** | Entry + universal comms + early lifecycle | `create_lead`, `move_to_qualification`, comms trio, `add_note`, `create_task`, `move_to_waitlist`, tighten `mark_lost` |
| **2** | Tour unification | `confirm_tour`, `record_tour_outcome`, upgrade `send_enrollment_packet`, `schedule_tour`/`reschedule_tour` |
| **3** | Enrollment + placement | `review_enrollment_packet`, `approve_enrollment`, placement quartet, `request_missing_information` |
| **4** | Waitlist + financial | waitlist quartet + fee/deposit actions |
| **5** | Active/exit + BOS aliases | `withdraw_child`, `reopen_lead`, `reenroll_child`; BOS map |
| **6** | Status consolidation | Qualification status key; collapse tour substates |

---

## Review checklist

- [ ] All matrix actions from `childcare_lifecycle_matrix_v1.md` appear in catalog
- [ ] No duplicate semantics (`mark_won` vs `approve_enrollment`)
- [ ] Universal vs lifecycle classification approved
- [ ] Financial actions scoped to policy-gated placements
- [ ] Legacy mapping complete and deprecation list approved
- [ ] Migration A/B scope agreed — definitions only, no placement churn

**Next step after approval:** Migration A (inactive global stubs) + Migration B (deprecate legacy defs) in a single reviewed PR.
