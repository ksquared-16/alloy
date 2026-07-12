# Sprint: AI Agents V1 (Suggestion + Task Assist + Workflow Assist)

**Path:** `docs/sprints/archive/05_2026/ai_agents_v1.md`  
**Status:** Sprint specification — implementation follows cards in order.  
**Sources of truth:** `ai_agents_v1_step0_audit.md`, `ai_agents_v1_step1_design.md`, and execution doctrine in-repo.

---

## 1. Overview

This sprint introduces **AI agents as first-class platform capabilities** without a standalone agent framework.

- **Agent 1 — Needs Attention Suggestion:** extends the existing **needs attention / operational attention** system with a **structured, deterministic suggestion** (`next_action`, `reasoning`, optional **draft** message content) tied to resolver output.
- **Agent 2 — Task Assist V1:** **Shipped (narrow V1)** per **`docs/sprints/archive/05_2026/task_assist_v1.md`** — **transactional, one-off, user-directed** draft + approve-to-send for **opportunities** (SMS/email, single recipient, no durable proposals, no scheduled send in-product). **Out of scope for Agent 2:** reusable workflow configuration, workflow graph authoring, and any durable automation definition as the deliverable.
- **Agent 3 — Workflow Assist:** **design and documentation only** in this sprint — **reusable workflow configuration** (draft generation, maintenance, diagnostics). **Out of scope for Agent 3:** one-off transactional execution (send/schedule) as the agent’s core job; those belong to **Task Assist**.
- **Orchestrator (AdminV2 command bar — Interaction Layer V1):** **Shipped** as **`AICommandSurfaceShell`** + **`routeCommandSurface`**. Parses operator NL, resolves entity/context, routes to **Task Assist**, **Workflow Assist notice** (specialist later), or job layout — shows thread/clarification/candidates; **never directly executes** operational actions. See **`docs/sprints/archive/05_2026/agent_interaction_layer_v1.md`**.

**Product separation (non-negotiable):** **Orchestrator**, **Task Assist**, and **Workflow Assist** are distinct roles. **Task Assist** and **Workflow Assist** are **separate specialist agents**. They share the same **four-layer architecture** (see §6) but must **not** be conflated: one addresses **ephemeral / transactional** operator intents with **human approval before send** (scheduled send and follow-up apply are **out of scope** for shipped Task Assist V1 — see **`task_assist_v1.md`**); the other addresses **workflow definitions** with drafts **disabled by default** and human approval before save/apply to persisted automation.

Work is sequenced as **cards** (audit validation → model → engine → integration → drawer UI → message templates → **Task Assist + Workflow Assist docs** → testing). **Agent 1** and **Task Assist V1** have **implementation** in-repo; **Workflow Assist** remains **documentation-first** until its card pack ships. This overview is not a build checklist by itself — see **`task_assist_v1.md`** and **`ai_enrichment_and_agent_actions_v1.md`** for executable scope.

---

## 2. Product intent

- Make Alloy feel **more intelligent** in the operator’s primary workflow: **open an opportunity, understand why it needs attention, act faster**.
- Preserve trust: suggestions are **explainable**, **structured**, and **subordinate** to existing resolvers and entity truth — not a parallel brain that mutates data.
- Lay groundwork for **V2+** (durable proposals, acceptance flows, optional model assistance) without committing to persistence or autonomy in V1.

---

## 3. Architecture principles

| Principle | Meaning in V1 |
|-----------|----------------|
| **Agents on top of the system** | Inputs are existing types and APIs: `OpportunityAttentionResult`, opportunity row, activity signal where loaded, work-unit / department metadata, org scope. |
| **Structured outputs only** | Typed JSON-shaped objects (e.g. `AttentionSuggestionV1`), not freeform blobs. |
| **Deterministic + explainable** | Rules and templates first; no opaque “AI magic” copy for core fields. |
| **No standalone agent framework** | Plain modules + types under something like `web/lib/agent/needsAttentionSuggestion/` (exact tree per Card 1–2). |
| **No parallel lifecycle** | `resolveOpportunityAttention` remains the canonical **exception** evaluator; suggestions **interpret** its output. |
| **Surfaces are not source of truth** | Drawer and any future queue hint **display** server-derived payloads; they do not define membership or persistence. |
| **Cross-industry posture** | Default labels and templates stay **vertical-neutral**; childcare-specific tone is a **preset later**, not hardcoded platform defaults. |

