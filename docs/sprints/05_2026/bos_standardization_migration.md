# BOS Standardization — Migration Plan & Phase 2 Readiness

**Prerequisites:** `bos_standardization_audit.md`, `docs/product/bos-foundation.md`  
**Principle:** Rename **concepts** in docs first; rename **code** only where it reduces Phase 2 inconsistency without breaking URLs.

---

## Phase 1 (this sprint) — Done

| Deliverable | Location |
|-------------|----------|
| Audit report | `docs/sprints/05_2026/bos_standardization_audit.md` |
| BOS foundation + contracts | `docs/product/bos-foundation.md` |
| `ai-system.md` stub | `docs/product/ai-system.md` → points to bos-foundation |
| Migration plan (this file) | `docs/sprints/05_2026/bos_standardization_migration.md` |

**No application code changes** in Phase 1.

---

## Phase 2 — Minimal repo changes (ordered)

### Step 1 — Registry (no moves)

Create:

```
web/lib/bos/
  index.ts
  bosCapability.ts          # BosCapabilityKey, BosCapabilityDefinition, registry array
  bosProposalLifecycle.ts   # BosProposalStatus, transition helpers (validate only)
  bosProposalEnvelope.ts    # BosProposalEnvelopeV1 type + narrow helpers
```

Populate registry from audit §3 with `legacy_agent_keys` mapping:

| `capability_key` | `legacy_agent_keys` |
|------------------|---------------------|
| `task_assist` | `task_assist` |
| `workflow_assist` | `workflow_assist` |
| `config_layout_assist` | `config_layout_assist` |
| `needs_attention_suggestion` | `needs_attention_suggestion` |
| `agent_v0_queue_definition` | (none) |
| … | … |

**Tests:** `web/tests/bos/bosCapabilityRegistry.test.ts` — snapshot registry keys and `requires_human_approval`.

### Step 2 — Envelope adapters (optional per capability)

| Module | Adapter |
|--------|---------|
| `web/lib/agent/taskAssist/types.ts` | `taskAssistSuggestionToBosEnvelope()` |
| `web/lib/agent/workflowAssist/workflowAssistProposalV1.ts` | `workflowAssistSuggestionToBosEnvelope()` |
| `web/lib/agent/configLayoutAssist/configurationProposalV1.ts` | `configurationProposalToBosEnvelope()` |

Use in **audit logging / future Orchestrator metadata only** — do not change API response shapes yet.

### Step 3 — Auth helper barrel (optional)

`web/lib/bos/auth/resolveBosPortalAccess.ts` — re-export `resolveAiEnrichmentPortalAccess` + document capability-specific gates. **No behavior change.**

### Step 4 — Active doc cross-links

Update **active topic files only** (not every sprint archive):

- `docs/README.md` — load `product/bos-foundation.md`
- `docs/core/system-overview.md`
- `docs/execution/roadmap-and-gaps.md`
- `docs/system/configuration-system.md` — link BOS foundation § config capabilities

Leave `docs/sprints/**` references to `ai-system.md` (stub redirects).

### Step 5 — Orchestrator metadata (optional UX)

Thread cards: add `capability_key` field alongside existing `agent_key` in **new** responses only (backward compatible).

**Do not rename** `AICommandSurfaceShell` file in Phase 2 unless paired with grep-driven import pass and test run.

---

## Per-capability migration notes

### Orchestrator (`orchestrator`)

| Item | Action |
|------|--------|
| Code paths | Keep `aiCommandSurface/*` |
| Docs | Call “Orchestrator (BOS entry)” |
| Phase 3+ | Optional alias export `routeBosCommand` wrapping `routeCommandSurface` |

### Task Assist (`task_assist`)

| Item | Action |
|------|--------|
| Tables | Keep `task_assist_proposals` |
| Status alignment | Map DB statuses → `BosProposalStatus` in adapter |
| API | Keep `/api/admin/ai/task-assist/*` |

### Workflow Assist (`workflow_assist`)

| Item | Action |
|------|--------|
| Apply | Continue workflow CRUD only |
| Future | Consider durable proposal table if edit/pause audit required |

### Config / Layout Assist (`config_layout_assist`)

| Item | Action |
|------|--------|
| Apply catalog | Resume only after settings parity sprint |
| RPC pattern | Evaluate aligning high-risk ops with DEFINER RPC **per operation kind**, not big-bang |

### Needs Attention + Enrich (`needs_attention_suggestion`, `attention_enrich`)

| Item | Action |
|------|--------|
| Persistence | Remain derived + enrich preview |
| Wire `action_family` | Separate product card — not BOS rename work |

### Agent v0–v2 (`agent_v0_*`, etc.)

| Item | Action |
|------|--------|
| Routes | Keep `/api/admin/agent/*` |
| Docs | Label “BOS config commit (vN)” in bos-foundation |
| Agent Lab | Keep `web/lib/admin/agentLab` — internal only |

---

## Explicit non-migrations

| Do not | Reason |
|--------|--------|
| Rename `/api/admin/ai` → `/api/admin/bos` | Breaking clients, bookmarks, tests |
| Move `web/lib/agent` wholesale | Large import blast radius |
| Merge proposal tables | Different retention and apply mechanics |
| Rename env vars `AGENT_*`, `AI_ENRICHMENT_*` | Deploy/config drift |
| Auto-execute from Orchestrator | Violates doctrine |

---

## Phase 2 readiness checklist

Use before starting **new** BOS capabilities or resuming paused expansion.

### Doctrine & docs

- [ ] `docs/product/bos-foundation.md` read by implementer
- [ ] Capability class (config / operational / insight) identified for the feature
- [ ] `bos_standardization_audit.md` §3 reviewed for pattern to copy
- [ ] Active topic docs updated in same PR if behavior changes

### Platform gates

- [ ] Org `metadata.ai_policy` feature flag named and documented
- [ ] User permission keys seeded (if not portal-only)
- [ ] Env gates documented in bos-foundation implementation inventory
- [ ] No client-side service role

### Lifecycle

- [ ] Intent/slots defined
- [ ] Proposal type versioned (`version: 1`)
- [ ] `capability_key` / legacy `agent_key` set on payload
- [ ] Human approval path for mutating apply
- [ ] `proposal_id` + `correlation_id` on apply audit
- [ ] Stale-check if touching versioned config rows

### Execution path

- [ ] Apply uses **one** canonical function (RPC, `executeCommunicationsSend`, workflow CRUD, etc.)
- [ ] No direct table PATCH from propose handler
- [ ] Orchestrator route added to `routeCommandSurface` with precedence documented

### Tests

- [ ] Route contract test under `web/tests/agent/` or `web/tests/bos/`
- [ ] Command surface card test if Orchestrator-visible
- [ ] `cd web && npx tsc --noEmit` clean

### Observability

- [ ] No API keys or raw prompts in logs
- [ ] Telemetry event shape documented (if LLM)

### Pause compliance

- [ ] Feature approved in roadmap (not default sprint work while items 1–9 operational work open)
- [ ] Not labeled “autonomous” in UX

---

## Phase 3+ (deferred)

- Optional public alias routes `/api/admin/bos/*` proxying to `/api/admin/ai/*`
- Unified proposal admin UI across durable tables
- `AgentIdentity` / `AgentCapabilityProfile` DB model (only if multi-tenant agent configs needed)
- Record Experience Builder integration

---

## Suggested commit message (Phase 1 docs only)

```
docs(bos): add BOS foundation, audit, and migration plan for agent standardization

Reframe shipped assistive layer as BOS capabilities without code renames.
Preserve ai-system.md as stub for existing links.
```
