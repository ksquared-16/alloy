---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Canonical Owner Map (audit before implementation)

Produced by the UI Foundation mission before any broad implementation, as required by
§0 of the approved instruction. Every row is evidence-backed: the file and symbol that
**already** owns the concern. Nothing in this mission creates a parallel owner for a row
that is filled in.

Read with: [Engineering Operations Center](../ENGINEERING-OPERATIONS-CENTER.md) (product
doctrine), [UI Realization](../UI-REALIZATION.md) (the prior presentation pass).

## 1. The surface as it exists

The Vacilando operator UI is a dependency-free browser SPA served by the local gateway.
There is no framework and no build step.

| File | Lines | Role |
|---|---|---|
| `scripts/local-dev/apps/vacilando/public/index.html` | 95 | Static shell: rail, brand, topbar, view mount, login card |
| `scripts/local-dev/apps/vacilando/public/styles.css` | 2395 | The entire visual system, including the 7-colour approved palette |
| `scripts/local-dev/apps/vacilando/public/gateway-view.mjs` | 5157 | **Canonical view owner** — pure render + derivation functions, heavily unit-tested |
| `scripts/local-dev/apps/vacilando/public/gateway.js` | 2994 | **Canonical controller** — routing, fetch, polling, event binding, all mutable state in `G` |
| `scripts/local-dev/apps/vacilando/public/app.js` + `mission-control.js` | 6633 | Legacy Command Center board (`#/command`, `#/workspaces/:id`), reachable but not primary |
| `scripts/local-dev/lib/vacilando-server.mjs` | 2957 | HTTP server, static serving, v1 API, gateway session/push |
| `scripts/local-dev/lib/vacilando/v2-api.mjs` | ~1800 | **Canonical API router** for `/api/v2/*`, including every `views/*` projection |

The SPA today has exactly two primary destinations: the lane list (`#/lanes`) and lane
detail (`#/lanes/:id`), plus `#/settings`. `isGatewayRoute()` (`gateway-view.mjs:67`)
admits only `lanes` and `settings`. There is **no Home, Activity, or System route** —
that is the largest single gap this mission closes.

## 2. Canonical owners

| Concern | Canonical owner | Evidence |
|---|---|---|
| Application shell | `renderGatewayShell()` | `gateway-view.mjs:4811` |
| Desktop navigation | `.rail` in `index.html` + `railHtml()` / `railLaneRow()` | `index.html:60`, `gateway-view.mjs:5131`, `:5099` |
| Mobile navigation | **none** — mobile is the desktop lane list at `MOBILE_MAX_PX` | `gateway-view.mjs:23`; only `is-detail`/drawer behaviour exists |
| Lane list | `renderLaneList()` + `laneRow()` + `sortLanesForIndex()` | `gateway-view.mjs:3220`, `:3015`, `:1175` |
| Lane detail | `renderGatewayShell()` `kind === "detail"` branch | `gateway-view.mjs:5020`–`5095` |
| **Lane state (canonical)** | `canonicalLaneWorkState()` over `deriveLaneExecutionPosture()` | `gateway-view.mjs:988`, `:671` |
| Provider/session state | `agent-session-lifecycle.mjs` (`attachLaneAgentSessions`) | `lib/vacilando/agent-session-lifecycle.mjs` |
| Provider context usage | `lane-telemetry.mjs` → `/api/v2/lanes/telemetry` | `lib/vacilando/lane-telemetry.mjs:123`; view `contextCompact()` `gateway-view.mjs:2938` |
| Approvals / governance | `governed-action-request.mjs` (3990 lines) → `/api/v2/governed-actions` | `lib/vacilando/governed-action-request.mjs:817` `pendingApprovals()` |
| Notification generation | `lane-notify.mjs` | `lib/vacilando/lane-notify.mjs:167` |
| Mobile/push delivery | `governed-notification-delivery.mjs` + `/api/gateway/push/*` | `lib/vacilando/governed-notification-delivery.mjs`, `vacilando-server.mjs:1000`–`1021` |
| **Execution/run state** | `execution-run.mjs` — `RUN_STATES`, `reportRunState()`, `publicExecutionRun()` | `lib/vacilando/execution-run.mjs:33`, `:1054`, `:380` |
| Run event log | `executionRunEventsPath()` → `execution-runs/events.jsonl` | `lib/vacilando/execution-run.mjs:107`, `appendRunEvent()` `:307` |
| Browser / QA session | `browser-auth.mjs` (`attachLaneBrowserAuth`, `qaIdentityForSlot`) | `lib/vacilando/browser-auth.mjs:137` |
| Repository / Git state | `source-control.mjs` (`SCM_POSTURES`, `attachLaneSourceControl`) | `lib/vacilando/source-control.mjs:20`, `:134` |
| Slot / capacity state | `managed-slots.mjs` + `execution-admission.mjs` + `capacity-policy.mjs` | `managed-slots.mjs:249`, `execution-admission.mjs:23`, `capacity-policy.mjs:215` |
| Host telemetry | `health-probes.mjs` (load/memory/disk/gateway) + `resources.mjs` `collectResources()` | `health-probes.mjs:55`–`:187`, `resources.mjs:148` |
| Host health judgement | `health.mjs` `composeReport()` + per-check functions | `lib/vacilando/health.mjs:939` |
| AI provider/model usage | `usage.mjs` `collectUsage()` → `/api/usage`; `/api/v2/platform/usage` events | `lib/vacilando/usage.mjs:26`, `v2-api.mjs:1066` |
| Activity / event history | `activity.mjs` `projectActivity()` (git+worker projection, sprint-shaped) | `lib/vacilando/activity.mjs:21` |
| Mission timeline | `timeline.mjs` `readTimeline()` (mission-scoped, not lane-scoped) | `lib/vacilando/timeline.mjs:112` |
| Responsive presentation | `styles.css` media queries at `MOBILE_MAX_PX` / `DESKTOP_MIN_PX` | `gateway-view.mjs:12`, `:23` |
| Product/runtime documentation | `docs/platform/planning/vacilando-os/` | `ENGINEERING-OPERATIONS-CENTER.md`, `UI-REALIZATION.md` |