---

## 3.1 V1.1 / V2 — AI enrichment path (planning only)

**V1 (shipped posture):** Deterministic `AttentionSuggestionV1` from `buildNeedsAttentionSuggestion` — resolver output → stable `next_action`, template-backed optional `suggested_content`, deterministic `suggestion_id`, and a short `reasoning.summary` composed from resolver labels + optional activity context. **No LLM** on the critical path unless explicitly approved per environment.

**V1.1 (optional enrichment layer, still structured):** Add an **optional** model pass **after** the deterministic object is built, gated by org / product policy:

- **AI-enriched reasoning** — expand or rephrase `reasoning.summary` (and optional bullets) while preserving reason codes and traceability to `OpportunityAttentionResult`.
- **AI-generated drafts** — editable bodies and **tone variants**; **templates remain the deterministic fallback** when the model is unavailable, denied by policy, or validation fails.
- **Prioritization hints** — ordered `next_action` candidates or scores as **structured fields only**; never executable without explicit UI/API acceptance.

**V2 (product + audit):** **Accept / dismiss / apply** events; **apply** only through existing explicit mutations after operator confirmation. **Reusable workflow proposal generation** follows the **Agent 3** template (`WorkflowAssistSuggestionV1`). **Task-oriented proposals** (send/schedule/reminder) follow the **Agent 2** template (`TaskAssistSuggestionV1`). **Persistence** and **audit rows** for accepted proposals when they become durable — still **no headless autonomous execution**.

**Invariants:** JSON-shaped contracts; **human review before any side effect**; queue and list payloads remain **preview-only** relative to entity GET.

---

## 4. Non-goals

- **No autonomous actions** (no auto-send, auto-status-change, auto-workflow-start from the suggestion agent).
- **No agent-generated DB writes** in V1 (including no insert/update driven solely by “suggestion generated”).
- **No suggestion / proposal table** in V1 — suggestions are **derived at read time** only.
- **No** new global “needs attention” lifecycle or replacement of `resolveOpportunityAttention`.
- **No** deep learning, cross-opportunity reasoning, or prediction models in V1.
- **No** full **Workflow Assist (Agent 3)** runtime (no NL → workflow create, no auto-apply of workflow config) in this sprint.
- **Task Assist (Agent 2)** **V1** is **scoped** to **`task_assist_v1.md`** (opportunity drawer, ephemeral proposals, canonical comms send) — not scheduled reminders/comms as shipped product in that pack.
- **No** new workflow DSL.
- **No** merging Task Assist transactional surfaces with Workflow Assist configuration surfaces in a single agent contract.
- **Queue row suggestion preview** is **not authoritative** — compact `_attention_suggestion_preview` on enriched opportunity queue rows is allowed as **display-only** (same builder as entity GET; list paths may omit activity so copy can differ slightly from the drawer).

---

## 5. Existing system audit summary

*(Condensed from Step 0 — see `ai_agents_v1_step0_audit.md` for file-level detail.)*

**Needs attention today**

- **Canonical evaluator:** `resolveOpportunityAttention` (`web/lib/opportunities/opportunityAttentionResolver.ts`, resolver **v2**). Combines queue-lane-style reasons (metadata dates, tour vs today, staleness vs `updated_at`, missing identity), **lifecycle** thresholds from `opportunity_attention_rules`, and **enrollment operational** wait buckets; applies config **policies** and ordering for `primary_reason`.
- **Not stored** as a single DB flag on opportunities; derived from row + defs + metadata config.
- **Queue membership:** `loadOpportunityNeedsAttentionRows` in `QueueService` prefilters candidates then filters in memory with the same resolver.
- **UI today:** Queue enrichment sets `_needs_attention` and related fields when `opportunityAttentionResolution` is supplied; **`buildQueueOperationalAttentionPresentation`** / **`nextStepGuidance`** provide deterministic operator strings. Drawer uses **`computeOperationalAttentionAttachment`** → **`_operational_attention`** on opportunity entity GET; **`OperationalAttentionHeaderStrip`** shows compact headline + “Next”. **`OperationalAttentionDrawerPanel`** exists but is largely **dev / review** today.

