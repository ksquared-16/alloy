# WS7 Internal Conversations + WS9 AI Conversation Assistant — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## WS7 — Internal Conversations

### 7.1 Is there an internal/staff-visibility concept on comms threads?

**No visibility flag exists. What exists instead is an `in_app` *channel*.**

- `20260430254100_communications_v1_foundation.sql:35-81` — `communication_threads` (`channel IN ('sms','email','in_app')`) and `communication_messages` (`direction text NOT NULL CHECK (direction IN ('inbound','outbound'))` `:59`).
- **There is no `is_internal`, `visibility`, `staff_only`, `audience`, or `note_type` column on any comms table.** The only `internal` hits in comms migrations are the channel enum at `20260715120000:56,110` (`channel IN ('sms','email','voice','internal')` on `communication_identities` / `..._location_bindings`).
- `in_app` is the de-facto internal lane: `composerChannels.ts:44-48` — *"in_app always available (internal queue / no provider)"*; `inboxThreadIdentity.ts:96` labels channel `in_app` as **"Internal"**; `v2/announcementFanout.ts:10,82` — *"In-App is operator-side only (no parent-facing delivery) → always skipped/`in_app_operator_only`"*.
- **But `in_app` is unusable as a conversation today:** `inboxThreadIdentity.ts:142-152` returns `canReply: false, disabledReason: "Internal messages reply in record drawers (coming soon)."` And `v2/workspaceModeAvailability.ts:41-43`: `note` mode reason = *"Notes appear in the timeline. Composing new internal notes from this workspace is not yet available."*
- **Critical structural mismatch:** `direction` is DB-constrained to `inbound|outbound` (no migration ever widened it). A staff-to-staff message has no valid direction. `direction: "internal"` exists **only in view models**, never persisted — `v2/recordTabModel.ts:13,46`; `v2/familyWorkspace/types.ts:93`; `v2/familyWorkspace/timelinePresentation.ts:15`. And every thread is anchored to a *family* record via `primary_entity_type/primary_entity_id` — there is no staff-subject thread shape.

### 7.2 Every existing note/comment mechanism (candidate duplicates)

There are **no `*_notes` or `*_comments` tables anywhere** (`grep -ohE "public\.[a-z_]*notes?[a-z_]*" supabase/migrations/` returns nothing; full inventory = 115 tables, none note/comment). Notes are all degenerate text blobs:

| # | Mechanism | Storage | Citation |
|---|---|---|---|
| 1 | `add_note` / `append_note` action on opportunities | Appends `[ISO] text` line into **`opportunities.metadata.notes` string** — no id, no author, no thread | `lib/admin/actions/executeAdminAction.ts:629-676` (`:660` `nextMd.notes = prev ? prev+"\n"+line : line`) |
| 2 | `update_status_add_note` (legacy combined) | Same blob | `actionDefinitionRegistry.ts:142`; `platform/commands/runtime/executeAdminActionFallbackLedger.ts:68,73` |
| 3 | Seeded `add_note` action definition | `action_definitions` | `20260602180000_phase1b_qualification_status_and_universal_actions.sql:260,267,344` |
| 4 | `internal_note` on enrollment packet launch | `metadata.internal_operator_note` | `opportunities/[id]/enrollment-packet-launch/route.ts:96,172` |
| 5 | `internal_notes` on jobs | `jobs.metadata.internal_notes` | `jobs/[id]/route.ts:42,393-396`; `entityPresentation.ts:706` |
| 6 | Record-tab "note" timeline kind | **View-model only** — `notes` is an *input parameter with no supplier* | `v2/recordTabModel.ts:30-49`; caller `RecordCommunicationsTab.tsx:53-57` passes `props.notes ?? []` |
| 7 | Composer `note` channel | `buildSendPayloads` maps recipients to `["__internal__"]` | `v2/composerModel.ts:86-89` |
| 8 | BOS draft `unmappedText` / `intake_notes` | sessionStorage draft + opportunity payload | `lib/bos/commandSession/types.ts:70-76` |

