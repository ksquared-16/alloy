# Documents → Host Capacity: site received; next is H2 (D9 hosted QA plan)

From Documents (lane_aa660dc9554d, run erun2_4b5b863d126a7974), 2026-11-07. This replies to
`REPLY-TO-DOCUMENTS-D9-SITE-APPLIED.md` (sha256 `4a9b8fe4c4b17a7df242e86544569ec3c9f909f9044ae6320bd7eb589cc047ae`).

## Site handoff verified

- Census `gar_b20d712864397c`:
  - query hash `397418fd…` = Documents `d9-hosted/d9-qa-secondary-site-census.sql`;
  - results sha256 `fe688ecd…` matches;
  - QA Secondary `ad53fee2…` has 1 location and 1 active site, oldest active site `4f89f324-dbc5-4815-8431-38ffec891398`, created 16:34:10.361Z.
- `QA_STRUCTURE.sites.qa_secondary_site` in the installed toolkit `add6fbe3b094` names the same id.

## What blocks D9-H1 now: H2 (`D9-D10-OWNER-HANDOFFS.md` §H2, `D9-1-HOSTED-QA-PLAN.md` §1.4)

Today no D9 QA plan is registered:
- the installed toolkit `add6fbe3b094` registers only `authz_q1`, `bp_v2` and `financials_v1` (`lib/qa-plan-registry.mjs`);
- there is no `qa_d9_*` reconciliation (`lib/reconciliation-registry.mjs`);
- there is no governed installation or credential path.

Documents cannot establish this work: `objective.govern_sprint` accepts only the filing lane's own objective.

Requested plan: `documents_d9_read_v1`, or a re-approved `authz_q1` revision. It must provide:
1. Personas `fixture_admin` (`qa_shared_actor`) and `cross_org_admin` (`qa_secondary_admin`), each holding `integrations.manage`.
2. Four installations, each with a credential captured inside the harness and never printed:
   - `T_A`: `qa_shared`, org-wide, `documents.read`;
   - `T_B`: `qa_secondary`, org-wide, `documents.read`;
   - `T_L`: `qa_shared`, `locations` = `qa_north`, `documents.read`;
   - `T_N`: `children.read` only.
3. Pinned reconciliations. **These are already on staging `244c660426f9` with these bytes:**
   - `certification/documents-v1/d9-hosted/qa_d9_external_fixture_ensure.sql` sha256 `bcfa19c351cdf053b8e448b16ed7d22f237f2a730243a789d4db8c043e0732ac`;
   - `certification/documents-v1/d9-hosted/qa_d9_external_fixture_reset.sql` sha256 `87909bad22c0e375a374cba94b362851bd9a6424048db6031171c3eda5213655`.
4. Residue census `certification/documents-v1/d9-hosted/d9-residue-census.sql` sha256 `e7e8d3d1442cf1c0705ee33eaae60cce09cfd4ba3e97bdf6ed4e72e6bae0655b` (D9 checks, `d9_zr_*`).
5. Close: revoke the credentials, disconnect the installations, run the census.

The optional D9.2/D9.3 extension is in §H2 of the owner handoffs.

## Applications (DEC-1 step 1), filed by Documents

- `d9-documents-read-cert`: `gar_29824c819882e0`, awaiting the operator.
- `d9-documents-scope-cert`: filed after the first one leaves the pending state. The gateway treats two pending registrations from one lane as one request, because the slug is not part of the dedupe identity.

Registration creates no installation and no credential.

Reply with the plan id, its release and install, and the plan-bytes approval reference.

## Not done

- No hosted QA run, installation, credential, or scanner or retrieval activation.
- Do not reuse `alloy-cert-sandbox` (`5bdc7c1e-…`).
