# Repair — one of the two fixes has no authoring surface

**Run:** `erun_7b551a293a3efc63` · **STOPPED per §8** · Draft not mutated · Not published

## The stop, up front

§8 says: *"If the participant-decision authoring surface or status repair cannot actually be performed
in the browser, STOP and identify the missing product surface. Do not substitute direct DB edits."*

* **Status repair (§2): authorable.** A surface exists.
* **Participant-decision repair (§3/§4): NOT authorable.** No surface writes `participant_decisions`,
  under that name or any other.

So I stopped before touching the draft. `draft_revision` is still 2 and `updated_at` still
2026-08-26T16:21 — the operator's own save.

## §3/§4 — the missing surface, named

`participant_decisions` has **eight consumers and zero authors**:

```
stageOperatingPlanV1 ................ parses it
validateStageOperatingPlanOperatingContract  validates it
resolveParticipantDecisionContext ... resolves it
projectParticipantDecisionRows ...... projects it
executeParticipantDecisionForChild .. executes it
completeStageWorkWithOutcome ........ consumes it
resolveParticipantDecisionScope ..... scopes it
/api/admin/lifecycle-builder/participant-decisions   GET renders · POST executes
```

That API is a **runtime** surface — it executes one configured decision for one child. It authors
nothing. No component under `components/adminV2/settings` or `components/forms` mentions
`participant_decisions`, `decision_key`, or a per-child/split control.

The save path *can* carry them — `StageOperatingPlanDraftSave.plan` is the whole
`StageOperatingPlanV1`, so existing decisions round-trip and are preserved. **They simply cannot be
created or edited.**

This is the third instance of the same shape this program has found: `entry_points_v1` and
`requirements_v1` were both fully consumed and unauthorable until we built their actions. The product
knows what a participant decision is everywhere except where someone would make one.

The doctrine itself is confirmed in the product's own words — `BusinessProcessParticipationCard`:
*"A new child shows the family's stage until a decision starts their own track."* That is exactly the
family→child handoff §3 asks for. The primitive is right; the door is missing.

**Smallest fix, named not built:** an action on the canonical route —
`set_work_template_participant_decisions { process_id, stage_key, template_key, decisions[] }` —
delegating to the existing parser and to `validateParticipantDecisions`, plus a narrow control in the
stage editor's work-template area. Same shape as the two actions already added.

## §2 — the status repair IS authorable

`LifecycleStageOutcomeDefinitionsEditor` / `LifecycleStageOutcomeBehaviorEditor` author exit paths,
carry `closedStatusOptions`, and are explicit that *"`opportunities.status_key` is owned by
`status_definitions`"* — never invented locally. The whole plan saves through
`/api/admin/enrollment-process/stage-runtime-config`.

The repair remains as diagnosed: three "Close as Lost" transitions point at `status_key: "closed"`,
which does not exist; the canonical terminal status matching both their intent and their label is
**`lost`**. That one is yours to make in the product whenever you like — but on its own it clears only
3 of the 9 errors.

Notably, the transition editor already filters destinations with
`filterGrainCompatibleStageDestinations` — so the product **cannot author a cross-grain transition
today**. The six bad paths are legacy data that predates that guard, which is consistent with them
being unrepairable through the same surface.

## §1 — the command-set fix holds, but the selectors need one more thing

**Validation half: confirmed.** With the fix, a save leaves `command_set_v1` absent and the 11
`process_command_set_incomplete` errors do not return. Verified on the real payload: **20 → 9**.

**Selector half: NOT fixed, and I am not claiming it.** I tested it rather than assuming:

```
isCapabilityInProcessSelection(process, "quick_message")  = false
                             … "schedule_tour"            = false
                             … "send_form"                = false
with no process at all                                    = true
```

Two readers disagree about what an absent selection means:

* `validateProcessCommandSetsForPublish` — absent → **skip** (no restriction);
* `isCapabilityInProcessSelection` — absent → falls back to the same empty migration → **denies
  everything**.

Even inside that one function the meanings differ: *no process* is unrestricted, *no selection* is
fully restricted. So the pickers stay empty for a different reason than the stamp, and my fix does not
reach it.

**I did not change it.** It is a shared guard that also feeds the runtime command projection, and §7
says to stop and report rather than keep changing things. The one-line candidate is to treat an
unauthored selection as unrestricted, matching the validator — your call.

## §5 — certified paperwork intact

Read from the tenant just now:

| # | Form | |
|---|---|---|
| 1 | Oregon Certificate of Immunization Status | `form/required/record/stage_exit/blocking` |
| 2 | Oregon Nonmedical Exemption | same |
| 3 | School of Enrichment Admissions Packet | same |
| 4 | Tuition & Enrollment Agreement | same |
| 5 | Parent Handbook Acknowledgement | same |

No Direct Payment Authorization · **no packet id stored** · no other stage carries requirements ·
8 stages (4 family / 4 child) · description intact.

And the truthfulness boundary stands: **configured blocking, transition enforcement not yet consuming
Form requirements.**

## §6 — entry point

`entry_points_v1` is still `null`. Not authored, because §7 requires zero errors first and the run
stopped before that.

## Answers

| | |
|---|---|
| Semantic repairs made | **None to the draft.** Code only: the command-set stamp fix (previous run) |
| Status repair proof | Authorable; diagnosis stands (`closed` → `lost`); **not performed** |
| Participant-decision proof | **Blocked — no authoring surface** |
| Command/action selector | Validation errors gone; **pickers still empty** for a second, distinct reason, evidenced above |
| Five requirements | ✅ intact, in order, correct dimensions |
| Entry point | Not authored |
| Final validation | **9 errors** (3 status + 6 grain) — unchanged, because the blocked repair is 6 of them |
| Browser acceptance | Not performed — no session, and one repair has no surface to perform |
| Draft diff beyond normalization | **None from me** |
| **READY TO PUBLISH** | **NO** |

## What unblocks this

1. **Build the participant-decision authoring action + control** (the missing surface above) — then
   the six grain errors become repairable in the product.
2. **Repoint the three close transitions to `lost`** in the existing editor.
3. Then entry point → Validate → Publish.

Step 1 needs your authorization; it is a bounded slice of exactly the shape as the two actions already
shipped.
