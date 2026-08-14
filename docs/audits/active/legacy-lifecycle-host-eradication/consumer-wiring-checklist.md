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
