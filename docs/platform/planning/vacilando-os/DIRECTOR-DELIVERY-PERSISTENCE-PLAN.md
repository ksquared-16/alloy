---
owner: platform
status: proposed
last_reviewed: 2026-07-22
---

# Director Delivery Persistence & Status — Plan

**Status: proposed (plan only — not implemented).** Awaiting approval before any
build. Scope: make every Director send durable, immediately visible, and
traceable from submission through completion or failure. Does NOT include
Continuous Operations.

## 1. Root cause

Vacilando records **results, not requests**. The instruction is persisted only
after the provider round-trip returns:

```
director.ask.run:  const response = await sendViaProvider(...)   // blocks up to 90s
                   const rec = recordAsk({ ..., response })       // writes jsonl AFTER
```

`recordAsk` requires a `response` — there is no "request accepted" record and
nothing is written at submission time. The frontend `execute()` awaits ONE
synchronous `POST /api/commands` for the whole round-trip and appends nothing
until it returns; SSE broadcasts only `snapshot` (sprints), never director-log
changes. So between Send and completion there is no durable record, no status,
no visible change — and a refresh in that window shows nothing.

## 2. Current request lifecycle (as-is)

- Draft → `sessionStorage` (client only).
- Send → preview → confirm dialog (client).
- Confirm → `execute()` → blocking `POST /api/commands` (≤90s); toast only.
- Server: `sendViaProvider` blocks → `recordAsk` writes `director/<slot>.jsonl`
  (result, after execution). Timeout (90s) → SIGKILL → recorded as failure.
- POST returns → toast → `clearDraft` (success only) → `fetchDirector` re-renders.
- Refresh mid-flight → no trace (no pre-record).

7-question findings: (1) `director/<slot>.jsonl`; (2) no — after execution;
(3) nothing until the blocking POST returns; (4) `fetchDirector` poll after
completion, no SSE; (5) nothing appended at submit; (6) refresh loses in-flight
sends; (7) both success and failure written, but only post-execution.

## 3. Durable request schema

Append-only request store (`director/requests.jsonl`), written BEFORE execution,
projected to current state on read (Vacilando projection + audit doctrine).
Fields: `request_id, mission_id?, worker_slot, provider, instruction, status,
created_at, updated_at, started_at, completed_at, failed_at,
provider_session_id, response, error, usage, audit_ref`. Lifecycle events
(`created → sending → responded|failed|cancelled`) fold into the current record
per `request_id`. The store — not the browser — is the source of truth for
submitted sends. Drafts stay client-side; submitted sends do not.

## 4. UI state transitions

Draft → Awaiting confirmation → **Queued** (request.created; instruction appended
+ timestamp; dialog closes; duplicate submit disabled) → **Sending** (started_at)
→ **Delivered to worker** (provider accepted) → **Worker running** (elapsed timer)
→ **Worker responded** (response + duration + usage) | **Authentication required**
(Reconnect) | **Failed** (Retry, instruction preserved) | **Cancelled**. No vague
"sent" before the provider request is accepted.

## 5. Refresh / recovery

Server store authoritative. On load / select / reopen Slot 6:
`GET /api/director/requests?slot=N` → render every request at current status.
In-flight restore live (SSE/poll advances them); completed/failed remain; Draft
restored from sessionStorage. Browser never holds a synchronous request open to
learn delivery outcome.

## 6. Smallest complete vertical slice

Validate on cursor (authed + fast); claude rides the same path.
- Backend: request-store module (`create` writes Queued before execution,
  `update` advances status). Refactor `director.ask` to create-first + return
  `request_id` immediately (non-blocking accept), run the provider turn in the
  background, update `Sending → Worker running → responded|failed`. Broadcast via
  a new SSE `director` event + `GET /api/director/requests?slot=N`.
- Frontend: on confirm, POST creates request, returns request_id at once; append
  instruction as Queued + timestamp; close dialog; disable duplicate submit;
  clear draft only once request is durably created, preserve on creation failure.
  Subscribe to updates → advance row (elapsed during Worker running) → terminal
  state with response/usage or Failed/Auth-required + Retry/Reconnect. Hydrate
  from the store on load.

Delivers the full trust loop: created-before-execution, immediate visibility,
live status, refresh recovery, failure preserves instruction.

## 7. Live QA plan

1. Send → Queued + timestamp immediately; POST returns fast (no 90s hold).
2. `director/requests.jsonl` has the request before completion.
3. During run → Sending → Worker running with elapsed time.
4. Refresh mid-flight → pending request still visible with live status.
5. Completion → Worker responded + response + duration + usage.
6. Claude timeout/auth → Failed / Authentication required; instruction preserved;
   Retry / Reconnect shown.
7. Duplicate submit disabled for the same request_id.
8. Navigate away + back / reopen Slot 6 → all submitted/pending/completed/failed
   requests restored from the store.

## Out of scope

Continuous Operations (async long-running missions), autonomy loops, multi-worker
orchestration. This plan only makes single Director sends durable and traceable.
