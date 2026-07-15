---
owner: platform
status: canonical
last_reviewed: 2026-07-15
supersedes: []
---

# Operational Expectations — P1 · Wave D: Revision & Correction (implementation checkpoint)

**Status:** Canonical implementation record for **P1 Wave D**, 2026-07-15. Introduces **no
architecture, no ontology, no new package, no new gate**. It realizes the *behavior* of the typed
transitions Waves A–B already stored, through one internal primitive.

```
P1 Wave D: LOCALLY CERTIFIED
G-Revision: GREEN
G-Correction (authoring half): GREEN
P1 overall: IN PROGRESS / UNCERTIFIED
```

## The Effective Expectation Resolver (internal P1 primitive)

Wave D adds one pure primitive — the **Effective Expectation Resolver**
(`web/lib/operationalExpectations/resolver/`). It folds the already-shipped, append-only
`operational_expectations` ledger rows into the **effective expectation** at an as-of coordinate.

It **realizes P1's frozen `Provides`** — *"the ledger read/query surface (expectation assertions +
lineage)"* ([engineering-realization](./operational-expectations-engineering-realization.md) §13). It
is Internal Implementation Freedom (*"how supersession is physically represented"*), **not** a new
Stable Public Interface and **not** a universal downstream dependency. Per the frozen dependency
graph, P3 consumes P1 assertions+lineage and P4 consumes P1 acts+footprint; the broader consumer set
reads P3 judgment/gaps and P4 typed transitions.

The name is ratified as **Effective Expectation Resolver** (not "Expectation Evaluation Engine": the
*generalized evaluation engine* is the P3 Judgment keystone — `(Expectation, Facts, clock) → Judgment
+ Gap`. This resolver never compares against Facts, never derives a gap, never invokes a consumer).

## Behavior realized (program-owner ratified scope)

- **Revision** ([system-design](../core/operational-expectations-system-design.md) §4.3) — re-plan
  **forward**. The predecessor stays effective for valid-time **before** the revision's `valid_from`;
  the revision is effective from its `valid_from` forward. Chained revisions yield ordered windows.
- **Correction** (§4.4 + §4.2) — mark the prior **never-valid** and unwind on the current-knowledge
  (as-of-now) axis. The predecessor row is unchanged and resolves on the **as-known-at-T** axis
  (audit); a correction authored after `T` does not change an as-known-at-`T` result.
- **Two-axis as-of** — `{ validTime, knownAt }`. `knownAt` null = as-of-now (corrections absorbed);
  `knownAt = T` = as-known-at-`T`.

## Append-only is absolute (no in-place reshape)

No existing Operational Expectation row is ever updated. In particular: `predecessor.valid_to` is
never mutated; `temporal_frame` is never rewritten; supersession is only a newly appended authored
row; the revised/corrected **effective window is DERIVED on read** by the resolver — never stored.
Standing is derived by reuse of `resolveEffectiveStanding` (never reproduced).

## Cancellation & replacement — UNRATIFIED (fail closed)

Cancellation and replacement **effectivity** remain **unratified doctrine** (their storage exists;
their fold behavior is undefined in the frozen corpus). The resolver **fails closed** on them: if the
known horizon of a lineage contains `cancellation` or `replacement`, the whole lineage returns a typed
`unsupported_transition` result (transition type, offending expectation id, lineage root) — never
ignored, never aliased to correction/revision, never partially resolved. Enabling their effectivity
requires a program-owner architecture decision (see the design correction package).

## Downstream deferrals (not built here)

- **P3** — Judgment, Gap, Billing financial unwind, the financial half of **G-Correction**.
- **P4** — typed-transition **fan-out/propagation**, the clock/recurrence/scheduling, replay
  infrastructure and the **G-Replay-Determinism** golden corpus.
- **P6** — Current Work withdrawal (the work half of G-Correction).
- **P7** — Communications un-say, effector invocation.

The resolver is pure (no IO, no writes, no system clock) and reuses the existing `D12a`
reconciliation machinery **downstream, later** — it is not rebuilt here.

## Certification

- 43 resolver assertions (create-only, revision past-preserved + boundary exactness + chained,
  correction unwind + as-known-at-T, revision≠correction on equivalent fixtures, determinism under
  shuffle, idempotent repeat, org/lineage isolation, cancellation/replacement fail-closed, static
  no-writer/no-RPC/no-clock proof, row-shape alignment with the shipped table).
- Existing append-only + Operational Expectations conformance suites remain green.
- Live-Postgres: the shipped OE migration set replays cleanly on this tree (no resolver migration; DB
  substrate unchanged).

**Gates:** clears **G-Revision** (P1/M1) and the **authoring half of G-Correction**; contributes to
**G-Acyclic** (all writes remain authoring acts; effective expectations are read-only derived) and to
deterministic evaluation (the full **G-Replay-Determinism** corpus is P4). Cancellation/replacement
clear no gate and are out of scope until ratified.
