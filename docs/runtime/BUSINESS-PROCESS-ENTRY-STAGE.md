# The canonical entry stage of a Business Process (B1a)

Where a journey **begins**. Business Process configuration owns it, it is declared rather than
inferred, and it rides the published revision so a running journey's entry stage cannot move
underneath it.

## Why it had to be added

The question had no answer in the model. Every candidate was checked before a field was added:

| Candidate | Why it cannot answer |
| --- | --- |
| `stages[].sort_order` | presentation order — the builder sorts by it for display |
| array order in `stages[]` | the parser re-sorts, so it is not even stable |
| `tracks_v1` | orders tracks and splits subjects between them; declares no start |
| transition graph (`stage_operating_plan_v1.outgoing_transitions`) | see below |
| `active_process_id` | selects a process, not a stage |
| `resolveCreateLeadEntryStageKey` | Create-Lead-specific: the LEAD operator stage, then a legacy `new_inquiry` status, then the first active stage |

The transition graph is the one that looks like it should work — a stage with no incoming edge ought
to be the root. Run against Firefly's own published revision 12 it produces **three** roots:

```
lead:      <no incoming>
tour:      lead
decision:  tour
waitlist:  <no incoming>
enrolling: <no incoming>
enrolled:  enrolling
```

`waitlist` and `enrolling` are entered by a split rule or by an operator movement, and from the graph
that is indistinguishable from starting there. Picking one of three would be the silent guess the
declaration exists to prevent.

## The declaration

`LifecycleBuilderProcessRecord.entry_stage_key?: string` — one optional scalar on the process.

A per-stage `is_entry` boolean was rejected: two stages could carry it, and the model would then need
a tie-break rule — an ambiguity invented by the schema rather than by the operator. A single scalar
makes ambiguity structurally impossible.

**Absence is unauthored, not a default.** `resolveDeclaredProcessEntryStage` returns
`not_declared` and consumers refuse; nothing falls back to a plausible stage. This is the posture
`requirements_v1` already takes under D-90.

| Property | How it holds |
| --- | --- |
| revision-contained | it is a field of the builder payload, which publication snapshots whole (D-97) |
| immutable once published | `business_process_revisions` is immutable by trigger |
| validated at publish | `PUBLISH_ENTRY_STAGE_UNRESOLVABLE` — a declared key must name an **active** stage |
| unambiguous | one scalar per process |
| owned by BP Configuration | declared in the builder; the participant runtime only reads it |

Validation is blocking, and blocking at publish specifically: a revision is immutable, so a journey
pinned to one whose entry stage does not resolve could never be repaired by editing configuration.

## What it does not own

Movement. Transitions, outcome rules and stage work remain the execution authority for where a
journey goes. This answers only where it begins, and adding it took no authority from the execution
graph — a journey that never leaves its entry stage does so because no transition fired.

## Process-start semantics: option B

`createEnrollmentProcessInstance` continues to write `stage_key = NULL`. It is not stamped at
creation.

Both existing creators — Start Enrollment and Create Lead child persistence — pass `stageKey: null`
deliberately, and `stage_entered_at` is stamped only when a stage is present. Writing an entry stage
at creation would mean a journey had *entered* a stage without any transition firing, would stamp an
entry timestamp for a movement that never happened, and would change which work views the child
appears in. That is a change to lifecycle meaning made for the convenience of a downstream reader.

Instead the participant runtime resolves the **effective** stage:

```
effective stage = process_instances.stage_key ?? declared entry_stage_key ?? none
```

`resolveEffectiveStageKey` is the single owner. A persisted stage always wins, because it is where
the journey actually is. Both `resolveEnrollmentParticipantProgress` and the participant launch read
through it, so an unmoved journey projects the requirements that genuinely govern it instead of
projecting nothing until an operator happens to move the child.

## Evidence

`tests/lifecycle/startEnrollmentParticipantLaunch.test.ts` — deterministic resolution, a declared key
that names no active stage refusing at publish, a deactivated stage refusing, absence resolving to
nothing rather than to a guess, and a persisted stage overriding the declaration.