**Activity**

- **`workflow_events`** power **`/api/admin/activity`** and batch “latest event per opportunity” loaders used by **activity signals** (`web/lib/admin/activitySignals.ts`). Rules live in **`metadata.activity_signal_rules`**.
- Resolver supports **`optionalSignals.activityStale`** for `auxiliary.activity_stale`, but **entity attachment** and **`QueueService.enrichOpportunityRows`** often pass **`optionalSignals: null`** — activity is **enriched on some queue API paths** but **not fully unified** into drawer resolver attachment today. V1 suggestions should **use activity when available** on the **authoritative** path (entity GET) once Card 3 loads it consistently (design detail in integration plan).

**Workflows & events**

- Workflows: **`workflows`** table + **`executeWorkflowRun`** + **`emitEvent`** / `workflow_events` — see `docs/archive/2026-06-superseded-system/actions-and-workflows.md`.

**Gaps addressed by this sprint**

- No single **versioned suggestion DTO** attached to entity GET.
- No **template-based draft messages** as structured optional content.
- Drawer lacks a **first-class “suggested next step / why / draft”** block aligned with product language.

---

## 6. Agent V1 reusable pattern

All agents (**Agent 1**, **Agent 2 — Task Assist**, **Agent 3 — Workflow Assist**, and future agents) follow the **same four-layer architecture**:

1. **Input layer** — Authoritative server state (entity row, resolver outputs, signals, config, workflow rows/run history as applicable). **Never** trust queue preview rows as sole input for authoritative outputs.
2. **Evaluation layer** — **Deterministic rules first**; optional light AI later behind explicit gates (not in V1 for Agent 1 core path).
3. **Output layer** — **Versioned structured** types (`version`, `agent_key`, stable keys, `generated_at_iso`).
4. **Surface layer** — UI renders payloads; **does not** own truth or side effects.

Implementation is **modules + types**, not a generic agent runtime.

### 6.1 Per-agent ownership (do not merge)

The architecture is shared; **product contracts are not**. Each agent owns its own:

| Dimension | Agent 1 (Needs Attention Suggestion) | Agent 2 (Task Assist V1) | Agent 3 (Workflow Assist) |
|-----------|--------------------------------------|---------------------------|---------------------------|
| **Intent scope** | Explain resolver-backed attention; next step + optional draft copy | One-off user-directed **opportunity** drafts + **send now** (SMS/email); **no** in-app channel, **no** scheduled send, **no** follow-up apply in V1 | Reusable workflow definitions; drafts; maintenance; diagnostics |
| **Proposal contract** | `AttentionSuggestionV1` | **`TaskAssistSuggestionV1`** — see **`task_assist_v1.md` §3** | `WorkflowAssistSuggestionV1` (template — §9) |
| **Safety rules** | No send/write; derived suggestion; queue non-SOT | No auto-send; **human approval** + server re-validation; no workflow graph keys on bodies; **no** legacy `messages` / `messages_outbox` in Task Assist code | No auto-apply; drafts **disabled by default**; **human approval before save/apply**; no substitution for `executeWorkflowRun` authorization |
| **Approval flow** | N/A in V1 (display/copy only); future apply is explicit | **Apply** POST with operator `final_body` / `final_subject`; **`assertCommunicationsSendAllowed`** then **`executeCommunicationsSend`** | Confirm before persisting workflow CRUD |
| **UI surface** | Drawer header / operational strip; optional queue preview | **Opportunity drawer** — **`TaskAssistV1OpportunityPanel`** when **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** | **Distinct** surfaces (e.g. `/adminV2/workflows` family, proposal review) |
| **Execution / apply path** | None in V1 | **`POST /api/admin/ai/task-assist/apply`** → **`executeCommunicationsSend`** (same as **`POST /api/admin/communications/send`**) | Existing admin workflow APIs / future proposal RPC — **not** Task Assist paths |

---

## 7. Agent 1 — Needs Attention Suggestion Agent

