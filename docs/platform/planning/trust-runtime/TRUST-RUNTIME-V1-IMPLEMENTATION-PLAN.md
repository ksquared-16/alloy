---
owner: platform
status: proposed
mission: trust-runtime-v1-implementation-plan
last_reviewed: 2026-08-02
---

# Trust Runtime V1 — Implementation Plan

**First vertical slice: `attention_suggestion_enrichment`, deterministic
strategy, no provider.**

This document is the implementation contract for Trust Runtime V1. It follows
the architecture-owner ratification recorded as
[`Trust Platform Decisions 019–022`](../../trust/trust-platform-decisions.md),
with Decision 014 amended. The doctrine questions that previously blocked design
are closed; see
[`TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md`](./TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md)
§11.

**No runtime, schema, provider or application code is written by this document.**
The footprints below are specifications to be implemented in the next mission.

---

## 1. Slice definition

| | |
|---|---|
| **Decision Class** | `attention_suggestion_enrichment` |
| **Consumer** | `POST /api/admin/ai/enrich-attention-suggestion` — today the only live LLM seam in Alloy, stubbed by default |
| **Reasoning Strategy** | `deterministic` only |
| **Providers** | **None.** No network egress, no key, no cost |
| **Knowledge** | None. The Knowledge Platform is Phase 4 |
| **Execution** | None. The package is presented to an operator as evidence |
| **Risk class** | Convenience — failure is cosmetic operator-facing wording |

### Why this slice

1. **Complete.** Every V1 engine participates on the real path; none is stubbed
   out of the sequence.
2. **Provable with no provider.** Decision 019 makes a deterministic strategy
   inside a submitted Decision Contract valid Trust Runtime execution, so the
   kernel certifies with zero egress.
3. **Guaranteed fallback.** The deterministic path *is* the implementation, so
   the fallback cannot regress.
4. **Touches nothing prohibited.** No authorization, execution, permission,
   truth, validation rule, or record ownership.
5. **Reuses what exists.** Policy, redaction, permission guards, route guards, a
   Zod-validated envelope, and a telemetry contract are already in place.

### Explicitly out of this slice

Knowledge retrieval · alternatives · budgets · scheduler · caching · learning
candidates and promotion · replay · any provider adapter · any probabilistic
strategy · tokenization (Phase 3, when identity first reaches a strategy) ·
Processing, BOS, Communications and Search consumers.

**V1 is not broadened.** A capability not listed above is out of scope even if
doctrine names it.

---

## 2. V1 component boundaries

Boundaries as ratified. The "owns" column is exclusive: nothing else may own it.

| Component | Owns | Explicitly does not own |
|---|---|---|
| **Decision Contract** | Declared intent, decision class, context, information + knowledge requirements, privacy policy reference, validation policy reference, economic constraints, success criteria | Prompts, providers, models, API parameters — these must not be *representable* in the type |
| **Decision Class Registry** | Code-owned, closed set. Per class: risk tier, required evidence, privacy policy, validation policy, trust threshold, review policy, learning policy, economic policy | Runtime behaviour; a class declares, it does not execute |
| **Decision Engine** | Contract lifecycle; the one-contract-one-package guarantee; immutability after execution begins | Reasoning, validation rules, trust semantics |
| **Classification Engine** | Assignment of exactly one primary Information Class per element, by meaning | Storage, field naming, ownership of the classified data |
| **Privacy Engine** | Minimization, transformation, Reasoning Context construction, auditable `RedactionStep[]` | Authorization, retrieval policy, reasoning |
| **Strategy Engine** | Deterministic strategy selection; least-cost-sufficient ordering; escalation ladder | Provider choice (Phase 3, and internal to Reasoning) |
| **Reasoning Runtime** | Proposal generation and confidence | Retrieval, privacy, validation, trust semantics, execution |
| **Validation Engine** | **Orchestration only** — calls the domain validator that owns each rule and records results | Any business rule. It never re-implements or duplicates a validator |
| **Trust Engine** | Assembly of trust evidence; application of Governance-owned semantics | Trust Vector / Trust Score **semantics** — owned by Trust Governance |
| **Decision Package builder** | The immutable artifact, including failure packages | Mutation, execution, outcome state |
| **Observation recorder** | `CaptureOutcome()` — append-only observations referencing a package | Any write to the package |
| **Economics recorder** | Strategy, latency, escalation level, cache utilization, cost per decision | Budget authoring surface (Phase 2) |
| **Event emitter** | Closed Trust event vocabulary over `workflow_events` | A new bus, ledger or workflow runtime |

### Boundaries that are *not* Trust Runtime

