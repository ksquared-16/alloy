# D9-H1 hosted run order for `documents_d9_read_v1`, reconciled with the governed plan

Documents, 2026-11-07. This sets the order for the one hosted run. It reconciles three sources:

- the contract `D9-1-HOSTED-QA-PLAN.md` (`1e9daebb…`, pinned, not edited);
- `HOST-CAPACITY-D9-H1-RUNNER-AND-DRIVER-HANDOFF.md` §4 and §7;
- the governed plan Host Capacity registered (`bf44bdc4`): `lib/qa-plan-registry.mjs`, `lib/reconciliation-registry.mjs`,
  `lib/reconciliation-preflight.mjs` and `lib/qa-run-action.mjs`.

Where they disagree, the governed plan decides, because the gateway enforces it. Nothing here opens a run.

## 1. What the governed plan enforces

| Rule (source) | Consequence |
|---|---|
| `verifyResidueCensus`: the census must have completed **after** `close.closed_at` (`qa-run-action.mjs`) | A census read before the close cannot bind. A first close with it attached closes `ACCESS_CLEAN_FIXTURES_UNVERIFIED`, never `ZERO_RESIDUE` |
| A closed run accepts only census evidence; `residueCensusRequestId` on a closed run re-states the verdict (`executeQaRunCloseSync`, `already_closed`) | `ZERO_RESIDUE` comes from a **second** `qa_run_close` naming the census. This is the pattern `qar_b74d93c3d853` used (`gar_80c1d40f2f1658`) |
| A `qa_plan` reconciliation needs exactly one OPEN, live hosted run of its plan; `QA_RUN_ID` comes from the ledger (`reconciliation-preflight.mjs`) | `qa_d9_external_fixture_reset` must run **before** the first close |
| The close deletes the run's session directory (`qaRunSessionDir`) | Driver `cleanup`, which signs in with those sessions, must run **before** the first close |
| The residue census binds by its pinned hash `e7e8d3d1…`, 15 checks, read on `alloy_deployed_primary` | The plan's residue census is `d9-residue-census.sql`, not the authz_q1 20-check census that contract §6.3 names |
| A census request dedupes within one execution run | The pre-write and post-close readings of `e7e8d3d1…` must come from **different** execution runs |

## 2. Order

| # | Step | Who | Gate it satisfies |
|---|---|---|---|
| 0 | Pins at the staging merge (runner `5af9cd7a…` on both entries, driver `6f1b52c8…`); plan-bytes approval naming the driver; `eligible_plans`; release and install | Host Capacity, Director | `documents_d9_read_plan_approved`, `awaiting_alloy_pins` cleared |
| 1 | `environment.qa_run_open` with `hosted_qa_authority` declared. Set the lease to cover steps 2–9, including operator approval waits (the R2/R5 run waited twice on reset approvals) | Kelly (DEC-2) | — |
| 2 | **Pre-write census**: `database.read_census` of `d9-residue-census.sql` (`e7e8d3d1…`). Every `d9_zr_*` / `d9w_zr_*` check true and `d9_zr_qa_orgs_resolve` true | Documents | Contract §5 "before writes". This step was missing from the handoff's §7.3 sequence |
| 3 | `qa_d9_external_fixture_ensure` | Documents (governed reconciliation) | Open run |
| 4 | Driver `preflight` → `docs` → `certify` (`finally` revokes and disconnects on every path) | Documents | Cases 1–10, 12–14 |
| 5 | Driver `cleanup`: revoke and disconnect anything still active, delete tagged documents, verify 404. Verdict `CLEAN` | Documents | Sessions still present |
| 6 | **Case 11 census**: `database.read_census` of `d9-link-audit-census.sql` (§3). Read-only; audit rows are retained by design, so it reads the same before or after the document delete. It runs after `certify`, before the close | Documents | Contract §4 case 11 |
| 7 | `qa_d9_external_fixture_reset`: the `d9000000-` namespace is empty in its own transaction | Documents (governed reconciliation) | Needs the run still OPEN |
| 8 | `environment.qa_run_close` #1: closes access and removes sessions; sets `closed_at`. Expected verdict `ACCESS_CLEAN_FIXTURES_UNVERIFIED`. This is not a failure | Documents (operator approval) | — |
| 9 | **Residue census**: `database.read_census` of `d9-residue-census.sql` (`e7e8d3d1…`) from an execution run other than step 2's. All 15 checks true | Documents | Runs after `closed_at` |
| 10 | `environment.qa_run_close` #2 with `residueCensusRequestId` = step 9 → **`ZERO_RESIDUE`** | Documents (operator approval) | Binds the census |

