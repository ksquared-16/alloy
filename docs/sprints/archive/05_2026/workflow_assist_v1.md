# Sprint: Workflow Assist V1 (Agent #3)

**Path:** `docs/sprints/05_2026/workflow_assist_v1.md`  
**Status:** **Cards 1–5 + stabilization + Explain v1 (operational trace) shipped** — read-only cards, deterministic propose/apply, role-aware UX, create-template guardrails, **`GET /api/admin/ai/workflow-assist/explain`** returns Explain v1 with **`WorkflowOperationalTraceV1`**. LLM, durable proposals, bulk pause, multi-event disambiguation remain deferred.  
**Prerequisites:** `docs/sprints/05_2026/agent_interaction_layer_v1.md` (Orchestrator + thread + action cards), `docs/sprints/05_2026/task_assist_v1_1.md` (Task Assist patterns), `docs/sprints/05_2026/ai_agents_v1.md` §9 (`WorkflowAssistSuggestionV1` template), `docs/product/bos-foundation.md`, `docs/system/actions-and-workflows.md`.

**Non-goals for this document:** Task Assist transactional scope; new workflow execution engine; autonomous `executeWorkflowRun` from NL; childcare-only automation rules in platform code.

---

## Card 0 — Locked doctrine (2026-05-15)

| Decision | Locked choice |
|----------|----------------|
| **Agent role** | Workflow Assist is a **proposal / explanation / oversight** layer over **existing** workflow config and run history — not a replacement engine and not a super-admin bypass. |
| **Mutations** | **No** direct writes from model output. **Apply** uses the same server paths as human admins (`POST`/`PATCH`/`DELETE` on workflow family routes, or future DEFINER proposal+audit if adopted) **after** explicit human approval and re-validation. |
| **Execution** | **`executeWorkflowRun`** remains the **only** runtime executor for workflow side effects; Assist may **propose** manual test runs only through existing **`POST /api/admin/workflows/[id]/run`** semantics (already `requireAdminOrOps`) — **not** “headless loop from AI.” |
| **Orchestrator** | Continues to **route** and **never** apply workflow mutations; specialist owns action cards and API calls. |
| **Determinism** | V1 favors **deterministic** intent classification + template/catalog mapping; optional gated LLM for **draft text only**, behind org policy (pattern: Task Assist / enrichment gates in `docs/product/bos-foundation.md`). |
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
| **Explain v1 (operational trace)** | **Shipped** — **`GET /api/admin/ai/workflow-assist/explain`** returns `{ explain_engine: 1, explanation, trace }`; Orchestrator **`explain_v1`** intent. Trace correlates events → workflows → conditions (same eval as `executeWorkflowRun`) → runs → action_runs; timeline + status transitions from event/run payloads. |
| **Explain v0** | **Superseded in API** — v0 builder remains for tests; production path uses trace builder. |
| **Failed runs list** | Client filters last-100 runs; KPI line approximate. |
| **`WORKFLOW_ASSIST_NOTICE_TEXT`** | Still used for legacy `workflow_notice` copy only. |
| **Durable `workflow_assist_proposals`** | **Not implemented** — ephemeral suggestion JSON + client-held card (same pattern as early Task Assist). |
| **LLM** | **AI draft enrichment V1 shipped (stub advisory)** — live OpenAI invocation deferred; create propose uses stub enrichment + deterministic normalization. |
| **Bulk pause / tag mute** | **Not implemented** — only single-workflow pause proposal. |
| **Edit from UI** | Read cards surface **pause** and **create template** only; arbitrary **edit_workflow** is API-ready (propose + apply covered by tests) but not exposed as buttons yet. |
| **Stabilization (role UX + guardrails)** | **Shipped:** **`GET /api/admin/ai/workflow-assist/capabilities`** (`can_propose_and_apply_workflow_assist` = compatibility **`admin`**); Orchestrator hides propose CTAs for ops and disables Apply unless admin; create proposal card stresses **disabled draft / template starter / review in Automations**; deterministic create template description warns placeholders are generic. |
| **NL create routing (vertical slice)** | **Shipped:** `parseWorkflowAssistCreateIntent` + `buildWorkflowAssistCreateProposeFromIntent` — Orchestrator routes create/make/automation-when and tour-reminder phrasing to **`workflow_assist_proposal`** (not read summary). Templates: **`tour_reminder`**, **`enrollment_when_move`**, **`generic_stub`**. Apply still **`enabled: false`** only. |
| **Explain name lookup** | **Shipped (narrow):** why-blocked commands without ambient context → Task Assist entity search on extracted family name; single high-confidence opportunity → Explain v1; multiple → candidate picker with explain confirm. |
| **Dept / work-unit automation visibility** | **Shipped (metadata scope):** `workflows.metadata.scope` + partitioned `AutomationWorkflowsBlock` (scoped WU / dept / org-wide / heuristic fallback). |