**None of these is a conversation.** No author attribution, no reply, no per-note row. #6/#7 are declared surfaces with no backing implementation.

### 7.3 Tasks

**Tasks exist — narrowly.** `public.operational_tasks` — `20260521103000_task_assist_v1_1_foundation.sql:165-194`. `entity_type` **CHECK-constrained to `'opportunities'` only** `:168-169`; `entity_id` FK → opportunities; `assigned_to_user_id`; `created_by`; `title`; `description`; `due_at NOT NULL`; `status IN (open|completed|canceled)`; `source` **CHECK-constrained to `'task_assist'`** `:178-179`; `proposal_id` → `task_assist_proposals`. API `web/app/api/admin/operational-tasks/route.ts`, `.../[id]/route.ts`.

**"Current Work"** is a separate, much larger runtime — `web/lib/adminV2/runtime/focusPanel/currentWork/` (31 modules: `projectCurrentWork.ts`, `buildCurrentWorkSurfaceVM.ts`, `executeCurrentWorkAction.ts`, `classifyCurrentWorkActions.ts`, `inferWorkItemOwner.ts`). It is stage/command-driven, **not** `operational_tasks`-driven.

**Message ↔ task linkage: YES — the most important finding in this workstream.**

- `web/lib/workItems/mapCommunicationThreadToWorkItemRow.ts:57-95` — **a `communication_thread` is projected directly into a work-item row.** ID scheme `communications:<threadId>` `:17-27`; title `Reply: <family>`; `source: "communications"`; carries `assigned_to_user_id` from `conversation.assigned_user_id`; `is_communications_projection: true`.
- Predicate `:39-46`: thread needs reply iff `attention_state ∈ {needs_response, awaiting_parent_reply}` and not resolved.
- `lib/agent/taskAssist/myTasksTaskTypes.ts:37` — `communication_thread_id` on the task row type.
- `lib/workItems/workItemQueueScope.ts:209`; `app/adminV2/components/MyTasksPanel.tsx:425,485,501`; `CommandCenterShell.tsx:166`.
- `v2/workspaceModeAvailability.ts:6` — workspace modes are `"email" | "sms" | "note" | "tasks"`; tasks are already a first-class mode of the communication workspace.

**A thread is already a task in this codebase.** "Convert message → task" is largely already built as a read-only projection.

### 7.4 @mentions — ABSENT

Grepped `mention|@mention|mentions|parseMention|notifyMention` across `web/lib`, `web/app`, `web/components`, `supabase/migrations`. Three hits, all English prose in unrelated comments (`jobOverviewPlannerTypes.ts:61`, `taskAssistCommandIntent.ts:122`, `sectionDisposition.ts:82`). No parser, no storage, no notification.

### 7.5 Read status / unread — EXISTS and is live

- `public.communication_message_reads (org_id, message_id, user_id, read_at)` — `20260430254100:83-88`, RLS `:140-141`. **Per-user, per-message** — already the right grain for multi-participant staff threads.
- Live routes: `messages/mark-read/route.ts:59`, `unread-count/route.ts:32`, `conversations/route.ts:64`, `threads/[threadId]/messages/route.ts:56`.
- Computation `inboxThreadsService.ts:175-214` — **unread is computed over `direction = 'inbound'` only** `:183`. An internal staff message would be invisible to unread counts under the current query.
- `communication_threads.last_read_at` was added (`20260619120000:16,37`) but is **dead** — only reference is a constant listing at `v2/conversationCore.ts:38`.
- `InboxFolder` includes `"unread"` — `inboxThreadTypes.ts:2`.

### 7.6 Notifications — ABSENT for staff

No `notifications` / `alerts` / `push_subscriptions` table exists (115-table inventory checked). No in-app notification center, no web push, no email digest. The only "notify" machinery is **outbound to families/tour hosts**: `tourCommsConfig.ts:44,91-94,161` (`notify_rule_host`), `tourCommsOrchestrator.ts:76`. Everything else matching `notify` is React state plumbing (`oipWorkspaceWarmCache.ts:30`, `workspaceModalCoordinator.ts:13`).

