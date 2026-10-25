# Documents V1 — D4 Focus Panel customer document library

Director authorization: **IMPLEMENT D4** (2026-10-25). Sprint `OPWORK_AA660DC9554D_SPRINT_A5ABE8F84EF5` (Core V2, promotion
HELD until a certified checkpoint is released). D5 is out of scope.

## Starting position

| | |
|---|---|
| Deployed staging | `488eb0f87` (PR #1593), which contains D3 merge `eef87b1b` and fix merge `7741db69` |
| D3 | merged, deployed and certified (`qar_ad7ca37df52f`, ZERO_RESIDUE); `D3-DOCUMENT-STUDIO.md` |
| Lane branch | `agent/documents` at `1d666eb5e`, reconciled with staging as merge `fa13b0f4b` (no force; the certification commits are kept) |

## D4.0 — existing surface convergence

| Component | Before D4 | D4 decision |
|---|---|---|
| `OpportunityFocusPanelEmbeddedWorkspace` → Documents panel | rendered `OpportunityDrawerVmTabPanes drawerTab="documents"`: the case's own documents only | **Replaced** by `FocusPanelDocumentLibrary` (household library). The panel frame, header and placement are kept. |
| `FocusPanelCardRenderer` → `documents` card drill | the same case-only pane | **Replaced** by `FocusPanelDocumentLibrary` (lazy, drill only). |
| `OpportunityDrawerVmTabPanes` documents branch | case-only list from `/api/admin/related/opportunity/{id}`; retry and refresh after upload could return the stale prefetched list | **No longer reached from the Focus Panel.** Kept (it is pinned by drawer-body tests). Retirement candidate together with `EntityDocumentsSection`. |
| `EntityDocumentsSection` / `AssociatedDocumentUploadModal` | free-text `doc_type`; upload to one fixed record | **Not used by the library**; reachable only through the legacy pane above and the unused `RelatedRecordsTabs`. Retirement candidate. |
| `RelatedRecordsTabs` | no production importer | Retirement candidate (no change). |
| `GET /api/admin/related/[entity]/[id]` documents | legacy-parent read; sensitivity and availability filtered, **no subject-scope filter** (a scoped user could see a row that then fails to open) | Not used by the library. The gap is recorded here; the library applies the scope filter. |
| `scheduleOpportunityDrawerTabPrefetch` documents read | measured 8–9 s per case; consumed only by the legacy pane | **The Activity prewarm opts out** (`{ documents: false }`) and warms the library instead. The activity half is unchanged. |
| `GET /api/admin/documents/[id]/versions`, `…/signed-url?version=`, `POST …/versions`, `POST /api/admin/documents/upload` | canonical D1–D2 routes | **Reused** unchanged in behaviour, except that the upload is now audited before it stores (D4.3). |
| D3 `listTypes` / `listCategories` | Studio | **Reused** for type and category presentation. |
| Record selection, loading, error and navigation | Focus Panel runtime (`InlineOpportunityFocusPanel`, `OpportunityFocusPanelModeGrid`) | **Unchanged.** The library keeps a loading state, an error with Retry, and an empty state. |

Durable household, person and child records (`DurableRecordSurface`) have no Activity mode and no Documents card grain
today. The library is anchored on a case in the Focus Panel and resolves its household, so the household, its adults
and its children are covered from any case. Mounting it on durable records is not part of D4.

## D4.1 — canonical read model

`web/lib/documents/library/documentLibrary.ts`, `GET /api/admin/documents/library?subject_type=&subject_id=[&focus_type=&focus_id=]`.

- **Anchor:** any of household, person, child or case. The household is resolved from it: a child by `customer_id`, a
  person by `customer_persons` (primary first), a case by `opportunities.customer_id`. A case with no household gives a
  case-only library.
- **Subjects:** the household; adults from `customer_persons` → `persons` (primary contact first, ended rows inactive);
  children from `customer_members`; the household's cases (up to 50, newest first).
- **Documents:** from `document_subject_links` for those subjects, plus the derived Forms links of the cases' submissions
  (`form_submissions.opportunity_id`). One entry per document, so a shared binary is never duplicated.
- **Ownership vs association:**
  - `owner` is the primary owner when it is in the household;
  - `owned_elsewhere` marks a document reached only through an association, whose owner is never named;
  - `associations` lists every link to a household member.
- **Narrowing:** `focus` keeps only documents linked to that member. It is applied on the server after disclosure and
  before counting.

## D4.2 — document organization

The library shows the following for each document:
- the Studio type label and its category, or the raw key marked "Unregistered type";
- the primary owner;
- the current version with "n of m";
- the received date (the row's creation) and the size;
- the sensitivity class and Forms provenance;
- review and validity only when the version stores them (`review_status`, `effective_on`, `expires_on`).

Documents are grouped by owner subject in household order, then by category and type. Search and the type and category
filters work over the authorized list only. No folders. Nothing derives "missing" or "expiring".

## D4.3 — upload and document management

The panel uploads through `POST /api/admin/documents/upload`. The flow:
- **Subject:** household → `customer`, adult → `person`, child → `customer_member`, case → `opportunity`. The D2 trigger
  writes the primary owner.
- **Type:** the type list holds the active published Studio types. They load only when the form opens.
- **Inherited from the upload route:** the content-signature check, D1c-1 screening (a refused file is not stored; a
  quarantined file is held and the operator is told), and the type's default sensitivity via the database trigger. The
  form says so: "Classified … by its type — enforced for new documents". That rule is enforced; nothing declaration-only
  is presented as enforced.
- **Replacement:** `POST /api/admin/documents/[id]/versions` with a reason. A clean file is required.

Shared Documents-domain changes, the smallest needed for an audited upload:

1. **Upload audited before storage.** The route assigns the document id and writes `document_upload_authorized` before
   storing anything. The event names the subject, type, size and screening status, never the path. It refuses with 503
   `AUDIT_UNAVAILABLE` when the event cannot be written. Previously the only upload event was best-effort, written after
   the insert, and carried the storage path. That event is unchanged; consumers may read it.
2. **Uploader recorded on version 1.** `metadata.uploaded_by` is read by the D2 insert trigger into
   `document_versions.created_by`, which was null for every inserted v1. `metadata.upload_audit_event_id` links the
   committed row to its attempt.

**D5 consequence.** The upload still accepts any `doc_type` string, and allowed formats, subject types, review-required and
replacement policy are not enforced at upload. The library only offers registered types, but a direct API call is not
constrained. D5 must enforce these in the upload route, and in the other `decideIngestion` writers, as one shared
check. It should not be a library-side rule.

## D4.4 — access and privacy

| Requirement | How |
|---|---|
| Organization isolation | every read is `org_id`-bound; another organization's household is 404 |
| Read and write capabilities | library and history need `documents.read`; uploads and replacements need `documents.write` (route-enforced) |
| Subject and relationship scope | the anchor must be readable (`assertEntityDrawerRecordReadable`), else 404; each row passes `filterDocumentRowsInActorScope` on its primary owner |
| Personal-identity, restricted, medical, custody/safeguarding | `filterDocumentRowsBySensitivity` per row; history uses the full `assertDocumentAccess` |
| Version-specific download | `GET …/signed-url?version=<id>` (D2); the panel opens each version through it |
| Quarantine refusal | unavailable rows are never listed; history and links refuse them (403 `DOCUMENT_RESTRICTED`) |
| A secondary association never grants access | scope is decided on the primary owner; proven by the scoped-operator test (a child's document context-linked to an in-scope case stays hidden) |
| No leak through counts, previews, search, filenames or errors | rows are dropped before anything is built from them; search runs client-side over the authorized list; refusals are 404/403 with codes only |

## D4.5 — activity and lifecycle

`GET /api/admin/documents/[id]/history` (`web/lib/documents/library/documentHistory.ts`) labels every entry:

- **committed:** a version (upload or replacement with its reason), a subject link or its end, an accepted or rejected
  review, or a release from quarantine;
- **system:** a screening quarantine, or a legacy backfill;
- **refused:** an audited attempt whose committed row is not found. For a replacement or release this is matched by
  `audit_event_id`; for a subject change it is matched by the link row;
- **access:** a download link was issued.

A refused attempt is never rendered as a completed change.

## D4.6 — presentation and performance

- **First render:** loading, error with Retry, and empty states. Versions and history load only when a row is expanded;
  the type list loads only when the upload form opens.
- **Warm switching:** a cache entry per (record, focus). A seen record renders at once and revalidates after 30 s.
  Concurrent readers share one request. A write invalidates the cache, which fixes the legacy stale refresh.
- **No redundant fetching:** the Activity prewarm no longer requests the 8–9 s legacy documents list.
- **Existing surfaces:** Communications, Recent Activity and the Work Items and Notes panels are unchanged. The cockpit
  locks pass, apart from the reds the base already has.

## D4.7 — certification

### Automated evidence (local, on the D4 tree)

| Suite | Result |
|---|---|
| `tests/documents` (Q1, D1a, D1b, D1c-1, D2, D3 and D4) | **345/345** (316 before D4, plus 29: D3 discard 3, D4 library 17, D4 UI 7, upload audit 2) |
| `tests/documents/documentsD4Library.test.ts` | 17/17. Covers a household with two adults and two children; household-only, adult-only, child-only, case and Forms documents; a shared document listed once; ownership vs context; server-side narrowing; medical withheld without `health.view`; quarantine; cross-org; scoped 404 and the context-link-grants-nothing case; history classification and its access decision |
| Mutation check | removing the sensitivity filter fails the medical test; removing the primary-owner scope filter fails the context-link test |
| `tests/documents/documentsD4LibraryUi.test.tsx` | 7/7. Covers grouping, the stored-only review and validity, narrowing to a child and widening, warm re-mount with no second read, upload to the child, deferred history with refused shown as "Not applied", and error with Retry |
| Regression against the unchanged base (`fa13b0f4b`, a separate worktree) | no new failures. The red counts are identical on both trees: access 18 of 1956, Forms 32 of 1347, Processing 1 of 1461, Focus Panel 0 of 155, communications 18 of 1644, runtime 46 of 1610, adminV2 runtime 123 of 1734, docs 3 of 169 |
| Prebuild guards | route-capabilities (two new routes declared), service-client-principal, unauthenticated-side-effects and governed-documents all pass |
| Typecheck | narrow `tsc` over every changed file: clean. The full typecheck runs out of memory on this host (see the sprint record) and must run in the broker at the checkpoint |

### Hosted certification — not yet run

These gates need the D4 build deployed to staging, and therefore a certified checkpoint and the Director's release:

- **Hosted QA fixture:** QA Shared has no household with several adults and children; the existing subject fixtures
  are opportunity-only. A governed household fixture (ensure and reset) is required.
- **Hosted Human-QA** of the Focus Panel library.
- **Hosted refusals:** out of scope, cross-org, sensitive and quarantined.
- **Q1/D1b/D2/D3 hosted regressions**, and the audit and ZERO_RESIDUE cleanup.

## Promotion

- **Checkpoint:** sprint checkpoint `ick_8fcd5a88f9e9` was registered on `7a29fc28f` (slices `d3-discard-draft`, `d4-household-library`, base `488eb0f87`). It is **PROPOSED, not certified: `NO_LEDGER`**.
- **Why it cannot certify:** a checkpoint certifies only from a `vacilando-suite` Tier 1 receipt for the exact tree. The installed `vacilando-suite` runs the toolkit's own suite, and the Alloy repository declares no `.vacilando/tier1.json`. No receipt can exist for an Alloy tree.
- **What follows:** `request-release` refuses the checkpoint, and the sprint hold refuses every other promotion.
- **Who must act:** Vacilando, the Director or the operator, not this lane.

## Status

**PARTIAL.** D4.0–D4.6 are implemented and proven locally. D4.7 hosted certification and promotion are outstanding.
