# Documents V1 — R2 / R5 hosted proof support (local), and D9 / D10 scope reconciliation

**Status: LOCAL PROOF SUPPORT COMMITTED, NOT PROMOTED. Nothing hosted ran.**

Not done in this objective:
- no hosted QA run, fixture, census or session;
- no database, credential or environment use;
- no registration, push, PR, merge or install.

The R2 / R5 gates named in `R1-R2-R5-HOSTED-CERTIFICATION.md` ("Outstanding") are still **open on hosted**. This record supplies the driver, the fixture and the tests they need, and the exact hosted sequence below.

| | |
|---|---|
| Objective / lane / run | `OPWORK_AA660DC9554D_SPRINT_C4FDA4F0FE93` / `lane_aa660dc9554d` / `erun2_0e90d18602014572` |
| Base | `agent/documents` at `b0b1a8f03` (R4 census 20/20 record). Completed D7 / R4 / census receipts are untouched |
| Slices | `1e8649588` fixture pair, runner, invariant, census, contract; `182acb160` driver R2/R5 phases and matrix test. `vac sprint commit-slice`: `COMPLETE_COMMITTED_NOT_PROMOTED` at `182acb160` |
| Toolkit | `20261030-3bedabeea2a6` |

## What was built

| Artifact | Path | sha256 (at `1e8649588` / `182acb160`) |
|---|---|---|
| Shared-child ENSURE | `certification/fixtures/qa-documents-shared-child-ensure.sql` | `e4613956f0a106e1576a87a4c0671747be11979d96b15cae10582cf612e376e4` |
| Shared-child RESET | `certification/fixtures/qa-documents-shared-child-reset.sql` | `afcf43d977a6e8bcd72984afa8b7ba288fedaf9bfe46ca1c06ea15e1954166e5` |
| Runner (`ensure` / `reset`) | `web/scripts/qaDocumentsSharedChildFixture.mjs` (npm `dev:qa:documents-shared-child-ensure` / `-reset`) | `38064833fe901542dbda768a4c0797f7bcadfd67e17d7f6e89266a3a77e6dd16` |
| Supplementary residue census | `certification/qa-shared/documents-r5-shared-child-residue-census.sql` | `87d96cdd67eba0e2fe095170437dd49dccb7cf2ce5384397792d8cedb287adfd` |
| Rollback invariant (prepared, not run) | `certification/invariants/documents-r5-shared-child-fixture.sql` | `dbc14d0e270de9a7d32aa4132404cd14e94b1e9b01d6949b772c61be883df0ac` |
| Registration contract for HostCapacity | `certification/qa-shared/documents-r5-shared-child-fixture-contract.json` | (carries the pins above) |
| Hosted driver phases | `certification/documents-v1/r4_hosted_restricted_personas_cert.py`: `ensure_r2r5`, `certify_r2r5`, `reset_r2r5`. The R4 `ensure` / `certify` / `reset` phases are byte-identical apart from the importable argv preamble | — |
| Local tests | `web/tests/certification/qaDocumentsSharedChildFixture.test.ts`, `certification/documents-v1/test_r4_r2r5_matrix.py` | — |

**Fixture shape.** The R5 shape that no product route can build:
- Household H, children SHARED and ONLY_A, and leads A and B, both on H.
- The leads sit on a fixture work unit under the **permanent** QA D1 department.
- A carries SHARED and ONLY_A; B carries SHARED.

**Namespace `ac000000-0000-4000-8000-0000000005xx`.** It is reserved to this fixture and kept separate from two existing ones:
- The authz_q1 subject ensure/reset delete **every** `aa000000-%` opportunity and work unit.
- The D4 household fixture deletes every `ab000000-%` customer and member.

Either would therefore reach rows placed inside its prefix. These rows sit in neither prefix, and this fixture's deletes name only its own exact ids.

**Protections.** Each one is tested locally; see the test lists below.
- Org and run:
  - QA Shared only;
  - `qa_run_id` must be `qar_<12 hex>`;
  - the ensure refuses another run's rows.
- Every DELETE is `org_id = :'org' and id in (<exact ids>)`. There are no prefix deletes and none on:
  - documents, storage or Forms rows;
  - `person_health_facts`, `mutation_events`, `workflow_events`;
  - `process_instances`, departments or orgs.
