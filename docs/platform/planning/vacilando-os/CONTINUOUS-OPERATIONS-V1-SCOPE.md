---
owner: platform
status: proposed
last_reviewed: 2026-07-22
---

# Vacilando Continuous Operations V1 — Scope

**Status: proposed (scoping only — not started).** This document plans the
initiative; it is not an implementation. Nothing here is built yet.

## Why this exists (the triggering failure)

Sending a mission brief through Director → *Send to Worker* failed with
`provider timed out`. Root cause: *Send to Worker* (`director.ask`) is a
**synchronous, bounded (90 s) advisory round-trip** — it runs `claude -p <text>`
and waits. A mission brief makes the provider *execute* agentic work (minutes),
so it is SIGKILLed at 90 s. Claude auth was fine; the model was wrong.

The deeper truth: Vacilando has no primitive for **running a long-lived mission**.
It can send a bounded advisory `ask`, and `Start Work` only *provisions* a
worktree. There is nothing between "quick question" and "raw terminal session."
Closing that gap is this initiative.

## Success sentence

> An operator can launch a long-running mission from Vacilando, watch it make
> progress without blocking, steer it with follow-up instructions, and stop it —
> without a terminal, and without any single call timing out.

## What exists today (build on, don't duplicate)

- **Provider Runtime** — owns auth/health/capabilities; `sendViaProvider` is the
  one governed path to a provider. Adapters already capture `session_id` and
  support `--resume` (both Claude and Cursor).
- **Director log** — durable per-slot interaction record (`director/<slot>.jsonl`).
- **Outputs projection** — commits, changed files, screenshots per worktree.
- **Command runtime** — preview→confirm→execute→audit; `sprint.start` provisions,
  `server.start/stop`, repo/promotion commands (push/PR/merge stay human-approved).
- **Memory Manager** — reclaims idle dev servers; never touches active work.

The missing piece is an **asynchronous, tracked, resumable mission run**.

## The mission object (new first-class record)

A **mission** is durable Vacilando-owned state (today's gap: "durable
project/mission records"). Minimum shape:

| Field | Meaning |
|---|---|
| `id`, `title`, `brief` | operator's objective text |
| `slot`, `worktree`, `provider` | where it runs |
| `session_id` | provider session for `--resume` steering |
| `lifecycle` | `draft → running → waiting → paused → done → failed` |
| `turns[]` | each instruction + provider result + usage (extends the Director log) |
| `progress` | last output, commits since start, current status line |
| `created/updated` | timestamps |

## Execution model (the core change)

1. **Async, not blocking.** A send starts a **background mission run** and returns
   immediately with `running…`. No request holds a provider for minutes. The
   conversation updates (SSE) when a turn completes.
2. **No hard turn timeout** — a run ends when the provider turn finishes, the
   operator stops it, or a generous safety cap trips (logged, not silent).
3. **Steering via resume.** Follow-up instructions continue the same session
   (`--resume session_id`), so the operator converses with a *running* mission
   instead of firing disconnected one-shots.
4. **Bounded turns, operator-paced (V1 stance).** Each turn is one provider
   invocation the operator initiates or approves. V1 does **not** let the agent
   loop autonomously and unboundedly — that is a separate autonomy/guardrail
   decision (see Open decisions).

## Phases (proposed V1 build — after decisions below)

1. **Async run engine** — a server-side mission-run registry: start a
   `sendViaProvider` turn in the background, track state, persist to a mission
   record, broadcast completion over SSE. (Replaces the blocking `director.ask`
   for mission-class sends; keep the quick bounded `ask` for short questions.)
2. **Mission record + lifecycle** — durable store + `mission.start / instruct /
   pause / resume / stop` governed commands (audited).
3. **Steering** — resume-chained turns; the Director surface shows a live mission
   with its turns, status, and a compose box that continues the session.
4. **Progress surface** — mission card: status, last output, commits-since-start,
   token/cost usage, "running…/waiting/done."
5. **Fit with existing runtimes** — Memory Manager counts a running mission as
   active (never reclaims it); Scheduler accounts for mission load; Provider
   Runtime supplies auth/usage.

## Governance & safety (invariants preserved)

- Loopback only; no arbitrary shell; fixed-argv + stdin transport.
- **Release/merge/promote never auto-approved** — a mission may commit, but
  push/PR/merge remain explicit human actions.
- Never auto-pause active work; auth owned by Provider Runtime.
- Every turn and lifecycle transition audited. A mission cannot exceed the
  governance envelope just because it runs longer.

## Open decisions (need Kelly before any build)

1. **Autonomy.** V1 = operator-paced bounded turns (safe), or agent runs
   autonomously toward "done" with guardrails (bigger, riskier)? *Recommended:
   operator-paced for V1.*
2. **Persistence model.** Resume-chained `-p` turns (simple, governed) vs a live
   interactive session (richer, harder to govern headlessly)? *Recommended:
   resume-chained for V1.*
3. **Concurrency.** How many missions run at once? (ties to Memory Manager +
   Scheduler under this machine's pressure).
4. **Where missions live.** New durable mission store — its own file/db under the
   runtime state; confirm the shape above.
5. **"Continuous" meaning.** Long single missions that finish, vs an
   always-on operator loop? V1 assumes the former.

## Explicitly OUT of scope for V1

Unbounded autonomous loops; multi-worker mission orchestration; scheduled/cron
missions; cross-machine (remote host) execution; auto-promotion of mission output.

## Acceptance (what "done" looks like)

Launch "Vacilando Continuous Operations V1" from the Director; it runs in the
background (no timeout), shows progress, accepts a follow-up steering instruction
mid-run, and can be stopped — all from Vacilando, all audited, with push/merge
still human-approved.
