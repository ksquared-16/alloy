---
owner: operator
status: draft — specification, not approved for production integration
last_reviewed: 2026-08-22
supersedes: []
---
> **Superseded — the card designs in this document were rejected (2026-08-24).** The visual
> direction read as a new generic card system rather than an extension of the Alloy Focus Panel
> family. The measured basis for the replacement pass is
> [`operational-card-visual-audit.md`](./operational-card-visual-audit.md), and the current
> candidates live in the Local Design Lab at `/dev/operational-card-lab`.
>
> What remains useful here is the repository evidence: the ownership matrix, the data-source maps,
> and the platform gaps. The card compositions, the state-variant taxonomy, and the specimen
> annotations do not.

# Operational Card System Expansion — Specification & Local Design Lab

> **Stop condition.** This document specifies five cards and the Local Design Lab that
> renders them. Nothing here is registered in `FOCUS_PANEL_CARD_KEYS`, the Surfaces catalog,
> `SYSTEM5_CARD_ARCHETYPE`, or any Focus Panel composition. Production integration requires
> explicit Director approval and a separate mission. See §12.

---

## 0. What this mission found before it designed anything

Five findings changed the design. Each is evidenced in §1.

1. **A Milestones card already exists, is registered, and is permanently empty.**
   `milestones` is in `FOCUS_PANEL_CARD_KEYS`, in `FOCUS_PANEL_CARDS`, in the Surfaces catalog,
   and has a full blueprint with an eight-entry type registry. It is also declared
   **provider-unavailable** in `focusPanelCardProviders.ts` with an empty provider array, so it
   renders nothing in production. Adding a "Journey" card without resolving Milestones would give
   the platform two answers to one question. §8 returns the recommendation.

2. **There is no durable stage-history table.** `process_instances` carries `stage_key` as a
   *current position* scalar, and `opportunities.stage_entered_at` is overwritten on each entry.
   A Journey card cannot read "when did this subject enter each stage" from any store. It must
   compose history from durable domain facts that carry their own timestamps.

3. **Waitlist position is a runtime calculation and is never stored.**
   `waitlistCandidateRuntimePosition.ts` states it verbatim: *"Position is calculated from the
   current priority rules and filters. It is not a permanent stored rank."* The illustrative
   Journey line **"Position at entry: 4"** has no owner and must not be built.

4. **Documents have no expiration model.** Neither `documents` nor `document_versions` carries
   `expires_at`, `valid_until`, or an equivalent. The illustrative Health & Safety line
   **"Immunization record expires Sep 14"** has no owner and must not be built. This is the single
   largest platform gap the five cards expose (§11, GAP-1).

5. **Child attendance has no registered action.** `staff_presence.record` and
   `staff_presence.correct` are production capabilities in `capabilityRegistry.ts`.
   Child attendance has services (`recordAttendanceEvent`, `correctAttendanceEvent`) reachable
   only through a bespoke route, `POST /api/admin/childcare-attendance`. The Attendance card's
   Check in / Check out / Correct actions cannot be placed through the canonical action spine
   until those capabilities are registered (§11, GAP-2).

A sixth finding is structural rather than a gap, and it shapes every spec here:
**Alloy already carries an ownership doctrine that all five cards must obey.**
`buildReadinessCardEvidence` gives each factor an `ownerCard` and never edits it;
`buildBillingPreviewCardEvidence` distinguishes **unresolved** from **missing** and refuses to
render a verdict from unwired plumbing. Both rules are load-bearing in the specs below.

---

## 1. Phase 0 — Repository evidence

### 1.1 The card contract these five cards extend

| Concern | Owner | File |
|---|---|---|
| Card key vocabulary | Platform | `web/lib/adminV2/runtime/focusPanel/focusPanelCardModel.ts` (`FOCUS_PANEL_CARD_KEYS`, 24 keys) |
| Card declaration registry | Platform | `web/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry.ts` (`FOCUS_PANEL_CARDS`) |
| Subject-grain applicability | Platform | `web/lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern.ts` |
| Provider availability | Platform | `web/lib/adminV2/runtime/focusPanel/focusPanelCardProviders.ts` |
| Archetype defaults | Platform | `web/lib/adminV2/runtime/focusPanel/system5CardArchetypes.ts` |
| Operator catalog (Surfaces builder) | Platform | `web/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog.ts` |
| Card runtime boundary | Platform | `web/lib/adminV2/runtime/operationalContext/types.ts` (`OperationalContext`) |
| Visual shell | Platform | `web/components/admin/focusPanel/UniversalCard.tsx` + `web/app/adminV2/components/alloyOsRuntime.css` |
| Evidence-builder pattern | Platform | `build<X>CardEvidence(context) → evidence` — pure, no fetch |

The registry's own design law is the constraint every spec below is written to:

> "Adding a card is *declare it once + supply its component*, and the runtime
> composes/renders/reveals/defers/measures it automatically — never a central-orchestration edit."

Two consequences the specs honour:

- **A concern is a small separately-typed contract with its own composer.** No spec below adds a
  field to a god-schema; each adds an optional slice.
- **Silence never widens applicability.** An undeclared card is case-grain only
  (`DEFAULT_CARD_GRAINS`). Every grain a new card reaches is declared explicitly.

### 1.2 Domain owners, per card

#### Card 1 — Business Process Journey / Progress

| Question | Answer | Evidence |
|---|---|---|
| Configured stage list | `business_process_revisions.payload` → `lifecycle_builder_v1` stages, pinned per running instance (D-96) | `resolvePublishedStageInputsForCurrentWork.ts` returns `processStages: {key,label}[]` on `context.publishedStageInputs` |
| Current position | `process_instances.stage_key` (child grain) and `opportunities.stage_key` (case grain) | `process_instances` DDL; `workUnitProcessPopulation.ts` |
| Durable process state | `process_instances.state` — `waitlisted \| enrolling \| enrolled \| withdrawn \| not_enrolling` | `process_instances` column comment |
| Stage entry time | `opportunities.stage_entered_at` — **current stage only, overwritten** | `opportunityIdentity.ts:257` |
| Outcome execution | `executeStageOperatingOutcome` + `stage_operating_plan_v1` outcome rules | `lib/lifecycle/executeStageOperatingOutcome.ts` |
| State-transition stream | `mutation_events` (`previous_state`, `new_state`, `committed_at`, `subject_id`) | `20260630121000_mutation_events_outbox.sql` |
| Tour facts | `tour_bookings` (`start_at`, `status_key`, `canceled_at`, `rescheduled_from_booking_id`) | `tour_bookings` DDL |
| Waitlist entry | `placement_candidates` (`wait_since`, `status`) | `20260616120000_waitlist_placement_foundation.sql` |
| Waitlist position | **Derived at read time; never stored** | `waitlistCandidateRuntimePosition.ts` |
| Waitlist offer | **No entity exists.** Only an eligibility literal `"offer_pending"` | `childWaitlistPlacementEligibility.ts:34` |
| Stage requirements | `requirements_v1` on the pinned revision's stage record | `resolvePublishedStageInputsForCurrentWork.ts` (D-96/D-97) |
| Requirement satisfaction | `stageWorkRuntime` projection on the context | `lib/lifecycle/stageWorkRuntimeTypes.ts` |
| Recent activity | `resolveLeadActivityPreview` | `buildTimelineCardEvidence.ts` |
| Milestone facts | `truth.milestones` — **no adapter registered** | `focusPanelCardProviders.ts` |

#### Card 2 — Health & Safety

