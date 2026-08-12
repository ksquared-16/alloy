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

### Phase 2 — the gaps, and what closed them

All six are **CLOSED** on `agent/claude/3-communications-inbound-sms`.

| Gap | Closed by |
|---|---|
| `inbound_address` not shown or editable | Emitted by `GET`, editable via `PATCH`, validated with the router's own `normalizeEmailAddress` so a stored address can never be unique-but-unroutable |
| From address is a read-only hint | Editable `config.from_email`, merged rather than replacing `config`. **Bare address only** — the same value mints `<alloy.{id}@{domain}>`, so a display-name form yields a Message-ID inbound correlation cannot match |
| Receiving domain absent | `receiving_domain` / `sending_domain`, **derived** from the addresses. Not stored — a second column could disagree with the address it describes |
| No readiness model | `bindingReadiness.ts` — send and receive answered separately, five states |
| **No `POST` — no create flow** | `POST /api/admin/communications/bindings`, credential-referenced (see the decision below) |
| No collision handling | `translateBindingConstraintError` maps `23505` to one operator-safe sentence naming no tenant, no constraint, no address |

No migration needed — every column already existed. Ledger unchanged: **325 files /
325 unique / 325 applied / 0 pending**.

#### The readiness model, and why it is derived rather than restated

Five states: `ready` · `setup_required` · `verification_required` · `disabled` ·
`provider_unavailable`. Precedence is shared by both directions — `disabled` >
`provider_unavailable` > `setup_required` > `verification_required` > `ready` — so
the most actionable true statement wins. Telling an operator to verify a domain
when no credential is bound sends them to the wrong place.

`ready` is defined by what the runtime would do, never by configuration being
present, and that correspondence is **asserted over a generated matrix** rather
than maintained by hand:

- `send === "ready"` ⟺ `bindingEligibleForOutboundComposer`
- `receive === "ready"` ⟹ `bindingAcceptsInbound`

Receive additionally requires a credential, which `bindingAcceptsInbound` does not:
ownership resolves without one, but the BODY of a received email is fetched with
one, so receiving genuinely does not work. Hence implication, not equivalence.

**That matrix immediately earned itself.** `isEmailBindingReady` counted an EMPTY
`secret_ref` as credentialed while SMS did not — and `resolve_secret_plaintext`
resolves neither. The composer would have offered an email channel that fails at
send time. Fixed in `composerChannels.ts` to match SMS. Only a runbook can produce
that state, which is exactly why the gate should not have depended on it never
happening.

### Grain decision, evidence-based

Bindings carry `scope` and `location_id`, so location ownership is structurally
possible. But the certified runtime resolves ownership org-wide, and email inbound
uniqueness is `(provider, channel, lower(inbound_address))` with no location
dimension. **Expose org-level only** and record location inheritance as a future
requirement rather than inventing it.

### Decision — ANSWERED 2026-08-11

**An admin CAN create a binding, credential-REFERENCED.** Kelly's call.

The operator picks from credentials the deployment has already provisioned; the
form never accepts an API key. Mechanically:

- The client chooses an opaque **catalogue key** (`resend_deployment_key`,
  `twilio_deployment_token`, `twilio_legacy_global`). The server alone maps it to
  a `secret_ref`. The environment variable NAME never crosses the boundary either,
  so a client cannot enumerate what the deployment holds.
- The catalogue is an **allow-list, not a lookup**. Accepting an arbitrary
  `env:VAR_NAME` would make the route an environment oracle — probe a name, read
  `available`, learn the deployment's contents.
- `available` is a **presence probe only**: never a length, prefix, or fingerprint.
- Bodies carrying `api_key` / `secret` / `token` / … are refused **by field name,
  before any value is read**, so a secret cannot reach a log or an error message.
- A credential the deployment has not provisioned is **refused, not stored** —
  otherwise the row looks connected and fails at send time.

`web/lib/communications/providerCredentialCatalog.ts` is the whole boundary.

### Certification — `communications-configuration.cert.spec.ts`, 9/9 in the browser

Run against the real authenticated routes on the seeded certification tenant.
Nothing stubbed. What it proves:

1. The bindings payload carries **no** `secret_ref`, no environment variable name,
   no `env:` prefix, no credential value.
2. Send and receive readiness are reported **separately** on real seeded rows —
   the active email binding is ready/ready, the disabled one is disabled/disabled.
3. Create **fails closed** when the deployment has provisioned no credential.
4. An arbitrary env name (`env:SUPABASE_SERVICE_ROLE_KEY`) is not selectable.
5. A body carrying an API key is refused, and the planted value is never echoed.
6. A receiving-address collision returns 409 with the operator-safe sentence and
   leaks no constraint name, no address, no other tenant — and the rejected write
   leaves the environment untouched.
7. A display-name From address is refused before it can break threading.
8. The settings page itself shows both directions, exposes the create affordance,
   and contains **zero** password inputs.

**Deliberately NOT covered, so this evidence is not read as more than it is:** the
certification environment holds no provider credentials — that absence is what
guarantees no run can send anything — so the SUCCESSFUL create path cannot execute
there. Every catalogue entry is correctly unavailable and create fails closed. The
success path is covered by unit test and needs a deployment with a real credential.

**No regression in the certified runtimes**, re-run on this branch after the
`composerChannels.ts` change: inbound email **13/13**, Block A **10/10**, Block B
**8/8** — 31 product assertions, all green.

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

## Recorded as future requirements, deliberately not invented now

**Location-scoped channels.** Bindings carry `scope` and `location_id`, so the
grain is structurally possible — but the certified runtime resolves ownership
org-wide and the email inbound unique index has no location dimension. The create
route therefore pins `scope='org'` and `location_id=null`. Exposing a per-location
selector would offer a grain the runtime does not honour. Doing it properly means
changing inbound resolution first, then the index, then the surface — in that order.

**Credentials outside the catalogue.** A binding whose `secret_ref` predates the
catalogue (or came from a runbook) reports `credential_configured: true` with
`credential_key: null`, and the UI says "connected outside this page — leave
unchanged" rather than flattening it to unconfigured. Adding a provider is a
deliberate edit to `CATALOG` **plus** a runtime that can execute it; there is no
dynamic discovery, on purpose.

**SMS receiving numbers are still only org-unique.** `inbound_to_e164` is unique
per org, so two tenants can configure the same number. Email fixed this with a
global constraint. Converging SMS would churn a certified runtime for no behaviour
change — but the create flow now makes the misconfiguration easier to reach, so
this is more worth doing than it was.

## Recorded, deliberately NOT built

`keyword_response()` computes STOP/START/HELP response text and no Alloy send
consumes it. Owner is WS8. It needs a send seam between the Python inbound runtime
and the TypeScript canonical send path — its own slice, not a side quest.

`inbound_to_e164` is unique only PER ORG, so SMS receiving numbers remain
misconfigurable across tenants. Email fixed this with a global constraint;
converging SMS would churn a certified runtime for no behaviour change.
