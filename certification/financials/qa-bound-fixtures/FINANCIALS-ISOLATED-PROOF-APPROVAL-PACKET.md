# Financials isolated proof — approval packet v1 (prepared, NOT approved, NOT executed)

Sprint `OPWORK_B77B3CBB5840_SPRINT_386D603E60C7` · lane `lane_b77b3cbb5840` · installed toolkit `20261031-eeaa6dac6860`
(source `eeaa6dac68600dee8862962decd42b60169523b9`, Gateway runtime `eeaa6dac6860`). Prepared 2026-10-31 from metadata
and source only. No database connection, credential read, test, live suite, resource, access change, cleanup,
publication or merge was done to prepare it. **No target is authorized by this file.**

## 0. Decision

**Product code: READY under the installed contract.** No local code change is required to execute the registered
operations: the registry issues authority v1 to both Financials fixtures, and the product verifier is v1.

**Execution: NOT READY.** Four governed environment approvals are required, and none exists (§3). Three proof
items are **not ready**, and executing this packet does not prove them (§7).

The shared alloy-cert hold stays as set. It stops shared-stack live suites, and Financials refuses that stack by
construction (§2). It is not a stop on this isolated proof.

The legacy alloy-cert census and disposition (`gar_7518908144d8d3` / `tha_4d389b4074b7b0`, receipt in
`incidents/2026-10-30-alloy-cert-live-suites/`) are complete and preserved. They are not a prerequisite here.

## 1. Owner and candidate

