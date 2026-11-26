---
owner: platform
status: canonical
last_reviewed: 2026-10-18
supersedes: []
---

# Deployment and environments

**Status:** Canonical environment contract (June 2026 rebaseline).

---

## Environments

| Environment | Purpose |
|-------------|---------|
| **Local** | Developer machine + local or linked Supabase |
| **Staging** | Pre-production validation — schema exports reflect staging when regenerated |
| **Production** | Customer-facing — apply migrations only after staging verification |

### Environment identity (verified 2026-10-18)

Each environment is a **separate Supabase project**. Identify an environment by
its project ref, never by a label — tooling vocabulary has called the staging
database "production" and "the deployed primary", and both were wrong.

| Identity (Vacilando) | Supabase project | Host | Evidence |
|---|---|---|---|
| `ALLOY_STAGING` | `ikaxilmwmrmbagoidedu` | staging.workwithalloy.com (Vercel preview build of `staging`) | `/api/build-info` `supabaseProjectRef` |
| `ALLOY_PRODUCTION` | `vslwnntzzgpnmrpjipat` | www.workwithalloy.com (production build of `main`) | Supabase URL in the live login bundle |
| `ALLOY_LOCAL_CERTIFICATION` | local `alloy-cert` stack (127.0.0.1:54422) | — | `certification/supabase/config.toml` |

- Every Vacilando governed database action against Alloy — census, migration
  parity, `database.apply_migration`, `database.apply_promoted_migration` (the
  "promoted"/"production" apply), ledger repair — and deployed QA-session
  restore targets **`ALLOY_STAGING`**. Vacilando's legacy identifier for it,
  `alloy_deployed_primary`, is a compatibility alias for the staging project.
- **Production is not reachable from Vacilando**: no target, alias or
  credential names `vslwnntzzgpnmrpjipat`. Production migrations are outside
  Vacilando's governed actions.
- Lanes share the staging database with the deployed staging site; a lane's QA
  is therefore not isolated from other lanes. Pre-merge isolation is the local
  certification stack.

---

## Deployment stack

- **Frontend/API:** Next.js on Vercel (`web/`)
- **Database:** Supabase Postgres + RLS + Edge functions (where used)
- **Workers:** Python backend for message dequeue, inbound SMS (see API contracts)

### Vercel auto-deploy policy

Auto-deploys are **staging / main only**. Feature, hotfix, and agent branches must not
create a Preview deployment on every push.

- Ignored build step: `web/scripts/vercel-ignored-build.sh` (via `web/vercel.json`)
- Agent cadence: local commits throughout the day; **push at checkpoint** (finished
  sprint / end of day / Kelly-authorized), then PR → `staging` for the real deploy

If Preview spam returns, confirm the Vercel project Root Directory is `web` and the
Ignored Build Step uses the repo script (or the equivalent branch allowlist in the
Vercel project settings).

---

## Scheduled work and the external clock

**There is no demonstrated external clock in this estate.** Measured 2026-09-21.

`staging.workwithalloy.com` runs as a **Preview** deployment behind an alias —
`/api/build-info` reports `vercelEnv: "preview"`, which is the app's own read of
`VERCEL_ENV`. Vercel registers and fires `crons` only from the **Production**
deployment, and `web/vercel.json` does not exist on `main` at all. So a `crons` block
added to `web/vercel.json` is registered nowhere and never fires, on either branch.

This is a trap worth naming, because nothing reports it: the block is valid, the
deploy is green, the endpoint is live, and no request ever arrives. There is no error
to find.

The machine-token callers in the codebase (`x-cron-token` against
`INTERNAL_CRON_TOKEN` — `communication-scheduled-sends/process-due`,
`scheduled-work/wake`) accept a caller, but what *calls* them in a deployed
environment is unknown; the Conversation Platform Phase 0 live verification recorded
the same open question about `process-due` and could not answer it either.

Two separate prerequisites, both operator-owned, before any recurring trigger can be
certified in staging:

| Prerequisite | Why it is not a code change |
|---|---|
| A production-class deployment, or an external scheduler | Vercel fires crons only from Production; staging is Preview |
| `CRON_SECRET` provisioned in the Vercel project | Vercel sends `Authorization: Bearer $CRON_SECRET` **only** when that variable is set; absent it, no auth header is sent at all and a fail-closed endpoint returns 401 |

