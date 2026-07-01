# AI agent — system contract

**Purpose:** Define the AI agent as a **typed Alloy system object** with explicit contracts for identity, permissions, chat/intent/proposal flow, intent taxonomy, validation, events/audit, and reversibility. This document **does not** prescribe runtime services, UI, database tables, or HTTP routes — only **canonical shapes and rules** that implementations must satisfy.

**Aligns with:** [Alloy System Overview](../implementation/ALLOY_SYSTEM_OVERVIEW.md) (event-first, multi-tenant, resolver-first) · [Events & Triggers](../implementation/EVENTS_AND_TRIGGERS.md) · [Entity Model](../audits/ENTITY_MODEL.md) · [UI V2 Workspace System Spec](../implementation/UI_V2_Workspace_System_Spec.md) · [Record Rendering System](./record-rendering-system-spec.md) · [Workspace / work unit / scope](./workspace-work-unit-scope-doctrine.md) · [Configuration doctrine](./configuration-doctrine.md) · [Config API contract](./config-api-contract.md) · [Foundation implementation plan](../implementation/foundation-implementation-plan.md) · [AI agent foundation](./ai-agent-foundation.md)

**Doctrine fit:** Alloy remains **workflow-safe** (no agent bypass of workflows), **resolver-first** (grounding reads consume resolver/admin APIs, not ad hoc SQL), and **config-validated** (all writes pass the same server validation as human admins). The agent is a **configuration actor** bound to **org scope** — not a global freeform assistant ([ai-agent-foundation](./ai-agent-foundation.md)).

---

## 1. Agent identity model

### 1.1 What an AI agent is in Alloy

An **AI agent** is a **registered configuration actor** that:

- Acts **only** through **validated admin config APIs** ([config-api-contract](./config-api-contract.md)).
- Is **scoped to one org** per session (and optionally to narrower **operational scope** — departments, work units — when product defines it).
- Is **not** a human `users` row, but every action is **delegated by** and **attributed to** an authenticated **human administrator** (or future service principal) per tenant policy.

It is a **first-class system actor** because governance, audit, and safety require a **stable identity** distinct from “the model” or “the chat session”: billing, abuse prevention, rate limits, and forensic traceability all attach to **AgentIdentity** + **AgentActor**, not to unstructured chat text.

### 1.2 Why org-scoped, not global

[Entity Model](../audits/ENTITY_MODEL.md) and [Alloy System Overview](../implementation/ALLOY_SYSTEM_OVERVIEW.md) require **tenant isolation**. An agent **must not** hold a global view across orgs or operate outside **`org_id`** boundaries. Cross-org assistance is **out of scope** for Phase 1.

### 1.3 Typed objects (contract shapes)

All identifiers below are **logical** — storage (tables, JSON columns) is an implementation concern.

#### `AgentActor`

Who is performing the **delegated** action for audit.

| Field | Description |
|-------|-------------|
| `actor_kind` | `human_user` \| `system` (reserved; Phase 1 expects `human_user` delegation). |
| `user_id` | Authenticated user id when `actor_kind` is `human_user`. |
| `delegation` | Optional: `on_behalf_of` policy ref when service principals exist later. |

#### `AgentIdentity`

Stable **agent registration** within an org (not the LLM session id).

| Field | Description |
|-------|-------------|
| `agent_id` | Stable id for this agent configuration (org-scoped). |
| `org_id` | Tenant boundary — **required**. |
| `display_name` | Human-readable label (e.g. “Config assistant”). |
| `capability_profile_id` | References **`AgentCapabilityProfile`**. |
| `status` | **`AgentStatus`**. |
| `created_at` / `updated_at` | ISO timestamps (contract-level). |

#### `AgentScope`

Where the agent is allowed to **read for grounding** and **propose writes**. Phase 1 default: **org-wide** config; refinements follow [workspace / scope doctrine](./workspace-work-unit-scope-doctrine.md).

| Field | Description |
|-------|-------------|
| `org_id` | **Required** root scope. |
| `department_ids` | Optional allowlist; empty = all departments in org. |
| `work_unit_ids` | Optional allowlist; empty = all work units permitted by policy. |
| `record_entity_types` | Optional allowlist for resolver grounding (e.g. `job`, `schedule`). |

