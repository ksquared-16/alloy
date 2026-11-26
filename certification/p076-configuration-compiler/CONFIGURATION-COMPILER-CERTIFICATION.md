# P0-7.6 · IS `FirstOrderWorkUnitProjection` A CONFIGURATION COMPILER?

**Answer before the slice: NO. Answer after the slice: YES.**
Decision: **B — CONFIGURATION_COMPILER_REFACTOR_COMPLETE.**

---

## PART 1 — THE COMPILATION MODEL, BEFORE AND AFTER

### Before (the chain as it actually ran)

```
published Focus Panel doc
  → cardKeys: string[]                    (ordered card membership — configuration)
  → composeFirstOrderWorkUnitProjection
      for (const cardKey of cfg.cardKeys)
        if (cardKey === "financials")    { facts.availableCents = … }     ← SOURCE
        else if (cardKey === "children") { facts.childCount     = … }     ← SOURCE
        …
  → projection
```

Cards were configuration. **Fields were source code.** Which reads ran was decided by
`configured("financials") && input.householdId ? run(…) : null` — a hand-written conjunction per
read, not a requirement derived from what the surface asked for. There was no plan, no dependency
set, and nothing that could answer "what does this configuration need?" without executing it.

### After

```
published Focus Panel doc
  → resolveFirstOrderSurfaceConfiguration     (FocusPanelCardConfig.evidenceGroups[].fields[]
                                               where placement === "collapsed", by refKey;
                                               else the card registry's `firstOrderFields`)
  → FirstOrderSurfaceConfiguration            ({cardKey, semanticKeys}[] in configured order)
  → compileFirstOrderPlan                     (semantic key → registered capability;
                                               unknown key → UNSUPPORTED, compile fails)
  → FirstOrderPlan                            (fields + DEDUPLICATED prerequisite set)
  → composeFirstOrderWorkUnitProjection       (request-time authorization prunes the plan;
                                               executes prerequisites on the repaired DAG;
                                               projects each field via capability.project)
  → FirstOrderWorkUnitProjection              (geometry from configuration, not from the plan's
                                               execution outcome)
```

Named owners: `lib/runtime/firstOrder/resolveFirstOrderSurfaceConfiguration.ts` ·
`compileFirstOrderPlan.ts` · `firstOrderCapability.ts` · `firstOrderCapabilityRegistry.ts` ·
`composeFirstOrderWorkUnitProjection.ts` ·
`lib/adminV2/runtime/focusPanel/focusPanelCardFirstOrderConcern.ts`.

---

## PART 2/4 — WHERE FIELD REQUIREMENTS LIVED, AND WHERE THEY LIVE NOW

| source of a field's Stage-1 requirement | before | after |
|---|---|---|
| A published configuration | 0 | 0 today, **all 25 available** (any card that authors collapsed fields) |
| B canonical field / capability metadata | 0 | 0 |
| C generic provider registry | 0 | **25** (the card-registry declaration selects from it) |
| D card-specific source code | 0 | 0 |
| E composer-specific source code | **25** | **0** |

`CARD_CONFIGURATION_DRIVEN` — **YES**, before and after.
`FIELD_CONFIGURATION_DRIVEN` — **NO** before, **YES** after.

The honest qualification, stated rather than buried: today's published Enrollment configuration
authors collapsed fields for NO card. `defaultEvidenceGroupsForCard` seeds `household` and
`children` only, and the four operational cards are self-fetching with no configured fields at
all. So all 25 currently resolve through the CARD REGISTRY's `firstOrderFields` declaration — a
platform declaration, overridable per tenant, folded in as its own concern slice exactly as that
registry's design law prescribes. A gate proves configuration wins wherever it exists, and
another proves the composer contains none of these keys.

---

## PART 3 — THE SEMANTIC CAPABILITY OWNER (searched before inventing)

Alloy already owns the **declarative** half:

- `lib/fields/canonicalDataProviderModel.ts` — `CanonicalDataProvider`: `refKey`, kind, grain,
  output shape, value type, per-consumer `availability`, derivation `source`, `resolverOwner`,
  cross-grain `projection`.
