# Documents D9.2 / D9.3 — hosted staging proof of the write, review and lifecycle surface: QA plan

**Status: PREPARED, NOT EXECUTED (2026-11-03).**
- Nothing here has been filed, opened, written or run. No application, installation or credential exists for it.
- It extends `D9-1-HOSTED-QA-PLAN.md` (D9-H1, read proof) and shares its run, orgs, personas, fixtures and cleanup. It is
  item D9-H2 of `D9-D10-COMPLETION-PLAN.md`.
- Local tests (in-memory and the pre-apply rollback invariants) do **not** substitute for it.

## 1. Preconditions (all required; checked at execution, stop if any fails)

| # | Precondition | How checked |
|---|---|---|
| P1 | The D9.2 / D9.3 code is deployed to staging: `documents.write` and `documents.review` exist in the scope catalog, and the 38 document operations are served | `GET /api/build-info` `gitSha` contains the merged D9/D10 candidate; `GET /api/v1/openapi` lists `submitDocumentReview` |
| P2 | D9-H1 has passed on the same deployment, or runs first in the same QA run | its receipts |
| P3 | Host Capacity has registered the D9 QA plan (H2) with the extra applications and installations of §2 | plan id and release |
| P4 | Archive cases (§4, W-AR) only if `20261217090000_documents_d9_3_archive.sql` is applied to staging (its own approval). Otherwise the archive case asserts the 503 `archive_unavailable` and that nothing changed | `database.read_census`: `to_regprocedure('public.document_archive(uuid,uuid,text,text,uuid,uuid)')` |
| P5 | Escalation cases (§4, W-ES) only if `20261215093000_processing_open_case_atomic.sql` is applied to staging (D10-A3). Otherwise the case asserts the upload is held (no case opened) | census: `to_regprocedure('public.open_processing_case_with_primary_source(uuid,text,uuid,text)')` |

Until P4 and P5 hold, no report may say archive or the 24-hour handoff works live.

## 2. Least-privilege applications, installations and credentials

**Constraint:** one installation per application per organization (`uq_app_installations_app_org`), and scopes are
granted per installation. Each distinct (scope set, boundary, org) therefore needs its own application.

**Principle:** every token holds exactly one documents scope. `documents.write` never shares an installation with
`documents.review` (Q3); verification reads use the D9.1 read token `T_A`, never a write token.

### 2.1 Applications (governed: `platform.register_developer_application`, one operator card each; global catalog rows, kept after close)

D9.1 already requests `d9-documents-read-cert` and `d9-documents-scope-cert`. D9.2 / D9.3 add three:

```json
{"action_key":"platform.register_developer_application","inputs":{"slug":"d9-documents-write-cert","name":"D9 Documents Write Certification","publisher":"alloy-platform","databaseTarget":"alloy_deployed_primary"}}
{"action_key":"platform.register_developer_application","inputs":{"slug":"d9-documents-review-cert","name":"D9 Documents Review Certification","publisher":"alloy-platform","databaseTarget":"alloy_deployed_primary"}}
{"action_key":"platform.register_developer_application","inputs":{"slug":"d9-documents-write-scope-cert","name":"D9 Documents Write Boundary Certification","publisher":"alloy-platform","databaseTarget":"alloy_deployed_primary"}}
```

Run `vac governed-action --contract platform.register_developer_application` before filing; the registry's input
schema is authoritative over this text.

### 2.2 Installations and credentials (no governed path today; carried by the H2 QA plan inside the harness)

| Token | App | Org (installing persona) | `grantedScopes` | Boundary | Used for |
|---|---|---|---|---|---|
| `T_W` | write-cert | `qa_shared` (`fixture_admin`) | `["documents.write"]` | `org_wide` | uploads, filing, links, validity, replacement, archive |
| `T_WB` | write-cert | `qa_secondary` (`cross_org_admin`) | `["documents.write"]` | `org_wide` | cross-org refusals on `qa_shared` ids and uploads |
| `T_WL` | write-scope-cert | `qa_shared` (`fixture_admin`) | `["documents.write"]` | `locations: [qa_north]` | boundary: a `qa_south` child is not a filing subject |
| `T_R` | review-cert | `qa_shared` (`fixture_admin`) | `["documents.review"]` | `org_wide` | first review of a current version; re-review refused |
| `T_A` | read-cert (D9.1) | `qa_shared` | `["documents.read"]` | `org_wide` | verification reads only |

Secrets: as D9.1 §2.2. Held in harness memory, exchanged for a token immediately, and never printed, logged or committed.
Receipts carry installation id, credential id and token `exp` only.

## 3. Fixtures (in addition to D9.1 §3)

- Tag every title and file name `qa-d9w-<qa_run_id>`; record ids in `d9w_hosted_fixture_ids.<qar>.json`.
- Subjects reuse D9.1's `C1` (`qa_north`), `C2` (`qa_south`), `H1`, `G1`, `CB` (`qa_secondary`).
- Files are tiny generated PDFs and PNGs, plus one structurally unsafe PDF (JavaScript action) for the screening case.
  Nothing real is uploaded.
- W-ES needs an API upload that completed more than 24 hours ago. The pinned reconciliation
  `qa_d9_aged_upload_ensure` (Documents authors its SQL; Host Capacity registers it) inserts one tagged
  `documents` row shaped exactly like `completeDocumentUpload`'s. It has `metadata.source = 'api_v1_upload'`,
  `received_via` naming `T_W`'s installation, and `created_at` 25 hours back. Its object is uploaded under
  `<org>/api_uploads/…` by the same reconciliation, or the case is skipped.

## 4. Test matrix (request, status, code and body sha256 recorded per case)

