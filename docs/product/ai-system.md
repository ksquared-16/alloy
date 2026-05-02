# AI system

## Purpose

Bound how **AI / agents** interact with Alloy: through **validated APIs** and admin surfaces — not raw database access from clients.

## Current state

- Admin V2 includes AI command surface components/specs (archived under docs reset); active code paths live under **`web/app/adminV2/`** and related **`web/lib/`** agent helpers.
- Tests exist for agent behaviors (e.g. `web/tests/agent/applyWorkUnitQueueDefinitionUpdate.test.ts`).
- Older “AI foundation” architecture markdown is archived; this doc reflects only what is confirmed in code layout:

## How it works

- **Needs verification:** Exact production agent entrypoints (HTTP routes vs internal tools) — search `web/app/api` for agent-specific routes when implementing.
- Agents that mutate org configuration (e.g. queue definitions) should follow the same validation paths as human admins (schema validation, org scope).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Agent tests | `web/tests/agent/` |
| Admin V2 AI UI | `web/app/adminV2/` (search `ai`, `agent` in subtree) |
| Perf/debug globals | `web/lib/perf/alloyPerfGlobal.ts` |

## Guardrails

- **No direct client DB secrets.**
- **Do not** train or prompt against production PII without policy.
- **Configuration updates** made by AI must be validated the same as human-submitted JSON (e.g. queue definition schema).
- **Do not** bypass `executeAdminAction` / events when an operation is standardized there.

## Known gaps / risks

- **Needs verification:** Full AI stack (model providers, tool routing, logging, redaction).
- **Needs verification:** Production feature flag / kill switch locations.

## When this doc must be updated

New AI surfaces, tool permissions, or when agent routes become first-class public contracts.
