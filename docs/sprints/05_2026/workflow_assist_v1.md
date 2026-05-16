# Sprint: Workflow Assist V1 (Agent #3)

**Path:** `docs/sprints/05_2026/workflow_assist_v1.md`  
**Status:** **Cards 1–5 + stabilization + Explain v0 shipped** — read-only cards, deterministic propose/apply, role-aware UX, create-template guardrails, **`GET /api/admin/ai/workflow-assist/explain`** (deterministic checklist). LLM, durable proposals, bulk pause, deep condition correlation remain deferred.  
**Prerequisites:** `docs/sprints/05_2026/agent_interaction_layer_v1.md` (Orchestrator + thread + action cards), `docs/sprints/05_2026/task_assist_v1_1.md` (Task Assist patterns), `docs/sprints/05_2026/ai_agents_v1.md` §9 (`WorkflowAssistSuggestionV1` template), `docs/product/ai-system.md`, `docs/system/actions-and-workflows.md`.

**Non-goals for this document:** Task Assist transactional scope; new workflow execution engine; autonomous `executeWorkflowRun` from NL; childcare-only automation rules in platform code.

---

## Card 0 — Locked doctrine (2026-05-15)

| Decision | Locked choice |
|----------|----------------|
| **Agent role** | Workflow Assist is a **proposal / explanation / oversight** layer over **existing** workflow config and run history — not a replacement engine and not a super-admin bypass. |
| **Mutations** | **No** direct writes from model output. **Apply** uses the same server paths as human admins (`POST`/`PATCH`/`DELETE` on workflow family routes, or future DEFINER proposal+audit if adopted) **after** explicit human approval and re-validation. |
| **Execution** | **`executeWorkflowRun`** remains the **only** runtime executor for workflow side effects; Assist may **propose** manual test runs only through existing **`POST /api/admin/workflows/[id]/run`** semantics (already `requireAdminOrOps`) — **not** “headless loop from AI.” |
| **Orchestrator** | Continues to **route** and **never** apply workflow mutations; specialist owns action cards and API calls. |
| **Determinism** | V1 favors **deterministic** intent classification + template/catalog mapping; optional gated LLM for **draft text only**, behind org policy (pattern: Task Assist / enrichment gates in `docs/product/ai-system.md`). |
| **Vertical neutrality** | Example intents (“enrollment”, “tours”) are **documentation examples**; catalog keys and templates stay **industry-agnostic** unless expressed as org-local config or seeds. |

---

## Implementation status — Cards 1–5

| Card | Status | What shipped |
|------|--------|----------------|
| **Card 1** | **Shipped** | `web/lib/agent/workflowAssist/workflowAssistReadV1.ts` — `WorkflowAssistReadIntentV1`, `WorkflowAssistReadSubIntentV1`, `WorkflowAssistReadCardPayloadV1`, `WorkflowAssistErrorEnvelopeV1`, `parseWorkflowAssistReadIntent`, `buildWorkflowAssistReadCardPayload`, `workflowAssistErrorEnvelope`, `WorkflowAssistThreadMutationHandlersV1` (UI hooks for propose buttons on read cards). |
| **Card 2** | **Shipped** | `routeCommandSurface` route kind **`workflow_assist`**; shell `runWorkflowAssistRoute` appends **`workflow_assist_read`** thread turns. Legacy **`workflow_notice`** turn still renders static copy for old sessions. |
| **Card 3** | **Shipped** | Read-only thread card UI `WorkflowAssistReadThreadCard.tsx` — **summary**, **failed runs (7d sample + links)**, **enrollment keyword filter**, **Explain v0** checklist card. Summary/failed data from **`GET /api/admin/workflows/summary`**, **`GET /api/admin/workflow-runs?…`**. Explain from **`GET /api/admin/ai/workflow-assist/explain`**. |
| **Card 4** | **Shipped** | **`POST /api/admin/ai/workflow-assist/propose`** — `requireAdmin` (ops excluded); portal + org `ai_policy` with feature **`workflow_assist_draft`**. **`GET /api/admin/ai/workflow-assist/capabilities`** — read-only hint for UI (`can_propose_and_apply_workflow_assist` mirrors propose/apply admin gate). Read cards expose **Propose disable** / **Propose disabled draft (template starter)** when capabilities allow; otherwise **`WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE`**. |
| **Card 5** | **Shipped** | **`POST /api/admin/ai/workflow-assist/apply`** — **`requireAdmin` only** (ops get 403); proposal **Apply** disabled in UI unless **`GET …/capabilities`** reports admin. Validates **`WorkflowAssistApplyRequestV1`** + semantic checks; **`executeWorkflowAssistApply`** uses the same field allowlist as admin workflow routes (`insert` create always **`enabled: false`**; `update` for edit/pause) + **`logAdminAudit`**. UI: **`WorkflowAssistProposalActionCard`** — preview, **Admin approval required**, **Apply as admin**, success/error. |

