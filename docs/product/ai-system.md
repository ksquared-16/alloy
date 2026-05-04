# AI system

## Purpose

Document **actual** admin/agent HTTP routes and env gates in `web/` — not future AI platform plans.

## Current state

- **Agent APIs (Implemented):** All under **`web/app/api/admin/agent/`**:
  - **`.../v0/queue-definition`** — queue definition updates (tests reference this family).
  - **`.../v1/record-overview-layout`**, **`.../v1/activity`**.
  - **`.../v2/field-visibility`** — structured apply path; **disabled unless** **`AGENT_V2_FIELD_VISIBILITY_ENABLED`** is `true`/`1`/`yes` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`).
- **Admin V2 UI** may surface AI/command UX under **`web/app/adminV2/`** (search `ai`, `agent` in subtree).
- **Tests:** `web/tests/agent/` (e.g. queue definition update, field visibility route).

## How it works

- Callers must use normal **admin auth** paths (`getAdminContextCached` / related) as implemented per route.
- Agent commits that touch config (e.g. field visibility) go through validation helpers in **`web/lib/agent/**`** — do not bypass DB invariants.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Agent routes | `web/app/api/admin/agent/**` |
| Agent tests | `web/tests/agent/` |
| Field visibility v2 | `web/lib/agent/v2/*`, `web/app/api/admin/agent/v2/field-visibility/route.ts` |
| Perf/debug globals | `web/lib/perf/alloyPerfGlobal.ts` |

## Guardrails

- **No direct client DB secrets.**
- **Do not** train or prompt against production PII without policy.
- **Configuration updates** made by AI must use the same validation paths as human-submitted JSON (e.g. queue definition schema).
- **Do not** bypass `executeAdminAction` / events when an operation is standardized there.

## Known gaps / risks

- **Needs verification:** Model provider(s), logging/redaction policy, and kill switches **beyond** the `AGENT_V2_*` env pattern — not fully enumerated here.
- **Partially implemented:** Broad “AI command center” product may be **mostly UI/mock** in places — inspect `adminV2` components before treating as production automation.

## When this doc must be updated

New agent routes, env gate names, or when agent behavior becomes customer-facing.