| Question | Answer | Evidence |
|---|---|---|
| Durable child health facts | `field_values` on `entity_type = 'customer_member'`, keys `allergies`, `medical_notes`, `special_instructions` (section `medical`) | `lib/fields/customerMemberFieldRegistry.ts` |
| Reader | `loadCustomerMemberProfileFieldsByMemberId` | `lib/completion/loadCustomerMemberProfileFields.ts` |
| Writer | `PATCH /api/admin/customer-members/[id]` | `CUSTOMER_MEMBER_FIELD_VALUES_PATCH` |
| Field vocabulary is extensible | Any org may add `field_definitions` on `customer_member` beyond the five seeds | same registry; `isReservedCustomerMemberFieldKey` blocks collisions only |
| Health documents | `documents` (`entity_type`/`entity_id`, `doc_type`, `status`) | `documents` DDL |
| Document expiry | **Does not exist** | no `expires_at` on `documents`/`document_versions` |
| Emergency contacts | `person_child_relationships` + `person_child_relationship_roles` | `lib/adminV2/runtime/focusPanel/emergencyContacts/` |
| Enrollment health requirements | `requirements_v1` on the governing revision's stage | `resolvePublishedStageInputsForCurrentWork.ts` |
| Form-collected health answers | `enrollment:allergy_notes`, `enrollment:medication_flag` shared values | `lib/forms/systemFieldRegistry.ts` |
| Attention signal | `context.signals.attention` | `operationalContext/types.ts` |

> **Duplicate-owner risk (OWN-1).** `enrollment:allergy_notes` (a form shared value) and
> `customer_member:allergies` (the durable child field value) are two representations of one fact.
> `canonicalBindingSuggestions.ts` already maps `/\ballerg/i → customer_member:allergies`, which
> makes the customer-member field the intended durable owner and the shared value a collection
> vehicle. The card must read **only** the durable field value. Reading the shared value would let
> an unsubmitted form contradict the record.

#### Card 3 — Staff

| Question | Answer | Evidence |
|---|---|---|
| Canonical human | `persons` | — |
| Staff-ness | `employments` (`person_id`, `employment_status`, `start_date`/`end_date`, `primary_location_id`) | `20260812...` employment foundation |
| Position vocabulary | `employment_positions` — **configuration-owned**: *"Tenant words, not a platform enum"* | table comment |
| Time-bound room/site staffing | `schedule_assignments` with `subject_type = 'staff'`, `subject_person_id`, `site_location_id`, `room_location_id`, `is_primary`, effective-dated | `20260725030801_operational_assignment_foundation_v1.sql` |
| Assignment role vocabulary | `operational_assignment_types` (`label`, `icon_key`, `visual_tone`, `subject_types`, `staffing_participation`) — configuration-owned | same migration |
| Child ↔ staff relevance | **Derived**: child's effective `room_location_id` ∩ staff assignments covering that room on that date | `schedule_assignments` shape |
| Person-grain projection | `PersonEmploymentComposition`; case-grain projection `buildCaseEmploymentProjection` | `lib/employment/` |
| Existing card | `employment` — declared for `["opportunity", "person"]`, reads `context.employment` | `focusPanelCardRegistry.ts` |
| Roster read model | `buildAssignmentRosterReadModel` — already emits staff rows with `positionLabel`, `roomName`, `isPrimary` | `lib/scheduling/roster/` |
| Actions | `staff.add`, `employment.update`, `employment.end`, `assignment.*` | `capabilityRegistry.ts` |

> `employments` carries an explicit boundary comment: *"Vertical facts (CPR, background check,
> training hours) belong in field_definitions/field_values, never here"*, and *"Time-bound
> room/site staffing stays in schedule_assignments — this is NOT a second scheduler."*
> The Staff card inherits both rules.

#### Card 4 — Attendance

The four-part separation the mission asks for **already exists in the repository** and is the
cleanest domain of the five.

| Layer | Owner | Evidence |
|---|---|---|
| **Expected** (L3) | `schedule_assignments` × `schedule_patterns.weekdays` → `ExpectedAttendanceEntry` | `lib/childcareOperational/expectations/scheduleExpectationCore.ts` |
| **Expected time window** | `schedule_patterns.metadata.default_hours = {arrive, depart}` — config, optional, **not a column and absent from `ExpectedAttendanceEntry`** | `readPatternDefaultHours` in `lib/scheduling/editorPatterns.ts` |
| **Actual facts** (L4) | `child_attendance_events` — append-only, no `updated_*` | `20260629120000_childcare_attendance_facts_p2.sql` |
| **Corrections** | `entry_type ∈ {original, correction, reversal}` + `corrects_event_id`; folded by `effectiveAttendanceEvents` | `attendanceFold.ts` |
| **Derived state** | `diffExpectedVsActual` → six variance codes | `expectedVsActual.ts` |
| **Presence read model** | `buildChildAttendanceReadModel` → `CurrentPresenceState`, timeline, room movements, absences, corrections | `childAttendanceReadModel.ts` |
| Event vocabulary | `check_in, check_out, absence, present, room_transfer, schedule_override` | `attendanceVocabulary.ts` |
| Absence reasons | `ABSENCE_REASONS` — excused/unexcused, *"carries NO billing or subsidy semantics"* | `attendanceAbsenceReasons.ts` |
| Staff equivalent | `staff_presence_events` — same shape, same fold, same correction model | `20260812090000_staff_presence_facts_v1.sql` |
| Whether an assignment produces an expectation | `operational_assignment_types.attendance_participation` (config) | assignment foundation migration |
| Actions | **child: none registered**; staff: `staff_presence.record`, `staff_presence.correct` | `capabilityRegistry.ts` |
| Route | `POST/PATCH /api/admin/childcare-attendance` | `app/api/admin/childcare-attendance/route.ts` |

#### Card 5 — Billing / Financial

| Question | Answer | Evidence |
|---|---|---|
| Existing card | `billing_preview` — *"Billing Preview"*, `ownsOperationalTruth: true`, archetype `status` | registry + catalog |
| Existing evidence | `buildBillingPreviewCardEvidence` — configuration/readiness only | `billingPreview/` |
| Billing signal | `OperationalBillingSignal`: `billingConfigured`, `billingContactName`, `billingContactEmail`, `tuitionRateLabel`, `feeBalanceCents` | `operationalContext/types.ts` |
| Tuition rate resolution | financial-config API, lazy-loaded when the card opens | `financialConfig/useFinancialConfig.ts` |
| Rate catalog | `commercial_tuition_rates`, `childcare_rate_plans`, `childcare_rate_rules` | migrations |
| Charge substrate | `charges` with `billable_source_type = 'enrollment_agreement'`; drafts recalculable, **posted charges immutable — corrections are new rows via `source_charge_id`** | `lib/financials/childcareChargeService.ts` |
| Obligation preview | `resolved_obligations` — *"Non-authoritative and recomputable; writes no ledger/invoice/payment. Posting is the only authoritative money write and is out of scope."* | table comment |
| Payments | `payments`, `ledger_transactions` — the only reader is `jobPaymentBalances.ts`, which is **job-grain (cleaning-services heritage)** | `lib/admin/jobPaymentBalances.ts` |
| Payment methods | `customer_payment_methods` — **no childcare reader/writer in the app** | grep: no `from("customer_payment_methods")` |
| Subsidy / funding split | **No entity.** Nothing in the schema models a third-party payer share | full table enumeration |
| Billing period | **No entity.** `lib/commercial/billingCadences.ts` is configuration, not a posted period | — |
| Payer / financial responsibility | **Not projected.** `responsibilityConfigured` reads `truth.billing_responsibility_configured`, which nothing writes | `buildBillingPreviewCardEvidence.ts` |

> **This is the decisive Billing finding.** Alloy today has a *charge substrate* and a
> *configuration preview*. It has **no family-grain posted balance, no billing period, no
> autopay state, no payment-method health, and no subsidy model**. Of the twenty-eight facts the
> mission's illustrative Billing card shows, **five** have owners today (§7.4). The compact card
> is therefore specified around what is real, with the remainder listed as GAP-3.