### Staging migration naming (do not rename if applied)

The migration **`supabase/migrations/20260522180000_staging_demo_org_ai_policy_task_assist_draft.sql`** merges **`task_assist_draft`** (and later file edits added **`workflow_assist_draft`** in-repo). If that migration **already ran** before `workflow_assist_draft` was added to the file, apply the follow-up **`supabase/migrations/20260523170000_staging_demo_org_ai_policy_workflow_assist_draft.sql`** (idempotent union for org `93667019-bd28-49b5-a688-acc9bb1e0a19`). **Do not rename** applied migration files.

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
| **Agent config pattern** | `docs/product/bos-foundation.md` §SECURITY DEFINER RPCs | `agent_v0/v1/v2` proposal + apply audit + stale checks for **queue_definition**, record overview layout, field visibility — **template** for durable AI-mediated config (workflows are **not** yet on this pattern). |
| **AI policy / RBAC** | `org_settings.metadata.ai_policy`, `ai.enrichment.use`, `docs/system/roles-and-permissions.md` | Task Assist draft gated by policy + permissions; workflow CRUD today is **`requireAdmin`**. |

### 1.2 What is reusable

- **Orchestrator:** `routeCommandSurface` **`workflow_assist`** + `workflow_assist_read` thread turns; reuse Interaction Layer thread shell.
- **Proposal shape:** `WorkflowAssistSuggestionV1` from `ai_agents_v1.md` §9.1 — align TypeScript types when implementing.
- **Validation:** Reuse admin workflow API contracts (`POST` body shape, `workflow_actions` / `workflow_conditions` payloads) as the **only** structured target for drafts.
- **Read-only diagnostics:** `GET /api/admin/workflows/summary`, workflow detail + runs APIs and UI data loaders — **no synthetic run ids**.
- **Permission machinery:** `getAdminContextCached`, `requireAdmin`, `requireAdminOrOps`, future **`permission_key`** (e.g. `ai.workflow.draft.generate` per `docs/product/bos-foundation.md` matrix stub).
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
- **Telemetry:** Optional `ai_enrichment_usage_v1`-style events or minimized `workflow_events` **only** with non-PII payload contract — follow `docs/product/bos-foundation.md` guardrails.

### 4.6 Permission model (summary — see §6)

- **Draft generate (LLM or stub):** `ai_policy` + recommended `ai.workflow.draft.generate` (not seeded yet per `bos-foundation.md`).
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
- **Config / AI:** `docs/system/configuration-system.md`, `docs/product/bos-foundation.md`
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

## 12. Operational trace + Explain v1 (shipped)

### Doctrine

- **Operational trace** is the reusable read-only correlation layer: one normalized `WorkflowOperationalTraceV1` per explain request.
- Trace is built from **authoritative DB tables only** — no LLM, no replay, no mutations.
- Condition inspection reuses **`inspectWorkflowConditions`** from `workflowRun.ts` (same operators/paths as runtime).
- Explain **conclusion** is derived from trace outcome — checklist and timeline are projections of trace, not separate truth.

### Modules

| Module | Role |
|--------|------|
| `workflowAssistOperationalTraceV1.ts` | Trace + timeline contracts |
| `workflowAssistOperationalTraceBuilder.ts` | Pure trace builder + outcome derivation |
| `workflowAssistOperationalTraceFetch.ts` | Org-scoped fetch + assemble source data |
| `workflowAssistExplainFromTraceV1.ts` | Explain card copy from trace |
| `workflowRun.ts` → `inspectWorkflowConditions` | Shared condition evaluation |

### API

`GET /api/admin/ai/workflow-assist/explain` — query: `entity_type`, `entity_id`, optional `workflow_id`, `event_type`, `range`.

Response: `{ ok: true, explain_engine: 1, explanation, trace }`.

**Auth:** `requireAdminOrOps` (read-only; no `workflow_assist_draft`).

**Outcomes:** v0 set plus **`condition_mismatch`** when run skipped / conditions fail.

### UI

- Orchestrator **`explain_v1`** intent (why-not-moved phrasing).
- **`WorkflowAssistReadThreadCard`**: checklist + **operational timeline** + Automations/run links.
- Read-only badge; no apply from explain card.

### Limitations

