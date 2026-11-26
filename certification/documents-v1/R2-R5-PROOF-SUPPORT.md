# Documents V1 — R2 / R5 local acceptance support, and the hosted approval packet

**Status: LOCAL WORK COMMITTED, NOT PROMOTED. Nothing hosted ran. R2 and R5 are NOT certified on hosted.**

Since the first version of this record (`b6977b3b2`), the R2 scope rule has been extended to the **destination** of five Forms writes and one read (`e1c511967`). The matrix now covers a restricted Forms **author**, a persona that is proposed and not yet provisioned (`4e739925b`).

No hosted test, fixture, session, credential, registration, push, PR, merge or install happened.

| | |
|---|---|
| Objective / lane / runs | `OPWORK_AA660DC9554D_SPRINT_C4FDA4F0FE93` / `lane_aa660dc9554d` / `erun2_0e90d18602014572` (slices 1–3), `erun2_ab8cf4a1e3fdac9f` (slices 4–6) |
| Candidate | `agent/documents`. HEAD is the commit that carries this record; the checkpoint section names its exact sha |
| Toolkit | installed `current` → `b3c80db2e9aa` (HostCapacity PR451 release, `gar_d1ed1de75a3693` / `tha_e45fd26adf5792`) |
| Preserved | every earlier commit, receipt and closed QA run: `qar_bc811ffc7da1`, `qar_8fb0e1ffabcf`, D7 `gar_3c51d48448eba3`, census `gar_bcf58ca61c3f22` / `gar_6c56f9fdac73a5`. Persona contract Revision 3 (`e6d619f2…`) is byte-identical |

## Slices

| # | Commit | What |
|---|---|---|
| 1 | `1e8649588` | R5 shared-child fixture: ensure/reset SQL, runner, rollback invariant, residue census, registration contract |
| 2 | `182acb160` | Driver R2/R5 phases and local matrix test |
| 3 | `b6977b3b2` | First version of this record |
| 4 | `e1c511967` | **Product fix:** R2 scope of a Forms write's destination (`lib/forms/formsDestinationScope.ts`; manual-link, POS compose, form link POST/PATCH, packet links, packet roster) |
| 5 | `4e739925b` | Driver: R2-authoring section, packet-link destination cases, skip removed, missing persona = not run. `scoped_author` persona proposal |
| 6 | (this record) | Safety-audit parser finding (handoff only); this record |

## 1. Production authorization contract, verified against the driver before changing code

The canonical rule is `web/lib/forms/formSubmissionScope.ts:1-17`, the same department/site rule used across the product:
- An **opportunity's** work-unit department and site decide.
- A child, household or person with **no opportunity** is readable only by an unrestricted actor.
- A failed access context is no scope at all.

`create` already refused out-of-scope subjects. The driver's assertion "a write's target is scoped too" is that same rule applied to the target, so the driver was right and the routes were wrong. One driver-side defect was found and fixed: the synthetic product in `test_r4_r2r5_matrix.py` had admitted a child-only subject in a D1 household. Production refuses it, and the fake now matches production.

**Confirmed gaps, now fixed in `e1c511967`.** A department-restricted actor could:

| Route | Gap |
|---|---|
| `POST …/submissions/[id]/manual-link` | Re-point an in-scope submission at an out-of-scope opportunity, or unlink it to a subject only unrestricted actors hold. Its distinct 400s ("not found in this organization" / "does not match") also disclosed whether an out-of-scope id existed |
| `POST /api/admin/pos/packets/compose` | Mint links for another household's children or recipients under an in-scope anchor (only the anchor was checked) |
| `POST /api/admin/forms/[form]/public-links` | Name an out-of-scope prefill source (`form_context_mode` + `source_entity_*`), child or recipient in caller metadata. `resolveFormPrefillValues` and the submission subject derive from it |
| `PATCH /api/admin/forms/[form]/public-links/[link]` | Edit a link naming an out-of-scope subject (the list hides it, the PATCH did not), or re-point a link's metadata at one |
| `POST /api/admin/forms/packet-links` (`forms.submissions`, **reachable by the existing `scoped_forms`**) | The same through metadata (`source_entity_*` becomes the prefill source when no launch is given) and the enrollment selection |
| `GET /api/admin/pos/packets/roster` | Read any household's children (with dates of birth) and parent recipients with an admin session alone: no capability, no scope |

**The repair is one rule.** `formsDestinationInActorScope`:
- every named subject must pass `formsSubjectInActorScope`;
- every child and recipient must belong to the in-scope opportunity's own household (household members, and the composer's recipient roster).

It is checked before any write. A restricted refusal is the same 404 a missing record gets. Unrestricted actors are unchanged: the helper answers true without reading, and they keep their descriptive 400s.

