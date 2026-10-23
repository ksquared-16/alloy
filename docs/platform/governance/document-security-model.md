---
owner: platform
status: canonical
last_reviewed: 2026-10-23
supersedes: []
---

# Document security model

**Status:** canonical owner for document access, storage and ingestion security (Documents V1, D1a and D1b).
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
  - a legal hold or unexpired retention (`metadata.legal_hold`, `metadata.retention_until`), interim until D2;
  - a stored path outside the organization prefix.
- **Otherwise deleted, in this order:**
  1. `document_delete_authorized` is recorded.
  2. The document's own object and every version's object are removed. "Already absent" counts as removed.
  3. The field values, versions and row are deleted.
- **Failure:** a failed read, audit or storage step stops the disposal before the row goes, and the subject row stays. Retrying the whole deletion is safe.
- **Organization scope:** another organization's document is never read or touched.

## 6. Known boundaries (fail-closed until D2)

- Sensitivity is inferred, not declared.
- Person, household and child subject scope uses department/site linkage only.
- Profile photos are authorized by the caller's own scoped read.

See `certification/documents-v1/D1B-SECURITY-HARDENING.md` §Security-model boundaries.

## 7. Certification

- **D1a:** `certification/documents-v1/D1A-CERTIFICATION.md`.
- **Q1:** `certification/documents-v1/Q1-HOSTED-CERTIFICATION.md`.
- **D1b:** `certification/documents-v1/D1B-SECURITY-HARDENING.md`.
