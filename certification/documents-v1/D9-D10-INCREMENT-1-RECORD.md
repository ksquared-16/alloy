# Documents V1 — D9.1 read API and D10 safe-hold seam: local implementation record

**Status: LOCAL CANDIDATE, synthetic proof only.**
- Not built for production, checkpointed, published, merged or deployed.
- No database was touched.
- **D9 is not closed:** writes, uploads and the rest of the D9 scope remain open.
- **D10 is held:** every inbound attachment waits on two prerequisites that do not exist yet.

| | |
|---|---|
| Objective | `OPWORK_AA660DC9554D_SPRINT_5D62877D85D6`, established `gar_66a48f620bdb23` / `tha_3ae305add78d3b` |
| Approval | User, 2026-10-30T21:18:56Z, "approved", replying to the three-decision bundle (D9 children / households / parents-guardians read slice; D10 inbound attachments → Processing → canonical filing with screening tracked and unsafe attachments held) |
| Lane / run | `lane_aa660dc9554d` / `erun2_664a379fc9ea49e6`, branch `agent/documents` |
| Base | staging `8ef45da545ec` (merged #1618). Earlier unpublished slices (Rev4 `c342ea871`…`b12cbffc2`, D9/D10 preparation `f7fb93ab0`, `2b213d02b`) are preserved and untouched |
| Preparation reused | `D9-D10-ACCEPTANCE-PREPARATION.md`, `D9-D10-FIRST-INCREMENT-PROPOSAL.md` |

## c1 — D9.1: read-only standard documents in `/api/v1`

**Four operations, one new scope (`documents.read`, read access):**

| Operation | Route | Notes |
|---|---|---|
| `listDocumentCategories` | `GET /api/v1/document-categories` | The logical "folders": active categories with `parent_key`, plus published types |
| `listDocuments` | `GET /api/v1/documents` | Exactly ONE of `child_id` / `household_id` / `person_id`. Optional `category_key` / `type_key`. Standard paging (`limit`, `cursor`, `since_token`, `updated_since`) |
| `getDocument` | `GET /api/v1/documents/{id}` | One document |
| `getDocumentDownloadLink` | `GET /api/v1/documents/{id}/download-link` | `{document_id, url, expires_at}` |

**Seams (reuse, no new framework):**
- **Collection factory:** `externalCollectionRoute` gained one optional `source` beside `rpc`. Credential, scope, budget, paging and boundary keep their order; the eight existing routes are unchanged.
- **Detail and download:** go through the same factory via `singleResourceThroughCollection`, which pins the id; "no row" becomes one 404.
- **Visibility** (`lib/documents/external/externalDocumentAuthority.ts`):
  - children: `list_external_children`;
  - households: `list_external_households`;
  - persons: only active `parent` / `guardian` relationships (seeded vocabulary, distinct from `emergency_contact`, `authorized_pickup`, `payer`) to a visible child.
- **Document rules:**
  - the primary owner from `document_subjects`;
  - `isDocumentUnavailable`;
  - `resolveDocumentSensitivity` must return an EMPTY set: declared class, medical type, safeguarding evidence and medical form linkage, failing closed.
  - Medical, identity, custody/safeguarding and restricted documents are excluded. No external clearance was added.
- **Download:**
  - `signedUrlExpirySeconds("download")` (10 minutes);
  - `recordDocumentAudit` writes `document_link_issued` naming the application, installation and credential BEFORE the link is minted (the audit accepts an application-principal actor; it still refuses an action with no actor);
  - `isStoragePathWithinOrg` is checked;
  - no storage path is returned.
- **Contract surfaces updated together:**
  - the scope catalog and operator wording;
  - OpenAPI and its byte-identical package copy;
  - the developer spec (§2 counts, §5 scopes, new §10a with a verification-status sentence: unit-proven, not yet exercised over HTTP), the front door and the guide;
  - the embedded governed documents (regenerated);
  - `routeCapabilities.declared.json`;
  - the ratified-scope and endpoint tripwires. The user approval is recorded at each tripwire.

**Proof:** `tests/platform/external/documentsResource.test.ts` **20/20**. It runs the real routes and factory on an in-memory DB, covering:
- 401 before anything (even for a malformed id), and 403 without the scope;
- one subject filter required;
- empty sites give an empty page;
- children, households and guardians; pickup-only, inactive and out-of-boundary adults excluded;
- cross-org, related subjects omitted, no internal fields;
- category/type narrowing, paging, cursor and sync token;
- nine withheld or missing cases with one identical 404;
- audit-before-mint, each request re-audited, no audit no link, withheld means no audit and no sign, a foreign path never signed;
- the category hierarchy.

**Mutation check:**

| Mutation | Result |
|---|---|
| Sensitivity filter disabled | 6 fail |
| Pickup-only adult counted as guardian | 3 fail |
| Link minted without audit | 1 fails |

Restored byte-for-byte afterwards.

**Still open in D9:**
- create, upload, metadata edit, archive, subject link/unlink;
- review submit;
- requirements and expiration queries;
- version-aware replacement;
- the organization-wide feed (deliberately absent);
- HTTP exercise against a running server, and the hosted proof.

## c2 — D10: existing contracts, held until safe

**Seam:** `lib/documents/inbound/emailAttachmentFilingDecision.ts`, a pure decision. It reads, stores, opens and sends nothing.
- **Releasing a case.** It only ever releases ONE Processing case, with:
  - `source_kind = 'email_attachment'` (already admitted);
  - idempotency key `email_attachment:<message>:<document>`, shared by the case source and `commitDocumentFiling`;
  - **no proposed subject**, so the case lands in the existing "Needs a record" lane.
- **Held** when:
  - the message isn't owned, or its ownership is ambiguous;
  - the part is inline or a link;
  - the attachment isn't stored, or is stored in another organization;
  - the document is unavailable or quarantined;
  - screening is unavailable, pending, infected, suspicious or failed.

**Prerequisites, as of this record:**

| Dependency | Owner | State | Proof that would release it |
|---|---|---|---|
| WS11 attachment storage | Communications (Conversation Platform WS11) | **missing**: no migration creates `communication_message_attachments`; attachments are metadata only | the migration plus bytes stored as `documents` |
| D1c-2 content screening | Documents security (deferred in D5) | **missing** | a recorded verdict per version before release from quarantine; provider within existing services (no new paid provider without approval) |
| D10 case opening | Documents / Processing | **missing** (bounded next slice) | the existing non-form opener called with this decision; `email_attachment` added to the filing queue's document sources |

`EMAIL_ATTACHMENT_FILING_CAPABILITY` is `{storage: false, screening: false}`. It is changed only by the change that ships each prerequisite. A test ties `storage` to the migrations, so it can't be flipped while WS11 is absent.

**Proof:** `tests/documents/emailAttachmentFilingDecision.test.ts` **18/18**:
- held today with both reasons;
- dependencies owned;
- release only when ready;
- the same key on redelivery;
- eleven hold cases;
- storage without screening still held.

**Not done (correctly):** no new ingress, no case opened, no outbound message, no screening faked.

## c3 — local only; history preserved

**Validation (broker):**
- `tests/platform/external` + `tests/documents`: **883 passed**, 257 skipped (live-DB suites skipped by design).
- `typecheck` and `typecheck:tests`: clean.
- Prebuild guards: route-capabilities, service-client-principal, unauthenticated-side-effects, runtime-mode-audience and governed-documents pass. `verify:module-imports` runs after commit.

**No production build:** the installed broker's candidate-build containment is unresolved (HostCapacity, Rev4 `vreq_597c4c1e28d3`), so no build was requested. The checkpoint waits on that.

**Not touched:**
- no database, `.env`, secrets, customer records, hosted config, credentials, installs or containers;
- no publication, merge or deploy;
- the Rev4 candidate `c843cda5d363` and promoted #1618.

## Remaining for full acceptance (distinct from this local proof)

1. A production build and sprint checkpoint, once HostCapacity's build contract is fixed.
2. Director release, then PR and merge, then staging serving it.
3. An HTTP / hosted proof of D9.1 with an `authz_q1`-style application principal, which then removes the spec's verification sentence.
4. The WS11 storage and D1c-2 screening slices, then the D10 case-opening slice.
5. The D9 write increment, after its contract is confirmed.
