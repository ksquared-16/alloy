# D9-H2 hosted run order for the D9.2 / D9.3 write proof — DRAFT

**DRAFT, pending Host Capacity's plan** (`documents_d9_write_v1`, or a revision of `documents_d9_read_v1`). Documents,
2026-11-09. Nothing here opens a run, files a card or registers anything. When the plan is registered, the plan's
registry decides wherever this text disagrees, as for D9-H1, and this file is revised and pinned by bytes.

Sources: the contract `D9-2-3-HOSTED-QA-PLAN.md` (not edited); the D9-H1 order of record `D9-H1-HOSTED-RUN-ORDER.md`
(`595f2713…`), whose governed rules carry over unchanged (§1); `D9-H2-GROUNDWORK.md` (applications, P4/P5).

## 1. Governed rules that carry over from D9-H1 (installed toolkit, verified on D9-H1 reruns)

| Rule | Consequence here |
|---|---|
| A residue census binds only if it completed **after** `close.closed_at` | Close #1 closes access (`ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`); a second close naming a post-close census gives `ZERO_RESIDUE` |
| A `qa_plan` reconciliation needs exactly one OPEN, live hosted run of its plan | Both resets (aged upload, external fixture) run **before** close #1 |
| Close #1 deletes the run's session directory | Driver cleanup (audited document deletes, revokes) runs before close #1 |
| `database.read_census` is never reused (`reuseAuthorized: () => false`) | Pre-write and post-close censuses may be filed in one execution run; freshness is a distinct `tha_` and `census_run_at` after `closed_at` |
| **Other** trusted-host actions ARE deduplicated per execution run, ignoring inputs (measured 2026-11-09: three application registrations in one run replayed the first) | The two reconciliations of one kind (none here) or two registrations must come from different runs. Ensure and reset are different reconciliations, so they do not collide; verify each result names its own `reconciliation_key` and `qa_run_id` |
| Residue census `e7e8d3d1` already carries `d9w_zr_tagged_documents`, `d9w_zr_tagged_objects`, `d9w_zr_active_installations`, `d9w_zr_active_credentials`, `d9w_zr_escalation_cases` | No new residue census is needed for the write run |

## 2. The 24-hour handoff (W-ES): how the wake actually runs on staging

- The escalation runs inside `GET|POST /api/scheduled-work/wake` (`escalateUnfiledApiUploads`). It needs no input, reads
  every org's unfiled `/api/v1` uploads older than 24 h, and opens one Processing case each. It reads no bytes.
- `web/vercel.json` declares a 5-minute Vercel cron for it, but **Vercel fires crons only from Production; staging is
  Preview** (`docs/platform/governance/deployment-and-environments.md`). The Director's 2026-09-21 decision is an
  **external scheduler** for staging. Whether it is running today is not known to Documents. The table
  `scheduled_work_clock` (`wake_count`, `last_wake_at`) answers it, read by census.
- The endpoint authenticates with `CRON_SECRET` / `INTERNAL_CRON_TOKEN`. The lane holds neither, and the installed
  toolkit has no governed action that calls the wake. So the run cannot trigger it.
- Consequences:
  - The run never waits 24 h. The aged-upload ensure inserts the upload already 25 h old.
  - If the clock runs every 5 min, the case appears within about 5 min of the ensure. W-ES's "a second wake adds nothing" needs one more wake after that, so allow at least two `last_wake_at` advances (about 10–15 min) inside the lease.
  - If the clock is **not** running, W-ES cannot be proven live. The driver then records W-ES as `NOT_RUN: staging clock idle` with the census reading. It is neither a pass nor a product failure. Making it runnable is Host Capacity's (a governed wake action) or the operator's (the scheduler).
- Late filing must come from T_W itself: the filing is accepted only from the installation that received the upload.
  So T_W stays installed from the aged-upload ensure until W-ES's late filing. The driver needs a split: `install`
  (create the installations and credentials and keep them) before the ensure, then `certify`, which revokes on every path in `finally`.
  **This is a requirement on the write driver** (owned separately).

## 3. Order

