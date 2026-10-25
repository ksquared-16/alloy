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

### Hosted certification — `authz_q1` run `qar_da541c487abf`, on staging `9d565560334f`

Sprint `OPWORK_AA660DC9554D_SPRINT_49BB0ECA23E9` (D4.7 only; the D4 implementation sprint `…A5ABE8F84EF5` is closed).

| | |
|---|---|
| Tested = merged = deployed | staging `/api/build-info` gitSha `9d565560334fb0e41aa6c71cf4888218a5b62826` (PR #1597, D4 candidate `03cecd769`), Supabase `ikaxilmwmrmbagoidedu`; effect `eob_2b4838ff16b8cb` VERIFIED (web deploy + no pending migration) |
| QA run | open `gar_89f2666f5ebd27`; 7/7 persona sessions verified |
| Registered fixtures | ensures (expected head `9d565560`): vendor `gar_84060ddfe24a49`, QA Shared subjects `gar_eacada87dbd914`, QA Secondary subjects `gar_b2519f7b5360e0`. Resets: `gar_8a7f6b30d08169`, `gar_ec754737825ef0`, vendor `gar_7489c7df5cc0bf` |

#### Household fixture lifecycle

QA Shared had no household with several adults and children. `d4_hosted_library_cert.py` owns a **run-scoped household
fixture**, built and removed only through the deployed product's own audited routes as the run's `fixture_admin` session.
No reconciliation registry change and no direct database write are involved.

- **ensure:** `create_lead` (household, primary adult and case in WU1 / QA D1), then `POST /api/admin/customer-members`
  for two children, then `add_parent_guardian` (scope `this_child`) for the second adult. Then nine uploads: household,
  each adult, each child, the case, a medical (`immunization_record`) document on a child, a scripted PDF that screening
  quarantines, and a document shared by both children (owner child 1, context link to child 2). Then a replacement
  version, and a context link from the out-of-scope Q1 document (OPP2 / QA D2) to the case.
- **ui variant:** WU1 has no Business Process, so its case never appears in a Work View and the Focus Panel cannot be
  opened on it by clicking. A second household of the same shape takes `create_lead`'s default placement (Enrollment →
  New Leads) for the Human-QA walk.
- **reset:** unlink, then the audited POS deletes, then `POST /api/admin/opportunities/[id]/delete`.
- **orphans:** see the finding below.
- **Residue, measured:** `d47-household-baseline-census.sql` (`gar_3f1d7e690f37f7`, 22:05:12Z, before any D4.7 write)
  measured QA Shared at customers 3, persons 4, customer_persons 3, customer_members 8, contacts 0, customer_member_contacts 0,
  opportunity_persons 0, opportunity_customer_members 5, person_child_relationships 3.
  - **First residue census** (`gar_a554c54c645da3`, 22:38Z): **persons 6**; every other table at baseline.
  - **After the orphan sweep**, `d47-household-residue-census-v2.sql` (`gar_48e9e643f60d5f`, 22:40:42Z): **all 10 checks
    true**. Every CRM household table is at baseline and no run-tagged person, household or member remains.

**Finding (CRM lead deletion, not D4):** `POST /api/admin/opportunities/[id]/delete` keeps a guardian who is linked to the
household only through `customer_persons`. The graph's person set is the primary person, `opportunity_persons` and
`customer_members.person_id`. The household row and its `customer_persons` rows go, so the `persons` row is left orphaned,
with name and email and no household. `add_parent_guardian` with a child scope writes no `opportunity_persons`, so every
guardian added that way is exposed. Measured here as two orphaned adults. They were removed through the product: a
temporary lead, `link_existing_person` (scope `this_opportunity`), then the same audited delete. The preview counted
`parents: 2`. This belongs to the CRM lead-deletion owner. Documents did not change it.

#### Results (all on `9d565560334f`)

| Gate | Result | Evidence |
|---|---|---|
| Q1 authorization regression | 90/90 | `q1_hosted_authz_cert_results.qar_da541c487abf.json` |
| D1b security regression | 25/25 | `d1b_hosted_security_cert_results.qar_da541c487abf.json` |
| D2 foundation regression | 40/40 | `d2_hosted_foundation_cert_results.qar_da541c487abf.json` |
| D3 Studio regression | 40/40 | `d3_hosted_studio_cert_results.qar_da541c487abf.json` |
| **D4 household library** | **41/41** | `d4_hosted_library_cert_results.qar_da541c487abf.json` |
| Teardowns | Q1 5, D1b 1, D2 2 deleted (links 404); D3 configuration 0 remaining | script output |

D4 hosted coverage:
- **Household structure:** the case anchor resolves 1 household, 2 adults, 2 children and the case. Household, adult and
  child anchors resolve the same household and documents.
- **Listing:** each document is listed once, including the one shared by both children (owner plus context
  associations). Primary owner per subject type is correct. The replaced document shows v2 of 2.
- **Owned elsewhere:** a document reached only through a context link is `owned_elsewhere`, with no owner named.
- **Narrowing:** server-side focus narrowing for a child and for an adult.
- **Medical:** listed for the admin. Withheld from `doc_reader` (no `health.view`), whose history read is refused 403
  `SENSITIVE_DOCUMENT`.
