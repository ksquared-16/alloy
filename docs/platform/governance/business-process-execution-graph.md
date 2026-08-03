# The Business Process execution graph

Law 4 / Law 6, editor family 2. Companion to
[`business-process-stage-save-decomposition.md`](./business-process-stage-save-decomposition.md) and
[`configuration-publication-model.md`](./configuration-publication-model.md).

## The integrity unit

```
stage → outgoing transition → destination stage → outcome/domain signal → effect → transition ref
```

Every link must resolve, and they must be **published together**. Migrating transitions apart from
the outcomes that reference them would just move the dangling reference across a publish boundary.

## The failure this closes

Firefly, precisely:

1. an outcome rule references `lead_to_tour`
2. the persisted Lead stage declares no such outgoing transition
3. the status write succeeds
4. the stage move finds nothing
5. durable state contradicts itself, and the saga reports `changed: false`

Nothing in the product could see it, for three independent reasons — each fixed here.

---

## 1. The seed itself was invalid

`supabase/seed/local_representative_seed.sql` — the canonical representative tenant — shipped a
graph that could never publish:

| Defect | Repair |
|---|---|
| `lead_to_closed_lost`, `tour_to_closed_lost`, `decision_to_closed_lost` all target `closed_lost`; the stage is `closed` | destination → `closed`, identities → `*_to_closed` |
| the `waitlist` stage's `offer_to_enrolling` rule moves to `enrollment`; the stage is `enrolling` | destination → `enrolling` |
| that same rule moved via a **bare `stage_key`** — the waitlist stage declared no outgoing transition at all | added `waitlist_to_enrolling`, and the rule now references it |

Seven blocking errors, so a freshly seeded tenant could not publish its own configuration. Found by
browser certification of the Stage editor, not by any test — which is why the repair is pinned by
`web/tests/configPublication/representativeSeedGraph.test.ts`, reading **the real seed file**. A
fixture would have let it drift back out of validity exactly as it did the first time.

That test asserts more than the current validator enforces: every `move_to_stage` must reference a
transition its own stage declares. The seed is now a reference the rest of the platform can trust.

---

## 2. Code defaults were runtime transition authority

`resolveEffectiveStageOperatingPlan.ts` fell back to `defaultStageOperatingPlanForEnrollmentStage`
whenever the active process key was `enrollment` — that is, **for every configured tenant**.

So `lead_to_tour` could be resolved out of `defaultEnrollmentStageOperatingPlans.ts` and masquerade
as persisted tenant configuration:

- the editor showed no such transition (it reads the draft),
- the publish validator had nothing to check (the config genuinely lacked it),
- execution used a transition nobody had authored.

Two definers for one identity — the Law 2 violation that makes the failure unfalsifiable. Decision
**D1** says code defaults are a seed template applied once at creation, never a runtime authority.

**Isolated, not deleted** — the brief's own wording, and the right call. Removing the fallback
wholesale broke 15 tests covering work-intent spawning, stage-work projection and tour runtime:
the default is load-bearing for *work templates, outcomes and attention rules*, which are a
different Law 2 question whose migration path (materialize defaults into tenant config as an audited
publish) has not run yet.

What it may never supply is **movement**. `stripTransitionsFromDefaultPlan` empties
`outgoing_transitions` and drops every `move_to_stage` target, so a stage move can only ever come
from persisted configuration. The collection is left *empty rather than absent* on purpose: absent
means "legacy plan, bare `stage_key` moves are executable", and an empty collection makes
`resolveStageTransitionExecutionTargets` refuse any move that somehow survives.

Narrowing to movement fixes the actual defect — two definers for one transition identity — without
detonating behaviour that has nothing to do with transitions.

---

## 3. Execution mutated before it resolved

`applyConfiguredStageAutomationRules` — reached from status entry
(`emitStatusChangedEvent.ts:83`) and domain signals (`emitDomainLifecycleSignalEvent.ts:29`) —
called `applyStageOutcomeRuleTarget` **directly**, never expanding a `move_to_stage` through its
transition.

The modern editor writes movement as `{ kind: "move_to_stage", transition_ref: "lead_to_tour" }`
with no `stage_key`. The executor looked for a stage key, found none, and returned
"Missing target stage key" — *after* the status target in the same rule had already committed. It
also discarded `result.undo`, so there was nothing to roll back with.

### The new shape

```
PLAN   planStageOutcomeExecution(matched)      ← pure, zero writes
       every transition_ref expanded to executable primitives
       ↓
       errors non-empty?  → return, nothing written, every rule reported failed
       ↓
MUTATE each step, capturing its inverse as it is earned
       a durable failure mid-sequence → replay the inverses newest-first
       a failed inverse is reported, never swallowed
```

`web/lib/lifecycle/planStageOutcomeExecution.ts` is the plan phase Law 6 requires: *"every effect's
references resolve during a plan phase that performs zero writes"*. A configuration error can no
longer produce a partial mutation.

**Honest limitation.** `runPlatformTransaction` is a saga, not a database transaction, and this
change does not make it one. What it guarantees is narrower and true: **every execution-critical
reference is resolved before the first durable write**, and every durable step registers an inverse.
Cross-resource atomicity remains unavailable and is not claimed.

---

## 4. The validator could not see the shapes that matter

`validateConfiguredStageReferences` catches a target stage that does not exist. It cannot catch a
transition declared on the wrong stage, two transitions sharing an identity, or an outcome reaching
for a transition that belongs to a different stage — and every one of those produces the Firefly
failure while every *stage* target still resolves.

