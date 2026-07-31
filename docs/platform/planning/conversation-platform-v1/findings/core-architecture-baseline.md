# Conversation Platform V1 — Core Architecture Baseline

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## 0. Executive shape — the four facts that matter

1. **There is no "V2 conversation table."** Comms V2 is *additive columns on the V1 tables* plus satellite tables. `communication_threads` / `communication_messages` are the single live model. The real dual-model risk is **not** V1-vs-V2 threads — it is (a) three parallel *template/announcement* schemas layered by `CREATE TABLE IF NOT EXISTS` no-ops, (b) legacy `public.messages`/`messages_outbox` still live alongside `communication_messages`, (c) legacy `communication_provider_bindings` still live alongside the new identity platform.
2. **A conversation attaches to exactly one thing: `(primary_entity_type, primary_entity_id)`** on `communication_threads`. There is **no** column, FK, or code path linking a thread or message to a business process, process instance, participation, record, or work unit. Grep for `business_process|participation|process_instance|record_id` across `web/lib/communications/`, `web/lib/adminV2/bos/communication/`, `web/app/api/admin/communications/` returns **zero hits**.
3. **The entity-type vocabulary is unconstrained and inconsistently cased/pluralized.** `primary_entity_type` is bare `text NOT NULL`, no CHECK (`20260430254100:38`). Live values include `opportunities`/`opportunity`, `persons`/`person`, `customers`/`customer`, `jobs`, and synthetic `communications_unknown`.
4. **Large parts of the V2 schema are dead**: `sla_events`, `communication_snippets`, `announcement_deliveries`, `communication_preference_events` have zero readers/writers; `communication_message_recipients` is **never INSERTed** by any runtime path.

---

## 1. Database model

### 1.1 Migration inventory

| File | What it does |
|---|---|
| `20260430254100_communications_v1_foundation.sql` | **V1 core** — 4 canonical tables |
| `20260501200000_seed_staging_communication_provider_bindings.sql` | Seeds staging bindings |
| `20260501201000_activate_staging_org_resend_binding.sql:4-18` | Activates staging Resend binding, `secret_ref='env:RESEND_API_KEY'` |
| `20260502120000_communication_messages_subject.sql:2-3` | `+ communication_messages.subject text NULL` |
| `20260521103000_task_assist_v1_1_foundation.sql:83-160` | **Creates `communication_scheduled_sends`** — not a comms-named migration, easy to miss |
| `20260522140000_claim_due_communication_scheduled_sends.sql:3-48` | `claim_due_communication_scheduled_sends()` RPC (SKIP LOCKED lease) |
| `20260527150000_tour_scheduling_comm_scheduled_sends_source.sql` | `source='tour_scheduling'` + tour-reminder dedupe index |
| `20260529210000_person_communication_opt_out_field.sql` | Seeds a `field_definitions` row — a **third** consent store |
| `20260604100000_inbox_foundation_thread_columns.sql` | `archived_at`, `last_message_at` + insert trigger |
| `20260619120000_comms_v2_conversation_core.sql` | PKG-02: 8 assignment/SLA/attention columns; `conversation_assignment_events`, `sla_events` |
| `20260619130000_comms_v2_delivery_events_receipts.sql` | PKG-03: `opened_at/clicked_at/replied_at`; `communication_delivery_events` |
| `20260619140000_comms_v2_preferences_recipients.sql` | PKG-04: recipients, preferences, preference events |
| `20260619150000_comms_v2_templates_announcements.sql` | **PKG-05 templates/announcements — schema A** |
| `20260619160000_comms_v2_receipt_columns.sql` | Receipt columns + provider-event idempotency index + one-time backfill |
| `20260622120000_comms_v2_templates.sql` | **Phase-1/B1 templates — schema B (conflicts with A)** |
| `20260622123000_comms_v2_announcements.sql` | **B4 announcements — schema B (conflicts with A)** |
| `20260622130000_comms_v2_announcement_scheduling.sql` | B7: generalizes scheduled sends; **replaces the claim RPC with a source gate** |
| `20260623130000_comms_v2_templates_schema_align.sql` | Repair migration reconciling A↔B |
| `20260623140000_comms_v2_template_version_legacy_compat.sql` | Trigger syncing `version` ↔ `version_number` |
| `20260707170000_activate_staging_org_twilio_binding.sql` | Activates staging Twilio binding |
| `20260708160000…`, `20260709140000…` | Staging orphan-thread data repair |
| `20260715120000_communications_identity_platform_foundation.sql` | **Identity platform (Phase 2)** — 4 tables + 2 message columns + idempotent backfill |

### 1.2 Table-by-table

**`communication_provider_bindings`** — V1-legacy, **still live**. `20260430254100:4-32`. `channel` CHECK `('sms','email')`, `scope` CHECK `('org','location','user')`, `status` CHECK `('active','disabled','pending_verification')`, `secret_ref text DEFAULT 'unconfigured'`. Convention `legacy_global_twilio | unconfigured | env:VAR_NAME` (`:169`). Indexes `:22,:26,:30`. **Superseded by the identity platform but still the operative store** — the only thing the Settings UI writes (`web/app/adminV2/settings/communications/CommunicationsSetupClient.tsx:83` → `PATCH /api/admin/communications/bindings/{id}`), and `executeCommunicationsSend.ts:188-197` still reads it for channel availability.

**`communication_threads`** — V1 core, extended by V2; single live model. V1 `20260430254100:35-51`: `primary_entity_type text NOT NULL` (no CHECK) `:38`, `primary_entity_id uuid NOT NULL` (no FK, polymorphic) `:39`, `channel` CHECK `('sms','email','in_app')`, `recipient_key text NOT NULL DEFAULT ''`, `location_id`, `metadata jsonb`. Identity constraint `UNIQUE (org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` `:46`. Inbox `+archived_at, +last_message_at` (`20260604100000:4-6`). PKG-02 `+assigned_user_id, assigned_team_id, assignment_state` (CHECK `unassigned|assigned` `:24-27`), `attention_state` (**free text** `:33`), `first_response_at`, `sla_due_at`, `sla_state` (**free text** `:36`), `last_read_at` (`20260619120000:8-16`). Trigger `trg_comm_messages_bump_thread_last_message` (`20260604100000:32-52`).