The roster now declares `forms.author` in `routeCapabilities.declared.json`. Its only consumer is the Packet Composer (`PosPacketsPanel.tsx:166`), whose compose route is `forms.author`, and that UI already degrades a non-OK response to an empty roster.

**Restricted-actor behaviour that changed, by design:**
- A restricted actor can no longer name, through any of these routes, a child or recipient outside the in-scope opportunity's household.
- It also gets 404 instead of a descriptive 400 for a manual-link target it may not hold.

No legitimate client sends subject keys in link-mint metadata. Measured callers:
- `useProcessingFormApi` (`buildProcessingPublicLinkMetadata`);
- `FormOperationalIntentPicker`;
- `FormOutcomeConfigPanel`;
- the preview flow.

`FormExistingRecordSendPanel` uses `launch_from_entity`.

**Persona contract defect.** Revision 3 §3a lists "POS compose" and "mint a packet link" as `scoped_forms` positive cases, but `scoped_forms` holds no `forms.author`, and compose is `forms.author`. That row can never pass. It is corrected in the Revision 4 proposal below; the Revision 3 bytes are left pinned and unchanged.

## 2. Local results

| Check (via the broker unless noted) | Result |
|---|---|
| `tests/forms/formsWriteDestinationScope.test.ts` | **39/39**. Positive, negative, ambiguous (unlinking the opportunity), cross-org, indistinguishable-404 (existing versus missing target), zero-write table snapshots on every refusal, unrestricted unchanged, capability 403 controls |
| Negative control: the same file without the fix | **21 fail** (19 write-route + 2 roster), each a refusal or zero-write case. The 18 that pass are in-scope or unrestricted preserved behaviour |
| `tests/tours/publicCalendar/tourCalendarPublication.test.ts` | **8/8**. The suite gained the unrestricted access context the scoped PATCH now reads (it failed closed without one: 5 reds, cause verified) |
| Regression: `tests/forms tests/admin/*forms/packetSession* tests/tours/* tests/pos tests/access` | 4,734 pass. **52 reds in 30 files reproduce identically on the base without this change**, the same set on both runs. They predate this work and are not fixed here |
| `typecheck`, `typecheck:tests` | **PASSED** (0 errors) |
| Prebuild guards: `check:route-capabilities`, `verify:module-imports`, `check:service-client-principal`, `check:unauthenticated-side-effects`, `check:runtime-mode-audience`, `check:governed-documents` | **all PASSED** (`verify:module-imports` after the helper was committed) |
| `qaDocumentsSharedChildFixture.test.ts` (slice 1) | 30/30 (unchanged bytes) |
| `python3 -I -B certification/documents-v1/test_r4_r2r5_matrix.py` | **18/18**. 65 cases on a conforming product (R2-packet 14, R2-writes 19, R2-authoring 18, R2-links 6, R5-shared 8). Every defect fails the case that names it: compose destination, compose reading only the first child, roster scope, link metadata, PATCH of an out-of-scope link, packet-link destination, manual-link target. A missing `scoped_author` gives 16 FAIL "not run"; a missing `scoped_forms` fails every section. The skip option is gone, and the test asserts it |
| Production build and checkpoint | see §6 |

## 3. Restricted Forms author: local contract only

`certification/qa-shared/documents-r2-scoped-author-persona-proposal.json` holds a **Revision 4 delta** for the persona-contract owner and HostCapacity:

| Field | Value |
|---|---|
| Persona | `scoped_author` |
| Role | `qa_scoped_author` |
| Grants | `portal.access`, `documents.read`, `crm.customers.read`, `forms.author` |
| Scope | department restricted to QA D1, all sites |
| Identity | new pooled identity `qa-pool-09` |

Its matrix row covers roster, compose, link mint and PATCH. No grant, role, identity, credential or session was created.

**Until it is adopted and provisioned, every R2-authoring case is FAIL "not run". R2 is not certified while any case is not run.**

## 4. Safety-audit parser finding (handoff only; not implemented)

The handoff is `certification/qa-shared/hosted-fixture-safety-qualified-delete-finding.json`, for HostCapacity.

**Defect in `lib/hosted-fixture-safety.mjs` (installed `b3c80db2e9aa`):**
- `destructiveStatements()` reads `delete from public.t` as table `public`, so ownership rules are blind to schema-qualified DELETEs.
- `delete from "public"."t" …` is not matched at all.
- The synthetic profile's preserved-table regex has the same blind spot.

**Minimal reproduction** (read-only import of the installed module):
- `delete from "public"."financial_subsidy_claims" where org_id = :'org';` → verdict `ok: true`.
- A synthetic fixture with one legitimate run-scoped delete plus a quoted `person_health_facts` delete, or a quoted org-only delete → `ok: true`.