| | |
|---|---|
| Financials owner | `lane_b77b3cbb5840` — the only lane named Financials in `lanes/lanes.json` (ACTIVE); one worktree `/Users/vacilando/Code/alloy-worktrees/financials` |
| Final code candidate (preserved) | `061e164b558cfa0755c41275b38886c549298ba6` |
| Code identity | `web/` tree `c6d5b037bc14…`, `supabase/` tree `c72b74ca103d…`, byte-identical at `77c0d0e7a6ff…`, `061e164b5`, `fc5d5ed95` and the commit adding this file |
| Execution candidate `C` | worktree HEAD at execution. The executor refuses unless HEAD is exactly `C` and the tracked tree is clean. `C` is the commit that adds this file (documentation-only), unless a later documentation-only commit lands first; then re-check `git diff --quiet 77c0d0e7a C -- web supabase`. Moving HEAD back to `061e164b5` would need a branch rewrite or a detached HEAD, and neither is used. |
| Base | merge-base `origin/staging` `4272e85dc8fb…`. `origin/staging` is now `fd30322a8dc6…`, 18 commits ahead. **Neither the candidate nor those 18 commits change `supabase/`**, so a certenv built on today's tip has the candidate's migrations and seed. |
| Script digests (unchanged, re-measured) | `test:qa:financials-isolated` `78453bfc…c169` · `dev:qa:financials-historical-draft-fixture` `07f838cf…e87e8` |
| Dependencies | `web/node_modules` present; the lockfile is unchanged vs merge-base (a preview requires its lockfile to be byte-identical to the worktree's) |

## 2. Installed contract vs stale packet claims

| Claim (source) | Installed `eeaa6dac` | Status |
|---|---|---|
| H1 `financials_isolated_tests.run` `mutating:false` (FIXTURE-PACKET §2) | `run: { args: [], mutating: true }` (QAFX-FIN-MUT-01) | **repaired**, stale |
| H2 `count` not registered | `count: { args:["--count"], mutating:false, census:true }` (QAFX-FIN-CENSUS-01) | **repaired**, stale |
| H3 no org / preview passed | historical: `fixture_org: PERSONA_ORG`, `preview: true`; child env carries `ALLOY_CERT_FIXTURE_ORG_ID/_SOURCE`, `ALLOY_QA_PREVIEW_ORIGIN`, `ALLOY_QA_SESSION_ORIGIN/_SHA256`; isolated tests: `SEED_ORG` proven from the certenv's recorded seed manifest | **repaired** (product side in `77c0d0e7a`), stale |
| H4 no verifiable authority; proof packet: "installed `b3c80db2` has no `verifyFixtureAuthority`" | v1 authority record + in-flight request provenance issued per execution | **repaired**, stale |
| H5 no census reaches alloy-cert | shared census contract; executed once | **repaired and consumed**, stale |
| Proof packet A741 pins at `bab9c927` | `qa-plan-registry` and `qa-run-ledger` unchanged. `isolated-fixture-execution` (`11d727d3…`), `certification-fixture` (`8c79a87e…`) and `qa-isolated-suite-target` (`9a496732…`) changed. Diff `bab9c92..eeaa6dac`: the v1 check was refactored into `verifyAuthorityCore` with identical v1 steps and refusals; v2 was added behind `authority_contract: "v2"`; the registry only added entries; the suite list only added `surfaces`. | **pin table stale; v1 contract unchanged** — re-pin, no code change |

**Actual incompatibilities: none for execution under v1.** The product binding agrees with the installed values:
port band 56100–56299, `QA_ORGS` ids `qa_shared`/`qa_secondary`, org sources `seed_manifest`/`persona`,
schema `vacilando.isolated_fixture_authority.v1`, and store root `<passwd home>/.local/state/alloy-dev/gateway`.

The product binding refuses shared alloy-cert: API 54421 and DB 54422 are outside the band.

### v2 alignment — minimal and exact

- **Now: none, and adopting v2 now would break execution.** The executor issues v2 only to entries registered
  `authority_contract: "v2"`; Financials entries are v1. A v2-only product child refuses every v1 record
  (`fixture_authority_org_unbound`). That is Enrollment's current state at `80eb7446656f`, where the registry also
  issues it v1.
- **The v1 org gap is already closed product-side for Financials.**
  - Isolated tests accept only the registry seed org.
  - The historical draft accepts only the org the executor's own QA-run ledger binds to the persona, never the
    seed org.
- **The v1 gaps that remain** (stated, accepted under v1):
  - no database-identity binding of `DATABASE_URL`/`SUPABASE_URL` to *this* certenv beyond loopback and band;
  - no target-hold disposition.
- **To move later** (platform first, then product). Not authorized, not started:
  1. The platform registers both Financials entries `authority_contract: "v2"` with pins. Today's pin model
     requires `pins.sql.{path,sha256}` (`pin_unregistered` otherwise). Financials fixtures run TypeScript service
     calls and have no SQL artifact, so **the v2 pin model needs a no-SQL variant**. That is a platform contract
     change.
  2. The product reuses Enrollment's generic `verifyIsolatedFixtureAuthorityV2` from
     `web/scripts/qa/isolatedFixtureAuthorityV2.mjs` (introduced in `80eb7446656f`, **not on `origin/staging`**)
     with two Financials program descriptors. It replaces only the v1 core in `financialsFixtureAuthority.mjs`
     and keeps the persona-ledger check. No second framework. It depends on Enrollment's merge.

## 3. Lane/host dependencies — the approvals this packet requests

Each step is a governed action under this lane's run, approved per action in Needs You. **No current grant
exists:** every lane grant in `governed-grants.json` is consumed or expired (latest expiry 2026-10-15). The lane
has no QA run, no certenv and no preview target.

| # | Governed action | Inputs (exact) | Allocation (never chosen by the lane) | Irreversible? |
|---|---|---|---|---|
| A1 | `environment.build_certification_baseline` | `repository: ksquared-16/alloy`, `baseBranch: staging`, `expectedBaseSha: <origin/staging tip at filing>` (must equal the tip or the action refuses `base_sha` drift) | next free 10-port block in 56100–56299 (6 of 20 in use: 56100–56150); default lease, renewable via `environment.renew_certification_lease` | creates a resource |
| A2 | `product.register_candidate_preview_target` | `worktree: /Users/vacilando/Code/alloy-worktrees/financials`, `reason` | a free port in 4410–4419 (4410–4413 held) | registration; releasable via `product.release_candidate_preview_target` |
| A3 | `product.activate_candidate_preview` | `target: <A2 key>`, `candidateSha: C`, `environmentId: <A1 id>`, `databaseMode: isolated` (Mode 2), `reason` | runs **one production build** (8192 MiB heap floor) of `C` from `git archive`; the worktree is untouched | retire via `product.retire_candidate_preview` |
| A4 | `environment.qa_run_open` | `plan: bp_v2`, `target: <A1 id>`, `expectedRepository: ksquared-16/alloy`, `expectedBaseSha: <A1 base>`, `expectedMigrationHead: <A1 head>` (lease ≤ 12 h, default 4) | creates QA orgs, identities and actor in the certenv (`ensureLocalStructure`, local only); binds personas; mints a verified session for `admin` | closed by `environment.qa_run_close` |
| R1 | `environment.qa_run_close` | `qaRunId` | — | removes access, signs out, deletes session files |
| R2 | `product.retire_candidate_preview` | `target`, `reason` | — | |
| R3 | `environment.retire_certification_environment` | `environmentId: <A1 id>` | — | **irreversible**: destroys the env and the retained posted charge (§5) |

**Plan choice (operator decision, not an access request).** No Financials QA plan is registered. `bp_v2` is the
only registered plan whose session-bearing personas are finance-capable `qa_shared` members (`admin`,
`director`).

This packet proposes `bp_v2` persona `admin` for both fixtures. The isolated-tests binding needs a bound persona
but does not act as it. Local certenvs are exempt from the hosted plan gates.

A Financials-owned plan would be a platform registry change; it is **not ready** and not required.

Credentials are env-only, built per child by the executor (`fixtureChildEnv`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, anon key, `DATABASE_URL`, and the QA binding. Nothing is inherited, nothing is
printed (secret suppressor + receipt scrub), and the lane never reads them.

## 4. Operations — exact sequence after A1–A4

```bash
V=/Users/vacilando/.local/share/alloy/toolkit/current/bin/vac
L=lane_b77b3cbb5840; Q=<A4 qar_…>; C=<HEAD sha40>; PERSONA=admin
HD=07f838cf008e519ab1096cd4baf0d2a6fea245ad1e6f6e8eb53655f103e287e8
IT=78453bfcd3d60c0757d800c64f42577265fc27ff458d48e03cc610b818f1c169
B="--lane $L --qa-run $Q --persona $PERSONA --candidate $C --json"
$V certify-fixture financials_historical_draft count  $B --script-sha256 $HD --request-id fin-v1-hd-count-before
$V certify-fixture financials_historical_draft ensure $B --script-sha256 $HD --request-id fin-v1-hd-ensure
$V certify-fixture financials_historical_draft verify $B --script-sha256 $HD --request-id fin-v1-hd-verify
#   → persona browser proof here (§6), while the draft exists
$V certify-fixture financials_isolated_tests   run    $B --script-sha256 $IT --request-id fin-v1-it-run
$V certify-fixture financials_historical_draft reset  $B --script-sha256 $HD --request-id fin-v1-hd-reset
$V certify-fixture financials_historical_draft count  $B --script-sha256 $HD --request-id fin-v1-hd-count-after
```

Each request id is used once; a reused id replays the old receipt and is never fresh.

### Synthetic scope and canonical calls

| Program | Org | Namespace / identities | Writes | Canonical service calls |
|---|---|---|---|---|
| historical draft | `qa_shared` `4acc9386-…d142` (persona, ledger-verified; seed org refused) | `financials-cert.alloy.invalid`; 12 fixed ids `fc0d0000-0000-4000-8000-…`: customer, site, person, member, agreement, 2 policies, GL account, mapping, revenue category, same-name Catalog product (9900), template `fincert_hist_registration` (7500) | 12 configuration rows (PostgREST inserts with an ownership key) + **1 draft** at service date 2026-03-16; never posts | `writeTemplateDraftCharge` (draft); verify reads back |
| isolated tests | seed `00000000-…0001` (proven from the certenv's recorded seed at its base) | per-run prefix `ca7a<4 hex>-0000-4000-8000-…`, labels `Catalog live … <run>` | 1 customer, 2 sites, 1 person, 1 member, 1 agreement, 2 policies, 3 GL accounts, 1 mapping, 3 revenue categories, 6 products, 1 template, an accounting period if none covers 2026-11-05; drafts; **1 posted charge (4200) + its journal entry** | `loadCatalogChargeOptions`, `previewTemplateCharge`, `writeTemplateDraftCharge`, `postChildcareCharge`, `resolveGlAccountForMappingKey` |

**No raw SQL posting.** No SQL artifact is executed; posting happens only through `postChildcareCharge`.

**Outbound, Stripe, payments and refunds are absent.**
- No payment, refund, allocation or Stripe call in either program.
- A grep of `childcareChargeService.ts`, `chargeLifecycleService.ts` and `catalogChargeOffer.ts` finds no
  `stripe`, `fetch(`, email, notify, webhook or outbox call. Transitive imports are not proven.
- The child env carries no Stripe or Resend key.

### Add Charge agreement proven by `run` (7 cases, `tests passed=7 failed=0` required)

1. **Picker rule** (`loadCatalogChargeOptions`): one-time fees are offerable (×2 same-name). Unmapped and orphan
   GL are `blocked`; annual cadence is `unsupported`; an other-site item is absent.
2. **Command agreement:**
   - preview intent = write (amount 4200, mapping key);
   - the draft carries `source: commercial_catalog` and the Catalog GL account;
   - an idempotent re-write returns `unchanged`;
   - post, then journal once;
   - the GL resolves to the Catalog's account.
3. **Unsupported types and missing mappings** (4 cases): unmapped GL, orphan GL, recurring item and other site
   are each refused on preview *and* write, with the charge count unchanged.
4. **Historical/same-name identity:** two same-name Catalog items are two charges at 5300 and 4200. The
   same-name template stays a template (1100, `charge_template_id` set, no `catalog_item`).

The historical program adds: the draft is edited under its template (7500), not the same-name Catalog item
(9900), with exactly one draft.

## 5. Reset scope vs environment deletion (separate)

- **Fixture reset** (`financials_historical_draft reset`):
  - acts on fixture-owned rows only, matched by id + ownership key in the persona org;
  - at most 50 rows (`reset_limit`);
  - refuses with `removed=0` on any posted/void charge, payment, journal, closed period, foreign CASCADE
    dependent or foreign sibling;
  - pass = `reset namespace=financials-cert.alloy.invalid removed=<n>`, then a **fresh** `census count=0`
    measured after it.
- **Isolated suite** `afterAll`: removes drafts, products and the template. **Retained by design:** the posted
  charge and its journal entry (immutable by `enforce_childcare_charge_immutability`), plus the suite's
  configuration rows.
- **Environment deletion** (R3): the only removal of retained ledger rows. Irreversible, separately approved,
  filed only after the evidence below is recorded.

## 6. Evidence that counts

| Step | Pass |
|---|---|
| count-before | fresh `census count=0` |
| ensure / verify | `ok`, every ✓, one draft at 7500 under the template |
| run | `ok`, `tests passed=7 failed=0`, `✓ catalogAddCharge.live#1…#7 passed`; any skip, pending or zero-pass is a failure |
| reset / count-after | as §5; `censusIsFresh` against the same run, environment and candidate, measured after the reset |
| every receipt | `secret_suppression.withheld=false`, `credentials_exposed=false`, binding digest, evidence binding `qar:certenv:base12:migration_head:admin:financials` |
| persona browser proof | Agent-driven with the run's verified `admin` session, at the preview's **loopback origin** serving `C` against the same certenv, between verify and reset: the fixture household's charges show the historical draft at 7500 under the template label, distinct from the 9900 Catalog item. Screenshots are bound to `qa_run_id`, preview key and `C`. |

## 7. Not ready (labelled, no access invented)

1. **The posted test charge's identity is not in the receipt.** The runner prints only ordinals; the per-run
   `ca7a<4hex>` prefix is never output. The retention claim rests on test #2's assertion. Naming the retained
   charge needs a product change: one structured `✓ retained posted charge prefix=ca7a<4hex>` line. Not made.
2. **The operator Add command and multi-child/bulk Add are not exercised live.** `run` calls the services
   directly, not the `charge.add` action. Multi-child Add is by design a loop over the same single-charge
   writers, can POST when no review boundary applies, keys idempotency per charge, and has no rollback (it
   reports per child). The bulk picker route (`bulk-charge-targets`) uses the same `loadCatalogChargeOptions`.
   Coverage is unit only: `catalogBulkAndDraftIdentity.test.ts`, `catalogManualAddCharge.test.ts`,
   `unifiedAddTarget.test.ts`. A live command/bulk case needs a new pinned case and a new script digest. Not
   made.
3. **No scripted persona browser driver.** The browser proof in §6 is a procedure, not a registered fixture
   operation.
4. **No census for the isolated suite's own rows** (`run` has no census operation). Its before/after evidence
   is the tests line plus §5 retention.
5. **v2:** see §2. Platform no-SQL pin variant, plus Enrollment's verifier on staging.

## 8. Remaining engineering, in order

1. Operator: approve or decline A1–A4 and the `bp_v2`/`admin` plan choice. Each is per action; this packet files
   none of them.
2. Lane, after approval: §4 at `C`, then §6 evidence, then R1/R2, then R3 as its own approval.
3. Optional product slices (each changes `C` and therefore the pins): §7.1 retained-charge line, §7.2 live
   command/bulk case.
4. Platform: re-pin the proof packet's A741 table to `eeaa6dac` (three hashes above); the §2 v2 no-SQL pin model.
5. Promotion of the candidate: checkpoint, Director release, one PR, CI, merge. Not started.
