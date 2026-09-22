---
owner: modules
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Payments — post-onboarding readiness

**Status:** investigated, classified, repaired where the defect actually was, deployed and verified.

## The question

An operator completed Stripe-hosted onboarding — setup opened, test onboarding finished, payout
account and schedule chosen — returned to Alloy, and read **"The payment provider has restricted
this account."** Both rails unavailable.

Was Stripe genuinely restricted, or was Alloy's Accounts v2 → readiness mapping wrong?

## Provider evidence, first

The deployed merchant's `readiness_detail`, as `persistReadiness` recorded it from Stripe:

```json
{"past_due": 1, "currently_due": 1, "disabled_reason": "requirements.past_due"}
```

Alloy's mapping is three lines: `charges_enabled` → ready, else `details_submitted` → restricted,
else onboarding_incomplete. So Stripe answered `details_submitted: true`, `charges_enabled: false`,
and said why: **one requirement is outstanding and overdue.**

## Classification: provider requirement, not a product defect

`restricted` is the **truthful** classification. `readinessFromStripeAccount` is correct. No mapping
was changed and none was needed — the instruction is explicit that a code change must not be
manufactured when the provider is genuinely restricted.

## What WAS wrong: the sentence

`attentionFor` switched on `readiness` alone and never read `readiness_detail`. `MERCHANT_COLUMNS`
did not even select the column. So the surface could not say what remained, and a human who had just
finished onboarding was told something that sounds like a fault.

It now reads the provider's own answer:

| Provider says | Operator is told |
|---|---|
| `requirements.past_due` / `currently_due`, counts > 0 | *Setup needs one more step… Continue setup to provide it* |
| `requirements.pending_verification`, `under_review` | *…reviewing the information already provided. **Nothing is needed from you*** — and deliberately **no** Continue setup |
| `rejected.*`, `listed`, `platform_paused` | *Contact the provider — this cannot be resolved from Alloy* |
| anything unrecognised | *has not enabled payments for this account yet. Continue setup* |

The middle row is the one that matters most. Sending somebody back through an onboarding they just
completed, because the provider is merely reviewing it, is the worse of the two mistakes.

Raw requirement keys never reach the copy. A **count** answers the only question an operator can act
on: is there something left to give?

## Transient refresh state

`"Checking with the payment provider…"` was set and never cleared, so it rendered **beside** the
resolved state — two statuses at once, one stale. It is now a flag, cleared in a `finally` so a
refusal clears it too, with a truthful failure (*"could not be reached. Refresh status to try
again."*) and retry. The expired-link notice survives, because that is a result rather than progress.

## Technical details

Removed from the chapter entirely, per the Director decision — not moved, no replacement disclosure.
Deployed bundle: `Technical details` 0, `Provider reference` 0.

## Deployed verification

Staging `ba34588dd`.

The live server, for the real restricted account:

```
"attention": "Setup needs one more step: the payment provider needs one more piece of
              information before this organization can accept payments. Continue setup to provide it."
```

Live bundle (`/_next/static/chunks/ceb2fc00b3458540.js`): the refreshing flag, the failure copy,
`bg-alloy-bend-pine` primary, and **zero** occurrences of the navy primary or of the removed
disclosure.

## Named residual

The GET `/api/admin/financials/provider` response still carries `providerAccountRef` and
`merchantId`. The chapter no longer renders or even types them, so nothing reaches the operator's
eye — but the identifier still travels to the browser. The Director decision names the operator UI;
stripping the API payload is a further step that was **not** taken unilaterally at the end of this
run. It is one line in the route if wanted.

## What this does not unblock

**W5 remains blocked.** The provider genuinely needs one more piece of information before any
payment method can exist, so no Autopay arrangement can be enrolled and no real-clock occurrence can
be produced. The difference is that the product now says so, in language the operator can act on.