| # | Case | Expected |
|---|---|---|
| W-S1 | `T_A` (read only) calls every write operation; `T_W` calls `submitDocumentReview`; `T_R` calls `createDocumentUpload` | 403 `forbidden_scope` before any effect; no audit of an effect |
| W-U1 | `T_W` creates an upload (≤ 4 MiB), sends its bytes, then retries the same bytes with the same `Idempotency-Key` | 201 then 200 `replay: true`; one document, one object; `max_bytes: 4194304` |
| W-U2 | Same key, different bytes | 409 `idempotency_conflict`; nothing added |
| W-U3 | Declared or actual size above 4 MiB | 413 with the 4 MiB text; nothing stored |
| W-U4 | Unsafe PDF | stored `quarantined`; never listed by `T_A`; filing it → refused |
| W-U5 | `T_WB` sends bytes to `T_W`'s `upload_id` | 404; no object |
| W-F1 | `T_W` files its upload to `C1` (standard type) | 201; `T_A` lists it on `C1`; history names the application, not a person |
| W-F2 | Retry of W-F1 | 200 replay; one filing |
| W-F3 | `T_W` files to a medical type, or to `CB` (other org), or (`T_WL`) to `C2` | 404 or the stable refusal codes; nothing filed |
| W-F4 | `T_W` files a document it did not upload (a staff upload) | 404 |
| W-L1 | Link `H1` as context, then unlink | 201 / 200; the owner unchanged; `T_A` detail shows the link, then not |
| W-V1 | `T_W` sets validity dates on the filed document, then retries them | 200 changed, then unchanged; inverted range → 400 |
| W-R1 | `T_W` replaces the version (a new upload filed as a new version) | version 2 is current; version 1 kept; the received upload is not listed |
| W-RV1 | `T_R` accepts the current version, then tries to reject it | 200, then 403 `REREVIEW_NOT_AUTHORIZED`; `T_A` reviews list shows one decision with no names |
| W-RQ1 | `T_A` reads `C1` requirements and `GET /documents?expires_before=` | derived states; a restricted type shows key and state only |
| W-AR | (P4) `T_W` archives the document, then retries; `T_A` lists `C1` | 201 then 200 replay; the document is no longer listed. Without P4: 503 `archive_unavailable`, status unchanged |
| W-AR2 | (P4) Staff restore through `POST /api/admin/documents/{id}/restore` as `fixture_admin` | 200 previous status; listed again; `document_restored` audited |
| W-ES | (P5) The scheduled wake runs once after `qa_d9_aged_upload_ensure` | exactly one Processing case for the aged upload, in the Processing documents queue for `fixture_admin`; a second wake adds nothing; then `T_W` files it late → the case closes. Without P5: no case, and the upload stays held |
| W-C1 | Census (§5) | every write is in a QA org; every effect has its audit row written first |

**Pass bar:** every case as expected. Any write landing outside the two QA orgs, any 200 on a refused case, or any
effect without its prior audit is a **security stop** (D9.1 §7).

## 5. Exact staging writes (all confined to `qa_shared` / `qa_secondary`, all tagged)

| Write | Where | Removed at close? |
|---|---|---|
| 3 application catalog rows | `developer_applications` | No (catalog, by design) |
| 4 installations, 4 credentials | `app_installations`, credentials | Revoked and disconnected; rows retained as history |
| ~12 uploads: objects under `<org>/api_uploads/<doc>/<sha>` and `documents` rows | storage `org_documents`, `documents`, `document_versions` | Yes |
| Filings, subject links, validity dates, review events, a second version (object under `<org>/filed/…`) | `documents.metadata`, `document_subjects`, `document_versions`, `document_version_review_events` | Yes, with their documents |
| (P4) Archive and restore records on one document | `documents.metadata.archive` | Yes, with the document |
| (P5) One aged upload row and its object; one Processing case and its source | `documents`, `processing_cases`, `processing_case_sources` | Yes (the reconciliation reset removes the case) |
| Audit: `document_upload_authorized`, `document_filing_authorized`, `document_filed`, `document_archived`, `document_restored`, `document_unfiled_upload_escalated`, `installation.*` | `workflow_events`, `mutation_events`, `app_security_audit` | No (audit is history, reported as data) |

## 6. Isolation and cleanup

1. The same `environment.qa_run_open` as D9.1 on `alloy_staging_web`, with
   `"hosted_qa_authority": {"declared": true, "reason": "D9.2/D9.3 public write API proof must exercise deployed staging over HTTP with real application tokens"}`.
2. Pre-census: zero `qa-d9w-%` rows; zero installations of the three write apps.
3. Close:
   - revoke the four credentials and disconnect the four installations;
   - delete the tagged documents through the audited admin delete;
   - `qa_d9_external_fixture_reset` plus `qa_d9_aged_upload_reset`, which removes the aged upload, its object and its
     Processing case;
   - the residue census extended by `d9w_zr_tagged_documents`, `d9w_zr_tagged_objects` (including `api_uploads/` and
     `filed/` prefixes), `d9w_zr_active_installations`, `d9w_zr_active_credentials` and `d9w_zr_escalation_cases`. All must
     be 0;
   - `environment.qa_run_close` with the census. Verdict `ZERO_RESIDUE`.

## 7. Approvals this plan needs (none is granted by preparing it)

1. Three `platform.register_developer_application` cards (§2.1).
2. The H2 plan registration and release (Host Capacity), covering D9.1's and these installations, and the
   `qa_d9_external_fixture_*` and `qa_d9_aged_upload_*` reconciliations.
3. `environment.qa_run_open` (hosted, declared) and `environment.qa_run_close`.
4. The candidate's release, PR, CI and merge, then deployment (P1).
5. Separately, and only for W-AR / W-ES: the archive migration apply (P4) and the atomic-open apply (P5).
