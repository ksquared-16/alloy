# Documents V1: security convergence decision packet (D1b dependencies, D1c design, D2 readiness)

**Prepared:** 2026-10-23, Documents lane (`lane_aa660dc9554d`), under the Director's bounded "SECURITY CONVERGENCE" authorization.
**Scope:** design, readiness and evidence only. No D1c or D2 implementation, and no object mutation.
**Lineage:** staging = deployed = `91ee6721b78e2e175e9ab2fcbcb92bdc529415b6`. That contains D1b `267d9400` with no change since to the D1b code
paths or migrations. The evidence branch is `origin/agent/documents` at `064509ed2`.

---

## D1b: certified sub-gates, blocked probes, remaining obligations

**Certified.** Every item was measured on the deployed build. Evidence is in `D1B-SECURITY-HARDENING.md`.
- **Migrations applied, by Director terminal execution.**
  - Content equals the repository after normalization.
  - Effects verified: no client privilege on the six document tables, `service_role` intact.
  - The bucket is private, 20 MiB, with the 8-type allowlist; RLS is on with 0 client policies.
  - Evidence: `gar_deef786d8a0773`.
- **Real-role database denial in the isolated certification environment.** 48/48 client operations refused, OCR read, path rewrite and forged insert refused, storage invisible to clients, service role works (`gar_b433265b66036c`).
- **Hosted application layer, run `qar_40f3800404d3`.**
  - Q1 regression 90/90 and D1b driver 25/25.
  - Covered: medical documents need `health.view`; the drawer never returns OCR text; OCR preview is disclosed only to an authorized actor; 415 on content mismatch; public uploads have size and rate limits.
  - Closed with audited deletes and an access-clean close. Census 12/12 zero, bound ZERO_RESIDUE.