**Purpose:** Turn operational attention into **actionable, structured** guidance: **next action**, **reasoning** (traceable to reason codes), optional **draft content** — without changing how `needs_attention` is computed.

**Inputs (authoritative path)**

- `OpportunityAttentionResult` from `resolveOpportunityAttention` (same inputs as `_operational_attention`).
- Opportunity identity + fields from **entity GET** context (not queue snapshot alone).
- **`ActivitySignalResult`** when available on that path (supporting context only in V1).
- Config / org scope as needed for future overrides; V1 defaults are platform mapping + templates.

**Behavior**

- **`buildNeedsAttentionSuggestion`** (name per design): returns **`AttentionSuggestionV1 | null`** when `!needs_attention` or no primary reason.
- **Never** mutates rows, **never** calls comms or workflows directly, **never** writes DB as a side effect of generation.

**Locked V1 decisions**

| Decision | Choice |
|----------|--------|
| Persistence | **Derived-only** — compute on entity GET (or shared helper invoked from it). **No suggestion table.** |
| DB writes | **No** agent-generated writes. |
| Autonomy | **No** autonomous actions. |
| Queue rows | **Not** source of truth; optional **compact preview** (`_attention_suggestion_preview` + CRM compact slots) derived from the **same** `buildNeedsAttentionSuggestion` helper used on entity GET (activity often `null` on lists). |
| Attachment | **`_attention_suggestion`** on **authoritative opportunity entity GET**, adjacent to **`_operational_attention`**. |
| Primary UI | **Drawer header chrome** — headline, suggested next step, why, draft affordance; overview body holds **collapsible operational detail** only. |

---

## 8. Agent 2 — Task Assist V1 (shipped narrow V1)

**Purpose:** Support **one-time, user-directed** operator work on **opportunities**: **draft SMS/email** and **send now** after explicit approval — **not** a reusable automation definition.

**Shipped routes:** **`POST /api/admin/ai/task-assist/propose`**, **`POST /api/admin/ai/task-assist/apply`**. **UI flag:** **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**. **Org policy feature:** **`task_assist_draft`** (with enrichment portal / stub / OpenAI gates as implemented). **Send path:** **`executeCommunicationsSend`** only — **no** Task Assist code against legacy **`public.messages`** / **`messages_outbox`**.

**Explicit non-goals (V1):** authoring **reusable workflow configuration** (`workflows` / conditions / actions graphs), NL→workflow, scheduled send, durable proposals, reminders/follow-up apply, bulk send, **`jobs`** drawer — see **`task_assist_v1.md`** limitations + follow-ups.

**Canonical spec:** **`docs/sprints/archive/05_2026/task_assist_v1.md`** — contract §3, validation §4, apply §5, UI §6, safety §7.

### 8.1 `TaskAssistSuggestionV1`

The strict contract lives in **`task_assist_v1.md` §3**. The sketch block was removed in favor of that single source of truth.

### 8.2 Apply path (implementation)

**`POST /api/admin/ai/task-assist/apply`** validates the merged proposal + operator fields, enforces **`assertCommunicationsSendAllowed`**, then calls **`executeCommunicationsSend`** (shared with **`POST /api/admin/communications/send`**). See **`docs/product/communications.md`** (Task Assist subsection).

### 8.3 Risks / anti-drift (Task Assist)

| Risk | Mitigation |
|------|------------|
| Conflation with Workflow Assist | Separate **`agent_key`**, separate UI lanes, no `proposed_workflow` on this contract. |
| “Assist” sends mail | **Approval gate** in product copy and routes; no auto-apply. |
| Workflow creep | Reject `action_type` / workflow graph fields here; redirect design to Agent 3. |

---

## 9. Agent 3 — Workflow Assist (template only)

**Purpose (future):** Help operators **author**, **maintain**, and **diagnose** **reusable workflow configuration** (draft generation, explainability, run/noise signals, structured proposals aligned to admin workflow APIs).

**Explicit non-goals for Workflow Assist:** one-off **transactional** send/schedule as the primary contract (that is **Task Assist**); autonomous **`executeWorkflowRun`** from assist; auto-enable workflows.

**This sprint:** **Documentation only** (Card 6) — finalized template below. **No** runtime, **no** NL→workflow, **no** auto-create, **no** new workflow DSL. **Drafts disabled by default** in product language until an operator explicitly opens or accepts a draft workflow for review.

