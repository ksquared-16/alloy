# Messaging V2 — Phase 0 Audit

**Path:** `docs/sprints/archive/06_2026/messaging_v2_audit.md`  
**Status:** Audit complete (June 2026) — **planning only; no implementation**  
**Scope:** Communications Platform foundation audit preceding Inbox, Composer V2, provider integrations, and notification convergence.

**Inputs:** `docs/product/communications.md`, `docs/supabase/reference/*.csv` (committed schema snapshot — `DATABASE_URL` not available in this environment; regenerate with `npm run export:supabase-schema` before merge if schema drift is suspected), `docs/sprints/archive/05_2026/communications.txt`, `docs/audits/legacy-messages-retirement-plan.md`, codebase inspection (May–June 2026).

**Executive summary:** Alloy already has a **canonical communications spine** (`communication_*` tables + `executeCommunicationsSend` + Python worker + webhooks). Roughly **55–65% of Messaging V2 foundation exists** as refactor-and-extend work rather than a greenfield rewrite. Gaps are concentrated in **global inbox UX**, **org-wide thread aggregation APIs**, **draft/archive folders**, **attachments**, **provider OAuth (Google/Microsoft)**, **notification center**, and **entity-generalization** beyond opportunities/jobs/persons.

---

## 1. Current surfaces

### 1.1 Header messaging icon

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | `web/app/adminV2/components/TopNavBar.tsx` — utility button labeled **Messages** (not Inbox) |
| **Behavior** | Opens `QuickMessageModal` (`web/app/adminV2/components/QuickMessageModal.tsx`); does **not** navigate to inbox |
| **Data source** | Modal: `GET /api/admin/communications/person-search`, optional thread preview via entity threads API for selected person |
| **APIs** | `POST /api/admin/communications/send` with `quick_message: true` → person-anchored threads |
| **Tables** | `communication_threads`, `communication_messages`, `persons` |
| **Limitations** | No unread badge; no org-wide conversation list; no left-rail folders; label still "Messages" |
| **Reuse** | Modal person search + send path; rename + wire to Inbox route; poll `GET /api/admin/communications/unread-count` |

**Related:** `GET /api/admin/communications/unread-count` exists but is **not consumed** by TopNavBar.

---

### 1.2 Communications page (`/adminV2/messages`)

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | `web/app/adminV2/messages/page.tsx` — static scaffold |
| **Behavior** | Placeholder panels (recent conversations, search, compose notes) |
| **Data source** | None (no server fetch) |
| **APIs** | None today; doc comments reference future org-scoped aggregate |
| **Tables** | N/A |
| **Limitations** | Explicitly not an inbox; copy directs users to header Quick Message |
| **Reuse** | Route slug becomes Inbox home; replace scaffold with real client |

**Legacy parallel:** `web/app/admin/messaging/MessagingClient.tsx` — **Messages** tab is `ComingSoon`; **Outbox** tab reads `messages_outbox`.

---

### 1.3 Communications tab in drawers

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | `web/components/admin/communications/CommunicationsDrawerSection.tsx` (primary); mounted from `web/components/admin/AdminEntityDrawer.tsx` |
| **Mount contexts** | **Opportunities** (comms tab + overview embed), **Jobs** (`communications_canonical_embed` deferred section), **Persons** (comms tab when active) |
| **Data source** | `GET /api/admin/communications/threads?entity_type=&entity_id=`, `GET .../threads/[id]/messages`, `GET /api/admin/communications/drawer-recipients`, `GET /api/admin/communications/bindings` |
| **APIs** | `POST /api/admin/communications/send`, `POST /api/admin/communications/messages/mark-read` |
| **Tables** | `communication_threads`, `communication_messages`, `communication_message_reads`, `communication_provider_bindings`, `persons`, entity tables |
| **Limitations** | Entity-scoped only; send limited to opportunities/jobs/persons (threads **read** supports customers/schedules/contacts normalization); dark outbound bubbles (`bg-alloy-midnight`); plain-text composer; no attachments; in-app channel hidden; max 10 merged threads |
| **Reuse** | Thread/message rendering, delivery state adapter, recipient resolution, mark-read — extract shared modules for Inbox detail pane |

**Not mounted:** Customer, vendor, child-as-primary, opportunity-adjacent entities without drawer wiring. `PersonDrawerChildCommunicationsPlaceholder.tsx` is a placeholder for child grain.

**Prefetch:** `web/lib/admin/communications/communicationsDrawerPrefetch.ts` — session cache for drawer open perf.

---

