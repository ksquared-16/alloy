---
owner: sprint
status: active
sprint: enrollment-assignment-effective-dates
slot: 3
staging_base: 3195fae4a301e75cac43db934dcb163168e25674
last_reviewed: 2026-08-03
---

# Enrollment Assignment & Effective Dates — Current-State Audit

**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-enrollment-assignment-effective-dates`  
**Branch:** `agent/cursor/3-enrollment-assignment-effective-dates`  
**Port:** `3013`  
**Staging base SHA:** `3195fae4a301e75cac43db934dcb163168e25674` (verified clean, `0/0` vs `origin/staging`)

Authority is **code + migrations + `docs/platform/**`**. Sprint/archive docs are historical only.

---

## 1. Current authority map

| Concept | Current store | Grain | Authority today | Status vs mission |
|---|---|---|---|---|
| **Requested Start** | `process_instances.metadata.start_date` (primary); OCM `start_date` legacy; opp `metadata.desired_start_date` queue overlay | Child / process | Participation draft | Exists; labels still say “Desired” |
| **Enrollment Date** | Opp `metadata.enrollment_date` on `approve_enrollment`; optional person EAV `enrollment_date` | Opportunity / person | Approve-action stamp | **Wrong grain & wrong trigger** vs paperwork completion outcome |
| **Start Date (operational)** | Copied at materialization into agreement + placement + schedule_assignment `start_date` | Child / agreement | Materialization copy of participation (or **today** default) | **Not derived** from first committed assignment |
| **Requested days / week** | None first-class | — | — | **Missing** |
| **Preferred weekdays** | PI draft `metadata.weekdays` (pre-mat only) | Child / process | Participation draft | Partial |
| **Proposed schedule (intent)** | PI/OCM `schedule_type` (+ draft weekdays) | Child / process | Enrollment schedule doctrine | Exists |
| **Proposed assignment** | `schedule_assignments.commitment_kind = proposed` | Child / OA row | Assignment create / promote | Exists (OA foundation) |
| **Committed schedule** | `schedule_assignments.commitment_kind = committed` | Child / agreement | Promote / materialize | Exists |
| **Placement** | `child_placements` (`start_date`/`end_date`, supersede) | Agreement | Materialize + supersede service | Exists; inline post-mat edit can patch |
| **Agreement** | `child_enrollment_agreements.start_date` | Child / site | Materialize | Relationship fact, not paperwork date |
| **Tuition / estimate** | Live resolve from `commercial_tuition_rates`; BillingPreview display-only | Config / display | Commercial config | **No durable enrollment quote snapshot** |
| **Household primary** | `customer_persons` (`role_type=primary_contact`, `is_primary`); event `household.primary_contact_changed` | Household | `setHouseholdPrimaryContactForCustomer` | Complete writer; **Household card display-only** |

### Key runtime files

- Participation: `web/lib/process/processInstances.ts`, `applyChildParticipationEdit.ts`
- Materialize: `materializeEnrollmentFromProcessInstance.ts`, `materializeChildEnrollment.ts`
- Assignment: `operationalAssignmentService.ts`, `assignmentCreateAction.ts`, `assignmentPromoteProposedAction.ts`
- Schedule doctrine: `enrollmentScheduleDoctrine.ts`
- Enrollment date stamp: `executeApproveEnrollmentAction.ts`
- Cards: `SchedulingCard.tsx` (title **Assignments**), `ChildrenCard.tsx`, `HouseholdCard.tsx`, `ReadinessCard.tsx`, `BillingPreviewCard.tsx`
- Primary: `setHouseholdPrimaryContact.ts`, `patchHouseholdPrimaryContact.ts`, `PersonDrawerHouseholdSection.tsx`

---

## 2. Semantic conflicts

1. **One `start_date`, many meanings** — doctrine (`stage-membership-and-outcomes.md`) says participation `start_date` is requested at inquiry and becomes committed at approve. Mission requires **Requested Start** and **Start Date** to remain distinct. Resolve by: participation `start_date` = Requested Start forever; operational Start Date = resolver over first committed assignment (not a second participation column).
2. **Opp `desired_start_date` vs child `start_date`** — parallel opportunity metadata never renamed; queues still project it.
3. **Enrollment Date on opportunity / person EAV** — household/person grain; multi-child unsafe; not paperwork-completion outcome.
4. **Schedule intent vs proposed OA vs committed OA** — three layers exist; Children/Readiness often treat intent schedule as “has schedule.”
5. **Materialization default start = today** — can invent committed start never requested.
6. **Post-mat inline edit patches** placement/agreement without supersede — conflicts with effective-dating doctrine in planning docs.
7. **Stale schema CSV** — missing OA foundation / `commitment_kind` columns vs migrations.

---

## 3. Schema / runtime gaps (mission)

| Need | Gap |
|---|---|
| Enrollment Date from completion outcome | No process-grain stamp from configured paperwork completion; approve stamps opp metadata |
| Start Date from first committed assignment | No canonical resolver; starts copied at materialize |
| Requested days before exact weekdays | No `requested_days_per_week` on participation |
| Requested / proposed / committed separation | Partial (`commitment_kind` + intent); UI collapses |
| Assignment proposal readiness | Readiness factors are contact/program/schedule/start — not config-driven assignment composition |
| Quote snapshot without ledger | Billing preview is live resolve only |
| Household Make primary on card | Badge yes; mutation no |
| Config variance (room / quote acceptance) | Lifecycle requirements exist for program/schedule/start/classroom; no quote-acceptance or assignment-proposal composition contract |

---

## 4. Decisions (resolved from code + mission)

| # | Decision |
|---|---|
| D1 | **Requested Start** authority = `process_instances.metadata.start_date` (OCM fallback only when materialize fallback flag on). Never rewritten by commitment. |
| D2 | **Start Date** authority = earliest non-canceled **committed** `schedule_assignments.start_date` for the child subject; if none, fall back to live enrollment agreement `start_date` (materialized relationship without OA row). Canceled-before-effective rows do not qualify. Later supersedes do not rewrite the original Start Date (resolver uses earliest qualifying committed start; corrections require explicit correction path). |
| D3 | **Enrollment Date** authority = process-instance metadata `enrollment_date`, stamped when the tenant-configured paperwork-completion outcome confirms (outcome execution path). Opportunity metadata remains a **compat projection** only. Corrections require actor + reason + prior value + audit. Reopening paperwork does not silently rewrite; invalidation surfaces readiness gap unless an authorized correction runs. |
| D4 | **Requested days** = participation metadata `requested_days_per_week` (integer). **Preferred weekdays** = participation `weekdays` (existing draft key). Distinct from proposed/committed OA patterns. |
| D5 | **Proposed schedule / assignment** = OA `commitment_kind=proposed` (+ participation intent before OA exists). **Committed** = OA `commitment_kind=committed`. |
| D6 | **Quote/estimate** = new durable **assignment proposal snapshot** (not ledger). Smallest slice: immutable snapshot rows tied to child + proposal inputs + commercial offering version; states draft/generated/accepted/superseded as needed. No invoice/charge/payment. |
| D7 | **Household primary on card** = wire existing confirm modal + `patchHouseholdPrimaryContact` / domain writer. No new endpoint. |
| D8 | **Assignment card** = evolve existing Focus Panel `scheduling` card (operator title Assignments) into clear sections: Family request / Proposed / Commercial estimate / Committed / Readiness gaps — not a new card runtime. |
| D9 | **Readiness** = extend lifecycle requirement catalog + timing evaluation for assignment-composition factors; computed only; config chooses required composition. No hardcoded “assignment complete” rule name as sole gate. |
| D10 | **BOS** = reuse Command Runtime / same actions; no private BOS mutation path. Make-primary BOS slash adapter deferred unless trivial. |

---

## 5. Implementation slices

1. **Authority foundations** — resolvers + field ownership tests + doctrine note (Enrollment Date, Start Date, Requested Start).
2. **Requested care** — `requested_days_per_week` on participation; preferred weekdays reuse; participation edit + Children/Assignment display.
3. **Assignment proposal UX** — sectioned Assignments card model; proposed vs committed clarity; readiness gaps.
4. **BP readiness integration** — catalog + preflight for configurable assignment requirements; config variance proof.
5. **Enrollment Date outcome stamp** — outcome execution path + correction seam + tests.
6. **Quote snapshot** — minimal durable snapshot + tuition plan selection + immutability tests.
7. **Household Make primary** — Household card CTA + confirm + refresh + tests.
8. **Doctrine + handoff** — update platform docs where behavior changes; evidence pack; promotion notes.

---

## 6. Explicitly deferred

- Parent self-service assignment, capacity matching, room optimization, attendance generation
- Invoice / financial posting / payment / full proration / receivables
- Full parent quote negotiation lifecycle beyond durable snapshot + accept/supersede
- New scheduling or billing runtime
- BOS slash adapter for make_primary (Command Runtime already exists)
- Regenerating full schema CSV (note drift; regenerate in dedicated ops if needed)
- Fixing all post-mat in-place patch vs supersede inconsistencies beyond Start Date resolver rules

---

## 7. Active sibling sprints (do not touch)

Per `alloy-worker-status` at bootstrap: slots 1, 2, 5 occupied (`trust-runtime`, `conversation-platform`, `docker-stack`). Slot 3 owned by this sprint.
