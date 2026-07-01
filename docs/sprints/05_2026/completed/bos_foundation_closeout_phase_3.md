# BOS Foundation Closeout — Phase 3

**Status:** Complete (2026-05-18)  
**Prerequisites:** Phase 1 audit/foundation docs, Phase 2 registry + envelope

## Goal

Finish the BOS foundation so future capabilities can be added without drift — boundary wiring and documentation only.

## Shipped

| Item | Location |
|------|----------|
| Command-surface envelope wiring | `appendActionCardTurnWithBosMetadata`, `AICommandSurfaceShell` (workflow + config proposal cards) |
| Legacy config commit adapters | `agentV0*`, `agentV1*`, `agentV2*` in `web/lib/bos/adapters/` |
| Auth barrel | `web/lib/bos/auth/index.ts` |
| Adapter catalog | `web/lib/bos/bosAdapterCatalog.ts` |
| Readiness tests | `web/tests/bos/bosFoundationReadiness.test.ts` |

## What is now standardized

1. **Vocabulary** — BOS, capability_key, domain, proposal envelope (see `docs/product/bos-foundation.md`).
2. **Registry** — `BOS_CAPABILITY_REGISTRY` lists all 10 shipped capabilities with policy metadata.
3. **Proposal envelope** — `BosProposalEnvelopeV1` + adapters for 7 proposal families (4 operational/config + 3 legacy commits).
4. **Thread metadata** — Optional `bos_envelope` on command-surface `action_card` turns; optional `capability_key` on cards.
5. **Auth hints** — `@/lib/bos/auth` re-exports existing enrichment portal gates; `getBosCapabilityAccessHints()` for policy discovery.

## Intentionally deferred

| Item | Reason |
|------|--------|
| New BOS capabilities | Program pause / operational roadmap |
| Config/Layout apply catalog expansion | Product scope |
| `/api/admin/ai` → `/bos` rename | Breaking |
| `web/lib/agent` migration | High blast radius |
| Proposal table merge | Different lifecycles |
| Autonomous apply | Doctrine |
| Public API envelope fields | Native payloads remain authoritative |
| `job_overview_layout` adapter | Planner card uses agent v1 route directly; registry documents path |
| Auth enforcement in BOS barrel | Routes keep existing guards |

## Rules for adding a future BOS capability

1. **Register first** — Add `BosCapabilityDefinition` to `bosCapabilityRegistry.ts` (do not ship UI without registry entry).
2. **Classify** — Pick `domain`, `proposal_mode`, `apply_policy`, `requires_human_approval`.
3. **Native contract** — Keep strongly typed proposal in `web/lib/agent/<area>/` (or documented module).
4. **Envelope adapter** — Add `*ToBosProposalEnvelope()` in `web/lib/bos/adapters/`; must set `raw_payload` to native object by reference.
5. **Auth** — Use existing route guards; document keys in registry `propose_permission_keys` / `org_policy_features`.
6. **Orchestrator** — If command-bar visible, extend `routeCommandSurface` + `COMMAND_SURFACE_CARD_CAPABILITY_KEY`; use `appendActionCardTurnWithBosMetadata` when showing proposal cards.
7. **Tests** — Extend `web/tests/bos/` (registry + adapter raw_payload preservation).
8. **Docs** — Update `bos-foundation.md` capability table in same PR.

**Do not:** add parallel apply paths, bypass RPC/workflow/communications canonical routes, or rename URLs without an explicit migration sprint.

## Phase 4 options (not started)

- Unified proposal inbox UI reading `bos_envelope` from thread or durable tables
- Optional `bos_envelope` on internal admin API debug responses
- `job_overview_layout` envelope adapter when inbox needs parity
- Consolidate `bos-foundation.md` stub into bos-foundation only (doc cap)
- Telemetry events using `buildBosEnvelopeLogSummary()`

## Documentation refresh (post-closeout)

Active topic pack updated to reference **`bos-foundation.md`** and BOS terminology:

- `docs/core/glossary.md`, `docs/system/api-contracts.md`, `configuration-system.md`, `record-system.md`, `roles-and-permissions.md`, `workspace-system.md`
- `docs/product/crm-system.md`, `communications.md`
- `docs/execution/roadmap-and-gaps.md`
- `docs/README.md` load order

Historical sprint docs may still cite `bos-foundation.md` (stub redirects). Prefer **`bos-foundation.md`** for new edits.

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/bos
```