Nearest adjacent primitive is **announcements** (`20260622123000:19-47`, `channels <@ ARRAY['email','sms','in_app']`) — one-way broadcast, plus `announcement_targets` / `_recipients` / `_deliveries`.

### 7.7 Presence — ABSENT

No Supabase Realtime, no `postgres_changes`, no `.channel()` subscription, no WebSocket, no SSE anywhere in `web/`. The only cross-client mechanism is **`BroadcastChannel`** — same-browser, cross-tab only: `queueRowSurfaceService.ts:67-71`, `useQueueRowBuilder.ts:106`. (Domain code using "presence" is child *attendance*: `web/lib/childcareOperational/attendance/*`.) **Nothing in Alloy is real-time today.**

### 7.8 What BOS is, and whether a conversation can live in it

**Architecture** (`web/lib/bos/**`, `web/lib/adminV2/bos/**`):

- BOS = **Business Orchestration System**, an assistive command placement over the existing Command Runtime. Doctrine `docs/platform/modules/ai-platform.md` — *"BOS is a **placement**, not a separate command system"*; *"Propose → human approve → apply — no autonomous side effects"*; presentation states `closed | floating | pinned` with *"One BOS runtime/conversation across states."*
- **Command session** — `lib/bos/commandSession/types.ts:156-176` (`BosCommandSession`: `sessionId`, `invocation`, `mode: "conversation"|"form"`, 10-phase `phase`, `draft`, `messages[]`, `resolution`, `preview`, `confirmation`, `execution`, `recovery`, `requestSeq`, `expiresAt`). Phases `:8-19`: `acknowledged → gathering → resolving → preview → confirming → executing → processing_review → completed|failed|discarded`.
- **Adapters** — `lib/bos/commandSession/adapters/`: `createLeadAdapter.ts`, `updateLeadStatusAdapter.ts`, `addParentGuardianAdapter.ts`, `cancelTourBosAdapter.ts`, `bosCommandAdapterRegistry.ts`.
- **PERSISTENCE IS `sessionStorage` ONLY** — `commandSessionPersistence.ts:4` (`BOS_COMMAND_SESSION_STORAGE_KEY = "alloy-bos-command-session-v1"`), tab-scoped, cleared on terminal phase `:12-15`, 512 KB cap `:10`. **BOS persists nothing to the database.** There is no BOS session/message/turn table.
- Execution always exits BOS: `executePlatformCommandViaActionsApi` → `POST /api/admin/actions/execute` → `executeCommandInvocation`.

**`lib/bos/commandSession/conversationIntake/**` (422 lines, 5 files):**

- `types.ts:1-9` — *"BOS Command Session hosts this adapter. Create Lead ships a bounded implementation; **Processing Conversation Runtime may later replace it without rewriting the session shell**."*
- Interpretation-only `:69-72`: *"Execution stays on BosCommandAdapter / executeCreateLeadCommand."* Interface = `loadEffectiveSpec / parseOperatorTurn / buildUnderstandingSummary / nextClarification / syncDraftResolution / buildReview`.
- Bounded parse coverage `:22-28`: only `text | email | phone | date | select`. `conversationParseCoverage.ts:28-35` returns honest guidance: *"conversation will not invent values for unsupported types."*
- `createLeadConversationIntakeAdapter.ts:109-112` — clarification is string interpolation: `` `I still need: ${clusterLabels.join(", ")}.` ``.
- **"Conversation" here means one operator filling one form by typing prose.** Single-participant, single-command, ephemeral, terminates on `create_lead` execution. **Not a multi-party message log.**

**Could an internal conversation live in BOS?** The primitives are wrong: no durable store, no participants, no multi-actor turns, no addressing, tab-scoped lifetime, and a session defined to terminate on command execution. `docs/sprints/active/bos-actionable-interface/round-5/README.md:9,79` explicitly fences this: *"No Conversation Runtime. No LLM upgrades."* / out of scope: *"Universal conversational engine / Processing Conversation Runtime."*

---

## WS9 — AI Conversation Assistant

### 9.1 Complete AI/LLM inventory

