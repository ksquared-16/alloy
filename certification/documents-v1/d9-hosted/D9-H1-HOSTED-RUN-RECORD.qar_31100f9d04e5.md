# D9-H1 hosted rerun record: `qar_31100f9d04e5`

Documents, 2026-11-08/09. Plan `documents_d9_read_v1` on `alloy_staging_web`, run order of record `6376729c8`
(`D9-H1-HOSTED-RUN-ORDER.md` sha256 `595f2713…`), driver `bfed4a96…` (approval `gar_f8690e97083220`), installed toolkit
`2df1e663896a`, staging served `d93d6e17`. Read scope only: no D9 write or review testing, no scanner or retrieval
traffic.

**The matrix did not run.** Driver `preflight` stopped; `docs` and `certify` refused. There is no rerun result for any
case: 6, 10 ×2, 12 and 14 stay unproven, and case 11's audit-order checks were not exercised. The first run's record
(`D9-H1-HOSTED-RUN-RECORD.qar_7d7ec3d86bdd.md`: 35 passed, 5 failed, `ZERO_RESIDUE`) is unchanged.

## Pre-open verification

- Installed `QA_PLANS.documents_d9_read_v1`: driver `bfed4a96…` @ `6376729c8` (vendored), run order `595f2713…`
  (supersedes `8b8e1fe6…`), contract `1e9daebb…`, residue census `e7e8d3d1…`. Worktree bytes hash to the same values;
  link-audit census `837416d1…`, runner `5af9cd7a…`.
- `documents_d9_read_plan_approved` = `gar_f8690e97083220`, `driver_sha256` `bfed4a96…` (equals the pin);
  `gar_4490c623c20377` in `SUPERSEDED_PLAN_EVIDENCE`.
- `hostedQaActivationOpen(run, documents_d9_read_v1)` → `ok: true`; no-send guard evidence valid to 2026-11-19.
- No other QA run open.

## Steps

| # | Step | Request | Result |
|---|---|---|---|
| 1 | `qa_run_open` (DEC-2), 12 h lease | `gar_611195cd655785` (`tha_8908a2d6353c1a`) | OPEN 21:21:56.332Z; `fixture_admin`, `cross_org_admin` sessions verified, no roles or scope, 0 sends |
| 2 | Pre-write residue census `e7e8d3d1` | `gar_bf2d2be68c81ea` (`tha_1aa2c807950e6c`) | 15/15 true, `census_run_at` 21:38:27.299Z. Retained: 2 applications, 4 revoked installations, 22 security-audit rows, 2 link-issued rows |
| 3 | `qa_d9_external_fixture_ensure` | `gar_a8e1e8eddec0c1` (`tha_fd2afb5d3ee61e`) | seeded, exit 0 (3 enrollments, 2 relationships) |
| 4 | Driver `preflight` | — | **STOP**: `served_sha_contains_d9_1` ok; all four `<persona>:<application>` checks `already_installed: true`. `docs`/`certify` not run: no upload, installation or credential |
| 5 | Driver `cleanup` | — | CLEAN, no writes: 4 installations found, all `already` revoked (the first run's); 0 documents |
| 6 | Case 11 link-audit census | — | **Not filed**: no link call was made, nothing to audit |
| 7 | `qa_d9_external_fixture_reset` | `gar_a99c360a877c47` (`tha_2c754393fd0f8d`) | exit 0, residue 0 (3 agreements, 2 relationships, 3 customer members, 2 persons, 2 customers; 0 documents, objects, audit rows) |
| 8 | `qa_run_close` #1 | `gar_68e49e59e9b72e` (`tha_3b38dd63bb830a`) | CLOSED 00:15:37.434Z, `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`, sessions removed, both identities signed out |
| 9 | Post-close residue census `e7e8d3d1` | `gar_4bcf5c0bdb20ba` (`tha_abe57e5a9f2a7e`) | 15/15 true, `census_run_at` 00:21:24.791Z (after `closed_at`); retained counts identical to step 2 (4 revoked installations, 22 security-audit rows, 2 link rows): the rerun issued nothing |
| 10 | `qa_run_close` #2 naming step 9 | `gar_5e0c9127f89b28` (`tha_c0a72ceb815317`) | **`ZERO_RESIDUE`**, `census_attached` 00:22:18.273Z (operator approval recorded 00:22:17.930Z, no prompt surfaced to the lane) |

## Blocker: one installation per application per organization, revoked rows included

- `uq_app_installations_app_org ON app_installations (application_id, org_id)`
  (`supabase/migrations/20260910190000_developer_platform_trust_foundation.sql:120`) is not partial.
- `POST /api/admin/integrations/installations` maps that violation to 409 "already connected".
- `listApprovedApplications` (`web/lib/platform/admin/integrationsService.ts`) sets `alreadyInstalled` from any
  `app_installations` row for the org, revoked or not.
- `qar_7d7ec3d86bdd` revoked and disconnected its T_A, T_B, T_L, T_N, and the plan retains those rows by design.
  They occupy the only slot each (application, org) pair has, so no second run of this plan can install.

The driver's preflight caught it before any write. Options, each needing a decision: make the index (and
`alreadyInstalled`) exclude revoked installations (migration + product change); register fresh D9 application slugs
per run (registration cards and a plan, driver and census re-pin); or delete the revoked rows (contradicts
`retained_by_design`; no registered action).

## Receipts

`d9r_residue_census.prewrite.qar_31100f9d04e5.json`, `d9r_residue_census.postclose.qar_31100f9d04e5.json`,
`../d9r_hosted_preflight.qar_31100f9d04e5.json`, `../d9r_hosted_reset_results.qar_31100f9d04e5.json`.