### 9.1 Finalized `WorkflowAssistSuggestionV1` (contract)

Structured JSON only; same pattern as Agent 1 (`version`, `agent_key`, deterministic `suggestion_id` when derived, `generated_at_iso`).

```ts
type WorkflowAssistSuggestionV1 = {
  version: 1;
  agent_key: "workflow_assist";
  /** Deterministic when derived; future durable rows may use DB ids. */
  suggestion_id: string;
  mode: "template_suggestion" | "activity_summary" | "workflow_config_draft";
  target: {
    entity_type?: string | null;
    workflow_id?: string | null;
  };
  intent: {
    /** Optional raw operator phrase (future); never required for V1 server paths. */
    raw_text?: string | null;
    /** Stable key from a small catalog, e.g. `notify_on_status_change`, `remind_after_delay`. */
    normalized_key: string;
  };
  /** Draft only — mirrors rows/columns the admin workflow APIs already accept. */
  proposed_workflow?: {
    name: string;
    description?: string | null;
    event_type: string;
    entity_type: string;
    conditions: Array<{
      target_entity?: string | null;
      field_path: string;
      operator: string;
      value: unknown;
    }>;
    actions: Array<{
      action_type: string;
      target_entity?: string | null;
      payload: Record<string, unknown>;
    }>;
  } | null;
  /** Read-only digest of existing runs/events — never invents run ids. */
  activity_summary?: {
    workflow_id: string;
    runs: Array<{
      run_id: string;
      status: string;
      started_at: string | null;
      finished_at?: string | null;
    }>;
    notes?: string[];
  } | null;
  reasoning: {
    summary: string;
    warnings: string[];
  };
  generated_at_iso: string;
};
```

### 9.2 Intent → workflow config draft (pattern)

| Step | Responsibility |
|------|------------------|
| 1 | **Normalize intent** to `intent.normalized_key` (catalog-owned keys; no freeform execution). |
| 2 | **Map** key → **template** of `proposed_workflow` (name, `event_type`, `entity_type`, empty or stub `conditions` / `actions` arrays shaped like persisted workflow JSON). |
| 3 | **Validate shape** against the same constraints as **`POST /api/admin/workflows`** (required fields: `name`, `event_type`, `entity_type`). |
| 4 | **Surface** draft in UI as read-only JSON or form preview; **no** `POST` until an explicit future “Apply” action. |

Intent catalog and mapping tables live in **docs + future code**, not in workflow rows.

### 9.3 Activity summary (pattern)

- **Sources (read-only):** `workflow_runs`, `workflow_action_runs` (if needed), `workflow_events`, optional **`GET`** admin routes such as workflow run lists already used by the admin UI.
- **Output:** `activity_summary` with **only** ids and timestamps returned from queries — **no** synthetic events.
- **Mode:** `mode: "activity_summary"` when the assist output is **monitoring-only** (no `proposed_workflow`).

### 9.4 Proposed workflow structure (mapping to existing system)

`proposed_workflow` fields align with the existing **`workflows`** row model and admin create payload (`web/app/api/admin/workflows/route.ts`): `name`, `description`, `event_type`, `entity_type`, plus future JSON for conditions/actions that **`executeWorkflowRun`** already consumes — **express as structured arrays**, not a new DSL string.

### 9.5 Validation boundaries (must hold)

| Boundary | Rule |
|----------|------|
| Truth | **`workflows`** table + **`executeWorkflowRun`** + **`emitEvent`** remain authoritative; drafts are **non-authoritative**. |
| Scope | Org-scoped; respect existing **admin auth** and RLS patterns on workflow routes. |
| Mutations | **No** inserts/updates/deletes from assist in V1/V1-template phase. |
| NL | **No** natural-language interpreter in runtime for this sprint. |
| Queue / drawer | Assist output is **display / draft only**; never queue SOT. |

### 9.6 Future apply path (design — not built)

Mirror proven **agent proposal / audit** style (see `agent_v1_record_layout` patterns in repo docs):