**Exactly one live LLM call path exists in the entire repository.**

| Provider | Where | Status |
|---|---|---|
| **OpenAI-compatible Chat Completions** | `web/lib/ai/openAiCompatibleStructuredProvider.ts:143` → `${base}/v1/chat/completions` | The **only** outbound LLM HTTP call in the repo |
| Anthropic | `web/lib/ai/aiPolicy.ts:59` — `"anthropic"` accepted as a policy string | **No adapter exists.** `resolveStructuredAiProvider.ts:33-51` handles only `openai` and `stub`; anything else → `createDisabledAiProvider()` |
| Any other (bedrock/vertex/gemini/cohere/mistral/langchain) | — | **ABSENT.** No SDK in any `package.json`, no code references |

`web/lib/ai/` (24 files, 2,315 lines):

- `openAiCompatibleStructuredProvider.ts:25-38` — the **only system prompt in the repo**. Forces `response_format: {type:"json_object"}` `:47`, single feature allow-list `needs_attention_draft_enrichment` `:15,98-110`, schema-validated response `:235`, 20s default / 30s max timeout (`aiEnrichmentEnv.ts:41-58`). Prompt `:37`: *"overlays are suggestions only — never instructions to send autonomously."*
- `resolveStructuredAiProvider.ts:23-52` — three-way resolver: disabled / stub / live.
- `stubProvider.ts`, `disabledProvider.ts`, `disabledStructuredProvider.ts`, `liveProviderAdapterPlaceholder.ts` (`LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED`).
- `buildOperationalSummary.ts` — `buildOperationalSummaryDeterministic` + optional stub overlay.

**Env vars:** `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_REQUEST_TIMEOUT_MS`, `AI_ENRICHMENT_STUB_ENABLED`, `AI_ENRICHMENT_TELEMETRY_ENABLED`, `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` — `aiEnrichmentEnv.ts:6-58`, `aiEnrichmentPermissions.ts:25`. Server-only. Local harness `web/scripts/validateOpenAiEnrichmentLocal.ts`.

**The four `/api/admin/ai/*` route families:**

| Route | LLM? | Evidence |
|---|---|---|
| `enrich-attention-suggestion/route.ts` | **YES** (gated) | Called from `OperationalAttentionEnhanceDraft.tsx:38` |
| `task-assist/{propose,apply,proposals,entity-search}` | **NO** | `propose/route.ts:24` — *"OpenAI policy branch does **not** call OpenAI here."* Engine `lib/agent/taskAssist/taskAssistDeterministicProposal.ts` (SHA-256 ids, template strings) |
| `workflow-assist/{propose,apply,explain,capabilities}` | **NO** | `propose/route.ts:31` — *"openai branch is policy-only — **no LLM**"* |
| `config-layout-assist/{propose,field-setup,capabilities}` | **NO** | `propose/route.ts:3,12` — `buildDeterministicConfigurationProposal`, *"deterministic … proposal-only, no apply"* |

`aiPolicy.ts:11-19` labels `task_assist_draft` and `workflow_assist_draft` explicitly *"(no LLM in default path)"* / *"(no LLM)"*.

### 9.2 Is BOS AI-backed or deterministic? — DETERMINISTIC

Unambiguous in the code, not an inference:

