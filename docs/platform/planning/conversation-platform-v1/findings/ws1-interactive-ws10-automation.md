# WS1 Interactive Conversations + WS10 Automation — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## WS1 — Interactive Conversations

### 1.1 "Action buttons" are operator-facing. Definitively.

The two named migrations do **not** create recipient-facing buttons. They seed rows into `public.action_definitions` — the config-driven **operator UI action registry** inside Alloy admin.

- `20260427180000_action_definitions_and_placements.sql:4-33` — `action_definitions` DDL. `action_type` CHECK is `navigate | open_drawer | update_status | update_field | start_workflow | external_link | ui_intent`. Table comment `:36-37`: *"Org-scoped or global UI action definitions; executed via admin action executor."*
- `:57-101` — `action_placements` DDL. `surface` CHECK = `record_header | record_section | queue_row | work_unit | department | workspace | right_rail`. Every one is an **Alloy admin screen**. There is no `email`, `sms`, or `external` surface.
- `20260526153000_action_buttons_phase2_message_ask_bos.sql:36-50` seeds `quick_message` and `ask_bos`, both `action_type='ui_intent'`, `entity_type='opportunity'`, org-scoped to enrollment orgs. `:7-25` normalizes the enrollment pipeline queue `row_preview.actions` to `["open"]`.
- `20260527120000_action_buttons_ask_bos_quick_message_platform.sql:10-31` adds the same two as platform-global rows.

`ui_intent` resolves client-side to "open a panel in the operator's browser": `executeAdminAction.ts:951-953`, `canonicalActionRegistry.ts:46`, `useOpportunityDrawerVmHeaderActions.ts:122`.

**Zero recipient-facing action-button capability exists under this name.** The migration filename is misleading relative to the product goal.

### 1.2 Recipient-facing token surfaces — three generations exist

| Surface | Route | Token storage | Binds to |
|---|---|---|---|
| **Action links** (legacy, cleaning vertical) | `web/app/a/[token]/page.tsx`, `web/app/action/[token]/page.tsx` | **plaintext** `action_links.token` + 8-char `short_code`, `20260329165048_remote_schema.sql:947-959`, 2h default expiry, single-use | `entity_type`/`entity_id` |
| **Public form / packet links** | `web/app/forms/embed/[token]/page.tsx` | **SHA-256 hashed**, `form_public_links.token_hash`, `20260506100000_forms_engine_v1_foundation.sql:186-202`; 256-bit mint `web/lib/admin/forms/formPublicLinkToken.ts:5` | soft `metadata.source_entity_type/id` |
| **Public tour booking links** | `web/app/tour-booking/[token]/page.tsx` | hashed, reuses `hashFormLinkToken`; `20260512140000_tour_public_booking_links.sql:4-21` | `opportunity_id` + `location_id` |

Auth model: `web/middleware.ts:118-127` → `web/lib/admin/operatorSessionGate.ts:16-22` → `web/lib/admin/canonicalAdminRoutes.ts:243-263`. The gate is an **inverted allowlist** — only `/workspace`, `/admin`, `/organization`, `/settings`, `/legacy-admin`, `/adminV2` require an operator session. Everything else, **including the entire `/api/*` tree**, is unauthenticated at the edge; admin API routes self-gate in-handler.

Minting is operator-only: `forms/[formId]/public-links/route.ts:285-295`, `tours/public-booking-links/route.ts:45-58`.

**No JWT/HMAC/signed-token infrastructure.** `jose`, `jsonwebtoken`, `nanoid` absent from `web/package.json`. Tokens are raw random bytes. The only HMAC uses are `platform/commands/runtime/destructive/destructivePreviewToken.ts:72` (internal operator confirm) and the Twilio signature check.

**No token resolves to a person.** No recipient identity token, no `unsubscribe_token`, `reply_token`, or `thread_token` anywhere. Possession of a URL is full authority; `recipient_person_id` in link metadata is an operator assertion, not proof.

**No family/parent portal.** Every `portal` hit in the repo is React `createPortal`. No non-operator authenticated user type exists.

### 1.3 The key precedent — an external recipient already executes a real operational command

