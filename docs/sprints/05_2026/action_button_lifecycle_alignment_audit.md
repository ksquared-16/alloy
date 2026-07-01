# Action Button Lifecycle Alignment Audit

**Path:** `docs/sprints/05_2026/action_button_lifecycle_alignment_audit.md`  
**Date:** May 2026  
**Status:** Audit complete — no code changes in this pass  
**Inputs:** [`alloy_operational_doctrine_v1.md`](./alloy_operational_doctrine_v1.md), [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md)

---

## Audit method

Compared **Childcare Lifecycle Matrix v1** canonical actions against:

1. **Seeded / configured action definitions** — `action_definitions` migrations and `ACTION_BUTTON_LIBRARY` (`web/lib/admin/actions/actionDefinitionRegistry.ts`)
2. **Configured placements** — `action_placements` seeds (global + enrollment org-scoped)
3. **Runtime surfaces** — drawer header/sections, queue row, workspace right rail
4. **Non-registry UI** — hardcoded queue chips, tour booking bar, BOS recommendation catalog keys

**Authoritative config sources today:** `docs/system/actions-and-workflows.md`, migrations under `supabase/migrations/20260427*`–`20260529*`, sprint closeout `docs/sprints/06_2026/action_button_configuration_ux_sprint.md`.

---

## Current inventory (configured action buttons)

### Platform-global definitions (`org_id` NULL)

| Key | Label | Type | Typical placement | Matrix alignment |
|-----|-------|------|-------------------|------------------|
| `open_record` | Open | open_drawer | queue_row | Navigation — not a matrix action |
| `qualify_opportunity` | Qualify | update_status → `contacted` | *(placements removed)* | **Misaligned** — generic quote-era action |
| `start_quote` | Start quote | open_drawer | *(placements removed)* | **Not in matrix** |
| `mark_won` | Enrolled | update_status → `enrolled` | *(placements removed)* | **Misnamed** — should be Approve Enrollment in context |
| `mark_lost` | Lost | update_status → `lost` | record_header / overflow | Partial — matrix Mark Lost |
| `schedule_tour` | Schedule tour | update_status / start_workflow (org override) | record_header secondary | Partial — matrix Schedule Tour |
| `reschedule_tour` | Reschedule tour | start_workflow (org) | record_header secondary | **Aligned** (Tour stage) |
| `send_form` | Send form | *(platform def)* | Settings-addable | **Aligned** (universal Send Form) |
| `send_enrollment_packet` | Send enrollment packet | ui_intent | Settings-addable | Partial — intent only, not workflow-backed |
| `quick_message` | Message | ui_intent | queue_row (org placement) | Partial — collapses Call/Email/SMS |
| `ask_bos` | Ask BOS | ui_intent | queue_row / header (org) | Platform-native — not matrix, OK |
| `add_child` | Add child | open_form | record_section / `inquiry_children` | **Misplaced / misnamed** |
| `add_sibling` | Add sibling | open_form | record_section / `inquiry_children` | **Misplaced / misnamed** |
| `add_related_person` | Add parent/contact | open_form | record_section / `customer_booking` | Partial — parent capture, not matrix-named |
| `add_family_member` | Add family member | open_form | record_header secondary | **Misplaced** — belongs in qualification data capture |
| `send_message_placeholder` | Message | ui_intent | hidden | Legacy placeholder |

### Enrollment org-scoped definitions

