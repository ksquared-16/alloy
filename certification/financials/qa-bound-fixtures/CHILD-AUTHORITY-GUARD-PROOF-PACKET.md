# Financials child authority guard — local release-readiness proof packet

QAFX-AUTH-01 (Financials H4). Covers BOTH QA-bound Financials programs: `test:qa:financials-isolated`
and `dev:qa:financials-historical-draft-fixture`. Local readiness only: nothing pushed, filed, merged,
installed or executed against any database. It is not acceptance. The first version of this packet
(isolated tests only) is preserved at `a585a8957176b7c7999118b76b8ea6d893415599`.

## Candidate

| | |
|---|---|
| Code commit | `77c0d0e7a6ff97e418c66a374ea322dce601e60e` (tree `040a9f18bcf73d38d2ac5ab6ead69f931e12ca71`) |
| Final candidate | the commit that adds this revision of the file: a documentation-only child of the code commit |
| History | `802055363b09` (isolated guard) → `a585a8957176` (packet v1) → `77c0d0e7a6ff` (historical fixture) → this packet |
| Branch | `sprint/opwork_b77b3cbb5840_sprint_386d603e60c7` |
| Base | `origin/staging` `4272e85dc8fbf552cfa21444c57272987eb06efd` = merge-base (remote tip read with `git ls-remote`) |
| Preserved | `f4f4585c77add99d136e3528fee8f8493753491d` (incident census v2) and every earlier sprint commit are ancestors, unchanged |

## Platform contract this binds to (A741, verified at `bab9c92752479ded535f86e152246e1ae935b349`)

| File | sha256 |
|---|---|
| `lib/isolated-fixture-execution.mjs` (`verifyFixtureAuthority`, record + request shapes) | `12a8998a9f06b20b451eb957ee2404a0554dd25150655c337bc6396532830ea1` |
| `lib/certification-fixture.mjs` (registrations, operations, `fixture_org`) | `5f99418f4d0f114b4af02fe82241c2c0911a79cb8342d05b6288533ca65428e7` |
| `lib/qa-plan-registry.mjs` (`QA_ORGS`) | `2a88ab34169c826bc345c924f06295ee77090f408ee1fe2000d4e74dfcf786b3` |
| `lib/qa-isolated-suite-target.mjs` (persona → `org_key`) | `a863073575ef0c9b5fa3efc367c227937a44fdec1dc8bb2a25200c84a2be4072` |
| `lib/qa-run-ledger.mjs` (`vacilando/qa-runs/runs.json`) | `707acc40b1f90b5da631476142fcefbe8da4ce5c28458f26444e6be879bb13d0` |

## Pins to report to the platform owner BEFORE activation

| | `financials_isolated_tests` | `financials_historical_draft` |
|---|---|---|
| npm script | `test:qa:financials-isolated` | `dev:qa:financials-historical-draft-fixture` |
| Script body | `node scripts/qa/financialsIsolatedTests.mjs` | `tsx --tsconfig tsconfig.json scripts/qa/financialsHistoricalDraftFixture.ts` |
| `expectedScriptSha256` | `78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169` (unchanged) | `07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8` (unchanged) |
| Operations admitted | `run` | `ensure`, `verify`, `reset`, `count` (each authority admits only its own) |
| Org binding | `seed_manifest`: exactly `00000000-0000-4000-8000-000000000001` | `persona`: the QA-run ledger's persona `org_key` → A741 `QA_ORGS` id; never the seed org |
| `candidateSha` | the FINAL candidate's full SHA | the same |

Both: schema `vacilando.isolated_fixture_authority.v1`; store root resolved by the child as
`<os.userInfo().homedir>/.local/state/alloy-dev/gateway` (never `$HOME` / `ALLOY_RUNTIME_ROOT`); the
executor must run at that default root or the child refuses.

### File digests at the code commit (sha256, paths under `web/`)

```
298eaae8f595145b4914ce9b9cb75b1d41db06fbfc6da924537f2fb2fa35f222  scripts/qa/financialsFixtureAuthority.mjs
2652e75a54904751ea62362765c8dfbdd4640bdd7da2cfbec6fc3abec387fe1b  scripts/qa/financialsIsolatedTests.mjs
79576b2371f31446d984a07c470ce5f4eec154f3f37014d1d0184ad8c91cff9b  scripts/qa/financialsIsolatedBinding.mjs
5d9fa6f5a3722fb1a7dc26c56bffa176e5f52a8ba168f393f4fb7f1eb87d2654  scripts/qa/financialsHistoricalDraftFixture.ts
b40cc9739216759a9af9e1dacbd2f126df49315154cd665f2f107864beeeca57  scripts/qa/financialsHistoricalDraftFixtureCore.ts
3328be9a367bee7fa14f16868f4088a66e7eb93f0a6d1cf9e1d51319e41a64cf  tests/harness/liveSuiteAuthority.mjs
4d50e205f3012864de3684ed1b92f2d5ee962ea628f4db8ca6228e158a684b10  tests/financials/live/catalogAddCharge.live.test.ts
f367f1154a9d88a6ffa04fecd375d37c3173fb33934e832200c89b6b058cd140  vitest.config.ts
5ce942715749bb53b71a26a73d11cfe56a3877118fa4a2cca3410da9f6c91e73  package.json
```

