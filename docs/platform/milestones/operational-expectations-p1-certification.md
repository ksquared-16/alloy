---
owner: platform
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# Operational Expectations — P1 certification (Expectation Ledger & Authoring Intake)

**The single P1 certification.** Waves A–E delivered P1; waves are implementation sequencing only and
certify nothing on their own — **P1 certifies once, after all waves complete**, and this is that record.

```
P0:                    COMPLETE (G-Reconciliation green)
P1:                    COMPLETE AND CERTIFIED
M1 (Ledger Foundation): COMPLETE (exit + live demo)
X0 (authoring half):    COMPLETE — ratification half is P8/M6
Capability status:      NOT operational (that is M7) — P2/P3 onward not started
```

**Authority.** P1's scope, contracts, gates, and completion criteria are authoritative in the
[Engineering Realization](./operational-expectations-engineering-realization.md) §13 (contract), §19
(checklist), §5 (certification matrix), §4 (M1). This record **certifies against** those criteria; it
does not restate, extend, or reinterpret them. It introduces **no architecture, no ontology, no package,
no gate, and no runtime capability**.

Certified at `origin/staging` = `3cd8f8000615404dda1f64f877de8328cd0e19e4`, which contains the Wave D
merge `869e20ffea` ([PR #210](https://github.com/ksquared-16/alloy/pull/210)).

---

## 1. §19 · P1 "Complete" — the seven frozen items

| # | Frozen item | Verdict | Evidence |
|---|---|---|---|
| 1 | five verbs **admitted** | ✅ | `intake/authoringIntake.test.ts` — "verb + lineage structural rules": `create` roots a lineage (no transition); `revise`/`correct`/`replace`/`cancel` each require a predecessor and type the transition `revision`/`correction`/`replacement`/`cancellation` |
| 2 | modality closure enforced | ✅ | same — "modality closure": each of the five accepted; **"rejects a sixth modality BEFORE any commit"**. DB `operational_expectations_modality_check` |
| 3 | semantic line enforced | ✅ | same — "rejects a condition that smuggles a sensor/fact across the semantic line"; "rejects a condition naming a fact_type (measurable belongs in Config)" |
| 4 | Temporal-Frame required | ✅ | same — "rejects a missing temporal frame"; "rejects an invalid temporal frame"; "rejects an inverted valid window". DB `operational_expectations_temporal_frame_present` |
| 5 | Revision ≠ Correction typed | ✅ | typed at intake (item 1); **behavior** in `resolver/d2Revision.test.ts` + `d3Correction.test.ts`; observably distinct on equivalent fixtures |
| 6 | Standing/Authority gate live | ✅ | `ratification/waveCStandingCertification.test.ts`, `authority/*`, `standing/*`; certified on live Postgres in [Wave C](./operational-expectations-p1-wave-c-standing-ratification.md) §9 |
| 7 | footprint declaration emitted | ✅ | `intake/authoringIntake.test.ts` — "rejects a missing footprint"; "rejects a malformed footprint (no fact-types)". Stored and handed to P4; fan-out is **not** executed in P1 |

**All seven checked.**

## 2. §19 · P1 "Certification" — the frozen gates

| Gate | §5 owner | Verdict | Where it is held |
|---|---|---|---|
| **G-Modality-Closure** | P1 / M1 | **GREEN** | intake rejects a sixth modality; DB CHECK; M1 demo M1.3 |
| **G-Standing (authoring half)** | P1 / M1 | **GREEN** | standing computed server-side from the one held-authority resolver; caller cannot submit standing; ungoverned/unassigned authority yields `proposed`, never `binding`; AI never self-ratifies |
| **G-Revision** | P1 / M1 | **GREEN** | revision re-plans forward; the valid past is intact; the predecessor row is never mutated |
| **G-Acyclic** (P1 contribution) | P1+P4 / M3 | **contribution intact** | every write is an authoring act; effective expectations are read-only derived. P4 owns the mechanics half |
| *G-Correction (authoring half)* | P1+P3+P6 / M2,M4 | **GREEN (authoring half only)** | correction unwinds on the current-knowledge axis. The **financial** half is P3/M2 and the **work** half is P6/M4 — neither is claimed here |

**Every gate P1 owns is green.** Per §5 these are **standing invariants in CI**, not one-time checks — see §4.

## 3. §19 · P1 "Migration" and "Rollout"

| Frozen item | Verdict | Evidence |
|---|---|---|
| ledger on the twin substrate | ✅ | `expectationLedgerConformance.test.ts` (40 assertions); the ledger reuses the one neutral `operationalLedger` substrate as a conformer — it is not a second ledger mechanism |
| no Fact writes from intake | ✅ | `intake/authoringBoundaryGuards.test.ts` — intake sources contain no Standing/evaluation/propagation/effector/domain-branch code; the intake never writes a Fact and never selects a response |
| `oe.ledger.author` off = Facts-only preserved | ✅ | `intake/authoringIntake.test.ts` — **"flag OFF rejects authoring and writes nothing"** → typed `disabled`, no partial row. Off is the **default**. Per §8.1 the flag gates *rollout*, never *semantics*: it can never turn a proposed expectation into a binding one |

## 4. CI — gates are standing invariants (§5)

> §5: *"Any gate regressing after green **blocks the next milestone** — gates are standing invariants in
> CI, not one-time checks."*

Before this certification, **no Operational Expectations test ran in CI** — `web-typecheck.yml` runs
typecheck only, and `docs-lint.yml` runs docs-lint. Every G-* claim above was a one-time local run, which
is precisely what §5 says a gate is not.

`.github/workflows/operational-expectations-gates.yml` closes that: `npm run test --
tests/operationalExpectations/` on every PR touching `web/**`, `supabase/migrations/**` (the
migration-scan certifications read the migration directory directly), or the workflow itself.

**Scoped by design.** The repository's full Vitest suite is not green at baseline, so a whole-suite job
could not function as a gate — it would be red for reasons unrelated to Operational Expectations and
would be ignored within a week. A scoped job is a real invariant: green today, and any regression is
unambiguously ours. This reuses the pattern `docs-lint.yml` already established, rather than introducing
new CI machinery.

**Local result at certification:** `20 test files · 274 assertions · all passing · 778ms`.
Both typecheck graphs (`typecheck`, `typecheck:tests`) are green.

| Area | Assertions |
|---|---|
| intake (grammar · verbs · modality · semantic line · Temporal Frame · footprint · flag · idempotency) | 82 |
| resolver (D1–D4 + the M1 demo lineage) | 57 |
| ratification | 45 |
| ledger conformance (twin substrate) | 40 |
| authority (catalog · assignments · resolver) | 26 |
| standing | 24 |

## 5. M1 milestone evidence — the live demonstration

§4's M1 Demo is frozen as: *"Author a `required` staffing-ratio expectation on a real room; attempt a
malformed and a sixth-modality act (both rejected); revise it (re-plans) and correct it (unwinds) —
lineage visible."*

Executed in two halves, because re-plan and unwind are **derived on read** and never stored:

- **Database half** — `supabase/tests/operational_expectations/m1_demo.sql`, run against real Postgres
  14.17 through the shipped DDL, triggers and `SECURITY DEFINER` RPCs: **32 assertions, all passing.**
  Authors a `required` staffing-ratio expectation on `room-infant-1` under a governed, actually-held
  authority (self-ratifies → `binding`, one Authoring Act, assignment recorded as evidence); rejects a
  malformed act (absent Temporal Frame; inverted window) and a **sixth modality**, committing no row;
  appends a typed `revision` and a typed `correction`; proves the superseded rows are **never mutated**
  (`valid_to`/`temporal_frame`/`authored_at` intact) and that UPDATE/DELETE on the ledger are blocked;
  shows the 3-act lineage on one root with all three acts attributable.
- **Resolver half** — `web/tests/operationalExpectations/resolver/m1DemoLineage.test.ts`, **14
  assertions**, folding the **verbatim rows the live demo authored** (captured as
  `m1DemoLineage.fixture.json`, not hand-written). Proves on real data: August still resolves to the
  original (valid past preserved); the predecessor's effective window is **derived** truncated at the
  revision while the stored `valid_to` remains `null`; September re-plans to the revision as known before
  the correction; the correction unwinds it on the current-knowledge axis; as-known-at-T reconstructs the
  revision (audit); order-independence, idempotency and org isolation hold.

Each authoring act runs in its **own transaction**, as production does — `authored_at` defaults to
`now()`, which is transaction-start time in Postgres, so authoring the lineage in one block would stamp
identical recorded times and make the as-known-at-T axis undemonstrable. Recorded time strictly advances
across the three acts, and the resolver test asserts it.

**M1 exit + demo satisfied. G-Modality-Closure and G-Standing (authoring) green, as §4 requires.**

## 6. Cancellation & replacement — unratified, and why P1 still closes

Cancellation and replacement **effectivity** remain **deliberately unratified** (program-owner decision,
2026-07-16). Their storage and intake exist — the five verbs are admitted and typed — but their **fold
behavior is undefined in the frozen corpus**, so the resolver **fails closed**: any lineage whose known
horizon contains `cancellation` or `replacement` returns a typed `unsupported_transition` for the **whole
lineage** — never ignored, never aliased to correction/revision, never partially resolved.

**This does not block P1**, on the frozen text alone:

1. **§19 · P1 Complete** requires the five verbs be ***admitted*** — an intake predicate, satisfied. It
   does not say resolved, effective, or folded.
2. **§13 · P1 Completion Definition** names only *"a revision re-plans and a correction unwinds (distinctly
   typed)"*. Cancellation and replacement are **absent from it**.
3. **§5** assigns P1 no gate covering their effectivity — so no gate can fail on them.
4. **§4 · M1** Exit says the intake ***admits*** the five verbs; the Demo covers author / malformed /
   sixth-modality / revise / correct. Neither mentions cancel or replace.

Blocking P1 on them would require a criterion that exists nowhere in the frozen corpus — i.e. inventing a
gate, which the program forbids ("must not… create alternative readiness criteria, gates") and which §18
makes an escalation to the corpus owner, never an in-thread decision.

**Where it is owed.** The decision is carried into the **P1 public-interface freeze** (Checkpoint 2) and
is due by **P4 at the latest**, whose `Provides` includes a Typed Transition Event of
`revision|correction|cancellation|replacement` ([Realization §13 · P4](./operational-expectations-engineering-realization.md)).

**Historical debt.** The Wave D record deferred this to a "design correction package" that was **never
created, registered, or scoped** — the reference pointed nowhere and the decision had no owner. Recorded
as debt in the [Wave D record](./operational-expectations-p1-wave-d-revision-correction.md); deliberately
**not** invented here.

## 7. What P1 does not claim

P1 is one package of P0–P8. Certified here: the **authored ledger and the one authoring intake**. Not
built, not claimed, and out of P1's frozen scope:

- **No evaluation, judgment, or gaps** — P3, the keystone, behind **G-Parity**.
- **No clock, recurrence, scheduling, replay, or typed-transition fan-out** — P4.
- **No configuration storage or UI, no measurable bindings** — P2.
- **No effector invocation, no Communications un-say** — P7.
- **No operator-facing authoring surface** — P5. The intake is server-side and flag-gated OFF.
- **No AI authoring** — P8.
- **The Effective Expectation Resolver is internal P1 implementation freedom** — it realizes P1's frozen
  `Provides` (the ledger read/query surface). It is **not** a Stable Public Interface and **not** a
  universal downstream dependency: P3 consumes assertions + lineage, P4 consumes acts + footprint.
- **The capability is not operational.** That is **M7**, requiring the full gate column, the live §10
  lifecycle demo, and merged Billing parity.

## 8. Documentation reconciled at close

The frozen program imposes **no documentation item** on P1 (§19 has none; §6.1 assigned capability
*registration* to P0, and it was done). These corrections are consequences of the closure act, landed with
it so staging never simultaneously asserts "P1 complete" and "Operational Expectations not built":

- **`platform-capabilities.md`** — Operational Expectations moved **Planned → In Progress**. The prior
  note, *"Not yet built — no runtime authoring path exists,"* was materially false once Waves A–D merged.
  It is **not** a blanket flip to Complete: the corrected note states that P0/P1 are complete and
  certified, that the authoring path is server-side and flag-gated OFF with no operator surface, and that
  the capability is operational only at M7.
- **`operational-expectations-implementation-program.md`** — the execution index still read *"Current
  Package: P0 / P0 implementation has not started"* and listed only P0 as Ready Now. Updated per its own
  rule (*"Implementation evidence updates a package's readiness state… recorded here without altering any
  architectural meaning"*): P0/P1 complete, **P2 Ready Now**, Checkpoint 2 next, and the open
  cancellation/replacement decision carried.
- **Wave D record** — the dangling "design correction package" reference recorded as historical debt.

## Cross-references

- [Engineering Realization](./operational-expectations-engineering-realization.md) — §13 · §19 · §5 · §4:
  the authority for every criterion certified above.
- [System design](../core/operational-expectations-system-design.md) — the frozen architecture.
- Wave records: [A](./operational-expectations-p1-wave-a-ledger-substrate.md) ·
  [B](./operational-expectations-p1-wave-b-authoring-intake.md) ·
  [C](./operational-expectations-p1-wave-c-standing-ratification.md) ·
  [D](./operational-expectations-p1-wave-d-revision-correction.md)
- [P0 certification](./operational-expectations-p0-substrate-reconciliation.md) — G-Reconciliation.