#### `AgentCapabilityProfile`

Machine-readable **allowlists** aligned with [ai-agent-foundation](./ai-agent-foundation.md) §B–C.

| Field | Description |
|-------|-------------|
| `profile_id` | Stable id. |
| `allowed_intent_types` | Subset of **§4** intent type strings; Phase 1 should default to **config-safe** intents only. |
| `read_classes` | Enum set: `config`, `queue_definitions`, `resolver_payloads`, `workspace_metadata` (see §2). |
| `write_classes` | Phase 1: **`config_api_only`**. |
| `max_ops_per_proposal` | Policy limit for blast radius. |
| `version` | Profile schema version for forward compatibility. |

#### `AgentStatus`

| Value | Meaning |
|-------|---------|
| `active` | May participate in chat → intent → proposal flows. |
| `paused` | No new proposals; existing audit retained. |
| `revoked` | Disallowed; sessions must not issue writes. |

---

## 2. Phase 1 permissions and boundaries

### 2.1 Allowed reads (explicit)

| Read class | Definition | Ties to doctrine |
|------------|------------|-------------------|
| **Config** | Effective admin **GET** responses for field defs, sections, statuses, departments, work units, record layouts, record actions, document field defs — per [config-api-contract](./config-api-contract.md) §1. | [Configuration doctrine](./configuration-doctrine.md) |
| **Queue definitions** | `work_units.queue_definition` as returned by admin APIs (and any future dedicated read). | [Workspace doctrine](./workspace-work-unit-scope-doctrine.md), [foundation plan](../implementation/foundation-implementation-plan.md) (`queue_definition` v1). |
| **Resolver payloads / record summaries for grounding** | Read-only **`GET /api/admin/entity/[type]/[id]`** (and related) to inspect **truth-shaped** payloads — **not** to mutate. | [Record Rendering System](./record-rendering-system-spec.md) |
| **Workspace context metadata** | Department/work unit metadata used for visual context and lane semantics (registered keys only). | [UI V2 Workspace System Spec](../implementation/UI_V2_Workspace_System_Spec.md), visual context implementation docs |

**Rule:** Grounding uses the **same APIs** a privileged admin user may call; the agent does not invent parallel read paths.

### 2.2 Allowed writes (explicit)

| Write class | Definition |
|-------------|------------|
| **Config APIs only** | **POST/PATCH/DELETE** (or future **PUT** unified config routes) under `/api/admin/...` as documented in [config-api-contract](./config-api-contract.md) §2–3, with **validated** bodies only. |

### 2.3 Forbidden (explicit lock)

| Category | Rule |
|----------|------|
| **Direct DB writes** | No Supabase client bypass, no migrations from agent, no raw SQL. |
| **Operational entity writes** | No PATCH to jobs, schedules, invoices, customers, etc., via agent flows — operational truth mutates through **product workflows** and user actions ([Alloy System Overview](../implementation/ALLOY_SYSTEM_OVERVIEW.md)). |
| **Workflow bypass** | No shortcut past events/workflows for side effects ([Events & Triggers](../implementation/EVENTS_AND_TRIGGERS.md)). |
| **Ledger mutations** | Ledger-native integrity is platform-owned; agent does not post payments or adjust ledger ([Alloy System Overview](../implementation/ALLOY_SYSTEM_OVERVIEW.md)). |
| **Raw SQL** | Forbidden. |
| **Unvalidated JSON writes** | Any `jsonb` config (`queue_definition`, `config_json`, `metadata`) must pass **versioned schema validation** server-side ([config-model-spec](./config-model-spec.md) §5). |
| **Cross-org reads/writes** | All operations require **`org_id`** alignment with the delegated user’s admin context. |

---

## 3. Chat contract

### 3.1 Chat is intent capture, not an action engine

The **chat surface** collects **natural language**, clarifies **slots**, and emits **typed intents**. It does **not** execute business workflows, mutate operational entities, or call non-config APIs. Execution is **only** by **validated config API plans** derived from approved proposals ([ai-agent-foundation](./ai-agent-foundation.md) §D).

This aligns with [UI V2 Workspace System Spec](../implementation/UI_V2_Workspace_System_Spec.md): **AI configures meaning, not pixels** — chat feeds **configuration structure**, not arbitrary imperative scripts.

