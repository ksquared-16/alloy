# Communications API

**Domain size:** ~39 route handlers. Full list: [`api-index.md` → Communications](api-index.md#communications).

Threads and messaging, send paths, announcements (with scheduling/targets/recipient preview), scheduled sends, conversation triage/assignment, inbox, templates, bindings, deliverability/health, and inbound provider **webhooks** (Twilio, Resend).

> Doctrine: `docs/platform/modules/communications-platform.md`. Canonical stores are `communication_*`; `messages`/`messages_outbox` are legacy parallels.

---

## Auth & org scoping

- **Auth:** Read-heavy comms routes use `requireAdminOrgContextLight` (lighter org context); sends and mutations use full admin context. Webhooks are **provider-authenticated** (signature), not session-authenticated.
- **Scope:** Threads/messages are org-scoped and related-person reads are bounded (`assertRowOrg`, capped `.in(...)` lists). Person-first persistence for inbound messages.

---

## Route groups

### Threads, messages & inbox

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/communications/threads` , `/[threadId]/messages` | GET | Thread list + messages |
| `/api/admin/communications/unread-count` | GET | Unread badge |
| `/api/admin/communications/messages/mark-read` | POST | Mark read |
| `/api/admin/communications/conversations` , `/[id]/{assign,triage}` | GET POST | Conversation workspace |
| `/api/admin/inbox/threads` , `/[threadId]` | GET | Inbox surface |
| `/api/admin/communications/person-search` , `/drawer-recipients` | GET | Recipient resolution |

### Send & family workspace

`/api/admin/communications/send`, `/family-send`, `/family-note`, `/family-workspace`. Outbound send routes enqueue through the canonical outbound path (`canonicalOutboundEnqueue`), not direct provider calls from the handler.

### Announcements

`/api/admin/communications/announcements` , `/[id]` and sub-routes `schedule`, `cancel`, `archive`, `targets`, `recipient-preview`. There are **two** recipient-preview routes — `/announcements/recipient-preview` (bare) and `/announcements/[id]/recipient-preview` (per-announcement). Both are flagged as an overlap to reconcile in the [audit](api-documentation-audit.md).

### Templates, bindings, preferences, health

`/api/admin/communications/templates` , `/[id]` (+ `preview`, `archive`); `/bindings` , `/[bindingId]`; `/preferences`; `/status-options`; `/deliverability`; `/health`.

### Scheduled sends

`/api/admin/communication-scheduled-sends` , `/[id]` , `/process-due`. `process-due` is a **worker** route (drains due sends) — see auth note below.

### Provider webhooks (public, signature-authenticated)

| Path | Methods | Auth | Purpose |
|------|---------|------|---------|
| `/api/webhooks/twilio/sms-status` | POST | global `TWILIO_AUTH_TOKEN` | SMS status callback (sandbox/legacy bindings) |
| `/api/webhooks/twilio/sms-status/[binding_id]` | POST | per-tenant subaccount | Per-binding SMS status |
| `/api/webhooks/resend` | POST | Svix signature | Email lifecycle events |

Webhooks delegate to handlers (`handleTwilioSmsStatus`, Resend handler) that verify provider signatures before processing. They are public-by-design.

---

## Validation, envelopes & side effects

- **Validation:** Manual; send routes validate recipients/content; webhooks validate signatures.
- **Envelopes:** Lists `{ threads }` / `{ items }`; sends return `{ ok }`-style; webhooks return provider-expected status responses.
- **Side effects:** Sends enqueue canonical outbound messages (`communication_messages`); `process-due` drains and dispatches; webhooks update delivery state. Worker/scheduled-send invocation may be triggered via `INTERNAL_MESSAGES_PROCESS_URL` (server-side). The Python message worker (`POST /internal/messages/process`, `x-cron-token`) lives in `backend/`, not in `web/app/api`.

> **Auth caution:** Confirm `process-due` is protected by an internal token / portal gate before any external scheduler can reach it — see [audit](api-documentation-audit.md).

Source root: `web/app/api/admin/{communications,communication-scheduled-sends,inbox}`, `web/app/api/webhooks/{twilio,resend}`.