### Supported proposal kinds (Card 4–5)

| `proposal_kind` | Propose body (v1) | Apply behavior |
|-----------------|-------------------|----------------|
| **`create_workflow`** | `draft` with `name`, `event_type`, `entity_type`; `draft.enabled` must be false or omitted | Inserts workflow row **`enabled: false`** always (server-enforced). |
| **`edit_workflow`** | `workflow_id` (UUID) + `patch` (subset of workflow fields) | `PATCH`-equivalent update via Supabase with org scope. |
| **`pause_workflow`** | `workflow_id` (UUID), optional `reason` | Sets **`enabled: false`** for that workflow only (single-row). |

### Permission decisions (explicit)

| Path | Gate |
|------|------|
| Read cards (`workflow_assist_read`, GET summary / runs) | Existing admin workflow GET routes (admin + ops where those routes already allow). |
| **Propose** | **`requireAdmin`** + enrichment portal resolution + org **`ai_policy`** (`workflow_assist_draft`, stub/openai branches per `task-assist`-style guards). **Ops cannot propose** in v1. |
| **Apply** | **`requireAdmin` only** — no widening of ops mutation access. |

### Partially shipped / known gaps (post Card 5)

| Topic | State |
|-------|--------|
| **Explain v0** | **Shipped** — deterministic read-only **`GET /api/admin/ai/workflow-assist/explain`** + Orchestrator **`explain_v0`** intent; inspects `workflow_events`, `workflows`, `workflow_runs`, `workflow_action_runs`. Does **not** evaluate live conditions or entity status history. |
| **Explain v1** | **Deferred** — condition-level correlation, entity status timeline, multi-workflow disambiguation, optional LLM narrative. |
| **Failed runs list** | Client filters last-100 runs; KPI line approximate. |
| **`WORKFLOW_ASSIST_NOTICE_TEXT`** | Still used for legacy `workflow_notice` copy only. |
| **Durable `workflow_assist_proposals`** | **Not implemented** — ephemeral suggestion JSON + client-held card (same pattern as early Task Assist). |
| **LLM** | **Not implemented** for Workflow Assist; propose is fully deterministic. |
| **Bulk pause / tag mute** | **Not implemented** — only single-workflow pause proposal. |
| **Edit from UI** | Read cards surface **pause** and **create template** only; arbitrary **edit_workflow** is API-ready (propose + apply covered by tests) but not exposed as buttons yet. |
| **Stabilization (role UX + guardrails)** | **Shipped:** **`GET /api/admin/ai/workflow-assist/capabilities`** (`can_propose_and_apply_workflow_assist` = compatibility **`admin`**); Orchestrator hides propose CTAs for ops and disables Apply unless admin; create proposal card stresses **disabled draft / template starter / review in Automations**; deterministic create template description warns placeholders are generic. |

### Staging migration naming (do not rename if applied)

The migration **`supabase/migrations/20260522180000_staging_demo_org_ai_policy_task_assist_draft.sql`** merges **`task_assist_draft`** and **`workflow_assist_draft`** for the childcare staging org. If this migration **already ran** in an environment, **do not rename** the file — add a **new** migration for further policy tweaks.

### Intentionally deferred (unchanged)

- LLM classification or draft text for workflows.
- Durable proposal / apply_audit tables (unless compliance mandates later).
- Bulk pause, autonomous execution, arbitrary SQL/config mutation, new workflow engine logic.

---

## 1. Current-state audit

### 1.1 What already exists

