---
owner: platform
status: canonical
last_reviewed: 2026-10-23
supersedes: []
---

# Document security model

**Status:** canonical owner for document access, storage, ingestion, identity and type-policy security (Documents V1, D1a–D3).
**Last reviewed:** 2026-10-23, at staging `267d9400`.
**Higher authority:** the code and migrations named below. Where this prose disagrees with them, they win.

## 1. The one door

Every read of a document's bytes, link or text goes through **one decision**,
`assertDocumentAccess` (`web/lib/documents/assertDocumentAccess.ts`). Every list goes through the same predicates
the decision uses (`filterDocumentRowsInActorScope`, `filterDocumentRowsBySensitivity`). The decision checks these, in order:

1. **Signed in, and a member of the organization.** An access context that cannot be resolved is refused; it is never treated as unscoped.
2. **Admission:** `documents.read`, or a role the document policy admits. The compatibility role projection never admits.
3. **The row belongs to the actor's organization.** Absent and foreign rows are indistinguishable (404).
4. **Department/site scope** of the document's subject. Out of scope is also 404.
5. **Sensitive classes** (`web/lib/documents/documentSensitivity.ts`):
   - a medical document (doc_type `physical`, `immunization_record`, `health_care_plan` or `medication_authorization`, or a document linked to a submission of a medical form) needs `health.view`;
   - safeguarding evidence (cited by a `child_safeguarding_restrictions` row) needs the safeguarding view authority.

   An unreadable classification fails closed.
6. **Status:** `deleted`, `quarantined` and `restricted` documents are refused.
7. **Storage location:** the object must sit under `<org_id>/`, and the path is taken from the row only.

Link issuance and deletion are recorded in `workflow_events` *before* the effect. If the audit cannot be written, the request is refused with 503 `AUDIT_UNAVAILABLE`.

**Extracted / OCR text** is served only to `processing.operate` holders who pass the decision. That covers
`GET /api/admin/pos/documents/[id]/extracted-text`, and the form-draft preview in Processing case detail and the form-draft routes, which `web/lib/documents/extractedTextDisclosure.ts` enforces. The record drawer never returns it.

## 2. No direct client access

Migration `20261207181500_documents_direct_access_revocation` revokes every privilege from `anon`,
`authenticated` and PUBLIC on six tables: `documents`, `document_versions`, `document_field_values`,
`document_field_definitions`, `form_submission_documents` and `form_submission_signatures`. Only `service_role`, used by
server code behind the decision, reaches them. Their RLS policies remain as defence in depth. They are not the boundary,
because RLS evaluates role names, not capabilities or scope.

**A new table that holds document content must ship the same revocation.** The default privileges
grant `authenticated` SELECT on new tables.

## 3. Storage

Migration `20261207181600_org_documents_bucket_governance` declares the posture of the `org_documents` bucket:
- **Private.**
- **20 MiB per object.** Application uploads are capped at 10 MiB, and the hosting platform's request limit, about 4.5 MB, is lower still.
- **MIME allowlist:** PDF, DOCX, DOC, PNG, JPEG, plain text, CSV and HTML.
- **No `storage.objects` policy** for any client role.

Objects are reached only through server-issued signed URLs that expire in 5 to 15 minutes. Every upload path stores the
canonical content type its bytes prove (`web/lib/documents/documentContentSignature.ts`), never the client's label.

## 4. Ingestion

| Path | Who | Checks |
|---|---|---|
| `POST /api/admin/documents/upload` | `documents.write`; `processing.operate` to open or attach a case | 10 MiB; bytes must match the claimed format (415 `CONTENT_MISMATCH`); structural screening (415 `SCREENING_REFUSED`, or quarantine with no extraction and no Processing case) |
| `POST /api/public/forms/[token]/enrollment-upload` | form-link token; the session's pinned schema decides the destination | Content-Length precheck; rate limit; PDF/PNG/JPEG by magic bytes; 10 MiB |
| `POST /api/public/forms/[token]/enrollment-signature-asset` | form-link token | Content-Length precheck; rate limit; PNG by magic bytes; 300 KB |
| `POST /api/vendor-application` | unauthenticated | Content-Length precheck; rate limit; PDF/PNG/JPEG by magic bytes; 10 MiB per file |

