# BOS Standardization — Migration Plan & Phase 2 Readiness

**Prerequisites:** `bos_standardization_audit.md`, `docs/product/bos-foundation.md`  
**Principle:** Rename **concepts** in docs first; rename **code** only where it reduces Phase 2 inconsistency without breaking URLs.

---

## Phase 1 (this sprint) — Done

| Deliverable | Location |
|-------------|----------|
| Audit report | `docs/sprints/archive/05_2026/bos_standardization_audit.md` |
| BOS foundation + contracts | `docs/product/bos-foundation.md` |
| `bos-foundation.md` stub | `docs/product/bos-foundation.md` → points to bos-foundation |
| Migration plan (this file) | `docs/sprints/archive/05_2026/bos_standardization_migration.md` |

**No application code changes** in Phase 1.

---

## Phase 2 — Registry + proposal envelope — Done (2026-05-18)

| Step | Status | Notes |
|------|--------|-------|
| Registry | **Done** | `web/lib/bos/bosCapabilityRegistry.ts` — 10 capabilities |
| Envelope types | **Done** | `web/lib/bos/bosProposalEnvelope.ts` |
| Adapters | **Done** | Task, Workflow, Config, Needs Attention (`web/lib/bos/adapters/`) |
| Command metadata | **Done** | Optional `capability_key` on action cards; `withCommandSurfaceCardCapabilityKey()` |
| Tests | **Done** | `web/tests/bos/**` (12 tests) |
| Docs | **Done** | `bos-foundation.md`, this file, `bos_registry_proposal_envelope_phase_2.md` |
| Auth barrel | **Done (Phase 3)** | `web/lib/bos/auth/index.ts` |

Sprint detail: **`docs/sprints/archive/05_2026/bos_registry_proposal_envelope_phase_2.md`**.

---

## Phase 3 — Foundation closeout — Done (2026-05-18)

| Step | Status | Notes |
|------|--------|-------|
| Thread envelope wiring | **Done** | Workflow + Config proposal cards in command shell |
| Legacy commit adapters | **Done** | agent v0 / v1 / v2 |
| Auth barrel | **Done** | Re-exports + access hints |
| Readiness tests | **Done** | `bosFoundationReadiness.test.ts` |
| Closeout doc | **Done** | `completed/bos_foundation_closeout_phase_3.md` |

Sprint detail: **`docs/sprints/archive/05_2026/completed/bos_foundation_closeout_phase_3.md`**.

### Phase 2 checklist (acceptance)

- [x] `cd web && npx tsc --noEmit` passes
- [x] `npm run test -- tests/bos` passes
- [x] No route/folder rename
- [x] No new mutation path
- [x] Registry importable from `@/lib/bos`
- [x] ≥2 proposal families normalize via adapters (4 shipped)
- [x] `raw_payload` preserves native objects

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

## Phase 4 readiness checklist

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

## Active docs refresh (post–Phase 3)

Active topic files now reference **`docs/product/bos-foundation.md`** and BOS route/registry language (`api-contracts.md`, `roadmap-and-gaps.md`, glossary, CRM/communications/configuration/record/workspace/roles). **`bos-foundation.md`** remains a redirect stub. See **`completed/bos_foundation_closeout_phase_3.md`** § Documentation refresh.

---

## Suggested commit message (Phase 1 docs only)

```
docs(bos): add BOS foundation, audit, and migration plan for agent standardization

Reframe shipped assistive layer as BOS capabilities without code renames.
Preserve ai-system.md as stub for existing links.
```