| # | Step | Who | Gate it satisfies |
|---|---|---|---|
| 0 | Pins: the plan registered with the 5 applications and 8 installations; write driver sha256 and its tests; this file (revised to final, vendored, sha256); reconciliations `qa_d9_external_fixture_*` (runner `5af9cd7a…`, unchanged) and `qa_d9_aged_upload_*` (§4); residue census `e7e8d3d1`; the Director's plan-bytes approval naming the write driver; `eligible_plans`; release and install | Host Capacity, Director | Plan evidence bound to the registered driver |
| 0a | Applications registered, each verified by `result.application_key == inputs.slug`: write-cert `abb37073…` (done), review-cert (`gar_c63c05a46dcced`, own run), write-scope-cert (pending, own run) | Kelly (cards) | Plan §2.1 |
| 1 | `environment.qa_run_open` with `hosted_qa_authority` declared (plan §6.1). Lease covers steps 2–13, including approval waits and the W-ES wake window | Kelly (DEC-2) | — |
| 2 | **Pre-write census**: `d9-residue-census.sql` (`e7e8d3d1`), all 15 true. Plus a read of `scheduled_work_clock` (`wake_count`, `last_wake_at`) to decide whether W-ES can run (§2) | Documents | Plan §6.2 "before writes" |
| 3 | `qa_d9_external_fixture_ensure` (D9.1 subjects; unchanged) | Documents (governed reconciliation) | Open run |
| 4 | Driver `preflight` (P1 served SHA and `submitDocumentReview` in `/api/v1/openapi`; all write applications active and not installed in either org) → `install` (T_W, T_WB, T_WL, T_R, T_A; one credential each, held in memory only) | Documents | §2.2 |
| 5 | `qa_d9_aged_upload_ensure`: one 25-hour-old unfiled upload in QA Shared, `received_via` = T_W (resolved by the SQL) | Documents (governed reconciliation) | W-ES precondition |
| 6 | Driver `docs` / `certify`: W-S1 … W-RQ1, W-AR, W-AR2 (P4 holds per `gar_d394ba319fd7ab`), then W-ES: wait for the case (bounded by the clock reading), confirm it in the Processing documents queue as `fixture_admin`, wait for a second wake (no second case), then T_W files the aged upload late → the case closes. `finally` revokes every credential and disconnects every installation | Documents | Cases W-* |
| 7 | Driver `cleanup`: revoke and disconnect anything still active; delete every `qa-d9w-<run>` document (the aged upload included) through the audited admin delete; verify 404. Verdict `CLEAN` | Documents | Sessions still present |
| 8 | **Write census (W-C1)**, read-only: every effect in a QA org, and every effect's audit row written first. Query to be written with the driver (not yet drafted); runs before the resets, as D9-H1's case 11 census did | Documents | Plan §4 W-C1 |
| 9 | `qa_d9_aged_upload_reset`: the W-ES Processing case and, if cleanup missed it, the aged row; asserts none remain | Documents (governed reconciliation) | Needs the run OPEN; before the external reset |
| 10 | `qa_d9_external_fixture_reset` (refuses while a document still references C1; step 7 and step 9 remove them) | Documents (governed reconciliation) | Needs the run OPEN |
| 11 | `environment.qa_run_close` #1 → `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED` | Documents (operator approval) | — |
| 12 | **Post-close residue census** `e7e8d3d1`, a new `tha_`, `census_run_at` after `closed_at`, all 15 true | Documents | Runs after `closed_at` |
| 13 | `environment.qa_run_close` #2 with `residueCensusRequestId` = step 12 → **`ZERO_RESIDUE`** | Documents (operator approval) | — |

Any security stop in step 6 still goes through steps 7 and 9–13; access closes on every path.

## 4. Runner entries Host Capacity must add (proposed)

On the D9-H1 pattern (`lib/reconciliation-registry.mjs`), fixture safety `qa_documents_d9_external`, plan as registered:

| key | runner | fixture | frozen context |
|---|---|---|---|
| `qa_d9_aged_upload_ensure` | a runner mode such as `dev:qa:documents-d9-aged-upload-ensure` | `d9-hosted/qa_d9_aged_upload_ensure.sql` | `ORG_ID` = QA Shared `4acc9386-…`; `QA_RUN_ID` from the ledger |
| `qa_d9_aged_upload_reset` | `dev:qa:documents-d9-aged-upload-reset` | `d9-hosted/qa_d9_aged_upload_reset.sql` | same |

The pinned runner `web/scripts/qaDocumentsD9ExternalFixture.mjs` (`5af9cd7a…`) has a fixed mode table of the two
external fixtures, so the new modes need a runner change (a new sha256 and a staging merge) or a sibling runner. The
SQL takes only `:org` and `:qa_run_id`, as the existing runner passes them (`psql -v org=… -v qa_run_id=…`). T_W is
resolved inside the SQL, so no new runner input is needed.

## 5. Open

1. Is the staging external scheduler running? (`scheduled_work_clock` census; step 2.)
2. If it is not, a governed wake action (Host Capacity), or W-ES recorded as not run.
3. The write driver's `install` / `certify` split (§2), and the W-C1 census query.
4. Runner change versus sibling runner for the aged-upload modes (§4).
5. The admin delete of a document whose object never existed (the aged upload) is expected to succeed. Storage `remove` of a missing path is not an error. Confirm against the route; if it refuses, step 9's reset removes the row instead.
