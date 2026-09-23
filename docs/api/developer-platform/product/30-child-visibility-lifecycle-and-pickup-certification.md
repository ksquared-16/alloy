# Child visibility lifecycle, and the pickup hosted certification path

Post-closeout hardening, run `erun_8a0e1fa29eaa157a`. Thread 7 remains **CLOSED**; this run resolves
the two findings that hosted relationship-privacy certification recorded, and
retires the third as a no-op.

---

## Part 1 — Child visibility lifecycle

### 1A. The canonical states, measured

`child_enrollment_agreements.status` is constrained to five values. What each one MEANS was taken
from the only code that can write it, not from the name:

| Status | Written by | Service began? | Terminal? | Historical authority |
| --- | --- | --- | --- | --- |
| `pending_start` | `createChildEnrollmentAgreement` when `start_date > today` | No — future | No | Committed, not yet served |
| `active` | `createChildEnrollmentAgreement` when `start_date <= today` | Yes | No | In service |
| `ending` | `markAgreementEnding` (from `active` only) | Yes | No | In service, last day known |
| `ended` | `markAgreementEnded`, `transitionEndingAgreementsToEnded` | Yes | Yes | **Served and concluded** |
| `canceled` | `cancelAgreementBeforeStart` — **and nothing else** | **No** | Yes | **Withdrawn before service began** |

The decisive measurement: `cancelAgreementBeforeStart` raises `invalid_state` for any agreement whose
status is not `pending_start`. So `canceled` is not a general terminal state. It carries one provable
meaning — *committed, then withdrawn before a single day was served*. Nothing operational was ever
created under it.

`CHILD_ENROLLMENT_AGREEMENT_TERMINAL_STATUSES` groups `ended` and `canceled` together, which is
correct for lifecycle machinery and wrong for visibility: the two terminals differ on exactly the
fact visibility depends on.

### 1B. The law, and why not the others

**Chosen: a refinement of Model C — historical service continuity.**

> A child is externally visible when a service commitment exists at a reachable site that was not
> withdrawn before service began.

Mechanically `status <> 'canceled'`.

- **Model A (agreement existence)** is the measured defect. It republishes a family who signed and
  withdrew, indefinitely, with every relationship edge. Rejected on privacy.
- **Model B (current/future service)** drops `ended`. Attendance events, invoices and incident
  records already published by Alloy reference that child by id; a partner reconciling last term
  could no longer resolve who the id belongs to. It would orphan history Alloy itself emitted.
  Rejected on historical reconciliation.
- **Model C as literally stated** ("ever participated") excludes `pending_start`, which has not yet
  participated. Admitting a child only at midnight on their start date is a worse sync contract than
  admitting them on signature, and partners build rosters ahead of the first day. So `pending_start`
  is included — a commitment, not yet a participation.
- **Model D** was not needed: the canonical vocabulary already draws the line in the right place.

This was **not** chosen to match the existing copy. The copy said "children currently in service",
which is Model B; the chosen law contradicts it, and the copy was corrected to the law rather than
the reverse.

### 1C. Visibility can end — and it is observable, not silent

There is exactly one path: a `pending_start` agreement is cancelled. The child then leaves
`/api/v1/children`, their household leaves `/api/v1/households`, and their edges leave
`/api/v1/relationships`.

A partner learns this without any new mechanism:

- `child_enrollment_agreements` carries `trg_child_enrollment_agreements_updated_at`, so cancelling
  advances `updated_at`.
- `list_external_enrollments` applies **no** status filter, so the row remains readable and reads
  `status: canceled`.

Measured end to end on the certification stack, across separate transactions:

```
before cancel, child rows   : 1
after cancel, child rows    : 0
after cancel, household rows: 0
updated_at advanced         : t
enrollments since t0 (sync) : 1 status=canceled
```

So the agreement-grain resources were deliberately left unfiltered. Filtering `/enrollments` too
would have removed the only observable terminal signal and produced exactly the silent
disappearance this repair exists to prevent. **The person-grain resources carry identity and PII and
are governed by the law; the agreement-grain resources are the lifecycle record itself.**

### 1D / 1E. One law, not three filters

The predicate was physically duplicated in `list_external_children`, `list_external_households` and
`list_external_relationships` — and `list_external_relationships` carried a comment promising "the
edge is visible exactly when its CHILD is", a promise nothing enforced. Three copies drifting apart
is the shape of the defect itself.

`20261016150000_external_child_visibility_lifecycle.sql` replaces all three with one function,
`external_child_service_commitment_exists(org, child, boundary_mode, sites)`, and asserts in-migration
that each reader uses it and that none retains a private `FROM child_enrollment_agreements` lookup.
`/relationships` is **not** special-cased. Signatures are unchanged, so no grant, route or caller moves.

### Certification — `CHILD_VISIBILITY_LIFECYCLE_RESOLVED_CERTIFIED`

`web/tests/platform/external/childVisibilityLifecycle.live.test.ts`, over HTTP against real tokens:

