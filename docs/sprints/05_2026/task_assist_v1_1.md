# Sprint: Task Assist V1.1 — Durable proposals, scheduling, reminders

**Path:** `docs/sprints/05_2026/task_assist_v1_1.md`  
**Status:** **Shipped — Task Assist V1.1 complete** (Cards **0–7**). Schema through **`20260522140000_claim_due_communication_scheduled_sends.sql`**; **Card 6** opportunity-drawer UI; **Card 7** docs + reference parity (this file).  
**Prerequisite (shipped):** `docs/sprints/05_2026/task_assist_v1.md` (V1 — ephemeral proposal, send-now, opportunities, SMS/email, **`executeCommunicationsSend`**).  
**Non-goals:** Workflow configuration (Agent #3), bulk/mass send, autonomous agents, legacy **`public.messages`** / **`messages_outbox`**, bypassing **`enqueueCanonicalOutboundMessage`**.

**Sources of truth:** `docs/product/communications.md`, `docs/product/ai-system.md`, `docs/system/actions-and-workflows.md`, `docs/execution/operating-doctrine.md`, `web/lib/communications/executeCommunicationsSend.ts`, `web/lib/communications/canonicalOutboundEnqueue.ts`, `web/lib/communications/communicationScheduledSendsService.ts`, `docs/supabase/reference/*.csv`.

### V1.1 shipped behavior summary (operator-facing)

- **Opportunity drawer only** — **`TaskAssistV1OpportunityPanel`** (`web/components/admin/taskAssist/TaskAssistV1OpportunityPanel.tsx`), parent-gated by **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**; V1.1-only blocks also require **`isTaskAssistV1UiEnabled()`** (same public flag).
- **Send now (V1 preserved)** — operator-approved payload → **`POST /api/admin/ai/task-assist/apply`** → **`executeCommunicationsSend`** (canonical **`communication_messages`** enqueue).
- **Save draft** — durable row in **`task_assist_proposals`** via **`POST /api/admin/ai/task-assist/proposals`**; list drafts for the opportunity; **approve** / **reject** on **`draft`** only — **approve does not send** (explicit operator send or schedule step).
- **Schedule send** — from an approved/edited draft: **single recipient**, final body (and email subject when channel is email), **`scheduled_for` in the future** → **`POST /api/admin/communication-scheduled-sends`** creates **`pending`** snapshot rows only. **Delivery** happens when **`POST /api/admin/communication-scheduled-sends/process-due`** runs (cron with **`INTERNAL_CRON_TOKEN`** or admin-scoped run), which claims due rows and calls **`executeCommunicationsSend`**. Operators may **`PATCH`** cancel while **`pending`**.
- **Reminder / operational task** — **`POST /api/admin/operational-tasks`** with **`source: task_assist`**, title + future **`due_at`**; list and **`PATCH`** complete/cancel for **`open`** tasks. **`opportunities.metadata.next_follow_up_at`** is **not** auto-synced from tasks in V1.1 (Card 0 — optional app-layer follow-up later).
- **Proposal generation** — **`POST /api/admin/ai/task-assist/propose`** remains **deterministic** (`buildDeterministicTaskAssistSuggestionV1`); org **`ai_policy`** may allow **`openai`** for permission alignment, but **this route does not call a live LLM** (see route comment). Optional **`persist: true`** on propose inserts a proposal row without send.

---

## Card 0 — locked decisions (2026-05-21)

Execution constraint: **Cards 2+ must not contradict this section without a new Card 0 amendment.**

| Decision | Locked choice |
|----------|----------------|
| **Primary entity** | **Opportunities only** for V1.1 (same as V1); **`jobs`** / other anchors **deferred**. |
| **Durable proposals table** | **`public.task_assist_proposals`** — **not** a generic **`agent_proposals`** table in V1.1. |
| **Scheduled communications** | **`public.communication_scheduled_sends`** — approved snapshot + worker claim + single enqueue via **`executeCommunicationsSend`** (application/worker code in Card 5). **No** `communication_messages` row at schedule-create time. |
| **Reminders / tasks** | **`public.operational_tasks`** with **`source = 'task_assist'`**. |
| **Canonical send** | All outbound sends remain **`executeCommunicationsSend`** → **`enqueueCanonicalOutboundMessage`**; **no** legacy **`public.messages`** / **`messages_outbox`**. |
| **Worker idempotency** | **`SKIP LOCKED`** / **`claim_token`** + **`claimed_at`** on **`communication_scheduled_sends`**; partial unique index **one pending/claimed row per `proposal_id`** when set. |
| **`next_follow_up_at` sync** | **Deferred to Card 3 (application layer)** — **no** DB trigger writing **`opportunities.metadata`** from **`operational_tasks`** in Card 1 (avoids interaction with **`set_updated_at_opportunities`** and keeps migration narrow). Product may set **`metadata.next_follow_up_at`** when creating/updating follow-up tasks via existing PATCH paths later. |
| **V1 HTTP compatibility** | Keep **`POST /api/admin/ai/task-assist/propose`** and **`POST .../apply`** until Card 2+ adds proposal routes; no breaking removal in Card 1. |

**Card 0 exit checklist**

- [x] **`task_assist_proposals`** (not generic **`agent_proposals`**).
- [x] **`communication_scheduled_sends`** + worker claim fields + idempotency index.
- [x] **`operational_tasks`**; **`next_follow_up_at`** sync **deferred** to app (Card 3).
- [x] V1 **`/propose`** + **`/apply`** kept (no route changes in Card 1).
- [x] No workflow / bulk / legacy / auto-send triggers.

---

## Step 0.5 — Schema / design audit (2026-05-14)

### 0.5.1 Existing patterns (do not ignore)

| Pattern | Implication for V1.1 |
|---------|----------------------|
| **`agent_v0_proposals`**, **`agent_v1_record_layout_proposals`**, **`agent_v2_field_visibility_proposals`** | Per-feature tables with **`proposal_id`**, org scoping, RLS, often **DEFINER RPC** apply + audit rows. **Not** a single polymorphic “all agents” proposal store today. |
| **`communication_messages`** | Canonical outbound lifecycle **`queued` → sent/delivered**; **no** `scheduled_at` / `send_after` column in current foundation migration. **`metadata`** exists but **must not** be the sole scheduling truth without a **worker-safe claim** contract (see §2.2). |
| **`opportunities.metadata`** | **`next_follow_up_at`** already used for attention / queue signals. **Viable for minimal reminders** without a new table — **but** does not give assignee, title, audit trail, or “task completed” semantics. |
| **Task Assist V1 routes** | **`POST .../propose`**, **`POST .../apply`** — apply already enforces **`assertCommunicationsSendAllowed`** + **`executeCommunicationsSend`**. V1.1 must **extend**, not fork, canonical send. |

### 0.5.2 Generic `agent_proposals` vs `task_assist_proposals`

| Option | Pros | Cons |
|--------|------|------|
| **Single `agent_proposals`** (polymorphic JSON + `agent_key` + `proposal_type`) | One RLS story; cross-agent analytics. | No second consumer in V1.1; polymorphic indexes + validation sprawl; does not match existing **`agent_v*_*_proposals`** shape; easy to overbuild. |
| **`task_assist_proposals` (recommended for V1.1)** | Narrow scope; columns match Task Assist payload + lifecycle; clear FK to org/user; can still set **`agent_key = 'task_assist'`** for logs. | Second table if Workflow Assist later wants identical lifecycle — mitigated by **documented merge path** after second consumer exists. |

**Locked recommendation (pending Card 0 sign-off):** **`public.task_assist_proposals`** for V1.1. **Defer** generic **`agent_proposals`** until a **second** agent needs the **same** draft → approve → apply → expire lifecycle with identical columns (revisit in Agent #3 cross-cutting card).

### 0.5.3 Scheduled send — metadata-only vs table

| Approach | Verdict |
|----------|---------|
| **`communication_messages.metadata` only** (“fake scheduling”) | **Reject** for V1.1 product scheduling: row implies message exists; **`queued`** early would confuse threads; **no** worker claim / cancel semantics. |
| **New `communication_scheduled_sends` (recommended)** | Holds **approved snapshot** + **`scheduled_for`** + **`status`**; worker **creates** canonical enqueue **once** at fire time (or Next cron calls **`executeCommunicationsSend`** with snapshot). **Single progression:** pending → (claimed) → queued (stores **`communication_message_id`**) → terminal. |

**Locked recommendation:** **`public.communication_scheduled_sends`** (tenant-scoped name; not `task_assist_scheduled_sends` so other surfaces could reuse **`source`** + **`metadata`** later). **`communication_message_id` nullable** until enqueue succeeds.

### 0.5.4 Tasks / reminders — metadata vs table

| Approach | Verdict |
|----------|---------|
| **`opportunities.metadata.next_follow_up_at` only** | Fast; already indexed in queue paths. **Weak** for “reminder task” product: no assignee, title, completion, cancel audit. |
| **`operational_tasks` (recommended)** | **`public.operational_tasks`** (avoid reserved word **`tasks`** as table name unless repo standard says otherwise): lightweight rows, **`source = 'task_assist'`**, **`due_at`**, status, assignee nullable. Aligns with “human approval before create”. |

**Locked recommendation:** **`public.operational_tasks`** for V1.1 **reminder/follow-up** created from Task Assist (approved path). Optional **sync** of **`due_at`** into **`opportunities.metadata.next_follow_up_at`** for existing attention rules — **Card 0** decides “dual write vs tasks-only” to avoid two sources of truth.

---

## 1. V1.1 scope (narrow operational layer)

### 1.1 In scope

| Capability | Requirement |
|------------|-------------|
| **Save / review AI-generated drafts** | Persist **`TaskAssistSuggestionV1`**-shaped (or strict subset) **`payload`** + **`validation_errors`**, **`warnings`**, status lifecycle. |
| **Human approval** | **No** row transitions to **applied**, **queued** schedule, or **open** operational task without explicit **approve** (or combined **approve+apply** where product allows one step). |
| **Send now** | Reuse **`executeCommunicationsSend`**; proposal row records **`applied_at`**, **`applied_by`**, link to **`communication_message_id`** in **`metadata` or dedicated column**. |
| **Scheduled one-time send** | **`communication_scheduled_sends`** + worker/cron path; **one** enqueue per row (idempotent). |
| **Reminders / follow-up** | **`operational_tasks`** from approved proposal intent; single assignee optional. |
| **Canonical only** | All sends: **`executeCommunicationsSend`** → **`enqueueCanonicalOutboundMessage`**. **No** legacy stack. |

### 1.2 Explicitly out of scope

- Workflow graph configuration, NL → workflow, **`workflows`** mutations (Agent #3).
- Bulk / multi-recipient / BCC lists.
- Autonomous cron that **creates** sends without a persisted **approved** schedule row.
- **`jobs`** / other entities — **defer** to V1.2 unless Card 0 expands (mirror V1 “opportunities first”).

---

## 2. Schema decisions (draft DDL intent — Card 1 materializes)

### 2.1 `task_assist_proposals`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `org_id` | uuid FK → orgs | RLS |
| `actor_user_id` | uuid | Creator |
| `agent_key` | text | **`task_assist`** (constant for future merge) |
| `proposal_type` | text | e.g. **`draft_sms`**, **`draft_email`**, **`schedule_send`**, **`reminder`** — enum/check in migration |
| `entity_type` | text | V1.1: **`opportunities`** only |
| `entity_id` | uuid | |
| `status` | text | **`draft` \| `approved` \| `rejected` \| `expired` \| `applied`** |
| `payload` | jsonb | Frozen **`TaskAssistSuggestionV1`** + optional **`operator_edit`** snapshot at save/approve |
| `validation_errors` | jsonb | Server validation snapshot |
| `warnings` | jsonb | |
| `expires_at` | timestamptz | nullable |
| `approved_at` / `approved_by` | timestamptz / uuid | nullable |
| `rejected_at` / `rejected_by` | timestamptz / uuid | nullable |
| `applied_at` / `applied_by` | timestamptz / uuid | nullable |
| `applied_result` | jsonb | e.g. **`{ "communication_message_id", "operational_task_id", "scheduled_send_id" }`** |
| `created_at` / `updated_at` | timestamptz | |

Indexes: **`(org_id, entity_type, entity_id, status)`**, **`(org_id, expires_at)`** where status draft.

### 2.2 `communication_scheduled_sends`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `org_id` | uuid | |
| `proposal_id` | uuid FK → **task_assist_proposals** nullable | If schedule created from proposal |
| `entity_type` / `entity_id` | text / uuid | opportunities |
| `recipient_person_id` | uuid | single recipient |
| `channel` | text | sms \| email |
| `subject_snapshot` | text | nullable (email) |
| `body_snapshot` | text | **approved** body |
| `binding_id` | uuid | nullable FK to bindings |
| `scheduled_for` | timestamptz | |
| `status` | text | **`pending` \| `claimed` \| `queued` \| `sent` \| `canceled` \| `failed`** |
| `approved_at` / `approved_by` | timestamptz / uuid | Required before worker fires |
| `communication_message_id` | uuid nullable | Set when **`executeCommunicationsSend`** succeeds |
| `source` | text | **`task_assist`** |
| `metadata` | jsonb | idempotency keys, error messages |
| `claimed_at` / `claim_token` | timestamptz / text | Worker single-flight |
| `created_at` / `updated_at` | timestamptz | |

**Invariant:** No insert into **`communication_messages`** until transition to **fire** (or use **`queued`** only after successful enqueue — **Card 0** picks exact state machine).

### 2.3 `operational_tasks`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `org_id` | uuid | |
| `entity_type` / `entity_id` | text / uuid | |
| `assigned_to_user_id` | uuid nullable | |
| `created_by` | uuid | |
| `title` | text | |
| `description` | text | nullable |
| `due_at` | timestamptz | |
| `status` | text | **`open` \| `completed` \| `canceled`** |
| `source` | text | **`task_assist`** |
| `proposal_id` | uuid nullable FK | |
| `metadata` | jsonb | |
| `created_at` / `updated_at` | timestamptz | |

---

## 3. Migrations needed (summary)

| Migration | Purpose |
|-----------|---------|
| **M1–M4** | **M1–M3** delivered as **`supabase/migrations/20260521103000_task_assist_v1_1_foundation.sql`**: **`task_assist_proposals`**, **`communication_scheduled_sends`**, **`operational_tasks`**, RLS, indexes, org-integrity triggers, **`set_updated_at`** on all three. **M4:** **`supabase/migrations/20260522140000_claim_due_communication_scheduled_sends.sql`** — RPC **`claim_due_communication_scheduled_sends`** (`FOR UPDATE SKIP LOCKED`), **`REVOKE ALL … FROM PUBLIC`**, **`GRANT EXECUTE … TO service_role`** only. |
| **M4 (optional)** | **Not in Card 1** — **`next_follow_up_at`** sync is **Card 3** application-layer only (Card 0). |

Reference CSVs after migrations: regenerate or hand-update **`docs/supabase/reference/*.csv`** per repo practice.

---

## 4. Route contracts (admin, org-scoped)

**Card 7 shipping checklist:** consolidated method/path list in **§12** (same routes as below).

**Proposal + task routes** use **`getAdminContextCached`** + **`requireAdminOrOps`**. **`POST /api/admin/ai/task-assist/propose`** still uses the V1 portal/policy gate (**`getAdminAccessContextCached`**) unchanged for generation.

| Method | Path | Purpose |
|--------|------|---------|
| **POST** | **`/api/admin/ai/task-assist/proposals`** | Create durable proposal (validated payload). |
| **GET** | **`/api/admin/ai/task-assist/proposals`** | List by **`entity_type`**, **`entity_id`**. |
| **POST** | **`/api/admin/ai/task-assist/proposals/[id]/approve`** | **draft → approved** (no send). |
| **POST** | **`/api/admin/ai/task-assist/proposals/[id]/reject`** | **draft → rejected**. |
| **GET** | **`/api/admin/operational-tasks`** | List **`operational_tasks`** for an opportunity. |
| **POST** | **`/api/admin/operational-tasks`** | Create task (**`source: task_assist`**). |
| **PATCH** | **`/api/admin/operational-tasks/[id]`** | **`status`: `completed` \| `canceled`** (open only). |
| **GET** | **`/api/admin/communication-scheduled-sends`** | List scheduled sends for an opportunity. |
| **POST** | **`/api/admin/communication-scheduled-sends`** | Create **pending** row (approved snapshot; **no send**). |
| **PATCH** | **`/api/admin/communication-scheduled-sends/[id]`** | **`{ "status": "canceled" }`** — **pending → canceled** only. |
| **POST** | **`/api/admin/communication-scheduled-sends/process-due`** | Worker/cron: claim due rows, **`executeCommunicationsSend`**, finalize **queued** / **failed**. |
| **POST** | **`/api/admin/ai/task-assist/propose`** (V1) | Optional **`persist: true`** to insert **`task_assist_proposals`** when valid. |
| **POST** | **`/api/admin/ai/task-assist/apply`** (V1) | Send-now apply (**unchanged**). |

**`POST …/communication-scheduled-sends/process-due` — auth**

- **`x-cron-token`** header must **exactly** match env **`INTERNAL_CRON_TOKEN`** (timing-safe compare; env must be non-empty) → processor may claim rows **across all orgs** (`p_org_id` null on RPC).
- Otherwise: **`requireAdminOrOps`** + **`getAdminContextCached`** → claim is **scoped to that org** only.

**Deprecation note:** **Card 0 locked:** keep **`POST .../propose`** and **`POST .../apply`**; durable proposal HTTP lives alongside (no removal in Card 1).

---

## 5. UI changes (opportunity drawer) — **Card 6 (shipped)**

Implemented in **`TaskAssistV1OpportunityPanel`** (`web/components/admin/taskAssist/TaskAssistV1OpportunityPanel.tsx`) with client helpers **`web/lib/agent/taskAssist/taskAssistV11OpportunityApi.ts`**:

1. **Save draft for review** — **`POST /api/admin/ai/task-assist/proposals`** after a valid on-screen draft exists.
2. **List saved proposals** — **`GET`** same route with **`entity_type=opportunities`** + **`entity_id`**; **approve** / **reject** for **`draft`** via **`POST …/[id]/approve`** / **`reject`** (no send on approve).
3. **Send now** — unchanged **`POST /api/admin/ai/task-assist/apply`** when the operator sends the current draft.
4. **Schedule send** — form gated on recipient + final body + future **`scheduled_for`**; **`POST /api/admin/communication-scheduled-sends`**; list + cancel **`pending`** via **`PATCH`**; UI copy states the **worker sends later**.
5. **Reminder / task** — title + future **`due_at`**; **`POST /api/admin/operational-tasks`**; list + complete/cancel **`open`** via **`PATCH`**.

**Gates:** **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**; no workflow UI or vocabulary.

---

## 6. Worker model — scheduled sends

**Goal:** Pending approved rows become **exactly one** canonical outbound enqueue via **`executeCommunicationsSend`** (no legacy **`messages`** / **`messages_outbox`**).

| Step | Behavior (implemented) |
|------|--------------------------|
| **Claim** | Postgres RPC **`claim_due_communication_scheduled_sends`** (`supabase/migrations/20260522140000_claim_due_communication_scheduled_sends.sql`): rows **`pending`**, **`scheduled_for <= p_now`**, **`communication_message_id IS NULL`**, optional org filter; **`FOR UPDATE SKIP LOCKED`**; sets **`claimed`**, **`claim_token`**, **`claimed_at`**. **`GRANT EXECUTE`** → **`service_role`** only. |
| **Send** | **`executeCommunicationsSend`** using **`body_snapshot`**, **`subject_snapshot`**, **`recipient_person_id`**, optional binding id; metadata includes **`communication_scheduled_send_id`**. |
| **Success** | **`status = queued`**, **`communication_message_id`** set; update requires **`communication_message_id IS NULL`** to avoid double-attaching. |
| **Failure** | **`status = failed`**, **`metadata.last_process_error`**. |
| **Cancel** | Operator **`PATCH`** sets **`canceled`** from **`pending`** only; worker only claims **`pending`**. |

### Idempotency caveat (known)

If **`executeCommunicationsSend`** succeeds but the final **`queued`** update fails or races, a **second** enqueue is **theoretically** possible on a later retry. Guards (**`claim_token`**, **`communication_message_id IS NULL`** on success update) reduce risk but **do not mathematically eliminate** all interleavings.

### Stuck **`claimed`** rows (known gap)

If the worker **crashes after claim** and **before** enqueue, or the success-path DB update is lost, rows can remain **`claimed`** with **`communication_message_id` null**. **`processDueCommunicationScheduledSends`** does **not** pick **`claimed`** rows.

**Current V1.1 operational handling**

1. **Detect** rows **`status = claimed`**, **`communication_message_id IS NULL`**, **`claimed_at`** older than an agreed quiet window (e.g. **≥ 30 minutes**).  
2. **Recover** using **`releaseStaleClaimedCommunicationScheduledSends`** in **`web/lib/communications/communicationScheduledSendsService.ts`** (separate cron step or one-off ops script). It returns rows to **`pending`** only when **`claimed_at < olderThan`** and **`now − olderThan`** meets **`STALE_CLAIM_RELEASE_MINIMUM_AGE_MS`**. It is **not** called from **`process-due`** automatically.  
3. **Re-run** **`POST /api/admin/communication-scheduled-sends/process-due`** so the SKIP LOCKED claim can pick them up again.

**Follow-up (optional)**  

- DB-native reclaim RPC, terminal **`failed`** for “abandoned claim”, or correlation with **`communication_messages`** metadata — add if stale **`claimed`** volume or compliance needs stronger guarantees than the app-layer minimum-age gate.

**Deployment:** **`POST …/process-due`** with **`x-cron-token: INTERNAL_CRON_TOKEN`** for multi-tenant runs; align with **`INTERNAL_MESSAGES_PROCESS_URL`** / **`triggerBackendMessagesQueue`** patterns in **`docs/product/communications.md`**.

---

## 7. Safety rules (enforced in code + DB checks)

1. **No auto-send** — `communication_scheduled_sends` worker only processes **`approved_at` not null** and **`status = pending`** (or explicit **`approved`** sub-state if split).
2. **Scheduled send requires approval** — same as above.
3. **Reminders require approval** — **`operational_tasks`** created only from **`apply`** on **approved** proposal or dedicated approved mutation.
4. **Canceled** schedules never enqueue.
5. **Single recipient** — enforce in validators + DB CHECK or app.
6. **No workflow keys** on any JSON body — reuse V1 **`validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys`** family.
7. **No legacy stack** — only **`executeCommunicationsSend`** for outbound.
8. **Snapshot at approve** — copy **`body_snapshot`**, **`subject_snapshot`**, **`recipient_person_id`** at **approve** time; apply uses snapshots, not client-trusted live fields.

---

## 8. Implementation cards (Cursor order)

| Card | Name | Exit criteria |
|------|------|----------------|
| **0** | **Schema / route / worker lock** | **Done** — see §Card 0 above. |
| **1** | **Supabase migrations + RLS** | **Done** — `20260521103000_task_assist_v1_1_foundation.sql`, **`20260522140000_claim_due_communication_scheduled_sends.sql`**, reference CSVs (incl. **`supabase_functions.csv`** for claim RPC). |
| **2** | **Proposal persistence + HTTP** | **Done** — POST/GET proposals, approve/reject; tests + validators. |
| **3** | **Operational tasks** | **Done** — POST/GET/PATCH **`/api/admin/operational-tasks`**; **`proposal_id`** validation. |
| **4** | **Scheduled send HTTP** | **Done** — GET/POST **`/api/admin/communication-scheduled-sends`**, PATCH cancel **`pending`** only; **no send** on create. |
| **5** | **Scheduled send worker** | **Done** — RPC claim + **`processDueCommunicationScheduledSends`** + **`POST …/process-due`**; tests; **Card 5 hardening** adds **`releaseStaleClaimedCommunicationScheduledSends`** + sprint §6 recovery notes. |
| **6** | **UI extension** | **Done** — Opportunity drawer: save draft, list, approve/reject, send-now, schedule, reminder/tasks; **`web/tests/agent/taskAssist/**`**. |
| **7** | **Docs + references** | **Done** — This sprint doc completion checklist, **`docs/product/ai-system.md`**, **`docs/product/communications.md`**, **`docs/product/crm-system.md`** pointer, **`task_assist_v1.md`** V1.1 forward pointer; Supabase reference CSVs verified for V1.1 tables + claim RPC. |

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| **Two truths** (proposal `payload` vs snapshot) | Approve locks **snapshot** columns on schedule/task rows; apply reads snapshots only. |
| **Worker / Next drift** | Single module **`executeCommunicationsSend`**; worker calls same code path as routes (shared package or internal API with service auth). |
| **RLS mistakes** | Follow **`agent_v1_record_layout_proposals`** policy style; service_role for worker with explicit org filter in query. |
| **Scope creep** | Card 0 freezes **`opportunities`** only for V1.1 unless explicit amendment. |
| **Dual `next_follow_up_at`** | Card 0 chooses tasks-only vs metadata sync. |
| **Stuck `claimed` scheduled sends** | Ops runbook: §6 **Stuck `claimed` rows** + **`releaseStaleClaimedCommunicationScheduledSends`**; optional future DB reclaim RPC. |

---

## 10. Environment, policy, and cron (V1.1)

| Gate | Purpose |
|------|---------|
| **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** | Client + **`isTaskAssistV1UiEnabled()`** — opportunity drawer Task Assist panel (V1 send-now + V1.1 durable flows). |
| **`metadata.ai_policy`** on **`org_settings`** | **`enabled`**, **`provider`** (`stub` \| `openai`), **`allowed_features`** must include **`task_assist_draft`** for **`POST /api/admin/ai/task-assist/propose`** (and the same portal / permission pattern as AI enrichment where applicable). |
| **`AI_ENRICHMENT_STUB_ENABLED`** | Required **`true`** when org policy uses **`provider: stub`** for routes that use the stub guard (including Task Assist **propose** on the stub branch). |
| **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** + **`ai.enrichment.use`** | When strict enrichment permission mode is on, Task Assist **propose** follows the same **`computeOpenAiLiveInvocationPermitted`** / portal checks as enrichment (see **`docs/product/ai-system.md`**). |
| **`OPENAI_API_KEY`**, **`OPENAI_MODEL`** (optional **`OPENAI_BASE_URL`**) | Needed for orgs with **`provider: openai`** on **other** gated live routes; **propose** still does **not** invoke OpenAI (deterministic body only). |
| **`INTERNAL_CRON_TOKEN`** | Must match **`x-cron-token`** on **`POST /api/admin/communication-scheduled-sends/process-due`** for **cross-org** scheduled-send processing; without it, callers need admin session and runs are **org-scoped**. |

---

## 11. V1.1 limitations (explicit)

| Limitation | Notes |
|------------|--------|
| **Opportunities only** | **`entity_type`** enforced to **`opportunities`** in migrations, validators, and UI. |
| **Single recipient** | One **`recipient_person_id`** per send / schedule row; no bulk or BCC lists. |
| **No bulk** | No multi-select or campaign semantics. |
| **No workflow config** | No **`workflows`** / NL→workflow / Agent #3 surfaces in Task Assist. |
| **Scheduled sends require worker/cron** | **`pending`** rows do not enqueue **`communication_messages`** until **`process-due`** claims and runs **`executeCommunicationsSend`**. Align deployment with **`INTERNAL_CRON_TOKEN`** (see **`docs/product/communications.md`**). |
| **No live LLM on Task Assist propose** | **`POST …/propose`** builds proposals **deterministically**; **`openai`** in policy does **not** enable model sampling on that route today. |
| **Stuck `claimed` rows** | Recovery is **manual / secondary cron** via **`releaseStaleClaimedCommunicationScheduledSends`** (see §6) — not automatic inside **`process-due`**. |

---

## 12. Routes shipped (admin HTTP checklist)

All under **`web/app/api/admin/`** unless noted. Auth follows each route’s **`getAdminContextCached`** / **`requireAdminOrOps`** / cron-token branch as implemented.

| Method | Path |
|--------|------|
| **POST** | **`/api/admin/ai/task-assist/propose`** (V1; optional **`persist: true`**) |
| **POST** | **`/api/admin/ai/task-assist/apply`** (V1 send-now) |
| **POST** | **`/api/admin/ai/task-assist/proposals`** |
| **GET** | **`/api/admin/ai/task-assist/proposals`** |
| **POST** | **`/api/admin/ai/task-assist/proposals/[id]/approve`** |
| **POST** | **`/api/admin/ai/task-assist/proposals/[id]/reject`** |
| **GET** | **`/api/admin/operational-tasks`** |
| **POST** | **`/api/admin/operational-tasks`** |
| **PATCH** | **`/api/admin/operational-tasks/[id]`** |
| **GET** | **`/api/admin/communication-scheduled-sends`** |
| **POST** | **`/api/admin/communication-scheduled-sends`** |
| **PATCH** | **`/api/admin/communication-scheduled-sends/[id]`** |
| **POST** | **`/api/admin/communication-scheduled-sends/process-due`** |

---

## 13. Manual QA checklist (staging / pilot)

Use after migrations **`20260521103000_task_assist_v1_1_foundation.sql`** and **`20260522140000_claim_due_communication_scheduled_sends.sql`** are applied.

**A. Flags and policy**

- [ ] **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** is **`true`** / **`1`** on the web deployment under test.
- [ ] Pilot org **`org_settings.metadata.ai_policy`** includes **`task_assist_draft`** in **`allowed_features`**, with **`provider: stub`** or **`openai`** as intended.
- [ ] If **`provider: stub`**, **`AI_ENRICHMENT_STUB_ENABLED=true`** in server env.
- [ ] If using strict enrichment RBAC, confirm portal user can pass **`resolveAiEnrichmentPortalAccess`** for **propose** (same pattern as **`docs/product/ai-system.md`** staging checklist).

**B. Opportunity drawer — draft and send-now**

- [ ] Open an opportunity with drawer recipients; **Task Assist** panel appears when the public flag is on.
- [ ] **Draft with Task Assist** returns a valid SMS or email draft; operator can edit body (and subject for email) and select **one** eligible recipient.
- [ ] **Send approved draft** still enqueues via canonical path (thread + **`communication_messages`** **`queued`**); no legacy **`messages`** from Task Assist.

**C. Durable proposal (V1.1)**

- [ ] **Save draft for review** creates a row; **Saved proposals** lists it with status **`draft`**.
- [ ] **Approve** moves status to **`approved`** and **does not** send or enqueue by itself.
- [ ] **Reject** moves status to **`rejected`**.
- [ ] Approve/reject controls are absent or inactive for non-draft rows as implemented.

**D. Scheduled send**

- [ ] Schedule UI stays disabled without recipient, body, and a **future** **`scheduled_for`**.
- [ ] **Create scheduled send** inserts **`pending`**; list shows the row; copy indicates **worker/cron sends later**.
- [ ] **`POST …/communication-scheduled-sends/process-due`** with valid **`x-cron-token: INTERNAL_CRON_TOKEN`** processes due rows (or org-scoped admin path in dev).
- [ ] **Cancel** works only for **`pending`**; canceled rows are not claimed by the worker.

**E. Operational tasks**

- [ ] Create task requires **title** and **future** **`due_at`**; appears in the task list with **`open`** status.
- [ ] **Complete** / **Cancel** work from **`open`** via **`PATCH`** as implemented.

**F. Safety copy**

- [ ] UI does not introduce **workflow** vocabulary for these controls.
- [ ] No hidden recipients — selected person matches visible radios.

**G. Regression**

- [ ] **`cd web && npx tsc --noEmit`**
- [ ] **`cd web && npm run test -- tests/agent/taskAssist/`**

---

## 14. Card 7 exit checklist

- [x] Sprint doc: Card **6** marked complete; **V1.1 summary**, **routes**, **env/policy**, **limitations**, **manual QA** recorded (§1 header + §10–§13).
- [x] **`docs/product/ai-system.md`** — Task Assist V1.1 routes, flags, propose deterministic note.
- [x] **`docs/product/communications.md`** — scheduled sends + **`process-due`** + canonical send link.
- [x] **`docs/product/crm-system.md`** — one-line pointer for opportunity-scoped tasks (optional file touch).
- [x] **`docs/sprints/05_2026/task_assist_v1.md`** — forward pointer to V1.1 sprint.
- [x] **`docs/supabase/reference/*.csv`** — **`task_assist_proposals`**, **`communication_scheduled_sends`**, **`operational_tasks`**, **`claim_due_communication_scheduled_sends`** present (verified Card 7; regenerate via **`npm run export:supabase-schema`** when DB drifts).

---

## 15. References

- `docs/sprints/05_2026/task_assist_v1.md`
- `docs/sprints/05_2026/ai_agents_v1.md` §8
- `docs/product/communications.md`
- `docs/product/ai-system.md`
- `supabase/migrations/20260413100000_agent_v1_record_overview_layout_audit.sql` (RLS / proposal pattern)
- `supabase/migrations/20260430254100_communications_v1_foundation.sql`
- `supabase/migrations/20260521103000_task_assist_v1_1_foundation.sql`
- `supabase/migrations/20260522140000_claim_due_communication_scheduled_sends.sql`

---

## Card 0 exit checklist (copy into PR)

- [x] **`task_assist_proposals`** approved (not generic **`agent_proposals`** for V1.1) **or** amendment recorded.
- [x] **`communication_scheduled_sends`** state machine + worker owner documented.
- [x] **`operational_tasks`** vs **`metadata.next_follow_up_at`** sync decision recorded (**deferred to Card 3 app layer**).
- [x] V1 **`/propose`** + **`/apply`** compatibility strategy chosen (keep vs deprecate) — **keep** for now.
- [x] No workflow / bulk / legacy paths in acceptance criteria.