Per [`Decision 019`](../../trust/trust-platform-decisions.md), these stay where
they are and are **not** migrated by V1: Stage Resolver · Action Evaluator ·
Subject Resolver · Participation Resolver · relationship-authority resolver ·
`createLeadIntakeValidation` · Action Registry eligibility · Operational
Calculations · `classifyNonFormSource` · `documentFacts` · the Objective
authorization conjunction · every domain validator.

Per [`Decision 022`](../../trust/trust-platform-decisions.md), durable mutation
remains with Operational Commands and Business Process Execution; the Objective
Platform coordinates objectives. A Decision Package is evidence.

---

## 3. Proposed runtime footprint

`web/lib/trust/` — new. Nothing under it may be imported by `lib/objective/`,
`lib/adminV2/actions/`, the relationship-authority modules, or any domain
validator.

| Path | Contents |
|---|---|
| `contract/` | Decision Contract type, builder, immutability guard, lineage |
| `decisionClasses/` | Closed registry; `attention_suggestion_enrichment` is its only V1 entry |
| `classification/` | Information Class assignment |
| `privacy/` | Privacy Engine; consumes the existing redaction primitive |
| `strategy/` | Strategy selection and the escalation ladder |
| `reasoning/` | Reasoning Runtime; strategies register here. **Phase 3** adds providers beneath it |
| `validation/` | Validation orchestration — a registry of *calls into* domain validators |
| `trust/` | Trust evidence assembly; Governance-owned semantics applied here |
| `package/` | Decision Package builder, including failure packages |
| `observation/` | `CaptureOutcome()` |
| `economics/` | Usage recording |
| `events/` | Closed Trust event vocabulary over `emitEvent` |
| `persistence/` | Repository functions over the four tables |

### Prerequisite refactor, before any of the above

`lib/ai/buildOperationalSummary.ts` is deterministic and is consumed by
`lib/queues/QueueService.ts`; `lib/pos/processingCase/commit/auditExistingChildCommit.ts`
uses `redactObjectForAi` for **audit**, not AI. Neither belongs to the reasoning
platform. Both must be relocated out of `lib/ai/` **before** `lib/ai/` is
absorbed, or the queue and the Processing commit audit are dragged into
`lib/trust/`.

---

## 4. Proposed schema footprint

Four tables. Additive, `trust_`-prefixed, no existing table altered. Invariants
are enforced by database constraints and triggers, following the Objective
Platform precedent — not by service convention.

### `trust_decision_contracts` — insert-only

| Column | Notes |
|---|---|
| `id`, `org_id` | |
| `decision_class_key` | Must exist in the code-owned registry |
| `intent`, `context` | jsonb; declared, never inferred |
| `information_requirements`, `knowledge_requirements` | jsonb |
| `privacy_policy_key`, `validation_policy_key` | Policy references, not implementations |
| `economic_constraints`, `success_criteria` | jsonb |
| `correlation_id`, `initiating_actor_type`, `initiating_actor_id`, `channel` | Attribution, reusing the five distinct concepts the Objective activity envelope established |
| `lifecycle_state` | `created → accepted → prepared → executing → validated → packaged → completed \| archived` |
| `runtime_version`, `registry_version` | Reproducibility |
| `created_at` | |

**Invariants.** No `UPDATE` after `lifecycle_state` leaves `created`, except the
state column itself advancing along the declared sequence. No column may hold a
prompt, provider name, model identifier or API parameter.

### `trust_decision_packages` — insert-only, immutable

| Column | Notes |
|---|---|
| `id`, `org_id`, `contract_id` | Unique on `contract_id` — the one-contract-one-package guarantee, enforced |
| `outcome` | `recommended \| refused_insufficient_information \| refused_policy \| refused_privacy \| refused_budget \| failed_validation \| failed_reasoning` |
| `recommendation`, `evidence`, `alternatives` | jsonb; `alternatives` empty in V1 |
| `confidence` | Statistical certainty only |
| `trust_vector`, `trust_score` | Computed from Governance-owned semantics |
| `validation_results` | Which validators ran, owned by whom, and what they returned |
| `privacy_report` | `RedactionStep[]` and the classes that participated |
| `economics` | Strategy, latency, escalation level, cache utilization, cost |
| `learning_metadata` | Policy and eligibility, declared at creation |
| `knowledge_versions` | Empty in V1 |
| `strategy_key`, `strategy_version`, `validation_version`, `runtime_version` | Reproducibility |
| `supersedes_package_id` | **Lineage.** Set when a materially modified recommendation produced this package |
| `review_requirement` | Deterministic, from the Decision Class |
| `created_at` | |

