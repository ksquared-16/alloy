---
title: Held / Deposit deployed lifecycle
status: measured
measured_on: 2026-09-30
surface: Financials account card (Focus Panel), deployed staging
---

# Held / Deposit deployed lifecycle

What a deposit does on deployed staging, measured through the mounted product on a controlled
fixture rather than in a test harness. Every figure below was read off the rendered stat strip.

## The fixture

**Certopp Family**, `fcaa839f-6960-4b09-b663-b247b99ea9d9` — reserved `enrollment-cert.alloy.invalid`
namespace, canonical `ensure` / `verify` / `reset` authority, and zero prior financial activity.
Certhouse was deliberately left alone: it carries genuine W5 human-authorised Autopay history and
real unattended Stripe TEST collections.

Certfree, the other controlled family, could not be used: `charge.add` refuses its subject with
`unsupported_entity_type` because a context-free family has no household-grain responsibility yet.

Starting state: `CURRENT BALANCE $0.00`, nothing billed, no receipts, no lots.

## The three facts, and how they move

| act | balance | available prepaid | held deposit | responsibility |
| --- | --- | --- | --- | --- |
| receipt $700 recorded (cash) | — | **+$682** | — | — |
| apply $25 to a charge | **−$25** | −$25 | — | unchanged |
| hold $150 as a refundable deposit | unchanged | −$150 | **+$150** | unchanged |
| apply $75 of that deposit | **−$75** | **unchanged** | −$75 | unchanged |
| release a $100 lot | **unchanged** | +$100 | −$100 | unchanged |
| refund an $80 lot | unchanged | unchanged | −$80 | unchanged |

Two rows carry the whole doctrine. **Applying a deposit leaves available prepaid untouched** —
held money never becomes spendable on its way to an obligation. **Releasing changes no balance** —
the restriction ends, nothing is settled, and no allocation is written.

`RESPONSIBILITY` is unchanged in every row. The held/deposit lifecycle moves what money is
available and what it has answered; it never moves who owes.

## What an operator can ask a lot

Each held row answers, in business language: why it is held (its reason is its name), what was
originally held, what remains, how much was applied, whether it is refundable, and on what terms —
*"Refundable on the terms it was taken under"* against *"Taken as non-refundable"*. The terms are
the snapshot taken when the money arrived, never the organisation's current policy.

A non-refundable lot is not offered a Refund control at all. Asked directly, the authority refuses
with `409 hold_not_refundable` — *"This deposit was taken as non-refundable, so it cannot be
refunded."* — before any provider is called, and writes nothing.

A fully disposed lot leaves the list entirely, so *"how much was released"* and *"how much was
refunded"* can be answered only while something of the lot remains. That is a real gap in the
provenance the surface can show.

## What this run had to repair first

Three defects, each found by driving the deployed product and reading what the server actually
answered.

1. **The account grain had no name.** The card dispatches `customer`; `ActionEntityType` did not
   contain it, so `checkContext` refused `deposit.hold`, `deposit.release`,
   `payment.apply_to_charge` and `payment.reverse_application` before they reached their
   authority. The whole held-money lifecycle was unreachable in production.
2. **Refunding a deposit was funded by un-settling obligations.** An $80 refund reversed all three
   of the receipt's applications while $582 sat unapplied, raising the balance by $62 and turning
   the deposit into available prepaid.
3. **Held money was available to spend.** An ordinary application was bounded by the receipt's
   unapplied total, which counts held lots, so $68 of a restricted deposit settled tuition with no
   disposition and no refusal.

The third repair is not on this deployed build. See the run report for its state.