1. Server receives **structured** `WorkflowAssistSuggestionV1` (or a subset) as a **proposal** payload.
2. Re-check **permissions**, org, and **stale** workflow version if editing.
3. **Validate** against workflow schema (same as admin POST).
4. **Persist** proposal row (future table) → optional operator **Apply** → **transactional** insert/update workflow via existing admin API or service-role path.
5. **Audit** row for apply result; **emit** business events only through existing **`emitEvent`** / workflow machinery.

### 9.7 Risks / anti-drift (Workflow Assist)

| Risk | Mitigation |
|------|------------|
| Parallel workflow language | Only **`workflows`** + existing run/action shapes; no mini-DSL. |
| “Assist” runs workflows | Name UI **draft** / **preview**; no headless execution. |
| NL scope creep | Intent **`normalized_key`** only in V1 design; `raw_text` optional and non-executing. |
| Cross-org leakage | All future loaders **org-scoped** with same patterns as `GET /api/admin/workflows`. |

---

## 10. Data contracts / structured output shapes

### 10.1 `AttentionSuggestionV1` (Agent 1)

As specified in Step 1 design (verbatim structure — implement in TypeScript in Card 1):

- **`version: 1`**, **`agent_key: "needs_attention_suggestion"`**
- **`suggestion_id`** — **deterministic** for derived V1 (e.g. stable hash from `entity_id`, primary reason code, resolver version, date bucket) — **not** a DB surrogate key.
- **`target`** — `entity_type: "opportunities"`, `entity_id`
- **`source`** — resolver id/version, `primary_reason_code`, `reason_codes[]`, optional `activity_signal_key`
- **`next_action`** — `key` (stable snake_case), `label`, `action_family`, `confidence: "deterministic"`
- **`reasoning`** — `summary` + `factors[]` (code, label, optional severity / sla_tier)
- **`suggested_content`** — optional; `channel`, `template_key`, `body`, `variables` (substitutions for auditability)
- **`generated_at_iso`**

**Suggested messages:** **Deterministic templates only** in V1 — no model-generated body text.

### 10.2 `TaskAssistSuggestionV1` (Agent #2)

Canonical contract and execution plan: **`docs/sprints/archive/05_2026/task_assist_v1.md` §3** (supersedes the §8.1 sketch pointer in this file).

### 10.3 `WorkflowAssistSuggestionV1` (Agent 3 — doc-only this sprint)

Finalized in **§9.1** (`activity_summary` optional block added for monitoring mode). **Not** shipped on APIs unless explicitly approved later.

### 10.4 Events (future-ready, not V1 behavior)

Reserved names: `agent_suggestion_generated`, `agent_suggestion_accepted`, `agent_suggestion_dismissed`. **Do not** emit `agent_suggestion_generated` on every drawer open in V1 (noise). Emit when suggestions become **durable proposals** or operator actions exist.

### 10.5 Configurability audit (V1 — what stays hardcoded)

**Hardcoded today (code, not DB):**

- **Reason code → next action** — `web/lib/agent/needsAttentionSuggestion/suggestionActionMap.ts` (stable `next_action.key` / label strings).
- **Reason → message template** — `suggestedContentTemplates.ts` + `suggestedContentForReason` wiring in `buildNeedsAttentionSuggestion.ts`.
- **Resolver labels / severity** — `opportunityAttentionResolver` + platform catalog (orthogonal to the suggestion agent but feed its inputs).

**Configurable today:** `resolveOpportunityAttention` thresholds and policies via org **metadata** (`opportunity_attention_rules` / resolved config); activity signal rules in metadata — these shape **whether** attention fires, not the suggestion copy map.

**Proposed path (no heavy config UI yet):**

1. **Platform defaults** — keep current maps/templates as the shipped default module.
2. **Vertical presets** — versioned JSON or TS presets (e.g. childcare tone) selected by `industry` / org template key.
3. **Org / work-unit overrides** — small merge layer: optional metadata keys pointing to **allowlisted** preset ids or sparse overrides for labels only (never new arbitrary reason codes without resolver support).
4. **AI enrichment policy flags** — org-level booleans + model allowlist (future); when off, only deterministic `AttentionSuggestionV1` is returned.

---

## 11. Integration plan

