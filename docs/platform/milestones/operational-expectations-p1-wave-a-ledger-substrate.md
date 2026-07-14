---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — P1 · Wave A: Ledger Substrate (implementation checkpoint)

**Status:** Canonical implementation record for **P1 Wave A**, 2026-07-13. This document records an
implementation checkpoint; it introduces **no architecture, no ontology, no new package, no new gate**.

```
P1 Wave A: LOCALLY COMPLETE
P1 overall: IN PROGRESS / UNCERTIFIED
```

> **Authority.** P1 scope, contracts, gates, and completion criteria are authoritative in the
> [Engineering Realization §13 · §19 (P1)](./operational-expectations-engineering-realization.md); the
> frozen architecture is the [System Design](../core/operational-expectations-system-design.md). The waves
> below are **implementation sequencing only** — they are not packages, they add no dependency edges,
> and **P1 certifies once, after all waves complete**. Where anything here appears to decide, it is
> scheduling an already-frozen decision.

---

## 1. Why waves (and what a wave is not)

P1 is the largest foundational package in Operational Expectations. It is delivered as internal
implementation waves that preserve the frozen P1 contract exactly:

| Wave | Objective | Local completion |
|---|---|---|
| **A — Ledger substrate** | The append-only, bitemporal, lineage-tracked store + closed vocabularies + conformance | **this checkpoint** |
| **B — Authoring intake** | The sole write path; the five verbs; grammar / modality / semantic-line / Temporal-Frame validation; footprint emission; Authoring Act | pending |
| **C — Standing / Authority** | Authority→Standing resolution; the authoring gate; ratification as an authoring act | pending |
| **D — Revision / Correction** | Typed-supersession *behavior*: revision re-plans forward, correction unwinds | pending |
| **E — Certification & compatibility** | Close the P1 gates; `oe.ledger.author` off = Facts-only | pending |

The waves together equal **exactly** the frozen P1 contract — nothing more, nothing less. A wave is a
review checkpoint, **not** a package: it creates no new certification gate and no new dependency.

**Frozen P1 gate → wave that produces its evidence** (no gate is green from schema alone):

- **G-Modality-Closure** — storage CHECK exists in A; **certified in B** when *authoring* rejects a 6th modality.
- **G-Standing (authoring half)** — **Wave C**.
- **G-Revision** — **Wave D**.
- **P1's contribution to G-Acyclic** — append-only substrate in A; carried through **B–D** (all writes are authoring acts).

---

## 2. What Wave A is (and is not)

**Wave A is the storage substrate.** It stands up one append-only, bitemporal, lineage-tracked ledger —
`operational_expectations` — the authored twin of Operational Facts (same substrate, opposite
semantics), plus the contract types, closed vocabularies, and a probe-driven conformance harness.

**Wave A is NOT** authoring intake, Authority→Standing resolution, Revision≠Correction *propagation*,
evaluation, Judgment, Gap, effectors, or any consumer (Billing / Scheduling / Current Work / AI). It
stores well-formed authored tuples; it never evaluates a Condition, derives a verdict, writes a Fact,
or selects a response.

### 2.1 Database capability vs supported platform behavior

```
Database capability (Wave A):
  A privileged server process (service_role, RLS-bypassing) can insert an append-only row.

Supported platform behavior (Wave A):
  NO authoring behavior is available. No client can author. The five verbs are
  vocabulary + storage constraints only — not operations.

Supported platform behavior (after Wave B):
  All authored rows enter through the single authoring intake.

Supported platform behavior (after Wave C):
  The intake admits authors only through Authority → Standing enforcement.
```

Wave A does **not** claim that create / revise / correct / replace / cancel is *operational* merely
because the schema can store those verbs.

---

## 3. One canonical ledger substrate (no duplicated machinery)

The generic append-only / bitemporal / org-scoped / lineage invariants are defined **once**, in a
neutral platform layer that **both** ledgers reuse:

- `web/lib/operationalLedger/ledgerSubstrateContract.ts` — `AppendOnlyLedgerDescriptor` (the shared base).
- `web/lib/operationalLedger/ledgerSubstrateConformance.ts` — `assertLedgerSubstrateConforms` (the one
  definition of append-only / no-updated-at / org-scoped-RLS / lineage-self-reference / no-self-reference).
- `web/tests/operationalLedger/ledgerSchemaScan.ts` — the one static migration-scan mechanism.