**Rate limits** use the shared Postgres limiter (`consume_rate_limit`), keyed on the hashed caller address and the surface. They run before
any token or body is read, and they fail closed (`web/lib/documents/publicUploadGuard.ts`).

**A public drawn signature** may cite only a `signature_asset` captured on the same packet session. Only signature assets are
ever drawn into a generated PDF.

**Structural screening (D1c-1).** Every path that stores an outside file calls `decideIngestion`
(`web/lib/documents/screenedIngestion.ts`) before the bytes reach storage or any parser. That covers the vendor application, the
enrollment attachment, the drawn signature and the operator upload. The screening itself is `screenDocumentBytes`
(`web/lib/documents/structuralScreening.ts`), which is deterministic and fails closed:
- **Refused, nothing stored:** bytes that are not the declared format; a corrupt file (a PDF without its end marker or with
  an unterminated stream; a PNG whose chunks fail CRC or whose image data does not decompress to the declared size; a JPEG
  that never reaches its end-of-image).
- **Quarantined** (`documents.status = 'quarantined'`):
  - a PDF carrying `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile(s)`, `/XFA`, `/RichMedia`, `/ImportData` or `/GoToE`.
    Names are matched after `#xx` decoding, inside Flate-compressed object streams too;
  - an encrypted PDF;
  - an uninspectable stream;
  - a time, stream or size limit reached;
  - an internal error;
  - an Office file with macros.

  A drawn signature is never quarantined: anything short of clean is refused.
- **Quarantined documents are unreachable.** The access decision refuses them, the byte readers return nothing, and every
  list, related tab and drawer omits them.
- **Review:** they appear only in `GET /api/admin/documents/screening`. Releasing one takes
  `POST /api/admin/documents/[id]/screening {action:"release", reason}`, which requires `processing.documents.manage`,
  document read, scope and sensitivity clearance; records `document_released` first; and refuses with 503 if it cannot.
  To discard a quarantined file instead, use the audited delete.
- **Bypass lock:** `web/tests/documents/screenedIngestionCoverage.test.ts` fails if a storage upload appears that is not
  screened (or a declared server-generated writer), or a download that is not gated.

**This is not antivirus.** No signature database is consulted, and no record claims a file is malware-free.
Signature-based scanning (D1c-2) is deferred to a provider decision. Existing files were not screened in place. A
report-only survey (`web/scripts/documentScreeningSurvey.ts`) is prepared, and acting on its findings needs separate authorization.

## 5. Disposal: the only way a subject's documents are deleted

A deletion that removes a subject (today: lead deletion) passes its candidate documents to
`disposeDocumentsOfDeletedSubjects` (`web/lib/documents/documentDisposal.ts`). It never issues a generic row delete.

- **Retained, row and file, when anything else relies on the document:**
  - another subject;
  - a Forms link or drawn signature;
  - a Processing case source;
  - staff-qualification, safeguarding, medical-consent or subsidy evidence;
  - a vendor pointer, or a remaining person's profile photo;
  - a legal hold or unexpired retention (`documents.legal_hold`, `documents.retention_until`; the interim `metadata` markers are still honoured);
  - a stored path outside the organization prefix.
- **Otherwise deleted, in this order:**
  1. `document_delete_authorized` is recorded.
  2. The document's own object and every version's object are removed. "Already absent" counts as removed.
  3. The field values and the row are deleted. The versions and subject associations go with the row (ON DELETE CASCADE).
- **Failure:** a failed read, audit or storage step stops the disposal before the row goes, and the subject row stays. Retrying the whole deletion is safe.
- **Organization scope:** another organization's document is never read or touched.

## 6. Canonical identity, versions, subjects and sensitivity (D2)

Migration `supabase/migrations/20261208090000_documents_d2_canonical_foundation.sql`. Record:
`certification/documents-v1/D2-CANONICAL-FOUNDATION.md`.

