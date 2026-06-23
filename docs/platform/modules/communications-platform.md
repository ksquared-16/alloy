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

## Operator surfaces (Communications V2, June 2026)

| Surface | Entry | Purpose |
|---------|-------|---------|
| **Communications modal** | AdminV2 top nav **Inbox** | Primary: **Inbox**, **Templates**, **Announcements** tabs (`comms_v2_command_center`) |
| **Drawer Communications** | Entity drawer tab | Record-specific conversations only |
| **Settings → Communications** | `/adminV2/settings/communications` | Provider bindings / channel setup only |
| **`/adminV2/communications`** | Direct URL | Deprecated notice — not in nav |
| **`/admin/communications`** | Legacy path | Deprecated / non-primary |

Templates and Announcements inside the modal do not require separate feature flags beyond command center. See `../../sprints/06_2026/communications-v2/operator-surface-consolidation.md`.

---

## Related

- `../../product/communications.md` (transitional expanded reference)
- `../../sprints/06_2026/communications-v2/operator-surface-consolidation.md`
- `docs/schema/schema-policies-and-security.md`
- `docs/audits/supabase-schema-alignment-audit.md`
