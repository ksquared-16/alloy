---
owner: platform
status: sprint-artifact
last_reviewed: 2026-07-17
supersedes: []
---

# Operational Calculation Definition Registry V1 — realization note

**Sprint:** operational-calc-registry-v1 · slot 5 · **engineering (realization, not discovery)**
**Base:** `origin/staging` @ `d8e969f0b`
**Governing authority (frozen):** the seven architecture documents under
`docs/sprints/07_2026/operational-calculations-architecture/` (authored by the
predecessor sprint; promoted on their own branch — not present on this branch, so
referenced by path rather than link until they land on `staging`).

> This sprint realizes the accepted architecture. It performs no architectural
> discovery, redesigns nothing, introduces no judgments, and implements no
> Operational Expectations P3.

---

## What was built

Roadmap **Phase 2 (registration substrate)** + **Phase 3 (Resource Requirements &
Capacity conformance)** — the First Implementation Mission (`operational-calculations-architecture/04-realization-plan.md` Part 10, on the predecessor branch).

A dedicated platform home, `web/lib/operationalCalculations/`, implementing the four
frozen layers (**Definition → Handler → Runtime → Result**):

| File | Layer | Responsibility |
|---|---|---|
| `resultContract.ts` | **Result** | The V1 core (§Part 2.1) + the family-typed `value` union (§2.3). Reuses the resolution primitives in `@/lib/location/operationalResolutionContracts`. |
| `definition.ts` | **Definition + Handler** | `OperationalCalculationDefinition`, the `handler` slot (`{kind:"pure"|"oip"}`), the closed rule-shape set, and `defineOperationalCalculation` (the validating authoring API). |
| `runtime.ts` | **Runtime** | `resolveCalculation` — invokes a pure handler and stamps identity, the three versions, the config coordinate, and `evaluatedAt` from an **injected clock**. |
| `registry.ts` | **Registry** | The catalog of Definitions; `getOperationalCalculationDefinition` **fails closed** (throws on an unregistered key — the generalized `isKnownOipMetricKey` gate). |
| `families/resourceRequirementsAndCapacity.ts` | **First family** | The four registered keys, each a thin adapter over an existing pure resolver. |

## The four registered keys

All four wrap **already-built, already-pure, already-tested** resolvers — no new math:

| Key | `value.kind` | Wraps |
|---|---|---|
| `resource.required_staff` | `requirement` | `resolveRatio` → `requiredStaffForChildren` |
| `resource.ratio` | `requirement` | `resolveRatio` → `ratioLimitedCapacity` |
| `capacity.room_binding` | `capacity` | `resolveOperationalCapacity` → `resolveCapacityBreakdown` |
| `capacity.remaining` | `capacity` | `resolveOperationalCapacity` (`availableNow`) |

## Discipline proven (conformance tests)

`web/tests/operationalCalculations/registryConformance.test.ts` (24 cases):

- All four resolution states are honored; the runtime carries `conflicted`/`partial`
  for future multi-entry families (the capacity resolvers deterministically never
  produce them — precedence always decides).
- A **beyond-range tier ⇒ `incomplete`** with the top-tier staffing **flagged**, not a
  coerced number silently trusted. The underlying resolver is unchanged (still returns
  `resolved` + a warning to its own callers); honesty is added in the wrapper only.
- `value` is **family-typed (non-scalar)**; `null` is never 0/Infinity/default.
- `staffed` stays **null** (G3 — the family says "I don't know").
- **Zero verdicts** — asserted structurally.
- The wrap is **byte-identical** to the underlying resolver output.

## Production-safety guarantees (met)

- **Only new files added.** No existing source file was modified → no consumer can regress.
- `resolveOperationalCapacity` / `resolveRatio` have **zero production consumers**
  (verified) → wrapping them cannot regress a live surface.
- Full `typecheck` passes; existing capacity/ratio + Phase-A certification tests pass unchanged.

## Deliberately deferred (recorded, not done — later roadmap phases)