**If you are about to certify a periodic trigger:** first ask what row the trigger
writes in an environment with nothing scheduled yet. The Governed Scheduled Work
runtime wrote nothing — occurrences and attempts only exist when work is *due* — so a
cron that never fired, one refused for a missing secret, and one running correctly
against an empty schedule set were indistinguishable. `scheduled_work_clock` records
every wake for that reason; read `wake_count` and `last_wake_at` to answer "is the
clock running" without inferring it from work that happened to be due.

### Clock doctrine

**CANONICAL CLOCK INTERFACE:** the generic authenticated Alloy wake endpoint,
`POST|GET /api/scheduled-work/wake`. The scheduled-work runtime must not care who
physically provides the clock. A clock owns TIME and nothing else — all due-work
discovery, claiming, leases, dispatch, outcomes, retry and convergence stay inside the
certified runtime. No clock may call a domain endpoint.

**STAGING CLOCK:** external scheduler (Director decision, 2026-09-21). Staging is not
to be converted into a production-class Vercel deployment merely to obtain Vercel Cron.

**PRODUCTION CLOCK:** may use the same external-scheduler contract, or a production
hosting scheduler later. Both are interchangeable because the interface is the endpoint.

**Two clocks are safe.** Delivery is at-least-once, a duplicate wake converges on the
same occurrence through the `(scheduled_work_id, due_at)` identity, and a completed
occurrence cannot execute twice. That is what makes the clock portable.

#### Mechanisms, and which are actually viable here

| Mechanism | Viable | Evidence |
|---|---|---|
| Vercel Cron | **No** | staging is `VERCEL_ENV=preview`; crons register only from a production deployment, and `main` carries no `vercel.json` |
| GitHub Actions `schedule` | **No** | fires only from the **default branch** (`main`, thousands of commits behind `staging`), and has produced **one** scheduled run ever — 2026-09-15, none in the six days since, while the repo ran ~100 Actions runs in two hours |
| `pg_cron` + `pg_net` | **Yes** | both `available` on the staging project (not yet installed); `supabase_vault` already installed. Installable through the governed `database.apply_migration` capability |

The GitHub Actions row is the one that surprises people: a `schedule:` block on a
feature or trunk branch that is not the default branch is silent, exactly like the
Vercel `crons` block. Neither reports an error. **Assume no scheduler works until a
tick has been observed** — read `scheduled_work_clock.last_wake_at`, never a config
file and never a workflow's run history.

#### Secret handling for the clock

The wake boundary uses the machine-auth contract already certified in Governed
Scheduled Work V1 — `Authorization: Bearer $CRON_SECRET`, or `x-cron-token` against
`INTERNAL_CRON_TOKEN`. Do not invent a second scheme. A missing or empty expected value
never authorizes.

The credential must be high-entropy, server-side only, never `NEXT_PUBLIC_*`, never
written into source or into this document, and never printed in evidence or log output.
Rotation must not require a domain code change, which is why the value is read from
configuration (Vercel environment for the verifying side, Supabase Vault for a
`pg_cron` sending side) rather than embedded anywhere.

---

## Environment variables (categories)

| Category | Rule |
|----------|------|
| Supabase URL/keys | Server vs public anon key separation |
| Service role | **Server only** — never `NEXT_PUBLIC_*` |
| Provider keys | Twilio, Resend, Stripe — server only |
| Feature gates | BOS/agent env flags — default safe-off |

### Staging outbound recipients (ALY-14)

Staging email and SMS reach **only** controlled test recipients or an explicit owner
allowlist. The guard runs inside every provider call site — web
`lib/communications/stagingOutboundRecipientGuard.ts` (Resend sends, and the server
routes that ask Supabase Auth for mail) and backend
`app/integrations/staging_outbound_guard.py` (Resend + both Twilio adapters) — so no
caller can route around it. A refused message fails with
`staging_recipient_not_allowlisted` and the provider is never called.

#### `ALLOY_ENVIRONMENT` is required, and fail-closed