**Proposed fix** (22-line diff in the handoff): an optional `ONLY`, an optional quoted schema and a quoted table. It reports the bare table plus `schema`, and the preserved-table regex accepts the same shapes.

Measured on a throwaway copy: every bypass case is refused for the right reason, and **all 8 fixtures checked keep their verdict** (financials demo tenant, Forms residue reset, the four authz fixtures, the proposed shared-child pair).

## 5. Hosted approval packet (prepared; nothing here is authorized by this record)

**Target.** `alloy_staging_web` (hosted staging), organization **QA Shared** `4acc9386-c485-486f-aa1f-05d83499d142`. QA Secondary `ad53fee2-…` is used only by `cross_org_admin`. Plan `authz_q1`. No production, no other organization, no certenv (BP `certenv-8e770c96ef` stays retired).

### 5.1 Preconditions (each its own decision, in order)

1. **Promote this candidate.**
   - A Director-released checkpoint (§6), then ONE PR to staging, CI, merge.
   - Staging must then serve the merge commit (`/api/build-info`).
   - Re-verify every fixture sha256 at the merge commit.
2. **HostCapacity registration**, from the merged bytes, through its installed framework (no duplicate):
   - **Already adopted:** none of the items below.
   - `qa_documents_shared_child_ensure` / `_reset` and the `qa_documents_shared_child` safety profile (`documents-r5-shared-child-fixture-contract.json`).
   - Persona contract **Revision 4** (`scoped_author`, `qa_scoped_author`, `qa-pool-09`) and the `authz_q1` contract re-pin. The contract owner adopts it first (Director approval).
   - **Optional:** the parser fix (§4).
3. **Optional, governed:** run the R5 rollback invariant on an isolated certenv (`database.run_rollback_invariant_test`).
4. **A hosted QA run approval** with `hosted_qa_authority.declared: true`. This is the Director's labelled HOSTED STAGING decision.

### 5.2 Actors, sessions and credentials

All of these are registered `authz_q1` identities, provisioned only by the toolkit's audited functions inside the run. No credential is created or read by the lane.

| Persona | Org | Capabilities (from the contract) | Used for |
|---|---|---|---|
| `fixture_admin` | QA Shared | admin package | fixtures through product routes, controls, R5 lead deletions, teardown |
| `scoped_forms` | QA Shared, D1 only | `portal.access`, `documents.read`, `crm.customers.read`, `forms.submissions`, `forms.submissions.confirm` | R2-packet, R2-writes, R2-links; capability control on compose and roster |
| `scoped_author` (**Revision 4, not yet existing**) | QA Shared, D1 only | `portal.access`, `documents.read`, `crm.customers.read`, `forms.author` | R2-authoring |
| `cross_org_admin` | QA Secondary | admin package | cross-org 404 |
| `health_viewer`, `doc_writer` (and `doc_reader`) | QA Shared | Revision 3 | R4 regression (35 cases) in the same run |

**Sessions:**
- The toolkit restores each persona's session into `~/.local/state/alloy-dev/gateway/auth/qa-runs/<run>/<persona>/storage-state.json`.
- The driver reads only the cookie and never prints it, a token or a signed URL.
- Public packet tokens are used once for the resolve route and never stored.

### 5.3 Exact fixture objects and product writes (bounded, all synthetic)

| # | Act | By | Objects written |
|---|---|---|---|
| 1 | `qa_authz_subject_fixture_ensure` (registered) | toolkit | `aa000000-…101/102` work units (QA D1 / D2), `…111/112` opportunities |
| 2 | `qa_documents_shared_child_ensure` (**to register**) | toolkit | `ac000000-…501` household H; `…521` SHARED, `…522` ONLY_A; `…531` work unit (QA D1); `…541` lead A, `…542` lead B; participations `…551/552/553` |
| 3 | driver `ensure` | `fixture_admin` | leads L1 (D1) and L2 (D2) via `create_lead` with their households; children K1 and KU; run form `qa_<run>_r4form` (published); submissions `s_opp1`, `s_opp2`, `s_ku`; one plain and one immunization document on K1; one reported immunization fact on K1 |
| 4 | driver `certify` (R4 regression) | restricted personas | `scoped_forms`: one D1 submission; `doc_writer`: review, validity, renewal version |
| 5 | driver `ensure_r2r5` | `fixture_admin`, plus 3 anonymous public resolves | packet `qa_<run>_r2pkt` and its item; packet links from L1, L2 and KU, each opened once (3 sessions); form links naming L1, L2 and nothing; R5 submissions on SHARED, ONLY_A, lead A and lead B; one recipient id each for L1 and L2, read from the admin roster |
| 6 | driver `certify_r2r5` | `scoped_forms`, `scoped_author`, `cross_org_admin`, `fixture_admin` | `scoped_forms`: one draft on L1 and its submit; one packet link from L1. `scoped_author`: one compose packet `qa_<run>_r2compose` (one item, one link) on L1/K1/L1 recipient; two form links (L1 launch, subject-less); one PATCH of the subject-less link. `fixture_admin`: product deletion of lead A |
| 7 | driver `reset_r2r5` | `fixture_admin` | product deletion of lead B (takes H, SHARED and their submissions) |
| 8 | driver `reset` (R4) | `fixture_admin` | fact ended (retained by design); L1 and L2 deleted (children, submissions and documents go with them); run form deleted, or archived if published |

