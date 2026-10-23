# Documents Q1 / D1a — hosted certification record

**Verdict: CERTIFIED.** Hosted authorization QA for Documents Q1 and D1a passed **90 of 90** scenarios. Each scenario ran
from a verified persona session on Alloy staging. The run closed **ZERO_RESIDUE**, and that verdict is bound to the
registered census.

## Provenance

| Item | Value |
|---|---|
| Deployed staging | `8bb731eadbf306d269f8249da127ed09289b7076` (`/api/build-info`), Supabase project `ikaxilmwmrmbagoidedu` (ALLOY_STAGING) |
| Canonical checkout / filing authority | `/Users/vacilando/Alloy` HEAD `8bb731ea` = `refs/remotes/origin/staging` |
| Vacilando toolkit | `43ce22941af3` |
| QA plan / run | `authz_q1` / `qar_99a8d9bf95e6`, opened by `gar_6aeb59d29695db`, target `alloy_staging_web` |
| Personas | 7 of 7 sessions verified to their exact identities (see the contract's §3 for the persona table) |
| Fixture ensures | vendor `gar_4923281f30ef82` (fixture `9d23cc63…`); subjects in QA Shared `gar_e73c4ff4d11e45` and QA Secondary `gar_d0d2bd20e353ab` (fixture `60c41d9b…`). Each was stamped and executed at `8bb731ea` |
| Walkthrough | `q1_hosted_authz_cert.py`; results in `q1_hosted_authz_cert_results.json` (90/90, 2026-10-23T00:50:37Z) |
| Product-API documents | 5 documents, tagged `qa-authz-qar_99a8d9bf95e6` (ids in `q1_hosted_fixture_ids.qar_99a8d9bf95e6.json`). All were deleted through the audited `DELETE /api/admin/pos/documents/[id]` |
| Fixture resets | subjects in QA Shared `gar_fbff7bac348b6a` and QA Secondary `gar_5a6544660162d7` (fixture `7aff2e38…`), then vendors `gar_16620192fde05b` (fixture `8c34f504…`). All ran at `8bb731ea` |
| Close | `gar_0b7aa2c9347628`. Access clean: 5 pool memberships removed, leaving 0 roles and 0 access profiles. 5 `qa_*` roles hold 0 grants. 7 identities signed out. Session directory deleted |
| Census | `gar_dd0218ef74eefe`. Registered `documents-zero-residue-census.sql` (`3be83854…`), run after the close at 2026-10-23T01:04:06Z: **12/12 zero**. Retained by design and not residue: 83 `mutation_events` rows and 27 D1a `workflow_events` rows |
| Binding | `gar_5635a56ddd194c`. The run is CLOSED / `ZERO_RESIDUE` |

## What was certified

All scenarios were real HTTP requests from each persona's own session.

- **Signed links (35).**
  - `doc_reader`, `ocr` and `fixture_admin` reach all four QA Shared documents.
  - `no_docs` and `processing_only` are refused with 403 `INSUFFICIENT_ROLE` before the row is read.
  - `scoped_ops` (restricted to D1) reaches only the D1 document. The D2, vendor and unattached intake documents return 404 `NOT_FOUND`.
- **Cross-organization.**
  - `cross_org_admin` reaches only its own organization's document. Every QA Shared document, vendor link and delete returns 404.
  - Every QA Shared persona gets 404 for the QA Secondary document.
- **Lists.** The general list is filtered to exactly each persona's scope. The Processing list requires `processing.documents.manage`, and neither admin sees the other organization's documents.
- **OCR text and source preview.** Extracted text requires `processing.operate` plus document read: only `ocr` gets it. Source preview requires document read, and scope gives 404.
- **Vendor-bound links.** A link is issued only for that vendor's own document, in the vendor's own organization.
- **Writes.** Upload and entity options require `documents.write`; refused uploads store nothing. Deletes require `processing.documents.manage` in the caller's own organization. Refused deletes change nothing.
- **Non-disclosure.** Unknown and malformed ids return 404. Every route refuses an unauthenticated caller with 401.

## Contract drift: approved `a1ad543a…` versus staging `c3707ff7…`

**Classification: explanatory only. No authorization requirement changed.**

The only difference is four lines added to §3 of `docs/platform/governance/authorization-qa-personas.md` by
`154f6bcbc` ("fix(access): clear access profile on audited membership removal"):

> `remove_member_access_audited` ends the `(user, org)` membership: it deletes `user_roles` **and**
> `user_access_profiles` (site/department junctions cascade). A role-less residual profile is reusable
> scope and is not a clean close — pool-access censuses count profiles as residue. Audit history of
> prior roles and scopes is retained in `mutation_events`.

The lines change no persona, role key, permission key, scope, refusal, fixture or census check. They describe what the
already-named removal function does after that commit's migration. That behaviour is a stricter cleanup invariant, and
this certification measured it holding on staging: the close reported `remaining_profiles: 0` for every pool identity,
and the census `doc_zr_pool_access` check was zero.

The toolkit pin (`qa-plan-registry.mjs`, `authz_q1.contract.sha256` and the
`documents_revised_plan_contract_approved` evidence) still names `a1ad543a…`. It is not compared to the checkout when a
run opens, so it blocked nothing.

**Recommended reconciliation.** This is the smallest governed change, and it is not performed here:
1. The Director approves the staging bytes `c3707ff7…` as Revision 2 with the clarification. No other change is involved.
2. Vacilando Backend re-pins `contract.sha256` and the approval evidence's `contract_sha256` / `approval_ref` in the
   toolkit registry to `c3707ff7…`, citing that approval, and ships it through the normal release and install.

Until then, the approved pin remains `a1ad543a…`. No re-test is needed, because no authorization requirement changed.
