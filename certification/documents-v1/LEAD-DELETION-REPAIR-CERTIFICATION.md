# Documents V1 — lead-deletion storage repair: hosted certification record

**Verdict: CERTIFIED on the deployed build.** Lead deletion now disposes of a lead's documents *with* their
stored files, audited. Documents still relied on elsewhere are kept. This certifies only the new behaviour. It does not
re-certify D1b, which stays PARTIAL until the direct REST/Storage probes run (`D1B-PROBE-CAPABILITY-REQUEST.md`).

## Lineage

| Item | Value |
|---|---|
| PR | #1579, merged at `b640b454636c69b63bbdbd08bf7f113c1cfbdb8f` (`gar_9f7932ede07d80`) |
| Tested = merged = deployed | staging `/api/build-info` gitSha `b640b454…` (13:06Z), Supabase `ikaxilmwmrmbagoidedu`; canonical checkout `b640b454` |
| Carried D1b evidence | `4c6e5c3bd`, `b97d9b039`, `064509ed2` (closed #1576), `cbc064dbb`, unrewritten |

## The defect and the repair

**Defect:** `executeOpportunityLeadDeletionGraph` step 8 deleted `documents`, `document_versions` and `document_field_values` rows
with a generic `deleteByIn`. It never removed the stored files, wrote no audit, and checked no other reference. That produced 28 of
the 34 D1b.5 orphans. It also missed deletable customer members' documents, and left the documents linked to its deleted form
submissions dangling.

**Repair:** `web/lib/documents/documentDisposal.ts` (`disposeDocumentsOfDeletedSubjects`), called before the opportunity row is
deleted:
- **Retained, row and file:** another subject; a Forms link or drawn signature; a Processing source; staff-qualification,
  safeguarding, medical-consent or subsidy evidence; a vendor pointer or a remaining person's profile photo; a legal hold or
  unexpired retention (interim `metadata.legal_hold` / `metadata.retention_until`); a stored path outside the org prefix.
- **Otherwise deleted:**
  1. `document_delete_authorized` is recorded first.
  2. The document's and every version's objects are removed. "Already absent" counts as removed.
  3. The field values, versions and row are deleted.
- **Failure:** a failed read, audit or storage step throws a typed `DocumentDisposalError` before the row goes. The lead stays, so
  the deletion is retryable. Every step is idempotent and org-scoped.

## Automated

- `tests/documents/documentDisposal.test.ts`: 14/14. Covers a document owned only by the lead, shared or referenced documents,
  a legal hold, a live and an expired retention period, a missing object, a storage failure, a retry after a partial failure, the
  audit unavailable, a reference read failing, cross-organization refusal, a foreign path, the executor's ordering and the graph's
  candidate set.
- **Domain sweep** (1,403 files): no failure exists only on the candidate. The base has 599 pre-existing failures.
- **CI on #1579:** all required checks green; Supabase Preview skipped.

## Hosted: `authz_q1` run `qar_67af1242d8c9`, on `b640b454`

- **Personas:** 7/7 verified.
- **Fixtures:** ensures for vendor `tha_29fe0ecc1e96d9`, QA Shared subjects `tha_1b7668bc440b93` and QA Secondary
  subjects `tha_17cd045a292a34`. Resets for QA Shared subjects `tha_d153f28ec47e02`, QA Secondary subjects
  `tha_78e18c2c9116ba` and vendor `tha_f18c877fa7ce28`. All stamped and executed at `b640b454`.
- **Regression:** Q1 matrix 90/90 (`q1_hosted_authz_cert_results.qar_67af1242d8c9.json`); D1b driver 25/25
  (`d1b_hosted_security_cert_results.qar_67af1242d8c9.json`).
- **Lead deletion: 7/7** (`d1b_lead_delete_results.qar_67af1242d8c9.json`):
  - `fixture_admin` deleted QA fixture opportunity `OPP2` through `POST /api/admin/opportunities/[id]/delete`;
  - both of its documents, the Q1 `wu2` upload and an upload owned only by the lead, were `deleted` with `objectsRemoved: 1`
    (2 deleted, 0 retained);
  - both links return 404 `NOT_FOUND`;
  - `OPP1`'s document is still served (200).
- **Audit (`gar_67c899c68dd4a4`):** exactly 2 `document_delete_authorized` events from `admin/opportunities/delete`, one per deleted
  document. Each carries `reason: subject_deleted`, entity `OPP2`, `stored_objects: 1` and the actor, and both rows are gone.
- **Teardown:** the other documents went through the audited POS delete. `wu2` correctly reported 404, already gone.
- **Close:** `gar_baaeb6246ebed8`, access clean, 0 roles, 0 profiles, 0 grants, all sessions signed out.
- **Zero-residue census (`gar_f4f963868b8ea9`, 13:30:05Z): 12/12 zero.** That includes `doc_zr_shared_objects`, which shows **no
  stored object of the deleted lead remains**. The teardown could not have removed one, because it deletes only rows that still
  exist.
- **Binding:** `gar_722073f606381e`. The run is CLOSED / `ZERO_RESIDUE`, and no QA run is open.

## Not done here

- Historical orphan cleanup (S3 plan, needs separate authorization).
- D1c-1 and D2.
- The direct REST/Storage probes (Vacilando toolkit owner).
