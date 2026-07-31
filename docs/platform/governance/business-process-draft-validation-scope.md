# Draft validation scope — what a save may block on

**Status:** active
**Decision:** D3 (drafting half)
**Applies to:** the Business Process Stage / Execution Graph editors

---

## The rule

| | what must resolve |
|---|---|
| **Save a draft** | only what *this edit* introduced or worsened |
| **Validate / Publish** | the whole graph |

Publication is unchanged and unweakened. Nothing in this document is consulted at publish time.

## Why the save gate had to change

`stageOperatingPlanDraftToPersisted` threw on any blocking issue, and the editor called it while
assembling the request body. The consequences:

- A stage carrying **any** pre-existing defect could not be saved at all.
- The throw happened **before** the POST, so nothing reached the server and nothing was logged.
- The operator saw a button that appeared to do nothing.

So a tenant whose graph was already imperfect was locked out of repairing it — and the only way
forward was an unvalidated write path. An all-or-nothing gate on the *draft* does not produce
correct configuration; it produces configuration edited somewhere else.

## Touched scope

Scope is derived, not declared. The editor validates the plan **as saved** and **as proposed**
under identical context, then diffs the findings:

| classification | meaning | blocks the save |
|---|---|---|
| **introduced** | not present before this edit | yes, if severity is `error` |
| **worsened** | present before as a warning, now an error | yes |
| **resolved** | present before, gone now | no — reported as a repair |
| **pre-existing** | present before and after, same severity | no — carried as a warning |

A declared list of "touched paths" was rejected: a save carries the whole plan, so any such list
would have to be maintained in lockstep with every future control, and would silently go stale.
Before-and-after diffing derives the same answer from the only two states that actually exist.

**The unit of scope is the stage's own operating plan** — the object the editor owns and writes.
Cross-stage findings surface at Validate/Publish, where the whole graph is in view.

## Finding identity

Findings are matched on `code` + `controlId` + `template_key` + `outcome_key`. Never on message
text.

`controlId` already names the object a finding is about (`stage-transition-lead_to_tour`,
`work-template-primary-action-contact_family`), so the pair `(code, controlId)` means "this kind
of defect, on this object". Operator copy is meant to be rewritten; a diff keyed on text would
report a wording improvement as a newly introduced defect and freeze every stage in the tenant on
the day someone improved a sentence.

## What the operator sees

- **Blocked** — the first blocking message, a `(+N more)` count when there are several, and the
  view scrolls to the control that caused it. Never a silent no-op, never a raw thrown exception.
- **Saved, still incomplete** — *"Draft saved. This stage still has 2 issues that must be repaired
  before publication."* The count is every remaining error, whoever introduced it.
- **Saved, clean** — *"Saved."*

Telling an operator "Saved" and then refusing them at publish, with no warning in between, teaches
them to distrust both messages. The count is the whole point of the middle state.

## Code

- `web/lib/lifecycle/stageOperatingPlanDraftDelta.ts` — identity, classification, verdict, copy
- `web/components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx` — returns the
  plan and its verdict instead of throwing
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx` — decides, focuses the
  offending control, reports what remains

---

# Appendix — the transition status vocabulary

Found while certifying: a stage carrying the correct, seeded `status_key: "closed"` could not be
saved, and neither could `"open"`. The instinct was to strip the status from the seed to get
certification moving. That would have hidden the actual defect.

## What was wrong

Two vocabularies were being answered by one list:

| | question | scope |
|---|---|---|
| queue membership | which statuses put a record **in** this stage's queue? | disposition layer, filtered per stage — and it **drops** `alloy_layer === "case_status"` rows by design |
| transition status effect | which status does this movement **write** onto the record? | exactly the case layer — `opportunities.status_key ∈ {open, closed}` |

The Stage editor validated the second against the first. Because the queue filter removes
case-layer rows, **no valid transition status could ever resolve**. The editor also dropped
`metadata` when mapping rows, and closure (`terminal` / `is_terminal`) lives there — so even a
delivered `closed` row could not be recognized as closing anything.

`open` and `closed` were present in `status_definitions`, active, and correct the whole time.

## Ownership

A transition's `status_key` is owned by the **case-layer status catalog of the process's primary
entity**. Not the source stage, not the destination stage, not the transition — the transition
only selects from it.

## What changed

`web/lib/lifecycle/loadRecordStatusVocabulary.ts` loads that catalog, carrying `metadata`
through, and the bootstrap exposes it as `record_status_vocabulary`. The editors read it instead
of the queue picker. The seed was not modified.


---

# Appendix — what the drafting-half counter does and does not see

Certification G9 plants a pre-existing defect, saves successfully, and renders **no**
remaining-issues notice. That is correct, and worth stating so it is not read as a bug.

The planted defect is `movement_transition_not_found` — an **execution-graph** finding, raised by
the publish-time graph validator. The drafting-half counter is built from **operating-contract**
and **work-definition** findings, which are the ones the stage editor itself owns and can repair
in place.

That is D3's split working exactly as designed:

- **drafting** sees the stage — what this editor can fix, so blocking on it is actionable
- **publish** sees the whole graph — where cross-stage references resolve or do not

G9 asserts both halves: the save lands (`http 200`) *and* the publish gate still refuses
(`can_publish=false`). Nothing is hidden; the news simply arrives at the gate that can act on it.

A future slice could widen the counter to include graph findings scoped to the stage being
edited, which would make the middle state more informative without changing what blocks what.