- Anchors on **latest** `workflow_events` row in window (no multi-event picker).
- Status timeline from **event/run payloads** only (not full entity audit log).
- Does not inspect comms delivery, form completion, or external integrations.
- Condition eval uses **stored run/event payload** — may differ from live entity if payload was sparse at run time.
- Global workflows (`org_id` null) included in definition matching.

### Future extensibility

- Trace `trace_id` stable hash for persistence, diff, and recommendation systems.
- Optional LLM narrative **on top of** trace JSON (policy-gated).
- Multi-workflow disambiguation when several enabled workflows match one event.

---

## 13. Recommended next feature batch (post–Explain v1)

1. **Edit from read cards** — narrow, safe patch with preview, admin-only apply.  
2. **Multi-event explain** — let operator pick which `workflow_events` row to anchor.  
3. **Durable proposals** — if compliance requires retained drafts + audit rows.  
4. **Trace-backed recommendations** — suggest disable workflow / fix condition (still human-approved).

---

## 14. NL create templates + workspace automation visibility (shipped)

### Creation intent routing

- Parser: `web/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1.ts` — sub-intent **`create_workflow_proposal`**.
- Orchestrator: `routeCommandSurface` checks create **before** `parseWorkflowAssistReadIntent` so create language does not fall through to **`workflow_summary`**.
- Shell: `runWorkflowAssistCreateRoute` → **`POST …/workflow-assist/propose`** → **`workflow_assist_proposal`** action card (not `workflow_assist_read`).

### Supported deterministic create templates

| Template id | Example commands | Draft defaults |
|-------------|------------------|----------------|
| **`tour_reminder`** | “Create a workflow that sends a reminder 3 days before tours”; “Send a reminder before tours” | Name **Tour Reminder Draft**; `event_type` **`opportunity_schedule_tour_followup`**; `entity_type` **`opportunity`**; `enabled: false`; no action steps scaffolded. |
| **`enrollment_when_move`** | “When forms complete move them to Ready to Enroll”; “Create an automation when a tour is scheduled” (when-clause) | Name **Status transition draft (review required)**; `event_type` **`opportunity_status_changed`** (placeholder); warnings call out target status / form event unknowns. |
| **`generic_stub`** | Other “create workflow/automation” without a matched template | Same generic starter as read-card **Propose disabled draft** button. |

### Unsupported create requests

- Arbitrary action graphs, delays, channels, or multi-step logic (configure in Automations).
- Auto-enable or autonomous execution (apply always inserts **`enabled: false`**).
- LLM-generated workflow definitions (not in default path).

### Disabled-draft safety model (unchanged)

- Propose builds suggestion with **`enabled: false`**; apply re-enforces false on insert.
- Admin-only propose/apply; ops see read cards and blocked mutation copy.

### Department / work-unit automation panels

- UI: `AutomationWorkflowsBlock` in department context column and work-unit footer (`data-ws-lane-kind="automation_workflows"`).
- Data: `GET /api/admin/workflow-runs?list=kpis` + `GET /api/admin/workflows/summary?variant=workspace` (workspace variant includes **last_run** per workflow).
- Filter: `filterWorkflowsForWorkspaceAutomationSurface` — opportunity / tour_bookings entity types when present.
- **Metadata gap:** `workflows` has no `department_id` or `work_unit_id`; panels show **`WORKSPACE_AUTOMATION_METADATA_GAP_NOTE`** and org-wide heuristic list until linkage exists.

---

## 15. Metadata scope + tour reminder action scaffold (shipped)

### Metadata scope model (V1)

Migration: `supabase/migrations/20260516143000_workflows_metadata_scope.sql` adds `workflows.metadata jsonb`.

```json
{
  "scope": {
    "department_id": "<uuid>",
    "work_unit_id": "<uuid optional>"
  },
  "workflow_assist": {
    "source": "workflow_assist_create_v1",
    "template_id": "tour_reminder",
    "draft_actions": [ "... intended steps documented ..." ]
  }
}
```

**Phase 2 (optional):** FK columns `workflows.department_id` / `workflows.work_unit_id` if query volume or integrity rules require it. V1 avoids schema churn beyond `metadata`.

### Workspace panels

- `GET /api/admin/workflows/summary?variant=workspace&department_id=&work_unit_id=` returns `partitions` when scope query params are set.
- `AutomationWorkflowsBlock` sections: **Scoped to this work unit**, **Scoped to this department**, **Org-wide**, **Enrollment-adjacent (fallback)** when no scoped rows exist.
- `GlobalAssistantContext.workspaceScope` set from department/work-unit pages so create proposals inherit route context. **`setWorkspaceScope`** shallow-compares before updating state; route effects depend on the stable callback (not the whole context object) to avoid render loops when names/ids are unchanged.