These are **out of this sprint's scope** by the plan; recorded so the next sprint does not
rediscover them:

- **OIP convergence.** The existing 17 OIP descriptors in
  `web/lib/analytics/calculations/registry.ts` are **untouched** and keep resolving through
  their own registry. The new registry models `handler: {kind:"oip"}` as a typed, reserved
  seam; folding the 17 in is roadmap **Phase 9**, not V1.
- **Naming freeze N1–N2** (rename legacy `OperationalCalculation` →
  `…Definition` with a compat alias) — recorded in doc `06` §5; not applied here to keep the
  legacy consumers byte-stable.
- **Promoting `operationalResolutionContracts` out of `location/`** (R4) — the new contract
  **reuses** it in place; the physical move is a behavior-preserving refactor left for a
  later phase to avoid touching production importers in a first sprint.
- **Config-change event propagation (R5 / Phase 4)**, consumer adapter proof (Phase 5), and
  everything gated on OE P3.

## Consumer Migration (Phase 5) — intentionally skipped: no migration targets existed

A follow-on mission attempted **Consumer Migration V1** — routing existing production
consumers of the four calculations (`resource.required_staff`, `resource.ratio`,
`capacity.room_binding`, `capacity.remaining`) through the runtime. It was **intentionally
skipped after discovery**: there are **no production consumers to migrate**. This confirms
the frozen plan's own predictions — **R8** (*"canonical capacity resolver has zero
consumers"*), the Phase 3 rationale (*"`resolveOperationalCapacity` has zero production
consumers — the whole reason it is first"*), and **R11 / Phase 5** (*the consumer surface
"may not exist yet — this could be net-new UI, scope creep — assess before committing"*).

**Evidence (reproducible; roots searched = `app components lib hooks`, excluding tests and
the new registry):**

- The **composed resolvers** the four keys wrap — `resolveOperationalCapacity` and
  `resolveRatio` — have **zero** production importers.
- The entire `web/lib/childcareOperational/capacity/` implementation dir has **zero**
  external production importers.
- The **only** non-test importer of the composed resolvers is now the registry itself
  (`web/lib/operationalCalculations/families/resourceRequirementsAndCapacity.ts`).
- Production code that imports the lower-level *primitives* (`ratioRules`, `capacityRules`,
  `regulatoryCeiling`) does **not** consume the four calculation results — each such site is
  out of scope for this mission and was correctly left untouched:
  - `attendance/actualCompliance.ts`, `attendance/buildActualComplianceReadModel.ts` — the
    **frozen "Judgment awaiting P3" verdict seam** (`over_capacity`/`understaffed`); must not
    move (doc `04` §1.2, §7.4).
  - `expectations/scheduleExpectationCore.ts`, `expectations/buildScheduleExpectations.ts` —
    the **Scheduling family** (a different family → Phase 6).
  - `config/roomConfigResolvers.ts`, `config/configRuleAuthoringService.ts` — **L1 config
    authoring/reading** (they *produce* the config the registry reads; not calculation
    consumers).

No consumer was manufactured and **no operator UI was created** — forcing a consumer into
existence would be the net-new-UI scope creep R11 warns against. No code changed in this
follow-on mission.

### Recommended next phase (from the frozen roadmap)

- **Highest value, fully in-scope-safe — Phase 4 (Configuration event propagation, R5):**
  wire `emitEvent` into `configRuleAuthoringService` and the metric-definition route and
  define the invalidation predicate, reusing existing cache-invalidation machinery. It needs
  **no consumer**, and capacity — being live-computed — needs only stages 1–2. This validates
  propagation without inventing a consumer.
- **Where real consumers actually live — Phase 6 (Childcare Operational convergence):**
  register the Scheduling-family and compliance-seam *values* as calculations and converge
  `scheduleExpectationCore` / `actualCompliance`'s non-verdict outputs onto the runtime, with
  verdicts staying frozen in place. Genuine consumer migration belongs here, not in a
  synthetic Phase 5.
