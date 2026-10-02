---
owner: platform
status: canonical
last_reviewed: 2026-10-02
supersedes: []
---

# Financials V1 — multi-location cutover: the two Director decisions, and what they already are

Two multi-location households were returned as `CUSTOMER_BILLING_CALENDAR_CUTOVER_DECISION_REQUIRED`
because neither could be initialised deterministically from historical fact. Both have now been
decided. This records the decisions and — more usefully — measures whether the deployed estate
already matches them, because a decision that merely restates the live state needs no change and a
decision that contradicts it needs one.

Both were verified read-only against deployed. **Neither required any write.**

---

## `29944d3e` — RESOLVED: legacy-monthly history plus explicit-biweekly canonical future

**The evidence that looked like a contradiction.** 86 charges, every one monthly-shaped and
legacy-keyed; and an *explicit biweekly customer billing calendar* with open canonical periods. The
cutover census reported this as a conflict: history says monthly, configuration says biweekly.

**The decision is that it was never a conflict.** Under S2 these are two generations of authority,
not two answers to one question:

| | authority | representation |
|---|---|---|
| history | the monthly interpretation in force when those rows were written | `billing_period_generation = 'legacy'`, monthly `legacy_billing_period_key` |
| future | the household's explicit biweekly calendar, from its effective boundary forward | `billing_period_generation = 'canonical'`, a real `billing_period_id` |

So the column *is* the cutover, exactly as option B intended. The two coexist by design, and the
household needs nothing done to it.

**Explicitly forbidden, and not done:**

- historical monthly membership was **not** rewritten;
- the explicit customer calendar was **not** replaced with the location default;
- no fake monthly customer override was created to make history and configuration resemble each
  other. That last one is the tempting repair and it would have been the worst: it would have
  manufactured commercial intent nobody expressed, purely so a census would stop reporting a
  difference that is not a defect.

Measured on deployed: 7 reduction applications and 21 draft charges on this household, all legacy —
untouched.

---

## `50b19065` — LEAVE UNCONFIGURED: the refusal is the correct behaviour

**The evidence.** Multi-location, no historical charges at all, no explicit customer calendar. There
is no commercial behaviour from which a cadence could be inferred, so any choice would be new intent
invented by an agent rather than expressed by an operator.

**The decision.** Leave it unconfigured. Canonical period-bound economic creation continues to
REFUSE for this household until an authorised operator chooses its billing calendar. This is genuine
missing commercial configuration, and a refusal is the honest answer to it.

**Verified on deployed — the refusal is already holding, and nothing has leaked past it:**

| | measured |
|---|---|
| customer billing calendars | 0 |
| canonical billing periods | 0 |
| charges | 0 |
| reduction applications | 0 |

And the ambiguity is real rather than nominal: the household holds **two active agreements at two
different locations whose location defaults disagree** — `monthly` at `1a5644a7`, `weekly` at
`e9ed1883`. Picking either would be picking, and the four shortcuts that would have resolved it are
all forbidden and all absent: no first-location rule, no monthly default, no "the calendars happen to
agree" shortcut (they do not agree), no org fallback, no first-agreement rule.

---

## What the operator sees today — the one thing that is not acceptable

Carried forward to the next Financials convergence slice as a bounded presentation/API repair, per
§8. It does **not** reopen S2 resolution doctrine: the refusal stays, only its presentation changes.

The reported HTTP 500 is **confirmed, and now located exactly.**

`BillingPeriodBindingError` is thrown in exactly one place
(`web/lib/financials/billingPeriods/bindChargeBillingPeriod.ts`) and **caught nowhere** — a
repository-wide search finds no other file that so much as names it. Its fate at every route
boundary is therefore an accident of whatever generic handler that route happens to have:

- `operationalEnrollmentErrorResponse` maps `OperationalEnrollmentServiceError` (404/409/500/400) and
  `RangeError` (400), then falls through to `{ code: "internal_error" }, status 500`. Two routes
  reach the binder through it — `/api/admin/financial/charge-templates/simulate` and
  `/api/admin/financial-charge-preview` — so an unresolved multi-location household yields **500 with
  `code: "internal_error"`** there.
- `billing.adjust_account` is already acceptable by accident: its own catch returns **400** with the
  binding error's message. The message is genuinely business language — *"This household has no
  usable billing calendar, so there is no commercial period to bill into."* — so the words are
  already right. What leaks is the **status and the code**, not the sentence.

**The repair shape, bounded:** give `BillingPeriodBindingError` one mapping — an operator-resolvable
**409 conflict** carrying its own code (`billing_calendar_ambiguous`, `customer_unresolved`,
`billing_calendar_invalid`) instead of `internal_error`, with the existing business sentence. One
function, no doctrine change, no schema change. The reason it is carried rather than done here: §8
assigns it to the next slice, and a 500 on a preview path does not block the auto-post certification.

---

## One operator-legibility nit found while proving the deployed path

Measured in a read-only preview on the synthetic fixture: `billing.adjust_account` with
`charge_category: "credit"` and a positive `amount_cents` previews as

> *"credit of $1.00 — increases what the family owes."*

A **credit** that reads as *increasing* what the family owes is a sign-convention surprise in the
operator's own words. The economics are not in question — the service writes the reduction as its
negative — only the sentence. Worth folding into the same presentation slice as the item above.
