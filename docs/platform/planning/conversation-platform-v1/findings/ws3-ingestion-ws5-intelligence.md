# WS3 Inbox Ingestion + WS5 Communication Intelligence — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2)
Base: `origin/staging @ 3fc2e0f4e`
Stage: discovery — read-only. No production code changed.

---

## Headline correction to the mission premise

The brief states "Current platform sends communications. Design how Alloy becomes capable of receiving them."

**This is not accurate.** Inbound **SMS** is implemented end-to-end today — signature-verified webhook, org routing, identity resolution, thread reuse, reply-stamping, attention-state transition, activity event. It lives in the **Python FastAPI backend** (`backend/`), not in `web/`, which is why a Next.js-first search makes it look absent.

What is genuinely absent: **inbound email** (definitively), and **delivery-event → timeline / Current Work propagation**.

---

## WS3 — Inbox Ingestion

### 3.1 The "inbox foundation" migration is not inbound ingestion

`supabase/migrations/20260604100000_inbox_foundation_thread_columns.sql` is a sort/archive optimization on `communication_threads`:

- `:4-6` adds `archived_at timestamptz`, `last_message_at timestamptz`
- `:14-22` backfills `last_message_at` from `MAX(communication_messages.created_at)`
- `:24-30` two partial indexes for active/archived inbox sort
- `:32-52` trigger `trg_comm_messages_bump_thread_last_message`

`last_message_at` **is used**: `web/lib/communications/inboxThreadsService.ts:185`, `web/app/api/admin/communications/conversations/route.ts:39,42`, `web/lib/communications/v2/commandCenterConversationEnrichment.ts:27,383,423`, `web/lib/workItems/mapCommunicationThreadToWorkItemRow.ts:51`, `backend/app/services/communication_inbound.py:206,228-249`.

`archived_at` on threads is **schema-only** — no code sets or filters it. Every `archived_at` hit in `web/` is on a different table (`contacts`, `jobs`, `persons`, `announcements`, `processing_cases`, form definitions).

### 3.2 Inbound handling

#### Inbound SMS — real, complete, Python-only

| Layer | Location |
|---|---|
| Routes | `backend/app/routes/sms_inbound.py:263-266` `POST /sms/inbound/{binding_id}`; `:269-272` legacy `POST /sms/inbound` |
| Mount | `backend/app/server.py:35` (prefix `/sms`) |
| Kill switch | `backend/app/settings.py:209-211` `COMMUNICATIONS_SMS_INBOUND_ENABLED` |
| Signature verification | `backend/app/services/twilio_inbound_signature.py:57-71` (Twilio `RequestValidator`); guard `sms_inbound.py:205-250`, 403 on failure |
| Canonical persist | `backend/app/services/communication_inbound.py:314-450` |
| Legacy dual-write | `sms_inbound.py:76-125` → `public.messages`, `external_id = MessageSid` |

#### Inbound email — does not exist

Definitive, not "not found":

- No route. `web/middleware.ts:41-42` exposes exactly two public paths, both **outbound** webhooks.
- `docs/platform/modules/communications-identity-platform.md:71` — "Inbound email: **not implemented**"; `:93` lists it under **Deferred**.
- `web/lib/communications/v2/inboundNormalization.ts:8-11` self-documents: the webhook route and persistence are deferred, and no receiving provider has been chosen.
- No receiving provider dependency exists. Absent packages: `sendgrid`, `postmark`, `mailgun`, `nodemailer`, `mailparser`, `imapflow`, `googleapis`, `@microsoft/microsoft-graph-client`. Present: `svix` (web), `twilio` (backend) only.
- Zero repo-wide hits for `inboundEmail`, `msgraph`, `graph.microsoft`, `pubsub`, `inReplyTo`, `x-mailer`, `external_message_id`, `thread_key`. `imap` matches only inside "minimap"; `smtp` only a test mock and commented-out Supabase config.

#### Dead pre-wired TypeScript inbound layer

Pure functions with **zero production callers** (tests only):

- `web/lib/communications/v2/inboundNormalization.ts:39-51` `buildInboundMessageDraft`, `:64-68` `selectOutboundToMarkReplied`
- `web/lib/communications/v2/providers/twilioSmsAdapter.ts:21-30` `normalizeInbound` — duplicates the live Python logic
- `web/lib/communications/v2/providers/resendEmailAdapter.ts:20-34` `normalizeInbound` — speculative; Resend does not offer inbound receiving
- `web/lib/communications/v2/providers/deferredAdapters.ts:9-24` — Google/Microsoft adapters that throw
- `web/lib/communications/v2/providers/registry.ts:15-28` `resolveProviderAdapter` — test-only caller

