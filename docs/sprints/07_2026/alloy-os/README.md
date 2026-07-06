# Alloy OS Sprint — Closeout Index

**Path:** `docs/sprints/07_2026/alloy-os/README.md`
**Status:** Sprint complete (2026-07). Repository left in a canonical, internally consistent state for the next implementation thread.

The Alloy OS sprint made the operator experience feel like one persistent operating system whose surfaces exchange focus, by introducing the **Surface Host** — the ratified realization of NAV-1 (decision A). This folder + the linked canonical docs are the complete record.

---

## Read in this order

1. **[surface-host-architecture.md](../../../platform/experience/surface-host-architecture.md)** — the canonical architecture. Surface Host as a permanent component: ownership, lifecycle, the phase map (§7), interaction with Presentation/Motion/Navigation/history/URL/deep-links/record-opening, and the relationships to `WorkUnitSlugRouteHost`, Presentation Runtime, and the reload fallback.
2. **[surface-host-implementation-status.md](../../../platform/experience/surface-host-implementation-status.md)** — canonical status: Completed / In Progress / Remaining, per phase, with commits and evidence.
3. **[engineering-handoff.md](./engineering-handoff.md)** — executive summary, final architecture, ranked remaining work, known constraints, risks, and the recommended next sprint.
4. **[cursor-handoff.md](./cursor-handoff.md)** — the same, as a design review for a fresh implementer: files of interest, validation status, open risks, recommended implementation order.

**Doctrine (updated, not superseded):** [navigation-runtime-doctrine.md](../../../platform/experience/navigation-runtime-doctrine.md) (NAV-1 = Surface Host), [experience-layer-architecture.md](../../../platform/experience/experience-layer-architecture.md) (Capabilities 2 + 6), [operational-navigation-contract.md](../../../platform/experience/operational-navigation-contract.md), [operational-runtime-topology.md](../../../platform/runtime/operational-runtime-topology.md). **Decision record:** [nav-1-persistent-runtime-decision-memo.md](../nav-1-persistent-runtime-decision-memo.md) (RESOLVED).

---

## What shipped (repository summary)

Sprint commits on `staging`, in order:

| Commit | Title |
|---|---|
| `2c6b25523` | alloy-os: adopt motion choreography on operational surfaces |
| `7d80f6ce2` | alloy-os: hold work unit surfaces during transitions (Surface Hold + Queue Hold) |
| `0ef8bf1aa` | alloy-os: add directional surface enter choreography |
| `3764e039a` | alloy-os: introduce surface host (Phase 1 context model) |
| `f40c09a72` | alloy-os: soft navigate operator surfaces with reload floor |
| `4855c6fa8` | alloy-os: extract work unit surface controller |
| `e66c3de51` | alloy-os: make surface host render work unit surface (canonical render takeover) |

**Net architectural change:** operator surface identity moved off Next.js route segments into the Surface Host's client context; the Host is now the one renderer of the work-unit surface; `WorkUnitSlugRouteHost` is seed-only; WS↔WU navigation is soft with a retained reload floor. No feature flag, no parallel mode.

**What remains:** the surface *exchange choreography* (outgoing retention, tile yield, settle), then Focus/Person/Child + Configuration surface-kind integration, then the **Perceived Performance** sprint. See the status doc for the ranked list.

**Validation at closeout:** typecheck 0 · Surface Host/presentation/motion/nav suites green (240/33 at the render-takeover gate) · `next build` OK · landed on `staging` `e66c3de51`. Live-browser (authenticated) validation of the *felt* transition is deferred to the choreography work.

---

## Next sprint

**Perceived Performance** — make Alloy feel impossibly fast on the retained-surface substrate this sprint built, **without changing the architecture**. Rationale and focus areas: [engineering-handoff.md § Recommended Next Sprint](./engineering-handoff.md#recommended-next-sprint--perceived-performance).

> *"The architecture is frozen. The goal of this sprint is to make Alloy feel impossibly fast without changing the architecture."*