| Area | Evidence | Notes |
|------|-----------|--------|
| **Event spine** | `web/lib/emitEvent.ts` → `workflow_events` | Canonical insert; callers fan out to workflow matching (`docs/system/actions-and-workflows.md`). |
| **Workflow runner** | `web/lib/workflowRun.ts` | Large implementation: loads workflows, enriches payload, evaluates conditions, executes `workflow_actions`, logs, integrations (comms mirror, action links, etc.). |
| **Status → events** | `web/lib/admin/emitStatusChangedEvent.ts` | `opportunity_status_changed` / `entity_status_changed` + `executeWorkflowRun` with `event_id`. |
| **Admin actions** | `web/lib/admin/actions/executeAdminAction.ts` | Workflow starts emit events + runs where applicable. |
| **Schema** | `docs/supabase/reference/supabase_schema_columns.csv` | Tables include `workflows`, `workflow_actions`, `workflow_conditions`, `workflow_events`, `workflow_runs`, `workflow_run_events`, `workflow_action_runs`, links from `communication_messages.workflow_run_id`, `action_definitions.workflow_id`. |
| **Admin APIs** | `web/app/api/admin/workflows/**` | List/create (`GET`/`POST` `.../workflows`), single workflow `GET`/`PATCH`/`DELETE`, nested `actions`, `conditions`, `field-catalog`, **`summary`** (KPI-style aggregates + last run), **`[id]/run`** (manual run with `event_payload`). |
| **Auth split** | `workflows/route.ts`, `[id]/route.ts`, `[id]/run/route.ts` | **Needs verification:** `GET` list uses `getAdminContextCached` only (comment says admin+ops); **create/update/delete** use **`requireAdmin`**; **manual run** uses **`requireAdminOrOps`**. Align product copy and Workflow Assist gates with this split intentionally. |
| **AdminV2 UI** | `web/app/adminV2/workflows/page.tsx` | “Understand what automations are running” — KPIs, workflow list, run history, run detail, **no visual canvas** (subtitle in UI). |
| **Settings links** | `web/app/adminV2/settings/page.tsx` | “Automations” → `/adminV2/workflows`; separate **Actions** registry page (`/adminV2/settings/actions`). |
| **Orchestrator routing** | `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts` | Route **`workflow_assist`** when `slots.workflow_like` or Task Assist **`workflow_blocked`**; read-only Workflow Assist thread card (Cards 1–3). |
| **Slot detection** | `web/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract.ts` | `WORKFLOW_RE` — keywords: `workflow`, `automatically`, `when … happens/completes`, `trigger`, `rules`. |
| **Task Assist guard** | `web/lib/agent/taskAssist/taskAssistCommandIntent.ts` | Duplicate `WORKFLOW_RE`; sets **`workflow_blocked`** so Task Assist does not absorb automation language. |
| **Audits** | `docs/audits/workflow-execution-consistency-audit.md`, `docs/audits/event-integrity-audit.md` | Intended vs exceptional paths (e.g. manual run without `event_id`). |
| **Agent config pattern** | `docs/product/ai-system.md` §SECURITY DEFINER RPCs | `agent_v0/v1/v2` proposal + apply audit + stale checks for **queue_definition**, record overview layout, field visibility — **template** for durable AI-mediated config (workflows are **not** yet on this pattern). |
| **AI policy / RBAC** | `org_settings.metadata.ai_policy`, `ai.enrichment.use`, `docs/system/roles-and-permissions.md` | Task Assist draft gated by policy + permissions; workflow CRUD today is **`requireAdmin`**. |

### 1.2 What is reusable

- **Orchestrator:** `routeCommandSurface` **`workflow_assist`** + `workflow_assist_read` thread turns; reuse Interaction Layer thread shell.
- **Proposal shape:** `WorkflowAssistSuggestionV1` from `ai_agents_v1.md` §9.1 — align TypeScript types when implementing.
- **Validation:** Reuse admin workflow API contracts (`POST` body shape, `workflow_actions` / `workflow_conditions` payloads) as the **only** structured target for drafts.
- **Read-only diagnostics:** `GET /api/admin/workflows/summary`, workflow detail + runs APIs and UI data loaders — **no synthetic run ids**.
- **Permission machinery:** `getAdminContextCached`, `requireAdmin`, `requireAdminOrOps`, future **`permission_key`** (e.g. `ai.workflow.draft.generate` per `docs/product/ai-system.md` matrix stub).
- **Org policy:** Extend **`metadata.ai_policy.allowed_features`** with a workflow-assist feature flag (name TBD) following Task Assist / enrichment pattern.