### 3.3 Threading

Threading is **`recipient_key`-based, not message-id-based**.

- Thread identity: `UNIQUE (org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` — `supabase/migrations/20260430254100_communications_v1_foundation.sql:46`
- Inbound match: `backend/app/services/communication_inbound.py:184-225` `_find_canonical_sms_thread()` — looks up `(org_id, channel='sms', recipient_key)` **regardless of anchor**, preferring `persons`/`customers`-anchored threads, else most recent; creates a thread only when none exists (`:352-363`). In-code rationale: "the conversation is the relationship, not the originating business object."

`provider_message_id` exists (`communication_messages`, `20260430254100:66`) and is populated on inbound with the Twilio `MessageSid` (`communication_inbound.py:396`).

**No email-threading header storage at all** — no `in_reply_to`, `references`, or `message_id` column on any table. Prior intent recorded but unbuilt: `docs/sprints/archive/06_2026/messaging_v2_architecture.md:185`.

**No unique constraint on `provider_message_id`** — a Twilio retry can double-insert an inbound message.

### 3.4 Identity resolution — two disconnected engines

#### Engine A — what inbound actually uses (crude, Python, phone-only)

`backend/app/services/communication_inbound.py:81-125` `resolve_inbound_sms_anchor_with_metadata()`:

- Normalizes phone (`:46-48`), single exact-equality query on `persons.phone` capped at 22 rows (`:51-70`)
- 1 match → `("persons", person_id)`, `inbound_resolution: "single_person_match"` (`:106-110`)
- 0 matches → `("communications_unknown", uuid5(ns, org|phone))`, `"unknown_sender"` (`:97-104`)
- \>1 match → `("communications_unknown", uuid5(ns, org|phone|sorted_ids))`, `"ambiguous_sender"` + `candidate_person_ids` (capped 20), plus `resolution_truncated` at the 22 cap (`:112-125`)

Ambiguity handling is honest — it never guesses — but the resulting thread anchors to a synthetic `communications_unknown` entity that maps to **no drawer target** (`web/lib/communications/inboxEntityDrawerTarget.ts:5-10,32` supports only `opportunities|persons|jobs|customers`), and **there is no operator surface to resolve it**.

Matches on `persons.phone` with `eq.` only — no format variants — while the TS side has `phoneLookupVariants()`.

#### Engine B — the mature engine, not used by communications

`web/lib/intake/resolve/` + `web/lib/identity/` — confidence-tiered household/person resolution built for forms intake:

- `web/lib/intake/resolve/queryMatches.ts:14-26` `listPersonsByEmail` (`ilike`), `:28-41` `listPersonsByPhone` (via `phoneLookupVariants`), `:43-60` `listPersonsByExactName`
- `web/lib/intake/resolve/matchIdentity.ts:78` `evaluateParentPersonMatch`, `:186` `evaluateChildPersonMatch` — tiers `exact_match | probable_match | possible_match | conflict | no_match`, with explicit `ambiguous_email` (`:96-102`) and `ambiguous_phone` (`:104-110`)
- `web/lib/identity/householdGraph.ts:23` `generateHouseholdGraphCandidates` — household/guardian graph, versioned (`IDENTITY_RESOLVER_VERSION`), confidence-banded
- `web/lib/persons/findOrCreatePersonInOrg.ts:37,80`; `web/lib/forms/intake/intakeIdentityLookups.ts:17`

**Zero imports of `intake/resolve` from anywhere under `web/lib/communications` or `web/app/api/admin/communications`.** Single biggest reuse opportunity in the sprint.

Operator-facing lookup that does exist: `web/app/api/admin/communications/person-search/route.ts` — org-scoped `persons` search for the compose picker.

### 3.5 Record association

Attachment is **via the thread, not the message**. `communication_messages` has no `subject_type`/`subject_id`/`record_id`/`process_instance_id`/`business_process_id`. The only linkage is `communication_threads.primary_entity_type` + `primary_entity_id` (`20260430254100:38-39`), projected by `web/lib/communications/inboxEntityDrawerTarget.ts:18-34`.

Current Work attachment exists **outbound only**: `web/lib/lifecycle/associateOutboundCommunicationToContactAttempt.ts`, with documented precedence (`:1-14`) — explicit work-item `sufficient_command_results` → platform default for canonical templates (`contact_family`) → no inference. Called from `web/app/api/admin/communications/send/route.ts:11`.

