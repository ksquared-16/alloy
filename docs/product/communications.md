# Communications system

## Purpose

Outbound and inbound messaging threads tied to **entities** (person-first anchors in CRM) and **workflows**, with canonical enqueue in Next and delivery in the Python worker — without duplicating send logic in UI.

## Current state (Communications V1)

**Data model**

- **Canonical store:** **`communication_threads`** (org + primary entity + channel + `recipient_key`) and **`communication_messages`** (inbound/outbound, `status`, `workflow_run_id`, optional **`communication_provider_binding_id`**, body/subject, `metadata`, read/unread fields for admin APIs).

**Outbound (SMS + email)**

- **Enqueue (Next):** **`enqueueCanonicalOutboundMessage`** (`web/lib/communications/canonicalOutboundEnqueue.ts`) upserts the thread, inserts **`communication_messages`** with **`status: queued`**, then **`emitEvent`** **`message_queued`** for workflow fan-out.
- **Admin send:** **`POST /api/admin/communications/send`** validates org + scope and calls **`executeCommunicationsSend`** → canonical enqueue (see route header comment and **`web/lib/communications/executeCommunicationsSend.ts`**).
- **Task Assist (Agent 2 — V1 + V1.1):** **`POST /api/admin/ai/task-assist/apply`** validates the operator-approved payload, enforces **`assertCommunicationsSendAllowed`**, then calls the **same** **`executeCommunicationsSend`** helper as admin send (no duplicated enqueue logic; **no** Task Assist references to legacy **`public.messages`** / **`messages_outbox`**). **Proposals:** **`POST /api/admin/ai/task-assist/propose`** (deterministic; optional **`persist: true`**). **V1.1:** durable **`task_assist_proposals`**, **`communication_scheduled_sends`** (+ **`process-due`** / **`INTERNAL_CRON_TOKEN`**), **`operational_tasks`**. **Command bar UI (Interaction Layer V1):** **`AICommandSurfaceShell`** — single assistant input, unified router, thread + action cards; ambient or **`GET /api/admin/ai/task-assist/entity-search`** with slot-extracted entity phrase; **Confirm target** before **`TaskAssistOpportunityWorkspace`** (draft / send-now / schedule / reminder — all operator-confirmed; **no auto-send**, **no bulk**, **no workflow config**). Drawer: threads + launcher only. Flag: **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**. Scope: **`docs/sprints/05_2026/task_assist_v1.md`**, **`docs/sprints/05_2026/task_assist_v1_1.md`**, **`docs/sprints/05_2026/agent_interaction_layer_v1.md`**.
- **Drawer + modal:** **`AdminEntityDrawer`** communications section / **`CommunicationsDrawerSection`**, plus **Quick Message** modal (`web/app/adminV2/components/QuickMessageModal.tsx`).

**Delivery (dispatcher + cron)**

- **Worker (Python `backend/`):** **`POST /internal/messages/process`** with **`x-cron-token: INTERNAL_CRON_TOKEN`** drains legacy **`public.messages`** SMS (`message_sender.py`) **and** canonical **`communication_messages`** outbound queued rows (`communication_message_sender.py` — SMS + email).
- **Scheduling:** Typically Render (or equivalent) cron hitting the backend URL; see **`backend/README_MESSAGES_SENDER.md`**. Next may **wake** the worker after enqueue via **`INTERNAL_MESSAGES_PROCESS_URL`** (`web/lib/workflowRun.ts`, `web/lib/communications/triggerBackendMessagesQueue.ts`).

**Inbound SMS**

- **Implemented on the Python backend** (inbound webhook → canonical persistence, person-first — e.g. **`backend/app/routes/sms_inbound.py`** and related services). **Not** a `web/app/api/...` handler.

**Delivery webhooks (lifecycle)**

- **Next.js:** **`POST /api/webhooks/twilio/sms-status`** (Twilio signature) and **`POST /api/webhooks/resend`** (Svix-signed Resend) update delivery/status on rows.

**Enrollment packet email (Phase 1)**

- Packet invitation / reminder copy from the **opportunity drawer** is sent through the **same canonical path** as other CRM email: **`enqueueCanonicalOutboundMessage`** → **`communication_messages.status: queued`** → Python worker → provider.
- **States are not interchangeable:** **`queued`** (awaiting worker) → **`sent`** + non-null **`provider_message_id`** when the provider accepts the handoff → **`delivered_at`** / bounce metadata when **Resend** (email) or **Twilio** (SMS status) webhooks match the outbound id. Treat “queued” vs “provider accepted” vs “delivered to mailbox” as **distinct** when debugging deliverability.
- **Resend:** Webhook handler is **`POST /api/webhooks/resend`** — requires **`RESEND_WEBHOOK_SECRET`** (Svix); misconfiguration yields **`ignored`** updates (see route comments). SPF/DKIM alignment remains **tenant DNS + provider** responsibility; Alloy does not auto-fix tenant deliverability.
- Deeper sprint notes / QA matrix: **`docs/sprints/05_2026/communications.txt`**; packet × CRM narrative: **`docs/sprints/05_2026/enrollment_journey_packet_operations_v1.md`**. **Phase 2** (templating in packet settings, reminders, SMS option): **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**.

