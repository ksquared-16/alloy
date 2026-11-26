# Documents → Host Capacity: D9-H2 write plan — runner pins at merge, plan pins after the W-C1 decision

From Documents (lane_aa660dc9554d, run erun2_1f62f591db430c59), 2026-11-09. This follows `HOST-CAPACITY-D9-H2-PLAN-REQUEST.md`
and the D9-H1 pattern (`HOST-CAPACITY-D9-H1-RUNNER-AND-DRIVER-HANDOFF.md`, then `HOST-CAPACITY-D9-H1-MERGE-PINS.md`).
The hashes below are of candidate `agent/documents`. They become final when it merges to staging. A merge-pins file
will name the merge SHA and re-hash the files there.

## 1. Requested: plan `documents_d9_write_v1` (or a revision of `documents_d9_read_v1`)

Contract `certification/documents-v1/D9-2-3-HOSTED-QA-PLAN.md` (not edited). Draft order of record:
`d9-hosted/D9-H2-HOSTED-RUN-ORDER.md`, steps 0–13. Its §1 lists the governed rules carried over from D9-H1; your
registry decides wherever the draft disagrees.

- **Personas:** `fixture_admin` (`qa_shared_actor`) and `cross_org_admin` (`qa_secondary_admin`), each with `integrations.manage`.
- **Applications:** all five are registered.

  | Slug | Id |
  |---|---|
  | `d9-documents-read-cert` | `e8a1591c…` |
  | `d9-documents-scope-cert` | `be5776d8…` |
  | `d9-documents-write-cert` | `abb37073-5f65-43c1-9ca1-444c55c653b2` (`gar_4b09e820576d7a`) |
  | `d9-documents-review-cert` | `12c6e113-d9d1-4914-9ce9-89f1b8e1262a` (`gar_c63c05a46dcced`) |
  | `d9-documents-write-scope-cert` | `79ce84ba-7998-4fed-a2a4-5f037fe191b9` (`gar_256ad4b724781d`) |

  Each of the last three was filed from its own execution run. Its result was checked with `application_key == slug`
  (`D9-H2-GROUNDWORK.md` §1).
- **Installations:** created by the driver's `install` as T_W, T_WB, T_WL, T_R and T_A (contract §2.2). It holds one
  credential each, in memory only. `certify` revokes every credential and disconnects every installation in `finally`.
- **Residue census:** `d9-hosted/d9-residue-census.sql` `e7e8d3d1442cf1c0705ee33eaae60cce09cfd4ba3e97bdf6ed4e72e6bae0655b`
  (registered, unchanged). It already carries the five `d9w_zr_*` checks.

## 2. Pinnable at the merge SHA: two new reconciliations, sibling runner

The runner is new, so the D9-H1 runner `qaDocumentsD9ExternalFixture.mjs` (`5af9cd7a…`) and the
`qa_d9_external_fixture_*` entries stay unchanged.

The two new entries follow the D9-H1 pattern:
- **Environment:** `staging`, fixture safety `qa_documents_d9_external`, `qa_plan` = the write plan, `purpose` `documents_d9_external_write`.
- **Apply env:** `DRY_RUN=0, CERT_FIXTURE_APPLY=1, SYNTHETIC_ONLY=1`.
- **Inputs:** frozen `ORG_ID` = QA Shared `4acc9386-c485-486f-aa1f-05d83499d142`, `QA_RUN_ID` from the ledger, `supportsDryRun: false`.

| Registry key | npm script (in `web/package.json`) | Fixture | Fixture sha256 | Result |
|---|---|---|---|---|
| `qa_d9_aged_upload_ensure` | `dev:qa:documents-d9-aged-upload-ensure` | `certification/documents-v1/d9-hosted/qa_d9_aged_upload_ensure.sql` | `e3f3ee30e3eaeba2c956471a27a44150fc122df28ec7665731bf90fad71a1c3b` | `seeded` / `failed` |
| `qa_d9_write_fixture_reset` | `dev:qa:documents-d9-write-fixture-reset` | `certification/documents-v1/d9-hosted/qa_d9_write_fixture_reset.sql` | `48845473fde8593206e4dac1c81dbabb0f08187cdfd67b5e346475d99ec17d94` | `reset` / `failed` |

Runner for both: `web/scripts/qaDocumentsD9WriteFixture.mjs`, sha256 `7f071160d9b73a6db49ce3c70ca531b8ad227bc2eb6735a034d4bb42b7d13828`
(test `web/tests/certification/qaDocumentsD9WriteFixtureRunner.test.ts`, 33/33).

**`qa_d9_write_fixture_reset` needs the Storage API.** `storage.objects` is delete-protected by trigger
(`protect_objects_delete`), so SQL removes the rows and returns the object list. The runner then removes exactly those
objects through the Storage API and re-reads. The runner's environment therefore needs the trusted env's
`SUPABASE_URL` (staging project) and `SUPABASE_SERVICE_ROLE_KEY`. Without the key it fails `storage_unreachable` after
the rows are gone, and a rerun with the key removes the orphaned objects.

**The reset replaces the draft `qa_d9_aged_upload_reset`** (`6ddad4daa`, never registered). Do not register that key.

## 3. Not yet pinnable: driver, run order, and the plan-bytes approval

| File | sha256 now | Why not final |
|---|---|---|
| `certification/documents-v1/d9_hosted_write_cert.py` (write driver) | `be12269221aa78b7fd9853f1ca7498e9615badddd6ddec7848cef678b1c1d388` | W-C1 decision pending (`D9-H2-W-C1-TIMESTAMP-ASSESSMENT.md`). Option A changes only the census; B or C change product code and may change the driver |
| `d9-hosted/D9-H2-HOSTED-RUN-ORDER.md` | see the merge-pins file | DRAFT. It is revised to final, vendored and hashed after your registry decides |
| `d9-hosted/d9w-write-audit-census.sql` (W-C1) | `c6e455e3bfc1d1a641111c1f76be5715fc01e039fe19844b42bbdd5a0021a245` | A generic `database.read_census`, not a registry pin. It changes if Kelly takes option A |

Please register the plan with the runner entries from the merge SHA, and leave `driver` at `awaiting_alloy_pins` (as
`documents_d9_read_v1` did). The Director's plan-bytes approval should name the driver hash Documents sends after the
W-C1 decision.

## 4. Gateway defect, recorded for you

The trusted-host dedupe ignores inputs within one execution run. Three `platform.register_developer_application` cards
in run `erun2_3c165c0a040129c5` returned the first card's result, and two of them were approved as `complete` without
executing (`gar_22a599230c3281`, `gar_d25b3589552809`). Under the reconciliation rule in run order §1, ensure and reset
are different keys, so they do not collide.

## 5. Not done

- No hosted QA run, installation, credential, scanner or retrieval traffic.
- Nothing runs on merge, and the merge carries no migration (no file under `supabase/`).

Reply with the plan id, its release and install, and the registry's `awaiting_alloy_pins` state.
