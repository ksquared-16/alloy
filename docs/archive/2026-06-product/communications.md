# Communications system

## Purpose

Outbound and inbound messaging threads tied to **entities** (person-first anchors in CRM) and **workflows**, with canonical enqueue in Next and delivery in the Python worker — without duplicating send logic in UI.

## Messaging V2 — Admin Inbox (June 2026)

**Surfaces**

- **Communications modal (primary):** Top nav **Inbox** opens the **Communications** modal (`InboxModal`). When **`comms_v2_command_center`** is on (core flag; defaults ON on staging), the modal exposes three tabs — **Inbox**, **Templates**, **Announcements** — via `CommunicationsModalTabPanel`. Templates and Announcements render with command center enabled; they do **not** require separate `comms_v2_templates` / `comms_v2_announcements` flags for modal tabs.
  - **Inbox tab:** `CommandCenterShell` — org-wide queue, conversation workspace, composer (replaces legacy folder-list inbox in the modal when the flag is on).
  - **Templates tab:** `TemplatesWorkspace` — template authoring.
  - **Announcements tab:** `AnnouncementsWorkspace` — announcement authoring.
- **Legacy modal fallback:** When `comms_v2_command_center` is off, the modal uses legacy `InboxPanel` (`layout="modal"`) — folder list + conversation detail only.
- **Full route (secondary):** `/adminV2/messages` still loads `InboxClient` → `InboxPanel` with `layout="page"` for a dedicated inbox page (legacy folder UX, page chrome).
- **Drawer Communications:** Entity drawer tab — **record-specific** conversation history and reply only; not org-wide inbox.
- **Settings → Communications:** `/adminV2/settings/communications` — **provider bindings / channel setup only**; not template or announcement authoring.
- **Deprecated:** `/adminV2/communications` and `/admin/communications` are **non-primary** — operators use the Inbox modal, not a standalone communications hub route.

**Folders**

Org-wide thread list via **`GET /api/admin/inbox/threads`** (`web/lib/communications/inboxThreadsService.ts`): **Inbox**, **Unread**, **Sent**, **Scheduled**, **Archived**. Modal uses `compact=1` and folder prefetch/warm-load (`inboxWarmLoadCache.ts`, `AdminV2Shell`).

**Conversation detail**

- Person/contact-first header with compact location, status, children, related contacts, household (when distinct).
- **Full thread history** in the detail panel via **`GET /api/admin/communications/threads/[threadId]/messages`** (up to 100 messages, chronological). Per-thread cache while the panel is open; skeleton only in the message column.
- Light **Bend Pine** inbound/outbound bubbles (`messagingMessageBubbleClasses.ts`); reply composer pinned at bottom.

**Reply composer (inline)**

- Shared **`MessagingComposerFrame`**: Email/SMS toggle (SMS disabled when org bindings or contact phone missing), optional email subject, body, formatting toolbar (placeholders), **Send now** / **Send later** / **BOS Enhance**.
- **Send now:** `POST /api/admin/communications/send` (same canonical path as drawer).
- **Send later:** Opens schedule modal. When the thread anchors on an **opportunity** with a **recipient person**, creates a row via **`POST /api/admin/communication-scheduled-sends`** (`source: task_assist`, `process-due` enqueue). Person-only or non-opportunity threads show an explicit technical gap (API currently requires `entity_type=opportunities`).
- **BOS Assist:** Opens review modal with draft + intent choices (clearer, warmer, shorter, more professional). Returns a guarded **coming next** state — not yet wired to LLM rewrite (`generateOperationalDraft` / dedicated enhance API).

**Compose New**

- **`QuickMessageModal`** (title **Compose New**): recipient search or record-scoped contacts, thread preview, same composer frame and action entry points as inline reply.
- Send later from Compose New requires **record-scoped launch with an opportunity id** and a **single recipient**; otherwise the schedule modal documents the gap.

**Known gaps (Messaging V2)**

- Rich text toolbar (Bold/Italic/Link/Image) — UI placeholders only.
- BOS Enhance — entry point only; no draft replacement yet.
- Send later — opportunity + person constraint on existing scheduled-send API; no multi-recipient schedule from Compose New.
- Attachments, templates, notification center, provider OAuth — not in scope.
- Legacy **`/admin/messaging`** and **`messages`** tables — not retired (see below).

---

## Current state (Communications V1)

**Data model**

- **Canonical store:** **`communication_threads`** (org + primary entity + channel + `recipient_key`) and **`communication_messages`** (inbound/outbound, `status`, `workflow_run_id`, optional **`communication_provider_binding_id`**, body/subject, `metadata`, read/unread fields for admin APIs).

