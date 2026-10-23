# Documents V1 / D1b — database, storage and ingestion hardening: certification record

**Verdict: PARTIAL (superseded).** The open D1b.2, D1b.3 and D1b.7 gaps (the direct PostgREST and Storage probes) closed on 2026-10-23 in `qar_efe9bd0d1d9c` on `ead89222`. The final verdict is **CERTIFIED**; see `D1B-D1C1-SECURITY-CERTIFICATION.md`.
- Every implemented protection is merged, deployed and certified at the application and database layers.
- Hosted *direct* REST and Storage probes are BLOCKED on a missing governed probe capability (`D1B-PROBE-CAPABILITY-REQUEST.md`).
- Malware scanning and orphan cleanup await Director decisions.

## Lineage

| Item | Value |
|---|---|
| PR | #1575, merged at `267d9400b8c797d0d1ec5f32864bc9495c4f6771` (`gar_e7698ae4ae0f81`) |
| Deployed | staging `/api/build-info` gitSha `267d9400…`, Supabase `ikaxilmwmrmbagoidedu`, measured 03:53Z and 04:05Z 2026-10-23 |
| Canonical checkout / filing authority | `267d9400` = `refs/remotes/origin/staging` (fixtures stamped and executed there) |
| Toolkit | `eacd98ccf4d6` |

## Migrations: provenance and ledger exception

`20261207181500_documents_direct_access_revocation` and `20261207181600_org_documents_bucket_governance`:

- **Provenance:** applied to `alloy_deployed_primary` by the Director, through the terminal (Director confirmation, 2026-10-23). No specific CLI command, tool or timestamp is claimed.
- **Content:** the recorded statements, joined and normalized (comments and whitespace removed), equal the repository files exactly:
  - `20261207181500`: `68a3e61c…`
  - `20261207181600`: `73877b45…`

  Measured at 03:47Z by `gar_deef786d8a0773`; earlier `gar_a8d2f05b1d9b4b`.
- **Effects on the deployed primary:**
  - `anon` and `authenticated` hold no privilege on `documents`, `document_versions`, `document_field_values`, `document_field_definitions`, `form_submission_documents` or `form_submission_signatures`;
  - `service_role` keeps SELECT, INSERT, UPDATE and DELETE;
  - `org_documents` is private, with `file_size_limit` 20971520 and the 8-type allowlist;
  - `storage.objects` has RLS on and 0 client policies.
- **Ledger-format exception (open):** the rows are multi-statement (2 and 3 statements, `created_by` null). They do not have the single-statement identity a governed apply writes. They are preserved as recorded and were not replayed or repaired. A future governed apply of either version refuses with `version_already_registered`. Any toolkit-identity verification of these versions must use content equivalence.
- **Certification-environment ledger (separate, not a staging blocker):** certification records `20261207181500` with the earlier bytes `d97e917a…`, from `gar_4057b1f30c9b8e` at `357d8a715`. Those bytes differ only in the self-check's privilege loop. The current file is `36cba518…`. An earlier certification refusal was a version collision with the Tours lane at `20261206090000`; the D1b migrations were renumbered for it.

## Gates

| Gate | Status | Evidence | Outstanding |
|---|---|---|---|
| D1b.1 Baseline / writer census | COMPLETE | `gar_c609be0f079b98`; code inventory: no user-session or browser client touches document tables or storage | — |
| D1b.2 Database authorization | PARTIAL | Migration effects on the deployed primary (`gar_deef786d8a0773`); real-role denial on certenv, 48/48 refused, OCR read, path rewrite and forged insert refused, service role works (`gar_b433265b66036c`, `tha_d35f80a9d8d01e`); application-layer OCR disclosure closed and hosted-tested | Hosted direct PostgREST probe: BLOCKED, governed probe capability |
| D1b.3 Storage governance | PARTIAL | Bucket posture on the deployed primary (`gar_deef786d8a0773`); certenv CASE 5, clients see 0 objects and cannot place one; canonical content types hosted-tested (CONTENT_MISMATCH) | Hosted direct Storage list/download probe: BLOCKED, same capability |
| D1b.4 Public upload protection | PARTIAL | Hosted: 6 MiB body refused (413, platform edge); rate limits trip at limit+1 on all three routes; refused requests persist nothing; magic-byte validation unit-tested | Malware scanning / quarantine: Director decision (below); platform payload limit below the app limit (finding) |
| D1b.5 Orphan classification | COMPLETE (classification) | `gar_f9525a3d16e422`, re-confirmed `gar_0377ce97c8f8ce` at 04:08Z: 34 orphaned, none recoverable, no reference in any domain | Cleanup: proposal below, not authorized |
| D1b.6 Sensitive / subject scope | PARTIAL | Hosted: a medical document is refused to every persona without `health.view`, hidden from lists and refused by the drawer; OCR preview disclosed only to `ocr`; the related-tab filter and the public-signature ownership check are unit-tested | D2: typed subject associations and declared sensitivity (below) |
| D1b.7 Hosted certification | PARTIAL | `qar_40f3800404d3` (see below): Q1 regression 90/90 and D1b driver 25/25 on `267d9400`; audited deletes; access-clean close; zero-residue census 12/12 | Direct REST/Storage probes BLOCKED |

## Hosted results: `qar_40f3800404d3`

