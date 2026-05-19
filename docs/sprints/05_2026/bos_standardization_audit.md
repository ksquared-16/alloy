# BOS Standardization Sprint — Audit Report

**Sprint:** BOS Standardization (audit-first)  
**Status:** Audit complete — **no new agent features implemented**  
**Foundation doc:** `docs/product/bos-foundation.md`  
**Date:** 2026-05-18

---

## 1. Executive summary

Alloy already ships a **multi-capability assistive layer** under AdminV2: an Orchestrator command bar, three specialist families (Task, Workflow, Config/Layout), deterministic needs-attention insight, optional LLM enrich, and legacy versioned **config commit** APIs (`admin/agent/v0–v2`). Documentation and code use **inconsistent names** (“AI agent”, “Agent #2”, `task_assist`, `commandSurface`, `/api/admin/ai` vs `/api/admin/agent`).

**BOS (Business Orchestration System)** reframes this as one **orchestration intelligence layer** with **capabilities**, not a parallel platform. **Safety doctrine from archived `ai-agent-foundation.md` remains valid** and is carried forward in `bos-foundation.md`.

**Verdict:** Standardization is **documentation + thin registry contracts** first; **code renames are deferred** to Phase 2 minimal steps.

---

## 2. Files inspected

### Doctrine (active)

| File | Role |
|------|------|
| `docs/product/ai-system.md` | Route/env inventory (now stub → bos-foundation) |
| `docs/product/bos-foundation.md` | **New** BOS canonical doc |
| `docs/system/configuration-system.md` | BOS/config-agent readiness table |
| `docs/system/actions-and-workflows.md` | Event/workflow guardrails |
| `docs/system/api-contracts.md` | AI/agent route families |
| `docs/system/workspace-system.md` | Queue ordering not AI-driven |
| `docs/system/record-system.md` | Attention attach on entity GET |
| `docs/system/roles-and-permissions.md` | `ai.enrichment.use`, workflow admin gates |
| `docs/execution/operating-doctrine.md` | Doc cap, behavior-change rules |
| `docs/execution/roadmap-and-gaps.md` | AI pause / deprioritization |

### Doctrine (archived — distilled, not reactivated)

| File | Role |
|------|------|
| `docs/archive/.../architecture/ai-agent-foundation.md` | Configuration-not-execution, capability map, API model |
| `docs/archive/.../architecture/ai-agent-system-contract.md` | AgentIdentity, intent taxonomy, proposal lifecycle |
| `docs/archive/.../implementation/ai-agent-*-slice-*.md` | v0/v1/v2 implementation bridges |

### Sprints (implementation truth)

| File | Role |
|------|------|
| `docs/sprints/05_2026/ai_agents_v1.md` | Four-layer model, agent separation |
| `docs/sprints/05_2026/ai_agents_v1_step0_audit.md` | Needs-attention resolver audit |
| `docs/sprints/05_2026/agent_interaction_layer_v1.md` | Orchestrator shipped |
| `docs/sprints/05_2026/task_assist_v1.md`, `task_assist_v1_1.md` | Task Assist scope |
| `docs/sprints/05_2026/workflow_assist_v1.md` | Workflow Assist scope |
| `docs/sprints/05_2026/configuration_layout_assist_v1.md` | Config proposals |
| `docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md` | Enrichment foundation |

### Code (representative)

| Area | Path | Notes |
|------|------|-------|
| Orchestrator | `web/lib/adminV2/aiCommandSurface/`, `AICommandSurfaceShell.tsx` | Routes: task, workflow, config, job_layout |
| Task Assist | `web/lib/agent/taskAssist/`, `/api/admin/ai/task-assist/**` | Durable proposals + apply |
| Workflow Assist | `web/lib/agent/workflowAssist/`, `/api/admin/ai/workflow-assist/**` | Propose/apply/explain |
| Config Assist | `web/lib/agent/configLayoutAssist/`, `config_layout_assist_proposals` | Partial apply |
| Insight | `web/lib/agent/needsAttentionSuggestion/`, `web/lib/ai/` | Deterministic + enrich |
| Config commits | `web/lib/agent/v0|v1|v2/`, `/api/admin/agent/**` | DEFINER RPC pattern |
| Planner | `web/lib/agent/planner/` | Job overview layout |
| Tests | `web/tests/agent/`, `web/tests/adminV2/commandSurface*` | Contract coverage |

---

## 3. Capability inventory (as-built)

### 3.1 AI Command Surface (Orchestrator)

| Aspect | Finding |
|--------|---------|
| **Entry** | `AICommandSurfaceShell` — bottom command bar |
| **Router** | `routeCommandSurface` — precedence: workflow → config → task → job_layout → clarify |
| **Side effects** | **None** from shell; delegates to specialist APIs/UI |
| **Auth** | AdminV2 portal admin/ops for shell; downstream routes enforce RBAC |
| **Gaps** | Product name “Orchestrator” vs `commandSurface*` code; no central capability registry |

### 3.2 Config / Layout Assist

| Aspect | Finding |
|--------|---------|
| **Contract** | `ConfigurationProposalV1` + operation kinds in `configurationProposalV1.ts` |
| **Persistence** | `config_layout_assist_proposals` (durable) |
| **Apply** | **Partial** — not all `ConfigurationOperationKindV1` values executable |
| **Permissions** | `config_assist.review`, `config_assist.apply` |
| **Orchestrator** | Routed via `config_layout_assist` when field/section/drawer signals match |
| **Gaps** | Apply catalog expansion paused; no shared `BosProposalEnvelope` yet |

### 3.3 Workflow Assist

| Aspect | Finding |
|--------|---------|
| **Contract** | `WorkflowAssistSuggestionV1`, `WORKFLOW_ASSIST_AGENT_KEY` |
| **Apply** | Maps to existing workflow CRUD; creates default **disabled** |
| **LLM** | Deterministic default; draft enrichment advisory only |
| **Read cards** | `workflow_assist_read`, Explain v1 |
| **Gaps** | Not on DEFINER RPC proposal pattern; separate from config_layout proposals |

### 3.4 Task Assist + task/suggestion agents

| Aspect | Finding |
|--------|---------|
| **Contract** | `TaskAssistSuggestionV1`, `TASK_ASSIST_AGENT_KEY` |
| **Scope** | Opportunities-first; SMS/email send via `executeCommunicationsSend` |
| **Proposals** | `task_assist_proposals` + approve/reject routes (V1.1) |
| **Scheduled / tasks** | `communication_scheduled_sends`, `operational_tasks` |
| **Gaps** | Ephemeral vs durable proposal duality; `agent_key` naming only in payload |

### 3.5 Operational attention suggestions

| Aspect | Finding |
|--------|---------|
| **Contract** | `AttentionSuggestionV1`, `NEEDS_ATTENTION_SUGGESTION_AGENT_KEY` |
| **Source** | `buildNeedsAttentionSuggestion` from `resolveOpportunityAttention` |
| **Persistence** | **None** — derived on GET / queue preview |
| **Enrich** | Separate `attention_enrich` capability; copy-only |
| **Gaps** | `next_action.action_family` not wired to action buttons; no apply path (by design) |

### 3.6 Proposal / review cards

| Surface | Card types | Apply |
|---------|------------|-------|
| Command thread | Task, Workflow, Config, Layout, Read summaries | Per capability |
| Opportunity drawer | OperationalAttentionHeaderStrip, Enhance draft | Enrich only |
| Workflow admin | Explain panel, scope display | Read |

### 3.7 Legacy `admin/agent` config commits (v0–v2)

| Version | Intent | RPC audit | Env gate |
|---------|--------|-----------|----------|
| v0 | `update_queue_definition` | `agent_v0_*` tables | `AGENT_V0_ENABLED` pattern |
| v1 | Record overview layout | `agent_v1_*` | `AGENT_V1_RECORD_LAYOUT_ENABLED` |
| v2 | Field visibility | `agent_v2_*` | `AGENT_V2_FIELD_VISIBILITY_ENABLED` |

**Strongest lifecycle maturity** — proposal + stale version + apply audit. Config/Layout Assist should **align semantics** over time, not necessarily merge tables in Phase 2.

---

## 4. Doctrine alignment matrix

| Principle | Archived AI foundation | Active platform | Gap |
|-----------|------------------------|-----------------|-----|
| Config not execution | Yes | Enforced in Task/Workflow/Config paths | None critical |
| Org scope | Yes | `getAdminContextCached` / org_id on routes | None |
| Human approval for mutate | Yes | Task/Workflow/Config review cards | Insight path correct (no apply) |
| Same validation as admin | Yes | DEFINER RPC + PATCH helpers | Config assist partial apply |
| Resolver-first reads | Yes | Entity GET, attention resolver | None |
| No queue reorder by AI | Yes | Documented in ai-system / workspace | None |
| Typed capability registry | Planned in archive contract | **Missing** | Phase 2 `web/lib/bos` |
| Unified proposal status enum | Archive contract | **Per-capability** | Phase 2 alignment |

---

## 5. API surface fragmentation

| Prefix | Purpose | Rename in Phase 2? |
|--------|---------|-------------------|
| `/api/admin/ai/*` | Task, Workflow, Config assist, enrich | **No** (breaking); alias optional later |
| `/api/admin/agent/*` | v0–v2 config commits | **No**; document as BOS config commits |
| `/api/admin/config-layout-assist/proposals/*` | Proposal CRUD | **No** |

---

## 6. Test coverage snapshot

| Area | Tests present |
|------|----------------|
| Command surface routing | `web/tests/adminV2/commandSurface*.test.ts` |
| Task Assist | `web/tests/agent/taskAssist/**` |
| Config layout cards | `web/tests/adminV2/configLayoutAssist*.test.ts` |
| Enrichment route | `web/tests/ai/enrichAttentionSuggestionRoute.test.ts` |
| Agent v0/v2 | `web/tests/agent/**` (partial) |

**Gap:** No tests for unified `BosCapability` registry (not yet implemented).

---

## 7. Likely blast radius (Phase 2 minimal code)

| Change | Blast radius |
|--------|----------------|
| Add `web/lib/bos/bosCapability.ts` + registry | Low — new module, re-exports |
| `toBosProposalEnvelopeV1` adapters | Medium — per capability, tests |
| Docs cross-links `ai-system` → `bos-foundation` | Low — active docs only |
| Rename `web/lib/agent` → `web/lib/bos/capabilities` | **High — avoid** |
| Rename `/api/admin/ai` | **High — avoid** |
| Rename `aiCommandSurface` folder | Medium — many imports |

---

## 8. Risks if standardization is skipped

- New Phase 2 capabilities copy **four different proposal patterns** ad hoc.
- Engineers confuse **Orchestrator** with **Task Assist** execution paths.
- Config assist and `agent_v2` diverge on audit/stale-check semantics.
- External docs reference “AI agents” implying autonomy.

---

## 9. Recommendations (audit conclusions)

1. Adopt **BOS** vocabulary in **product docs and new code comments**; keep legacy identifiers in code until registry ships.
2. Implement **`BosCapability` registry** as read-only catalog in Phase 2 — no route moves.
3. Align **proposal status names** across durable tables via migration only if needed for ops tooling.
4. Do **not** expand apply catalog or Orchestrator routing until operational roadmap items advance.
5. Distill archived `ai-agent-system-contract` intent taxonomy into capability-specific modules — do not resurrect full AgentIdentity DB model yet.

---

## 10. Out of scope (confirmed)

- New autonomous agents
- Broad file/folder renames
- LLM expansion beyond existing gates
- Merging proposal DB tables
