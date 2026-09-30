<!--
A CERTIFICATION EVIDENCE RECORD, not doctrine — which is why it lives here and not under
docs/platform/. It reports what was measured on deployed staging on 2026-09-30, driving the real
product with a real Stripe TEST bank account. The doctrine is
docs/platform/financials/payments-bank-setup-handoff.md.
-->

# Payer-authorized bank setup, on deployed staging

| | |
| --- | --- |
| merge SHA | `75c1a016c` (PR #1356 into `staging`) |
| deployed SHA | `4556a784e`, then `bad749b3f` — both contain the merge |
| fixture | Certopp Family `fcaa839f…`, payer **Bo Certopp**. Certhouse was never touched. |
| provider | Stripe TEST (`pk_test_…`), merchant ACH-ready |

The merge SHA and the deployed SHA are different on purpose: two commits landed on `staging` while
the build was running and Vercel cancels a superseded deployment, so containment was proved with
`git merge-base --is-ancestor` rather than by waiting for an exact match that never comes.

## The deployment carries it

| measured | result |
| --- | --- |
| `payment-method-request-bank-setup` on the operator surface | present |
| the retired operator **Add bank account** path | absent — no such string anywhere on the surface |
| `/bank-setup/<token>` and `/api/public/bank-setup/<token>` | both served |
| `payment_method.request_setup` | registered, capability-classified, admitted through `/api/admin/actions/execute` on `fin.write` |

## The operator asks, and that is all they do

Pressing **Request bank account setup** returned a link and changed nothing:

| | before | after |
| --- | --- | --- |
| payment methods on the account | 0 | 0 |
| account position | unchanged | unchanged |

The link is a 48-character bearer token at `/bank-setup/<token>`. The short-code form is
deliberately not offered for this act.

## The payer authorizes, in a browser with no operator session

Every payer step below ran in a clean browser context — no cookies, no session, nothing.

| measured | result |
| --- | --- |
| Alloy's own page, input elements | **zero** — there is nowhere here for a credential to land |
| mandate disclosure | rendered verbatim, above the provider's own terms and above the submit |
| provider fields | Stripe's iframe: Email, Full name, bank search, "Enter bank details manually" |
| opening the link | does **not** consume it — reload still offers setup |
| abandoning after `begin` | link still usable, `begin` succeeds again, **no method written** |
| public GET payload | carries `payer`, `canAddBankAccount`, `unavailableReason`, `authorizationDisclosure`, `savedMethods` and a `pk_test_` publishable key — scanned for `routing`, `account_number`, `client_secret`, `cus_`, `seti_`: none |

The bank was chosen through Stripe's own Financial Connections flow — Test (Non-OAuth) → Link →
"Agree and continue" → account **Success ••••6789** → "Your account was connected." The payer then
pressed Alloy's **Authorize and save**, and Alloy said:

> Your bank account is on file — STRIPE TEST BANK ending 6789 — ready to use.

## What was written

Censused on `alloy_deployed_primary` (`tha_c672e122a53dc7`):

| fact | value |
| --- | --- |
| rows for this account on the bank rail | **exactly 1** |
| rail / processor | `ach` / `stripe` |
| display | `STRIPE TEST BANK`, last4 `6789` |
| verification / usability | `verified` / `usable` |
| payer | `person`, named |
| account scope | present |
| provider references | `pm_…` and `cus_…` present, by prefix only |
| mandate reference | **present**, and `mandate_accepted_at` set |
| `created_by` | **absent** |
| credential-shaped columns on the table | **none** |
| payments / collection attempts on the account | **0 / 0** |

`created_by` absent is the single strongest fact here. The card path records the operator who
acted; the payer path passes null, because no operator was there.

## The link's life

| event | result |
| --- | --- |
| OPEN | usable |
| ABANDON after `begin` | usable |
| SAVE | consumed |
| reopen after save | "This request has already been completed." |
| `begin` replay after save | 409, and no second method |

One link, `entity_type: person`, consumed once, expiry **168 hours** — set explicitly, not the
module's two-hour default.

## The binding, attacked

Two links for two payers on two different accounts (Certopp and Certfree), and one setup offered to
the wrong one:

| attempt | answer |
| --- | --- |
| complete payer B's link with payer A's setup | **404 `not_this_payers_setup`** — "Nothing has been saved." |
| complete with a setup Alloy never created | refused before any write |
| complete naming no setup | 400 |
| an unknown token | 404 "This link is not valid." |
| `action: "save_routing_number"` with a routing number in the body | 400 "Unsupported action." |

Method counts after all of it: Certopp 1 → 1, Certfree 0 → 0. **No canonical Payment Method was
written on any mismatch.**

## What the operator sees

> STRIPE TEST BANK •••• 6789 · Ready · Remove

Scanned: no routing number, no account number, no `pm_`, no `cus_`, no `seti_`, no mandate
internals, and no provider status vocabulary. The only occurrence of "Stripe" is the bank's own
display name in test mode.

## Autopay

The existing Autopay authority — unchanged, and with no ACH-specific engine — offers:

> Payer **Bo Certopp** · Payment method **STRIPE TEST BANK •••• 6789** · Amount due · On each due
> date · No limit

No arrangement was authorized. Eligibility was the question; enrolling is a human's act.

## Phase A on deployed

"Payment refunded" is what BOTH the derived label and its neutral fallback produce for an operator
refund, so reading it proves nothing. The VM's own value does distinguish:

| row | `data-financials-payment-kind` | `data-financials-payment-origin` | reads |
| --- | --- | --- | --- |
| three refunds | `refund` | **`operator`** | "Refunded · Cash" |
| the receipt | `receipt` | absent | "Received · Cash" |

Financial Activity shows three `payment_refunded` entries, all "Payment refunded", and "Payment
returned" nowhere — correctly, because no provider-origin reversal exists.

## Three things deployed QA caught, now repaired

| finding | state |
| --- | --- |
| the payer page read `people`; the table is `persons`, so it was addressed to nobody | repaired, bound |
| `/bank-setup/<token>` inherited the marketing site — Sign In and Book a Demo above the mandate | repaired, bound |
| a tampered setup answered `No such setupintent: 'seti_…'` — the provider's sentence to a payer | repaired, bound |

## Boundaries, stated rather than worked around

**ACH return / provider-origin reversal.** Staging has none, and producing one would mean
manufacturing a chargeback. Declined. The provider branch is bound deterministically (11 cases; 5
fail with the repairs planted out) and is unproven on deployed.

**Bank collection.** Refused by the product, correctly: *"Nothing is currently collectible on this
obligation."* Certopp holds **$332.00 of available prepaid** against a **$37.00** balance, so the
collectible ceiling is zero — you do not debit a family's bank account for money they have already
given you. Proving the rail end to end needs an uncovered obligation, which means manufacturing
fixture history. The rail itself is certified by the live suites.

**ACH refunds.** A partial ACH refund is refused at eligibility, before the provider is called, by
Alloy's own sentence. Bound deterministically; not re-exercised on deployed, because the rule binds
without issuing real refund activity.

**Duplicate-charge mounted notice.** NOT obtained. The probe posted `charge.add` with an empty
`entity_id`, which that route requires, so both asks were refused identically — "added: 0" there is
an artifact of a bad envelope, not a no-op, and reporting it as the proof would be dressing a
refusal up as a result. Obtaining it properly means driving the mounted Add-charge form twice on a
fixture whose history this run had no other reason to grow.

**Card-rail held Deposit refund.** Still unproven end to end. The controlled fixture's held
deposits are cash-rail, and this run gave it a BANK method, not a card. Proving it needs a
provider-backed receipt with a held lot raised from it.

## Regression

53 files / 779 tests green across payment methods, payer ownership, provider installation,
collection, recognition, refund, responsibility, Financials projections and the participant
credential path; plus the webhook and action-link replay suites. No attributable red.
