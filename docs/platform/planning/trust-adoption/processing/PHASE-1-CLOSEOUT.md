---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-06
supersedes: []
---

# Phase 1 — Processing Trust Adoption, Closeout

**Certified against `origin/staging` at `20d7f2ae7ceef2fc9686c740db8252a35de69092`** (the PR #354
merge).

Phase 0 made the Trust Runtime adoptable; it adopted nothing. Phase 1 is the first adoption, and it
adopts inside Alloy Processing. This document records what shipped, what it is allowed to do, what
was proven, and what is still owed.

**No provider-backed reasoning occurred in Phase 1.** Every governed judgment in this phase is the
output of Processing's own deterministic identity and classification engines. No model was called,
no prompt was constructed, no provider credential was read, and no provider identity is persisted
anywhere in Trust. A structural control asserts `lib/trust` performs no network call and imports no
provider SDK.

---

## 1. Objective

The assessment's governing finding was that Processing already owns an execution authority chain
stronger than anything Trust provides — a versioned, content-hashed, approval-bound, preflighted,
idempotent Commit Plan — and that Trust must not acquire any of it.

What Processing measurably lacked was **an immutable, replayable record of what the deterministic
engine judged, and why, that survives operator correction.** Before Phase 1 that record was
destroyed the moment an operator acted: `recordResolutionDecision` overwrites `decision_action`,
`selected_candidate_id` and `decided_by` in place.

Phase 1 adds that record and its lifecycle. It changes no Processing authority.

---

## 2. Slice-by-slice delivery