- `lib/fields/fieldSurfaceAvailability.ts` — `FieldConsumerSurface` already includes
  `"focus_panel"`.
- `lib/fields/computedFieldCatalog.ts` — `resolver_ref_keys`, `resolver_owner`, `resolver_status`
  (`now` / `future`).
- `lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel.ts` — `FocusPanelCardField`
  (`refKey`, `placement`, `kind`, `owner`, `required`) and `FocusPanelEvidenceGroup`
  (`showInSummary`).
- `lib/metrics/packs.ts` — KPI capability keys (`attendance.here_now_count`, …).

**What none of them carries is anything an execution planner can run.** `resolverOwner` is a
diagnostic STRING, and no provider declares the READ it requires. That is not an oversight: every
existing configured surface resolves against a FROZEN context the caller already assembled
(`resolveQueueRowChildrenFieldFromContext(fieldKey, context)`), so no provider has ever needed to
say what it would have had to fetch. The queue row IS a configuration compiler — of a
record-oriented kind that presupposes the reads are done.

A′'s value is the opposite: planning CONCURRENT READS before anything is frozen. So the missing
primitive is exactly one thing — **a provider cannot declare its prerequisite** — and
`FirstOrderCapability` supplies that one thing as an EXECUTION slice keyed by the same semantic
`refKey` vocabulary. It is not a rival catalogue of what fields exist, and it does not duplicate
`CanonicalDataProvider`'s declarative content.

---

## PART 5/6/17 — CONFIGURATION MUTATION FIXTURES

Every row measured by executing the compiler and the composer against isolated fixtures. No
production configuration was mutated.

| # | mutation | source changes | effect proven |
|---|---|---|---|
| A | remove a field from a card | **0** | its read disappears when it was the last consumer |
| A′ | remove a field another card still uses | **0** | the read SURVIVES — retirement is by consumer count |
| B | add an already-supported field | **0** | provider selected automatically; `crm_projection` joins the plan |
| C | reorder fields within a card | **0** | key order changes; every value byte-identical; query count identical |
| D | move a field to another card | **0** | same capability, same value, different card |
| E | remove an entire card | **0** | `prepaid_position` retires with Financials |
| F | add a supported card | **0** | appears with its declared fields |
| G | reorder cards | **0** | geometry and identity move together |
| H | change KPI membership | **0** | slots follow configuration |
| I | change Work View membership | **0** | slots follow configuration |

**Dependency dedupe:** `children.count` is selected by two cards and read ONCE; three CRM-backed
household fields cost one `crm_projection`.

---

## PART 7/8/19 — THE SYNTHETIC BILLING FIXTURE

Four cards — `billing_overview`, `account`, `payment_plan`, `collections` — in a different order,
with a different field composition, four KPIs and two Work Views, composed ONLY from capabilities
that already exist. No new billing semantics were invented.

- **Composer source changes required: 0.**
- **Process-specific branches required: 0.** The composer has never heard of any of these cards;
  a gate asserts it contains neither `billing` nor `enrollment` as a literal.
- **Queries: 12** (population 1 · personal_seen 1 · crm_projection 2 · prepaid_position 7 ·
  process_config 1). Attendance and Health are not selected and **cost zero** — execution scales
  with selected capabilities, not with the registry.
- A one-card Billing surface costs strictly less than the four-card one.
- Values are the SAME capabilities' answers: Billing's prepaid figure is byte-identical to
  Enrollment's.
- Both processes compile through the same runtime in the same session. No
  `BillingFirstOrderComposer`, no `EnrollmentFirstOrderComposer`.

---

## PART 9 — THE NEW-CAPABILITY BOUNDARY

Configuring `billing.some_future_fact` (no registered capability):

- `compileFirstOrderPlan` returns `ok: false` with `{semanticKey, cardKey, reason:
  "no_registered_capability", message}` naming the key and the card.
