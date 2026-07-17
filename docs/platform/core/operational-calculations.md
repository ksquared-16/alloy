---
owner: platform
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Operational Calculations

**Status:** Canonical platform doctrine. **Re-founded 2026-07-17** on the architecture proven in code by Operational Calculation Registry V1, Configuration Event Propagation, and Phase 6 Childcare Operational Convergence.

> **What changed (2026-07-17).** The June-2026 conception described here framed an Operational Calculation as a *governance descriptor over an OIP metric key* — "the math stays in OIP", registry under `web/lib/analytics/`. That framing is **superseded**. Operational Calculations is its **own platform layer** — a deterministic truth runtime (`web/lib/operationalCalculations/`) with the frozen pattern **Definition → Handler → Runtime → Result**. It is **not** part of OIP and **not** an analytics registry. The `web/lib/analytics/calculations/*` registry is the **Operational Intelligence** (analytics) layer and is governed by [`../modules/operational-intelligence-platform.md`](../modules/operational-intelligence-platform.md), not by this doctrine.

---

## 1. Purpose

**Operational Calculations deterministically derive operational truth** from canonical inputs (Operational Facts, committed Intent) and governed Configuration. A calculation answers a factual operational question — *how many staff does this room require?*, *what is the binding capacity?*, *how many children are expected here on this date?* — and returns a **typed, versioned, reproducible** result.

A calculation **measures what IS**. It never asserts what SHOULD be (that is Operational Expectations) and never analyzes trends over time (that is Operational Intelligence). It carries **no judgment** — no healthy/unhealthy, compliant/breached, pass/fail.

> **One fact, one definition, one owner, many consumers.** No consumer re-derives a fact. Every operational number originates from a registered Operational Calculation Definition.

---

## 2. The four operational layers

Alloy separates four operational responsibilities. Each has one owner; none may absorb another.

```text
Operational Facts          authored observations — "what IS" (immutable, effective-dated)
        +
Configuration              governed rules and policy (the inputs calculations read)
        ↓
Operational Calculations   deterministic derivation of operational truth   ← THIS DOCTRINE
        ↓
Calculated Operational Truth
        ├── operator surfaces
        ├── Operational Expectations   evaluation / judgment over facts + calculations
        ├── commands / readiness
        └── Operational Intelligence   metrics / trends / KPIs / analytics / insight
```

- **Calculations derive truth.** **Expectations evaluate truth.** **Intelligence analyzes truth.** **Configuration steers inputs and policy.** Code owns executable semantics and invariants.

**Reconciliation with the frozen ontology.** This ordering is a *responsibility stack*, not a derivation chain. The frozen [`./operational-expectations-system-design.md`](./operational-expectations-system-design.md) establishes **two authored ledgers** — Operational Facts ("what IS") and Operational Expectations ("what SHOULD / WILL be") — **neither derived from the other**. Operational Calculations does not sit *between* them: it is the deterministic derivation capability whose **results are an input to both** Expectation evaluation and Intelligence. In the truth-flow axis ([`./operational-truth-flow-doctrine.md`](./operational-truth-flow-doctrine.md)), the derived **L3 Projections** (expected occupancy/staffing/ratio) **are** registered Operational Calculations. The two judgment/analysis flows are explicit:

```text
Facts + Calculation Results + Authored Expectations → Expectation Evaluation → judgments / gaps / attention
Facts + Calculation Results + historical snapshots  → Operational Intelligence → metrics / trends / KPIs / reports
```

Neither Expectations nor Intelligence is the calculation authority.

---

## 3. Core architecture — Definition → Handler → Runtime → Result

The frozen platform pattern (`web/lib/operationalCalculations/`):

```text
Definition   the governed, versioned identity the registry holds. Never computes.
    ↓
Handler      the code that computes. Pure, code-owned, never tenant-authored.
    ↓
Runtime      deterministic orchestration; stamps the governed envelope + injected clock.
    ↓
Result       the typed operational truth: value, scope, effective time, provenance,
             versions, resolution status. Derived, never a system of record.
```

Ownership:

