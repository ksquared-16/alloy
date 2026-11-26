# Documents V1 — D2 canonical document foundation

Status: **CERTIFIED: promoted, deployed and hosted-certified.** See "Verdict" at the end of this file.

## D2.0 — implementation preflight

### Baseline

Measured on the deployed primary by `gar_f07be7fed84c0f`, query `d2-premigration-census.sql`, on 2026-10-23 at 15:13Z.

**Documents (378, one organization):**
- All `uploaded`, and every row has a bucket, path, MIME type and size. 267 rows carry a sha256 checksum.
- Every stored object is present; 0 paths fall outside the org prefix and 0 paths are duplicated.
- `document_versions`: 0 rows. `document_field_values`: 0 rows.
- Identity hash `6e7ff5693393b627d22d0a39ec0ae8f1`, computed over id, org, bucket, path, checksum and size.

**Legacy parent (`entity_type` / `entity_id`):**
- 326 `customer_member`: 168 resolve to a child in the org; **158 point at children that no longer exist**.
- 4 `person`, all resolving.
- 48 unattached (processing intake). There are 48 processing document sources, and none is dangling.

**References into documents:**

| Reference | Count |
|---|---|
| `form_submission_documents` | 285 (220 `generated_pdf`, 65 `signature_asset`) |
| Drawn-signature pointers | 65 |
| Staff-qualification evidence | 1 |
| Medical-consent evidence | 3 |
| Profile-photo pointers | 2 |
| Safeguarding, subsidy and vendor pointers | 0 |

**Sensitivity-relevant doc types:** 35 `immunization_record` and 220 `generated_form_pdf`. The rest are 71 `signature_asset`, 3 `profile_photo` and 49 with a null doc type.

**Interim hold markers:** 0 legal holds and 0 retention markers.

The writer and reader surveys found:
- **Writers:**
  - Eight insert paths, and none writes a version.
  - Every upload uses `upsert:false` and a fresh UUID path, so no path replaces bytes in place.
  - One path re-files a document: Processing `attachDocument` overwrites `entity_type` / `entity_id`.
- **Consumers:**
  - Consumers read by `entity_type` / `entity_id` or by id.
  - Eleven foreign keys reference `documents(id)`.
  - Two references have no FK: `person_medical_consents.evidence_document_id` and `processing_case_sources.source_id`.

### Decisions

1. **Subject types and canonical IDs.**

   | Subject type | Points at | Legacy `entity_type` | May own |
   |---|---|---|---|
   | `household` | `customers.id` | `customer` | yes |
   | `person` | `persons.id` (parents, contacts-as-persons and **staff**: staff use canonical Person identity, never an employment id) | `person` | yes |
   | `child` | `customer_members.id` | `customer_member` | yes |
   | `opportunity` | `opportunities.id` (the enrollment case) | `opportunity` | yes |
   | `vendor` | `vendors.id` | `vendor` | yes |
   | `processing_case` | `processing_cases.id` | — | context only |
   | `form_submission` | `form_submissions.id` | — | context only |

   The legacy-only types `contact`, `job`, `location` and `schedule` (0 rows on staging) are not D2 subjects. A document filed under one of them keeps its legacy parent, gets no canonical owner, and is reported as `legacy_only_owner`.
2. **Primary versus secondary.** `document_subjects.association` is either `owner` or `context`.
   - **Owner:** exactly one active *primary* owner per attached document, which must be an owning type. Further owners are allowed: one record can belong to a child and to their household.
   - **Context:** a link only, never authority.
   - **Access:** decided by the primary owner alone, as today. Being linked to a readable record never grants access.
3. **Document identity versus version identity.**
   - **`documents.id`:** the stable logical identity, kept for every existing row and FK.
   - **`document_versions.id`:** the immutable file identity, holding bucket, path, sha256, size, MIME and provenance.
   - **`documents.current_version_id`:** names the current version. The legacy file columns on `documents` become a projection of it, enforced by trigger.