| Slice | Delivered | Merge commit | PR |
|---|---|---|---|
| **1.1** | Source classification adoption, durable governance gaps, unified idempotency | `ab76c6cb6` | [#346](https://github.com/ksquared-16/alloy/pull/346) |
| **1.2** | Content-deterministic identity fact hashing | `9cb791ee3` | [#347](https://github.com/ksquared-16/alloy/pull/347) |
| **1.3** | Identity Trust adapter contracts — pure, safe, dormant | `cd34be872` | [#348](https://github.com/ksquared-16/alloy/pull/348) |
| **1.4** | Dormant identity decision class and Trust dry run | `942d078dd` | [#349](https://github.com/ksquared-16/alloy/pull/349) |
| **1.5** | Live exactly-once identity capture, gap reconciliation | `c933ea15b` | [#351](https://github.com/ksquared-16/alloy/pull/351) |
| **1.6** | Operator-correction lineage and supersession | `8d6917a18` | [#353](https://github.com/ksquared-16/alloy/pull/353) |
| **1.7** | Commit Plan outcome binding, execution observations, and the confirmation correction | `20d7f2ae7` | [#354](https://github.com/ksquared-16/alloy/pull/354) |

**No migration was written in any Phase 1 slice.** Every exactly-once guarantee rests on a
constraint the schema already declared. One certification file was extended (assertions 13–14 of
`trust-lifecycle-observations`) to prove the deterministic-observation-id mechanism against a real
database rather than inferring it from the DDL.

---

## 3. Final architecture

```text
Processing source input
  → source classification            → Decision Package (1.1)
  → identity facts                   → content-deterministic hash (1.2)
  → deterministic subject resolution
  → Decision Package per SUBJECT     → exactly-once by adoption identity (1.5)
  → operator confirmation            → accepted   (package remains CURRENT)   (1.7)
    or correction/override           → superseded                             (1.6)
  → immutable Commit Plan
  → approval bound to (plan_id, version, content_hash)
  → Processing preflight and executor
  → durable commit attempt row
  → Trust execution observation      → executed / outcome                     (1.7)
  → lifecycle projection
```

Three seams, each with exactly one writer:

- **Capture** — `captureProcessingIdentitySubjectResolution`, reached from the canonical resolution
  engine after a generation is durable, and from gap reconciliation. One seam, so exactly-once is
  one mechanism rather than two that must agree.
- **Lifecycle** — `recordOperatorDecisionLifecycle`, reached from both operator-decision writers
  (`recordResolutionDecision` and the Create Lead adapter `applyCommitSelectionToResolutions`).
- **Execution** — `bindCommitOutcomeToTrust`, reached only from `executeApprovedPlanForCase`, after
  `insertCommitAttempt` has returned a durable row id.

### The grain is the subject, not the case

A Processing Case carries several identity subjects. Every Phase 1 artefact is per-subject: the
adoption identity, the Decision Package, the lifecycle observation, and the execution evidence. This
is what lets a partial commit be reported honestly — a plan-wide `partially_committed` becomes
`executed` for a subject whose contributing operations all committed and `outcome` for one whose did
not, rather than being flattened either way.

---

## 4. Authority boundaries

| Authority | Owner | Proof |
|---|---|---|
| Identity facts, candidates, resolutions, generations | Processing | No Trust module writes any non-`trust_` table |
| Operator decisions | Processing | No operator decision produces a Decision Package |
| Commit Plan contents, versioning, content hash | Processing | Plan modules import nothing from `lib/trust` |
| Approval binding | Processing | `bindApproval` unreferenced by any Trust or adapter module |
| Preflight and execution | Processing | No Trust module can reach an executor port |
| Identity mutations | Processing | Trust holds no command runtime |
| Governed judgment, Decision Contract/Package | Trust | Immutable at creation; DB trigger refuses UPDATE/DELETE |
| Append-only lifecycle observations | Trust | DB trigger refuses UPDATE/DELETE |
| Lifecycle projection, reasoning measurement | Trust | Pure projection, no I/O |

**Trust never initiates.** The execution binding is reachable only *after* the executor returns and
its attempt row persists. Phase 0's proposed-command binding exists but was deliberately **not**
wired as an execution initiator in Phase 1.

---

## 5. Certification evidence

Run at `20d7f2ae7`, on the closeout worktree.

| Gate | Result |
|---|---|
| `tests/trust` + `tests/metrics` | **837 passed**, 2 inherited failures |
| `tests/processing` + `identity` + `intake` + `pos` | **1069 passed**, 5 inherited failures |
| **Combined broad scope** | **1906 passed**, **7 inherited failures** |
| Phase 1 closeout certification (this slice) | **29 passed** |
| Trust Runtime V1 DB certification | **21 / 21** |
| Trust lifecycle observations DB certification | **14 / 14** |
| Trust measurement sources DB certification | **9 / 9** |
| `verify:module-imports` | ok, **9024 files**, zero cycles |
| `npm run typecheck` (production graph) | **NOT EXECUTED** — see §11 |
| `npm run typecheck:tests` (test graph) | **NOT EXECUTED** — see §11 |

### Per-slice matrix

| Slice | Purpose | Merge commit | Focused tests | DB certification | Typecheck | Boundary proof |
|---|---|---|---|---|---|---|
| 1.1 | Source classification adoption | `ab76c6cb6` | in `tests/trust` sweep | 21/21 · 14/14 · 9/9 | CI at merge | no Trust→Processing write; gap type registered |
| 1.2 | Content-deterministic identity hashing | `9cb791ee3` | in sweep | as above | CI at merge | hash is pure; engine does not consume facts for judgment |
| 1.3 | Identity safe adapters | `cd34be872` | in sweep | as above | CI at merge | no engine explanation text may enter Trust |
| 1.4 | Dormant identity runtime | `942d078dd` | in sweep | as above | CI at merge | registered, zero production callers |
| 1.5 | Live identity capture | `c933ea15b` | in sweep | as above | CI at merge | capture only after the generation is durable |
| 1.6 | Correction and supersession | `8d6917a18` | 50 + 30 controls | as above | CI at merge | one lineage writer; no operator package |
| 1.7 | Commit outcome binding + confirmation correction | `20d7f2ae7` | 45 + 30 + 28 + 15 controls | as above | **not executed** — see §11 | plan hash untouched; Trust cannot initiate |

Slices 1.1–1.6 had both typecheck graphs execute and pass in CI on their own merge heads. Slice 1.7
did not — that is the single open item, recorded in §11.

---

## 6. Exactly-once audit

Every exactly-once identity in Phase 1 uses the same mechanism: a **deterministic id derived from a
SHA-256 digest over a positionally serialized, unit-separated component list**, made authoritative by
a constraint the schema already declared. **No new idempotency table was introduced** — asserted by a
structural control that scans every `.from(...)` in `lib` and `app`.

| Identity | Stable material | DB authority | Ambiguous success | Retry | Inflation prevention |
|---|---|---|---|---|---|
| Source-classification contract | case + source + classifier material | `trust_decision_contracts.id` PK | jsonb-context lookup re-reads | gap → reconcile | one contract, one package |
| Identity-subject contract | org + case + subject + class + facts hash + projection version + resolver version | contract `id` PK; `packages.contract_id` UNIQUE | pre-check, PK collision, post-conflict re-read | gap → reconcile | one adoption identity, one package |
| Review observation (`accepted`/`deferred`) | org + package + kind + Processing resolution ref + effect | `trust_decision_observations.id` PK | re-read returns winner | gap → reconcile | one row per decision |
| Supersession observation | org + prior package + successor/reference + reason + kind | observations `id` PK | re-read returns winner | gap → reconcile | conflicting second claim refused before write |
| Execution observation | org + package + plan + version + content hash + attempt + kind | observations `id` PK | re-read returns winner | gap → reconcile | distinct attempt → distinct id |
| Governance-gap claim | gap row + observed `retry_count` | conditional UPDATE (compare-and-swap) + `resolved_at IS NULL` | claim lost → no-op | retry count increments on one row | resolved gap cannot be reclaimed |

The deterministic-observation-id mechanism is certified against a real PostgreSQL instance
(`trust-lifecycle-observations` assertions 13–14): a supplied id is accepted verbatim, and a
duplicate is refused by the primary key. Without both halves the mechanism would be decoration.

---

## 7. Privacy audit

| Claim | Proof |
|---|---|
| No raw identity explanation text enters Trust | `matchIdentity` interpolates a real person's name into its reasons; the adapter maps engine **codes** to Processing-authored sentences and degrades unknown codes to `unclassified`, never the raw string |
| No names, emails, phones, addresses, DOBs, candidates or raw facts | Governed schema is closed at every level and additionally screens values against email/phone/ISO-date/address patterns |
| Operator free text never enters a lifecycle observation | The effect is classified from **structure** (engine judgment vs operator result), so `provisional.create_new_override.reason` has no route in; lineage modules do not read `provisional` at all |
| Execution detail is bounded | Explicit allow-list of ten keys, all tokens or counts; an unlisted key is refused **before** any write |
| No provider identity in Decision Packages | `packageRow` carries no provider, model, prompt or command key; DB certification asserts no Trust table persists provider identity |
| No command binding in identity packages | Phase 0's proposed-command binding was not wired |
| Numerical confidence is null | The deterministic strategy hard-codes `confidence: null` with `band_not_calibrated` — the band is an ordered category, not a probability |
| No case-level readiness gate in a subject package | `CASE_LEVEL_READINESS_CODES` excludes `child_identity_unconfirmed`, which is a case aggregate |

---

## 8. Commit Plan and execution audit

| Claim | Proof |
|---|---|
| Decision Package ids do not enter the material plan hash | `computePlanContentHash` takes exactly `{orgId, caseId, operations}` and projects each operation through an **eleven-key whitelist**, not a spread. Phase 1 added **no plan field**, so no historical hash can move — true by construction, not by fixture |
| Lineage is reconstructed, not stored | From `PlanOperation.resolutionRefs` (= `processing_resolutions.id`), set by `recommendationBuilder`; synthesized participation operations inherit their child's ref, so refs deduplicate |
| Approval behaviour unchanged | Approval binds to `(plan_id, version, content_hash)`; plan/approval modules import nothing from Trust |
| Preflight and executor unchanged | Neither imports Trust; the attempt returned to the caller is the executor's own object |
| Partial and compensated outcomes map honestly | Resolved at **subject grain**; a `compensated` operation is never counted as committed, because a reversal reported as a commit is precisely the falsehood this binding exists to prevent |
| Execution reference is the durable row id | `insertCommitAttempt`'s return value. `CommitAttempt.attemptId` is the synthetic `${planId}:attempt:${n}` before persistence and the row uuid after, so only the row id proves durability |
| Trust cannot initiate execution | No Phase 1 module imports an executor, plan builder, approval or command registry |

**Processing reports no infrastructure-failure state.** `AttemptOutcome` is
`committed | partially_committed | failed | preflight_rejected`; none distinguishes a declined
command from a dead transport, and a thrown executor persists no attempt row at all. Phase 0's
`infrastructure_failure` class is therefore **unreachable from this source and never emitted** —
claiming it would assert knowledge Processing does not have.

---

## 9. End-to-end authority proof

The full chain is certified by test rather than by assertion. `tests/trust/processingIdentityOperatorConfirmation.test.ts`
runs judgment → package → operator confirmation → plan → approval bound to the exact hash → executor
commit → `executed` observation → projection reading `executed`, for:

- confirmed **existing** candidate;
- confirmed **new** record;
- **several** confirmed packages in one plan, each binding once;
- **partial commit**, where the committed subject projects `executed` and the other projects
  `execution_failed`.

Throughout, the plan hash equals `computePlanContentHash` of its own operations and
`evaluateApprovalReadiness` stays ready.

### Confirmation is not supersession

Phase 1.6 originally superseded on **any** operator decision, including a plain confirmation. Because
1.7 excludes superseded packages from execution binding, a fully reviewed case could never record its
outcome. Corrected in 1.7: the effect is classified by comparing the durable **engine** judgment with
the durable **operator** result, never from `decided_by`.

The engine's answer is overwritten in place but exactly recoverable — it is a pure function of
`candidates`, which no operator path writes. The derivation lives in one leaf module
(`engineJudgment.ts`) that both the engine and the classifier import; a copy would drift, and the
drift would silently reclassify overrides as confirmations.

`review_required` is the engine **declining to decide**. Its package asserts no result, so an
operator answering it contradicts nothing and the package remains current. That is also the branch
the normal reviewed path runs through.

---

## 10. Manual QA — deferred, with reason

**Deferred.** Exercising the chain end to end through the browser needs a seeded Processing case
whose subject carries a governed, **non-superseded** package — which, under the corrected semantics,
means an engine-decided subject that reached plan eligibility without an operator override. No
existing seeded fixture provides that state, and creating one means new product fixture work, which
this closeout is explicitly scoped against.

The chain is instead certified at route, integration and database level, including the four
end-to-end scenarios in §9 and the three PostgreSQL certifications. Stated plainly: **no browser QA
was performed for Phase 1.**

---

## 11. Inherited failures and open certification

### Inherited failure waivers

Seven pre-existing failures, unchanged by Phase 1 and reproduced byte-identically at the exact
staging base `20d7f2ae7`. None is in a Phase 1 code path. Per the closeout scope they are **not**
fixed here.

| Test | Area |
|---|---|
| `metricEngine` — tour conversion KPI via `rate_min` | metrics |
| `metricPacks` — eleven Phase 1 metrics across packs | metrics |
| `extractFactsFromText` — labeled full paste | intake |
| `qaHouseholdGraph` — stage 2 household graph | intake |
| `processingIdentityD5PublicForm` — opens case without CRM identity writes | processing |
| `processingIdentityD5PublicForm` — idempotent replay case reference shape | processing |
| `formDraft` — `deriveDocumentTitle` classification-label fallback | pos |

### The one open item

**Neither typecheck graph has executed on the merged Phase 1.7 head or on this staging tip.**

PR #354 was merged during a declared GitHub Actions **major outage** (incident `qcvjkzcs7j74`,
started 2026-08-06 15:22 UTC). Its final required jobs reported `conclusion: cancelled` with
**`steps = 0`** — they never started. A cancelled job is not a passing job.

Local execution cannot substitute on this host. `npm run typecheck` exits **144 (SIGTERM)** with no
output under every mode attempted: foreground, harness background, detached via `setsid`/`nohup`,
sandbox disabled, and heap sizes from 1 GB to 8 GB. The kill terminates the whole shell invocation,
so it is a host watchdog rather than a TypeScript failure. Narrow scopes do run — 736 files in 7 s —
so the limit is scale, not correctness.

This is the **only** blocker to closing Phase 1. It is an infrastructure gap, not a known defect: the
same graphs passed on slices 1.1–1.6, and CI caught two genuine type errors during 1.7 (a `TS2345`
and a `TS2322`), both fixed before merge.

---

## 12. Known debt

### Accepted debt — does not block Phase 1

| Item | Note |
|---|---|
| No live recomputation caller after a fact correction | `recordCorrection` appends a fact version and does not re-run resolution, so no resolution row changes and the prior judgment still stands. Correct today; a recompute path would need supersession wired, which already exists |
| Replacement-generation supersession is structurally certified but not production-exercised | Every `runCanonicalIdentityResolution` caller is an intake adapter; nothing re-runs resolution after correction. The wiring is correct for any future recompute |
| Classification history overwrites current metadata | Pre-existing Processing behaviour, untouched by Phase 1 |
| Operator corrections mutate resolution fields in place | Pre-existing. Phase 1 works with it rather than around it: the engine judgment is recovered from `candidates`, which is never written |
| `CommitAttempt.attemptId` means two different things | Synthetic before persistence, row uuid after. Phase 1.7 uses the durable row id explicitly; the ambiguity itself is untouched and worth a separate look |
| Resolved Processing exceptions may be included by a pre-existing query | Not introduced by Phase 1; gap types are excluded by shared list wherever readiness is projected |

### Later-phase work — explicitly out of scope

Provider/model reasoning has not begun. Provider identity is not persisted in Trust usage (and the DB
certification asserts it is absent by design, not by omission). Privacy tokenization/vault remains
deferred. Live BOS convergence remains deferred. Communications, Search, Configuration and
Participant adoption have not started.

### Phase 1 blockers

One: **the typecheck graphs have not executed** (§11).

---

## 13. Phase 2 entry conditions

Phase 2 may not begin until:

1. Both typecheck graphs execute with nonzero steps and pass on a staging tip containing all of
   Phase 1.
2. This closeout is accepted.
3. A Phase 2 target capability is chosen deliberately. The adoption assessment's ordering logic
   applies again: prefer a capability with a pure, deterministic judgment and no execution coupling.
4. If Phase 2 introduces provider-backed reasoning, the deferred privacy tokenization decision must
   be taken **first** — Phase 1's safety rests on every governed payload being PII-free by
   construction, which a model-authored payload would not be.

---

## 14. Recommendation

**PHASE 1 NOT READY TO CLOSE** — one blocker, infrastructure rather than product:

> The authoritative production and test TypeScript graphs have not executed on the merged Phase 1.7
> head or on this staging tip, because GitHub Actions is in a declared major outage and the host
> cannot run the full graphs locally.

Everything else certifies. When Actions recovers, the closeout PR's CI run settles it; if both graphs
pass with nonzero steps and no new failures, Phase 1 closes with no further work.
