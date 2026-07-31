---
title: "/admin/payments/run — Security Classification (pre-remediation)"
status: classified — remediation is Phase 0 commit 8
date: 2026-07-31
---

# `/admin/payments/run` — Classification

Classification performed before any modification, per direction. **No production code changed. No live endpoint was probed.**

## Summary

**There are two routes with this path.** The Next.js one is authenticated. The Python one — which is the route that actually charges the card — is not.

| | Next.js proxy | Python backend |
|---|---|---|
| Path | `POST /api/admin/payments/run` | `POST /admin/payments/run` |
| File | `web/app/api/admin/payments/run/route.ts:21-24` | `backend/app/routes/stripe.py:103` |
| Auth | **`requireAdmin()` + `getAdminContextCached()`** | **NONE** |
| Org scoping | asserts the job belongs to `ctx.orgId` | **none — no `org_id` anywhere on the path** |
| Charges Stripe | no — proxies | **yes — creates and confirms a PaymentIntent** |

The proxy is a BFF. **The security boundary was placed in Next.js and never mirrored in the executor.**

## 1. Exact route and method

`@router.post("/admin/payments/run")` — `backend/app/routes/stripe.py:103`, handler `admin_payments_run(body: Dict[str, Any] = Body(...))` `:104-105`. Mounted `server.py:32` (`app.include_router(stripe.router)`), **no prefix**. Body is a free-form dict — no Pydantic model.

## 2. Current callers

| Caller | Location | Auth in front of it |
|---|---|---|
| Admin UI modal | `web/components/admin/AdminCollectPaymentModal.tsx:330` → `/api/admin/payments/run` | Yes — the Next proxy |
| Next proxy → backend | `web/app/api/admin/payments/run/route.ts:70` | Yes, but the backend accepts anyone |
| Smoke test | `web/tests/payments/paymentsTask2.smoke.helpers.ts:299` — calls the **backend directly** | None |

**No scheduler, cron, or GHL workflow calls it.** Every legitimate caller goes through the authenticated proxy.

## 3. Intended authentication model — documented, deferred, never built

This is a **known, recorded gap**, not a discovery:

> `docs/archive/2026-05-02-docs-reset/implementation/ADMIN_API_REMEDIATION_BATCH_3.md:35` — "Next.js layer proves the `job_id` belongs to `ctx.orgId`. **Stripe charge creation, ledger posting, and any reuse of `schedule_id` / amounts inside Python must be enforced in the backend; audit or harden there separately.**"

> `docs/archive/2026-05-02-docs-reset/audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md:137` — rates it **MEDIUM**, noting settlement org is "not fully verifiable in-repo", with the action "Confirm Python admin API scopes charges by org."

The intended mechanism exists in the same file: `X-ALLOY-WORKFLOW-SECRET` / `GHL_WORKFLOW_SECRET`, enforced on `POST /stripe/charge` at `stripe.py:1590,1623-1625`. `/admin/payments/run` never adopted it.

## 4. Deployed and reachable? — **UNCONFIRMED. This is the decisive open question.**

**Cannot be determined from the repository or the local environment.**

- Local `.env.local` resolves the backend to `http://127.0.0.1:8000` — a dev value that reveals nothing about production.
- No `render.yaml`, `Dockerfile`, `Procfile`, or `fly.toml` exists for the backend.
- `backend/README_refactor.md:135` documents "Render entrypoint: `uvicorn backend.main:app`".
- `NEXT_PUBLIC_API_BASE_URL` is listed as a required Vercel variable (archived audit). The `NEXT_PUBLIC_` prefix means **the backend origin is shipped to the browser** — so if it is deployed, its URL is public knowledge.
- `server.py:18-24` sets CORS `allow_origins=["*"]`, `allow_credentials=True`.

**Assessment: strongly indicated, not confirmed.** Under your interrupt rule the trigger is *"confirmed publicly reachable and capable of initiating a real charge without authentication."* I cannot confirm it, so I have not interrupted the sequence — but the residual risk is high enough to warrant checking promptly.