4. **Sensitivity.** `documents.sensitivity` is declared, one of `standard`, `personal_identity`, `medical`, `custody_safeguarding` or `restricted`.
   - **Effective classes** are the declared class plus the D1b inference (medical doc types, links to medical forms, safeguarding evidence). Inference can only add classes, so nothing D1b protects is ever relaxed.
   - **Clearances:**
     - medical → `health.view`;
     - custody_safeguarding → safeguarding view;
     - personal_identity → the `owner` or `admin` role;
     - restricted → the `owner` or `admin` role.

     These are role clearances, the same model safeguarding uses. They were chosen over two new permission keys because
     minting catalog keys is a Director decision (W-11); dedicated keys are recorded as a D3 prerequisite.
   - **Fail closed:** an unknown or unreadable class counts as `restricted`.
   - **Changes:** sensitivity may only be raised (from `standard` to any class, or from any class to `restricted`). Lowering it is refused in this slice.
   - **Backfill:** derived only from the D1b inference. **No historical document moves into `personal_identity` or `restricted`**, so no one loses access to an existing document.
5. **Waiver ownership.** Per the Director's ruling, Documents owns document-specific requirement waivers and Enrollment keeps stage exceptions. There is no canonical document-requirement model yet: `stageRequirementsV1` refuses to author `document` requirements. So D2 records ownership and defers the waiver record to the slice that introduces document requirements (a D3 prerequisite). Documents never stores "waived" as a document status.
6. **Replacement and supersession.**
   - A replacement is a new version: number n+1, `supersedes_version_id` pointing to the previous one, and a reason. The previous version stays retrievable, under authorization.
   - Versions are immutable apart from their review and expiration fields.
   - A version is deleted only together with its document (the audited document delete) or by the governed purge.
   - A direct UPDATE of the legacy file columns that does not match the current version is refused, so a binary can never be overwritten silently.
7. **Legacy parent columns.**
   - `entity_type` / `entity_id` become a projection of the active primary owner, maintained by trigger.
   - A legacy writer that sets them (the upload inserts, and Processing re-filing) is routed by trigger into the canonical association. It is refused when the subject does not resolve in the organization.
   - Rows whose legacy subject no longer exists (158) keep their columns unchanged and get no owner, so their access is unchanged.
   - A ratchet test freezes the set of code paths that write the legacy columns.
8. **Retention and legal hold.**
   - **Columns:** `documents.legal_hold`, `legal_hold_reason`, `legal_hold_set_at`, `legal_hold_set_by`, `retention_until` and `retention_policy_key`. The interim `metadata` markers are backfilled into them (0 on staging), and both are honoured.
   - **Policy:** Documents owns the retention policy. Policy values per class need Director/legal input, which is a D3 prerequisite.
   - **Deletion and purge:** the only deleters are the audited document delete and the governed purge, and both refuse held or retained documents. No bulk deletion or orphan cleanup is authorized.
9. **References from other domains.** Forms, Processing, signatures, staff qualifications, safeguarding, medical consent, subsidies, vendors and profile photos keep their FKs and pointers unchanged.
   - Context associations for them are derived, not copied: `document_subject_links` is a view that unions the Documents-owned associations with the derived ones (`form_submission_documents` → `form_submission`, Processing document sources → `processing_case`).
   - No file and no pointer is duplicated.
10. **Migration and rollback.** The migrations are additive: new columns, a new table, triggers and a backfill inside the migration, which verifies itself and raises on any mismatch.
    - Every step is re-runnable.
    - **Rollback** means dropping the triggers, the view and the new table and columns. No existing column or row is rewritten, except the documented projection columns, whose values the backfill leaves unchanged.
    - The migration is proven on the local shared stack and on certenv before being applied to staging.

### Defects found in preflight (fixed in this slice)

- **The document status PATCH can bypass the D1c-1 quarantine release.** It can set any status defined for the org, and staging defines `uploaded`. It could also bring back `deleted` or `restricted` documents. Fixed: lifecycle statuses cannot be set or left through the PATCH.
- **`persistComposedSignedArtifact` selects a column that does not exist (`file_name`).** The composed artifact's source provenance (source document id and sha256) was therefore silently null. Fixed.

## D2.1–D2.5 — implementation

