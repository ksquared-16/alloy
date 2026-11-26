# EN-FI-01 — isolated medical-document authorization security release

**Status: `EN_FI01_SECURITY_CANDIDATE_LOCALLY_CERTIFIED`.** This is not yet hosted-certified. `DOCUMENTS_ENROLLMENT_FI01_SECURITY_CERTIFIED` will be declared only after the repaired behaviour is shown on deployed staging (see the hosted step below).

## Candidate and exact baseline

- **Baseline:** staging `317eafa5be622cdd77b2a6ab0b140011a876e36a` (PR #1609). The `/api/build-info` deployed SHA is identical.
- **Branch:** `agent/documents-enfi01-security`, in the isolated worktree `alloy-promotions/documents-enfi01-security`. The lane branch `agent/documents` (D7/D8, checkpoint `ick_4911041798f8`) is untouched.
- **Dependency graph:** every file `d34f21b80` modifies is byte-identical on `317eafa5` and on its D7/D8 parent. Its new modules import only helpers that are also unchanged (`assertDocumentAccess`, `documentSensitivity`, `packetReviewRollupTypes`, `documentAvailability`, `accessScope`, test harness). The commit therefore applies to the deployed baseline with no D7/D8 code.
- **Commits:**

| Commit | Content |
|---|---|
| `406f74db9` | cherry-pick of `d34f21b80`: Processing labels, submission links, packet review, enrollment packets, status PATCH, POS rename/delete, Health card |
| `465a1e023` | cherry-pick of `1cdb3918d`: live suites updated for the Health card signature |
| `73c6e32a2` | census follow-ups: related-records scope, OCR preview scope, p076 gate, generate-document provenance |
| `0cfc875cc` | database facts, rollback-only |
| `8f7f1dd47` | D1b OCR tests pass a scoped access context |

- **Migrations:** none. D7/D8 migrations remain unapplied anywhere shared.

## Census — confirmed, protected, ruled out

### Confirmed exposures, deployed on `317eafa5` and repaired here

| Path | Exposure on staging | Repair |
|---|---|---|
| `GET processing/queue`, `GET processing/cases/[id]` | Medical source titles and file names reached any admin-portal session. | Per-label admission, scope and clearance check. |
| `GET forms/submissions/[id]` `linked_documents` | Medical PDF names reached any admin-portal session. | Same check, per document. |
| Packet review rollup and insight; opportunity enrollment packets | Generated-PDF titles reached admin\|ops without a document check. | Same check, per title. |
| `PATCH documents/[id]` | The full medical row went back to a writer without `health.view`. | Clearance required; otherwise 404. |
| `PATCH` / `DELETE pos/documents/[id]` | `processing.documents.manage` alone could rename, read back or delete a medical document. | The three read checks are added; otherwise 404. |
| Health card document list | `health.view` alone listed every child document, including quarantined ones. | Medical **and** Documents checks; quarantined documents are never listed. |
| `GET related/[entity]/[id]` | Admission and sensitivity were checked, but **not subject scope**. A department-restricted reader listed other departments' documents. | Document scope added; synthetic packet rows are kept. |
| Processing form-draft OCR preview | Sensitivity was checked but not scope. | Source document's scope added; an actor with no scope dimensions is refused. |
| `GET p076-first-order-prototype` | **Live on staging.** An anonymous probe returns the route's own `{"error":"forbidden"}` 403, not its flag-off `not_found` 404, so `ALLOY_ROUTE_TIMING=1` is set. Any portal session could read, for any child id, document counts and *which* health-profile fields (`allergies`, `medical_notes`) are filled. | Only an administrator with unrestricted scope who holds Documents read **and** `health.view`; refused before any read. |

### Integrity defect, no disclosure

`POST generate-document` stored a caller-supplied `generated_from_document_id` without an organization check. Nothing reads that field back. It is now validated as belonging to this organization (400 otherwise).

### Protected behaviour, unchanged

These paths already enforced `assertDocumentAccess`, which checks admission, organization, scope, sensitivity, status and path:
- signed URL (preview and download) and source preview;
- history, versions, subjects and review;
- the Documents list and library; requirements, readiness and waivers;
- screening, the POS list, extracted text and the filing queue;
- the entity drawer, the vendor signed URL and the profile photo.

`findExistingGeneratedPdfByIdempotency` reads only junction rows of a submission already verified in the organization and returns only an id.

### Ruled out

Public `forms/[token]/enrollment-*` routes serve only the token holder's own render (portal). No anonymous path serving staff document metadata was found: every admin route probed anonymously on staging answers 401 or 403.

## Authorization contract

For a document whose classes include *medical*, every surface requires all of:

| Authority | Rule |
|---|---|
| Documents | `documents.read` or a document-read role |
| Organization | `org_id` filter on every read |
| Subject scope | department / site; unattached and non-department subjects need an unrestricted scope |
| Medical | `health.view` |
| Mutation | `documents.write` for status; `processing.documents.manage` **plus** the read checks for rename and delete |
| Availability | quarantined, deleted and restricted documents are never listed |

All of this runs through one helper, `web/lib/documents/documentMetadataDisclosure.ts` (`disclosableDocumentIds`). It fails closed: with no reader, a failed read, or another organization's id, the document is hidden. Service-role database access is never treated as user authorization. A hidden document reads "Document (restricted)" or the call returns 404. Counts follow the same rule (p076).

## Local security certification

| Gate | Result |
|---|---|
| EN-FI-01 suite (`documentsEnFi01MedicalMetadata.test.ts`) | **31/31.** Personas: Documents-only operator, Medical with Documents, `health.view` without Documents, Processing manager without Medical, out-of-scope, wrong organization, anonymous. Covers labels, uploads, generated PDFs, metadata and counts, unauthorized mutations, related records, OCR, p076 and provenance. **Mutations:** sensitivity check off → 5 fail; admission off → 2; related scope off → 2; OCR scope off → 2. |
| Database facts (`run-en-fi-01-local.sh`, shared alloy-cert, staging Documents chain applied and rolled back) | **6/6.** A medical type is raised to medical whatever was declared; an ordinary type stays standard; a generated PDF of a medical form is medical by linkage (`is_medical_form_submission`); the medical vocabulary matches the TypeScript list; the D2 owner association exists; the document is bound to its organization. |
| Targeted regression (33 files importing or naming a changed module) | 486/487. The 1 red is identical on pristine `317eafa5`. **0 new.** |
| Area sweep (documents, health, enrollment, forms, Business Processes, POS, Work Items, Focus Panel, operator, presentation, lifecycle, records, API, surfaces, runtime, access) | 230 failing entries. The only one absent from pristine `317eafa5` was the D1b OCR test before `8f7f1dd47`; it now passes (59/59). **0 new reds.** |
| `tests/admin`, `tests/adminV2` as whole directories | A pre-existing test spins on this tree (it completes on the D7/D8 tree, whose harness gained `gt`/`order`), so these could not finish as directories. Their files that touch the changed code ran individually in the targeted set above. |
| Typecheck | `vac run typecheck` and `vac run typecheck:tests` passed. |
| Prebuild guards | All six passed. |
| Production build | `vac run build` on the exact candidate (see the final commit). |

**Real-database note.** The shared cert stack is behind staging's Documents schema. It has no `document_subjects` and no `documents.sensitivity`. No isolated certification environment at `317eafa5` is free for this lane: `certenv-8b1a2284d8` is leased to another lane. Route-level persona proof against a real database therefore happens on deployed staging, where the driver below runs every persona against the real database. The rolled-back database facts above prove the primitives the checks read.

## Hosted verification (after deployment)

Driver: `certification/documents-v1/en_fi01_hosted_security_cert.py <qar> setup|baseline|certify|teardown` on an authz_q1 hosted QA run.

**Probes:**
- Processing queue and case labels for a medical-sourced case;
- p076 for a run-scoped child;
- related records across departments;
- Health card;
- signed URL of a medical document.

**Personas:** `fixture_admin`, `doc_reader`, `ocr`, `processing_only`, `no_docs`, `scoped_ops`, `cross_org_admin` and anonymous.
- `baseline` records the exposure on the current deployment.
- `certify` asserts the repaired behaviour.
- Teardown uses the POS delete and the audited lead deletion; ZERO_RESIDUE comes from the registered census.

**Not coverable hosted.** The authz_q1 plan has no "`health.view` without Documents" persona and no Documents or Processing *writer* without `health.view`. Those cells are proven locally only. A registry request to the toolkit owner should add `qa_medical_only` (`portal.access`, `health.view`) and `qa_doc_writer` (`documents.read`, `documents.write`, `processing.documents.manage`).

## Promotion path

The current lane run is attributed to the D7/D8 sprint `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A`. `sprintHoldDecision` holds every `promotion.open_pr` and merge filed by one of that sprint's runs unless it is that sprint's released candidate. The security candidate therefore needs its **own objective**, so that its checkpoint, release, PR and merge come from a run attributed to it:
1. The Director establishes the objective.
2. The Director dispatches a run for it in this worktree.
3. That run: `vac sprint commit-slice` → checkpoint → request-release → push → PR → CI → merge.
4. Then hosted `baseline`/`certify` and ZERO_RESIDUE.
