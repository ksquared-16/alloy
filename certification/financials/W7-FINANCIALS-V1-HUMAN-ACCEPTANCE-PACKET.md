# W7 — FINANCIALS V1 HUMAN ACCEPTANCE WALKTHROUGH

The starting packet. **Nothing here has been executed**, and no scenario below may be marked PASS
until a human has performed it.

One integrated walkthrough, in the order an operator actually meets the product: what a family owes,
how it got there, who is responsible, how money arrives, what happens to it, and what the record
says afterwards.

---

## ENVIRONMENT

| | |
|---|---|
| Staging URL | https://staging.workwithalloy.com |
| Deployed build | must contain PR #1360. Check `/api/build-info`; a newer SHA is fine and expected. |
| Provider | Stripe **TEST** mode. Nothing here moves real money. |

## THE THREE FIXTURES, AND WHAT EACH IS FOR

| fixture | id | what it holds | rule |
|---|---|---|---|
| **Certhouse Family** | — | W5 evidence: genuine human-authorized Autopay history and real unattended Stripe TEST collections | **READ ONLY.** Do not mutate it to recreate evidence that is already certified. |
| **Certopp Family** | `fcaa839f…` | the Held/Deposit and payer-bank-setup fixture: $332 available prepaid, $37 balance, a non-refundable $40 held deposit, four completed deposits, and one payer-authorized bank method (`STRIPE TEST BANK ••••6789`, Ready) | mutable, and already carries most of what W7 needs to READ |
| **a fresh disposable household** | you create it | anything that must be done from zero, or that would spoil the two above | create, use, abandon |

**Certopp's bank method was authorized by a real payer through the real flow.** Do not create
another one to prove the same thing.

---

## PART 1 — WHAT THE FAMILY OWES

| # | scenario | needs |
|---|---|---|
| 1.1 | Open Financials → Accounts. The queue states a position per account before you click anything. | human |
| 1.2 | Open **Certopp**. Read Balance, Due, Past due, Responsibility, Paid, Available prepaid, Held deposit. Every figure should agree with every other figure on the screen. | human · Certopp |
| 1.3 | Switch the lenses — All, Charges, Credits & adjustments, Funding, Payments. Each should narrow, never re-explain. | human · Certopp |
| 1.4 | Expand a period. Collapse it. The ledger should not re-order itself. | human · Certopp |

## PART 2 — CHARGES

| # | scenario | needs |
|---|---|---|
| 2.1 | Add a charge from a template. Read what it says it will do BEFORE you confirm. | human · disposable |
| 2.2 | Add the same charge again, identically. **The second is a no-op** and the operator should be told nothing new was created, with the row count unchanged. *(This is the one proof the automated run could not obtain — see the debt register.)* | human · disposable |
| 2.3 | Add a charge that needs a service period on a child who has none. The refusal should be a sentence, not a token. | human · disposable |
| 2.4 | Post a draft charge. Reverse a posted one. The reversal should read as a correction, not a deletion. | human · disposable |

## PART 3 — RESPONSIBILITY

| # | scenario | needs |
|---|---|---|
| 3.1 | Open Manage responsibility on Certopp. Read who owes what, and what is unassigned. | human · Certopp |
| 3.2 | Divide a charge between two parties. The split should total the charge to the cent. | human · disposable |
| 3.3 | Try to move a POSTED charge's responsibility without an explicit decision. It should refuse. | human · disposable |
| 3.4 | Let a non-responsible party pay. The record should say who paid AND whose share it met — those are two different facts. | human · disposable |

## PART 4 — MANUAL PAYMENTS

| # | scenario | needs |
|---|---|---|
| 4.1 | Record a cash payment. Apply part of it to a charge. Read the receipt: received, applied, unapplied. | human · disposable |
| 4.2 | Apply more than is unapplied. Refused, with the numbers in the sentence. | human · disposable |
| 4.3 | Reverse an application. The balance should move back; the row should stay, marked reversed. | human · disposable |
| 4.4 | Refund part of a receipt that has unapplied money. **It should reverse nothing** — the unapplied money funds it. | human · disposable |
| 4.5 | Refund more than the unapplied money covers. Only the shortfall reverses applications. | human · disposable |

