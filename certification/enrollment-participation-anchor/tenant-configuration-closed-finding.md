# Firefly tenant configuration is correct. No correction is required.

**TENANT CONFIGURATION CORRECTION REQUIRED = NO.**

Closed against live deployed evidence on 2026-09-04, run `erun_c453711f012c010c`,
Director-confirmed on `erun_e68dc3ec03029b57`. This file exists so the question is not
reopened from repository evidence, which is what reopened it the last three times.

## What was measured

Firefly Early Learning, org `93667019-bd28-49b5-a688-acc9bb1e0a19`.

The earlier census org id `93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33` is **retired**. It does not
exist, shared only the first segment with the real id, and returned all-zero counts that read
convincingly as "this tenant has no configuration". Anything derived from it is void.

| | |
|---|---|
| Config authority | `PUBLISHED_REVISION_AUTHORITY` — 22 published revisions |
| Deployed revision | 22, id `9fe108a9…`, checksum `133137b3…` |
| Payload | 27211 bytes, 10/10 chunks, reassembly complete and valid |
| `validateBusinessProcessForPublish` | 0 errors / 0 warnings |
| `validateProcessExecutionGraph` | 0 errors / 0 warnings |

## The four hypotheses, each closed

**Stage grain drift — absent.** Every stage's metadata grain equals its operating-plan
`journey_segment`. `enrolling` is child/child. The drift the correction helper exists for is
in the repository fixture, not in the tenant.

**`closed_lost` — already canonical.** Represented through
`update_family_case_status {status closed, close_reason lost}`. No stage targets a
`closed_lost` stage, because no such stage is referenced anywhere in the payload.

**Family→child waitlist — no violation.** The family case never moves onto child `waitlist`.
The `decision` stage's `participant_decisions` are each declared `subject_grain: "child"` and
execute through `executeParticipantDecisionForChild`, which threads `journey_segment: "child"`
and excludes `update_family_case_status` from its target vocabulary by type. Canonical
`waitlist_child` behaviour already exists and is already configured.

**Waitlist exits — intentional.** `waitlist` has no outgoing transitions because the payload
declares `manual_status_transition_policy_v1.waitlist_as_parking_lot = true`, with mode
`operator_jump_with_preflight`. That is configuration, not debt. Adding a transition would
contradict a policy the tenant states explicitly.

## What this forbids

- Do not publish a new Business Process revision.
- Do not create revision 23 to restate revision 22.
- Do not modify `closed_lost`, `waitlist`, `enrolling`, or family→child routing.
- Do not generate a no-op publication migration.
- Do not spend a governed write to record no semantic decision.
- Do not run the correction helpers against Firefly.

The publication guards and correction helpers built during the investigation
(`correctEnrollmentStageGrainDrift`, `correctInvalidClosedLostTargets`,
`reassembleCensusPayload`) stay as platform durability. They are generally valid and
regression-clean. They have nothing to correct here.

## The one condition that reopens this

Later **live E2E evidence** contradicting revision 22. Repository fixture evidence does not,
and did not; that conflation is what produced the 9-errors-before figure that never applied to
the tenant.

Specifically: if Complete Enrollment cannot match `enrollment_complete` at runtime despite
revision 22 proving child-grain `enrolling`, the explanation is **not** configuration. Trace
the effective stage key, the plan lookup identity, the revision the executor resolved, the
process instance's config binding, and the outcome key the operator action presented. A
stale-versus-current revision mismatch is the next likely seam, and publishing a new revision
to change runtime lookup behaviour would be treating a symptom.