### 5.4 Expected refusals: every one a 404 that names nothing and writes nothing

**`scoped_forms`:**
- L2 and child-only KU packet sessions: read, list, rollup, insight, review.
- `submit` / `generate-document` / `manual-link` / `confirm-linkage` on `s_opp2` and `s_ku`, with each row re-read unchanged.
- `manual-link` of its own submission onto L2.
- Packet links with an L2 prefill source in metadata, the KU enrollment selection, or metadata children `[K1, KU]`.
- Link lists drop L2 and KU links; preview-payload refuses L2 and KU.
- Cross-org: 404 on our session.

**`scoped_author`:**
- Roster of L2 and of KU.
- Compose on L2; on L1 naming KU; naming `[K1, KU]`; naming an L2 recipient.
- Link mint with L2 as prefill source, or L1 with children `[K1, KU]`.
- PATCH of the L2 link; PATCH re-pointing the subject-less link at L2.
- After all of these, the admin's link list is unchanged.

**Capability controls (403, recorded as capability, never as scope proof):** `scoped_forms` on compose and on the roster.

**R5:** lead A's deletion takes `s_r5_oppa`, `s_r5_only` and ONLY_A; it keeps SHARED, `s_r5_shared`, H, lead B and `s_r5_oppb`.

### 5.5 Cleanup order, census and binding

1. Driver `reset_r2r5`, then driver `reset`. Product teardown must read `product_teardown_gone: true` and `all_gone: true`.
2. **`qa_documents_forms_residue_reset`** (registered). It removes:
   - the run packets `qa_<run>_r2pkt` and `qa_<run>_r2compose`, their items, sessions and links;
   - the run form's links, submissions and versions.

   It must run **before** step 3, because the shared-child reset refuses while a run-form submission still names a fixture subject.
3. **`qa_documents_shared_child_reset`** (to register). It must report `residue: 0`.
4. **`qa_authz_subject_fixture_reset`** (registered).
5. **`environment.qa_run_close`**.
6. **`database.read_census`** of the registered 20-check census `7957a51a…`:
   - from a **new** execution run (census dedupe is run-scoped);
   - target `alloy_deployed_primary` (always an operator decision);
   - then the close binding: `qa_run_close` with `residueCensusRequestId`.
7. **`database.read_census`** of `documents-r5-shared-child-residue-census.sql` (`87d96cdd…`), from another new execution run.

**Retained by design, never residue:** a published run form archived instead of deleted, the ended health fact, and audit history (`mutation_events`, `workflow_events`).

### 5.6 Acceptance (no partial certification)

R2/R5 is certified on hosted only when **all** of these hold:
- `certify_r2r5`: every case PASS, with **no** "not run" row. That needs `scoped_author` to exist.
- R4 regression 35/35.
- Product teardowns all gone.
- Every registered reset ok, with `residue: 0`.
- Registered census 20/20 true **and bound** to the closed run.
- R5 census: all six `r5sc_*` checks true.

**A run without `scoped_author` can at most prove R2-packet / R2-writes / R2-links / R5. R2-authoring then stays open and R2 stays uncertified.** No skip flag exists.

## 6. Integrated candidate and checkpoint

Local product certification follows `lib/product-repository-certification.mjs`: build (full), typecheck (or the build's typecheck graph) and test (scoped allowed), each green, stable and on a clean tree, for the **exact** candidate commit. The broker run results and the `vac sprint checkpoint` outcome are recorded in the final report for this objective, because a commit cannot name its own sha.

## 7. Remaining gates (open)

1. **Promotion of the candidate** (Director release, PR, CI, merge, staging serving the merge).
2. **HostCapacity registration** of the shared-child fixture pair and profile.
3. **Revision 4 adoption** (contract owner) and provisioning of `scoped_author` (HostCapacity).
4. **Hosted run**: every step in §5, each operator-approved.
5. **Optional:** the rollback invariant on a certenv, and the parser fix (§4).
6. **R1 / R3 / R4 / D7 / D8:** unchanged.
7. **D9 / D10:** scope as reconciled in `b6977b3b2`. D9 is partly located; D10 is **unlocated** (not proven absent). No API or email code was written.
8. **Immunization enforcement / fee:** awaiting Kelly; nothing assumed.