- **Conversational parsing is regex/rule-based.** `parseCreateLeadIntakeText` → `extractFactsFromText` + `mapFactsToActionIntake` (`lib/intake/adapt/parseCreateLeadIntakeText.ts:22-26`). `lib/intake/extract/extractFactsFromText.ts` is **857 lines of named regexes** — `PARENTS_MULTI_RE`, `CHILD_NAME_AGE_SPACE_RE`, `STREET_ADDRESS_RE`, `CITY_STATE_ZIP_RE`, `DOB_LABEL_RE` `:18-56`. No network call, no model. Closing comment `parseCreateLeadIntakeText.ts:43`: **"Default V1 parser — shared intake engine adapter; swap extractor for AI later."**
- **BOS message/draft generation is template composition.** `generateOperationalDraft.ts:2,45` — *"deterministic-first with optional AI hook (future) … Currently deterministic-only."* `communicationDraftSynthesis.ts:12` declares `type CommunicationDraftSynthesisMode = "deterministic" | "ai_assisted"` but `:54` hardcodes `mode: "deterministic"`. `communicationDraftChannelCompose.ts:95-256` is a hand-written per-objective copy bank.
- **BOS recommendations are a static catalog.** `lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog.ts:1-3` — *"Deterministic operational recommendation catalog"*, 8 required keys, rendered via `renderCatalogTemplate`.
- **BOS communication intelligence is arithmetic.** `v2/bosIntelligence.ts:1-8` — *"PURE, DETERMINISTIC, no I/O"*; `buildConversationSignals` `:39-60` counts inbound/outbound and divides for `responseRate`/`openRate`.
- **The only AI in BOS's orbit** is the needs-attention *overlay*, registered at `lib/bos/bosCapabilityRegistry.ts:111` (`apply_route_family: "/api/admin/ai/enrich-attention-suggestion"`), enriching an already-deterministic `AttentionSuggestionV1`.

> Note `bosIntelligence.ts:5` says the summary/draft are "LLM-authored." **That comment is inaccurate** — the module it points at is deterministic per the citations above. A stale comment that will mislead planning.

### 9.3 What is "Ask BOS"?

**A UI navigation intent. Not AI, and not an executor.**

- Seeded as an `action_definitions` row with `action_type = 'ui_intent'`, `payload_schema = '{"intent":"ask_bos"}'`: `20260526153000_action_buttons_phase2_message_ask_bos.sql:44-49` (org-scoped, orgs with an `enrollment` department, priority 80 — the same migration strips `call/email/message` from the enrollment-pipeline queue row preview `:8-26`); `20260527120000_action_buttons_ask_bos_quick_message_platform.sql:22-30` (platform-wide `org_id NULL`, priority 76, description **"Open BOS with this record context."**).
- Registry `lib/platform/commands/capabilityRegistry.ts:605-617` — `maturity: "navigation_only"`, `executionOwner: "navigation"`, `supportsPreview: false`, `confirmationPolicy: "none"`, `reason: "Opens BOS assist — not a mutation executor."` Also `executeAdminActionFallbackLedger.ts:78`.
- Runtime `applyRegistryResolvedActionClient.ts:577-592` → `launchContextualAskBos({surface, record_id, entity_type, opportunity_id, display_name, queue_preview, department_id, work_unit_id, bos_source_surface})` → `AskBosHandoffListener.tsx:17-40` → `triggerBosDrawerAssistHandoff` into `GlobalAssistantContext`.
- UI placeholder `"Ask BOS or type / for commands…"` — `aiCommandSurface/bosRail/BosRailPresentation.tsx:512`. Appears in default queue action stacks `defaultLeadLayouts.ts:322`, `defaultWaitlistLayouts.ts:107`.

**Ask BOS = "open the BOS rail, seeded with this record's context."** It answers nothing.

### 9.4 Pre-send assistance

| Capability | Status |
|---|---|
| Rewrite | **Absent as AI.** Deterministic objective→template composition only (`communicationDraftChannelCompose.ts`) |
| Tone | **Contract-only.** `tone_variant` field in the OpenAI response schema (`openAiCompatibleStructuredProvider.ts:33`, `attentionSuggestionAiEnrichmentSchema.ts`) — no tone UI, no tone request parameter |
| Channel recommendation | **Deterministic eligibility, not recommendation.** `v2/workspaceModeAvailability.ts:16-56` computes availability + reasons from provider bindings and recipient capability; `composerChannels.ts:44-65` |
| Send-time recommendation | **Absent.** Scheduled sends execute an operator-chosen time; nothing recommends one |
| Length | **Deterministic transform only.** `smsBodyStripHtml` (`v2/composerModel.ts:70-76`); `preview()` truncates at 120 chars (`recordTabModel.ts:24-28`) |

