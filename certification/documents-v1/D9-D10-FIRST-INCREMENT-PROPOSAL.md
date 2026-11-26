# Documents V1 — D9 / D10 first increment: contract proposal

**Status: PROPOSAL — implemented as D9.1 under `OPWORK_AA660DC9554D_SPRINT_5D62877D85D6` with the user-approved A2 breadth (children, households AND parents/guardians, standard sensitivity), and with detail and download as `GET /api/v1/documents/{id}` and `GET /api/v1/documents/{id}/download-link` (the admin signed-URL route is a GET too).** The proposal text below is kept as written.
- Nothing is implemented, published or registered.
- It builds on `D9-D10-ACCEPTANCE-PREPARATION.md` (commit `f7fb93ab0`) and does not repeat its census or history search.
- Every repository claim it relies on is pinned by `web/tests/documents/d9FirstIncrementTraceability.test.ts`.
- Objective `OPWORK_AA660DC9554D_SPRINT_6A4F60B1555E`, lane `lane_aa660dc9554d`, 2026-10-30.

## 0. Provenance: four kinds of statement, never mixed

| Tag | Meaning | Source |
|---|---|---|
| **USER** | A direct user requirement | ChatGPT conversation `6ad7b667-82f4-83e8-a83f-caf36a79fb66`, message `65eb16f0-1fae-4bd7-bac6-49be022b0b7b` (recovered by the parent, quoted as relayed) |
| **ASSISTANT** | The original assistant proposal (§8). **Not independently verified as ratified by the user** | Same conversation, message `14d28f8e-15f5-4b80-9dc2-c6c35eda3a7d` |
| **REPO** | What the code and docs actually contain | Cited by path; pinned by the traceability test |
| **INFERENCE** | This lane's reasoning, open to correction | — |

The relayed reading **omitted some assistant and checklist content**. A point absent here is **not proven undefined** there.

**USER requirement, as relayed:** Documents must be **available through the API**, **named and filed in folders**, and **associated with children, parents and households**.

**ASSISTANT proposal §8, as relayed (scope list):**
- documents: list, retrieve, create, update metadata, archive;
- files: initiate upload, complete upload, secure download;
- authorized subject link and unlink;
- category and type vocabulary;
- subject requirements;
- review: submit and read;
- expiration query;
- incremental changes and lifecycle history.

**ASSISTANT principles:**
- stable IDs and idempotency;
- pagination, filters and correlation;
- version-aware replacement;
- short-lived scoped downloads and no permanent URLs;
- an intentional `/api/v1` expansion, never exposing admin routes.

**D10, as relayed:** confirmed as **inbound email attachment integration / ingestion** (tracker, message `50f481fc-1898-4008-bf34-9431ea8236cd`). Its detailed contract was **not recovered**. WS11 reuse is an architectural **INFERENCE** only.

## 1. What the repository already provides for the USER requirement (REPO)

| USER requirement | Existing model | Where |
|---|---|---|
| "named" | `documents.title`; type and category labels | D2 / D3 Studio configuration |
| "filed in folders" | **Filing is logical, never storage folders**: grouped by owner, then the Studio **category** (`document_categories`, hierarchical through `parent_id`) and **type** (`document_types`) | `docs/platform/modules/documents-and-forms.md` §D4 ("Filing is logical — subjects and types — never storage folders"); `supabase/migrations/20261209090100_documents_d3_studio_configuration.sql` |
| "associated with children / parents / households" | `document_subjects`: one active PRIMARY owner (household, person, child, opportunity or vendor) plus context links. Access is decided by the primary owner alone. Written only through `document_set_primary_subject` / `document_link_subject` / `document_unlink_subject` | `web/lib/documents/documentSubjects.ts` |
| "available through the API" | `/api/v1` external collection pattern (`externalCollectionRoute`): Application Principal, installation, site boundary, `limit` / `cursor` / `since_token` paging, rate limit, activity record. **No documents operation or scope exists** | `web/lib/platform/external/collectionRoute.ts`, `scopeCatalog.ts`, `app/api/v1/children/route.ts` |
| Secure download | Per-request signed URL, **10 minutes** for download (`signedUrlExpirySeconds("download")`). Issuance is recorded (`document_link_issued`) **before** the link is minted; the storage path is never returned | `web/lib/documents/assertDocumentAccess.ts`; `app/api/admin/documents/[id]/signed-url/route.ts` |
| Versions | Immutable `document_versions`; `documents.current_version_id` names the current one | `web/lib/documents/documentVersions.ts` |
| Sensitivity | Declared on each document: `standard`, `personal_identity`, `medical`, `custody_safeguarding`, `restricted`. Internal access to the last four needs clearance | `web/lib/documents/documentSensitivity.ts` |
| Who is visible externally | Children are visible to an installation only through **enrollment at a site inside its boundary** (not organization membership) | `app/api/v1/children/route.ts` header |

