---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Foundation

The UI/consistency-first pass that established a coherent Vacilando application
shell across desktop browser and mobile, the canonical Home / Lane / Activity /
System patterns, and the data-maturity discipline that keeps the represented
product honest about what is actually wired.

Read in this order:

| Document | What it settles |
|---|---|
| [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) | The audit: who already owns what, and the named gaps found |
| [PRODUCT-IA.md](PRODUCT-IA.md) | The operator-facing shape: navigation, Home, Lane, Activity, System, mobile, primitives |
| [VISUAL-SYSTEM.md](VISUAL-SYSTEM.md) | Grounds, semantic colour, state vocabulary, elevation, mobile |
| [DATA-CONTRACT.md](DATA-CONTRACT.md) | Every field, its maturity, its owner, and what it does in production |
| [PROVIDER-PROGRESS-CONTRACT.md](PROVIDER-PROGRESS-CONTRACT.md) | How a provider reports a completion estimate, and how it is rendered |
| [TELEMETRY-BACKLOG.md](TELEMETRY-BACKLOG.md) | Every gap deliberately left open, tiered by value |
| [CERTIFICATION.md](CERTIFICATION.md) | Desktop and mobile evidence, and how to reproduce it |

Authorization volume — why the operator was asked 182 times in 200 governed
requests, and the standing-grant change that removed 95 of those interruptions —
is [standing-authorization.md](../../../governance/standing-authorization.md).

Doctrine for how execution is *operated* remains
[ENGINEERING-OPERATIONS-CENTER.md](../ENGINEERING-OPERATIONS-CENTER.md). The
prior presentation pass is [UI-REALIZATION.md](../UI-REALIZATION.md). This phase
extends neither; it is the surface they are expressed through.

## Status at a glance

**SHIPPED** — the application shell; Home / Lanes / Activity / System navigation
on desktop and mobile; the Home command centre; the V2 lane (header, tabs,
conversation thread, composer); four-line message previews with per-message
Show more; the operator state vocabulary (WORKING / NEEDS YOU / READY / FAILED)
from one resolver; provider progress rendered inside the lane's status line; the
Needs You tray at the human interaction boundary; the Lane Inspector with
progressive disclosure; the Activity feed and its filters; the System surface;
the provider progress contract end to end; the data-maturity layer and the
governed placeholder mechanism; the V2 visual system.

**REMOVED** — the standalone Current Work card (it duplicated the operator's own
instruction, already shown as the first YOU message); the standalone progress
bar and its caption; `SUSPENDED` as an operator-facing word.

**REPRESENTED BUT NOT WIRED** — swap trajectory; disk on Home before the probe
is called; stale/failed process counts; health history; lane provider usage
aggregation; cost; runtime and context aggregates; lane-scoped Activity; the
Files, Commits and Runs tabs.

**REQUIRES INSTRUMENTATION** — autonomous completion %, human interventions,
retry/rework rate, cache tokens, tests run/passed, certifications, historical
usage windows.

**DEFERRED** — ETA (explicitly refused until a real estimator exists), progress
milestones as activity events, effectiveness analytics.
