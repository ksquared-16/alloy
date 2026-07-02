# Enrollment Alignment Sprint — Part 8 Data Model Audit

**Status:** Sprint working document (July 2026)
**Scope:** Enrollment module alignment to the frozen platform ownership chain:
Entity → Process → Stage → Work → Outcome → Durable State → Work View → Surface.

Every concept in the Enrollment implementation, its authoritative owner, duplicate owners
found during the audit, and the disposition this sprint applies.

## Audit table

| Concept | Authoritative owner (target) | Duplicate / wrong owner (found) | Disposition |
|---|---|---|---|
| Child profile (name, dob, health) | `customer_members` (+ config fields in `field_values`) | — (already guarded by `canonicalFieldOwnership`) | Keep. No change. |
| Household | `customers` | — | Keep. No change. |
| Adult identity | `persons` | — | Keep. No change. |
| Enrollment case | `opportunities` | — | Keep. Case = family coordination record for one Enrollment Process run. |
| Enrollment Process Participation (per child) | `opportunity_customer_members` (OCM) | Operator/registry entity type still named `inquiry_child` | Rename entity type `inquiry_child` → `enrollment_participation`. Table stays. |
| "Child Inquiry" as an entity | — (must not exist) | Naming only: `inquiry_child` entity type, `inquiryChild*` modules, `new_inquiry` status key | Remove the concept: rename registry key, modules, layout refKeys, seeds. No inquiry table exists — nothing structural to drop. |
| Program (per child) | `opportunity_customer_members.program_category_id` (FK → `location_program_categories`) | Dual storage: `desired_program_type` (legacy text) + `desired_program_category_id`; label "Program interest" | Rename FK column to `program_category_id`, backfill from text key, **drop `desired_program_type`**. Label: "Program". |
| Start Date (per child) | `opportunity_customer_members.start_date` | Named `desired_start_date`; interpretation baked into the name | Rename column/field key to `start_date`. Stage determines interpretation (inquiry = requested, enrolled = actual; approve handoff copies to agreement as commitment). |
| Schedule (per child) | `opportunity_customer_members.schedule_type` | Named `desired_schedule_type`; label "Schedule interest" | Rename column/field key to `schedule_type`. Label: "Schedule". |
| Location / Room (per child) | `opportunity_customer_members.location_id`, `program_room_cohort_key` | — | Keep. Already single-owner (placement-system doctrine). |
| Committed enrollment (operational) | `child_enrollment_agreements` → `child_placements` → `schedule_assignments` | — | Keep. L2 committed intent per truth-flow doctrine; participation fields are the proposal grain of the same canonical fields. |
| Case durable status | `opportunities.status_key` — **`open` \| `closed`** (+ `close_reason_key`) | 13-key explosion: `new_inquiry`, `needs_qualification`, `qualified`, `tour_requested`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `decision_pending`, `lost`, `withdrawn`, `not_a_fit`, `aged_out`, `not_enrolling` | Collapse. Tour/qualification/decision progress is Stage + Work, not status. Terminal variants become `closed` + `close_reason_key` (`lost`, `withdrawn`, `not_a_fit`, `aged_out`, `other`). |
| Child durable enrollment state | `opportunity_customer_members.outcome_status_key` — **`null` (in process) \| `waitlisted` \| `enrolling` \| `enrolled` \| `withdrawn` \| `not_enrolling`** (+ `close_reason_key`) | 13-key explosion: `offer_pending`, `waitlist_paused`, `registration_pending`, `paperwork_pending`, `start_date_scheduled`, `family_withdrew`, `not_moving_forward`, `aged_out`, … | Collapse. Offers/registration/paperwork are Work. Waitlist pause is placement-candidate state (`paused`) — already owned there. Terminal variants → `withdrawn` (exit after enrolled) or `not_enrolling` + `close_reason_key`. |
| Stage (operational position) | New: `opportunities.stage_key` + `opportunity_customer_members.stage_key`, written **only** by outcome execution | Derived from status lists in three places: `enrollmentProcessStageBindings.ts` (drifted — contains status keys that don't exist), `queue_membership_v1.included_status_keys` / `included_disposition_keys`, per-stage work-unit `queue_definition` status filters | Persist stage as explicit process state. Delete status-derived stage bindings. Membership = `stage_key`. |
| Stage definition (grain, work, outcomes, requirements) | `stage_operating_plan_v1` in Business Process config | — (already correct shape) | Keep. Extend: stage membership criteria replace queue membership status lists. |
| Queue membership | — (concept removed) | `queue_membership_v1` status/disposition key lists | Replace with `membership_criteria_v1`: subject grain + stage-scope, derived from `stage_key`. Work-unit `queue_definition` filters become derived output, not authored config. |
| Operational representation | Stage context (stage operating plan + runtime projections) | — | Single owner confirmed; no duplicate found beyond queue membership above. |
| Status filters (Work Views) | Work View `filters_v1` over **stage + durable state** | Work View status filters re-encoding stage membership | Work Views filter within a process's stages; they no longer re-derive membership from raw status keys. |
| Work | `work_items` + `StageWorkTemplateV1` (spawned on stage entry) | Operational progress encoded as statuses (`tour_scheduled`, `registration_pending`, …) | Keep work engine. Move all "progress statuses" into stage work templates + outcomes. |
| Outcomes | `StageCompletionOutcomeV1` + `StageOutcomeRuleV1` targets | Direct status PATCH paths; generic `update_status` action | Outcomes are the only mutation path for durable enrollment state. Rule target `move_to_stage` now persists `stage_key`. |
| Readiness | Computed (`evaluateCompletionRequirements`, `requirement_policy`) | — | Keep. Never persisted. Field requiredness moves fully onto process/stage (`requirement_policy` with stage scope). |
| Attention | Computed resolvers (`resolveOpportunityAttention`, stage attention rules) | — | Keep. Never persisted as status. |
| Actions | Process config (`stageActionCatalogV1`) + domain actions | Operator-exposed generic `update_status`; `update_enrollment_status` naming | Operator actions are domain verbs only: `schedule_tour`, `waitlist_child`, `enroll_child`, `mark_enrolled`, `withdraw_child`, `close_lead`. Generic status mutation stays internal to the execution runtime. |
| Work Views | `workViewsConfigV1` (stages, filters, sort, grouping, surface assignment) | — (aligned in BPEP sprint) | Keep. Update filter field registry for collapsed vocabulary + stage field. |
| Surfaces / presentation | `surfaceLayoutRegistry` + Surface Builder | — (aligned) | Keep. Rename `inquiry_child.*` layout refKeys → `enrollment_participation.*` (alias retained for stored docs). |

## Default Enrollment Process (Part 9 result)

Every stage answers "what work lives here?" — `qualification` failed the test (its work is
lead-contact work) and is removed as a stage; its work templates move into **New Lead**.

| Track | Stage | Work that lives here | Outcomes (durable state produced) |
|---|---|---|---|
| Family | `lead` (New Lead) | Review lead, contact family, qualify fit | Qualified → move to `tour`; Close → `closed` + reason |
| Family | `tour` (Tour) | Schedule tour, confirm, conduct, follow up | Toured & interested → `decision`; Close → `closed` + reason |
| Family | `decision` (Placement / Decision) | Present offer, collect decision, split children | Waitlist Child → OCM `waitlisted`; Enroll Child → OCM `enrolling`; Close → `closed` + reason |
| Family | `closed` | — (terminal, no work) | — |
| Child | `waitlist` (branch) | Review candidacy, extend offers, manage pauses (candidate state) | Offer accepted → `enrolling`; Not enrolling → `not_enrolling` + reason |
| Child | `enrolling` (Enrollment) | Registration, paperwork, agreement handoff (`approve_enrollment`) | Enrolled → `enrolled`; Not enrolling → `not_enrolling` + reason |
| Child | `enrolled` | — (steady state; transfer/withdraw actions available) | Withdraw → `withdrawn` |
| Child | `closed_withdrawn` | — (terminal, no work) | — |

`closed`, `enrolled`, `closed_withdrawn` remain stages with no work templates deliberately:
they are membership buckets for terminal/steady durable state, not work stages.
