# Contextual focus — the consumer wiring checklist

Produced by admitting `ContextualFocusAnswer` to the `ProvisioningAnswer` union and letting CI's
exhaustiveness failures enumerate every consumer. Local `tsc` cannot run on this host, so CI is the
enumerator — PR #432, run `31849133743`.

**42 errors across 8 files.** Each is a consumer that must explicitly decide what it does when no
cohort is selected. None may be silenced by widening a type or re-defaulting a lens — that would
restore the defect.

## Product code

| File | Errors | What it must decide |
|---|---:|---|
| `components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx` | 6 | render the surface with **no pill selected**, no queue page; Focus Panel still composes |
| `lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts` | 5 | build a surface model with `activeWorkView: null` and no rows/rowGrain |
| `lib/presentation/runtime/useWorkUnitSettlement.ts` | 3 | Settlement has no cohort to count — must not fabricate totals |
| `lib/runtime/provisioning/provisioningAnswerDestination.ts` | 1 | URL projection carries **no** `work_view_id` |
| `lib/runtime/kernel/provisioning.ts` | 1 | K2 accepts a contextual answer as a valid prepared state |
| `lib/runtime/provisioning/contextualFocusAnswer.ts` | 2 | **FIXED** — wrong import path for the grain types |

## Tests

| File | Errors |
|---|---:|
| `tests/runtime/d4Focus.test.ts` | 4 |
| `tests/runtime/d3AttentionToProvisioning.live.test.ts` | 2 |

These assert against `activeWorkView` unconditionally; they need to narrow on the terminal first.
Their existing assertions must be **preserved**, not relaxed — they are the operational-path
regression gates.

## The rule while wiring

Every fix must take the form "when there is no selected cohort, do X" — never "assume there is one".
`hasOperatorSelectedWorkView` is the single predicate for that question; do not re-derive it per
component.

## Remaining after this checklist is cleared

producer branch in `workUnitProvisioningAnswer.ts` (explicit contextual intent, distinct from
`work_view_id = null`) → cold entry → kernel attention movement → Search wiring → browser cert →
merge.

---

# BLOCKER found while clearing the checklist — `DestinationId` cannot express contextual focus

`lib/runtime/graph/destinationId.ts`:

```ts
export type DestinationId = {
    workUnitId: string;
    workViewId: string;          // ← NOT nullable
    subjectId: string | null;
    focusMode: FocusMode | null;
};
```

`destinationIdFromAnswer` is the canonical map from a provisioning answer to the history/destination
key. Contextual focus has **no** Work View, so it cannot produce a `DestinationId` as typed. This is
not a rendering decision that can be made per-consumer — it is the shape of the runtime's destination
model, and it decides how contextual attention behaves in history and Back navigation.

Two resolutions, and the repository does not settle it:

**Option 1 — `workViewId: string | null`.**
The honest modelling: a destination that selected no cohort says so. The encoder already carries a
`NULL_SEGMENT` sentinel ("Sentinel a segment collapses to when its value is `null`"), which suggests
nullable segments were anticipated. Cost: ripples to every `DestinationId` consumer, and each must be
checked for the same defect this sprint exists to remove — a null lens quietly re-defaulted on
restore.

**Option 2 — contextual focus returns `null` (no canonical destination).**
Smaller blast radius, but it means contextual attention is **not restorable from history**: a Back
navigation to a contextual state has nothing to key on, and would fall through to whatever the
surface resolves — very likely the host unit's default view, which is the original defect arriving by
a different road.

Option 1 looks correct on the evidence (the sentinel exists precisely for this), but it is a change to
the runtime's canonical destination identity and should be made deliberately, with the full
typecheck loop available to enumerate its consumers — the same forcing-function method that produced
this checklist.

**Nothing was changed for this item.** A speculative edit was reverted rather than left on a decision
that had not been made.
