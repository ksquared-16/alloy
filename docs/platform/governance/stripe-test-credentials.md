---
owner: platform
status: canonical
last_reviewed: 2026-09-09
supersedes: []
---

# Stripe test credentials on a Vacilando node

**Status:** Governance (September 2026). Names the one place Stripe TEST-mode credentials live on an
execution node, and why it is that place. Required reading before Financials Thread 8B Slices C–I.

## The rule

```
$ALLOY_RUNTIME_ROOT/vacilando/trusted-secrets/stripe-test.env
```

defaulting to `~/.local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env`.

Nowhere else. Not in a worktree, not in `web/.env.local`, not exported by hand into a shell.

## Why there

Vacilando already had exactly one home for a credential the trusted host owns and a Development Lane
must not: `trusted-secrets/`. `staging-certification-principal.env` lives there, and three separate
mechanisms already understand that directory:

- `vacilando-secret-preflight.mjs` reports its contents by **key name only**, never by value, so its
  output is safe to paste into a runbook or an issue.
- `lib/vacilando/durable-state.mjs` classes `trusted-secrets` as `EPHEMERAL` with
  `backup: false, restore: false` — *"Trusted-host credentials stay on the trusted host; not part of
  lane backup."* Credentials therefore never travel with a node restore.
- Its `SECRET_NAME_RE` and `SECRET_BASENAME_RE` already match `trusted-secrets` and `*.env`, so the
  file is recognised as a secret by the machinery that moves state around.

Inventing a new location would have meant re-earning all three properties. Reusing this one earns
them for free, and a Stripe key is the same class of thing the directory already exists to hold.

## What goes in it

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_PUBLISHABLE_KEY=pk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
```

`chmod 600`. TEST mode only — a live key has no business on a development node.

The publishable key appears twice on purpose. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is the only name
the Next build reads, and `STRIPE_PUBLISHABLE_KEY` is the name server code reads; duplicating one
public value is cheaper than a translation layer that can drift.

**`STRIPE_WEBHOOK_SECRET` is deliberately not required.** It is issued by the webhook listener when
one is first attached (`stripe listen` prints a `whsec_…` for that session), so demanding it before a
listener exists would fail a node that is correctly configured. It joins this same file once Thread
8B Slice E creates one.

## How a lane inherits it

`certification/alloy-certify` sources the file when it exists and falls back to its existing
placeholders when it does not, so a node that never certifies Stripe is unchanged. Two rules are
enforced in that wiring:

- **The secret key is passed to the backend process only.** It is never written to
  `web/.env.certification.local`, never reaches the browser, and never lands in a file the repository
  tracks.
- **Only the publishable key reaches the web env file**, because it is public by Stripe's own design.

## Proving it without seeing it

```bash
node scripts/local-dev/vacilando-secret-preflight.mjs
```

reports `stripe.test_keys` as either `missing: <path>` or `defines STRIPE_SECRET_KEY,
STRIPE_PUBLISHABLE_KEY`. It reads the file to list which keys are **defined** and never reads a
value into the report. The check is optional: a node that does not run Stripe certification is not
misconfigured for lacking it.

## The Stripe CLI

Installed via Homebrew and authenticated interactively by the operator — the same shape as
`gh auth login` and Tailscale, and deliberately not automatable. The preflight reports it as
`provider.stripe_cli`.

The CLI's own credential is **not** the application's. `stripe login` stores a restricted key for the
CLI in the OS keychain; the application still needs a real `sk_test_…` from the dashboard in the file
above. Both are needed, for different reasons: the CLI to deliver and replay webhooks, the file to
let the application call Stripe at all.
