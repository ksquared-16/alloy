# Operator surface convergence — build state

Starting staging `4ade23c23`; its 92 commits touch none of this slice's authorities.

## Both approved authority extensions are built and certified at service level

**Charge-scoped responsibility.** `financial_responsibility_arrangements` gains an optional
`charge_id`; specificity becomes CHARGE > CHILD > HOUSEHOLD, decided once in
`arrangementSpecificity` and consumed by `readArrangementInForce` → `resolveChargeResponsibility`.
Shares, validation, effective dating, supersession and the allocation engine are untouched.

Two things were not obvious and both are in the migration:

- the GIST no-overlap constraint keys on `(org, account, child, window)`, so a charge-scoped
  arrangement for a child *would have collided* with the standing one and the database would have
  refused the very thing the feature exists to allow. The charge joins that key; every previous
  collision still collides.
- supersession is per scope, so a charge-scoped arrangement cannot close the standing child or
  household one. Leaving those alone is the whole point.

A trigger enforces org parity, because a valid UUID from another household is still a valid UUID.

**Charge-level discount exclusion.** New `commercial_policy_charge_exclusions` keyed to the charge,
with a NOT NULL reason, the author, and ended/superseded lifecycle. The one canonical resolver
consults it beside the relationship exception and answers `excluded_by_charge_exception` —
deliberately its own reason, because "Excluded for this assignment" would tell an operator the
family had lost the discount entirely when one charge was waived. Operator label: *"Waived for this
charge."*

## Product surfaces done

- **Administration above the ledger.** Responsibility, discounts, payment methods and autopay now
  render before the lens bar instead of after 116 ledger rows. Closes
  `FINANCIALS_ADMINISTRATION_BELOW_LEDGER_FOLLOWUP` build-side; mounted geometry still to confirm.
- **Overview actions** use the canonical primary action instead of `bg-alloy-midnight`. Quiet
  sections stay quiet; the semantic status dot is untouched.
- **Add Charge clutter removed** — the config read-out and the posting prose. The review case still
  speaks because it changes what Confirm does; every posting rule is unchanged.
- **Percentage / fixed / remainder authoring** in the Responsibility depth card, in canonical
  dropdown grammar, with reconciliation stated before Confirm and Confirm refusing an arrangement
  that cannot reconcile.
- **`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` retired** in all three places it was recorded.

## Not built in this effort

- **Charge to** in Add Charge, and the charge-scoped orchestration behind it (§52, §53).
- **Apply / Waive** with reason in Add Charge, and its orchestration (§58–§62).
- Add Charge preview reshaping (§16).
- Mounted, responsive, accessibility and visual certification — these need a deployed build, and
  promotion is not separately authorized.

The two authority halves those surfaces need are finished and locked, so they are now surface work
against settled authorities rather than another authority thread.

## Locks and plants

36 locks added across six suites; 11 plants, each reddening its intended gate:

| # | Plant | Gate |
|---|---|---|
| 1 | charge arrangement affects a sibling charge | specificity |
| 2 | charge arrangement loses to household | specificity |
| 3 | percentage total over 100 accepted | share validation |
| 4 | two remainder parties accepted | share validation |
| 5 | waiver suppresses the relationship-wide discount | resolver |
| 6 | waiver succeeds without a reason | exclusion service |
| 7 | charge exclusion reported as `no_policy_configured` | resolver |
| 8 | administration falls below the ledger again | hierarchy |
| 9 | Overview action returns to navy | action treatment |
| 10 | Add Charge clutter returns | clutter |
| 11 | Confirm without a preview | panel contract |

Two locks were wrong on first pass and both were loosened *toward the requirement*, not away from
it: one forbade hard-coded green anywhere in Overview and reddened on a 1.5px semantic status dot;
one pinned Confirm's exact disabled expression and reddened when the panel became stricter.

## Regression

754 tests / 56 suites green. `typecheck` and `typecheck:tests` are blocked by host validation
capacity held by another lane's production build — retried, not waived.
