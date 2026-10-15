# The four charges already posted into a period that has not begun — disposition

**Question the Director asked:** "Also determine how historical future-period charges that are
already POSTED should be treated. Do not rewrite financial history silently. Report whether they
need no action, a one-time governed repair, or only forward-correct semantics."

**Answer: NO ACTION. Forward-correct semantics only.**

## What they actually are

Measured on the deployed primary, `gar_58a6eea3af6f8e` (census artifact beside this file, q1). Four
rows, and they are strikingly uniform:

| period key | period starts | period status | posted on | created on | amount | category | origin | generation | template |
|---|---|---|---|---|---|---|---|---|---|
| `2026-12` | 2026-12-01 | open | 2026-10-02 | 2026-10-02 | $40.00 | one_time | charge_template | canonical | yes |
| `2026-12` | 2026-12-01 | open | 2026-10-02 | 2026-10-02 | $40.00 | one_time | charge_template | canonical | yes |
| `2026-11-30~2026-12-06` | 2026-11-30 | open | 2026-10-02 | 2026-10-02 | $40.00 | one_time | charge_template | canonical | yes |
| `2026-11-23~2026-12-06` | 2026-11-23 | open | 2026-10-02 | 2026-10-02 | $40.00 | one_time | charge_template | canonical | yes |

Two monthly periods and two multi-week periods, one identical amount, one identical day, every one
raised from a charge template. That is not a pattern customer billing produces. It is the shape of
the S5 billing-period **topology certification** — the slice that deliberately bound a monthly and a
weekly account to prove two period shapes coexist — which ran on 2026-10-02.

So the economics in question are the Alloy programme's own certification fixtures, in a staging
tenant, with no family on the other end of them.

## Why no action is the right disposition

1. **They are posted, and posted money is immutable.** Un-posting them is not a capability the
   product has, and should not be: `enforce_childcare_charge_immutability` and the lifecycle both
   refuse an in-place edit of a posted charge. Voiding and recreating them would append four voids
   and four new charges to the ledger — strictly more history, not less — to tidy four rows nobody
   is relying on.

2. **Nothing downstream is wrong.** Their periods are all still `open`, so nothing has been
   finalized on the strength of them; no statement has been issued; no autopay has collected them
   (autopay is due-date gated and these carry no due date reached); and no closed accounting period
   contains a figure that would have to be restated.

3. **A repair would need the authority the gate just took away.** Posting the same economics into the
   period they belong to is exactly what the new lifecycle does going forward. Re-doing it for these
   four would mean reaching past the gate on the deployed estate to recreate charges in a period that
   has not started — a write whose only purpose is cosmetic.

4. **S5 already owns the alternative, if the Director wants one.** If these four should sit in a
   different period, prospective correction is the existing authority for exactly that, and it works
   through the ordinary command rather than a bespoke repair. That is a product act with provenance,
   not a migration.

## What closes the defect instead

Forward-correct semantics, which this slice implements:

* `postChildcareCharge` refuses the early post for every caller, so the next charge dated into
  December cannot become owed in October.
* `financials.future_period_charge.activate` posts it on the day the period begins.
* The Charges surface says *why* a draft is waiting, so a future-period charge is visibly not work.

## What a reader should NOT conclude from this file

That future-period posting never mattered. It did, and in a customer tenant it would be a real
misstatement of what a family owes in a month — money entering the balance, aging, and reaching
autopay's gate before the period it belongs to had begun. The disposition is "no action" because of
**what these four rows are**, not because the defect was harmless.

The historical 35 drafts are a separate population and are untouched by this slice: the census
confirms none of them is bound to a canonical billing period at all (`draft_bound_to_a_period: 0`),
so the gate never reaches them, and the awaiting-posting classifier names them as *unrecorded*
rather than inventing a reason for them.