- Refusals, before any write:
  - a fixture id in another org;
  - an unmarked `ac000000-` row;
  - a document on a fixture subject;
  - a form submission naming a fixture subject;
  - an Enrollment journey on a fixture child or participation;
  - the permanent D1 department missing (ensure only).
- One transaction with `ON_ERROR_STOP`: a refusal or a failure part-way leaves the database unchanged.
- **Reset after partial failure.** Any subset of rows is cleaned the same way: none, after lead A, after both leads, or never started.
  - A second reset removes nothing.
  - The reset asserts the namespace is empty inside its own transaction, and raises (rolling back) if not.
  - The runner refuses a result with `residue != 0`.
  - The reset returns `removed_run_ids`. It is deliberately not limited to the open run: a run that never reached its reset would otherwise strand its rows.
- **Runner gates**, every one checked before any database connection:
  - armed (`CERT_FIXTURE_APPLY=1`, `DRY_RUN=0`), with `SYNTHETIC_ONLY=1`;
  - production project refused, and any project other than staging;
  - the `FIXTURE_SHA256` pin;
  - the org is QA Shared;
  - the run id is well-formed;
  - trusted DB connectivity only.

## Local results (what was proven, and how)

| Check | Result |
|---|---|
| `vac run test tests/certification/qaDocumentsSharedChildFixture.test.ts` | **30/30** |
| `vac run test tests/certification tests/qa/sharedQaInfrastructure.test.ts` (neighbours: G1/G2 binding, shared QA registry) | **81/81** (4 files) |
| `vac run test tests/scripts/governedReconciliationExecutor.test.ts` | **19/19** |
| `vac run typecheck:tests` | **PASSED** (0 errors, after a cast fix in the new test) |
| `python3 -I -B certification/documents-v1/test_r4_r2r5_matrix.py` | **14/14** |
| Installed toolkit `hosted-fixture-safety` audit (read-only) | ensure and reset **ok** under `qa_authz_vendors` and a proposed `ac000000-` profile; the reset is also ok under a synthetic-style profile; the ensure is refused there because it INSERTs, as expected |
| `vacilando-suite --tier=1 --targeted` | **Not applicable here.** The installed runner scans the toolkit's own `tests/deterministic`, which the install does not ship: ENOENT before any test. Not worked around |
| Rollback invariant | **Not run.** It needs `database.run_rollback_invariant_test` on an isolated certenv, which is governed; no live database was used |
| Production build | **Not run.** `validation-classify` says `build_sensitive`, because `web/package.json` gained two npm scripts and no dependencies. Per worker.validation.v1, ONE `vac run build` belongs at the integrated checkpoint |

**What the vitest file proves:**
- Every DML statement and refusal guard of both fixtures appears, substituted, in the rollback invariant. The other-run guard is exercised with a different run id.
- Ownership and no-prefix deletes, one transaction, guards outside dollar quotes, no psql escape hatch, no trigger suspension.
- The ensure and the reset share their refusal predicates.
- Namespace disjointness from the `aa000000-` / `ab000000-` prefix deletes.
- The census is read-only and covers every fixture table.
- 14 runner refusals, each before any connection. The spawn env is only PATH plus the case's variables, so no inherited database URL is possible.

**What the matrix test proves.** A conforming synthetic product passes all R2/R5 cases, and each defect fails the case that names it:
- an unfiltered session list;
- 403-for-scope on reads and writes;
- a 404 that leaks the body;
- an out-of-scope write;
- unscoped link lists or preview;
- lead deletion taking the shared child;
- an unscoped manual-link target.

It also proves the public packet tokens are never persisted, that reset after a partial certify is clean and idempotent, and that the driver ids are bound to the fixture's `\set` values.

## Findings from the route survey (code reading only; nothing changed)

1. **`manual-link` does not scope its TARGET.**
   - `web/app/api/admin/forms/submissions/[submissionId]/manual-link/route.ts` scope-checks only the submission's current subject (line 61).
   - The new `person_id` / `customer_id` / `customer_member_id` / `opportunity_id` are checked for organization and household consistency, never with `formsSubjectInActorScope`.
   - So a department-restricted actor holding `forms.submissions` can re-link an in-scope submitted row onto a QA D2 lead.
   - The driver asserts the R2 rule (404) in a case marked `known_gap`. Run `--skip-manual-link-target` to leave it out until a product decision is made.
   - **Decision needed:** authorize a small Forms fix (scope-check every target subject), or record the gap as accepted.
