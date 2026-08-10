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

---

# Enrolling → Enrolled converted to the transition model. Zero warnings.

## Platform correction

`stage-runtime-config` required a non-empty `selected_status_keys` on EVERY save, which made a
disposition-keyed child stage unauthorable. `enrolling` scopes its queue by
`included_disposition_keys: ["qualified"]` and has no status keys, so repointing one outcome rule
was impossible without inventing membership — and those keys are threaded into the work-unit save
(`statusKeysPassedToWorkUnitSave`), so the workaround would have rewritten the queue definition.

- omitted `selected_status_keys` → membership left exactly as configured
- explicit `[]` → refused, because it states an intent to clear
- supplied keys → validated and persisted as before
- disposition membership is never translated into status membership

## Controlled write

| | |
|---|---|
| before sha256 | `7e33ce6b09a3d38caf3c925935e82e22e348a60adc3ed09c87f7a2564d8aaa91` |
| read-back sha256 | `281bab0e4fa88f14844fb6a7f94b532c7946ed963df1d6044365e0fbcdcd07a5` |
| equals candidate | **True** |

Request omitted BOTH `selected_status_keys` and `queue_membership_v1`.

```
outcome_rules[0].targets[1].stage_key      "enrolled" -> <absent>
outcome_rules[0].targets[1].transition_ref <absent>   -> "enrolling_to_enrolled"
```

## Post-write

```
enrolling queue_membership_v1 : included_disposition_keys ["qualified"]   (byte-identical)
                                no included_status_keys invented
transitions                   : enrolling_to_enrolled -> enrolled   (exactly once)
complete_to_enrolled          : { kind: move_to_stage, transition_ref: "enrolling_to_enrolled" }
grains                        : enrolling=child  enrolled=child
```

## Validate

```
can_publish : true
errors      : NONE
warnings    : NONE          ← movement_without_transition eliminated
```

## Published projection

```
e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8   (unchanged throughout)
```

Nothing published. No operational records changed.

## Incident note

A transient Supabase outage timed out the first `ensure_stage_transition` attempt and wedged the
dev server (`auth.session_resolve` 174s, unauthenticated). The server was restarted and the draft
hash re-read to confirm the write had NOT landed before retrying. `ensure_stage_transition` is
find-before-create, so the retry created exactly one transition.

---

# Tour operating-model cleanup — draft is publishable. Nothing published.

| | |
|---|---|
| before sha256 | `a1bd4832c4f0c7eb0c58d4368ef9757a04c7fefc368ba751e2a93e31dcf1dd3b` |
| read-back sha256 | `e88ad4bc4b06fea30be6994cc8954c145ffa71fd8652869d744f1ed1360ba0ef` |
| equals candidate | **True** |

```
work_templates[0] (Schedule Tour) outcome_refs   5 -> 2   (drops outcome_3/4/5)
work_templates[2] (Conduct Tour)  outcome_refs   <absent> -> [outcome_7, outcome_8]
outgoing_transitions                             2 -> 1   (drops tour_transition_1)
outcome_rules                                    8 -> 6   (drops outcome_4/5_behavior)
```

## The fourth change, and why it was required

Removing `tour_transition_1` alone would have left `outcome_4_behavior` and
`outcome_5_behavior` pointing at a transition that no longer exists — trading three
cross-grain errors for two dangling-reference errors. The instruction's own precondition
("after no outcome references it") could not be satisfied without removing those two rules.

The outcome DEFINITIONS are untouched: all 11 remain in `outcomes[]`. Only their behaviour
and their operator reachability were removed.

## Final Tour model

```
work_1 Schedule Tour : outcome_1 Tour Scheduled, outcome_2 Awaiting Family Response
work_2 Confirm Tour  : outcome_6 Tour Confirmed
work_3 Conduct Tour  : outcome_7 Completed — Interested, outcome_8 Completed — Needs Follow-up
transitions          : tour_transition_2 -> decision   (family -> family)
outcome_7_behavior   -> move_to_stage tour_transition_2
outcome_8_behavior   -> move_to_stage tour_transition_2

preserved, not operator-reachable:
  outcome_3 Family Declined Tour, outcome_4 Move to Waitlist, outcome_5 Closed Lost,
  outcome_9 Tour Rescheduled, outcome_10 No Show, outcome_11 Tour Cancelled
```

## Validation

```
can_publish : true      errors: 0      warnings: 0
cross-grain transitions anywhere in the process: NONE
```

## Prior corrections intact

```
lead_to_tour present            Lead→Tour domain signal intact
decision grain family (both sources)
enrolling_to_enrolled present   enrolling membership included_disposition_keys ["qualified"]
command_set_v1  update_lead_status, add_child, add_family_member, schedule_tour, quick_message
contact_family  primary quick_message, helpful [schedule_tour, add_child, add_family_member]
```

## Published projection

```
e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8   (unchanged throughout)
```

---

# Canonical terminal stages configured. Draft still publishable; nothing published.

| | |
|---|---|
| before sha256 | `e88ad4bc4b06fea30be6994cc8954c145ffa71fd8652869d744f1ed1360ba0ef` |
| read-back sha256 | `34499d7dd62c025dab4c246bb800ae3319c05aab98262639ceb4016bc5d8de74` |
| structural diff | `processes[0].stages` **6 → 8**, nothing else |
| existing stages | byte-identical |

## API calls (canonical draft actions only)

```
add_stage            label "Closed"              -> key closed             sort_order 8
add_stage            label "Closed / Withdrawn"  -> key closed_withdrawn   sort_order 9
update_stage_grain   closed            -> family
update_stage_grain   closed_withdrawn  -> child
```

The labels slug to the canonical keys via `slugifyLifecycleKey`, so no tenant-specific terminal
key was invented. Negative control: `update_stage_grain closed_withdrawn -> family` returns
**HTTP 409** — *"defined by the platform as belonging to individual children"*.

## Final stage order

```
0  lead              family   1 work templates
2  tour              family   3
3  decision          family   1
4  waitlist          child    2
6  enrolling         child    2
7  enrolled          child    0
8  closed            family   0 work templates, 0 outcomes, 0 transitions
9  closed_withdrawn  child    0 work templates, 0 outcomes, 0 transitions
```

`closed` is APPENDED at 8 rather than inserted after Decision at 4. `reorder_stage` moves one
position per call, rewrites `sort_order` across stages, and triggers the Work Unit sort sync that
reads the PUBLISHED projection — stale for an unpublished draft. Appending disturbed nothing;
insertion would have touched four unrelated stages to satisfy display order.

## Terminal by construction

Neither stage has a `stage_operating_plan_v1` at all — so zero work templates, zero outcomes,
zero rules, zero transitions, and nothing that can provision Current Work. No outcome anywhere
targets either terminal yet; wiring Closed Lost is separately certified.

## Validation

```
can_publish : true      errors: 0      warnings: 0
PROJECTION  : e3b000d12cebda825fa24c3355e69d9ffd613f0f923ed0880b8584369db8d1a8   (unchanged)
```