- **Personas:** 7 of 7 verified. `scoped_ops` is department-restricted.
- **Fixtures, all stamped and executed at `267d9400`:**
  - ensures: vendor `tha_620cb99787cc4d`; subjects QA Shared `tha_7c79b2b9415c81`, QA Secondary `tha_b74bbffc9478a2`;
  - resets: subjects QA Shared `tha_16f121b79eb593`, QA Secondary `tha_e3cabc9c03eb01`; vendor `gar_d3e6db33bd6c2d`.
- **Q1 regression matrix:** 90/90 (`q1_hosted_authz_cert_results.qar_40f3800404d3.json`). It covers authorization, cross-organization isolation, vendor binding, Processing and OCR, and refused writes.
- **D1b driver:** 25/25 (`d1b_hosted_security_cert_results.json`).
- **Teardown:** 6 documents deleted through the audited POS delete, including the intake document's Processing case. Every link now returns 404.
- **Vendor reset:** `tha_5f209193855b43`, at `267d9400`.
- **Close (`gar_7d2c175e7c0e61`):** access clean. All 5 pool memberships removed, leaving 0 roles and 0 profiles. All 5 `qa_*` roles hold 0 grants. All 7 identities signed out, and the run's session directory is deleted.
- **Zero-residue census (`gar_ce465aeb123507`, registered `3be83854…`):** run after the close, at 04:12:46Z: **12/12 zero**. Retained by design and not residue: 131 `mutation_events` rows in QA Shared, and 58 D1a `workflow_events` rows in the QA orgs, which are the audit of link issuance, upload and deletion.
- **Binding:** `gar_60221c4ab2462b`. The run is CLOSED / `ZERO_RESIDUE`, and no QA run holds the shared org.

## Malware scanning: recommendation

**Not required for safe D1b closure; it warrants its own bounded slice (D1c), behind a Director provider decision.**

Today's exposure is bounded:
- storage is private, links are server-issued and short-lived, and previews run under a sandbox CSP;
- public uploads accept only PDF, PNG or JPEG, proven by magic bytes, at most 10 MiB, rate-limited;
- nothing executes uploaded content.

The residual risk has two parts:
1. a malicious file delivered to an operator who downloads it;
2. the server-side parsers that read uploads: PDF text extraction and image OCR.

Smallest design that reuses the existing infrastructure:
1. **Quarantine before availability:** public uploads are inserted with `documents.status = 'quarantined'`. That status already exists: `RESTRICTED_STATUSES` makes the decision refuse it with `DOCUMENT_RESTRICTED`, and every path goes through that decision. No new storage path or bucket is needed.
2. **One scanning step** that sets the status to `uploaded`, or keeps it `quarantined` with a recorded verdict. It runs from the existing processing pipeline and is audited through the D1a document audit.
3. **Provider:** the Director's decision. A hosted scanning API or a managed ClamAV are both new external dependencies, and a self-hosted scanner would be a new runtime. None is selected here.

Until a provider exists, quarantining by default would stall legitimate enrollment and vendor review. So step 1 ships together with step 2, not ahead of it.

## Orphan cleanup proposal (34 objects, not authorized)

| Class | Count | Authoritative reference | Retention | Recoverable | Proposal |
|---|---|---|---|---|---|
| `<org>/opportunity/<id>/…`, PNG/JPEG, 2026-04-05/06 | 28 | none: no documents row, version, public URL, vendor path, person or document metadata; the opportunity no longer exists | lead attachments of deleted leads; no retention obligation known | no | quarantine, then delete after the retention window |
| `vendors/<id>/insurance\|drivers_license/…`, PNG, 2026-03-25…28 | 6 | none: the vendor does not exist; outside the org prefix | identity documents (driver's licence): data-minimization favours deletion; confirm no vendor-application retention duty | no | quarantine, then delete after confirmation |

The procedure is reversible until its final step, and every step is a governed action:
1. A manifest: object id, bucket, size and sha256.
2. A copy to a private quarantine location with the same access posture.
3. Hash verification.
4. Deletion of the originals.
5. A retention window, then purge.

Rollback is a copy back from quarantine. Nothing has been moved or deleted.

**Root cause, to fix separately:** `lib/admin/opportunity/deleteOpportunityLead.ts` deletes the `documents`, `document_versions` and `document_field_values` rows but never removes the stored objects. That is how the 28 opportunity orphans were created, and it will create more.

## Security-model boundaries (fail-closed today)

| Behaviour | Class | Today |
|---|---|---|
| Sensitivity is inferred from `doc_type`, medical-form linkage and safeguarding citation; there is no declared per-document sensitivity | D2 architectural dependency | Fails closed: an unreadable classification makes the document sensitive in every class |
| Subject scope for person, household and child-member documents uses department/site linkage only; a subject without linkage is visible only to all/all actors | D2 architectural dependency | Fails closed for restricted actors |
| Profile photos use `DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER`; sensitivity still applies | D2 (typed photo association) | Unchanged from D1a |
| Related-record tabs filter documents by read admission and sensitivity, but the parent entity's own scope and org checks belong to CRM | Later enhancement, CRM-owned; some `related` queries select by id without `org_id` | Reported, not changed |
| `processing_case_sources`, `vendors` and the evidence tables keep client grants, but hold no document content | Later enhancement, owning domains | Reported |
| Vercel function payload limit (about 4.5 MB) is below the 10 MiB application upload limit | D1b certification finding (platform) | Larger uploads are refused at the edge |
| Hosted direct PostgREST/Storage probe | D1b certification gap | BLOCKED, governed probe capability |
