# §18 — the three deployed surfaces the previous smoke left unobserved

Driven on deployed build `6c1b84fdc` (`/api/build-info`: branch `staging`, production,
`ikaxilmwmrmbagoidedu`). Each as an operator act, not inferred from a route answering 200.

## A · Accounting Period panel — OBSERVED

`?chapter=accounting` opens `financials-chapter-accounting`, and inside it:

| | |
|---|---|
| `accounting-calendar-panel` | present |
| Summary | **CALENDAR Fiscal 2026 · SHAPE Calendar month · STATUS Active · CURRENT PERIOD September 2026** |
| `accounting-period-table` | present, 25 period rows |
| Close controls (`accounting-period-close-*`) | **11** — one per open period |
| Adopt | not offered, correctly: a calendar already exists |
| Canonical read | `/api/admin/financials/accounting-calendar` → 200, 1 calendar, 12 periods, statuses `open` and `closed`, today `2026-09-20` |

Current / next / state / close semantics are all present and agree with the authority behind
them.

**This is also where a defect was found.** Beneath those eleven working Close controls sat:
*"Opening and closing a period is not yet an action in Alloy."* True when written, false since 11B
shipped `billing.close_accounting_period`, and worse than silence — an operator reads it and does
not press the button that works. Repaired to record the limit that IS real (closing is final,
reopening is not an action) and locked as a rule: a surface offering a control must not carry copy
denying that control exists.

## B · Recurring-generation preview — OBSERVED

`billing.generate_tuition` in `mode: "preview"` against the assignment → **200, `ok: true`**. It
previews without writing.

First attempt sent `entity_type: "customer"` and was correctly refused with
`unsupported_entity_type` — the action declares `opportunity_customer_member | opportunity | child
| person`, and the subject is the PERIOD; an entity id only narrows the run.

## C · Prepaid — OBSERVED

On the deployed Financials card: **Available `$125.00`** and **Balance `$1,412.87`**, rendered as
two separate figures. Available prepaid is not netted into Current Balance — the invariant the
Core/Payments contract names.

## Three navigation facts that each cost an attempt

1. **The chapter is a QUERY PARAMETER.** `/organization/financials` is a LANDING page whose seven
   headings are the chapter names; `?chapter=accounting` is the section route. Two attempts
   measured those headings, found no panel, and would have concluded the panel was missing.
2. `billing.generate_tuition` does not accept `entity_type: "customer"`.
3. A relative `fetch` cannot be issued before the first navigation — the page is still
   `about:blank` and the URL has no base.