### 3.2 Typed objects

#### `AgentChatMessage`

| Field | Description |
|-------|-------------|
| `message_id` | Unique id. |
| `thread_id` | Conversation grouping. |
| `role` | `user` \| `assistant` \| `system`. |
| `content` | Text or structured content ref (implementation-agnostic). |
| `occurred_at` | Timestamp. |

#### `AgentGroundingContext`

Snapshot references assembled from **allowed reads** (§2.1) — not necessarily full payloads inline.

| Field | Description |
|-------|-------------|
| `context_id` | Id for this grounding bundle. |
| `org_id` | **Required**. |
| `fetched_at` | Timestamp. |
| `references` | List of `{ resource_kind, route, query, etag_or_version? }` or opaque **content hashes** for deduplication. |
| `resolver_refs` | Optional: `{ entity_type, entity_id, surface? }` for record grounding. |
| `workspace_refs` | Optional: `{ department_id?, work_unit_id? }` for lane/context grounding. |

#### `AgentIntent`

| Field | Description |
|-------|-------------|
| `intent_id` | Unique id. |
| `intent_type` | One of **§4** taxonomy strings. |
| `intent_version` | Schema version for breaking changes. |
| `org_id` | **Required**. |
| `slots` | Typed map: targets, labels, ordering keys — **intent-specific** (§4). |
| `grounding_context_id` | Links to **`AgentGroundingContext`**. |
| `actor` | **`AgentActor`**. |
| `agent_identity` | **`AgentIdentity`** ref (`agent_id`). |

#### `AgentConfigProposal`

An immutable **candidate** description of config changes **before** apply.

| Field | Description |
|-------|-------------|
| `proposal_id` | **Stable id** — used for audit, idempotency, and rollback correlation (§7). |
| `intent_id` | Source intent. |
| `org_id` | **Required**. |
| `diff_summary` | Human-readable + machine **semantic diff** (resource id, field path, before/after hashes). |
| `planned_operations` | Ordered list of **logical** operations (map 1:1 to HTTP in **`AgentExecutionPlan`**). |
| `validation_preflight` | Result refs: passed/failed intent + policy checks (§5). |
| `status` | `draft` \| `validated` \| `rejected` \| `superseded`. |

#### `AgentExecutionPlan`

**Not** a workflow execution plan — a **config API call plan** only.

| Field | Description |
|-------|-------------|
| `plan_id` | Unique id. |
| `proposal_id` | Must match validated proposal. |
| `steps` | Ordered `{ method, path_template, body_shape_ref, expected_schema_ref, concurrency_group? }`. |
| `idempotency_keys` | Optional per-step keys where APIs support them. |

#### `AgentExecutionResult`

| Field | Description |
|-------|-------------|
| `result_id` | Unique id. |
| `plan_id` | Link to plan. |
| `per_step` | `{ step_index, http_status, applied_resource_id?, error_code?, response_hash? }`. |
| `terminal_status` | `success` \| `partial_failure` \| `failed`. |
| `applied_snapshot` | **§6** — what the **system** committed (may differ from proposal if server normalized). |

### 3.3 Lifecycle

```
UserMessage
  → (optional) Grounding fetches → AgentGroundingContext
  → AgentIntent (typed)
  → AgentConfigProposal
  → Validation (§5)
  → AgentExecutionPlan
  → Config API execution (human-approved or policy-approved)
  → AgentExecutionResult
```

**Invariant:** No HTTP config write occurs **before** intent + proposal + validation stages complete successfully for that write. Chat never “short-circuits” to the database.

---

## 4. Intent taxonomy (Phase 1 — config-safe only)

Each intent type lists **purpose**, **required slots**, **allowed target surfaces**, **validation**, and **API mapping**. Surfaces follow [config-surfaces-spec](./config-surfaces-spec.md). Until a write route exists, mapping references **target** contract rows in [config-api-contract](./config-api-contract.md) §3.

