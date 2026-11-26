---
owner: platform
status: sprint-artifact
last_reviewed: 2026-07-27
supersedes:
  - OI-PRODUCT-RESET.md
---

# Operational Calculations — Foundational Product Reset

**Sprint:** `operational-calculations` · Slot 4 · Cursor  
**Decision date:** 2026-07-27  

## Decision

1. The **Operational Intelligence implementation is rejected as the primary product** (including the uncommitted OI Product Reset).
2. **Do not commit** the current uncommitted OI implementation.
3. **Do not continue modifying** the OI UI until the calculation-authoring model is resolved.
4. **Do not delete** the uncommitted work — preserve it as evidence for later reassessment.
5. **Do not begin** Operational Planning proving-slice code.

This is a foundational product correction, not polish.

---

## Intended product (to validate)

> Administrators create governed reusable calculations from canonical Alloy data and approved platform functions, then use those calculations in measurements, operational rules, assignments, planning models, surfaces, and BOS explanations.

Working model:

```text
Canonical fields, relationships, events, and platform functions
    ↓
Operational Calculation
    ↓
Reusable calculated result
    ├── Measurement / KPI
    ├── Operational rule
    ├── Assignment eligibility or context
    ├── Planning model input
    ├── Surface card or section
    └── BOS evidence
```

---

## What was built (parked — uncommitted evidence)

**Do not promote. Do not delete yet.**

| Area | Paths / notes |
| ---- | ------------- |
| OI Product Reset UI | `web/components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace.tsx` |
| Collection model + copy | `oiMeasurementCollection.ts`, `oiMeasurementCopy.ts` |
| Lifecycle overlay | `web/lib/metrics/oiConfig.ts`, `web/app/api/admin/metrics/oi-config/` |
| Snapshot wiring | `fetchOipSettingsSnapshot.ts` |
| Tests / QA | Vitest + Playwright + `qa-evidence/*` |
| Design artifact | `OI-PRODUCT-RESET.md` (superseded as primary direction by **this** document) |

**What that work actually is:** org configuration of **predefined OIP measurements** (enable/disable/retire, packs, goals/targets).  
**What it is not:** authoring of Operational Calculations.

Committed predecessors on the branch (`d368c01b3`, `9f86a734d`) remain local history; they also realize OI-as-product, not calculation authoring.

---

## Platform reality check (validated against repo)

### What exists

| Layer | Reality |
| ----- | ------- |
| **Operational Calculations platform** | Real: `web/lib/operationalCalculations/` — Definition → Handler → Runtime → Result; **9** registered keys; handlers are **code-owned** |
| **OI / OIP** | Real: metrics → KPIs → targets → trends; org configures **targets** (and the parked reset adds lifecycle/packs) |
| **Locations operational rules** | Real: admin-authored **rule inputs** (capacity/ratio/windows) that OC handlers consume — not calculation definitions |
| **V2 metric defs / adapters** | Exists; demoted from ordinary OI product; not OC authoring |
| **Formula / expression engine** | **Does not exist**. Doctrine forbids tenant formula authoring today |

### Consumer wiring (today)

| Consumer | Uses OC Results? | Uses OI metrics? |
| -------- | ---------------- | ---------------- |
| Measurements / surfaces / headers | No | Yes |
| Operational rules (Locations) | As **inputs** to OC | — |
| Assignment / placement | Yes (thin) | No |
| Planning | Spec only | Partial |
| BOS | Declared; sparse | Sparse / library |
| Expectations | Declared bindable; not wired | — |

### Doctrine collision (must resolve)

Canonical OC doctrine (`docs/platform/core/operational-calculations.md`) and Phase 3.5–5 sprint boundaries state:

- OC handlers are **platform / code-owned**
- Admins **parameterize** closed rule shapes and **configure measurements** (OI)
- Admins do **not** invent calculation formulas in an Organization product

Kelly’s intended product (“administrators **create** governed reusable calculations”) **reopens that boundary**. No further Organization UI until this is explicitly decided.

---

## Keep / reassess / discard (parked OI work)

### Keep as evidence / possibly reuse later

- Canonical route `/organization/operational-intelligence` + legacy redirects (IA shell may still host a future product)
- `kpi-targets` mutation path (goals remain a real admin job **if** measurements remain a consumer)
- Surfaces handoff pattern
- QA harness patterns and evidence folders
- Business-language copy approach (not adapter essays)

### Reassess after model decision

- `oi_config` lifecycle/packs overlay — useful **only if** measurement enablement remains a product job under the new model
- Domain home / collection / Add measurements UX — may map to **Calculation** collection later, but not as “enable predefined metrics”
- Diagnostics containment — still correct disposition for Analytics V2

### Do not promote as the product

- Framing OI enable/target/pack UI as “Operational Calculations”
- Any claim that the parked reset satisfies calculation authoring
- Fake formula authoring on top of OIP KPI keys

---

## Smallest durable object candidates (if authoring is approved)

Only if doctrine is deliberately reopened:

| Object | Role |
| ------ | ---- |
| **Platform function catalog** | Approved pure functions / handlers (code-registered; admin browse + bind, not arbitrary code) |
| **Operational Calculation** | Governed composition: inputs (canonical fields/relations/events) + approved functions → typed result |
| **Calculation version** | Immutable published revision |
| **Consumer bindings** | Measurement, rule, assignment, planning, surface, BOS — each declares how it reads the result |

If authoring is **not** approved, the durable model stays:

| Object | Role |
| ------ | ---- |
| **OC Definition/Handler** (code) | Platform calculations |
| **Config rule instances** (Locations) | Tenant parameters into closed shapes |
| **Measurement (OI)** | Org commitment to measure platform metrics / (later) OC results |
| **Targets** | Org goals over measurements |

---

## Open questions (block UI)

1. Is Kelly’s ask a **doctrine change** (tenant-authored calculations from approved functions) or a **misnamed ask** for OI + Locations rules + read-only OC catalog?
2. What is the administrator’s creation grain: Calculation, Measurement, Rule, or Function binding?
3. Are free formulas / SQL ever allowed, or only closed composition of approved functions?
4. Where does the product live in Organization IA if OI is not primary?
5. Must OC Results become first-class measurement sources before any new UI?
6. What is the smallest proving slice that proves **create → reuse in one consumer** without rebuilding OI?

---

## Immediate work posture

| Action | Status |
| ------ | ------ |
| Commit uncommitted OI reset | **Forbidden** |
| Further OI UI edits | **Stopped** |
| Delete uncommitted files | **Forbidden** |
| Planning proving code | **Not started** |
| Path B doctrine | **Locked 2026-07-27** — see `docs/platform/core/operational-calculations.md` §3.1 |
| Design for proving slice | **Ready** — `OC-ORGANIZATION-CALCULATION-DESIGN.md` |
| Next allowed work | Implement capacity-composition proving slice (P1–P5 in design); not a generic formula builder |

---

## Path decision

**Locked: Path B** (constrained Organization Calculation authoring).

Organizations compose approved platform functions via typed AST. Platform retains protected handlers, invariants, evaluation, and authorization. Measurements stay downstream.

