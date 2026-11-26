---
owner: product
status: proposed
last_reviewed: 2026-07-12
supersedes: []
---

# BOS — Business Orchestration System

## Purpose

Define **BOS** as Alloy’s unified **orchestration intelligence layer**: how assistive capabilities are named, bounded, proposed, applied, and audited. This document preserves existing **AI safety doctrine** (configuration-not-execution, org scope, human-in-the-loop) while reframing product and engineering vocabulary from scattered “AI agent” labels to **BOS capabilities**.

**This is not a rebuild.** BOS names and unifies what already ships: Orchestrator routing, specialist assists, deterministic insight, and audited config commits.

**Visual identity (frozen):** Mark, horizon, smoke, reveal, and workspace shell are locked — **`docs/system/bos-identity-doctrine.md`**. Adoption work wires real product flows to those primitives; it does not redesign them.

**Implementation inventory** (routes, env gates, staging SQL) remains in this file under **§ Implementation inventory** (formerly `ai-system.md`).

## Program status (execution)

**May 2026:** **Deeper BOS capability expansion is paused.** Shipped surfaces are **assistive groundwork** — narrow, policy-gated, **human-in-the-loop**. Operational product loops take precedence — see **`docs/archive/2026-06-execution/roadmap-and-gaps.md`**.

**UX coherence (May 2026 — partially implemented):** AdminV2 BOS surfaces unified in **`docs/sprints/archive/05_2026/bos_ux_coherence_sprint.md`** (with **`bos_ux_coherence_design.md`**). **Shipped ~2026-05-20 → 2026-05-22:** shared **`OperationalProposalCardFrame`** on Task/Workflow/Config Assist proposal cards; execution receipts on apply outcomes; routing/governance denial copy improvements. **Still open:** full active operational context seeding, attention hierarchy cleanup, demo-path contract completion. **Not** autonomous agents or recommendation-intelligence expansion.

**Operational assist closeout (May 2026 — shipped):** Deterministic **BOS assist routing**, **communication draft synthesis** (separate from recommendation copy), **channel-aware SMS/email** bodies in Task Assist review, Review Assist + drawer stability, native **Work with BOS** CTA — **`docs/sprints/archive/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`**. **Forward planning only:** **`docs/sprints/future/bos_operational_assist_phase2.md`**.

| Category | Status |
|----------|--------|
| **Shipped BOS capabilities** | Orchestrator, Task Assist, Workflow Assist (narrow), Needs Attention insight, Config/Layout Assist foundation, legacy `admin/agent` config commits, **Create Lead actionable command session (V1)** |
| **Config/Layout Assist expansion** | **Partially implemented** — apply catalog incomplete; **paused** |
| **Autonomous orchestration** (enrollment, subsidy, director, monitoring) | **Not implemented** — **later** (distinct from human-confirmed command sessions) |

**Create Lead command session (July 2026 — local/certified on branch):** Actions → Create Lead opens a scoped BOS session. Conversation and Form share one draft; confirm uses registered `create_lead` / Processing identity authority. See `docs/sprints/active/bos-actionable-interface/` and `docs/platform/modules/ai-platform.md` § V6.
## What BOS is

| Term | Definition |
|------|------------|
| **BOS** | Alloy’s **orchestration intelligence layer** — routing, drafting, proposing, and explaining operator intent **through existing platform paths** (admin APIs, workflows, communications enqueue, config PATCH helpers, resolver reads). |
| **BOS capability** | A **registered, bounded** assist function with a stable `capability_key`, explicit read/write class, and proposal/apply rules. Former “agents” (Task Assist, Workflow Assist, etc.) are **capabilities**, not parallel platforms. |
| **Orchestrator** | The **single AdminV2 command-bar entry** that parses NL, resolves context, and **routes** to a capability. It **never** executes operational or config side effects itself. |
| **Human operator** | Always the **delegating actor** for mutating applies; audit attributes `actor_user_id` + org. |

**One-line doctrine (unchanged):** BOS **configures meaning and proposes operational drafts within guardrails**; the **platform** owns truth, authorization, workflows, ledger semantics, and execution.