**No inbound equivalent.** An inbound message creates/reuses a thread, sets `attention_state = "needs_response"` (`communication_inbound.py:228-249`), stamps the prior outbound's `replied_at` (`:252-311`), emits `message_received`. It does not touch Current Work, and `message_received` is referenced in **zero** migrations or rule configs — the same shape as the known "tour advancement is unconfigured" defect.

### 3.6 Operator reply surfaces

| Surface | Path |
|---|---|
| Inbox thread reply | `web/components/adminV2/messaging/InboxThreadReplyBox.tsx:89` → `POST /api/admin/communications/send` |
| Command Center | `web/app/adminV2/communications/CommandCenterShell.tsx` |
| Record drawer composer | `web/components/adminV2/messaging/DrawerMessagingComposer.tsx` (+ `MessagingComposerFrame`, `ComposerReplyActionCluster`, `ComposerScheduleSendModal`) |
| Family workspace | `web/app/adminV2/communications/FamilyCommunicationWorkspace.tsx` |
| Canonical send API | `web/app/api/admin/communications/send/route.ts:39` — `requireAdminOrOps` + `COMMUNICATIONS_SEND_PERMISSION_KEY`; enqueues + emits `message_queued` |

Legacy surfaces reveal prior intent: `web/app/legacy-admin/messages-outbox/page.tsx:9-13` and `web/app/legacy-admin/messaging/page.tsx:9-13` both read the same dead `messages_outbox` table (last 50 rows, read-only). `MessagingClient.tsx:51` renders the "Messages" tab as `<ComingSoon />` — an inbox was intended beside the outbox and never built. Neither surface has retry/resend.

---

## WS5 — Communication Intelligence

### 5.1 Status columns — exact values

`communication_messages.status` has **no enum type and no CHECK constraint** — `20260430254100:60` `status text NOT NULL DEFAULT 'queued'`. The only DB-level pin is the partial index predicate `:79-80`. Six values are written by four runtimes:

| Value | Writer |
|---|---|
| `queued` | `web/lib/communications/canonicalOutboundEnqueue.ts:99` + DB default |
| `sent` | `backend/app/services/communication_message_sender.py:287,353,388` |
| `delivered` | `web/lib/communications/twilioSmsStatusWebhook.ts:187`; `web/app/api/webhooks/resend/route.ts:115`; **inbound rows also inserted as `delivered`** — `communication_inbound.py:391` |
| `failed` | `communication_message_sender.py:173,208,414`; `twilioSmsStatusWebhook.ts:196`; `webhooks/resend/route.ts:155` |
| `bounced` | `webhooks/resend/route.ts:141-145` — collapses **both** `email.bounced` and `email.complained` |
| `replied` | `communication_inbound.py:307` |

Receipt timestamps (`20260619130000_comms_v2_delivery_events_receipts.sql:8-11`): `opened_at`, `clicked_at`, `replied_at`; plus baseline `sent_at`, `delivered_at` (`20260430254100:72-73`). **No `bounced_at` on `communication_messages`.**

`communication_delivery_events.event_type` is free text by design (`20260619130000:24`). Canonical vocabulary `web/lib/communications/v2/deliveryEvents.ts:14-25`: `queued, sent, delivered, opened, clicked, replied, bounced, failed, complaint, inbound`.

`communication_message_recipients` (`20260619140000:8-22`, extended `20260619160000:27-37`): nullable `status` (no CHECK) plus `queued_at, sent_at, delivered_at, opened_at, clicked_at, replied_at, bounced_at, complained_at, failed_at, last_event_at`. App vocabulary `web/lib/communications/v2/deliveryReceiptMapping.ts:56-78`.

Thread states: `assignment_state` CHECK `('unassigned','assigned')` (`20260619120000:11,26`). `attention_state` and `sla_state` are **unconstrained free text** — migration comments `:33,:36` defer the vocabulary to "PKG-10/PKG-11", which never landed. Only `"needs_response"` is written today (`communication_inbound.py:238`).

#### Target-state coverage

| Target | Status |
|---|---|
| sent | Present |
| delivered | Present |
| opened | Column + event present; populated **only** by Resend webhook |
| clicked | Same as opened |
| replied | Present; genuinely wired for SMS (`communication_inbound.py:252-311`) |
| completed-action | **Absent** |
| ignored | **Absent** — no derivation, column, or threshold |
| bounced | Present, conflated with complaint in `messages.status` |
| spam-complaint | Event + `complained_at` exist; `messages.status` cannot distinguish |
| unsubscribed | **No column** — modeled separately as `communication_preferences.state` (`20260619140000:36`), `communication_preference_events` (`:48-60`), `person_communication_opt_out` (`20260529210000`) |
| failed | Present |

