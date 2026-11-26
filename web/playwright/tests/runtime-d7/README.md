# D7 — Standing Runtime Certification

Permanent release discipline for the frozen Operational + Settlement Runtime (D1–D6). D7 adds **no
product behavior**. It converts the proven runtime into a repeatable gate.

## Layout

| File | Role |
|---|---|
| `preflight.ts` | Fail-closed environment check with failure classification. |
| `certInstrument.ts` | The D4-corrected measurement, shared verbatim (matches the authoritative harness). |
| `scenarioMatrix.spec.ts` | The standing behavioral scenario matrix. |
| `../tools/runtimeStatRunner.spec.ts` | The D6 statistical runner (cold/warm percentile distributions). |
| `../runtime-certification.spec.ts` | The authoritative single-run harness (unchanged). |

## The three tiers (§5)

| Tier | Command | Purpose | Duration |
|---|---|---|---|
| **Fast PR gate** | `npx playwright test runtime-d7/scenarioMatrix --grep @fast` | Deterministic regressions (construction, dup requests, reconstruction, continuity, first-sight, empty/error truth, ownership). | ~1–2 min |
| **Promotion gate** | `npx playwright test runtime-d7/scenarioMatrix` | The full scenario matrix against the co-located production build. | ~3–5 min |
| **Scheduled statistical** | `RC_STAT_N=50 RC_STAT_MODE=cold …; RC_STAT_N=100 RC_STAT_MODE=warm …` (see runner header) | Cold/warm ACK/LEGIBLE/commit percentile distributions. | ~15–25 min |

Do **not** put 150-sample statistical runs in ordinary developer tests — that is the scheduled tier.

## Required environment

All tiers require the co-located production environment (never a dev build, never hosted Supabase):

```
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
ALLOY_CONFIG_FILE=~/.config/alloy-dev/config.colocated alloy-dev-start wt3-runtime-continuity
# env for the tiers:
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013
export PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot3/storage-state.json
export WU_SLUG_A=new-leads
export D7_EVIDENCE_DIR=~/.local/state/alloy-dev/evidence/wt3-runtime-continuity/D7-MATRIX
```

Preconditions the preflight enforces (fail-closed): Docker up · local Supabase :56321/:56322 · production
mode · toolkit-owned server · co-located config + `ALLOY_BLOCK_REMOTE_SUPABASE=1` · valid storage state ·
representative seed present · D1 operational · Settlement terminal.

**GOTCHA:** never run `npm run build` while `next start` is live — it overwrites `.next` under the running
server and the workspace stops hydrating (0 tiles). Rebuild, then restart the server.

## Deterministic vs statistical gates (§4)

- **Deterministic** (every valid run, graded per-run): `visible_construction=0`, `duplicate_requests=0`,
  `reconstruction=0`, `continuity_breaks=0`, `false_empty=0`, `operational_at_first_sight=true`,
  `UO1–UO6=true`, no silent Work View/context switch, no subject loss, no hosted traffic.
- **Statistical** (graded only across a distribution, never one run): ACK p99 ≤50ms · LEGIBLE p95 ≤100ms ·
  cold Operational Commit p75 ≤800ms / p95 ≤1200ms. Preserve cold vs warm classification.

## Interpreting failures — classification (§6)

Every failure is one of: **Runtime · Settlement · browser scheduling · environment · authentication ·
seed/data · certification infrastructure**. A degraded environment **skips** the behavioral suite (the
preflight records the class in `preflight.json`); it never becomes a product failure. Known
environmental characteristics (do not treat as runtime defects):
- Cold-page first-interaction ACK ~50ms (warm ~13ms) = browser first-paint, not a runtime miss.
- Settlement reflow only on pathologically slow commits (≥545ms) under real system load = environmental.

## When a sample is invalid

Discard (do not grade) any run where: the preflight is not `ok`; the terminal is `preparing` (never
committed); or the storage state is expired (`authentication` class). The statistical runner labels each
sample `valid`.

## Cold vs warm

- **Cold** = fresh browser context per sample (cold client caches). First-interaction paint dominates ACK.
- **Warm** = one reused context with history-back between samples (hot caches). Reflects the steady state.
The constitutional commit budgets differ: cold ≤800ms p75; warm is much faster (~100–200ms).

## How promotion uses the results

The **fast PR gate** blocks a merge on any deterministic regression. The **promotion gate** (full matrix)
runs before rebase/merge to staging. The **scheduled statistical gate** validates the percentile budgets
periodically, not per-PR.

## Updating the scenario matrix safely

Add a scenario as a new `test(...)` in `scenarioMatrix.spec.ts`; tag `@fast` only if it is quick and
deterministic. Reuse `enterWorkUnit` / `installInstrument` / `assertDeterministic` — never inline a second
measurement (it must match the authoritative harness). Never weaken an existing invariant to make a new
scenario pass; if a scenario cannot be exercised in the local environment, document it here rather than
asserting on source text.

## Coverage status

Behaviorally exercised: Workspace→WU · WU→Workspace (back) · Work View movement · Record-of-Attention
movement + rapid latest-wins · direct WU URL · reload recovery · operational terminal · authoritative
empty · honest error · in_scope · Settlement resolved · Settlement error isolation.

Documented, not exercised here (need specific config/data the local seed does not provide): browser
forward (symmetric to back) · `no_active_view` / `out_of_scope` scope states (need a lens-less or
out-of-scope WU) · Settlement `empty` (a lens whose locators resolve to zero data) · hosted-Supabase
fail-closed (config-level guard `ALLOY_BLOCK_REMOTE_SUPABASE=1`, verified by preflight, not driven).
