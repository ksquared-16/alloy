# Work Items — Recurring Work (Studio)

Status: **specified, not shipped.** The product and authority model below are settled and the
Studio surface exists. No generation runtime is built, no schema is added, and no definition can be
created yet. Anything that claims recurring work is generating is wrong.

## 1. What it is

An administrator defines operational work that should exist on a cadence:

- Opening checklist — every weekday at 6:00 AM — assigned to the opening director
- Fire extinguisher inspection — first Monday monthly — assigned to the site director
- Subsidy review — every Wednesday — assigned to the billing specialist
- Classroom sanitation review — every Friday, one per room — assigned to the room lead

```
Recurring Work Definition
        ↓ schedule fires
Manual operational work instance   (operational_tasks, source = 'recurring')
        ↓
Work Items queue
```

## 2. The authority rule that matters most

**A recurring definition creates manual work. It never creates Business Process stage work.**

Business Process work derives its existence, due date and completion authority from a stage
operating plan. `isBusinessProcessStageWorkTaskRow` classifies a row as stage work from
`lifecycle_provenance = 'lifecycle_template'`, `operating_plan_template = true`, or a
template-key/stage-key pair. A recurring definition that stamped any of those would put rows into
Current Work that **no stage can explain and no outcome can close** — the operator would see work on
a record that the Business Process runtime does not believe exists.

Recurring instances therefore carry `source = 'recurring'` and none of the BP metadata keys.
Completion authority stays with Work Items, exactly as for any other manual work.

This is also why Recurring Work is in **Studio**, not in the Business Process builder. Putting it in
the builder would invite exactly the conflation this section forbids.

## 3. Do not build a second scheduler

The platform already has the claim pattern this needs:
`claim_due_communication_scheduled_sends(p_limit, p_now, p_org_id)` —
`SELECT … FOR UPDATE SKIP LOCKED`, a status transition to `claimed`, a claim token, `service_role`
execute only. Recurring generation reuses that shape. Do not introduce a second workflow engine, and
do not put generation on a client path.

## 4. Assignment — decision

**Assignment resolves at RUN TIME, not definition time.**

A definition stores an assignment *rule*, never a snapshot of who currently holds a role:

| Rule kind | Stored | Resolved at fire |
|---|---|---|
| `user` | `user_id` | that user |
| `role_at_location` | `role_key` + `location_id` | whoever holds that role then |
| `location_director` | `location_id` | that location's director then |
| `room_owner` | `room_id` | that room's lead then |
| `unassigned` | — | left unassigned for the queue |

Rationale: the desired semantic is "whoever is the opening director on the morning this fires". A
definition-time snapshot would keep assigning work to someone who left the role — or the company —
months ago, and would do so silently. The instance records the user it resolved to, so history stays
accurate after a role changes hands.

If a rule resolves to nobody at fire time, the instance is still created and left unassigned. Work
that nobody owns must be visible; work that was never created is not.

## 5. Timezone

Cadences are wall-clock intentions ("6:00 AM"), not instants. Each definition resolves its timezone
from its scope — site first, then org. A definition scoped to a site uses that site's timezone even
when the administrator who wrote it sits elsewhere.

## 6. Scope and fan-out

`one_per_definition` produces a single instance per fire. `one_per_room` / `one_per_site` fan out to
one instance per member of the scope, resolved at fire time so a room opened last week is included.

## 7. Idempotency contract

An instance is identified by `(definition_id, occurrence_at, scope_member_id)`. Generation is
idempotent on that triple: re-running the scheduler for the same occurrence must produce zero
additional rows. A missed window is generated once on the next run, never backfilled for every
occurrence since the definition was created.

Pausing a definition stops future generation. It does **not** retract instances already created —
those are real work that may already be underway.

## 8. Still to decide before implementation

- Where definitions live: a new `recurring_work_definitions` table is the likely shape, but the
  schema decision is not made here. `operational_tasks.source` currently permits only
  `task_assist` and `manual`, so a `recurring` value is a CHECK constraint change.
- Whether "run now" is an administrator capability or a support-only one.
- Retention: how long generated instances stay linked to their definition for provenance.

## 9. What the Studio surface may claim

Until generation ships, the surface states that recurring work is not yet generating. It must not
render an empty definition table that implies a saved definition would produce work.