**Threads, read/unread**

- **Person-first UX:** Threads tie to CRM entities and recipient resolution as implemented in admin APIs; prefer **person-backed** recipients in new surfaces (`drawer-recipients`).
- **Read/unread:** **`web/app/api/admin/communications/`** (threads, messages, unread counts).

**Provider bindings (admin-managed)**

- **`communication_provider_bindings`** via **`/api/admin/communications/bindings`** and **`/adminV2/settings/communications`**. PATCH avoids leaking secrets (**`secret_ref`** resolved on worker). **No** full tenant **self-serve** SPF/DKIM / BYO wizard in V1.

**Legacy parallel**

- Workflow **`send_message`** / **`create_message`** may still write **`public.messages`** / **`messages_outbox`** (`web/lib/workflowRun.ts`; **`/admin/messaging`**, **`/admin/messages-outbox`**). Dispatcher processes both until migrated.
- **Dual-write:** **`COMMUNICATION_DUAL_WRITE`** + **`isCommunicationCanonicalDualWriteEnabled()`** — off unless env enables.

### Legacy stores vs Communications V1 (retirement path)

- **Canonical V1:** **`communication_*`** tables (`communication_threads`, `communication_messages`, `communication_provider_bindings`, `communication_message_reads`) are the intended product surface for new messaging features. **New work should extend these**, not **`messages`**.
- **Compatibility surfaces:** **`public.messages`** (SMS / workflow-parallel history) and **`messages_outbox`** remain supported for existing flows, dual-write, and worker dequeue until an explicit cutover.
- **Do not expand legacy schema** for new product capabilities — avoid new columns, new event types tied only to **`messages`**, or new RLS assumptions on **`messages`** without an approved migration plan.
- **Retirement** (future): requires a defined **backfill / migration plan** from legacy rows into **`communication_*`** (or accepted feature parity drop), worker and workflow updates, and a policy review — **not** a schema delete in place.

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
| **Shared send executor** | **`web/lib/communications/executeCommunicationsSend.ts`** (used by **`POST /api/admin/communications/send`** and **`POST /api/admin/ai/task-assist/apply`**) |
| Task Assist apply / propose | `web/app/api/admin/ai/task-assist/apply/route.ts`, `web/app/api/admin/ai/task-assist/propose/route.ts` |
| Task Assist entity search (command bar) | `web/app/api/admin/ai/task-assist/entity-search/route.ts`, `web/lib/agent/taskAssist/taskAssistEntitySearchService.ts` |
| Task Assist AdminV2 UI | `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx`, `web/app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx`, `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts`, `web/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract.ts`, `web/lib/agent/taskAssist/taskAssistCommandIntent.ts`, `web/contexts/GlobalAssistantContext.tsx`, `web/components/admin/taskAssist/TaskAssistOpportunityWorkspace.tsx`, `web/components/admin/taskAssist/TaskAssistOpportunityLauncher.tsx` |
| Task Assist V1.1 proposals | `web/app/api/admin/ai/task-assist/proposals/route.ts`, `web/app/api/admin/ai/task-assist/proposals/[id]/approve/route.ts`, `web/app/api/admin/ai/task-assist/proposals/[id]/reject/route.ts` |
| Scheduled sends + worker | `web/app/api/admin/communication-scheduled-sends/route.ts`, `web/app/api/admin/communication-scheduled-sends/[id]/route.ts`, `web/app/api/admin/communication-scheduled-sends/process-due/route.ts`, `web/lib/communications/communicationScheduledSendsService.ts` |
| Operational tasks | `web/app/api/admin/operational-tasks/route.ts`, `web/app/api/admin/operational-tasks/[id]/route.ts` |
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
- **Partially implemented / roadmap:** Integration setup hardening (operational runbooks, monitoring, template QA) and **legacy `messages` retirement** — canonical path exists alongside legacy; full cutover **not** done (`docs/audits/legacy-messages-retirement-plan.md`).

## Related

- **CRM / opportunities context:** `docs/product/crm-system.md`
- **Enrollment packet Phase 2 (templates, reminders, SMS):** `docs/sprints/05_2026/enrollment_packet_phase_2.md`
- **Legacy retirement phases (audit):** `docs/audits/legacy-messages-retirement-plan.md`

## When this doc must be updated

Channels, enqueue model, provider bindings, dual-write flags, worker contracts, webhook behavior change, **enrollment packet email semantics** (queued/sent/delivered distinctions, Resend expectations), **or Task Assist V1.1 scheduled-send / process-due contracts**.
