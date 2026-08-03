# Trust Runtime V1 — Slice 1 certification record

**Slice:** `attention_suggestion_enrichment`, deterministic strategy, no provider.
**Executed:** 2026-08-03. **Result: PASS with two named gaps** (§4).

## 1. How to re-run

```bash
./certification/trust-runtime-v1/run.sh                          # 21 DB assertions
cd web && npx vitest run tests/trust                             # 41 runtime assertions
cd web && npx tsc -p tsconfig.trustcert.json --noEmit            # compile-time contract proof
```

## 2. Evidence

| # | Scenario | Result | Evidence |
|---|---|---|---|
| S1 | Happy path — one contract → one complete package | PASS | 1 contract, 1 package, 1 usage row; every package section populated |
| S2 | Package immutability | PASS | DB assertions 1–2: `UPDATE` and `DELETE` both refused by trigger |
| S3 | One package per contract | PASS | DB assertion 3: second insert refused by unique constraint |
| S4 | Lineage, predecessor unchanged | PASS | DB assertions 6–7 |
| S5 | Append-only observations | PASS | DB assertions 8–11 (append ok; update, delete, orphan all refused) |
| S6 | Canonical order (Decision 021) | PASS | Step trace equals `TRUST_RUNTIME_STEPS` exactly; knowledge retrieval strictly after privacy |
| S7 | Seven-case refusal matrix | PASS | Each of policy, permission, unsupported class, insufficient information, privacy, validation, reasoning yields a package; zero writes outside the four Trust tables |
| S8 | Determinism preference | PASS | Strategy `deterministic`, escalation level 0, never escalates |
| S9 | Privacy | PASS | Draft body absent from the serialized package; every transformation accounted for in the privacy report; prohibited class refuses |
| S10 | Validation orchestration | PASS | Every validator result names an owner outside `lib/trust/` |
| S11 | Governance owns trust semantics | PASS | Score reproduces from the stored vector; reweighting a non-uniform vector changes it with no runtime change |
| S12 | Structural boundary | PASS | Boundary suite green; **negative control**: a planted `lib/adminV2/actions → lib/trust` import fails it |
| S13 | Reproducibility | PASS | Identical package modulo identity; replay produces a new package, predecessor byte-identical |
| S14 | Contracts cannot carry reasoning implementation | PASS | 6 `@ts-expect-error` assertions compile clean; **negative control**: weakening the guard produces exactly 6 `TS2578 Unused '@ts-expect-error'` errors, so all six are load-bearing |
| S15 | Consumer surface | **NOT RUN** | See §4 |
| S16 | Non-regression | PASS (partial) | See §3 |

Additional database assertions beyond the scenario list: refusals persisted as
packages; a refusal cannot carry a recommendation; contract insert-only with
forward-only lifecycle; contract `DELETE` refused; cross-tenant packages and
observations refused; append-only usage; no lifecycle column on
`trust_decision_packages`; RLS on all four tables; no write grant to
`authenticated`.

## 3. Non-regression, base vs branch

Measured, not remembered. Identical dependencies; the only difference is the
checkout.

| Suite | Branch | Base (`origin/staging`) | New on branch |
|---|---|---|---|
| `tests/ai` | 74 passed, 0 failed | — | 0 |
| `tests/trust` | 41 passed, 0 failed | n/a (new) | 0 |
| `tests/workspace` | 12 failed / 185 passed | 12 failed / 185 passed | **0** — identical failing-test and failing-file sets |
| `tests/queues` | 5 failed / 199 passed | 5 failed / 199 passed | **0** — identical |
| `tests/pos/commit`, `tests/admin/recompute…`, `tests/opportunities` | all passed | — | 0 |

The 17 pre-existing failures are structural source-reading tests unrelated to
this work; none of the modules they exercise is touched by this branch.

## 4. Gaps — Slice 1 is not fully certified until these close

1. **Full-chain migration replay NOT executed.** The migration is certified in
   isolation against a purpose-built tenancy fixture (21/21). It has **not**
   been replayed inside the full repository migration chain, so name collisions
   against the real schema are unproven. The `alloy-objhost` stack was torn down
   during this session and the only remaining Supabase stacks belong to other
   agents. Close with `alloy-db-reset` on a disposable project, then re-run
   `run.sh` against it.
2. **Full-project typecheck NOT executed.** `npm run typecheck` needs an 8 GB
   heap; the host had roughly 280 MB free at load average 25 and the process was
   OOM-killed at 8 GB, 3.5 GB and 3 GB. The **scoped** project
   (`tsconfig.trustcert.json`, covering `lib/trust` and `tests/trust`) passes
   with `rc=0`, which is what carries the S14 compile-time proof — but
   whole-repository type safety is unverified on this branch.
3. **S15 browser QA NOT run.** No dev server was started; the operator-facing
   surface change is additive (`decision` block) and the envelope is unchanged,
   but that is reasoned, not observed.

## 5. Provider and egress proof

- `lib/trust` contains no `fetch`, `XMLHttpRequest`, `axios`, `http`/`https`
  import, or provider SDK reference — asserted by `tests/trust/trustBoundary.test.ts`.
- `lib/trust` reads no `OPENAI_*` or `ANTHROPIC_*` environment variable —
  asserted by the same suite.
- `provider_cost_units` is typed as the literal `0`, so a non-zero provider cost
  cannot be represented in a V1 Decision Package.
- The route's live-provider branch is untouched and is not reachable from the
  Trust path.
