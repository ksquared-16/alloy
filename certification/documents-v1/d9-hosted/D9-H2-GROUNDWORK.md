# D9-H2 groundwork (write proof): state on 2026-11-09

Documents, lane `lane_aa660dc9554d`, run `erun2_3c165c0a040129c5`. Contract: `D9-2-3-HOSTED-QA-PLAN.md` (unchanged).
Nothing here opens a QA run or creates an installation or credential, and no write case has been tested on hosted.
D9-H1 passed on `qar_242c9c123886` (`D9-H1-HOSTED-RUN-RECORD.qar_242c9c123886.md`); plan §1 P2 is satisfied.

## 1. Applications (plan §2.1, §7.1)

| Slug | Card | Registered? |
|---|---|---|
| `d9-documents-write-cert` | `gar_4b09e820576d7a` (`tha_7e5c250fd74953`) | **Yes**: `abb37073-5f65-43c1-9ca1-444c55c653b2`, active, alloy_managed, sandbox, private; audit `82b6ef13…`; no installation, no credential |
| `d9-documents-review-cert` | `gar_22a599230c3281` | **No.** The card reads `complete` and operator-approved (04:37:15Z), but its result is the write-cert result above: same `trusted_host_action_id`, `application_id` and `audit_id` |
| `d9-documents-write-scope-cert` | `gar_d25b3589552809` | **No.** Same aliasing (approved 04:38:16Z) |

Cause: trusted-host execution is deduplicated per execution run, and the dedupe ignores the `slug` input, so the
second and third registrations in one run replayed the first. Each remaining slug has to be filed from its **own**
execution run, and its result checked with `result.application_key == inputs.slug` before it is recorded. Payloads,
unchanged: `.vacilando-payloads/d9h2-g2-register-d9-documents-review-cert.json` and `d9h2-g3-register-d9-documents-write-scope-cert.json`.
This is a gateway defect for Host Capacity: an operator approved a card whose execution never ran.

## 2. Preconditions P4 / P5 (plan §1)

Census `gar_d394ba319fd7ab` (`tha_356ae896166dae`, 04:39:20Z), `d9w-preconditions-census.sql` `890c8ae8…`, catalog only:

| Check | Result |
|---|---|
| `document_archive(uuid,uuid,text,text,uuid,uuid)` | present |
| `document_unarchive(uuid,uuid,text,uuid,uuid)` | present |
| ledger `20261217090000` (D9.3 archive) | present |
| `open_processing_case_with_primary_source(uuid,text,uuid,text)` | present |
| ledger `20261215093000` (D10-A3 atomic open) | present |
| ledger head | `20261221100000`, 556 rows |

So W-AR / W-AR2 (archive, restore) and W-ES (24 h handoff) may be asserted live. No migration apply is needed for D9-H2.
P1 (deployed code) is staging `5db26b46`, which contains #1630; the driver's preflight re-checks `submitDocumentReview` in `/api/v1/openapi`.

## 3. Still to build (Documents, unblocked)

1. Hosted write driver `d9_hosted_write_cert.py` and its local tests, on the `d9_hosted_read_cert.py` pattern (W-S1 … W-C1; `T_W`, `T_WB`, `T_WL`, `T_R`, with `T_A` for verification reads only).
2. Run order of record for the write plan, the same shape as `D9-H1-HOSTED-RUN-ORDER.md` (pre-write census, ensure, driver, cleanup, write census, resets, close #1, post-close census, close #2).
3. `qa_d9_aged_upload_ensure` / `_reset` SQL and its runner entry (plan §3, W-ES): Documents authors it, Host Capacity registers it.
4. A Host Capacity plan request (`documents_d9_write_v1`, or a revision of `documents_d9_read_v1`), naming the five applications, eight installations, the reconciliations and the registered residue census `e7e8d3d1` (it already carries the `d9w_zr_*` checks).

## 4. Approvals after that (none requested yet)

The two remaining registrations (each from its own run) → Host Capacity plan, release and install → the Director's plan-bytes
approval naming the write driver → DEC-2 `qa_run_open` (hosted authority declared) → run cards as for D9-H1.
