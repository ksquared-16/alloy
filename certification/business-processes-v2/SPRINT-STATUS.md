# Business Processes V2: sprint status (authoritative)

**As of:** 2026-10-23T02:45Z
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
| **8A-H** | **Hosted three-process walkthrough with populated records** | **READY TO RUN** (Enrollment unblocked) | — | — | §4, §6 |

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