| Case | children | households | relationships |
| --- | --- | --- | --- |
| `pending_start` | visible | visible | visible |
| `active` | visible | visible | visible |
| `ending` | visible | visible | visible |
| `ended` | visible | visible | visible |
| `canceled` | **absent** | **absent** | **absent** |
| cancelled at site A + active at site B | visible | — | — |
| same child, installation scoped to site A only | **absent** | — | — |
| cancel a `pending_start`, then sync | absent | — | `/enrollments` returns it, `canceled` |

18 assertions, all passing. Proven non-vacuous by planting `canceled: visible` — exactly three
assertions failed, one per resource. The suite creates its own sites after sharing the tenant's
raced `coreResources.live.test.ts` (an unfiltered enrollment count read larger when narrowed).

Regression: **416/416** across `tests/platform/external`.

---

## Part 2 — Pickup hosted certification path

### The two questions, separated

**Question 1 — does Alloy need an operator-facing governed workflow?**

For the pickup GRANT: **no, one already exists.** The previous run's finding ("no HTTP route, no
registered action and no operator UI writes `person_child_relationship_roles`") was wrong. Measured:

- `POST /api/admin/person-child-relationships/{id}/roles` → `addPersonChildRelationshipRole`,
  gated by `requireCrmPeopleCapability(ctx, CRM_CUSTOMERS_WRITE)`.
- `DELETE /api/admin/person-child-relationships/{id}/roles/{roleKey}` reverses it.
- A registered AdminV2 action `add_authorized_pickup` drives the same service from the focus panel.
- `authorized_pickup` is in `PERSON_CHILD_OPERATIONAL_ROLE_KEYS`, so it passes the write validator.

For the safeguarding RESTRICTION: **yes — this is a real product gap.**
`child_safeguarding_restrictions` has readers only. No HTTP route, no registered domain action, no
AdminV2 server action, no service function anywhere writes it. `pos/discovery/safeguardingConcepts.ts`
classifies a packet question into a restriction *kind* but is pure and does no I/O. The table's own
migration says the boundary is carried by "the propose-only command's type (which has no vocabulary
for activation)" and by `CHECK (status <> 'active' OR review_state = 'approved')` — and no code
supplies either half.

**Question 2 — does certification merely need a sanctioned fixture mechanism?**

No fixture capability was needed and none was built. The grant went through the canonical operator
workflow, which is first in the preferred order.

### 2D. Hosted proofs, on deployed staging

| Proof | Result |
| --- | --- |
| pickup **true** | **PASS** — role granted via `POST .../roles`, `GET /api/v1/relationships?child_id=…` returned `pickup_authorized: true` |
| restriction override → **false** | **BLOCKED** — no writer exists for `child_safeguarding_restrictions` |
| no safeguarding leak | **PASS** — non-empty payload (494 bytes, 1 row); none of 15 safeguarding terms present; `email`/`phone` keys absent, not null |
| boundary | **PASS** — North (child's site) 1 row; South 0; `locations` with an empty list 0 (fails closed); `org_wide` 1 |

The published key set was unchanged: `id, child_id, household_id, person_id, first_name, last_name,
relationship_type, priority, status, pickup_authorized`.

The override LOGIC is not uncertified — `coreResources.live.test.ts` proves it on the certification
tenant, which holds both hard shapes (a restriction naming a person, and one whose subject is free
text only, which must fail closed for every relationship on the child). What is missing is any way
to create that state on a hosted tenant.

**Outcome: `PICKUP_HOSTED_CERTIFICATION_PATH_RESOLVED` for the grant;
`SAFEGUARDING_RESTRICTION_WRITE_CAPABILITY_ABSENT` for the override** — a product gap, not a
certification-tooling gap, and deliberately not worked around.

### Staging restored

`authorized_pickup` removed via the canonical DELETE and verified through
`/api/admin/children/{id}/pickup-authority` (`listedForPickup: false`, roles back to `['guardian']`).
Certification credential revoked. Installation `alloy-cert-sandbox` returned to `org_wide`,
`grantedScopes: []`, still active.

---

## Part 3 — The retired `context.read` scope

Census `gar_d3ca8897a48bf5` against `alloy_deployed_primary`:

```
installations_total             : 2
installations_with_context_read : 0
active_with_context_read        : 0
```

No installation holds it. Removal is behaviourally a no-op regardless: `getContext` is declared
`{ scope: null }` — it requires a valid token and no scope, because a caller that cannot name itself
has nothing to report. `context.read` therefore never gated anything, which is why it is recognised
by `allKnownScopes()` for compatibility and refused by `allPublicScopes()` for granting.

**Decision: no cleanup, one-time or otherwise.** There is nothing to clean, and mutating
installations to remove an inert value would be change without consequence. The previous run's
400 refusal when restoring `["context.read"]` was correct behaviour with no side effect.

---

## Not done, deliberately

The product change is a **candidate**. It is not on staging and was not pushed. It narrows what the
public API publishes, so it needs explicit promotion authorization.

Classroom Coach provider mapping was not started.
