---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando Project OS — V1

**Slot 6** · branch `agent/claude/6-vacilando-os-product-def` · served at `http://127.0.0.1:3020` (loopback).
Convergence of the runtime + command + provider + resource capabilities into one V1 operating experience:
a **Team Dashboard** by default, worker-selection that replaces it in place, real provider round-trips,
governed repository lifecycle, a deterministic scheduler, and a **corrected macOS resource model**.

## Phase 0 — recon & keep/converge/remove

Served == committed: HEAD `329180f0a`+ (this sprint on top), shell serves `app.js?v=<contenthash>`
(auto-busting) + `X-Vacilando-Build`. Six slots live (5 claude / 1 cursor). All Phase-1..control-room
capabilities present and green.

| Prior surface | Decision | Where it lives in V1 |
|---|---|---|
| Sprints / Workers pages | **remove** → converge | Worker Dock + Team Dashboard + selected-worker surface |
| Repository page | **remove** → converge | selected worker → Repository tab (+ governed commands) |
| Approvals page | **remove** → converge | Needs You (actionable) + review.resolve |
| Activity page | **remove** → converge | selected worker → History + dashboard Recent Outputs + Work History |
| Six-KPI strip | **remove** | replaced by Team Dashboard sections |
| `os.freemem()` memory calc | **remove (wrong)** | vm_stat + kernel pressure level |
| Runtime/commands/providers/audit/policies | **keep** | unchanged foundation |

## V1 architecture

- **Shell:** Command Center · Work History · Policies · Settings. Identity **Admin**. Warm desert identity preserved.
- **Command Center = three regions:** LEFT Worker Dock · CENTER Team Dashboard (default) or selected-worker surface · RIGHT Needs You.
- **URL-driven center:** `#/command` → dashboard; `#/command/worker/N` → that worker (reload + back/forward preserve).
- **Backend added:** `resources.mjs` (macOS-authoritative memory), `usage.mjs` (provider usage/cost), `scheduler.mjs` (deterministic recommendations), `/api/dashboard` (team+machine+usage+scheduler+throughput+operator-load), plus prior providers/github/policies/review/outputs modules.

## Data-model boundary (V1)

- **Vacilando-owned durable records:** Director interactions (`director/*.jsonl`), review dispositions (`reviews.jsonl`), execution audit (`audit.jsonl`). (Project/mission durable records are the V1.1 seam — see gaps.)
- **Projected external state (never copied into a mutable store):** git worktree/branch/commit/PR state, provider process + local server status, resource metrics. Enforced by the projection modules reading `alloy-ro`/git/gh/OS at request time.

## Resource investigation — before / after (macOS)

The dashboard previously showed **CPU ~100% / memory 99% "high"**. Investigation found these were
**measurement errors**, not Vacilando waste (Vacilando's server isn't in the top consumers; top load is
WindowServer + a Virtualization VM + Claude/Chrome apps).

| Metric | Before (wrong) | After (macOS-authoritative) |
|---|---|---|
| Memory | `os.freemem()` → 99% used, 1% free | `vm_stat`: used = active+wired+compressed; **available = free+inactive+speculative+purgeable**; e.g. 75% used / 6.1G available |
| Pressure | inferred "high" from used% | **`kern.memorystatus_vm_pressure_level`** (1 normal / 2 warn / 4 critical) — authoritative |
| Components | none | active / wired / compressed / available / swap all surfaced |
| CPU load | 1-min (spiky, showed 41 during round-trips) | 5-min load / cores (steadier) |
| Efficiency | single-flight snapshot + resource cache already; **added** visibility-aware polling (paused when tab hidden), QA browsers closed after capture | no overlapping composes; no all-worker scans per UI tick |

Conclusion: **no new hardware is indicated**; the alarm was a semantics bug. Real pressure is surfaced
honestly (swap %, compressed) and drives scheduler recommendations.

## Scheduler runtime V1
Deterministic (no AI): worker states (active/waiting/paused/idle/blocked/queued), workload profiles,
inputs (pressure/load/swap/slots), outputs (may-start, safe slot, reclaim-idle, queue). Auto-scheduling
**off by default**; recommendations only; never auto-pauses active work.

## Certification journey (status)
The full end-to-end fixture journey (create worktree → assign → instruct → review → commit → push → PR →
delete) requires a **dedicated disposable fixture repo** and a free slot; per safety it must not touch
active Alloy work. **Proven live and safe today:** real Cursor round-trip (`director.ask`), review
resolution, governed PR/promotion previews (exact `gh` argv), authoritative PR reads, corrected resources.
The remaining real push/merge/delete steps are governed + previewable but were **not executed** (safety);
running them end-to-end on a fixture repo is the V1 acceptance step to complete next (see gaps).

## Known remaining gaps → V1.1
1. Durable **project/mission** records + Work History project/mission rollup (audit is the seam today).
2. Full **Start Work wizard** steps 1–4 (project/mission/worker/plan) and **queue** execution when full (preview + refuse-or-queue exists; queue persistence is V1.1).
3. **Certification fixture repo** to run the full push/PR/merge/delete journey safely end-to-end.
4. **Kelly-minutes** elapsed-time instrumentation (event foundation in place; value marked unavailable).
5. **Claude** provider: OAuth expired → live Claude answers need an operator `claude` re-auth (Cursor works).
6. Provider **cost** for Cursor (no authoritative price) — needs a configured pricing table.

## QA artifacts
`docs/platform/planning/vacilando-os/qa/v1/` — dashboard, worker-selected, director (real round-trip),
resources, outputs (rendered screenshot), repository-PR, promotion preview, start-work, end-work, policies,
work-history (+ review dialog in `qa/current/09-review-approval.png`). Checklist in `qa/v1/README.md`.

## Safety
Loopback only. During QA nothing was pushed/promoted/merged/deleted; consequential repo commands were
previewed and cancelled. The only real provider call was a read-only Cursor round-trip. No credentials
captured. Suites green (Node 22): cert 15/15 · vacilando 26 · alloy-ro 57.
