# Documents V1 — D7/D8 final certification continuation: R3 / R4 / residue reconciliation

**Status: NOT_YET_READY.**

Done in this continuation:
- **R3:** an isolated certification environment is READY and leased to this lane.
- **D8 Postgres invariants:** PASSED 7/7 on that environment.
- **Residue reset:** `qa_documents_forms_residue_reset` now has its Alloy runner, fixture and census bytes, with SHA-256 pins. Its behaviour is proven rollback-only.
- **R4:** the three restricted personas are defined in persona-contract Revision 3.

Still open:
- **Registration** of the reset, the census and the personas is Vacilando-owned, and depends on these bytes merging to staging.
- **D7 invariants** are refused by a Vacilando analyzer defect.
- **Not run:** the R4 hosted gates and the live suites.

No product code changed. No hosted data was written. No closed QA result was rewritten.

| | |
|---|---|
| Lane / run | `lane_aa660dc9554d` / `erun2_549f37f9e90f7c1e` (EXECUTING), worktree `documents`, branch `agent/documents` |
| Toolkit | `20261029-d860bd00102b` (as instructed) |
| Staging | `1045a8ce0794ce99e37074495b346237d99c4650` (`/api/build-info`, `dpl_58ZDddBzwzt3T5VfMh5Q1RYsNidD`) |
| Since the certified `7d7c80373036` | 3 merges (#1613 tours, #1615 clean-base, #1614 analytics); **no migration and no file under Documents / Forms / Health / Access** → prior evidence stands |

## R3 — isolated certification environment

- Built by `environment.build_certification_baseline`, `gar_e8022e56a63f84`:
  - filed from this lane, with `leaseLane = lane_aa660dc9554d`;
  - operator-approved 2026-10-29T03:27:03Z;
  - trusted-host action `tha_c9dbb1053e21c1`.
  - Evidence: `r3_certenv_build.certenv-55644086aa.json`.
- **`certenv-55644086aa`** is READY:
  - base `1045a8ce` (staging tip), 550 migrations, head `20261214090000`;
  - so it carries D5 `20261210093500`, D6 `20261212090000`, D7 `20261213090000` and D8 `20261214090000` by construction;
  - migration manifest `f41ccbcb…`, seed manifest `79a296b6…`;
  - 2 replays agree, and the ledger matches the manifest;
  - credentials are rotated and live on the trusted host only.
- **Lease and isolation:**
  - The lease holder is `lane_aa660dc9554d` until 2026-10-30T03:29:11Z (renewable: `environment.renew_certification_lease`).
  - Ports 56110–56117 (db 56111), outside the alloy-cert range.
  - Compose project `vac-certenv-55644086aa`.
  - Shared alloy-cert and the five foreign READY environments were not touched.

## D7 / D8 Postgres invariants on the isolated environment

| Invariant | File sha256 (byte-identical at staging) | Result |
|---|---|---|
| D8 Forms evidence | `a7073f11…` | **PASSED 7/7**, `gar_31992407e098d2`; reached the end and rolled back; catalog / sequence / ledger fingerprints identical before and after (`550:20261214090000`). Evidence `r3_d8_invariant.certenv-55644086aa.json` |
| D7 review lifecycle / validity | `e3d42fad…` | **NOT RUN — refused statically by the harness (Vacilando defect).** `analyzeRollbackSafety` matches DENY keywords inside single-quoted literals: `has_function_privilege(…, 'EXECUTE')` → `refused_dynamic`, and the reason string `'Clear copy confirmed'` → `refused_copy`. Measured with the installed analyzer; D5 and D6 hit the same false positive. Not worked around. The earlier local rollback pass (10/10, shared stack) stands as prior evidence only |

## Residue reconciliation — `qa_documents_forms_residue_reset` (registry: `awaiting_alloy_pins`)

| Artifact | Path | sha256 |
|---|---|---|
| Reset runner | `web/scripts/qaDocumentsFormsResidueReset.mjs` (npm `dev:qa:documents-forms-residue-reset`) | `0c0cb8dfbd710072101ed4782a3eff1fb3ba24ee09b0ccdddf73b7e2cc82c895` |
| Reset fixture | `certification/fixtures/qa-documents-forms-residue-reset.sql` | `3e2a31e4fa8791cf6b787e6001f71cd2ee0b13d3e0444151a8f592c265690e91` |
| Census (extended) | `certification/qa-shared/documents-zero-residue-census.sql` | `7957a51a60407ca03489a1ca89a854e71a2ba3564a62c14995f459e436c35c04` (was `eb702fb6…`, 15 checks → 20 checks + 1 retained report) |
| Persona contract Revision 3 | `docs/platform/governance/authorization-qa-personas.md` | `e6d619f2796c099b8a57592e6a556e58150537a3175388f48eb250e133c03b6e` |

**Scope:**
- QA Shared only, the registry's frozen context.
- The OPEN run's `qa_<run hex>_` Forms rows: definitions, versions, links, packet definitions, items, sessions and session items, and submissions. Signatures cascade with their submission.
- The frozen, enumerated residue of the CLOSED runs, and nothing else from them:
  - forms `01c4bf36…` and `6a565dc9…` (`qar_4246ac22ece0`);
  - forms `7e36208b…`, `6f2e664b…` and `8dd68ff9…` (`qar_8fb0e1ffabcf`);
  - the three orphaned child-only submissions `c727bac4…`, `9bc7cb9b…` and `f19d3fd1…`, removed only through their own form;
  - each form must still carry its run's prefix and be inactive.

**Proof:** a rollback-only run on alloy-cert (seed → apply → assert → ROLLBACK; nothing persisted).

| # | Requirement | Evidence |
|---|---|---|
| 1 | Historical census assertions unchanged | The 15 existing questions are byte-identical (non-comment diff vs `eb702fb6`: 0 lines removed). `eb702fb6` becomes a historical binding for `qar_8fb0e1ffabcf` / `gar_db7822cfa675e8` |
| 2 | Archived Forms and orphaned child-only submissions detected | Clean → all true. One archived run form → `doc_zr_forms_definitions` false. Full residue → all 5 new checks false. A `bp_v2`-style `qa_` form is not counted |
| 3 | Reset cannot delete unrelated or production records | Kept: a frozen id that is still active, a frozen id with a foreign key, another run's form, a bp-style form, and the same run key in another org. Refusals: non-QA org (Firefly id), malformed or missing run, linked document, drawn-signature asset, prior submission still bound to a subject. The runner refuses production by project ref. Toolkit hosted-fixture audit: 8/8 deletes fixture-scoped, none org-wide |
| 4 | Health facts and audit retained | `person_health_facts`, `mutation_events` and `workflow_events` counts are unchanged. The census reports ended facts as retained data and treats an ACTIVE fact on a missing child as residue |
| 5 | Cleanup audited and append-only | One transaction. The deleted counts are returned in the governed result, so they are kept in the append-only request store. No DB audit row is invented |
| 6 | Closed QA results immutable | `qar_4246ac22ece0` and `qar_8fb0e1ffabcf`, with their bindings, are not amended. The reset is a new act with its own census |

**Registration needs**, exact text in `../qa-shared/documents-r3r4-vacilando-registration-handoff.json`:
- pins after merge;
- a missing hosted-fixture safety profile, `qa_documents_forms_synthetic`; without it the fixture is refused at execution;
- the census re-pin.

## R4 — restricted QA personas (contract Revision 3; not yet in the installed `authz_q1`)

| Persona | Role / grants | Scope | Must succeed | Must be refused | Deciding gate |
|---|---|---|---|---|---|
| `scoped_forms` | `qa_scoped_forms`: `portal.access`, `documents.read`, `crm.customers.read`, `forms.submissions`, `forms.submissions.confirm` | department D1 (`0704e72c…`), all sites | Forms actions on a D1 subject | the same actions on a D2 opportunity or an out-of-scope child → 404 (scope, not capability); authoring → 403; medical answers withheld | `requireFormsCapability` then the subject-scope filter |
| `health_viewer` | `qa_health_viewer`: `portal.access`, `documents.read`, `health.view` | all | medical answers and medical documents readable | `health_fact.verify_immunization` and other Medical mutations → 403; review → 403 | health action registry (`health.manage`); review route (`documents.write`) |
| `doc_writer` | `qa_doc_writer`: `portal.access`, `documents.read`, `documents.write` | all | first review decision, validity, renewal upload | re-review / reopen → 403 `REREVIEW_NOT_AUTHORIZED` (needs `processing.documents.manage`) | `app/api/admin/documents/[id]/review/route.ts` |

- **Catalog:** every key exists in `permission_definitions`.
- **Identities:** the existing five pool identities are all bound, so three new ones are needed: `qa-pool-06` to `08`.
- **Provisioning, real sign-in and grant verification have not happened.** They need the toolkit registration and governed identity provisioning, then a QA run.

## Synthetic fixtures (§5 of the brief) — what each needs

| Fixture | Mechanism | Owner | State |
|---|---|---|---|
| Packet sessions, in-scope and out-of-scope subjects | Product path: `POST /api/admin/forms/packet-links`, then the public `forms/[token]` flow. Run packet keyed `qa_<run>_`; cleaned by the reset | Documents (driver) + `scoped_forms` | not run (persona) |
| Signed Forms + generated-document provenance | Product path: the public enrollment flow with `enrollment-signature-asset` → `enrollment-artifact`; tamper a copy → `mismatch` | Documents (driver) | not run |
| Forms / packet medical-label disclosure | Product path: `enrollment-upload` inside a packet session, probed by `doc_reader` / `no_docs` / `scoped_forms` / `health_viewer` | Documents (driver) + personas | not run (persona) |
| A child linked to two leads; submissions surviving one lead's deletion | **No product route** gives a second lead on one household (measured on `qar_8fb0e1ffabcf`). Needs a registered `aa000000-` ensure/reset fixture pair | Documents SQL + plan-owner registration | not started — no registry slot |
| Enrollment-start renewal dates | `child_enrollment_agreements` for a run child. No QA route exists | Enrollment lane | handed off |
| BP document-stage readiness | A run-scoped process whose stage names a document type | Business Processes lane (authoring) | handed off |
| Attention > 1,000 | A registered, census-covered bulk fixture | plan owner + Documents SQL | not started |

## Not run, and why

- **Hosted R2 gates 1–3, the R5 shared child, and the R4 rows above:** these need the personas and fixtures registered first.
- **Live suites** (Health, Enrollment, BP, `formsCapabilityAuthority`) against `certenv-55644086aa`: the toolkit still exposes no lane-facing way to point `web/` live suites at a builder environment. That gap was named in `R3-certification-environment-handoff.json` and is unchanged.
- **No new hosted QA run was opened.** Opening one before the personas, the reset and the census are registered would reproduce the closed run's coverage and its residue.

## Preserved

These are unchanged and still valid on `1045a8ce` (no Documents path changed):
- R1 158/158
- browser 19/19
- R2 Forms reads 45/45
- R5 child-only cleanup
- D8/FI-10 59/59
- EN-FI-01 43/43
- Q1 90/90
- `qar_8fb0e1ffabcf` CLOSED / ZERO_RESIDUE (`gar_7c52989a8a7288` → `gar_db7822cfa675e8`)
- supplementary census 6/6

Nothing in those records was edited.
