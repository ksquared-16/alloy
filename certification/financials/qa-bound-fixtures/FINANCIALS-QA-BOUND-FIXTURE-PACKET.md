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

## 2. HostCapacity handoff — two registry corrections and one binding gap BLOCK authorized live execution

Owner: the HostCapacity / isolated-executor lane (its latest run completed; earlier WAITING/FAILED
labels were stale). File: installed toolkit `lib/certification-fixture.mjs`, `CERTIFICATION_FIXTURES`.
**Not changed by this lane.** Until H1 and H2 are resolved, a live run cannot rely on the registry's
contract for these fixtures. Until H3 is resolved, no browser persona proof can be built on them.

**H1 — `financials_isolated_tests.run` is wrong: `mutating: false`.**
- Fact: the pinned suite `web/tests/financials/live/catalogAddCharge.live.test.ts` (on this candidate)
  upserts customers/locations/persons/members/agreements/policies/GL accounts/mappings/revenue
  categories/products/a template, writes catalog drafts, and **posts one catalog charge with its
  journal entry** (`postChildcareCharge`). Its `afterAll` removes drafts, products and the template;
  the posted charge and journal entry are immutable (the DB trigger
  `enforce_childcare_charge_immutability` refuses DELETE of a non-draft childcare charge) and remain
  in the certenv until it is retired.
- Required: `run: Object.freeze({ args: [], mutating: true })`. The run is admissible only against an
  isolated environment that is retired (or rebuilt) afterwards; any consumer that treats a
  non-mutating run as repeatable/read-only must not schedule it that way.

**H2 — `financials_historical_draft.count` must be registered with read-only census semantics.**
- Fact: the product script implements `--count` → exactly one line `census count=<n>` (n = fixture
  rows by fixed id and ownership key + fixture drafts + the household's open billing periods). It is
  read-only, prints no other structured line, and exits 3 (identity conflict, no census line) if a
  non-fixture row sits at a fixture id. Today the executor refuses `count`
  (`operation_not_allowlisted`), so reset → 0 has no fresh census.
- Required: `count: Object.freeze({ args: ["--count"], mutating: false, census: true })` in
  `financials_historical_draft.operations`, so `parseIsolatedFixtureOutput` demands the census line
  (`census_not_measured` otherwise) and `censusIsFresh` can bind it to the run, environment and
  candidate, measured after the reset.
- The product binding (`web/scripts/qa/financialsIsolatedBinding.mjs`) already accepts exactly
  `count → ["--count"]`. No other operation or argv was added.

**H3 — fixture org and browser persona org are different tenants; the executor passes no org or origin.**
- Fact (read-only, installed toolkit `b3c80db2e9aa`): every `bp_v2` persona (`admin`, `director`,
  `restricted_operator`, `no_finance_operator`) binds org `qa_shared` =
  `4acc9386-c485-486f-aa1f-05d83499d142` (`lib/qa-plan-registry.mjs`). The historical draft fixture,
  like every financials live suite, writes into the seed certification org
  `00000000-0000-4000-8000-000000000001` (`IDS`/`ORG` in `financialsHistoricalDraftFixtureCore.ts`).
- Fact: `isolatedSuiteTarget` resolves `persona.org_key`, but `fixtureChildEnv` passes only
  `ALLOY_QA_RUN_ID`, `ALLOY_QA_ENVIRONMENT_ID`, `ALLOY_QA_PERSONA`, `ALLOY_QA_IDENTITY_KEY`,
  `ALLOY_QA_SESSION_FILE` and the namespace/fixture/operation. No authoritative org id and no preview
  origin reach the fixture.
- Consequence: the two proofs are distinct and neither substitutes for the other.
  - **Domain-service fixture authority** (these scripts, service credential, seed org) proves the
    domain rules on real Postgres.
  - **Browser persona proof** (a managed session as a `qa_shared` persona) cannot see seed-org
    fixture rows.
  
  Nothing here widens a grant, adds a membership, or claims a browser persona saw fixture data.
- Required before a browser proof can use this fixture (owner: HostCapacity with the product owner):
  1. The executor passes the persona's authoritative org id (resolved from `persona.org_key`, e.g.
     `ALLOY_QA_ORG_ID`) and the preview origin bound to the certenv.
  2. The product fixture is then changed to take its org from that binding, refusing when it is
     absent or differs. It keeps the seed org only for domain-service runs, and says which it used.
     That change is NOT made in this candidate.
  3. Alternatively, a governed, audited grant decision for a `qa_shared` persona on the seed
     org. That is an operator decision, not a fixture side effect.
  
  Until then, browser acceptance of the historical draft is out of reach by construction.