### Operational assist doctrine (May 2026 — explicit)

#### Recommendations are not customer communication

| Layer | Audience | Examples |
|-------|----------|----------|
| **Operational recommendation** | Operator (internal) | Review Assist “do next”, urgency, catalog action labels |
| **Communication draft** | Family/contact (customer-facing) | SMS/email body from `generateOperationalDraft` → Task Assist propose |

Recommendation strings must not be copied into outbound `draft_body` without synthesis. Human labels use `communicationObjectiveLabel()` — not raw objective keys in UI.

#### Deterministic-first assist

| Concern | Policy |
|---------|--------|
| Routing, workflow authority, operational state, recommendation logic | **Deterministic-first** (`bosAssistHandoffRouting`, resolver, catalog) |
| Wording polish | Optional bounded enrich later — **review-first**, never auto-apply or auto-send |

#### BOS is operational assistance, not chatbot AI

Product posture: **operational narrator**, **guided reviewer**, **workflow copilot** — not open-ended chat, autonomous agent, or recommendation spam. Orchestrator routes; specialists propose; operators approve.

**Closeout detail:** `docs/sprints/archive/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md` (historical: `../sprints/archive/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`).

### Hard prohibitions (system-enforced)

| Boundary | Rule |
|----------|------|
| **Data plane** | No direct DB writes from browser; no service role on client; no raw SQL from BOS paths. |
| **Operational truth** | No silent PATCH to jobs, schedules, invoices, ledger, payments via BOS “config” shortcuts — use **canonical admin routes** after human approval. |
| **Workflow execution** | No bypass of `emitEvent` / `executeWorkflowRun` / `executeAdminAction` for standardized side effects. |
| **Queues** | Queue rows and drawer previews are **not** authoritative; resolve through entity APIs / RRS. |
| **Cross-org** | All capabilities are **`org_id`-scoped** per request context. |
| **Semantics** | No new resolver fields, `event_key` handlers, or visual-context families without **code** registration. |

### Configuration vs operational capabilities

| Class | May propose | May apply (after approval) | Examples |
|-------|-------------|----------------------------|----------|
| **Config** | Structured layout/field/queue/workflow-definition deltas | Same validation as Settings/admin PATCH or **DEFINER RPC** commits | Config/Layout Assist, `admin/agent/v0–v2`, Workflow Assist (workflow CRUD) |
| **Operational** | Draft SMS/email, follow-ups, scheduled sends | `executeCommunicationsSend`, operational-tasks, scheduled-send APIs | Task Assist |
| **Insight** | Deterministic suggestion + optional enrich | **No apply** (copy-only enrich) or **no persist** | Needs Attention suggestion, attention enrich |
| **Orchestration** | Route, clarify, entity search | **None** | Orchestrator (`routeCommandSurface`) |

## AdminV2 workspace shell (canonical)

The **BOS right rail** is part of the canonical AdminV2 workspace shell — not an optional rollout flag.

| Surface | Behavior |
|---------|----------|
| **Workspace routes** | BOS is docked in the workspace Actions column via `CommandRailBosMount`; drawer geometry uses the BOS-aware safe band. |
| **Record drawers** | Modal framing, backdrop, and BOS gutter rules apply by default on AdminV2 entity drawers. |
| **Action Workspace** | Suppresses the persistent BOS rail (`data-adminv2-action-workspace-open`) — modal BOS is the experience. |
| **Non-workspace AdminV2** | Settings, forms, AI activity, and workflows use `AdminV2CommandRailBosHostFooter` when no workspace command column exists. |

`data-adminv2-workspace-shell="v2"` on `<html>` scopes portaled drawer/BOS CSS for workspace routes.

## BOS capability map (shipped)