1. **Card 1** — Add types (+ tests for shape / invariants).
2. **Card 2** — Implement `buildNeedsAttentionSuggestion` + reason → `next_action` map + template registry for `suggested_content` (pure functions).
3. **Card 3** — In **`web/lib/admin/opportunityEntityRecord.ts`** (or the single choke point used for opportunity entity GET), after **`computeOperationalAttentionAttachment`**:
   - Compute **`_attention_suggestion`** from the same opportunity row + attention result + **activity signal when loaded** on that path.
   - Ensure **permissions mirror entity GET** (read-only attachment).
   - **Open question** (from design): include on **`drawer_visible` only**, **`full` only**, or both — **decide in Card 0 / 3** based on header latency and payload size; default recommendation: **at least `full`**; add `drawer_visible` only if fast shell needs suggestion without second round-trip.
4. **Queue list (work-unit):** When opportunity attention resolution runs in `QueueService.enrichOpportunityRows`, attach compact **`_attention_suggestion_preview`** (`next_label`, `why_line`) from the **same** `buildNeedsAttentionSuggestion` helper (`activity: null` on list paths). **Never** use queue preview as membership or authoritative suggestion.
5. **No** migrations, **no** suggestion tables in V1.

---

## 12. UI surface plan

- **Primary:** Opportunity **drawer header** — **`OperationalAttentionHeaderStrip`** (`variant="chrome"`) is the **main** surface: needs-attention headline, **Suggested next step**, **Why**, optional **Draft message** behind expand + copy; subtle **“Recommended by Alloy”** framing. Avoid duplicating the same block in the overview body.
- **Secondary:** Overview tab — **`OperationalAttentionDrawerSection`** as a **collapsed-by-default** `<details>` (“Operational detail”) for factors, timing, and priority breakdown; omit redundant primary/next when the header already shows the structured suggestion.
- **Queue (work-unit):** CRM compact left column shows a **compact** preview (chip + next + one-line why) from `semanticCrmCompact.attentionSuggestionPreview`; **drawer + entity GET** remain authoritative if copy diverges (e.g. activity only on GET).
- **Copy tone:** Operational — **Suggested next step**, **Why**, **Draft message**; no “AI magic” language; drafts labeled not sent.

---

## 13. Testing strategy

- **Unit:** Reason-code → `next_action` mapping; null cases; template rendering + `variables` substitution; deterministic `suggestion_id` stability for fixed inputs.
- **Integration / payload:** Entity GET includes **`_attention_suggestion`** when `_operational_attention` has a primary reason; absent when not needed.
- **Regression:** Queue enrichment paths remain **preview-only**; `_attention_suggestion_preview` is non-authoritative and optional.
- **UI (Vitest / static render):** Header strip with and without suggestion; drawer section does not duplicate header primary strings when suggestion is present; CRM compact renders queue preview slot when preview fields exist.
- **Manual:** Drawer flows for multi-reason and no-attention cases; verify no send / no write from UI affordances.

---

## 14. Risks / anti-drift rules

| Risk | Mitigation |
|------|------------|
| Suggestions diverge from resolver | Single builder input: **`OpportunityAttentionResult`**; factors must mirror `reasons[]`. |
| Queue row becomes implicit SOT | **Forbidden** in V1 scope; document explicitly; code review on any queue touch. |
| Queue / GET copy drift | Queue preview calls the **same** builder but usually passes **`activity: null`**; entity GET may attach activity context — operators should **open the drawer** for the authoritative bundle. |
| “AI” oversell | UI labels and docs: **suggested / draft / deterministic** language. |
| Audit noise | **No** per-view `agent_suggestion_generated` event in V1. |
| Vertical leakage | Default strings and templates **neutral**; pilots use presets later. |
| Scope creep (Task Assist / Workflow Assist) | **Card 6 = docs only** for both agents; no API surface without explicit approval; **do not** merge transactional and workflow-config agents. |
| Performance on entity GET | Batch / reuse fetches; resolve activity signal once per GET if needed; gate `drawer_visible` inclusion per open question. |

---

## 15. Card breakdown

