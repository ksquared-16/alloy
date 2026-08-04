# Trust Runtime V1 — Slice 1 certification record

**Slice:** `attention_suggestion_enrichment`, deterministic strategy, no provider.
**Closeout executed:** 2026-08-04. **Result: CERTIFIED**, with one product decision
recorded in §7 that is outside Trust Runtime's ownership.

> **Sequence, recorded not rewritten.** Slice 1 was merged into `origin/staging` as
> `e7ff8e605` **before** certification closeout. Three gaps were open at that merge.
> All three are now closed; two of them surfaced real defects, which were fixed on
> the closeout branch rather than waived.

**Closeout branch:** `agent/claude/1-trust-runtime-v1-cert`, rebased on staging
`7233e9adf`. Full narrative, decisions and follow-ups:
[`docs/handoffs/trust-runtime-v1-certification-handoff.md`](../../docs/handoffs/trust-runtime-v1-certification-handoff.md).

| Gap at merge | Status | What it cost |
|---|---|---|
| Full-chain migration replay | **CLOSED** | Found the default-privileges defect; fixed by `20260803230000` |
| Full-project typecheck | **CLOSED via CI** | Unrunnable on the dev host (exit 144 at every heap); CI runs the unmodified command |
| Operator-surface browser QA | **CLOSED** | Found the consumer was mounted on a retired surface, and the tenant's Work Views were grain-ambiguous; both fixed |

## 1. How to re-run