- **Definition** (`definition.ts`) owns identity, family, versions, declared inputs (rule shapes / scopes / effective-time), the **handler binding**, declared consumers, `expectationBindable`, and governance metadata. It holds no value.
- **Handler** owns calculation execution. A `pure` handler wraps an existing pure resolver; an `oip` handler names an OIP metric key (served by the Intelligence layer, not resolved here in V1).
- **Runtime** (`runtime.ts`) owns deterministic orchestration and Result construction. The clock is **injected**, never wall-time.
- **Result** (`resultContract.ts`) owns the calculated value, scope, effective coordinate, provenance (`appliedRules`), the reproducibility triad (contract / engine / config versions), and resolution status.
- **Registry** (`registry.ts`) owns discovery of registered Definitions. It is the **one resolution path** and **fails closed** — an unregistered key throws.
- **Family** groups related Definitions under this one platform architecture. A family is a **registration**, not a separate runtime or competing registry.

---

## 4. The result contract

A Result carries the family-typed value plus a **resolution status** — `resolved`, `incomplete`, `not_configured`, `conflicted`, `partial`. **None of these is a verdict.** `incomplete` does not mean "violated"; `not_configured` does not mean "compliant". A consumer that reads a resolution status as a verdict has invented a judgment — that is Operational Expectations, not Operational Calculations.

Calculation results **do not contain**:

- healthy / unhealthy
- compliant / non-compliant
- pass / fail
- breached / unmet
- good / bad
- warning / critical **as judgment states**

Structured warnings may communicate **incomplete inputs or resolution conditions** (e.g. "child count exceeds the highest configured tier", "occupancy unknown"), never operational judgment.

**Values are typed, never a forced scalar.** The value union is family-typed (`requirement`, `capacity`, `scalar`, `set`, `ordering`, `money`, `completeness`). A forced-scalar shape is exactly why the scalar-only OIP metric model is **not** the reference for operational truth. `null` means "unknown / not configured" — never 0, never Infinity, never a coerced default.

---

## 5. Determinism

- **Injected time.** Any evaluation-time input is supplied by an injected clock; results are reproducible.
- **Deterministic handler selection.** The registry resolves a key to exactly one handler, fail-closed on unknown keys and unsupported handler kinds.
- **No hidden judgment.** A calculation never emits a verdict.
- **No LLM calculation.** Handlers are pure code, never model inference.
- **No client-side calculation authority.** Presentation never computes operational truth.

---

## 6. Registry and family model

There is **one** Operational Calculation Definition Registry. Families are registrations within it, not competing registries:

```text
Operational Calculation Platform
  └── Canonical Definition Registry   (web/lib/operationalCalculations/registry.ts)
        ├── Resource Requirements & Capacity family
        ├── Scheduling & Occupancy family
        ├── Attendance family        (future)
        ├── Commercial family        (future)
        └── future families
```

- **Families are registrations, not separate runtimes.** Adding a family appends its Definitions to the registry; it never redesigns the platform.
- **Domain-local descriptor catalogs are transitional.** A domain module may hold resolvers the handlers wrap, but the *governed catalog* is the one registry above.
- **OIP's analytics metric registry is a separate system.** `web/lib/analytics/calculations/*` and `web/lib/metrics/*` are Operational Intelligence. Registry convergence must **not** force structured operational truth into scalar analytics contracts; the OIP metric key is available as a distinct `oip` handler kind, and its convergence is a later roadmap phase.

---

## 7. Boundaries — Facts, Calculations, Expectations, Intelligence, Configuration, Code

- **Calculations derive truth** from Facts + Configuration + committed Intent.
- **Expectations evaluate truth** — authored intent compared against Facts + Calculation Results yields derived judgment/gaps. Owned by [`./operational-expectations-system-design.md`](./operational-expectations-system-design.md) (frozen). A Definition marks `expectationBindable` where an Expectation Condition may bind its key.
- **Intelligence analyzes truth** — metrics, trends, KPIs, dashboards over Facts + Calculation Results + history. Owned by [`../modules/operational-intelligence-platform.md`](../modules/operational-intelligence-platform.md).
- **Configuration steers inputs and policy** — [`./configuration-ownership-and-inheritance.md`](./configuration-ownership-and-inheritance.md). Configuration changes are propagated to the runtime as canonical events + invalidation predicates (Configuration Event Propagation); the runtime stays deterministic and does not observe config mutations directly.
- **Code owns executable semantics and invariants** — handlers and rule-shape sets are code-owned; a tenant parameterizes a rule-shape instance, never authors a handler.