2. **POS compose and public-link minting cannot be scope-measured with Revision 3 personas.**
   - Both are gated on `forms.author`, which `scoped_forms` does not hold, so a refusal would be capability, not scope.
   - Compose checks only its anchor. `child_ids` / `recipient_ids` beyond a single child are written into link metadata unchecked.
   - **Decision needed** (persona-contract owner): a department-restricted author persona, or accept local-only proof.
3. **Toolkit observation, for HostCapacity; not changed.** `destructiveStatements()` captures the table of `delete from public.<t>` as `public`. An ownership-bearing safety profile is therefore blind to schema-qualified DELETEs.

## Hosted action packet (prepared; every step needs its own authorization)

**Preconditions, in order:**
1. **Promotion of these bytes to staging.** Director-released checkpoint, ONE PR, merge; then re-verify every sha256 at the merge commit. Not authorized now.
2. **HostCapacity registers, from the merged bytes:**
   - `qa_documents_shared_child_ensure` / `_reset` (`lib/reconciliation-registry.mjs`);
   - the profile `qa_documents_shared_child` (`idPrefix ac000000-`, `ownership {}`, no replica window);
   - the `authz_q1` `fixture_reconciliations` wiring;
   - then a release and install through its own PR451 path.

   The exact entries are in `certification/qa-shared/documents-r5-shared-child-fixture-contract.json`. The Documents lane edits no toolkit file.
3. **Optional:** run the rollback invariant on an isolated certenv (`database.run_rollback_invariant_test`). This is governed and needs a lease or environment grant.
4. **The `manual-link` decision** (finding 1).

**Run:**

| # | Act | Actor / mechanism | Writes |
|---|---|---|---|
| 1 | `environment.qa_run_open` plan `authz_q1`, target `alloy_staging_web`, `hosted_qa_authority.declared: true` | operator approval (HOSTED STAGING) | QA access grants for the run's personas |
| 2 | Persona sessions | registered pool identities (`fixture_admin`, `scoped_forms`, `cross_org_admin`; `health_viewer`, `doc_writer`, `doc_reader` for the R4 regression) | QA sessions (closed at run close) |
| 3 | `qa_authz_subject_fixture_ensure` (QA Shared) | registered reconciliation | `aa000000-` WU1/WU2, OPP1/OPP2 |
| 4 | `qa_documents_shared_child_ensure` (QA Shared) | registered reconciliation (new) | `ac000000-` H, SHARED, ONLY_A, WU (D1), leads A and B, 3 participations |
| 5 | driver `ensure` | `fixture_admin`, product routes | L1 (D1) and L2 (D2) via `create_lead` with households; K1 and KU; run form `qa_<run>_r4form` published; s_opp1 / s_opp2 / s_ku; plain and medical document on K1; an immunization fact on K1 |
| 6 | driver `certify` (R4 regression, 35 cases) | the three restricted personas | `scoped_forms`: one in-scope submission; `doc_writer`: review, validity, renewal version |
| 7 | driver `ensure_r2r5` | `fixture_admin`; one anonymous public resolve per packet link | packet `qa_<run>_r2pkt` and its item; packet links from L1, L2 and KU; 3 packet sessions (public resolve); form links naming L1, L2 and nothing; R5 submissions on SHARED, ONLY_A, lead A and lead B |
| 8 | driver `certify_r2r5` [`--skip-manual-link-target`] | `scoped_forms`, `fixture_admin`, `cross_org_admin` | `scoped_forms`: one draft on L1 and its submit; one packet link from L1 (the manual-link target case, if run against the current code, re-links that draft onto L2). `fixture_admin`: product deletion of lead A |
| 9 | driver `reset_r2r5` | `fixture_admin` | product deletion of lead B (takes H, SHARED and their submissions) |
| 10 | driver `reset` (R4) | `fixture_admin` | health fact ended (retained by design); L1 / L2 lead deletions; run form deleted or archived |
| 11 | `qa_documents_forms_residue_reset` | registered | run packet and items, sessions, links and the run form's submissions and versions |
| 12 | `qa_documents_shared_child_reset` | registered (new) | whatever `ac000000-` rows remain (normally none); `residue: 0` |
| 13 | `qa_authz_subject_fixture_reset` | registered | `aa000000-` subjects |
| 14 | `environment.qa_run_close` | operator approval | access revoked |
| 15 | `database.read_census` of the registered `7957a51a…` census, from a NEW execution run, target `alloy_deployed_primary`; then the close binding (`residueCensusRequestId`) | operator approval (deployed primary is always an operator decision) | none (read-only) |
| 16 | `database.read_census` of `documents-r5-shared-child-residue-census.sql` (`87d96cdd…`), NEW execution run | operator approval | none (read-only) |