| Item | Where |
|---|---|
| Migration (additive, re-runnable, self-verifying, with backfill) | `supabase/migrations/20261208090000_documents_d2_canonical_foundation.sql` |
| Versions | `web/lib/documents/documentVersions.ts`; `GET`/`POST /api/admin/documents/[id]/versions`; `GET /api/admin/documents/[id]/signed-url?version=` |
| Subjects | `web/lib/documents/documentSubjects.ts`; `GET`/`POST /api/admin/documents/[id]/subjects`; Processing `attachDocument` goes through `document_set_primary_subject` |
| Sensitivity | `web/lib/documents/documentSensitivity.ts` (declared class plus the D1b inference); `POST /api/admin/documents/[id]/sensitivity` |
| Retention and hold | `documents.legal_hold*` and `retention_until`, honoured by `documentDisposal.ts` and the POS delete |
| Audit | `document_version_added`, `document_subject_changed`, `document_sensitivity_raised`; link events name the version |
| Writers | every document insert now records its sha256; the deletes remove every version's object |
| Canonical model | `docs/platform/governance/document-security-model.md` §6 |

## D2.6 — migration and backfill

1. **Isolated proof on `certenv-a134d2e184`:**
   - apply `gar_11506b2b501ea6` (181500, 181600 and 20261208090000 in one transaction, ledger verified);
   - rollback invariants `gar_0937bd43b699a7`, 11/11 PASS (`certification/invariants/documents-d2-canonical-foundation.sql`).
   - The first run, `gar_8e21235d34651c`, failed in its own fixture step (CASE 0) before any guard ran, and its rollback was verified. The test was corrected in `8639b711`.
2. **Local proof:**
   - the migration applied twice adds nothing on the second run;
   - a backfill rehearsal on staging-shaped data kept all 18 rows' legacy columns byte for byte;
   - removing a guard makes the invariant test fail (CASE 2 and CASE 5 each proved this).
3. **Staging:** the Supabase integration applied the migration on merge `b3df4084`. A direct apply was correctly refused: `gar_12a3a15299f8fb`, `migration_owned_by_pending_merge`.
4. **Reconciliation (`gar_b99340cc4501a7`, `d2-postmigration-reconciliation.sql`), against the baseline:**
   - 378 documents; the identity hash `6e7ff5693393b627d22d0a39ec0ae8f1` is unchanged.
   - **Versions:** 378 legacy versions, every one matching its file; 378/378 objects present with an eTag; 267 with a sha256 (as before).
   - **Owners:** 172 primary owners (168 child, 4 person), and no resolvable parent lacks one. The 158 unresolved parents are left unowned and unchanged; 48 documents are unattached.
   - **Sensitivity:** 246 declared medical (35 by doc type, 211 by medical-form link), all of which D1b already inferred, so nobody's access changes.
   - **References:** every reference count equals the baseline; 333 derived context links.

## D2.7 — certification

