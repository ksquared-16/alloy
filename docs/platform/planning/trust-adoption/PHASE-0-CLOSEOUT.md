---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-05
supersedes: []
---

# Trust Platform Adoption — Phase 0 Closeout

**Phase 0 is technically complete and ready for promotion review.**

**PR:** [#338](https://github.com/ksquared-16/alloy/pull/338) — `agent/claude/1-trust-platform-adoption` → `staging`
**Head:** `1968fe47511070610ca8634aaa3402d565a62381` · rebased onto `origin/staging` `e28d80a7a`

**No capability adopted the Trust Platform in Phase 0.** Not one. Phase 0 built the foundation a capability will adopt in Phase 1; the registry still contains exactly one Decision Class, and it is the one Trust Runtime V1 shipped.

---

## 1. Objective

Convert Alloy into a Trust-native operating system: every capability that resolves ambiguity submits a Decision Contract, every recommendation is one immutable Decision Package, and reasoning exists exactly once.

The adoption assessment established that this is a **convergence** program, not an AI-migration program. Alloy has exactly one live provider egress path, with zero call sites outside `lib/ai` and its tests, while eleven deterministic engines resolve ambiguity across four different persistence models.

Phase 0's job was narrower: make the Trust Runtime *able to be adopted*. It could not be, as shipped — `reason()` was synchronous, the registries were four hand-written maps, authorization was duplicated across three routes, and cost was pinned to the literal `0`.

---

## 2. The seven slices

| Slice | What it made possible |
|---|---|
| **0.1** Async reasoning and validation seam | A strategy or a domain validator may await. Without this no provider-backed strategy and no database-reading validator was expressible at all. |
| **0.2** Registry composition and collision safety | One composition root over an ordered manifest. Duplicate keys and dangling references fail loudly at startup instead of silently at lookup. |
| **0.3** Authorization resolution seam | One canonical decision, consumed by the three proven routes. Authorization, reasoning mode and availability stay three distinct axes. |
| **0.4** Lifecycle observations and projection | Expiry and supersession become append-only observations; one total, deterministic projection over an immutable package. |
| **0.5** Execution binding contract | A recommendation names a registered Operational Command and carries bounded intent — never an executable payload. |
| **0.6** OI execution measurement | Ten Trust metrics through the existing Operational Intelligence platform. No second analytics engine. |
| **0.7** Non-zero cost representability | Measured provider cost can be represented and validated. The last TypeScript gate before a provider-backed strategy can record what it spent. |

---

## 3. Architecture now available

```text
Decision Contract
  → authorization resolved by its owner, handed in           (0.3)
  → composed registry: classes, strategies, policies         (0.2)
  → reasoning, synchronous or asynchronous                   (0.1)
  → deterministic validation, synchronous or asynchronous    (0.1)
  → immutable Decision Package + measured cost               (0.7)
        │
        ├── append-only observations → lifecycle projection  (0.4)
        ├── proposed command binding → execution authority   (0.5)
        └── usage/economics record   → OI metrics            (0.6)
```

Four properties hold platform-wide, each with a negative control proving the assertion can fail:

- **The runtime never mutates.** No `.update(` anywhere in `lib/trust`; the boundary suite scans source text to prove it.
- **The package is immutable and provider-independent.** No lifecycle column, no provider or model identity, no pricing.
- **Refusal is a Decision Package.** Every exit from the runtime is a package, including cost-validation failures.
- **Nothing is adopted yet.** One Decision Class registered; the BOS compatibility adapter and the execution binding contract are both dormant, and a test asserts nothing under `lib/` or `app/` imports the former.

---

## 4. Certification evidence

| Gate | Result |
|---|---|
| `tests/trust` | **255/255** across 8 files |
| Trust Runtime V1's original assertions | **41/41 unchanged** (31 `trustRuntimeSlice1` + 10 `trustBoundary`) |
| `tests/metrics/trustMetrics.test.ts` | **37/37** |
| Compile-time invariants | 14 in `trustCostTypeInvariants.test-d.ts`, plus Trust Runtime V1's original 6 |
| `certification/trust-runtime-v1/run.sh` | **21/21** |
| `certification/trust-lifecycle-observations/run.sh` | **12/12** (migration applied twice — replay-safe) |
| `certification/trust-metrics/run.sh` | **9/9** |
| Production typecheck (CI) | **pass** |
| Test typecheck (CI) | **pass** |
| Import graph | **0 cycles** across 199 modules |
| Forbidden dependencies | **0** `lib/trust` → `lib/adminV2` or `lib/platform` value deps |

Every slice ships negative controls. Slice 0.7's is the instructive one: the first runtime negative control **passed** when the type was reverted, because vitest strips types. A `.test-d.ts` was added; reverting now produces six type errors. **A type-only change requires a compile-time test.**

---

## 5. Commits (post-rebase)

| | Commit |
|---|---|
| Adoption assessment | `0fe826dd5` |
| Accepted program plan | `c0e9b6c92` |
| Doctrine — provider telemetry ownership | `21de96773` |
| 0.1 async seam | `0545f946d` |
| 0.2 registry composition | `818569089` |
| ES2017 typecheck correction | `2de813578` |
| 0.3 authorization seam | `14c540a58` |
| 0.4a lifecycle observation kinds (migration) | `106620b2b` |
| 0.4b lifecycle projection | `cf1eb311c` |
| 0.5 execution binding | `98cfcf3bc` |
| 0.6 Trust execution metrics | `2c62ae83e` |
| 0.7 non-zero provider cost | `1968fe475` |

---

## 6. Intentional deferrals

Each was deferred on evidence, not preference.

| Deferred | Why |
|---|---|
| Provider utilization metric | **No Trust table persists provider identity.** Certified: `certification/trust-metrics` assertion 7. Only cost exists. |
| Site-scoped Trust metrics | **No Trust table carries site, location or work-unit linkage.** Certified: assertion 8. A narrowed scope reports unsupported rather than returning the org figure. |
| Local-model vs deterministic | `strategy_kind` cannot distinguish a local model from an external one. Not inferred. |
| Validation latency | Not persisted separately from total runtime latency. |
| Timeout / cancellation metrics | No such outcome exists. Cancellation is ruled (ADR-1) as a terminal `refused_cancelled` outcome, scheduled for Phase 2. |
| Knowledge Platform, Operational Learning | No `knowledge_*` or `learning_*` table. Phases 6 and 7. |
| Privacy tokenization and vault | The program's hardest primitive. Phase 2, gated on an architecture-owner decision already recorded (AD-2). |
| Live BOS cutover | Phase 3. The compatibility adapter is pure and dormant. |
| KPI targets for Trust metrics | A refusal rate is not inherently "higher is bad". No defensible threshold exists in current doctrine. |

---

## 7. Known debt

1. **`AttentionSuggestionAiEnrichmentV1.provider_report.provider_key`** — the capability's own operator-facing output schema embeds a provider label inside the `recommendation` jsonb. **Pre-existing on staging**, predating this program. ADR-2 governs the *platform* contract; the platform cannot police what a capability puts in an opaque payload it never interprets. Pinned by a test, not fixed. **Not a Phase 0 platform-contract regression.**
2. **Six `lib/trust` → `lib/ai` value dependencies**, all grandfathered from Trust Runtime V1 (the Decision 022 validator call-out and the enrichment consumer). None added by Phase 0.
3. **No learning-policy registry** — `learning_policy_key: "none_v1"` is compared by magic string.
4. **`requires_allowed_feature`** on a Decision Class has zero consumers.
5. **Supersession is dual-sourced** — the observation's `superseding_package_id` and the package's `supersedes_package_id` can disagree with no database-level cross-check.
6. **`parseAiPolicyFromMetadata` coerces an unknown or missing provider to `stub`** when `enabled: true`. Pre-existing in all three routes; reproduced and pinned rather than silently tightened.
7. **`cache_utilized` is hard-coded `false`** at both write sites.
8. **No writer emits** `expired`, `superseded`, or a `proposed_command` binding yet — those are contracts awaiting their phase.

---

## 8. Inherited test waivers

Three failures exist in the metrics/OI test surface. They are **inherited from staging** and were proven so by running the identical command against a worktree checked out at the exact base commit `e28d80a7a`:

| | Base `e28d80a7a` | Branch `1968fe475` |
|---|---|---|
| `tests/metrics` + `analytics` + `kpi` | 3 failed / **219 passed** (222) | 3 failed / **256 passed** (259) |
| `workspaceOipExposure` "enriches enrollment lifecycle cards" | FAIL — expected `36h`, received `50.0%` | identical |
| `metricEngine` "tour conversion KPI via rate_min" | FAIL — expected `healthy`, received `warning` | identical |
| `metricPacks` "covers all eleven Phase 1 metrics" | FAIL — expected `false` to be `true` | identical |

**The failing set is byte-identical. The branch adds 37 passing tests and zero new failures.**

Root cause of the third, for whoever picks it up: six enrollment metrics (`lead_count`, `active_leads`, `active_families`, `new_leads`, `waitlisted`, `tour_completed_count`) are in the metric registry but in no available pack. **Zero Trust keys are involved.** Not fixed here — fixing it is a presentation decision about pack membership, outside a Trust adoption PR.

---

## 9. Phase 1 entry conditions

**Phase 1 may begin only after PR #338 is merged.**

- Start from a **new branch and worktree** based on the merged `origin/staging`. Do not continue on `agent/claude/1-trust-platform-adoption`.
- Objective: **Processing deterministic convergence** — `processing_source_classification` and `processing_identity_resolution` become Decision Classes at escalation level 0 with zero egress.
- **Not** provider-backed document understanding. That is Phase 6, gated on privacy tokenization (Phase 2), segmentation and the scheduler.
- Acceptance is a fixture-corpus diff: classification and resolution outputs must be **byte-identical** to the pre-migration engines. Migration must be observably a no-op in operator experience.
- Carry forward the standing gates: one contract → one package, canonical order, refusal matrix, no operational mutation, structural boundary with negative control, operator reachability by module graph **and** real browser.

---

## 10. Promotion shape

One merge of PR #338, retaining the focused commit history. Phase 0 is not to be split into multiple PRs — the slices are individually certified but collectively coherent, and the registry composition, authorization seam and lifecycle projection reference one another.

---

## Related documents

- [`Trust Platform Adoption — Assessment and Program Plan`](./TRUST-PLATFORM-ADOPTION-ASSESSMENT.md)
- [`Trust Platform`](../../trust/trust-platform.md) · [`Trust Runtime`](../../trust/trust-runtime.md) · [`Trust Platform Decisions`](../../trust/trust-platform-decisions.md)
- [`Trust Economics`](../../trust/trust-economics.md) — corrected in this program: provider identity is not recorded inside a Decision Package
- `certification/trust-runtime-v1/README.md` — the certification template every phase inherits