### 1.3 What should not be rebuilt

- **Event insertion** — always `emitEvent` where canonical.
- **Workflow execution semantics** — do not fork `executeWorkflowRun` for Assist.
- **Parallel “workflow DSL” or second runner** — `proposed_workflow` stays JSON mirroring DB/API shapes (`ai_agents_v1.md` §9.4).
- **Separate command bar or drawer-only AI** for the same intents — use Orchestrator thread + cards (`agent_interaction_layer_v1.md`).

### 1.4 Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| **No Workflow Assist durable proposals** | Medium | Task Assist has `task_assist_proposals`; Workflow Assist uses **ephemeral** suggestions until compliance requires retention. |
| **No durable workflow proposals** | Medium | Unlike agent v0/v1/v2, workflows have **no** proposal/apply_audit DEFINER pair — direct Supabase from admin routes today. |
| **NL → intent beyond regex** | Low–Med | `WORKFLOW_RE` is coarse; may false-positive/false-negative; no structured `normalized_key` pipeline in code yet. |
| **Explain “why didn’t X move?”** | **Partially addressed (v0)** | **`GET …/workflow-assist/explain`** correlates events → workflows → runs; does **not** yet trace entity status history or per-condition evaluation. |
| **Pause all enrollment workflows** | Not implemented | Only per-workflow **`enabled`** flag via `PATCH`; no bulk/pause-by-tag API **Needs verification** in codebase for bulk ops. |
| **Canvas / visual editor** | Out of V1 | UI explicitly says no canvas — Assist should not depend on one. |
| **Department/site scoped workflows** | **Needs verification** | `workflows.org_id` exists; whether workflows are further scoped by department/site in RLS or payload — confirm before designing scoped “pause in my site.” |

---

## 2. Product boundaries

| Layer | Responsibilities | Does **not** |
|-------|------------------|--------------|
| **Orchestrator** | NL/slots, thread UX, entity context, **routing** to specialists, clarification/candidates | Execute sends, schedules, tasks, or workflow writes |
| **Task Assist** | One-off comms, scheduled sends, operational tasks; **`TaskAssistSuggestionV1`**; approval before apply | Workflow graph authoring; condition/action editing |
| **Workflow Assist** | Draft/explain/maintain **workflow configuration**; oversight summaries; **structured proposals**; human approval before persistence | Primary owner of transactional comms; autonomous execution loops |
| **Workflow engine** (`executeWorkflowRun`, `emitEvent`, DB definitions) | **Authoritative** automation: match events, evaluate conditions, run actions, record runs | Interpret natural language; store AI drafts as truth |

---

## 3. Workflow Assist V1 scope

### 3.1 In scope (recommended V1 — tighten in Card 1 if needed)

1. **Orchestrator integration:** Route workflow-like NL to Workflow Assist **action cards** (replace static notice) with deterministic **first** implementation.
2. **Read-heavy modes:** “List failed runs this week”, “show workflow summary for org” — powered by existing **`/api/admin/workflows/summary`** + run list queries used by AdminV2 workflows page **Needs verification** exact client fetch paths.
3. **Proposal mode (constrained):** Small **catalog** of `intent.normalized_key` → template `proposed_workflow` (empty or stub conditions/actions where allowed) + operator **Review** → **Apply** calls existing **`POST /api/admin/workflows`** + actions/conditions routes **or** a staged multi-step apply — **design choice in Card 1**.
4. **Explain v0 (deterministic):** For a given **workflow_id** + optional **entity** context, return **structured** “evaluation steps” from **known fields** (enabled flag, event/entity match, last run status) — **not** LLM hallucination of history.
5. **Permissions:** Align with **`requireAdmin`** for any mutation path; optional read for **`requireAdminOrOps`** where consistent with `GET` workflows list; add org **`ai_policy`** feature for **draft generation** only.

### 3.2 Out of scope (V1)

