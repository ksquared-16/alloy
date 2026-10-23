# Business Processes V2: sprint status (authoritative)

**As of:** 2026-10-23T03:45Z
**Lane:** `lane_581d120e4e41` (`agent/business-processes`)
**Deployed staging:** `e541dba05f34` (project `ikaxilmwmrmbagoidedu`). It contains every BP V2 merge below.
**Vacilando toolkit:** `2cc54168bf80`.

**Overall: PARTIAL, not certified.**
- Every planned V2 slice is merged and deployed.
- On hosted staging, Assignments and Billing are configured and walked by all four personas, and the No-Finance refusal is proven.
- **Full V2 certification still needs the populated-record three-process walkthrough.** It is blocked by the Enrollment template defect (§5.1): without a published Enrollment process, no household, and so no fixture, can be created.

## 1. Scope

**Goal.** Enrollment, Assignments and Billing run side by side on `/workspace`, through the existing process catalog, tiles, Work Views and Focus Panel.
- Enrollment is a staged lifecycle and is unchanged.
- Assignments and Billing are stage-less domain projections. They read Scheduling's and Financials' own authorities, with no second engine, record authority or financial calculation.

**Agreed scope.**

| Slices | What |
|---|---|
| 1 | Process model; three processes as tiles |
| 2 | Domain-backed Work Views |
| 3, 4, 4A | Assignments: five views, Scheduling card focus, site-scoped commands |
| 5, 6, 6A | Billing: five views, Financials card focus, one Due / Past due classification |
| 7 | Tile Work Items line |
| 8A | Hosted certification in the shared QA organization: four personas, walkthrough, financial quiescence |

**Changes and deferrals.**
- Billing-period variances were dropped as a view, because no such comparison exists.
- Payment exceptions are limited to unrecognized provider collections.
- QA moved to a permanent shared organization with quiesced, retained records, which is why census v2 exists.

**Director rulings in force.**
- **No-Finance** uses a dedicated bounded QA role with no financial permissions. Implemented (`qa_bp_no_finance`).
- **Pending subsidy:** the Overdue figure shows the family's currently payable overdue amount as the primary figure, with pending subsidy identified separately. To be confirmed as an approved product rule before implementation; not implemented.
- **Empty views are not a PASS.** A view not exercised with records is "configured / navigable", never PASS.
- **Enrollment views:** stage-based views are acceptable if their counts match deployed data.
- **Backdated fixtures** need an explicitly supported, isolated QA mechanism. None exists today.

## 2. Delivery inventory

| Slice | What | Status | PR → staging merge | Local certification | Hosted certification |
|---|---|---|---|---|---|
| 1 | Process model; three processes as tiles | COMPLETE | #1513 → `4d795dcf0` | `threeProcessShell` (24), `threeProcessTiles` (2), publish rollback 12/12 | Configuration census `gar_49a1b7a56ae00b` |
| 1A | Hosted evidence and the Slice 2 contract | COMPLETE (evidence) | #1516 closed; content landed with #1521 | — | Tenant-identity census |
| 2 | Domain-backed Work View runtime | COMPLETE | #1521 → `e67863e5d` | `live-projections` | Read-only (Firefly) |
| 3 | Assignments: 5 views; site scope | COMPLETE | #1526 → `2f2d4ca59` | `live-assignments` | §4 |
| 4 | Assignments → Scheduling card | COMPLETE | #1535 → `19aa6a5ed` | `live-focus-panel` | Not exercised on records |
| 4A | Assignment commands enforce site scope | COMPLETE | #1547 → `5fa727260` | `live-assignment-site-scope` | Not exercised on records |
| 5 | Billing review views | COMPLETE | #1549 → `488ed0b3e` | `live-billing` | §4 |
| 6 | Billing → Financials card | COMPLETE | #1551 → `bac802bb9` | `live-billing-focus` | Not exercised on records |
| 6A | Due / Past due classification; Payments due and Overdue views | COMPLETE | #1553 → `6cff6cb9c` | `live-due-parity` | §4 |
| 7 | Tile Work Items line | COMPLETE | #1554 → `ed5abbcd1` | `live-tile-work-items` | Firefly read-only (111 open · 89 overdue = server); QA Shared tiles show "No open work items" |
| 8A-R | Hosted QA readiness, Decision classification, walkthrough | COMPLETE | #1567 → `a12b8808d` | — | — |
| 8A-Q | Financial quiescence: census v2 `c1b6c335…`, 13 checks | COMPLETE | #1567 → `a12b8808d` | `financialQuiescence.live.test.ts` (3) | Every BP run's close certified 13/13 (§3) |
| 8B-1 | Enrollment template repair (`closed_lost` → `closed` + lost reason; family/child Waitlist separation, Director Option 1) | COMPLETE | #1574 → `e541dba05` | `enrollmentTemplatePublication.test.ts` (13, zero publish errors) | Readiness run `qar_e59e093c2b05` (§3) |
| **8B-2** | **Hosted populated-record walkthrough** | **PARTIAL**: Assignments complete; Billing complete for hostable views; Enrollment progression and per-child isolation pass, but the record surface is BLOCKED (D1) | — | — | `slice8b2/HOSTED-WALKTHROUGH.md`; run `qar_58463703cedd` |