**Ordering constraints:**
- 11 must come before 12: the shared-child reset refuses while a run-form submission still names a fixture subject.
- Documents leave only through the product (lead deletion or the audited document delete); never through SQL.
- 15 and 16 must each run in a fresh execution run, because the census dedupe is run-scoped.

**Acceptance:**
- `certify_r2r5` all PASS, with the manual-link target either fixed or explicitly skipped by decision.
- R4 regression 35/35.
- `reset_r2r5` `product_teardown_gone: true`; R4 reset `all_gone`.
- Every registered reset `ok` (shared-child `residue: 0`).
- Registered census 20/20 true and **bound** to the closed run.
- Supplementary R5 census: all six `r5sc_*` checks true.
- Retained by design, never residue: the archived run form if not deletable, the ended health fact, audit history.

## D9 / D10 — scope reconciliation (before asking for a restatement)

The search covered every Documents file ever committed, commit messages across all refs, pickaxe for `D9` / `D10` / "email ingestion" / "D9 consequences", and the module, API and planning docs. **No Documents V1 phase roadmap (D0–D10) exists in this repository or its history.** Every D9/D10 hit under another numbering scheme (Conversation Platform, BP-v2, phase-5 closeout, access-identity, doc-truth audit) was excluded.

**D9 — scope LOCATED (partial).** It was named and constrained in `b5a2509c2` (the D5 record):
- `D5-PROCESSING-FILING.md:5` "D9 (external API) … out of scope".
- `docs/api/documents-forms-api.md:70-74`:
  - an external Documents API must call `commitDocumentFiling`, so it inherits the transaction, the Studio policy, the clearance check and the audit;
  - it takes a caller-supplied idempotency key;
  - it publishes the stable refusal codes;
  - "No external route is published by D5."
- The authorization boundary is canonical in `docs/api/api-architecture.md:52-54,75`: `/api/v1/**`, Application Principal (Developer Application → Installation → Credential → scopes + resource boundary), no admin session, no caller-selected tenant.
- **Not located:** the endpoint list, scopes, read versus filing, and the phase boundary.
- **Inference only:** `docs/api/developer-platform/product/06-gaps-and-slice-b.md:52` records documents as not modelled as external resources, and `openapi/alloy-public-api.v1.json` has no documents path.

**D10 — scope NOT LOCATED.** That is unlocated, not proof of no plan: the original scope was probably set in a Director authorization or sprint packet outside this repository. The Vacilando objective and Director stores were not searched.

The repository carries only "D9/D10 not started". **The only basis for reading D10 as email ingestion is inference:**
- `processing_case_sources.source_kind` has admitted `'email_attachment'` since `20260612120100_pos_processing_cases_v1.sql:66-68`, re-asserted in later migrations.
- The UI labels it "Email". No code ever creates such a source.
- Communications inbound email (`webhooks/resend` → `ingestResendInboundEmail`) records attachment metadata only: "attachment support is not available yet" (`inboundEmailNormalization.ts:316`). Retrieval is Conversation Platform WS11, which plans to reuse `documents`.

**Boundary if D10 is email ingestion (inference):**
- WS11 fetches the attachment into a `documents` row.
- A Processing case opens with `source_kind = 'email_attachment'`.
- Filing goes through `commitDocumentFiling`.
- No new inbound route and no new provider. The authorization is the existing Processing and filing gates; nothing public.

None of this was built.

**Decision needed (Kelly):**
- confirm or restate D9's endpoint and scope set;
- confirm whether D10 = email-attachment ingestion through WS11 → Processing → `commitDocumentFiling`;
- or point to the Director packet that defined them.

## Not touched

- Immunization enforcement and fee: awaiting Kelly's answer; nothing assumed.
- HostCapacity run `erun2_5901517804d09e41` (WAITING): not steered.
- PR451: not touched.
- BP `certenv-8e770c96ef`: stays retired.
- Every closed QA run, receipt and binding is unchanged: `qar_bc811ffc7da1`, `qar_8fb0e1ffabcf`, D7 `gar_3c51d48448eba3`, census `gar_bcf58ca61c3f22` / `gar_6c56f9fdac73a5`.