- Visual workflow canvas editor.
- Auto-enable / auto-deploy workflows without human accept.
- LLM-only “figure out the whole graph” without template/catalog guardrails.
- Cross-org workflow templates **productized** (internal seeds OK).
- Replacing **`executeAdminAction`** or PATCH routes with Assist-only side doors.

### 3.3 Explicit non-goals

- Generic chatbot inside Automations settings.
- **Super-admin** cross-tenant workflow management.
- Headless **`executeWorkflowRun`** triggered by Assist without operator intent on a **named** test path.
- Childcare-specific condition keys in shared catalog (use org config / metadata where industry-specific).

---

## 4. Proposed architecture

### 4.1 Routing model

1. **Orchestrator** `routeCommandSurface`: **`workflow_assist`** route kind is **shipped** (replaces the former `workflow_assist_notice` route name); `workflowAssistReadIntent` on the route result.
2. **Precedence:** Keep workflow-like **before** Task Assist (already true).
3. **Sub-intent:** Deterministic classifier → `{ kind: "oversight" | "draft" | "explain" | "clarify" }` with small keyword maps + optional future LLM **classify-only** (structured JSON) behind policy.

### 4.2 Proposal / draft model

- **Ephemeral first (Card A):** Server returns `WorkflowAssistSuggestionV1`; UI holds draft; Apply POSTs full validated body — **lowest migration cost** (mirrors early Task Assist V1).
- **Durable later (Card B):** New `workflow_assist_proposals` + `workflow_assist_apply_audit` mirroring agent v1/v2 **if** compliance requires retained drafts — **not required for narrow V1**.

### 4.3 Approval / apply model

1. Card shows **diff** vs empty or vs selected workflow version (**Needs verification** if version column exists on `workflows` — CSV shows `created_at`/`updated_at` only).
2. Operator **Approve** → server **`requireAdmin`** + org match + payload validation identical to human POST.
3. **No** client-side trust of proposal JSON.

### 4.4 Explain / debug model

- **Inputs:** `workflow_id`, optional `entity_type`/`entity_id`, optional `run_id`.
- **Outputs:** Structured checklist: event match, enabled, condition results **if** evaluator can run read-only with synthetic payload (**Needs verification** — may require explicit “replay” API with guardrails).
- **Sources:** `workflow_runs`, `workflow_action_runs`, `workflow_events` (read paths only).

### 4.5 Audit / logging model

- **Apply:** Prefer same pattern as other AI config: correlation id + actor + result in dedicated audit table or extend existing agent audit namespace — **decision gate Card 1**.
- **Telemetry:** Optional `ai_enrichment_usage_v1`-style events or minimized `workflow_events` **only** with non-PII payload contract — follow `docs/product/ai-system.md` guardrails.

### 4.6 Permission model (summary — see §6)

- **Draft generate (LLM or stub):** `ai_policy` + recommended `ai.workflow.draft.generate` (not seeded yet per `ai-system.md`).
- **Read runs / explain:** `requireAdminOrOps` **if** aligned with existing workflow list/run endpoints.
- **Create/update/delete/enable:** **`requireAdmin`** (or future `workflows.manage`).

---

## 5. UX model

All inside **Orchestrator thread** (`CommandSurfaceThread` + action cards) — no disconnected page-only AI.

| Card type | Purpose | Primary actions |
|-----------|---------|-------------------|
| **Workflow proposal** | Shows proposed name, trigger (`event_type` + `entity_type`), high-level steps count | **Edit in settings (deep link)** / **Apply draft** (admin-gated) |
| **Workflow diff** | Before/after JSON or field list for PATCH | **Approve** / **Cancel** |
| **Approval** | Confirms org + impact (“will create workflow X”) | **Confirm** |
| **Debug / explanation** | Checklist: why run skipped/failed, which condition failed | **Copy summary** / **Open run in Automations** (`/adminV2/workflows?run=…`) |
| **Failure / oversight** | Aggregates failed runs (7d), noisy workflows | **Mute** (**Not implemented** — only per-workflow disable today) / **Open workflow** |

**Deep link:** Reuse AdminV2 workflows page highlight param **`?run=`** where present (`page.tsx` uses `highlightRunId`).

---

## 6. Permission model (detailed)