### 1.4 BOS communication actions

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | `web/lib/adminV2/bos/communication/*` (draft synthesis), `web/lib/adminV2/bos/bosAssistHandoffRouting.ts`, Task Assist UI (`web/components/admin/taskAssist/*`) |
| **Behavior** | Review Assist → deterministic SMS/email draft bodies → Task Assist propose → human approve → `executeCommunicationsSend` or `communication_scheduled_sends` |
| **Data source** | Entity overview + attention context; proposals in `task_assist_proposals` |
| **APIs** | `POST /api/admin/ai/task-assist/propose`, `apply`, proposals approve/reject; `communication-scheduled-sends/*` |
| **Tables** | `task_assist_proposals`, `communication_scheduled_sends`, `communication_messages`, `operational_tasks` |
| **Limitations** | Opportunities-centric schema constraints; deterministic drafts only (no thread history grounding); no autonomous send |
| **Reuse** | Composer V2 "BOS Action" bottom bar; scheduled send infrastructure; proposal payload as draft source |

**Registry actions:** `send_email`, `send_sms` → `applyRegistryResolvedActionClient` opens Quick Message with channel preselect (`web/lib/adminV2/quickMessageLaunch.ts`).

---

### 1.5 Existing notifications

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | **No messaging notification bell.** `OperationalTasksNavBadge` in TopNavBar covers operational tasks only |
| **Data source** | `operational_tasks` via operational tasks APIs |
| **APIs** | `GET /api/admin/operational-tasks` (workspace summaries) |
| **Tables** | `operational_tasks` — not a notification inbox |
| **Limitations** | Product doc explicitly: **"No notification system"** for messages; unread comms API unused in shell |
| **Reuse** | Operational tasks badge pattern; unread-count API; future convergence target |

**Schema note:** No `notifications` table in `docs/supabase/reference/supabase_tables.csv`.

---

### 1.6 Existing message threads

| Attribute | Detail |
|-----------|--------|
| **Component ownership** | Drawer section + Quick Message thread preview |
| **Data source** | Canonical `communication_threads` + `communication_messages` |
| **APIs** | Threads route merges **record-anchored** threads with **related-person** threads (opportunity/job/customer household persons, cap 60 IDs) |
| **Tables** | See §2 |
| **Limitations** | No cross-record thread; uniqueness `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` prevents multi-record single thread; bounded previews (200-msg scan) |
| **Reuse** | Thread identity model; extend aggregation layer for org inbox without changing uniqueness initially |

---

## 2. Existing data model

**Schema source:** `docs/supabase/reference/supabase_schema_columns.csv`, `supabase_constraints.csv`, migrations `20260430254100_communications_v1_foundation.sql`, `20260521103000_task_assist_v1_1_foundation.sql`.

### 2.1 Communication-related tables (complete map)

| Table | Kind | RLS | Role | Key relationships |
|-------|------|-----|------|-------------------|
| `communication_provider_bindings` | Canonical | Yes | Org/location/user-scoped provider routing; secrets via `secret_ref` | → `orgs`, `locations`; ← `communication_messages`, `communication_scheduled_sends` |
| `communication_threads` | Canonical | Yes | Conversation container anchored to one primary entity + channel + recipient | → `orgs`, `locations`; ← `communication_messages`; UNIQUE `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` |
| `communication_messages` | Canonical | Yes | Inbound/outbound message rows; delivery lifecycle | → `communication_threads`, `orgs`, `workflow_runs`, `communication_provider_bindings`; ← `communication_message_reads`, `communication_scheduled_sends` |
| `communication_message_reads` | Canonical | Yes | Per-user read receipts (inbound) | PK `(message_id, user_id)` → `communication_messages`, `orgs` |
| `communication_scheduled_sends` | Canonical | Yes | Approved one-time scheduled outbound snapshot | → `opportunities`, `persons`, `task_assist_proposals`, `communication_provider_bindings`, `communication_messages` |
| `task_assist_proposals` | BOS adjacency | Yes | Durable draft/schedule/reminder proposals | → `opportunities`; ← `communication_scheduled_sends`, `operational_tasks` |
| `operational_tasks` | BOS adjacency | Yes | CRM tasks / reminders (not messages) | → `opportunities` (nullable entity after `20260603120000` migration for unlinked tasks) |
| `messages` | Legacy | Yes | Workflow + inbound SMS parallel queue | FK columns: `customer_id`, `contact_id`, `job_id`, `opportunity_id`, `related_entity_*`; **no org_id column** |
| `messages_outbox` | Legacy | Yes | Workflow audit / admin outbox UI | → `orgs`, `workflows`, `workflow_runs`; `to_contact_id` compatibility |

