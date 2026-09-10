---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — 14-domain mutation authority map

For each domain: who owns the canonical mutation, what an external client would
have to invoke, and what blocks that today. Labels are assigned against the
Thread 3 vocabulary. **No domain earned `PLATFORM_INTERNAL_STABLE`.**

| # | Domain | Label | Canonical invocation, if any |
|---|---|---|---|
| 1 | Identity | `CANONICAL_COMMAND_CANDIDATE` | `POST /api/admin/processing/cases/[caseId]/identity/plan` → `/approve` → `/execute`. **Merge does not exist — do not expose one.** |
| 2 | People / households / children | `UNSAFE_OR_AMBIGUOUS` | Nothing recommendable. |
| 3 | Enrollment | `CANONICAL_COMMAND_CANDIDATE` *(status only)* | `update_child_enrollment_status` / `enroll_child` via the action facade. Placement/schedule/participation have no authority. |
| 4 | Process / stage / outcome | `UNSAFE_OR_AMBIGUOUS` | Config publish is safe; `update_lead_status` is correct in shape but is one of nine writers. |
| 5 | Communications | `UNSAFE_OR_AMBIGUOUS` | `POST /api/admin/communications/send` only. |
| 6 | Documents / forms | `NO_EXTERNALIZABLE_AUTHORITY_YET` | Participant token routes are sound; operator side has eight `documents` writers. |
| 7 | Attendance | `CANONICAL_COMMAND_CANDIDATE` | Eight `attendance.*` keys. **The strongest authority in the codebase.** |
| 8 | Scheduling | `UNSAFE_OR_AMBIGUOUS` | Nothing. Nine paths reach the same state. |
| 9 | Financials | `CANONICAL_COMMAND_CANDIDATE` | `charge.add` / `post` / `reverse` — **conditional on adding a permission check.** |
| 10 | Payments | `CANONICAL_COMMAND_CANDIDATE` | `payment.record` / `refund` / `collect_card` — same caveat. |
| 11 | Subsidy / funding | `CANONICAL_COMMAND_CANDIDATE` | Any `subsidy.*` key. Already permission-gated. |
| 12 | Work items | `CANONICAL_RESOURCE_MUTATION_CANDIDATE` | `POST /api/admin/operational-tasks`. Work units: `NO_EXTERNALIZABLE_AUTHORITY_YET`. |
| 13 | Configuration | `UNSAFE_OR_AMBIGUOUS` | Business-process publish only. |
| 14 | Access / identity (authz) | `CANONICAL_RESOURCE_MUTATION_CANDIDATE` | Four RPCs behind capability-gated routes. **Zero audit is disqualifying for `PLATFORM_INTERNAL_STABLE`.** |

Distribution: 5 command candidates, 2 resource-mutation candidates,
6 unsafe/ambiguous, 1 no-authority-yet, **0 platform-internal-stable**.

## What the ready domains have in common

Attendance, subsidy, payment posting, business-process publish, enrollment
status and identity-commit share four properties:

1. **One ingestion function.** Attendance has exactly one — RPC
   `record_child_attendance_event`, called from exactly one TypeScript site
   (`web/lib/childcareOperational/attendance/attendanceService.ts:162`), whose
   comment states why: *"A direct table insert here would reintroduce the
   check-then-insert race the RPC exists to remove."*
2. **A database rule the application cannot talk its way past.** Attendance is
   append-only by trigger for **all roles including `service_role`**
   (`20260629120000_childcare_attendance_facts_p2.sql:127`). Payments are
   immutable by trigger (`20260909150000:42`), whose header states the case
   exactly: *"a check that lives only in one handler is a check the next handler
   does not have."*
3. **Server-derived provenance the caller cannot assert.**
4. **Idempotency anchored on something that is genuinely one event.** Payments
   anchor on the processor attempt — deliberately not the Stripe event id and
   not the browser request id (`canonicalPosting.ts:15`).

Where a domain has three of the four, the missing one is almost always
authorization.

## Three findings that block externalization on their own merits

### F-1 — `POST /api/admin/workflows/[id]/run` takes tenancy from the request body

Verified end to end at `f27347f45`:

1. `web/app/api/admin/workflows/[id]/run/route.ts:30` calls
   `executeWorkflowRun(supabase, workflowId, eventPayload)` with **no org
   argument**; `eventPayload` is taken verbatim from the body. The
   `assertRowOrg` check immediately above validates that *the workflow* belongs
   to the caller — never the payload.
