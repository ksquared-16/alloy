# Trust Runtime V1 — Slice 1 certification record

**Slice:** `attention_suggestion_enrichment`, deterministic strategy, no provider.
**Executed:** 2026-08-03. **Result: INCOMPLETE — not failed, not closed** (§4).

> **Sequence, recorded not rewritten.** Slice 1 was merged into `origin/staging` as
> `e7ff8e605` **before** certification closeout. The gaps in §4 were open at merge
> time and one of them is still open.

**Closeout session, 2026-08-03** (branch `agent/claude/1-trust-runtime-v1-cert`,
base `db212fe1c`): Gap 1 closed with a real finding; Gap 2 not run; Gap 3 partially
closed with its two operator-surface conditions still unproven. Full narrative and
follow-ups: [`docs/handoffs/trust-runtime-v1-certification-handoff.md`](../../docs/handoffs/trust-runtime-v1-certification-handoff.md).

## 1. How to re-run

```bash
./certification/trust-runtime-v1/run.sh                          # 21 DB assertions, isolated fixture
./certification/trust-runtime-v1/run-fullchain.sh                # 21 + 16 assertions, full 306-migration chain
cd web && npx vitest run tests/trust                             # 41 runtime assertions
cd web && npx tsc -p tsconfig.trustcert.json --noEmit            # compile-time contract proof
```

`run-fullchain.sh` requires a from-empty replay first — see the handoff §1. A
`db reset` against a stack that started *from backup* applies only the pending
migrations and is **not** a full-chain replay.

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
| S15 | Consumer surface | **NOT RUN** | Seam observed in a real browser session; the operator control itself is unreachable in the cert tenant. See §4, Gap 3 |
| S16 | Non-regression | PASS (partial) | See §3 and §6. Attribution for the closeout branch is settled by construction; **Slice 1's own non-regression claim has NOT been re-measured against a current base** |

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

### Gap 1 — full-chain migration replay: **CLOSED 2026-08-03, with a finding**

Replayed from empty on the isolated `alloy-cert` project: **306 migrations applied,
exit 0**, 306 recorded in the ledger, Trust migration `20260802090000` recorded
exactly once as the chain head, 0 duplicate versions, and a static scan of 30 Trust
object names across the other 305 migration files found **0 collisions**.
`02_fullchain_assertions.sql` adds 16 full-chain-only assertions — object uniqueness
for tables, functions, triggers and indexes; exact column sets (19/27/10/12); FK
topology; additivity; SELECT-only policy inventory — **all 16 pass**.

**Finding: the isolated fixture hid a grant defect.** Assertion 21 (`authenticated`
holds no write grant) **passes on the fixture and FAILS on the full chain** —
`authenticated` and `anon` hold INSERT/UPDATE/DELETE on all four Trust tables,
because Supabase's schema-wide `ALTER DEFAULT PRIVILEGES` grants ALL on every
`public` table before any repository migration runs. The migration's `GRANT SELECT`
is redundant and its stated intent is not achieved by GRANT alone.

- **F15** — platform-wide: **0 of 253 public tables are exempt.** Not a Trust
  regression.
- **F16** — **not exploitable as configured**: a real seeded operator who *can* read
  a package in their own org has `INSERT` refused by RLS outright, and `UPDATE` /
  `DELETE` on all four tables leave the stored bytes unchanged (verified by
  re-reading values, not by row counts).

**Result: 20 of 21 isolated invariants + 16 of 16 full-chain assertions pass on the
full chain.** Follow-up A in the handoff.

### Gap 2 — full-project typecheck: **INFRASTRUCTURE-BLOCKED, not passed**

