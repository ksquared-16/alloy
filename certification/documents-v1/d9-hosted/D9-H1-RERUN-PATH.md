# D9-H1 rerun: the smallest governed path to prove cases 6, 10, 11, 12, 14

Documents, 2026-11-08. `qar_7d7ec3d86bdd` stays as recorded: 35 passed, 5 failed, `ZERO_RESIDUE`, case 11 timing
inconclusive. A rerun produces a **new** receipt under a new `qar_…`; it never edits that one.

## Gate (before any hosted action)

| # | Action | Who | Approval |
|---|---|---|---|
| G1 | Plan-bytes approval naming driver `bfed4a96…`, run order `595f2713…`, contract `1e9daebb…` (unchanged), and the read-only `fixture_admin` staff-history reads | Director (Kelly) | 1 card |
| G2 | One reviewed toolkit change: driver pin + run-order pin + that approval, together (`HOST-CAPACITY-D9-H1-DRIVER-REPIN.md` §3) | Host Capacity | review |
| G3 | Release and install of that toolkit | Host Capacity / Vacilando | governed install |

Until G3 is installed, an open is admitted but the plan gate binds the old driver: running `bfed4a96` under it would
run unapproved bytes. Documents will not file DEC-2 before G3.

## Run (run order `595f2713…`, steps unchanged from `qar_7d7ec3d86bdd`)

| Step | Card | Notes |
|---|---|---|
| 1 | DEC-2 `environment.qa_run_open`, `documents_d9_read_v1`, `alloy_staging_web`, `hosted_qa_authority` declared | 2 personas, sessions only |
| 2 | `database.read_census` `e7e8d3d1` (pre-write) | all 15 true |
| 3 | `qa_d9_external_fixture_ensure` | |
| 4 | — driver `preflight`, `docs`, `certify` | 4 installations, 1 credential each, created and closed **inside** the approved run by the approved driver; no separate card |
| 5 | — driver `cleanup` | expect CLEAN |
| 6 | `database.read_census` `837416d1` (link audit) | criteria 1–2, and its two new T_A rows match the history counts |
| 7 | `qa_d9_external_fixture_reset` | needs the run OPEN |
| 8 | `qa_run_close` #1 | `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED` |
| 9 | `database.read_census` `e7e8d3d1` after `closed_at` | same execution run is fine (distinct `tha_`) |
| 10 | `qa_run_close` #2 naming step 9 | `ZERO_RESIDUE` |

Eight run cards, the same as `qar_7d7ec3d86bdd` (there, steps 9 and 10 executed under a recorded grant without a
prompt; do not assume that again).

## Why the full matrix, not just the five

A targeted mode (T_A on `D_STD_C` and `D_SUP`, T_B for the refused link) saves no card: open, ensure, reset, two closes
and three censuses are needed either way. It would add a driver path that has never run and needs its own approval,
and it would drop the re-check of the 35 on today's build. The full matrix costs two more installations per run and
nothing else.

## Acceptance for the rerun

- Cases 6, 10 (both calls), 12, 14 pass on staging; any failure is recorded as failed.
- Case 11: three history rows pass (T_B 0 → 0; T_A 0 → 1, 1 → 2), and the link census's two T_A rows on `D_STD_C` meet
  criteria 1–2. Clock margins are reported, not judged.
- The other 35 still pass, or a regression is recorded.
- Cleanup CLEAN; fixture reset residue 0; close #2 `ZERO_RESIDUE` bound to a census read after `closed_at`.
