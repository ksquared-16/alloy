---
owner: platform
status: canonical
last_reviewed: 2026-09-25
supersedes: []
---

# Bank account setup is the payer's act — the handoff, and the slice that builds it

**Status:** boundary established; participant flow NOT built.
**Established:** Payments V1, Payment Method experience productization.

## The finding

Mounted deployed QA reached a working Add bank account flow: Stripe Financial Connections
rendered, asked for email, full name, institution search and manual entry, and presented mandate
language of the form *"By saving this bank account you authorize Alloy, on behalf of the childcare
providers you are enrolled with, to debit it…"*.

It functioned. That is exactly why it needed a decision rather than a certification.

## Why an operator must not complete it

Saving a bank account is not the bank-rail equivalent of saving a card. A card setup stores an
instrument; a bank setup establishes a **debit mandate**. Stripe's ACH terms place the warranty on
the platform:

> When you use Stripe to initiate ACH Network Transactions with your Customers, you represent and
> warrant that: (a) you have all necessary authorizations and approvals from your Customers for
> Stripe to transmit an ACH Network debit or credit Transaction to the Customer's bank account and
> (b) the information you provide Stripe about each ACH Network Transaction is accurate, timely and
> complete, **including the name of your customer that authorized you** to initiate the ACH
> transaction to their bank account.

— <https://stripe.com/legal/ACH>

Stripe's ACH Direct Debit setup guidance adds that the mandate terms must be displayed for **the
customer** to accept before the SetupIntent is confirmed, and that a confirmation of the mandate
and the collected bank details is emailed to that customer afterwards.

So an office operator clicking through that mandate produces three untruths at once: Alloy warrants
an authorization nobody gave, the "customer that authorized you" is a person who was not present,
and the payer receives an email confirming a debit authorization they never agreed to. None of
those are UI problems, and none are fixed by relabeling the control.

**Decision:** the operator `Add bank account` control is removed until the payer-authorized flow
exists. A disabled control was considered and rejected — *disabled* reads as "your action, not
right now", when the truth is that it is not the operator's action at all.

Card is unaffected. A card setup stores an instrument and carries no mandate of this kind, so the
operator may complete it, and W5 certification proceeds on card.

## The canonical handoff contract

No second payment-method table, no second provider integration, no duplicated payer truth. The
existing canonical `payment_methods` model and the existing Stripe integration are the only ones.

```
Financials operator
  → creates a Payment Method setup REQUEST   (account + payer + intended rail)
  → payer receives / opens a secure participant surface
  → Stripe tokenization + Financial Connections happen in the PAYER's session
  → payer supplies the mandate authorization themselves
  → Alloy completes the SAME canonical payment_methods row
  → Financials reads it, with payer, bank name, last4, verification state
```

The operator's half is a request and a reading. The payer's half is the authorization. The
canonical row is shared, and it is written exactly where it is written today.

## The seam this should be built on

A token-addressed participant runtime already exists and is the intended host — this slice does
**not** need a new participant platform:

- `app/action/[token]/page.tsx` — the participant-facing surface
- `app/api/action/[token]/route.ts` — resolves a token to `{ org_id, action_type, entity_type,
  entity_id, expires_at, consumed_at, metadata }`
- sibling token surfaces: `app/a/[token]`, `app/forms/embed/[token]`, `app/tour-booking/[token]`

`public.action_links` already carries most of what a payment setup link needs, measured from the
migrations rather than assumed:

| Column | What it gives the slice |
| --- | --- |
| `org_id` | tenancy, resolved from the row and never from provider metadata |
| `entity_type` / `entity_id` | names the payer |
| `metadata` (jsonb) | account + intended rail, with no schema change |
| `token_hash` | the plaintext `token` column was DROPPED (S-3); links are stored hashed |
| `expires_at` | lapsed on schedule |
| `consumed_at` | legitimately used, once |
| `revoked_at` / `revoked_reason` | withdrawn by the organization, failing closed at authorization |
| `short_code` | SMS-friendly `/a/{code}` URLs — a parent already receives links this way |

Three of those matter more than they look. Revocation is already a first-class, *distinct* state
from expiry and consumption, which is exactly what "resend/restart setup where appropriate" needs.
Tokens are already hashed at rest. And a parent-facing SMS delivery path already exists, so the
payer does not need an Alloy login to reach the surface.

**One default must be changed for this use.** `expires_at` defaults to `now() + 02:00:00`. Two
hours is right for confirming an appointment and wrong for a bank authorization a parent will get
to that evening or the next day. The slice must set an explicit, longer expiry rather than inherit
the default — and must not widen the default for every other link type to get it.

## The follow-on slice, stated exactly

1. **New `action_type`** — e.g. `payment_method_setup`, with `entity_type` naming the payer and
   `metadata` carrying the account and the intended rail. No schema change to `payment_methods`.
2. **Participant surface** at the existing `[token]` route: Alloy framing, the payer's own Stripe
   Elements session, Financial Connections, and Stripe's mandate shown to the payer verbatim.
   `terms` stays on `auto`.
3. **Server completion** — the SetupIntent is created for the payer's token, re-read server-side
   (never trusted from the browser, as today), and written to the canonical `payment_methods` row.
4. **Operator capabilities** — `Request bank account setup`; read payer, bank name, last4,
   verification state, usability state; resend/restart; revoke through the canonical authority;
   attention when verification is required. The operator still never types a routing or account
   number and never accepts the mandate.
5. **Microdeposit verification** already has an honest canonical state (`pending`) — the payer,
   not the operator, confirms the deposits.

## What remains true regardless

Autopay still requires explicit authorization. A stored card or bank account does **not** enable
Autopay. That is unchanged by this document and unchanged by the slice above.