**Outbound (SMS + email)**

- **Enqueue (Next):** **`enqueueCanonicalOutboundMessage`** (`web/lib/communications/canonicalOutboundEnqueue.ts`) upserts the thread, inserts **`communication_messages`** with **`status: queued`**, then **`emitEvent`** **`message_queued`** for workflow fan-out.
- **Admin send:** **`POST /api/admin/communications/send`** validates org + scope and calls **`executeCommunicationsSend`** → canonical enqueue (see route header comment and **`web/lib/communications/executeCommunicationsSend.ts`**).
- **Orchestrator + Task Assist (Agent #2 — V1 + V1.1):** **Orchestrator** = **`AICommandSurfaceShell`** + **`routeCommandSurface`** — parses intent, resolves entity, routes to specialists; thread + candidates; **no direct send**. **Task Assist** executes comms/tasks after operator approval: **`POST /api/admin/ai/task-assist/apply`** → **`executeCommunicationsSend`** (same canonical enqueue as admin send); **`POST /api/admin/ai/task-assist/propose`**; V1.1 **`task_assist_proposals`**, **`communication_scheduled_sends`** (+ **`process-due`**), **`operational_tasks`**. Entity lookup: **`GET /api/admin/ai/task-assist/entity-search`**. UI: confirm target → **`TaskAssistOpportunityWorkspace`** / **`TaskAssistCompactDraftCard`** in action cards. **No auto-send**, **no bulk**, **no workflow config** in Task Assist. Flag: **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**. Scope: **`bos-foundation.md`**, **`agent_interaction_layer_v1.md`**, **`task_assist_v1_1.md`**.
- **BOS operational communication drafts (May 2026 — deterministic, review-first):** Internal **operational recommendations** (Review Assist) are **not** outbound copy. When BOS handoff targets message draft, **`web/lib/adminV2/bos/communication/`** synthesizes **customer-facing** SMS and email bodies (`communicationDraftChannelCompose.ts`, `generateOperationalDraft.ts`) → handoff bootstrap → propose API. Proposals carry **`draft_body_sms`** and **`draft_body_email`**; the review card swaps per channel tab. **Not** an autonomous communications agent; **not** org tone profiles or thread-history grounding yet — see **`docs/sprints/future/bos_operational_assist_phase2.md`** § A–B.
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
- Deeper sprint notes / QA matrix: **`docs/sprints/archive/05_2026/communications.txt`**; packet × CRM narrative: **`docs/sprints/archive/05_2026/enrollment_journey_packet_operations_v1.md`**. **Phase 2** (templating in packet settings, reminders, SMS option): **`docs/sprints/archive/05_2026/enrollment_packet_phase_2.md`**.

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

- **Notification system** — header bell for arbitrary notifications is **not** shipped; inbox unread badge uses **`/api/admin/communications/unread-count`** for the Inbox nav link only.
- **No self-service communications completion** — guided DNS, BYO number purchase, or routing rules for tenants **beyond** admin-managed bindings are **not** implemented.

**Superseded (June 2026):** The bullet “No global inbox” is replaced by **Messaging V2 — Admin Inbox** above. Entity-scoped drawer threads remain authoritative for deep record context.

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
| Orchestrator (command bar) | `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx`, `CommandSurfaceThread.tsx`, `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts`, `commandSurfaceSlotExtract.ts`, `GlobalAssistantContext.tsx` |
| Task Assist AdminV2 UI | `web/lib/agent/taskAssist/taskAssistCommandIntent.ts`, `TaskAssistOpportunityWorkspace.tsx`, `TaskAssistOpportunityLauncher.tsx` |
| Task Assist V1.1 proposals | `web/app/api/admin/ai/task-assist/proposals/route.ts`, `web/app/api/admin/ai/task-assist/proposals/[id]/approve/route.ts`, `web/app/api/admin/ai/task-assist/proposals/[id]/reject/route.ts` |
| Scheduled sends + worker | `web/app/api/admin/communication-scheduled-sends/route.ts`, `web/app/api/admin/communication-scheduled-sends/[id]/route.ts`, `web/app/api/admin/communication-scheduled-sends/process-due/route.ts`, `web/lib/communications/communicationScheduledSendsService.ts` |
| Operational tasks | `web/app/api/admin/operational-tasks/route.ts`, `web/app/api/admin/operational-tasks/[id]/route.ts` |
| Canonical enqueue + `message_queued` | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| Worker dequeue | `backend/app/routes/messages_sender.py`, `backend/app/services/communication_message_sender.py` |
| Twilio / Resend webhooks | `web/app/api/webhooks/twilio/sms-status/route.ts`, `web/app/api/webhooks/resend/route.ts` |
| Dual-write flag | `web/lib/communications/communicationsEnabled.ts`, `web/lib/communications/mirrorQueuedMessage.ts` |
| Workflow send / legacy queue | `web/lib/workflowRun.ts` (search `send_message`, `messages_outbox`) |
| Drawer + modal | `web/components/admin/AdminEntityDrawer.tsx`, `web/components/admin/communications/CommunicationsDrawerSection.tsx`, `web/app/adminV2/components/QuickMessageModal.tsx` |
| **Communications modal (Command Center)** | `web/app/adminV2/components/InboxModal.tsx`, `web/app/adminV2/communications/CommunicationsModalTabPanel.tsx`, `web/app/adminV2/communications/CommandCenterShell.tsx`, `web/app/adminV2/communications/TemplatesWorkspace.tsx`, `web/app/adminV2/communications/AnnouncementsWorkspace.tsx` |
| **Legacy Admin Inbox V2** | `web/app/adminV2/messages/InboxPanel.tsx`, `web/lib/communications/inboxThreadsService.ts`, `web/components/adminV2/messaging/MessagingComposerFrame.tsx` |
| Bindings admin UI | `web/app/adminV2/settings/communications/CommunicationsSetupClient.tsx` |

## Guardrails

- **Do not** bypass org checks or send from the client with secrets.
- **Do not** fork template composition in the drawer when a workflow/helper already defines canonical content.
- Map entity types using shared normalization — avoid ad hoc string switches in new code.
- **Identity:** Pipelines that resolve **`contact_id`** / **`to_contact_id`** are **compatibility exceptions** — **person-first** for new CRM messaging.

## Known gaps / risks

- **Needs verification:** Per-org matrix of enabled channels/bindings in production.
- **Needs verification:** Worker base URL and cron cadence per deployment (`INTERNAL_MESSAGES_PROCESS_URL`).
- **Partially implemented / near-term priority:** Integration setup hardening (operational runbooks, monitoring, template QA, **`process-due`** cron) — **roadmap item 8**; ahead of new AI agent work (`roadmap-and-gaps.md`).
- **Legacy `messages` retirement** — canonical path exists alongside legacy; full cutover **not** done (`docs/audits/legacy-messages-retirement-plan.md`).

## Related

- **CRM / opportunities context:** `docs/product/crm-system.md`
- **Enrollment packet Phase 2 (templates, reminders, SMS):** `docs/sprints/archive/05_2026/enrollment_packet_phase_2.md`
- **Legacy retirement phases (audit):** `docs/audits/legacy-messages-retirement-plan.md`

## When this doc must be updated

Channels, enqueue model, provider bindings, dual-write flags, worker contracts, webhook behavior change, **enrollment packet email semantics** (queued/sent/delivered distinctions, Resend expectations), **Task Assist V1.1 scheduled-send / process-due contracts**, or **Admin Inbox V2** behavior (folders, composer, thread history, Send later / BOS entry points).

---

## Communications V2 — foundation (June 2026, branch `communications-v2`)

**Status:** Implementation in progress on the dedicated `communications-v2` branch, package-by-package. Canonical sprint source: **`docs/sprints/archive/06_2026/communications-v2/`** (Architecture & Scope Freeze r2, Governance Charter, Package Tracker, QA Workbook, Sprint Backlog, Plan, Work Orders).

Communications V2 transforms Messaging into a **Communications Command Center** (Queue → Conversation Workspace → BOS rail) plus an upgraded record-drawer Communications tab, **extending the canonical `communication_*` path** — it does **not** expand legacy `messages`. V1 providers are **Resend (email)** and **Twilio (SMS)** behind a new provider abstraction; **Google Workspace and Microsoft 365 remain in the architecture but off the V1 critical path** (V1.5 adapters, no schema/UX change).

**PKG-01 (foundation, this branch):** Communications V2 **feature flags** (`web/lib/communications/v2/flags.ts`, all default OFF), a **telemetry scaffold** (`web/lib/communications/v2/telemetry.ts` — typed `CommsV2Event` catalog + best-effort `emitCommsV2Event` over `emitEvent`, never throws in the request path), and **doctrine guardrail contract tests** (`web/tests/adminV2/commsV2Doctrine.contract.test.ts`): no generic-inbox regression, no BOS-in-content, no provider leakage outside the adapter dir, no auto-send, flags-off-by-default. No product behavior, schema, or provider change in PKG-01.