- **Refusals:**
  - `no_docs` and `processing_only`: 403.
  - `scoped_ops` (QA D1): sees the in-scope household. The context link to the out-of-scope OPP2 document grants nothing,
    and the out-of-scope case anchor is 404.
  - Cross-org case, household and child anchors: 404.
  - Unauthenticated: 401. Bad subject type: 400.
- **Quarantine:** the quarantined file is never listed, and its history and link are 403 `DOCUMENT_RESTRICTED`.
- **Versions:** both versions issue links.
- **History:** upload and replacement are committed, and link issuance is recorded as access. A screening-refused
  replacement (415 `SCREENING_REFUSED`) records no version and no entry: screening runs before the audit
  (`versions/route.ts`), so there is no audited attempt to label `refused`. The first certify run expected a `refused`
  entry there, which was the wrong expectation. The assertion was corrected and the product unchanged. The `refused`
  label stays unit-proven (audited attempt whose commit then failed).

#### Human-QA — deployed build, by clicking (`d4-human-qa/`)

Driven in a real browser as the run's QA Shared admin session, through visible controls only: no test ids, no typed API
URLs.

1. Search for the run tag found both children, Adult One (Primary Contact) and Adult Two (Parent / Guardian), each with a
   Household chip (`02-search.png`).
2. The WU1 Work View shows "no active Business Process configured" (`03-queue.png`), which is why the `ui` household was
   used. New Leads, then the family: the Focus Panel shows the household card with both adults (Primary, Guardian) and
   2 children (`04-new-leads.png`).
3. **Activity → Documents:** the "Whose documents" chips are Whole household, the household, both adults and both
   children, with Upload… and Search. The panel prewarm had already issued
   `GET /api/admin/documents/library?subject_type=opportunity` (200) (`06-activity.png`).
4. **Rows:** eight rows, grouped by owner, for example "QA D47 ADULT ONE-UI … · ADULT".
   - The scripted (quarantined) PDF is absent.
   - The shared document appears once.
   - The medical row reads "Immunization record · Health & medical · Medical".
5. **Expanded row:** shows "v2 of 2", the Versions list with Open, and history:
   - DONE "Replaced with version 2 (v2) — <reason>"
   - DONE "Uploaded (v1)"
   - for the shared document, "Associated (primary owner: child)" and "Associated (related: child)"
   - a "Replace with a new version" form
   (`08-row-expanded.png`, `09-narrow-kid-two.png`).
6. **Narrowing:** selecting the Kid Two chip issued a server-side `focus_type=child` read and left exactly the shared and
   Kid Two documents (`09-narrow-kid-two.png`).
7. **Upload…:** the form opens with "Belongs to: QA D47 Kid Two" preselected, Document type, Title, file and the
   screening notice (`10-upload-form.png`).
8. **Uploading through it** invalidated the cache. One library re-read followed, and "ui-upload" is listed under Kid Two
   with the child as primary owner (`11-after-ui-upload.png`). The reset removed it.

This is operator-equivalent QA on the deployed build. No separate human walkthrough by Kelly is recorded here.

#### Close and ZERO_RESIDUE

- **Fixture teardown:** D4 resets (both households), Q1/D1b/D2/D3 teardowns, then the registered resets.
- **Close** (`gar_9d0aef8f502d2b`, 23:05:00Z): `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED`. Five pool identities revoked
  (0 roles, 0 profiles), 0 custom-role grants, 7/7 sessions signed out.
- **Registered ZERO_RESIDUE census** (`gar_8c2aa0a6d38b83`, `documents-zero-residue-census.sql` `3be83854…`, run 23:06:45Z,
  after `closed_at`): all 12 checks true. These cover vendors, QA role grants, pool access, zero sent, subjects, QA Shared
  documents, objects and dangling case sources, QA Secondary documents, objects and cases, and QA sessions. Audit history
  is retained by design.
- **Re-close** (`gar_80eed5e4c0188d`): `census_attached` 23:07:22Z. **Run `qar_da541c487abf` is CLOSED, ZERO_RESIDUE.**
- **Household tables:** the registered census does not cover them. `d47-household-residue-census-v2.sql` proves them back
  at baseline (above).

## Promotion

- **D4:** checkpoint `ick_389dfc579ab1` was CERTIFIED and VERIFIED on `03cecd769` (`vacilando.product_certification.v1`).
  Director release `spr_61d7aa3ba37a`; PR #1597 merged by `gar_ceb3eb6524921d` → staging `9d565560334f`.
  - The earlier `ick_8fcd5a88f9e9` (`NO_LEDGER`) was superseded once the toolkit gained product certification.
- **D4.7:** evidence only, with no product code. It is promoted through `OPWORK_AA660DC9554D_SPRINT_49BB0ECA23E9`.

## Status

**D4 COMPLETE.** D4.0–D4.6 were implemented, certified (`ick_389dfc579ab1`) and promoted (PR #1597 → staging
`9d565560334f`). D4.7 hosted acceptance passed on the deployed build:
- D4 library 41/41;
- regressions: Q1 90/90, D1b 25/25, D2 40/40, D3 40/40;
- deployed Human-QA walk;
- run `qar_da541c487abf` CLOSED ZERO_RESIDUE, and the household tables back at baseline.

Open items carried forward, none blocking:
- the CRM lead-deletion orphan-guardian finding, for its owner;
- the D5 upload-policy enforcement noted under D4.3.

Documents is ready for the next product slice.
