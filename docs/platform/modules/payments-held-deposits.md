---
owner: modules
status: canonical
last_reviewed: 2026-09-20
supersedes: []
---

# Payments V1 · W4 — Held Deposits

**Status:** implemented and certified.

The distinction this exists for: **received money is not available money.** A family's deposit is a
canonical Payment the moment it arrives. What W4 adds is that some of that receipt may not be spent
against ordinary obligations yet.

---

## 1. The arithmetic

    unapplied = amount − active allocations − refunded        (already canonical)
    held      = what payment_holds restricts
    available = unapplied − held

Available prepaid remains a separate account position and is **never netted into Current Balance**.

## 2. No second money spine

No deposit payment, deposit wallet, deposit balance, second prepaid store, second ledger, second
allocation table, second receipt table. `payments` is still the receipt; `payment_allocations` is
still the allocation. A hold says only *this much of that receipt is restricted*.

## 3. A hold is an immutable economic lot

Releasing $200 of a $500 hold must not leave a $300 hold and no trace of the $500 — otherwise "what
did we hold and what happened to it" becomes unanswerable the moment anything partial occurs.

So `payment_holds.amount_cents` is **never decremented**, and every outcome is an append to
`payment_hold_dispositions`:

    remaining(hold) = amount_cents − sum(dispositions.amount_cents)

There is no `state` column, because it would be a flag that can disagree with the rows: a hold is
open while something remains. The architecture packet placed `released_at / released_by /
release_reason` on the hold; those are per-disposition facts, and one set of them cannot describe two
partial releases, so they live on the disposition.

The database refuses an in-place amount change, and refuses `UPDATE` or `DELETE` on a disposition.

## 4. The invariants live in the database

A dollar cannot be allocated **and** held **and** refunded.

    a hold cannot exceed the payment's unapplied remainder
    a hold cannot be disposed of beyond what it held

Both are triggers that lock their row (`FOR UPDATE`), because two concurrent writers each pass a
read-then-write check. Certified live: 30,000 + 30,000 against a 50,000 receipt lets exactly one
through.

## 5. What may be held

Same org, inbound, **posted**, not a refund, and within the unapplied remainder. Pending money cannot
be held — the platform has been *told* about it, not received it. Provider processing money and
collection attempts are not canonical money and cannot be held at all.

## 6. Refundability is a snapshot

`refundable` and `refundable_terms` are captured at creation. If the organisation's deposit policy
changes later, money already held keeps the terms it was taken under — resolving from the *current*
policy would retroactively change what a family was promised. `policy_id` is provenance and is
deliberately not what refund eligibility consults.

A non-refundable hold can still be **released** or **applied**; it is refunding that the terms forbid.

## 7. The lifecycle

**Hold** — `deposit.hold` (`fin.adjust`). Moves no money, creates no receipt, allocation, journal
entry or obligation delta, and does not touch Current Balance.

**Release** — `deposit.release` (`fin.adjust`). Held money becomes ordinary available prepaid money.
Not a refund, not an application, not a change to responsibility.

**Apply** — the **ordinary** allocation authority. The result is an ordinary `payment_allocations`
row. The allocation happens *before* the disposition is recorded: the other order briefly raises
available money — hold gone, allocation not yet made — and something else could take it. This order's
worst case is an overstated hold, which an operator can see; the other risks spending twice.

**Refund** — the **ordinary** refund authority, after hold eligibility resolves. W3's full-only bank
rule still applies: a deposit does not bypass rail limitations.

There is no `deposit.apply` and no `deposit.refund`. They would be second authorities over money that
already has one.

## 8. Current Balance is untouched

    Current Balance = responsibility − APPLIED payment

Held money is not applied money. A family that owes $500 with $500 held still shows **Current Balance
$500, Held $500, Available prepaid $0** — never a $0 balance, and never −$500.

## 9. Ledger and GL

Creating a hold moves no money. Releasing a hold moves no money. So neither produces a receipt
journal entry, a revenue entry or an obligation delta. Applying held money journals through the
existing allocation consequence; refunding it journals through the existing refund consequence. W4
invents no deposit-specific journal math and no second GL balance.

## 10. Where an operator meets it

**Summary** shows position, not administration: `$200 available prepaid` and `$500 held` as separate
figures, never merged and never netted. Zero stays silent.

**Details** owns administration — the receipt, what was originally held, what became of it, under
which terms, since when, and the eligible actions.

Operator language throughout: *held deposit, held funds, available prepaid, release funds, apply
funds, refund deposit*. Never *hold lot, disposition row, payment restriction*.

## 11. Access

    read            fin.read
    hold / release  fin.adjust
    apply           the existing canonical permission
    refund          fin.adjust

No `fin.deposit`. Holding decides what a family's money may be spent on without changing what they
owe, which is the authority `fin.adjust` was minted to separate from ordinary billing.
