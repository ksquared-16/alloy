# Documents V1 — D9 write contract: PROPOSAL for ratification

**Update 2026-11-09:** the D9.2 writes and the D9.3 archive/restore were built after this proposal and merged (#1630; migration `20261217090000` applied); their hosted proof (D9-H2) is still owed (`DOCUMENTS-REMAINING-INVENTORY.md` item 2). The original status below is kept as history.

**Status: PROPOSAL (2026-11-02). Not an approved specification. Nothing here is implemented.**
- Objective `OPWORK_AA660DC9554D_SPRINT_AFD07879C606`, lane `lane_aa660dc9554d`. Plan row D9-W0 in `D9-D10-COMPLETION-PLAN.md`.
- The earlier ASSISTANT §8 list (`D9-D10-FIRST-INCREMENT-PROPOSAL.md:22-35`) is a relayed assistant suggestion, "not independently verified as ratified" (same file, :13). It is **not** a specification. This document is what would become the D9 write specification **if Kelly ratifies it**, in whole or with the answers in §6.
- Every repository claim cites `file:line` at commit `e0dfa2121`. Paths are relative to `web/` unless they start with `docs/`, `supabase/` or `certification/`.

**What ratification would authorize:** implementing §2–§5 locally, with tests, as sprint slices, and publishing the operations in the OpenAPI spec and partner package of the candidate.
**What it would NOT authorize:** any credential, application registration or installation; any hosted QA write; any migration apply; any deployment, merge or release. Each stays its own approval.

## 1. Binding constraints already in the repository

| Constraint | Source |
|---|---|
| An external filing must call `commitDocumentFiling`, not write associations; caller-supplied idempotency key; the stable refusal codes are the contract | `docs/api/documents-forms-api.md:70-74` |
| `/api/v1/**` is a frozen external contract. Application Principal (Application → Installation → Credential → scopes + boundary); no admin session, no caller-selected tenant | `docs/api/api-architecture.md:75` |
| Service-role access never means unscoped access | `docs/api/api-architecture.md:52` |
| Rate limits: authenticated read 600/60 s, write 120/60 s per installation | `lib/platform/external/rateLimit.ts:46,61` |
| D9.1 read: standard sensitivity only; visible children, households, active parents/guardians; everything else answers like a missing record | `lib/platform/external/scopeCatalog.ts:187-197`; `lib/documents/external/externalDocumentAuthority.ts:4-29,231-234` |
| External audit names application, installation and credential, with no user | `lib/documents/external/externalDocumentAuthority.ts:397-410`; `lib/documents/documentAudit.ts` (`actorPrincipal.kind = "application"`) |

## 2. Scopes

| Scope | Access | Covers | Status |
|---|---|---|---|
| `documents.read` | read | D9.1's four operations **plus** the read operations proposed here: review read, requirements read, expiration query, lifecycle history | Exists (`scopeCatalog.ts:187`); its definition would be widened in text only |
| `documents.write` | write | upload initiate/complete, file, workflow status, archive, subject link/unlink, version replacement, validity dates | **New**, distinct from `documents.read`. A write never implies a read: every write response returns ids and states only, never content or a download link |
| `documents.review` | write | review submit (accept / reject / reopen) | **New, recommended separate** (see below) |

**Why review gets its own scope (recommendation):** internally, the first review needs only `documents.write`, but changing a recorded review needs `processing.documents.manage` (`lib/documents/review/documentReviewService.ts:20-22`; `app/api/admin/documents/[id]/review/route.ts:22,68`). Acceptance also changes what satisfies a requirement (`lib/documents/requirements/documentRequirementEvaluator.ts:171` `classifyEvidence`). A partner that uploads should not, by default, also be able to approve its own uploads. A separate grant keeps the "upload" and "approve" powers apart at installation level.

**Fixed exclusions (not decisions; they follow from D9.1):**
- no medical, personal-identity, custody/safeguarding or restricted documents, read or write: there is no external clearance (`scopeCatalog.ts:192-196`);
- no organization-wide feed (`D9-D10-INCREMENT-1-RECORD.md`, "Still open in D9");
- no raising of sensitivity externally (the internal route requires clearance: `app/api/admin/documents/[id]/sensitivity/route.ts:53`);
- no delete (§3.6).

**Internal permission mapping (as attendance does, `scopeCatalog.ts:205-208`):** `documents.write` → internal `documents.write` (`lib/documents/assertDocumentAccess.ts:168`); `documents.review` → `documents.write`, and never `processing.documents.manage`, so an external review can never re-review.

## 3. Operations

All under `/api/v1`, through the existing collection/single-resource factory (`lib/platform/external/collectionRoute.ts`) and `requireExternalPrincipal` (`lib/platform/external/externalRequest.ts:49`). Order on every route: credential → scope (403 before any read) → write budget → boundary → effect.

**Idempotency, every write:** a required `Idempotency-Key` header (8–184 characters), stored as `ext:<installation_id>:<key>`. The installation prefix keeps the result inside the filing key's 8–200 bound (`lib/documents/filing/documentFiling.ts:411`). A replay with the same body returns the committed result (`documentFiling.ts:424`, the existing replay); the same key with a different body returns **409 `idempotency_conflict`**. That matches attendance's domain-native 409 (`D9-D10-ACCEPTANCE-PREPARATION.md` §1.2). Writes that have no native key (status, link, validity, review) store the key with the audit event and replay from it. That replay store is a **gap** to build in D9.2 (§6 Q4).

### 3.1 Upload (two steps)

| operationId | Route | Scope | Reuses | Behaviour |
|---|---|---|---|---|
| `createDocumentUpload` | `POST /documents/uploads` | `documents.write` | **Gap**: no signed-upload path exists. The admin route is direct multipart (`app/api/admin/documents/upload/route.ts:116,135`) | Body `{filename, mime_type, byte_size, sha256}`. Size refused from the declared length first, as internally (`upload/route.ts:127,142`; `ADMIN_DOCUMENT_UPLOAD_MAX_BYTES` 10 MB, `lib/documents/documentUploadLimits.ts:11`). Returns `{upload_id, expires_at}` and, **recommended**, takes the bytes on the next call rather than handing out a storage URL (§6 Q1) |
| `completeDocumentUpload` | `PUT /documents/uploads/{upload_id}/content` | `documents.write` | The admin upload sequence, extracted into one shared command: D1c-1 `decideIngestion` before storage (`upload/route.ts:239`; `lib/documents/screenedIngestion.ts:32`), audit before effect (`upload/route.ts:274`), object under the org prefix (`lib/documents/storagePathAuthority.ts:13`), document row with the D2 trigger writing version 1 (`upload/route.ts:331`), object removed when the row insert fails (`upload/route.ts:361`) | Body: raw bytes. The SHA-256 must equal the declared value. Result `{document_id, status: "received" \| "quarantined"}`. The document is **unfiled** (no subject or type yet) and invisible to `listDocuments` until filed. A quarantined file can never be filed externally |

Refusals: 413 `FILE_TOO_LARGE`; 415 `UNSUPPORTED_FORMAT` / `CONTENT_MISMATCH` / `SCREENING_REFUSED` (codes from `upload/route.ts:60,200,229,242`); 409 `upload_expired`; 422 `checksum_mismatch`; 503 `AUDIT_UNAVAILABLE`; 502 `STORAGE_UNAVAILABLE`.

**Abandoned or failed uploads (stated gaps):**
- A row-insert failure already removes the object (`upload/route.ts:361`).
- Nothing removes an object if the process dies between storage upload and row insert. The D1b-5 unreferenced-object census only detects this (`certification/documents-v1/d1b5-unreferenced-object-census.sql`); it does not repair.
- An initiated upload that is never completed needs a TTL and a sweep.
- **Proposed:** an `upload_id` that expires after 1 hour and never creates a row before content arrives. On content, the object is written under a path derived from `upload_id`, so a retry overwrites rather than duplicates. A scheduled sweep removes objects under `<org>/api_uploads/` that are older than 1 hour and have no row. The sweep reuses the scheduled-work wake and is a D9.2 deliverable.

### 3.2 File (create)

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `fileDocument` | `POST /documents/{id}/filing` | `documents.write` | `commitDocumentFiling` (`documentFiling.ts:405`), request shape `documentFiling.ts:57-71` |

- **Body:** `{mode: "new_document" | "new_version", type_key, primary: {subject_type: child|household|person, subject_id}, contexts?: [...], target_document_id?}`.
- `reviewAccepted` is always `false` externally. A type with `review_required` therefore refuses with `REVIEW_REQUIRED` (`documentFiling.ts:295,339`) until it is reviewed via `documents.review` (§6 Q3).
- `sensitivity` is never accepted.
- **Response:** `{document_id, mode, replay}`.
- **Refusals:**
  - from the existing command: `ALREADY_FILED`, `TYPE_UNAVAILABLE`, `TYPE_REQUIRED`, `SUBJECT_REQUIRED`, `SUBJECT_NOT_RELATED`, `REVIEW_REQUIRED`, `TYPE_REPLACEMENT_NOT_ALLOWED`, `NEW_VERSION_REQUIRED`, `TYPE_NEW_DOCUMENT_REQUIRED`, `TARGET_REQUIRED`, `BAD_FILING`, `AUDIT_UNAVAILABLE`, `STORAGE_COPY_FAILED` (`documentFiling.ts:279-345,411-460`);
  - new: **422 `TYPE_NOT_AVAILABLE_EXTERNALLY`** when the type's resulting sensitivity (`resultingSensitivity`, `documentFiling.ts:186`) is not `standard`;
  - **404 `NOT_FOUND`** for a subject outside the org or boundary, never `SUBJECT_NOT_FOUND`, so existence is not disclosed.
- **Actor gap:** `commitDocumentFiling` takes a user-shaped `DocumentActor` (`lib/documents/assertDocumentAccess.ts:86-120`, `documentActorForRequest` :132), and its SQL takes `p_actor uuid` (`supabase/migrations/20261210093500_documents_d5_filing.sql:147,253-266`). D9.2 must generalize the actor to an application principal, with no user id. Attribution then lives in the audit event (installation and credential) and `p_actor` is NULL (§6 Q2). Whether NULL is accepted by the D2 subject functions (`20261208090000_documents_d2_canonical_foundation.sql:405-487`) needs a real-database check.

### 3.3 Workflow status and archive

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `updateDocumentStatus` | `PATCH /documents/{id}` | `documents.write` | `app/api/admin/documents/[id]/route.ts:27-137`: `status_key` only, checked against the org's status definitions; lifecycle statuses refused 409 `LIFECYCLE_STATUS` (:96) |
| `archiveDocument` | `POST /documents/{id}/archive` | `documents.write` | **Gap: there is no `archived` document status.** The unavailable set is `deleted, quarantined, restricted, superseded` (`lib/documents/documentAvailability.ts:8`) |

- **Metadata:** no internal title, category or type edit exists. `PATCH [id]` changes only workflow status (`[id]/route.ts:15,52`), and a type change happens only through filing. So "update metadata" is proposed as **workflow status only**. Title edit is a §6 question.
- **Archive:** proposed as a new lifecycle status `archived`, added to `UNAVAILABLE_DOCUMENT_STATUSES`. It is audited (`document_archived`), reversible only internally, never deletes bytes or versions, and is excluded from lists and requirement evidence. It needs a migration if a status check constrains `documents.status` (§6 Q5).

### 3.4 Subjects

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `linkDocumentSubject` | `POST /documents/{id}/subjects` | `documents.write` | `linkDocumentSubject` (`lib/documents/documentSubjects.ts:130`); admin `[id]/subjects/route.ts:54-87` |
| `unlinkDocumentSubject` | `DELETE /documents/{id}/subjects/{subject_type}/{subject_id}` | `documents.write` | `unlinkDocumentSubject` (`documentSubjects.ts:153`) |

- Only **context** links are allowed. The primary owner decides access (`D9-D10-FIRST-INCREMENT-PROPOSAL.md` §1). Changing it externally would let a partner move a document between families, so `set_primary` (`documentSubjects.ts:115`) is **excluded**.
- Subject types: child, household, person (D9.1 breadth).
- Refusals: 404 `NOT_FOUND` for a document or subject outside the boundary; 409 `primary_subject_immutable`.

### 3.5 Review

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `submitDocumentReview` | `POST /documents/{id}/review` | `documents.review` | `reviewDocumentVersion` (`lib/documents/review/documentReviewService.ts:64`); admin `[id]/review/route.ts:31-68` |
| `listDocumentReviews` | `GET /documents/{id}/reviews` | `documents.read` | `listReviewEvents` (`documentReviewService.ts:101`) |

- **Submit body:** `{decision: accepted|rejected, reason?, version_id}`.
  - The current version only; `NOT_CURRENT_VERSION` 409, as validity does (`[id]/validity/route.ts:95`).
  - A rejection needs a reason (`[id]/review/route.ts:50`).
  - `pending` (reopen) and any change to a recorded review are refused **403 `REREVIEW_NOT_AUTHORIZED`** (`[id]/review/route.ts:68`).
- **Read:** decisions and timestamps; reviewer ids are application ids or `staff`, never a person's name.

### 3.6 Versions and validity

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `replaceDocumentVersion` | `POST /documents/{id}/versions` (upload id + `reason` ≥ 10) | `documents.write` | `addDocumentVersion` (`lib/documents/documentVersions.ts:112`); admin `[id]/versions/route.ts:32,66-112` |
| `setDocumentValidity` | `PUT /documents/{id}/validity` | `documents.write` | `setDocumentVersionValidity` (`documentReviewService.ts:81`); admin `[id]/validity/route.ts:68-119` |

- **Replacement:**
  - takes a completed upload, not new multipart;
  - refuses when the type forbids replacement (`TYPE_REPLACEMENT_NOT_ALLOWED`) or requires a new document (`TYPE_NEW_DOCUMENT_REQUIRED`);
  - the new version has no review and no malware verdict, so it is held where they are required.
- **Validity:** `{effective_on, expires_on, version_id}`; `BAD_DATE`, `VALIDITY_RANGE_INVERTED`, `NOT_CURRENT_VERSION` (`[id]/validity/route.ts:86-95`).
- **Delete is excluded.** Internal delete (`app/api/admin/pos/documents/[id]/route.ts:82`) and disposal (`lib/documents/documentDisposal.ts`) carry retention and legal-hold rules that an external principal should not trigger.

### 3.7 Requirements, expiration, history (reads)

| operationId | Route | Scope | Reuses |
|---|---|---|---|
| `listSubjectRequirements` | `GET /document-requirements?child_id=\|household_id=\|person_id=` | `documents.read` | `buildSubjectReadiness` / `evaluateDocumentRequirement` (`lib/documents/requirements/documentRequirementService.ts:556`; `documentRequirementEvaluator.ts:231`); states `REQUIREMENT_STATES` (:39) |
| `listExpiringDocuments` | `GET /documents?expires_before=YYYY-MM-DD` (a filter on `listDocuments`, one subject required) | `documents.read` | `document_versions.expires_on`, already read by D9.1 (`externalDocumentAuthority.ts:259`) |
| `listDocumentHistory` | `GET /documents/{id}/history` | `documents.read` | admin `[id]/history/route.ts:10-27`, projected to `{event, occurred_at, actor_kind, version_id?}`: ids and event names only, never reasons, paths or user names |

- A requirement whose type is non-standard is reported only as `{requirement_key, state}`, never with its evidence document. This mirrors `SENSITIVE_REQUIREMENT` (`lib/documents/requirements/documentRequirementAuthority.ts:62`).
- Waivers are read-only externally.

## 4. Cross-cutting rules

1. **Principal-to-actor adapter:** one function maps the external principal (application, installation, credential, org, boundary, granted scopes) to the actor the commands take. It carries no user id and no admin role, and it never borrows a session. Every audit row names `actor_kind = application` plus the three ids (`externalDocumentAuthority.ts:397-410`).
2. **Boundary:** every document id and every named subject resolves through the D9.1 visibility (`subjectVisibility`, `externalDocumentAuthority.ts:64`) inside the installation's org and, in `locations` mode, its sites. Anything outside answers **404 `NOT_FOUND`**, identical to a missing id, with nothing audited or written.
3. **Sensitivity:** writes may only create or touch documents whose effective sensitivity is `standard` (`resolveDocumentSensitivity`, `externalDocumentAuthority.ts:233`). A non-standard existing document answers 404 like D9.1. Filing into a non-standard type answers 422 `TYPE_NOT_AVAILABLE_EXTERNALLY`, because the type key is the caller's own input and not a disclosure.
4. **Audit before effect:** no audit, no write (503 `AUDIT_UNAVAILABLE`), as in every internal route.
5. **Limits:** the write budget is 120/60 s per installation (`rateLimit.ts:61`); upload size and type limits are the internal ones.
6. **No outbound messages:** no write enqueues a communication.
7. **Errors:** the D9.1 error envelope; codes are the stable strings above and are published in OpenAPI.

## 5. Acceptance cases

**L** = proven locally (synthetic, at the exact candidate). **H** = re-proven on hosted staging through the Application Principal path.

| # | Case | L | H |
|---|---|---|---|
| 1 | Without `documents.write`, every write route returns 403 before any read or write. Without `documents.review`, review submit returns 403. `documents.read` grants no write | ✓ | ✓ |
| 2 | An org-B credential naming an org-A document or subject gets 404, identical to a random id. No audit row, no write | ✓ | ✓ |
| 3 | A `locations` installation naming a subject outside its sites gets 404 | ✓ | ✓ |
| 4 | Replaying an idempotency key with the same body returns the same result and writes once. Same key, different body, returns 409 `idempotency_conflict`. Concurrent duplicates write once | ✓ | ✓ (sequential) |
| 5 | Upload: oversize gets 413 before bytes are read; a checksum mismatch gets 422; screening refused gets 415 with nothing stored | ✓ | ✓ |
| 6 | A failed row insert leaves no object. An expired upload is swept with no row and no object. A retried completion leaves one object | ✓ | sweep: L only |
| 7 | Filing reaches `commitDocumentFiling` only. A source lock: no `/api/v1` code writes `document_subjects` or `documents.metadata.filing` | ✓ | — |
| 8 | Filing into a non-standard type gets 422 `TYPE_NOT_AVAILABLE_EXTERNALLY`. A non-standard document is 404 on every write | ✓ | ✓ |
| 9 | A quarantined upload can never be filed, linked, reviewed or versioned externally | ✓ | ✓ |
| 10 | `set_primary` and delete are absent from the routes and OpenAPI | ✓ | — |
| 11 | Re-review or reopen gets 403 `REREVIEW_NOT_AUTHORIZED` | ✓ | ✓ |
| 12 | Every audit row of a write names the application, installation and credential, with `actor_user_id` null | ✓ | ✓ (census of the QA org's events) |
| 13 | Responses never contain a storage path, signed URL or content | ✓ | ✓ |
| 14 | The OpenAPI spec and the partner package are regenerated. The package copy is byte-identical to the canonical spec (the D9.1 check, commit `7d2414a63`) | ✓ | — |
| 15 | The write budget gives 429 past 120/60 s per installation | ✓ | optional |
| 16 | No write enqueues an outbound message (source lock plus a zero-row census on hosted) | ✓ | ✓ |

## 6. Questions for Kelly (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Upload transport: Alloy-proxied bytes (`PUT …/content`) or a signed storage upload URL handed to the partner? | **Proxied.** It reuses D1c-1 screening before storage, exactly as the admin route does. A signed URL would let unscreened bytes land in the bucket. The cost is the 10 MB cap and serverless body limits |
| Q2 | Generalize `commitDocumentFiling` to accept an application principal (one command), or add a parallel external command? | **Generalize.** Documents-forms-api :70-74 requires the same command; a parallel path is a second filing path |
| Q3 | Review submit: separate `documents.review` scope, or fold it into `documents.write`? | **Separate**, for the reasons in §2. If folded, upload-then-self-approve becomes possible for any writer |
| Q4 | Idempotency on non-filing writes: required header with a stored replay, or best-effort? | **Required**, with stored replay for 24 h. Partners retry, and a duplicate link or review is a real error |
| Q5 | Archive: add an `archived` lifecycle status (new; may need a migration), or leave archive out of D9? | **Add it, in D9.3.** It is the only non-destructive removal; delete stays internal |
| Q6 | Title edit: expose it (a new internal command too), or leave it out? | **Out of D9.** No internal path exists; the type label already names the document |
| Q7 | Context links for `opportunity` / `vendor` subjects? | **No.** D9.1 breadth is child, household and person |
| Q8 | Expiration query across the whole org? | **No.** One subject per query, like `listDocuments`; an org-wide query is the excluded feed |

## 7. Proposed increments

| Increment | Contents | Depends on |
|---|---|---|
| **D9.2** | `documents.write`; actor adapter (Q2); upload initiate/complete with the sweep (Q1); `fileDocument`; context link/unlink; idempotency store (Q4); OpenAPI and partner package; acceptance cases 1–10 and 12–16 locally | Ratification. The actor `p_actor` NULL check on an isolated database. Hosted proof needs a `d9-documents-write-cert` application, a hosted QA plan, and `documents.write` deployed first (a scope unknown to staging's catalog cannot be granted) |
| **D9.3** | `documents.review` and review read; version replacement; validity; requirements read; expiration filter; history; archive (Q5, possibly a migration); case 11 | D9.2 merged; Q3 and Q5 answered |