## What each program checks, before any client, credential read or live-suite import

One verifier (`financialsFixtureAuthority.mjs`), called with the program's own descriptor and the
operation from its own registered argv — neither from the environment. Each caller pins its program
after any option, so no option can substitute another. An unregistered program or operation is
refused before anything is read.

1. trusted store root (above);
2. `ALLOY_QA_AUTHORITY_FILE`'s real path directly in `<root>/vacilando/isolated-fixture/authority/`,
   named `<request_id>.*.json`;
3. `requests/<request_id>.json` `in_flight`, same `binding_digest`, naming this file, recorded sha256
   equal to the bytes read (env digest optional, must agree, never the origin);
4. schema; `issued_at <= now < expires_at`;
5. request / fixture / operation / QA run / environment / candidate / binding equal to the env;
6. fixture, operation, suite, npm script and pinned body from the program; candidate equal to HEAD;
7. org per the program's binding:
   - isolated tests — env org exactly the seed org, source `seed_manifest` (unchanged);
   - historical draft — source `persona`; the trusted `vacilando/qa-runs/runs.json` has the record's run
     `OPEN`, `target.kind = local`, `target.key` = the record's environment, binding `ALLOY_QA_PERSONA`,
     whose `org_key` is a `QA_ORGS` key whose id equals `ALLOY_CERT_FIXTURE_ORG_ID`; the seed org is
     refused. The verified id — not the env value — is passed to the core.

Admission: isolated authority admits only `tests/financials/live/catalogAddCharge.live.test.ts`; the
historical authority admits no live suite. The historical core has no org constant: every entry
refuses the seed org or a non-UUID (`fixture_org_unbound`) before its first read.

**Limits, stated.** Executor and child are the same OS user; nothing authenticates the issuer
cryptographically. A same-user rewrite of the executor's own store (request, record and QA-run ledger)
is accepted — tested as documented, not claimed as stopped. The authority record carries no persona:
the child verifies that the asserted persona is bound by the run and maps to the asserted org, not
that it is the persona the executor chose among several the run binds (the binding digest covers it,
but the child cannot recompute it). A741 `QA_ORGS` has two orgs (`qa_shared`, `qa_secondary`); both are
accepted when the ledger binds them, as A741's `resolveFixtureOrg` does.

## Evidence

| Check | Result |
|---|---|
| Focused: `qaFixtureAuthority.test.ts`, `qaIsolatedFinancialsFixtures.test.ts`, `liveSuiteAuthority.test.ts` | 192/192 (164 before + 28 new) |
| Focused-safe list (`FOCUSED-SAFE-TEST-LIST.txt`, broker) | 41 files / 920 tests passed; live suites EXCLUDED |
| `typecheck`, `typecheck:tests` (broker) | passed |
| eslint, changed files | no new problems (11 `no-explicit-any` all pre-exist at the parent) |
| Planted: historical `main` skips the authority check | 17 tests failed; restored byte-identical |
| Planted: persona org trusted from env | 10 tests failed; restored byte-identical |
| Production build | one, through the serialized broker, on the final candidate — result in the run report |

Historical refusals proven with `createClient` call count 0: forged env (complete binding + asserted
persona org, no record), no trusted root, record outside the store, replay (completed request), verify
authority for `--reset`, isolated-tests record for the historical program, wrong candidate, and org
cases — seed org as `seed_manifest`, seed org as `persona`, no org, `qa_secondary` against a
`qa_shared` ledger, unbound persona, unregistered `org_key`, run not OPEN, run on another environment,
hosted run, no ledger. A verified run writes only rows with the persona org; with only the seed org
present it reports `certification_org_absent` and writes nothing.

## Gates that remain

- **Installation:** the installed toolkit (`b3c80db2e9aa`) has no `verifyFixtureAuthority` and writes no
  authority record; until A741 is installed every real run of either program refuses
  `fixture_authority_absent` (fail-closed).
- **Platform pin:** the platform owner registers the final candidate SHA and the two script digests
  above before activation; any later product commit invalidates `candidateSha`.
- **QA run:** the historical fixture needs an OPEN local QA run whose ledger binds a persona with a
  QA org, and that org must exist in the certenv (else `certification_org_absent`, nothing written).
- **Promotion:** checkpoint, Director release, one PR, CI, merge — not started.
- **Acceptance:** a real isolated execution of either program under installed A741 — not done, not claimed.
