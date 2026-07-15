---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — P0 Substrate Reconciliation Certification

**Status:** Canonical P0 certification record (2026-07-13). Certifies **P0 — Doctrine Reconciliation &
Substrate Alignment** and the **G-Reconciliation** gate. This document introduces **no architecture,
no ontology, no new concept**; it records reconciliation evidence over the frozen corpus.

> **Authority.** P0 scope, contracts, and completion criteria are authoritative in the
> [Engineering Realization §13 · §19 (P0)](./operational-expectations-engineering-realization.md).
> The doctrine sweep this certification depends on was performed by the
> [Doctrine Convergence Certification](./operational-expectations-doctrine-convergence.md); the
> frozen architecture is the [System Design §0.5](../core/operational-expectations-system-design.md) and
> the [Architecture Closeout](./operational-expectations-architecture-closeout.md). Where anything
> here appears to decide, it is recording an already-frozen decision.

---

## 1. P0 mission & boundary (as extracted from the frozen corpus)

- **Mission.** Land the §0.5 reconciliation (derived-L3 "Expectations" → **Projection**; Law 2 →
  "Projections derived / Expectations authored"), register the two authored ledgers as capabilities,
  and **confirm** the existing bitemporal / lineage / replay substrate that carries Operational Facts
  can host the twin (Expectation) ledger — with the correction-carrying **Fact Contract** present as
  the read seam.
- **Boundary (what P0 is NOT).** A **naming + substrate-fitness** package only. **No** ledger code,
  **no** authoring, **no** engine, **no** schema/API, **no** rename of code symbols
  (`scheduleExpectationCore.ts`, `readiness_expectations`, `expectations/*` — explicit carve-outs,
  separately scheduled). P0 does **not** implement the Expectation ledger; it proves the substrate can
  host it and clears the naming ambiguity that would otherwise make every P1 review read as a Law-2
  violation (R11).

---

## 2. Reconciliation ledger

Every P0 concern, its evidence, classification, and disposition. Classifications:
`Required for P0` · `Documentation-only alignment` · `Test/certification addition` · `Deferred to
P1+` · `Out of scope`.

