# Documents V1 — D1b and D1c-1: final hosted security certification record

**D1b verdict: CERTIFIED (promoted, deployed, hosted-certified).**
**D1c-1 verdict: CERTIFIED (promoted, deployed, hosted-certified).**

Both were certified in one governed `authz_q1` run, `qar_efe9bd0d1d9c`, on the deployed build that contains them. This
record closes the D1b gaps left PARTIAL in `D1B-SECURITY-HARDENING.md`, D1b.2, D1b.3 and D1b.7, which were the direct
PostgREST and Storage probes. It also certifies D1c-1's structural screening and quarantine.

## Lineage

| Item | Value |
|---|---|
| D1b | #1575, merged at `267d9400` |
| Lead-deletion repair | #1579, merged at `b640b454` |
| D1c-1 | #1582, merged at `ead892226da93f43c5615a51a5e5a16c26ebcb57` |
| Tested build | staging `alloy_staging_web` `deployed_git_sha` `ead89222…`, Supabase `ikaxilmwmrmbagoidedu`. The probe receipt recorded this with `credentials_proven: true`. |
| Cleanup base | staging, deployed build and canonical checkout `1c7e4ccde75ce52b9514298a1811eda2f50acf47` (#1583). It is unrelated to Documents, with no fixture or document changes. Every reset was stamped and executed at this SHA with `repository_identity: verified`. |
| Toolkit | probe plan `documents_d1b_direct_access`, from toolkit `ba41e035904d` (toolkit PR #380) |

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Repository alignment | PASS | Tested = merged = deployed `ead89222`. Cleanup ran at `1c7e4ccd`, a descendant, identity verified. |
| Personas / fixtures | PASS | 7/7 personas verified. Ensures: vendor `tha_a1fef08a7c240e`, QA Shared subjects `tha_9a718a415495fd`, QA Secondary subjects `tha_94f527ba737bbf`. |
| Q1 regression | PASS 90/90 | `q1_hosted_authz_cert_results.qar_efe9bd0d1d9c.json` |
| D1b application matrix | PASS 25/25 | `d1b_hosted_security_cert_results.qar_efe9bd0d1d9c.json` |
| D1b direct PostgREST probe | PASS | `qap_69e292576330` (`gar_2c9cb8815bafc4`, `tha_75e672a9f55e50`). See the first list after this table. |
| D1b direct Storage probe | PASS | Same probe. See the second list after this table. |
| D1c-1 clean / unsafe / reviewer / invalid | PASS | `d1c1_hosted_screening_cert_results.qar_efe9bd0d1d9c.json`: 28/29. The one failure was a 429 on the vendor refusal check. The D1b rate-limit probe had used up that window's budget, so the 429 was correct rate limiting, not a screening result. Re-run in a fresh window it returned 415 `SCREENING_REFUSED` 1/1 (`d1c1_vendor_refusal_results.qar_efe9bd0d1d9c.json`). |
| Audit | PASS | `gar_af85b2c6667747` (`d1c1-audit-census.sql`). See the third list after this table. |
| Teardown / zero residue | PASS | See "Cleanup receipts". |
| Evidence preservation | PASS | This directory. All results are sanitized: statuses and ids only, with no cookies, tokens, keys, signed URLs or storage paths. |

**Direct PostgREST probe: 59/59, PASS.**
- **Selects:** 30 select refusals (42501; 401 anon, 403 authenticated) across the 6 document tables × anon, `doc_reader`,
  `scoped_ops`, `fixture_admin` and `cross_org_admin`.
- **OCR reads:** 5 refusals.
- **Writes:** insert, update and delete refused for `doc_reader` and `fixture_admin` (403 42501).
- **Writes left nothing:** the no-mutation sentinel passed.
- **The app still lists documents:** product list 5/5.

**Direct Storage probe.** The negative results count because two controls passed first: the probe proved it can list the
organization and reach the object (`control_list_org`, `control_object`).
- **Listing:** 8 list attempts returned empty.
- **Downloads:** 4 attempts returned 400 `NoSuchKey`.

**Audit census.** Every row comes from QA orgs only; 0 rows are outside them.
- **Screening:** 1 `document_quarantined` and 1 `document_released` on the same document. The release follows the
  quarantine and records its reason.
- **Deletes:** 8 `document_delete_authorized`.
- **Uploads:** 7 uploaded.

## Cleanup receipts

| Step | Receipt | Result |
|---|---|---|
| Teardown | driver `teardown` phases | 8 documents deleted via the audited delete |
| QA Shared subject reset | `tha_ddef0cd31eef13` | complete |
| QA Secondary subject reset | `gar_7b75384cfc5dce` / `tha_659ed13dff9ad9` | reset 1, exit 0, at `1c7e4ccd` |
| Vendor reset | `gar_12d02e36c165e4` / `tha_96ee19969b866c` | reset 1, exit 0, at `1c7e4ccd` |
| Close | `gar_a0fab339652ec0` / `tha_1c9edb667d313e` | CLOSED. Access clean: every pool identity was revoked (0 roles, 0 profiles) and all 7 sessions were removed. |
| Zero-residue census | `gar_e4327b78c15027` (query `3be83854…`, 15:00:48Z) | **12/12 zero**. Two artifacts are retained by design and are not residue: `mutation_events` and the D1a `workflow_events`. |
| Binding | `gar_603b74f6ff5d19` / `tha_c743b7634122ad` | Run CLOSED with close verdict **`ZERO_RESIDUE`**. No QA run is open. |

One earlier filing of the Secondary reset, `gar_9c2e416155491b`, was refused by the trusted host with
`authorization_required` and executed nothing. It was refiled as `gar_7b75384cfc5dce`.

## Not done here, and still open

- Historical orphan cleanup (the S3 plan) needs separate authorization. No historical customer file was touched.
- D1c-2 (content malware scanning) is deferred. D1c-1 is structural screening only, and never claims a file is free of malware.
- D2 has not started.
- These earlier exceptions stand as recorded in `DOCUMENTS-SECURITY-CONVERGENCE-PACKET.md`:
  - the ledger-format exception;
  - the certification ledger's earlier bytes for `20261207181500`.