- `composeFirstOrderWorkUnitProjection` **throws** `FirstOrderUnsupportedCapabilityError`.
- It is NOT omitted, NOT zero, NOT empty, NOT UNKNOWN, and there is no fallback to a legacy VM.

UNKNOWN means the platform tried and could not answer. Nobody tried here. Rendering UNKNOWN would
present a missing IMPLEMENTATION as a missing VALUE, and no operator can tell those apart.

**Doctrine established: NEW CAPABILITY = CODE. NEW COMPOSITION = CONFIG.**

---

## PART 10 — FIRST-ORDER CLASSIFICATION OWNER

`FocusPanelCardField.placement` — persisted configuration authored in the Surface Composer.
`"collapsed"` is the card's pre-expansion answer, `"expanded"` the same question at depth. That IS
the Stage-1 / Stage-2 line, and it already existed. `resolveFirstOrderSurfaceConfiguration` reads
it; the composer does not contain the string `placement` at all, proven by gate.

---

## PART 11/12/13 — AUTHORIZATION · STATE · GEOMETRY

- **Authorization** is a declared REQUIREMENT (`none` / `financials_read` / `health_view`),
  evaluated at request time against the caller's gate. It prunes the plan, so a refused caller's
  reads never execute — zero queries for refused data — and the field answers `FORBIDDEN`. No
  verdict is stored in the plan; a gate inspects the whole compiled field, not a chosen
  projection of it, and proves a plan compiled for a refused caller is identical to one compiled
  for an allowed caller.
- **State semantics** belong to the capability result. `KNOWN` · `KNOWN ZERO` · `KNOWN EMPTY` ·
  `UNKNOWN` · `UNAVAILABLE` · `FORBIDDEN` all survive the generic path, and a brace-matched source
  gate proves the projection loop constructs no state of its own.
- **Geometry** is configuration's: `cardOrder` plus `cardFieldSlots` (a reserved slot per
  configured field, in configured order). A failed provider produces byte-identical geometry to a
  successful one.
- **Configuration identity** now carries `cardFields`. Removing a field, adding one, reordering
  within a card, or moving one between cards each makes a stale projection fail to match, naming
  the card that moved.

---

## PART 20 — PLANTS: 14 ATTEMPTED, 14 BOUND

A · hardcoded six card keys · B · hardcoded semantic fields · C · configured field not selected ·
D · removed field's provider still executes · E · same prerequisite read twice · F · reorder
changes output · G · unsupported silently omitted · H · unsupported rendered UNKNOWN · I · card
reconstructs a state · J · classification moved into the composer · K · Billing needs a
process-specific branch · L · authorization verdict stored in the plan · M · identity ignores
field membership · N · identity compares field order as a set.

**Plant E bound on a compile error on its first attempt, which proves nothing about a gate.** It
was re-planted as a genuine duplicate read and bound on the dedupe gate, the query-count gate and
the Billing scaling gate. A plant that breaks the build is not a bound plant.

---

## WHAT THIS SLICE DID NOT DELIVER

**Enrollment coverage remains 25/29.** The four financials ledger fields (`periodKey`,
`responsibilityCents`, `balanceCents`, `pastDueCents`) are still blocked, and the compiler does
not unblock them: `reconcileRows` and `pastDueFor` are pure and exported, but the account-scoped
CHARGES read has no canonical owner — `from("charges")` appears in twelve modules, none
account-scoped, the one exported charge reader is per-charge, and the ledger is assembled inside
the private `buildFinancialsCardVMInner`, part of the Financials VM this runtime is gated against
calling. Under the doctrine this is NEW CAPABILITY = CODE, and the code required is a reader
extraction of the same shape as `readAccountPrepaidPosition`. It does not require editing the
composer, so the abstraction is not incomplete — the reader simply does not exist yet.

**Performance is unmeasured on this refactor.** Part 18 requires ≥21 cold shadow executions of
the deployed Enrollment configuration. This code is not deployed. Planning cost is instrumented
and reported separately as `timing.planMs`, never folded into assembly, but a number measured
in-process on mocks would not be evidence. An unmeasured gate is not a passed gate.
