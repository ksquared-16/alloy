# Financials child authority guard — local release-readiness proof packet

QAFX-AUTH-01 (Financials H4). Prepared 2026-10-30 for the A741 contract pin. This is local readiness
only: nothing pushed, filed, merged, installed or executed against any database. It is not acceptance.

## Code candidate

| | |
|---|---|
| Code commit | `802055363b09ea5cee1db1fb599701b2f472abbf` (tree `a3e52370af75e2162dc4a792bd1d9be1d898e000`) |
| Final candidate | the commit that adds this file: a documentation-only child of the code commit |
| Branch | `sprint/opwork_b77b3cbb5840_sprint_386d603e60c7` |
| Base | `origin/staging` `4272e85dc8fbf552cfa21444c57272987eb06efd` = merge-base (remote tip read with `git ls-remote`); 0 behind, 15 ahead |
| Preserved | `f4f4585c77add99d136e3528fee8f8493753491d` (incident census v2) and every earlier sprint commit are ancestors, unchanged |

## Contract pins for A741

| Pin | Value |
|---|---|
| Toolkit contract | `lib/isolated-fixture-execution.mjs` at `bab9c92752479ded535f86e152246e1ae935b349`, sha256 `12a8998a9f06b20b451eb957ee2404a0554dd25150655c337bc6396532830ea1` (verified) |
| Authority schema | `vacilando.isolated_fixture_authority.v1`; refusal codes identical to the toolkit's `FIXTURE_AUTHORITY_REFUSALS` (+ Financials-only `fixture_authority_org_not_the_seed_org`) |
| Fixture / operation | `financials_isolated_tests` / `run` (`args: []`, mutating) |
| npm script | `test:qa:financials-isolated` |
| Script body | `node scripts/qa/financialsIsolatedTests.mjs`, sha256 `78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169` (UNCHANGED by this work) |
| Fixture org | seed manifest: `00000000-0000-4000-8000-000000000001`, `ALLOY_CERT_FIXTURE_ORG_SOURCE=seed_manifest` |
| Store root (child-resolved) | `<os.userInfo().homedir>/.local/state/alloy-dev/gateway` — never `$HOME` / `ALLOY_RUNTIME_ROOT` |
| `candidateSha` | must be the FINAL candidate's full SHA (the guard compares the record's `candidate_sha` with `git rev-parse HEAD`) |

### File digests at the code commit (sha256, paths under `web/`)

```
eafd61c877535edd8eda9c7681730e612612b342c2f04709c2d6e4b84957b756  scripts/qa/financialsFixtureAuthority.mjs
99c78e977a739a047cac49438a5b9cbb323685c8d93ad2e31196e19e810db08e  scripts/qa/financialsIsolatedTests.mjs
79576b2371f31446d984a07c470ce5f4eec154f3f37014d1d0184ad8c91cff9b  scripts/qa/financialsIsolatedBinding.mjs
c5875c328ab196e4c5c29fb5d13485c6dab5f06f2e0f3d7faea0203d7b1862b3  tests/harness/liveSuiteAuthority.mjs
4d50e205f3012864de3684ed1b92f2d5ee962ea628f4db8ca6228e158a684b10  tests/financials/live/catalogAddCharge.live.test.ts
f367f1154a9d88a6ffa04fecd375d37c3173fb33934e832200c89b6b058cd140  vitest.config.ts
5ce942715749bb53b71a26a73d11cfe56a3877118fa4a2cca3410da9f6c91e73  package.json
```

## What the child checks, before any live-suite import or env load

Both `test:qa:financials-isolated` (`main`, before spawning vitest) and `vitest.config.ts`
(`judgeLiveSuiteAuthority`, before `include`/`exclude` are decided) require the env binding AND:

1. the store root resolved by the program itself (above);
2. `ALLOY_QA_AUTHORITY_FILE`'s real path directly in `<root>/vacilando/isolated-fixture/authority/`,
   named `<request_id>.*.json` (symlink escape → `not_executor_issued`);