Any security stop in step 4 still goes through 5, 7, 8, 9 and 10. Access closes on every path.

## 3. Case 11: the download-link audit check

Contract case 11 requires three things:
- one `document_link_issued` for `D_STD_C` naming the application, installation and credential of `T_A`;
- that row created before the response;
- none for refused calls.

No census covered it. The residue census's `d9_xo_link_audit_untagged` asks only whether link rows name tagged documents. `d9-link-audit-census.sql` adds it:
- **Checks**, which stay true for every D9 read run:
  - `d9_l11_link_rows_present`
  - `d9_l11_attribution_complete`: the credential belongs to the installation, the installation to the application and to the event's org
  - `d9_l11_no_scope_cert_links`
  - `d9_l11_no_secondary_links`
- **Data** `d9_l11_rows`: `event_id`, `created_at`, `document_id`, `org`, `application`, `installation_id`, `credential_id`, one per D9 link row. Ids and timestamps only.

**Run-scoped verdict.** Join `d9_l11_rows` with `d9r_hosted_fixture_ids.<qar>.json` and `d9r_hosted_results.<qar>.json`. Case 11 passes only if every check is true and:

1. **Exactly two rows on `T_A`'s installation.** That installation is `installations.T_A.installation_id`. Each row has `credential_id` = `T_A`'s credential and `document_id` = `documents.D_STD_C.id`. Two rows means case 12 made two audited calls.
2. **No refused call is audited.** Zero rows on `T_B`, `T_L` or `T_N`'s installations. On `T_A`'s installation, no row has a `document_id` other than `D_STD_C`. That covers the held-document and `D_B` link calls in cases 7 and 8.
3. **Audited before the response.** Order `T_A`'s rows by `created_at`, and the case 10 calls by `call_index`. For each call `i`: `sent_at ≤ row_i.created_at ≤ response_at`.
   - `created_at` is the database clock and the call times are the driver host's clock. The driver records no server clock.
   - The join reports each row's margin to both window edges.
   - A row outside its window by more than 2 s fails the case.
   - A row inside the window, but within 2 s of an edge, is reported as timing **inconclusive** (clock-bounded), not as a pass. It goes to Kelly.
   - What the hosted census cannot see is that the audit is written before the URL is signed. That order is the route's, proven by code (`externalDocumentAuthority.ts`: `recordDocumentAudit`, then `createSignedUrl`, with `audit_unavailable` refusing) and by the D9.1 route tests.

The receipt is `d9r_link_audit_census.<qar>.json`, which records the census request id, the query hash and the join verdict.

## 4. Discrepancies, and how each is resolved

| Where | Says | Resolution |
|---|---|---|
| Handoff §4 steps 4–5; contract §6.4 | census, then `qa_run_close` "with the census attached" | Superseded by §2 steps 8–10 (close, census, close-bind). The gateway rejects a census read before `closed_at` |
| Driver `cleanup` output field `next` | `[reset, residue census, qa_run_close]` | Advisory text in a receipt. It decides nothing. **Left unchanged** so the pinned driver hash `6f1b52c8…` holds; this document is the order of record |
| Contract §6.3 | authz_q1 20-check census plus D9 checks | The registered residue census is `d9-residue-census.sql` (15 checks). The contract is not edited: its hash is pinned, and the plan approval binds it |
| Handoff §7.3 | ensure → preflight → … (no pre-write census) | Step 2 restores contract §5 "before writes" |
| Handoff §3 / §5 | case 11 "needs a read-only census after the run" | Step 6 and §3, with a concrete query and join |
