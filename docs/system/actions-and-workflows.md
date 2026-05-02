# Actions, workflows, and events

## Purpose

Explain how **business facts** become **`workflow_events`**, trigger **workflows**, and drive **effects** — and how **admin actions** fit in.

**Terminology:** **Admin action** refers to UI/system-triggered admin operations; **workflow action** refers to an ordered step executed inside workflow runs. Disambiguation of terms: **`docs/core/glossary.md`**.

## Current state

- **`emitEvent`** (`web/lib/emitEvent.ts`) inserts into **`workflow_events`** (server-only, canonical layer).
- **`executeWorkflowRun`** (`web/lib/workflowRun.ts`) loads workflow rows, enriches payload with related entities, evaluates conditions, and runs workflow actions (large implementation).
- **`executeAdminAction`** (`web/lib/admin/actions/executeAdminAction.ts`) routes declarative admin operations; for workflow starts it emits an event and invokes `executeWorkflowRun` with `event_id` for event-driven validation paths.
- **Action links:** Consumption routes (e.g. `web/app/api/action/[token]/consume/route.ts`) mark links consumed, emit events, and fan out to enabled workflows.
- **Entity-specific PATCH routes** sometimes emit events directly and loop workflows (e.g. job actions in `web/app/api/admin/jobs/[id]/route.ts`).

## How it works

1. A server path decides a business fact is final (payment posted, job action, link consumed, etc.).
2. It builds a payload (`event_type`, `occurred_at`, `org_id`, entity snapshots).
3. It calls **`emitEvent`** where the canonical layer is used.
4. It queries **`workflows`** filtered by **`event_type`**, **`entity_type`**, `enabled`, and org/global scope.
5. For each match, **`executeWorkflowRun`** records a run and executes actions (side effects).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Event insert | `web/lib/emitEvent.ts` |
| Workflow runner | `web/lib/workflowRun.ts` |
| Admin action execution | `web/lib/admin/actions/executeAdminAction.ts` |
| Action link consume | `web/app/api/action/[token]/consume/route.ts` |
| Manual workflow run API | `web/app/api/admin/workflows/[id]/run/route.ts` |

## Guardrails

- **Do not** implement a new side-effect chain that mutates multiple tables without considering whether it should be workflow-driven for auditability and org parity.
- **Do not** skip **`emitEvent`** when extending event-driven flows that expect **`event_id`** on runs.
- **UI guardrail:** Buttons should call APIs that encapsulate this chain — not replicate it in the client.

## Known gaps / risks

- **Verified (2026-05-02):** Exhaustive route/mutation inventory and **`emitEvent`** coverage — see **`docs/audits/event-integrity-audit.md`**. Remaining high-risk gaps (e.g. GL posting routes, book-v2 discount path, contact create) are listed there.
- Workflow payload still includes **`contact`** alongside **`person`** in `executeWorkflowRun` — treat **`person`** as preferred for new payload enrichment.

## When this doc must be updated

New canonical `event_type` values, changes to `executeWorkflowRun` contract, or admin action types.
