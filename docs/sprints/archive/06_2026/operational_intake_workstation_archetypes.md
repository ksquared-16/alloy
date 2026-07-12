# Operational Intake Workstation — Archetype Exploration

**Status:** Design exploration (pre-implementation)  
**Gallery:** `/dev/operational-intake-workstation`

---

## Shift

Stop designing **modal containers** and **border variations**.

Design **operational workstations** — purpose-built intake machines.

The Create Lead experience should feel like it belongs only to Alloy.

---

## Weight model (not equal columns)

| Zone | Role | Target weight |
|------|------|----------------|
| **Material** | Center of gravity — why the system exists | ~50% dominant |
| **Findings** | Supporting orbit — emerges as BOS reads | ~30% |
| **BOS** | Peripheral guidance | ~20% |

Avoid CRM dashboard columns (`BOS │ Intake │ Findings` with different outlines).

---

## Archetypes

Screenshots: `docs/sprints/archive/06_2026/assets/operational-intake-workstation/`

| # | Archetype | Spatial idea |
|---|-----------|--------------|
| 1 | **Trapezoid** | Workspace faces operator; converging geometry |
| 2 | **Flight deck** | Vertical flow upward: BOS → Material → Findings |
| 3 | **Harbor** | Material docks at V-basin; BOS port / findings starboard |
| 4 | **Cloud core** | Material nucleus; BOS, findings, actions radiate |

Single BOS lockup in title band only. Stacked material cards frozen as content.

---

## Abandoned

- Modal silhouettes and border tweaks
- Equal-width dashboard columns
- Rectangles with half-circles
- Cards inside cards inside cards
- Wizard flows, forms, giant textareas

---

## Capture

```bash
cd web && npm run screenshots:operational-intake-workstation
```
