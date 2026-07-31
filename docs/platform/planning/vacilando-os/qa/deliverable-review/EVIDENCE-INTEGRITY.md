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
