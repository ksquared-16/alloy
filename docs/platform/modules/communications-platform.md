# Communications platform

**Status:** Canonical platform module doc.

Canonical Communications V1 — threads, messages, provider bindings, scheduled sends.

---

## Capabilities

| Area | Status |
|------|--------|
| Canonical threads/messages | Complete |
| Outbound enqueue + worker | Complete |
| Provider webhooks (Twilio/Resend) | Complete |
| Entity-scoped drawer UI | Complete |
| Scheduled sends (tours) | Complete |
| Legacy `messages` table | Compatibility — retirement path documented |

---

## Architecture

- **Threads:** `communication_threads` — org + entity + channel + recipient_key
- **Messages:** `communication_messages` — queued → sent/failed lifecycle
- **Bindings:** `communication_provider_bindings` per org/channel
- **Enqueue:** `canonicalOutboundEnqueue.ts` — server-only writes (service role)

---

## Rules

- No client direct DB writes for outbound
- Stage work may auto-associate contact attempts (enrollment Contacting stage)
- Drawer/inbox warm deferred on work-unit entry for performance

---

## Related

- `../../product/communications.md` (transitional expanded reference)
- `docs/schema/schema-policies-and-security.md`
- `docs/audits/supabase-schema-alignment-audit.md`
