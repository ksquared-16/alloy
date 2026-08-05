---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-05
supersedes: []
---

# Phase 1 — Processing Trust-Adoption Assessment and Slice Plan

**This document is an assessment and a plan. No production behaviour was implemented in the session
that produced it.**

Phase 0 is merged into `staging` as `b6927558fef1493b0b8726123abe98e57961eb3d` (PR
[#338](https://github.com/ksquared-16/alloy/pull/338)). Phase 0 made the Trust Runtime *adoptable*; it
adopted nothing. Phase 1 is the first adoption, and it adopts inside Alloy Processing.

**The governing finding of this assessment:** Processing already owns a deterministic authority chain
that is, in the specific area of *execution*, **stronger than anything Trust provides**. The Commit
Plan is versioned, content-hashed over a material projection, approval-bound to an exact
`(planId, version, contentHash)` triple, preflight-validated, superseded on rebuild, and executed
idempotently with compensation. A Decision Package has none of that and must not acquire it.

Trust's contribution to Processing is therefore **not** a better execution artefact. It is the one
thing Processing measurably lacks: **an immutable, replayable record of what the deterministic engine
judged, and why, that survives operator correction.** Today that record is destroyed at the moment an
operator acts — in two places, proven below.

---

## 1. Current-state inventory

### 1.1 The deterministic Processing identity-resolution chain, end to end

| # | Stage | Owner (code) | Storage | Mutability today |
|---|---|---|---|---|
| 1 | Case creation from a source | [`openProcessingCaseFromSource.ts`](../../../../../web/lib/pos/processingCase/openProcessingCaseFromSource.ts), `maybeOpenProcessingCaseFrom{FormSubmission,NonFormSource,PacketCompletion}Safe.ts` | `processing_cases` | Mutable row (`status`, `case_type`, `metadata`) |
| 2 | Source adapters | [`sources/`](../../../../../web/lib/pos/processingIdentity/sources/) — `formIntakeAdapter.ts`, `createLeadIntakeAdapter.ts`, `createLeadFacts.ts`, `stableSourceId.ts` | — | Pure + insert |
| 3 | Normalized facts | [`processingFactsDb.ts`](../../../../../web/lib/pos/processingIdentity/processingFactsDb.ts) | `processing_facts` | **Append-only.** Correction appends a new row with `corrected_from` |
| 4 | Facts hash | `hashFactsForResolution()` in the same module | `processing_resolutions.input_facts_hash` | Derived — **see defect D-1 (§9)** |
| 5 | Subject grouping | `buildResolutionSubjects()` in [`canonicalResolutionEngine.ts`](../../../../../web/lib/pos/processingIdentity/canonicalResolutionEngine.ts) | in-memory | Pure. Roles: `parent`, `child`, `household`, `lead` |
| 6 | Candidate generation | [`lib/identity/generateCandidates.ts`](../../../../../web/lib/identity/generateCandidates.ts), `householdGraph.ts` | in-memory | Reads records; writes nothing |
| 7 | Evidence signals | [`lib/identity/signals.ts`](../../../../../web/lib/identity/signals.ts) | embedded in `candidates` jsonb | `IdentitySignal{key,kind,strength,subjectFactRefs,recordFieldRefs,reasonCode,explanation}` |
| 8 | Confidence band | [`lib/identity/confidenceBand.ts`](../../../../../web/lib/identity/confidenceBand.ts) | embedded | 6 categorical bands; `score?: number` effectively unused |
| 9 | Conflict / contradiction | `blockingConflicts[]` on each candidate; `hasUnresolvedConflicts()` in the eligibility engine | embedded | — |
| 10 | Eligibility states | [`identityResolutionEligibility.ts`](../../../../../web/lib/pos/processingIdentity/operator/identityResolutionEligibility.ts) | derived, never stored | Pure projection over a resolution row |
| 11 | Operator decisions | `recordResolutionDecision()` in [`operatorReviewService.ts`](../../../../../web/lib/pos/processingIdentity/operator/operatorReviewService.ts) | `processing_resolutions` | **Destructive UPDATE — see defect D-2 (§9)** |
| 12 | Resolution generations | `generation_id` + `markResolutionSuperseded()` in [`processingResolutionsDb.ts`](../../../../../web/lib/pos/processingIdentity/processingResolutionsDb.ts) | `processing_resolutions` | UPDATE of `stale_at` / `superseded_by` |
| 13 | Commit Plan construction | [`buildCommitPlan.ts`](../../../../../web/lib/pos/processingIdentity/plan/buildCommitPlan.ts) | `processing_commit_plans`, `processing_plan_operations` | Immutable per version |
| 14 | Plan versioning + hashing | [`planHash.ts`](../../../../../web/lib/pos/processingIdentity/plan/planHash.ts) | `content_hash` | SHA-256 over a *material* projection |
| 15 | Approval binding | [`approval.ts`](../../../../../web/lib/pos/processingIdentity/plan/approval.ts) | `processing_approvals` | Binds `(planId, planVersion, planContentHash)` |
| 16 | Commit preflight | [`preflight.ts`](../../../../../web/lib/pos/processingIdentity/executor/preflight.ts) | — | Fail-closed, 8 failure families |
| 17 | Executor | [`commitExecutor.ts`](../../../../../web/lib/pos/processingIdentity/executor/commitExecutor.ts) | via `commands/registry.ts` | Atomic group → dependent → async outbox |
| 18 | Commit attempts | [`attemptsDb.ts`](../../../../../web/lib/pos/processingIdentity/executor/attemptsDb.ts) | `processing_commit_attempts` | Append-only |
| 19 | Exceptions | `insertException()` in the same module | `processing_exceptions` | Append-only |
| 20 | Audit events | **No dedicated activity/audit emitter exists in `lib/pos/processingIdentity`.** Audit is *implied* by the append-only tables and by `retention_class: "audit_authoritative"` on plans | — | — |

### 1.2 The classification chain (M5)

| Stage | Owner | Storage |
|---|---|---|
| Deterministic classifier | [`classifyNonFormSource.ts`](../../../../../web/lib/pos/processingCase/classification/classifyNonFormSource.ts) | pure |
| Safe wrapper | `maybeClassifyProcessingCaseFromDocumentSafe.ts` | — |
| Persistence | [`processingCaseClassificationDb.ts`](../../../../../web/lib/pos/processingCase/classification/processingCaseClassificationDb.ts) | `processing_cases.case_type` + `processing_cases.metadata.classification` |
| Operator correction | [`operatorCorrection.ts`](../../../../../web/lib/pos/processingCase/classification/operatorCorrection.ts) | same two fields, overwritten |

Contract: 6 keys (`subsidy_contract`, `remittance`, `immunization_record`, `enrollment_document`,
`form_like_document`, `unknown`), 3 statuses (`classified`, `unknown`, `unsupported`), numeric
confidence bounded to `[0, 0.95]`, weighted `ClassificationSignal[]`.

### 1.3 Schema owners

| Table | Migration |
|---|---|
| `processing_facts` | `20260716130000_processing_identity_b2_facts.sql` |
| `processing_resolutions` | `20260716140000_processing_identity_b3_resolutions.sql` |
| `processing_commit_plans` | `20260717120000_processing_identity_d1_commit_plans.sql` |
| `processing_plan_operations` | `20260717120500_..._tables2.sql` |
| `processing_approvals` | `20260717121500_..._processing_approvals.sql` |
| `processing_commit_attempts`, `processing_exceptions` | `20260717130000_processing_identity_d2_executor.sql` |
| `trust_decision_packages`, `trust_decision_contracts`, observations, usage | `20260802090000_trust_runtime_v1_foundation.sql`, `20260803230000_..._privilege_correction.sql`, `20260804210000_trust_lifecycle_observation_kinds.sql` |

### 1.4 Existing tests and certification

**Reusable unchanged (the byte-identical baseline):**
`tests/processing/processingIdentityB2Facts.test.ts` · `B3Resolver` · `B2B3Migrations` · `C1Shadow` ·
`D1Plans` · `D2Executor` · `D3Operator` · `D4CreateLead` · `D5PublicForm` · `E1Boundaries` ·
`ReviewGate` · `LocalPostgres` · `tests/security/processingIdentityB0TenantSecurity.test.ts` ·
`tests/identity/candidateClassification.test.ts` · `normalizationParity.test.ts` ·
`tests/pos/processingCaseClassification.test.ts` · `processingCaseClassificationCorrection.test.ts` ·
`tests/pos/processingIdentity/{reviewSummary,createLeadChildNamesAndHouseholdTitle}.test.ts`.

**Live certification harness:** `tests/processing/cert/processingIdentityCertFixtures.ts` +
`processingIdentityCertFlow.ts`, gated behind `PROCESSING_LOCAL_CERT_ENABLED=true` and a local
Postgres on `:55322`. Integration specs: `CertE2E`, `CertOperator`, `CertRls`, `CertTargetGuard`.
**This is the Phase 1 fixture corpus.** It already contains a shared-email / shared-phone collision
pair (`SHARED_EMAIL`, `SHARED_PHONE`) across two orgs — the ambiguity and tenant-isolation scenarios
are already seeded.

**Trust side, inherited from Phase 0:** `tests/trust` 255/255 across 8 files; 14 compile-time
invariants; `certification/trust-runtime-v1` 21/21; `trust-lifecycle-observations` 12/12;
`trust-metrics` 9/9.

---

## 2. Ownership map

| Concern | Owner after Phase 1 | Never |
|---|---|---|
| Source adapters, Processing Cases, normalized facts | **Processing** | Trust must not read operational storage |
| Candidate generation, signals, bands | **Processing** (`lib/identity`) | Trust must not introduce a second candidate engine |
| Eligibility states and the case-level gate | **Processing** | Trust must not gate a commit |
| Operator resolutions, create-new override, rejected-candidate audit | **Processing** | Trust must not accept an operator decision |
| Commit Plan, versioning, content hash | **Processing** | Trust must not version or hash a plan |
| Approval | **Processing** | Trust must not approve |
| Commit attempts, exceptions, identity writes | **Processing** | Trust must not execute |
| Decision class + strategy identity, evidence envelope, refusal semantics, package lifecycle, reasoning measurement | **Trust** | Processing must not restate governance |

**One-line rule.** *Processing decides and executes. Trust records — immutably, replayably — what the
deterministic engine judged before anyone acted on it.*

---

## 3. Processing → Trust concept matrix

| Processing concept | Current owner | Current shape | Trust analogue | Relationship | Convergence action |
|---|---|---|---|---|---|
| Processing Case | `processing_cases` row; `openProcessingCaseFromSource.ts` | Mutable row: `status`, `case_type`, `metadata` jsonb | Decision Contract **context** | **Reference only** | Contract carries `case_id`, `org_id`, `source_kind` in `context`. The case row is never copied into Trust and never written by Trust. |
| Processing facts | `processing_facts`; `processingFactsDb.ts` | Append-only rows, `corrected_from` lineage, `evidence` jsonb | `ReasoningEvidenceItem` (`kind: "authoritative_record"`) | **Referenced, not copied** | Evidence items carry `reference: "processing_fact:<id>"`. Normalized *values* are not copied into the package (§6). |
| Candidate set | `IdentityCandidate[]` in `processing_resolutions.candidates` jsonb | Up to 10–15 per subject, band-sorted | Recommendation **inputs** | **Distinct — must not merge** | The candidate array stays in the resolution row. The package's `recommendation` names the *selected* candidate id and band; it does not restate the array. |
| Confidence band | `CandidateConfidenceBand` (6 categorical) | `confirmed \| strong \| possible \| weak \| conflicted \| excluded` | `DecisionPackageV1.confidence: number \| null` | **Not equivalent** | Band travels **categorically** in `recommendation.confidence_band`. `confidence` is set to **`null`** — see §6.3. |
| Conflict | `blockingConflicts: IdentitySignal[]`, `confidenceBand === "conflicted"` | Per-candidate | **Review requirement** + `remaining_uncertainty` | **Neither refusal nor failure** | Conflict is a *valid deterministic judgment*. Outcome stays `recommended`; the recommendation's `state` is `conflicted` and `review_requirement` is `operator_review`. |
| Operator resolution | `recordResolutionDecision()` UPDATE | Mutable `decision_action`, `decided_by`, `provisional` | `accepted` / `rejected` / `overridden` / `modified` **observation** | **Distinct authority** | The operator's decision remains a Processing write. Trust appends an observation *referencing* the package. Trust never records the decision itself. |
| Resolution generation | `generation_id` + `input_facts_hash` | UUID per run | Decision **Package lineage** (`supersedes_package_id`) | **Parallel, not identical** | One generation produces **N packages** (one per subject). Generation stays the Processing lineage key; packages carry it in `context` and chain via `supersedes_package_id` per subject. |
| Commit Plan | `processing_commit_plans` + `processing_plan_operations` | Versioned, material-hashed, immutable per version | `proposed_command` binding | **MUST REMAIN DISTINCT — see §4.2** | The plan is **not** replaced, projected, or derived from a package. The plan gains a reference to the package ids it was built from. Nothing else changes. |
| Approval | `processing_approvals`; `bindApproval()` | Binds `(planId, version, contentHash)` | Confirmation evidence | **Distinct authority** | Approval stays a Processing artefact bound to a plan. It is **never** bound to a Decision Package. |
| Commit attempt | `processing_commit_attempts` | Append-only, idempotency-keyed | `executed` observation + `outcome` observation | **Reference only** | On a committed attempt, Processing appends `executed` observations to the packages the plan cited. |
| Exception | `processing_exceptions` | Append-only, typed + severity | `outcome` observation with `execution_result: "failed"` | **Reference only** | The exception row stays authoritative. The observation is a Trust-side echo for OI measurement. |

### 3.1 Where a one-to-one mapping is refused, and why

Four pairs must remain permanently distinct:

1. **Resolution row ≠ Decision Package.** The row is a *mutable working record* that the operator
   edits in place. The package is the *immutable engine judgment*. Collapsing them would either make
   the package mutable (violating Decision 020) or make the operator's decision a Trust write
   (violating "Trust does not become an identity store").
2. **Commit Plan ≠ Decision Package.** See §4.2. Different grain (case vs subject), different
   lifecycle (versioned vs immutable), different purpose (executable vs evidentiary).
3. **Approval ≠ any Trust artefact.** Approval is an *authority act binding to a content hash*. Trust
   has no equivalent and must not grow one.
4. **Eligibility state ≠ Decision Package outcome.** Eligibility is a case- and subject-level *gate*
   that composes cross-subject rules (a child's unconfirmed identity blocks the lead). A Decision
   Package outcome describes one governed reasoning execution. §5 maps them without merging them.

---

## 4. Artifact creation and lineage order

### 4.1 The recommended order

```text
1.  Source intake                  → Processing
2.  Processing Case created        → Processing            (case_id)
3.  Facts persisted                → Processing            (generation_id, input_facts_hash)
4.  Candidates generated           → Processing (lib/identity)
5.  FOR EACH SUBJECT:
      5a. Decision Contract        → Trust                 (contract_id)   ← new in Phase 1
      5b. Decision Package         → Trust                 (package_id)    ← new in Phase 1
      5c. processing_resolutions row inserted, carrying decision_package_id
6.  Operator review + correction   → Processing            (row UPDATE, unchanged)
      → Trust observation appended: accepted | rejected | overridden | modified
      → a corrected FACT starts a new generation → return to step 3
7.  Commit Plan built              → Processing            (planId, version, contentHash)
      → plan cites sourceResolutionVersions AND sourceDecisionPackageIds
8.  Approval bound to plan         → Processing            (planId, version, contentHash)
9.  Preflight → Executor           → Processing
10. Commit attempt persisted       → Processing
      → Trust observations appended: executed, outcome
```

**Step 5 precedes step 5c deliberately.** The package must be created from the engine's judgment
*before* the mutable resolution row exists, because the row is the thing that later gets overwritten.
This is the entire point of the adoption.

### 4.2 Why the Commit Plan is not replaced — the central architecture answer

The mission asks for the precise relationship among resolution generation, Decision Contract,
Decision Package, Commit Plan, approval, and commit attempt. The answer is that **the Commit Plan sits
strictly downstream of, and is never derived from, a Decision Package.** The evidence:

| Property | Commit Plan | Decision Package |
|---|---|---|
| Grain | **Case** (all subjects, ordered, dependency-linked) | **Subject** (one governed judgment) |
| Versioned | Yes — `version: number`, monotonic | **No** — immutable at creation, lineage via `supersedes_package_id` |
| Content hash | Yes — SHA-256 over a *material projection* that deliberately excludes `opOrder`, `reason`, `evidenceRefs`, `risk` | **No hash field.** `fingerprintDecisionPackage` exists for binding, not for approval |
| Approval binding | Yes — `(planId, planVersion, planContentHash)` | **None, and must never have one** |
| Preconditions | `record_version`, `no_blocking_conflict`, `resolution_generation` | None |
| Executable | Yes, via the registered command catalog | **Never.** "A Decision Package is evidence. It is never directly executable." |
| Compensation / idempotency | Yes | N/A |

Making the plan a projection of packages would require the package to carry a *material* hash and a
*version* — which is exactly the mutable-lifecycle shape that Decision 020 and AD-3 forbid, and which
Phase 0 spent slice 0.4 removing from the platform. **The convergence action is therefore additive
and one-directional: the plan gains `sourceDecisionPackageIds: string[]` alongside its existing
`sourceResolutionVersions: string[]`, and a matching `preconditions[kind: "decision_package"]` entry.
Nothing about hashing, approval, or execution changes.**

### 4.3 Stable lineage identifiers

| Identifier | Grain | Stability | Owner |
|---|---|---|---|
| `case_id` | case | permanent | Processing |
| `generation_id` | resolution run | per run; regenerated on correction | Processing |
| `input_facts_hash` | resolution run | derived — **defect D-1** | Processing |
| `subject_ref` | subject | stable within a case | Processing |
| `contract_id` | one governed execution | permanent | Trust |
| `package_id` | one governed execution | permanent, immutable | Trust |
| `supersedes_package_id` | package chain | per subject | Trust |
| `correlation_id` | traces a whole case run | **recommendation: `case_id`** | Processing supplies |
| `planId` / `version` / `contentHash` | case | immutable per version | Processing |

**Recommendation:** set `DecisionContractV1.correlation_id = case_id` so every package produced for a
case is retrievable by one operational key, and put `generation_id`, `subject_ref`, `subject_role`
and `input_facts_hash` in `context`.

### 4.4 Preserved rules — how each is satisfied

| Rule | How Phase 1 satisfies it |
|---|---|
| Decision Packages are immutable | Unchanged from Phase 0. No new writer mutates one. |
| Commit Plans are immutable and versioned | Unchanged. Phase 1 adds one array field at build time. |
| Approval binds to an exact plan version/hash | Unchanged. `approval.ts` is not touched. |
| Trust is not the mutation executor | `lib/trust` contains no `.update(`; the boundary suite scans source text. Phase 1 adds no Trust writer. |
| No identity write before approval + explicit commit | Unchanged. `executeApprovedPlanForCase` still runs `requirePlanEligibility` → preflight → executor. |
| Operator correction invalidates stale reasoning deterministically | A corrected fact appends a new `processing_facts` row → new `generation_id` → new contract → new package with `supersedes_package_id` → `superseded` observation on the predecessor. A rebuilt plan already calls `supersedePlan()`, voiding the prior approval. |
| Replay reproduces the same judgment | **Blocked by defect D-1 (§9). Must be resolved in Phase 1.2 or explicitly scoped out.** |

---

## 5. Status and outcome mapping

`IdentityResolutionEligibilityState` has five values. **None of them is a Decision Package outcome.**
All five are *valid deterministic judgments*, so every one of them yields
`outcome: "recommended"` with the state carried in the recommendation payload and the governance
consequence carried by `review_requirement`.

| Processing state | Trust outcome | `review_requirement` | Classification |
|---|---|---|---|
| `confirmed_existing` | `recommended` | `automatic` | Valid deterministic outcome |
| `confirmed_new` | `recommended` | `automatic` | Valid deterministic outcome |
| `needs_review` | `recommended` | `operator_review` | **Review requirement — not a failure** |
| `conflicted` | `recommended` | `operator_review` | Review requirement; contradiction is a finding, not an error |
| `unresolved` | `recommended` | `operator_review` | Valid outcome; the engine honestly has no decision |

`needs_review` is explicitly **not** classified as a failure. It is the engine successfully concluding
that a human must decide — which is exactly what `TRUST_REVIEW_REQUIREMENTS` exists to express.

### 5.1 Sub-states inside `needs_review` / `unresolved`

These are the `blockingReasons[].code` values, all preserved verbatim in
`recommendation.blocking_reasons`:

`plausible_match_needs_review` · `create_new_override_required` · `missing_selected_candidate` ·
`ambiguous_auto_link` · `unresolved_conflict` · `engine_conflict_unresolved` · `undecided_subject` ·
`needs_information` · `non_executable_decision` · `unknown_decision` · `child_identity_unconfirmed`.

### 5.2 What *is* a refusal or a failure

| Condition | Trust outcome | Note |
|---|---|---|
| Decision class not registered | `refused_unsupported_class` | Runtime already does this |
| Org AI policy denies the capability | `refused_policy` | Resolved by its owner *before* submission (Slice 0.3) |
| Actor lacks permission | `refused_permission` | Same |
| A declared `required_information` element is absent | `refused_insufficient_information` | e.g. no facts for the case |
| Recommendation fails the validation policy | `failed_validation` | Schema violation only |
| The strategy throws or returns `REASONING_UNABLE` | `failed_reasoning` | System failure — an engine defect, never a business state |

`refused_privacy` and `refused_budget` are unreachable at escalation 0 with zero egress and must stay
unreachable. **`unknown_decision` is the one Processing code deserving scrutiny:** it means the row
carries a `decision_action` the eligibility engine does not recognise. That is a **system defect**, not
a business state, and should map to `failed_validation`.

### 5.3 Create-new override and rejected-candidate audit

Neither is a Trust artefact. `create_new_override` (reason, reasonCode, `rejectedCandidateIds`,
`decidedAt`, `operatorId`) and `rejected_candidates` / `candidates_shown_at_decision` are written by
`recordResolutionDecision()` into `processing_resolutions.provisional`. They stay there. Trust records
an `overridden` observation naming the package the operator overrode; the *reason text lives in
Processing*, because it is an operator's statement, not reasoning output.

### 5.4 Classification status mapping

| Processing status | Trust outcome | Note |
|---|---|---|
| `classified` | `recommended` | `review_requirement: operator_review` |
| `unknown` | `recommended` | Honest deterministic outcome; confidence 0 |
| `unsupported` | **No contract submitted at all** | The source kind is out of scope. Submitting a contract only to refuse it would create a package for a decision nobody asked for. |

---

## 6. Evidence and confidence mapping

### 6.1 What becomes Trust evidence

`ReasoningEvidenceItem` is `{ kind, reference, detail }` — three strings. It carries no values, which
makes the privacy answer structural rather than procedural.

| Processing signal | Becomes | `kind` | `reference` |
|---|---|---|---|
| `IdentitySignal` (supporting/contradicting/excluding) | Evidence item | `deterministic_rule` | `identity_signal:<reasonCode>` |
| Matched record | Evidence item | `authoritative_record` | `<entityType>:<recordId>` |
| Processing fact backing a signal (`subjectFactRefs`) | Evidence item | `authoritative_record` | `processing_fact:<id>` |
| Resolver version | Evidence item | `policy` | `resolver_version:proc-identity-v1-b1b` |
| `blockingConflicts[]` | `remaining_uncertainty[]` entries | — | `reasonCode` + `explanation` |
| Classification `ClassificationSignal{source,value,weight}` | Evidence item | `deterministic_rule` | `classification_signal:<source>:<value>` |

### 6.2 Sensitivity — what must be referenced, never copied

**Referenced by ID only, never persisted into a Decision Package:**

- normalized emails, phones, names, dates of birth (`processing_facts.normalized_value`);
- the `provisional` payload (`first_name`, `last_name`, `email`, `phone`, `dob`, `household_name`);
- `IdentityCandidate.displayName` — a real person's name;
- the full `candidates[]` array;
- `IdentitySignal.explanation` where it embeds a matched value.

**Safe to persist in the package:** `subject_ref`, `subject_role`, `recordId`, `confidenceBand`,
`reasonCode`, `signal.kind`, `signal.strength`, `entityType`, `resolverVersion`, blocking-reason
`code`, `generation_id`, `case_id`.

`IdentitySignal.explanation` is currently free text authored by `lib/identity/signals.ts`. **Phase 1.2
must audit each explanation string** and either confirm it is value-free or replace the package-side
copy with the `reasonCode` alone. The `recommendationSummary` built by
`buildRecommendationSummary()` **interpolates `top.displayName`** — it must stay a Processing
presentation artefact and must not enter a package.

The classification signals (`source`, lowercased matched token from a filename or title) are lower
sensitivity but not zero: a filename can contain a family name. Phase 1.1 should carry
`source` and `weight` and treat `value` as referenced-only unless the audit clears it.

### 6.3 Confidence — the calibration finding

**Neither engine produces a calibrated probability, and Phase 1 must not pretend otherwise.**

*Identity.* `CandidateConfidenceBand` is 6 ordered categories. `IdentityCandidate.score` is optional
and, in practice, unused: the only producer is `scoreHouseholdCoherence()`, which returns
`bandRank(parent) + bandRank(child) + 4` — a small integer on an arbitrary scale, not a probability.
`bandRank` itself returns 1–6.

> **Recommendation: set `DecisionPackageV1.confidence = null` for
> `processing_identity_subject_resolution`.** The field is `number | null` precisely so that a
> capability with no calibrated number can say so. The band travels categorically in
> `recommendation.confidence_band`. Manufacturing `confirmed → 0.95` would invent precision the
> engine does not have and would corrupt every downstream OI confidence metric.
>
> Consequence: `DecisionClassDefinitionV1.trust_threshold` cannot gate this class numerically. Set it
> to `0` and let `review_requirement: "operator_review"` carry the governance. **This is architecture
> decision AD-P1-3 (§11) and needs Director ratification.**

*Classification.* `confidence` is a real number in `[0, 0.95]` — a bounded weight sum, already
persisted and already displayed to operators. It is not calibrated either, but it exists and changing
it would alter operator-visible output. **Carry it through unchanged.** Do not rescale, do not clamp,
do not reinterpret.

*Uncertainty and ambiguity.* `remaining_uncertainty: readonly string[]` receives: each
`blockingConflict.reasonCode`; `"multiple_plausible_candidates"` when more than one candidate is
plausible; `"no_candidate_matched"` when none is; `"band_not_calibrated"` as a standing entry for the
identity class, so the absent `confidence` is explained rather than merely missing.

---

## 7. Operator-review boundary

**The existing Processing operator review remains fully authoritative. Trust adds a record; it removes
no gate.**

| Guarantee | Enforced by, after Phase 1 |
|---|---|
| Operator correction is a Processing action | `recordResolutionDecision()` / `recordCorrection()` — unchanged, still the only writers |
| Create-new override requires a reason | `recordResolutionDecision()` throws `create_new_override_required` on empty reason — unchanged |
| Rejected candidates remain auditable | `provisional.rejected_candidates` + `candidates_shown_at_decision` — unchanged |
| Corrected facts produce a new reasoning generation | New fact row → new `generation_id` → new contract → new package; predecessor receives a `superseded` observation |
| Stale packages and plans become non-actionable | Plan: `supersedePlan()` + `evaluateApprovalReadiness` → `plan_superseded`. Package: the lifecycle projection from slice 0.4 marks it superseded. **A superseded package must not be presented as current.** |
| Existing eligibility gates remain enforced | `requirePlanEligibility()` is called from `buildPlan`, `approvePlan` and `executeApprovedPlanForCase` — three independent chokepoints, all unchanged |

**Presentation rule for Phase 1:** the Trust projection is *additive and suppressible*. Turning it off
must leave operator-visible Processing behaviour byte-identical. This is a certification assertion
(C-17), not a convention.

---

## 8. First decision-class recommendation

### 8.1 The name

The mission proposes `processing_identity_subject_resolution_v1`. **Two corrections, both grounded in
committed code:**

1. **Drop the `_v1` suffix.** The one registered class today is `attention_suggestion_enrichment` —
   no version suffix. In the Phase 0 convention, `_v1` appears on *validation policy* keys
   (`attention_suggestion_enrichment_v1`), not class keys. Class versioning is carried by
   `DECISION_CLASS_REGISTRY_VERSION`, which is pinned into every contract for replay.
2. The accepted program plan (AD-1 §5) names the Phase 1 classes `processing_source_classification`
   and `processing_identity_resolution`. **`processing_identity_subject_resolution` is the better
   name** and should supersede `processing_identity_resolution` in the register, because the grain
   genuinely is one subject: `evaluateSubjectEligibility(row)` takes exactly one row, and the
   cross-subject rule (`child_identity_unconfirmed`) lives in `evaluateCasePlanEligibility` — which
   stays a Processing gate and is *not* a Trust decision. Naming the class `..._resolution` would
   invite someone to move the case gate into Trust.

### 8.2 The scope — a challenge to the proposed sequence

**`processing_identity_subject_resolution` is not the smallest deterministic Processing decision
class. `processing_source_classification` is, by a wide margin.**

| | `processing_source_classification` | `processing_identity_subject_resolution` |
|---|---|---|
| Engine | One pure function, no I/O | Two DB-reading engines (`generateHouseholdGraphCandidates`, `resolveIntakeRecordResolution`) |
| Input | 6 optional scalars | Household graph, facts, candidate arrays, provisional payloads |
| Output | 6 keys × 3 statuses | 5 states × 11 blocking reason codes |
| PII in evidence | Low (filename tokens) | **High** — names, emails, phones, DOBs |
| Commit Plan coupling | **None** | Direct — feeds `sourceResolutionVersions` |
| Byte-identical diff | Trivially provable — pure function | Requires the live cert corpus on a disposable container |
| Existing tests | 2 files | 13+ files |

**Recommendation:** run **Phase 1.1 on `processing_source_classification`** and the identity class in
1.2 onward. 1.1's job is to prove the multi-class registry, the contract→package path from a
Processing caller, and the OI measurement — none of which require identity's blast radius. Getting
the *second* class registered is what proves composition; getting the *riskiest* class registered
first proves nothing extra and risks a rollback that undoes the registry work with it.

There is a second, independent reason. Classification today has **no history whatsoever**:
`dbStoreProcessingCaseClassification` overwrites `metadata.classification`, and an operator correction
replaces the engine's result with `classifier_version: "operator"`. The engine's original judgment is
*gone*. A Decision Package is therefore not a wrapper here — it is the first durable record of what
the classifier concluded. That makes 1.1 both the smallest slice and a genuine capability gain, which
is the strongest possible shape for a first adoption.

### 8.3 The proposed class definitions

```text
processing_source_classification
  risk_tier             convenience
  required_information  ["processing_source_descriptor"]
  knowledge_categories  []
  privacy_policy_key    processing_source_minimization_v1     (platform-owned, new)
  validation_policy_key processing_source_classification_v1
  strategy_preference   ["deterministic"]
  trust_threshold       0.5          ← classification DOES have a number
  review_requirement    operator_review
  learning_policy_key   none_v1
  economic_policy       { max_latency_ms: 2000, max_escalation_level: 0 }
  requires_allowed_feature  null      ← deterministic, zero egress; no AI feature gate applies

processing_identity_subject_resolution
  risk_tier             mandatory     ← highest-consequence proposal in the platform
  required_information  ["processing_identity_subject", "processing_identity_candidates"]
  knowledge_categories  []
  privacy_policy_key    processing_identity_minimization_v1   (platform-owned, new)
  validation_policy_key processing_identity_subject_resolution_v1
  strategy_preference   ["deterministic"]
  trust_threshold       0             ← no calibrated confidence exists (AD-P1-3)
  review_requirement    operator_review
  learning_policy_key   none_v1
  economic_policy       { max_latency_ms: 5000, max_escalation_level: 0 }
  requires_allowed_feature  null
```

Both strategies are `kind: "deterministic"` → `escalationLevelOf() === 0`, and neither calls a
provider, so `provider_cost_units` is `0` and `cost_units` is omitted from the reasoning outcome.

### 8.4 First-slice constraints — verified against the plan

| Constraint | Satisfied |
|---|---|
| One subject at a time | Yes for the identity class (1.2+). For 1.1 the grain is one *case source*, which is the classifier's natural grain. |
| Uses only existing deterministic logic | Yes — the strategy calls `classifyNonFormSource()` / the existing candidate + eligibility engines and adapts the result. No new judgment. |
| No provider call | Yes — escalation 0, `strategy_preference: ["deterministic"]` |
| No new operator behaviour | Yes — projection is suppressible (C-17) |
| No identity mutation | Yes — `lib/trust` has no `.update(`, structurally enforced |
| Preserves every current Processing output | The fixture-corpus byte-identical diff (C-19) |
| Independently replayable and certifiable | Yes for 1.1 (pure function). **For the identity class, gated on defect D-1.** |

---

## 9. Defects discovered, and what they mean for Phase 1

Two defects in current Processing code materially affect the Phase 1 plan. Neither was introduced by
this program; both are recorded here rather than fixed opportunistically.

**D-1 — `input_facts_hash` is not content-deterministic.**
[`hashFactsForResolution()`](../../../../../web/lib/pos/processingIdentity/processingFactsDb.ts) hashes
`` `${f.id}:${f.fact_type}:${f.normalized_value ?? f.raw_value ?? ""}` ``. `f.id` is a database-assigned
UUID. The same fact content re-inserted yields a **different hash**, so the hash identifies a *row
set*, not a *content set*. The `existing.input_facts_hash === inputFactsHash` short-circuit in
`runCanonicalIdentityResolution` therefore only ever matches within one persisted run.

*Consequence:* the Phase 1 acceptance criterion "replay must reproduce the same deterministic
judgment for the same inputs" **cannot be certified through `input_facts_hash` as it stands.** Options,
for Director decision (AD-P1-4): (a) add a content-only hash alongside the existing one, leaving the
current field untouched; (b) change the existing hash, which alters stored values and is a migration;
(c) certify replay against a separately computed content hash owned by the Trust contract's `context`
and scope the Processing field out of Phase 1. **Recommendation: (c) for Phase 1, (a) as a separate
Processing-owned fix.** Trust must not change a Processing hash.

**D-2 — the engine's identity judgment is destroyed by operator action.**
`recordResolutionDecision()` UPDATEs `decision_action`, `selected_candidate_id`, `decided_by` and
`provisional` **in place** on `processing_resolutions`. After an operator decides, the row no longer
records what the engine originally concluded. `provisional.recommended_action_at_decision` preserves a
fragment, but only on the create-new-override path.

*Consequence:* this is not a blocker — it is **the justification for Phase 1**. The Decision Package
created at step 5b captures the engine judgment before step 6 can overwrite it. Phase 1 should not fix
D-2 by changing the mutation; it should make the mutation harmless by having recorded the truth first.

---

## 10. Slice plan

The mission's tentative sequence is challenged on two points: **which class goes first** (§8.2), and
**where the lineage binding lands** (merged into the class slices rather than standing alone, because
a package with no consumer cannot be certified as anything but dead code).

| Slice | Scope | Independently certifiable | Reversible by |
|---|---|---|---|
| **1.1** | Register `processing_source_classification` — class, deterministic strategy, validation policy, platform privacy policy, capability contribution module. Wire `maybeClassifyProcessingCaseFromDocumentSafe` to submit a contract and persist the package **alongside** the existing write. Existing `metadata.classification` write is untouched. | Yes — pure-function byte-identical diff + registry composition test | Removing one manifest entry |
| **1.2** | Evidence, ambiguity, conflict and confidence mapping for the identity engine. Pure adapters: `IdentityCandidate[] + IdentitySignal[] → ReasoningEvidenceItem[] + remaining_uncertainty[]`. Includes the §6.2 explanation-string PII audit. **No runtime wiring.** | Yes — pure unit tests, no DB | Deleting the adapter module |
| **1.3** | Register `processing_identity_subject_resolution` and submit one contract per subject from `runCanonicalIdentityResolution`, before the resolution row is inserted. Persist `decision_package_id` on the row (migration: one nullable column). | Yes — cert corpus diff | Nulling the column; the class registration is inert without a caller |
| **1.4** | Bind lineage: `CommitPlan.sourceDecisionPackageIds` + `preconditions[kind: "decision_package"]`. Additive; hashing, approval and execution untouched. **Certification must prove `contentHash` is unchanged for an identical plan** — the new field is non-material and must stay out of `materialOperation()`. | Yes — `D1Plans` reuse + one new hash-stability test | Reverting one field |
| **1.5** | Operator correction, supersession and stale-package behaviour. `accepted`/`rejected`/`overridden`/`modified` observations from `recordResolutionDecision`; `superseded` from a new generation. First writer of `superseded` on the platform (Phase 0 debt item 8). | Yes — lifecycle projection reuse + operator integration cert | Removing the observation calls |
| **1.6** | Execution and OI certification. `executed` + `outcome` observations from a committed attempt; verify the ten Trust metrics count Processing decisions exactly once. | Yes — `trust-metrics` cert extension | Removing the observation calls |
| **1.7** | Closeout: certification matrix results, debt register, Phase 2 entry conditions. | — | — |

**Why 1.2 precedes 1.3.** The evidence and PII mapping is where this phase's real risk lives, and it
is provable with pure unit tests and zero infrastructure. Doing it before any wiring means the
riskiest decisions are certified before anything writes.

**Why 1.4 is separate from 1.3.** The plan is the artefact the program must not damage. Touching it in
its own slice, with a hash-stability assertion, makes that damage detectable and one-commit
reversible.

---

## 11. Architecture decisions requiring Director approval

| ID | Decision | Recommendation |
|---|---|---|
| **AD-P1-1** | Does the Commit Plan remain the sole execution artefact, with Decision Packages strictly upstream evidence? | **Yes.** §4.2. Any other answer requires giving a Decision Package a version and a material hash, which Decision 020 and AD-3 forbid. |
| **AD-P1-2** | Is `processing_identity_subject_resolution` accepted as superseding `processing_identity_resolution` in the AD-1 §5 register, without the `_v1` suffix? | **Yes.** §8.1. Grain is genuinely one subject; the key convention is established by the one registered class. |
| **AD-P1-3** | May `DecisionPackageV1.confidence` be `null` for the identity class, with `trust_threshold: 0` and governance carried entirely by `review_requirement`? | **Yes.** §6.3. The alternative is inventing precision the engine does not have. |
| **AD-P1-4** | How is replay determinism certified given defect D-1? | Option (c): certify against a content hash owned by the Trust contract `context`; raise the Processing hash fix as separate work. Trust must not change a Processing hash. |
| **AD-P1-5** | Does Phase 1.1 adopt `processing_source_classification` first rather than the identity class? | **Yes.** §8.2. Smallest scope, zero plan coupling, and a genuine capability gain because classification has no history today. |
| **AD-P1-6** | Are `processing_source_minimization_v1` and `processing_identity_minimization_v1` created as **platform-owned** privacy policies? | **Yes.** `privacy-runtime.md` §Privacy Policies and the Phase 0 contribution comment both hold that capabilities reference privacy policies by key and never own them. |
| **AD-P1-7** | Does an `unsupported` classification source submit no contract at all? | **Yes.** §5.4. Submitting a contract only to refuse it would manufacture packages for decisions nobody requested and would distort OI refusal-rate metrics. |

---

## 12. Migration expectations

Phase 1 is **almost entirely additive**. Expected DDL:

| Slice | Migration | Shape |
|---|---|---|
| 1.1 | none | The package lands in existing `trust_decision_packages`. The existing `metadata.classification` write is unchanged. |
| 1.3 | **one** | `ALTER TABLE public.processing_resolutions ADD COLUMN IF NOT EXISTS decision_package_id uuid` — **nullable, no FK to a Trust table, no default, no backfill.** Nullable because every row that predates Phase 1 has no package, and a NOT NULL would make the migration a data migration. No FK because a cross-domain foreign key would couple Processing's write path to Trust availability. |
| 1.4 | **one** | `processing_commit_plans` gains a jsonb or text[] `source_decision_package_ids`, nullable, defaulting to empty. **Must not enter `materialOperation()`** — a plan's content hash may not change because of a lineage annotation. |
| 1.5, 1.6 | none | Observations use the `trust_decision_observations` vocabulary already migrated by `20260804210000`. |

**No backfill.** Pre-Phase-1 cases keep a null package id and render exactly as they do today.
**No table is dropped, renamed, or repurposed.** `processing_case_classification` data stays in
`processing_cases.metadata` — retiring it is Phase 6 at the earliest, and only with a read-model
migration.

Replay safety is a certification requirement: every Phase 1 migration must apply twice cleanly, as
`certification/trust-lifecycle-observations` already proves for the Phase 0 migration.

---

## 13. Certification matrix

Certification runs on the existing Processing corpus:
`tests/processing/cert/processingIdentityCertFixtures.ts` on a **disposable container** via
`alloy-stack use` / `alloy-stack release`. **The shared certification tenant is never taken.**

| # | Scenario | Assertion | Existing test reused | New test needed |
|---|---|---|---|---|
| C-1 | Confirmed existing person | Package `recommended`, `state: confirmed_existing`, band `confirmed`/`strong` | `B3Resolver`, `CertE2E` | thin adapter test |
| C-2 | Confirmed new person | `recommended`, `state: confirmed_new`, `no_candidate_matched` in uncertainty | `B3Resolver` | thin |
| C-3 | Single plausible candidate needing review | `recommended`, `needs_review`, `plausible_match_needs_review`, `review_requirement: operator_review` | `ReviewGate` | thin |
| C-4 | Multiple ambiguous candidates | `multiple_plausible_candidates` in `remaining_uncertainty`; candidate array **not** copied into the package | `CertE2E` (`SHARED_EMAIL`/`SHARED_PHONE` fixtures) | **yes** |
| C-5 | Contradictory identity facts | `recommended`, `conflicted`; each `blockingConflict.reasonCode` appears in `remaining_uncertainty` | `ReviewGate` | thin |
| C-6 | Parent/guardian + child subject grouping | One package per subject; `subject_role` preserved for all four roles | `D4CreateLead` | **yes** |
| C-7 | Household resolution | Household subject produces its own package; `household_name` **absent** from the package | `D4CreateLead` | **yes** |
| C-8 | Explicit create-new override | `overridden` observation; reason text lives only in Processing `provisional` | `D3Operator` | **yes** |
| C-9 | Rejected-candidate evidence | `provisional.rejected_candidates` unchanged; package unaffected | `D3Operator` | thin |
| C-10 | Corrected fact causes recomputation | New generation → new package with `supersedes_package_id`; predecessor gets `superseded` | `B2Facts`, `D3Operator` | **yes** |
| C-11 | Stale generation refusal | A superseded package is not presented as current; a stale plan still yields `plan_superseded` | `D1Plans` | **yes** |
| C-12 | Replay determinism | Same inputs + same `registry_version` + `runtime_version` → identical recommendation and evidence. **Gated on AD-P1-4.** | — | **yes** |
| C-13 | No CRM identity write before commit | Zero writes to `persons`/`customers`/`children`/`opportunities` until `executeApprovedPlan` | `B0TenantSecurity`, `E1Boundaries`, `CertTargetGuard` | reuse unchanged |
| C-14 | Exact approval-to-plan binding | `approvalBindsToPlan` still fails on version or hash drift | `D1Plans` | reuse unchanged |
| C-15 | Commit idempotency | Same `executionIdempotencyKey` → replay, not a second commit | `D2Executor` | reuse unchanged |
| C-16 | Decision Package immutability | No `.update(` in `lib/trust`; no Phase 1 writer mutates a package | `trustBoundary` | reuse + **negative control** |
| C-17 | **No behaviour change with the Trust projection disabled** | Operator-visible Processing output byte-identical with the projection suppressed | — | **yes — the headline acceptance test** |
| C-18 | Commit Plan immutability + hash stability | An identical plan yields an identical `contentHash` after slice 1.4 | `D1Plans` | **yes** |
| C-19 | Fixture-corpus byte-identical diff | Classification and resolution outputs identical to the pre-migration engines across the whole corpus | `CertE2E`, `CertOperator` | **yes — the phase gate** |
| C-20 | No mutation authority in Trust | Structural boundary suite green **with a negative control that fails when reverted** | `trustBoundary` | reuse + control |
| C-21 | OI measured once per governed decision | Exactly one usage record per contract; no double-count across subjects | `trust-metrics` | **yes** |
| C-22 | Tenant isolation | Packages are org-scoped; org B never reads org A's package | `CertRls`, `B0TenantSecurity` | **yes** (Trust tables) |

**Reused unchanged:** C-13, C-14, C-15 and the whole `E1Boundaries` suite — they are the proof that
Phase 1 removed no gate. **Focused new tests:** C-4, C-6, C-7, C-8, C-10, C-11, C-12, C-17, C-18,
C-19, C-21, C-22 — twelve, each small and tied to one assertion.

**Inherited waivers carried forward:** the three metrics/OI failures documented in the Phase 0 closeout
(`workspaceOipExposure`, `metricEngine` rate_min, `metricPacks` eleven-metric coverage). They are
staging-inherited, involve zero Trust keys, and **must not be fixed inside a Phase 1 PR.**

---

## 14. Explicit non-goals

Phase 1 does **not** implement, and no slice may introduce: document understanding · OCR · any LLM or
provider call · provider routing · local-model inference · communications reasoning · live BOS
convergence · new Processing UI · identity schema replacement · new identity entities · a second
Commit Plan · a second approval model · direct Trust mutation · automatic identity writes · broad
Processing refactoring · Phase 2 or later work.

Two further exclusions specific to what this assessment found:

- **Defect D-2 is not fixed in Phase 1.** The destructive UPDATE in `recordResolutionDecision()` stays.
  Phase 1 makes it harmless, not absent.
- **`processing_case_classification` storage is not retired.** The `metadata.classification` write
  continues alongside the package. Retirement requires a read-model migration and is Phase 6 at the
  earliest.

---

## 15. Phase 1 completion definition

Phase 1 is complete when **all** of the following hold:

1. Two Decision Classes are registered and composed through the Phase 0 manifest, with the registry
   composition test proving duplicate keys and dangling references still fail loudly.
2. Both classes execute at **escalation level 0 with zero egress**; `provider_cost_units` is `0` for
   every Processing package.
3. Every subject resolution and every classified source produces exactly one Decision Package, created
   **before** the mutable Processing row it corresponds to.
4. C-19 passes: the fixture-corpus diff is byte-identical to the pre-migration engines.
5. C-17 passes: suppressing the Trust projection leaves operator-visible Processing behaviour
   byte-identical.
6. Operator correction produces a new generation, a superseding package, and a `superseded`
   observation — deterministically, with the stale package non-actionable.
7. The Commit Plan's `contentHash`, approval binding, preflight and executor are provably unchanged
   (C-18, C-14, C-15).
8. `lib/trust` still contains no `.update(`, with a negative control that fails when reverted.
9. Ten Trust OI metrics count each governed Processing decision exactly once (C-21).
10. All standing Phase 0 gates hold: one contract → one package · canonical runtime order · refusal
    matrix · structural boundary with negative control · operator reachability proven by module graph
    **and** a real browser.
11. AD-P1-1 … AD-P1-7 are ratified or explicitly overruled, and the outcome is recorded here.

**First operator-visible QA.** No slice before 1.5 changes anything an operator can see — 1.1 through
1.4 write records alongside unchanged behaviour, and C-17 asserts exactly that. The first
operator-visible QA is at **slice 1.5**, when supersession makes a stale recommendation
non-actionable in the identity review panel, on `:3011` against the disposable certification stack.
Everything before it is certified by test and module graph.

---

## Related documents

- [`Trust Platform Adoption — Assessment and Program Plan`](../TRUST-PLATFORM-ADOPTION-ASSESSMENT.md)
- [`Phase 0 Closeout`](../PHASE-0-CLOSEOUT.md)
- [`Phase 1 Handoff`](../../../../handoffs/trust-platform-adoption-phase-1-handoff.md)
- [`Trust Platform`](../../../trust/trust-platform.md) · [`Trust Runtime`](../../../trust/trust-runtime.md) · [`Trust Platform Decisions`](../../../trust/trust-platform-decisions.md)
- [`Decision Contract`](../../../trust/decision-contract.md) · [`Decision Package`](../../../trust/decision-package.md) · [`Privacy Runtime`](../../../trust/privacy-runtime.md)