2. `web/lib/workflowRun.ts:1499` — `org_id: (eventPayload.org_id as string) ?? null`.
3. `web/lib/workflowRun.ts:2137` — `const orgIdResolved = payload?.org_id ?? run?.org_id`.
   The client payload wins.
4. `web/lib/workflowRun.ts:2130` — `const table = ENTITY_TABLES[entityType] ?? entityType;`
   then `:2223` `.from(table).update(patchToApply).eq("id", entityId).eq("org_id", orgIdResolved)`.

The step's `entity_type` is org-editable via `PUT /api/admin/workflows/[id]/actions`,
so an org admin authors the step and any portal-eligible user then runs it
naming any `org_id`. `web/lib/workflowRun.ts:2223` is the only unbounded
dynamic-table write reachable from a request in the codebase.

**The correct pattern is in the same call graph.**
`web/lib/admin/actions/executeAdminAction.ts:1238` spreads the client payload
first and then overwrites `org_id: ctx.orgId`. The run route does neither.

Two further steps in the same engine write `assignments` with no org predicate
at all (`create_assignment` `:2295`, `apply_job_vendor_to_upcoming` `:2358`).

### F-2 — the two guards forbidding in-place operational mutation have zero callers

`assertNoOperationalPlacementPatch` (`childPlacementService.ts:357`) and
`assertNoOperationalScheduleAssignmentPatch` (`scheduleAssignmentService.ts:354`)
each return exactly one grep hit repo-wide: their own definition line.

Meanwhile `applyChildParticipationEdit.ts:163/:177/:196` updates
`child_enrollment_agreements`, `child_placements` and `schedule_assignments`
**in place**, destroying the effective-dated history the supersede functions
exist to preserve. Three production entry points reach it. The same file accepts
`actorUserId` at `:89` and never writes it — the identifier occurs exactly once
in the file, in the type declaration.

Someone identified this exact hazard precisely enough to name a function after
it, and the wiring was never done.

### F-3 — the authorization domain writes no audit of any kind

Grep across `web/app/api/admin/users/**` and `web/app/api/admin/rbac/**` for
`logAdminAudit|emitEvent|audit` returns **zero hits**, verified independently.

Granting a permission, replacing a member's role set, removing a membership and
widening department or site scope produce no durable record. `logAdminAudit`
(`web/lib/admin/adminAuditLog.ts:5`) is a `console.log` with 57 call sites and
no table behind it.

There is also **no non-human principal model**: grep for
`api_tokens|service_account|api_keys|personal_access|x-api-key` across
`web/app` and `web/lib` returns zero. There is nothing to grant an external
credential to, and no record would be written if there were.

## Corrections to priors carried into this map

- `ENTITY_TABLES` is a hard-coded const (`workflowRun.ts:187`), not org-editable
  config. The org-editable input is the *step's* `entity_type`. Conclusion
  unchanged; mechanism is one step removed.
- Attendance is not the only trigger-enforced domain — payments and
  business-process configuration also have DB-level write guards.
- `charge.*`/`payment.*` lacking a permission check is a **cohort split**, not a
  domain property: 7 of 27 action definition files check permissions; the newer
  financial cohorts do, the original charge/payment cohort does not.
- A prior claim that `platformTransaction.ts` has zero callers is **wrong**: it
  has four. None of the 57 registered actions use it.
- A prior sweep flagged 68 routes as ungated. The corrected figure is 38 with no
  gate helper, and most of those authenticate by signature or hashed credential.
  The detector missed named domain gates and credential-selection terminals.

## Coverage

**Exhaustive:** the 613-route inventory and its 396 mutating subset; gate
distribution; the registered-action registry and 27 definition files; the
100-capability registry; the facade execution gate; the `workflowRun.ts`
mutating step switch; write-site enumeration for 16 named tables; the RPC
inventory; the two dead guards.

**Sampled:** module bodies — roughly 120 files read in full of ~2,000 in
`web/lib`; the rest grepped for mutation verbs and gate calls.

**Could not determine:** whether `formsAdminDb.ts` inserts carry `created_by`;
the gate on `web/app/api/admin/forms/preview-payload/route.ts:8`, which reaches
for a service-role client at `:48`; whether production runs
`alloy.lifecycle_guard` in `warn` mode, which would reduce the business-process
write guard to logging (`20260730130000:105`); and the
`operationalAssignments` sub-surface.
