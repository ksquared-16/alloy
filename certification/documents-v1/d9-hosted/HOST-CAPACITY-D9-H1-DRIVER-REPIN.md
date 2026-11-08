# Documents → Host Capacity: D9-H1 driver re-pin `6f1b52c8…` → `bfed4a96…` (and run order `595f2713…`)

From Documents (lane_aa660dc9554d, run erun2_d92abcd5201860df), 2026-11-08. Nothing here opens a run, installs
anything or issues a credential. It asks for one reviewed toolkit change and one Director plan-bytes approval.

## 1. Why

Hosted run `qar_7d7ec3d86bdd` (closed `ZERO_RESIDUE`, `gar_61db8fa6abdb2e`) recorded **35 passed, 5 failed**
(`D9-H1-HOSTED-RUN-RECORD.qar_7d7ec3d86bdd.md`). The five (cases 6, 10 ×2, 12, 14) are T_A positive reads that got
HTTP 200: the deployed single-resource routes answer `{"data": {...}}` (`singleResourceThroughCollection`,
`web/lib/platform/external/resources/documentResources.ts:94` at `d93d6e17`), and driver `6f1b52c8…` read the
fields at the top level. Those cases are **unproven**, and stay recorded as failed. Case 11's clock window was
**timing inconclusive** (margins 0.08–0.78 s against a 2 s bound); that record stands too.

## 2. What changed (Documents commit `6376729c89430908eb50a6ab30140cce47037830`, not on a remote)

| Artifact | Path | sha256 |
|---|---|---|
| Consumer driver | `certification/documents-v1/d9_hosted_read_cert.py` | `bfed4a96b55d9e6d45ad6bbe0ae0729c4883492007986a59a9be281453833243` |
| Run order of record | `certification/documents-v1/d9-hosted/D9-H1-HOSTED-RUN-ORDER.md` | `595f27138272f5412e82ee828dbe5146ab1a7e973f4a4e2c7f1fd68b448ad3f7` |
| Contract (unchanged) | `certification/documents-v1/D9-1-HOSTED-QA-PLAN.md` | `1e9daebb60184b3c451ab4bbafe24bb89ad995d48547b8925d1858ba8ba3030e` |
| Runner (unchanged) | `web/scripts/qaDocumentsD9ExternalFixture.mjs` | `5af9cd7a…` |
| Residue census (unchanged) | `d9-hosted/d9-residue-census.sql` | `e7e8d3d1…` |

Driver diff, in full scope:

1. Detail and download-link bodies are read through `one(b)` = `b["data"]` when it is an object, else `{}`. A flat body
   still fails (cases 6, 10, 14; 12 follows 10). Admin-route reads are unchanged (they passed on staging).
2. **New: case 11 without a clock.** Around each T_A link call, and around the refused T_B link call on `D_STD_C`,
   the driver reads `GET /api/admin/documents/{D_STD_C}/history` **as `fixture_admin`** and counts kind `access`
   "Download link issued" entries. Pass: 0 → 1 → 2 across the two T_A calls, 0 → 0 across T_B. This is a **new use of
   the `fixture_admin` session**: a read-only staff route (`assertDocumentAccess` "preview" + `buildDocumentHistory`,
   no insert, update or RPC) on a document the run itself uploaded. No new persona, role, scope, application,
   installation or credential. Five extra reads per run.
3. Cleanup `next` and the docstring now name the run order of record (the advisory-text discrepancy is gone).

Order and gates are unchanged: run order steps 0–10 are identical; §3 criterion 3 is now decided by item 2, with the
clock margins reported as information.

Local proof: `python3 -I certification/documents-v1/test_d9_hosted_read_cert.py` — 11/11 green on `bfed4a96`. The fake
now serves the deployed shapes (`{data:{...}}`, full `PublicDocument` field set) and the staff history. The new tests
fail 5 against the `6f1b52c8` bytes (conforming product, flat-shape regression, three audit-ordering defects).

## 3. The one toolkit change

`planEvidenceBound` refuses unless `documents_d9_read_plan_approved.driver_sha256 === QA_PLANS.documents_d9_read_v1.driver.sha256`
(`qa-plan-registry.mjs:896-897`). Changing either alone closes the gate, so both land together, **after** the Director's
approval exists:

| Field | Now | Proposed |
|---|---|---|
| `documents_d9_read_v1.driver.sha256` | `6f1b52c8…` | `bfed4a96b55d9e6d45ad6bbe0ae0729c4883492007986a59a9be281453833243` |
| `documents_d9_read_v1.driver.source_commit` | `d93d6e17…` (staging) | `6376729c89430908eb50a6ab30140cce47037830` (Documents), **vendored** in `tests/fixtures/documents-d9/` and verified by sha256, as the run order already is |
| `documents_d9_read_v1.run_order` | `8b8e1fe6…` @ `ccb368d91` | `595f2713…` @ `6376729c8`; `supersedes` the `8b8e1fe6…` entry ("case 11 criterion 3 and driver rows; steps unchanged") |
| `PLAN_EVIDENCE.documents_d9_read_plan_approved` | `gar_4490c623c20377`, driver `6f1b52c8…` | the new approval ref, `driver_sha256: bfed4a96…`, `run_order_of_record` `6376729c8`; move the old record to `SUPERSEDED_PLAN_EVIDENCE` verbatim |

Contract, runner, fixtures, residue census and `eligible_plans` are untouched. If you prefer the driver at a staging
merge rather than vendored, that adds one Alloy PR and merge (certification-only, no migration) before the pin; the
bytes do not change.

## 4. Approval card (Director)

`objective.govern_sprint`, worded like `gar_4490c623c20377`: plan `documents_d9_read_v1`, contract `1e9daebb…`
(unchanged), consumer driver `bfed4a96…` at Documents `6376729c8`, run order `595f2713…`; states the new read-only
`fixture_admin` staff-history reads (§2 item 2); eligibility, hosted QA, runs, installations and credentials not part
of it.

## 5. Not asked

No hosted run, installation, credential, census or fixture action. Those follow only after the toolkit release with
the re-pin is installed, each under its own operator approval (`D9-H1-RERUN-PATH.md`).