**Invariants.** `UPDATE` and `DELETE` refused by trigger — the package is
immutable at creation. No lifecycle, accepted, rejected, overridden or executed
column may exist on this table
([`Decision 020`](../../trust/trust-platform-decisions.md)).

### `trust_decision_observations` — append-only

| Column | Notes |
|---|---|
| `id`, `org_id`, `package_id` | |
| `observation_kind` | `presented \| accepted \| rejected \| overridden \| modified \| deferred \| executed \| outcome` |
| `observed_by_actor_type`, `observed_by_actor_id`, `channel` | |
| `execution_reference` | When `executed`: the registered command invocation or Objective that executed. Evidence of execution — never an instruction to execute |
| `detail`, `observed_at` | |

**Invariants.** Insert-only; `UPDATE`/`DELETE` refused. An observation cannot
exist without its package.

### `trust_reasoning_usage` — append-only

Strategy, escalation level, latency, cache utilization, cost, per contract.
Aggregated by Operational Intelligence; never read by reasoning.

### Events

A closed, code-owned vocabulary emitted through the existing `emitEvent` into
`workflow_events` — `decision_requested`, `decision_prepared`,
`information_classified`, `privacy_transformed`, `knowledge_retrieved`,
`strategy_selected`, `reasoning_completed`, `validation_succeeded`,
`validation_failed`, `decision_package_created`, `decision_presented`,
`decision_accepted`, `decision_rejected`. No new bus, ledger or workflow
runtime.

---

## 5. Acceptance criteria — slice 1

Each is binary and independently checkable. The slice is not accepted until all
pass.

### A. Contract

- **A1** A Decision Contract can be created for `attention_suggestion_enrichment`
  and is persisted before any reasoning begins.
- **A2** The Decision Contract type **cannot represent** a prompt, provider name,
  model identifier or API parameter. Demonstrated by typecheck failure, not by
  convention.
- **A3** An unknown `decision_class_key` is refused at creation. No contract row
  is written.
- **A4** A contract whose `lifecycle_state` has left `created` cannot be updated,
  refused by the database.

### B. Order

- **B1** The runtime executes exactly the canonical order from
  [`Decision 021`](../../trust/trust-platform-decisions.md): resolve truth and
  context → classify → privacy → authorized knowledge → strategy → reasoning →
  deterministic validation → trust evaluation → package.
- **B2** No unclassified information element reaches the Privacy Engine.
- **B3** No untransformed information element reaches a strategy.
- **B4** Knowledge content is retrieved only after privacy preparation. (V1
  retrieves none; the ordering assertion still holds against the empty set, and
  the seam is proven.)

### C. Package

- **C1** Exactly one package exists per completed contract, enforced by a unique
  constraint, not by service code.
- **C2** `UPDATE` and `DELETE` on a package are refused by the database.
- **C3** No lifecycle / accepted / rejected / overridden / executed column exists
  on the package table. Verified by schema assertion.
- **C4** A materially modified recommendation produces a **new** contract and a
  **new** package whose `supersedes_package_id` points at the predecessor. The
  predecessor is unchanged, byte for byte.
- **C5** Every package carries evidence, confidence, trust vector, trust score,
  validation results, privacy report, economics and the four version fields.
- **C6** Confidence and trust score are separately computed and separately
  stored.

### D. Refusal — the default

Each of these produces a **Decision Package with a refusal outcome**, zero
operational mutation, and zero writes outside the four Trust tables:

- **D1** Org policy disabled.
- **D2** Decision Class not permitted for the org.
- **D3** Required information unavailable.
- **D4** Privacy policy prohibits an element the class declares as required.
- **D5** Deterministic validation fails.
- **D6** Reasoning cannot produce a proposal.
- **D7** Caller lacks the required permission.

**D8** In every refusal case the operator receives a package explaining why —
never a bare error, never silence.

### E. Validation ownership

- **E1** The Validation Engine invokes domain validators and records their
  results and their owning module.
- **E2** No business rule is implemented inside `lib/trust/validation/`.
  Enforced by review plus an assertion that the validation registry contains
  only call-outs.

### F. Trust ownership

- **F1** Trust Vector dimensions and thresholds are read from
  Governance-owned configuration, not hardcoded in the Trust Engine.
- **F2** Changing a threshold changes the trust score with no change to runtime
  code.

### G. Boundary

- **G1** Nothing in `lib/objective/`, `lib/adminV2/actions/`, the
  relationship-authority modules, or any domain validator imports `lib/trust/`.
  Enforced by an automated test in CI, not by convention.
- **G2** `lib/trust/` performs no durable mutation of any business table.
  Enforced by the same test.
- **G3** No Decision Package can be executed. There is no code path from a
  package to a mutation.

### H. Reproducibility

