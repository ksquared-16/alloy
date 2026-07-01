# Documents / Forms API

**Domain size:** ~46 route handlers. Full list: [`api-index.md` → Documents / Forms](api-index.md#documents--forms).

Form authoring (definitions, versions, publish/archive), submissions and linkage, packet definitions/sessions/review, documents storage and signed URLs, POS documents/packets, and **public tokenized** form/submission capture.

> Doctrine: `docs/platform/modules/documents-and-forms.md`. This area is **partially implemented** product-wide (per `docs/platform/governance/api-contracts.md`).

---

## Auth & org scoping

- **Auth:** Admin forms/documents use `getAdminContextCached` (+ access-scope on entity-linked reads). Public form routes are **token-scoped** (`/api/public/forms/[token]/*`) — no admin session.
- **Scope:** Documents reads that join CRM entities apply access-scope; submissions link back to org-scoped records. Public submission writes are constrained to the token's form/link.

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

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/documents` , `/[id]` | GET PATCH | Document metadata |
| `/api/admin/documents/[id]/signed-url` | GET | Time-limited signed download URL (storage) |
| `/api/admin/documents/upload` | POST | Upload |
| `/api/admin/documents/entity-options` | GET | Linkable entity options |
| `/api/admin/document-field-definitions` , `/[id]` | GET POST PATCH DELETE | Document field config |

### POS documents & packets

`/api/admin/pos/documents` , `/[id]` (+ `extracted-text`), `/api/admin/pos/packets` (+ `compose`, `from-template`, `roster`). POS document store with text extraction and packet composition. `DELETE /api/admin/pos/documents/[id]` had no detected validation signal — verify auth/ownership before delete (see [audit](api-documentation-audit.md)).

### Public (tokenized) forms

| Path | Methods | Auth | Purpose |
|------|---------|------|---------|
| `/api/public/forms/[token]/resolve` | GET | token | Resolve a public form by token |
| `/api/public/forms/[token]/submissions` , `/[submissionId]` | GET POST | token | Create / read submission |
| `/api/public/forms/[token]/submissions/[submissionId]/submit` | POST | token | Finalize submission |
| `/api/public/field-definitions` | GET | public | Field definitions for public forms |

These are the only externally-reachable form endpoints. They resolve org/form from the token and constrain writes to that scope.

---

## Validation, envelopes & side effects

- **Validation:** Manual; submission `submit` validates required fields/linkage. Signed-URL and upload routes validate ownership/type.
- **Envelopes:** Lists `{ <name>: [...] }`; single objects bare or `{ ok }`.
- **Side effects:** `submit` and `generate-document` create documents and may emit events; signed-url issues storage credentials (time-limited) and must remain server-only. Public submission writes are append-style into org-scoped submission tables.

Source root: `web/app/api/admin/{forms,documents,document-field-definitions,pos}`, `web/app/api/public/{forms,field-definitions}`.
