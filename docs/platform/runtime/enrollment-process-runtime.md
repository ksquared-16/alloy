# Enrollment Process Runtime — canonical architecture

Status: **implemented + verified on staging (PR #72).** This is the authoritative reference for how
Enrollment runs at runtime. Where any other doc disagrees about ownership, this doc wins.

Enrollment is the **reference implementation** of the generic platform pattern
**Business Process → Process Instance → Stage → Work → Outcome → Materialization → Durable Operational
Facts → Attendance / Billing / Scheduling.** Nothing here is enrollment-specific except the durable-fact
tables.

---

## Canonical ownership chain

```
Business Process        (config: stages, work templates, outcome rules)
      ↓
Process Instance        (the running journey — process_instances)
      ↓
Stage                   (process_instances.stage_key — position in the workflow)
      ↓
Work                    (tasks attached to the instance)
      ↓
Outcome                 (outcome execution moves the instance: stage_key / state)
      ↓
Materialization         (on the "enrolled" outcome — produces durable facts)
      ↓
Durable Operational Facts
   child_enrollment_agreements   (durable relationship)
   child_placements              (program / room / site — operational fact)
   schedule_assignments          (schedule pattern — operational fact)
      ↓
Attendance / Billing / Scheduling   (consume the durable facts — NEVER the process instance)
```

Three axes never collapse into one status model:
- **Process stage** (`process_instances.stage_key`) — where in the workflow.
- **Process state** (`process_instances.state`) — the journey's disposition (waitlisted / enrolling / …).
- **Operational status** (`child_enrollment_agreements.status`) — the durable relationship (pending_start /
  active / ending / ended). Downstream reads this, never the process instance.

---

## Role definitions

| Concept | Role | Table |
|---|---|---|
| **Lead / Opportunity** | **Context** — the acquisition case the journey runs in | `opportunities` |
| **Child** | **Subject** — the durable person the journey is about | `customer_members` |
| **Process Instance** | **Journey** — one child moving through Enrollment on one lead | `process_instances` |
| **Enrollment Agreement** | **Durable relationship** — is this child enrolled, active period, site | `child_enrollment_agreements` |
| **Placement** | **Operational fact** — program / room / site (effective-dated, supersedable) | `child_placements` |
| **Schedule Assignment** | **Operational fact** — schedule pattern (effective-dated, supersedable) | `schedule_assignments` |
| **OCM** (`opportunity_customer_members`) | **Legacy compatibility only** — not a runtime owner | `opportunity_customer_members` |

`process_instances`: `process_key='enrollment'`, `subject_type='child'` → `customer_members.id`,
`context_type='opportunity'` → `opportunities.id`, `stage_key`, `state`, `close_reason_key`, `metadata`
(participation draft facts pre-materialization). Unique `(org_id, process_key, subject_id, context_id)`.

---

## Runtime responsibility — who owns what

| Responsibility | Owning runtime | Notes |
|---|---|---|
| **Create Lead** (admin + BOS/Action-UI) | `runRegisteredAction("create_lead")` → `executeCreateLeadAction` → `applyCreateLeadChildParticipation[FromIdentity]` | One shared runtime, no forked path. Creates `opportunities` (status_key=open, stage_key=lead) + one `process_instance` per child with participation in `metadata`. **Writes no OCM.** |
| **Waitlist** | outcome executor → `ensurePlacementCandidateForWaitlistedChildBySubject` | Builds `placement_candidates` from process-instance / child-subject scope (`customer_member_id`, `opportunity_customer_member_id = null`). **No OCM.** |
| **Enroll** | outcome executor `update_child_enrollment_status` (disposition `enrolled`) | Sets `process_instances.state='enrolled'`, then triggers materialization (flag `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED`). |
| **Materialization** | `materializeEnrollmentFromProcessInstance` → `applyChildEnrollmentMaterialization` | Idempotent. Facts from `process_instance.metadata` → `placement_candidates` → opportunity defaults. Produces agreement + placement + schedule assignment. Stamps `enrollment_agreement_id` provenance back on the instance. |
| **Focus Panel display** | `opportunityEntityRecord` overlays | Priority **durable (materialized) > process-instance draft (pre-mat) > OCM (legacy)**. Never shows "Enrollment Status" wording. |
| **Operational Read Model** | `operationalEnrollmentReadModel` (`buildOperationalEnrollmentReadModelFor{Agreement,MemberSite}`) | The durable-fact reader for surfaces once materialized. |
| **Participation edit** | `applyChildParticipationEdit` (`POST /api/admin/child-participation`) | Pre-materialization → `process_instances.metadata`; post → durable model. **Never creates/writes OCM.** |
| **Work Views (child-grain)** | `childGrainProcessInstanceQueue` / `ocmEnrollmentTrackQueueBuilder` | Read `process_instances` first; OCM fallback for legacy rows only. |

The **Process Instance never becomes the source of operational truth.** It owns the journey and, on the
enrolled outcome, *creates or updates* the durable facts; the **Agreement** is the source of truth
thereafter.

---

## Deferred / Intentional Legacy

OCM (`opportunity_customer_members`) is **retained for compatibility** and is **not dropped**. The
following are intentional and not merge blockers:

- **Form-intake still creates OCM.** `lib/forms/intake/applyIntakeChildToOpportunity.ts` writes an OCM row
  and does **not** create a process instance. Separate capability; next migration is to make intake create
  a process instance (as admin Create Lead does).
- **OCM fallback reads.** The Focus Panel durable/draft overlays and Work-View readers fall back to
  OCM-derived values for pre-existing records with no process instance / agreement.
- **Flag-gated materialization fallback.** `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK=1` lets
  materialization read OCM for old data. Off by default; new leads never read OCM.
- **OCM table retained.** Dropped only in a later slice **after** form-intake is migrated and legacy
  fallbacks are no longer needed.

**Planned removal path:** migrate form-intake → process instance → backfill agreements from remaining OCM →
remove fallback reads → drop `opportunity_customer_members`.

---

## Migrations (applied to staging, ledgered)

- `20260713000000_process_instances` — primitive table + indexes + RLS
- `20260713000100_process_instances_backfill_from_ocm` — backfill (no-op on empty OCM)
- `20260714000000_placement_candidate_identity_allow_customer_member` — a real placement candidate is valid
  with `customer_member_id` OR OCM id (unblocks OCM-free waitlist; synthetic rule + existing OCM rows
  unchanged)

Verified end-to-end on staging via `web/scripts/verifyBosCreateLeadEnrollment.ts` (self-cleaning): BOS/direct
share one runtime; opportunity/PI/no-OCM; Focus Panel pre-mat + durable reads; waitlist candidate without
OCM; enroll → agreement + placement + schedule assignment; sibling independence.
