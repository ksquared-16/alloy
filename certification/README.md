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

Ports **544xx** are chosen to not collide with the default (543xx), processing-cert (553xx), or runtime-realization
(563xx) stacks, so all can run concurrently.

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
certification/alloy-certify down    # stops the app + stack cleanly
```