| Intent type | Purpose |
|-------------|---------|
| `create_exception_type` | Add or enable a **config-level** exception lane or **hook** that references **code-registered** exception identifiers (ordering, labels, enablement) — not new predicate semantics ([ai-agent-foundation](./ai-agent-foundation.md) §B.3). |
| `create_queue_definition` | Author an initial **`queue_definition`** on a work unit (versioned JSON). |
| `update_queue_definition` | Change **`queue_definition`** with optimistic concurrency. |
| `update_record_layout` | Change **`record_layouts.config_json`** (overview order, bands, blocks) within registered keys. |
| `update_action_surface_visibility` | Toggle or restrict **where** a configured action appears (`record_actions` placement / active flags) without inventing `event_key`. |
| `update_relationship_group_visibility` | Show/hide or reorder **relationship group** presentation for a record surface via **layout/overview config** — not changing resolver **semantics** ([Record Rendering System](./record-rendering-system-spec.md) §“Relationship groups”). |
| `update_field_visibility` | Update **field_definitions** / visibility flags (drawer, table, public booking, etc.). |
| `rename_configured_label` | Rename labels on **config-owned** strings (work unit, field label, status display, action label) without changing semantic keys. |
| `reorder_configured_sections` | Reorder field sections or overview sections per **allowed** section keys. |

### 4.1 Per-intent contract tables

#### `create_exception_type`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `org_id`, `work_unit_id` (exception-capable unit), `exception_key` (must exist in **code-registered** catalog), optional `display_order`, `label_override`. |
| **Allowed surfaces** | Exception work unit / Needs Attention lane configuration ([workspace doctrine](./workspace-work-unit-scope-doctrine.md)). |
| **Validation** | `exception_key` ∈ allowed catalog; org matches work unit; JSON schema for lane hook if present. |
| **Maps to** | `PATCH /api/admin/work-units/[id]` metadata / `queue_definition` hooks, or future dedicated lane config — see [config-api-contract](./config-api-contract.md) §2–3; predicates remain code until DSL ([deferred-decisions](./deferred-decisions.md)). |

#### `create_queue_definition`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `org_id`, `work_unit_id`, `queue_definition` (with **`version`**). |
| **Allowed surfaces** | Work unit execution / workspace queue ([UI V2 Workspace](../implementation/UI_V2_Workspace_System_Spec.md)). |
| **Validation** | `queue_definition` v1 schema + org integrity ([foundation plan](../implementation/foundation-implementation-plan.md)). |
| **Maps to** | `PATCH` work unit; target **`PUT /api/admin/config/work-unit-queue`** ([config-api-contract](./config-api-contract.md) §3). |

#### `update_queue_definition`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `work_unit_id`, new `queue_definition`, **`expected_version`**. |
| **Allowed surfaces** | Same as create. |
| **Validation** | Optimistic concurrency; schema validation. |
| **Maps to** | Same as `create_queue_definition`. |

#### `update_record_layout`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `entity_type`, layout `key`, `config_json` (with **`version`**). |
| **Allowed surfaces** | Record drawer / overview / full record chrome ([Record Rendering System](./record-rendering-system-spec.md)). |
| **Validation** | Keys ∈ registered overview/section registry ([config-model-spec](./config-model-spec.md) §3–4). |
| **Maps to** | **`PUT /api/admin/config/record-layout`** or successor ([config-api-contract](./config-api-contract.md) §3). |

#### `update_action_surface_visibility`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `entity_type`, `action_key` or row id, `placement`, `is_active`. |
| **Allowed surfaces** | Queue / drawer / full record per [workspace doctrine](./workspace-work-unit-scope-doctrine.md). |
| **Validation** | `event_key` unchanged and known; placement enum valid. |
| **Maps to** | `record_actions` write route when available ([config-api-contract](./config-api-contract.md) §2 gap). |

#### `update_relationship_group_visibility`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `entity_type`, target **layout** band identifiers, `group_key` (registered), `visible` / order. |
| **Allowed surfaces** | Overview / structured summary ([overview-layout-doctrine](./overview-layout-doctrine.md)). |
| **Validation** | Group keys registered for entity; no invented groups. |
| **Maps to** | `record_layouts.config_json` paths that control group visibility/order; resolver still supplies group **data** ([Record Rendering System](./record-rendering-system-spec.md)). |

