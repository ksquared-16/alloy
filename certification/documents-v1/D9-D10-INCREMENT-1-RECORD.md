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
| Ingestion hook | `ingestResendInboundEmail` calls `fileInboundEmailAttachments` after the message persists (owned only, best-effort) | **BLOCKED** until WS11 storage. Owner: Communications. No new ingress added. *Superseded: wired locally in c2.2* |
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

**Finding: orphan case on a lost race (repaired locally in `f1d8d0789`, awaiting DB proof).** `openProcessingCaseFromSource` inserted the case before its primary source. A delivery that lost the unique-index race therefore left an orphan `processing_cases` row without a source. This affected every source kind. See c2.1.

**Product decision available:** whether an organization may release email attachments on D1c-1 structural screening alone. That would match the public upload paths. The default holds until D1c-2 exists.

## c2.1 — atomic opener, WS11 seams, version-bound malware gate (local; synthetic proof)

**1. Atomic Processing opener (`f1d8d0789`).**
- `supabase/migrations/20261215093000_processing_open_case_atomic.sql` is authored and **NOT applied**. `open_processing_case_with_primary_source` writes the case and its primary source inside one PL/pgSQL exception block (a savepoint). A unique violation rolls back both, then the function returns the winner's case.
- Nothing is deleted after the fact. It is SECURITY INVOKER, executable by `service_role` only.
- `makeProcessingCaseDbDeps` calls it, falling back to the previous sequence ONLY when the function is missing (`PGRST202` / `42883`). Code can therefore ship before the migration.
- Proof: `tests/pos/processingCaseAtomicOpen.test.ts` **16/16**.
  - The legacy orphan is reproduced.
  - Atomic-port interleavings give one case and one source.
  - Every source kind, tenancy, and other errors are not swallowed.
- **Awaiting DB proof:**
  - real two-session concurrency against the function;
  - the single-session invariant `certification/invariants/processing-open-case-atomic.sql`, prepared and not run;
  - fake ports do not prove database atomicity.

**2. WS11 storage seam and Communications hook (this slice).**
- `lib/documents/inbound/ws11AttachmentStorage.ts` implements `AttachmentStorageBoundary` over the EXISTING document sequence:
  - `document_upload_authorized` audit first;
  - then the object at `<org>/pos_intake/` in `org_documents`;
  - then one `documents` row naming `current_version_id` (the D2 trigger writes version 1) and its SHA-256, with `processing_intent = store_document` and the message/attachment provenance.
- **No new table:** the document id is a stable hash of (organization, message, attachment), so idempotency is the `documents` primary key.
  - A concurrent duplicate removes ONLY its own uploaded object and returns the winner.
  - No row is ever deleted.
  - Communications' `communication_message_attachments` stays theirs. The draft is unchanged and not turned into a migration (schema-ownership review); nothing duplicates it.
- **Retrieval goes only through an injected `AttachmentContentFetcher`.** It is Communications-owned and given the provider message id and the binding id, never a credential.
  - It is used only for an inbound email of the same organization whose persisted metadata lists that attachment.
  - Without a fetcher the boundary is unavailable.
  - The provider's attachment-content API is not in the repository and was not invented.
- **Audit actor:** `recordDocumentAudit` accepts a closed `system` principal (`inbound_email_attachment` only). An unnamed process is refused.
- **Hook (`lib/documents/inbound/inboundAttachmentHook.ts`):**
  - `fileInboundAttachmentsForPersistedMessage(deps, { orgId, messageId })` never throws and re-reads the message under the organization.
  - `makeInboundCaseAnnotator` merges the filing intent and provenance into the case on EVERY converged open, so a redelivery repairs a lost annotation.
  - `makeInboundAttachmentFilingDeps(supabase, { fetchContent })` is the production wiring: no fetcher and no scanner, so everything is held before a byte is read.
  - The call site inside `ingestResendInboundEmail` is Communications' to add. Not added; no concurrent edits to that file exist on other branches.
- **Pipeline hardening:** one attachment's storage failure holds that attachment only.

**3. D1c-2 fails closed, bound to the exact version.**
- A verdict now carries `subject {documentId, versionId, checksumSha256}`, and the scanner is asked about that exact version.
- `clean` releases only when the subject equals the stored document, `current_version_id` and hash.
- These hold, as `malware_verdict_unbound`:
  - another version, another hash or another document;
  - a missing subject;
  - a stored row without a version or hash.
- A scanner exception holds as `malware_rejected`.
- No scanner was written. The capability stays `false`, the default policy still requires a scan, and the structural-only policy is not enabled.

**Proof (broker, synthetic):**
- `ws11AttachmentStorage.test.ts` **17/17**: InMemorySupabase with the `documents` primary key enforced, a fake fetcher, and a version-bound verdict double that is NOT a scanner. It covers:
  - audit before upload; no audit means no file;
  - idempotent repeat; concurrent duplicate gives one row and the loser's object only removed;
  - cross-org, outbound and unlisted attachments are never fetched;
  - production wiring holds even with a fetcher;
  - composed end-to-end: one document, one annotated case, filing-queue eligible, resolved by `loadDocumentCase`; redelivery adds nothing;
  - a stale verdict is stored but held.