| Key | Label | Type | Placement | Matrix alignment |
|-----|-------|------|-----------|------------------|
| `create_inquiry` | Create inquiry | ui_intent | right_rail | **Missing canonical Create Lead** (wrong name + ui_intent stub) |
| `contact_attempted` | Contact attempted | open_form + status | queue_row, record_header | **Conflates** universal Call/Email/SMS with status change |
| `update_status_add_note` | Update status | open_form | queue_row, record_header | Generic escape hatch — not matrix action |
| `review_automations` | Review automations | ui_intent | right_rail | Admin/meta — not operator lifecycle |
| `view_needs_attention` | View needs attention | ui_intent | right_rail | Navigation — not matrix action |
| `send_paperwork_placeholder` | Send paperwork | ui_intent | deactivated | Placeholder |
| `add_to_waitlist_placeholder` | Add to waitlist | ui_intent | deactivated | **Missing** Move to Waitlist |
| `convert_to_enrolled_placeholder` | Convert to enrolled | ui_intent | record_header | **Missing** Approve Enrollment |

### Hardcoded / non-registry surfaces (drift)

| Surface | Behavior | Issue |
|---------|----------|-------|
| `realWorkUnitFromOpportunities.ts` `defaultOpportunityQueueItemVm` | Chips: "Conversation had", "Schedule tour", "Lost" | Legacy growth/quote keys; bypasses registry for non-enrollment lanes |
| `OpportunityTourBookingLifecycleBar.tsx` | Confirm, complete, no-show, cancel on `tour_bookings` | **Not** registry actions — parallel tour operation path |
| BOS `operationalRecommendationCatalog.ts` | Keys like `send_first_response`, `complete_scheduled_event_follow_up` | Guidance-only keys — **not** wired to `action_definitions` |
| Intake auto-op | Form submit creates opportunity | **No** Create Lead button path for manual entry parity |

---

## Findings by audit question

### 1. Missing canonical actions

| Matrix canonical action | Current state | Priority |
|-------------------------|---------------|----------|
| **Create Lead** | `create_inquiry` ui_intent on right rail only; no executable definition | **P0** |
| Call Parent | No dedicated action; `quick_message` partial | P1 |
| Send Email | No dedicated action; comms drawer / message modal | P1 |
| Send SMS | No dedicated action | P1 |
| Add Note | No `add_note` action; folded into `update_status_add_note` | P1 |
| Create Task | No registry action | P1 |
| Move to Qualification | Removed `qualify_opportunity`; `contact_attempted` is wrong substitute | **P0** |
| Move to Waitlist | `add_to_waitlist_placeholder` deactivated | **P0** |
| Confirm Tour | Tour booking bar only | P1 |
| Record Tour Outcome | Tour booking bar + status keys; no canonical action | **P0** |
| Send Enrollment Packet | `send_enrollment_packet` ui_intent; not workflow execute | P1 |
| Review Enrollment Packet | Packet review UI exists; no drawer action definition | P1 |
| Request Missing Information | Missing | P2 |
| Approve Enrollment | `mark_won` / `convert_to_enrolled_placeholder`; no requirements gate | **P0** |
| Reserve Spot / Assign Classroom / Assign Schedule / Set Start Date | Placement orchestration UI partial; not unified action defs | P1 |
| Collect Registration Fee / Deposit / Waitlist Fee (+ waivers) | Missing | P2 |
| Upload Document | Missing on opportunity actions | P2 |
| Remove from Waitlist | Missing | P1 |
| Withdraw Child | Missing (person/member scope) | P2 |
| Reopen Lead | Missing | P2 |
| Reopen / Re-enroll (Withdrawn) | Missing | P3 |
| Contact Family (Waitlist) | Missing distinct from generic message | P2 |
| Mark Lost (required reason) | `mark_lost` exists; reason enforcement via transition rules partial | P1 |

### 2. Incorrectly named or misplaced actions