### 5.2 Provider webhook ingestion — exists (strongest existing asset)

**Resend (email):** `web/app/api/webhooks/resend/route.ts` — Svix-verified (`:69-73`, `RESEND_WEBHOOK_SECRET`; 503 if unset, 400 on bad signature). Handles `email.sent/delivered/opened/clicked/bounced/complained/failed/delivery_delayed` (`:111-179`).

**Twilio (SMS status):** `web/app/api/webhooks/twilio/sms-status/route.ts` and `.../[binding_id]/route.ts` → `web/lib/communications/twilioSmsStatusWebhook.ts`. Callback URL built by `backend/app/services/communications/status_callback.py:16`.

**Shared persistence:** `web/lib/communications/providerDeliveryPersistence.ts:135` `applyOutboundProviderDeliveryPatch()` — locates the outbound row by `provider_message_id` (`:151-155`), merges metadata (last 30 events, `:9-18`), first-touch-only receipt stamping (`:186-196`), then `persistReceipt()` (`:54-128`): idempotent insert into `communication_delivery_events` keyed `(provider, provider_event_id)` (`:70-106`, unique index `20260619160000:19-21`) plus per-recipient state update (`:109-125`). Provider→canonical mapping is pure and isolated: `web/lib/communications/v2/deliveryReceiptMapping.ts:9-49`.

### 5.3 Open/click tracking — none in this repo

Definitive. Zero repo-wide hits for `tracking pixel`, `open track`, `click track`, `rewriteLink`, `track_opens`, `trackOpens`, `trackClicks`, `1x1`, `beacon.gif`. No pixel endpoint, no link rewriting.

`opened_at`/`clicked_at` are populated **exclusively** by Resend's own tracking arriving as webhooks. Consequences: Alloy owns no tracking data; it is Resend-only (no SMS/in-app); and it silently depends on open/click tracking being enabled in the Resend dashboard — a setting with no representation in the codebase.

### 5.4 Message events → activity timeline

The activity timeline **is `public.workflow_events`** (`20260329165048_remote_schema.sql:3134`). No `activities`/`activity_events`/`activity_log` write path exists.

Emitters: `web/lib/emitEvent.ts:22` (TS), `backend/app/services/communication_workflow_events.py:33,68` (Python canonical), `backend/app/services/activity_workflow_events.py:180` (legacy).

Exactly five communication event types are emitted:

| `event_type` | Emitted at |
|---|---|
| `message_queued` | `web/lib/communications/canonicalOutboundEnqueue.ts:233` (also dispatches matching workflows at `:258`) |
| `message_sent` | `communication_message_sender.py:303` (SMS), `:375` (email), `:396` (in_app); legacy `message_sender.py:107` |
| `message_delivered` | `communication_message_sender.py:315` — **SMS only and optimistic**: `extra={"note": "optimistic-after-send"}`, fired the instant Twilio accepts. Not a delivery receipt. |
| `message_failed` | `communication_message_sender.py:182,217,423` |
| `message_received` | `communication_inbound.py:422`; legacy `sms_inbound.py:118` |

No `communication_sent`, `email_sent`, `sms_sent`, `thread_*`, or `conversation_*` type exists.

**Three defects:**

1. **Delivery webhooks emit nothing to the timeline.** Neither Resend nor Twilio webhook handlers nor `providerDeliveryPersistence.ts` insert into `workflow_events`. Real delivery, opens, clicks, bounces and complaints update columns and `communication_delivery_events` and **never reach the activity timeline**. The only `message_delivered` the timeline sees is the optimistic fake.
2. **Category miscoding.** `web/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline.ts:66-67` maps only `message_received` and `message_sent` to the `"communications"` category; `message_queued`, `message_delivered`, `message_failed` fall through to generic `"activity"` at `:103`.
3. **A whole telemetry catalog is dead.** `web/lib/communications/v2/telemetry.ts:14-23` declares `COMMS_V2_EVENTS` (`comm_health_computed`, `delivery_event_recorded`, `message_receipt_updated`, `consent_changed`, `conversation_assigned`, `sla_state_changed`, `template_rendered`, `announcement_sent`). `emitCommsV2Event` has **zero call sites**.

### 5.5 Operational Intelligence — registration contract (feeds WS13)