| Action | Recommended gate | Scope notes |
|--------|------------------|-------------|
| Ask **oversight** questions (counts, last failures) | `requireAdminOrOps` + org | Read-only; align with `GET …/summary`. |
| **Explain** workflow behavior (static + run-linked facts) | Same as read | Do not expose cross-org global workflows in tenant UI. |
| **Draft** new workflow (AI-assisted JSON) | `ai_policy` + **`ai.workflow.draft.generate`** (recommended) + portal | Generation ≠ apply. |
| **Approve / apply** workflow create/edit | **`requireAdmin`** (today) | Ops must not silently ship automation unless product explicitly grants — **current code: PATCH/POST admin-only**. |
| **Pause / disable** workflow | **`requireAdmin`** | `enabled: false` via existing PATCH. |
| **Manual test run** | `requireAdminOrOps` | Existing `POST …/run` — Assist should surface as explicit card, not auto-fire. |

**Department / site:** CRM scope (`getAdminAccessContextCached`) applies to **entity** operations; workflows are org-level today — **Needs verification** whether any workflow steps filter by site; do not assume site-scoped workflow rows without schema proof.

---

## 7. Risk analysis

| Risk | Mitigation |
|------|------------|
| **Approval bypass** | Apply only on server; `requireAdmin`; no service-role from client; single apply entrypoint with audit. |
| **Runaway automation** | No auto-enable; templates start **disabled** or require explicit enable checkbox in card. |
| **Workflow duplication** | Show warning if name/event/entity collision; validate uniqueness **Needs verification** DB constraints. |
| **Config drift** | Proposals must round-trip through same validators as admin UI/API. |
| **Permission escalation** | Never grant ops **`PATCH workflows`** via Assist without explicit product decision. |
| **Opaque AI reasoning** | Structured `reasoning.warnings[]` + checklist explain mode; avoid raw model chain-of-thought in UI. |
| **Event/action mismatch** | `normalized_key` maps to registered `event_type` values used in `emitEvent` paths — maintain catalog doc + tests. |

---

## 8. Implementation roadmap (Cards 0–N)

| Card | Scope | Gate |
|------|--------|------|
| **0** | Audit + design lock (this doc) | Approved scope boundaries |
| **1** | **Shipped:** read contracts in `workflowAssistReadV1.ts`; proposal contracts in `workflowAssistProposalV1.ts` | — |
| **2** | **Shipped:** Orchestrator `workflow_assist` route + `workflow_assist_read` thread turn | — |
| **3** | **Shipped:** GET-backed summary / failed runs / enrollment filter / explain placeholder cards | — |
| **4** | **Shipped:** `POST /api/admin/ai/workflow-assist/propose` — deterministic, policy-gated, no DB | Env + policy + admin gate tests |
| **5** | **Shipped:** `POST /api/admin/ai/workflow-assist/apply` — `requireAdmin`, `executeWorkflowAssistApply` | Route tests + semantic validation |
| **6** | Explain v0 endpoint + card (structured checklist) | QA on staging |
| **7** | Optional: durable proposals table | Compliance need |
| **8** | Optional: gated LLM for draft **content only** | Pilot org policy |

**Deferred (V2+):** Natural-language condition authoring; bulk pause by tag; cross-entity simulation; automatic “fix my workflow” apply.

---

## 9. Testing strategy

| Layer | Tests |
|-------|--------|
| **Unit** | `parseWorkflowAssistReadIntent`, `buildWorkflowAssistReadCardPayload`, `routeCommandSurface` workflow branch — `web/tests/agent/workflowAssist/workflowAssistReadV1.test.ts`, `web/tests/adminV2/commandSurfaceRouter.test.ts`. |
| **Integration** | `workflowAssistProposeRoute.test.ts`, `workflowAssistApplyRoute.test.ts`, **`workflowAssistEditProposeApplyRoute.test.ts`** (edit propose→apply + org-scoped mock), **`workflowAssistCapabilitiesRoute.test.ts`**; org policy guards in `web/tests/ai/aiEnrichmentRouteAccess.test.ts`. |
| **Permissions** | Matrix: admin vs ops vs missing `ai.enrichment.use` / future draft key — mirror `web/tests/ai/aiEnrichmentRouteAccess.test.ts` patterns. |
| **Orchestrator routing** | Extend `web/tests/adminV2/commandSurface*.test.ts` — workflow NL → Workflow Assist route, not Task Assist. |
| **Workflow proposal** | Golden fixtures: template → `POST /api/admin/workflows` body shape. |
| **Approval/apply** | Ensure double-submit / tampered proposal rejected. |
| **Failure/explainability** | Fixture DB or mocked Supabase: stable explanation output from known run states. |
| **Staging QA** | Org with `ai_policy` feature on; walkthrough: propose → edit → reject; propose → apply → verify row in `workflows`; run manual test from UI; verify audit row if implemented. |