### Tour reminder scaffold

- Inserts one **`log`** `workflow_actions` row with `assist_scaffold: true` (safe — workflow stays **disabled**).
- `metadata.workflow_assist.draft_actions` records intended `create_message` SMS step for manual configuration.
- Proposal card copy: **Action scaffold requires review**, **Review message content before enabling**, **Workflow remains disabled**.

### Limitations

- Scaffold does not send or schedule messages.
- Offset timing / conditions still configured in Automations.
- Legacy workflows without `metadata.scope` appear under heuristic fallback only.

---

## 16. Product completion loop (shipped)

### Post-apply refresh

- On successful Workflow Assist apply (`WorkflowAssistProposalActionCard`), dispatches `alloy-adminv2-workflow-automation-refresh` with `GlobalAssistantContext.workspaceScope` (`department_id`, optional `work_unit_id`).
- Department and work-unit pages listen and refetch via `fetchWorkflowAutomationWorkspacePanels` (KPIs + `partitions`) without full route reload.
- Thread proposal card success state is preserved (no thread reset).

### Ask Workflow Assist (workspace)

- `AutomationWorkflowsBlock` **`onAskWorkflowAssist`** → `focusCommandBar({ seedCommand, expandThread: true })` (no separate assistant surface).
- Department seed: `Show workflows for {department name}`.
- Work-unit seed: `Create a workflow for {work unit} in {department}`.
- `workspaceScope` remains set while the page is mounted for create propose context (cleanup on unmount sets scope to `null`).

### Edit-from-read (narrow v1)

Read / failed-run / enrollment rows expose admin-only CTAs when capabilities allow:

| Action | Propose kind | Allowed patch |
|--------|--------------|---------------|
| Propose disable | `pause_workflow` | `enabled: false` |
| Propose rename | `edit_workflow` | `name` (prompt or ` (review)` fallback) |
| Propose description | `edit_workflow` | `description` |

**Blocked:** enable workflow, `event_type` / `entity_type`, action graph, conditions, triggers.

Proposal cards show **`edit_review`** rows (current vs proposed) loaded from DB on propose. Non-admin: CTAs hidden / Apply disabled with portal mutation copy.

### Remaining gaps

- FK `department_id` / `work_unit_id` on `workflows` (Phase 2).
- Timed reminder / real `create_message` actions; LLM generation; auto-enable; autonomous execution; broad workflow editor.

---

## 17. AI draft enrichment V1 (shipped)

### Doctrine

User intent → **stub/AI advisory enrichment** → **deterministic normalization** → human review → apply → **disabled** workflow draft. AI never becomes workflow execution truth.

### Enrichment pipeline

- `buildStubWorkflowAssistDraftEnrichmentRaw` — bounded raw enrichment (no network in default path).
- `resolveWorkflowAssistMessagePreview` — provenance order: **org template** (`metadata.workflow_assist_message_templates`) → **workflow template** → **AI-generated** → **fallback scaffold**.
- `enrichWorkflowAssistCreateSuggestionV1` — attaches `draft_review` on suggestion + `metadata.workflow_assist.enrichment_v1` snapshot for Explain/trace.
- `POST …/workflow-assist/propose` accepts `source_command`, `template_id`, `lead_days_before_tour`, `interpreted` for create proposals.

### Normalization (authoritative)

- Event types limited to allowlist (`opportunity_schedule_tour_followup`, `opportunity_status_changed`, `entity_status_changed`).
- Channels: `sms` | `email` | `in_app` only.
- `enabled` remains **false**; unsupported AI fields recorded in `rejected_fields` and downgraded.

### Proposal UX

- `WorkflowAssistProposalReviewPanel` — summary, trigger/timing, conditions, action preview, message preview, AI warnings, review checklist.
- Provenance chips: org template / AI-generated / fallback / needs review.

### Navigation

- Automations page honors `?workflow=` (Explain links) and `?run=` (run detail).
- Post-apply link: `/adminV2/workflows?workflow={id}`.

### Deferred

- Live OpenAI enrichment invocation (stub v1 only); replay/simulation; durable proposal store.

---

## 18. Operator review card + message variables (shipped)

### Variable audit