| `ALLOY_ENVIRONMENT` | Outbound regime |
|---|---|
| `staging` | **Restricted** — test recipients + owner allowlist only |
| `production`, with no staging signal | **Unrestricted** (live) |
| `production`, but the staging project ref in `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `APP_ENV` / `NEXT_PUBLIC_APP_ENV=staging`, or `VERCEL_ENV=preview` | **Restricted** — the contradiction is treated as staging |
| missing, empty, or anything else (`prod`, `development`, a typo) | **Restricted** — exactly like staging |

Required settings (operator-owned; this repository does not set them):

| Runtime | Setting |
|---|---|
| Vercel project, **Preview** scope (serves `staging.workwithalloy.com`) | `ALLOY_ENVIRONMENT=staging` |
| Staging backend service (Python dispatcher) | `ALLOY_ENVIRONMENT=staging` |
| Vercel project, **Production** scope | `ALLOY_ENVIRONMENT=production` |
| Production backend service | `ALLOY_ENVIRONMENT=production` |

> **Promotion order:** set `ALLOY_ENVIRONMENT=production` on every production runtime
> **before** this guard reaches `main`. Without it production is "unidentified" and
> refuses every real recipient. Local development and CI are unidentified by default
> and therefore restricted, which is intended.

#### Who may receive in a restricted runtime

- **Test recipients (always allowed):** `example.com|net|org`, any `.test` /
  `.example` / `.invalid` / `.localhost` domain, Resend's
  `delivered|bounced|complained|suppressed@resend.dev`, and NANP fictional numbers
  `+1 NPA 555-0100…0199`.
- **Owner allowlist:** `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST` and
  `COMMUNICATIONS_STAGING_SMS_ALLOWLIST`, comma/semicolon/newline separated, exact
  addresses and numbers only (no domain wildcards, no `+tag` variants). Set them in
  **both** the Vercel Preview scope and the staging backend service.

#### Demo-request sales inbox — blocked in staging on purpose

`POST /api/marketing/demo-request` mails `MARKETING_DEMO_INBOX`, defaulting to
`hello@workwithalloy.com`. That is a real sales inbox, so in staging it is **not**
mailed: the request is logged and the form still answers `{ ok: true }`. This is
intentional — staging form submissions must not land in the live sales queue.

To receive staging demo requests, allowlist the **exact** address the route sends to:

- keep the default: `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST=hello@workwithalloy.com`, or
- point it at a QA inbox: `MARKETING_DEMO_INBOX=sales-qa@<your-domain>` **and**
  `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST=sales-qa@<your-domain>`.

Setting `MARKETING_DEMO_INBOX` alone does not unlock delivery; neither does
allowlisting a different address on the same domain.

#### Supabase Auth mail (invites, password resets)

Supabase Auth sends these through its **own mailer**, never through Resend-in-Alloy.

| Path | Who calls Supabase Auth | Guarded in code |
|---|---|---|
| Admin invite — `POST /api/admin/users` → `auth.admin.inviteUserByEmail` | Alloy server | **Yes** — refused before the invite unless test/allowlisted |
| Admin-started reset — `POST /api/admin/send-password-reset` → `auth.resetPasswordForEmail` | Alloy server | **Yes** — refused before the reset unless test/allowlisted |
| Public `/forgot-password` → `auth.resetPasswordForEmail` | the **browser**, with the public anon key | **No** — no Alloy server code is on the path; anyone holding the anon key can call `/auth/v1/recover` directly |
| Any other Auth mail (signup confirmation, magic link, email change, reauthentication) | Supabase Auth | **No** — same mailer |

So the app guard covers the two server routes, but staging Auth mail as a whole is
only controlled when the **staging Supabase project's mailer** is. Required setting
(external, operator-owned, staging project `ikaxilmwmrmbagoidedu` only):

- **Supabase Dashboard → Authentication → Emails → SMTP Settings → Enable custom SMTP**,
  pointed at a **capture-only** sandbox SMTP (an email-testing inbox that accepts and
  stores every message and delivers none, e.g. a Mailtrap *Email Testing* sandbox),
  *not* a delivering provider (Resend, SendGrid, SES). Supabase's built-in mailer is
  not a substitute: it still delivers, to the project's team-member addresses, and is
  rate-limited.

Which mailer the staging project uses today is not recorded in this repository. If it
is a delivering custom SMTP, a staging `/forgot-password` request for a real staging
user's address is delivered for real. This is an **external configuration
requirement**; nothing in this repository can close it.

---

## Schema reference regeneration

```bash
DATABASE_URL=... npm run export:supabase-schema
node scripts/generate-schema-docs.mjs
```

CSV output: `docs/supabase/reference/*.csv`  
Generated markdown: `docs/schema/*.md`

---

## Migration discipline

- All DDL in `supabase/migrations/`
- Compare with `docs/schema/` and `docs/supabase/reference/` after apply
- RLS changes require live policy review — see schema alignment audit

---

## Tenancy

Production data segregated by `org_id`. No cross-org test fixtures in shared staging without explicit isolation.

Firefly is the only staging school. Its synthetic QA/demo families are seeded into the existing Firefly
org by one fenced, idempotent command that creates no org, changes no row but its own seed rows, and
proves it in-database — see [`firefly-staging-seed.md`](firefly-staging-seed.md) (ALY-14 E2).
Its QA profile — the three managed QA identities, required runtime settings and the hosted runbook — is
[`firefly-staging-qa-profile.md`](firefly-staging-qa-profile.md) (ALY-14 E3, proposed; not yet run).

---

## Related

- [`production-release-procedure.md`](production-release-procedure.md) — the routine staging-to-production release (proposed)
- [`environments-p1s-settings-checklist-2026-11-25.md`](../runtime/environments-p1s-settings-checklist-2026-11-25.md) — every Vercel, Render and Supabase setting the code reads, by name and source (proposed)
- [`environments-p1s-first-promotion-briefing-2026-11-25.md`](../runtime/environments-p1s-first-promotion-briefing-2026-11-25.md) — the owner's ordered runbook for the first promotion to a new production Supabase project (proposed)
- `api-contracts.md`
- `docs/audits/supabase-schema-alignment-audit.md`
- Root `README.md` for clone/setup

## Compute placement — `pdx1`, beside the primary database

`web/vercel.json` pins `"regions": ["pdx1"]`. That is a deliberate decision, not a
default, and it is recorded here because a JSON config file cannot carry the reason.

**Why.** Every server-side data call in Alloy is an HTTPS request to the Supabase
REST API: there is no PostgreSQL driver in the dependency tree at all, only
`@supabase/supabase-js` via `lib/supabaseAdmin.ts`. So each logical query costs one
round trip to the Supabase region, and measured on deployed staging that round trip
was **~112ms**, paid per hop:

| DB round trips | observed server phase |
|---|---|
| 0 | 0ms |
| 1 | ~116ms (range 104–124) |
| 2 | ~222ms |
| 3 | ~334ms |
| 5 | ~558ms |

Different tables, different row counts, different product areas — the same cost,
including one call that fetches an entire cohort bundle. That is fixed network cost,
not query work. It made `shared_deps_wall` (~11 hops) cost ~1,214ms, and it
dominated every composition repair in the OX programme: each removed hop was worth
one quantum and nothing more.

**The placement.** The Supabase primary is **West US (Oregon), AWS `us-west-2`**
(operator-verified from the project). Vercel's region list maps `us-west-2` to
**`pdx1` (Portland)**. Note that `sfo1` is `us-west-1`, a *different* AWS region —
the intuitive "US West" choice would not have been co-located. Functions previously
ran in `iad1` (`us-east-1`) purely because that is the Vercel default for new
projects; no region had ever been declared in this repository.

**Why a single region.** Alloy is write-heavy with one primary canonical database.
One compute region beside that primary is the correct shape; multi-region compute
would add consistency and connection complexity to reduce an edge hop that is paid
once per request, while the database round trip is paid on every hop.

**What was audited before moving.** 601 of 677 API routes import Supabase, so the
overwhelming majority of the runtime is database-dominant. The external-provider
surface is small and globally anycast (8 Stripe call sites, 4 Resend) and sits on
write paths. Routing middleware is unaffected — Vercel deploys it to all regions
regardless of the `regions` setting. The 5-minute `/api/scheduled-work/wake` cron is
database-dominant and benefits. Render does not appear on any server path.

**The trade, stated plainly.** Operators far from Oregon pay more on the
edge-to-function leg, once per request. They stop paying ~112ms on every database
hop. On the drawer path that is roughly eleven hops.