| # | Finding | Evidence | Classification | Disposition |
|---|---|---|---|---|
| 1 | Law 2 rewritten to "Projections derived / Expectations authored" | `core/operational-truth-flow-doctrine.md:118` + reconciliation note `:14` | Documentation-only alignment (already landed by convergence) | Confirmed present — no change needed |
| 2 | Derived-L3 renamed **Projection** across canonical docs | Convergence §1–§3 (truth-flow, ux-doctrine, RFC, attendance, financial, billing, glossary, active audit) | Documentation-only alignment (already landed) | Confirmed present — no change needed |
| 3 | **`docs/README.md` still carried the retired doctrine** — axis "…Operational Expectations (derived) → …Facts" and "expectations are derived/non-authoritative" (L20); axis "Intent → Expectations → Facts" (L72). The convergence full-tree scan missed the docs root index. | `docs/README.md:20,72` (pre-change) | **Required for P0** (partial-sweep residual — risk E3) | **Fixed** — axis relabelled to Projections; two-ledger authoritativeness stated; `last_reviewed` bumped |
| 4 | `platform-capabilities.md` did not register **Operational Facts** / **Operational Expectations** as capabilities | Convergence §5 residual; closeout §4 | **Required for P0** | **Added** a "Operational truth (two-ledger ontology)" section registering both ledgers |
| 5 | No standing CI guard enforced G-Reconciliation (grep was one-time) | §5 certification rule ("gates are standing invariants in CI, not one-time checks"); risks E3/E14 | **Test/certification addition** | **Added** `retired-doctrine-term` rule to the existing `docs-lint` (one mechanism, not a second) |
| 6 | Persisted **Expectation ledger** does not exist | Substrate inventory §Expectations-table check (`operational_expectations`/`expectation_ledger` tables ABSENT) | Correct-by-design (P1 builds it) | Confirmed absent — P0 must not build it |
| 7 | Migration comments assert "expectations are derived (L3) — no materialized expectation tables here" | `20260629120000_childcare_attendance_facts_p2.sql`, `20260628120000_childcare_config_rules_phase1.sql` | **Deferred to P1+** (code/schema text = out of P0's docs scope) | Flagged for the P1 ledger build; **not** touched by P0 |
| 8 | Code symbols under `web/lib/childcareOperational/expectations/*` carry `Expectation` names but denote L3 Projections | Substrate inventory §6; convergence §4 carve-outs | **Out of scope** (explicit carve-out) | **Left untouched** — separately scheduled rename |

**Result:** exactly two `Required for P0` documentation alignments (#3, #4), one `Test/certification
addition` (#5), and the substrate confirmation (§3). No architectural contradiction was found; nothing
required escalation.

---

## 3. Substrate-fitness confirmation

**Verdict: the substrate that carries Operational Facts is fit to host a twin, append-only,
bitemporal, lineage-tracked Operational Expectations ledger.** The evidence is a purpose-built,
domain-neutral **Operational Fact Contract** (`web/lib/operationalFacts/factContract.ts` +
`factConformance.ts`) explicitly designed for *additional conforming streams*. A twin ledger is a new
**conformer** (one descriptor + one probe set + a dedicated append-only table), **not** new machinery.
The proven template is the `child_attendance_events` fact stream.

| Substrate capability | Fitness | Primary evidence (`file` / object) |
|---|---|---|
| Canonical fact persistence | **Strong** | `workflow_events` (`supabase/migrations/20260329165048_remote_schema.sql`); `web/lib/emitEvent.ts`; per-domain authoritative tables `child_attendance_events`, `consumption_events` |
| Append-only enforcement | **Strong (per-domain)**; asymmetric on the event bus | DB trigger `prevent_child_attendance_events_mutation` (`20260629120000_…attendance_facts_p2.sql`); contract probe `assertFactStreamConforms`. *Caveat:* `workflow_events` is the communication bus (SELECT-only RLS), not the authoritative append-only store — the twin ledger follows the per-domain table pattern |
| Bitemporal (valid vs transaction time) | **Strong, repeated** | `service_date` vs `created_at` (attendance); `occurred_at` vs `created_at` (`workflow_events`); `effective_at` vs `committed_at` (`mutation_events`); `effective_start`/`effective_end` (config) |
| Lineage / correction-carrying **read seam** | **Strong** | `OperationalFactEntryType = original\|correction\|reversal` + `correctsColumn` + required payload key `corrects_event_id` (`factContract.ts`); self-FK `corrects_event_id` on `child_attendance_events` and `consumption_events` |
| Replay / deterministic processing | **Moderate** (per-derivation, not a global event-store replayer — consistent with the hybrid model) | `recomputeObligation`, `fact_snapshot` (`operationalConsumption/obligationReviewService.ts`, `consumptionTypes.ts`); pure cores ("no DB, no IO") |
| Read seam / Fact Contract | **Strong** (designed for new conformers) | `factContract.ts` (`OperationalFactStreamDescriptor`), `factConformance.ts` (`assertFactStreamConforms`), reference `ATTENDANCE_FACT_DESCRIPTOR` |
| Tenant / org boundary | **Strong, uniform** | `org_id NOT NULL` + org-scoped RLS via `has_org_role(...)` across fact/config tables; contract `orgColumn` + `org_scoped_rls` probe |
| Config versioning (effective-dated, supersede-not-patch) | **Strong** | `20260628120000_childcare_config_rules_phase1.sql`; `resolveConfigRule.ts` (most-specific-wins + latest-effective-start) |
| Business-Process trigger model (A2 generalizes it) | **Present** | `applyConfiguredStageRulesForStatusEntry` / `…ForDomainSignal` (`lib/lifecycle/…`); `mutation_events` outbox; `process_instances` |

**Correction-carrying Fact Contract (the P0 read seam) — CONFIRMED PRESENT.** `factContract.ts` is a
typed, domain-neutral read/conformance seam whose entry-type union and `corrects_event_id` self-FK
already express *correction-by-reference, never by mutation* — exactly the read-seam shape the frozen
design requires (P0 confirms it; it is **not** built here).

**The one true gap is doctrinal, not structural:** persisting expectations previously contradicted the
"expectations are derived (L3)" doctrine — which is precisely the ambiguity §0.5 / Law 2 resolved. The
substrate primitives to stand up the twin ledger cleanly (dedicated append-only table + prevent-mutation
trigger + `org_id`/RLS + effective/recorded columns + `entry_type`/`corrects_event_id` + a new
`OperationalFactStreamDescriptor` + one conformance probe set) all exist today.

---

## 4. G-Reconciliation certification

**Acceptance rule (corpus):** the truth-flow doctrine no longer says "Expectations are derived";
derived-L3 is renamed Projection; Law 2 amended; **no naming ambiguity in the repo**.

**Evidence:**

1. **Law 2 amended** — `core/operational-truth-flow-doctrine.md:118` reads "Projections are derived /
   non-authoritative — Expectations are authored." ✅
2. **Derived-L3 renamed Projection** — all convergence targets consistent (Convergence §3); the
   glossary two-ledger map is canonical. ✅
3. **Repo grep clean** — no governed doc asserts the retired doctrine outside the frozen
   reconciliation-record set. The residual in `docs/README.md` (the one file the convergence full-tree
   scan missed) is **fixed**. ✅
4. **Standing guard installed** — `scripts/docs-lint.mjs` `retired-doctrine-term` rule (blocking on
   changed governed files) makes the grep a **standing CI invariant**, satisfying the "gates are
   standing invariants, not one-time checks" rule and mitigating E3 (partial sweep) / E14 (frozen-doc
   drift). Full-tree count after the README fix: **0**.

**Guard scope (no silent cap):** the guard scans **governed** docs (`docs/README.md`,
`docs/platform/**`, `docs/system/**`, `docs/product/**`) and **exempts** the frozen
reconciliation-record set (system design, the four OE milestone docs, this certification, the truth-flow
doctrine, the glossary) — those docs legitimately quote the retired terms as before-text / retired-usage
warnings. It does not scan `docs/audits/**` or sprint/archive trees.

```
G-Reconciliation: GREEN
```

**R11 (name ambiguity until P0) — RETIRED.** The word "Expectation" now carries exactly one meaning at
every active doc boundary (the authored ledger); derived state is uniformly "Projection"; a standing
guard prevents regression.

---

## 5. Dependency & governance integrity

- **No dependency on P1 or downstream.** P0 touches only documentation + one doc-lint rule; it reads no
  ledger/engine/config code and adds none.
- **P0 unlocks P1 without implementing it.** P1 has one clear foundation path: the confirmed Fact
  Contract read seam + the `child_attendance_events` append-only template. No Expectation ledger,
  authoring intake, evaluator, event bus, or binding system was introduced.
- **No second evaluator / event bus / binding / state authority** was introduced. The certification
  guard extends the **existing** `docs-lint` mechanism (not a second linter).
- **No Billing / Scheduling / Current Work / Communications / AI logic** entered the foundation.
- **Frozen documents were not semantically changed.** README and platform-capabilities were aligned to
  the already-frozen decision; no frozen semantics were edited. No architectural ambiguity required
  escalation.

---

## 6. What P0 explicitly does not do

- Does **not** build the Expectation ledger, authoring intake, evaluation engine, or any runtime.
- Does **not** rename carve-out code symbols (`scheduleExpectationCore.ts`, `readiness_expectations`,
  `expectations/*`) or edit migration comments — those are separately-scheduled implementation work
  (ledger #7, #8).
- Does **not** open any feature flag (P0 is docs-only; no runtime change).
- Does **not** begin P1.

**Downstream unlocked:** **P1 — Expectation Ledger & Authoring Intake.**

## Cross-references

- [Engineering Realization §13 · §19 (P0)](./operational-expectations-engineering-realization.md) — the P0 contract & checklists.
- [Doctrine Convergence Certification](./operational-expectations-doctrine-convergence.md) — the doctrine sweep this builds on.
- [System Design §0.5](../core/operational-expectations-system-design.md) — the ratified reconciliation.
- [Architecture Closeout](./operational-expectations-architecture-closeout.md) — the freeze.
- [`../foundation/platform-capabilities.md`](../foundation/platform-capabilities.md) — the two ledgers registered.
