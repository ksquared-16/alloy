# Deliverable Review Evidence Integrity V1

## Root cause (W-4 “Automated enforcement tests” = failed)

The suite **actually passed** (`15 passed, 0 failed`, `exit 0`, `ok:true`).

The evidence adapter used a naive regex:

```js
/fail|error|exit 1/i.test(description)
```

That matched the substring **`fail` inside `0 failed`**, so a passing suite was labeled `failed` while Director verification still recommended approve.

## Fix

- Parse `test_run_status` separately from `assertion_behavior` (negative fixtures).
- Count `N failed` numerically — `0 failed` ⇒ suite passed.
- Reconcile worker claims vs structured evidence before readiness.
- Block Approve when reconciliation is inconsistent.
- Evidence cards show: Passed · result summary · criteria · commit.

## Before / after (W-4)

| | Before | After |
|---|---|---|
| Test card | **failed** | **Passed** — `15 tests passed · 0 failed · 2 negative fixtures correctly rejected` |
| Recommendation | Approve (contradiction) | **Approve W-4** only when consistent |
| Approval | Enabled despite failed card | Disabled if any blocking discrepancy |

Screenshot after: `w4-evidence-integrity-after.png`

## Durable policy (Mission 2 W-4 — “70/70 green” → incomplete)

**Root cause:** Worker shorthand (`70/70 green`, results only on `completionReport.tests`)
never matched `N passed` / `ok:true`. Parser returned `incomplete`, and
`tests_passed` treated incomplete as a **hard fail** → Certify stuck forever on re-check.

**Policy (do not regress):**

1. Parse **all** test text: evidence descriptions **and** `completionReport.tests[].results`.
2. Recognize shorthand: `N/N green`, `Tests N passed`, narrative “green across…”.
3. Aggregate via `evaluateAssignmentTests` — any real failure fails; any clear pass passes.
4. **Never** hard-fail Certify solely because one free-text blob is “incomplete” when the
   completion record shows a successful run with no failure signals.

Regression: `scripts/local-dev/tests/deliverable-evidence-integrity.test.mjs`