The one live pre-send AI touch: `POST /api/admin/ai/enrich-attention-suggestion` returns `suggested_draft_body_overlay` + `reasoning_summary_overlay` over a deterministic needs-attention suggestion, surfaced by `OperationalAttentionEnhanceDraft.tsx`. It **overlays**, never sends.

### 9.5 Post-receive

| Capability | Status | Citation |
|---|---|---|
| Summarize | **Deterministic** | `lib/ai/buildOperationalSummary.ts` |
| Categorize | **Deterministic, operator-driven** | `v2/conversationTriage.ts:23-36` — 3 fixed triage actions writing `attention_state` |
| Recommend | **Deterministic catalog** | `operationalRecommendationCatalog.ts`; signals from `bosIntelligence.ts` |
| Draft reply | **Deterministic templates**, optional AI overlay on the attention path only | `generateOperationalDraft.ts:45`; `enrichAttentionSuggestionStub.ts` |
| Create task | **EXISTS** — deterministic proposal → human approve → `operational_tasks` | `taskAssistDeterministicProposal.ts`; `/api/admin/ai/task-assist/proposals/[id]/approve` |
| Open Current Work | **EXISTS as a projection** | `mapCommunicationThreadToWorkItemRow.ts:57-95` |
| Escalate | **Assignment/SLA, deterministic** | `v2/assignmentSla.ts:33-55`; `conversation_assignment_events` + `sla_events` |

Auto-categorization of *inbound* content is **absent** — `attention_state` is operator-set or backend-set to `needs_response` (`conversationTriage.ts:10`).

### 9.6 Safety / permission model for AI calls

Five independent gates, all of which must pass for a live LLM call:

1. **Auth + org scope** — `getAdminContextCached` + `getAdminAccessContextCached`; `resolveAiEnrichmentPortalAccess` returns 403 `ORG_CONTEXT_MISMATCH` if `ctx.orgId !== access.orgId` (`aiEnrichmentPermissions.ts:53-60`).
2. **Permission** — strict mode requires `ai.enrichment.use` `:11,62-72`; legacy default = portal `admin` or `ops` `:74-83`. Live OpenAI is *only* reachable in strict mode: `computeOpenAiLiveInvocationPermitted` `:33-35` requires **both** strict mode **and** the grant.
3. **Org policy** — `org_settings.metadata.ai_policy` parsed by `parseAiPolicyFromMetadata` (`aiPolicy.ts:119-158`). **Default is fully off**: `{enabled:false, provider:"disabled", allowed_features:[], pii_mode:"strict", logging_mode:"minimal", retention_mode:"none"}` `:42-50`. Unknown provider strings collapse to `"disabled"` `:62`.
4. **Env credentials** — `hasOpenAiStructuredCredentials()` requires both `OPENAI_API_KEY` and `OPENAI_MODEL` (`aiEnrichmentEnv.ts:22-26`).
5. **Feature allow-list** — provider rejects any feature but `needs_attention_draft_enrichment` with `FEATURE_NOT_ALLOWED`, and rejects if `draft_enrichment` not in `allowed_features` with `POLICY_DENIED` (`openAiCompatibleStructuredProvider.ts:98-124`).

**Is tenant data sent to a provider?** Yes, but redacted first, and only under all five gates. `web/lib/ai/redaction.ts:1-190` — `redactObjectForAi` runs **before** the provider (`enrichAttentionSuggestionStub.ts:5`). Key-pattern redaction for `email|phone|address|dob|financial|freeform_note|person_name|child_name` `:8-40`; emails become `ke…@k….redacted` `:49-57`, phones `***-***-1234` `:59-70`. **Redaction is keyed on column-name regex — path-based, so an unrecognized key name leaks.** The provider contract says *"Caller must supply **redacted** `request.payload` only"* `:71-72`. Only `correlation_id`, `request_id`, `org_id`, `feature`, and `redacted_context` cross the wire `:52-60`. Header `Authorization: Bearer ${apiKey}` — *"Never logs API keys. No persistence."* `:4`.

