---
owner: platform
status: canonical
last_reviewed: 2026-07-12
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

---

## Environment variables (categories)

| Category | Rule |
|----------|------|
| Supabase URL/keys | Server vs public anon key separation |
| Service role | **Server only** — never `NEXT_PUBLIC_*` |
| Provider keys | Twilio, Resend, Stripe — server only |
| Feature gates | BOS/agent env flags — default safe-off |

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

---

## Related

- `api-contracts.md`
- `docs/audits/supabase-schema-alignment-audit.md`
- Root `README.md` for clone/setup
