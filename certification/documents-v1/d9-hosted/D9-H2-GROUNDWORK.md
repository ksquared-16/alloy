# D9-H2 groundwork (write proof): state on 2026-11-09

Documents, lane `lane_aa660dc9554d`, run `erun2_3c165c0a040129c5`. Contract: `D9-2-3-HOSTED-QA-PLAN.md` (unchanged).
Nothing here opens a QA run or creates an installation or credential, and no write case has been tested on hosted.
D9-H1 passed on `qar_242c9c123886` (`D9-H1-HOSTED-RUN-RECORD.qar_242c9c123886.md`); plan §1 P2 is satisfied.

## 1. Applications (plan §2.1, §7.1)

| Slug | Card | Registered? |
|---|---|---|
| `d9-documents-write-cert` | `gar_4b09e820576d7a` (`tha_7e5c250fd74953`) | **Yes**: `abb37073-5f65-43c1-9ca1-444c55c653b2`, active, alloy_managed, sandbox, private; audit `82b6ef13…`; no installation, no credential |
| `d9-documents-review-cert` | `gar_22a599230c3281` | **No.** The card reads `complete` and operator-approved (04:37:15Z), but its result is the write-cert result above: same `trusted_host_action_id`, `application_id` and `audit_id` |
| `d9-documents-review-cert` (refiled) | `gar_c63c05a46dcced`, run `erun2_c623dd5580480299` (`tha_34fd83d08beab5`), approved 04:46:47Z | **Yes**: `12c6e113-d9d1-4914-9ce9-89f1b8e1262a` (≠ write-cert `abb37073…`), `application_key` = slug, active, alloy_managed, sandbox, private; audit `36716651…`; no installation, no credential |
| `d9-documents-write-scope-cert` | `gar_d25b3589552809` | **No.** Same aliasing (approved 04:38:16Z) |
| `d9-documents-write-scope-cert` (refiled) | `gar_256ad4b724781d`, run `erun2_e4674586a597b1df` (`tha_ec3a21bd2e4ffa`), approved 05:12:25Z | **Yes**: `79ce84ba-7998-4fed-a2a4-5f037fe191b9` (≠ `abb37073…`, ≠ `12c6e113…`), `application_key` = slug; audit `23ffc151…`; no installation, no credential |

Cause: trusted-host execution is deduplicated per execution run, and the dedupe ignores the `slug` input, so the
second and third registrations in one run replayed the first. Both refiles ran from their own runs and registered (rows above); **all three write applications now exist**. Any future registration has to be filed from its own
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

## 3. Built locally (not run on hosted)

| Artifact | Commit | sha256 | Local proof |
|---|---|---|---|
| Write driver `d9_hosted_write_cert.py` (`preflight → install → docs → certify → cleanup`) | `4d1c6c3bd` | `7c496842…` | 12 tests, green 5/5 (`test_d9_hosted_write_cert.py` `7d4dd8a4…`); 19 planted defects each fail their row |
| Run order draft `D9-H2-HOSTED-RUN-ORDER.md` | `6ddad4daa` | `138a3fb8…` | review only |
| `qa_d9_aged_upload_ensure.sql` / `_reset.sql` | `6ddad4daa` | `e4225517…` / `b2718542…` | ran on local `alloy-cert`: guards refuse, reset runs, ensure insert shape checked in a rolled-back transaction |

The driver records contract discrepancies in its docstring (served code decides: collection routes, bare bodies, W-U2/W-U3
codes split, W-F3 medical = 422, W-L1 200/`related`, W-V1 first change 201, §5 says 4 installations but §2.2 lists 5).

## 3a. Open before a plan request

1. **Cleanup gap.** The audited staff delete answers 404 / 409 for the quarantined upload, the superseded replacement
   upload and the aged upload, so driver cleanup will report RESIDUE. A registered reset must remove them (extend the
   aged-upload reset or add one), or the run cannot close ZERO_RESIDUE.
2. **Staging wake clock: RESOLVED.** Census `gar_4caf1a889368b3` (`tha_c31aedb82c699c`, `d9w-clock-reading.sql` `839e1212…`, 05:14:29Z): `wake_count` 13,940 since 2026-09-21, last wake 268 s earlier (worker `worker-525e075e`). The deployed wake route (`5db26b46` `web/app/api/scheduled-work/wake/route.ts:88`) calls `escalateUnfiledApiUploads` on every tick. W-ES can run live; no governed wake action is needed. The run order must still allow two wakes (~10–15 min) inside the lease.
3. **Runner.** The pinned runner `qaDocumentsD9ExternalFixture.mjs` (`5af9cd7a…`) has two fixed modes. The aged-upload
   modes need a runner change (new sha256, staging merge, re-pin) or a sibling runner.
4. **W-C1 write census** query not yet written.

## 4. Approvals after that (none requested yet)

The two remaining registrations (each from its own run) → Host Capacity plan, release and install → the Director's plan-bytes
approval naming the write driver → DEC-2 `qa_run_open` (hosted authority declared) → run cards as for D9-H1.
