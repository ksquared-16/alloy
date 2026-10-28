# Documents V1 — D6/D7/D8 hosted certification (deployed staging `8125ac3f9`)

**Verdict: NOT `DOCUMENTS_V1_D7_D8_COMPLETE_PROMOTED_DEPLOYED_CERTIFIED`.** Two hosted gates fail on real behaviour,
the Medical/Enrollment/Business Process live suites were not run, and residue the census does not measure remains. The
details follow. Everything else passed on the exact deployed build.

Objective `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A`, lane `lane_aa660dc9554d`, run `erun2_f8a2b592cdde4d88`, 2026-10-28.
D9/D10 not started.

## 1. Hosted QA run and deployed build

| | |
|---|---|
| Deployed SHA | `8125ac3f9f2737c9185f526d2d43acb025889e0b` (`/api/build-info`, branch staging; PR #1611). Product tree (`web/`, `supabase/`) identical to `75b30bca2` |
| QA request | `gar_378294d3926255` (environment.qa_run_open, hosted authority declared, operator-approved 16:29:16Z) |
| QA run | **`qar_4246ac22ece0`** — plan `authz_q1`, target `alloy_staging_web`, 7 personas (fixture_admin, doc_reader, no_docs, processing_only, ocr, scoped_ops, cross_org_admin), all sessions verified |
| Registered fixtures | `qa_authz_fixture_ensure` `gar_bb99958a1e654a`, `qa_authz_subject_fixture_ensure` `gar_10bf94c1885311`, `…_secondary` `gar_f9846c9ff2302b` — all seeded for this run |
| Close | `gar_5cd0eeeeed8b24` — CLOSED 17:51:33Z, access clean, sessions removed (no storage-state file remains) |
| Residue | 15-check census `gar_7082b096e66018` (eb702fb6…, 17:53:06Z, alloy_deployed_primary) **15/15 zero**; bound by `gar_6c1775d6d4cfc4` → **ZERO_RESIDUE** |

The fixture-dependent drivers were first run before the registered fixtures existed (the open does not seed them).
Those results are kept as `*.attempt1-no-registered-fixtures.json` and were not used.

## 2. Results

| Gate | Result | Evidence (`certification/documents-v1/`) |
|---|---|---|
| **D6** requirements (rerun) | **75/75**. The failing assertion "history records the reviews" now passes with `Review accepted (was rejected)` and `Review rejected`. The historical 73/74 (`qar_af1c638fd52a`) is untouched | `d6_hosted_requirements_cert_results.qar_4246ac22ece0.json` |
| **D7** review, validity, renewal, event dates, attention | **85/86** — review 22/22, validity 19/19, renewal 13/13, event dates 15/15, attention 14/14, rejected-renewal 1/2 (FAIL below) | `d7_hosted_lifecycle_cert_results.qar_4246ac22ece0.json` |
| **EN-FI-09** | **30/30** (same file) | ″ |
| **D8** Forms → Documents | **40/41** (FAIL below) | `d8_fi10_hosted_cert_results.qar_4246ac22ece0.json` |
| **EN-FI-10** | **18/18** | ″ |
| **EN-FI-01** regression | **43/43** (7 personas + anonymous) | `en_fi01_hosted_results.certify.qar_4246ac22ece0.json` |
| Q1 authorization | 90/90 | `q1_hosted_authz_cert_results.qar_4246ac22ece0.json` |
| D1b security | 37/37; lead-deletion repair 7/7 | `d1b_hosted_security_cert_results…`, `d1b_lead_delete_results.qar_4246ac22ece0.json` |
| D2 foundation | 40/40 | `d2_hosted_foundation_cert_results.qar_4246ac22ece0.json` |
| D3 Studio | 40/40 (one assertion moved to D7's label, below) | `d3_hosted_studio_cert_results.qar_4246ac22ece0.json` |
| D4 household library | 41/41 | `d4_hosted_library_cert_results.qar_4246ac22ece0.json` |
| D5 Processing filing | 59/59 | `d5_hosted_filing_cert_results.qar_4246ac22ece0.json` |
| Automated browser walk | **16/17** (W4f = the D7 FAIL, seen in the Focus Panel) | `d7d8_hosted_browser_walk_results.qar_4246ac22ece0.json`, `d7d8-browser-qa/` |
| Medical / Enrollment / Business Process **live suites** | **NOT RUN** | see §4 |

Total hosted HTTP assertions (11 result files): **607 run, 605 pass** — the 2 failures above. Browser walk: 17 run, 16 pass.

### Hosted failures (real behaviour, not test defects)

1. **D7 — a rejected renewal reads "renewal awaiting review".** Setup: Kid One's v2 accepted (valid through
   2027-10-28), then renewal v3 rejected. Readiness keeps `state: satisfied` and `valid_until: 2027-10-28`, both correct.
   But it reports `renewal_pending: true`, and the Focus Panel prints "renewal awaiting review" (screenshot
   `07-d7-review-history-versions.png`). The evaluator computes `renewal_pending = inForce.every(e => e.renewal)`, which
   does not tell a pending renewal from a rejected one (`documentRequirementEvaluator.ts:313-319`). Severity: low, an
   operator-truth defect with no authorization impact. The D7.3 section asserted state and date after the rejection but
   not this flag; check D7.3b was added after the browser walk showed it.
2. **D8 / Forms — submission reads apply no subject scope.** `scoped_ops` (department-restricted) gets HTTP 200 and the
   form answers of an out-of-scope child from both `GET /api/admin/forms/submissions/[id]` and the list by
   `customer_member_id`. The same actor gets 404 on that household's library, readiness, signed URL and history. The
   EN-FI-01 label gate does hold ("Document (restricted)", file name and type null), and medical answers stay withheld.
   This read path predates D7/D8: `formsAuthority` gates Forms writes only, and the route asks for an admin session.
   Severity: medium. It is in-organization disclosure of non-medical form answers across a department boundary.

### Assertions adjusted for legitimate D7/D8 behaviour (original intent preserved)

- **D3** "enforcement is stated, not implied": D3 expected `validity_policy: "declared_d7"`. D7 (`55de2194e`) enforces
  validity, so the value is now `"enforced_evaluation"`. The assertion still requires every field to state its
  enforcement and sensitivity to be `enforced`. The pre-change 39/40 is kept
  (`…attempt2-pre-d7-enforcement-label.json`).

### Driver defects found and corrected (superseded results kept in each results file)

- D7 B2: event types were authored without a category (the type list carries `category_id` under `published`). They
  were left as drafts and never published. Section rerun 15/15. The first 1/12 is under `superseded_attempts`.
- EN-FI-10: `medical.verified` is a count (verified/total), not a boolean. The first pass was 12/18, although every
  layer summary was already correct. It was rerun on a fresh child (a verified fact cannot be unverified): 18/18.
- D8: the first read check asserted `forms.submissions` on a read, which is wrong under the Forms contract. It was
  replaced by the EN-FI-01 label checks and the scope probe that produced failure 2.
- Browser walk: a header search for an adult's name opens a person record, so W4/W5 now reach the household through
  B1. Walk attempts 1–3 are kept under `d7d8-browser-qa/attempt{1,2,3}`.
- The Q1 driver writes the tracked, un-suffixed `q1_hosted_authz_cert_results.json`. This run's output is saved as
  `….qar_4246ac22ece0.json` and the tracked historical file was restored from git.

## 3. Coverage by objective item

- **D7 lifecycle**:
  - Review: required → pending → rejected (reason required) → re-review (reason, Documents administration) → reopen
    (reason) → accepted. The history is append-only and keeps every decision.
  - Validity: the 12-month periodic window is derived from the review date. Expiring soon is due on the last valid day.
    Also covered: expired (blocking), not yet effective, inverted and impossible dates refused, review untouched.
  - Renewal: needs a reason; a scripted replacement is refused before storage. The prior accepted version keeps
    satisfying, only the current version is reviewed, an accepted renewal moves the date, and earlier versions are kept.
  - Birthday renewal: the day before the next birthday after the anchor; with no dob, `birthday_not_recorded`.
  - Enrollment start: `no_enrollment` is proven. A positive enrollment-start date is **not** hosted-tested, because no
    product route writes `child_enrollment_agreements` for a QA child.
  - Program year: `event_source_unavailable`; a recorded date resolves it.
  - Attention: kinds, de-duplication against requirement rows, and keyset pagination (1 and 3 per page, identical
    sets), a forged cursor refused, at most 500 rows per page. **Scale beyond the old 1,000 cap was not exercised**:
    the QA org held 3 attention documents.
  - Work Items reads the same `/requirements/work` snapshot (`MyTasksPanel`). The fields it maps are asserted present.
  - Scope, sensitivity and tenant: denials for every persona, including another organization.
- **D8**:
  - A form and version are authored and published through Forms. A requirement whose Forms evidence names an unknown
    form is refused by the database.
  - A draft never counts. The generated PDF is a canonical Document (`generated_form_pdf`) owned by the submission's
    child, with provenance (form, submission, status, role, kind). Integrity is stated (`unrecorded` for an
    admin-generated PDF). There is one immutable version, and generation is idempotent.
  - Forms evidence is pending review and never accepted automatically. Another form never counts. Acceptance goes
    through the D7 review.
  - A revised `submitted` policy counts on submission while the published v1 stays unchanged.
  - **Not hosted-tested: signed-artifact integrity (`verified` / `mismatch`).** No admin route produces a signed
    enrollment artifact; it is covered locally only.
  - **Not hosted-tested: Business Process readiness with a document stage.** No QA process names a document type.
- **EN-FI-09**: physical, health care plan, medication authorization and immunization each go through the canonical
  requirement interface. The household grain is refused. Each moves missing → pending review → satisfied (12-month
  seeded validity) → expired. All four are invisible to a reader without `health.view`.
- **EN-FI-10**:
  - Each layer is checked on its own: reported only → certificate uploaded → rejected → accepted-unverified. Documents
    review never verifies.
  - Verification is refused for: a non-accepted certificate, a basis under 3 characters, a sibling's certificate, a
    caller without `health.manage`, and another organization.
  - It succeeds once with `health.manage`, a basis and the child's own accepted certificate. Re-verifying is idempotent.
  - Oregon nonmedical exemption remains deferred.
- **EN-FI-01** gaps: Processing, the Health card, related records, p076 and signed URLs are covered.
  - **Forms / packet medical labels were not probed.** The driver has no Forms or packet case, and QA Shared has no
    packets.
  - D8's checks prove the Forms label gate for a standard-sensitivity document only.

### Missing-persona coverage

The plan has no persona that holds `health.view` without `health.manage`, or `documents.write` without
`processing.documents.manage`. Neither of these was hosted-tested:
- first-decision review by a writer who lacks re-review authority (`REREVIEW_NOT_AUTHORIZED`);
- a Health card reader who cannot verify.

`fixture_admin` holds every capability. Refusals were tested from personas that lack them.

## 4. Live suites (Phase 6) — not run

The Medical, Enrollment and Business Process live suites (`tests/*/live/*.live.test.ts`) target the **local** shared
stack through `.env.certification.local` and a service-role key. They cannot target hosted staging. They were not run,
for two reasons:
- this worktree has no `.env.certification.local`, so every suite would skip;
- the shared `alloy-cert` ledger head is `20261210090000`, without D6 (`20261212…`), D7 or D8. The suites would not
  exercise the deployed code.

Running them needs a cert env for the lane and governed applies of D6–D8 to `alloy-cert`, which another lane currently
leases. The hosted drivers exercised Forms, Medical and Enrollment behaviour through the deployed HTTP routes. That does
not substitute for the live suites.

## 5. Teardown and residue

Every driver tore down through its audited product routes:
- requirements: archive, then purge by `qa_run_id`;
- documents: POS delete;
- households: lead deletion;
- event types: delete;
- forms: archive.

After that, the three registered fixture resets ran: `gar_7498cc1ad7efc4`, `gar_c920070e06147b`, `gar_58f29da9347b36`.
Every deletable id was verified 404.

**ZERO_RESIDUE holds for the 15 registered checks.** These synthetic rows remain, outside the census, by an explicit
operator decision (2026-10-28), because the product offers no delete:
- `person_health_facts` `c32794d7-…`, `4f390d72-…`: **ended** (`health_fact.end`). The table is append-only, and there
  is no FK to the child.
- form definitions `qa_4246ac22ece0_d8f1`, `…_d8f2` (with their published versions): **archived**.
- `form_submissions` ×3: **submitted**, `customer_member_id` null. There is no submission delete or void route.
  - Lead deletion collects submissions by opportunity, customer or person, **not** by `customer_member_id`. It
    therefore also left the 3 generated PDFs behind; those were removed by the audited POS delete. This is a lead-deletion
    gap.

Full ids: `d8_fi10_hosted_reset_results.qar_4246ac22ece0.json` → `recorded_residue`.

## 6. Sprint readiness

`vac sprint status` reports: phase **VERIFIED**, hold PROMOTED, `promotion_verified_closable`, closure
`{closable: true}`. Checkpoint `ick_39d5336ab199` is on `75b30bca2481`, release `spr_4e1531c33543`, merge
`gar_ebe69d5d537c73` → `8125ac3f9` (PR #1611). Conditions c1–c5 are local-certification conditions, all satisfied.
Hosted certification is not one of them.

These hosted results were **not** written into the sprint's conditions:
- `vac sprint condition` replaces a condition's evidence, which would erase the local evidence c1–c5 carry;
- `amend` refuses a PROMOTED sprint.

**The sprint is not closed.** Closing it is a Director Accept/Close action. The two hosted failures and the unrun live
suites are the Director's input to that decision.
