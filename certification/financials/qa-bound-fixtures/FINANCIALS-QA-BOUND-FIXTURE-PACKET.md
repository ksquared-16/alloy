# Financials QA-bound fixtures — registration, digests and the exact run packet

Sprint `OPWORK_B77B3CBB5840_SPRINT_386D603E60C7` · lane `lane_b77b3cbb5840` · toolkit `b3c80db2e9aa`.
Prepared 2026-10-30 from local code and synthetic tests only. **Nothing in this packet has run against
any database.** No connection, charge, payment, refund, lease, session, credential or environment was
created preparing it.

## 1. What the toolkit registers, and what the product now supplies

Installed `lib/certification-fixture.mjs` already lists both entries (`qa_bound: true`, so only
`lib/isolated-fixture-execution.mjs` runs them, and the host-env path refuses them):

| registry fixture | npm script (web/package.json) | operations → argv | namespace | reset_limit |
|---|---|---|---|---|
| `financials_isolated_tests` | `test:qa:financials-isolated` | `run` → `[]` | `financials-cert.alloy.invalid` | — |
| `financials_historical_draft` | `dev:qa:financials-historical-draft-fixture` | `ensure` → `--ensure`, `verify` → `--verify`, `reset` → `--reset` | `financials-cert.alloy.invalid` | 50 |

**No toolkit change is needed to run the registered operations.** You can verify the product scripts
against the registry with `vac certify-fixture --list`.

### Script body digests (`--script-sha256`)

`scriptBodyDigest` = sha256 of the package.json script **string**:

| script | body | sha256 |
|---|---|---|
| `test:qa:financials-isolated` | `node scripts/qa/financialsIsolatedTests.mjs` | `78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169` |
| `dev:qa:financials-historical-draft-fixture` | `tsx --tsconfig tsconfig.json scripts/qa/financialsHistoricalDraftFixture.ts` | `07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8` |

The digest pins the command line only. The code it runs is pinned by `--candidate`: the executor
refuses unless worktree HEAD is exactly that commit with no tracked file modified.

## 2. Items for the toolkit owner (HostCapacity / isolated-executor owner) — proposed, not changed here

1. **`financials_isolated_tests.run` is declared `mutating: false`, but its pinned suite mutates.**
   `catalogAddCharge.live.test.ts` seeds configuration and **posts** one catalog charge with its journal
   entry. Posted money is immutable, so that charge stays in the certenv until the environment is
   retired. The registry should say `mutating: true`, and the run belongs only in an environment that
   is retired afterwards.
2. **Register a census for the historical draft.** The product script already implements
   `--count` → `census count=<n>` (read-only: fixture rows, drafts and open periods). It is refused
   until the registry adds, to `financials_historical_draft.operations`:
   `count: Object.freeze({ args: ["--count"], mutating: false, census: true })`.
   With that, `censusIsFresh` can prove reset → 0 after the reset, instead of inferring it from a
   failing `verify`.
3. The persona is bound and checked, but **neither script acts as it**. Both use the certenv service
   credential the executor injects, which is how every financials live suite runs. A
   persona-authorized surface proof is a separate QA step (browser session), not these fixtures.

## 3. Preconditions — the parent QA access/data batch (pending, not done here)

- An **open, live isolated QA run** (`qar_…`) owned by `lane_b77b3cbb5840`, targeting a READY, leased,
  lane-owned `certenv-…` (API port in 56100–56299), with its schema identity recorded at open.
- A persona bound by that run (with a verified session if the plan requires one).
- The certenv baseline contains org `00000000-0000-4000-8000-000000000001`, the tenant every
  financials live suite uses. `ensure` checks this and fails if the org is absent.
- Worktree HEAD = the candidate named below, tracked tree clean.

## 4. The exact sequence

`C` = the candidate (HEAD at execution). Use a fresh `--request-id` for each step: a reused id replays
the old receipt and never re-executes.