**`communication_messages`** — V1 core, extended 3×. `20260430254100:54-74`: `thread_id`→threads CASCADE, `channel`, `direction` CHECK `('inbound','outbound')`, `status text DEFAULT 'queued'` (**no CHECK**), `body`, `body_format`, `from_address`, `to_address`, `provider`, `provider_message_id`, `error`, `workflow_run_id`, `communication_provider_binding_id`, `metadata`, `created_at`, `sent_at`, `delivered_at`. `+subject` (`20260502120000:2`); `+opened_at/clicked_at/replied_at` (`20260619130000:8-11`); `+communication_identity_id`, `+communication_provider_account_id` (`20260715120000:166-170`).

**`communication_message_reads`** — `20260430254100:83-89`. PK `(message_id, user_id)`. Staff read state, not family receipts.

**`communication_scheduled_sends`** — `20260521103000:83-117`. `entity_type` CHECK originally `='opportunities'` only; `recipient_person_id`→persons **RESTRICT**; `subject_snapshot`/`body_snapshot` (frozen content); `status` CHECK `('pending','claimed','queued','sent','canceled','failed')` `:97-105`; `claim_token uuid`; `CHECK (scheduled_for > approved_at)` `:116`. Triggers `:150-160`. B7 relaxations (`20260622130000:9-37`): `source` → `('task_assist','tour_scheduling','announcement')`; `entity_type` → `('opportunities','announcements')`; `entity_id` DROP NOT NULL; `+announcement_id`.

**`conversation_assignment_events`** — `20260619120000:40-55`. Written only by `conversations/[id]/assign/route.ts:71`.

**`sla_events`** — `20260619120000:58-70`. **DEAD.** Only reference is the name constant `web/lib/communications/v2/conversationCore.ts:14`.

**`communication_delivery_events`** — `20260619130000:20-32` + `20260619160000:8-24`. Idempotency `uq_comm_delivery_events_provider_event UNIQUE (provider, provider_event_id) WHERE provider_event_id IS NOT NULL` (`20260619160000:19-21`). Written by `providerDeliveryPersistence.ts:82`.

**`communication_message_recipients`** — `20260619140000:8-27` + `20260619160000:27-41`. **READ/UPDATE-ONLY — never inserted.** The only INSERT that ever existed is the one-time backfill `20260619160000:45-51`. `providerDeliveryPersistence.ts:119-122` is an `.update()`; `communication_inbound.py:305` is a PATCH; `loadFamilyThreadsData.ts:74` is a read. **Every message created after 2026-06-19 has no recipient row, so the webhook per-recipient update is a silent no-op.**

**`communication_preferences` / `communication_preference_events`** — `20260619140000:31-64`. `UNIQUE (org_id, person_id, category)` `:42`; `person_id` deliberately **no FK** `:114`. `state`/`category` free text. `communication_preference_events` is **DEAD**.

**`communication_templates` / `communication_template_versions`** — **the dual-schema hazard.**

| | PKG-05 `20260619150000:6-36` | B1 `20260622120000:12-80` |
|---|---|---|
| status | `approval_status` CHECK `draft/pending/approved` | `status` CHECK `draft/active/archived` |
| category | `text NULL` | `text NOT NULL` CHECK 6-value |
| channel | `('email','sms')` | `('email','sms','in_app')` |
| actors | `created_by_user_id` | `created_by`, `updated_by` |
| version | `version integer` | `version_number integer` |
| extras | `variables jsonb`, `body_format` | `token_paths text[]`, `metadata jsonb` |

B1's `CREATE TABLE IF NOT EXISTS` is a **no-op** wherever PKG-05 ran (acknowledged verbatim `20260622120000:30-32`, `20260623130000:1-3`). Two repairs follow: `20260623130000` ALTERs missing columns and rewrites CHECKs `:37-43`; `20260623140000:14-33` installs `sync_communication_template_version_legacy()`. **Net: the shipped schema depends on apply order, and reconciliation is by trigger, not by structure.**

**`announcements` / `announcement_targets` / `announcement_deliveries` / `announcement_recipients`** — **second dual-schema hazard, and the sharpest risk found.** PKG-05 `20260619150000:51-97` creates `announcement_targets` with `target_spec jsonb`, `resolved_count`. B4 `20260622123000` ALTERs `announcements` additively `:10-16` (safe) then attempts `CREATE TABLE IF NOT EXISTS announcement_targets` with a **completely different shape** — `target_type` CHECK 7-value, `target_ref uuid`, `rule jsonb` `:50-59`. **That CREATE is a no-op where PKG-05 ran, and there is no repair migration** (unlike templates). The live API writes the *B4* columns: `announcements/[id]/targets/route.ts:78-85` inserts `{org_id, announcement_id, target_type, target_ref, rule}`. **On any database where `20260619150000` applied first, this route errors on unknown columns while `target_spec` sits NOT NULL.**

`announcement_deliveries` (PKG-05) is **DEAD**. `announcement_recipients` (B4 `20260622123000:64-78`) is the live one; B7 redefines its status vocabulary `20260622130000:95-103`.

**`communication_snippets`** — `20260619150000:38-48`. **DEAD.**

**Identity platform** — `20260715120000`: `communication_provider_accounts` `:13-34`, `communication_identities` `:52-82` (`channel` CHECK `sms|email|voice|internal`, `scope` CHECK `tenant|location|department|system`, `is_default_for_scope`, `legacy_binding_id`), `communication_identity_location_bindings` `:105-119`, `communication_identity_grants` `:138-154`. Idempotent backfill `:259-412` — skips bindings with no resolvable address rather than fabricating placeholders `:317-341`. **No API or UI creates rows in these tables.** `/api/admin/communications/identities` is GET-only; the only writers are the backfill.

### 1.3 RLS — uniform pattern, two structural notes

Every communications table uses the identical two-policy pattern (template `20260430254100:101-146`):