| Current | Problem | Matrix target |
|---------|---------|---------------|
| **Create inquiry** (`create_inquiry`) | Wrong operator label; ui_intent stub | **Create Lead** — universal entry action |
| **Add child** / **Add sibling** (`add_child`, `add_sibling`) | Implies lifecycle operation; matrix gathers child data during **Qualification** via forms/fields, not a header/section CTA | Move to qualification workflow or inline section edit; rename if kept as data capture |
| **Add child to opportunity** (operator mental model from `add_child` placement on `inquiry_children`) | Section-scoped CTA reads as lifecycle action | **Qualification** information capture — not a pipeline action button |
| **Add family member** on record_header | Header clutter; duplicates parent/contact capture | Universal **Send Form** or section-level add contact |
| **Contact attempted** | Name is a status, not an action; conflates outreach + lifecycle transition | Split: **Call Parent** / **Send Email** / **Send SMS** (universal) + **Move to Qualification** (lifecycle) |
| **Qualify** / **Conversation had** (`qualify_opportunity`) | Quote-era semantics; label mismatch | **Move to Qualification** |
| **Start quote** | Not childcare | Remove from childcare template |
| **Mark won / Enrolled** (`mark_won`) | Skips enrollment validation | **Approve Enrollment** with requirements |
| **Update status** (`update_status_add_note`) | Generic status picker undermines stable lifecycle | Overflow/admin only; prefer lifecycle actions per stage |
| **Send paperwork** placeholder | Vague label | **Send Enrollment Packet** or **Send Form** |

### 3. Universal vs lifecycle-specific

**Should be universal (all active pipeline stages unless policy hides):**

| Matrix universal | Current | Gap |
|------------------|---------|-----|
| Call Parent | — | Missing |
| Send Email | partial via Message / comms | Missing canonical def |
| Send SMS | partial via Message | Missing canonical def |
| Add Note | — | Missing |
| Create Task | — | Missing |
| Send Form | `send_form` | OK when placed |
| Upload Document | — | Missing (needed Enrollment+) |

**Should be lifecycle-specific (condition_config by matrix stage / status group):**

| Stage | Lifecycle actions | Current coverage |
|-------|---------------------|------------------|
| New Lead | Move to Qualification, Mark Lost | Poor — generic status only |
| Qualification | Schedule Tour, Move to Waitlist, Mark Lost | Schedule tour only (global placement) |
| Tour | Confirm, Reschedule, Record Outcome, Send Packet, Waitlist, Lost | Reschedule + schedule; rest partial/hardcoded |
| Waitlist | Contact Family, Schedule Tour, Send Packet, Remove, Lost | Placeholder waitlist only |
| Enrollment | Packet, Review, Request info, Approve, Waitlist, Lost + placement + financial | Mostly missing |
| Active | Withdraw Child | Missing |
| Lost | Reopen Lead, Add Note | Missing reopen |
| Withdrawn | Reopen, Add Note, Create Task | Missing |

**Platform-native (keep, not in matrix):** `ask_bos`, `open_record`, `view_needs_attention`, `review_automations`.

### 4. Actions that should be placements of canonical definitions

These today use **parallel implementations** and should invoke the same `action_definitions.key`:

| Behavior today | Should become placement of |
|----------------|----------------------------|
| Tour bar Confirm / Complete / No-show | `confirm_tour`, `record_tour_outcome` |
| BOS `recommended_action.key` strings (`send_first_response`, etc.) | Map to `send_email`, `send_sms`, `call_parent`, or `quick_message` with channel payload |
| Task Assist draft intents | Same communication action defs with `mode: draft` |
| Intake "Continue enrollment" handoff | `open_record` or stage-specific lifecycle action |
| Queue hardcoded chips in `defaultOpportunityQueueItemVm` | Registry `action_placements` with lifecycle conditions |
| Packet review approve/deny in form UI | `review_enrollment_packet` |
| Placement queue manual order / pin | `assign_classroom`, `assign_schedule`, `set_start_date` (or composite **Approve Enrollment** precondition) |
| `contact_attempted` form submit | Split: activity log (automation) + optional **Move to Qualification** |

### 5. Lifecycle stages where action buttons are missing

