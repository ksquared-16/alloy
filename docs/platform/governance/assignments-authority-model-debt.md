---
owner: platform
status: canonical
last_reviewed: 2026-09-15
supersedes: []
---

# Assignment authority — the model, and what is still blocked

**Raised:** 2026-09-15 by Communications Authority Coverage V1, as a single `BLOCKED_DECISION`.
**Resolved:** 2026-09-15 by Assignments Authority Model V1 — the *model* is decided and two product
families are implemented. Three families remain blocked, each named below.

## The ruling

**Assignment is an operation pattern, not an authority.**

Several products contain an action called "assign". That shared verb does not make them one power,
so there is **no** `assignments.manage`, `assignments.write`, `assignments.assign`, or any other
platform-wide assignment capability. Authority belongs to the product whose business truth changes.

`tests/access/assignmentAuthorityLock.test.ts` (RL-12) asserts that no such key exists in the
capability catalog, in any migration, or anywhere under `app/api` or `lib` — in six spellings. A
future slice that wants one must delete that list first, which is a conversation rather than a
commit.

## What the census found

Searching by business effect rather than by the word, the entire schema carries **five**
assignee-bearing columns, belonging to four products:

| column | product | disposition |
|---|---|---|
| `communication_threads.assigned_user_id` / `assigned_team_id` | Communications | **implemented** — `communications.assign` |
| `jobs.assigned_vendor_id` | Jobs | **implemented** — existing `ops.jobs.write` |
| `schedules.assigned_vendor_id` | Jobs | **implemented** — existing `ops.jobs.write` |
| `operational_tasks.assigned_to_user_id` | Work | **blocked** — no `work.*` vocabulary exists |
| `opportunities.assigned_to` | CRM | **blocked** — unresolved CRM/People model |

Two findings are worth keeping because they contradict what the names suggest:

- **There is no staff assignment in this product.** No table assigns a person to a shift, a room or
  a schedule. The only staff-shaped table is `staff_presence_events`, which is attendance capture.
  The Director's hypothesised `STAFF ASSIGNER` / `SCHEDULE MANAGER` split does not apply, because
  the operation it would split does not exist. What the product schedules is **vendors**, for
  **jobs**.
- **`schedule_assignments` is not staff scheduling.** It binds a schedule *pattern* to an enrollment
  agreement — which child follows which timetable. Despite the name, `scheduling.write` does not own
  it.

Deliberately **not** treated as assignment: `financial_responsibility_allocations.assigned_amount_cents`
(who owes what is Financials truth, owned by `fin.responsibility`), and the UI-layout "placement"
tables (`action_placements`, `metric_placements`, `workspace_kpi_placement`,
`business_process_layout_assignments`), which are Configuration and already declared under
`layouts.manage`.

## Why Communications got a new key and Jobs did not

The test applied to both was the same: **does existing authority already permit the same effect?**

- **Jobs — yes, so no new key.** `jobs/[id]/route.ts` PATCH carries `assigned_vendor_id` in its
  `ALLOWED_KEYS`, so an `ops.jobs.write` holder can already set the assigned vendor. A separate
  `jobs.assign` would have withheld nothing from anyone and split for symmetry.
- **Communications — no, and bundling would have opened an escalation path.**
  `decideCommunicationsSendScope` checks assignment *before* site scope and returns
  `assigned_to_actor`, deliberately, so a site-restricted operator can be handed one organization
  conversation by name. `CONVERSATION_ASSIGNMENT_ACTIONS` includes `claim`, which assigns a thread
  to the **actor**. Under one key, any site-restricted holder of `communications.send` could claim
  any conversation in the organization and answer it — escaping their own site scope, one
  conversation at a time, with nobody granting them anything.

The schedule-side vendor routes are **Jobs**, not Scheduling: `scheduling.write` owns *when* a job
happens (its PATCH allows `start_at`, `end_at`, `timezone`, `status`, `status_key`, `metadata` and
cannot set a vendor at all), so routing assignment through it would have widened Scheduling into
deciding who performs the work.

## Assignment is not Access delegation

Mandatory distinction, answered per family rather than by the word:

Conversation assignment changes **scope**, not capabilities. `decideCommunicationsSendScope` refuses
`no_send_permission` before it ever looks at assignment, so an assignee who lacks
`communications.send` still cannot reply. Assignment widens which conversations a principal may act
on; it never grants the capability. **The W-18 assignment ceiling is therefore not engaged**, and
RL-12 asserts that no implemented assignment handler invokes it. Only Access *role* assignment
changes capability bundles, and that already obeys the ceiling.

## Still blocked, and by what

| family | route | blocked by |
|---|---|---|
| Work | `operational-tasks` POST, `[id]` PATCH | `WORK_AUTHORITY_MODEL_DEBT` — the catalog contains no `work.*` key of any kind. Any owner would be invented, and inventing one settles the Work authority model as a side effect of an assignment slice. |
| CRM | `opportunities/[id]` PATCH | `BLOCKED_BY_CRM_MODEL` — `assigned_to` moves inside a general record PATCH. Declaring that handler is a decision about the whole CRM record, not about assignment. |
| Enrollment operational | `child-placements` POST, `schedule-assignments` POST | `ENROLLMENT_PLACEMENT_AUTHORITY_DEBT` — `enrollment.*` holds only `pricing.override` and `requirement_exception.manage`; no placement vocabulary exists. |

Each is carried by name in RL-12's `ASSIGNMENTS` registry with its reason, and that list is
shrink-only.

## The flag is not the boundary

`comms_v2_assignment` was the only effective boundary on conversation assignment: the handler's
first statement returned 404 when it was off, and `requireAdminOrOps()` — portal admission — was all
that stood behind it when it was on.

It is now gated on `communications.assign` whether the flag is on or off. The flag stays because
rollout is a product decision, and it remains **OFF** in every real environment: authorization is
fixed, product readiness is a separate question and was not assessed here. Certification enables it
in `web/.env.certification.local` only, so the capability can actually be exercised — with the flag
off every persona would see 404 and the matrix would prove nothing.

## Do not

- Do not create a generic assignment capability to shorten RL-12's blocked list.
- Do not gate an assignment route on a capability from another product because the verb matches.
- Do not invoke the W-18 delegation ceiling for operational assignment.
- Do not enable `comms_v2_assignment` as a *security* change; that work is done.
