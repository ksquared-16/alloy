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

Doctrine for how execution is *operated* remains
[ENGINEERING-OPERATIONS-CENTER.md](../ENGINEERING-OPERATIONS-CENTER.md). The
prior presentation pass is [UI-REALIZATION.md](../UI-REALIZATION.md). This phase
extends neither; it is the surface they are expressed through.

## Status at a glance

**SHIPPED** — the application shell; Home / Lanes / Activity / System navigation
on desktop and mobile; the Home command centre; the V2 lane (header, tabs,
Current Work, latest output, composer); the Needs You tray at the human
interaction boundary; the Lane Inspector with progressive disclosure; the
Activity feed and its filters; the System surface; the provider progress
contract end to end; the data-maturity layer and the governed placeholder
mechanism; the V2 visual system.

**REPRESENTED BUT NOT WIRED** — swap trajectory; disk on Home before the probe
is called; stale/failed process counts; health history; lane provider usage
aggregation; cost; runtime and context aggregates; lane-scoped Activity; the
Files, Commits and Runs tabs.

**REQUIRES INSTRUMENTATION** — autonomous completion %, human interventions,
retry/rework rate, cache tokens, tests run/passed, certifications, historical
usage windows.

**DEFERRED** — ETA (explicitly refused until a real estimator exists), progress
milestones as activity events, effectiveness analytics.