| Card | Name | Scope |
|------|------|--------|
| **0** | **Audit validation** | Walk through `ai_agents_v1_step0_audit.md` with product/engineering; confirm locked decisions (derived-only, no table, no writes, drawer header primary, queue preview non-authoritative, deterministic messages, **Agent 2 + Agent 3 doc-only templates**). Resolve open questions (e.g. `drawer_visible` vs `full` for `_attention_suggestion`). |
| **1** | **Suggestion data model** | TypeScript types for `AttentionSuggestionV1` (+ tests for shape and invariants). |
| **2** | **Suggestion logic engine** | `buildNeedsAttentionSuggestion`, action map, template keys; pure deterministic logic. |
| **3** | **Needs attention integration** | Attach **`_attention_suggestion`** on authoritative opportunity **entity GET** next to **`_operational_attention`**; wire activity input when available on that path. |
| **4** | **UI rendering (drawer)** | Production drawer: **header chrome** as primary suggestion surface; collapsible operational detail in overview; Admin V2 patterns. |
| **5** | **Suggested message generation** | Deterministic **`suggested_content`** only; safe channels/families; no send path. |
| **6** | **Task Assist + Workflow Assist — docs** | **Task Assist:** Step 1 + cards in **`docs/sprints/archive/05_2026/task_assist_v1.md`** (implementation follows that file after Card 0). **Workflow Assist:** template docs only (`WorkflowAssistSuggestionV1`, …) — **no runtime** unless a separate card pack is opened. |
| **7** | **Testing + validation** | Run targeted tests, typecheck, doc tweaks if behavior is adjusted; sign-off checklist. |

---

## 16. Card 7 — Testing & validation record (sprint hardening)

**Automated (targeted):** Vitest for `web/lib/agent/needsAttentionSuggestion/**`, `web/tests/admin/drawer/operationalAttentionSuggestionUi.test.tsx`, `web/tests/admin/operationalAttentionEntityAttachment.test.ts`. ESLint on those modules (not the full `AdminEntityDrawer.tsx` baseline).

**Behavior verified (design / code review):**

| Check | Status |
|-------|--------|
| Cards 1–5: deterministic suggestion, templates, entity GET attachment | Implemented + unit tests |
| `_attention_suggestion` only from **`respondOpportunityEntityGet`** / `opportunityEntityRecord` | Yes — not from queue enrich |
| No queue SOT for suggestions | Queue paths unchanged |
| No send / apply / workflow-start controls on suggestion UI | Suggestion block has no actions; operational panel only disclosure toggles |
| No persistence table / migrations for suggestions | None added |
| Activity signal path | **`loadOpportunityActivitySignal`** shared with activity-signal route; resolver `optionalSignals` wired in attachment |
| Drawer states | Covered by static markup tests: suggestion present/absent, operational no-attention, draft present/absent |

**Legacy overview path (`useConfigDrivenOverview === false`):**

- **When:** `hasFieldDefsForOverview` is false **and** presentation config has no fielded overview sections — uncommon for hydrated opportunities but possible early or misconfigured orgs.
- **Mitigation (Card 7):** Render **`OperationalAttentionDrawerSection`** on opportunity **Overview** when `!useConfigDrivenOverview` as well (same `overviewData`), in addition to the config-driven path — **no** duplicate when `true` (guarded).
- **Documented:** If product later removes duplicate risk entirely, consolidate to a single shared fragment.

**Typecheck:** Full `tsc` may fail on unrelated `.next` generated artifacts; do not block sprint on that unless a trivial exclude fix is agreed.

---

## 17. References

- `docs/sprints/archive/05_2026/ai_agents_v1_step0_audit.md`
- `docs/sprints/archive/05_2026/task_assist_v1_step0_audit.md` (Agent #2 — Task Assist V1)
- `docs/sprints/archive/05_2026/task_assist_v1.md` (Agent #2 — Step 1 design + cards)
- `docs/sprints/archive/05_2026/ai_agents_v1_step1_design.md`
- `web/lib/opportunities/opportunityAttentionResolver.ts`
- `web/lib/admin/operationalAttentionEntityAttachment.ts`
- `web/lib/admin/opportunityEntityRecord.ts`
- `docs/archive/2026-06-superseded-system/actions-and-workflows.md`
- `docs/archive/2026-06-superseded-system/workspace-system.md`
