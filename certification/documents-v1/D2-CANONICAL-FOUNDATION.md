# Documents V1 — D2 canonical document foundation

Status: **D2.0 ratified; D2.1–D2.7 in progress.** The final verdict is recorded at the end of this file.

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