`web/lib/businessProcesses/configuration/executionGraphValidation.ts` models the graph and blocks:

| Code | What it catches |
|---|---|
| `transition_missing_source` / `transition_missing_destination` | a transition that does not say where it goes |
| `transition_source_unknown` / `transition_destination_unknown` | an endpoint stage that does not exist |
| `transition_not_outgoing_from_source` | declared on one stage, leaves from another — the runtime looks where it is declared |
| `duplicate_transition_identity` | two transitions, one identity; only the first would ever be used |
| `transition_self_loop` | a stage moving to itself |
| `movement_transition_not_found` | **the Firefly shape** — an outcome names a transition that does not exist |
| `movement_transition_from_another_stage` | an outcome using a transition that leaves a different stage |
| `movement_without_transition` (**warning**) | a legacy bare `stage_key` move — legal, but nothing checks the move is allowed |

The older walker is kept only for the reference kinds this model does not cover
(`next_stage_key`, `return_stage_key`, …). Its `transition` and `move_to_stage` findings are dropped
deliberately: they duplicate these, and its wording is actively misleading — it reported a missing
transition as `targets stage "lead_to_tour"`, describing a transition reference as a stage name.

### Messages are in the operator's vocabulary

Identity (`lead_to_tour`) is for configuration and code. Labels (`Lead → Tour`) are for people.
An operator asked to repair "lead_to_tour" has been handed the platform's problem instead of theirs.

> “Tour Scheduled” is set to move through “lead_to_tour”, but that transition does not exist.
> Create it on “Lead”, or choose a different behaviour.

> “Lead → Tour” points to “Tour”, but the Tour stage is missing.

An outcome with no configured label still gets a readable name (`tour_scheduled` → `Tour Scheduled`).

---

## 5. "Move through transition" explained itself to nobody

The radio was `disabled={!availableTransitions.length}` with no further word — a greyed control and
no reason. Two changes:

- when the list is empty, the editor now says
  **"No outgoing transitions are configured for Lead. Create a transition before choosing this
  outcome behaviour."**
- selecting the behaviour no longer **auto-picks** the first transition. A silently chosen movement
  is one the operator did not author, and it is how a wrong destination ships.

`selectableTransitionsForStage` states the rule the selector must follow: outgoing from **this**
stage, with a resolvable destination, never every transition in the process.

---

---

## Browser certification — PARTIAL, and why

Run against the isolated `alloy-cert` tenant, guard at `enforce`, shared Firefly untouched.
Spec: `certification/playwright/execution-graph.cert.spec.ts`.
Evidence: `certification/bp-config-integrity/evidence/G*.png` + `execution-graph.log`.

**G1 — PASSED.** The pristine repaired seed validates with **zero errors** and publishes: revision 1,
one publication act, projection updated. That is the first DONE-WHEN item, and the thing the seed
repair existed to make true.

**G2 — PASSED, and better than the spec expected.** Deleting `lead_to_tour` while outcome rules
still reference it is refused **at authoring**, not deferred to publish. The editor names the
dependency in operator language —

> Selected transition is not a valid outgoing edge — repair it.
> Outcome movement must reference a configured transition identity.

— the save never reaches the server (asserted, not inferred), the draft revision does not move, and
the projection still contains `lead_to_tour`. This is decision D3 acting at the point of authoring.

**G3 onward — BLOCKED by a defect this run found.**

`stageOperatingPlanEditorModel.getDraftPlan()` **throws** on any blocking validation issue, including
ones the operator did not introduce. The seed's transitions carry `status_key` values (`open`,
`closed`) that are not in their own stage's configured status vocabulary, so every Lead-stage edit —
including an unrelated one — is un-saveable through the editor:

> Status "open" is not a configured canonical status.

Removing `status_key: "closed"` from the seed's three `*_to_closed` transitions moved the blocker to
`open` rather than clearing it, which is the tell: **the shape is systemic, not a single bad value.**

This is the same class the sprint exists to end — *"the current all-or-nothing 422 can freeze a
legacy tenant out of editing entirely, which pushes operators onto exactly the unvalidated write
paths that caused this defect"* — now found on a certified path, one level below the publish gate
that D3 already fixed.

**Two candidate repairs, deliberately not made at the end of a long session:**

1. **The principled one:** `getDraftPlan()` must not throw on pre-existing issues. Blocking should
   follow D3 — refuse what this edit *introduced*, warn about the rest. This changes the editor
   model's save contract and deserves its own slice with its own tests.
2. **The narrow one:** strip `status_key` from the seed's transitions entirely. That makes the seed
   saveable but silently drops resulting-status behaviour from the reference tenant, and it treats
   a systemic editor defect as a data problem.

**Therefore: G3–G8 are written and unexecuted, and the positive execution scenario (author →
publish → execute → family moves Lead → Tour) was never reached.** No claim is made about it.

## What is NOT done

- **Browser certification of this family has not run.** The Stage editor vertical is certified
  (15/15); this one is proven by unit tests and the repaired seed only.
- **There is no tracks editor.** `tracks_v1` is written solely by the creation-time template
  (`applyEnrollmentTemplateToProcess`). Nothing validates `tracks_v1.split_rules` targets.
- **`PATCH /api/admin/departments/[id]/lifecycle-builder` still writes the projection directly.**
  Its GET reads the draft; its PATCH does not. That asymmetry is the next thing to close.
- Work Views remain unmigrated, deliberately.