| `capability_key` | Role | Route / module family | Apply path |
|------------------|------|------------------------|------------|
| `orchestrator` | NL → route → thread/cards | `web/lib/adminV2/aiCommandSurface/*`, `AICommandSurfaceShell` | None |
| `task_assist` | One-off comms / follow-up drafts | `/api/admin/ai/task-assist/**` | `task-assist/apply`, communications send |
| `workflow_assist` | Workflow definition propose/apply (disabled-by-default creates) | `/api/admin/ai/workflow-assist/**` | Workflow CRUD (`requireAdmin`) |
| `config_layout_assist` | `ConfigurationProposalV1` for fields/sections/layout | `/api/admin/ai/config-layout-assist/**`, `config_layout_assist_proposals` | Partial apply catalog |
| `needs_attention_suggestion` | Deterministic attention + draft templates | Resolver attach on opportunity GET | None (insight); enrich is separate |
| `attention_enrich` | Optional LLM polish of deterministic draft | `POST …/enrich-attention-suggestion` | None (preview only) |
| `job_overview_layout` | Job overview layout preview/apply (product route, not a “specialist agent”) | Orchestrator `job_layout` route + planner | `admin/agent/v1` pattern / layout cards |
| `agent_v0_queue_definition` | Queue definition commit | `/api/admin/agent/v0/queue-definition` | `agent_v0_commit_queue_definition_apply` RPC |
| `agent_v1_record_overview_layout` | Record overview layout commit | `/api/admin/agent/v1/record-overview-layout` | `agent_v1_commit_record_overview_layout_apply` RPC |
| `agent_v2_field_visibility` | Field visibility flags | `/api/admin/agent/v2/field-visibility` | `agent_v2_commit_field_visibility_apply` RPC (env-gated) |

**Product language:** Use **Orchestrator** and capability names in UX copy. **Code may retain** `commandSurface*`, `TaskAssist*`, `routeCommandSurface`, and `/api/admin/ai/*` until a phased rename (see sprint migration plan).

## Shared lifecycle: intent → proposal → apply → audit

All mutating BOS capabilities SHOULD converge on this lifecycle (implementation maturity varies).

```
Operator input (NL or structured)
  → Intent / slots (capability-specific)
  → Proposal (immutable candidate; versioned payload)
  → Validation (intent + policy + platform/API)
  → Review (human and/or RBAC + org ai_policy)
  → Apply (canonical HTTP or DEFINER RPC only)
  → Audit (proposal_id, actor, correlation_id, result)
```

### Lifecycle invariants

1. **No apply before validation** for the target mutation class.
2. **Orchestrator** stops at **route + propose-request**; it does not call apply endpoints.
3. **Proposal IDs** are stable for idempotency, support, and rollback correlation.
4. **Optimistic concurrency** on config commits (`expected_version` / `expected_updated_at`) — stale proposals MUST fail closed.
5. **Insight capabilities** MAY skip persist/propose tables but MUST NOT imply execution without an explicit operator action on a separate capability.

### Proposal status model (target standard)

| Status | Meaning |
|--------|---------|
| `draft` | Built, not yet validated for apply |
| `validated` | Passed server validation; await approval |
| `approved` | Human/policy gate cleared (where required) |
| `applied` | Canonical apply succeeded |
| `rejected` | Operator or policy declined |
| `superseded` | Newer proposal replaced this one |
| `failed` | Apply attempted and failed (retain audit) |
| `expired` | TTL or stale version (optional policy) |

**Today:** Native proposal tables and lifecycles remain separate. Adapters map config-assist states via `mapConfigLayoutAssistStateToBosStatus` without merging tables.

## Capability registry (Phase 2 — shipped)

**Source of truth:** `web/lib/bos/bosCapabilityRegistry.ts` — `BOS_CAPABILITY_REGISTRY` (10 audited capabilities).

| Field | Purpose |
|-------|---------|
| `capability_key` | Stable registry id |
| `label` | Operator-facing name |
| `domain` | `orchestration` \| `config` \| `operational` \| `insight` |
| `proposal_mode` | `none` \| `ephemeral` \| `durable` |
| `apply_policy` | e.g. `human_approved_operational_api`, `none`, `preview_only` |
| `default_risk_level` | `none` \| `low` \| `medium` \| `high` |
| `requires_human_approval` | Mutating apply expects explicit operator gate |
| `legacy_agent_keys` | Native `agent_key` strings |
| `source_modules` | Implementation path hints |

