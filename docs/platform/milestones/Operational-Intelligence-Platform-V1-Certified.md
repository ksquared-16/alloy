---
owner: platform
status: frozen
last_reviewed: 2026-07-28
supersedes: []
---

# Operational Intelligence Platform V1 — Certified

**Status: FROZEN** (2026-07-28)

This milestone certifies **Operational Intelligence Platform V1** as complete and stable. Architecture is accepted. Future work is **consumer presentation of Answers** (Phase 2 Consumption Model), not new platform primitives.

**Companion artifacts:**

- Product closeout — [`../../sprints/07_2026/operational-intelligence-expansion/OPERATIONAL-INTELLIGENCE-PLATFORM-V1-COMPLETE.md`](../../sprints/07_2026/operational-intelligence-expansion/OPERATIONAL-INTELLIGENCE-PLATFORM-V1-COMPLETE.md)
- Consumption roadmap — [`../../sprints/07_2026/operational-intelligence-expansion/PHASE-2-CONSUMPTION-MODEL.md`](../../sprints/07_2026/operational-intelligence-expansion/PHASE-2-CONSUMPTION-MODEL.md)
- Module doctrine — [`../modules/operational-intelligence-platform.md`](../modules/operational-intelligence-platform.md)
- Unified charter — [`../../sprints/07_2026/operational-calculations-product-realization/UNIFIED-OPERATIONAL-INTELLIGENCE-PLATFORM.md`](../../sprints/07_2026/operational-calculations-product-realization/UNIFIED-OPERATIONAL-INTELLIGENCE-PLATFORM.md)

---

## Platform capabilities (V1)

| Capability | Status |
|------------|--------|
| Questions | ✓ |
| Measurements | ✓ |
| Definitions (Calculation Library) | ✓ |
| Facts | ✓ |
| Populations | ✓ |
| Equivalencies | ✓ |
| Calculations | ✓ |
| Answers (Observations) | ✓ |
| Shared explanation | ✓ |
| Consumption architecture (documented) | ✓ |

Shipped product Questions: **Future Room Capacity**, **Room Utilization** (counting mode is configuration — not a duplicate FTE question).

---

## Architecture accepted

```text
Questions → Measurements → Definitions
  → Facts / Populations / Equivalencies / Calculations
  → Answers
```

Consumer conceptual flow (Phase 2+):

```text
Question → Answer → Presentation → Action
```

**Operational Answer Contract:** OI owns how questions are answered. Consumers own presentation. Consumers request Answers. No consumer owns operational truth or duplicates calculation logic.

---

## Freeze rules

Future **platform** changes require **all** of:

1. A real operational question (operator-facing).
2. Proof existing primitives cannot express it.
3. A reusable primitive that extends multiple future scenarios.

**No speculative platform work.**  
**No new Questions, AST engines, BOS capabilities, or BOS expansions** under the guise of “platform completion.”

Phase 2 implements **consumers** (Locations, BOS parity, Workspace attention, Dashboards, Planning, …) per the Consumption Model — presenting Answers only.

---

## Explicit non-goals after freeze

- Locations / Planning / Dashboard implementation in this certification (documented only)
- Program Utilization / Ratio Risk / Future Staffing until SoT blockers clear
- Standalone Calculations navigation outside Operational Intelligence
- Duplicate question variants (e.g. Room Utilization (FTE) as a product card)

---

## Certification posture

Feature-complete for V1. Minor cosmetic follow-ups do not reopen the platform. See product closeout for QA evidence and remaining polish notes.
