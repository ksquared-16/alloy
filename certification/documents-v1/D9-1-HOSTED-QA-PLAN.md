# Documents D9.1 — hosted staging HTTP proof: QA plan

**Status: PREPARED, NOT EXECUTED.**
- Nothing in this plan has been filed, opened, written or run.
- Running it needs its own approvals (§1.3), including at least one decision that is not yet supported (§1.4).
- Objective: `OPWORK_AA660DC9554D_SPRINT_AFD07879C606`, item D9-H1 of `D9-D10-COMPLETION-PLAN.md`.
- Local tests do **not** substitute for this proof.

## 1. Scope, target, writes, approvals

### 1.1 What is proved

The four D9.1 read operations, over real HTTP, against deployed staging:
- `GET /api/v1/document-categories`
- `GET /api/v1/documents`
- `GET /api/v1/documents/{id}`
- `GET /api/v1/documents/{id}/download-link`

They are called with real Application Principal tokens (`POST /api/v1/oauth/token`). Authorization covers:
- the `documents.read` scope;
- org binding;
- the `locations` boundary;
- primary owner;
- availability;
- effective sensitivity;
- the audited 10-minute link.

### 1.2 Target

- Target is `alloy_staging_web` (`https://staging.workwithalloy.com`), backend `ikaxilmwmrmbagoidedu`.
- Expected served SHA is `daf87893f879` (PR #1627).
- **Re-verify at execution** with `GET /api/build-info`: `gitSha` must contain the D9.1 code. A later SHA is acceptable only if it still contains `web/lib/documents/external/externalDocumentAuthority.ts` unchanged, or its diff is reviewed.
- Stop if the served SHA lacks D9.1.

### 1.3 Hosted writes and their approvals

All writes are synthetic and confined to the two QA orgs.

| # | Write | Approval / path | Supported today? |
|---|---|---|---|
| W1 | Two developer application catalog rows (§2.1). Global; they remain after close | `platform.register_developer_application` (operator card) | **Yes** |
| W2 | Four installations plus four credentials (§2.2) | `POST /api/admin/integrations/installations`, `POST …/installations/{id}/credentials`, with an admin session holding `integrations.manage` | **No governed path** (§1.4) |
| W3 | Fixture children, household, guardian, enrollments | A registered fixture reconciliation (`ensure` / `reset`) | **No**: not registered (§1.4) |
| W4 | Ten tagged documents plus sensitivity, quarantine and supersede changes (§3) | Existing admin routes, through the `fixture_admin` / `cross_org_admin` QA sessions (Q1 pattern) | Yes, once a plan grants the sessions |
| W5 | Audit rows: `document_link_issued`, `installation.created` and similar | Side effects of W2 and the tests; retained by design | — |
| W6 | Run open and close | `environment.qa_run_open` / `environment.qa_run_close` on `alloy_staging_web`, payload carrying `"hosted_qa_authority": {"declared": true, "reason": "D9.1 public API proof must exercise deployed staging over HTTP with real application tokens"}` | Supported, once the plan exists |

### 1.4 The gap

No registered QA plan does this today. `authz_q1` (Revision 4) has no D9 persona, no `integrations.manage` step, no credential capture and no D9 fixture reconciliation, and its run stage is bound to approved bytes.

What is required:
1. **Host Capacity** (Vacilando QA plan registry): register a plan `documents_d9_read_v1`, or a revision of `authz_q1` with fresh approval of its bytes. It must provide:
   - orgs `qa_shared` and `qa_secondary`;
   - personas `fixture_admin` (`qa_shared_actor`) and `cross_org_admin` (`qa_secondary_admin`), both with `integrations.manage` through their admin membership;
   - credential capture inside the harness (the secret is returned once; it must never be printed, logged or committed);
   - fixture reconciliations `qa_d9_external_fixture_ensure` / `qa_d9_external_fixture_reset` (Alloy-authored SQL, pinned);
   - a residue census extended with the D9 checks in §6.
2. **Developer Platform**, if it prefers: a governed install / credential / revoke action instead of the admin routes. Either path is acceptable; borrowing an existing credential is not.

## 2. Access setup (minimal design)

**Constraint:** `uq_app_installations_app_org` allows one installation per application per org, and scopes are set per installation. So an org-wide installation and a `locations` installation in `qa_shared` need **two applications**.

**Do not reuse** `alloy-cert-sandbox` / installation `5bdc7c1e-…`: they are kept as Gate 2 fixtures.

### 2.1 Applications (W1)

Two governed cards, each with the effect "one catalog row":

```json
{"action_key":"platform.register_developer_application","inputs":{"slug":"d9-documents-read-cert","name":"D9 Documents Read Certification","publisher":"alloy-platform","databaseTarget":"alloy_deployed_primary"}}
{"action_key":"platform.register_developer_application","inputs":{"slug":"d9-documents-scope-cert","name":"D9 Documents Scope Certification","publisher":"alloy-platform","databaseTarget":"alloy_deployed_primary"}}
```

### 2.2 Installations and credentials (W2)

| Token | App | Org (installer) | `grantedScopes` | Boundary | Used for |
|---|---|---|---|---|---|
| `T_A` | read-cert | `qa_shared` (`fixture_admin`) | `["documents.read"]` | `org_wide` | positive reads, sensitivity / availability 404s, link audit, paging |
| `T_B` | read-cert | `qa_secondary` (`cross_org_admin`) | `["documents.read"]` | `org_wide` | cross-org 404 on `qa_shared` ids |
| `T_L` | scope-cert | `qa_shared` (`fixture_admin`) | `["documents.read"]` | `locations: [qa_north]` | boundary case (a `qa_south` child is invisible) |
| `T_N` | scope-cert | `qa_secondary` (`cross_org_admin`) | `["children.read"]` | `org_wide` | 403 `forbidden_scope` before any read (an empty scope list may be refused, so a non-documents scope is used) |

**Secret handling:**
- Each credential secret is held only in harness memory and exchanged for a token at once.
- Tokens and secrets never go to stdout, logs, receipts or files. Receipts carry installation id, credential id and token `exp` only.

`documents.write` is **not** granted here. It doesn't exist in the staging catalog. When it does, it gets a separate application (`d9-documents-write-cert`) under its own approval, so read and write grants never share an installation.

## 3. Fixtures (W3, W4)

Tag: `qa-d9r-<qa_run_id>` in every title and file name (Q1 pattern), plus fixture ids recorded in `d9r_hosted_fixture_ids.<qa_run_id>.json`.

**People and enrollment (reconciliation `qa_d9_external_fixture_ensure`, in `qa_shared`):**
- `C1`: child enrolled at `qa_north`.
- `C2`: child enrolled at `qa_south`.
- `H1`: household anchoring `C1`.
- `G1`: person with an ACTIVE `parent` relationship to `C1`.
- `E1`: person with only an `emergency_contact` relationship to `C1`.
- `CB`: one child in `qa_secondary`, enrolled.
- Reuse `documents_shared_child_ensure` only if its child is enrolled at a `qa_shared` site; otherwise these are new fixture rows.

**Documents (`POST /api/admin/documents/upload`, multipart tiny PDF, uploaded by `fixture_admin` / `cross_org_admin`):**

| Key | Primary owner | Type / change after upload | Expected through `/api/v1` |
|---|---|---|---|
| `D_STD_C` | `C1` | standard type | visible to `T_A` and `T_L` |
| `D_STD_H` | `H1` | standard | visible to `T_A` |
| `D_STD_G` | `G1` | standard | visible to `T_A` (guardian) |
| `D_STD_E` | `E1` | standard | **404** (emergency contact is not a guardian) |
| `D_MED` | `C1` | medical type (or sensitivity raised to `medical`) | 404 |
| `D_PID` | `C1` | sensitivity `personal_identity` (`POST /api/admin/documents/{id}/sensitivity`) | 404 |
| `D_CUS` | `C1` | sensitivity `custody_safeguarding` | 404 |
| `D_RES` | `C1` | sensitivity `restricted` | 404 |
| `D_QUA` | `C1` | quarantined (`POST /api/admin/documents/{id}/screening`) | 404 |
| `D_SUP` | `C1` | a second version added (`POST …/versions`); the list shows the current version only | detail = current |
| `D_SOUTH` | `C2` | standard | visible to `T_A`, **404 for `T_L`** |
| `D_B` | `CB` (`qa_secondary`) | standard | 404 for `T_A`; visible to `T_B` |

## 4. Test matrix (each case recorded with request, status, code, and body hash)

| # | Case | Request | Expected |
|---|---|---|---|
| 1 | Scope refused before any read | `T_N` on each of the 4 operations (valid `D_STD_C` id) | 403 `forbidden_scope`; no `document_link_issued` row for `T_N` |
| 2 | Categories | `T_A` `GET /document-categories` | 200; active categories with `parent_key`; published types only |
| 3 | List by child / household / person | `T_A` `?child_id=C1`, `?household_id=H1`, `?person_id=G1` | Exactly the expected standard docs; none of `D_MED`, `D_PID`, `D_CUS`, `D_RES`, `D_QUA`, `D_STD_E` |
| 4 | Exactly one subject parameter | `T_A` with none, or with two | 400, stable code |
| 5 | Non-guardian person | `T_A` `?person_id=E1` | Same answer as for an unknown person |
| 6 | Detail | `T_A` `GET /documents/D_STD_C` | 200; no `storage_path`, `bucket` or URL fields |
| 7 | Indistinguishable 404 | `T_A` detail and link for `D_MED`, `D_PID`, `D_CUS`, `D_RES`, `D_QUA`, `D_STD_E`, `D_B`, a random uuid | All 404 with **byte-identical body** and the same header set (excluding `date` / request-id). Timing is recorded, not asserted |
| 8 | Cross-org | `T_A` → `D_B`; `T_B` → `D_STD_C`; `T_B` `?child_id=C1` | 404; empty list or 404 as for an unknown subject |
| 9 | Locations boundary | `T_L` detail `D_SOUTH`; `?child_id=C2` | 404; as for an unknown child. `T_L` → `D_STD_C` returns 200 |
| 10 | Download link | `T_A` `GET /documents/D_STD_C/download-link` | 200 `{document_id, url, expires_at}`; `expires_at − now ≤ 600 s`; url host is the storage host; no path field |
| 11 | Link audited before minting | Census (§5) after case 10 | One `document_link_issued` for `D_STD_C` naming the application, installation and credential of `T_A`, created before the response time; none for refused calls |
| 12 | New link per call | Case 10 twice | Two distinct urls and two audit rows |
| 13 | Paging | `T_A` `?child_id=C1&limit=1` and follow `cursor` | Each visible doc returned exactly once; `since_token` returned |
| 14 | Version-current | `T_A` detail `D_SUP` | Current version metadata only |

**Pass bar:** every case as expected; any unexpected 200 for a held document is a **security stop** (§7).

## 5. Cross-org safety checks (read-only census, namespaced)

- **Before writes** (`database.read_census`, `alloy_deployed_primary`, catalog-plus-fixture filtered):
  - zero rows tagged `qa-d9r-%`;
  - zero installations of either D9 app;
  - the `qa_shared` and `qa_secondary` org ids resolve.
- **After the tests:** check that
  - every `qa-d9r-%` document belongs to `qa_shared` or `qa_secondary`;
  - `document_link_issued` rows from the run exist only for tagged docs;
  - no audit or event row of the D9 installations references an org outside the two QA orgs.
- Queries select by tag, QA org ids, or D9 app ids only. **No real tenant row is read.** Counts only, no PII columns (header rule).

## 6. Cleanup

1. Revoke the four credentials (credential revoke route) and disconnect the four installations (`DELETE` / `PATCH` disconnect on `/api/admin/integrations/installations/{id}`), as the installing persona.
2. Remove tagged documents through the admin delete path, then run `qa_d9_external_fixture_reset`, which removes C1, C2, H1, G1, E1, CB, their enrollments and relationships, and storage objects of tagged docs.
3. Residue census: the `authz_q1` 20-check `documents-zero-residue-census.sql`, plus D9 checks:
   - `d9_zr_tagged_documents = 0`
   - `d9_zr_tagged_objects = 0`
   - `d9_zr_active_installations = 0`
   - `d9_zr_active_credentials = 0`
   - `d9_zr_fixture_people = 0`
4. `environment.qa_run_close` with the census attached. Verdict must be `ZERO_RESIDUE`.

**Retained by design:** the two application catalog rows; audit history (`workflow_events`, `mutation_events`, `installation.*`, `document_link_issued`). These are reported as data, not residue.

## 7. Evidence and stop conditions

**Commit (receipts, secret-blind):**
- `d9r_hosted_fixture_ids.<qar>.json`
- `d9r_hosted_results.<qar>.json` (per-case status, code, body sha256)
- `d9r_census_pre.<qar>.json`, `d9r_census_post.<qar>.json`
- `d9r_hosted_reset_results.<qar>.json`
- `d9r_zero_residue_census.<qar>.json`
- the `qa_run_close` receipt
- a section appended to `D9-D10-INCREMENT-1-RECORD.md` (hosted proof is recorded separately from local)

**Stop and clean up immediately on any of:**
- the served SHA lacks D9.1;
- any held, foreign or out-of-boundary document returns 200;
- a response contains a storage path or a permanent URL;
- a link is issued without its prior audit row;
- a census sees a non-QA org;
- a secret appears in any output.

A stop is reported as a failure. It is never retried into a pass.