**Lineage:**
- D2 PR #1585, merged at `b3df4084` (`gar_18a4bb683d148e`).
- Tested and deployed: staging `/api/build-info` `7e7019c4` (#1589), which contains `b3df4084` and changes no documents code, migration or fixture.
- The canonical checkout was reconciled automatically by toolkit `2d366647e873`: fast-forward `1c7e4ccd` → `b0283e04`, identity verified, untracked files kept. The resets later ran at `7e7019c4`.

**Automated (repository):**
- Documents suites 292/292, including the D2 route suite (22) and the writer/reader census ratchet (10).
- Consumer regression: 0 new failures. The 39 red tests are identical on untouched staging.
- Prebuild passes, and CI on #1585 is all green.

**Hosted: `authz_q1` run `qar_32891f09f872`**
- **Personas:** 7/7 verified on fresh sessions.
- **Fixture ensures:** vendor `gar_570a6d78ad8245` (`tha_08de3ed946527a`, the one that reconciled the checkout); QA Shared subjects `tha_c7da13f3f7afc0`; QA Secondary subjects `gar_38093c4d8de445`.

| Gate | Result | Evidence |
|---|---|---|
| Q1 authorization regression | 90/90 | `q1_hosted_authz_cert_results.qar_32891f09f872.json` |
| D1b security regression | 25/25 | `d1b_hosted_security_cert_results.qar_32891f09f872.json` |
| D2 hosted matrix | 40/40 | `d2_hosted_foundation_cert_results.qar_32891f09f872.json` |
| Logical identity and immutable versions | PASS | the insert creates v1 with a checksum; a clean replacement adds v2 superseding v1 with a reason; v1 is kept |
| Current and historical retrieval | PASS | v1 and the current version are signed for a reader; v1 is refused to another organization; another document's version is never signed |
| Replacement refusals | PASS | no write 403; no reason 400; an unsafe file 415 with nothing stored; another organization 404 |
| Typed subjects and the primary owner | PASS | the primary equals the legacy parent; the in-scope reader is admitted and the out-of-scope reader refused |
| Secondary associations grant nothing | PASS | a context link to the scoped reader's own subject still gives 404 |
| Re-filing and association changes | PASS | re-filing moves access away and back; the primary cannot be unlinked (409); another organization's subject is refused (404); a reader cannot re-file (403) |
| Sensitivity | PASS | raised to restricted: reader, scoped and OCR get 403 `SENSITIVE_DOCUMENT` on the link and on the version list; the cleared admin reads every version; lowering 409 |
| Lifecycle-status guard | PASS | setting `quarantined` through the PATCH gives 409 `LIFECYCLE_STATUS` |
| Legacy consumers; Forms, Processing and document operations | PASS | the Q1 matrix (lists, related, drawer, Processing intake, OCR, previews, vendor links) and the D1b driver unchanged at 115/115; the legacy projection equals the primary owner on every run document |
| No duplicate physical files | PASS | `gar_d9c97c01d25635`: 9 version objects, 9 distinct, none shared, all present |
| Audit | PASS | `gar_d9c97c01d25635`: 1 `document_version_added` (reason and checksum); 6 `document_subject_changed`; 1 `document_sensitivity_raised` (standard → restricted, with a reason); 2 link events naming a historical version; actor on every event |
| Teardown | PASS | all 8 run documents deleted through the audited delete (`DELETE /api/admin/pos/documents/[id]`), each then 404 |
| Fixture resets | PASS | QA Shared subjects `gar_bc0250e116f976`; QA Secondary subjects `gar_e136f9c10da7c3`; vendor `gar_722d56aa39e06d` |
| Close | PASS | `gar_908d70e7a28e2e` / `tha_93a5729c1269fa`: access clean, 0 grants, sessions removed |
| Zero residue | 12/12 zero | `gar_1a3a87c07bd26e` (20:10:10Z), including the QA Shared and QA Secondary objects: version 2's object went with the document |
| Binding | ZERO_RESIDUE | `gar_72236d74dbac74` |

**Audit note.** `document_subject_changed` is recorded before the database rules on the change, like `document_delete_authorized`. Two of the six events are attempts the database refused: unlinking the primary, and filing under another organization's subject. The audit therefore records authorized attempts; the resulting state is what `document_subjects` holds.

## Not done here (D3 prerequisites)

- **Dedicated permission keys** for `personal_identity` and `restricted`, if wanted. This is a Director decision (W-11); today owner/admin are cleared by role.
- **The doc-type policy for declared classes**, for example vendor driver's licences as `personal_identity`. No writer declares those classes yet.
- **Retention policy values per class**, and the governed purge that would be the only deleter of superseded versions (design only).
- **The canonical document-requirement model**, and the Documents-owned requirement waiver built on it.
- **The 158 documents whose child no longer exists:** historical orphans, left untouched. Cleanup needs separate authorization.
- **OCR text** stays on `documents`; it is cleared on replacement. Moving it to the version is D3.
- **Remaining readers of the legacy parent:** 7 are frozen by the ratchet, and should move to `listDocumentSubjects`.
- **No expiration or reminder queues, Studio, Focus Panel or filing UX** (out of scope).

## Verdict

**DOCUMENTS_V1_D2_COMPLETE_PROMOTED_DEPLOYED_CERTIFIED.** Every D2 gate passed on the deployed build `7e7019c4`, which contains merge `b3df4084`. The hosted run `qar_32891f09f872` is bound ZERO_RESIDUE.
