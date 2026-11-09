# D9-H1 hosted run record: `qar_242c9c123886` (rerun 3)

Documents, 2026-11-09. Plan `documents_d9_read_v1` on `alloy_staging_web`, run order of record `6376729c8`
(`D9-H1-HOSTED-RUN-ORDER.md` sha256 `595f2713…`), driver `21bfb673…` (Documents `e718d7132`, approval
`gar_7469e66d7d36bd`), installed toolkit `6c9eb3564fe7`. Staging served `5db26b46` (unchanged from rerun 2). Read scope
only: no D9 write or review testing, no scanner or retrieval traffic.

Earlier records are unchanged: `qar_143a8fbcad49` **41 passed / 2 failed** (case 10 ×2 on driver `bfed4a96`'s cross-clock
bound), ZERO_RESIDUE; `qar_7d7ec3d86bdd` 35 passed / 5 failed, ZERO_RESIDUE; `qar_31100f9d04e5` blocked at driver
preflight, ZERO_RESIDUE. This run is a separate result and does not rewrite any of them.

## Result

**43 passed, 0 failed. Case 10 PASS ×2. Case 11 PASS. Closed ZERO_RESIDUE.**

| Case | Checks | Result |
|---|---|---|
| 1 | 4 | pass |
| 2 | 1 | pass |
| 3 | 3 | pass |
| 4 | 2 | pass |
| 5 | 1 | pass |
| 6 detail | 1 | pass |
| 7 indistinguishable 404 | 15 | pass |
| 8 cross-org | 5 | pass |
| 9 | 3 | pass |
| 10 download link | 2 | **pass** (first time on staging) |
| 11 audited before minting | 3 | pass; census join `CASE_11_PASS` |
| 12 new link per call | 1 | pass |
| 13 | 1 | pass |
| 14 version-current | 1 | pass |

Case 10, per call (status 200, `document_id` = `D_STD_C`, URL host `ikaxilmwmrmbagoidedu.supabase.co`, no `path`):

| Call | Enforced `exp − iat` (≤ 600) | Declared `expires_at − Date` (≤ 602) | This host's clock (information only) |
|---|---|---|---|
| 1 | 600 | 600.598 s | 600.367 s |
| 2 | 600 | 600.420 s | 600.368 s |

The host-clock reading is again over 600, as in `qar_143a8fbcad49` (600.13 / 600.27): the server clock leads this host's.
Case 11's clock comparison (information only) shows the same skew: the two `T_A` audit rows' `created_at` are 1.808 s /
1.958 s after send and 0.152 s / 0.301 s **after** the response arrived, by this host's clock.

## Steps

| # | Step | Request | Result |
|---|---|---|---|
| 0 | Pins | — | Installed `6c9eb3564fe7`: driver `21bfb673` = worktree, approval `gar_7469e66d7d36bd` bound and current; contract, run order, both censuses, ensure/reset SQL and runner `5af9cd7a` (= `origin/staging` object) match. `/api/build-info` `5db26b46` = `origin/staging`. Activation gate open; ledger all CLOSED |
| 1 | `qa_run_open` (DEC-2), 12 h lease | `gar_5d9186d16a6a17` | OPEN 04:03:39.089Z (lease to 16:03:39Z); `fixture_admin`, `cross_org_admin` sessions verified |
| 2 | Pre-write residue census `e7e8d3d1` | `gar_a2fb7787f3b4be` (`tha_4387db63a8dd1d`) | 15/15 true, 04:09:46.433Z; retained 8 revoked installations, 42 security-audit rows, 4 link rows |
| 3 | `qa_d9_external_fixture_ensure` | `gar_c97f6e7f98eaab` (`tha_80172b53960f65`) | seeded, exit 0 |
| 4 | Driver `preflight` / `docs` / `certify` | — | READY (all four application slots free); 12/12 uploaded; **43 passed, 0 failed**, stop none; access closed (4 credentials revoked, 4 installations disconnected, all 200) |
| 5 | Driver `cleanup` | — | CLEAN: 12 installations closed, 12 documents removed, remaining none |
| 6 | Case 11 link-audit census `837416d1` | `gar_21e2724df48425` (`tha_b114607ba3d371`) | 4/4 checks, 04:20:25.870Z; 6 D9 link rows, exactly 2 on this run's T_A installation `3fd353d1` (credential `999881c8`, `D_STD_C` `8339bfae`); 0 on T_B/T_L/T_N; the other 4 are `qar_7d7ec3d86bdd`'s and `qar_143a8fbcad49`'s on their own installations; `CASE_11_PASS` |
| 7 | `qa_d9_external_fixture_reset` | `gar_ebc00bc28229f2` (`tha_fbd21818e2acba`) | exit 0, residue 0 |
| 8 | `qa_run_close` #1 | `gar_bafb6741591720` (`tha_15170bcd52f42b`) | CLOSED 04:26:20.166Z, `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`, sessions removed |
| 9 | Post-close residue census `e7e8d3d1` | `gar_1c6b4dff8003ab` (`tha_aab008c4d255f3`) | 15/15 true, 04:27:04.272Z (executed 04:26:58.077Z, after `closed_at`; a different execution from step 2's `tha_4387db63a8dd1d`); retained now 12 revoked installations, 62 security-audit rows, 6 link rows (this run's 4, 20 and 2 added) |
| 10 | `qa_run_close` #2 naming step 9 | `gar_65ca85e4aebbd8` (`tha_22e120b38c2ce1`) | **`ZERO_RESIDUE`**, residue census `gar_1c6b4dff8003ab` bound |

Every write and close step executed under a recorded operator approval.

## Receipts

`d9r_residue_census.prewrite.qar_242c9c123886.json`, `d9r_residue_census.postclose.qar_242c9c123886.json`, `d9r_link_audit_census.qar_242c9c123886.json` (verdict) and `.raw.`,
and `../d9r_hosted_{preflight,fixture_ids,results,reset_results}.qar_242c9c123886.json`.