## 3. What this mission adds, and where it attaches

No new owner is created for any filled row above. The three genuinely empty rows are
mobile navigation, a lane-scoped activity projection, and provider progress.

| Addition | Attaches to existing owner | Why there |
|---|---|---|
| Home / Activity / System routes | `parseGatewayHash()`, `isGatewayRoute()`, `renderGatewayShell()` | The router and shell already exist; adding destinations is not a new owner |
| Primary + mobile navigation | `index.html` shell + new `renderPrimaryNav()`/`renderMobileNav()` in the view module | The rail is shell markup today; navigation becomes data-driven in the canonical view owner |
| Progress estimate | `execution-run.mjs` — extends the existing `latest_progress` field (`:302`) into `progress_estimate` | The run already carries a worker-reported progress *summary*; percent/confidence/source join it rather than forming a second system |
| Progress reporting CLI | `vac-run-status.mjs` (already the worker→run reporting path) | Workers already report state here; a second CLI would be a parallel system |
| Activity projection | New `/api/v2/views/activity` reading `execution-runs/events.jsonl`, SCM events, admission events, governed actions | Those event logs already exist and are already appended to; this is a *projection*, not a store |
| Home / System projections | New `/api/v2/views/home`, `/api/v2/views/system` composing `collectResources()`, `health.mjs`, `managed-slots.mjs`, `collectUsage()`, `pendingApprovals()` | Composition of existing owners; no metric is computed twice |
| Data maturity | New `vacilando-ui-model.mjs` — one typed view model with an explicit per-field maturity | §9/§10 of the instruction require it and nothing owns it today |

## 4. Named gaps found during the audit

These are carried into the data contract and the telemetry backlog, not fixed here.

1. **`activity.mjs` is sprint-shaped, not lane-shaped.** It projects from `sprintsCtx`
   (git commits + `alloy-ro worker-detail` fields) and knows nothing about Execution Runs,
   governed actions, or lanes. The richer lane-scoped event material already exists in
   `execution-runs/events.jsonl` — it has simply never been projected for the UI.
2. **`usage.mjs` reads only Director round-trips** (`r.delivery !== "provider-round-trip"`
   is skipped), so lane provider usage — the majority of real token spend — is not
   aggregated anywhere. `PRICING` is deliberately empty, so cost is authoritative-or-none.
3. **No effectiveness instrumentation exists.** There is no run-outcome event that
   distinguishes "completed autonomously" from "completed after operator intervention",
   so autonomous-completion % is not derivable from any current store.
4. **Swap *level* is measured, swap *trajectory* is not persisted.** `collectResources()`
   returns `mem.swap` and `capacity-policy.mjs` reads `swapouts_delta` from a live sample,
   but nothing writes a rolling series, so a pressure *trend* has no source.
5. **The brand mark sits on a different ground from the rail it lives in.**
   `.brand-mark` paints `background:var(--bg)` (cream `#f6f2ea`) inside `.rail`, which
   paints `var(--card)` (white). That is the visible mismatch §1 calls out.
6. **Semantic colour is disconnected from the brand palette.** `--green #3a8a5b`,
   `--plan #5f7c9a`, `--review #c98a2e`, `--blocked #cf5a3a` are all outside the approved
   seven, so healthy/active/attention state does not read as the same product.

## 5. Non-goals of this phase

Backend telemetry depth (§12). Where a metric needs new instrumentation the UI carries
the contract and the governed unavailable state, and the gap is written down in
[the data contract](DATA-CONTRACT.md) and [the backlog](TELEMETRY-BACKLOG.md).
