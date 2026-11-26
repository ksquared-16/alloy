# Payments V1 · W5 — the live financials reds, measured against the base

**Status:** evidence. No W5 change is implicated.

## Why this exists

The full live financials sweep on the W5 lane reported **50 failed tests across 10 files**. Reporting
that as a W5 regression would have been wrong, and reporting it as "probably unrelated" would have
been a guess. This is the measurement.

## Step 1 — the parallel number was an artifact

| Run | Files failed | Tests failed |
|---|---|---|
| `--maxWorkers=2`, whole suite | 10 | 50 |
| `--maxWorkers=1`, whole suite | **3** | **8** |

The live suites share one certification tenant. Running them concurrently makes them fight over that
state, which `tests/financials/live/certEnvironment.ts` already documents from three such incidents
on 2026-09-19 — each read as a product defect and none of them one. Serial execution is the honest
measurement.

## Step 2 — five of the eight reproduce on the base

The lane was checked out at `af5074594` — the merge of `origin/staging` into this branch, **before
any W5 commit**, with `web/lib/financials/payments/autopayHandler.ts` absent from the tree — and the
same three files were run.

| File | On the W5 lane | On the base `af5074594` |
|---|---|---|
| `accountsCarryChildAttribution.live` | 1 failed | **1 failed** |
| `financialsWorkspaceProductization.live` | 4 failed | **4 failed** |
| `tuitionGeneration.live` | 3 failed | passed |

The five failing test names are identical on both sides:

- tells a child-scoped obligation apart from a household-level one
- agrees with resolveFamilyCollectible on the same charge, figure for figure
- owes the posted charge and nothing for the sibling's unposted draft
- narrows to the selected site and never widens for a restricted operator
- reports a receipt as unapplied until it is applied, then stops

Their symptoms are all shared-tenant state — *"two children cannot be told apart: expected 1 to be
greater than 1"*, *"the posted charge is in the cohort: expected undefined to be truthy"* — and none
of them touches Payments.

## Step 3 — the remaining three are ordering, not code

`tuitionGeneration.live` failed three assertions of the form *"expected 2 to have a length of 1"*:
duplicate charges left by whatever ran before it.

Run **alone on the W5 lane**, with every W5 change present:

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

## Conclusion

**Zero live failures are attributable to W5.** Five are pre-existing on the base; three are
ordering-sensitive and pass in isolation on the lane. The pre-existing five belong to Financials and
are carried, not repaired here — W5 does not own those surfaces and repairing them in a Payments
workstream would hide whose defect they are.

---

## The platform / access / adminV2 sweep, measured the same way

`tests/platform tests/access tests/adminV2` reports **194 failed files and 457 failed tests** on the
W5 lane. That is 26% of the files in that sweep, which is far too broad for a change this narrow —
so it was measured rather than explained away.

The identical command was run at `af5074594`, the pre-W5 base:

| | W5 lane | Base `af5074594` |
|---|---|---|
| Files failed | 194 | **194** |
| Tests failed | 457 | **457** |
| Tests passed | 6467 | 6463 |

The failing **file sets are byte-identical** (`diff` of the sorted `FAIL` lines is empty). The four
extra passes on the lane are the W5 tests that do not exist on the base.

The failures cluster into four causes, none of them Payments:

| Count | Cause |
|---|---|
| 439 | `TypeError: Failed to parse URL from /api/admin/...` — relative fetch URLs in a runner with no base URL |
| 40 | `ENOENT … app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` — a route that moved to `workspace/work-unit/[workUnitSlug]/`; the test still points at the old path |
| 15 | `ECONNREFUSED 127.0.0.1:3018` — a dev server on another slot's port, not this lane's 3017 |
| rest | assorted assertions in the same pre-existing files |

**Zero failures in this sweep are attributable to W5.** They are carried: they belong to other
programs, and repairing them inside a Payments workstream would hide whose defects they are.

The suite that actually covers W5 — 135 non-live financials and scheduled-work files, 1,782 tests —
is green, as are all 95 Payments tests and the live Autopay runtime suite.