`web/app/api/public/tour-booking/[token]/book/route.ts:3` imports `createTourBooking` from `web/lib/tours/bookings/tourBookingService.ts` and calls it at `:90` with the same `CreateTourBookingInput` the operator route uses. **There is no shadow path.** The external booking runs the identical Platform Transaction: `insert_booking` (persist) → `opportunity_integration` (business_process) → `lifecycle_event` (activity) → `confirmation_comms` (relationships, `boundary:"outside"`).

Envelope differences only:

- `source: "public_link"`, `requestedByUserId: null` `:81-82` — actor is null
- Identity read from the bound opportunity, never from the external actor `:83-84`
- `approvalRequired` from the availability rule `:85` — the sole operator-gating lever
- Guards: rate limit `:24-27`, link active/expiry `:30-34`, opportunity+location match `:51-72`
- `TourBookingTransactionError.changed`/`integrityBreach` is **discarded** and flattened to a generic message `:106`

**This is the architectural seed for interactive conversations: the pattern already works end-to-end for exactly one action.**

### 1.4 External form completion — real; external document upload — does not exist

**Form fill (works):** page `web/app/forms/embed/[token]/page.tsx` → `FormEmbedClient.tsx` → `ParentIntakeShell.tsx`; `GET /api/public/forms/[token]/resolve`; `POST /api/public/forms/[token]/submissions` (draft; packet-step idempotency `:143-166`, server prefill `:175-215`, insert `status:"draft"` `:275-291`); `PATCH .../submissions/[submissionId]`; `POST .../submit` (read-only baseline re-applied `:184` so the client can't overwrite prefill, IP hash `:186-190`, CAS-guarded update `:341-358` with `submitted_by_user_id: null`).

**Packets:** `form_packet_definitions`/`_sessions`/`_session_items`; a packet link is a `form_public_links` row with `metadata.form_context_mode === "packet"` (`resolvePublicFormEmbedContext.ts:19-23`). Step advance `formPacketService.ts:393-466`. Delivery: `POST /api/admin/opportunities/[id]/enrollment-packet-launch` (mint + `enqueueCanonicalOutboundMessage`) and `POST .../form-deliver`.

**Document upload by an external party: NO.** `file_ref` exists in the schema (`web/lib/forms/schema.ts:144,225`) but `FormEngineRenderer.tsx:317-326` renders a placeholder reading *"File upload ships with documents integration"* and asks the user to paste a document UUID. Same for drawn signatures `:455-465`. Validation only accepts an existing UUID (`validateSubmission.ts:389-393`). There is no `/api/public/**/upload` route and no signed-URL mint for external parties. The only real upload is operator-only `documents/upload/route.ts`. One bespoke exception: `web/app/api/vendor-application/route.ts:59-60` accepts multipart with a hardcoded `ALLOY_PUBLIC_ORG_ID`, no token, not reachable from any page.

**Identity on submit** — three regimes (`submit/route.ts:210-217`): *explicit* (link-bound, FKs re-validated by `formLaunchFkDerivation.ts:59`), *processing_authoritative* (anonymous lead-capture → `openProcessingCaseFromSource`, `pos/processingIdentity/sources/formIntakeAdapter.ts:37-48`, `intake_needs_review: true`), or *skipped_intake_disabled*.

### 1.5 The Operational Command Runtime — the contract

Three layers, not one registry. Docs conflate them; code does not.

**(a) Capability Registry** — `web/lib/platform/commands/capabilityRegistry.ts`. Type `PlatformCapabilityDefinition` at `capabilityTypes.ts:88-108`: `{capabilityKey, canonicalCommandKey, family, maturity, executionOwner, supportedSubjects, supportsPreview, confirmationPolicy, destructiveKind, registeredActionKey, compatibilityAliases, implementationStatus}`. ~50 capabilities incl. `create_lead:47`, `confirm_tour:76`, the six tour transitions `schedule_tour:436` … `reopen_tour:515`, `send_message:635`, `send_form:649`, `send_enrollment_packet:662`.

**(b) Command Runtime Facade** — `runtime/executeCommandInvocation.ts:156`. Order: mint invocationId + single-use delegation guard `:160-161` → **server-authoritative actor overwrite** `:163-170` (client actor discarded) → mode validation `:172-188` → destructive commit allowlist `:190-226` → owner/key execution gate `:228-249` → `prepareCommandInvocation` → snapshot invariants `:264` → maturity gate `:266-298` → **authorization-claim invariant** `:300-313` (preparation may never claim authorization) → confirmation policy `:317-350` → single adapter dispatch `:366+`.

**(c) Platform Transaction Contract** — `web/lib/platform/transaction/platformTransaction.ts`. Canonical stages `:37-54`: `validate → persist → business_process → activity → relationships → cache_invalidation → recomposition`. `assertCanonicalStageOrder` `:205-224` **throws** on out-of-order declaration. Forward pass `:342-426` pushes compensators onto an undo stack; `compensate()` `:453-497` unwinds in reverse. Boundary `inside` (abort) vs `outside` (degrade) `:68,360-373`. Outcomes `:116-124`: `committed | committed_degraded | aborted | partially_committed`. `changed:false` only claimed when rollback is proven.

**Validation:** no zod in the command path. Hand-rolled at four levels — route shape check (`actions/execute/route.ts:125-136`), `prepareCommandInvocation` blockers `:327-344`, handler-owned `RegisteredAction.validatePayload` (`adminV2/actions/actionTypes.ts:181`), transaction `validate` precondition (`platformTransaction.ts:180`).

**Authorization:** `requireAdminOrOps()` (`web/lib/adminAuth.ts:113`, roles `["admin","ops"]` `:19`) → `getAdminContextCached` for authoritative orgId/userId → scope dimensions → data-scope gate (`executeAdminAction.ts:371-376`) → **fail-closed runtime gate** `runtime/commandRuntimeExecutionGate.ts:20-32` (only `registered_action: true`; every other owner requires an exact-key allowlist).

**Activity emission:** there is **no `activity` table**. `emitEvent()` (`web/lib/emitEvent.ts:23-45`) inserts into **`workflow_events`**.

**HTTP entry point:** `POST /api/admin/actions/execute` (`actions/execute/route.ts:109`). Body `{action_key, entity_type, entity_id, context{surface,department_id,work_unit_id,process_key,origin}, payload, mode:"preview"|"execute", confirmation, preview_token}` `:59-82`. Falls back to legacy `executeAdminAction` when the facade doesn't support the key `:142-149`. Second entry: `POST /api/admin/lifecycle-builder/complete-stage-work` (record_outcome).

**Only 2 of ~50 capabilities actually run on the transaction contract:** `record_outcome` (`lifecycle/completeStageWorkWithOutcome.ts:112`) and the six tour transitions (`tours/bookings/tourBookingService.ts:153`). Everything else runs through `executeAdminAction.ts` (~1200 lines, no saga, no compensation).

### 1.6 Email vs SMS — no channel-aware rendering on the live path

**Send path:** `POST /api/admin/communications/send` `:122` → `executeCommunicationsSend.ts` → `canonicalOutboundEnqueue.ts:136-283` (insert `communication_messages` `status:"queued"`) → Python worker `communication_message_sender.py:110` polls and dispatches to `twilio_client.py:25` or `resend_client.py:18`.

`executeCommunicationsSend` takes a **single pre-rendered `textRaw: string`** `:56` and passes it through as `bodyRaw` `:298`. The only channel branch is subject `:299`. **Zero interpolation happens at send time.**

**Four separate `{{token}}` engines exist:** canonical `lib/workflowTemplate.ts:19-27`; comms-V2 wrapper `v2/templateTokens.ts:290-295` (+ 24-path catalog `:75-122`, `segmentCommunicationTemplate:231-283`); a **duplicate** engine `v2/templateRender.ts:8-58`; and tours `tours/comms/tourCommsTemplates.ts:171-177`.

**Channel-specific rendering of one logical message exists only as dead code:** `v2/composerModel.ts:87-98` (`body = draft.channel === "sms" ? smsBodyStripHtml(draft.body) : draft.body`) — its own header `:5-7` says it is not wired to send. In production, email and SMS copy is **authored separately per channel** (tours `tourCommsTemplates.ts:257-282`), or the **identical string** is sent to both (announcements `scheduleAnnouncementSendout.ts:133-134`).

**No HTML email templating at all.** No MJML/react-email/handlebars anywhere. No `body_html` column — `communication_messages` has `body text` + `body_format text DEFAULT 'plain'` (`20260430254100:61-62`), and **`body_format` is never written by any code path**. The only HTML reaching Resend is a static per-binding blob `communication_message_sender.py:342` (same HTML for every message in the org, and `text_body` is dropped — `resend_client.py:38-41` sends `html` XOR `text`, no multipart/alternative). `plainTextToSimpleHtml` / `polishTourCommsEmailHtml` (`tourCommsTemplates.ts:199-230`) and the `bodyHtml` return `:273-281` are **dead** — `tourCommsOrchestrator.ts:204-206` reads only `bodyText`.

**Threading is per-channel by construction:** `communication_threads` unique key is `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` (`20260430254100:35-47`). Email and SMS with the same person are two threads.

**No structured content model.** Body is one `text` column. No blocks, no buttons, no CTA objects. `attachments?: string[]` exists on `ComposerDraft` (`composerModel.ts:16`) and is ignored. Links are interpolated as plain text (`workflowTemplate.ts:58-78` `renderActionLinkMetadata`).

**No SMS segmentation** — no GSM-7/UCS-2 detection, no 160/70 counting, no length cap. Quiet hours exist **only** for tour reminders (`tourReminderTiming.ts:64-80`), not on the general send path. STOP/START parsing exists (`v2/smsKeywords.ts:14-19`) with **zero consumers**. Consent enforcement is behind `comms_v2_compliance`, **default OFF** (`v2/flags.ts:53-69`).

---

## WS10 — Automation / Workflows

### 10.1 Two coexisting engines

**Engine A — "Stage Operating Plan v1" (current, childcare).** Rules are **JSON inside `departments.metadata`**, not a table. There is **no `business_process_rules` table** (zero hits across `*.sql`/`*.ts`).

Path: `departments.metadata → lifecycle_builder_v1 → processes[] → stages[] → stage_operating_plan_v1 → outcome_rules[] / attention_rules[]`.

- Types `web/lib/lifecycle/stageOperatingPlanV1.ts` — `StageOutcomeRuleV1:189-202`, targets `:165-181`, container `:246-259`, parser `parseStageOperatingPlanV1:575`
- Resolution `resolveEffectiveStageOperatingPlan.ts:33-75` (explicit plan wins; else `defaultEnrollmentStageOperatingPlans.ts` for `process.key === 'enrollment'`)
- Persist `persistStageOperatingPlanV1.ts:1-50`

**Engine B — legacy `workflows`/`workflow_actions`/`workflow_events`/`workflow_runs`** (`20260329165048_remote_schema.sql:3192,3104,3120,3134,3152`). Real DB-declared, `{entity_type, event_type}`-matched engine — seeded **only for the cleaning/booking/vendor vertical**.

### 10.2 Evaluation

**Engine A matchers** (`stageOperatingPlanV1.ts`): `outcomeRulesForKey:665`, `statusEntryRulesForStatusKey:681`, `domainSignalRulesForSignal:690`. Triggers are **only** `when_outcome_key`, `when_enter_status_key`, `when_domain_signal{domain,signal}`. There is **no generic `{subject_type, event_type}` matcher**.

Drivers `applyConfiguredStageAutomationRules.ts:119,168`. Entry points `emitStatusChangedEvent.ts:80-92` (status) and `emitDomainLifecycleSignalEvent.ts:29-36` (domain signals — only producer is tour bookings).

**Critical: rules do not subscribe to `workflow_events`.** No DB trigger, NOTIFY, or queue consumer on that table. Rules run **in-process, synchronously, before the event row is written** (`emitStatusChangedEvent.ts:66-92` then `emitEvent` `:98`). **Anything that inserts a `workflow_events` row without going through `emitStatusChangedEvent` triggers nothing.**

Attention rules are **read-time only** — `evaluateStageOperatingPlanAttention.ts:200` via `QueueService.ts:150`. No background evaluator.

### 10.3 Can a workflow rule send a communication? NO (in the childcare engine)

`StageOutcomeRuleTargetKind` has exactly **9** kinds (`stageOperatingPlanV1.ts:154-163`, runtime allow-list `:263-273`; anything else is dropped by `parseTarget:446`):

`update_family_case_status` · `update_child_enrollment_status` · `update_candidate_status` · `create_needs_attention` · `create_next_work` · `reopen_work` · `mark_stage_work_complete` · `move_to_stage` · `no_movement`

Handlers `stageOutcomeRuleTargetExecutor.ts:103-435` contain **zero** references to communications/messages/email/SMS.

The only comms coupling is **read-only sufficiency**: `StageWorkSufficientCommandResultV1 { capability: "communications_send", result: "sent", satisfies_outcome_key }` `:36-53` — "if an operator sent a message, count the work done." Not an automation that sends.

**Engine B does have send actions** — `create_message` (`workflowRun.ts:1706`), `send_message` `:1839`, `create_action_link` `:2395`, `instantiate_work` `:2470` — but every seeded send workflow is cleaning/booking/vendor. The two enrollment-seeded workflows are log-only stubs (`20260430217000_enrollment_schedule_tour_workflow.sql:25-58`, description literally *"log-only steps; no outbound comms"*) and one explicitly disabled (`20260620120000_disable_c4_enrollment_record_tour_outcome_workflow.sql:5-10`).

Automated childcare sending exists **only** through the hard-coded tour comms orchestrator, not through any rule.

### 10.4 Can a communication trigger a workflow? NO

- **Inbound SMS ingestion is real** — `backend/app/routes/sms_inbound.py` (`POST /sms/inbound`, `/sms/inbound/{binding_id}` `:263-270`, signature validation + `COMMUNICATIONS_SMS_INBOUND_ENABLED` kill switch). Inserts legacy `messages` + canonical `communication_messages` (`communication_inbound.py:314-355`), then calls `emit_message_lifecycle_event(event_purpose="message_received")` (`sms_inbound.py:117-124`).
- That emitter **only INSERTs a `workflow_events` row** via REST (`activity_workflow_events.py:143-213`). `executeWorkflowRun` is never called from `backend/app` (grep: zero hits). Combined with §10.2, **an inbound SMS produces one activity row and nothing else.**
- **Inbound email does not exist.** Only two webhooks: `webhooks/resend/route.ts` (Svix-verified, **delivery lifecycle only** `:44-52`) and `webhooks/twilio/sms-status/route.ts` (status only). No SendGrid/Postmark.
- Inbound normalization is **written but unwired**: `v2/inboundNormalization.ts:1-12` states plainly that the webhook route and receiving provider are deferred. `buildInboundMessageDraft:38` / `selectOutboundToMarkReplied:62` referenced only from tests.
- Engine A has **no inbound trigger vocabulary**. A `{domain:"communication", signal:"reply_received"}` rule would work mechanically — nothing emits such a signal.

### 10.5 Scheduled / delayed actions — a spine exists, rules cannot reach it

- **Table `communication_scheduled_sends`** — `20260521103000_task_assist_v1_1_foundation.sql:83-119`. `channel ('sms'|'email')`, `subject_snapshot`, `body_snapshot`, `scheduled_for`, `status ('pending'|'claimed'|'queued'|'sent'|'canceled'|'failed')`, `approved_at/by` **NOT NULL**, CHECK `scheduled_for > approved_at` `:118`. **A scheduled send is structurally impossible without a recorded human approval.** Generalized to `source ∈ {task_assist, tour_scheduling, announcement}` at `20260622130000:9-42`.
- **Claim RPC** `claim_due_communication_scheduled_sends` (`20260622130000:47-87`) — `FOR UPDATE SKIP LOCKED`; `source IN ('task_assist','tour_scheduling')`, **announcements deliberately excluded** `:70` ("Phase 3").
- **Worker** `processDueCommunicationScheduledSends` — `communicationScheduledSendsService.ts:573-640`.
- **Trigger** `POST /api/admin/communication-scheduled-sends/process-due` `:32-69`, auth via `x-cron-token` or admin session.
- **There is NO scheduler in the repo.** No `pg_cron`/`cron.schedule` in any migration, no `vercel.json` crons, no scheduled GitHub Action (`.github/workflows/` = docs-lint, operational-expectations-gates, web-typecheck). The worker must be poked externally.
- **Only producer of true delayed sends = tour reminders**, a hard-coded orchestrator: `TourReminderOffset {reminder_key, offset_minutes /* 1440 = 24h */, channels}` (`tourCommsConfig.ts:79-86`), written by `tourSchedulingScheduledSends.ts:167,313,369`, driven by `tourCommsOrchestrator.ts:518-603`. Defaults: 24h + 2h reminders, quiet hours 21:00–08:00, **`enabled: false`** (`tourCommsConfig.ts:143-168`).
- Non-comms "delay" is only a **due date** on `operational_tasks` (`due_days`, `follow_up_due_policy` — `stageOperatingPlanV1.ts:177-181`) — a deadline on human work, not deferred execution.

### 10.6 The chain: tour booked → reminder → reminder → no-show → follow-up → task → Current Work → BOS

Every mechanism exists. **The chain breaks at exactly one link — configuration, not code.**

| Link | Status | Evidence |
|---|---|---|
| tour booked | ✅ | `tourBookingService.ts:196` on the transaction contract |
| reminder @24h, @2h | ✅ built, ⚠️ `enabled:false` by default, ⚠️ **no cron to drive `process-due`** | `tourCommsConfig.ts:143-168`; `tourSchedulingScheduledSends.ts:313` |
| no-show recorded | ✅ | `markTourBookingNoShow` `tourBookingService.ts:670` → signal `no_show` `tourBookingOpportunityIntegration.ts:266` |
| **no-show → follow-up rule** | ❌ **BREAKS HERE** | `domainSignalRulesForSignal` finds **zero** matching rules → `EMPTY_RESULT`, zero writes (`applyConfiguredStageAutomationRules.ts:196-198`) |
| follow-up → task | ✅ mechanism | `create_next_work` → `stageOutcomeRuleTargetExecutor.ts:331` → `instantiateStageWorkFromTemplate.ts:44` → `operational_tasks` |
| task → Current Work | ✅ | `GET /api/admin/view-models/drawer/opportunity/[id]/stage-work` → `projectStageWorkRuntime.ts`; UI `components/workIntent/CurrentWorkRuntimeCard.tsx` |
| Current Work → BOS | ✅ | `lib/bos/bosCapabilityRegistry.ts`; Task Assist `proposal_mode:"durable"`, `requires_human_approval:true` |

**`when_domain_signal` appears in exactly two places in all shipped config:**

1. `defaultEnrollmentStageOperatingPlans.ts:681` — `{tour_booking, canceled}` → `create_needs_attention` (fallback only)
2. `20260622150000_firefly_tour_scheduled_automation_rules.sql:21` — the same rule

Zero occurrences in `data.sql`, `data_public.sql`, `prod_baseline.sql`, or any other migration.

| Signal emitted | Emitted at | Configured rule |
|---|---|---|
| `tour_booking/scheduled` | `tourBookingOpportunityIntegration.ts:240` | **none** |
| `tour_booking/completed` | `:253` | **none** |
| `tour_booking/no_show` | `:266` | **none** |
| `tour_booking/canceled` | `:216` | default plan only — and gone for Firefly (see contradiction #4) |

What a no-show does today: metadata mirror + `tour_no_show` lifecycle event + optional `tour_no_show_followup` message (`tourCommsOrchestrator.ts:585-597`, disabled by default). It creates **no** task, sets **no** attention bucket, surfaces **nothing** in Current Work.

### 10.7 BOS / Task Assist

- BOS = Business Operating System assist layer. 17 capability keys (`lib/bos/bosCapability.ts:6-22`); registry `bosCapabilityRegistry.ts`; apply gated to `validated|approved` (`bosProposalLifecycle.ts:16-22`).
- BOS **can execute commands**, via exactly 4 adapters (`commandSession/adapters/bosCommandAdapterRegistry.ts`): `create_lead`, `update_lead_status`, `add_parent_guardian`, `cancel_tour` — committed through `POST /api/admin/actions/execute`.
- **Task Assist propose never calls a model**: `ai/task-assist/propose/route.ts:20-28` is explicitly deterministic. Loop: propose(draft) → `/approve` (`taskAssistProposalPersistence.ts:131-147`) → `/apply` (`ai/task-assist/apply/route.ts:14-22`) which enqueues via the same `executeCommunicationsSend`.
- The **only live LLM path** in the repo is an OpenAI-compatible client (`lib/ai/openAiCompatibleStructuredProvider.ts:143`) hard-gated to one feature — attention-draft enrichment `:100-110`. `"anthropic"` exists only as a policy enum value (`lib/ai/aiPolicy.ts:59`).

---

## Gaps

| ID | Gap |
|---|---|
| **G1** | **Interactive actions in outbound messages: nothing exists.** No recipient-facing action-button concept. `action_definitions` is an operator UI registry (`surface` CHECK has no external value). Messages carry a single `text` body with no structured content, no CTA model, no attachments. Everything interactive must be a URL interpolated into a plain string. |
| **G2** | **No recipient identity token.** No token binds to a *person*. Possession of a URL is full authority. No `reply_token`, `unsubscribe_token`, or `thread_token`. Two incompatible token generations coexist (plaintext `action_links` vs hashed `form_public_links`), with no shared minting library. |
| **G3** | **Only one external action executes a real command.** Public tour booking proves the pattern. Nothing else. There is **no generic "execute command X as external recipient bound to token T"** surface — no public analog of `POST /api/admin/actions/execute`. |
| **G4** | **The command runtime is closed to non-operator actors.** `requireAdminOrOps()` is the floor on every command route (`adminAuth.ts:113`); `executeCommandInvocation.ts:163-170` **overwrites** the actor with the server session — there is no representation of "an external recipient did this"; `commandRuntimeExecutionGate.ts:20-32` is fail-closed with one owner enabled; and no capability declares external invocability (`PlatformCapabilityDefinition` has no `externalInvocable`/`recipientFacing` field). |
| **G5** | **External document upload does not exist.** `file_ref` and drawn signatures are placeholders asking the external user to paste a UUID (`FormEngineRenderer.tsx:317-326,455-465`). The guided-intake UI already labels a phase "Sign & upload" (`FormEmbedClient.tsx:456`) — **the UX promises a capability the renderer does not have.** No public upload route, no signed-URL mint. |
| **G6** | **No inbound conversation at all.** Inbound SMS lands as a row and dies (§10.4). Inbound email does not exist. STOP/START parsing exists with zero consumers. No reply→process advancement of any kind. |
| **G7** | **No channel-aware message model.** One body string, no renderer at send time, no `body_html`, no multipart, no segmentation, per-channel threads. "One logical message rendered per channel" exists only as dead code (`composerModel.ts:87-98`). Directly blocks "same interactive action, rendered as an email button and an SMS short link." |
| **G8** | **Rules cannot communicate, in either direction.** No comms target kind in Engine A's 9. Engine B has `send_message` but is cleaning-vertical only, with log-only/disabled enrollment seeds. And rules cannot write `communication_scheduled_sends` — so no rule can schedule a delayed message. |
| **G9** | **No scheduler.** Nothing in-repo drives `process-due` or the Python message queue. All scheduled sends depend on an unspecified external caller. **Even the tour reminder chain will not fire without one.** |
| **G10** | **Configuration is empty where it matters.** 3 of 4 emitted tour signals match zero rules. `create_next_work` from a domain signal is never configured anywhere in shipped config. The chain is built and unwired. |
| **G11** | **Form submission is not on the transaction contract.** Unlike tour booking, the public form submit commits the row and *then* fires best-effort projections that only `console.error` on failure (`submit/route.ts:378,388,446,457,470,473`). Any plan to unify external actions as commands must resolve this asymmetry. |
| **G12** | **Public path discards transaction honesty.** `public/tour-booking/[token]/book/route.ts:106` flattens `TourBookingTransactionError` to a generic message, discarding `changed` and `integrityBreach`. An external user is told "try again" even when rollback is unproven — a double-booking risk. |

---

## Docs vs code contradictions

1. **`record_outcome` is not in the capability registry.** `platformTransaction.ts:169` and `docs/sprints/active/phase-5-platform-transaction-contract.md` call it "a capability key from the configured registry"; it exists only as a string constant at `lifecycle/completeStageWorkWithOutcome.ts:90`.
2. **Three of seven transaction stages are aspirational.** `relationships`, `cache_invalidation`, `recomposition` are typed with zero production steps. The Phase 5 doc is honest — its certification matrix says nothing is certified.
3. **Template channel enum disagrees with the DB.** `v2/templateSchema.ts:33,37` declares `["email","sms","in_app"]` and statuses `["draft","active","archived"]`, with a header claiming it "mirrors DB CHECK constraints." The DB (`20260619150000:6-18`) allows `('email','sms')` and the column is `approval_status ('draft','pending','approved')`.
4. **Migration `20260622205001` silently reverts `20260622150000`.** `20260622205001_firefly_granular_tour_bp_stages.sql:126` does a wholesale `jsonb_set` replacement of Firefly's `tour_scheduled` plan, dropping both rules added 55 minutes earlier. Because the plan is now *explicit*, the enrollment default never applies — **Firefly has zero `when_domain_signal` rules on any stage.** No later migration restores them.
5. **The `tour_no_show` status-entry rule is unreachable.** `20260711000100_enrollment_status_collapse_and_stage_key.sql:140-146` deletes `tour_no_show` from `status_definitions` (statuses collapse to `{open, closed}`), but the rule keyed on `when_enter_status_key:'tour_no_show'` survives in `defaultEnrollmentStageOperatingPlans.ts:676-679`. `web/scripts/validateFireflyBpWorkLiveQa.ts:290` still asserts the old value and is stale.
6. **Migration filenames mislead.** `*_action_buttons_*` seeds operator UI intents, not buttons in messages.
7. **Two registries share key names.** `create_lead` exists in both `capabilityRegistry.ts:47` and `pos/processingIdentity/commands/commandKeys.ts:17` with different semantics (deliberate, per `qa/missions/commands-implementation-plan-*.md:499`).
8. **`requiredPermission` on processing-identity commands is declared and never enforced** in any production path — only asserted non-empty by a test (`web/tests/commands/identityCommands.test.ts:216`).
9. **`form_public_links.rate_limit_profile`** exists in DDL and is selected by `formsAdminDb.ts:497,508` but never read for enforcement.
10. **Dead tour ICS route.** `tourAddToCalendarLinks.ts:32-42` emits `/api/public/tour-booking/:token/ics` and `/api/admin/tours/bookings/:bookingId/ics`; neither directory exists. Confirmation emails carry a dead link when `ics.include_in_confirmation_email` is on.
11. **Tour public booking links have no delivery path.** `POST /api/admin/tours/public-booking-links` returns `public_path` `:76` and nothing in `web/app`, `web/lib`, or `web/components` consumes it — no send, no UI. The operator must hand-carry the URL.

---

## The one-paragraph shape of V1

The seam already exists and is proven exactly once: a hashed, expiring, operator-minted token resolves to a bound subject, and the public route calls the *same* service function as the operator route, running the *same* Platform Transaction. What V1 needs is to **(a)** generalize that from `createTourBooking` to a token-scoped command allowlist — a public analog of `/api/admin/actions/execute` with an `externalInvocable` flag on `PlatformCapabilityDefinition` and a real external-actor representation instead of `actorUserId: null`; **(b)** give `communication_messages` structured content so a rendered action becomes a first-class object rather than a URL glued into a string, with per-channel rendering (the dead `composerModel.buildSendPayloads` is the right shape); and **(c)** add exactly one target kind to `StageOutcomeRuleTargetKind` — `send_communication` — plus a cron to drive `process-due`, at which point the tour→reminder→no-show→task→Current Work chain closes with configuration rather than code.
