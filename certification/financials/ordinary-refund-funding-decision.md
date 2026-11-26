<!--
A DECISION PACKET, not doctrine. It states a question the code cannot answer for itself, the
measurements that frame it, and what each answer would cost. Nothing here changes behaviour.
-->

# Decision: what funds an ordinary refund

## The question, in one line

When a receipt still holds unapplied money, should refunding part of it **reverse applications**
that settled the family's obligations — or **consume the unapplied money first**?

Today it reverses, always, oldest-first, without looking at the unapplied balance.

## What was measured

`web/tests/financials/payments/ordinaryRefundFunding.test.ts` records six cases against the current
authority. Case B is the one in dispute:

| | before | after |
| --- | --- | --- |
| receipt | $500 received, $100 applied, $400 unapplied | $500 received, $20 applied, $472 unapplied, $80 refunded |
| charge outstanding | $200 | **$280** |

An $80 refund, against $400 of unapplied money, reversed the application and added **$80 to what
the family owes**. The other cases are not in dispute: A reverses nothing because nothing is
applied; C and D must reverse, because the unapplied money cannot cover the refund; E is the held
lot, already repaired; F is a provider return and is a different act entirely.

## Why the code cannot decide it

**Both models are internally consistent.** After an $80 refund of a $700 receipt with $113 applied:

- reversing gives $620 retained, $33 applied, $587 unapplied — `33 + 587 = 620` ✓
- consuming unapplied gives $620 retained, $113 applied, $507 unapplied — `113 + 507 = 620` ✓

Neither breaks an invariant. Neither needs a new GL engine: the balance is derived from charges and
active applications, and the refund entry's own obligation delta is zero in both, because the
obligation delta comes from the reversals — of which there would simply be none.

**The held-lot exemption does not generalise.** `b8e9fb34b` exempted a held lot on the ground that
its money is unapplied *by construction* — `enforce_payment_hold_within_unapplied` guarantees it,
and the operator named the lot. Ordinary unapplied money carries neither guarantee: the operator
said "give back $80" and did not say which $80.

**The current rule does not serve the intent people assume it does.** "Reverse the last thing I
did" is a coherent intent, but the engine reverses OLDEST-first, which is its opposite.

## What each answer costs

**Keep reversing.** No change, no migration, no risk. An operator returning a credit balance
silently re-opens settled obligations, and the account they are looking at disagrees with what they
thought they did. Every tenant carries this today.

**Consume unapplied first.** A refund becomes purely a reduction of retained money whenever the
receipt can fund it, and the family's settled obligations stay settled. It changes ordinary refund
semantics for every existing tenant, and it changes what historic refunds *would have* done — not
what they did, since nothing is recomputed. `providerDispute` stays as it is either way: a
chargeback is money the bank withdrew, not a deposit going home.

## What is needed

One decision on the preferred invariant, and whether it applies only to operator-initiated refunds.
The repair is bounded — it is the same shape as the `heldLotId` exemption, in the same function, and
the characterisation suite above will show exactly which case changed.
