---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Alloy Decision Architecture

**Alloy turns operational pressure into operational truth — one decision at a time.**

This folder holds one architecture and the trail that discovered it. If you read one thing, read the architecture.

## Start here

- **[alloy-decision-architecture.md](./alloy-decision-architecture.md)** — the single, final architecture. Operator model, platform model, engineering composition, the fixed vocabulary, BOS doctrine, and the one reusable Focus Panel card. Two minutes for an operator; fifteen for an engineer. Everything else here is provenance.

## Build V1 (from architecture to product)

**The authoritative product + contracts (read these to build):**
- **[scheduling-product-spec.md](./scheduling-product-spec.md)** — the single authoritative product definition, refined for daily operation: Overview at zero/normal/high volume, operator language, Place a Child (four option states + no-valid-room), Over Ratio (cause-first, generated options), the Roster with drill-down to children, commit/undo-as-supersede/history, motion & degraded states, narrow BOS, cross-product handoffs, and V1/V2/Future scope + implementation readiness.
- **[scheduling-calculation-map.md](./scheduling-calculation-map.md)** — every calculation (inputs · output · grain · mode · blocks/warns/ranks/informs · where · maturity). Scheduling invents nothing.
- **[roster-projection-contract.md](./roster-projection-contract.md)** — the Room×Day read model: grid summary · cell drill-down (who's included) · a print-compatible superset (printing stays Studio config, never a source of truth).
- **[temporary-move-policy-model.md](./temporary-move-policy-model.md)** — the anti-shuffle guardrail: platform capability / tenant policy / calculation input / operator decision, kept separate; stable schedules preferred by default; moves never preselected or BOS-suggested unless configured.
- **[engineering-handoff.md](./engineering-handoff.md)** — per-screen build spec, 7-step sequence, acceptance criteria; existing substrate, no new runtime.

**Mockups (production, no annotations):**
- **[mockups/scheduling-product-states.html](./mockups/scheduling-product-states.html)** — the daily states: Overview all-clear & high-volume, Place (four option states), no-valid-room, Over Ratio with temporary-move shapes + continuity, **Roster drill-down to children**, child Focus Panel, commit review→success→undo, and degraded (staffing/stale) states.
- **[mockups/scheduling-product-final.html](./mockups/scheduling-product-final.html)** — the core four surfaces (Overview · Place · Over ratio · Roster), interactive.

*Superseded for product content:* [scheduling-product-v1.md](./scheduling-product-v1.md), [mvp-product-definition.md](./mvp-product-definition.md) — folded into the spec above; kept for the director-questions framing and MVP scope trail.

## The other final artifacts

- **[decision-rfc-recommendations.md](./decision-rfc-recommendations.md)** — what becomes platform doctrine, one RFC, implementation work, future research, and what was discarded. Assumes implementation begins next.
- **[mockups/scheduling-decision-mockups-final.html](./mockups/scheduling-decision-mockups-final.html)** — production-quality communication of the operator experience (Overview · a decision · Roster). No architecture, no annotations — the product.

## The architecture in one screen

```
   Two ledgers Alloy already has          What the operator sees
   ─────────────────────────────          ──────────────────────
   Expectation  (what should be)   ─┐
                                    ├─► PRESSURE ─►  a PROBLEM
   Fact         (what is)          ─┘   (a gap)

            one primitive: the DECISION
            ┌───────────────────────────────┐
   PROBLEM ─► options → tradeoffs → resolve  ─► COMMIT ─► TRUTH
            └──────── reversible ────────────┘  (the edge)   done

   Runs on the existing execution runtime (resolve→evaluate→preview→commit).
   BOS assists every step except choose and commit. No new runtime.
```

## Provenance — the discovery trail (not required reading)

The architecture above was reached over four discovery iterations. These are kept for reasoning and evidence; they are **superseded by the synthesis** and use vocabulary the final architecture has since fixed or retired.

- **[operational-decision-platform.md](./operational-decision-platform.md)** · **[operational-pressure-and-decision-loop.md](./operational-pressure-and-decision-loop.md)** · **[decision-cross-domain-validation.md](./decision-cross-domain-validation.md)** — pressure = gap; the loop = the existing runtime; validated across nine domains.
- **[operational-planning-runtime.md](./operational-planning-runtime.md)** · **[planning-cross-domain-validation.md](./planning-cross-domain-validation.md)** — planning belongs in Work; operators change reality, not plans.
- **[operational-planning-platform.md](./operational-planning-platform.md)** · **[operational-plan-and-commit.md](./operational-plan-and-commit.md)** · **[operational-simulation.md](./operational-simulation.md)** · **[operational-optimization.md](./operational-optimization.md)** · **[scheduling-reference-implementation.md](./scheduling-reference-implementation.md)** · **[planning-focus-panel-evolution.md](./planning-focus-panel-evolution.md)** · **[platform-discoveries-and-roadmap.md](./platform-discoveries-and-roadmap.md)** — the plane→runtime thesis and the Scheduling reference.
- **[studio-platform.md](./studio-platform.md)** · **[architecture-validation.md](./architecture-validation.md)** — the Work-vs-Studio validation (Studio survives as config authoring only).
- Earlier mockups: [v1](./mockups/scheduling-planning-mockups.html) · [v2](./mockups/scheduling-planning-mockups-v2.html) · [v3](./mockups/scheduling-planning-mockups-v3.html) · [v4](./mockups/scheduling-planning-mockups-v4.html).
