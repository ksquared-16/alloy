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

## 4. Census plan — count-only, fixed identities (NOT executed)

**Why it cannot run today.** Installed `trusted-host-action-registry` `database.read_census`
(lines ~483–506) accepts only `DEFAULT_TARGET` = `alloy_deployed_primary` (hosted staging) and
refuses any other target. `trusted-host-database-target` does resolve `certification_local`
(`alloy-cert@127.0.0.1:54422`), but that resolver serves migration / ledger operations, which must
not be repurposed for an audit.

**Registration request to HostCapacity.** A `database.read_census_certification_local` action, or a
`certification_local` target for `read_census`, with:
- the target pinned to `alloy-cert` on 54422, refusing any certenv or hosted URL;
- a READ ONLY transaction, rolled back;
- output limited to `question_id|kind|payload` with count payloads;
- validation that refuses row-valued projections;
- operator approval per run;
- a receipt recording the query hash, target fingerprint and measured-at time.

**Query.** `alloy-cert-incident-census.sql` (beside this file):

| id | question | what it can tell |
|---|---|---|
| q01–q05 | seed-org pricing terms, tuition events, their obligations, draft and non-draft tuition charges | what exists now in the cleanup's scope. Without a baseline, zero cannot distinguish "deleted" from "never existed". |
| q06, q07 | fixed agreements `77000000-…a1`, `fc500000-…a0001` | whether the suites' fixed identities remain |
| q08 | payments keyed `live-1793375%` | survivors of the payment suite's own writes |
| q09 | per-table rows created inside 15:52:13–15:52:33Z | surviving inserts from the window |
| q10, q11 | `pg_stat_user_tables` `n_tup_ins/n_tup_del/n_live_tup` and the stats reset time | catalog evidence of cumulative deletes. Not attributable to the window by itself. |

**Baseline limits, stated.** No committed fixture inserts `enrollment_pricing_terms`:
`financials-demo-tenant.sql` and `thread-8c-collection-subject.sql` only delete them. So the seed
org's pre-incident pricing terms, tuition lineage and draft tuition charges came from other flows or
lanes, and no file in this repository reconstructs them. The only possible pre-incident baselines are
external:
- other lanes' QA or census evidence dated before 15:52Z;
- a prior `pg_stat` reading;
- a backup or snapshot of the alloy-cert volume, if one exists.

## 5. Remedy plan — reversible and bounded (PLAN ONLY; nothing done)

1. **Hold.** Keep the explicit alloy-cert LIVE HOLD in place. No lane runs live suites or certification
   against alloy-cert until steps 2–4 are decided. The runner guard above enforces this for vitest.
2. **Snapshot before any change.** A governed, read-only export of the affected tables for the seed
   org (`enrollment_pricing_terms`, `consumption_events` `cev:tuition:%`, their `resolved_obligations`,
   tuition `charges`, the two fixed agreements), stored outside the repository with checksums. It is
   the rollback point for step 4.
3. **Census** (§4) after registration and approval. Compare against any external baseline found.
   Report present, absent and unknown per question.
4. **Decide, operator-owned, one of:**
   - (a) accept and record as-is, if no dependent lane needs the deleted kinds;
   - (b) re-create only what an owning lane can specify exactly, through that lane's own domain
     operations or fixtures (idempotent, fixed ids), bounded to the seed org and the listed tables,
     with before/after census counts and the step-2 snapshot as rollback;
   - (c) a full `alloy-cert` rebuild via `certification/alloy-certify` under the shared-stack lease
     model. This is destructive to every lane's local state and needs all holders' agreement.

   Never replay the suites' cleanup, and never delete to "tidy up": posted money is immutable by
   design.
5. **Close** with the census receipt, the decision, and an updated LIVE HOLD state.
