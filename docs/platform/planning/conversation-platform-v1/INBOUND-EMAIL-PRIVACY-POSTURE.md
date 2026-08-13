---
owner: platform
status: canonical
last_reviewed: 2026-08-11
---

# Inbound email — privacy posture

**Director-recorded, 2026-08-11.** This is a scope boundary, not an implementation
note. It constrains what Alloy may be built to receive.

## The posture

**Canonical two-way Email does not require access to an employee mailbox.**

Alloy receives only messages that were sent or forwarded **to a designated Alloy
Communications identity**, through the configured receiving provider. Nothing else
reaches the platform, and nothing else is intended to.

## What this rules out

- **Broad mailbox ingestion is out of scope** unless separately authorized. Alloy
  does not read a staff member's inbox, does not sync folders, and does not
  subscribe to mailbox-wide change feeds.
- **No Gmail or Outlook OAuth.** Not as a connector, not as an "optional
  convenience", not behind a flag.
- **Mailbox-wide read access is never the default.** If a future capability needs
  any part of it, it is a separate authorization with its own decision record —
  not an extension of this one.

## What remains permissible

- Mail addressed directly to an Alloy receiving identity — the mechanism the
  certified inbound runtime already implements.
- **Forwarding from an existing business address may be documented later** as a
  setup option. Forwarding is compatible with this posture precisely because it is
  the organization choosing what to hand over, per-message, at their own mail
  server — it grants Alloy no standing access to anything.

## Why the boundary is drawn at the receiving identity

The receiving identity is the consent boundary. A family writing to
`families@school.org` has addressed the organization, and the organization has
designated that address for Alloy. Nothing about that grants visibility into what
a staff member receives personally, and the architecture should not be able to
reach it even by mistake.

This is also why tenant ownership resolves from the receiving address and refuses
to guess: an email that names no Alloy identity is quarantined rather than
attributed. See `RESEND-INBOUND-CONTRACT.md` and
`web/lib/communications/email/inboundEmailRouting.ts`.

## User model for this milestone

Communications identities belong to the **organization** (and, once the runtime can
resolve it, the **location** — see `LOCATION-IDENTITY-AUDIT.md`).

**Users receive permission to use those identities.** They do not own them, and
they do not bring their own. Per-user personal mailbox identity is **deferred**
unless a runtime requirement proves it necessary; no such requirement exists today.

Provider credentials are provisioned by the deployment and selected by reference —
never entered by a user. See `providerCredentialCatalog.ts`.