Two parallel registries exist — documented convergence debt.

#### A. Operational Intelligence Platform (OIP) metric registry — where comms metrics belong

Doc: `docs/platform/modules/operational-intelligence-platform.md` (V1 **FROZEN**). Layers: Events → Metrics → KPIs → Snapshots → Insights → Dashboards → Reports.

Contract — `web/lib/metrics/types.ts:54-66`:

```ts
export type MetricDefinition = {
    key: OipMetricKey; label: string; description: string;
    pack: MetricPackKey;                     // enrollment | communications | forms | operational_health | capacity
    computationKind: MetricComputationKind;  // event_window | entity_snapshot | evaluator_snapshot
    format: MetricFormat;                    // count | percent | duration | currency | rate
    defaultWindow: MetricTimeWindowKey;      // rolling_24h | rolling_7d | rolling_30d
    sources: readonly string[];
    snapshotSemantics?: boolean;
    supportsDimensions?: readonly MetricDimensionKey[];
};
```

Registering a metric is **5 coordinated edits** (the key union is closed and hand-maintained):

1. add key to `OipMetricKey` — `web/lib/metrics/types.ts:5`
2. add entry to `DEFINITIONS` — `web/lib/metrics/registry.ts:3`
3. write resolver under `web/lib/metrics/resolvers/`
4. add `case` to the switch — `web/lib/metrics/metricEngine.ts:43`
5. add to pack — `web/lib/metrics/packs.ts:15`

(optionally governance via `defineCalculation(key, governance)` — `web/lib/analytics/calculations/registry.ts:24`, types `web/lib/analytics/calculations/types.ts:56-89`.)

**A communications pack already exists** — `web/lib/metrics/registry.ts:102-134`, resolvers `web/lib/metrics/resolvers/commsMetrics.ts`:

- `comms.delivery_rate` — delivered/sent (`:25,66`)
- `comms.reply_rate` — outbound with `replied_at` / outbound sent (`:36,103`)
- `comms.failed_delivery_count` — events where `event_type ∈ (failed, bounced)` (`:48,125`)

#### B. Operational Calculations registry — the newer governed one

Root `web/lib/operationalCalculations/`. Freeze: Definition → Handler → Runtime → Result. Registry `registry.ts:32` (duplicate key throws at module load `:44`; resolution fails closed `:63-69`). Interface `definition.ts:143-179`; pure handler contract `:113-119`; authoring validator `defineOperationalCalculation()` `:196`. Rule shapes are a closed set (`:48-61`). `"communications"` is already a legal consumer (`:73`). Registration is 3 steps.

**For WS13 the OIP registry is the right seam** — the pack exists and reads the delivery-event substrate already.

### 5.6 Retry / failure handling — no retry exists

The queue is a **polling SELECT, not a job queue**: `backend/app/services/communication_message_sender.py:120-126` selects `direction=outbound AND status=queued`, ordered `created_at.asc`, limit ≤50, backed by `idx_comm_msgs_queue` (`20260430254100:79-80`).

On failure (`:414-433`, plus pre-flight `:167-183`, `:200-222`): truncate error to 500 chars → log warning → `status='failed'` + `error` → emit `message_failed` → `continue`.

Definitively absent:

- **No `attempts`, `retry_count`, `max_attempts`, `next_attempt_at`, `locked_at`, or `dead_letter` column** on `communication_messages` (full DDL `20260430254100:54-74` + four additive migrations; 26 columns, none retry-related).
- **`status='failed'` is terminal and unrecoverable** — the worker only queries `status=eq.queued`.
- **No backoff, jitter, DLQ, or poison-message handling** anywhere in `backend/app/services/`.
- **No worker daemon.** The worker runs only when something POSTs `/messages/process` (`backend/app/routes/messages_sender.py:36`). The wake call is fire-and-forget: `web/lib/communications/executeCommunicationsSend.ts:318` `void triggerBackendMessagesQueue(...).catch(() => {})`, self-documenting its failure mode at `:322-324` — if `INTERNAL_MESSAGES_PROCESS_URL`/`INTERNAL_CRON_TOKEN` are unset the row stays queued until cron runs. **There is no `vercel.json` cron config and no `web/app/api/cron` directory in this repo.**
- **No operator remediation.** No UI lists failed messages; no endpoint re-sends one. The `error` column is written and never read back into any operator surface.

The one manual retry is on a different table — `communication_scheduled_sends`: PATCHing a `failed` row flips it to `pending` and stamps `rescheduled_from_failed_at` (`web/lib/communications/communicationScheduledSendsService.ts:423-428`).

