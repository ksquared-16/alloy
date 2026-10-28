# Documents V1 — D7/D8 certification repair batch (local, not promoted)

**Status: `DOCUMENTS_V1_D7_D8_REPAIR_BATCH_READY_FOR_DIRECTOR_REVIEW`, local only.**
- Not pushed, not released, no PR, not merged, not deployed.
- No migration, and none applied anywhere.
- D9/D10 not started.

**Context.** The deployed D7/D8 build is staging `8125ac3f9` (PR #1611). Its hosted run `qar_4246ac22ece0` is CLOSED, with ZERO_RESIDUE on the 15-check census (`gar_7082b096e66018` → `gar_6c1775d6d4cfc4`). That run, and its evidence in `D7-D8-HOSTED-CERTIFICATION.md`, are untouched.

**Sprint.**
- Fix-forward sprint `OPWORK_AA660DC9554D_SPRINT_D7AABC686568`, established by `gar_39ff3d8308f881` (Director-approved), hold HELD.
- The historical sprint `…_6389E3AA927A` (PROMOTED) is not mutated. `commit-slice` correctly refuses it with `sprint_not_open`.

## Candidate

Branch `agent/documents`. The product code is final at `3f174f1ad`. The validated tree is `ad91cff01` (product code identical; it adds only a certification record).

| Commit | Slice |
|---|---|
| `18bb06306`, `d8de2675e` | R1: renewal review state (+ the type fix tsc found) |
| `8a9d1bb04` | R2: Forms department/site scope (security) |
| `3f174f1ad` | R5: lead deletion takes a deleted child's own form submissions |
| `ad91cff01` | preserves the trusted host's ledger census refresh `tha_af0cdd9bbe98b5` (staging head `20261214090000`) |

## R1 — rejected renewal status

**Cause.**
- The evaluator marked any satisfaction that rested on an earlier accepted version as `renewal: true`.
- `renewal_pending` was `inForce.every(e => e.renewal)`.
- A rejected renewal therefore read "awaiting review". The hosted run hit exactly this: D7.3b, and browser check W4f.

**Fix (`documentRequirementEvaluator.ts`).**
- The renewal's own state (`pending | rejected | null`) is carried through evaluation.
- `renewal_pending` is true only while a renewal awaits review.
- A new `renewal_rejected` is true when every renewal on file was decided against.
- Satisfaction, validity, the append-only history and blocking are unchanged. Once version 1 lapses, a rejected renewal still blocks (`evidence_rejected`).

**Surfaces.**
- Work rows carry `renewal`.
- Processing: an expiring requirement whose renewal awaits review is **review** work ("Review on the record"). A rejected renewal stays renewal work ("…was rejected — upload a new version").
- Work Items titles: "Review:" vs "Renew:".
- Focus Panel: "renewal rejected — collect a new version".

**Tests.**
- `documentsD7ReviewValidity.test.ts`, R1 block: evaluator states, including mixed documents; a rejected replacement; re-review of the rejected renewal, including the 403 for a writer without re-review authority; an accepted subsequent replacement (v3); lapse after rejection; work-row transitions.
- `documentsD6RequirementsUi.test.tsx`: Focus Panel and Processing rendering for pending, rejected and accepted renewals.
- The two D7 assertions that encoded the defect now assert the corrected state.
- **Mutation:** restoring the old rule fails 4 tests.
- The harness's version stand-in now numbers versions (`v3-…`), so a third version no longer collides with the second.

## R2 — Forms department/site scope (security)

**One rule for every Forms subject surface** (`lib/forms/formSubmissionScope.ts`), the canonical one from `lib/admin/accessScope.ts`:
- An **opportunity's** work-unit department and site decide (`assertOpportunityInAccessScope`).
- A **child, household, person or unattached** subject is readable only with unrestricted scope (`recordReadableWithoutDeptSiteLinkage`). This is the same rule the entity drawer and Documents apply.
- A failed access context means no scope: fail closed.
- Out of scope gets the same 404 as missing, and names nothing.
- Organization isolation is unchanged.

**Census.** Every admin route that reads submissions or packet sessions was traced (42 routes).

| Surface | Before | Now |
|---|---|---|
| submissions: list (incl. `?customer_member_id=`), read | answers to any admin session | scoped list; 404 by id |
| submissions: create, submit, generate-document, manual-link, confirm-linkage | capability only | + scope (404, nothing written / generated) |
| packet sessions: list, read (`shared_values` answers), review-rollup, review-insight, review | admin / admin\|ops only | scoped (subject from `crm_snapshot` / launch source) |
| opportunity `intake-source` (latest intake answers) | admin\|ops only | opportunity scope (as its sibling `enrollment-packets`) |
| `preview-payload` (prefill from `launch_fks`) | admin session | scope on every named subject |
| link lists (form, packet definition) | metadata ids to any admin | links naming an out-of-scope subject dropped |
| link minting (form link, packet link), POS compose | capability + org check | + scope on the launch / anchor subject |
| POS packet list (child / recipient names, email, phone) | admin session | out-of-scope links dropped before names resolve |
| POS participant projection | `forms.author` | + session scope |

**Security matrix** (`tests/forms/formsSubjectScope.test.ts`, 16/16, real routes over an in-memory database):

| Case | Expected | Result |
|---|---|---|
| Unrestricted administrator, every subject | 200 / listed | ✓ |
| Restricted, opportunity in its department | 200 | ✓ |
| Restricted, opportunity in another department | 404, no answers or ids | ✓ |
| Restricted, child-only submission (the hosted finding) | 404, no answers or ids | ✓ |
| List, unfiltered / `?customer_member_id=` / `?opportunity_id=<out>` | in-scope rows only / `[]` | ✓ |
| Another organization (even unrestricted) | 404; sees only its own | ✓ |
| Anonymous | 401 | ✓ |
| Access context fails | 404, empty list (fail closed) | ✓ |
| Create / submit / generate out of scope | 404, nothing written, no document | ✓ |
| Packet session read / list / projection | scoped | ✓ |
| intake-source, preview-payload | scoped | ✓ |
| Link lists: out-of-scope subject / no subject / unrestricted / no scope | dropped / kept / all / none | ✓ |

- **Mutation** (gate always true): 11/16 fail. The 5 that survive are the cases that do not depend on scope (unrestricted, anonymous, other org, subject resolution).
- **Preserved:**
  - EN-FI-01 medical-answer withholding and linked-document label gating (`documentsEnFi01MedicalMetadata` green, the generate-document provenance check still precedes generation).
  - Documents routes unchanged.
- **Existing suites:** given an explicit unrestricted access context (`formsAdminRoutes`), or a stubbed in-scope gate where they test review logic (the three packet-review suites).

**Not changed (recorded, not Forms routes).** None of these has a department-scope model to enforce yet; they need a Processing / CRM scope decision:
- Processing queue / recommendation / approve
- `related/[entity]/[id]`
- `forms/crm-entity-search` (CRM)

## R3 — certification environment

**Blocked; nothing applied, nothing fabricated.** Exact handoff: `R3-certification-environment-handoff.json`.
- Shared `alloy-cert` is leased by `wt4-enrollment-phase2-participant-anchor-ecv2_claude_654bfd49` (since 12:03:59Z). Its ledger head is `20261210090000`.
- Missing on it: `20261210093500` (D5), `20261211090000` (tour guard), `20261212090000` (D6), `20261213090000` (D7), `20261214090000` (D8).
- This lane has no `.env.certification.local`.
- Two governed paths:
  - **A.** After the lease is released: `database.apply_migration` with environment `certification`.
  - **B.** An isolated `environment.build_certification_baseline` at staging `8125ac3f9`. This needs the toolkit owner to issue the environment's connection to the lane; no lane-facing path exists in toolkit `20261028-0d6680bdf731`.
- **Live suites: NOT RUN.**
  - health 3, enrollment 6, Business Processes 12
  - `access/live/formsCapabilityAuthority`; there are no `tests/forms` live suites
  - the D7/D8 Postgres invariants re-run

## R4 — hosted coverage gaps: prepared, not run

Hosted recertification of R1 and R2 needs them deployed, which is outside this batch. Each gap below has a prepared plan. None is claimed as covered.

| Gap | What it needs | Owner |
|---|---|---|
| Signed Forms integrity (`verified` / `mismatch`) | A packet link (`POST forms/packet-links`) → the public enrollment flow with a drawn signature → `persistSignedEnrollmentArtifact`. Assert `form_provenance.integrity`. Then tamper a copy (a byte change in a re-uploaded artifact) and assert `mismatch` + "not usable as evidence". Driver: a D8 section on the public token routes | Documents lane, on the next hosted run |
| Positive enrollment-start renewal | A `child_enrollment_agreements` row for a run child. No product route creates one for a QA child: needs an Enrollment-owned route or a registered fixture reconciliation | Enrollment lane / plan owner |
| BP document-stage readiness | A run-scoped process whose stage names a document type (BP Studio publish), then `projectDocumentRequirementProgress` "has expired" on the hosted readiness | Business Process lane (authoring path) |
| Attention > 1,000 | More than 1,000 tracked, owned, available documents in QA Shared. 1,050 product uploads per run is heavy; preferred is a registered, census-covered bulk fixture. Then assert `documents_complete`, cursor walk and no duplicates past 1,000 | Plan owner (fixture + census) |
| Medical labels on Forms and packet screens | An immunization upload through `public/forms/[token]/enrollment-upload` inside a packet session. Probe `forms/submissions/[id]` `linked_documents`, `packet-sessions/[id]/review-rollup` / `review-insight`, `opportunities/[id]/enrollment-packets` as `doc_reader` / `no_docs` / `scoped_ops` (+ R2 scope) | Documents lane (EN-FI-01 driver section) |
| Review / write boundaries, Forms action scope | Personas `doc_writer`, `health_viewer`, `scoped_forms` (do not exist) | QA-plan owner: `../qa-shared/documents-d7d8-repair-qa-plan-handoff.json` |

## R5 — synthetic fixture residue (from `qar_4246ac22ece0`)

| Rows | Disposition |
|---|---|
| 2 ended `person_health_facts` (`c32794d7…`, `4f390d72…`) | **Intentionally retained.** The database refuses DELETE (`enforce_person_health_fact_immutability`), and a closed fact never reopens. Ending is the product's only disposal, and it was done. Proposed census treatment: a `retained_by_design` report (an ACTIVE fact on a deleted subject would be the defect) |
| 2 archived forms `qa_4246ac22ece0_d8f1/f2` (+ published versions) | **Safely deletable, but needs an audited mechanism.** Proposed registered reconciliation `qa_documents_forms_residue_reset`: QA orgs only; deletes submissions → links → versions → definitions; never audit events |
| 3 child-only `form_submissions` (`c727bac4…`, `9bc7cb9b…`, `f19d3fd1…`) | **Same reconciliation.** **Product cause repaired (R5, `3f174f1ad`):** lead deletion now collects submissions of the children it deletes; a child kept by another lead keeps its own. Test + mutation; the in-memory harness learned counted selects (the graph's reference checks count rows) |

- Census extension proposed with 4 questions (forms definitions / submissions / links + retained health facts), routed to the plan owner: `../qa-shared/documents-d7d8-repair-qa-plan-handoff.json`.
- The closed run and its 15/15 verdict are not reopened.

## R6 — local certification of the candidate

| Gate | Result |
|---|---|
| Change class | `ordinary` (`vac validation-classify`, no migration); production build run anyway, as instructed |
| Targeted suites | R1: D7 suite + D6 BP + D6 UI 60/60, UI 15/15. R2: 16/16 + Forms admin routes 36/36 + packet review 11/11 + EN-FI-01 green. R5: 1/1 + 54 harness/deletion suites (6 reds, identical on the base). Every repair mutation-checked |
| Affected sweep (`tests/` documents, forms, publicForms, health, enrollment, businessProcesses, workItems, pos, processing, focusPanel, admin, opportunities; live excluded) | candidate **11,475 tests: 10,844 pass, 595 fail**; base `5c2af7c4d` 11,448: 10,817 pass, 595 fail. **0 new failing tests, 0 new failing files** (compared name by name) |
| Typecheck | `vac run typecheck`: PASSED (the first run found the R1 widening, fixed in `d8de2675e`) |
| Test typecheck | `vac run typecheck:tests`: PASSED |
| Prebuild guards | module imports, service-client principal, unauthenticated side effects, route capabilities, runtime-mode audience, governed documents: **6/6 pass** |
| Production build | `vac run build` on `ad91cff01` (tree `8041fb48`): **rc=0**, compiled in 42 s, peak 9.51 GB |
| Database-backed checks | **Not run.** The repair adds no SQL. The D7/D8 invariants are pending R3 |

## Checkpoint

- **Not yet created.** `vac sprint checkpoint` acts for the sprint the RUN is attributed to.
- The current run `erun2_f0187aac21534654` is attributed to the PROMOTED sprint (`sprint_not_open`).
- Attribution comes from the run record (`obligationForRun`), so a run of this lane must be dispatched under `OPWORK_AA660DC9554D_SPRINT_D7AABC686568`.
- Then:
  - `commit-slice`: `r1-rejected-renewal-state` (`d8de2675e`), `r2-forms-subject-scope` (`8a9d1bb04`), `r5-lead-deletion-child-submissions` (`3f174f1ad`)
  - ONE `vac sprint checkpoint --slices r1-…,r2-…,r5-…` on the integrated head.