**Views:** None dedicated to communications in `supabase_views.csv`.

**Adjacent (not message storage):** `persons` (email, phone, metadata for consent fields via layout), `contacts` (legacy recipient linkage in `messages_outbox`), `workflow_events` / `workflow_runs` (orchestration spine).

### 2.2 Column highlights by concern

**Messages (`communication_messages`):** `channel` (sms|email|in_app), `direction`, `status` (default queued), `body`, `body_format` (plain), `subject`, addresses, `provider`, `provider_message_id`, `workflow_run_id`, `metadata`, timestamps (`sent_at`, `delivered_at`).

**Threads (`communication_threads`):** `primary_entity_type`, `primary_entity_id`, `recipient_key` (normalized email/E.164 or empty), `location_id`, `metadata`.

**Participants:** **No `communication_participants` table.** Participation is implied by:
- `recipient_key` on thread (counterparty address)
- `recipient_person_id` in send metadata / scheduled sends
- Related-person thread fan-out in threads API

**Read/unread:** `communication_message_reads` + inbound messages without read row; drawer marks read via API; org unread count bounded to 300 recent inbound IDs.

**Attachments:** **Not modeled** on `communication_messages`. Documents use separate `documents` entity (forms/packets path).

**Record associations:** Single `primary_entity_*` per thread. Send metadata may include `recipient_person_id`, `source`, Task Assist telemetry. Legacy `messages` has multiple nullable FKs (opportunity, job, customer, contact).

**Drafts:** **No `communication_drafts` table.** Draft intent lives in `task_assist_proposals` (payload JSON) and composer local state only.

**Notification entities:** **None.** Unread is derived from messages + reads.

### 2.3 Audit questions

| # | Question | Answer |
|---|----------|--------|
| 1 | What is the canonical communication object? | **`communication_messages`** — single row per inbound/outbound message with delivery state, provider correlation, optional workflow link. |
| 2 | What is the canonical thread object? | **`communication_threads`** — org-scoped, entity-anchored conversation keyed by channel + `recipient_key`. |
| 3 | Can communications span multiple records? | **Not in one thread today.** Uniqueness ties one primary entity. Related persons appear as **separate person-anchored threads** merged in UI. Multi-record **association** would require new join table or metadata convention. |
| 4 | How are communications associated with entities? | Thread `primary_entity_type/id`; send path sets anchor (opportunity/job/person for quick message); legacy `messages` uses nullable FKs + `related_entity_*`. |
| 5 | What prevents inbox-style behavior? | (a) No org-wide thread list API with pagination/filters; (b) entity-scoped queries only; (c) no folder model (sent/drafts/archived); (d) no shell unread integration; (e) read model is per-message not per-thread last-seen; (f) scheduled sends not exposed in a "Scheduled" folder UX. |

### 2.4 Entity abstraction readiness

| Entity | Thread GET | Send POST | Drawer comms | Notes |
|--------|------------|-----------|--------------|-------|
| Opportunity | Yes | Yes | Yes | Primary CRM path |
| Job | Yes | Yes | Yes (embed) | Location-aware binding resolution |
| Person | Yes | Yes | Yes | Quick message anchor |
| Customer | Yes (read) | No | No dedicated tab | Related persons fan-out only |
| Lead | Via opportunity | Via opportunity | Indirect | No lead-primary thread product |
| Child | Placeholder | No | Placeholder | Person-child module |
| Vendor / future | Normalize in API | No | No | Requires entity registry extension |

---

## 3. Integration readiness audit

### 3.1 Google

| Capability | Status | Evidence |
|------------|--------|----------|
| **OAuth readiness** | **Not implemented** | No Gmail/Google Workspace OAuth routes, token storage, or send-as-user adapters. Supabase `auth.oauth_*` tables are platform login only. |
| **Send email readiness** | **Not implemented** | Outbound email is **Resend-only** (`composerChannels.ts`: `provider === "resend"`). |
| **Receive email readiness** | **Not implemented** | No inbound email webhook, parsing, or mailbox sync. |

**Peripheral:** Google Calendar **deeplinks** in tour emails (`web/lib/tours/comms/tourAddToCalendarLinks.ts`) — not email integration.

### 3.2 Microsoft

| Capability | Status | Evidence |
|------------|--------|----------|
| **OAuth readiness** | **Not implemented** | No Microsoft Graph / Outlook OAuth. |
| **Send email readiness** | **Not implemented** | Same Resend-only path. |
| **Receive email readiness** | **Not implemented** | No Graph subscription or inbound parsing. |