**To confirm (needs your access):** the production value of `NEXT_PUBLIC_API_BASE_URL` in Vercel, or the Render dashboard. A side-effect-free probe exists: `POST <host>/admin/payments/run` with body `{}` returns **400 "job_id is required"** (`stripe.py:122`) if reachable-and-unauthenticated, versus 401/403 if a gate exists. It cannot charge, because no `job_id` is supplied. **I have not run this** — it requires the production host.

## 5. Payload control over financial parameters

| Parameter | Caller-controlled? | Evidence |
|---|---|---|
| `job_id` | **Yes** — the only required field | `:122-124` |
| **`amount_cents`** | **YES — arbitrary** | `:164-172`. Any positive number is honored; the job total is only a *fallback* when omitted. |
| `idempotency_key` | Yes, client-generated | `:126-129`, truncated to 512 |
| `payment_target`, `schedule_id`, `ad_hoc_charge_type`, `use_new_card`, `payment_method_id` | Forwarded by the proxy `route.ts:54-60` | — |
| Customer | **No** — derived from the job (`:141-156`) | good |
| Payment method | Derived from `customer.stripe_customer_id` (`:161`) | not caller-chosen on the core path |

**The material finding: an unauthenticated caller who knows or guesses a `job_id` can charge that customer's saved card for an arbitrary amount.** `job_id` is a UUID, so guessing is impractical — but UUIDs appear in admin URLs, logs, exports, and support threads, and are not secrets.

## 6. Organization resolution — none

`grep org_id` over the handler returns nothing. Org is resolved **only** in the Next proxy. The Python route trusts `job_id` alone and never verifies tenancy — so it is also a **cross-org** vector for anyone holding a `job_id` from another tenant.

## 7. Idempotency — partial, caller-supplied

Stripe idempotency key is passed through (`:126-129`), plus a DB unique index on `provider_payment_id` per the docstring. But the key is **client-generated and optional**: omitting it means each request creates a *new* PaymentIntent. Idempotency does not currently constrain an attacker; it protects honest retries.

## 8. Audit — logging only

`logger.info` at `:131` records a `job_id` prefix and whether a key was supplied. Durable payment rows are written, but **there is no actor attribution** — the backend has no identity to attribute to.

## 9. Invokes Stripe directly — yes

`stripe.api_key = STRIPE_SECRET_KEY` at `:119`, then PaymentIntent create/confirm within the handler. **A real charge against a real saved card.**

## 10. Scheduled / GHL dependency — none found

No cron, no scheduler, no GHL workflow references it. Unlike S-1, its only production caller is a first-party authenticated UI.

---

## Severity

**High, contingent on deployment.** Unauthenticated + arbitrary amount + real charge + no org scoping. Bounded by needing a valid `job_id`, which is not a secret but is not enumerable either.

**Materially different from S-1:** here a legitimate authenticated caller exists and works today, so hardening the backend is **additive** — the proxy must begin sending the service secret, and nothing else changes. There is no dormant-integration ambiguity.

## Remediation shape (commit 8)

1. Require `X-ALLOY-WORKFLOW-SECRET` (constant-time compare), fail closed when unset — mirroring `stripe.py:1623-1625`.
2. Next proxy sends the secret; **coordinated two-sided change** — the backend gate and the proxy header must ship together or the admin UI breaks.
3. Bind to an organization server-side and verify the job belongs to it — closing the cross-org vector the proxy currently covers by convention.
4. Constrain `amount_cents` against the job's authoritative total; require explicit permission for any override.
5. Require a stable idempotency key rather than accepting its absence.
6. Audit actor/service, org, job, amount, result, and Stripe PI id.
7. Rate-limit at the service boundary; unauthorized and malformed requests must never reach Stripe.
8. Tests: unauthenticated fails · bad credentials fail · cross-org fails · amount manipulation fails · duplicate requests do not double-charge · a valid request reaches the executor once. **Stripe mocked — no real charge during validation.**

**Recorded as debt, not fixed here:** the financial-authority model (an obligation/invoice as the canonical amount source) is a Billing concern. Commit 8 closes the vulnerability only.
