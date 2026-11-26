# D9-H1 hosted run record: `qar_143a8fbcad49` (rerun 2)

Documents, 2026-11-09. Plan `documents_d9_read_v1` on `alloy_staging_web`, run order of record `6376729c8`
(`D9-H1-HOSTED-RUN-ORDER.md` sha256 `595f2713…`), driver `bfed4a96…` (approval `gar_f8690e97083220`), installed toolkit
`2df1e663896a`. Staging served `5db26b46` (PR #1637: reinstall after disconnect, migration `20261221100000` verified by
census `gar_7d515998fe2afe`). Read scope only: no D9 write or review testing, no scanner or retrieval traffic.

Earlier records are unchanged: `qar_7d7ec3d86bdd` 35 passed / 5 failed, ZERO_RESIDUE; `qar_31100f9d04e5` blocked at
driver preflight (revoked installations held `uq_app_installations_app_org`), ZERO_RESIDUE.

## Result

**41 passed, 2 failed. Case 11 PASS. Closed ZERO_RESIDUE.**

| Case | Result |
|---|---|
| 1–5, 7–9, 13 | pass (as in `qar_7d7ec3d86bdd`) |
| 6 detail, 14 version-current | **pass** (first time on staging; driver reads the `{data:{...}}` envelope) |
| 10 download link ×2 | **FAILED.** Status 200, `document_id` = `D_STD_C`, URL host `*.supabase.co` and no `path` all held. The driver's bound `0 < ttl <= 600` failed: ttl 600.13 s and 600.27 s, computed as the server's `expires_at` minus **this host's** response-arrival time. A 600 s link can only measure over 600 if the server clock leads this host's, and the census timestamps independently show it does (below). The product's TTL is not shown to be wrong. The bound is a zero-margin cross-clock comparison, and it stays recorded as failed |
| 11 audited before minting | **pass**: history counts 0→1, 1→2 (T_A), 0→0 (T_B refused); census join `CASE_11_PASS` |
| 12 new link per call | **pass** |

Case 11 clock comparison (information only): the two `T_A` audit rows' `created_at` are 1.734 s / 1.791 s after send and
0.049 s / 0.212 s **after** the response arrived, by this host's clock. That is impossible without the server clock
leading, which is the same skew that lifts case 10's ttl over 600.

## Steps

| # | Step | Request | Result |
|---|---|---|---|
| 1 | `qa_run_open` (DEC-2), 12 h lease | `gar_e620862b984c66` | OPEN 01:49:07.778Z; `fixture_admin`, `cross_org_admin` sessions verified |
| 2 | Pre-write residue census `e7e8d3d1` | `gar_c6eeae921db25f` (`tha_ad8452320f0a4c`) | 15/15 true, 01:57:18.486Z; retained 4 revoked installations, 22 security-audit rows, 2 link rows |
| 3 | `qa_d9_external_fixture_ensure` | `gar_215bee884baa2c` (`tha_82dada1d00e943`) | seeded, exit 0 |
| 4 | Driver `preflight` / `docs` / `certify` | — | READY (all four application slots free); 12/12 uploaded; **41 passed, 2 failed**, stop none; access closed (4 credentials revoked, 4 installations disconnected, all 200) |
| 5 | Driver `cleanup` | — | CLEAN: 12 documents deleted, each re-read 404; 8 installations listed, all already revoked |
| 6 | Case 11 link-audit census `837416d1` | `gar_68fd3d757c2e77` (`tha_09a6a2ec39c190`) | 4/4 checks; exactly 2 rows on this run's T_A installation `1b9ef9bb` (credential `63b61fae`, `D_STD_C`); 0 on T_B/T_L/T_N; the other 2 D9 rows are `qar_7d7ec3d86bdd`'s on its own installation `276fda26`; `CASE_11_PASS` |
| 7 | `qa_d9_external_fixture_reset` | `gar_9c7882d12d2f2b` (`tha_448017d2770d5f`) | exit 0, residue 0 |
| 8 | `qa_run_close` #1 | `gar_080df9a675c782` (`tha_373fe2c53af5e7`) | CLOSED 02:09:22.509Z, `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`, sessions removed |
| 9 | Post-close residue census `e7e8d3d1` | `gar_51477ee9796aa2` (`tha_156f05e18a3682`) | 15/15 true, 02:10:10.777Z; retained now 8 revoked installations, 42 security-audit rows, 4 link rows (this run's 4, 20 and 2 added) |
| 10 | `qa_run_close` #2 naming step 9 | `gar_b0efd299bb98ba` (`tha_e4324b63ebb760`) | **`ZERO_RESIDUE`**, `census_attached` 02:11:11.376Z |

Steps 3, 9 and 10 executed under recorded operator approvals without a prompt reaching the lane.

## Open

- **Case 10 bound.** The bound needs a clock-independent form, as case 11 got. For example, compare `expires_at` against
  the server's own `Date` response header, or allow a stated skew margin. That is a driver change (new sha256, re-pin and
  a new plan-bytes approval), and Kelly decides whether it is worth one. No product change is indicated.

## Receipts

`d9r_residue_census.prewrite.qar_143a8fbcad49.json`, `d9r_residue_census.postclose.qar_143a8fbcad49.json`,
`d9r_link_audit_census.qar_143a8fbcad49.json` (verdict) and `.raw.`, and `../d9r_hosted_{preflight,fixture_ids,results,reset_results}.qar_143a8fbcad49.json`.