#### `update_field_visibility`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `field_definition_id` or stable key, visibility flags / section placement. |
| **Allowed surfaces** | Admin field registry surfaces ([config-surfaces-spec](./config-surfaces-spec.md)). |
| **Validation** | Org ownership; dependency checks for destructive changes. |
| **Maps to** | `PATCH /api/admin/field-definitions/[id]`, field-sections routes ([config-api-contract](./config-api-contract.md) §1–2). |

#### `rename_configured_label`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `target_kind` (`work_unit` \| `field` \| `status` \| `action` \| …), `target_id`, `new_label`. |
| **Allowed surfaces** | Labels only — **not** semantic keys. |
| **Validation** | Length/locale policy; no key renames unless separate intent. |
| **Maps to** | Respective admin `PATCH` routes for that resource. |

#### `reorder_configured_sections`

| Aspect | Specification |
|--------|----------------|
| **Required slots** | `entity_type`, `section_scope` (`field_sections` \| `overview_sections`), ordered keys. |
| **Allowed surfaces** | Field sections and/or record overview config. |
| **Validation** | Keys ⊆ allowed registry; no duplicates. |
| **Maps to** | Field-sections bulk update +/or `record_layouts` section order ([config-api-contract](./config-api-contract.md)). |

---

## 5. Validation model (three layers)

Aligned with **resolver-first** and **config-validated** architecture: the server remains authoritative ([ai-agent-foundation](./ai-agent-foundation.md) §E).

### 5.1 Intent validation

| Check | Description |
|-------|-------------|
| **Schema** | `AgentIntent` matches `intent_version` schema; required slots present; types correct. |
| **Taxonomy** | `intent_type` ∈ **`AgentCapabilityProfile.allowed_intent_types`**. |
| **Scope** | Targets (work unit, field, layout key) ∈ **`AgentScope`**. |
| **Catalog** | Keys (`exception_key`, `event_key`, section keys) ∈ **code-registered** catalogs. |

### 5.2 Policy validation

| Check | Description |
|-------|-------------|
| **Org boundary** | All ids resolve within `org_id`. |
| **Rate / blast** | Ops count, max touched resources, cooldowns. |
| **Global template protection** | Mutations to global `record_layouts` / `record_actions` may be denied for tenant agents ([ai-agent-foundation](./ai-agent-foundation.md) §C.3). |
| **Approval** | Optional human approval is **policy**, not required in Phase 1 contract — but if enabled, proposal must not execute until approved. |

### 5.3 Config / API validation

| Check | Description |
|-------|-------------|
| **Shared validators** | Same Zod/JSON Schema as admin UI routes ([config-api-contract](./config-api-contract.md)). |
| **Version** | `queue_definition.version`, `config_json.version` — **reject stale**. |
| **HTTP semantics** | Methods/paths match existing routes; 4xx/5xx surfaced in **`AgentExecutionResult`**. |

**Ordering:** Intent → Policy → API validation **before** persist. Failed layers **do not** emit “applied” audit (§6).

---

## 6. Event + audit model

### 6.1 Separation from business workflow events

[Events & Triggers](../implementation/EVENTS_AND_TRIGGERS.md) define **immutable business facts** (`<entity>_<past_tense_action>`). AI agent lifecycle events (**intent**, **proposal**, **apply**) are **governance and observability** facts. They:

- **Must not** impersonate core business events (e.g. `payment_posted`).
- **Should** follow the same **immutability** and **org scoping** spirit.
- May be stored in **`workflow_events`** with distinct `entity_type` values (e.g. `config_proposal`, `ai_agent_session`) **or** in a dedicated **audit stream** — implementation chooses, but **payload contracts** below are canonical.

### 6.2 Recommended canonical event types (agent governance)

Snake_case, past-tense or state verbs where appropriate for **system** facts:

| Event type | When emitted |
|------------|----------------|
| `agent_intent_received` | Typed `AgentIntent` accepted from NL pipeline (post-schema). |
| `agent_proposal_created` | `AgentConfigProposal` persisted in `validated` or `draft` per product rules. |
| `agent_proposal_rejected` | Policy or validation failure **or** explicit human reject. |
| `agent_config_change_applied` | Successful config API writes for a proposal (terminal success per plan). |

Optional:

| Event type | When emitted |
|------------|----------------|
| `agent_execution_partial_failure` | Some steps succeeded; **`AgentExecutionResult.terminal_status` = `partial_failure`**. |