| Token / pattern | Supported for workflow runtime? | Workflow Assist preview |
|-----------------|------------------------------|------------------------|
| `{{contact.phone}}`, `{{person.phone}}`, `{{opportunity.id}}`, … | Yes — `web/lib/workflowTemplate.ts` dot paths | Configure in Automations action editor |
| `{{opportunity.metadata.tour_date}}`, `{{opportunity.metadata.tour_time}}` | Yes when opportunity row is on the workflow payload (`enrichWorkflowEventPayloadEntities` in `workflowRun.ts`); values are `yyyy-MM-dd` / `HH:mm` | Tour reminder preview + `reminder_intent_v1` metadata; operator must confirm formatting in Automations |
| `{{location.name}}` | Yes when location is joined on payload | Not used in tour reminder V1 preview |
| `{{contact_name}}`, `{{team_line}}` | **No** — Task Assist / needs-attention templates only (`suggestedContentTemplates.ts`) | Sanitized to `[Family first name]` or avoided in fallback |
| Canonical first-name merge field | **Not defined** for workflows today | Recipient called out in **Needs review** only (no invented name token) |

Module: `web/lib/agent/workflowAssist/workflowAssistMessageVariablesV1.ts`.

### Operator-facing proposal card

Compact sections: header (title, badges, scope), **Workflow** (when/who/action/**uses**), **Message preview** (provenance label), **Needs review** (≤4 bullets), one safety sentence, **Apply** + **Open Automations**. Internal event strings, scaffolds, normalization, and AI caveats live in collapsed **Advanced details** (default closed).

### Fallback message (tour reminder)

Example: “Reminder: your tour is scheduled for `{{opportunity.metadata.tour_date}}` at `{{opportunity.metadata.tour_time}}`. Reply here if you need to reschedule.”

### Command card navigation (shipped)

Nested links inside the command-surface footer thread were unreliable because parent surfaces could swallow clicks. Shared fix:

- `web/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation.ts` — `handleCommandSurfaceCardNavigate` (`preventDefault` + `stopPropagation`) + `COMMAND_SURFACE_INTERACTIVE_CARD_CLASS`
- `web/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink.tsx` — button-styled CTAs with `router.push`
- `CommandSurfaceThread` assistant bubbles + Workflow/Config action cards use `pointer-events-auto` on interactive shells

Regression tests: `web/tests/adminV2/commandSurfaceCardNavigation.test.ts`.

### Reminder intent metadata (shipped)

`workflows.metadata.workflow_assist.reminder_intent_v1` (advisory only) captures: `send_reminder`, channel (default SMS), `days_before_scheduled_tour`, opportunity entity, recipient intent, tour date/time field paths, message preview, and **`unresolved_mappings`** (operator-facing “Needs mapping” for date/time/recipient confirmation). Apply still inserts a **disabled** workflow with log scaffold only — no send, schedule, or auto-enable.

---

## 19. Command navigation + tour reminder intent (shipped 2026-05-16)

See §18 updates for navigation fix, tour date/time audit, and `reminder_intent_v1` apply metadata.

---

## 20. UX polish — navigation feedback, duplicates, stepper, Automations detail (shipped 2026-05-16)

### Command card navigation feedback

- `CommandSurfaceCardLink` shows **Opening…**, disables the button, calls `router.push`, and invokes `collapseCommandSurfaceAfterNavigation()` on `GlobalAssistantContext` (collapses thread panel).
- Shared helper: `handleCommandSurfaceCardNavigate` + optional `onNavigateStart` in `commandSurfaceCardNavigation.ts`.

### Duplicate workflow detection

Before returning a create proposal, `POST …/workflow-assist/propose` loads org workflows and runs `findWorkflowAssistDuplicates` (`workflowAssistDuplicateDetectionV1.ts`). Matches on template id, event/entity, similar name, `reminder_intent_v1` timing, and scope overlap.

UI: `WorkflowAssistDuplicateWarning` on the proposal card — **Open existing workflow**, **Propose edit**, **Create another draft anyway** (non-blocking).

### Proposal visual stepper

`WorkflowAssistProposalReviewPanel` renders numbered steps: Trigger → Timing → Audience → Action → Message (message step shows provenance label). Advanced details remain collapsed.

### `/adminV2/workflows` detail + deep link

- Row click updates `?workflow={id}` via `selectWorkflow`.
- `AdminV2WorkflowDetailPanel` in the right column shows name, enabled state, event/entity, scope metadata, actions, conditions, Assist `reminder_intent_v1` when present.
- `?workflow=` selects, highlights the row, and scrolls the detail panel into view.
- GET single-workflow parsing accepts both raw row and `{ workflow }` wrapper.

---

**When to update this doc:** Card 0 amendments; first route shipped; permission key seeded; any intentional change to `requireAdmin` vs ops for workflow mutations.
