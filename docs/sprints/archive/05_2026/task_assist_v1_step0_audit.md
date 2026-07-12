# Task Assist V1 (Agent #2) — Step 0 Audit

**Status:** Audit only — no implementation, no migrations, no UI changes.  
**Step 1 design:** `docs/sprints/archive/05_2026/task_assist_v1.md`  
**Sprint alignment:** `docs/sprints/archive/05_2026/ai_agents_v1.md` (Agent #2 = Task Assist V1, separate from Agent #3 Workflow Assist).  
**Doctrine:** Human approval before send/schedule/create; no autonomous sends; no direct DB writes from model output; existing APIs, permissions, org scoping, and audit paths remain authoritative.

---

## Files inspected (representative)

- `docs/sprints/archive/05_2026/ai_agents_v1.md` (§6.1 per-agent ownership, §8 Task Assist template sketch)
- `docs/sprints/archive/05_2026/ai_agents_v1_step1_design.md` (Agent 2 section)
- `docs/product/bos-foundation.md` (enrichment, permissions, DEFINER RPC patterns)
- `docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md` (proposal/apply posture)
- `supabase/migrations/20260430254100_communications_v1_foundation.sql`
- `supabase/migrations/20260329165048_remote_schema.sql` (excerpts: `messages`, `messages_outbox`, `activity_log`, `opportunities`)
- `web/app/api/admin/communications/send/route.ts`
- `web/app/api/admin/communications/threads/route.ts`
- `web/app/api/admin/communications/threads/[threadId]/messages/route.ts`
- `web/app/api/admin/communications/drawer-recipients/route.ts`
- `web/app/api/admin/communications/bindings/route.ts`
- `web/app/api/admin/activity/route.ts`
- `web/lib/communications/canonicalOutboundEnqueue.ts`
- `web/lib/communications/communicationPermissions.ts`
- `web/lib/communications/triggerBackendMessagesQueue.ts`
- `web/lib/communications/drawerEmailRecipients.ts`
- `web/lib/communications/mirrorQueuedMessage.ts` (referenced from workflow path)
- `web/lib/admin/communications/communicationsDrawerPrefetch.ts`
- `web/components/admin/communications/CommunicationsDrawerSection.tsx` (path only; not deep UI audit)
- `web/lib/workflowRun.ts` (`create_message` / `send_message` → `public.messages`, outbox)
- `web/lib/admin/opportunityEntityRecord.ts` (entity GET contract / surfaces)
- `web/lib/admin/accessScope.ts` (`assertEntityDrawerRecordReadable`)
- `web/lib/opportunities/opportunityAttentionResolver.ts` (metadata `next_follow_up_at`, commitments)
- `web/lib/agent/needsAttentionSuggestion/types.ts`
- `web/lib/ai/enrichAttentionSuggestionRouteValidation.ts`, `web/lib/ai/enrichmentContracts.ts` (pattern reference)
- `web/app/api/admin/ai/enrich-attention-suggestion/route.ts` (gates summary)
- `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` (path — apply pattern reference)

---

## 1. Current capabilities

### 1.1 Communication system

**Canonical “Communications V1” tables** (migration `20260430254100_communications_v1_foundation.sql`):

| Table | Role |
|--------|------|
| `communication_provider_bindings` | Org (or location/user scoped) binding to SMS/email provider; `status`, `inbound_to_e164`, `config`, `secret_ref`. |
| `communication_threads` | Thread per `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` (+ optional `location_id`, `metadata`). |
| `communication_messages` | Inbound/outbound rows; `status` (default `queued`), `body`, `subject` implicit via channel, `to_address` / `from_address`, `provider` / `provider_message_id`, `workflow_run_id` optional FK, `communication_provider_binding_id`, `metadata` jsonb, `sent_at` / `delivered_at`. |
| `communication_message_reads` | Read receipts per `(message_id, user_id)`. |

**Legacy / parallel path — still used by workflows:**

| Table | Role |
|--------|------|
| `public.messages` | CRM-style messages: `customer_id`, `contact_id`, `opportunity_id`, `job_id`, `channel`, `direction`, `to_value`, `body`, `status` (default `queued`), `workflow_run_id`, `metadata` — see `web/lib/workflowRun.ts` `create_message`. |
| `public.messages_outbox` | Outbound queue for processor (`to_number`, `to_email`, `body`, `status`, `workflow_run_id`, `dedupe_key`, …). |

**Dual-write / mirror:** When canonical comms feature flag is on, workflow-originated messages can mirror into canonical stack (`web/lib/communications/mirrorQueuedMessage.ts` family — referenced from workflow runner). **Task Assist must not invent a third write path**; it should align with whichever path product declares canonical for human-initiated drawer sends (**today: `POST /api/admin/communications/send` → `enqueueCanonicalOutboundMessage`**).

**Outbound enqueue (canonical):** `enqueueCanonicalOutboundMessage` in `web/lib/communications/canonicalOutboundEnqueue.ts` — upserts thread, inserts `communication_messages` with `status: "queued"`, optional `emitEvent` for `message_queued` (see function docs in file).

**Send API:** `POST /api/admin/communications/send` (`web/app/api/admin/communications/send/route.ts`):

- Auth: `requireAdminOrOps`, `getAdminContextCached`, org-scoped row checks.
- Permission: `assertCommunicationsSendAllowed` → `communications.send` or legacy `ops.messaging.write`, or admin/ops role bypass (`web/lib/communications/communicationPermissions.ts`).
- Recipient guards: `assertRecipientPersonEligibleForDrawerSms` / `assertRecipientPersonEligibleForDrawerEmail`, person phone/email helpers from `drawerEmailRecipients.ts`.
- Channel normalization: sms | email | in_app.
- Post-enqueue: `triggerBackendMessagesQueue` (best-effort).

**Threads / history read:** `GET` admin communications threads + thread messages routes under `web/app/api/admin/communications/`.

**Drawer recipients:** `GET /api/admin/communications/drawer-recipients` — opportunity/job person union rules documented in route (person-centric; not contact-as-anchor for recipients).

**Provider path:** Bindings APIs under `web/app/api/admin/communications/bindings/**`; worker/cron triggers via `INTERNAL_MESSAGES_PROCESS_URL` / `INTERNAL_CRON_TOKEN` (noted in send route response).

**Draft / approval concepts today:**

- **No** first-class `draft_status` / `approved_by` on `communication_messages` in the audited migration — queued outbound is created at enqueue time; “draft” in product is currently **UI state + user intent**, not a separate DB lifecycle for Task Assist.
- Agent #1 **Enhance draft** is **copy-only preview** via `POST /api/admin/ai/enrich-attention-suggestion` — no persistence (`docs/product/bos-foundation.md`).

**Scheduled send:** **`communication_messages` schema (audited) has no `scheduled_at` / `send_after` column.** Scheduled outbound is **not** evidenced as a first-class canonical feature in this pass. **Needs verification:** whether workers honor `metadata` delay or a separate scheduler table exists outside inspected migrations.

### 1.2 Task / reminder / follow-up system

**No dedicated `tasks` / `reminders` table** found in the migration grep slice used for this audit.

**Opportunity metadata–driven “follow-up” and commitments:**

- Resolver uses `metadata.next_follow_up_at`, tour fields, `commitment_due_at`, enrollment wait metadata, etc. (`web/lib/opportunities/opportunityAttentionResolver.ts`, `opportunityAttentionConfig.ts`).
- Queue ordering / filters reference `next_follow_up_at` (`web/lib/queues/QueueService.ts`).

**“Activity” for humans:**

- `GET /api/admin/activity` returns `workflow_events` for `(entity_type, entity_id)` — not a free-form notes table (`web/app/api/admin/activity/route.ts`).

**`activity_log` table** exists in baseline schema (`entity_type`, `entity_id`, `action`, `actor_*`, `summary`, `diff` jsonb) — **no** `web/` API references found in a quick grep of `activity_log`; **Needs verification:** whether any route writes/reads it for CRM notes.

**Admin actions / registry:** `executeAdminAction` drives structured actions (including comms-adjacent flows); not a generic “task list” engine for Task Assist, but relevant for **approved** mutations that already exist.

### 1.3 Record context sources (safe read paths)

| Source | Access pattern |
|--------|----------------|
| **Opportunity row** | `respondOpportunityEntityGet` in `web/lib/admin/opportunityEntityRecord.ts` — authoritative GET for drawer; includes lifecycle, field defs, `_operational_attention`, `_attention_suggestion`, documents/communications **called out as lazy/other routes** in file header comments. |
| **Customer / job / schedule** | `web/app/api/admin/entity/[type]/[id]/route.ts` (entity family; not fully audited line-by-line). |
| **Scope gate** | `assertEntityDrawerRecordReadable` in `web/lib/admin/accessScope.ts` for department/site dimensions. |
| **Communications history** | Threads/messages APIs + prefetch slot `communicationsDrawerPrefetch.ts`. |
| **Activity timeline** | `workflow_events` via `/api/admin/activity`. |
| **Person recipients** | `drawer-recipients` + `drawerEmailRecipients.ts` (eligibility). |

**Documents:** Referenced as lazy-loaded from drawer in opportunity record comments — **Needs verification:** exact document list routes and payload shapes for Task Assist grounding.

### 1.4 Current AI / proposal patterns (reuse vs separate)

| Pattern | Location | Reuse for Task Assist? |
|---------|----------|-------------------------|
| **Structured suggestion DTO** | `AttentionSuggestionV1` (`web/lib/agent/needsAttentionSuggestion/types.ts`) | **Pattern only** — different `agent_key` / fields (`TaskAssistSuggestionV1` per sprint doc). |
| **Enrichment envelope / telemetry** | `web/lib/ai/enrichmentContracts.ts`, `enrichAttentionSuggestionStub.ts`, telemetry flags in `docs/product/bos-foundation.md` | **Likely reuse** for optional “polish draft” passes: org policy, `ai.enrichment.use`, redaction, correlation/request ids. |
| **Route validation split** | `parseEnrichAttentionSuggestionRequest` style (pure parse module + route) | **Reuse pattern** for Task Assist POST body validation. |
| **Config agent proposal/apply** | `agent_v1` / `agent_v2` RPC + proposal + audit tables (`docs/product/bos-foundation.md`) | **Analogous for durable Task Assist proposals later** — **do not** overload field-visibility or queue-definition proposal tables; separate namespace if proposals become rows. |
| **Human-in-the-loop UI** | `OperationalAttentionEnhanceDraft` (enhance copy only) | **UX precedent** for “preview before commit”; Task Assist apply would target **send/schedule** APIs, not layout RPCs. |

---

## 2. Code paths (exact map)

### Communications — human send (canonical)

- `web/app/api/admin/communications/send/route.ts` — POST enqueue.
- `web/lib/communications/canonicalOutboundEnqueue.ts` — thread + `communication_messages` insert + optional `message_queued` event.
- `web/lib/communications/communicationPermissions.ts` — send permission matrix.
- `web/lib/communications/triggerBackendMessagesQueue.ts` — downstream processor trigger.

### Communications — read / compose context

- `web/app/api/admin/communications/threads/route.ts`, `threads/[threadId]/messages/route.ts`
- `web/app/api/admin/communications/drawer-recipients/route.ts`
- `web/app/api/admin/communications/bindings/route.ts` (+ `[bindingId]`)

### Activity / timeline

- `web/app/api/admin/activity/route.ts` — lists `workflow_events` for entity.

### Workflow-originated messages (not Task Assist, but overlap risk)

- `web/lib/workflowRun.ts` — `create_message` → `public.messages`; `send_message` → outbox / messages paths.

### Entity / resolver context

- `web/lib/admin/opportunityEntityRecord.ts` — opportunity GET attachment surface.
- `web/lib/opportunities/opportunityAttentionResolver.ts` — follow-up / staleness signals from metadata.

### AI enrichment (pattern reference)

- `web/app/api/admin/ai/enrich-attention-suggestion/route.ts`
- `web/lib/ai/enrichAttentionSuggestionRouteValidation.ts`

---

## 3. Reusable components

- **`enqueueCanonicalOutboundMessage`** + **`POST /api/admin/communications/send`** — authoritative enqueue path for approved sends.
- **`assertCommunicationsSendAllowed`** + **`COMMUNICATIONS_SEND_PERMISSION_KEY`** — permission gate to mirror for any Task Assist “Apply send”.
- **Recipient eligibility helpers** (`drawerEmailRecipients.ts`, drawer-recipients route) — reduce wrong-channel / wrong-person sends.
- **Org + access bundle** (`getAdminContextCached`, `getAdminAccessContextCached`, `loadAdminAccessBundleCached`) — same gates as enrichment route.
- **AI policy / enrichment stack** (`parseAiPolicyFromMetadata`, telemetry, stub/OpenAI provider resolution) — for optional draft polish only.
- **Structured JSON contracts** (`version`, `agent_key`, `generated_at_iso`) — align `TaskAssistSuggestionV1` with sprint §8 sketch.
- **Entity GET + activity API** — grounding context for proposals (read-only).

---

## 4. Gaps

| Gap | Impact |
|-----|--------|
| **No canonical `scheduled_for` on `communication_messages`** (in inspected schema) | “Schedule a future message” may require new column/table/worker contract or explicit product decision to use `metadata` + worker — **high design risk**. |
| **No dedicated draft row lifecycle** for comms | Task Assist “draft” is not distinguishable in DB from queued outbound without new states or a proposal store. |
| **No first-class reminder/task entity** | “Create reminder” likely maps to **opportunity metadata** (`next_follow_up_at`, commitments) or new table — needs product choice. |
| **`activity_log` unused in grep slice** | May not be viable for notes audit; timeline is `workflow_events`-centric today. |
| **Dual paths (`messages` vs `communication_messages`)** | Task Assist must not call the wrong path; workflow actions still write legacy tables. |
| **Mass / bulk send** | Send route appears single-enqueue; **Needs verification:** rate limits, batch endpoints, marketing compliance. |
| **Separate proposal persistence** | Same gap as Agent #1 V1: no `task_assist_proposals` table; durable accept/dismiss is future Phase 3 per `ai_enrichment_and_agent_actions_v1.md`. |

---

## 5. Risks

| Risk | Notes |
|------|--------|
| **Wrong recipient** | SMS/email to incorrect person / guardian; mitigated partially by person eligibility asserts on send route — Task Assist must **reuse** or **narrow**, not skip. |
| **Compliance (TCPA, CAN-SPAM, childcare sensitivity)** | Model-generated copy could overpromise or include PII; policy + redaction + human approval required; consider quiet hours / consent flags — **Needs verification** in org settings / compliance docs. |
| **Mass messaging** | AI suggests broadcast; product must block or require elevated permission + recipient caps. |
| **Scheduled sends** | Without explicit scheduler semantics, “schedule” UI could create rows that never send or send immediately — dangerous. |
| **Hallucinated facts** | Drafts from opportunity context could invent tour times / prices — warnings + `validation_errors` + diff vs record fields needed in contract. |
| **Child/family sensitive data** | Minors in enrollment flows — redaction (`redactObjectForAi`) and strict PII mode from org policy should apply to any LLM path. |
| **Auditability** | `message_queued` / `workflow_events` spine exists for canonical enqueue; **Needs verification** that full body hashes / template keys are logged for compliance without raw PII leakage. |
| **Permission bypass** | Any new Task Assist route must call `assertCommunicationsSendAllowed` (or stricter) immediately before enqueue — not only on UI. |
| **Provider / DB mismatch** | Queued row without binding or worker env misconfiguration leaves stuck “queued” — operator confusion. |

---

## 6. Possible `TaskAssistSuggestionV1` fields (audit-only — not finalized)

Aligns with sprint sketch in `ai_agents_v1.md` §8; expanded for comms/task use cases:

| Field | Likely needed | Notes |
|-------|----------------|------|
| `version` | Yes | Contract versioning. |
| `agent_key` | Yes | e.g. `"task_assist"`. |
| `task_type` | Yes | Enum: `draft_sms`, `draft_email`, `schedule_message`, `set_follow_up`, `set_commitment`, … — **product-owned catalog**. |
| `entity_type` / `entity_id` | Yes | Anchor record (opportunity, customer, job, …). |
| `recipient_candidates` | Yes for comms | List of `{ person_id?, contact_id?, label, channel_hints }` — **candidates only** until human selects. |
| `channel` | Yes | sms \| email \| in_app. |
| `draft_subject` | For email | Nullable for SMS. |
| `draft_body` | Yes | Editable proposal text. |
| `scheduled_for` | If scheduling | **Gap:** persistence story unclear. |
| `reminder_due_at` / `follow_up_at` | If follow-up | Maps to opportunity metadata keys if no task table. |
| `assumptions` | Yes | What the model assumed from context. |
| `missing_inputs` | Yes | e.g. “missing phone”, “ambiguous recipient”. |
| `warnings` | Yes | Compliance / tone / staleness warnings. |
| `confidence` | Optional | Numeric or enum; keep consistent with org AI policy. |
| `validation_errors` | Yes | Server-side validation before any apply preview. |
| `approval_required` | Yes | Should default **true** for all mutating outcomes. |

**Keep separate from:** `WorkflowAssistSuggestionV1` (`proposed_workflow` must not appear on Task Assist contract).

---

## 7. UI attachment points (inventory only — no design)

| Surface | Path / component | Relevance |
|---------|------------------|-----------|
| **Record drawer** | `AdminEntityDrawer` family + opportunity/job sections | Already hosts **CommunicationsDrawerSection**; natural for compose / preview. |
| **Communications panel** | `web/components/admin/communications/CommunicationsDrawerSection.tsx` | Primary send UI; prefetch via `communicationsDrawerPrefetch.ts`. |
| **Operational attention header** | `OperationalAttentionHeaderStrip` + enhance draft | Pattern for **draft preview** without apply; Agent #1 territory — coordinate copy so Task Assist does not duplicate “suggestion” semantics. |
| **Command / AI shell** | `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` | Structured override + apply pattern for **config** agents — **analogy only** for “confirm then POST” UX, not for workflow config. |
| **Settings — communications** | `web/app/adminV2/settings/communications/page.tsx` | Bindings setup; not Task Assist primary surface. |
| **Opportunity/customer pages** | AdminV2 workspace routes | Entry points to open drawer with entity context. |

---

## 8. Recommended design questions (before Step 1)

1. **Canonical send path for Task Assist v1:** `communication_messages` only, or also `public.messages` for certain channels?
2. **Scheduled outbound:** new column, job table, or worker contract — which matches compliance and observability?
3. **Reminder vs follow-up:** Is “reminder” strictly `metadata.next_follow_up_at` + optional note, or a new durable `tasks` table?
4. **Draft persistence:** Ephemeral UI-only vs `task_assist_proposals` rows vs reuse Phase 3 generic proposal system?
5. **Recipient selection UX:** Single confirmed recipient vs multi-recipient email; how to represent in `TaskAssistSuggestionV1`?
6. **Permission keys:** Is `communications.send` sufficient for all Task Assist sends, or do scheduled sends need a new key?
7. **Rate limits / org caps:** Where enforced (API middleware, worker, provider)?
8. **AI scope:** Draft generation only vs also recipient extraction from NL — latter is higher risk.
9. **Telemetry:** Reuse `ai_enrichment_usage_v1` / `workflow_events` event types for Task Assist invocations?
10. **Workflow isolation:** Explicit lint/check that Task Assist routes cannot accept `workflow_id` / condition payloads.

---

## 9. Migration assessment

| Question | Answer | Why |
|----------|--------|-----|
| **Migrations required for Task Assist V1?** | **Likely NO** for a **pure proposal / UI draft** phase (read-only context + client-held draft + existing send POST on apply). | No new tables strictly required until durable proposals or scheduling SoT exist. |
| **Migrations likely later?** | **YES** if product requires **durable drafts**, **scheduled send SoT**, or **proposal/audit tables** analogous to agent v1. | Would follow `agent_v1_record_layout_*` pattern or dedicated `task_assist_*` tables + RLS. |
| **Probable scope** | **Small–medium** | Small: metadata flags / policy keys. Medium: scheduler + proposal store + worker changes. |

**Do not author migrations in Step 0.**

---

## Step 0 conclusion

The repo already supports **guarded, immediate outbound enqueue** via **Communications V1** (`POST /api/admin/communications/send` + permissions + person eligibility). **Follow-up pressure** is largely expressed through **opportunity `metadata`** and the **attention resolver**, not a standalone task engine. **Scheduled send** and **durable draft** lifecycles are the largest **gaps** for Task Assist V1 and must be resolved in Step 1 before any implementation.

Next step: **Step 1 design** — answer §8 design questions, freeze `TaskAssistSuggestionV1` fields, and define the **apply** graph (which existing API each `task_type` maps to after human approval).