## 2. Proposed FIRST increment (D9.1): read-only Documents through `/api/v1`

**Why read first (INFERENCE).** It satisfies all three USER clauses (available, named and filed, associated) with no write path, no upload ingress and no new credential type. It reuses the existing collection route, boundary, paging, rate limit and the audited signed-URL issuance. It doesn't decide any of the ASSISTANT write operations, which become increment 2 once their contract is confirmed.

### 2.1 Surface (four operations, one new scope)

| Operation | Method / path | Scope | Notes |
|---|---|---|---|
| `listDocumentCategories` | `GET /api/v1/document-categories` | `documents.read` | The "folders": categories (key, label, parent key, order) with their published types (key, label). Active only |
| `listDocuments` | `GET /api/v1/documents` | `documents.read` | Filters: `child_id` / `household_id` / `person_id` (one subject), `category_key`, `type_key`. Paging: `limit`, `cursor`, `since_token` (incremental) |
| `getDocument` | `GET /api/v1/documents/{id}` | `documents.read` | Same projection as a list row |
| `createDocumentDownloadLink` | `POST /api/v1/documents/{id}/download-link` | `documents.read` | Returns `{url, expires_at}`. Lives 10 minutes (reuses `signedUrlExpirySeconds("download")`). Records `document_link_issued` with installation and credential **before** minting. Never a permanent URL |

**Row projection** (stable ids; no storage path, no URL, no extracted text):
- `id`, `title`;
- `type {key, label}`;
- `category {key, label, path[]}`;
- `subjects [{type: child|household|person, id, role: primary|related}]`, where related subjects outside visibility are omitted, not named;
- `current_version {id, number, content_type, size_bytes, received_at}`;
- `review_status`;
- `valid_until`;
- `updated_at`.

### 2.2 Visibility rule (REPO rule extended; the decision in §4 picks the breadth)

A document is visible to an installation only when **all** of these hold:
1. It is in the installation's organization (from the principal, never caller-selected).
2. Its **primary owner** is:
   - a child visible under the existing children rule (enrolled at an in-boundary site); or
   - that child's household; or
   - a guardian person related to such a child, under option B in §4.
3. Its sensitivity is allowed for external read. In increment 1, `standard` only unless decided otherwise (§4).
4. It is not archived, quarantined or deleted.

A document outside these rules is answered **exactly like a missing one**: 404 on `getDocument` and on `download-link`, and absent from lists.

### 2.3 Out of increment 1 (stays ASSISTANT §8, unconfirmed, increment 2+)

- Create; upload initiate and complete. Increment 2 would file through `commitDocumentFiling` with a caller key namespaced per installation.
- Update metadata, archive, subject link and unlink.
- Review submit.
- Requirements read, expiration query, lifecycle history beyond `since_token`.
- Version-aware replacement.

## 3. Acceptance cases for increment 1 (each a test before release)