Local commits not pushed, all evidence with no code: `241daa6d6`, `a0bc3bddf`, `3c9f211f5`, `25d5437af`, `830ce1a5f`, `8ef9baf28`, and this update.

## 3. Hosted QA runs (Vacilando ledger)

| Run | Toolkit | What happened | Final verdict | Census bound |
|---|---|---|---|---|
| `qar_f9a9275db057` | `7414457452d7` | Failed at open: audit origin; recovered | **QUIESCED_RETAINED** | `gar_51efecdc15c6a5` 13/13 |
| `qar_17c26a706ca7` | `1d35ef4690f2` → `23626b9e6b87` | Session verification failed at open; residual profiles; recovered after the Access & Identity (#1571) and runner repairs | **QUIESCED_RETAINED** | `gar_afd84a85847332` 13/13 |
| `qar_2765465b1e2b` | `23626b9e6b87` | Assignments and Billing configured and walked by 4 personas | **QUIESCED_RETAINED** | `gar_91e81845df7173` 13/13 (bind `gar_7eb0e4f868993c`) |
| `qar_1546aa9036c7` | `43ce22941af3` | No-Finance role certified; Billing refused | **QUIESCED_RETAINED** | `gar_91261ae7a0d440` 13/13 (bind `gar_2ab6bd0873f4eb`) |
| `qar_e59e093c2b05` | `2cc54168bf80` | S8B-1 readiness: Enrollment template published (r1, r2), three tiles, Create Lead household + child, Close as Lost executed | **QUIESCED_RETAINED** | `gar_eaa41f83f0838b` 13/13 (bind `gar_bd1d5c718729ae`) |

- Every BP run is terminal. All four pool identities have 0 roles and 0 access profiles. No sessions remain. QA Shared is free; every Documents run is also CLOSED.
- **Retained in QA Shared** (census `gar_91e81845df7173`):
  - 0 charges, payments and variances;
  - 2 published process configurations (Assignments and Billing);
  - 83 access audit rows;
  - an empty `qa_bp_no_finance` role definition;
  - an unpublished Enrollment draft process with no stages.

Evidence: `slice8a/hosted/` (`qa-ledger-closeout.json`, and one folder per run).

## 4. Hosted certification results (deployed `8bb731eadbf3`)

| Scenario | Personas | Result |
|---|---|---|
| Sessions verify as their exact registered identities | all 4 | **PASS** (runs `2765…` and `1546…`) |
| Assignments and Billing configured through product APIs and published (revision 1, `1e1f598f…` and `b2dea6e2…`, host work units created) | admin | **PASS** |
| Both tiles render; Work Items line "No open work items" | all 4 | **PASS** |
| Each of the 10 views opens its own projection, tab count = rows; no page or HTTP errors; no writes | admin, director, restricted | **PASS for navigation and configuration.** Contents are **not exercised**, because every view is empty (ruling: empty ≠ PASS) |
| No-Finance holds no `fin.*` / `billing.*` / `staff.compensation.*` / `enrollment.pricing.override`, keeps `portal.access` (57 keys = `ops` minus prohibited) | no-finance | **PASS** |
| No-Finance refused on all 5 Billing views; tile hides counts; 8 finance APIs return 403; no figures | no-finance | **PASS** |
| Assignments still available to No-Finance | no-finance | **PASS** |
| Enrollment configured from the certified template | admin | **BLOCKED** (§5.1) |
| Populated-record scenarios (below) | — | **NOT EXERCISED** |

**Populated-record walkthrough scenarios still to run** (`QA-READINESS.md §5`):
- **Enrollment:** New Leads, Decision, Registration and Waitlist counts match rows (including the known Decision 12-vs-11 check); the opportunity Focus Panel; complete an overdue Work Item and see the tile line drop.
- **Assignments:**
  - Ending soon, Upcoming changes, Schedule gaps, Proposed and Current each open the Scheduling card on the exact source;
  - archive an ending assignment;
  - the Restricted Operator is refused changing a QA South assignment and cannot see QA South rows.
- **Billing:**
  - Charges needing review (Financials card leads on the charge);
  - Payments due and Overdue equal the card's figures;
  - Funding variances and Payment exceptions (not seedable, §5.3);
  - the subsidy display under the pending-subsidy ruling.
- **Director:** reads and decides across all three processes.
- **Quiescence after real fixtures:** cancel drafts, reverse charges, resolve variances, then census 13/13.

## 5. Defects and blockers

1. **Enrollment template references a stage it doesn't create.** **REPAIRED and deployed** (PR #1574 → `e541dba05`), together with the family/child Waitlist separation. Proven on hosted staging by readiness run `qar_e59e093c2b05`: apply and publish with 0 errors; Create Lead commits a household and child; Close as Lost applies `{closed, lost}` and lands on `closed`. *Original description:*
   - `apply_enrollment_v2_template` is refused (422 `dangling_stage_reference`).
   - The template creates family stage `closed` (`web/lib/businessProcessTemplates/enrollmentProcessTemplate.ts:38`).
   - Its operating plans move outcomes to `closed_lost` (`web/lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts`, 11 references).
   - No new tenant can configure the certified Enrollment process. Because `create_lead` is the only household writer, **no Enrollment, Assignments or Billing fixture can be created.**
   - Owner: Enrollment / Business Process configuration.
   - **Smallest fix (one side only):** rename the template's family stage to `closed_lost`, or point the plans at `closed`. Add a test that applies the template to an empty process with zero dangling references.
2. **Director persona versus contract.**
   - `QA-READINESS §1` says the Director has `fin.read` but no `fin.write`. Through seeded `ops`, the Director effectively holds `fin.read`, `fin.write`, `billing.read` and `billing.write`.
   - No product acceptance criterion depends on the Director lacking write, but the approved contract is untrue as written.
   - **Director decision:** amend the contract (recommended), or add a plan role `qa_bp_director` without write.
3. **Fixtures product commands cannot create:**
   - **Open funding variance:** no API returns claim-line ids, and variances are written by `reconcile_remittance`. Owner: Financials.
   - **Failed post:** written only on an unexpected automatic-posting error.
   - **Unrecognized provider collection:** QA Shared has no provider, by design.
   - **Past-due charge:** needs a backdated `payload.today`; the ruling requires a supported isolated QA mechanism, which doesn't exist.
4. **Domain debt** (non-blocking):
   - Decision 12-vs-11 count;
   - charge-detail route site scope;
   - household-based record reachability;
   - Work Items "due today" uses the server day;
   - billing-period variance comparison;
   - failed-payment, autopay and dispute readers;
   - variance targeting in the card;
   - per-process record layout authoring;
   - QA-org provider refusal;
   - a periodic-billing stop.
5. **Docs:** the staging context-package manifest is out of date for `financials-canonical-authorities.md`. It predates V2.

## 6. Smallest path to V2 completion (no new sprint)
1. **Enrollment / BP config:** fix the template stage key, with its test; PR, CI, merge, deploy.
2. **Director:** decide on the Director persona. The recommended path is a contract amendment, a docs-only change.
3. **Financials:** expose claim-line ids, or rule that funding variances are certified on local evidence only. Also decide the past-due mechanism: a supported isolated `today` override, or past-due certified locally only.
4. **Hosted run.** One `bp_v2` run, coordinated with Documents:
   1. publish Enrollment from the template, with stage-based views and stage work units;
   2. create run-attributed fixtures through product commands, recorded in `fixture-manifest.json`;
   3. walk the populated scenarios (§4) for all four personas;
   4. quiesce through product commands;
   5. close, run census v2 13/13, and bind.
5. **V2 acceptance.**

## Update 2026-10-23T02:45Z: Slice 8B-1 deployed, Enrollment unblocked

**Template repair: PR #1574, merged and deployed at `e541dba05`.**
- **Close as Lost:** lands on `closed` and records `lost`.
- **Wants Waitlist:** keeps the family at Decision.
- **No Availability:** moves the family Tour → Decision.
- **Spot Offered:** moves the child through a declared `waitlist_to_enrolling`.

**Hosted readiness (`qar_e59e093c2b05`).**
- Template applied, validated (0 errors) and published, then republished as revision 2 after correcting the QA child-view grain. 8 stages, 2 tracks.
- The lead stage work unit needs status filters; it uses the canonical family status `open`.
- Create Lead committed: household `4e324c66…` and child `c5fa60c4…`, landing in New Leads (1 = 1 row).
- All three tiles render side by side.
- Close as Lost executed through the product.
- Closed and quiesced: census 13/13, bound.

**New findings, none blocking the walkthrough:**
- (a) A closed family record cannot be opened: "stage `closed` offers no work templates". Owner: Runtime / Enrollment.
- (b) QA Shared has no child status definitions, so `waitlist_child` has no target. The child status vocabulary must be configured before per-child waitlisting can run on hosted staging.
- (c) QA Shared option sets `person_gender` and `childcare_program_type` return 404.
- (d) Publish validation does not check Work View row grain against the grain of the stage it filters on.

## Update 2026-10-23T03:45Z: Slice 8B-2 populated hosted walkthrough

Run `qar_58463703cedd` → **QUIESCED_RETAINED**. Census `gar_5eb1ed3a0dee90` 13/13 with real quiesced financial records; bound by `gar_1f2e19bbd0f334`. Full results: `slice8b2/HOSTED-WALKTHROUGH.md`.

**PASS on hosted staging:**
- Assignments: all five views populated, counts = rows, the Scheduling card opens on the exact assignment, an authorized archive commits, the out-of-site archive is refused, site-scoped visibility holds.
- Billing: Charges needing review and Payments due populated, the Financials card leads on the right charge, the settled charge is excluded, the No-Finance refusals hold.
- Enrollment: Create Lead and the Lead → Tour → Decision progression; per-child waitlisting with sibling independence.
- Workspace: tiles and Work Item counts.

**Blocking defect:** D1. A new org has no `workflow_v1` opportunity drawer layout and no write path to set one, so every Enrollment record panel is unavailable.

**Other defects:** D2–D7 (see the packet).

**Not exercised** (local certification stands): Overdue payments, Payment exceptions, Funding variances.


## Update 2026-10-23T11:55Z: D1 repaired, deployed and certified on hosted QA Shared

**D1 is CLOSED.** PR #1577 (squash `91ee6721b78e`, deployed 10:34Z).
- **The repair:** a successful publication of an Enrollment staged process now provisions the org's `workflow_v1` opportunity drawer override, if it has none.
- **Contract:**
  - insert-only and idempotent;
  - existing overrides are preserved and reported;
  - reported on the response, never a failed publish;
  - Assignments and Billing do not trigger it;
  - no migration, and Firefly is untouched.
- **Local certification** (`d1/LOCAL-CERTIFICATION.md`):
  - live suite 11/11 on fresh orgs;
  - the counterfactual fails 4 scenarios (view-model 422 `classic_layout_deferred`);
  - 0 new failures across 1,266 suites.
- **Hosted** (`d1/HOSTED-QA.md`; run `qar_43db70ca2b00` → **QUIESCED_RETAINED**, census `gar_07c4153d995320` 13/13, bound `gar_bfc69cdb8806f1`):
  - republishing QA Shared Enrollment → `provisioned` (`16c5344a…`), then `already_present`;
  - the effective layout moved from global/null to org/`workflow_v1`;
  - in the browser, the Decision family and the Waitlist child open in the Focus Panel with their cards (view-model 200);
  - Assignments and Billing are unchanged.

**The merge path needed a fresh census.** The merge was refused twice (`ledger_evidence_stale` / `scoped_parity_dependency_unsettled`): the gate's identity census pre-dated the documents lane's `20261207181500`/`181600` applies. A fresh census filed with `inputs.queryArtifactPath` cleared it (`gar_42f7e99af47fa9`: head `20261207181600`, 541 rows, nothing missing).

**D3 is readable on hosted, admin and Director.** The closed record opens with a CLOSED card ("No current work configured"). The Work View provisioning answer still returns `no_truthful_primary_action` for the subject, with no visible effect.

**D8 (new).**
- **What happens:** opening a closed (lost) family auto-opens an Assignments "Create Assignment" editor for its child over the panel.
- **Status:** Focus Panel behaviour; not repaired, and no writes were made.

**Open:** D2, D4, D5, D6, D7, D8; O1. **Not exercised** (local certification stands): Overdue payments, Payment exceptions, Funding variances.

## Update 2026-10-23T12:50Z: D4 repaired, deployed and proven on hosted QA Shared

**D4 is CLOSED.** PR #1578 (squash `17991d6d4768`, deployed 12:42Z).

- **What was wrong.** Financials detail reads now enforce the canonical site-visibility policy (`isFinancialWorkVisible`) through `financialReadScope`. That covers charge detail, the card, the Focus Panel card producer (and so Billing's source-focused card), `ledger/[id]`, payment and attempt reads, and 9 household-keyed reads. Before, they stopped at org + `fin.read`.
- **Local proof** (`d4/LOCAL-CERTIFICATION.md`):
  - live security suite 7/7; base fails with 200s;
  - unit tests 18/18;
  - regressions explained.
- **CI.** The first run failed on 2 type errors, fixed in `d29160720`.
- **Hosted proof** (`d4/HOSTED-QA.md`; run `qar_83fecf2e96b1` → QUIESCED_RETAINED, census `gar_8668478b99adf3` 13/13, bound):
  - the QA North operator now gets 404 with no amounts for the exact charge and card that leaked in 8B-2;
  - a QA North agreement charge stays readable to them (200);
  - No-Finance gets 403;
  - admin and Director are unchanged;
  - in the browser, the panel shows no financial amount to the restricted operator.

**Residual (classified, not in D4).** Org-wide lists and aggregates without a site filter: `needs-recognition`, the `ledger` and `journal-entries` lists, `snapshot`, `statements`.

**Open:** D2, D5, D6, D7, D8; O1. **Next acceptance repair:** D2/D5, multi-child Enrollment progression and truthful work completion.

## Update 2026-10-23T14:10Z: D2/D5 repaired, deployed and proven on hosted QA Shared

**D2 and D5 are CLOSED.** PR #1581 (squash `1e4bc8877060`, deployed 13:49Z).

- **D2 root cause.** `enter_child_enrollment` was missing from the plan parser's allow-list, so "Family Enrolling" silently ran as `no_movement` and completed work. The allow-list is now exhaustive over the target-kind union.
- **D5 root cause.** The Enrollment template declared none of the per-child paths the platform already executes and that Firefly publishes. The template now declares them (Begin Enrolling / Waitlist / Not Enrolling), gates the family outcome on every child having a path, and selects their commands.
- **Firefly is unchanged.** No published rule carried the dropped target (census `gar_c036e6dd7a6c79`).
- **Local proof** (`d2d5/LOCAL-CERTIFICATION.md`): live two-child suite 6/6 (base answers 200 to both refusals); 0 new failures across 1,841 suites.
- **Hosted proof** (`d2d5/HOSTED-QA.md`; `qar_b2161550fd2b` → QUIESCED_RETAINED; census `gar_001c6d9e918adc` 13/13, bound). In the real browser:
  - "Family Enrolling" is refused with the real message and the work stays open.
  - Ava is waitlisted and Ben begins enrolling, each on their own path.
  - The Registration view shows only Ben and the Waitlist view only Ava.
  - The family work completes only after every child has a path.

**Documentation correction.** The child's stage lives on its Enrollment journey (`process_instances`), not on `opportunity_customer_members.stage_key`.

**Open:** D6, D7, D8; O1. **Residual:** the D4 org-wide Financials lists. **Next acceptance gates:** D8 (closed-record Create Assignment editor), then D6/D7.