```bash
V=/Users/vacilando/.local/share/alloy/toolkit/current/bin/vac
L=lane_b77b3cbb5840; Q=<qar_…>; PERSONA=<bound persona>; C=<candidate sha40>
HD=07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8
IT=78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169
B="--lane $L --qa-run $Q --persona $PERSONA --candidate $C --json"

# 1 fixture: ensure the historical template draft beside a same-name offerable Catalog item
$V certify-fixture financials_historical_draft ensure $B --script-sha256 $HD --request-id fin-hd-ensure-01
# 2 fixture: verify (read-only) — every ✓ must hold
$V certify-fixture financials_historical_draft verify $B --script-sha256 $HD --request-id fin-hd-verify-01
# 3 run: the pinned isolated suite (POSTS one charge — see §2.1)
$V certify-fixture financials_isolated_tests run $B --script-sha256 $IT --request-id fin-it-run-01
# 4 reset: fixture-owned rows only, ≤ 50, ledger refused
$V certify-fixture financials_historical_draft reset $B --script-sha256 $HD --request-id fin-hd-reset-01
# 5 census (after §2.2 registration): must be a FRESH census count=0 measured after step 4
$V certify-fixture financials_historical_draft count $B --script-sha256 $HD --request-id fin-hd-count-01
```

Note the order: reset (step 4) runs **after** the suite (step 3). The suite's own afterAll removes its
drafts and configuration, but its posted charge stays. That charge is on the suite's household,
not on the fixture's, so it does not block the fixture reset.

### What each receipt must show to count

| step | pass | not a pass |
|---|---|---|
| ensure | `ok`, exit 0; checks all ✓ incl. "the draft is edited under its template, not the same-name Catalog item" | exit 3 = identity conflict → operator decision (a same-named, namespace-bound or foreign row at a fixture id); exit 1 = seed/write failure |
| verify | `ok`, every ✓; exactly one draft; template id, key and price 7500 (not the Catalog item's 9900); no `catalog_item` | any ✗ |
| run | `ok`, `tests passed=7 failed=0`, all ✓ | any skipped/pending/todo test, a pinned file reporting nothing, zero passes, exit ≠ 0. **A suite that skipped itself is reported as a failure, never as proof** (vitest itself exits 0 when it skips) |
| reset | `ok`, `reset namespace=financials-cert.alloy.invalid removed=<n>` with n ≤ 50 | refusal with removed=0 when a posted/void charge, foreign template use, payment, journal entry or closed period is present; `reset_unbounded` if n > 50 |
| count | fresh `census count=0`, measured after reset, same run/environment/candidate | replayed or unmeasured census; count > 0 |

## 5. Failure modes that happen before any IO (proven locally)

Both scripts judge the binding before anything else and exit 2 without spawning a process or creating
a client when any of these holds: production/Vercel runtime; a fixture, operation or namespace other
than the registered one; an argv other than the registered vector; absent or malformed
`ALLOY_QA_RUN_ID`, `ALLOY_QA_ENVIRONMENT_ID` or `ALLOY_QA_PERSONA`; `SUPABASE_URL` absent,
non-loopback, or outside 56100–56299 (hosted projects, alloy-cert 54421, default 54321);
`NEXT_PUBLIC_SUPABASE_URL` or `CERT_SUPABASE_URL` disagreeing with the bound target; `DATABASE_URL`
outside the band (alloy-cert DB 54422); or the service credential absent. A refusal names the
variable and never its value.

## 6. Live proof gates still open

1. Steps 1–5 against a real certenv. The column shapes the fixture writes (`customers.external_source`,
   `persons.email`, `locations.customer_id`, `financial_policies`, `commercial_products.metadata`) are
   proven against the in-memory store only. The first live `ensure` is their proof.
2. Billing-period materialization for the fixture household on 2026-03-16 in that environment (the
   rows reset removes are counted, not assumed).
3. Toolkit owner decisions §2.1 (mutating flag) and §2.2 (census registration).
4. Integrated sprint checkpoint: full Tier 1 on the exact integrated tree plus ONE production build
   (`build_sensitive`: web/package.json changed — scripts only, no dependency change).