Each event payload **should** include: `org_id`, `agent_id`, `proposal_id?`, `intent_id?`, `user_id` (delegated human), `correlation_id`, and **hashed** or redacted references to resources touched.

### 6.3 Audit objects: proposed vs applied

| Object | Captures |
|--------|----------|
| **`AgentProposalAudit`** | **What the agent proposed** — semantic diff, `planned_operations`, validation outcomes **before** execution. Immutable once stored for that `proposal_id`. |
| **`AgentAppliedAudit`** | **What the system actually applied** — HTTP responses, persisted resource ids, server-normalized fields, final versions. Tied to `proposal_id` + `plan_id` + `result_id`. |

**Invariant:** **`AgentProposalAudit`** and **`AgentAppliedAudit`** may differ when the server legitimately normalizes input; discrepancy must be explainable from **`AgentExecutionResult.per_step`**.

---

## 7. Reversibility + safety

### 7.1 Proposal IDs

- **`proposal_id`** is the **correlation key** for intent → proposal → plan → result → audit.
- Idempotent replays of execution should dedupe on **`proposal_id`** + step idempotency keys ([ai-agent-foundation](./ai-agent-foundation.md) §D.3).

### 7.2 Version-aware writes

- Every mutating step carries **`expected_version`** or ETag semantics for JSON blobs ([config-model-spec](./config-model-spec.md) §5).
- Stale versions **fail closed** — no merge in the agent layer.

### 7.3 Rollback / restore expectations

- **Forward fix:** Re-apply prior known-good config via **new** validated writes (preferred).
- **History:** Optional append-only config history enables **restore** to a prior snapshot ([ai-agent-foundation](./ai-agent-foundation.md) §E.3).
- **Break-glass:** Platform admin / DB procedures are **outside** agent scope.

### 7.4 Human approval (future policy)

- Phase 1 contract **allows** proposals to execute without a separate approval step if product policy permits.
- **Optional human approval** is a **policy flag** on **`AgentCapabilityProfile`** or org settings — not required for this contract to be complete.

---

## 8. Architectural alignment summary

| Alloy principle | How this contract honors it |
|-----------------|-----------------------------|
| **Event-first** | Business workflows remain driven by canonical business events; agent emits **governance events** (§6) that do not replace domain events. |
| **Workflow-safe** | No agent path bypasses workflows for operational side effects (§2.3). |
| **Resolver-first** | Grounding uses resolver/admin entity GETs; presentation changes go through config ([Record Rendering System](./record-rendering-system-spec.md)). |
| **Config-validated** | All writes funnel through admin APIs + shared validators ([config-api-contract](./config-api-contract.md)). |
| **Multi-tenant** | **Org-scoped** identity, scope, and audit (§1, §2). |

---

## 9. What this doc enables next

**Concrete first slice (v0):** [AI agent implementation slice v0](../implementation/ai-agent-implementation-slice-v0.md) — single intent `update_queue_definition`, request envelopes, PATCH + shared `queue_definition` v1 validation, minimal audit — **no** full agent system.

The next implementation phase can proceed **without** contradicting doctrine:

1. **Persistence** — Store **`AgentIdentity`**, **`AgentCapabilityProfile`**, and optional **`AgentChatMessage`** / thread metadata with strict RLS by `org_id`.
2. **BFF or route handlers** — Orchestrate grounding GETs, intent parsing, proposal persistence, and **sequential** config writes with shared validation modules.
3. **Audit pipeline** — Emit **`agent_*`** events and persist **`AgentProposalAudit`** / **`AgentAppliedAudit`** per §6.
4. **Unified config write routes** — Implement [config-api-contract](./config-api-contract.md) §3 (`record-layout`, `work-unit-queue`) so intents map to **one** validated entry point.
5. **Optional chat UI** — Intent capture only; execution remains **plan-driven** (§3).

**Still not in scope until explicitly scheduled:** LLM selection, prompt templates, autonomous scheduling, or non-config tool use.

---

**See also:** [ai-agent-foundation.md](./ai-agent-foundation.md) (doctrine and capability map) · [glossary.md](./glossary.md) · [deferred-decisions.md](./deferred-decisions.md)