**Blocked:** hosted direct PostgREST and Storage refusal probes.
- The governed capability `environment.qa_principal_probe` does not exist. The spec is `D1B-PROBE-CAPABILITY-REQUEST.md`.
- **S1 routing:** on 2026-10-23 the spec went to the Vacilando repository seat (`vacilando-5d`). It acknowledged, passed it to its operator, and will not build it until assigned. It warned that Vacilando `main` may be frozen (release `31c9b1e` red, fix-forward #373 pending), so the release could be delayed.

**Remaining obligations before `DOCUMENTS_V1_D1B_COMPLETE_PROMOTED_DEPLOYED_CERTIFIED`:**
1. The probe capability is built, released and installed.
2. An `authz_q1` run executes plan `documents_d1b_direct_access`. It must show every direct table request refused (`42501`), storage list returning `[]` and download refused, and the persona's authorized product routes still succeeding as the positive control. The run then gets the usual teardown, close, census and binding.
3. The evidence commits ride with the next executable Documents candidate (see Evidence).

**Not D1b obligations; tracked separately:**
- malware scanning (D1c, below);
- orphan cleanup (S3, below);
- the hosting platform's request limit, about 4.5 MB, sits below the 10 MiB application limit;
- some CRM `related` queries select by id without `org_id` (CRM-owned);
- the staging ledger keeps a multi-statement format for the two D1b versions (preserved by Director decision);
- the certification ledger holds the earlier `20261207181500` bytes.

---

## S3: orphan storage objects, reversible quarantine plan (prepared, not executed)

**Current state, reconciled at 11:52–11:54Z:**
- **Census `gar_6135acc3042ea8`, rerun with positive control as `gar_60fd0ff3bc6d5c`:** 412 objects, 34 unreferenced: 28 `opportunity`, 6 `legacy_vendor`.
- **Whole-schema reference sweep:** every text, varchar, json/jsonb and array column of every public table (1,744 columns) has **zero** references to any of the 34. That covers Documents, Forms, Processing, Vendors, persons, communications and audit. The positive control (5 referenced objects) hit `documents.storage_path`, so the search is proven to find references.
- **Manifest (`gar_bf71a2e1d9ca42`):** 34 objects keyed by `storage.objects.id`, 17,297,517 bytes, all with ETags.
  - 18 JPEG and 10 PNG under deleted opportunities, from 2026-04-05/06.
  - 3 insurance and 3 driver's-licence PNGs under `vendors/<id>/` for vendors that do not exist, from 2026-03-25…28.
  - Last access equals creation for every object, so none has been read since it was written.

| Class | Authoritative reference | Retention | Recoverable | Proposal |
|---|---|---|---|---|
| 28 opportunity images | none in any domain; the opportunity was deleted (lead deletion leaves storage behind) | no retention rule for deleted-lead attachments is recorded in the repository | no: no row, subject or reference to relink to | quarantine, then delete after the retention window |
| 6 legacy vendor identity images | none; vendor absent; outside the org prefix | identity documents: data minimization favors deletion; **legal/retention confirmation required** before any deletion | no | quarantine; delete only after that confirmation |

**Execution plan.** Reversible until the final purge. Every step is a governed action, and none was taken.
1. **Re-verify.** Re-run the manifest and reference sweep. Refuse if the set, sizes or ETags changed, or if any reference appeared.
2. **Copy.** Copy each object to `org_documents/_quarantine/d1b5/<object_id>`. That location is private and outside every org prefix, so the D1a signer already refuses it, and it is no more reachable than today.
3. **Verify.** Download each copy and compare its size and ETag to the manifest.
4. **Delete originals**, only after step 3 passes for all 34.
5. **Retain** the quarantine copies for an agreed window, for example 90 days. **Purge** only under separate Director authorization.

**Rollback:** copy back from `_quarantine/d1b5/<object_id>` to the manifest path, then re-verify the ETag. Works at any point before purge.

**STOP, separate authorization required.** No governed storage-object copy, move or verify action exists today. The Director's S3 condition, "lacks a verified restore operation", therefore holds. Two smallest options:
- **(a)** a Documents-owned **registered reconciliation** runner (`documents_orphan_quarantine`). Modes: `manifest`, `copy`, `verify`, `delete-originals`, `restore`; never purge. It follows the dry-run-first pattern of `web/scripts/vendorObjectPathRemediation.ts`, and its restore is rehearsed on a certification environment with planted objects before it touches staging;
- **(b)** a toolkit storage-object action.

Recommended: **(a)**, because it reuses the registered-reconciliation governance the QA fixtures already use. Execution also needs a retention decision for each class.

**Root cause to fix (D2 or a follow-up):** `deleteOpportunityLead` removes `documents`, `document_versions` and `document_field_values` rows but not the objects. It must delete through the audited document delete, or enqueue the objects for quarantine.

---

## D1c: malware scanning and quarantine before availability (design only)

**What exists today:**
- the `documents.status` value `quarantined`, already refused by every read path (`RESTRICTED_STATUSES`);
- the D1a document audit;
- the scheduled-work clock: Vercel cron `/api/scheduled-work/wake` every 5 minutes, plus `pg_cron`;
- in-app parsers (`tesseract.js`, PDF text extraction).

There is no AV engine. The image libraries `sharp` and `file-type` are not installed.

| | A. Reuse existing infrastructure | B. Dedicated external scanning service | C. Bounded asynchronous scan worker |
|---|---|---|---|
| What | Structural *active-content* screening in the existing Node runtime. PDFs are refused or held when they carry `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, `/AA`, `/RichMedia` or XFA. Images must decode and their header must match. Quarantine status on failure. | A commercial malware-scanning API or a cloud provider's storage-malware feature | ClamAV (or similar) in a container, fed by a queue and run from the scheduled-work clock |
| Engine | heuristics only, no signatures | signatures and heuristics | signatures |
| Cost | none | per scan and subscription (**purchase decision**) | container hosting, plus signature-update operations |
| Privacy | data never leaves the platform | **children's medical, custody and identity documents go to a third party**: needs a DPA and data-residency review | data stays within Alloy-controlled infrastructure |
| File types | PDF, PNG, JPEG (the public set); operator types by extension | broad | broad |
| Upload latency | under about 100 ms, synchronous | seconds; async needed | async; availability delayed by up to one clock tick (≤5 min) |
| Failure handling | deterministic; a parse failure means quarantine | provider outage: fail closed (stay quarantined) or fail open (a policy decision) | worker outage: stays quarantined; needs an operator release path |
| Existing files | can backfill-scan all 412 objects cheaply | backfill costs per file | backfill through the queue |
| Auditability | D1a audit events: `document_quarantined`, `document_released` | provider verdict id recorded | verdict recorded |
| Deployment change | none new | provider credentials, a DPA, egress | **a new runtime** (container host), which the Director must decide |

**Recommendation, the smallest safe architecture: A now, with an optional B or C later.**
- **D1c-1:**
  - public uploads only (vendor application, enrollment upload, signature);
  - synchronous structural screening;
  - `quarantined` status plus a reason on failure;
  - an audited operator `release` action behind `processing.documents.manage`;
  - a one-time backfill screen of existing objects.

  No provider, no subscription, no new runtime. Unflagged uploads stay immediately available, so enrollment is not stalled.
- **D1c-2 (needs a Director decision):** a signature-based engine, chosen between B (needs a DPA) and C (a new runtime). It runs asynchronously through the scheduled-work clock, under the same quarantine contract.

**Is scanning required for safe D1b closure? No.**
- D1b's controls are authorization and storage.
- The residual malware risk is bounded today. Public uploads are limited to PDF/PNG/JPEG by magic bytes, with size and rate limits. Storage is private, links are short-lived, previews run under a sandbox CSP, and no uploaded content is executed.
- What remains is parser exposure (PDF text extraction, OCR) and operator download. That warrants D1c as a **separate bounded security slice**.

**Decisions needed:**
1. Approve D1c-1 scope, which is internal only.
2. The fail-open or fail-closed policy for flagged uploads (recommended: fail closed, with operator release).
3. Whether, and which, D1c-2 engine (B with a DPA, or C as a new runtime).

---

## D2: canonical foundation, readiness and decisions

**The current model, as measured in D0 and D1:**
- One `documents` row with a polymorphic parent (`entity_type`, `entity_id`), `doc_type`, `status`, `bucket` and `storage_path`, plus OCR text inline.
- `document_versions` exists but is written by nothing except a delete.
- Linkage is spread across many places: `form_submission_documents` (role), `form_submission_signatures.drawn_asset_document_id`, `vendors.*_doc_file_id` and `*_doc_path`, `staff_qualification_evidence.document_id`, `child_safeguarding_restrictions.evidence_document_id`, `person_medical_consents.evidence_document_id` (no FK), `financial_subsidy_*.source_document_id`, `processing_case_sources (source_kind, source_id)`, and `persons.metadata` profile-photo pointers.

| Topic | Proposal | Why |
|---|---|---|
| **Logical identity** | `documents` stays the logical document: id, org, `doc_type`, `title`, `status`, `sensitivity`, owning domain, timestamps. It stops being the file. | Every consumer already holds `documents.id`; keeping it avoids re-pointing about 10 foreign keys |
| **Immutable versions** | `document_versions` becomes the file: bucket, path, sha256, size, MIME, created_by, created_at, and `extracted_text` moved here. It is append-only (no UPDATE, no DELETE except the governed purge). `documents.current_version_id` points to the current one. | Content provenance (what packet intake and signed artifacts cite) needs immutable bytes; OCR text belongs to the bytes, not the logical document |
| **Typed subject associations** | `document_subjects (document_id, subject_type, subject_id, role, primary)`. `subject_type` is an enum: child, person, household, opportunity, vendor, employment, case, submission. There can be many subjects per document. | Replaces the single polymorphic parent; allows one immunization record to belong to a child and to the household packet; makes scope evaluable per subject type |
| **Legacy parent fields** | `entity_type` / `entity_id` stay as a read-compatibility projection of the primary subject, maintained by trigger during migration, then frozen. The other domains' `*_document_id` foreign keys stay unchanged, with no shadow copies. | Zero-downtime; no consumer rewrite in the first step |
| **Sensitivity and access** | A declared `documents.sensitivity`: `standard`, `medical`, `safeguarding`, `identity`, `financial`. It is set by the writer from the destination schema and is never caller-supplied. Rules: medical → `health.view`; safeguarding → the safeguarding view; identity → a new `documents.identity.read` (Director decision); financial → `fin.read`. Subject scope is evaluated per typed subject. | Replaces D1b's inference, which stays as the fail-closed fallback while backfill is incomplete |
| **Requirement waivers** | **Owned by Enrollment** (`requirementException.ts`: one requirement, one subject, one approver, three states). Documents never records "waived". A requirement links to its evidence documents through `document_subjects` and the requirement key. | The exception is a decision about a requirement, not a property of a document; this matches the existing doctrine "an exception is never evidence" |
| **Migration and backfill** | Additive migrations:<br>1. create `document_subjects` and the `sensitivity` column, plus `current_version_id`;<br>2. backfill one version per document from current bucket/path/text, one subject per non-null parent, and sensitivity from the D1b inference;<br>3. verify by census (counts, hashes);<br>4. switch reads;<br>5. freeze legacy columns.<br>Every step is re-runnable and self-verifying, and certified on certenv before staging. | 378 documents today; the backfill is small and fully measurable |
| **Audit and retention** | The D1a `workflow_events` audit stays authoritative for issuance, upload and delete. Add `version_created` and `sensitivity_changed`. A retention policy per `doc_type` and sensitivity (Director/legal input) drives a governed purge that is the only deleter of versions. Orphan quarantine (S3) feeds the same purge. | Today nothing deletes objects coherently, which is how 34 orphans arose |

**Readiness:** the design is ready for Director review.

**Implementation prerequisites:**
1. Director decisions:
   - the sensitivity vocabulary and the `identity` permission;
   - the retention policy per class;
   - the subject-type enum.
2. The D1b probe capability, so D2's revocations and new tables are certified with the same direct-access probe.
3. The `deleteOpportunityLead` storage-leak fix (or its D2 replacement).
4. Forms, Processing, Enrollment and Vendors agree to read through `document_subjects`. Their write paths keep their foreign keys.

**Blockers:** none technical. The only blocker is the D2 authorization itself.

---

## Evidence: PR disposition, lineage, promotion plan

- **#1576** (evidence-only) was **closed without merging** (`gar_1ad7a3f31a1aa9`) after verifying exact preservation. Its head `064509ed2` equals `origin/agent/documents`, with 3 commits: `4c6e5c3bd`, `b97d9b039`, `064509ed2`.
- **This packet and the S3 censuses** are additional evidence-only commits on the same branch.
- **Promotion plan:** the next eligible executable Documents candidate (for example D1c-1, or the `deleteOpportunityLead` fix) is cut from `agent/documents`, so these commits are included. Its PR re-validates the evidence against that candidate's exact SHA: re-run the D1b driver and Q1 matrix on the candidate's deployment, and the ledger/content census. The commits are never rewritten or squashed.