Operator-visible failure today: a `message_failed` timeline entry labelled "SMS failed"/"Email failed" (`web/lib/admin/activityMessageEventLabels.ts:46`) landing in the wrong timeline category, and a red "Failed" bubble (`web/lib/communications/v2/familyWorkspace/timelinePresentation.ts:40`). That is all.

### 5.7 Feature-flag state

`web/lib/communications/v2/flags.ts:53-58` — default **ON**: `comms_v2_command_center`, `comms_v2_record_tab`, `comms_v2_composer`, `comms_v2_live_workspace`. Default **OFF**: `comms_v2_deliverability`, `comms_v2_assignment`, `comms_v2_sla`, `comms_v2_compliance`, `comms_v2_preferences`, `comms_v2_bos`, `comms_v2_announcements`, `comms_v2_templates`.

The deliverability dashboard (`web/app/api/admin/communications/deliverability/route.ts:12-14`, aggregation `web/lib/communications/v2/deliverability.ts:17`) returns **404** unless `NEXT_PUBLIC_COMMS_V2_DELIVERABILITY` is set — dark today.

---

## Gaps

### Absent (verified non-existent)

| ID | Gap |
|---|---|
| G1 | **Inbound email — nothing.** No route, no receiving provider chosen, no parser, no MIME handling. Confirmed by `communications-identity-platform.md:71,93` and by the absence of every candidate package. |
| G2 | **Email threading headers — no storage.** No `message_id`/`in_reply_to`/`references` column anywhere. `recipient_key` threading cannot thread an email reply chain. Intent recorded at `messaging_v2_architecture.md:185`. |
| G3 | **No retry, no dead-letter, no send-failure remediation.** Combined with the absent cron, a queued message can sit forever with no alarm. |
| G4 | **No open/click tracking owned by Alloy.** Entirely dependent on Resend dashboard configuration with no repo representation. |
| G5 | **Delivery telemetry never reaches the timeline.** The only `message_delivered` event is a fabricated optimistic one. |
| G6 | **`completed-action`, `ignored`, `unsubscribed` have no representation** in the message/delivery model. `unsubscribed` lives in a parallel preferences model not joined to delivery telemetry. |
| G7 | **No `provider_message_id` uniqueness** → inbound webhook retries can double-insert. |
| G8 | **No inbound → Current Work / business-process association.** `message_received` matches zero configured rules. Same shape as the known "tour advancement is unconfigured" defect. |
| G9 | **Thread archiving is schema-only.** `communication_threads.archived_at` never written or filtered. |
| G10 | **No `updated_at` on `communication_messages`** while threads have one — receipt patches leave no update timestamp. |

### Present but wrong / duplicated

| ID | Gap |
|---|---|
| G11 | **Two identity-resolution engines that do not know about each other.** Inbound uses a 30-line Python phone-equality lookup while a versioned, confidence-tiered, household-aware TypeScript engine sits unused one directory over. Highest-leverage convergence in the sprint. |
| G12 | **Unresolved senders are a dead end.** `communications_unknown` threads resolve to no drawer target and there is no operator surface to assign one. |
| G13 | **A whole dead TypeScript inbound layer** duplicating live Python logic — decide to promote or delete before building on it. |
| G14 | **`status` is unconstrained free text** written by four runtimes; `bounced` conflates bounce and spam-complaint; inbound rows inserted as `delivered` require a display special-case (`deliveryStateAdapter.ts:55-57`). Status is not orthogonal to direction. |
| G15 | **`attention_state` / `sla_state` vocabularies were deferred to PKG-10/PKG-11 and never landed.** Only `needs_response` is written today. |
| G16 | **STOP/START/HELP compliance is not wired.** `web/lib/communications/v2/smsKeywords.ts` + `preferenceMutations.ts` are consumed only by tests; the live Python inbound path does no keyword parsing. Inbound "STOP" is stored as an ordinary message and changes no preference. **Carrier-compliance exposure, not just a gap.** |
| G17 | **`emitCommsV2Event` telemetry catalog is entirely dead** (zero call sites). |
| G18 | **Two Twilio ingestion surfaces in two runtimes** (Next status-callback vs Python inbound) need reconciliation. |
| G19 | **Three overlapping delivery-state vocabularies** — `DELIVERY_EVENT_TYPES` (10), `RECEIPT_STATES` (8), `DeliveryState` (7) — plus recipient `status` strings. None authoritative in the DB. |