---

## 8. Registered families and maturity

Document only what is implemented.

**Resource Requirements & Capacity** (V1 — `families/resourceRequirementsAndCapacity.ts`)
- `resource.required_staff`, `resource.ratio`, `capacity.room_binding`, `capacity.remaining`.
- Each wraps an already-built, already-tested canonical resolver (`resolveRatio`, `resolveOperationalCapacity`); no invented math.
- Configuration Event Propagation present. No frontend-specific calculation authority.

**Scheduling & Occupancy** (Phase 6 — `families/scheduling.ts`)
- `occupancy.expected`, `occupancy.actual` (scalar); `scheduling.expected_staffing`, `scheduling.actual_staffing` (requirement).
- Registered as an Operational Calculation family; expected and actual required-staff production seams converge through the canonical resolver, observable behavior preserved.
- The ratio/capacity keys are **not** duplicated here — they are the Resource & Capacity family, which declares `scheduling` as a consumer.
- **Deferred (not yet registered):** actual staffing gap / over-capacity, attendance adherence variance, days-per-week policy. These compare a fact against an expectation — that comparison is Operational Expectations, not a calculation. A future wave registers the pure facts and moves the comparison to evaluation.

No other families and no frontend surfaces are complete.

---

## 9. Lifecycle & governance

- **Lifecycle:** `draft → active → archived`. An archived Definition names its successor + sunset.
- **One owner per calculation.** The declared logic owner is accountable for the underlying math.
- **Versioned, impact-scoped change.** A change to *what counts* bumps the contract version and names affected consumers (the Definition's declared consumer list is the impact set). A pure performance change does not bump the version.
- **No shadow facts.** A surface computing its own number is a governance violation; the fix is registration.
- **Deprecation is deliberate.** Archive with a successor; never silently delete a key in active use.
- **The registry is canonical.** Code registration is the source of truth.

---

## 10. Testing

| Layer | What it proves |
|---|---|
| Registry conformance | Every Definition has a valid `<family>.<name>` key, a supported rule shape, a known result kind, a bound handler; resolution fails closed. |
| Handler parity | A registered result equals the underlying canonical resolver's output for the same inputs (no drift introduced by the governance layer). |
| Determinism | Same Definition + request + injected clock ⇒ byte-identical result. |
| Layer boundaries | The truth runtime never imports the frozen Operational Expectations ledger and never imports the analytics/OIP registry. |
| No judgment | Calculation results carry resolution status + structured warnings, never a verdict. |

---

## Appendix A — Boundaries (what NOT to build)

| Temptation | Why not |
|---|---|
| Describe Operational Calculations as part of OIP | Calculations are their own truth layer; OIP analyzes their results. |
| Force operational truth into a scalar metric | The result value is family-typed; four shapes are non-scalar. |
| Put a verdict in a calculation result | Judgment is Operational Expectations; calculations carry none. |
| A second Definition registry per domain | One registry; families are registrations. |
| Author a handler in config / by a tenant | Handlers are code-owned; tenants parameterize rule-shape instances. |
| Have the runtime observe config mutations | Configuration Event Propagation feeds the runtime; it stays deterministic. |

## Appendix B — Key file index

| Concern | Path |
|---|---|
| Definition + Handler | `web/lib/operationalCalculations/definition.ts` |
| Result contract | `web/lib/operationalCalculations/resultContract.ts` |
| Runtime | `web/lib/operationalCalculations/runtime.ts` |
| Registry | `web/lib/operationalCalculations/registry.ts` |
| Resource & Capacity family | `web/lib/operationalCalculations/families/resourceRequirementsAndCapacity.ts` |
| Scheduling & Occupancy family | `web/lib/operationalCalculations/families/scheduling.ts` |
| Configuration Event Propagation | `web/lib/operationalCalculations/propagation/` |
| Operational Intelligence (analytics — separate system) | `web/lib/analytics/calculations/`, `web/lib/metrics/` |
| Operational Expectations (evaluation — frozen) | `web/lib/operationalExpectations/` |
