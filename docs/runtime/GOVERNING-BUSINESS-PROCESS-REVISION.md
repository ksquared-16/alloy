# The governing Business Process revision (D-96 / D-97)

**Status:** implemented. Enrollment Phase 2, slice 2.2b.

## The question this answers

> A family is part-way through Enrollment. An operator publishes a new Business Process
> configuration. Which configuration governs that family?

Before this slice the answer was "whichever one is live right now". A running
`process_instance` resolved everything — stage list, requirements, operating plan, action
catalog — from `departments.metadata.lifecycle_builder_v1`, the projection that publishing
replaces wholesale. So an operator publishing a change silently re-judged in-flight work
against configuration that did not exist when that work was done.

The answer now: **the revision the journey started under**, and it cannot move.

## Two decisions, and why they are inseparable

### D-97 — a published revision must be a self-contained executable artifact

Pinning a journey to a revision is only worth anything if the revision can answer on its
own. It could not. Phase 1 (D-88..D-92) gave a stage a canonical `requirements_v1`, but a
stage never authored canonically published with **no** section at all — so answering "what
did this revision require?" still meant reading live department metadata, which is not
versioned, not immutable and not CAS-protected.

Publishing now normalizes first:

```
  stage.requirements_v1 present ──► preserved EXACTLY (authored-empty included, D-90)
  stage.requirements_v1 absent  ──► the ONE legacy projection is materialized into it
```

Presence is tested with the resolver's own test — `parseStageRequirementsV1(...) !== null` —
so normalization and resolution can never disagree about the same stage.

**Why TypeScript and not the publish RPC.** `publish_business_process_revision_v1` inserts
`v_draft.payload` verbatim. Normalizing inside it would require a second copy of the legacy
projection written in PL/pgSQL, which is exactly the second authority D-92 exists to
prevent, and the checksum the caller already computed would no longer describe the payload
that was stored — breaking publish CAS and republish idempotency. So the draft payload is
normalized, persisted under a `draft_revision` CAS, and then checksummed.

**Republishing unchanged configuration stays a no-op.** Materialized requirement ids derive
from the rule id, with no clock and no randomness, so the payload is byte-identical and the
RPC's already-published branch still fires.

### D-96 — every new running instance pins one immutable governing revision

`process_instances.business_process_revision_id`, nullable, FK to
`business_process_revisions` with `ON DELETE RESTRICT`.

| Invariant | Enforced by |
| --- | --- |
| Same org | trigger (`business_process_revisions` has no unique key on `(id, org_id)`) |
| Revision configures this `process_key` | trigger, reading the payload's `processes[].key` |
| No repoint once set | trigger |
| No clear to NULL once set | trigger |
| Revision undeletable underneath a journey | FK `RESTRICT` + the shared immutability guard |

The process-identity check **fails closed**. An instance pinned to configuration that cannot
govern it *looks* governed while every stage lookup silently returns nothing — worse than
being unpinned.

Clearing to NULL is refused because a cleared NULL and a historical NULL would be
indistinguishable. One means "this journey never had a governing revision"; the other would
mean "it had one and we lost it", and it would silently drop the instance back onto live
configuration.

## What is NOT done, deliberately

**No backfill.** Historical instances stay NULL. Which revision governed a journey that
started before revisions existed is not derivable — publications carry no per-instance
history — so writing a plausible id would fabricate a governance record. NULL is a real and
permanent state, handled by exactly one centralized compatibility branch.

**No requirements-only pinning.** Pinning the requirement set while the stage list,
operating plan and action catalog still came from live metadata would be split-brain: one
journey governed by two configurations that no publish keeps in step. This is why the pin is
a whole-revision reference.

**No copy.** The pin is a reference. Copying configuration onto the instance would create a
second authority that could drift from the artifact it was copied from.

## The one owner

`lib/process/resolveProcessInstanceConfiguration.ts` writes this branch, and nothing else may:

```
  process_instance.business_process_revision_id
       │ non-null ──► business_process_revisions.payload   (immutable, self-contained)
       │ null     ──► departments.metadata.lifecycle_builder_v1   (compat only)
```

A pinned instance whose payload cannot be read is **not** downgraded to live configuration.
The row is FK-backed and undeletable, so an unreadable payload means the artifact is wrong —
and quietly serving live configuration would hide that behind a journey silently changing
which rules govern it.

## Class A vs Class B

**Class A — transaction-governing.** Reads the configuration that governs one running
journey. Must not drift when someone publishes. Today: the Current Work slice, threaded
through `resolveOpportunityStageWorkSlice`'s `processInstanceId`.

**Class B — current configuration.** Builder authoring, form coverage, latest-config
discovery. These answer "what does this configuration say NOW?", not "what governs some
particular child?", and they deliberately keep reading the live projection. They pass no
governing payload.

## Where the pin is applied

`createEnrollmentProcessInstance` is the sole production creator, so the pin is applied
there and its three callers — `startEnrollmentService`, `createLeadChildOcmPersistence`, the
Processing identity `ports` — inherit it without passing anything.

It rides the creating INSERT. There is no create-then-patch: an instance that exists unpinned
for even one statement resolves live configuration in that window, and the database refuses
the repoint that a patch design would depend on.

Resolution refuses to guess. Zero published Enrollment configurations, or two departments
each publishing one, produce an explicit outcome and a warning rather than a silent NULL or
an arbitrary pick — the pin is immutable, so a wrong guess would be unfixable.

## Known narrowing

A legacy display-only requirement label that maps to no catalog rule id cannot be
materialized, because only rule ids carry an identity a canonical requirement can reference.
It was already inert before this slice — `effectiveFieldRulesForStage` yields no rule for it,
so nothing evaluated or enforced it — but after publication it also stops being displayed.
The remedy is authoring the requirement canonically, which is the point of D-88.

Recorded as a passing test rather than a footnote:
`tests/lifecycle/publishedStageRequirementsSelfContainment.test.ts`.

## Evidence

| Claim | Proven by |
| --- | --- |
| P1–P5 publication self-containment | `tests/lifecycle/publishedStageRequirementsSelfContainment.test.ts` |
| Pin rides creation; one owner; Class A governed, Class B current | `tests/lifecycle/processInstanceRevisionPin.test.ts` |
| Tenant + process identity, immutability, FK semantics, publish/rollback | `certification/process-instance-revision-pin/` (24 real-Postgres assertions, in the Trust DB chain) |

Trigger-made claims live in the database suite on purpose: a refusal is only evidence when a
real database does the refusing.
