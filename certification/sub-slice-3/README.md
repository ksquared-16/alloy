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

---

# Attempt 3 — BLOCKED at the database. `lifecycle_builder_v1` is a projection.

## Write 1

| | |
|---|---|
| before artifact | `W1-before.json` |
| before sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| local candidate | `W1-candidate.json` — **2 permitted changes, asserted** |
| request | `W1-request.json` |
| response | `W1-response.json` — **HTTP 400** |
| read-back | `W1-readback.json` |
| read-back sha256 | `6e299186a4fe19b636381d78d24bbffc630fce51936baffe7066ce1779e77826` |
| identical | **yes — no write occurred** |

Pre-write assertions ALL passed:

```
.processes[0].command_set_v1:
   '<absent>' -> {"version":1,"commands":[{"capability_key":"update_lead_status","enabled":true}]}
.processes[0].stages[0].stage_operating_plan_v1.outgoing_transitions:
   '<absent>' -> [{"transition_ref":"lead_to_tour","source_stage_key":"lead",
                   "target_stage_key":"tour","label":"Move to Tour","available":true}]
Tour movement rules byte-identical: True (2 rules)
```

## Why it was refused

```
HTTP 400
lifecycle_builder_v1 is publication-owned; direct writes are not permitted
(department=3933ac47-077a-4de8-aaac-8aed48d80413)
```

Raised by a POSTGRES TRIGGER, not application code:

`supabase/migrations/20260730130000_business_process_projection_write_guard.sql`
→ `trg_departments_lifecycle_projection_guard` BEFORE INSERT OR UPDATE ON `departments`

Its hint names the only two sanctioned writers:

> Publish through `publish_business_process_revision_v1`, or for an exceptional repair call
> `begin_lifecycle_projection_write('migration')` in the same transaction.

## The architectural finding

`departments.metadata.lifecycle_builder_v1` is a **published projection**, not the authoring
surface. The lifecycle-builder PATCH route's `saveConfig` writes it directly (`route.ts:91-118`),
which the database now forbids.

**That route cannot save at all** — for any action, on any department that already has
`lifecycle_builder_v1`. Not `ensure_stage_transition`, not `update_stage_grain`, not
`rename_stage`. The guard's own comment says the editor was expected to converge onto DRAFT
persistence; that convergence has not been completed.

Firefly's draft state confirms the split:

```
draft_id:               67879abb-bca4-4cf3-a835-0970229d86e5
draft_revision:         1
published_revision_id:  null   ← never published
unpublished_changes:    false
```

The app has no draft-write endpoint: `app/api/admin/business-process/configuration/route.ts`
is GET-only, and no `saveBusinessProcessDraft`-style function exists in `lib/`.

## Why I did not use the escape hatch

`begin_lifecycle_projection_write('migration')` would have let the write through. It is
explicitly a direct projection write, which the standing controls forbid, and it would bypass
the draft/publication governance the guard exists to enforce. Stopping is the correct outcome.

Writes 2–5 not attempted: each is gated on Write 1.

**No operational data mutated. Nothing published. No direct metadata or service-role write.**

---

# Command-set reconciliation — COMPLETE. Draft is publishable; nothing published.

| | |
|---|---|
| before sha256 | `c6fa455aee02fb8f8de414732b67f5be9be0605bac2e9b72e3a8a9ef3f6cc5e8` |
| read-back sha256 | `bdf9023cbb812d5f7ba72b3e83c6d6682d8fad18a47d68c57f569b3a24bf74cc` |
| equals precomputed candidate | **True** |
| persisted diff | 3 changes, all authorized |

```
.processes[0].command_set_v1.commands                                     1 -> 5
.processes[0].stages[0]…work_templates[0].helpful_actions (Lead/contact_family)  5 -> 3
.processes[0].stages[1]…work_templates[0].helpful_actions (Tour/work_1)          3 -> 1
```

## Negative control

```
POST update_process_command_set  add_capability_keys: ["create_task"]
→ HTTP 409  capability_unregistered
   rejected: [{"requested":"create_task","reason":"unregistered"}]
```

Structurally refused by `tryResolvePlatformCapability`, not by a list.

## Final state

```
command set : update_lead_status, add_child, add_family_member, schedule_tour, quick_message
lead/contact_family : primary=quick_message  helpful=[schedule_tour, add_child, add_family_member]
tour/work_1         : primary=schedule_tour  helpful=[quick_message]
lead_to_tour        : present, once
decision grain      : family
```

## Validate

```
can_publish : true
errors      : NONE
warnings    : movement_without_transition   (non-blocking by design)
```

## Published projection — byte-identical throughout

```
before all writes : e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8
now               : e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8
runtime still sees: lead transitions=None, decision grain=child, command_set_v1=None
```

Runtime remains on the previous publication. No operational records changed. Nothing published.
