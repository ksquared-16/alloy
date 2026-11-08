# D9-H1 hosted run record: `qar_7d7ec3d86bdd`

Documents, 2026-11-08. Plan `documents_d9_read_v1` on `alloy_staging_web`, run order of record `ccb368d91`
(`D9-H1-HOSTED-RUN-ORDER.md` sha256 `8b8e1fe6…`), driver `6f1b52c8…`, staging served `d93d6e17`. Read scope
only: no D9 write or review testing, no scanner or retrieval traffic.

## Steps

| # | Step | Request | Result |
|---|---|---|---|
| 1 | `qa_run_open` (DEC-2), 12 h lease | `gar_f8c73560553249` | OPEN 15:46:37Z, lease to 03:46:37Z; `fixture_admin`, `cross_org_admin` sessions, no roles or scope |
| 2 | Pre-write residue census `e7e8d3d1` | `gar_659e987d0fe786` (`tha_663d1bbf323e8d`) | 15/15 true |
| 3 | `qa_d9_external_fixture_ensure` | `gar_e5719173b94915` (`tha_eaf635a5f70053`) | seeded, exit 0 |
| 4 | Driver `preflight` / `docs` / `certify` | — | READY; 12/12 uploaded; **35 passed, 5 failed**, stop none, access closed (4 revoked, 4 disconnected, all 200) |
| 5 | Driver `cleanup` | — | CLEAN: 4 installations closed, 12 documents removed, remaining [] |
| 6 | Case 11 link-audit census `837416d1` | `gar_3ae29f364c7704` (`tha_98194047dad66d`) | 4/4 checks; criteria 1 and 2 met; criterion 3 **timing inconclusive** |
| 7 | `qa_d9_external_fixture_reset` | `gar_a19de9f19397cf` (`tha_1b2ca207c6a74c`) | reset, exit 0, residue 0 |
| 8 | `qa_run_close` #1 | `gar_5e81828debb235` (`tha_9dcb944056a479`) | CLOSED 17:41:51.434Z, `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`, sessions removed |
| 9 | Post-close residue census `e7e8d3d1` | `gar_2a3e786c4c5a6d` (`tha_c0fb25707a9bc3`) | 15/15 true, `census_run_at` 17:42:22.864Z |
| 10 | `qa_run_close` #2 naming step 9 | `gar_61db8fa6abdb2e` (`tha_2dd4892815c974`) | **`ZERO_RESIDUE`**, `census_attached` 17:43:21.032Z |

## Open findings

1. **Driver envelope defect (cases 6, 10 ×2, 12, 14).** Each is a T_A positive read that returned HTTP 200. The
   deployed single-resource routes answer `{"data": {...}}` (`web/lib/platform/external/resources/documentResources.ts:94`
   at `d93d6e17`); the driver reads `id`, `url`, `document_id` and `current_version` at the top level. Not a refusal
   and not a leak; the receipt holds body hashes only, so these cases are **unproven**, not passed. Case 11's two
   audited link rows on `D_STD_C` inside the case 10 windows corroborate that both link calls issued a link. Fixing it
   changes the pinned driver hash and needs a new approved run.
2. **Case 11 timing.** Both rows fall inside their call windows (after send +0.776 s / +0.722 s; before response
   +0.140 s / +0.082 s), but each window is under 1 s, so the 2 s clock bound can only give *inconclusive*. For Kelly.
3. **Run order §1, census dedupe row, is stale.** Installed toolkit `d956e89b9bfe` declares `database.read_census`
   `reuseAuthorized: () => false`: a new request is a new observation. Step 9 was filed from the same execution run as
   step 2 and proved fresh by a distinct trusted-host action and `census_run_at` after `closed_at`.
4. The close cards described the run as "isolated, lane-owned"; the record is hosted. Display only.

## Receipts

`d9r_residue_census.prewrite.*`, `d9r_residue_census.postclose.*`, `d9r_link_audit_census.*` (verdict) and
`.raw.*`, and the driver's `d9r_hosted_{fixture_ids,preflight,results,reset_results}.*` for this run.

## Follow-up (2026-11-08, after the run)

Driver `bfed4a96…` (Documents `6376729c8`) reads the envelope and proves case 11's order by history counts, not
clocks. It does not change this run: its five failures stay failed and case 11 stays timing inconclusive. Re-pin
request: `HOST-CAPACITY-D9-H1-DRIVER-REPIN.md`; rerun path: `D9-H1-RERUN-PATH.md`.