**H4 — no verifiable operation authority exists for any live-suite run** (owner: A741,
`OPWORK_25AD3858DE4D_SPRINT_A741F0C6D2E9`).
- The runner guard (`web/tests/harness/liveSuiteAuthority.mjs`) is accepted **only as
  accidental-execution prevention**. It default-denies every live suite, and admits only the isolated
  executor's binding for `financials_isolated_tests`, and only its pinned suite. A shared-stack
  resource lease is not operation authority, so no shared-stack live suite can run.
- The isolated binding carries no expiry and no proof that the executor produced it.
- Required (A741): the executor passes a request id and binding digest that the child can verify
  against the executor's in-flight request record (read-only), so expiry and provenance become
  child-verifiable. Any shared-stack live run needs a governed per-run operation grant that a runner
  can verify; none exists.

**H5 — no installed census action can reach the shared alloy-cert stack** (owner: A741).
- `database.read_census` accepts only `alloy_deployed_primary`.
- A741 is drafting `vacilando.shared_cert_count_census.v1`
  (`lib/shared-cert-census-contract.mjs`). It is uncommitted and not installed, and registers only
  the superseded v1 query.
- Required: register `financials_alloy_cert_incident_20261030_v2` exactly as in
  `certification/financials/incidents/2026-10-30-alloy-cert-live-suites/CENSUS-V2-REQUEST-PACKET.json`,
  then release and install. Until then the packet is a dependency, not a filed request.

Also noted, no change requested: the persona is bound and checked, but neither script acts as it.
Both use the certenv service credential the executor injects, as every financials live suite does.

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
| run | `ok`, `tests passed=7 failed=0`, `✓ catalogAddCharge.live#1…#7 passed` | any skipped/pending/todo test, a pinned file reporting nothing, zero passes, exit ≠ 0. **A suite that skipped itself is reported as a failure, never as proof** (vitest itself exits 0 when it skips) |
| reset | `ok`, `✓ reset complete: removed <n> of <n>`, `reset namespace=financials-cert.alloy.invalid removed=<n>` with n ≤ 50 | any refusal (removed=0, §6); `reset PARTIAL … removed=<n> of <total>` (exit 1 — the exact count is recorded, cleanup is not claimed); `reset_unbounded` if n > 50; `reset_unreported` after `unexpected_error` |
| count | fresh `census count=0`, measured after reset, same run/environment/candidate | replayed or unmeasured census; count > 0 |

## 5. Output contract — codes, not backend text (proven locally with a planted sentinel)

Database, process and report text can carry row values or credentials, so neither script ever prints
one. Output is: the binding line (ids, host:port); fixture ids; ✓/✗ checks built from fixed text,
counts and constants; stable codes; and the executor's structured lines.

| path | printed instead of the raw text |
|---|---|
| read failure (error or throw) | `read_failed table=<table> [sqlstate=<5 chars>]` |
| seed insert failure | `seed_failed table=<table> [sqlstate=…] seeded_before_failure=<n>` |
| product draft write failure | `draft_write_failed [reason=<product code, e.g. db_error>]` / `draft_not_written status=<s> [reason=<token>]` |
| delete failure | `reset PARTIAL: delete_failed table=<table> [sqlstate=…] removed=<n> of <total> — the fixture is NOT fully removed` |
| client creation / anything else | `<op> failed: unexpected_error` (and no `reset` line it could not stand behind) |
| isolated suite tests | `✓/✗ catalogAddCharge.live#<ordinal> passed|failed|not_run` — titles, failure messages and suite messages are never printed |
| isolated suite problems | `vitest_report_absent`, `vitest_exit_nonzero code=<n>`, `tests_not_run count=<n>`, `tests_failed count=<n>`, `no_test_passed`, `pinned_file_reported_nothing file=<stem>`, `unpinned_file_ran count=<n>`, `runner_error` |

The vitest child's stdout and stderr are discarded, not captured. Only its JSON report (in the OS temp
dir, removed afterwards) and its exit code are read. Sanitized output was checked against the
installed `parseIsolatedFixtureOutput`: complete and partial reset lines parse within the namespace and
limit, a partial reset fails on exit ≠ 0 with its exact `removed`, an `unexpected_error` reset reads
as `reset_unreported`, and the tests line parses.

## 6. Reset semantics

- **Preflight, before the first delete:** each fixture row is matched by id and ownership key. Reset
  refuses if there is any posted/void charge on the fixture's sources, any use of the fixture template
  by another source, any payment or journal entry on the household, or any closed period. It also
  refuses on a draft on the fixture agreement written from another template, on any row that hangs off
  a fixture row through an `ON DELETE CASCADE` FK, and on any location/member/policy/agreement under
  the household that is not the fixture's. Those two checks together cover all 48 CASCADE edges into
  fixture tables found in `supabase/migrations`: 45 in `CASCADE_DEPENDENTS`, plus the 3 owned-child
  edges (`locations`, `customer_members` and `financial_policies` → `customers`), checked as foreign
  siblings. It also refuses more than 50 rows. Every refusal removes nothing and reports `removed=0`.
