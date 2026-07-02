# Enrollment Alignment Sprint — Implementation Plan

**Companion:** `enrollment_alignment_data_model_audit.md` (Part 8 table — the authoritative
decision record). This doc sequences the implementation.

Optimize for correctness, not backwards compatibility. Staging data is migrated, not preserved
in legacy shape.

## Frozen decisions

1. **Participation rename (Part 1).** Entity type `inquiry_child` → `enrollment_participation`.
   Table `opportunity_customer_members` unchanged. DB migration updates `field_definitions`,
   `field_values`, layout doc refKeys (`inquiry_child.*` → `enrollment_participation.*`);
   runtime alias maps old refKeys for any unmigrated stored docs. Operator language: "Enrollment",
   never "Inquiry". Status key `new_inquiry` disappears with the status collapse (below).

2. **Canonical fields (Part 2).** OCM column + field-key renames:
   - `desired_start_date` → `start_date` (label "Start date")
   - `desired_schedule_type` → `schedule_type` (label "Schedule")
   - `desired_program_category_id` → `program_category_id` (label "Program")
   - `desired_program_type` → **dropped** (backfill `program_category_id` from the text key per
     location before drop). Stage `requirement_policy` owns requiredness/interpretation.

3. **Status collapse (Part 3).**
   - Case (`opportunities.status_key`): `open` | `closed`; new `close_reason_key` column
     (`lost` | `withdrawn` | `not_a_fit` | `aged_out` | `other`).
     Migration map: all non-terminal legacy keys → `open`; terminal keys → `closed` + reason.
   - Child (`OCM.outcome_status_key`): `null` | `waitlisted` | `enrolling` | `enrolled` |
     `withdrawn` | `not_enrolling`; new `close_reason_key` column.
     Migration map: `offer_pending`/`waitlist_paused` → `waitlisted` (pause lives on placement
     candidate); `registration_pending`/`paperwork_pending`/`start_date_scheduled` → `enrolling`;
     `family_withdrew`/`not_moving_forward`/`aged_out`/`not_enrolling` → `not_enrolling` + reason;
     `withdrawn` stays `withdrawn`; `new_inquiry` → `null`.
   - `status_definitions` reseeded to the collapsed vocabulary; removed keys deleted.
   - Guard: tour-domain statuses on `tour_bookings` are facts about tours — untouched.

4. **Stage as explicit process state (Part 4).** New columns `opportunities.stage_key` and
   `opportunity_customer_members.stage_key`. Written only by outcome execution
   (`move_to_stage` target persists it) and intake (initial stage). Backfilled from the legacy
   status → stage map at migration time. Stage membership = `stage_key` equality; the
   status-derived stage bindings module is deleted.

5. **Membership single-owner (Part 5).** `queue_membership_v1` keeps subject grain +
   location scope but loses `included_status_keys`/`included_disposition_keys`; membership is
   `stage_key`-based (`membership_criteria_v1`). Work-unit `queue_definition` stage lanes are
   derived from stage membership at template/save time — never authored as independent status
   filters. `enrollmentProcessStageBindings.ts` (drifted duplicate) is deleted.

6. **Work Views (Part 6).** Already lens-only. Update the condition field registry: `stage`
   becomes a first-class filter field; status filter options come from the collapsed vocabulary.

7. **Actions (Part 7).** Operator-exposed actions are domain verbs only: `schedule_tour`,
   `waitlist_child`, `enroll_child`, `mark_enrolled`, `withdraw_child`, `close_lead`.
   The generic `update_status` action is removed from operator surfaces/registry exposure;
   the typed execution-runtime status domains remain the internal mutation mechanism invoked
   by outcome rules and domain actions.

8. **Default process (Part 9).** Family: `lead` → `tour` → `decision` ("Placement / Decision")
   → `closed`. `qualification` stage removed; its work templates (contact family, qualify fit)
   move into `lead`. Child: `waitlist` → `enrolling` → `enrolled` → `closed_withdrawn` (branch
   at `decision` via split rules, unchanged). Stage operating plans updated so every active
   stage answers "what work lives here?".

## Deferred (explicitly out of this sprint)

- Dropping `opportunities.tour_date` / `tour_status` / `tour_time` columns (duplicate of
  `tour_bookings` truth). Removed from field catalog/pickers now; physical drop after verifying
  no external consumers.
- Physical drop of legacy text `status` columns (Phase 5/6 canonical-data-system item, already
  planned there).
- Placement candidate `offer` work-item modeling beyond status collapse (offers continue via
  existing waitlist offer flow).

## Sequence (each slice = one commit, tree green after each)

1. **S1 — Audit + plan docs** (this commit).
2. **S2 — Canonical fields**: migration + full code/test sweep for the three renames + drop.
3. **S3 — Participation rename**: entity type + registry/module/refKey rename sweep.
4. **S4 — Status collapse + stage_key**: migration, vocabulary, stage pointer, outcome executor
   persists stage, membership criteria, delete stage bindings + queue status filters.
5. **S5 — Work Views + Actions alignment.**
6. **S6 — Default process template + operating plans (qualification removal).**
7. **S7 — Doctrine doc updates** (`canonical-status-architecture.md`,
   `business-process-system.md`, `status-and-state-system.md`, entity spec terminology,
   new stage-membership doctrine section).

Verification per slice: `tsc --noEmit` + targeted vitest; full vitest before push.
