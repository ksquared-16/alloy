---
owner: platform
status: canonical
last_reviewed: 2026-09-13
---

# Thread 5 producer/bridge retirement — promotion blocked

Run `erun_a062fe74d4c7a908`. Verification only. No engineering, no new PR, no new
merge action, nothing applied to any deployed database.

## The governed action was consumed, and it is terminal

`gar_42e0cf0039900c` — `repository.merge_pull_request` — **failed, terminal**.

The mission brief described it as awaiting operator approval. That is stale. The
record shows the operator approved it at `15:41:24.529Z` and it failed sixty
milliseconds later at `15:41:24.589Z`:

```
failure_code   : execution_failed
failure_reason : hosted_migration_behind
```

It cannot be consumed again. Nothing it would have changed has changed:
`origin/staging` is still `b120b4c8c513`, PR #895 is OPEN with no merge commit,
and the branch is still at the certified candidate `14724ed0766e`.

**There is therefore no merge SHA, no final staging SHA, no ancestry and no
promoted tree.** None of the promoted-tree verification this mission asks for is
measurable yet, and none of it is reported as done.

## Two gates failed, not one

`director_decision.failed_gates` records both:

| Gate | Result |
|---|---|
| `hosted_migration_parity` | false → `hosted_migration_behind` |
| `required_checks_successful` | false |

### The parity gate is expected, and the candidate did not cause it

A governed census of `alloy_deployed_primary` (`tha_7c6e3ceea6accb`, run
2026-09-13T15:43:37Z) puts the deployed ledger head at **`20260913030000`** with
428 identities.

That is *exactly* current staging's latest migration. The deployed primary is not
behind staging at all. It is behind this candidate by precisely the two
migrations the candidate adds, `20260913160000` and `20260913161000`, which is
the normal condition of any migration-bearing pull request before it merges.

So this is the designed pre-merge parity gate doing its job, not a defect in the
candidate. By contract, this refusal is also what grants pre-merge production
apply authority.

### The second gate is unreconciled

`required_checks_successful` evaluates to
`passing === total && failing === 0 && pending === 0`. The `proposal_snapshot`
embedded in the **same record** reports `required: 3, passing: 3, failing: [],
pending: [], missingRequired: []`, which satisfies that expression. The gate
nevertheless recorded false, and the audit log does not carry the raw counts that
fed it.

This is recorded as an open question, not diagnosed. It matters because applying
the migrations would clear the parity gate and leave this one unexplained.

## An ordering hazard the usual remediation does not account for

The standard response to `hosted_migration_behind` is to apply the candidate's
migrations to the deployed primary and re-propose the merge. For these two
migrations that order is **unsafe**, and it is worth stating before anyone runs
it by reflex.

Both are destructive. Their safety depends on the code retirement landing first,
and it has not:

| Still present on `origin/staging` today | Uses |
|---|---|
| `producerAdministration.ts` | 3 reads of the dropped tables |
| `app/api/admin/attendance/producers/route.ts` | GET |
| `…/producers/[producerId]/route.ts` | DELETE |
| `…/producers/[producerId]/sites/route.ts` | 2 writes to `producer_sites` |
| `AttendanceIntegrationsConfigurationPage.tsx` | the screen over all of it |

Applying the drops before the merge would leave the deployed application reading
and writing tables that no longer exist, for the whole window between apply and
merge.

The blast radius is small and knowable rather than unbounded: every measured
environment holds zero producers, so that surface renders an empty state today.
After a pre-merge apply it would raise an error instead. Nothing else in the
product touches those tables.

## Options, for the operator to choose between

1. **Apply, then merge, and accept the window.** The contract's intended order.
   The producer admin screen errors instead of showing an empty list until the
   merge lands. Smallest process deviation; a brief, visible, operator-facing
   fault.
2. **Grant a parity exception for this candidate and merge first, then apply.**
   No broken window, because the code that uses the tables leaves in the same
   merge. Requires a governance decision the parity gate is designed to refuse.

Either way a **new merge action is required**, because `gar_42e0cf0039900c` is
terminal. This mission was instructed not to create one, which is why promotion
cannot complete inside it.

## The candidate is intact and unchanged

`14724ed0766ed2cc5d8cb52521cd79ab0c6cff1f`, still the remote branch head, still
clean. Certification from the previous run stands: live Attendance gate 69 pass /
0 fail / 0 skip, headless 10 files / 179 tests, `typecheck` and `typecheck:tests`
both `rc=0`, route-capability guard 635 routes with ceiling 631, and all 13
substantive CI checks green with zero pending.

No engineering was reopened. There is no evidence the candidate caused this
failure, and none was sought beyond confirming it did not.
