# Alloy Local Certification Platform

**Every realization sprint ends with executable proof — safely, reproducibly, without production.**

This directory is a self-contained, isolated local operator tenant for browser certification. It exists so an
engineer (human or AI) can, from a clean checkout: start a safe environment → authenticate an operator → execute a
feature → prove the operator experience → collect evidence → certify → commit with confidence. No production tenant,
no shared hosted tenant, no environmental archaeology.

## One command

```bash
certification/alloy-certify        # up → env → verify → status
```

Expected result:

```
✓ Local operator tenant started
✓ Seeded data available (org northwind-early-learning)
✓ Configuration written (web/.env.certification.local) — url/anon/tenant known, no discovery
✓ Communications mocked (no real email/SMS; local-delivery only)
✓ App ready (http://localhost:3011)
✓ Authentication established (reusable session captured)
✓ Runtime verification ready — evidence in certification/evidence/
```

Subcommands: `up · env · serve · verify · status · down` (see the script header).

## What it is (reproducible, committed)

| Concern | Where | Reproducible? |
|---|---|---|
| Isolated Supabase project | `supabase/config.toml` — project `alloy-cert`, ports **544xx** (api 54421, db 54422, studio 54423, mail 54424) | ✅ committed |
| Full Alloy schema | `supabase/migrations` → symlink to the canonical `../../supabase/migrations` (281) | ✅ committed |
| Deterministic synthetic tenant | `supabase/seed.sql` → the canonical `local_representative_seed.sql` (org `northwind-early-learning`, 2 sites, Enrollment process, households/children, open Current Work) | ✅ committed |
| Authenticated operator | `supabase/seed.sql` attaches a deterministic password to `qa.operator@northwind.invalid` | ✅ committed |
| Reusable session | `playwright/auth.setup.ts` logs in once → `.auth/operator.json`; every spec reuses it | ✅ committed |
| Browser verification | `playwright/*.cert.spec.ts` + `playwright.config.ts` → screenshots/video/trace in `evidence/` | ✅ committed |
| Communications safety | no provider credentials in the cert env → sends record the objective result but nothing leaves the machine; auth emails caught by the stack's local mail catcher (:54424) | ✅ committed |
| Orchestration | `alloy-certify` | ✅ committed |

## This is the ONE shared stack — do not start your own

`alloy-cert` is the single local Supabase stack for this machine. Every session **shares** it.

> **Superseded guidance.** This README used to say that ports 544xx were chosen not to collide with the default
> (543xx), processing-cert (553xx), and runtime-realization (563xx) stacks "so all can run concurrently." That
> sentence was a root cause of a containment failure: sessions read it as licence to allocate a fresh port range and
> stand up a stack of their own. Docker reached **35 containers across 4 stacks** — one still running two days after
> the worktree that created it had been deleted, another started from a temp scratchpad directory. Concurrency
> across stacks is no longer a goal. **One stack, shared, leased.**

Join it — never run `supabase start` yourself:

```bash
alloy-stack use        # join the shared stack (starts it only if nobody has it up)
alloy-stack status     # what is running, and which sessions hold leases
alloy-stack release    # at sprint end — stops the stack if you are the last one out
```

`supabase start` outside this stack is **blocked** by a `PreToolUse` hook
([`scripts/local-dev/hooks/guard-supabase-start.sh`](../scripts/local-dev/hooks/guard-supabase-start.sh)), because
documentation alone demonstrably did not hold. If you believe you genuinely need an isolated stack —
schema-destructive testing is the only real case — that is a decision for Kelly, not a workaround.

See [`docs/platform/governance/local-docker-containment.md`](../docs/platform/governance/local-docker-containment.md).

## Credentials (local-only, non-secret by design)

- Operator: `qa.operator@northwind.invalid` · password `alloy-local-cert`
- These exist only on a disposable localhost stack seeded from this directory. They are **not** secrets and never
  touch a real account. The canonical seed intentionally leaves the operator password NULL; the certification
  platform is the sanctioned place that attaches one.

## For a future realization sprint

Start → Implement → `certification/alloy-certify` → review `certification/evidence/` → commit. Extend
`playwright/current-work.cert.spec.ts` (a skipped extension point is already in place) to drive your feature and
assert the operator experience — the tenant, auth, session, evidence capture, and shutdown are already provided.

## Status & the one remaining integration detail

**Operational and reproducible today** (all demonstrated live): the isolated stack starts, the synthetic tenant
seeds, the operator **authenticates** (3 real sessions created through the app's own login — no manual step), the
app **serves** against the cert stack, the **browser attaches** and drives the login, communications are safe, and
the harness **captures evidence**. The first run pulls Docker images + applies 281 migrations (a few minutes);
subsequent runs are fast.

**One remaining detail — the reusable session on a cold SSR load.** The browser login creates a valid server
session, but the captured `@supabase/ssr` cookie is not yet accepted by the auth middleware (`proxy.ts` →
`getUser()`) on a *fresh* navigation, so a reused session currently lands on `/login` instead of rendering Current
Work directly (the harness logs `server-valid on cold load: false`). This is a known `@supabase/ssr` + Playwright
cookie-handshake nuance, not an infrastructure gap. Fix path: establish the session through the app's SSR cookie
writer (e.g. a small server route that signs in and sets the cookie via `createServerClient`, or persist the full
session cookie in the exact chunked format the middleware reads) so `getUser()` validates it cold. Until then, a
spec that logs in **within the same test** (no reuse) authenticates fully.

## Teardown

```bash
alloy-stack release                 # drop your lease; stops the stack if you are the last one out
```

`alloy-sprint-finish <slot>` does this for you, so a finished sprint never leaves containers behind. Stopping keeps
the data volumes, so the next `alloy-stack use` comes back with the seeded tenant intact.

`certification/alloy-certify down` still stops the app + stack directly, but prefer `alloy-stack release` — it
respects other sessions' leases instead of pulling the stack out from under them.
