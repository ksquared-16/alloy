---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — Product Definition (frozen) & the Decision Architecture

**Alloy turns operational pressure into operational truth — one decision at a time.**

Scheduling Product Discovery is **closed**. This folder holds the frozen product definition, the contracts engineering builds from, and the discovery trail that produced them.

## ▶ Implementation handoff — start here

- **[assignment-platform-phase-2-handoff.md](./assignment-platform-phase-2-handoff.md)** — **active sprint handoff (2026-07-26):** Phase 2 worktree/branch state, what landed vs what is **not** browser-proven, ordered resume checklist (Gender Save first). Read this before continuing Phase 2 implementation.
- **[SCHEDULING-IMPLEMENTATION-READINESS.md](./SCHEDULING-IMPLEMENTATION-READINESS.md)** — the frozen product/engineering handoff: **(A)** must-fix before implementation (no real blockers; a few small decisions), **(B)** safe to defer, **(C)** the frozen product decisions engineering treats as authoritative, **(D)** the exact build order — plus the canonical document map.

## The architecture (why the product is shaped this way)

- **[alloy-decision-architecture.md](./alloy-decision-architecture.md)** — the single, final architecture. Operator model, platform model, engineering composition, the fixed vocabulary, BOS doctrine, and the one reusable Focus Panel card. Two minutes for an operator; fifteen for an engineer. Everything else here is provenance.

## Build V1 (from architecture to product)

