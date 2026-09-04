# The canonical entry stage of a Business Process (B1a → D-103)

Where a journey **begins**. Business Process configuration owns it, it is declared rather than
inferred, and it rides the published revision so a running journey's entry stage cannot move
underneath it.

**D-103 supersedes the shape.** B1a declared one stage per process, `entry_stage_key`. That collapsed
two legitimate initiations of the same Enrollment process, and configuration now maps entry
**intents** to stages. The scalar is gone, not deprecated — see "The declaration" below.

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

```jsonc
"entry_points_v1": {
  "version": 1,
  "by_intent": {
    "create_lead": "lead",
    "enrollment_start": "enrolling"
  }
}
```

`LifecycleBuilderProcessRecord.entry_points_v1?: ProcessEntryPointsV1`.

**Why per intent.** One process has more than one legitimate initiation. Create Lead begins an
acquisition episode; Start Enrollment begins paperwork for a child who already exists in Records.
A process-global scalar has to pick one, and whichever it picks is wrong for the other — a Records
child dropped at the top of the acquisition funnel, or a lead that has not decided anything sitting
in enrolment paperwork.

The split of authority is the point: **the initiating action may say why a process is being
initiated; it may not say where the journey starts.** The published revision owns that.

**The intent vocabulary already existed.** `process_instances.metadata.source` has recorded these
values since long before this decision — `buildEnrollmentProcessInstanceInsert` writes `create_lead`
by default, and Start Enrollment passes `enrollment_start`. So the runtime reads the intent a journey
was *created with* rather than being told one, no column is added, and journeys created before D-103
are already labelled. `enrollment_start` is this repository's name for what the decision text called
`start_enrollment` — same semantic, existing literal, no duplicate vocabulary.

**Why a map, not a list.** `by_intent` is object-keyed, so two definitions of one intent are
structurally impossible and no tie-break rule is ever needed. A list of `{intent, stage_key}` rows
would have needed one. It also matches the `by_rule_id` / `by_stage_key` shape the builder's other
versioned sub-configs use.

**The scalar was removed, not deprecated.** `entry_stage_key` shipped days earlier and had no
authored production usage anywhere — no tenant, seed, template or migration wrote it. Keeping it
would have left two authorities answering one question, so it was migrated before Firefly authored
against it. There is no precedence rule to document because there is nothing to precede.

**Absence is unauthored, not a default.** `resolveDeclaredProcessEntryStage` returns
`not_declared` and consumers refuse; nothing falls back to a plausible stage. This is the posture
`requirements_v1` already takes under D-90.

| Property | How it holds |
| --- | --- |
| revision-contained | it is a field of the builder payload, which publication snapshots whole (D-97) |
| immutable once published | `business_process_revisions` is immutable by trigger |
| validated at publish | `PUBLISH_ENTRY_STAGE_UNRESOLVABLE` — every mapped key must name an **active** stage; `PUBLISH_ENTRY_INTENT_UNKNOWN` — every authored intent must be one the platform can supply |
| unambiguous | object-keyed map; one intent cannot be mapped twice |
| rollback-safe | the mapping is part of the payload, and rollback republishes a prior payload forward |
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

All three creators — Start Enrollment, Create Lead child persistence, and the family decision
handoff (`enter_child_enrollment`) — pass `stageKey: null` deliberately, and `stage_entered_at` is
stamped only when a stage is present. Writing an entry stage
at creation would mean a journey had *entered* a stage without any transition firing, would stamp an
entry timestamp for a movement that never happened, and would change which work views the child
appears in. That is a change to lifecycle meaning made for the convenience of a downstream reader.

Instead the participant runtime resolves the **effective** stage:

```
intent         = process_instances.metadata.source        (create_lead | enrollment_start)
effective stage = process_instances.stage_key ?? entry_points_v1.by_intent[intent] ?? none
```

`resolveEffectiveStageKey` is the single owner. A persisted stage always wins, because it is where
the journey actually is. Both `resolveEnrollmentParticipantProgress` and the participant launch read
through it, so an unmoved journey projects the requirements that genuinely govern it instead of
projecting nothing until an operator happens to move the child.

## The family decision is a third door, not a third intent

`family_enrolling` on the family `decision` stage carries a child-grain target, `enter_child_enrollment`,
which begins the child's Enrollment. It writes `metadata.source = "enrollment_start"` and no stage.

It is deliberately **not** a new entry intent. A family deciding to enrol a child *is* an enrollment
start; the only difference is who pressed the button. Minting a third intent would have required a
third `by_intent` mapping in every tenant, and a tenant that configured two of the three would get a
child governed by a stage nobody chose.

This was got wrong once, and the failure is worth keeping. The target originally stamped a literal
`stage_key: "enrollment"` and an invented `source: "family_enrollment_decision"`. A persisted stage
always beats the declaration, so the journey sat on `enrollment` — a stage **no published revision in
the tenant defines** — while Start Enrollment, which stamps nothing, resolved `enrolling` and realized
its packet. Two symptoms (a stage that does not exist, and a participant with no requirements) from
one cause: naming a stage that configuration had already named.

There is no child-grain `enrollment` stage in the deployed configuration. The default operating plans
in this repository describe one; the tenant's published revisions declare `enrollment_start → enrolling`
and stop there. **Code must not reconcile that difference by naming a stage.** Whichever stage a tenant
declares is the entry stage, for every door.

## Not a competing authority: `resolveCreateLeadEntryStageKey`

That function also produces a field called `entry_stage_key`, and it is a different subject: the
stage whose **work unit** a new lead's Opportunity is routed to, with its status key. Its consumers —
`resolveCreateLeadEntryDepartment` and `lifecycleRuntimeBinding` — read `work_unit_id`, `status_key`
and `activation` and drop the stage entirely. Nothing in production reads it. It is queue routing for
an Opportunity, not where a child's process instance begins, so it was left alone rather than folded
into an entry-point model it does not belong to.

## Evidence

`tests/lifecycle/startEnrollmentParticipantLaunch.test.ts` — `create_lead → lead` and
`enrollment_start → enrolling`; neither intent inheriting the other's stage in either direction; an
unknown authored intent refusing at publish and an unreadable runtime intent falling to the platform
default; a mapping to a missing or deactivated stage refusing publication; unauthored entry points
resolving to nothing rather than a guess while still publishing cleanly; duplicate definitions being
structurally impossible; the mapping surviving a serialize/parse round trip, which is what makes it
immutable in a revision and restorable by rollback; and the Create Lead regression — a `create_lead`
journey resolving `lead` and projecting no participant Form requirement, while a Start Enrollment
journey in the same tenant resolves `enrolling` and realizes its packet.

`tests/lifecycle/acquisitionToEnrollmentHandoff.test.ts` — the family decision target naming no
stage; the journey being created with `stageKey: null` and the `enrollment_start` intent, pinned
against the literal Start Enrollment writes; both intake seams creating a participation but no child
journey; and the handoff refusing rather than advancing siblings when a family has none or several.
