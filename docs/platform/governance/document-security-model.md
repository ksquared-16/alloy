---
owner: platform
status: canonical
last_reviewed: 2026-10-27
supersedes: []
---

# Document security model

**Status:** canonical owner for document access, storage, ingestion, identity, type-policy and filing security (Documents V1, D1a–D5).
**Last reviewed:** 2026-10-26, at staging `d18d4e524` plus the D5 candidate.
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
| `POST /api/admin/documents/upload` | `documents.write`; `processing.operate` to open or attach a case | 10 MiB; bytes must match the claimed format (415 `CONTENT_MISMATCH`); structural screening (415 `SCREENING_REFUSED`, or quarantine with no extraction and no Processing case); a named Studio type's subject and format (422, D5) |
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
- **Sensitivity:** a published type's default sensitivity applies to NEW documents of that type, and to a document
  re-typed onto it, raise-only. A revision may not lower it, the four medical type keys never publish below `medical`, and
  no existing document is reclassified by a type change.
- **Enforced since D5** (`web/lib/documents/configuration/documentTypeEnforcement.ts`, the one check; `public.document_file`
  for filing): applicable subject types and allowed formats on filing, the operator upload, the replacement route and the
  public Forms and vendor uploads; review-required on filing (an accepted review), with uploads and replacements of such a
  type recorded PENDING review; the replacement policy on filing and replacement (`not_allowed` refuses a second document
  or version, `new_document` refuses a version, `new_version` files a second received document as the next version). An
  operator write that names an archived or unpublished type is refused; a public write keeps the old behaviour then (a
  Studio change never silently closes public intake); a key the catalog does not know is a legacy label and is accepted.
- **Still declared:** validity (expiration, periodic reconfirmation, renewal) is D7 and is not enforced.
- **Authority:** writes need `processing.documents.manage`; reads need `documents.read`. Every change is audited before
  it happens (`document_category_changed`, `document_type_changed`).

## 7a. The household document library (D4)

Read model `web/lib/documents/library/documentLibrary.ts`, served at `GET /api/admin/documents/library` (`documents.read`).
Record: `certification/documents-v1/D4-FOCUS-PANEL-LIBRARY.md`.

- **What it reads.** The household (`customers`), its adults (`customer_persons` → `persons`), its children
  (`customer_members`) and its cases (`opportunities.customer_id`), then `document_subject_links` for those subjects plus the
  derived Forms links of the cases' submissions (`form_submissions.opportunity_id`). No document is copied; one document
  linked to several members is one entry.
- **The anchor is authorized first.** The record the operator opened must be readable in their scope
  (`assertEntityDrawerRecordReadable`); otherwise the library is 404, so it is no existence oracle. A focus outside the
  household is 404 too.
- **Disclosure is the canonical one, per row, before anything is counted.** Availability (deleted, quarantined and
  restricted are never listed), then subject scope by the PRIMARY OWNER (`filterDocumentRowsInActorScope` on the
  projection), then sensitivity (`filterDocumentRowsBySensitivity`). A secondary association is how the library FINDS a
  document, never why it may be shown: a document reached through a context link is listed only when its own owner
  passes, and when that owner is outside the household it is not named.
- **Narrowing is on the server.** A focused library (one child or adult) holds only documents linked to that subject; a
  sibling's own documents are not in the response at all, so they are neither listed nor counted.
- **Household, adult and child documents remain unrestricted-scope only** (§6): a department- or site-restricted
  operator gets 404 for a household and, from an in-scope case, sees only the case's own documents.
- **History** (`GET /api/admin/documents/[id]/history`) is admitted by the full document access decision. It is built
  from committed rows (versions, subject links, review, release) and shows an audited attempt as `refused` unless the
  committed row it produced is found.
- **Uploads are recorded before they are stored.** `POST /api/admin/documents/upload` writes
  `document_upload_authorized` (no storage path) for the document id it then inserts, and refuses with 503
  `AUDIT_UNAVAILABLE` when it cannot. Version 1 records its uploader (`metadata.uploaded_by` → `document_versions.created_by`).

## 7b. Filing a received document (D5)

Migration `supabase/migrations/20261210093500_documents_d5_filing.sql`. Command `web/lib/documents/filing/documentFiling.ts`.
Record: `certification/documents-v1/D5-PROCESSING-FILING.md`.

- **The one filing door.** A received document reaches a customer record only through `commitDocumentFiling`, called by a
  Processing document case's approval. Processing chooses (type, record, related records, review); Documents files.
- **Decided again at commit**, in order: `documents.write`; the full access decision on the received document (a
  quarantined or otherwise unavailable document is refused — `DOCUMENT_QUARANTINED`); every destination subject inside the
  actor's scope (404 otherwise, as absent) and related to the primary owner (same household); the published type's policy
  (§7); clearance for the class the document WILL have (type default, medical floor, explicit raise). `processing.operate`
  on the case is necessary and never sufficient.
