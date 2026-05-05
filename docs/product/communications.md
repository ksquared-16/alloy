# Communications system

## Purpose

Outbound and inbound messaging threads tied to **entities** (person-first anchors in CRM) and **workflows**, with canonical enqueue in Next and delivery in the Python worker — without duplicating send logic in UI.

## Current state (Communications V1)

**Data model**

- **Canonical store:** **`communication_threads`** (org + primary entity + channel + `recipient_key`) and **`communication_messages`** (inbound/outbound, `status`, `workflow_run_id`, optional **`communication_provider_binding_id`**, body/subject, `metadata`, read/unread fields for admin APIs).

**Outbound (SMS + email)**

- **Enqueue (Next):** **`enqueueCanonicalOutboundMessage`** (`web/lib/communications/canonicalOutboundEnqueue.ts`) upserts the thread, inserts **`communication_messages`** with **`status: queued`**, then **`emitEvent`** **`message_queued`** for workflow fan-out.
- **Admin send:** **`POST /api/admin/communications/send`** validates org + scope and calls canonical enqueue (see route header comment).
- **Drawer + modal:** **`AdminEntityDrawer`** communications section / **`CommunicationsDrawerSection`**, plus **Quick Message** modal (`web/app/adminV2/components/QuickMessageModal.tsx`).

**Delivery (dispatcher + cron)**

- **Worker (Python `backend/`):** **`POST /internal/messages/process`** with **`x-cron-token: INTERNAL_CRON_TOKEN`** drains legacy **`public.messages`** SMS (`message_sender.py`) **and** canonical **`communication_messages`** outbound queued rows (`communication_message_sender.py` — SMS + email).
- **Scheduling:** Typically Render (or equivalent) cron hitting the backend URL; see **`backend/README_MESSAGES_SENDER.md`**. Next may **wake** the worker after enqueue via **`INTERNAL_MESSAGES_PROCESS_URL`** (`web/lib/workflowRun.ts`, `web/lib/communications/triggerBackendMessagesQueue.ts`).

**Inbound SMS**

- **Implemented on the Python backend** (inbound webhook → canonical persistence, person-first — e.g. **`backend/app/routes/sms_inbound.py`** and related services). **Not** a `web/app/api/...` handler.

**Delivery webhooks (lifecycle)**

- **Next.js:** **`POST /api/webhooks/twilio/sms-status`** (Twilio signature) and **`POST /api/webhooks/resend`** (Svix-signed Resend) update delivery/status on rows.

**Threads, read/unread**

- **Person-first UX:** Threads tie to CRM entities and recipient resolution as implemented in admin APIs; prefer **person-backed** recipients in new surfaces (`drawer-recipients`).
- **Read/unread:** **`web/app/api/admin/communications/`** (threads, messages, unread counts).

**Provider bindings (admin-managed)**

- **`communication_provider_bindings`** via **`/api/admin/communications/bindings`** and **`/adminV2/settings/communications`**. PATCH avoids leaking secrets (**`secret_ref`** resolved on worker). **No** full tenant **self-serve** SPF/DKIM / BYO wizard in V1.

**Legacy parallel**

- Workflow **`send_message`** / **`create_message`** may still write **`public.messages`** / **`messages_outbox`** (`web/lib/workflowRun.ts`; **`/admin/messaging`**, **`/admin/messages-outbox`**). Dispatcher processes both until migrated.
- **Dual-write:** **`COMMUNICATION_DUAL_WRITE`** + **`isCommunicationCanonicalDualWriteEnabled()`** — off unless env enables.

## Not in V1 (explicit)

- **No global inbox** — threads are **entity-scoped** in drawer/modal; there is no org-wide unified inbox product.
- **No notification system** — header bell/dot for messages is **not** shipped; unread APIs may exist for a future bell (`web/app/adminV2/components/TopNavBar.tsx`).
- **No self-service communications completion** — guided DNS, BYO number purchase, or routing rules for tenants **beyond** admin-managed bindings are **not** implemented.

## How it works

1. UI loads threads for an entity via admin API with org context (and **CRM scope** where **`getAdminAccessContextCached`** applies).
2. Sends enqueue canonical rows + **`message_queued`**; cron/worker delivers via Twilio/Resend; webhooks update status.
3. Legacy workflow paths may still enqueue **`public.messages`** until retired.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Thread listing | `web/app/api/admin/communications/threads/route.ts` |
| Send | `web/app/api/admin/communications/send/route.ts` |
| Canonical enqueue + `message_queued` | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| Worker dequeue | `backend/app/routes/messages_sender.py`, `backend/app/services/communication_message_sender.py` |
| Twilio / Resend webhooks | `web/app/api/webhooks/twilio/sms-status/route.ts`, `web/app/api/webhooks/resend/route.ts` |
| Dual-write flag | `web/lib/communications/communicationsEnabled.ts`, `web/lib/communications/mirrorQueuedMessage.ts` |
| Workflow send / legacy queue | `web/lib/workflowRun.ts` (search `send_message`, `messages_outbox`) |
| Drawer + modal | `web/components/admin/AdminEntityDrawer.tsx`, `web/components/admin/communications/CommunicationsDrawerSection.tsx`, `web/app/adminV2/components/QuickMessageModal.tsx` |
| Bindings admin UI | `web/app/adminV2/settings/communications/CommunicationsSetupClient.tsx` |

## Guardrails

- **Do not** bypass org checks or send from the client with secrets.
- **Do not** fork template composition in the drawer when a workflow/helper already defines canonical content.
- Map entity types using shared normalization — avoid ad hoc string switches in new code.
- **Identity:** Pipelines that resolve **`contact_id`** / **`to_contact_id`** are **compatibility exceptions** — **person-first** for new CRM messaging.

## Known gaps / risks

- **Needs verification:** Per-org matrix of enabled channels/bindings in production.
- **Needs verification:** Worker base URL and cron cadence per deployment (`INTERNAL_MESSAGES_PROCESS_URL`).

## Related

- **CRM / opportunities context:** `docs/product/crm-system.md`

## When this doc must be updated

Channels, enqueue model, provider bindings, dual-write flags, worker contracts, or webhook behavior change.