1. **Scope:** without `documents.read`, every operation returns 403 before any read. `getContext` still works.
2. **Tenant:** a token from org B gets 404 for an org A document id, and an empty list for an org A child filter.
3. **Boundary:** a `locations` installation sees documents of children enrolled in its sites, and gets 404 for a child enrolled only elsewhere. `org_wide` widens sites, not the enrollment rule.
4. **Subjects:** a child-owned document lists under `child_id`. A household-owned document lists under `household_id` and not under an unrelated household. A related subject outside visibility is omitted from `subjects`.
5. **Sensitivity:** a `medical` / `personal_identity` / `custody_safeguarding` / `restricted` document is invisible in increment 1 (unless option S2 or S3 is chosen), and the 404 is indistinguishable from a missing id.
6. **"Folders":** `listDocumentCategories` returns the org's active hierarchy. Every listed document's `category.path` resolves in it. An archived category never appears.
7. **Download:** `download-link` returns a URL expiring at most 10 minutes later. An audit row (`document_link_issued`, installation, credential) exists before the URL. A second call issues a new link. The response never contains a storage path.
8. **Paging and incremental:** `limit` / `cursor` page with no duplicates or gaps under concurrent inserts. `since_token` returns only documents changed after the token. An invalid cursor gives `invalid_cursor`.
9. **Version:** a document with a new version shows the new `current_version.id`. Older versions are not downloadable through increment 1.
10. **Rate limit:** reads count against `authenticatedRead` (600/60 s), with RateLimit headers and `rate_limited` on excess.
11. **No admin route reachable:** every new handler is under `/api/v1`, declared in `PUBLIC_OPERATIONS`, and uses the external principal only.
12. **Archived or quarantined documents are invisible.**

## 4. The smallest remaining product decision

Breadth of visibility: **which owners and which sensitivity classes** a partner may read in increment 1.

| Option | Owners visible | Sensitivity visible | Trade-off |
|---|---|---|---|
| **A1 (recommended)** | visible children + their households | `standard` only | Meets the USER clauses for children and households. No identity, medical or custody document leaves Alloy. Parents' own documents are deferred |
| A2 | A1 + guardian persons of visible children (needs `relationships.read` semantics) | `standard` only | Adds the "parents" clause. Wider PII surface (adult records) |
| S2 | A1 or A2 | + `personal_identity` | Partner can read IDs and birth certificates. Needs an explicit data-sharing basis |
| S3 | A1 or A2 | + `medical` | Requires an external equivalent of internal clearance (none exists). Not recommended for increment 1 |

**Recommendation (INFERENCE):** A1 with standard sensitivity only, as increment 1. A2 follows once guardian visibility is confirmed. S2/S3 need explicit decisions and are not defaults.

**Other open choices (each has a default if unanswered):**
- Expose `review_status` / `valid_until`. Default: yes, as read-only facts.
- Download-link lifetime. Default: the existing 10 minutes.

## 5. D10 first increment (no new ingress)

- **USER/tracker:** D10 = inbound email attachment integration and ingestion.
- **REPO:** Communications already receives, routes and dedupes inbound email. Attachments are stored as metadata only. Processing admits `email_attachment` as a case source, but nothing opens one, and it isn't a filing-queue document source. WS11's attachment table is planned but in no migration.
- **INFERENCE:** the smallest D10 increment is the **consumer seam only**, gated on WS11 storing attachments as `documents`.
- **Proposal D10.1 (after WS11):**
  - a stored email attachment opens **one** Processing case (`source_kind = 'email_attachment'`) through the existing non-form opener;
  - `email_attachment` joins the filing queue's document sources;
  - filing is only `commitDocumentFiling`, with key `email_attachment:<message>:<document>`;
  - an unresolved subject lands in the existing "Needs a record" lane;
  - no outbound message is sent.
- **Acceptance:**
  1. A redelivered email creates no second case or filing.
  2. Only an owned message reaches Documents, in its own org.
  3. An oversized or unsupported attachment is recorded and not silently dropped.
  4. Filing refusals are the published codes.
- **Decision:** whether D10.1 waits for malware scanning (D1c-2). Default: **yes**, attachments stay in quarantine until screened.

## 6. Decision options for the user (one answer moves increment 1 forward)

1. **Approve D9.1 read-only with A1 / standard** (recommended). It becomes a Documents slice with tests for the twelve acceptance cases and an OpenAPI update. Developer Platform adds the scope.
2. **Approve D9.1 with A2** (adds parents' own documents).
3. **Write-first instead:** confirm the ASSISTANT §8 create / upload / link contract as ratified, and start with increment 2 (filing through `commitDocumentFiling`).
4. **D10.1 gate:** confirm "after WS11, and after malware screening" (default), or name an earlier path.