**The authoritative product + contracts (read these to build):**
- **[scheduling-projection-contract.md](./scheduling-projection-contract.md)** — *(final, the implementation contract)* the one canonical Scheduling projection: **subject-scoped** (household | child — same card, `children[]` is just longer) and **assignment-based**. The **Assignment** (room × weekdays × times × effective dates) is the shared atom; every surface — Focus Panel, workspace, Roster drill-down, Command Surface, print, BOS — is an *index* over assignments, so there is one model and no duplication. Lifecycle = **Current · Upcoming · Temporary · History**; one schedule, many assignments; the pattern editor is a focused command; rates/tuition shown by Scheduling, ledger owned by Billing.
- **[assignment-platform-vnext-operational-scheduling.md](./assignment-platform-vnext-operational-scheduling.md)** — *(proposed, design-only)* Assignment Platform VNext: capability inventory, templates, Transition Plans, Horizon Timeline, conflicts, seasonal/temporary shapes, BOS posture — **not an implementation sprint**.
- **[rooms-and-programs-vnext-operational-space.md](./rooms-and-programs-vnext-operational-space.md)** — *(proposed, design-only)* Rooms & Programs VNext: Physical Space vs Operational Room, capacity/ratio/eligibility ownership, configuration hierarchy, BOS recommendations, Assignment integration — **not an implementation sprint**.
- **[assignment-platform-settings-inventory.md](./assignment-platform-settings-inventory.md)** — *(proposed, inventory-only)* Assignment Settings ownership map — types, defaults, policies; no Settings UI in Phase 2C.
- **[assignment-platform-phase-2c-operator-workflow.md](./assignment-platform-phase-2c-operator-workflow.md)** — *(proposed)* Phase 2C operator workflow: scan → detail → create/edit/archive/duplicate.
- **[assignment-platform-phase-2d-remaining.md](./assignment-platform-phase-2d-remaining.md)** — *(proposed)* Phase 2D gate: migrations, Scheduling card layout availability, full Focus Panel browser cert.
- **[scheduling-product-spec.md](./scheduling-product-spec.md)** — the single authoritative product definition, refined for daily operation: Overview at zero/normal/high volume, operator language, Place a Child (four option states + no-valid-room), Over Ratio (cause-first, generated options), the Roster with drill-down to children, commit/undo-as-supersede/history, motion & degraded states, narrow BOS, cross-product handoffs, and V1/V2/Future scope + implementation readiness.
- **[scheduling-pattern-and-financial-spec.md](./scheduling-pattern-and-financial-spec.md)** — *(final correction)* week structure **from configuration** (no hardcoded weekday order); the pattern editor (default hours + per-day overrides = assignments); **Billing returns eligible rate choices + a recommended default**; authorized rate **override** (permissioned, approval-gated); **discounts & funding as numeric amounts** (or explicit pending) with **family responsibility**; the neutral **visual-language correction** (money is not a warning); and the ownership/write-path matrix.
- **[billing-rate-resolution-contract.md](./billing-rate-resolution-contract.md)** — *(final correction)* the `BillingScheduleProjection` contract (recommended + eligible rates · selected/override · numeric discounts · numeric funding · totals + family responsibility), mapped onto the **existing** commercial pricing/attribution pipeline, plus the **implementation gap report** and the **blocker statement**.
- **[scheduling-billing-boundary.md](./scheduling-billing-boundary.md)** — *(final)* the Scheduling ↔ Billing seam: Scheduling commits **schedule intent** and **displays** a read-only Billing projection; **Billing owns** rate, discounts, funding, tuition, and the entire ledger. Scheduling never selects a rate or computes money. (Projection shape refined by the rate-resolution contract above.)
- **[children-scheduling-boundary.md](./children-scheduling-boundary.md)** — *(final)* the configuration boundary: the **Children card is a configurable business surface** (Surface Builder); the **Scheduling card is a platform-owned operational surface**. Peer cards composed by **navigation, not embedding**, with a one-owner-per-capability ownership table.
- **[schedule-lifecycle-and-object.md](./schedule-lifecycle-and-object.md)** — *(final)* a child has **many** schedules over time (current · **upcoming** · temporary · seasonal · proposed · history), the full **schedule object**, the **pattern editor** (days + default hours + per-day/room overrides + effective dates + temporary), and the **effective-dating** model. *(Rate/tuition are Billing-determined and merely displayed — see the Billing contract.)*
- **[scheduling-focus-panel-composition.md](./scheduling-focus-panel-composition.md)** — the Focus Panel separated into **Identity · Work · Commands**: the Summary card is pure identity; operational work moves to a **Work card**; siblings become quiet **Household** context; commands stay configured.
- **[scheduling-focus-panel-spec.md](./scheduling-focus-panel-spec.md)** — the Focus Panel card system detail (fixed label↔value patterns, transitions, create/change/end, configured commands). Its Summary-card section is refined by the composition doc above.
- **[scheduling-card-projection.md](./scheduling-card-projection.md)** — the one composed read model both card layers render; identity, effective-date/current-vs-future/proposed-vs-committed semantics, sibling resolution, freshness, provenance, error states, and which calculation appears where.
- **[scheduling-binding-matrix.md](./scheduling-binding-matrix.md)** — proves every value has a canonical owner: the config/facts/intent/calc/projection **binding matrix**, the **Configured Command Binding Matrix**, and the **Implementation Gap Report** (required-before / during / V2 / future).
- **[scheduling-calculation-map.md](./scheduling-calculation-map.md)** — every calculation (inputs · output · grain · mode · blocks/warns/ranks/informs · where · maturity). Scheduling invents nothing.
- **[roster-projection-contract.md](./roster-projection-contract.md)** — the Room×Day read model: grid summary · cell drill-down (who's included) · a print-compatible superset (printing stays Studio config, never a source of truth).
- **[temporary-move-policy-model.md](./temporary-move-policy-model.md)** — the anti-shuffle guardrail: platform capability / tenant policy / calculation input / operator decision, kept separate; stable schedules preferred by default; moves never preselected or BOS-suggested unless configured.
- **[engineering-handoff.md](./engineering-handoff.md)** — per-screen build spec, 7-step sequence, acceptance criteria; existing substrate, no new runtime.

**Mockups (production, no annotations):**
- **[mockups/scheduling-financial-command.html](./mockups/scheduling-financial-command.html)** — *(final correction)* config-driven week (Sunday-first / Monday-first toggle) + Tuesday override, Billing rate choice (recommended + eligible), authorized & unauthorized override, the financial preview with **numeric** discounts/funding + family responsibility + funding-pending, change before/after, and temporary/future/stale — all in **neutral** money styling.
- **[mockups/scheduling-billing-projection.html](./mockups/scheduling-billing-projection.html)** — the Scheduling ↔ Billing projection (create-with-preview, card tuition, change before→after, temporary/future). Superseded on money styling + rate choice by the command mockup above.
- **[mockups/scheduling-projection.html](./mockups/scheduling-projection.html)** — the same Scheduling card projecting **household** vs **child**, the lifecycle, **multiple assignments** (split week), rate changes, and the pattern editor.
- **[mockups/scheduling-children-composition.html](./mockups/scheduling-children-composition.html)** — the Children ↔ Scheduling composition: two peer cards, the multi-schedule timeline, pattern editor, rates, household navigation.
- **[mockups/scheduling-focus-panel-final.html](./mockups/scheduling-focus-panel-final.html)** — the Identity / Work / Commands separation: pure identity cards, a distinct Work card, Household context, opened-from-roster/enrollment, configured commands.
- **[mockups/scheduling-focus-panel.html](./mockups/scheduling-focus-panel.html)** — the earlier card system (Summary states, Detail, siblings, label↔value side-by-side, proposed-vs-current); superseded on the identity/work split by the final composition above.
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