Operational Facts (`operationalFacts/factConformance.ts`) and Operational Expectations
(`operationalExpectations/expectationLedgerConformance.ts`) are **sibling extensions**: each delegates
the shared invariants to the neutral core and adds only its own domain checks (Facts: entry-type
vocabulary + emitted-event completeness; Expectations: modality/verb/transition/standing closure +
tuple/lineage shape + write boundary + recorded-time integrity). There is **no** second evaluator, bus,
binding system, ledger authority, conformance implementation, or migration scanner.

---

## 4. The ledger table (`operational_expectations`)

Migration `supabase/migrations/20260717000000_operational_expectations_ledger_p1_wave_a.sql`.

### 4.1 Tuple grammar (⟨Authority·Modality·Subject·Condition·TemporalFrame·[Beneficiary]⟩)
`authority_key`, `author_class`; `modality` (closed-five CHECK); `subject_kind` + `subject_ref`;
`condition` (predicate params — a Type reference, never a sensor); `temporal_frame` (+ presence CHECK);
`beneficiary` (optional). The measurable/sensor binding is **not** here — it is Config, below the
semantic line (P2).

### 4.2 Lineage + typed transition (Revision ≠ Correction)
One predecessor FK `supersedes_expectation_id` (self-referential) + `lineage_root_id`, **plus** a
distinct `transition_type` (`revision | correction | cancellation | replacement`). The distinction is
carried by the *type*, not collapsed into a generic predecessor field — matching System Design §4.5
("typed transition events on lineage"). Cancellation is `verb='cancel'` producing a **new append-only
row**; there is **no** mutable status column.

### 4.3 Standing, footprint, provenance (held, not resolved)
`standing` (proposed | binding | model — held; resolved by the Wave C gate); `footprint` (declared;
consumed by P4); `config_version_ref` (**reserved structural provenance**, nullable, no FK, no config
lookup, no replay — storage only).

### 4.4 Bitemporal + append-only
`valid_from`/`valid_to` (author-supplied effective time) vs `authored_at` (**server-assigned** recorded/
transaction time — the BEFORE INSERT trigger forces `now()`, non-forgeable; immutable via the
append-only trigger). No `updated_at`.

### 4.5 Write boundary (the substrate is not an authoring surface)
- `authenticated`: **SELECT only** (org-scoped). No INSERT grant, no INSERT policy.
- `anon`: nothing.
- UPDATE / DELETE: ungranted **and** trigger-blocked (append-only).
- `service_role`: infrastructure (RLS-bypassing) — the privileged channel the Wave B intake will run
  behind, **not** a product authoring contract.

---

## 5. Validation (repository-pinned tooling)

- Expectation ledger conformance + write-boundary + lineage-integrity + drift + no-later-wave-behavior
  tests — green.
- Shared substrate reused by both ledgers — Facts (attendance) conformance regression green;
  `assertFactStreamConforms` public API + report keys unchanged (`corrects_self_reference` preserved via
  a compat alias while the core uses neutral `lineage_self_reference`).
- Operational areas (`operationalFacts`, `operationalExpectations`, `operationalLedger`,
  `operationalConsumption`) green; the only reds in the broader run are **pre-existing**
  `childcareOperational` baseline failures unrelated to this change (missing `SUPABASE_URL`; React-widget
  flag tests).
- Product typecheck (`typecheck:build`) clean; ESLint on changed files clean.
- Database assertions are **static migration validation** (no live Postgres in the CI environment),
  the repository's established pattern for the fact streams.

---

## 6. What Wave A explicitly does not do

- Does **not** implement authoring intake, the five verbs as operations, or any write path.
- Does **not** resolve Authority or Standing, or run a ratification gate.
- Does **not** implement Revision/Correction propagation behavior.
- Does **not** evaluate, judge, derive gaps, write Facts, or invoke any effector.
- Does **not** open a feature flag (`oe.ledger.author` arrives with Wave B intake).
- Does **not** certify any P1 gate as fully green, and does **not** begin Wave B.

## Cross-references

- [Engineering Realization §13 · §19 (P1)](./operational-expectations-engineering-realization.md) — the P1 contract & checklists.
- [System Design §0 · §5 · §12 · §A](../core/operational-expectations-system-design.md) — tuple grammar, verbs, Standing, §A resolutions.
- [P0 Substrate Reconciliation](./operational-expectations-p0-substrate-reconciliation.md) — the confirmed twin-ledger substrate this builds on.
