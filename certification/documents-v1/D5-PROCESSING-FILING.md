# Documents V1 — D5 Processing document filing and customer record integration

Director authorization: **D5 IMPLEMENTATION** (2026-10-26). Sprint `OPWORK_AA660DC9554D_SPRINT_25DFEB831C01` (Core V2,
promotion HELD until a certified checkpoint is released), lane `lane_aa660dc9554d`, run `erun2_05d06ede039a2928`.
D6 (missing-document requirements), D7 (expiration/renewal), D9 (external API) and D1c-2 (malware scanning) are out of
scope.

## Starting position (preflight)

| | |
|---|---|
| Staging = deployed | `d18d4e524` (PR #1603); `/api/build-info` gitSha `d18d4e524f5d2a957182887e3519dfb9d77c3c1f`, Supabase `ikaxilmwmrmbagoidedu` |
| D4 | merged and deployed as `9d565560` (PR #1597); D4.7 evidence merged by PR #1599 (`33426b63`), contained in staging |
| D4.7 sprint | `OPWORK_AA660DC9554D_SPRINT_49BB0ECA23E9` phase VERIFIED, hold PROMOTED, checkpoint `ick_e261ef22b623` VERIFIED, release `spr_b6f8b0b51fc8`; `next: closable`. No administrative blocker. The final closure is the operator's objective-lifecycle step, not an engineering obligation. |
| Lane | `agent/documents` at `817ba2bd1` (0 ahead, 10 behind), fast-forwarded to `d18d4e524` |
| Root | `alloy-root`: managed-worktree; canonical `/Users/vacilando/Alloy` |
| Build validation | the earlier blocker was the detached sandboxed build budget (1.7 GB against a ~8.8 GB peak). The installed toolkit (`58725366952d`) sizes the build budget from the predicted peak (`defaultProductionBuildSupervision`). The checkpoint build result is recorded under Promotion. |

## D5.0 — existing Processing convergence

| Component | Finding | D5 decision |
|---|---|---|
| Upload → case (`POST /api/admin/documents/upload`, `maybeOpenProcessingCaseFromNonFormSourceSafe`) | intake documents are stored with no entity and a `processing_cases` row with a `processing_case_sources` primary `document` source | **Reused** unchanged |
| Classification (`classifyNonFormSource`, fp9.1) | deterministic keyword rules → `metadata.classification` (`immunization_record`, `enrollment_document`, …), confidence ≤ 0.95; no mapping to the D3 catalog | **Reused as a proposal**: suggested only when the key is a published Studio type |
| Identity resolution (`runCanonicalIdentityResolution`) | only form/lead sources; nothing resolves a document's subject; email lookups exist only for forms | Not extended. Documents are filed to a record the operator **selects** from a household graph; no name or email matching |
| Recommendations / commit plans / executor | `buildCommitPlan` requires identity resolutions, so a document case can never build a plan; `recommendationBuilder` never emits `attach_document` | Not used for documents (no identity is created or merged by filing) |
| `attach_document` command (`handlers.ts:773`, port `ports.ts:435`) | real but unreachable: no producer; checked no status, no Studio policy, no target scope; async tier yields `partially_committed` | **Superseded for filing** by the Documents filing command. Left registered for the identity executor's plans |
| **Approval (`approve/route.ts`)** | **every non-form source → `runMinimalDestinationHandoff` → `{kind:"routed"}` → case `completed` with nothing filed.** This is the D0 no-op (D0 census: 44 intake documents `entity_type_null`, cases `received`) | **Replaced**: a customer-document case is FILED, and completes only after the filing committed |
| Folder registry (`processingFolderModel`, `org_settings.metadata.processing_folders`) | presentation lenses for the queue, not filing destinations | Unchanged; filing is logical (subjects and types, D4) |
| Work Items (`mapProcessingCaseToWorkItemRow`) | a read-only client projection, no persisted rows | Unchanged; no Work Items rows are added |
| Document Studio (D3) | the catalog and its declared policy | Read through one Documents-owned enforcement module |

## D5.1 — Documents work queue

`Processing → Work → Documents` (`ProcessingDocumentsWork.tsx`, `GET /api/admin/processing/documents/queue`).
- **Membership:** document-source cases whose purpose is a customer document: intent `store_document` or `process_information`, or a saved filing proposal. Form-template uploads (`generate_form`, `packet_source`) stay in the forms flow. Completed cases appear in **Filed** for 7 days.
- **Lanes, derived every read** (`deriveDocumentFilingLane`): unclassified · needs a record · needs review · ready to file · filing errors · filed.
- **Each row:** source document title, received date, proposed type (or the classifier's suggestion, labelled as such), proposed record, lane, required action, classification certainty (`none | suggested | confirmed`) and subject certainty (`unresolved | selected`), and the last filing error.
- **Disclosure:** the canonical one. Unavailable documents are never listed, then scope, then sensitivity. A document the operator may not read is not in their queue.
- **No new store:** the queue reads `processing_cases` + `processing_case_sources` + `documents`. The proposal is `processing_cases.metadata.document_filing`.

## D5.2 — Classification

The workspace lists the organization's **published, active** Studio types with category, applicable subjects, default sensitivity, formats, review and replacement policy. The deterministic classifier's result is shown as a suggestion with its confidence and method ("a proposal, not a filing"). Using it saves the type with `doc_type_source: "suggested"`. Nothing is filed until the operator files. The original upload, its version 1 and its provenance are untouched by classification.

## D5.3 — Subjects

- Search (`/api/admin/global-search`, authorized before retrieval) finds the household. The workspace then reads the household graph (household, adults, children, cases) through the D4 helpers, inside the operator's scope.
- **Primary owner** ("Filed under") and **related records** ("Also relates to") are chosen separately. Saving re-resolves every subject against that graph, and labels come from the server.
- Refused as **not found**: a record outside the household, a household the operator cannot see, and another organization's record. At commit, the database also refuses an unresolved subject (`document_subject_unresolved`) and a context outside the primary's household (`document_filing_context_unrelated`).
- One logical document with several associations; no bytes are copied for an association.

## D5.4 — The canonical filing command

- **Owner:** Documents. `commitDocumentFiling` (`web/lib/documents/filing/documentFiling.ts`). Processing's approval (`fileDocumentCase`) is the only caller.
- **Steps:** `documents.write` → the access decision on the received document (quarantine refused) → subjects in scope and related → Studio policy → clearance for the resulting class → `document_filing_authorized` (503 when it cannot be written) → one transaction → `document_filed`.
- **Transaction** (migration `20261210093500_documents_d5_filing.sql`):
  - `document_file`: type, raise-only sensitivity, primary owner, contexts, accepted review, and the filing record (`documents.metadata.filing`, naming the audit event).
  - `document_file_as_version`: the received bytes become the target's next version (provenance `filed_from_document_id`). The received document becomes `superseded` (unavailable, kept as provenance).
- **Not atomic, and said so:** the one object copy a new-version filing needs (the version store holds one object per version) runs before the transaction, at a deterministic path. It is removed when the transaction fails, unless a version already references it.
- **Idempotency:** filing key `processing_case:<case>:document:<doc>`. A retry replays with no write and no new audit. A different filing of a filed document is refused.
- **Case transition:** `received → completed` with `operational_result.kind = "document_filed"`, only after the commit. A refusal or failure leaves the case open, with `last_error` on the proposal (the Filing errors lane). If completing the case fails after a committed filing, the next approval replays and completes it.

## D5.5 — Studio policy enforcement

One Documents module (`documentTypeEnforcement.ts`), consumed by the operator upload, the replacement route, the public Forms enrollment upload, the vendor application and filing. The database re-checks for filing.

| Policy | Enforced | Where |
|---|---|---|
| Published type resolution | yes | filing (database); operator upload refuses an archived or unpublished catalogued type; public writers keep the old behaviour then; an uncatalogued key is a legacy label, accepted |
| Applicable subject types | yes | filing, operator upload, public Forms (child), vendor (vendor) |
| Allowed formats | yes | filing, operator upload, replacement, public Forms, vendor |
| Sensitivity default / elevation | yes | database trigger (D3); filing adds an explicit raise; never lowered |
| Review required | yes | filing needs an accepted review; an upload or replacement of such a type is recorded **pending** review (`document_version_require_review`) |
| Replacement / version | yes | filing (`not_allowed` refuses a second; `new_version` requires filing as the next version; `new_document` keeps separate documents); replacement route refuses `not_allowed` and `new_document` types |
| Validity (expiration, reconfirmation) | **no**, D7 | labelled "Declared — enforced from D7" |

The vendor application's review-required types are not marked pending (its insert path is in the vendor library). This is recorded as a D6/D7 prerequisite.

## D5.6 — Focus Panel and Forms integration

A filed document is listed by the D4 library under its primary owner, with "Also relates to" for the related records. It keeps one identity and one version history. "Open record" lands on the record's Documents card. The history shows "Filed from Processing" (or "Filed from Processing as version n") from the committed filing record. An audited attempt that did not commit shows as "Filing attempted — not filed". Forms and generated-PDF links are untouched: the derived `document_subject_links` view still adds them.

## Lifecycle: deleting a family disposes of what was filed to it

After D5, every filed document has a Processing case source: its own completed filing case. Disposal
(`disposeDocumentsOfDeletedSubjects`, D2) retained any document a case source referenced, so lead deletion would never
have removed a filed document. Filed documents would have outlived their family.

Disposal now treats the document's own completed filing case (`operational_result.kind = "document_filed"` for that
document) as provenance, not reliance. The document is disposed with its subject, and that case and its source go with
it, because the proposal names the family. A received document superseded into a disposed document (filed as its next
version) goes with it too. Any other Processing reference (an open case, another document's case) still retains. This
is forward behaviour for D5 filings. No historical document is touched.

## D5.7 — Security

Re-applied at commit:
- `documents.write`;
- `processing.operate`, which is necessary and not sufficient;
- the document access decision, which covers organization, scope, sensitivity and quarantine;
- scope of every destination subject;
- clearance for the resulting class: medical needs `health.view`, `personal_identity` and `restricted` need their keys, safeguarding needs the safeguarding view.

Refusals for out-of-scope and other-organization targets are 404, indistinguishable from absent. The filing functions are service-role only.

## D5.8 — Certification

### Automated (local, on the D5 tree)

| Suite | Result |
|---|---|
| Database invariants `certification/invariants/documents-d5-filing.sql` on Postgres (shared local stack, D2+D3+D5 applied inside a transaction that was rolled back) | **11/11 PASS**: all effects in one transaction, replay, second filing refused, quarantine refused, policy refusals leave nothing, raise-only sensitivity, new_version, not_allowed, one object per version, superseded + pending review, service-role only |
| `tests/documents` | **383/383**: 345 before D5, plus D5 filing routes and lifecycle (32) and D5 UI (6) |
| Mutation checks | removing the clearance check fails 2 tests; completing the case on a failed filing fails 9 |
| Regression against the unchanged base (`d18d4e524`, separate worktree `/tmp/d5-base`) | **no new reds**. Access: identical 18 reds on both trees (1957 tests). Processing + POS: 1767 pass, and the one base red (`formDraft › deriveDocumentTitle`) is red on both trees. Every test file that imports a changed module (27), plus `tests/forms`, `tests/publicForms` and the vendor tests: 1755 tests, the identical 38 reds on both trees (Forms 32, as D4 recorded, and adminV2 `workspaceV3FinalPolish` 6) |
| Prebuild guards | all pass (route capabilities with two new routes declared) |
| Typecheck | narrow `tsc` over every changed source file: clean |

## Promotion

| Step | Evidence |
|---|---|
| Merge | PR #1604 merged as `81556597838bb4cff9f5c1233dd56970efe44a2f` (`gar_843b86504ad7db`, 2026-10-26T21:10:34Z) |
| Migration, first census | `gar_e064d44a5c5342` (21:11:51Z, 77 s after the merge): `20261210093500` and all eight D5 functions ABSENT on `alloy_deployed_primary`. A governed apply (`gar_69b16ede884472`) was refused `migration_owned_by_pending_merge`, because the Supabase integration applies the migration on merge |
| Migration, ledger | identity census `gar_ec4c10421d1e84` (`tha_69064259a1103f`, 22:29:08Z): ledger head `20261210093500`, total 546 (`certification/migrations/hosted-migration-identity-census.sql.results.json`) |
| Migration, objects | physical-state census `tha_2ec522e7ab91cc` (22:29:13Z): **11/11 true**: ledger row, the eight D5 functions, and `document_file` / `document_file_as_version` callable by service role only (`d5-filing-physical-state-census.sql.results.json`) |
| Deployment | staging `/api/build-info` gitSha `81556597838bb4cff9f5c1233dd56970efe44a2f`, Supabase `ikaxilmwmrmbagoidedu` (polled 2026-10-26 ~22:30Z) |
| Effect freeze | `efz_db8413255730df` (db_migration on ALLOY_STAGING, UNVERIFIABLE, opened 21:19Z from obligation `eob_cf5359b4cd509b`) cleared by `repository.clear_effect_freeze` `gar_2b46a009683395` (`tha_849fd1a002de12`, 22:43Z), disposition **verified_applied**, evidence identity census `gar_ec4c10421d1e84`. The migration was not re-applied |
| Hosted certification | run `erun2_11befb9e1158c6c0` lost its provider session after the migration wait resolved; resumed on `erun2_dd7acff3de070285` from the measured database state. authz_q1 run `qar_c6e20cc02979` (opened by `gar_521a8b2145b7e2`, target `alloy_staging_web`, hosted authority declared) on staging `81556597838b`: **ensure** built one household (one adult, two children, one case) and ten Processing uploads (nine with filing cases; the scripted PDF quarantined, so it has no case); **certify** passed **59/59** (`d5_hosted_filing_cert_results.qar_c6e20cc02979.json`); **reset** used the audited POS deletes plus lead deletion, and every document, filing case and the household library now return 404 (`all_gone: true`, `d5_hosted_reset_results.qar_c6e20cc02979.json`) |

## Status

COMPLETE: implementation, automated evidence, merge (PR #1604), deployment to staging (`81556597838b`), the staging
migration (11/11 objects, ledger 546) and hosted certification (59/59, fixture fully disposed of) are done and measured.