**Import:** `import { BOS_CAPABILITY_REGISTRY, getBosCapabilityDefinition } from "@/lib/bos"`.

## Proposal envelope (Phase 2 — shipped)

**Types:** `web/lib/bos/bosProposalEnvelope.ts` — `BosProposalEnvelopeV1`.

| Field | Purpose |
|-------|---------|
| `proposal_id`, `capability_key`, `agent_key` | Identity (+ legacy) |
| `domain`, `status`, `risk_level`, `requires_approval` | Policy / lifecycle |
| `summary`, `affected_surfaces`, `validation`, `warnings`, `diff` | Review UX |
| `source`, `created_at` | Provenance |
| `raw_payload` | **Unmodified** native proposal (authoritative for apply) |

### Adapters (wrap only)

| Native type | Function |
|-------------|----------|
| `TaskAssistSuggestionV1` | `taskAssistSuggestionToBosProposalEnvelope()` |
| `WorkflowAssistSuggestionV1` | `workflowAssistSuggestionToBosProposalEnvelope()` |
| `ConfigurationProposalV1` | `configurationProposalToBosProposalEnvelope()` |
| `AttentionSuggestionV1` | `needsAttentionSuggestionToBosProposalEnvelope()` |
| `AgentV0QueueDefinitionCommitPayloadV1` | `agentV0QueueDefinitionToBosProposalEnvelope()` |
| `AgentV1RecordOverviewLayoutCommitPayloadV1` | `agentV1RecordOverviewLayoutToBosProposalEnvelope()` |
| `AgentV2FieldVisibilityCommitPayloadV1` | `agentV2FieldVisibilityToBosProposalEnvelope()` |

Catalog: `BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS` in `web/lib/bos/bosAdapterCatalog.ts`.

Existing APIs keep native shapes. Envelopes are for **thread metadata**, diagnostics (`buildBosEnvelopeLogSummary`), and future proposal inbox UI.

### Command surface wiring (Phase 3)

- Optional `capability_key` on cards — `withCommandSurfaceCardCapabilityKey()`.
- Optional `bos_envelope` on `action_card` thread turns (internal only).
- `appendActionCardTurnWithBosMetadata()` — used when Workflow Assist / Config Assist proposal cards are appended in `AICommandSurfaceShell`.

### Auth barrel (Phase 3)

`web/lib/bos/auth/index.ts` re-exports `resolveAiEnrichmentPortalAccess` and related helpers. `getBosCapabilityAccessHints(capability_key)` returns registry policy metadata — **does not enforce**; routes keep existing guards.

## Adding a future BOS capability (required)

1. Add entry to `BOS_CAPABILITY_REGISTRY`.
2. Implement native proposal types in `web/lib/agent/**` (or documented module).
3. Add `*ToBosProposalEnvelope()` adapter with `raw_payload` = native object reference.
4. Wire Orchestrator routing + tests under `web/tests/bos/`.
5. Update this doc’s capability table in the same change.

Do **not** ship UI integration without steps 1 and 3.

## Capability boundaries (by domain)

### Config capabilities

- **May** read admin config inventories and integrity reports (`configuration-system.md` four-plane model).
- **May** write only through validated PATCH helpers or DEFINER RPC commits.
- **Must not** invent `event_key`, overview keys, or exception predicates outside code catalogs.
- **Representatives:** `config_layout_assist`, `agent_v0_*`, `agent_v1_*`, `agent_v2_*`.

### Workflow capabilities

- **May** propose/create/edit/pause **workflow definitions** (metadata, scaffolds) — default **disabled** on create.
- **Must** use existing `POST/PATCH/DELETE /api/admin/workflows` on apply.
- **Must not** run `executeWorkflowRun` from propose paths.
- **Representative:** `workflow_assist`.

### Task / operational capabilities

- **May** draft one-off communications and operational tasks for **approved** entities.
- **Must** re-resolve recipients and channels server-side on apply.
- **Must** use `executeCommunicationsSend` / scheduled-send / operational-task services.
- **Representative:** `task_assist`.