| Matrix stage | Missing buttons (configured) | Notes |
|--------------|------------------------------|-------|
| **New Lead** | Move to Qualification; Mark Lost (prominent); Call/Email/SMS/Note/Task/Form | Only generic update status + optional message |
| **Qualification** | Move to Waitlist; Mark Lost; child/fit capture actions | `add_child` mislabeled; no waitlist |
| **Tour** | Confirm Tour; Record Tour Outcome; Send Enrollment Packet; Move to Waitlist | Tour bar exists but not registry-unified |
| **Waitlist** | All lifecycle actions (Contact Family, Remove, fees) | Waitlist placeholder deactivated |
| **Enrollment** | Review packet, Request info, Approve, placement quartet, financial | Placeholders deactivated |
| **Active** | Withdraw Child | No opportunity-level action |
| **Lost** | Reopen Lead | Only overflow mark_lost inverse missing |
| **Withdrawn** | Reopen / Re-enroll | Not on opportunity drawer |

**Root cause:** Placements are mostly **global or enrollment-department scoped**, not **lifecycle-stage scoped**. `condition_config` today only supports `status_key_equals`, metadata exists/missing — not matrix stage groups.

### 6. BOS / task / workflow alignment gaps

| System | Current | Should use |
|--------|---------|------------|
| **BOS recommendations** | Catalog keys (`send_first_response`, `complete_follow_up`, …) are prose-only | Same keys as `action_definitions` or explicit `action_definition_key` mapping table |
| **Task Assist intents** | `draft_sms`, `draft_email`, `create_reminder` | `send_sms` / `send_email` / `create_task` with draft mode |
| **Workflows** | `schedule_tour` org workflow stub; tour reminders separate | Workflows invoke canonical actions; do not duplicate button logic |
| **Attention → CTA** | "Continue in Orchestrator" / drawer tab | Resolve to registry action execute or open_form |
| **Automations** | Status set on tour schedule (`update_status`) | **Automation** sets status; **Schedule Tour** action triggers workflow |

---

## Status model vs matrix (blocking context)

Current enrollment pipeline uses **execution substates** as statuses (`tour_completed`, `tour_no_show`, `follow_up_attempted`) where the matrix says **Follow-up Needed is not a lifecycle status**.

| Matrix stage | Alloy status keys today |
|--------------|-------------------------|
| New Lead | `new_inquiry` |
| Qualification | *(no dedicated key)* — `contact_attempted` used as proxy |
| Tour | `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted` |
| Enrollment | `enrolling` |
| Waitlist | `waitlisted` |
| Active | `enrolled` |
| Lost | `lost` |

Action placement conditions should eventually key off **`lifecycle_stage` metadata** on status definitions (already seeded in `20260430232500`) rather than ad hoc per-status lists.

---

## Proposed implementation sequence

No code in this pass. Recommended order minimizes drift and respects doctrine (actions before button proliferation).

### Phase 0 — Canon and inventory (1 sprint)

1. Publish matrix + doctrine (this doc set).
2. Add **`canonical_action_catalog_v1`** table in docs / seed manifest listing matrix keys, handler type, and migration target.
3. Rename labels in seeds only where safe: `create_inquiry` → **Create Lead** (key can stay until Phase 1).
4. Deactivate or hide from Settings: `qualify_opportunity`, `start_quote`, `mark_won`, placeholders.
5. Document lifecycle_stage → placement condition strategy in `docs/system/actions-and-workflows.md`.

### Phase 1 — Entry + early pipeline (P0)

1. **`create_lead`** action definition — open_form or navigate+create; replace `create_inquiry` ui_intent.
2. **`move_to_qualification`** — lifecycle transition + activity; replace `contact_attempted` as status-only shortcut.
3. **Split communication actions:** `call_parent`, `send_email`, `send_sms` (or channel param on `send_message`) + **`add_note`**, **`create_task`** universal defs.
4. Placements for **New Lead** and **Qualification** stages via `condition_config.lifecycle_stage_equals` (extend resolver).
5. **`move_to_waitlist`** executable action — wire waitlist orchestration already built.
6. **`mark_lost`** with required lost reason (transition rules).

