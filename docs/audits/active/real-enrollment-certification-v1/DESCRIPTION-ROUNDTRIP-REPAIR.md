# The description round-trip repair

**Run:** `erun_6bac7253f40073d6` · **§1 and §2 complete** · **Publish blocked by the sandbox, tenant untouched**

## The defect, precisely

`processes[].description` was **owned but never read**.

* Writable through the live canonical API — `updateProcessDescription`, reached from
  `/api/admin/departments/[departmentId]/lifecycle-builder`.
* Documented as *"shown on /workspace department tile when synced to departments.description"*.
* Listed in `PROCESS_OWNED_KEYS`, which is what `captureUnknownFields` uses to decide what the
  residue must preserve — so declaring it owned is what *stopped* the residue from saving it.
* Never read by the process assembly in `parseLifecycleBuilderV1`.

It therefore fell through both paths. And because every canonical save round-trips the payload
through this parser — `saveDraft` serializes the builder, and `saveLifecycleStageRuntimeConfig` goes
through the same pair — an operator could type a description and the **next save of any part of the
configuration** deleted it. Publishing would then have written that deletion into an immutable
revision.

## The fix

One field, using the idiom the stage assembly beside it already uses:

```ts
...(typeof row.description === "string" && row.description.trim()
    ? { description: row.description.trim() }
    : {}),
```

Absent stays absent and whitespace-only stays absent, matching what `updateProcessDescription` itself
does — so no existing draft gains a key on its next save, and the pre-publish diff keeps its ability
to say "nothing else moved".

Not done, per the instruction: not moved into unknown fields, no parallel metadata copy, no
tenant special-case, deletion not accepted.

## The proof

`tests/lifecycle/lifecycleBuilderOwnedKeyRoundTrip.test.ts` — **9 controls**, written against the
OWNED-key *lists* rather than this one field, because the defect is a class: any future key added to
an owned list without a matching read reintroduces it.

The required control, plus the ones that make it mean something:

* authored description → parse → serialize → **same description**;
* survives a **second** round trip — one save was never the failure mode;
* survives a save that edits something else entirely, which is how it was actually lost;
* round-trips what the **canonical writer** writes (`updateProcessDescription`, trimming included);
* absent stays absent; whitespace-only stays absent;
* every owned process/stage key present in a payload is present after the round trip;
* keys the parser does *not* own still ride the residue — proving the fix did not smuggle
  `description` into unknown fields.

**Verified red before green:** 6 of the 9 fail on the pre-fix parser. And the lifecycle failing-test
*list* — not just the count — is otherwise identical before and after: **84 pre-existing failures, 0
newly broken**, the only movement being those 6 going red → green. The 84 are unrelated product-logic
failures already on the branch (e.g. `actionIntakePasteParser` mis-assigning intake notes); they are
lane debt, untouched here. `vac run typecheck:tests` rc=0.

## The gate it was blocking is now clear

Re-running the pre-publish diff against the live certification draft:

| | Before the repair | After |
|---|---|---|
| Round-trip differences on the untouched draft | 15 | **14** |
| `processes[0].description: REMOVED` | present | **gone** |

The remaining 14 are all documented deterministic normalization — `manual_status_transition_policy_v1`
materialized from defaults, `completes_work`/`successful` materialized on 9 stage-operating-plan
outcomes, and three catch-all `compat_queue_key` strips that
`normalizeCatchAllWorkViewCompatBinding` performs by design.

Before → after with the authored change adds exactly two keys, both authorized:

```
processes[0].entry_points_v1        = { version: 1, by_intent: { enrollment_start: "enrolling" } }
processes[0].stages[5].requirements_v1 = 5 × kind:"form"   (stages[5] is `enrolling`)
```

Nothing outside the authorized change and deterministic normalization moves. **The §7 stop condition
from the previous run is cleared.**

## What did not happen

Authoring and publishing revision 1 — the second half of option 1 — **did not run.** The publish
script was refused by the sandbox classifier, and I did not route around it.

Tenant re-verified untouched afterwards: draft `fa0b9c36` still at `draft_revision` 1,
`business_process_revisions` still **0**, `process_instances` **0**.

Note also that the instruction as delivered was **truncated mid-sentence** in §2, so anything it may
have said about authoring or publishing did not reach me. Both facts point the same way: the repair
is done and the publish is a separate, still-pending step.

## Ready to execute

Everything the publish needs is settled and unchanged from the previous run: entry stage `enrolling`,
five requirements by definition identity with `level: required · scope: record · timing: stage_exit ·
enforcement: blocking`, and a BP-derived packet proven semantically identical to Studio packet
`579327c1` — 5 forms, same order, same identities, 3 uploads, 5 signatures, 0 bank-credential asks,
zero drift.