---

## 10. Sources of truth and references

- **Doctrine:** `docs/execution/operating-doctrine.md`, `docs/core/system-overview.md`
- **Workflows:** `docs/system/actions-and-workflows.md`, `docs/audits/workflow-execution-consistency-audit.md`
- **Config / AI:** `docs/system/configuration-system.md`, `docs/product/ai-system.md`
- **API map:** `docs/system/api-contracts.md`
- **RBAC:** `docs/system/roles-and-permissions.md`
- **Prior agent sprints:** `docs/sprints/05_2026/task_assist_v1.md`, `agent_interaction_layer_v1.md`, `ai_enrichment_and_agent_actions_v1.md`, `ai_agents_v1.md` §9

---

## 11. Open questions (Needs verification)

1. Exact **client** data loaders for `/adminV2/workflows` (parallel vs sequential) and whether all operators use `summary` variant.
2. Whether **`workflows`** rows can be **global** (`org_id` null) for platform templates — grep `workflows` insert seeds.
3. **DB uniqueness** constraints on workflow name per org.
4. Whether **ops** can `GET` single workflow detail in all deployments (route uses `getAdminContextCached` on `GET [id]` — likely yes for read).

---

## 12. Explain v0 (shipped)

| Topic | Detail |
|-------|--------|
| **API** | `GET /api/admin/ai/workflow-assist/explain` — query: `entity_type`, `entity_id`, optional `workflow_id`, `event_type`, `range` (`24h` \| `7d` \| `30d`). |
| **Auth** | `requireAdminOrOps` + org scope (read-only; **no** `workflow_assist_draft` policy). |
| **Data sources** | `workflow_events` (entity-scoped, time window), `workflows` (match `event_type` + `entity_type`, org + global), `workflow_runs` (by `event_id`), `workflow_action_runs` (failed steps). |
| **Outcomes** | `insufficient_context`, `no_event_found`, `no_matching_workflow`, `workflow_disabled`, `no_run_created`, `run_failed`, `action_failed`, `run_successful`, `run_skipped`, `insufficient_data`. |
| **UI** | Orchestrator routes “why didn’t…” to **`explain_v0`**; shell calls explain API when ambient opportunity context exists; otherwise **Needs more context** card (no apply CTAs). |
| **Deterministic** | Pure builder `buildWorkflowAssistExplainV1` — not LLM; checklist + confidence + Automations links. |

### Explain v0 limitations

- Requires **entity_type + entity_id** (ambient opportunity in command surface, or explicit query params).
- Uses **latest event** in window as anchor; does not compare multiple candidate events.
- Does **not** read `workflow_conditions` evaluation, entity status tables, or comms delivery logs.
- Global workflows (`org_id` null) included in matching query; run enrichment uses org-scoped workflow names.
- **“Successful run”** does not prove business outcome (wrong template, skipped manual step, etc.).

### Explain v1 ideas (deferred)

- Condition checklist from last run payload / condition rows.
- Status-change timeline vs expected `opportunity_status_changed` payload.
- Pin `workflow_id` / `event_type` from operator utterance (slot extract).
- Optional LLM narrative **on top of** structured checklist (policy-gated).

---

## 13. Recommended next feature batch (post–Explain v0)

1. **Edit from read cards** — narrow, safe patch (e.g. rename) with preview, still admin-only apply.  
2. **Explain v1** — condition + entity status correlation (still read-only).  
3. **Durable proposals** — if compliance requires retained drafts + audit rows.  
4. **Optional: propose for ops** — only if product explicitly widens policy (separate from apply).

---

**When to update this doc:** Card 0 amendments; first route shipped; permission key seeded; any intentional change to `requireAdmin` vs ops for workflow mutations.
