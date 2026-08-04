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