Attempted 2026-08-03T22:07:51Z on a genuine worktree-local `node_modules`
(`npm ci`, 0 exit — the tracked Slot 4 symlink was removed first, so this is the
first time any Trust typecheck measured *this* worktree's dependency tree).

```
npm run typecheck
  → node --max-old-space-size=8192 node_modules/typescript/bin/tsc \
        -p tsconfig.build.json --noEmit
```

| | |
|---|---|
| Result | **killed — exit 144 (128 + signal 16)**, zero bytes of output |
| Reproduced at heaps | 8192 MB, 4096 MB, 2048 MB — identical outcome |
| Also killed | `--listFilesOnly` on the same project — so this is **not** a type-checking memory ceiling |
| Project size | 8851 `.ts`/`.tsx`/`.mts` files under `web/` (excluding `node_modules`, `.next`) |
| Host at launch | load average 41.06 / 49.33 / 53.62; ~233 MB free of 24 GB; node v22.21.1 arm64 |
| Before running | the branch-owned dev server on :3011 was stopped; **no other agent's process was touched** |
| Strictness | unchanged — no `skipLibCheck` added, no Trust file excluded, no scoped project substituted for the full command |

**Bisected, so the blocker is named rather than guessed.** The ceiling is
environmental and scales with program size; it is not Trust-specific and it is not a
type error:

| Scope | Result |
|---|---|
| `lib/trust` + `tests/trust` (`tsconfig.trustcert.json`) | **exit 0** |
| + `lib/privacy/redactObject`, `lib/operationalSummary/*`, `lib/ai/aiPolicy`, `lib/ai/enrichmentContracts` (`tsconfig.slice1scope.json`) | **exit 0, 0 errors, 11s** |
| `lib/queues/QueueService.ts` **alone**, no Trust files | exit 144 |
| `lib/pos/processingCase/commit/auditExistingChildCommit.ts` **alone**, no Trust files | exit 144 |
| `app/api/admin/ai/enrich-attention-suggestion/route.ts` **alone** | exit 144 |

Each of those three modules transitively pulls in a large share of the application,
and any program containing one exceeds this environment's ceiling — with or without
Trust in the program.

**Strongest scope that actually executes:** `tsconfig.slice1scope.json` — the whole
Trust kernel, the Trust test suite, and every *leaf* module the prerequisite refactor
moved. **exit 0, 0 errors.** It cannot reach the route or the two relocated-utility
consumers, so **whole-repository type safety on this branch remains unverified.**

**This is reported as infrastructure-blocked. It is not a pass.**

### Gap 3 — observed browser QA: **PARTIALLY CLOSED; S15 still NOT RUN**

Seam evidence was obtained in a real browser session against the isolated cert
tenant: `POST /api/admin/ai/enrich-attention-suggestion` → 200, envelope shape
unchanged, `suggested_draft_body_overlay` present, additive `decision` block
populated, `execution_mode: "stub"`, `provider_cost_units: 0`, correct org scope,
identity redacted out of the persisted package, all client network traffic confined
to `localhost:3011` / `127.0.0.1:54421`, no new console error.

**Mutation boundary, measured across all 253 public tables:** only the four Trust
tables (+1 each) and `workflow_events` (0 → 10, all `trust_*`, correct org) changed.
The target opportunity row is byte-identical before and after
(`md5 da31ee2ca66f016a07f6a69d4e768875`).

**Still unproven — conditions 1 and 2, and the reason is structural.**

The canonical operator surface is `/workspace/work-unit/<slug>` — not `/adminV2/*`,
`/admin/*` or `/legacy-admin/*`. On that surface every Work View renders correctly
(New Leads, Tours, Follow Up, All Work, with a working Focus Panel). An earlier
revision of this record blamed a cert-tenant mixed-grain Work View
misconfiguration; **that diagnosis was wrong** and is withdrawn — the grain error
appears only when entering through `/adminV2/workspace`.

The real blocker: `OperationalAttentionEnhanceDraft` — the Trust Runtime V1
consumer — is reachable **only** from `OpportunityDrawerOverviewBody`. The Work Unit
surface renders `OpportunityFocusPanelBody`, which has **no path** to it across 1166
modules, and `AdminEntityDrawer` deliberately returns `null` for opportunity routes
on work-unit paths (Presentation Runtime V2). Observed DOM confirms it: zero
`[data-drawer-slot]`, zero `[data-attention-surface]`, no `/enhance/` button.

**Slice 1's only operator-facing consumer sits on a record surface that Presentation
Runtime V2 has retired for work-unit routes.** S15 is unsatisfiable until the
consumer is ported (follow-up B′) — it cannot be closed by testing harder, by tenant
configuration, or by anything on this branch.

## 5. Provider and egress proof

- `lib/trust` contains no `fetch`, `XMLHttpRequest`, `axios`, `http`/`https`
  import, or provider SDK reference — asserted by `tests/trust/trustBoundary.test.ts`.
- `lib/trust` reads no `OPENAI_*` or `ANTHROPIC_*` environment variable —
  asserted by the same suite.
- `provider_cost_units` is typed as the literal `0`, so a non-zero provider cost
  cannot be represented in a V1 Decision Package.
- The route's live-provider branch is untouched and is not reachable from the
  Trust path.
- **Observed 2026-08-03:** a live enrichment call persisted `provider_cost_units = 0`
  and `strategy_kind = deterministic`, reported `execution_mode: "stub"`, and
  contacted no host outside `localhost:3011` / `127.0.0.1:54421`. The certification
  environment carries no `OPENAI_*` or `ANTHROPIC_*` credential at all.

## 6. Re-verification on this worktree's own dependencies — 2026-08-03

Every earlier Trust measurement in a managed worktree resolved modules through the
tracked `web/node_modules` symlink into Slot 4. These were re-run after
`rm web/node_modules && npm ci`, so they measure **this** worktree:

| Check | Result |
|---|---|
| `npx vitest run tests/trust` | **41 passed / 41**, 2 files, exit 0 |
| `tsc -p tsconfig.trustcert.json --noEmit` (S14 compile-time proof) | **exit 0** |
| `tsc -p tsconfig.slice1scope.json --noEmit` | **exit 0, 0 errors**, 11s |
| `run-fullchain.sh` (re-run after another session reset the stack) | 306/306 migrations, **20/21 + 16/16**, runner exit 0 |
| `npx vitest run tests/queues` | 5 failed / 206 passed (26 files) |

The full-chain result reproduced on a database that a **different** session had reset
in between — the Trust migration and its invariants survive an independent replay.

### Non-regression attribution — settled by construction

`git diff --stat db212fe1c..HEAD` for this branch is six files: two certification
SQL files, the certification runner, this record, the handoff, and one scoped
tsconfig. **Zero production `.ts`/`.tsx` files are touched.** The 5 `tests/queues`
failures are therefore inherited from the base and cannot be attributed to this
branch — no separate base run is needed to establish that.

Failing tests, recorded so a future session can tell drift from novelty:

```
QueueServicePlacementProjection.test.ts  v2 engine expands to candidate rows with _placement_waitlist_row
childGrainHonestRowSubject.test.ts       Card 8 ocmrow row gets honest child subject without flag
childGrainLaneBuilders.test.ts           produces honest child row_subject and active_subject
queueRoutes.test.ts                      GET queue items applies stage enrichment before work_view_id filters
queueRoutes.test.ts                      GET queue items with work_view_id returns true filtered total when limit=1
```

**What this does NOT establish.** Slice 1's own non-regression claim (§3) was
measured against an older staging SHA. Slice 1 is already merged into this branch's
base, so re-measuring it requires comparing `e7ff8e605^1` against `e7ff8e605`, which
has not been done. The §3 table stands unconfirmed.
