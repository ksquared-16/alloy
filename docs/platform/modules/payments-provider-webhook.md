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

**Nineteen** types, enumerated from `stripeWebhook.ts`. Adding an event the adapter does not handle
buys nothing; omitting one silently disables the convergence that depends on it.

### The count, corrected

An earlier report called this "twenty". It was wrong, and the way it was wrong is worth keeping:
the twentieth string in the source is `"charge.dispute."` — a **prefix matcher** used as
`eventType.startsWith("charge.dispute.")`, not a subscribable event name. Counting quoted dotted
strings is not the same as counting event types.

That prefix has a consequence in the other direction. Because disputes are matched by family rather
than by name, the adapter handles **any** `charge.dispute.*` event, including ones not named above —
notably `charge.dispute.funds_reinstated`, which Stripe does emit and which the four named events do
not cover. A destination may safely subscribe to the whole `charge.dispute.*` family; the adapter
will route all of it.

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

## Certified state, 2026-09-25

The operator removed the stale destination, configured the canonical one with Connect delivery,
provisioned the signing secret and redeployed. The admission boundary is now demonstrably live.

| Check | Result | How |
|---|---|---|
| Signing secret present | **yes** | the probe flipped from `no webhook signing secret is configured` to `signature did not match` — the value was never read or exposed |
| Invalid signature fails closed | **yes** | `400 signature did not match`, stable across three samples |
| Missing signature fails closed | **yes** | `400 missing Stripe-Signature header` |
| Wrong method rejected | **yes** | `GET` → `405` |
| Stale Render host | **still 404** | a direct `POST` confirms the host; the *destination* removal is operator-reported, not inspectable from this lane |
| Consumed event types | **19** | enumerated from source, plus the `charge.dispute.*` family by prefix |
| Real admitted delivery | **none yet** | `payment_provider_events` remains empty |

## Why no event has arrived, and what will produce one

Nothing is wrong with the boundary. **There is simply no event to send.** The connected account has
had no activity since the secret went live: the merchant is `restricted` pending an outstanding
Stripe requirement, there are no collection attempts, and the old destination's retry backlog died
with that destination — a newly created destination has no queue.

The natural first event is **`account.updated`**, which Stripe emits when the connected account
changes. That happens the moment the operator satisfies the outstanding requirement in Stripe's
hosted flow.

So one operator action closes both open threads at once:

- it emits a real **connected-account** event, which certifies this boundary end to end — signature
  verified, `event.account` resolved through `payment_provider_merchants` to the org, disposition
  recorded, row persisted
- and it moves the merchant toward card-ready, which is what
  `PAYMENTS_V1_W5_REAL_CLOCK_OCCURRENCE_PENDING_PROVIDER` has been waiting for

## The environment the secret must reach

`staging.workwithalloy.com` does **not** run as a Vercel *Production* deployment. Its own build
endpoint reports:

```json
{ "vercelEnv": "preview", "nodeEnv": "production" }
```

Vercel scopes environment variables per environment — Production, Preview, Development — and a
variable set for Production alone is **absent** from the Preview deployment that actually serves
this hostname. `nodeEnv: "production"` is a Node-level value and says nothing about which Vercel
scope the deployment reads.

Measured 2026-09-25, after the destination and secret were reported configured and staging
redeployed: the behaviour probe still answers `no webhook signing secret is configured`, and
`payment_provider_events` is still empty. `STRIPE_SECRET_KEY` demonstrably *is* readable by this
same deployment — the connected account `acct_…` was created through it on 2026-09-22 — so the
environment is not broadly unset. It is this one variable, in the scope this hostname reads.

**So `STRIPE_WEBHOOK_SECRET` must be present for the Preview scope** (or for all scopes), and the
deployment must be rebuilt after it is set. Setting it and not redeploying leaves the running
instance with the old environment.

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
