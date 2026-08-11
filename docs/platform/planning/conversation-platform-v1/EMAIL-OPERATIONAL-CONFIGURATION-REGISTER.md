---
owner: platform
status: register
last_reviewed: 2026-08-11
---

# Email — Operational Configuration Register

Settings the runtime has been **proven** to require, so Communications does not
ship as a system only an engineer can configure.

This is a register, not a design. Entries are added when the runtime demonstrates
the setting exists — not when one is imagined. Building the Configuration UI is
separate and later.

| Setting | Current authority | Required scope | Admin should eventually edit? | Needed for |
|---|---|---|---|---|
| Resend API key | `communication_provider_bindings.secret_ref`, falling back to `env:RESEND_API_KEY` | org (per binding) | No — secret; admin picks the connection, never sees the key | both |
| Sending From address | `env:RESEND_FROM_EMAIL`, overridable by binding `config.from_email` | org, ideally location | **Yes** | send |
| Sending domain | Implicit in the From address | org | Derived, not separately edited | both — it is the Message-ID domain |
| Inbound receiving address | `communication_provider_bindings.inbound_address` (added 2026-08-11) | org, optionally location | **Yes** | receive |
| Provider binding status | `communication_provider_bindings.status` (`active`/`disabled`/`pending_verification`) | org | **Yes** — this is the receiving on/off switch | both |
| Webhook signing secret | `env:RESEND_WEBHOOK_SECRET` | deployment-wide | No — secret | receive |
| Channel readiness (is email usable?) | Derived from an active binding with a usable From | org | Read-only indicator | both |

## Discovered while implementing, not assumed

**The sending domain is load-bearing beyond deliverability.** The outbound
`Message-ID` is `<alloy.{id}@{sending domain}>`, so the From address determines
the correlation identity a reply carries back. Changing it mid-conversation means
older replies still correlate (the id is in the header the parent quotes), but the
setting is no longer cosmetic and the eventual UI should say so.

**Receiving identity is globally unique, by constraint.** `communication_bindings_inbound_address_uq`
is `(provider, channel, lower(inbound_address))` with no `org_id` — two
organizations cannot both claim one receiving address. Configuration will need to
surface that collision as a comprehensible message rather than a constraint error.
This also closes, for email, the Configuration Integrity follow-up SMS recorded:
`inbound_to_e164` is unique only per organization, so SMS can still be
misconfigured this way.

## Open, not yet required by the runtime

Recorded because the provider needs them, but nothing in Alloy reads them yet, so
they are not registered as settings: DNS/MX records for the receiving domain, and
Resend domain verification status. They become register entries if and when the
runtime consults them.