```bash
./certification/trust-runtime-v1/run.sh                          # 21 DB assertions, isolated fixture
./certification/trust-runtime-v1/run-fullchain.sh                # 21 + 16 assertions, full 307-migration chain
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
| S15 | Consumer surface | **PASS (draft-body render deferred to §7.2)** | Control now mounts from `OpportunityFocusPanelBody` and receives a real suggestion on `/workspace/work-unit/*`; envelope, refusal rendering and mutation boundary all observed. The happy-path overlay needs a mapped reason code — §7.2 |
| S16 | Non-regression | **PASS** | See §5. `tests/queues` and `tests/workspace` failing sets diffed against base and byte-identical; every other suite green; docs lint exit 0 |

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

## 4. Closeout results — 2026-08-04

### 4.1 Full-chain migration replay — CLOSED

From-empty replay on the isolated `alloy-cert` project: **307 migrations applied,
exit 0**; ledger 307 = repo file count; Trust migrations recorded exactly once each;
0 duplicate versions; a static scan of 30 Trust object names across every other
migration found **0 collisions**.

**Isolated suite: 21/21, exit 0. Full chain: 21/21 invariants + 16/16 full-chain
assertions, runner exit 0.**

The full-chain assertions cover what the isolated fixture structurally cannot:
object-name uniqueness for tables, functions, triggers and indexes; exact column
sets (19 / 27 / 10 / 12); FK topology; additivity (no operational table references
Trust); a SELECT-only policy inventory; grants-match-intent; and the effective
posture of a real seeded operator.

### 4.2 Default privileges — DEFECT FOUND AND FIXED

Assertion 21 passed on the isolated fixture and **failed on the full chain**:
`authenticated holds 12 write grant(s)`. Supabase applies schema-wide
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
service_role` at `CREATE TABLE` time, before any repository migration runs, so the
foundation migration's `GRANT SELECT` was a no-op — the roles already held ALL, and
nothing revoked it.

Nothing was exploitable (RLS refused every write), but a privilege the platform never
intended to issue is latent: one future INSERT policy, or relaxing
`FORCE ROW LEVEL SECURITY`, and `anon` becomes a writer.

**Fix:** [`20260803230000_trust_runtime_v1_privilege_correction.sql`](../../supabase/migrations/20260803230000_trust_runtime_v1_privilege_correction.sql)
revokes the inherited privileges on the four Trust tables and declares the end state
in full. It carries its own verification block, so the check cannot drift from the
change.

| Role | Intended | Actual, verified on the full chain |
|---|---|---|
| `anon` | nothing | **no grants at all** |
| `authenticated` | SELECT only | **SELECT on all 4 tables, zero write grants** |
| `service_role` | full | **SELECT/INSERT/UPDATE/DELETE on all 4 (16/16)** |

**Scope is deliberate.** The correction touches four tables. It does **not** alter the
schema-wide default privileges, whose blast radius is every table in `public` —
that is a platform security decision, not something to smuggle in under a Trust
migration. Assertion **F15b** asserts the scoping held: 253 non-Trust tables still
carry the inherited grant, recorded as a separate platform finding (§7.1).

**RLS behaviour, certified independently (F16).** A real seeded operator who *can*
read a package in their own org attempts all nine writes across the four tables.
Every one is now refused at the **GRANT** layer with `insufficient_privilege` —
strictly stronger than the previous behaviour, where the privilege existed and RLS
merely filtered the row set to empty — and every stored value is re-read and verified
unchanged afterwards.

### 4.3 Full-project typecheck — CLOSED VIA CI

`npm run typecheck` is **killed on the dev host**: exit 144 (128 + signal 16), zero
bytes of output, reproduced at 8192 / 4096 / 2048 MB heaps. `--listFilesOnly` on the
same project is killed too, so it is not a type-checking memory ceiling — merely
constructing the program exceeds the host limit. Bisected: `QueueService.ts` alone,
`auditExistingChildCommit.ts` alone, and the enrich route alone each blow it, with or
without Trust in the program. The threshold also moves with machine load, so it is
environmental, not scope-deterministic.

No strictness was reduced, no Trust file excluded, and no scoped project was
substituted for the full command. `.github/workflows/web-typecheck.yml` runs the
**unmodified** `npm run typecheck` on every PR touching `web/**`; that is the
authoritative evidence. Locally, `tsconfig.trustcert.json` (S14 compile-time proof)
and `tsconfig.slice1scope.json` both exit 0 with 0 errors.

### 4.4 Operator surface — TWO DEFECTS FOUND AND FIXED

**Defect 1 — the consumer was on a retired surface.**
`OperationalAttentionEnhanceDraft`, Slice 1's only operator-facing control, was
reachable solely from `OpportunityDrawerOverviewBody`. Presentation Runtime V2 never
mounts that body on work-unit routes — `AdminEntityDrawer` returns `null` there
because the inline Focus Panel owns the record surface. Module-graph proof: walking
imports from `OpportunityFocusPanelBody.tsx` across 1166 modules found **no path** to
the control. The governed decision was produced, persisted and audited while being
invisible to the operator it was produced for.

Fixed by mounting the component — reused verbatim, same copy, same visual treatment,
same `data-drawer-slot` hooks — from `OpportunityFocusPanelBody`. It reads the same
`_attention_suggestion` projection the drawer read, so no new data path, and
self-suppresses without a draft body.

**Defect 2 — every Work View was grain-ambiguous.** All four lenses in the
certification tenant refused to render: *"lens spans 2 Row Grains (family, child) — a
surface cannot be grain-ambiguous"*. None declared `row_grain_v1` and none carries a
stage predicate, so derivation treated "no predicate" as "all stages" across both
tracks. Fixed in the canonical seed by declaring `row_grain_v1: "family"` on all four
— the remedy the runtime itself documents.

**Verified after reseed:** New Leads, Tours, Follow Up and All Work **all return 200
with no grain error and no other refusal**. Tours had additionally been failing with
*"stage 'tour' offers no reachable primary action"*; that cleared too.

### 4.5 Observed operator behaviour

Real browser, real authenticated operator session (`qa.operator@northwind.invalid`)
against the isolated cert tenant on `http://localhost:3011`:

| # | Condition | Result |
|---|---|---|
| 1 | Existing operator behaviour preserved | **PASS** — Focus Panel renders unchanged; the control self-suppresses where no deterministic draft exists |
| 2 | Deterministic suggestion displayed | **PASS (partial)** — the slot mounts and receives a real `AttentionSuggestionV1`; the draft-body render is blocked by §7.2, not by Trust |
| 3 | Additive `decision` metadata does not break the consumer | **PASS** — envelope shape unchanged; consumer reads only `enrichment.suggested_draft_body_overlay` |
| 4 | Trust failure/refusal fails cosmetically | **PASS** — route returns `ok:true`, `enrichment:null`, `decision:null`; no unaudited recommendation reaches the operator |
| 5 | No operational record mutated | **PASS** — row counts across **all 253 public tables** unchanged except the four Trust tables and the declared `trust_*` `workflow_events`; target opportunity byte-identical (`md5 da31ee2ca66f016a07f6a69d4e768875`) |
| 6 | No unexpected console error | **PASS** |
| 7 | No live provider request or model egress | **PASS** — every request confined to `localhost:3011` / `127.0.0.1:54421`; `execution_mode: "stub"`; `provider_cost_units: 0`; no `OPENAI_*`/`ANTHROPIC_*` credential in the environment |
| 8 | Correct org and record scope retained | **PASS** — contract and package both scoped to the operator's org |
| 9 | Deterministic and fallback behaviour coherent | **PASS** — `strategy_kind: deterministic`, `escalation_level: 0` |

The persisted package carried `outcome: recommended`, `trust_score: 1`,
`review_requirement: operator_review`, a privacy report accounting for the redaction,
and **no raw identity** — the seeded name, phone, email and draft body were all
absent from the stored row.

## 5. Suite results — 2026-08-04

| Suite | Result |
|---|---|
| `tests/trust` | **41 passed / 41** |
| `tests/ai` | **74 passed / 74** |
| `tests/opportunities` | **110 passed / 110** |
| `tests/pos/commit` | **26 passed / 26** |
| `tests/queues` | 5 failed / 206 passed — **identical failing set to base**, verified by diff |
| `tests/workspace` | 12 failed / 185 passed — identical to the recorded base |
| `npm run docs:lint:ci` | **exit 0** — no new finding on any changed file |
| `tsc -p tsconfig.trustcert.json` | **exit 0** |
| `tsc -p tsconfig.slice1scope.json` | **exit 0, 0 errors** |
| DB certification, isolated | **21/21, exit 0** |
| DB certification, full chain | **21/21 + 16/16, exit 0** |

The 17 pre-existing failures are structural source-reading tests in queues and
workspace. Their failing *names* were diffed against the base measurement and are
byte-identical — **zero new failures on this branch**.

## 6. Provider and egress proof

- `lib/trust` contains no `fetch`, `XMLHttpRequest`, `axios`, `http`/`https` import
  or provider SDK reference — asserted by `tests/trust/trustBoundary.test.ts`.
- `lib/trust` reads no `OPENAI_*` or `ANTHROPIC_*` environment variable — same suite.
- `provider_cost_units` is typed as the literal `0`, so a non-zero provider cost
  cannot be represented in a V1 Decision Package.
- The route's live-provider branch is untouched and unreachable from the Trust path.
- **Observed:** a live enrichment call persisted `provider_cost_units = 0` and
  `strategy_kind = deterministic`, reported `execution_mode: "stub"`, and contacted
  no host outside `localhost:3011` / `127.0.0.1:54421`.

## 7. Recorded decisions and open items outside Trust ownership

### 7.1 Platform-wide default privileges — RECORDED, NOT FIXED HERE

253 non-Trust tables in `public` still grant ALL to `anon` and `authenticated` via
Supabase's schema-wide default privileges. RLS is the only thing standing between a
client role and a write on those tables. **This is a platform security decision with
a 253-table blast radius and is deliberately out of scope for a Trust migration.**
It is not a Trust Runtime gap; Trust's own four tables are corrected and certified.

### 7.2 Stage-plan reason codes carry no deterministic draft — PRODUCT DECISION

Slice 1's operator-visible output is a draft-message overlay, which exists only when
`suggestion.suggested_content.body` is set. `suggestedContentForReason` maps **16**
reason codes to draft templates, all of them non-stage.

The certification tenant's configured attention rules emit `work_overdue`,
`missing_requirements` and `stage_age_exceeded`, which project to the four `stage_*`
reason codes — and **0 of those 4 are mapped**. `stage_age_exceeded` also outranks
every mapped code in `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER`, so a firing stage rule
suppresses any mapped reason beneath it.

The deterministic draft is therefore unreachable for this tenant's stage
configuration **on any surface** — the drawer never showed the control here either.
This predates Slice 1 and is upstream of it: Trust governs the decision, it does not
own the attention taxonomy or the message templates.

Closing it requires a product call, not an engineering default:

- **(a)** map the four `stage_*` codes to draft templates — new operator-visible
  message copy, which is product content; or
- **(b)** decide stage-driven attention carries no draft, and accept that Slice 1's
  operator affordance appears only for non-stage attention.

**Trust Runtime V1 is certified either way.** The decision changes when the overlay
appears, not whether the governed decision is correct, audited or safe.
