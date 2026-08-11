---
owner: platform
status: evidence
last_reviewed: 2026-08-11
---

# Inbound email — actual capability

What exists today, established by reading the code and the running system rather
than by proposing an architecture.

## Outbound email — real, and thinner than it looks

| Fact | Evidence |
|---|---|
| Provider is Resend, called as raw HTTPS | `backend/app/integrations/resend_client.py` → `POST https://api.resend.com/emails` |
| No Resend SDK is installed | only `svix` (web) and `twilio` (backend) are present |
| Delivery telemetry is Svix-signed and outbound-only | `web/app/api/webhooks/resend/route.ts` handles `email.sent/delivered/opened/clicked/bounced/complained` |
| The stored `provider_message_id` is Resend's internal email id | `res.get("id")` in `communication_message_sender.py` |

## Inbound email — absent

| Fact | Evidence |
|---|---|
| No inbound email route exists | only `webhooks/resend` (outbound lifecycle) and `webhooks/twilio/sms-status` |
| No receiving provider dependency | no `sendgrid`, `postmark`, `mailgun`, `nodemailer`, `mailparser`, `imapflow`, `@aws-sdk/client-ses`, `googleapis` |
| `resendEmailAdapter.normalizeInbound` is speculative | its only callers are its own adapter test; it carries no threading headers |
| No RFC threading anywhere | zero occurrences of `Message-ID`, `In-Reply-To` or `References` in application code |
| Bindings are SMS-shaped for inbound | `communication_provider_bindings.inbound_to_e164`; no inbound email address column |

## The decisive finding — the gap was on the SENDING side

The preferred correlation chain is `In-Reply-To` → the exact outbound
`Message-ID`. **That was impossible regardless of which inbound provider is
chosen**, because Alloy sent no `Message-ID` header and recorded none. Resend's
`id` is not the RFC Message-ID a parent's mail client echoes.

Closed here, provider-independently: Alloy now mints its own header from the
canonical message's own id.

    <alloy.{communication_message_id}@{sending domain}>

Correlation becomes a primary-key lookup rather than a second identifier to
store, index and keep in sync — and the evidence is something Alloy authored, so
it survives whatever receiving provider is chosen. `References` is parsed as the
chain (nearest Alloy ancestor first) and subject text is never authority.

**Not yet verified live:** that Resend transmits a caller-supplied `Message-ID`
header unaltered. Certification has no provider credentials by design, so this
needs one real send against a real domain.

## What SMS already gives inbound email for free

| Primitive | Reusable? |
|---|---|
| `communication_inbound_ingress` quarantine | **Yes, unchanged** — already channel-neutral: `channel` CHECK allows `'sms'` and `'email'`, uniqueness is `(provider, channel, provider_message_id)`, and the lookup helper takes `channel`. Only a thin SMS convenience wrapper hardcodes twilio/sms. |
| Exactly-once provider identity | **Yes** — the canonical unique index is `(org_id, provider, channel, provider_message_id) WHERE direction='inbound'`, already channel-scoped |
| Tenant ownership → canonical or quarantine | Yes, conceptually identical; needs an inbound-address binding instead of `inbound_to_e164` |
| Identity model (known / unknown / same-org ambiguous) | Yes — no new identity model needed |
| Command Center, unread, thread-bound reply, blocked-send truth, Activity | Yes — all channel-neutral today |

`communication_messages` already carries `subject`, `from_address`, `to_address`,
`body_format` and `metadata`. Message-ID / In-Reply-To / References have no
columns yet.

## The open decision — who receives the mail

Alloy has no receiving capability and no receiving provider. This is a
procurement and DNS decision (MX records, domain ownership, cost), not an
engineering one, so it is surfaced rather than assumed:

1. **Resend inbound**, if the current plan supports receiving — smallest change,
   reuses the existing Svix signature verification and the existing binding.
2. **A dedicated inbound provider** (Postmark / SendGrid / Mailgun inbound parse)
   — mature inbound parsing, but a second vendor and a second signature scheme.
3. **AWS SES receiving** — if the platform already has AWS; more infrastructure.

Everything above the provider seam is provider-independent and already built or
reusable. What each option changes is the webhook contract, the signature
verification, and the MX configuration.
