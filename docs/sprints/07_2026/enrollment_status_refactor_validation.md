# Status Refactor Completion + Operational Validation

**Branch:** `claude/enrollment-refactor-alignment` (PR #66) — validation pass on top of the shipped refactor.
**Method:** static code + data-model audit with file:line evidence (5 parallel audits) + read-only inspection of reachable local Postgres. The live app stack is **not runnable in this sandbox** (no `.env`/Supabase config, `supabase/config.toml` absent, Supabase API `:54321` down, no Docker), so the Phase 6 acceptance test is delivered as an executable harness + procedure, not an in-sandbox run. See "Environment feasibility" below.

The four things this validation set out to verify:
1. The data model is actually refactored — **YES** (Phases 1–2).
2. The vocabulary in code is aligned — **MOSTLY**, with fixable gaps (Phase 0).
3. Create Lead works end-to-end — **writes are correct; membership lanes need the stage cutover** (Phases 4–5).
4. Dev environment is clean/trustworthy — **YES except one auto-seeding migration** (Phase 3).

---

## Phase 1 — Child Inquiry elimination: CONFIRMED

No `child_inquiry`/`inquiry_child` table ever existed. Child participation is entirely
`opportunity_customer_members` (OCM); child status derives from `OCM.outcome_status_key`; Create
Lead writes OCM (`createLeadChildOcmPersistence.ts`), not any inquiry concept. **Zero active runtime
dependency on an inquiry model.** Remaining references are nominal only:

| Remnant | Classification |
|---|---|
| `INQUIRY_CHILD_ENTITY_TYPE = "inquiry_child"` (field-config entity_type) | Required compat — rename to `enrollment_participation` deferred (documented) |
| `inquiry_child.*` layout refKeys | UI field aliases for OCM columns |
| `child_inquiry.*` refKeys | Legacy, alias-on-read only, **rejected on write** |
| `opportunity_inquiry_child` drawer source | Navigation marker, not a data entity |
| `_inquiry_children` projection array | Denormalized OCM projection; phase-6 TODO to switch to OCM join |

---

## Phase 2 — Status set: DB collapsed, code partially out of sync

The migration `20260711000100` deleted all 26 old status keys from `status_definitions`, backfilled
`stage_key` + `close_reason_key`, and seeded the collapsed vocabulary. The canonical vocabulary source
(`enrollmentProcessStatusVocabulary.ts`) is correct. **But active code still writes deleted keys** —
runtime `assertAllowedStatusKey()` rejects them, so those paths fail. Full old→new table:

### Family / case (`opportunities.status_key`) — 13 → 2

| Old key | New status | Stage | close_reason | Action |
|---|---|---|---|---|
| new_inquiry, needs_qualification | open | lead | — | code fix |
| qualified | open | tour | — | code fix |
| tour_requested, tour_scheduled, tour_completed, tour_no_show | open | tour | — | code fix |
| decision_pending | open | decision | — | code fix |
| lost | closed | closed | lost | code fix |
| withdrawn | closed | closed | withdrawn | code fix |
| not_a_fit | closed | closed | not_a_fit | code fix |
| aged_out | closed | closed | aged_out | code fix |
| not_enrolling | closed | closed | other | code fix |

### Child (`OCM.outcome_status_key`) — 13 → 5

| Old key | New status | Stage | close_reason | Action |
|---|---|---|---|---|
| (null) | null | (family track) | — | OK |
| waitlisted | waitlisted | waitlist | — | OK |
| offer_pending | waitlisted | waitlist | — | code fix |
| waitlist_paused | (→ placement_candidates.status=paused) | waitlist | — | migration handled |
| enrolling | enrolling | enrolling | — | OK |
| registration_pending, paperwork_pending, start_date_scheduled | enrolling | enrolling | — | code fix |
| enrolled | enrolled | enrolled | — | OK |
| withdrawn | withdrawn | closed_withdrawn | withdrawn | OK |
| family_withdrew | not_enrolling | closed_withdrawn | family_withdrew | code fix |
| not_moving_forward | not_enrolling | closed_withdrawn | not_moving_forward | code fix |
| aged_out | not_enrolling | closed_withdrawn | aged_out | code fix |
| not_enrolling | not_enrolling | closed_withdrawn | other | OK |

### Acceptance-criteria assessment
| Criterion | Verdict | Note |
|---|---|---|
| No duplicate status model | PASS (schema) | status_definitions holds only canonical keys |
| Status ownership clear | PASS | durable status + close_reason + persisted stage_key |
| Work Views filter canonical keys | PARTIAL | Work-view *evaluator* supports canonical `opportunity_stage`; the seeded default lanes/queue definition still filter old status (see Phases 4–5) |
| UI renders configured labels | FAIL (3 spots) | raw `status_key` in AdminEntityDrawerLegacy — **fixed in S8** |
| Raw keys never in UI | FAIL → fixed | same 3 spots |
| Create Lead correct initial status | PASS | `status_key="open"`, `stage_key="lead"`, child `outcome_status_key=null`, `stage_key=null` |

---

## Phase 0 — Vocabulary audit

Most `inquiry`/`pipeline`/`enrollment_status` terms are acceptable legacy-compat / internal keys /
migration history. Active-code violations found (all addressed in S8 or documented):
- **Raw `status_key` in UI** — `AdminEntityDrawerLegacy.tsx` (~14377, ~14866, ~15430). **Fixed (S8).**
- **Active code writing deleted status keys** (`applyEnrollmentPacketBusinessProcessIntegration.ts`,
  `opportunityRecordActionMap.ts`, operating-plan outcome rules). **Fixed (S8).** — see Phase 2.
- `enrollmentPipelineQueueDefinitionV1/V2.ts` hardcode old status keys — **documented follow-up** (see below).

---

## Phases 4–5 — Create Lead → Work View pipeline

Traced entry (`entryLifecycleActions.executeCreateLeadAction`) → opportunity write
(`status_key="open"`, `stage_key="lead"`) → OCM write (`outcome_status_key=null`, `stage_key=null`) →
work-unit binding → projection (`enrichRowsWithDerivedStage` reads persisted `stage_key` → sets
`lifecycle_stage_key`) → work-view evaluator (`opportunity_stage` reads `lifecycle_stage_key`) →
refresh/invalidation (opportunity + work_unit targets) → drawer (loads by id, not gated on work_unit).

**Working hops:** DB writes, projection enrichment, work-view evaluator support for `opportunity_stage`,
refresh targets, drawer open. **Create Lead itself is correct.**

**The gap:** two membership paths exist —
- **Builder path** (`queueMembershipRuntimeResolver`, active when dept has `tracks_v1` + the
  `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER` flag): S4 made the child-track query filter by `stage_key`,
  and the work-view projection is stage-based. This path is correct.
- **Legacy queue definition** (`enrollmentPipelineQueueDefinitionV2.ts`): lanes still filter old
  `case_status`/`child_lifecycle_status` values (`new_leads` on `[new_inquiry,open,new]`, `tours` on
  `[tour_scheduled]`, etc.). Post-collapse every open case is `open`, so status can no longer separate
  lead/tour/decision, and the tour/follow-up lanes filter on deleted keys → empty.

**Consequence:** where the legacy queue definition drives a lane, new leads either don't separate by
stage or land in an empty lane. The correct fix is to cut those lane filters over to `stage_key` (see
follow-up). Whether this is an active outage depends on the feature flag / which path a given org's
department resolves — which is exactly what the Phase 6 acceptance test on a live stack settles.

---

## Phase 3 — Dev environment / seed sources

- **Chen Family** → `seedEnrollmentPipelineDemoData.ts:394`; **Case** (child "Case Stale") → line 421.
  Both only via **explicit** `npm run dev:seed:enrollment-demo-data`, which deletes its own tagged rows
  then re-inserts — so manually-deleted records reappear on the next run.
- **The one automatic business-data insert:** migration
  `20260423143000_opportunity_identity_seed_childcare_org.sql` inserts a Rivera family on
  `supabase db push`, gated to the hardcoded staging org `7803388d-…`. This is the only source that
  violates "every record exists because the app created it." **Recommendation:** convert it to an
  explicit dev seed command (it is business data, not config; it does not belong in an always-applied
  migration). Everything else (all `seed*`/`demo:*`/`dev:tenant:childcare`) is behind explicit commands;
  **zero automatic startup seeders.**
- Note: `seedEnrollmentPipelineDemoData.ts` still seeds `status_key: "new_inquiry"` (collapsed away) —
  seed scripts need status alignment (tracked with the follow-ups).

---

## Environment feasibility (Phase 6)

The reachable local Postgres has no current-schema Alloy dev DB: `daycare_manager` is empty;
`alloy_p2_50983` is a 12-table skeleton (`opportunities` has only `id, org_id, customer_id`, 0 rows, no
`stage_key`/`status_key`). The real dev DB (full schema + Chen/Case + reappearing records) is a Supabase
instance not reachable here, and the app has no env/Supabase config in this checkout. So the live 10-step
acceptance test cannot be executed in this sandbox. The harness + procedure to run it on your stack is in
`enrollment_operational_acceptance_test.md`.

---

## Fixes applied in this validation pass (S8)

See the S8 commit. Summary: rewrote every active code path that wrote a deleted status key to use the
canonical key + `close_reason_key` (+ `move_to_stage` where position changes) — stage operating-plan
outcome rules, `opportunityRecordActionMap`, `applyEnrollmentPacketBusinessProcessIntegration`; removed
the dead `NEW_LEAD_STATUS_KEY`; and replaced raw `status_key` rendering in `AdminEntityDrawerLegacy` with
resolved labels.

## Required follow-ups (need the live stack or are broader slices)

1. **Cut legacy queue-definition lanes to `stage_key`** (`enrollmentPipelineQueueDefinitionV2.ts`,
   `enrollmentPipelineQueueDefinitionV1.ts`, any seeded default `work_views_v1` filtering on
   `opportunity_status`). Lanes: new_leads→stage `lead`, tours/follow-up→stage `tour`,
   waitlist→child stage `waitlist` (candidate grain keeps active/paused), enrolling→child stage
   `enrolling`, enrolled→child stage `enrolled`, closed→`status_key=closed`. Validate on a live stack
   because which path is active is org/flag-dependent.
2. **Gate migration `20260423143000`** (Rivera auto-seed) behind an explicit dev command.
3. **Align seed scripts** (`seedEnrollmentPipelineDemoData.ts` etc.) to write canonical `open`/`stage_key`.
4. Nominal: `inquiry_child` → `enrollment_participation` entity-type rename;
   `update_enrollment_status` transition-modal subsystem; orphaned `process_stage_key` builder config
   (all from the PR #66 closeout).
