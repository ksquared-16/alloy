---
owner: platform
status: handoff
last_reviewed: 2026-08-11
slot: 3
worktree: wt3-communications-inbound-sms
branch: agent/claude/3-communications-inbound-sms
---

# Communications Operationalization — start here

## Where the product actually is

**Two-way SMS: complete and certified.** **Two-way Email: locally certified 32/32.**
Do not reopen either runtime. Do not re-audit them. The evidence lives in
`SMS-REAL-SCHEMA-CERTIFICATION.md` and `RESEND-INBOUND-CONTRACT.md`.

Branch is 33 ahead of `origin/staging`, pushed, tree clean. No PR opened.
Cert migrations: **325 files / 325 unique / 325 applied / 0 pending**, verified
through `20260811140000`, no version collisions.

## The one gate still open

**Live Resend proof — PENDING.** Email is NOT production-ready until one controlled
real-domain test proves: Alloy send → Resend delivery → controlled mailbox reply →
Resend inbound → retrieval exposes In-Reply-To/References → Alloy correlates to the
original thread.

Blocked on four things that do not exist yet, none of them code:
1. Resend inbound provisioned on the account (documented by Resend; unverified here)
2. A verified sending domain and a receiving domain with MX pointed at Resend
3. A controlled mailbox — no customer address
4. Kelly's authorization to send real external email (certification sets
   `ALLOY_CERTIFICATION=1` so nothing leaves the machine)

If Resend rewrites Message-ID, correlation probably still holds: the reader is
domain-independent and matches on the `alloy.{uuid}` LOCAL PART. Only a local-part
rewrite breaks it — escalate with captured headers rather than building a second
threading system.

## Current milestone — Communications Operationalization

Goal: an admin can configure and understand the Email/SMS channel setup without
SQL or an engineer.

### Phase 1 is DONE. Do not redo it.

**A configuration surface already exists — extend it, do not rebuild.**

    /adminV2/settings/communications
      -> web/app/adminV2/settings/communications/CommunicationsSetupClient.tsx
      -> GET   /api/admin/communications/bindings          (sanitized, no secrets)
      -> PATCH /api/admin/communications/bindings/[id]     (display_label, status, is_primary)

What is already right: bindings are sanitized server-side, `secret_ref` is never
emitted, and status is editable (active / disabled / pending_verification).

### Phase 2 — the actual gaps found

| Gap | Consequence today |
|---|---|
| `inbound_address` not shown or editable | The email receiving address is invisible and SQL-only |
| From address is a read-only hint | Cannot set sending identity — which also sets the Message-ID domain replies correlate on |
| Receiving domain absent | Not represented |
| No readiness model | Nothing distinguishes "sending works, receiving does not" |
| **No `POST` — no create flow** | An admin can adjust an existing binding but CANNOT connect a channel. This is the real operability gap. |
| No collision handling | Global uniqueness on `inbound_address` would surface as a raw database error |

No migration needed — every column already exists.

### Grain decision, evidence-based

Bindings carry `scope` and `location_id`, so location ownership is structurally
possible. But the certified runtime resolves ownership org-wide, and email inbound
uniqueness is `(provider, channel, lower(inbound_address))` with no location
dimension. **Expose org-level only** and record location inheritance as a future
requirement rather than inventing it.

### Open question for Kelly, asked and not yet answered

Should an admin be able to CREATE a binding (connect a channel), or only configure
existing ones? Creating implies choosing a provider credential, which touches the
secrets boundary — the connection would reference a deployment-provisioned
credential rather than accept a key. That is the difference between "operable" and
merely "adjustable".

### Readiness model to build

Send and receive must be reported SEPARATELY — never one green check when only one
direction works. Prefer: Ready / Setup required / Verification required / Disabled /
Provider unavailable. Do not claim Ready from configuration presence alone if the
runtime would still fail.

Collision must return an operator-safe message and never reveal another
organization's identity:

> This receiving address is already connected to another Communications channel.

### Explicitly out of scope

DNS hosting, automatic MX management, registrar integrations. Show what external
setup is required and the resulting readiness; do not automate it.

## Environment — do not rediscover

Browser certification uses `certification/alloy-certify`, NEVER `alloy-dev-start`
(which points at the HOSTED tenant).

    CERT_APP_PORT=3013 certification/alloy-certify verify

Needs the `browser-certification` permit and a stack lease. Verify
`NEXT_PUBLIC_SUPABASE_URL` resolves local before capturing evidence.

Gotchas that cost real time in this sprint:
- **vitest needs nvm node v22.21.1 on PATH** or it dies inside rolldown.
- A **half-up stack** passes every readiness check: `supabase start` says "already
  running", `status` still returns URLs, psql works — while kong is down and the
  browser gets "Failed to fetch". Check the gateway:
  `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54421/auth/v1/health`
- `alloy-certify serve` now restarts the app when it predates the env file; a stale
  server silently certified the wrong build for three runs.
- Certification fixtures live in `certification/inbound-sms-binding.sql` (SMS number,
  email receiving addresses active + disabled, shared-phone and shared-email people).

## Recorded, deliberately NOT built

`keyword_response()` computes STOP/START/HELP response text and no Alloy send
consumes it. Owner is WS8. It needs a send seam between the Python inbound runtime
and the TypeScript canonical send path — its own slice, not a side quest.

`inbound_to_e164` is unique only PER ORG, so SMS receiving numbers remain
misconfigurable across tenants. Email fixed this with a global constraint;
converging SMS would churn a certified runtime for no behaviour change.