### Communication-related insight

- **May** enrich copy for operator preview only.
- **Must not** enqueue or persist sends from enrich routes.
- **Representative:** `attention_enrich` (extends `needs_attention_suggestion` drafts).

### Insight capabilities

- **May** derive structured suggestions from resolver output (deterministic).
- **Must not** reorder queues or mutate records without operator action elsewhere.
- **Representative:** `needs_attention_suggestion`.

## Folder / module standard (as-built)

| Layer | Path | Notes |
|-------|------|-------|
| BOS registry + envelope + auth | `web/lib/bos/` | Registry, adapters, `auth/`, `commandSurfaceBosWire` |
| Orchestrator UI / routing | `web/lib/adminV2/aiCommandSurface/` | Proposal cards use `appendActionCardTurnWithBosMetadata` |
| Capability logic | `web/lib/agent/**` | Unchanged — registry `source_modules` points here |
| Shared AI provider | `web/lib/ai/` | Enrich + gated LLM |
| HTTP — operational | `web/app/api/admin/ai/` | **No rename** |
| HTTP — config commits | `web/app/api/admin/agent/` | BOS config-commit family |
| Tests | `web/tests/bos/` | Registry + adapters + command metadata |

**Docs:** Active doctrine = this file. Sprint audits = `docs/sprints/archive/05_2026/bos_standardization_*.md`. Archived AI agent contracts = `docs/archive/2026-05-02-docs-reset/architecture/ai-agent-*.md` (historical shapes; prefer BOS sections here for new work).

## Orchestrator + specialists (AdminV2)

The bottom **command bar** is the **Orchestrator** surface. Operators use one input; Orchestrator parses intent, resolves entity/context, routes to a capability, and shows clarification or candidates in a **thread**.

| Capability | Shipped | Notes |
|------------|---------|-------|
| **Orchestrator** | Yes | `AICommandSurfaceShell`, `routeCommandSurface` |
| **Task Assist** | Yes | Human approval before send/apply |
| **Workflow Assist** | Yes (narrow) | Deterministic propose; admin apply |
| **Config / Layout Assist** | Partial | Durable proposals; partial apply |
| **Job overview layout** | Yes | Routed as `job_layout` |

**Session state (`GlobalAssistantContext`, May 2026):**

- **Thread + UI chrome:** `commandSurfaceThread`, `commandSurfaceThreadExpanded`, `commandSurfaceJobCardUi` — backed by **`sessionStorage`** (`commandSurfaceThreadPersistence.ts`) for AdminV2 navigation within a tab session; **Clear** resets explicitly.
- **SSR / hydration:** First paint uses an **empty thread** on server and client; **`loadPersistedCommandSurfaceSession()`** runs in a mount **`useEffect`** only. Persist writes are gated until restore completes. **Do not** read `sessionStorage` in `useState` initializers (caused `AICommandSurfaceShell` hydration mismatch). Detail: **`docs/sprints/archive/05_2026/agent_interaction_layer_v1.md`**.
- **Workspace route context:** `workspaceScope` (`department_id`, optional `work_unit_id`, names) is set from department/work-unit pages for Workflow Assist create proposals; **`setWorkspaceScope`** shallow-compares before updating to avoid render loops. Detail: **`docs/sprints/archive/05_2026/workflow_assist_v1.md`** § Workspace panels.

## Policy and permissions

**Doctrine:** `metadata.ai_policy` = org capability switch. `role_permission_grants` + portal `admin`/`ops` = user may call routes. Orchestrator **never** executes side effects.

See **§ Implementation inventory — Agent permission matrix** for the full route table.

## Guardrails (safety doctrine preserved)

- No direct client DB secrets; no training on production PII without policy.
- Configuration updates use the same validation as human admins (DEFINER RPC + stale-check + audit where implemented).
- Do not bypass `executeAdminAction` / events when standardized there.
- LLM calls: redaction, org policy, env gates, permission keys — see `web/lib/ai/**`.

## Relationship to platform docs