**Audit trail: weak and off by default.** `web/lib/ai/enrichmentTelemetry.ts:17-19` — emits one `workflow_events` row of type `ai_enrichment_usage_v1` **only when** `AI_ENRICHMENT_TELEMETRY_ENABLED` **and** org `logging_mode === "verbose"`. Default `logging_mode` is `"minimal"` → **no audit row at all**. Payload deliberately excludes prompt text, draft bodies, and redacted payloads `:22-23` — counts, latency, ids only. `retention_mode` default `"none"`; AI output is never persisted. Durable proposal tables exist only for the *deterministic* capabilities: `task_assist_proposals`, `config_layout_assist_proposals`.

**Governing rule** — `docs/platform/modules/ai-platform.md`: *"BOS is **not** a parallel platform"*; *"**Propose → human approve → apply** — no autonomous side effects"*; *"Autonomous agents — **Future — explicitly paused**."*

---

## Gaps

### Absent (searched, confirmed nothing exists)

1. @mention parsing, storage, or notification — anywhere.
2. Staff notification subsystem — no table, no in-app center, no push, no email digest.
3. Presence / real-time — no Supabase Realtime, no WebSocket, no SSE. `BroadcastChannel` is same-browser only.
4. A durable BOS conversation store — BOS sessions live in `sessionStorage` and are cleared on completion.
5. Any note/comment **table**. All notes are strings inside `metadata` JSON.
6. `direction = 'internal'` as a persistable value — DB CHECK allows only `inbound|outbound`.
7. A thread subject that is not a family/record — `primary_entity_type/primary_entity_id` is NOT NULL.
8. Thread participants — no `thread_participants` table; a thread has one assignee, not members.
9. Anthropic (or any non-OpenAI) provider adapter — the policy string is accepted, the adapter does not exist.
10. AI for: tone, rewrite, send-time, channel recommendation, inbound categorization, inbound summarization.
11. `communication_thread_id` on `operational_tasks` — the linkage is a **read-only projection**, not a stored FK; a real task cannot be attached to a thread.

### Declared but unimplemented (will read as "exists" if not checked)

12. `note` composer mode — `workspaceModeAvailability.ts:41-43` says composing notes is "not yet available."
13. `in_app` reply — `inboxThreadIdentity.ts:150` "coming soon."
14. `recordTabModel` `notes[]` — an input parameter with **no supplier** anywhere.
15. `communication_threads.last_read_at` — column added, never read or written.
16. `CommunicationDraftSynthesisMode = "ai_assisted"` — type only; `mode` hardcoded `"deterministic"`.
17. Comms V2 **PKG-10 / PKG-11 are unshipped**. `20260619120000:1-5` — *"No UI, no provider, no send behavior. Service wiring lands in PKG-10."* `attention_state` and `sla_state` explicitly *"free text until PKG-10/PKG-11 finalizes vocabulary"* `:33,:36`.

### Risks / inconsistencies

18. `bosIntelligence.ts:5` claims the BOS summary/draft are "LLM-authored." **They are not.** A stale comment that will mislead planning.
19. Unread is computed over `direction='inbound'` only (`inboxThreadsService.ts:183`). Internal staff messages would never produce an unread count without changing this query.
20. Redaction is **key-name-pattern based** (`redaction.ts:28-40`). Free-text staff bodies match `NOTE_KEY = /(note|notes|body|message|comment|transcript)$/i` and are handled — but any differently-named free-text field bypasses redaction. Routing internal staff chat through the AI path would materially widen PII exposure.
21. `operational_tasks` is doubly CHECK-locked to `entity_type='opportunities'` and `source='task_assist'`. **"Convert message → task" cannot use this table without a migration.**
22. Audit of AI calls is off by default (`logging_mode: "minimal"`) — today a live enrichment call leaves **no trace**.

---

## Recommendation: where internal conversations belong

**(c) — another presentation of the same Conversation Runtime, realized as an extension of Communications' thread substrate. Not (a) as a channel, and definitively not (b).**

### Why not (b) BOS