```sql
CREATE POLICY <t>_select_org ON <t> FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.org_id = <t>.org_id));
CREATE POLICY <t>_service_all ON <t> FOR ALL TO authenticated
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

Plus `GRANT ALL ... TO anon, authenticated, service_role`.

- **The `_service_all` policies are inert.** Scoped `TO authenticated`, where `auth.role()` is `'authenticated'`, never `'service_role'`; and real `service_role` bypasses RLS entirely. Net: authenticated org members get SELECT and nothing else — the intended outcome, but not by the mechanism the SQL implies.
- **`GRANT ALL TO anon`** on every table; anon is blocked only because no anon SELECT policy exists. Grants and RLS disagree.
- **Write-side tenant isolation is application-level, not RLS.** Every route uses `createAdminClient()` (service role) and scopes by explicit `.eq("org_id", ctx.orgId)`. Stated in-repo at `docs/sprints/archive/06_2026/communications-v2/communications_v2_phase1_sprint_plan.md:168`.
- `communication_scheduled_sends` was **given no RLS and no policies** in `20260521103000` — only the two org-matching triggers.

### 1.4 DB functions & triggers

| Object | Defined | Purpose |
|---|---|---|
| `bump_communication_thread_last_message_at()` + trigger | `20260604100000:32-52` | Denormalizes `last_message_at` |
| `claim_due_communication_scheduled_sends(...)` | `20260522140000:3-48`, **REPLACED** `20260622130000:47-90` | SKIP LOCKED lease; v2 adds source gate `:68` |
| `enforce_communication_scheduled_sends_org_matches_entities()` + trigger | `20260521103000:130-154` | Cross-org guard |
| `sync_communication_template_version_legacy()` + trigger | `20260623140000:14-33` | Mirrors `version` ↔ `version_number` |
| `set_updated_at` triggers | `20260521103000:156-160`, `20260715120000:179-197` | Standard |

### 1.5 V1-legacy vs V2 — the honest answer

| Layer | Legacy | Successor | Both live? |
|---|---|---|---|
| Message store | `public.messages`, `messages_outbox` | `communication_messages` | **YES** — `sms_inbound.py:94`, `message_sender.py:44,137`, `workflowRun.ts:2028,2070`; `messages_sender.py:78,89` drains **both** queues in one request |
| Threads | *(none)* | same table +10 V2 columns | N/A — **no dual thread model** |
| Provider config | `communication_provider_bindings` | `communication_provider_accounts` + `communication_identities` | **YES** — bindings remain the only writable surface (`docs/platform/modules/communications-identity-platform.md:79-86`) |
| Templates | PKG-05 shape | B1 shape | **YES, same tables** — reconciled by ALTER + trigger |
| Announcement targets | PKG-05 `target_spec` | B4 `target_type/target_ref/rule` | **YES, same table, UNRECONCILED** |
| Consent | `field_definitions.person.communication_opt_out`; `persons.metadata.*_opt_in` | `communication_preferences` | **THREE stores** (`communications_v2_phase_next_audit.md:65`) |

---

## 2. Runtime code

### 2.1 `web/lib/communications/` (31 files)

| Module | Role | Entry point | Consumers |
|---|---|---|---|
| `executeCommunicationsSend.ts` (332 L) | **The single guarded send path** — consent gate → recipient resolution → channel availability → sender resolution → enqueue → worker trigger | `executeCommunicationsSend()` `:93` | `communications/send`, `family-send`, `family-note`, `ai/task-assist/apply`, `opportunities/[id]/form-deliver`, `communicationScheduledSendsService.ts:648`, `v2/consentGate.ts` |
| `canonicalOutboundEnqueue.ts` (283 L) | Thread upsert + message INSERT + `message_queued` + workflow dispatch | `enqueueCanonicalOutboundMessage()` `:136` | executeSend `:291`, `mirrorQueuedMessage.ts`, `tourCommsOrchestrator.ts`, `enrollment-packet-launch` |
| `communicationScheduledSendsService.ts` (712 L) | Scheduled-send CRUD + drain loop + stale-claim release | `processDueCommunicationScheduledSends()` `:581`, `releaseStaleClaims` `:474` | scheduled-sends routes, `tourSchedulingScheduledSends.ts` |
| `inboxThreadsService.ts` (1051 L) | Folder inbox list/detail | — | `api/admin/inbox/threads*` **only** |
| `inboxThreadIdentity.ts` (264 L) | Reply-target + display-label resolution | `resolveInboxReplyTarget()` `:126` | InboxPanel, inboxThreadsService |
| `resolvePrimaryEntity.ts` | **Workflow payload → thread anchor**, priority `opportunity > job > customer > person` | `:4` | workflow mirror |
| `inboxEntityDrawerTarget.ts` | Anchor → drawer; accepts singular and plural `:27-32` | `:18` | `commandCenterRecordLinks.ts:41`, InboxPanel |
| `recipientKey.ts` | SMS/email normalization for the identity key | — | enqueue, executeSend, backend mirror |
| `providerDeliveryPersistence.ts` | Webhook receipt persistence, provider-event idempotency | `:135` | resend + twilio webhooks |
| `twilioSmsStatusWebhook.ts`, `twilioWebhookSignature.ts`, `twilioAuthToken.ts` | Twilio status callbacks + HMAC | — | both twilio webhook routes |
| `triggerBackendMessagesQueue.ts` | Fire-and-forget POST to Python worker | `:5` | executeSend `:318`, tour orchestrator, packet launch |
| `communicationPermissions.ts` | `communications.send` assert | `:43` | send / family-send / task-assist-apply / packet-launch |
| `composerChannels.ts`, `drawerComposerChannelAvailability.ts`, `drawerEmailRecipients.ts` | Channel availability + person-first eligibility | — | executeSend |
| `mirrorQueuedMessage.ts` | Legacy→canonical dual-write, gated by `COMMUNICATION_DUAL_WRITE` (default **off**, `communicationsEnabled.ts:2-5`) | — | workflowRun |
| `identity/` (9 files) | Canonical sender resolution | `resolveOutboundSender()` `:13`, `resolveSenderIdentity()` `:203`, `loadIdentityResolutionContext()` `:103`, `resolveInboundIdentity()` `:40` | executeSend, mirrorQueuedMessage, identities route. **`resolveInboundIdentity` has ZERO production consumers.** |

### 2.2 `web/lib/communications/v2/` (61 files + `providers/`, `familyWorkspace/`)

Groups: **Command Center** (`commandCenterViewModel`, `…ConversationEnrichment`, `…QueueProjection`, `…ThreadMessages`, `…RecordLinks`, `…PrefetchCache`) → `CommandCenterShell.tsx`. **Family workspace** → `FamilyCommunicationWorkspace.tsx`. **Templates** (`templateService`, `templateSchema`, `templateRender`, `templateTokens`, `templateCategory*`). **Announcements** (`announcementService`, `announcementSchema`, `announcementFanout`, `audienceSpec`, `audienceResolver`, `resolveAnnouncementAudience`, `scheduleAnnouncementSendout`). **Compliance** (`preferences`, `consentGate`, `consentEnforcement`, `preferenceMutations`). **Delivery** (`deliveryEvents`, `deliveryReceipts`, `deliveryReceiptMapping`, `receiptColumns`, `deliverability`). **Triage/SLA** (`conversationTriage`, `conversationCore`, `assignmentSla`). **Providers** (`registry`, `resendEmailAdapter`, `twilioSmsAdapter`, `deferredAdapters`).

Gating `v2/flags.ts:53-58` — ON: `command_center`, `record_tab`, `composer`, `live_workspace`. OFF: the other 8, notably `comms_v2_compliance`, so `enforceConsentForSend` (`executeCommunicationsSend.ts:115-124`) is a **no-op in production**.

**Dead V2 code:** `assignmentSla.computeSlaState()` `:90` has zero production callers. Neither `sla_state`, `sla_due_at`, nor `first_response_at` is ever written. The only non-null `sla_state` values in the repo are in `app/adminV2/communications/fixtures.ts:37-42`.

### 2.3 `web/lib/adminV2/bos/communication/` (6 files — deterministic, no AI)

`communicationObjectives.ts:10,69` → `communicationDraftSynthesis.ts:45` → `communicationDraftChannelCompose.ts:240` → `generateOperationalDraft.ts:47`. Support: `resolveRecipientGreeting.ts:57`, `operatorDisplayNameFromEmail.ts:2`. Consumers `bosAssistHandoffRouting.ts`, `messagingComposerBosEnhance.ts`. **No API route consumes these** — BOS drafting is client-side only.

### 2.4 `web/lib/adminV2/runtime/focusPanel/communications/` (1 file)

`buildCommunicationsCardEvidence.ts:38` — pure derivation over `context.signals.communications` (`scheduledSendCount`, `nextFollowUpAt`). Single consumer `CommunicationsCard.tsx`. **Reads only scheduled sends and follow-ups — no access to threads, messages, or unread state.**

### 2.5 `backend/app/services/communications/`

| File | Role | Entry points |
|---|---|---|
| `secret_ref.py:15-37` | `env:VAR` indirection; refuses to treat an unknown ref as a literal secret `:32-33` | `resolve_secret_plaintext()`, `is_legacy_global_twilio_binding()` |
| `binding_resolver.py:19-175` | Legacy binding selection; precedence **user (stub `:64-71`) > location > org-no-location > loose org > any** | `resolve_outbound_binding()`, `find_binding_by_id()`, `find_sms_bindings_by_inbound_to()` |
| `identity_resolver.py:1-177` | Canonical identity **validation**, never independent reselection `:1-6`; org-mismatch guard `:174-176` | `resolve_persisted_outbound_identity()`, `find_inbound_identities_by_destination()` |
| `status_callback.py:16-31` | Builds `/api/webhooks/twilio/sms-status/{binding_id}` | `build_sms_status_callback_url()` |

Siblings: `communication_inbound.py` (450 L, the only inbound ingestion in the system), `communication_message_sender.py` (438 L, the actual provider dispatcher).

---

## 3. API surface

### 3.1 `web/app/api/admin/communications/**` — 27 routes

| URL | Methods | Purpose | Auth |
|---|---|---|---|
| `/send` | POST `:40` | Canonical composer enqueue | `requireAdminOrOps` `:41` → **`assertCommunicationsSendAllowed`** `:47` |
| `/family-send` | POST `:21` | Review-first family send | flag `:22` → `requireAdminOrgContextLight` `:25` → **`assertCommunicationsSendAllowed`** `:28` |
| `/family-note` | POST `:14` | Internal note (`channel=in_app`) | flag `:15` → `requireAdminOrgContextLight` `:18` — **NO send-permission check** |
| `/conversations` | GET `:28` | Command Center queue | flag `:29` → `requireAdminOrgContextLight` `:32` |
| `/conversations/[id]/assign` | POST `:18` | claim/assign/reassign/unassign/route | flag `:19` → `requireAdminOrOps` `:22` |
| `/conversations/[id]/triage` | POST `:14` | set `attention_state` | flag `:15` → `requireAdminOrgContextLight` `:18` |
| `/threads` | GET `:94` | entity + related-person threads | `requireAdminOrgContextLight` `:95` |
| `/threads/[threadId]/messages` | GET `:9` | thread messages | `requireAdminOrOps` `:13` |
| `/messages/mark-read` | POST `:11` | read receipts | `requireAdminOrOps` `:12` |
| `/unread-count` | GET `:10` | bounded unread scan | `requireAdminOrgContextLight` `:11` |
| `/family-workspace` | GET `:21` | customer-scoped workspace VM | flag `:22` → auth `:25` |
| `/health` | GET `:16` | per-conversation health | flag `:17` → auth `:20` |
| `/deliverability` | GET `:11` | org delivery metrics | flag `:12` → auth `:15` |
| `/bindings` | GET `:34` | active bindings, secrets stripped `:11-31` | `requireAdminOrgContextLight` `:35` |
| `/bindings/[bindingId]` | PATCH `:13` | safe-field update | `requireAdminOrOps` `:14` |
| `/identities` | GET `:31` | read-only identity discovery | auth `:32`; `permission_stub` `:82` is **descriptive metadata, not enforcement** |
| `/preferences` | GET `:25` / PATCH `:55` | per-person consent | flag → auth `:29,:59` |
| `/drawer-recipients` | GET `:17` | person-first recipient rows | auth `:18` |
| `/person-search` | GET `:17` | quick-message picker | `requireAdminOrOps` `:18` |
| `/status-options` | GET `:17` | configured statuses for audience builder | `requireAdminOrOps` `:18` |
| `/templates` | GET `:25` / POST `:88` | template CRUD | `requireAdminOrOps` |
| `/templates/[id]` | GET `:29` / PATCH `:70` | fetch/update | `requireAdminOrOps` |
| `/templates/[id]/archive` | POST `:17` | soft archive | `requireAdminOrOps` |
| `/templates/[id]/preview` | POST `:17` | token render | `requireAdminOrOps` |
| `/announcements` | GET `:18` / POST `:47` | draft CRUD | `requireAdminOrOps` |
| `/announcements/[id]{,/archive,/cancel,/schedule,/targets}` | GET/PATCH/POST/PUT | lifecycle + targets | `requireAdminOrOps` |
| `/announcements/{[id]/,}recipient-preview` | POST | audience resolution (2 overlapping routes) | `requireAdminOrOps` |

### 3.2 `communication-scheduled-sends/**` — 3 routes

| URL | Methods | Auth |
|---|---|---|
| `/` | GET `:22`, POST `:68` | GET `requireAdminOrOps` `:23`; POST + **`assertCommunicationsSendAllowed`** `:75` |
| `/[id]` | PATCH `:47` | `requireAdminOrOps` `:48` + **`assertCommunicationsSendAllowed`** `:54` |
| `/process-due` | POST `:31` | **Dual**: `x-cron-token` vs `INTERNAL_CRON_TOKEN` via `timingSafeEqual` `:10-20,43` → **`orgIdFilter = null` (ALL ORGS)** `:46-47`; else session `requireAdminOrOps` `:49` → org-scoped `:53`. **No `assertCommunicationsSendAllowed` despite enqueuing sends.** |

### 3.3 Inbound / webhook routes — exhaustive

Only three exist in `web/app/api`, all outbound *status* callbacks. **There is no inbound-message route in the Next.js app at all.**

| URL | Provider | Verification |
|---|---|---|
| `/api/webhooks/resend` POST `:53` | Resend lifecycle | Svix. 503 if `RESEND_WEBHOOK_SECRET` unset `:54-56`; 400 missing headers `:61-63`; `Webhook.verify()` `:69-73` |
| `/api/webhooks/twilio/sms-status` POST `:9` | Twilio global/legacy | global `TWILIO_AUTH_TOKEN` `twilioSmsStatusWebhook.ts:72`, reject `no_auth_token` `:95-101`, signature verify `:127-143` |
| `/api/webhooks/twilio/sms-status/[binding_id]` POST `:9` | Twilio per-binding | token from binding `secret_ref` `:80-91`, then same verify |

**Middleware note:** `web/middleware.ts:41-42` bypasses only the two *exact* strings. The `[binding_id]` variant is **not** in the bypass list.

Real inbound lives in Python only: `backend/app/routes/sms_inbound.py` `:6-8`.

### 3.4 Adjacent routes

`api/admin/inbox/threads` GET `:11` and `[threadId]` PATCH `:14` — the **folder** inbox, a separate namespace from `/communications/conversations`. `api/admin/ai/task-assist/apply` POST `:24` (full permission chain `:31`); `api/admin/opportunities/[id]/enrollment-packet-launch` POST `:57` (check at `:238`); `api/admin/opportunities/[id]/form-deliver` POST `:33` — **dispatches email/SMS with no `assertCommunicationsSendAllowed`**.

**Three send-capable routes lack the send-permission gate:** `process-due:31`, `family-note:14`, `form-deliver:33`.

---

## 4. Workers / scheduled sending

### 4.1 Two queues, two drains

**Queue A — `communication_scheduled_sends`.** Drain: `POST /api/admin/communication-scheduled-sends/process-due` → `processDueCommunicationScheduledSends()` (`:581-712`) → RPC `claim_due_communication_scheduled_sends` `:589-596` (the only caller; **zero Python callers**).

**Queue B — `communication_messages` where `status='queued'`.** Drain: `POST /internal/messages/process` (`backend/app/routes/messages_sender.py:36`, mounted `server.py:34`) → runs **both** `process_queued_messages` (legacy `public.messages`, `:78`) and `process_communication_messages` (`:89`).

### 4.2 Invocation

- **Queue B** is poked opportunistically after every enqueue: `triggerBackendMessagesQueue.ts:5-37`, fire-and-forget, **silently no-ops if `INTERNAL_MESSAGES_PROCESS_URL` or `INTERNAL_CRON_TOKEN` is unset** `:12`. Called from `executeCommunicationsSend.ts:318`, `tourCommsOrchestrator.ts:306`, `enrollment-packet-launch/route.ts:376`, `workflowRun.ts:1831,2111`.
- **Neither queue has a committed schedule.** Verified negatives: no `vercel.json` under `web/`; no `crons` in `next.config.ts` or `package.json`; `.github/workflows/` has only `docs-lint.yml`, `operational-expectations-gates.yml`, `web-typecheck.yml` with no `schedule:`; no celery/apscheduler/arq/rq/`repeat_every` in `backend/`; no `render.yaml`.
- The only documented scheduler is **external**: `backend/README_MESSAGES_SENDER.md:61-68` (Render Cron Job → `/internal/messages/process`). **Nothing documents a scheduler for `process-due`** — its only in-repo trigger is the manual "Process now" button (`ScheduledSendDetailPopover.tsx:179-194` → `taskAssistV11OpportunityApi.ts:176-183`).

### 4.3 Retry / idempotency

**Lease (Queue A).** `claim_due_communication_scheduled_sends` `20260622130000:61-86`: `FOR UPDATE ... SKIP LOCKED LIMIT p_limit` `:71-72`, ordered `scheduled_for ASC, id ASC` `:70`; sets `status='claimed'`, `claim_token`, `claimed_at` `:77-80`. Precondition includes `communication_message_id IS NULL` `:67`. **The lease has no expiry column.** `GRANT EXECUTE ... TO service_role` only `:89-90`.

**Fencing.** `communicationScheduledSendsService.ts:643-646` re-reads and compares `claim_token`. Terminal writes are guarded CAS: failure `:663-684`, success `:686-706`, both `.eq("status","claimed").eq("claim_token", …).is("communication_message_id", null)`.

**Recovery branch** `:628-641`: a row carrying `communication_message_id` while still `claimed` is patched to `queued` with `metadata.recovered_queued_at`.

**Stale-claim release exists but is never invoked in production.** `:474-560`, `STALE_CLAIM_RELEASE_MINIMUM_AGE_MS = 30 min` `:475`. The doc comment `:486` states it is not called from the drain and needs a separate cron; `:488-491` acknowledges a residual double-send window. Only callers are tests.

**No retry anywhere.** No attempt counter, no `max_attempts`, no `next_attempt_at`, no backoff — not on the table, not in the service, not in `communication_message_sender.py`. `failed` is terminal in both queues.

**Queue B has no lease at all.** `communication_message_sender.py:120-135` polls with **no `FOR UPDATE`, no `SKIP LOCKED`, no claim step** — concurrent workers can double-send.

**Idempotency that does work:** webhook ingestion, via `uq_comm_delivery_events_provider_event` + precheck/unique-violation handling `providerDeliveryPersistence.ts:68-106`.

**Orphan status:** nothing ever transitions a scheduled-send row `queued → sent`. `'sent'` is in the CHECK but written by no code path.

### 4.4 End-to-end outbound path

```
[A] scheduled: cron|button → POST /api/admin/communication-scheduled-sends/process-due   (process-due/route.ts:31)
      → processDueCommunicationScheduledSends                        (…Service.ts:581)
      → RPC claim_due_… [pending→claimed +claim_token]               (…Service.ts:589)
      → fresh re-read + claim_token fence                            (…Service.ts:616,643)
[B] immediate: composer | task-assist | tour | packet-launch
    ────────────────────── both converge ──────────────────────
      → executeCommunicationsSend                                    (executeCommunicationsSend.ts:93)
          consent gate (flag OFF by default)                         (:115-124)
          person-first recipient resolution                          (:128-186)
          channel availability from LEGACY bindings                  (:188-207)
          resolveOutboundSender → identity + account + legacy binding (:229-266)
      → enqueueCanonicalOutboundMessage                              (canonicalOutboundEnqueue.ts:136)
          upsert communication_threads (5-col identity)              (:11-69)
          INSERT communication_messages status='queued'              (:78-125)
          emitEvent('message_queued') + workflow dispatch            (:220-280)
      → [A only] claimed→queued CAS + communication_message_id       (…Service.ts:686-706)
      → void triggerBackendMessagesQueue({limit:25})                 (executeCommunicationsSend.ts:318)
          → POST $INTERNAL_MESSAGES_PROCESS_URL  x-cron-token        (triggerBackendMessagesQueue.ts:17-24)
          → FastAPI POST /internal/messages/process                  (messages_sender.py:36)
              → process_queued_messages (LEGACY public.messages)     (:78)
              → process_communication_messages                       (:89)
                  poll queued (no lease)                             (communication_message_sender.py:120)
                  resolve_persisted_outbound_identity | binding      (:196,229,235)
                  Twilio send_sms(_with_credentials) | Resend
                  PATCH sent|failed + provider_message_id + events   (:282,348,407)
          → Twilio statusCallback → /api/webhooks/twilio/sms-status/[binding_id]
              → applyOutboundProviderDeliveryPatch                   (providerDeliveryPersistence.ts:135)
```

---

## 5. Subject / record attachment — the sprint's central question

### 5.1 The only persisted attachment

Two columns, on `communication_threads` only:

```sql
primary_entity_type text NOT NULL,   -- 20260430254100_communications_v1_foundation.sql:38
primary_entity_id   uuid NOT NULL,   -- :39
```

Neither has a CHECK or an FK — the anchor is polymorphic and unvalidated. They participate in the thread identity constraint `:46`.

**`communication_messages` has no subject columns at all.** A message's operational subject is reachable only through `thread_id`. (`communication_messages.subject` is the **email subject line**, unrelated.)

**There is no link to business processes, process instances, participations, records, or work units.** No column, no join table, no code.

### 5.2 The four writers of the anchor

| # | Path | Anchor selection | Cite |
|---|---|---|---|
| 1 | Composer / API send | Caller-supplied, passed straight through | `executeCommunicationsSend.ts:53-54` → `canonicalOutboundEnqueue.ts:169-176` |
| 2 | Workflow mirror | `opportunity > job > customer > person`, else raw passthrough if UUID | `resolvePrimaryEntity.ts:4-45` |
| 3 | **Inbound SMS (Python)** | 1 match → `("persons", id)`; 0 → `("communications_unknown", uuid5(NS, org\|phone))`; >1 → `("communications_unknown", uuid5(NS, org\|phone\|ids))` + `metadata.candidate_person_ids` | `communication_inbound.py:81-125` |
| 4 | Scheduled sends | Snapshot `entity_type='opportunities'` + `entity_id`, replayed through path 1 | `20260521103000:88-90` |

### 5.3 The G4 override — inbound *ignores* the anchor when a thread exists

`communication_inbound.py:184-225`: an inbound SMS first looks for **any** existing SMS thread in the org with the same `recipient_key`, **regardless of anchor**, preferring `persons`/`customers` `:219-222`, else most recent. Only if none exists does it create a thread with the resolved anchor `:352-363`. Docstring `:192`: *"the conversation is the relationship, not the originating business object."*

**Consequence:** the persisted anchor on a long-lived SMS thread is whatever the *first* message happened to attach to, and later work on other subjects lands on that same thread.

### 5.4 The read path — subject is re-derived at runtime, never stored

`web/lib/communications/v2/commandCenterConversationEnrichment.ts` normalizes case and accepts singular and plural (`isOpportunityEntity` `:44-46`, `isCustomerEntity` `:48-50`, `isPersonEntity` `:52-54`), then walks a ladder `:311-413`:

- customer anchor `:325-336` → customer name, primary contact, `oppIdByCustomerId`, stage label
- opportunity anchor `:337-349` → `oppCustomerByOppId` → customer → contact/stage
- person anchor `:350-369` → `personCustomerByPersonId` → customer → opportunity → stage
- fallback via `metadata.customer_id` / `metadata.customerId` `:385-390`
- then `resolveCommunicationQueueScope(...)` `:392-404`; when `resolved`, it may **override** the derived `customerId` `:406-413`

Output `opportunity_id` `:435`, `customer_id` `:438`, `scope_status` `:440` are **computed per request and persisted nowhere.** `metadata.customer_id` / `metadata.family_label` — which the ladder consults — are **never written by any send or inbound path** (zero hits in `canonicalOutboundEnqueue.ts`, `mirrorQueuedMessage.ts`, `communication_inbound.py`).

### 5.5 The only operational-work bridge

`web/lib/workItems/mapCommunicationThreadToWorkItemRow.ts` projects a *virtual* work item `communications:{threadId}` `:19` when `attention_state ∈ {needs_response, awaiting_parent_reply}` and not resolved `:40-47`. `entity_id`/`entity_type` fall back through `conversation.opportunity_id → primary_entity_id` and `primary_entity_type → "opportunities"` `:77-78`. **No `operational_tasks` row is created** — doctrine `docs/platform/modules/communications-platform.md:78-87`, `docs/sprints/archive/08_2026/work-items-v3-platform/14-communications-convergence-matrix.md:26`.

### 5.6 Anchor drawer mapping

`inboxEntityDrawerTarget.ts:18-35` maps exactly four types (`opportunities`, `persons`, `jobs`, `customers`), tolerating singular and plural `:27-30`. **Anything else — including every `communications_unknown` thread — returns `null` and is undrillable.** Reply is narrower: `inboxThreadIdentity.ts:118` restricts `REPLY_ENTITY_TYPES` to `opportunities | jobs | persons` (no `customers`), returning *"No reply path for this conversation record."* `:199`.

---

## 6. Docs — stated architecture and admitted gaps

### 6.1 What the docs claim

- **Doctrine** (`Alloy_Comms_V2_Plan_and_Doctrine.docx` §1): *"Communications are operational work"*; *"Messages are supporting artifacts — they hang off relationships and operational work, not the reverse."* Command Center queue is *"not email folders, not a generic inbox"* (Plan §3.1).
- **Extend, don't fork** (`messaging_v2_architecture.md:9`): *"Extend canonical `communication_*` tables (~65% reusable)... do not fork parallel message stores"*; `:147` *"Do not create parallel `inbox_messages` or `email_messages` tables"*; `:330` *"not introducing `communications_v2_*` tables."*
- **Additive-only migration rule** (Scope Freeze §4): *"All additive and nullable first; no destructive change in place."*
- **Identity resolution order** (`communications-identity-platform.md:40`): *"override → location default → location priority → tenant default (id-sorted) → legacy fallback."* Python must validate, never reselect `:56-59`.
- **Legacy retirement** (`docs/audits/active/legacy-messages-retirement-plan.md`): Phase 0 freeze → 5 schema retirement; Phase 5 *"future; not scheduled here."*

### 6.2 Explicitly deferred / known-incomplete

- **Inbound email: not implemented** — Scope Freeze §2.2; `communications-identity-platform.md:71`; `operator-workflow-signoff.md:26-38`.
- **`communication_message_recipients` not written by the live send path** — `communications_v2_scheduling_reuse_drift_audit.md:42,48` (gap H-3).
- **Consent fragmented across three sources** — `communications_v2_phase_next_audit.md:65`.
- **`sla_state` "exists but rarely populated"** — `staging-command-center-checkpoint.md:80`; *"~119 threads, most with null `attention_state`"* `:119`.
- **No in-product classification workflow** — `operator-workflow-signoff.md:62`; `staging-command-center-checkpoint.md:78`.
- **Announcement audience blockers** — `communications_v2_audience_target_classification.md:27` (Active families BLOCKED on product definition); `:29` (Room/classroom blocked — uuid `target_ref` vs free-text room keys).
- **Consent enforcement flag-gated** — `operator-completion-signoff.md:71-77`.
- **`process-due` auth uncertainty** — `docs/api/communications-api.md:65`: *"Auth caution: Confirm `process-due` is protected by an internal token / portal gate."*
- **Multi-recipient send unimplemented** — `familyWorkspace/THREAD_SEMANTICS.md:30,33`.
- **Legacy `CommunicationsDrawerSectionLegacy` (~1090 L) still flag-gated** — `docs/runtime/runtime-v1-purification-report.md:29-30`.

### 6.3 Doc/code contradictions

| # | Doc says | Code says |
|---|---|---|
| 1 | `communications_v2_phase_next_audit.md:15,54` — *"No `communication_templates`, `communication_snippets`, `announcements`… exist here"* | All exist. The audit is now stale and **actively misleading as a baseline**. |
| 2 | `messaging_v2_architecture.md:75-90` proposes `communication_entity_links` (many-to-many with `link_role`) | Never built. `primary_entity_*` remains the sole attachment. |
| 3 | `messaging_v2_architecture.md:67` proposes `communication_participants` | Never built. |
| 4 | `messaging_v2_architecture.md:131` — replace the opportunities-only CHECK with a generic entity registry | `20260622130000:17-19` widened it to exactly `('opportunities','announcements')` — a second literal, not a registry. |
| 5 | `…drift_audit.md:44` — no `skipped`/`provider_unavailable` state | Still true. `announcement_recipients` has `skipped` but nothing writes it. |
| 6 | `v2/conversationCore.ts:5` cites migration `20260611120000_…` | Actual file is `20260619120000_…`. |
| 7 | `20260619120000:30-37` promises *"Service wiring in PKG-10"* for SLA columns | PKG-10 landed assignment only. `sla_events` dead; SLA columns never written; `computeSlaState()` zero callers. |
| 8 | `20260619150000:181` — *"Builder + delivery land in PKG-15"* | Delivery is gated OFF in the claim RPC `20260622130000:68` ("Phase 3"). Two doc timelines for one gap. |
| 9 | `communications-platform.md:106-113` — *"no `template_id` on message row today"* | Correct — sends have no template provenance. |

---

## 7. Tests

### 7.1 Volume and style

- `web/tests/communications/`: **95 files** (82 top-level, 4 `identity/`, 9 `v2/`); `web/tests/adminV2/bos/communication/`: 3 files. Combined **98 files / 615 `it()` cases**; ~31 adjacent files elsewhere.
- `backend/tests/`: 4 files / 20 cases.
- **Zero skipped/todo tests** in the whole communications suite.

**No test in the entire communications suite touches a real database.** Zero `createClient` / `SUPABASE_SERVICE_ROLE` usage. Three modes: pure-function unit (~70 files); hand-rolled fake Supabase builders (`providerDeliveryPersistence.test.ts:4-23`); and **~23 `readFileSync`-and-regex "contract" tests that assert code *shape*, not behavior** (`commsV2AnnouncementRoutesOrgScope.test.ts:11-24`, `commsV2TemplateRoutesOrgScope.test.ts:13-26`). Nine further tests regex the migration SQL text. Note `identity/senderResolutionIntegration.test.ts:61` — "integration" in name only.

### 7.2 Well covered

`v2/templateService` (35), `templateTokens` (19), inbox services/identity/labels/drawer-target (18), `threadTopicPresentation` (17), `commandCenterViewModel` (15), `audienceSpec` (13), `announcementService` (13), `assignmentSla`, `consentGate`, `deliveryReceipts`, `smsKeywords`, `flags`, `communicationPermissions`, `composerChannels`, `providerDeliveryPersistence`, sender resolution (9 + 6-case matrix incl. cross-tenant/disabled/unverified/priority).

### 7.3 Not covered — the load-bearing gaps

**Zero test reference at all:** `communicationsEnabled.ts`, `deliveryStateAdapter.ts`, **`twilioSmsStatusWebhook.ts`**, **`twilioWebhookSignature.ts`**, `threadRelatedPersonIds.ts`, `inboxThreadPersonContext.ts`, `opportunityComposeTemplates.ts`, `identity/bosDiscoverySignals.ts`, **`identity/loadIdentityContext.ts`**, `identity/normalizeAddress.ts`, `v2/loadCommunicationPreferences.ts`, `v2/persistCommunicationPreference.ts`, `v2/familyWorkspace/loadFamilyThreadsData.ts`, `v2/familyWorkspace/normalizeRecipientContact.ts`, `bos/communication/operatorDisplayNameFromEmail.ts`.

**Source-text only (never executed):** **`v2/consentEnforcement.ts`**, **`v2/commandCenterConversationEnrichment.ts`** (the entire subject-resolution ladder), `v2/resolveAnnouncementAudience.ts`, `v2/scheduleAnnouncementSendout.ts`, `v2/runAnnouncementRecipientPreview.ts`, `v2/telemetry.ts`, `v2/familyWorkspace/useFamilyCommunicationRuntime.ts`, `communications/emailSubject.ts`, `communications/recipientKey.ts`.

**Never covered — the two most important modules in the send path:** `executeCommunicationsSend.ts` has **no dedicated test file**; `canonicalOutboundEnqueue.ts` is reached only indirectly through `identity/mirrorQueuedMessage.test.ts` (2 cases, 5 `vi.mock`s).

**API routes:** `grep -rn "from ['\"]@/app/api/admin/communications" web/tests` returns nothing. **No route handler is ever imported or invoked.** Routes with no test reference whatsoever: `conversations/[id]/triage`, `bindings/[bindingId]`, `messages/mark-read`, `person-search`, `identities`, `threads/[threadId]/messages`. URL-string mention only: `bindings`, `threads`, `unread-count`, `drawer-recipients`, `preferences`, **`send`**, `family-workspace`.

**Backend untested:** `binding_resolver.py` (the entire legacy precedence ladder), `secret_ref.py`.

**Not covered at any level:** the drain's claim/fence/CAS logic against a real DB; `communication_message_recipients` insert-absence; the `announcement_targets` schema divergence; `_find_canonical_sms_thread` G4 override.

---

## 8. Consolidated risk ledger

| # | Fact | Evidence |
|---|---|---|
| R1 | `announcement_targets` has two mutually incompatible definitions; the second is a `CREATE TABLE IF NOT EXISTS` no-op with **no repair migration**; the live API writes the second shape | `20260619150000:69-76` vs `20260622123000:50-59`; writer `announcements/[id]/targets/route.ts:78-85` |
| R2 | `communication_message_recipients` is never INSERTed by runtime | `20260619160000:45-51`; only `.update()` at `providerDeliveryPersistence.ts:120` |
| R3 | Queue B polls with **no lease** — concurrent workers double-send | `communication_message_sender.py:120-135` |
| R4 | No retry/backoff anywhere; `failed` is terminal in both queues | `20260521103000:83-117`; poller filter `:122` |
| R5 | Stale-claim release exists, is documented as uncalled, and is only exercised by tests | `communicationScheduledSendsService.ts:474-491` |
| R6 | Neither drain has a committed schedule; both depend on undocumented external cron | no `vercel.json`/GH-Actions `schedule:`/Python scheduler; `README_MESSAGES_SENDER.md:61-68` covers only Queue B |
| R7 | `process-due` cron path processes **all orgs** and skips the send-permission check | `process-due/route.ts:43-47` |
| R8 | Three send-capable routes lack `assertCommunicationsSendAllowed` | `process-due:31`, `family-note:14`, `form-deliver:33` |
| R9 | `attention_state`, `sla_state`, `status` are free text in the DB; vocabularies live only in TS | `20260619120000:33,36`; `20260430254100:60` |
| R10 | SLA subsystem entirely dead: `sla_events` unreferenced, SLA columns unwritten, `computeSlaState` uncalled | `conversationCore.ts:14`; `assignmentSla.ts:90` |
| R11 | Identity platform is read-only in practice — no API/UI writes it | `identities/route.ts` GET-only; writers = `20260715120000:259-412` |
| R12 | `resolveInboundIdentity` (TS) has zero production consumers | grep: tests only |
| R13 | Consent enforcement is behind a default-OFF flag → `enforceConsentForSend` is a no-op in prod | `v2/flags.ts:53-58`; `executeCommunicationsSend.ts:115-124` |
| R14 | Three parallel consent stores | `20260529210000`; `persons.metadata.*_opt_in`; `communication_preferences` |
| R15 | Anchor vocabulary unconstrained and inconsistently pluralized; `communications_unknown` threads undrillable and unreplyable | `20260430254100:38`; `communication_inbound.py:104,125`; `inboxEntityDrawerTarget.ts:34`; `inboxThreadIdentity.ts:118,199` |
| R16 | Two competing operator surfaces read the same threads with different models: folder inbox vs Command Center queue | `app/adminV2/messages/` vs `app/adminV2/communications/` |
| R17 | Zero DB-backed and zero route-level tests; `executeCommunicationsSend` has no test file | §7.3 |
| R18 | Legacy `public.messages`/`messages_outbox` still written and drained in the same request as the canonical queue | `messages_sender.py:78,89`; `workflowRun.ts:2028,2070`; `sms_inbound.py:94` |
| R19 | `/api/webhooks/twilio/sms-status/[binding_id]` is outside the middleware public-webhook bypass | `web/middleware.ts:41-42` |
| R20 | Inbound SMS overrides the persisted anchor via G4 recipient-key reuse | `communication_inbound.py:184-225,352-363` |
