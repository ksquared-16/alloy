# Incident: Financials live suites ran against the shared alloy-cert stack (2026-10-30)

Lane `lane_b77b3cbb5840`, sprint `OPWORK_B77B3CBB5840_SPRINT_386D603E60C7`. Prepared locally from
the suites' source, the preserved runner output and installed toolkit code. **No database was read,
written, censused or cleaned to prepare this.** Nothing here claims that data was not deleted or that
anything was restored.

## 1. What ran

- Broker request `req_1793375528498836_49075`, claim `vcl_mvv5hk73_1` (`lane_id: null`, so the broker
  did not attribute it to the lane). Window 2026-10-30T15:52:13Z → 15:52:32Z. Candidate tree
  `59c295ee378ec56f`, a working tree on commit `6a4266076`.
- Cause: a "regression set" was built with `grep -rl … tests`. It matched live suites, which load
  `web/.env.certification.local` at import and target the shared `alloy-cert` stack (API
  127.0.0.1:54421) with a service-role client.
- Live suites in the invocation:

| suite | result | what its code does on that stack |
|---|---|---|
| `tuitionGeneration.live` | 4 failed | **`cleanup()` in `beforeAll`, and in `afterAll` unless `CERT_KEEP=1`** (not set). Deletes, in the seed org `00000000-0000-4000-8000-000000000001`: **every** `enrollment_pricing_terms` row, every `consumption_events` row with `idempotency_key like 'cev:tuition:%'` and their `resolved_obligations`, **every draft tuition charge**, and agreement `77000000-0000-4000-8000-0000000000a1`. `beforeAll` then inserted that agreement. Two tests failed on "This household has no usable billing calendar"; two failed downstream (`expected [] to have a length of 1`, because no draft was generated). The four failures stem from a missing billing calendar, not the charges constraint. |
| `paymentApplication.live` | 3 failed | Each case failed at its initial charge insert on `charges_billing_period_childcare_chk`. Teardown is id-scoped to rows the suite wrote. |
| `chargeCorrectionLineage.live` | 3 failed | Each case failed at its initial charge insert on `charges_billing_period_childcare_chk`. Teardown deletes only rows the suite wrote. |
| `financialsCardPayments.live` | 8 skipped | `beforeAll` failed on the missing billing calendar before posting. |
| `accountCohortParity.live`, `businessProcesses/billingDueParity.live` | ran (reads) | No write calls in source. |

**Consequence:** pre-existing seed-org pricing terms, tuition consumption lineage and draft tuition
charges may have been **deleted**, by two org-wide cleanups. Rows may also remain from writes that
succeeded before a failure. Neither is proven either way.

## 2. Preserved evidence (not committed; untracked, read-only, 0400)

`<worktree>/.vac-validation/incident-req_1793375528498836_49075/`:

```
286f2a08382ca50ba84198c3bc52c12d7cd52b7479d39e39525104d206e00665  vitest-output.full.log
310486c53ec0985e16b852da7339427290b33838e6c31cdcf63907328bb42107  validate.log.excerpt.txt
452b6f911c55886b44e57876d8437fead3679c188d2c39c7d436f7a37508d6aa  validate.log.snapshot
e633cc61eb311007da9b2577c46904c5c116bda3cabdaef5e0a31cbef9a35cc6  validation-claims.excerpt.json
0565eb8372b07ff1f722a28cf4a73805520415edd48258a81d4e5069c6f1d1a8  runs.excerpt.json
f7016098c9cded3d9cc4cbf3cc4cfafd94479896950658a29560a042148323d2  ecv2-session-paste.txt
```

The originals remain in place: `/tmp/finqa-vmset.log`, the gateway `logs/validate.log`,
`vacilando/validation-claims.json` and `execution-core-v2/runs.json`. They are kept out of git
because the runner output can carry row values.

## 3. Prevention (this candidate)

`web/vitest.config.ts` + `web/tests/harness/liveSuiteAuthority.mjs` exclude every live suite before
import (`**/*.live.test.*` and `tests/**/live/**`), by default and by explicit filename. The only
admission is the governed isolated binding for `financials_isolated_tests`, and only its pinned
`catalogAddCharge.live`. No shared-stack live suite is ever admitted: not by a resource lease, a key,
an env file, a flag or a running process. Proven by `web/tests/harness/liveSuiteAuthority.test.ts`
(canaries, synthetic env, no real live suite executed). The lane's focused validation uses the
explicit list `certification/financials/qa-bound-fixtures/FOCUSED-SAFE-TEST-LIST.txt`.

## 4. Census — v2, exact incident identities only (NOT executed)

**Use v2.** `alloy-cert-incident-census.v2.sql` (sha256
`dd5dd815e55de1483774b27d0303c4fd58294b4aacc100a03b2d3c39bacea421`; executed-SQL sha256
`31ce283d585498b6fd4cbd9aede2c33dbba32c584d7a79da28e53e45a8e4ab45`; 27 statements) asks only about
fixed identities, with the org pinned. Each constant comes from the suites' own source or from the
preserved runner output:
- the tuition agreement `77000000-…00a1`;
- the terms `…00b1` / `…00b2`;
- the two exact tuition event keys `cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01` / `:2322-02`;
- the spine agreement `fc500000-…0a0001` and household `fc500000-…0c0001`.

Dependencies are joined only through those exact identities. Every question splits rows into
`_before`, `_during` and `_after`, relative to the claim window 15:52:11.391Z–15:52:32.859Z:
- `_before`: pre-existing, for example the spine fixture rows;
- `_during`: attributable to the window;
- `_after`: later writers.

**Not asked, because the identity is not derivable:**
- the payment suite's run key `live-<Date.now()>`;
- the tuition household and assignment rows;
- every row the tuition cleanup could have deleted org-wide.

**Current absence never proves deletion.**

**v1 is superseded but kept byte-identical.** `alloy-cert-incident-census.sql` (sha256 `6a3a03bd…26aa`)
asked org-wide, prefix, whole-org window and `pg_stat` questions. A draft HostCapacity contract pins
its bytes, so it is not edited. That registration should be withdrawn in favour of v2.

**Contract owner and status.** HostCapacity objective `OPWORK_25AD3858DE4D_SPRINT_A741F0C6D2E9`.
Its contract `vacilando.shared_cert_count_census.v1` (`lib/shared-cert-census-contract.mjs`: target
`alloy_cert` → `alloy-cert@127.0.0.1:54422`, class `shared_local_certification`, hash-pinned file,
read-only frame, `qNN_…|count|<int>` output) exists only **uncommitted** in its worktree. The
installed toolkit and the branch tip are both `b3c80db2`, without it, and the draft registers v1
only. **Dependency, not a payload:** `CENSUS-V2-REQUEST-PACKET.json` holds the proposed v2
registration, the exact request inputs, the expected hashes and a per-question interpretation. It is
marked `DEPENDENCY_NOT_INSTALLED` and is filed with nothing.

Read-only checks done locally:
- the v2 file passes the draft's frame, label and per-statement checks (27 statements, none refused);
- the installed `validateReadOnlySql` accepts every statement.

The installed toolkit lacks the `stripCommentsAndStrings` export the contract needs.

## 5. What remains an operator decision (nothing here is approved or planned for execution)

- Run the v2 census, once the contract is registered and installed and you approve the request.
- Then, separately, whether any repair is wanted at all. No restoration is proposed by this lane:
  counts cannot show what the org-wide cleanup removed, and only an owning lane with an exact
  specification, or an outside baseline, could justify one.
- The suites' cleanup is never replayed, and nothing is deleted to "tidy up". The alloy-cert LIVE
  HOLD stays as you set it.