- `inboundAttachmentFiling.test.ts` **15/15**, `emailAttachmentFilingDecision.test.ts` **24/24**.
- The screening-coverage and D2 writer census guards pass with the adapter registered: screened by its pipeline, no legacy parent columns.
- Mutation check, restored byte-for-byte afterwards:

| Mutation | Result |
|---|---|
| Version binding disabled | 8 fail |
| Loser keeps its object | 2 fail |
| Random (non-stable) document id | 5 fail |
| Unlisted attachment fetched | 1 fails |

**Harness:** InMemorySupabase gained opt-in `uniqueOn`, and its default `rpc` signature was widened. That repairs a `typecheck:tests` break that `f1d8d0789` introduced in `tests/metrics/ws0aMetricScopeIntegrity.test.ts`.

**Still external (proof boundaries):**

| Item | Owner | What is still unproven |
|---|---|---|
| (a) Attachment-content fetcher | Communications | The provider contract and the org-credential implementation |
| (b) Ingestion call site | — | **Wired locally in c2.2** (`81ec658ab`) |
| (c) Trusted malware scanner and verdict store | Documents security D1c-2 | The service and credentials are external |
| (d) Atomic-opener migration | DB | Apply, then the two-session concurrency proof |
| (e) D2 insert trigger with an explicit `current_version_id` | DB | Real-DB confirmation; in-memory only so far |
| (f) Storage RLS and bucket policy for the system writer | DB | Not exercised |

## c2.2 — Communications call site wired; D10 requires the atomic open (`81ec658ab`, local; synthetic proof)

**Ownership check:** before editing `web/lib/communications/email/inboundEmailIngestion.ts` I checked for competing writers:
- no `origin` branch has commits to it beyond this lane;
- no local worktree has uncommitted or unmerged changes to it.

The user's D10 approval covers this local integration.

**1. Call site.**
- **Where:** `ingestResendInboundEmail` step 7b hands a persisted, owned email with attachments to `fileInboundAttachmentsForPersistedMessage`. It runs after persistence, the receipt and the receive event, and before the observe-only step 8, which stays last.
- **Redelivery:** a resolved redelivery hands off again. That is the retry path, and every step after it converges.
- **Never handed off:** unowned, cross-organization-ambiguous and admission-refused emails.
- **Isolated:** a throwing hand-off leaves outcome, message, thread, event, receipt and observation byte-identical (differential test).
- **Default is production:**
  - `makeInboundAttachmentFilingDeps` with no content fetcher and no scanner;
  - every attachment is held (`storage_unavailable`, `malware_scanning_unavailable`) before a byte is read;
  - no document, object, case or source is written.
- **Content-fetch seam:** the `AttachmentContentFetcher` interface only. No provider endpoint was invented or called.

**2. Atomic open required for D10.**
- `openProcessingCaseFromSource({ requireAtomic: true })` throws a typed `AtomicProcessingOpenUnavailableError` BEFORE any legacy read or write when:
  - the atomic port is absent; or
  - the function is missing (`PGRST202` / `42883`).
- D10 always sets it and holds the attachment as `processing_atomic_open_unavailable`.
- **Proof:**
  - zero case/source writes;
  - zero legacy calls;
  - zero table touches on the Supabase port;
  - after the function exists, a redelivery opens the case on the SAME stored document without a second upload.
- Other callers (upload route, forms, packets) keep the pre-migration fallback unchanged.
- No compensating deletion anywhere.
- New register entry: `processing_atomic_open` (state `missing`).

**Deployment order (none of it performed):**
1. Code may deploy first. D10 stays held: no fetcher, no scanner, no atomic function.
2. Apply `20261215093000_processing_open_case_atomic.sql`, then run its single-session invariant and the two-session race proof on an isolated database.
3. Only then enable a content fetcher (Communications) and a trusted scanner (D1c-2). Before step 2, a fully enabled pipeline still holds, as `processing_atomic_open_unavailable`.

**Proof (broker, exact tree `7dde6a6b0d94d99b` at `81ec658ab`):**
- **Affected suites:** 19 files, **329/329**, receipt `req_1793402098422610_94003`. They include:
  - the new `inboundEmailAttachmentHandOff.test.ts` (9);
  - every existing `tests/communications/inbound*`, admission, stop-hold and anchor-parity suite;
  - the D10 / D9 / atomic-open / census suites;
  - the metrics suite that extends the shared harness.
- **Mutation check** (restored, hash-verified):

| Mutation | Result |
|---|---|
| Call site removed | 3 fail |
| Isolation removed | 1 fails |
| Redelivery hand-off removed | 1 fails |
| `requireAtomic` refusal removed | 4 fail |

- **Checks:** `typecheck` and `typecheck:tests` PASSED; the six prebuild guards rc=0.