- **At every delete:** the filter is org + id + the row's ownership key (drafts additionally
  `status=draft`, fixture agreement, fixture template; periods `status=open`, fixture household). The
  delete must return exactly the planned ids, otherwise `identity_changed_during_reset` stops the
  reset. The ledger is re-measured after the drafts go and before the household's periods and rows
  (`ledger_appeared_during_reset`).
- **Partial:** any stop after a delete reports `reset PARTIAL … removed=<n> of <total>` with exit 1.
  `n` equals the rows actually removed (tested against the census before and after). Only a complete
  run prints `reset complete: removed <n> of <n>`.

## 7. Local schema validation (supabase/migrations, no live read)

All 550 migrations were replayed for the fixture's tables (CREATE TABLE, ADD/DROP/ALTER COLUMN, ADD
CONSTRAINT, CREATE UNIQUE INDEX, triggers):

- Every column the fixture writes or filters on exists on all 11 written tables and on `charges`,
  `financial_billing_periods`, `payments` and `financial_journal_entries`. None is dropped. Every NOT
  NULL column without a default is written (`charges.charge_type/currency_code` are written by
  `writeTemplateDraftCharge`).
- Check constraints are satisfied: `locations.location_type='site'`; agreement `status='active'` and
  `source_key` defaulted; `financial_policies` `scope_type='customer'` with `customer_id` set and
  location/service/rate_plan null (`financial_policies_scope_shape`); `billing_calendar` and
  `posting_review` are allowed policy types; `gl_accounts.type='revenue'`; the template's `fee`,
  `manual`, `fixed` + amount, `now` and `immediate` are allowed, and `amount_shape` holds.
- Unique keys: `commercial_revenue_categories (org_id, label)` was not covered by the first version.
  It is now an ambiguity probe, along with GL code, mapping key and the reserved email. No unique
  index on the other fixture tables conflicts with fixed ids.
- Foreign keys: inserts are ordered parent-first; deletes run in reverse (charges → open periods →
  template → product → revenue category → mapping → GL account → policies → agreement → member →
  person → location → household). This respects every RESTRICT/NO ACTION edge found:
  agreement→member, agreement→location, mapping→GL account, period→customer.
- Triggers: no AFTER INSERT trigger on a fixture table creates dependent rows, so a CASCADE dependent
  present at reset time is by definition not the fixture's (hence the refusal). BEFORE triggers
  relevant to the fixture: customer record numbering, policy scope validation, location hierarchy
  validation, member delete under an enrollment journey (none exists for the fixture), and
  childcare-charge immutability (blocks DELETE of non-draft charges, a second layer under reset's
  ledger guard).
- Not provable locally: RLS (service role bypasses it), trigger bodies' runtime behaviour on this
  exact data, and the certenv's applied migration head. The first live `ensure` is the proof of those.

## 8. Failure modes that happen before any IO (proven locally)

Both scripts judge the binding before anything else and exit 2 without spawning a process or creating
a client when any of these holds: production/Vercel runtime; a fixture, operation or namespace other
than the registered one; an argv other than the registered vector; absent or malformed
`ALLOY_QA_RUN_ID`, `ALLOY_QA_ENVIRONMENT_ID` or `ALLOY_QA_PERSONA`; `SUPABASE_URL` absent,
non-loopback, or outside 56100–56299 (hosted projects, alloy-cert 54421, default 54321);
`NEXT_PUBLIC_SUPABASE_URL` or `CERT_SUPABASE_URL` disagreeing with the bound target; `DATABASE_URL`
outside the band (alloy-cert DB 54422); or the service credential absent. A refusal names the
variable and never its value.

## 9. Live proof gates still open

1. Steps 1–5 against a real certenv, after H1 and H2 are resolved. Column, constraint and FK shape is
   validated against local migrations (§7). Runtime trigger behaviour, RLS-independent writes and the
   certenv's migration head are proven only by the first live `ensure`.
2. Billing-period materialization for the fixture household on 2026-03-16 in that environment (the
   rows reset removes are counted, not assumed).
3. HostCapacity H1 (mutating flag), H2 (census registration), H3 (org / preview-origin binding),
   H4 (verifiable operation authority for live runs) and H5 (certification_local census), §2.
4. Integrated sprint checkpoint: full Tier 1 on the exact integrated tree plus ONE production build
   (`build_sensitive`: web/package.json changed — scripts only, no dependency change).

## 10. Baseline comparison — the two runtime gate suites, base vs candidate