**Peripheral:** Outlook calendar **deeplinks** in tour comms — same as Google links pattern.

### 3.3 SMS (Twilio)

| Capability | Status | Evidence |
|------------|--------|----------|
| **Twilio readiness** | **Production path exists** | Outbound: `backend/app/integrations/twilio_client.py`, `communication_message_sender.py`. Inbound: `backend/app/routes/sms_inbound.py`, `communication_inbound.py`. Status webhook: `POST /api/webhooks/twilio/sms-status`. |
| **Number ownership model** | **Org binding rows** | `communication_provider_bindings.inbound_to_e164` + unique per org; `scope` org/location/user (user stubbed). Secrets via `secret_ref` (`env:VAR`, `legacy_global_twilio`, `unconfigured`). |
| **Routing model** | **Binding resolver hierarchy** | `backend/app/services/communications/binding_resolver.py`: user (stub) > location > org, primary first. Inbound matches `inbound_to_e164` to binding → entity hint. |

**Gaps:** No tenant self-serve number purchase; no multi-number campaign routing; SMS consent page exists (`web/app/sms-consent/page.tsx`) but opt-out not enforced at send gate in canonical path (see architecture doc).

### 3.4 Email (Resend — current provider)

| Capability | Status |
|------------|--------|
| Send | Implemented via worker + bindings |
| Receive | Not implemented (transactional outbound only) |
| Webhooks | Resend lifecycle via Svix (`RESEND_WEBHOOK_SECRET`) |
| Templates | Code-level (tours, opportunity compose starters) — no DB template table |

---

## 4. Pipeline inventory (reuse map)

```
UI (Drawer / Quick Message / Settings)
    → POST /api/admin/communications/send | task-assist/apply | communication-scheduled-sends/process-due
    → executeCommunicationsSend
    → enqueueCanonicalOutboundMessage (thread upsert + message insert)
    → emitEvent message_queued
    → triggerBackendMessagesQueue
    → Python POST /internal/messages/process
    → communication_message_sender (SMS + email)
    → Twilio / Resend
    → Webhooks → providerDeliveryPersistence
```

**Legacy parallel:** `workflowRun.ts` → `messages` / `messages_outbox` → `message_sender.py` (still drained).

---

## 5. Foundation reuse estimate

| Layer | Exists | Gap | Reuse % |
|-------|--------|-----|---------|
| Core schema (`communication_*`) | Threads, messages, reads, bindings | Participants, attachments, drafts, archive flags, multi-entity links | ~65% |
| Send/delivery pipeline | Canonical enqueue, worker, webhooks | Provider adapter interface formalization; Google/Microsoft | ~70% |
| Scheduling | `communication_scheduled_sends` + process-due | Generalize entity FK; inbox Scheduled folder | ~50% |
| Drawer UX | Full compose + thread view | Visual refresh; rich editor | ~45% |
| Global inbox | Scaffold route only | Aggregate APIs, folders, search | ~15% |
| Notifications | Unread API | Bell, assignments, mentions convergence | ~10% |
| Templates / merge fields | Code templates (tours, opp compose) | DB templates + merge registry | ~25% |
| Preferences | Layout field keys for consent/opt-out on person drawer | Enforced send gates; no columns on `persons` in schema CSV | ~20% |

**Conclusion:** Extend **`communication_*`** and **`executeCommunicationsSend`** rather than replacing. Retire **`messages`** / **`messages_outbox`** on a separate track (`docs/audits/legacy-messages-retirement-plan.md`).

---

## 6. Risks and verification debt

- Per-org binding/channel matrix in production — **needs verification** (`communications.md`).
- `INTERNAL_MESSAGES_PROCESS_URL` / cron cadence — **needs verification**.
- Inbound SMS dual-write to legacy `messages` — verify canonical parity per deployment.
- Unread count capped at 300 recent inbound — insufficient for large orgs at scale.
- RLS on legacy `messages` without `org_id` — documented audit risk.

---

## 7. Related artifacts

| Doc | Purpose |
|-----|---------|
| `messaging_v2_design.md` | Target UX (Phase 1) |
| `messaging_v2_architecture.md` | Schema and adapter proposals (Phase 2) |
| `messaging_v2_implementation_plan.md` | Sprint breakdown (Phase 3) |
| `docs/product/communications.md` | Active product truth |

**Suggested commit message:** `docs(sprint): Messaging V2 Phase 0 communications audit`