- **Logical identity:** `documents.id` never changes. Every foreign key into `documents` keeps working.
- **Immutable versions:**
  - A document's file is a `document_versions` row: bucket, path, sha256, size, MIME and provenance.
    `documents.current_version_id` names the current one, and the file columns on `documents` are its projection.
  - The database refuses to change a version, except its review and expiration fields. It also refuses to repoint a
    document's file outside a version, and to delete a version while its document remains.
  - Every insert gets version 1 from the database itself.
  - A replacement (`POST /api/admin/documents/[id]/versions`) must be a clean, screened file and carry a written reason.
    It becomes version n+1. The previous version stays signable through `signed-url?version=<id>` under the same decision.
- **Typed subjects:**
  - `document_subjects` has the types household, person (including staff), child, opportunity, vendor,
    processing_case and form_submission.
  - Each association is `owner` or `context`, and an attached document has exactly one active **primary** owner.
  - The legacy `entity_type` / `entity_id` are the primary owner's projection. A legacy writer that sets them is
    routed into the association, and is refused if the subject is not in the organization.
  - The table is written only through `document_set_primary_subject`, `document_link_subject` and
    `document_unlink_subject`.
  - `document_subject_links` adds the Forms and Processing context links without copying them.
- **Access is decided by the primary owner alone.** Being linked to a record an actor can read grants nothing.
- **Declared sensitivity:**
  - `documents.sensitivity` is one of standard, personal_identity, medical, custody_safeguarding or restricted.
  - It may only be raised (`POST /api/admin/documents/[id]/sensitivity`, which needs the actor's own clearance for the class).
  - A document carries its declared class **and** the D1b inference.
  - Clearances: medical → `health.view`; custody_safeguarding → safeguarding view; personal_identity →
    `documents.identity.read`; restricted → `documents.restricted.read`. Each key is granted to every organization's
    `admin` role only (D3, `20261209090000`), and the `owner` role is cleared without a key.
  - An unknown class is restricted.
- **Lifecycle statuses** (`deleted`, `quarantined`, `restricted`) are never set or left through the status PATCH. Each has its own audited path.
- **Audit:** `document_version_added`, `document_subject_changed` and `document_sensitivity_raised` are recorded before the change.
- **Known boundaries:**
  - Person, household and child subject scope still uses department/site linkage only.
  - Profile photos are authorized by the caller's own scoped read.
  - Retention policy values per class, and the governed purge, are not yet defined (D3).

## 7. Document categories and types (D3)

Migration `supabase/migrations/20261209090100_documents_d3_studio_configuration.sql`. Record:
`certification/documents-v1/D3-DOCUMENT-STUDIO.md`.

- **Categories** are organization vocabulary, live on save. The key never changes; parents stay in the organization and
  never form a cycle. A category in use is archived; only an unused one is deleted.
- **Types** are a stable identity (`document_types`) with immutable versions (`document_type_versions`): draft →
  validated → published, published by compare-and-swap through `document_type_publish`. `documents.doc_type` stores the
  type key, so every existing value keeps its meaning.
- **The one enforced policy:** a published type's default sensitivity applies to NEW documents of that type, and to a
  document re-typed onto it, raise-only. A revision may not lower it, the four medical type keys never publish below
  `medical`, and no existing document is reclassified by a type change. Review, replacement, formats, subjects and validity are
  declared intent for D5–D7 and are labelled as such.
- **Authority:** writes need `processing.documents.manage`; reads need `documents.read`. Every change is audited before
  it happens (`document_category_changed`, `document_type_changed`).

## 8. Certification

- **D1a:** `certification/documents-v1/D1A-CERTIFICATION.md`.
- **Q1:** `certification/documents-v1/Q1-HOSTED-CERTIFICATION.md`.
- **D1b:** `certification/documents-v1/D1B-SECURITY-HARDENING.md`.
- **D1b / D1c-1 final:** `certification/documents-v1/D1B-D1C1-SECURITY-CERTIFICATION.md`.
- **D2:** `certification/documents-v1/D2-CANONICAL-FOUNDATION.md`; database invariants `certification/invariants/documents-d2-canonical-foundation.sql`.
- **D3:** `certification/documents-v1/D3-DOCUMENT-STUDIO.md`; database invariants `certification/invariants/documents-d3-studio-configuration.sql`.