**Baseline reds, now MEASURED (no longer inferred from imports):**
- The 19 files that failed in the broad run were run at HEAD (`req_1793402028491520_78347`, tree `7dde6a6b`) and on the pre-sprint base `2b213d02b` bytes (`req_1793402048567218_82529`, tree `4357ca45`).
- Both runs: 19 files failed, **32 failed / 117 passed**, with the failing test names IDENTICAL.
- The working tree was restored to HEAD afterwards, verified.
- So these 32 are pre-existing on this lane's base and not caused by D9/D10 or the shared-harness changes. They are not diagnosed, and this is not a full-green certification.

## c2.3 — provider attachment adapter (synthetic) and verdict-store design (approved 2026-10-31T01:35Z, items 2–3)

**Official contract.** Public documentation only; no account, mailbox, credential or API request.
- [Retrieve Attachment](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment): `GET https://api.resend.com/emails/receiving/{email_id}/attachments/{id}`, Bearer key. The response carries `id, filename, size, content_type, content_disposition, content_id, download_url (inbound-cdn.resend.com), expires_at`.
- [Process Receiving Attachments](https://resend.com/docs/dashboard/receiving/attachments): the `download_url` is valid for one hour; ask again afterwards.
- This is per attachment. The no-raw-MIME policy (`raw.download_url` never fetched) is unchanged.

**Not stated by the docs, failed closed in the adapter:**
- download authentication: none sent;
- error codes: 429 / 5xx retryable, others permanent;
- size limits: our 10 MB cap, checked on the declared size, the Content-Length and the streamed bytes;
- redirects: refused.

**Adapter.** `lib/documents/inbound/resendAttachmentContentFetcher.ts` (`makeResendAttachmentContentFetcher`).
- The key goes to `api.resend.com` only.
- The download host is exactly `inbound-cdn.resend.com` over HTTPS: no SSRF and no credentials in the URL.
- One deadline covers both requests.
- The provider's attachment id must equal the requested one.
- Failure reasons never carry the key, the signed URL or a body.
- Credential: the organization's own, from its binding, through an injected resolver.
- **NOT enabled.** Production deps still pass no fetcher, so everything stays held.

**Proof:**
- `tests/documents/resendAttachmentContentFetcher.test.ts` **39/39** on a fake HTTP transport. It includes the composed pipeline: fetched once, stored once, one case; a redelivery makes no provider request; an unlisted attachment is never requested.
- Mutation check, all caught, restored byte-for-byte:

| Mutation | Result |
|---|---|
| Key sent to the CDN | 1 fails |
| Any HTTPS host trusted | 4 fail |
| Redirects followed | 1 fails |
| Attachment-id binding removed | 2 fail |
| Streaming cap removed | 1 fails |

**Verdict store.** `D10-MALWARE-VERDICT-STORE-DESIGN.md` is design only, with no migration. The smallest remaining decision is to authorize authoring (not applying) that migration, and to name the scan process principal.

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

## c4 — release preparation (2026-11-02, operator-approved)

**Migration held out of the promotion.**
- Before: `supabase/migrations/20261215093000_processing_open_case_atomic.sql`, authored, never applied.
  - Staging ledger census `gar_21b83cce5ce413` (2026-11-02T23:12Z) has head `20261214090000` and no `20261215093000`.
  - No governed apply of it was ever filed on any target.
- Now: `certification/documents-v1/pending-migrations/20261215093000_processing_open_case_atomic.sql`. It moved
  byte for byte (sha256 `f04e450c7f1ed043c65d3d9974150b793f769959f6c91ea3f4d736463d92a1cf`), with its version kept in
  the file name.
- Why: a governed merge ships code only. A promoted but unapplied migration would leave the staging ledger BEHIND the
  repository and refuse later merges.
- It returns to `supabase/migrations` unchanged once its isolated proof and its apply are approved, before any D10
  capability is enabled.

**Behaviour is unchanged.**
- D10 still requires the atomic open.
- With the function missing (PGRST202 / 42883) or no atomic port, every releasable attachment is HELD as
  `processing_atomic_open_unavailable`, and no case or source is written.
- With no clean, version-bound scanner verdict, it is held as `malware_scanning_unavailable`.
- Structural screening alone never releases.
- Other Processing callers keep today's opener.
- References updated:
  - the register entry `processing_atomic_open` in `emailAttachmentFilingDecision.ts`;
  - the shape test in `processingCaseAtomicOpen.test.ts`, which now reads the pending path;
  - the invariant header `certification/invariants/processing-open-case-atomic.sql`.

**Evidence commit.** `f2892cd24` commits two receipts verbatim:
- the 9E32 merge-parity census;
- the A1EE R5 closure census.

They are not D9/D10 acceptance evidence.

**Affected tests.** Broker run of 99 files, 1,417 passed: every non-live test that reads `supabase/migrations` or
the D10 register, plus the D10 behaviour suites. The 3 failures are identical on staging `530ba383` and on the
pre-move candidate `f2892cd24`, so they are pre-existing:
- `grantSeedEnumeration`;
- `opportunityHeaderActionExposure`;
- `childcareFieldCatalogDoctrine`.
