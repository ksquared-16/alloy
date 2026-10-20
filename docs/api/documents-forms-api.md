---
owner: platform
status: canonical
last_reviewed: 2026-10-20
supersedes: []
---
# Documents / Forms API

**Domain size:** ~46 route handlers. Full list: [`api-index.md` → Documents / Forms](api-index.md#documents--forms).

Form authoring (definitions, versions, publish/archive), submissions and linkage, packet definitions/sessions/review, documents storage and signed URLs, POS documents/packets, and **public tokenized** form/submission capture.

> Doctrine: `docs/platform/modules/documents-and-forms.md`. This area is **partially implemented** product-wide (per `docs/platform/governance/api-contracts.md`).

---

## Auth & org scoping

- **Auth:** Admin forms/documents resolve the session with `getAdminContextCached`, then authorize on **capabilities** — never on the compatibility `ctx.role` (see [Document authorization](#document-authorization-documents-v1--d1a)). Public form routes are **token-scoped** (`/api/public/forms/[token]/*`) — no admin session.
- **Scope:** Every document list, link, byte and extracted-text route applies the caller's department/site scope through one predicate; submissions link back to org-scoped records. Public submission writes are constrained to the token's form/link.

---

## Route groups

### Forms authoring

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/forms` , `/[formId]` | GET POST PATCH | Form definition CRUD |
| `/api/admin/forms/[formId]/{archive,duplicate,outcome-labels,lifecycle-coverage}` | POST GET | Lifecycle operations |
| `/api/admin/forms/[formId]/versions` , `/[versionId]` (+ `publish`/`archive`) | GET POST | Versioned form content + publish lifecycle |
| `/api/admin/forms/[formId]/public-links` , `/[linkId]` | GET POST | Public link issuance |
| `/api/admin/forms/crm-entity-search` | GET | Entity search for form linkage |

### Submissions & packets

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/forms/submissions` , `/[submissionId]` | GET | Submission reads |
| `/api/admin/forms/submissions/[submissionId]/{submit,confirm-linkage,manual-link,generate-document}` | POST | Submission lifecycle → document generation |
| `/api/admin/forms/packet-definitions` , `/[packetDefId]` (+ `items`, `public-links`) | GET POST PATCH PUT | Packet definitions |
| `/api/admin/forms/packet-sessions` , `/[packetSessionId]` (+ `review`, `review-insight`, `review-rollup`) | GET | Packet sessions + review rollup (P2-1) |
| `/api/admin/forms/packet-links` | GET | Packet link reads |

### Documents

| Path | Methods | Requires | Purpose |
|------|---------|----------|---------|
| `/api/admin/documents` | GET | `documents.read` | Document metadata list, narrowed to the caller's scope |
| `/api/admin/documents/[id]` | PATCH | `documents.write` + subject in scope | Document workflow status |
| `/api/admin/documents/[id]/signed-url` | GET | document decision | Time-limited signed download URL (10 min) |
| `/api/admin/documents/[id]/source-preview` | GET | document decision | Sandboxed text render of an HTML/TXT/CSV source |
| `/api/admin/documents/upload` | POST | `documents.write` (+ `processing.operate` to open/attach a Processing case) | Upload, max 10 MB |
| `/api/admin/documents/entity-options` | GET | `documents.write` | Records a new upload may attach to |
| `/api/admin/vendors/[id]/documents/signed-url` | GET | document decision + document belongs to vendor `[id]` | Vendor document link |
| `/api/admin/persons/[id]/profile-photo` | GET POST DELETE | GET: document decision; POST/DELETE: `documents.write` (POST also the decision) | Canonical person photo pointer |

`/api/admin/document-field-definitions` was retired with the Document Field subsystem and no longer exists.

### POS documents & packets

| Path | Methods | Requires | Purpose |
|------|---------|----------|---------|
| `/api/admin/pos/documents` | GET | `processing.documents.manage` + `documents.read`, rows narrowed to scope | Processing source-document list (no product caller; the queue reads `/api/admin/processing/queue`) |
| `/api/admin/pos/documents/[id]` | PATCH DELETE | `processing.documents.manage` | Rename; guarded hard delete of an unprocessed source (refuses a source that produced a form, a completed/archived case, or a stored file outside the org prefix) |
| `/api/admin/pos/documents/[id]/extracted-text` | GET | `processing.operate` + document decision | Full extracted/OCR text for Template Setup |

`/api/admin/pos/packets` (+ `compose`, `from-template`, `roster`) compose packets from those sources.

### Public (tokenized) forms

| Path | Methods | Auth | Purpose |
|------|---------|------|---------|
| `/api/public/forms/[token]/resolve` | GET | token | Resolve a public form by token |
| `/api/public/forms/[token]/submissions` , `/[submissionId]` | GET POST | token | Create / read submission |
| `/api/public/forms/[token]/submissions/[submissionId]/submit` | POST | token | Finalize submission |
| `/api/public/field-definitions` | GET | public | Field definitions for public forms |

These are the only externally-reachable form endpoints. They resolve org/form from the token and constrain writes to that scope.

---

## Document authorization (Documents V1 / D1a)

Implemented 2026-10-20 (PR #1518, merge `7a4de136`). Application-level only: database grants, RLS and storage policy are unchanged and remain Documents V1 / D1b work, so this section does **not** describe the Documents domain as secure.

**The document decision** — `assertDocumentAccess` (`web/lib/documents/assertDocumentAccess.ts`) — is the one authority every route that returns a document's bytes, a link to them or their extracted text calls, in this order:

1. A session with an organization (`401` / `403`).
2. A resolvable access context with an explicit scope — an unresolved context is refused (`403 SCOPE_DENIED`), never admitted on the legacy role.
3. Admission: `documents.read`, or a real role key the `documents` RLS SELECT policy admits (owner, admin, ops, manager). The compatibility `ctx.role` is **not** read: it names every portal member `ops` (`403 INSUFFICIENT_ROLE`).
4. The row, read by id **and** org (`404 NOT_FOUND` for a missing id, another organization's id, or a malformed id).
5. The subject's department/site scope, by the same predicate the list applies (`404 NOT_FOUND` — out of scope is indistinguishable from absent). Subjects with no department/site linkage (child, person, household, vendor, unattached intake) are readable only with unrestricted scope.
6. Restricted status (`deleted`, `quarantined`, `restricted` → `403 DOCUMENT_RESTRICTED`) and a stored location (`403 STORAGE_LOCATION_MISSING`).
7. The storage path must lie under `<org_id>/` (`403 PATH_OUTSIDE_ORG`). The same rule guards server-side byte reads and Processing deletion.

Entity types are canonicalised (`opportunities` → `opportunity`, …) before any decision. Refusals never echo a storage path, file name or text.

**Response codes added by D1a**

| Status | Code | When |
|--------|------|------|
| 403 | `required_permission: documents.read` / `documents.write` | List or write route without the capability |
| 403 | `INSUFFICIENT_ROLE`, `SCOPE_DENIED`, `PATH_OUTSIDE_ORG` | Document decision refusals (above) |
| 404 | `NOT_FOUND` | Missing, cross-organization, malformed or out-of-scope id; vendor route when the document is not that vendor's |
| 409 | — | Processing delete of a row whose stored file is outside the organization |
| 413 | `FILE_TOO_LARGE` (`max_bytes`) | Upload over 10 MB, checked from the declared length before parsing and on the bytes. Hosted requests above ~4.5 MB are refused earlier by the Vercel request-body limit with a platform 413 that is not this check. |
| 503 | `AUDIT_UNAVAILABLE` | The audit record below could not be written, so the action was not performed |

**Audit.** Written to `workflow_events` (`entity_type` `documents` or `persons`, payload `audit: "documents_v1_d1a"`, actor and route, never the URL or path) **before** the action: `document_link_issued` (document and vendor signed URLs, profile-photo GET/POST), `document_delete_authorized` (+ `document_delete_failed` on a partial failure), `person_profile_photo_set`, `person_profile_photo_cleared`. Avatar projection on read models is not individually audited.

**Not changed by D1a.** Avatar projection (`documentActorFromAdminParts`) keeps its pre-D1a admission for subjects its caller already authorized — a policy decision recorded for D1b/D2. Upload does not yet scan content or rate-limit; the bucket has no size/MIME limit.

**Ownership.** Documents has no canonical owner in `docs/context/alloy-canonical-owner-map.md`. One is needed before the Documents domain can be certified; this page owns only the Documents / Forms API contract.

Evidence: `certification/documents-v1/` (D0 census, D1a hosted certification and audit census).

---

## Validation, envelopes & side effects

- **Validation:** Manual; submission `submit` validates required fields/linkage. Document routes validate through the document decision above; upload validates capability, size (10 MB) and format.
- **Envelopes:** Lists `{ <name>: [...] }`; single objects bare or `{ ok }`.
- **Side effects:** `submit` and `generate-document` create documents and may emit events; signed-url issues storage credentials (time-limited) and must remain server-only. Public submission writes are append-style into org-scoped submission tables.

Source root: `web/app/api/admin/{forms,documents,pos,vendors/[id]/documents,persons/[id]/profile-photo}`, `web/app/api/public/{forms,field-definitions}`.