- **H1** A persisted contract plus its four version fields re-executes.
- **H2** Replay produces a **new** package. The historical package is unmodified.

### I. Non-regression

- **I1** The existing enrichment route behaves identically for callers that do
  not opt into the Trust path.
- **I2** `npm run typecheck` rc=0.
- **I3** No new `docs:lint` findings on changed files.
- **I4** The existing BOS and queue suites are unchanged in outcome, measured
  base-vs-branch with identical dependencies.

---

## 6. Certification scenarios — slice 1

Run on an isolated Supabase project against the full migration chain. Not
asserted from memory; each scenario names its evidence.

| # | Scenario | Evidence |
|---|---|---|
| **S1** | Happy path — contract created, canonical order executed, deterministic strategy selected, validation orchestrated, package built, event stream emitted, outcome observed | One contract row, one package row, ordered event sequence, one observation |
| **S2** | Immutability — attempt `UPDATE` and `DELETE` on a package | Both refused by the database, with the trigger's message |
| **S3** | One-to-one — attempt a second package for a completed contract | Refused by unique constraint |
| **S4** | Lineage — materially modify a recommendation | New contract, new package, `supersedes_package_id` set, predecessor byte-identical |
| **S5** | Observation append-only — attempt `UPDATE`/`DELETE` on an observation; attempt an orphan observation | All three refused |
| **S6** | Ordering — instrument the pipeline and assert the canonical step sequence; assert no unclassified element reaches privacy and no untransformed element reaches a strategy | Recorded step trace |
| **S7** | Refusal matrix — D1 through D7, one case each | Seven refusal packages, zero mutations outside the Trust tables |
| **S8** | Determinism preference — a contract satisfiable deterministically selects the deterministic strategy and never escalates | Strategy field on the package |
| **S9** | Privacy — no element classified `Identity` reaches a strategy in raw form under any policy setting; `RedactionStep[]` accounts for every transformation | Privacy report + property test over generated payloads |
| **S10** | Validation orchestration — a domain validator that refuses causes a `failed_validation` package naming the owning validator; the rule is not duplicated in `lib/trust/` | Validation results block |
| **S11** | Trust semantics — change a Governance threshold, re-evaluate, observe a different trust score with no runtime code change | Two packages, one code version |
| **S12** | Structural boundary — the import test | CI pass, and a deliberately-introduced violating import fails it |
| **S13** | Reproducibility — replay a historical contract | New package produced; historical package unmodified |
| **S14** | Type invariant — attempt to place a prompt, provider name, model id and API parameter into a Decision Contract | Four typecheck failures |
| **S15** | Consumer surface — the operator sees recommendation, evidence and remaining uncertainty; never raw provider output; refusals render as explanations | Browser QA at desktop and 375×812 |
| **S16** | Non-regression | Objective, BOS and queue suites; typecheck rc=0; base-vs-branch failing-file comparison |

### Certification rules carried forward

1. Historical suites are never rewritten. A superseded assertion is documented
   with its supersession reason.
2. Baselines are measured, not remembered — pre-existing failures proven
   pre-existing by scoped base-vs-branch comparison with identical dependencies.
3. A failed read is never an empty result.
4. Certification runs on an isolated project against the full migration chain,
   never a shared stack.

### Inherited red — must not be silently absorbed

The repository carries large pre-existing documentation debt above the stored
lint baseline — on this branch, 642 broken-link, 237 orphan-canonical and 21
generated-boundary findings, essentially all of it in `docs/archive/` and
`docs/api/` and none of it in the Trust corpus. `docs:lint:ci` **passes** on
this branch (exit 0) with **zero findings on any file this work changed**.

Trust Runtime certification asserts only that no new finding appears on changed
files. It does not adopt, and must not silently absorb, the repository-wide
backlog.

---

## 7. Definition of done — slice 1

- All acceptance criteria in §5 pass.
- All sixteen certification scenarios in §6 produce their named evidence.
- The prerequisite refactor in §3 is complete: no deterministic operational
  utility remains under an AI or Trust namespace where a non-reasoning consumer
  depends on it.
- No provider, no network egress, no key, no cost.
- Doctrine unchanged — if the slice could not be expressed within
  Decisions 019–022, that is reported as a doctrine defect rather than worked
  around.

---

## Related

- [`TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md`](./TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md)
- [`AI-READINESS-INVENTORY.md`](./AI-READINESS-INVENTORY.md)
- [`Trust Platform Decisions`](../../trust/trust-platform-decisions.md) — Decisions 019–022
- [`Trust Runtime`](../../trust/trust-runtime.md)
- [`Trust Platform Manifesto`](../../trust/trust-platform-manifesto.md) — Reasoning Boundary Test
