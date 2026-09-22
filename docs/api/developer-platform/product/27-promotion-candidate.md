---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — reconciled promotion candidate

**Status: `THREAD7_RECONCILED_CERTIFIED_READY_FOR_PROMOTION_AUTHORIZATION`.**
Not promoted. Not pushed. Awaiting one explicit authorization.

---

## The candidate

| | |
| --- | --- |
| Branch | `agent/thread7-external-resource-discovery` |
| Candidate | **the branch HEAD** — the commit that adds this document |
| Reconciliation merge | `5173806cad2aed3398e8e51a877a21f3c8d5c55e` |
| Reconciled onto | `origin/staging` = `5cc971864` |

*The candidate is named as the branch HEAD rather than a literal SHA because a
document that records its own commit hash is stale the moment it is committed.
The reconciliation merge above is fixed and verifiable; the HEAD is one
documentation commit on top of it.*
| Deployed staging | `5e312eb3a` — **7 commits behind** `origin/staging` |
| Commits ahead of staging | 28 (25 Thread 7 commits + 3 reconciliation merges) |
| Accepted candidate before reconciliation | `bdd4140fe` |
| Tree | clean |

## Reconciliation

Staging moved **twice** during this run — 19 commits at the start, then one more
mid-certification. The candidate is reconciled onto the *current* head, not the
snapshot taken when the run began; the first measurement was re-taken rather
than trusted.

**Zero file overlap, both times.** Staging's work was operator-facing Locations
and Spaces, p076 render performance, and payments. It touched no migration,
nothing under `/api/v1`, the platform library, the public contract, the
developer documentation, or the integrations admin surface.

**The one behavioural question that file overlap could not reveal.** Staging
withdrew `shared_space` from the operator's authoring choices. It does not
change what is *stored* — `CanonicalUnitRole` still carries the value and
existing rows keep their role — and the public Locations read publishes the
stored value without importing that vocabulary. The published enum
(`physical_space`, `operational_group`, `shared_space`, `null`) therefore remains
accurate, and no partner-visible behaviour changed.

**Proof nothing was lost:** `git diff bdd4140fe..HEAD` restricted to the Thread 7
surface — `/api/v1`, `lib/platform`, `docs/api`, `lib/developerDocs`,
`supabase/migrations` — is **0 files**. The merges took nothing from Thread 7,
and `origin/staging` is fully contained.

## Migrations

Staging added **none**, so no collision was possible. Thread 7's three remain the
highest versions in the merged tree, in order after staging's highest
(`20261014120000`):

- `20261015120000_person_side_updated_at_triggers.sql`
- `20261015130000_external_people_read.sql`
- `20261015140000_external_service_state_read.sql`

No renumbering was needed. The trigger migration is unchanged: six person-side
triggers, no backfill, `locations`/`customer_members`/`customers` deliberately
untouched, re-runnable.

## Measured surface

| | Measured |
| --- | --- |
| Public paths | 15 |
| Public operations | 19 — 1 token exchange, 11 reads, 7 governed writes |
| Grantable scopes | 13 |
| Recognised-but-not-grantable | `context.read` |

## Certification on the reconciled candidate

| Gate | Result |
| --- | --- |
| Thread 7 suites | **502 passed / 30 files** |
| Prebuild + governance guards | **7 / 7 green** |
| Canonical `tsconfig.build.json` typecheck | **rc=0** |
| Production build | **rc=0**, 15 `/api/v1` paths |
| Partner package | rebuilt, stale-guard green, archive verified |

### Pre-existing staging failures, attributed

Running staging's own suites surfaced 31 failures. **None is attributable to
this reconciliation**, and the attribution was measured rather than asserted:

- `tests/location` + `tests/runtime` — **28 failures on the candidate, the same
  28 on the base**, by name, not merely by count. All in financials,
  provisioning, focus-panel and process-instance runtime tests. None in a Thread
  7 area.
- `kioskRotation.live` — **3 failures, identical on the base.**

A first comparison showed 3 *extra* failures on the candidate. That was base
skew, not a regression: the base had been measured against a newer staging than
the candidate had merged, and the newer commit was a p076 render-timing change —
exactly the area of those three test names. Re-reconciling onto current staging
made the sets identical. The difference was in the measurement, not the code.

These 31 are staging's own debt. This run did not repair them, because
opportunistically repairing unrelated debt is out of scope for a reconciliation.

## Partner package

`PARTNER_READY`. Regenerated from canonical sources; provider fields still read
*"Provider confirmation required"*; no provider assumptions.

```
/Users/vacilando/Code/alloy-worktrees/documentation-api/dist/alloy-classroom-coach-partner-package.zip
```

```
scp vacilando@vacilandos-mac-mini.tail2aa1af.ts.net:/Users/vacilando/Code/alloy-worktrees/documentation-api/dist/alloy-classroom-coach-partner-package.zip ~/Downloads/
```

## What promotion authorization would permit

**One** action, and nothing beyond it:

> Push `agent/thread7-external-resource-discovery` at its current HEAD, open one
> pull request against `staging`, and merge it as a single promotion.

One candidate, one promotion, one deployment — the whole accepted Thread 7
lineage, not split across several.

Because staging moves — twice during this run alone — a promotion run should
**re-measure `origin/staging` first** and re-reconcile if it has advanced again,
rather than pushing a SHA measured earlier.

After merge: apply the three migrations to the target environment, then verify
the deployed SHA before declaring it done.

## Remaining Thread 7 debt

None in implementation. Relationships and Staff writes remain the named
`DOMAIN_OPERATION_GAP`s, deliberately unbuilt. The specification carries
`PARTNER_READY` rather than `PUBLIC_READY`, which is a Director call.