BOS is architecturally disqualified by its own persistence model, not by preference. `commandSessionPersistence.ts:4` stores the entire session in `sessionStorage`, tab-scoped, cleared at terminal phase. A BOS session is **single-operator, single-command, and defined to end on execution** (`types.ts:8-19`). It has no participants, no addressing, no durable turn log. Its own charter forbids this expansion (`round-5/README.md:9,79`). And the doctrine is explicit that BOS must never become a second platform — *"BOS is a placement, not a separate command system."* Putting staff conversations in BOS would create exactly the parallel platform the doctrine forbids, on ephemeral storage.

**BOS is the right *entry point* and the wrong *home*.** `conversationIntake/types.ts:1-9` already anticipates this: *"BOS Command Session **hosts** this adapter … Processing Conversation Runtime may later **replace** it without rewriting the session shell."*

### Why not (a) plain Communications

Communications' substrate is family-addressed by construction. Every thread carries a non-null `primary_entity_type/primary_entity_id` and a `recipient_key`; `direction` is CHECK-constrained to `inbound|outbound`. There is no valid `direction` for staff↔staff and no participant table. Adding an `is_internal` boolean to `communication_messages` would produce the classic failure: an internal note that is structurally a message *to a parent* with a lie flag on it. The `in_app` channel already demonstrates this half-state — persistable and labeled "Internal" (`inboxThreadIdentity.ts:96`) but not repliable `:150` and invisible to unread counts (`inboxThreadsService.ts:183`).

### Why (c), and what the evidence says the shape should be

The decisive finding is `mapCommunicationThreadToWorkItemRow.ts:57-95`: **Alloy already treats a conversation as a unit of work.** A thread projects into the work-item list with an assignee, a due time, a family label, and a topic. `workspaceModeAvailability.ts:6` already models `email | sms | note | tasks` as **four modes of one workspace**. The platform's own conclusion is that channel is a presentation of a conversation, and a conversation is a presentation of work.

Three substrates are already built and correct for multi-party staff threading, and none needs replacing:

1. **Per-user read state at message grain** — `communication_message_reads(org_id, message_id, user_id, read_at)` is *already* the many-users-per-message shape internal threads require. It is the single hardest thing to retrofit, and it exists (`20260430254100:83-88`).
2. **Assignment + audit + SLA** — `assigned_user_id`, `assigned_team_id`, `assignment_state`, `attention_state`, plus append-only `conversation_assignment_events` and `sla_events` (`20260619120000:8-70`; logic `assignmentSla.ts:33-55`). This is precisely "assignments" and "operational handoffs" from the target capability list — already built, waiting on PKG-10 wiring.
3. **Inbox/triage/work projection** — folders, `last_message_at` with an insert trigger, archived state, unread folder, triage actions, thread→work-item projection.

**Concretely:** introduce a Conversation Runtime that owns *thread + turn + participant + read-state*, with `communication_threads` as its first backing table extended by (i) a **participant table** — the genuinely missing primitive — and (ii) a subject that may be a record **or** a work item **or** nothing, rather than a mandatory family. Channels (`sms`/`email`) become one *presentation*; the internal staff thread becomes a second; BOS remains a third — an entry point that opens a conversation with context pre-resolved, exactly as `Ask BOS` does today and exactly as `conversationIntake/types.ts:5-6` predicts.

**Sequencing implied by the gaps.** Two prerequisites are load-bearing and currently absent, and neither is conversation-specific:

- **Notifications** (gap 2) — @mentions, assignments, and handoffs are all inert without a staff notification substrate. This must be built **before** internal conversations, not alongside them.
- **Real-time** (gap 3) — presence and live typing require Supabase Realtime, used nowhere in the app today. This is a platform-wide first and should be scoped as such or explicitly deferred out of V1. Read status and unread counts do **not** need it and can ship first.

Finally, **the eight note mechanisms in §7.2 must be collapsed into the runtime, not left beside it.** They are the concrete "second messaging platform" risk named in the brief: `opportunities.metadata.notes` is an unattributed append-only string that already competes with any real conversation. Item 1 (`executeAdminAction.ts:629-676`) is the one with production data behind it and needs a migration path; items 6 and 7 are unimplemented shells that should be deleted rather than migrated.
