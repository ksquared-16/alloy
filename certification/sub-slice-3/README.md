# Sub-slice 3 — Decision grain correction: BLOCKED at the save gate

## Outcome

The `update_stage_grain` action is implemented and tested. The Firefly correction was
**attempted and refused**, by a pre-existing referential-integrity violation unrelated to
grain. **Nothing was written.** Before and read-back hashes are identical.

| Artifact | Value |
|---|---|
| before payload | `before.json` |
| before sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| expected after (asserted pre-write) | `expected-after.json` |
| API response | `api-response.json` (HTTP 422) |
| read-back | `readback.json` |
| read-back sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| identical | **yes — no write occurred** |

## Pre-write assertion (passed)

```
.processes[0].stages[2].grain: 'child' -> 'family'
change count: 1
```

## Why the save was refused

`PATCH /api/admin/departments/{id}/lifecycle-builder` → **HTTP 422 `dangling_stage_reference`**

```
lead -> ref=tour_scheduled_to_tour              kind=move_to_stage  invalid_target=lead_to_tour
lead -> ref=domain_tour_booking_scheduled_to_tour kind=move_to_stage  invalid_target=lead_to_tour
```

Firefly's Lead stage has two rules whose `move_to_stage` targets resolve to `lead_to_tour`,
which is a TRANSITION ref, not a stage key — and `outgoing_transitions` on that plan is
`null`, so no transition by that name exists. `validateConfiguredStageReferences` therefore
reads them as movements to a non-existent stage and refuses the whole save.

This is the same dangling reference recorded during Phase 1 inspection.

## Consequence

**No lifecycle-builder configuration change can be saved for this department until those two
Lead rules are repaired.** That blocks the Decision grain correction and, more importantly, it
blocks the product owner's own configure → validate → publish retest.

The gate is behaving correctly. The invalid configuration is real and predates this work.

## Not done, and why

- Decision grain is still `child`. Correcting it requires the save gate to pass.
- Authority documentation reconciliation was deferred: it should describe the corrected
  state, and the correction has not landed.

Repairing the Lead rules is Firefly outcome rewiring, which is explicitly out of scope for
this sub-slice, so it was not attempted.

---

# Attempt 2 — transition repair: blocked by a SECOND pre-existing gate

## Write 1 — `ensure_stage_transition` (lead → tour)

| | |
|---|---|
| before sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| pre-write diff | `.processes[0].stages[0].stage_operating_plan_v1.outgoing_transitions: '<absent>' -> [lead_to_tour -> tour]` — **1 change, asserted** |
| API | `PATCH …/lifecycle-builder  action=ensure_stage_transition` |
| response | **HTTP 422 `process_command_set_invalid`** |
| read-back sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| identical | **yes — no write occurred** |

**The dangling-transition error is gone.** `dangling_stage_reference` no longer appears: the
repair candidate is valid by `validateConfiguredStageReferences`. The action works.

A different, pre-existing gate now refuses the save:

```
work_template_orphan  stage=lead  capability=quick_message
work_template_orphan  stage=lead  capability=schedule_tour
work_template_orphan  stage=lead  capability=send_form
work_template_orphan  stage=lead  capability=add_child
work_template_orphan  stage=lead  capability=add_family_member
work_template_orphan  stage=lead  capability=create_task
work_template_orphan  stage=tour  capability=schedule_tour   (x2)
work_template_orphan  stage=tour  capability=quick_message
work_template_orphan  stage=tour  capability=create_task
```

## The structural finding

`validateProcessCommandSetsForPublish` — a **publish**-grade check — runs on **every save**
(`route.ts:528`). Firefly's Lead and Tour work templates reference ten capabilities that are
not in the process's selected command set, so **no lifecycle-builder save can succeed for this
department**, regardless of what it changes.

That is why two unrelated corrections have now been refused. It also blocks the product
owner's configure → validate → publish retest.

Correcting it is either:
- a Firefly configuration change (add those capabilities to the process command set), which is
  outside this sub-slice's scope; or
- a platform change separating save-grade from publish-grade validation, which the instruction
  explicitly forbade ("do not change the save-pipeline ordering, do not weaken candidate
  validation").

Neither was attempted. Write 2 (Decision grain) was not attempted, since it is gated on
write 1. Part 5 documentation remains deferred, since it should describe the corrected state.

**No operational data mutated. Nothing published.**