| Topic | Doc |
|-------|-----|
| Config control plane | `docs/system/configuration-system.md` § BOS readiness |
| Workflows / events | `docs/archive/2026-06-superseded-system/actions-and-workflows.md` |
| API families | `docs/archive/2026-06-superseded-system/api-contracts.md` |
| Workspace / queues | `docs/archive/2026-06-superseded-system/workspace-system.md` |
| Execution pause | `docs/archive/2026-06-execution/roadmap-and-gaps.md` |
| Historical typed contract | `docs/archive/.../architecture/ai-agent-system-contract.md` |

## When this doc must be updated

New BOS capabilities, lifecycle/status changes, permission matrix changes, new route families in **`api-contracts.md`**, or changes to `web/lib/bos/` registry/adapters/auth.

---

## Implementation inventory

*The following sections document **actual** routes and env gates in `web/` (formerly the standalone AI system topic file).*

### AdminV2 agent model (Orchestrator + specialists)

The bottom **command bar** is the **Orchestrator Agent** surface — not Task Assist. Operators talk to one input; the Orchestrator parses intent, resolves entity/context, routes to a specialist, and shows clarification or candidate selection in a **thread**. The Orchestrator **never directly executes** operational side effects (no auto-send, no workflow writes).

| Agent | Role | Shipped today |
|-------|------|----------------|
| **Orchestrator** | Owns **`AICommandSurfaceShell`**, **`routeCommandSurface`** (`commandSurfaceRouter.ts`), slot extract, entity-search orchestration, thread + action-card shell | **Yes** (Interaction Layer V1) |
| **Task Assist (Agent #2)** | One-off operational actions: draft SMS/email, scheduled sends, reminders/tasks, proposal lifecycle — **human approval required** | **Yes** — routed destination; UI in action cards + **`TaskAssistOpportunityWorkspace`**; APIs under **`/api/admin/ai/task-assist/**`**, **`communication-scheduled-sends`**, **`operational-tasks`** |
| **Workflow Assist (Agent #3)** | Workflow configuration, oversight summaries, deterministic **propose** + admin-only **apply** over existing workflow CRUD — **no LLM** in default path; human approval before apply | **Yes (narrow)** — workflow-like NL → **`workflow_assist`** route → read **`workflow_assist_read`** cards and/or **create** commands → **`workflow_assist_proposal`** (disabled draft templates: tour reminder, when/move stub) → **`POST …/workflow-assist/propose`** / **`apply`**; Explain v1 + optional name lookup via Task Assist entity search |
| **Config / Layout Assist** | Audited **`ConfigurationProposalV1`** for field/section/drawer/queue changes — propose via Orchestrator; lifecycle on **`config_layout_assist_proposals`** | **Partially implemented** — **`POST …/config-layout-assist/propose`**, proposal GET/state routes, **partial** apply catalog; permissions **`config_assist.review`** / **`config_assist.apply`** (seed **`20260523150000`**) |

**Also routed (non-agent product):** **Job overview layout** commands use the same Orchestrator input → layout preview/apply card (`job_layout` route) — distinct from Task Assist, Workflow Assist, and Config/Layout Assist.

**Implementation names:** Product language uses **Orchestrator** for the command bar. Code may retain **`commandSurface*`**, **`TaskAssist*`**, and **`routeCommandSurface`** — those modules implement Orchestrator routing and Task Assist execution respectively.

### Current state (routes)

- **Agent APIs (Implemented):** All under **`web/app/api/admin/agent/`**:
  - **`.../v0/queue-definition`** — queue definition updates (tests reference this family).
  - **`.../v1/record-overview-layout`**, **`.../v1/activity`**.
  - **`.../v2/field-visibility`** — structured apply path; **disabled unless** **`AGENT_V2_FIELD_VISIBILITY_ENABLED`** is `true`/`1`/`yes` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`).
- **Admin V2 UI** may surface AI/command UX under **`web/app/adminV2/`** (search `ai`, `agent` in subtree).
- **AI enrichment (stub + OpenAI-compatible + telemetry):** **`POST /api/admin/ai/enrich-attention-suggestion`** — see route validation in **`web/lib/ai/enrichAttentionSuggestionRouteValidation.ts`**; tests **`web/tests/ai/enrichAttentionSuggestionRoute.test.ts`**.
- **Task Assist V1 / V1.1:** **`POST /api/admin/ai/task-assist/propose`**, **`apply`**, proposals routes; spec sprints **`task_assist_v1.md`**, **`task_assist_v1_1.md`**.
- **Workflow Assist V1:** **`POST /api/admin/ai/workflow-assist/propose`**, **`apply`**, **`explain`**, **`capabilities`**; spec **`workflow_assist_v1.md`**.
- **Orchestrator:** **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**; sprints **`agent_interaction_layer_v1.md`**.

### Agent permission matrix (org policy vs user RBAC)

| Surface / API | Org policy | User capability | Implementation |
|---------------|------------|-----------------|----------------|
| **Orchestrator** (client parse, thread) | — | Portal **`admin` or `ops`** (same shell as AdminV2) | UI + downstream APIs |
| **Entity search** | — | **`requireAdminOrOps`** + access scope | `GET /api/admin/ai/task-assist/entity-search` |
| **Task Assist propose** | `ai_policy` + **`task_assist_draft`** + provider + env | **`resolveAiEnrichmentPortalAccess`**: strict → **`ai.enrichment.use`**; legacy → portal **admin or ops** | `POST /api/admin/ai/task-assist/propose` |
| **Workflow Assist propose** | `ai_policy` + **`workflow_assist_draft`** + provider + env | **`requireAdmin`** + same portal resolution as Task Assist propose | `POST /api/admin/ai/workflow-assist/propose` |
| **Attention enrich (stub/OpenAI)** | `draft_enrichment`, provider | Same **`resolveAiEnrichmentPortalAccess`** | `POST /api/admin/ai/enrich-attention-suggestion` |
| **Task Assist send / composer send** | — | **`requireAdminOrOps`** + **`assertCommunicationsSendAllowed`** | `POST .../task-assist/apply`, `POST .../communications/send` |
| **Workflow CRUD (mutations)** | — | **`requireAdmin`** (admin-only) | `POST/PATCH/DELETE .../workflows` |

### Agent #1 — Needs attention suggestion + Enhance draft

- **Deterministic suggestion + drafts:** **`buildNeedsAttentionSuggestion`** + **`suggestedContentTemplates.ts`**. Drawer: **`OperationalAttentionHeaderStrip`** + **`OperationalAttentionEnhanceDraft`**.
- **Token / live model:** Only on explicit **Enhance draft** → **`POST /api/admin/ai/enrich-attention-suggestion`**.

### SECURITY DEFINER RPCs (config mutations)

| Function | Config target |
|----------|----------------|
| **`agent_v0_commit_queue_definition_apply`** | **`work_units.queue_definition`** |
| **`agent_v1_commit_record_overview_layout_apply`** | Record overview layout JSON |
| **`agent_v2_commit_field_visibility_apply`** | **`field_definitions`** visibility flags |

### Source of truth / key files

| Concern | Location |
|---------|----------|
| BOS registry + envelope | `web/lib/bos/` |
| Agent routes | `web/app/api/admin/agent/**`, `web/app/api/admin/ai/**` |
| Agent logic | `web/lib/agent/**` |
| Orchestrator | `web/lib/adminV2/aiCommandSurface/**` |
| AI provider | `web/lib/ai/**` |
| Tests | `web/tests/agent/`, `web/tests/adminV2/commandSurface*` |

### Known gaps / risks

- Model logging/redaction beyond current `web/lib/ai` gates.
- Config/Layout Assist apply catalog incomplete.
- Autonomous capabilities not implemented.
- **Paused:** New capabilities and Orchestrator growth beyond maintenance.

### Manual staging validation checklist

See prior **`ai-system.md`** staging SQL and env tables — unchanged for pilots. Prefer migration **`20260522180000_staging_demo_org_ai_policy_task_assist_draft.sql`** for Task Assist stub policy merges.
