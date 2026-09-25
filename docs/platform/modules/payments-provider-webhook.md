---
owner: modules
status: canonical
last_reviewed: 2026-09-25
supersedes: []
---

# Payments — the provider webhook boundary

**Status:** the Alloy side is correct and deployed. The Stripe side is misconfigured and the
deployed runtime holds no signing secret. Both are operator acts; neither is a code change.

## The canonical boundary

```
POST <canonical staging origin>/api/stripe/webhook
```

Today that origin is `https://staging.workwithalloy.com`, resolved from the deployed build rather
than assumed. There is **one** platform endpoint. There are no tenant-specific webhook endpoints,
and there must not be: tenancy is resolved from the signed event, not from the URL it arrived on.

`GET` returns 405. An unsigned `POST` returns 400. Both are correct — **the Stripe signature is the
admission boundary**, and the endpoint is deliberately not behind an Alloy session because Stripe is
the caller.

## How tenancy is resolved, and what is never trusted

```
signed event → event.account (connected account) → payment_provider_merchants → org
```

`resolveOrgForConnectedAccount` is the only path. **Event metadata is never consulted for tenancy** —
anyone can put an org id in metadata; only Stripe can sign an event and only Alloy's own merchant
binding says which org an account belongs to. An unknown connected account fails closed.

This is why the destination must be **Connect-enabled**: a platform-account event carries no
`event.account`, so it can never resolve a tenant. Receiving platform events alone is not evidence
that the Connect model works.

## Event selection

Subscribe to what the adapter actually consumes — no more, and not "everything" to avoid deciding:

| Concern | Events |
|---|---|
| Merchant readiness | `account.updated` |
| Collection lifecycle | `payment_intent.created`, `.processing`, `.requires_action`, `.succeeded`, `.payment_failed`, `.canceled` |
| Refunds | `refund.created`, `refund.updated` |
| Disputes / returns | `charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn` |
| Payment methods and mandates (W2/W5) | `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_method.updated`, `payment_method.automatically_updated`, `payment_method.detached`, `mandate.updated` |

Twenty types, enumerated from `stripeWebhook.ts`. Adding an event the adapter does not handle buys
nothing; omitting one silently disables the convergence that depends on it.

## Signing secret

`STRIPE_WEBHOOK_SECRET`, read from the deployed environment only. It is never committed, never
documented, never logged and never returned in evidence. The verification order is: missing
signature header → missing secret → malformed header → timestamp tolerance → HMAC comparison.

A destination's secret is specific to that destination. **Creating a new destination means
provisioning its secret into the deployed environment**; the two are one act, not two.

## Measured state, 2026-09-25

| Fact | Evidence |
|---|---|
| Stripe is calling `https://staging-alloy.onrender.com/stripe/webhook` | Stripe's own failure notice: 129 deliveries, all 404, from 2026-09-20 |
| That host is dead | a direct `POST` returns **404** |
| It is historical residue | the string appears in **no** live code and in **no** canonical doc — only in an archived 2026-05-02 audit checklist, from the pre-Vercel Render era |
| The path is wrong too | Alloy's route is `/api/stripe/webhook`; the configured path omits `/api` |
| Alloy's endpoint is alive | `POST` → **400** `missing Stripe-Signature header` |
| The deployed runtime has **no signing secret** | `POST` with a syntactically valid signature → **400** `no webhook signing secret is configured` |
| **No webhook has ever been admitted** | `payment_provider_events` is **empty** — 0 rows, no event ids, no first/last received |

## What the empty table means

The 404s are not a cosmetic delivery nuisance. **The provider lifecycle has never reached this
platform.** Nothing has ever converged from a provider event: no `account.updated` readiness update,
no collection settlement, no refund, dispute or mandate invalidation.

The platform has not been silently wrong about money, because nothing provider-collected exists yet
— `payment_collection_attempts` is 0, and the four recorded payments are manual receipts. W3's
operator-driven `payment.recognize` also re-reads the provider directly rather than depending on a
webhook, so recognition has a path that does not need this. But every *automatic* convergence has
been inert.

## Two independent blockers, and why fixing one is not progress

1. **Stripe points at a dead host.** Deliveries 404.
2. **The deployed runtime has no signing secret.** Correct deliveries would be rejected 400.

Repointing the URL without provisioning the secret turns 404s into 400s — the Stripe dashboard would
still show failures, and it would look like the repair had half-worked. They are one change.

## How this is reconciled

Webhook configuration is **provider-side state**, not repository state. There is no migration, no
seed and no governed action that creates a Stripe destination — `vac governed-action --list` carries
no Stripe configuration capability. It is established once per environment by an operator holding
Stripe credentials, and reconciled by comparing:

- the destination URL against `<deployed origin>/api/stripe/webhook`
- the destination's event selection against the table above
- the destination's Connect scope against the tenancy model
- the destination's signing secret against `STRIPE_WEBHOOK_SECRET` in the deployed environment
- `payment_provider_events` for actual admitted deliveries

The last one is the only proof that matters. An endpoint returning 2xx to a synthetic request proves
the route exists; only a row in `payment_provider_events` proves a real signed event was admitted.