Measured 2026-10-30 through the broker (`vac run command`, serialized). Each tree was an exact
`git archive` export of `web/` under `web/.vac-validation/baseline-probe/` (a seat-artifact path),
run with that tree's own vitest config, so `@/` resolved inside the export. Dependencies came from
the lane's `web/node_modules`; `package-lock.json`, `vitest.config.ts` and `tsconfig.json` are
byte-identical between the commits. The probe was pinned: every report path lies inside its own
export, and the candidate export holds the shared GL read (`glConfigP`) where the base export
does not.

| tree | commit | passed | failed | skipped |
|---|---|---|---|---|
| base | `4272e85dc8fbf552cfa21444c57272987eb06efd` | 30 | 9 | 1 |
| candidate | `80c1608d3c1547f86ce7dbcd6b4774c622959598` | 30 | 9 | 1 |

**The same 9 test IDs fail at base and at candidate.** Eight have an identical assertion message.
The ninth (`financialsBuildSerialization > the concurrency was not bought with extra database work >
THE GATE: the query multiset is exactly what it was before the repair`) fails at both, with a
different received multiset.

- Inherited, proven: both read-count gates (`… query multiset is exactly …` and
  `financialsPaymentViewsConcurrency > the query multiset is unchanged on the success path > THE GATE:
  the same reads, the same number of them`) are already red at base. Base itself reads a set far from
  the pinned pre-repair multiset (`financials_account_fact_bundle`, `payment_holds`,
  `payment_autopay_arrangements`, `financial_policies`, `customer_persons ×2`, …).
- Sprint contribution, measured from the full received multisets:
  - At `6a4266076`, five reads were added: `child_enrollment_agreements +1`,
    `commercial_products +1`, `commercial_revenue_categories +1`, and `gl_account_mappings` and
    `gl_accounts` each 1→2.
  - The two GL re-reads were redundant. `readCatalogChargeConfig` issued its own
    `loadGlConfigBundle` beside the card's. **Fixed in `80c1608d3`:** one shared read, each consumer
    keeping its failure meaning.
  - At `80c1608d3`, the sprint delta at both gates is exactly `child_enrollment_agreements 0→1,
    commercial_products 0→1, commercial_revenue_categories 0→1`. That is the Catalog itself and the
    agreement sites it is judged against. One first-wave read each, not N+1.
  - The agreement-sites read is not available elsewhere on the card path: the
    `financials_account_fact_bundle` agreements projection carries no `site_location_id`
    (`20261025120000`), and the card does not call `financials_account_subject_facts`.
- The other 7 failures are byte-identical at base and candidate, so they are not this sprint's:
  - `outstandingCents 29000 vs 0` (×2);
  - `unmeasured await: resolveOperatingDay`;
  - collectibility-loop source pins (×2);
  - payment-views failure contract (`payer_split` lacks `payments`);
  - payment-id merge source pin.

  They are out of this sprint's scope and were not repaired.
- The two read-count gates were not edited. Their pinned expectation predates the fact bundle, so
  updating them is baseline repair, not this sprint's. They stay red. New sprint-owned gates in
  `tests/financials/catalogManualAddCharge.test.ts` pin the catalog's reads instead: each of the five
  tables is read exactly once by the card, and a failed GL read leaves the catalog unavailable.

## 11. Scope ledger for this candidate

- Product work: catalog Add Charge slices (`2e63aea1a` … `55995004f`), QA-bound fixture scripts and
  tests (`f2968d4c8`, `ce0b450ae`, `d12aaa0b9`), and the shared GL read (`80c1608d3`).
- **Evidence-only addition, not product work: `6a4266076`.** It commits seven W7 evidence files
  byte-identical (sha256 verified before and after), which were present but untracked beside tracked
  siblings of the same kind: three deployed screenshots, the attribution-charge census query and
  result, and two preqa census results. Nothing was edited, moved or deleted. It exists so the broker
  sees a clean tree and can store exact-candidate receipts.
- **Incident, 2026-10-30 15:52:13–15:52:32Z (`req_1793375528498836_49075`). CORRECTED;** full
  record in `certification/financials/incidents/2026-10-30-alloy-cert-live-suites/INCIDENT-AND-CENSUS-PLAN.md`.
  A grep-built test list ran live suites against the shared `alloy-cert` stack during a turn that
  forbade database access. `tuitionGeneration.live` runs an org-wide seed-org `cleanup()` in
  `beforeAll` and `afterAll`: every pricing term, every tuition consumption event and its
  obligations, every draft tuition charge, and its fixed agreement. Pre-existing rows may therefore
  have been **deleted**, not only left behind. Its four failures stem from a missing billing calendar;
  the six Payment/Correction cases failed at the initial charge insert on
  `charges_billing_period_childcare_chk`. No cleanup, census or verifying read was performed, and none
  is claimed. Prevention is the live-suite runner guard (`web/tests/harness/liveSuiteAuthority.mjs`).