**Validation:** Settings shows stage-appropriate buttons; queue row merges registry only; `npx tsc`, placement + execute tests.

### Phase 2 — Tour stage unification (P0–P1)

1. **`confirm_tour`**, **`record_tour_outcome`** definitions — wrap tour booking APIs.
2. Refactor `OpportunityTourBookingLifecycleBar` to render **placements** (or shared execute handlers called from bar).
3. **`send_enrollment_packet`** — upgrade from ui_intent to workflow/start_workflow.
4. Stage conditions for Tour + post-tour status group.
5. Automations: tour reminder, needs-attention on passed tour (already partial — link to actions).

### Phase 3 — Enrollment + placement (P1)

1. **`review_enrollment_packet`**, **`request_missing_information`**, **`approve_enrollment`** with requirement policies.
2. Placement actions: **`assign_classroom`**, **`assign_schedule`**, **`set_start_date`**, **`reserve_spot`** — align with placement orchestration module.
3. Remove **`convert_to_enrolled_placeholder`**; gate **`approve_enrollment`** on matrix requirements.
4. **`upload_document`** universal action on enrollment+ stages.
5. Re-home **`add_child`** / **`add_sibling`** to qualification data capture (section fields or subordinate form without lifecycle action framing).

### Phase 4 — Waitlist + financial (P2)

1. Waitlist stage placements: contact, remove, fee collect/waive.
2. Financial actions as execute hooks into billing module (config-gated).
3. Customer policy overlays (fee required optional).

### Phase 5 — Active / exit + BOS convergence (P2–P3)

1. **`withdraw_child`**, **`reopen_lead`**, re-enroll path.
2. BOS catalog **`recommended_action.key`** → `action_definitions.key` mapping; Task Assist executes same defs.
3. Remove `defaultOpportunityQueueItemVm` hardcoded chips.
4. Withdrawn lifecycle on person/member with linked opportunity actions.

### Phase 6 — Status consolidation (parallel track)

1. Collapse tour execution substates into Tour stage + tasks/attention (matrix-aligned).
2. Introduce explicit **Qualification** status or map `contact_attempted` → qualification stage metadata.
3. Re-seed queue buckets to matrix stages for reporting.

---

## Risks and dependencies

| Risk | Mitigation |
|------|------------|
| Generic **Update status** undermines lifecycle | Restrict to admin overflow; stage-specific actions primary |
| Duplicate tour paths (registry vs tour bar) | Phase 2 single execute path |
| BOS recommends actions that don't exist | Phase 5 mapping; until then label as guidance-only |
| `add_child` used in demos | Rename + reposition before removing |
| Org-custom placements | Migration adds org overrides; platform template follows matrix |
| Requirement policies not on actions | Phase 3 pairs `approve_enrollment` with requirement engine |

---

## Suggested verification (when implementing)

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/actions resolveActionsForContext executeAdminAction actionButtonCreateUi
cd web && npm run test -- tests/ui-v2/enrollmentQueueRowPreviewPolicy mergeQueueRowQuickActions
```

Manual: each matrix stage in demo org — drawer header, queue row, and BOS recommendation CTA invoke the same canonical action key.

---

## Summary

Configured action buttons today cover **~25%** of matrix canonical actions. The largest gaps are **Create Lead**, **early lifecycle transitions**, **tour outcome**, **enrollment approval**, and **waitlist**. Several existing buttons (**Add child**, **Contact attempted**, **Mark won**, **Update status**) are misnamed or misplaced relative to the matrix. BOS and tour UI operate **parallel action vocabularies** — convergence on `action_definitions` is required by doctrine.

**Next implementation step:** Phase 0 catalog + Phase 1 `create_lead` / universal comms / `move_to_qualification` with lifecycle-scoped placements.
