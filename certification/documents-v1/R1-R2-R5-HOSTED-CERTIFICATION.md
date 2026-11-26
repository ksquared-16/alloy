# Documents V1 — R1 / R2 / R5 fix-forward hosted certification (`qar_8fb0e1ffabcf`)

**Status: R1 CERTIFIED on hosted. R2 CERTIFIED for reads by a real department-restricted persona, with named gaps. R5 CERTIFIED for
child-only cleanup; shared-child preservation NOT proven on hosted. Run CLOSED, ZERO_RESIDUE.** No product code changed. D9/D10 not started.

| | |
|---|---|
| Deployed | staging `7d7c80373036b355d70857f41441d6e2499ea6f8` (PR #1612), `/api/build-info` `dpl_4q5ZgofqR7mwP2Utg8GJELtQbBsf` |
| Sprint / run | `OPWORK_AA660DC9554D_SPRINT_D7AABC686568` / `erun2_af980a397872b65f`; checkpoint `ick_058efdb29edf` |
| QA open | `gar_a228fe593fdd38` (authz_q1, `alloy_staging_web`, hosted authority declared, operator-approved 20:31:34Z) → `qar_8fb0e1ffabcf` |
| Registered fixtures | ensure `gar_349caca7fc2f74`, `gar_d440bbdf2f4b88`, `gar_7c4af300373dc4`; reset `gar_e36c5a95c5fb47`, `gar_6158e0b788f1a1`, `gar_8951f6a09d686b` (all at `expected_repo_head` 7d7c8037) |
| Close | `gar_943a8ab9a1dcef` — CLOSED 21:16:25Z, access clean |
| Residue | registered census `gar_7c52989a8a7288` (`eb702fb6…`, 21:18:04Z) all zero-checks true → bound by `gar_db7822cfa675e8` → **ZERO_RESIDUE** |
| Supplementary | Forms/subject census `gar_ca3d1fd5efb747` (`r125-forms-residue-census.sql`, `81e8e764…`, 21:26:38Z) **6/6 zero** |
| Previous run | `qar_4246ac22ece0` CLOSED, untouched |

## R1 — rejected renewal (D7 driver, `d7_hosted_lifecycle_cert_results.qar_8fb0e1ffabcf.json`: **158/158**)

- Full D7 re-run 116/116, including **D7.3b** (the failing assertion on `qar_4246ac22ece0`): rejected renewal → `renewal_pending: false`.
- New section **R1** (34/34). Kid Two and Kid Three each get an accepted v1 expiring in 5 days and a v2 renewal, which is then rejected. This is the case D7.3b could not reach: its in-force version was a year out, so no work row existed.
  - While v2 awaits review: `renewal_pending` is true and the row has `renewal: "pending"`. That is Review work: Processing "Review on the record", Work Items "Review:".
  - After the rejection:
    - `renewal_pending: false` and `renewal_rejected: true`.
    - v1 still satisfies until its own date and is still expiring soon, so **new evidence is required**.
    - The row has `renewal: "rejected"`. It stays Renew work: Processing "Renew on the record", Work Items "Renew:".
    - The superseded v1 cannot be re-decided (409 `NOT_CURRENT_VERSION`).
  - Re-review authority:
    - `doc_reader`, `ocr`, `scoped_ops`, `no_docs` and `processing_only` are refused (403/404, nothing leaked).
    - `cross_org_admin` gets 404, and a re-review without a reason gets 400 `REASON_REQUIRED`.
    - The refusals leave v2 rejected.
    - An authorized re-review (rejected → accepted, with a reason) moves valid-through to v2's date and removes the row. History keeps both decisions.
- New section **R1B** (8/8), run after the browser walk. Kid Three gets new evidence (v3) after the rejection: pending review again, then Review work. Accepting it moves valid-through and removes the row. v1, v2 (still rejected) and v3 are kept.
- Work Items: the hosted row's `(state, renewal)` was put through the deployed mapper's verb rule (`mapDocumentRequirementToWorkItemRow`). The Work Items page itself was not rendered.

**Browser** (`d7d8_hosted_browser_walk_results.qar_8fb0e1ffabcf.json`, **19/19**):
- **W4f** passes: "Satisfied · Valid through 2027-10-28 · renewal rejected — collect a new version".
- New **W4g-processing**: the panel reads "…was rejected — upload a new version" with "Renew on the record", and never "awaits review".
- New **W4g-focus**: "Expiring soon · valid through 2026-11-02 · renewal rejected — collect a new version".
- Screenshots: `d7d8-browser-qa/07g-*`.

## R2 — Forms subject scope (`r2r5_hosted_forms_cert.py`, `r2r5_hosted_results.certify.qar_8fb0e1ffabcf.json`: **45/45**)

Fixtures:
- L1: a lead in QA D1, with children K1 and K2.
- L2: a lead in QA D2, with child KU.
- One run form with a standard field and a field bound to the child's allergies (medical).
- Submissions on: the L1 opportunity, the L2 opportunity, and K1, K2 and KU (child-only, admin-created).

`scoped_ops` is the registered **department-restricted persona** (department `qa_d1` only, all sites; `documents.read`, `processing.operate`, `crm.customers.read`; no `health.view`).

| Case | Result |
|---|---|
| Unrestricted readers (`fixture_admin`, `doc_reader`): every submission by id, full list, `?customer_member_id=` | 200 / all listed ✓ (14) |
| `scoped_ops`, opportunity in QA D1: single read / list / `?opportunity_id=` | 200 / only it listed ✓ |
| `scoped_ops`, opportunity in QA D2; child-only K1, K2, KU | 404, names nothing ✓ |
| `scoped_ops` list filtered by out-of-scope child / opportunity / household | 200 `[]` (no existence oracle) ✓ |
| `scoped_ops` `intake-source`, `enrollment-packets`: QA D1 vs QA D2 opportunity | 200 / 404 ✓ |
| Another organization (`cross_org_admin`): each submission by id, list, filter by our child | 404 / none / none ✓ |
| Anonymous: list, single, packet-sessions, intake-source | 401 ✓ |
| Medical: with `health.view` the allergy answer is present; without it (`doc_reader`, `scoped_ops`) it is absent and `meta.medical_answers_withheld: true`, standard answer kept; list withholds too | ✓ |
| Regressions: EN-FI-01 **43/43**, Q1 authorization **90/90**, D8 Forms read contract (in D8 59/59) | ✓ |

**Outstanding — mandatory remaining R2 gates (NOT claimed):**
1. **Packet-session scope on hosted.** The QA Shared org has no packet session (admin list empty for both personas), and admin has no route that creates one; sessions come from the public packet flow. The list is served (200), but scope filtering is unmeasured. Read, review-rollup and review-insight are unmeasured.
2. **Out-of-scope Forms WRITES by a restricted actor.**
   - Affected routes: create, submit, generate-document, manual-link, confirm-linkage, link minting and POS compose.
   - `scoped_ops` has no `forms.submissions`, so its write is refused **by capability (403)**. That is not a scope proof.
   - This needs a restricted persona that holds Forms write authority (`scoped_forms`, in `../qa-shared/documents-d7d8-repair-qa-plan-handoff.json`).
3. **Link lists / preview-payload scope**: not exercised on hosted. They are proven locally (`tests/forms/formsSubjectScope.test.ts`).

## R5 — lead deletion cleanup (`r2r5_hosted_results.r5.qar_8fb0e1ffabcf.json` 7/9 + `r2r5_hosted_reset_results` + D8 reset)

- L1's deletion (product route, 200) removed s_opp1, the **child-only s_k1 and s_k2**, and children K1 and K2.
- **Unrelated records are unchanged**: L2's opportunity submission and its child's submission stay 200.
- L2 measured afterwards:
  - Its delete-preview shows `will_delete.form_submissions = 2`: its opportunity submission **plus its child's own child-only submission**.
  - After deletion both are 404 (`r5_l2_pass: true`).
- D8 reset: the child-only admin submissions `a_f1`, `b_f2` and `b_f1` are **404 after lead deletion**. On `qar_4246ac22ece0` this same shape was left as residue.
- The two R5 FAILs are recorded, not hidden:
  - **Driver defect.** The L1 preview assertion read `preview.counts` (the subject summary) instead of `preview.will_delete`, so it got `null`. It is fixed in the driver and replaced by the L2 measurement above.
  - **Shared-child preservation NOT proven on hosted.** `create_lead` with an existing household (`context.customer_id`) created a NEW household, and `opportunity-customer-members` only links a child within the opportunity's own household. No product route gives a second lead on one household. This is proven locally only (`leadDeletionChildOnlySubmissions.test.ts`). It is a remaining gate for the plan owner: a registered shared-child fixture.
- Audit / retention:
  - Deletion ran through the audited lead-deletion route.
  - Audit history (`mutation_events`, `workflow_events`) is retained by design (registered census `doc_zr_retained_*`).
  - Published forms are archived, never deleted: 3 run forms remain, all inactive.
  - Health facts are append-only. The D8 fact was ended, and 1 ended fact remains on a deleted child.
  - No active fact sits on a missing child (supplementary census).

## Teardown and residue

- Driver teardowns: D7, D8, R2/R5 (`all_gone`), EN-FI-01, and Q1 last (`count: 5`). Then the three registered resets, the close and the census.
- The registered census measures **no Forms table**. The supplementary census checks are all zero:
  - run leads, households and children, by id;
  - run submissions, by id and by run form;
  - links and submission documents of the run forms;
  - active facts on missing children.
- **Not total fixture cleanup**: what remains is retained by design (3 archived forms, 1 ended fact, audit history). The earlier run `qar_4246ac22ece0` still leaves **2 forms and 3 orphaned child-only submissions**, from before R5. Removing them needs the proposed registered reconciliation `qa_documents_forms_residue_reset` (plan owner).

## Remaining dependencies

- **R3**: the certification-environment live suites and the D7/D8 Postgres invariants are still not run (`R3-certification-environment-handoff.json`).
- **R4**: the following are still prepared but not run:
  - signed Forms integrity;
  - positive enrollment-start renewal;
  - BP document-stage readiness;
  - attention > 1,000;
  - medical labels on Forms and packet screens;
  - the `doc_writer` / `health_viewer` / `scoped_forms` personas.
- R2 gates 1–3 and the R5 shared-child gate, as listed above.