- **Recorded before the effect:** `document_filing_authorized` (no storage path); 503 `AUDIT_UNAVAILABLE` when it cannot be
  written. `document_filed` after the commit. The committed fact is `documents.metadata.filing`, which names the audited
  attempt (`audit_event_id`); history shows a filing as committed only from it.
- **One transaction:** `document_file` writes the type, the raise-only sensitivity, the primary owner, the context
  associations, the version's accepted review and the filing record, or nothing. `document_file_as_version` adds the
  received bytes as the target's next version (provenance `filed_from_document_id`) and marks the received document
  `superseded` — unavailable everywhere, kept as provenance. The object copy that a version needs (one object per version)
  happens before the transaction at a deterministic path and is removed if the transaction fails, unless a version
  already references it.
- **Idempotent:** a retry with the same filing key replays without writing; a different filing of a filed document is
  refused (`ALREADY_FILED`); the database refuses a new owner for an owned document.
- **Service role only:** the filing functions are revoked from every client role.

## 7c. Document requirements, waivers and readiness (D6)

Migration `supabase/migrations/20261212090000_documents_d6_requirements.sql`. Service
`web/lib/documents/requirements/documentRequirementService.ts`. Record: `certification/documents-v1/D6-DOCUMENT-REQUIREMENTS.md`.

- **Evaluation is system-level; disclosure is per actor.** Whether a requirement is met never depends on who asks. Every
  result an actor receives (readiness, work rows, counts) is disclosed in this order: organization (every read is
  org-bound) → subject scope (the same document-scope predicate as §1; children, households and adults need an
  unrestricted scope, fail closed) → requirement clearance (a requirement whose type carries a sensitive class —
  medical, safeguarding, personal identity, restricted — is shown only to an actor cleared for that class, so its state
  is never a side channel) → evidence (a document id is listed only if the actor may read that document; quarantined
  evidence is never listed by id).
- **Configuration:** `processing.documents.manage` writes; `documents.read` reads. Tables and functions are service-role
  only; versions are immutable once published; publication and validation only through their functions.
- **Waivers:** `processing.documents.manage`, the subject readable in the actor's document scope (404 otherwise, as
  absent), clearance for the requirement's class (403 `SENSITIVE_REQUIREMENT`). The database refuses a non-waivable
  policy, the wrong grain, a subject outside the organization, a missing reason and a second active waiver; a waiver
  changes only through grant/revoke and is never deleted. `document_requirement_waiver_granted` / `_revoked` are
  recorded before the database decides. A waiver grants no document access and cannot release a quarantine.
- **Review:** `POST /api/admin/documents/[id]/review` needs `documents.write` and the full access decision (so a
  quarantined document cannot be reviewed); only the current version; a rejection needs a reason;
  `document_version_reviewed` is recorded first.
- **Audit:** `document_requirement_changed` (create, draft, publish, archive, delete, purge_fixture) before the change.
- **History is kept.** A published or waived requirement is archived, never deleted. The single exception is a governed
  QA run's own fixture: in a registered QA organization (QA Shared / QA Secondary — never Firefly or a tenant), an
  ARCHIVED requirement whose key is in the named run's namespace (`qa_<run>_…` for `?qa_run_id=qar_<run>`) is purged
  with its versions and waivers by the audited requirement DELETE (`document_requirement_purge(org, id, qa_run_id)`,
  service role, re-checks every bound; a refusal changes nothing). The guards honour the purge only inside that
  function (its owner), never a session that sets the purge setting itself. So a governed hosted certification can
  end ZERO_RESIDUE. The zero-residue census checks it (`doc_zr_d6_*`).

## 8. Certification

- **D1a:** `certification/documents-v1/D1A-CERTIFICATION.md`.
- **Q1:** `certification/documents-v1/Q1-HOSTED-CERTIFICATION.md`.
- **D1b:** `certification/documents-v1/D1B-SECURITY-HARDENING.md`.
- **D1b / D1c-1 final:** `certification/documents-v1/D1B-D1C1-SECURITY-CERTIFICATION.md`.
- **D2:** `certification/documents-v1/D2-CANONICAL-FOUNDATION.md`; database invariants `certification/invariants/documents-d2-canonical-foundation.sql`.
- **D3:** `certification/documents-v1/D3-DOCUMENT-STUDIO.md`; database invariants `certification/invariants/documents-d3-studio-configuration.sql`.
- **D4:** `certification/documents-v1/D4-FOCUS-PANEL-LIBRARY.md`.
- **D5:** `certification/documents-v1/D5-PROCESSING-FILING.md`; database invariants `certification/invariants/documents-d5-filing.sql`.
- **D6:** `certification/documents-v1/D6-DOCUMENT-REQUIREMENTS.md`; database invariants `certification/invariants/documents-d6-requirements.sql`.