3. `requests/<request_id>.json` `in_flight`, same `binding_digest`, naming this file, recorded sha256
   equal to the bytes read; an env digest, if present, must agree and is never the origin;
4. schema; `issued_at <= now < expires_at`;
5. request / fixture / operation / QA run / environment / candidate / binding equal to the env;
6. npm script, suite and pinned script body from the program; candidate equal to HEAD;
7. bound seed org. Live authority admits only `tests/financials/live/catalogAddCharge.live.test.ts`.

**Limit, stated:** executor and child are the same OS user; nothing authenticates the issuer
cryptographically. A same-user rewrite of the executor's own store (request and record together) is
accepted — tested as documented, not claimed as stopped.

## Evidence (from the completed run `erun2_4954f9a4705bd0c5`, code commit unchanged since)

- 3 focused files, 164/164: `tests/financials/qaFixtureAuthority.test.ts`,
  `tests/financials/qaIsolatedFinancialsFixtures.test.ts`, `tests/harness/liveSuiteAuthority.test.ts` —
  forged record outside the store, no request, completed request (replay), other file/binding, altered
  bytes with and without the env digest, expired / at-expiry / future, wrong operation / fixture / suite /
  npm script / script body / candidate / QA run / environment / request / digest / lifecycle, symlink
  escape, wrong or absent org, env-named root ignored; the REAL vitest config refuses a forged complete
  temp store (canary unimported, live files listed not run).
- Two planted regressions (in-flight check removed; recorded digest replaced by env trust) each failed
  the suite; the file was restored byte-identical.
- Focused-safe list (`FOCUSED-SAFE-TEST-LIST.txt`): 41 files / 892 tests passed; live suites EXCLUDED.
- `typecheck` and `typecheck:tests` passed; eslint clean on new/changed files (5 `no-explicit-any` in
  `qaIsolatedFinancialsFixtures.test.ts` pre-exist at the parent commit).
- Production build: one, through the serialized broker, on the final candidate — result in the run report.

## Gates that remain

- **Installation:** the installed toolkit (`b3c80db2e9aa`, `lib/isolated-fixture-execution.mjs` sha256
  `24347ffa…55e7`) has no `verifyFixtureAuthority` and writes no authority record. Until A741 is
  installed every real execution of this script refuses `fixture_authority_absent` (fail-closed).
- **Executor root:** an executor running with a non-default `ALLOY_RUNTIME_ROOT` is refused by the child.
- **Promotion:** full certification checkpoint, Director release, one PR, CI, merge — none started.
- **Acceptance:** a real isolated execution under installed A741 has not happened and is not claimed.

## Historical-draft fixture (`financials_historical_draft`) — gap, not changed here

1. **Env-only authority.** `scripts/qa/financialsHistoricalDraftFixture.ts` judges only the env binding
   (`readIsolatedBinding`) before `createClient`; a hand-set environment passes it.
2. **Org contradiction.** A741 registers it `fixture_org: PERSONA_ORG` with `preview: true`, so the
   executor binds the persona's org (e.g. QA Shared `4acc9386-…`), while
   `financialsHistoricalDraftFixtureCore.ts` hardcodes `ORG = 00000000-0000-4000-8000-000000000001`.

Minimum same-contract remedy: give `verifyFinancialsFixtureAuthority` a program descriptor (fixture,
operation from the registered argv, npm script `dev:qa:financials-historical-draft-fixture`, body
`tsx --tsconfig tsconfig.json scripts/qa/financialsHistoricalDraftFixture.ts` sha256
`07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8`, expected org source `persona`);
call it in `main` before `createClient`; pass the bound org into the core instead of its constant; same
synthetic tests. This changes historical-fixture bytes (not its script body) and needs a new candidate
pin; the org question (persona vs seed) is a product decision to settle first.
