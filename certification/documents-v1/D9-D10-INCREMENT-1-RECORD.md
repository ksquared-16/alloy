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

## c2 — D10: inbound attachments → Processing → canonical filing (pipeline implemented; three edges blocked)

**What changed since the first D10 slice (`5d4fc84ac`).** That slice was only the pure gate. It also recorded screening
as wholly missing, which was wrong:
- **D1c-1 structural screening exists.** `decideIngestion` is applied to every outside file today and is now reused here. It is not antivirus.
- **What's missing is D1c-2 malware scanning.**

**Implemented, all local:**

| Edge | Seam | State |
|---|---|---|
| Owned message → per-attachment holds before any bytes | `preStorageHolds` (unowned, ambiguous, inline/link, storage absent, scan required but absent) | **done**. An unowned message's attachment is never retrieved or stored |
| Retrieval + storage (WS11) | `AttachmentStorageBoundary` (`findStored` / `retrieve` / `store`, idempotent on message+attachment). Production default `UNAVAILABLE_ATTACHMENT_STORAGE` | **boundary done; implementation BLOCKED.** Owner: Communications WS11 |
| Screening of an outside file | size cap (`PUBLIC_UPLOAD_MAX_FILE_BYTES`), byte sniffing (`sniffPublicUploadKind`: PDF/PNG/JPEG), `decideIngestion`: refuse = never stored, quarantine = stored `quarantined` (the existing review queue), clean = stored | **done**, reusing the public-upload contract exactly |
| Malware scanning | `MalwareScanBoundary`. Production default `UNAVAILABLE_MALWARE_SCAN`. Default policy `requireMalwareScan: true` holds everything; a structural-only policy is an explicit organization choice | **boundary done; scanner BLOCKED.** Owner: Documents security D1c-2. No scanner invented |
| Gate | `decideInboundAttachmentFiling` | **done** |
| Case opening | existing `openNonFormProcessingCaseFromSource` with `source_kind = 'email_attachment'`, `source_id = document id`. Idempotent through `uq_pcs_primary_source_once`; a race loser re-reads and converges | **done**. No subject is proposed |
| Filing | `email_attachment` added to `DOCUMENT_SOURCE_KINDS`, so `loadDocumentCase` → filing workspace → `commitDocumentFiling` under `processing_case:<case>:document:<document>`. The approve route files these cases exactly like uploads | **done** |
| Ingestion hook | `ingestResendInboundEmail` calls `fileInboundEmailAttachments` after the message persists (owned only, best-effort) | **BLOCKED** until WS11 storage. Owner: Communications. No new ingress added |
| Sends | none. The pipeline's dependencies carry no messaging capability | by construction |

**Schema:**
- `certification/documents-v1/D10-WS11-ATTACHMENT-STORAGE-DRAFT.sql` is the planned `communication_message_attachments` shape from CONVERSATION-PLATFORM-V1-PLAN.md :414-422, plus a proposed `provider_attachment_id` uniqueness for idempotency.
- It is drafted for the Communications owner's review, **outside `supabase/migrations`**.
- Nothing was applied or queried.

**Proof:**
- `tests/documents/inboundAttachmentFiling.test.ts` **12/12**. Real `decideIngestion` and the real opener, over in-memory boundaries that enforce the unique primary-source rule:
  - production wiring holds everything;
  - a clean owned attachment gives one case with no subject;
  - redelivery gives no second retrieval, document or case;
  - a lost concurrent race converges on the winner's case;
  - unowned and ambiguous messages: nothing retrieved;
  - a document from another org is held;
  - active-content PDF is stored quarantined and held; a fake PDF is never stored;
  - oversized, inline and unretrievable attachments are held;
  - infected, pending and no-scanner are held;
  - an explicit structural-only policy releases;
  - the filing path resolves an `email_attachment` case to its document.
- `emailAttachmentFilingDecision.test.ts` **21/21**.
- Mutation check:

| Mutation | Result |
|---|---|
| Pre-storage holds removed | 3 fail |
| Stored-attachment reuse removed | 1 fails |
| `email_attachment` dropped from filing sources | 1 fails |

  Restored byte-for-byte afterwards.

**Finding for the Processing owner (not changed here).** `openProcessingCaseFromSource` inserts the case before its primary source. A delivery that loses the unique-index race therefore leaves an orphan `processing_cases` row without a source. Uniqueness of the primary still holds, and D10 converges on the winner. This affects every source kind.

**Product decision available:** whether an organization may release email attachments on D1c-1 structural screening alone. That would match the public upload paths. The default holds until D1c-2 exists.

## c3 — local only; history preserved

**Validation (broker):**
- `tests/platform/external` + `tests/documents`: **883 passed**, 257 skipped (live-DB suites skipped by design).
- `typecheck` and `typecheck:tests`: clean (re-run after the D10 pipeline).
- D10 regression: `tests/documents` and `tests/pos` give 2,102 passed. The 1 failure (`tests/pos/formDraft.test.ts`) is pre-existing and identical on the base.
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