### 1.3 Would any proposed information duplicate another source of truth?

| Proposed item | Existing owner | Verdict |
|---|---|---|
| Journey "recent events" | `timeline` card (`buildTimelineCardEvidence`) | **Duplicate.** Journey shows *stage-anchored* facts; free activity stays in Timeline. |
| Journey "what remains" | `current_work` card (What's Next) | **Duplicate.** Journey states the *count* and hands off; it never lists or executes work. |
| Journey "meaningful completed outcomes" | `milestones` card blueprint | **Duplicate — and the reason §8 exists.** |
| Health & Safety requirement checklist | `required_information` / `readiness_kpi` | **Partial.** Health & Safety scopes to health requirements and hands the rest back. |
| Staff "who is assigned" | `scheduling` card (declared for `opportunity`, `child`, `person`) | **Adjacent.** Scheduling owns the *commitment*; Staff answers *which people*. Staff must not duplicate the assignment editor. |
| Staff employment facts | `employment` card | **Duplicate at person grain.** Staff is a *relationship* card about other people; Employment is the subject's own record. |
| Attendance expected window | `scheduling` card | **Adjacent.** Scheduling shows the pattern; Attendance shows today against it. |
| Billing tuition + readiness | `billing_preview` card | **Duplicate.** §7 supersedes rather than adds. |

---

## 2. Ownership matrix

Legend — **Derived**: computed at read time, never stored. **Configurable**: an org can change
it without code. **Treatment**: `summary` (on the card face) · `detail` (behind expansion) ·
`handoff` (referenced, owned elsewhere) · `absent` (no owner — must not be rendered).

### 2.1 Journey / Progress

| Information | Canonical owner | Storage / resolver | Derived? | Configurable? | Card treatment |
|---|---|---|---|---|---|
| Ordered stage list | Business Process revision | `business_process_revisions.payload` → `publishedStageInputs.processStages` | no | yes (BP authoring) | summary |
| Current stage | Process instance | `process_instances.stage_key` / `opportunities.stage_key` | no | no | summary |
| Durable process state | Process instance | `process_instances.state` | no | no (vocabulary) | summary |
| Stage position index | — | ordinal of current stage in list | **yes** | no | summary |
| Current-stage entry time | Opportunity | `opportunities.stage_entered_at` | no | no | summary |
| Past-stage entry times | — | **no store** | — | — | **absent** |
| Stage completion count | Stage work runtime | `context.stageWorkRuntime` | **yes** | yes (requirements) | summary |
| Requirement labels | BP revision | `requirements_v1` on pinned stage | no | yes | detail |
| Tour scheduled / completed | Tour booking | `tour_bookings.start_at`, `status_key` | no | no | summary (anchored to stage) |
| Tour cancellation / reschedule | Tour booking | `canceled_at`, `rescheduled_from_booking_id` | no | no | detail |
| Waitlist entry date | Placement candidate | `placement_candidates.wait_since` | no | no | summary |
| Waitlist current position | Placement ranking | `waitlistCandidateRuntimePosition` | **yes, live** | yes (priority rules) | detail, **labelled as current** |
| Waitlist position at entry | — | **never stored** | — | — | **absent** |
| Waitlist offer made / expiry | — | **no entity** | — | — | **absent** |
| Stage outcome | Stage operating plan | `stage_operating_plan_v1` outcome rules | no | yes | summary |
| Closed / lost reason | Process instance | `process_instances.close_reason_key` | no | yes (vocabulary) | summary |
| Skipped stage | — | inferred from position vs. list | **yes, weak** | no | detail, **stated as inference** |
| Reopened stage | Mutation events | `mutation_events` prev→new pairs | **yes** | no | detail |
| Open work count | Work signal | `context.signals.work.openCount` | **yes** | no | handoff → `current_work` |
| Free activity | Activity preview | `resolveLeadActivityPreview` | **yes** | no | handoff → `timeline` |

### 2.2 Health & Safety

| Information | Canonical owner | Storage / resolver | Derived? | Configurable? | Card treatment |
|---|---|---|---|---|---|
| Allergies | Child field value | `field_values`, `customer_member:allergies` | no | yes (field def) | summary |
| Medical notes | Child field value | `customer_member:medical_notes` | no | yes | detail |
| Special instructions | Child field value | `customer_member:special_instructions` | no | yes | detail |
| Org-added health fields | Child field value | any `field_definitions` on `customer_member` | no | yes | configurable section |
| Safety severity | — | **no severity model** | — | — | **absent**; see §6.3 |
| Medication authorization | Document | `documents` where `doc_type` matches config | no | yes (doc type) | summary (present/absent only) |
| Physical / immunization on file | Document | `documents` | no | yes | summary (present/absent only) |
| Document expiry | — | **no `expires_at`** | — | — | **absent** (GAP-1) |
| Health requirement satisfaction | Stage requirements | `requirements_v1` ∩ health field/doc bindings | **yes** | yes | summary |
| Emergency contact on file | Person↔child relationship | `person_child_relationships` + roles | no | yes (role vocabulary) | summary (count + presence) |
| Emergency plan | — | **no entity** | — | — | **absent** |
| Needs-attention count | — | count of unmet configured health requirements | **yes** | yes | summary |
| Dietary restriction | Child field value | only if the org defines the field | no | yes | configurable |

### 2.3 Staff

| Information | Canonical owner | Storage / resolver | Derived? | Configurable? | Card treatment |
|---|---|---|---|---|---|
| Person identity | `persons` | `persons` + profile-photo projection | no | no | summary |
| Employment existence | `employments` | `employments` covering the date | no | no | gate |
| Position label | `employment_positions` | via `employments.position_id` | no | **yes** | summary |
| Employment status | `employments.employment_status` | — | no | no | detail |
| Relevance to this subject | — | subject's effective room ∩ staff assignments on that room/date | **yes** | yes (assignment types) | the card's whole premise |
| Assignment role label | `operational_assignment_types.label` | via `schedule_assignments.operational_assignment_type_id` | no | **yes** | summary |
| Primary vs secondary | `schedule_assignments.is_primary` | — | no | no | summary (grouping) |
| Room / site | `schedule_assignments.room_location_id` / `site_location_id` | `locations` | no | no | summary |
| Effective window | `schedule_assignments.start_date`/`end_date` | — | no | no | detail |
| Program leadership | `employments.primary_location_id` + position | — | **yes** | **yes** (which positions count) | configurable section |
| Process owner / enrollment specialist | Opportunity | `opportunities.assigned_employee_*` | no | no | configurable section |
| Staff presence today | `staff_presence_events` | folded | **yes** | no | **handoff** → Attendance (staff variant) |
| Staff certifications | — | field values on person, **if defined** | no | yes | configurable, off by default |

### 2.4 Attendance

| Information | Canonical owner | Storage / resolver | Derived? | Configurable? | Card treatment |
|---|---|---|---|---|---|
| Expected today (yes/no) | Schedule expectations | `ExpectedAttendanceEntry` for the service date | **yes** | yes (patterns, assignment types) | summary |
| Expected room | Schedule expectations | `ExpectedAttendanceEntry.roomLocationId` | **yes** | yes | summary |
| Expected time window | Schedule pattern config | `schedule_patterns.metadata.default_hours` | no | **yes, optional** | summary when configured, else omitted |
| Check-in time | Attendance fact | `child_attendance_events` kind `check_in` | no | no | summary |
| Check-out time | Attendance fact | kind `check_out` | no | no | summary |
| Current presence state | Read model | `CurrentPresenceState` from the fold | **yes** | no | summary |
| Absence + reason | Attendance fact | kind `absence`, `reason_key` | no | partly (vocabulary is code-owned today) | summary |
| Excused / unexcused | `ABSENCE_REASONS` classification | — | **yes** | no | detail |
| Room transfers | Attendance fact | kind `room_transfer` | no | no | detail |
| Missing checkout | Fold | `DayAttendanceSummary.missingCheckout` | **yes** | no | summary (attention) |
| Late arrival | Variance | `late_arrival_unknown_time` | **yes** | no | detail |
| Corrections | Attendance fact | `entry_type`, `corrects_event_id` | no | no | detail (must be visible) |
| Week history | Fold | `summarizeAttendanceByDay` | **yes** | yes (how many days) | summary (capped) |
| Full ledger | Attendance facts | — | no | no | **handoff** → history surface |
| Closed day | Operating windows | `childcare_operating_windows` | **yes** | yes | summary state |
| Staff variant | `staff_presence_events` | same fold shape | **yes** | yes | same blueprint, different fact source |

### 2.5 Billing / Financial

| Information | Canonical owner | Storage / resolver | Derived? | Configurable? | Card treatment |
|---|---|---|---|---|---|
| Billing contact | Person field refs | `person.billing_contact_*` | no | yes | summary |
| Tuition rate | Commercial rates | financial-config API → `resolvedRate.rateLabel` | **yes** | **yes** | summary |
| Billing configured | Derived | contact ∧ tuition both resolved | **yes** | — | summary |
| Fee balance | Billing signal | `feeBalanceCents` | no | no | summary **only when non-null** |
| Placement facts (program/room/schedule) | Children truth | `truth._inquiry_children` | no | yes | detail |
| Draft charges | `charges` (status `draft`) | `childcareChargeService` | no | yes (templates) | detail |
| Posted charges | `charges` (posted, immutable) | same | no | yes | detail |
| Obligation preview | `resolved_obligations` | — | **yes, recomputable** | yes | detail, **labelled preview** |
| Current balance / amount due | — | no family-grain projection | — | — | **absent** (GAP-3) |
| Overdue amount / due date | — | `charges.due_date` exists; no aggregation | — | — | **absent** |
| Billing period | — | no entity | — | — | **absent** |
| Subsidy / funding split | — | no entity | — | — | **absent** |
| Family responsibility | — | not projected | — | — | **absent** |
| Autopay state | — | no entity | — | — | **absent** |
| Payment method + health | `customer_payment_methods` | **no childcare reader** | — | — | **absent** |
| Recent payments / refunds / failures | `payments`, `ledger_transactions` | job-grain only | — | — | **absent** |

---

## 3. Card 1 — Business Process Journey / Progress

### 3.1 The business question

> **Where is this subject in its process, how did it get here, and what remains?**

### 3.2 Ownership stance

The Journey card **projects** the process; it owns nothing.

- **Stage** is the durable operational position. Owner: the pinned Business Process revision +
  `process_instances.stage_key`.
- **Work** is what is performed in a stage. Owner: `current_work`.
- **Outcome** is the durable result. Owner: `stage_operating_plan_v1` execution.
- **Work View** is an operator lens over work. **It is not history and never appears here.**

The architecture question the mission poses is answered directly: **organise by configured
Business Process stages.** Work Views are overlapping cohorts (recorded in
`search-operational-destinations`), they are re-authorable at any time, and a subject can be in
several at once. A history organised by Work Views would change retroactively whenever someone
edited a lens. Stages are pinned to the governing revision per running instance (D-96), which is
exactly the durability a journey needs.

The hybrid the mission floats is admitted only in one direction: the *current* stage row may
carry operator-facing context sourced from the active lens (`context.perspective.missionLabel`),
because that is present-tense framing, not history.

### 3.3 The card never creates its own stage history

It composes three inputs it does not own:

1. `publishedStageInputs.processStages` — the ordered stage list from the governing revision.
2. The current position (`stage_key`) and durable `state`.
3. **Stage-anchored durable facts** — facts that carry their own timestamp and can be attributed
   to a stage: tour bookings, waitlist candidacy, form submissions, agreements, placements,
   schedule assignments, billing setup.

That third input is exactly `MilestoneFact` from the existing blueprint. See §8.

### 3.4 Evidence contract

```ts
type JourneyStageStatus = "completed" | "current" | "future" | "skipped" | "reopened";

type JourneyFact = {                    // one stage-anchored durable fact
  id: string;
  label: string;                        // "Tour completed"
  at: string | null;                    // ISO; null when the fact is undated
  sourceOwner: string;                  // audit only, never displayed
  destinationCard: string | null;       // handoff target (Card Links)
  subjectId: string | null;
};

type JourneyStage = {
  key: string;
  label: string;
  status: JourneyStageStatus;
  /** ONLY for the current stage. Past entry times have no store — see GAP-4. */
  enteredAt: string | null;
  facts: JourneyFact[];
  outcomeLabel: string | null;
  /** Current stage only. */
  requirementsSatisfied: number | null;
  requirementsTotal: number | null;
};

type JourneyCardEvidence = {
  stages: JourneyStage[];
  currentStageKey: string | null;
  currentStageIndex: number | null;     // 1-based, for "Stage 3 of 5"
  stateLabel: string | null;            // from process_instances.state
  closeReasonLabel: string | null;
  answerLine: string;
  supportingLine: string | null;
  statusChip: string | null;
  statusTone: "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";
  /** No published stage list resolved — HOLD, do not conclude "no journey". */
  isUnresolved: boolean;
  isEmpty: boolean;
};
```

**Status derivation, and its honesty limit.** With no stage-history store, status is derived from
ordinal position: stages before the current index are `completed`, the current is `current`, later
ones are `future`. A `completed` stage that carries **no** anchored fact is rendered `skipped` —
and the spec requires the card to label that as an inference, not an assertion, because a stage
may have been worked without producing a fact. `reopened` is only claimed when `mutation_events`
carries a backwards transition for the subject. **Do not fabricate `enteredAt` for past stages.**

### 3.5 Progressive disclosure

| Layer | Content |
|---|---|
| Card face | State chip · "Stage 3 of 5 — Enrolling" · current-stage requirement count · the two most recent anchored facts · next action label |
| Expanded | Full stage rail with per-stage facts, outcomes, and the current-stage requirement list |
| Dedicated surface | None. Work → `current_work`; free activity → `timeline`. |

### 3.6 States designed

Early stage · mid-process · waitlist · enrolling (current) · completed · skipped step ·
reopened step · closed/lost · multi-child family · unresolved configuration.

**Child grain vs family grain.** `process_instances` is `(process_key, subject_id, context_id)`
— for Enrollment the subject is the **child**, the context the **opportunity**. So a family with
three children has **three journeys**. At case grain the card renders one rail per child; at child
grain, that child's rail only. It must never merge three children into one rail — that would
invent a family-grain position the platform does not store.

### 3.7 Configuration boundary

| Platform-owned | Configuration-owned |
|---|---|
| Card anatomy, the stage rail, completed/current/future treatment | Whether the card is present on a surface |
| Status-derivation rules | Card label |
| The prohibition on inventing past entry times | Which fact types are anchored, and their labels |
| Attention treatment, density, accessibility | Max facts shown per stage; max stages before overflow |
| Handoff behaviour | Whether requirement counts are shown |
| — | Destination card per fact type (Card Links) |
| — | Process applicability, subject grain, site applicability |

Configuration may not: reorder stages (the revision owns order), restate a stage's outcome, or
mark a stage complete.

### 3.8 Action boundary

**The Journey card executes nothing.** Every affordance is a handoff:
next action → `current_work`; a tour fact → `tour_summary`; a placement fact → `scheduling`;
a billing fact → the billing card; a document fact → `documents`. This follows the Readiness
card's `ownerCard` rule exactly.

---

## 4. Card 2 — Health & Safety

### 4.1 The business question

> **What health and safety information matters for this child, and what is incomplete or
> requires attention?**

### 4.2 Ownership stance

The card owns **no medical truth**. It is a configured projection over four owners:

1. Durable child field values (`customer_member` entity) — the health facts.
2. Documents — evidence artifacts.
3. Stage requirements from the governing revision — what enrollment demands.
4. Person↔child relationships — emergency contacts.

Editing routes to the owner (`PATCH /api/admin/customer-members/[id]` for fields, the documents
surface for artifacts). **This is deliberately not a medical form.**

### 4.3 The severity problem, and how the spec resolves it

The illustrative card renders "Severe peanut allergy" under an **Important** heading. Alloy has
no severity model: `customer_member:allergies` is a **free-text field**. The platform therefore
cannot know that "Peanuts" is severe and "Dairy" is not, and a runtime that guessed by keyword
matching would be inventing a clinical judgement.

Two honest options:

- **(A) Configured prominence** — the org marks specific `field_definitions` as *safety-critical*
  via `field_definitions.config`. Prominence becomes a property of the field, not its value.
  No new table; no clinical inference.
- **(B) A severity field** — the org adds an `allergy_severity` select field. Better data, but it
  needs a collection path and back-population, and is empty for every existing child.

**Recommendation: (A) now, (B) as an org's own choice later.** (A) is configuration over existing
platform primitives and is truthful on day one. The Design Lab renders (A).

### 4.4 Evidence contract

```ts
type HealthFactRow = {
  fieldKey: string;                     // "allergies"
  label: string;                        // configured label
  value: string | null;
  /** From field_definitions.config — configured prominence, never inferred. */
  safetyCritical: boolean;
};

type HealthRequirementRow = {
  key: string;
  label: string;
  /** Has an authoritative source answered? Follows the billing_preview rule. */
  resolved: boolean;
  met: boolean;                         // meaningful only when resolved
  detail: string | null;
  ownerCard: string | null;             // handoff target
};

type HealthSafetyCardEvidence = {
  criticalFacts: HealthFactRow[];       // configured safety-critical, with a value
  healthFacts: HealthFactRow[];         // remaining configured fields, with a value
  requirements: HealthRequirementRow[];
  emergencyContactCount: number;
  hasEmergencyContact: boolean;
  attentionCount: number;               // resolved-and-unmet requirements ONLY
  answerLine: string;
  supportingLine: string | null;
  statusChip: string | null;
  statusTone: "ready" | "blocked" | "at-risk" | "neutral";
  isUnresolved: boolean;
  isEmpty: boolean;
};
```

**Non-negotiable rule, inherited from `buildBillingPreviewCardEvidence`:** an *unresolved*
requirement is never counted as missing, and never produces a blocked verdict. A card that says
"2 need attention" because a projection has not loaded is the Milestones fabrication in a new
place — and here it would be a **safety** claim.

Equally: an empty allergies field must never render as "No known allergies". Absence of a record
is not a clinical negative. The card renders the row as unset or omits it.

### 4.5 Progressive disclosure

| Layer | Content |
|---|---|
| Card face | Attention count · safety-critical facts · up to three health facts · requirement summary |
| Expanded | Full configured field list · requirement checklist with handoffs · emergency contact summary |
| Dedicated surface | Documents surface for artifacts; child record for field edits |

### 4.6 States designed

Complete · needs attention · safety-critical present · new/empty enrollment · unresolved.

### 4.7 Configuration boundary

| Platform-owned | Configuration-owned |
|---|---|
| Card anatomy, attention treatment | Presence, label, section set and order |
| The unresolved-vs-missing rule | Which `customer_member` fields appear, and their labels |
| The prohibition on inferring severity | Which fields are safety-critical |
| The prohibition on rendering absence as a negative | Which document types count as health evidence |
| Accessibility, density | Which stage requirements project here |
| — | Visibility conditions, jurisdiction/site applicability, actions |

**The shared runtime contains no childcare branching.** Every childcare-specific element —
"immunization", "EpiPen", "physical" — is a tenant field key, document type, or requirement label.
The card's code knows only: configured fields, configured documents, configured requirements.

### 4.8 Action boundary

Edit field → `customer-members` PATCH (existing). Upload document → documents surface (existing).
Resolve requirement → handoff to the owning card. **No new mutation path.**

---

## 5. Card 3 — Staff

### 5.1 The business question

> **Which staff members are relevant to this subject, in what role, and under what assignment?**

### 5.2 Is Staff a relationship card, an assignment card, or a composed projection?

**A composed projection, presented as a relationship card.** The mission's instinct — that it
should feel like Household and Children — is right about the *presentation* and wrong about the
*derivation*. Household reads a stored edge (`customer_persons`); Children reads a stored
collection (`customer_members`). There is **no stored edge between a child and a staff member**,
and there should not be: it would immediately contradict `schedule_assignments` whenever a room
changed.

Relevance is derived:

```
child → effective schedule_assignment (subject_type='child')  → room_location_id, site, date
      → staff schedule_assignments (subject_type='staff') covering that room+date
      → employments covering that person on that date        → position_id → label
```

This is why the card is reusable for any subject that resolves to a place and a time — the
premise is **shared operational context**, not childcare.

### 5.3 Evidence contract

```ts
type StaffRelevanceBasis = "room_assignment" | "site_assignment" | "process_owner" | "program_leadership";

type StaffPersonRow = {
  personId: string;
  name: string;
  imageUrl: string | null;
  positionLabel: string | null;         // employment_positions (config)
  assignmentTypeLabel: string | null;   // operational_assignment_types (config)
  roomLabel: string | null;
  siteLabel: string | null;
  isPrimary: boolean;
  basis: StaffRelevanceBasis;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type StaffGroup = { key: string; label: string; people: StaffPersonRow[] };

type StaffCardEvidence = {
  groups: StaffGroup[];                 // configured group order
  totalCount: number;
  primary: StaffPersonRow | null;
  answerLine: string;
  supportingLine: string | null;
  statusChip: string | null;
  statusTone: "ready" | "neutral";
  /** No assignment projection resolved — HOLD, not "no staff assigned". */
  isUnresolved: boolean;
  isEmpty: boolean;                     // resolved AND genuinely nobody
};
```

The `isUnresolved` / `isEmpty` split matters more here than anywhere except Health & Safety:
"no staff assigned to this child" is an operational alarm. It must never be printed because a
projection had not loaded.

### 5.4 Scope

`site` and `room` scope the projection through the assignment rows themselves — a staff member
assigned to another room is not relevant and is not fetched. Program scope enters through
`operational_assignment_types` (`staffing_participation`) and through which positions the org
designates as leadership. All three are configuration, not code.

### 5.5 Progressive disclosure

| Layer | Content |
|---|---|
| Card face | Primary person (name, position, room) · a count of others · leadership when configured |
| Expanded | All groups, with assignment type, room, and effective window |
| Dedicated surface | Roster / Assignments workspace |

### 5.6 States designed

One assigned staff member · several roles across groups · nobody assigned (resolved) ·
unresolved · staff whose employment has ended within the window.

### 5.7 Configuration boundary

| Platform-owned | Configuration-owned |
|---|---|
| Card anatomy, grouping mechanics, avatar/identity treatment | Presence, label |
| Relevance derivation (assignment ∩ date) | Which bases are included (`room`, `site`, `process_owner`, `leadership`) |
| The refusal to store a child↔staff edge | Group definitions, order, labels |
| Unresolved-vs-empty | Which positions count as leadership |
| — | Max people before overflow; subject grain; site applicability |

### 5.8 Action boundary

**Read-only, with handoffs.** Open person → durable person record. Change assignment →
`assignment.*` capabilities on the Scheduling card, which already owns them. The Staff card must
not grow an assignment editor; that is the second-scheduler failure `employments` already warns
against.

---

## 6. Card 4 — Attendance

### 6.1 The business question

> **What was expected, what actually happened, what is happening now, and does anything require
> correction?**

### 6.2 Ownership stance

Attendance is the domain where Alloy's layering is already correct, so the card is thin.

```
Expected (L3)    schedule_assignments × schedule_patterns → ExpectedAttendanceEntry
Actual   (L4)    child_attendance_events (append-only)
Corrections      entry_type + corrects_event_id → effectiveAttendanceEvents
Derived          buildChildAttendanceReadModel + diffExpectedVsActual
```

**The card owns no attendance state.** It renders `CurrentPresenceState` and
`DayAttendanceSummary`, both of which already exist.

### 6.3 Evidence contract

```ts
type AttendanceDayRow = {
  serviceDate: string;
  weekdayLabel: string;
  expected: boolean;
  expectedWindowLabel: string | null;   // null when the pattern configures no hours
  checkInLabel: string | null;
  checkOutLabel: string | null;
  state: "present" | "checked_out" | "absent" | "not_arrived" | "no_record" | "closed";
  absenceReasonLabel: string | null;
  missingCheckout: boolean;
  corrected: boolean;
};

type AttendanceCardEvidence = {
  today: AttendanceDayRow | null;
  week: AttendanceDayRow[];
  varianceCount: number;                // from diffExpectedVsActual
  correctionCount: number;
  answerLine: string;                   // "Present" | "Not arrived" | "Absent — illness"
  supportingLine: string | null;        // "Checked in 8:04 AM"
  statusChip: string | null;
  statusTone: "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";
  isUnresolved: boolean;
  isEmpty: boolean;
};
```

**The expected window is optional and must degrade silently.** `readPatternDefaultHours` returns
`null` when the pattern configures no hours. The card renders the expected row without a window
rather than inventing site opening hours — those belong to `childcare_operating_windows`, which
is a *site* fact, not this child's expectation.

**Corrections must be visible.** `child_attendance_events` is append-only precisely so a
correction is auditable. A corrected day that renders identically to an uncorrected one throws
away the reason the table was built that way.

### 6.4 Progressive disclosure

| Layer | Content |
|---|---|
| Card face | Today's state · check-in/out · expected window when configured · the current week, capped |
| Expanded | Week detail with room movements, absence reasons, correction markers |
| Dedicated surface | Attendance history — **the ledger never enters the card** |

### 6.5 States designed

Currently present · expected but not arrived · checked out (completed day) · absent with reason ·
missing checkout · corrected record · closed day · unresolved · staff variant.

**The staff variant uses the same blueprint.** `staff_presence_events` has the same columns, the
same `entry_type`/`corrects_event_id` correction model, and its own fold. The card takes a fact
source; it does not branch on subject type.

### 6.6 Configuration boundary

| Platform-owned | Configuration-owned |
|---|---|
| Card anatomy, presence-state treatment, correction marking | Presence, label |
| The expected/actual/correction/derived separation | How many history days appear |
| The refusal to substitute site hours for a child expectation | Which actions are placed, and where |
| Time formatting, accessibility | Absence-reason vocabulary (**today code-owned — see GAP-5**) |
| — | Subject grain, site applicability, visibility conditions |

### 6.7 Action boundary — and the blocker

Canonical entry points the card should place: **Check in · Check out · Mark absent · Correct
attendance · View history.**

Only *View history* can be placed today. The other four have no registered action:

| Action | Staff | Child |
|---|---|---|
| Record presence | `staff_presence.record` ✅ | **none** |
| Correct presence | `staff_presence.correct` ✅ | **none** |

Child attendance is reachable only via `POST /api/admin/childcare-attendance`. Placing a button
that calls that route directly would create the duplicate mutation path the mission forbids.
**The Design Lab therefore renders the actions in their real geometry and marks them
unavailable-pending-capability.** GAP-2 states the fix: register `attendance.record` and
`attendance.correct` against the existing services — and register them in `capabilityRegistry.ts`
as well as the RegisteredAction list, because a RegisteredAction absent from the capability
registry is unreachable.

---

## 7. Card 5 — Billing / Financial

### 7.1 The business question

> **What is owed now, what period are we in, how is payment configured, what recently happened,
> and what requires attention?**

### 7.2 The comprehensive information model

The mission asks for the full model first. It is the table in §2.5, grouped:

- **Current financial state** — balance, amount due, due date, overdue, credits
- **Current period** — period bounds, expected charge, adjustments, subsidy, family responsibility
- **Payment setup** — payer, responsibility, autopay, method, method health
- **Upcoming** — next charge, next due date
- **Recent history** — payments, credits, refunds, failures, adjustments
- **Attention** — overdue, failed payment, missing method, incomplete funding, incomplete setup

### 7.3 What Alloy can actually answer today

| Group | Answerable now |
|---|---|
| Current financial state | `feeBalanceCents` only, and only when the signal carries it |
| Current period | **nothing** |
| Payment setup | billing contact name/email only |
| Upcoming | **nothing** |
| Recent history | draft/posted `charges` rows for the enrollment agreement |
| Attention | configuration incompleteness only |

Five of roughly twenty-eight facts. The rest have no owner — **not "not yet projected", but no
entity in the schema.** `resolved_obligations` is explicitly non-authoritative and recomputable;
`payments` and `ledger_transactions` are read only at job grain by the cleaning-services heritage
module; `customer_payment_methods` has no childcare reader; subsidy, autopay, and billing period
do not exist.

### 7.4 Consequence for the design

The mission's instruction is decisive here: *"Only show facts supported by authoritative current
data. Do not invent balances or posted financial truth."*

Therefore:

- The Billing card **supersedes `billing_preview`** rather than adding a second billing card.
  Two billing cards would be two answers to one question — the exact failure §8 identifies for
  Milestones. The existing key, its `ownsOperationalTruth` flag, and its catalog entry are reused.
- Its **shipping shape today is the configuration/readiness card**, extended with charge activity.
- The **financial-state shape** (balance, period, autopay, subsidy) is specified in full below so
  the card does not need another architecture pass once the substrate lands — but it is **held**,
  not rendered, and the lab shows it as a held state.

### 7.5 Evidence contract

```ts
type BillingReadinessItem = { label: string; resolved: boolean; met: boolean; detail: string | null };

type BillingChargeRow = {
  id: string;
  label: string;
  amountLabel: string;
  status: "draft" | "posted" | "voided";
  serviceDate: string | null;
  dueDate: string | null;
  /** True for resolved_obligations rows — recomputable, never posted truth. */
  isPreview: boolean;
};

type BillingCardEvidence = {
  // ── Configuration (answerable today) ────────────────────────────────
  isConfigured: boolean;
  billingContactName: string | null;
  billingContactEmail: string | null;
  tuitionRateLabel: string | null;
  readinessItems: BillingReadinessItem[];
  charges: BillingChargeRow[];
  balanceLabel: string | null;          // ONLY from feeBalanceCents, ONLY when > 0

  // ── Financial state (specified, HELD — no owner today) ───────────────
  periodLabel: string | null;           // GAP-3
  amountDueLabel: string | null;        // GAP-3
  nextChargeLabel: string | null;       // GAP-3
  autopayLabel: string | null;          // GAP-3
  paymentMethodLabel: string | null;    // GAP-3
  familyResponsibilityLabel: string | null; // GAP-3
  subsidyLabel: string | null;          // GAP-3

  answerLine: string;
  supportingLine: string | null;
  statusChip: string | null;
  statusTone: "ready" | "blocked" | "at-risk" | "neutral";
  isUnresolved: boolean;
  isEmpty: boolean;
};
```

Every GAP-3 field is typed `string | null` and is **null in every production path today**. That is
deliberate: the contract is complete, the renderer omits null rows, and wiring a future substrate
is a producer change with no card change.

### 7.6 States designed

Setup incomplete · configured/current · amount due · unresolved (held — the state that must not
say "0 items missing") · subsidy split (**held**, rendered in the lab as the future shape).

### 7.7 Configuration boundary

| Platform-owned | Configuration-owned |
|---|---|
| Card anatomy, money formatting, attention treatment | Presence, label |
| The unresolved-vs-missing rule | Which readiness items appear |
| The refusal to aggregate a balance the platform has not posted | How many charge rows appear |
| The `isPreview` marking on recomputable rows | Action placements |
| — | Visibility conditions, subject grain, site applicability |

**Configuration may never define what is owed.** Charge templates, rate rules, and policies are
configuration; the resulting money is not.

### 7.8 Action boundary

Today: *Complete billing setup* → existing financial configuration surface. *View billing* →
financial surface. **No posting, no payment capture, no method entry from the card.**

---

## 8. Special decision — Journey vs Milestones

### 8.1 The finding

`milestones` is not an idea. It is a registered card key, a registry declaration, a catalog entry,
a rendered component, an eight-type registry, an Enrollment reference composition, and a
`projectMilestonesCardVM` projector with a passing test. It is also **provider-unavailable**: the
provider array is empty, no adapter writes `truth.milestones`, and the card therefore renders
nothing in production and cannot advance to any readiness state.

Read the blueprint's own words:

> "Milestones summarize meaningful completed or committed operational facts.
> Sources are registered adapters (process outcomes, tours, forms, agreements, placements,
> schedules, billing setup, required documents…)"

That is **exactly** the set of stage-anchored durable facts the Journey card needs (§3.3). The
missing piece in both cases is identical: an adapter that projects those facts from their owners.

### 8.2 The recommendation

> **Build a `process_journey` card, and resolve Milestones by making it the Journey card's
> fact-projection layer rather than a peer card.**

Concretely:

1. **Adopt the existing `MilestoneFact` shape as the Journey card's fact input.** It already
   carries `typeKey`, `at`, `scope`, `subjectId`, `destinationCard`, `sourceOwner` — everything a
   stage-anchored fact needs. Do not define a second fact type.
2. **Add one field: `stageKey: string | null`.** That is the whole difference between a milestone
   list and a journey. A fact anchored to a stage becomes journey content; an unanchored fact is
   still a milestone.
3. **Write the adapters once.** They serve both. Registering the first adapter is what makes
   Milestones capability-available; the same registration populates Journey.
4. **Deprecate the standalone Milestones *card*, not the blueprint.** A flat bucket of "meaningful
   outcomes" with no process context is strictly less useful than the same facts placed on the
   rail that explains them. Keep the key and blueprint (removing a registered key is a migration);
   remove it from the operator catalog so no new surface adds it.

### 8.3 The alternatives, explicitly analysed

| Candidate | Verdict |
|---|---|
| **"Milestones" card** | Rejected as the primary answer. It has no process spine, so it cannot say what remains, cannot show a current position, and cannot express a skipped or reopened stage. Its fact model is nonetheless the right one and is adopted. |
| **"Progress" card** | Rejected as a name and as a scope. Progress is already answered twice — `readiness_kpi` scores factor completion and `current_work` states what is next. A third progress card is the duplicate-owner failure. |
| **"Timeline" card** | Already exists and stays. It answers *"what has recently happened"* from free activity, ordered by time and unaware of stages. Journey answers *"where are we in the process"*, ordered by stage. Different questions; both keep their card. |
| **Work Views as the organising axis** | Rejected. Overlapping, re-authorable cohorts. History organised by a lens changes when the lens changes. |
| **Extending `current_work`** | Rejected. Current Work owns work completion (`ownsWorkCompletion: true`) and is the busiest card on the panel. History would dilute a card whose whole value is a single next answer. |
| **`workflow_history` key** | Present in `FOCUS_PANEL_CARD_KEYS` but has no registry declaration, no component, no archetype beyond `summary`, and no builder. It is a stub, not a competing implementation. |
| **A new milestone subsystem** | Rejected outright. The mission warns against it and the repository agrees: `MILESTONE_TYPE_REGISTRY` already names the eight sources, and every one of them is a table that already exists. What is missing is adapters, not a subsystem. |

### 8.4 Name

**`process_journey`**, operator label **"Journey"**. It names the process, not the industry, and
it does not collide with `timeline`, `readiness_kpi`, `current_work`, or `workflow_history`.

> **Naming hazard, flagged.** `FOCUS_PANEL_CARD_KEYS` already contains **`health`**, whose label is
> **"Enrollment Health"** — a case-health signal with no medical meaning. The new card must be
> keyed **`health_safety`**, never `health`. Two cards that both read as "Health" on one panel is a
> defect waiting to happen.

---

## 9. Local Design Lab

### 9.1 What it is

A dev-only review surface at **`/dev/operational-card-lab`**, following the established
`app/dev/*` precedent (`archetype-card-mocks`, `household-card-mock`, `children-card-verify`):

```ts
if (process.env.NODE_ENV === "production") notFound();
```

It renders the five cards through the **real** `UniversalCard` shell and the **real**
`alloyOsRuntime.css`, driven by fixture `OperationalContext` values, with a specimen selector
for every state in §3.6 / §4.6 / §5.6 / §6.5 / §7.6.

### 9.2 What it deliberately is not

Every lab artifact lives in isolated namespaces:

```
web/lib/cardLab/          evidence builders (pure; typed against the real OperationalContext)
web/components/cardLab/   card components (compose the real UniversalCard)
web/app/dev/operational-card-lab/   the review surface
```

**Zero production files are modified.** Specifically, the mission does **not** touch:

- `focusPanelCardModel.ts` (`FOCUS_PANEL_CARD_KEYS`)
- `focusPanelCardRegistry.ts` (`FOCUS_PANEL_CARDS`)
- `focusPanelCardCatalog.ts` (the Surfaces builder catalog)
- `system5CardArchetypes.ts`
- `focusPanelCardProviders.ts`
- any composition, grid, or default-layout module

Consequently the five cards **cannot be added to a surface, cannot appear in the builder catalog,
and cannot enter any Focus Panel composition** until a later mission makes those registry edits
deliberately. That is the stop condition, enforced structurally rather than by convention.

### 9.3 Fixture honesty

Fixtures are shaped as real `OperationalContext` values and carry only facts with owners in §2.
Where a fact has no owner, the lab shows the **absent** treatment, not a fabricated value —
so "Position at entry: 4", "expires Sep 14", "$0 due", and "Autopay · Visa ••••4242" appear
**nowhere** except as explicitly labelled held/absent states.

---

## 10. Open architecture & product decisions

| # | Decision | Why it needs the Director |
|---|---|---|
| D-1 | Adopt §8: `process_journey` absorbs Milestones as its fact layer; Milestones leaves the operator catalog. | Retires a registered (if empty) card concept. |
| D-2 | Health & Safety severity = **configured prominence** (option A), not inferred, not a new severity field. | Determines what the card can claim about risk. |
| D-3 | Billing card **supersedes** `billing_preview` on the same key rather than adding a card. | Avoids two billing answers; changes an existing card's scope. |
| D-4 | Ship Billing in its configuration/readiness shape and **hold** the financial-state shape until a substrate exists. | The alternative is fabricated money. |
| D-5 | Attendance actions ship **disabled** until `attendance.record` / `attendance.correct` are registered. | Alternative is a duplicate mutation path. |
| D-6 | Journey renders **one rail per child** at case grain. | A family-grain position does not exist in `process_instances`. |
| D-7 | Past stage entry times stay **absent** rather than being reconstructed from `mutation_events`. | `mutation_events` covers state, not every stage entry; reconstruction would be plausible and wrong. |
| D-8 | Staff relevance is **derived from assignments**; no stored child↔staff edge is created. | A stored edge would contradict `schedule_assignments` on every room change. |
| D-9 | New cross-grain projections attach as **optional top-level `OperationalContext` fields** (the `employment?` precedent), not as new members of `OperationalContextSignals`. | `signals` is documented as case-shaped; widening it would make `NOT_APPLICABLE_CASE_SIGNALS` lie. |
| D-10 | Absence-reason vocabulary stays code-owned for now (GAP-5). | Promoting it to a table is a schema decision. |

---

## 11. Platform gaps these cards expose

| # | Gap | Blocks | Shape of the fix |
|---|---|---|---|
| **GAP-1** | No document expiration model (`documents`, `document_versions`) | Health & Safety expiry, any renewal workflow | `valid_from`/`valid_until` on document versions + a configured doc-type policy |
| **GAP-2** | No registered action for child attendance | Check in / Check out / Mark absent / Correct | Register `attendance.record` + `attendance.correct` in **both** the RegisteredAction list and `capabilityRegistry.ts`, over the existing services |
| **GAP-3** | No family-grain financial state: balance, period, autopay, method health, subsidy, responsibility | The Billing card's entire financial-state half | A posted-balance projection + billing-period and payer entities. Large; out of scope here. |
| **GAP-4** | No durable stage-history store | Journey past-stage entry times, dwell time, true skip detection | An append-only `process_stage_transitions` row per entry/exit |
| **GAP-5** | Absence reasons are a code constant | Tenant-specific reason vocabularies | Promote `ABSENCE_REASONS` to an org-scoped table (the stored shape already permits it) |
| **GAP-6** | No milestone/journey fact adapters | Journey **and** the existing Milestones card | Write adapters for the eight registered types; register the first one |
| **GAP-7** | No waitlist offer entity | "Offer made", offer expiry | An offer entity with issue/expiry/response, or an explicit decision that offers stay operator-tracked |
| **GAP-8** | Expected time window lives in `schedule_patterns.metadata` and is absent from `ExpectedAttendanceEntry` | Attendance expected window at expectation grain | Widen `ExpectedAttendanceEntry` to carry the resolved window |

---

## 12. Explicitly unapproved for production integration

None of the following has been done, and none may be done from this mission:

- Adding any of the five keys to `FOCUS_PANEL_CARD_KEYS`
- Declaring any of them in `FOCUS_PANEL_CARDS` or in `SYSTEM5_CARD_ARCHETYPE`
- Adding any of them to `FOCUS_PANEL_CARD_CATALOG` (the Surfaces builder)
- Placing any of them in a Focus Panel composition or default grid
- Changing default runtime card ordering
- Removing `milestones` from the catalog (D-1 is a recommendation, not an action)
- Changing `billing_preview`'s scope (D-3 is a recommendation, not an action)
- Registering attendance capabilities (GAP-2)
- Any schema migration (GAP-1, GAP-3, GAP-4, GAP-5, GAP-7)
- Promotion to staging


---

## 13. Recommended final design, per card

Each recommendation names the card face (what an operator sees without opening anything), what
moves behind expansion, and the one rule that must not be relaxed in implementation.

### 13.1 Journey — *recommended*

**Face**: state chip · `Stage 4 of 5 — Enrolling` · `2 of 4 required items complete` · a WINDOWED
rail (current stage, at most two behind, one ahead; earlier collapse to `+N earlier stages`) with
each stage's two most recent anchored facts and its outcome · footer handoffs to open work and to
the full rail.

**Expanded**: the complete rail, every anchored fact, every outcome, the current stage's
requirement list.

**Do not relax**: no past-stage entry dates, ever. A `skipped` status is labelled as inferred.
One rail per child.

*Why this shape*: the window is what keeps a twelve-stage process from dominating a shared panel,
and the density check in the lab is the evidence — with the window, Journey is the same height as
Health & Safety and Billing; without it, it was half again taller than any peer.

### 13.2 Health & Safety — *recommended*

**Face**: attention chip · the safety-critical fact as the answer line · up to three health facts ·
a requirement checklist with resolved/unresolved/unmet marks · emergency-contact presence.

**Expanded**: every configured field, the document list, the full requirement checklist with
per-item handoffs.

**Do not relax**: severity is configured on the field, never inferred from free text. An unset
field is never rendered as a clinical negative. An unresolved requirement never counts toward the
attention number.

*Why this shape*: safety-critical information must survive the scan even when nothing needs
attention, which is why it takes the answer line rather than a chip.

### 13.3 Staff — *recommended*

**Face**: the primary person as the answer line, their position and room as support, `+N others` ·
configured groups with up to two people each.

**Expanded**: all groups, assignment type, room and effective window per person.

**Do not relax**: no stored child↔staff edge; relevance stays derived. `unresolved` and
"nobody assigned" are different renderings. No assignment editing — hand off to `scheduling`.

*Why this shape*: it reads as a sibling of Household and Children because the presentation is a
grouped person list, while the derivation stays honest about being a projection.

### 13.4 Attendance — *recommended*

**Face**: presence state as the answer line · check-in/check-out · the expected window when the
pattern configures one · the current week as a compact strip with `CORRECTED` / `NO CHECKOUT`
markers · the action row in its real geometry.

**Expanded**: week detail with rooms, absence reasons and correction markers.

**Do not relax**: corrections stay visible. The expected window is omitted when unconfigured and
never substituted with site operating hours. The ledger never enters the card.

*Why this shape*: it is the one card of the five that is an operational entry point, so the action
row is part of the face, not the expansion — which is exactly why GAP-2 blocks shipping it.

### 13.5 Billing — *recommended*

**Face**: `$1,250.00 due` when a balance exists, otherwise `Billing configured` / `Setup
incomplete` · tuition rate · the readiness marks · up to three recent charges with previews
marked · one footer action.

**Expanded**: full charge list, full readiness detail, placement facts.

**Do not relax**: an unresolved tuition rate produces no verdict. A `resolved_obligations` row is
always marked as a preview. No balance is aggregated that the platform has not posted.

*Why this shape*: it is the honest card Alloy can render today, and its evidence contract already
carries the financial-state shape so the future substrate is a producer change, not a redesign.

---

## 14. Evidence

Browser verification on the assigned slot, `http://localhost:3016/dev/operational-card-lab`:

| Check | Result |
|---|---|
| Route responds | HTTP 200 |
| Console errors | **0** |
| Failed requests | **0** |
| Journey stage rows rendered | 37 across 12 specimens |
| Attendance day rows rendered | 25 |
| Disabled attendance actions (GAP-2 shown, not called) | 14 |
| Brokered typecheck (`vac run typecheck`) | **rc=0** |
| Production files modified | **0** (`git status` shows only new paths) |

Screenshots — `qa/evidence/operational-card-lab/`, summary and expanded for each tab:

```
journey-summary.png      journey-expanded.png
health-summary.png       health-expanded.png
staff-summary.png        staff-expanded.png
attendance-summary.png   attendance-expanded.png
billing-summary.png      billing-expanded.png
panel-summary.png        panel-expanded.png
```

`panel-*.png` is the density check: all five cards in one grid, which is the question that
actually decides whether these can share a Focus Panel.