## PART 5 — STORED CARD

| # | scenario | needs |
|---|---|---|
| 5.1 | Financials → Details → Manage payments. **Add card.** Stripe's own fields; Alloy asks only for the billing ZIP. | human · Stripe TEST · disposable |
| 5.2 | Confirm Alloy never displays a card number — brand and last four only. | human |
| 5.3 | Set a default. Remove a method. A removed method should read as removed, not as never-existed. | human · disposable |

## PART 6 — PAYER-AUTHORIZED BANK METHOD

| # | scenario | needs |
|---|---|---|
| 6.1 | On Certopp, confirm the operator sees **Request bank account setup** and there is **no Add bank account** control anywhere. | human · Certopp (read only) |
| 6.2 | Read Certopp's existing bank method: `STRIPE TEST BANK •••• 6789 · Ready`. No routing number, no account number, no provider ids. | human · Certopp (read only) |
| 6.3 | On a DISPOSABLE household, press Request bank account setup. Confirm nothing is saved on the account. | human · disposable |
| 6.4 | Open the link **on a phone or a private window** — somewhere with no operator session. Confirm it is Alloy's page, that it names the payer, that the debit authorization is readable BEFORE you continue, and that the page asks you for nothing. | **human, and this is the one that matters most** · disposable |
| 6.5 | Complete it with a Stripe TEST bank. Confirm the account appears on the operator's screen only after the payer finished. | human · Stripe TEST · disposable |
| 6.6 | Open the same link again. It should say the request is already completed. | human · disposable |
| 6.7 | Start a setup and walk away without finishing. Come back to the link later — it should still work. | human · disposable |

## PART 7 — PROVIDER COLLECTION

| # | scenario | needs |
|---|---|---|
| 7.1 | Collect an owed charge by card on a disposable fixture. Watch it go from attempt to money. | human · Stripe TEST · disposable |
| 7.2 | Collect by BANK on an obligation the family has NOT already covered. **Processing is not money** — the balance must not move until the provider settles. *(Not exercised automatically; see the debt register.)* | human · Stripe TEST · disposable |
| 7.3 | Try to collect on an account with enough available prepaid. It should refuse — you do not debit a family for money they already gave you. | human · Certopp (read only; the refusal writes nothing) |
| 7.4 | Refund a card collection in part. Then in full. | human · Stripe TEST · disposable |
| 7.5 | Try to refund a BANK collection in part. Refused before the provider is called: a bank payment comes back whole. | human · Stripe TEST · disposable |

## PART 8 — AVAILABLE PREPAID AND HELD DEPOSITS

| # | scenario | needs |
|---|---|---|
| 8.1 | On Certopp, read Available prepaid beside Held deposit. They are different money and the screen should say so. | human · Certopp (read only) |
| 8.2 | Read the non-refundable $40 deposit. Confirm **Refund is not offered** on it, and that asking anyway refuses with the same sentence the preview gave. | human · Certopp (read only) |
| 8.3 | Read **Deposit history** — the completed deposits. They hold no money and change no figure above. | human · Certopp (read only) |
| 8.4 | On a disposable fixture: take a payment, hold part of it, then **Apply** the hold to a charge. The balance falls and the money stops being held. | human · disposable |
| 8.5 | **Release** a hold. No money moves; the restriction ends and it becomes available prepaid. | human · disposable |
| 8.6 | **Refund** a refundable held deposit. It must leave the organisation without passing through available prepaid, and without reversing any application. | human · disposable |
| 8.7 | The same, on a CARD-funded held deposit. *(Cash rail is certified end to end; the provider rail is code proof only — see the debt register.)* | human · Stripe TEST · disposable |

## PART 9 — REFUND VERSUS PROVIDER RETURN

| # | scenario | needs |
|---|---|---|
| 9.1 | On Certopp, read the three refunds. Each should say **Refunded**, and Financial Activity should say **Payment refunded**. | human · Certopp (read only) |
| 9.2 | A provider-origin reversal should say **Returned** and **Payment returned** — because a bank took the money, and nobody here decided it. *(No such row exists on staging. Producing one means manufacturing a chargeback; see the debt register.)* | **deferred** |

## PART 10 — AUTOPAY

| # | scenario | needs |
|---|---|---|
| 10.1 | On Certopp, open Set up Autopay. Confirm it offers the payer-authorized BANK method as eligible. **Do not authorize it.** | human · Certopp (read only) |
| 10.2 | Read the five questions Autopay asks. Confirm none of them exposes an implementation primitive. | human |
| 10.3 | On Certhouse, READ the existing Autopay history. **Change nothing.** | human · Certhouse (read only) |
| 10.4 | Authorize Autopay on a disposable fixture, then pause, resume and revoke it. | human · disposable |

## PART 11 — HISTORY AND ACTIVITY

| # | scenario | needs |
|---|---|---|
| 11.1 | Read payment history on Certopp. Every row should be a sentence about money, not a status key. | human · Certopp (read only) |
| 11.2 | Open Financial Activity. Confirm each entry names what happened and what it did to what is owed. | human · Certopp (read only) |
| 11.3 | Confirm a receipt and an application are different rows with different dates. | human |

## PART 12 — PROVIDER SETUP AND READINESS

| # | scenario | needs |
|---|---|---|
| 12.1 | Open provider configuration. Read readiness in business language — no provider status strings. | human |
| 12.2 | Confirm the organisation's ACH readiness is stated separately from its card readiness. | human |

---

## WHAT IS ALREADY PROVEN, AND WHAT IS NOT

| area | automated deployed proof | still worth a human |
|---|---|---|
| payer-authorized bank setup, end to end | **yes** — real Stripe TEST bank, real mandate, censused canonical row | 6.4 — whether it FEELS safe to a parent |
| setup binding across payers and accounts | **yes** — 404, nothing written | no |
| link open / abandon / save / replay | **yes** | 6.7 |
| operator safe projection | **yes** | 6.2 |
| Autopay eligibility on a bank method | **yes** | 10.1 |
| held deposit Apply / Release / Refund, cash rail | **yes** | 8.4–8.6 |
| non-refundable refusal | **yes** | 8.2 |
| operator-origin reversal reads Refunded | **yes** | 9.1 |
| provider-origin reversal reads Returned | deterministic only | **9.2 — deferred** |
| bank collection on an uncovered obligation | **no** | **7.2** |
| card-rail held deposit refund | code proof only | **8.7** |
| duplicate-charge no-op notice | **no** | **2.2** |

---

## PRE-W7 DEBT REGISTER

Four boundaries, carried deliberately. None reopens certified architecture.

1. **Deployed ACH collection on an uncovered obligation** — not exercised. The controlled account
   held $332 of available prepaid against a $37 balance, and canonical collection correctly refused
   an unnecessary debit. → scenario **7.2**.
2. **Deployed ACH provider return** — not manufactured. Provider-return semantics are bound
   deterministically. → scenario **9.2**, deferred.
3. **Card/provider-rail held Deposit refund** — the cash rail has deployed end-to-end proof; the
   provider rail remains code and unit proof. → scenario **8.7**.
4. **Duplicate-charge no-op notice** — shipped and bound, but without valid deployed mounted proof.
   The automated attempt was refused on its own request envelope, which proves nothing either way.
   → scenario **2.2**.

---

## RULES FOR RUNNING THIS

- **Nothing is PASS until a human does it.** A green automated suite is not a pass in this document.
- **Certhouse is read-only.** Its Autopay history and its real unattended collections are W5
  evidence. Re-creating them would destroy what they are evidence of.
- **Certopp is read-only for the bank method.** It was authorized by a real payer through the real
  flow. Creating a second one proves nothing new and costs the one you have.
- **Stripe is in TEST mode.** If any screen suggests otherwise, stop and write that down — it is the
  most serious finding this walkthrough could produce.
- **Write down what the screen actually said**, not what it should have said. Every label in this
  packet is the one the product rendered when it was written; a difference is itself a finding.
