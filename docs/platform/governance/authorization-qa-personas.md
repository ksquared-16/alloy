---
owner: platform
status: proposed
last_reviewed: 2026-10-22
supersedes: []
---

# Authorization QA: governed hosted personas and fixtures

**Status: proposed. Revision 2 (2026-10-22), awaiting Director approval.** Revision 1 (sha256 `734a502f…c51f9`)
is the contract the installed Vacilando `authz_q1` plan pins. Revision 2 adopts the approved **shared QA operating model**
(Shared QA Tenant Architecture V1, installed toolkit `95f887719db0`). It does not change a single authorization
refusal requirement. §10 lists every change.

This is the Q1 contract for a platform capability that certifies role, capability, scope,
relationship and tenant-isolation rules through **real hosted HTTP sessions** on staging. It is
platform QA infrastructure. It is not a Documents test harness, and it certifies nothing on its own:
each domain certifies itself *through* it.

Alloy stays the authority for roles, capabilities, subject relationships and authorization decisions.
The Vacilando toolkit only executes governed provisioning, sign-in, fixture reconciliation and closure, and only
from its frozen registries (`qa-plan-registry.mjs`, `reconciliation-registry.mjs`).

## 1. Environment

| | |
|---|---|
| Target | `ALLOY_STAGING`. Alias `alloy_deployed_primary`; project `ikaxilmwmrmbagoidedu`; host `staging.workwithalloy.com`; deployed target `alloy_staging_web` |
| Source of truth | `environment-identity.mjs` (toolkit, measured 2026-10-18), plus `/api/build-info` on the deployed host |
| Mutation authority | `OPERATOR_ONLY`. Every QA-run open, fixture reconciliation, close and census is an operator-approved governed action. No standing grant. |
| Production | `ALLOY_PRODUCTION`, project `vslwnntzzgpnmrpjipat`, `UNREACHABLE`. Refused by identity. |

Each run must re-prove the backing project at execution time against the governed registry before it writes, and
must pass the hosted QA activation gate. For `authz_q1` that gate covers the run stage, the deployed no-send guards and
`documents_revised_plan_contract_approved`.

## 2. Tenancy

- **QA Shared** (`qa_shared`, `4acc9386-c485-486f-aa1f-05d83499d142`, "ZZ Alloy QA") is the subject organization. It replaces Revision 1's dedicated QA-A.
- **QA Secondary** (`qa_secondary`, `ad53fee2-2570-460f-9300-f0e106c473b6`, "ZZ Alloy QA — Cross-Org") is only the cross-organization refusal target.
- Both are permanent, frozen in the toolkit registry, and owned by Vacilando shared QA. Other QA plans (for example `bp_v2`) also use QA Shared. Isolation between plans is by QA-run identity and leases (§5), not by organization.
- **Never a QA target:** Firefly (`93667019-bd28-49b5-a688-acc9bb1e0a19`), `DEV_QUEUE_ORG_ID` and every other tenant are refused by id.
- **Permanent QA structure** lives in QA Shared and is never deleted by a run: departments **D1** (`qa_d1`, `0704e72c-…`) and **D2** (`qa_d2`, `609d088b-…`). A scope restriction names their ids. Sites `qa_north` and `qa_south` also exist; Documents uses neither.

## 3. Persona registry

The registry is the toolkit's `authz_q1` plan. It is frozen and code-reviewed. Identities come from a fixed pool and are **leased** for one run.

| Contract persona | Plan persona | Org | Identity | Role key | Permission keys | Scope |
|---|---|---|---|---|---|---|
| provisioning administrator (QA Shared) | `fixture_admin` | QA Shared | `qa_shared_actor` (dedicated) | `admin` (seeded; permanent org actor) | (default admin package) | all. Fixtures only; no gate may rely on it. |
| cross-organization principal | `cross_org_admin` | QA Secondary | `qa_secondary_admin` (dedicated) | `admin` (seeded; permanent org actor) | (default admin package) | all. Cross-org target fixtures only. |
| document reader | `doc_reader` | QA Shared | pooled | `qa_doc_reader` | `portal.access`, `documents.read` | all |
| portal member without documents | `no_docs` | QA Shared | pooled | `qa_no_docs` | `portal.access`, `crm.customers.read` | all |
| processing-only operator | `processing_only` | QA Shared | pooled | `qa_processing_only` | `portal.access`, `processing.operate` | all |
| OCR-authorized operator | `ocr` | QA Shared | pooled | `qa_ocr` | `portal.access`, `documents.read`, `processing.operate` | all |
| department-restricted operator | `scoped_ops` | QA Shared | pooled | `qa_scoped_ops` | `portal.access`, `documents.read`, `processing.operate`, `crm.customers.read` | department **restricted to D1**; site all |

**Identities.** Seven reusable managed identities:
- **Two dedicated organization administrators.** `qa-shared-actor@example.com` and `qa-secondary-admin@example.com` hold `admin` permanently in exactly their own org. Each is the explicit actor of every audited access change in that org, so the W-18 delegation ceiling bounds the toolkit exactly as it bounds a human administrator.
- **Five pooled identities.** `qa-pool-01` … `qa-pool-05@example.com`, all in QA Shared. They hold **nothing** between runs. A run leases one per pooled persona, exclusively, for the run's life.

Every identity belongs to exactly one organization, forever, because a second membership resolves to no access at all (`resolveAdminAccessCore`, W-22). No Person record is created; each identity carries a display name.

Access is granted only through Alloy's canonical audited functions. Custom roles are created through
`create_role_definition_audited` and `replace_role_permission_grants`; memberships through `assign_member_role_audited`;
department scope through `replace_member_access_scope_audited`; removal through `remove_member_access_audited`.

**The QA-run actions must refuse (unchanged from Revision 1):**
- a persona key not in the registry;
- any organization other than QA Shared or QA Secondary;
- a custom persona whose role key is `owner`, `admin`, `ops` or `manager`. The registry's reserved list is a superset that also includes `regional_lead` and `school_director`, and every custom key must start `qa_`;
- a second membership for any identity;
- a permission key outside the persona's registered set, or a change that exceeds the actor's own grants;
- any write to a user, role or package that is not a registered QA artifact, including default role packages and ordinary users;
- caller-supplied email, org, role, scope, URL, key or path.

## 4. Sessions

Each session-bearing persona signs in as its own account through the existing magic-link mint, inside the trusted child
process, and is verified against identity in a fresh browser context. The session is isolated per run and persona at
`<authRoot>/qa-runs/<qa_run_id>/<persona>/storage-state.json`. This is not impersonation of any other user: the session
carries the persona's own token, so RLS and the application gates evaluate the persona. `qa_run_close` signs every
leased identity out everywhere and deletes the run's session directory.

## 5. Fixtures

**Isolation is by QA-run identity.** Every fixture row carries the run's `qa_run_id`. Registered SQL fixtures carry it in
`metadata.qa_run_id`, with `external_source = "alloy_qa_fixture"` and ids in the `aa000000-` namespace. Fixtures
created through product APIs carry it in their title. A run never touches another run's fixtures. Anything a run creates
in QA Shared or QA Secondary is a fixture: neither org holds non-QA data.

| Fixture | Org | Created by | Removed by |
|---|---|---|---|
| Vendors `V1`, `V2` | QA Shared | registered reconciliation `qa_authz_fixture_ensure` (installed) | `qa_authz_fixture_reset` (installed) |
| Department-linked subjects: work unit `WU1` in D1 and `WU2` in D2, each with one opportunity | QA Shared | registered reconciliation (**not yet registered**, see §9) | its registered reset |
| One uploaded PDF on the WU1 opportunity (in scope) and one on the WU2 opportunity (out of scope) | QA Shared | `/api/admin/documents/upload` as `fixture_admin` | `DELETE /api/admin/pos/documents/[id]` (row, object and case links, audited) |
| Unattached `.txt` intake document (OCR text and preview), opening a Processing case | QA Shared | `/api/admin/documents/upload?open_processing_case=true` | `DELETE /api/admin/pos/documents/[id]` (document, case, object) |
| A document attached to `V1` | QA Shared | `/api/admin/documents/upload` (`entity_type=vendor`) | `DELETE /api/admin/pos/documents/[id]`, **before** the vendor reset |
| One opportunity document (cross-organization target) | QA Secondary | registered subject reconciliation plus upload as `cross_org_admin` | `DELETE /api/admin/pos/documents/[id]` as `cross_org_admin`, then its reset |

Product-API fixtures exercise the real upload path. Synthetic data only; customer data is never a fixture.

## 6. Lifecycle and cleanup

1. **Pre-run recovery.** Close any abandoned `authz_q1` run (`qa_run_close` is idempotent and is the recovery), then run the registered resets. Recovery deletes product-API fixtures by their `qa_run_id` title tag.
2. **Open.** `environment.qa_run_open {plan: authz_q1, target: alloy_staging_web}` leases the pool. Through the audited functions it grants each persona exactly its registered roles and scope, then mints one verified session per persona.
3. **Fixtures.** The registered ensures run, then product-API uploads as `fixture_admin` and `cross_org_admin`.
4. **Certify.** Real HTTP requests from each persona's own session. The hosted driver reads only those sessions.
5. **Teardown,** on completion and on any handled failure. First, product-API documents are deleted through the audited POS delete. Then the registered resets run, and then `qa_run_close`.
6. **Run-scoped zero-residue census.** The plan's registered census, read-only and run **after** the close, is what lets the close verdict state `ZERO_RESIDUE`. It must prove zero for **all of the run's fixtures, grants, memberships and sessions, and every registered cleanup obligation**:
   - `aa000000-` / `alloy_qa_fixture` vendors and subjects;
   - `qa_*` role grants;
   - non-actor memberships in either QA org;
   - `documents` rows in either QA org;
   - storage objects under either QA org's `<org_id>/` prefix;
   - Processing cases in either QA org;
   - sent messages.

   A verdict short of that is `ACCESS_CLEAN_FIXTURE_RESIDUE_UNVERIFIED` and is not certification.

**Retained by design, reported as data and never as residue:**
- immutable audit history: `mutation_events` written by the audited access functions, and the D1a `workflow_events` audit rows (`document_link_issued`, `document_delete_authorized`, `document_uploaded`);
- the two permanent organizations and their structure;
- the seven identities, with no active temporary access;
- the actors' permanent `admin` memberships;
- emptied, inactive `qa_*` role definitions.

## 7. Change sets and ownership

| Change set | Repository | Primary mutation lane | Notes |
|---|---|---|---|
| Plan registry, QA-run open/close, sessions, reconciliation and census registration and pins | Vacilando toolkit (`repo_ba1db10d75b549cb`) | Backend (`lane_db3431e755a8`) | Installed: `95f887719db0` |
| Fixture SQL and runners, the zero-residue census SQL, the hosted Documents driver, this document | Alloy | Documents (`lane_aa660dc9554d`), context `identity-access` | Shared QA assets under `certification/qa-shared/` are re-pinned by Backend after Alloy merges |

**Recertification triggers for this capability.** Recertify when any of these change:
- the plan registry or reconciliation registry;
- any governed QA action;
- `resolveAdminAccessCore` or the scope model;
- the deployed-target registry or `environment-identity.mjs`;
- `seed_default_rbac`;
- any pinned fixture or census.

A domain's own certification triggers stay its own.

## 8. Containment precondition (Q1.0, implemented)

The local-only fixtures run by `vac certify-fixture` refuse any database that is not on this machine.
`web/scripts/lib/localCertificationTarget.ts` is called by each fixture entry point before a client exists, and it
has no override flag. Hosted fixtures exist only as governed reconciliations.

## 9. Activation readiness (measured against installed toolkit `95f887719db0`, Alloy staging `841becb4`)

| Requirement | Installed | Status |
|---|---|---|
| Plan `authz_q1`: orgs, five custom roles with exactly §3's grants, seven personas, `scoped_ops` restricted to `qa_d1`, `ZERO_RESIDUE` cleanup | yes | **matches** |
| QA-run open/close, per-persona sessions, sign-out on close, abandoned-run recovery | yes | **matches** |
| Vendor fixture ensure/reset (pins verified against staging: SQL `09271ccd…`/`35b38ce6…`, runners `8c34b643…`/`cc547008…`) | yes | **matches** |
| Department-linked subject fixtures (`WU1`/`WU2`, opportunities) in QA Shared, plus the QA Secondary subject | no | **missing.** An Alloy fixture plus a toolkit registration. |
| Residue census covering documents, storage objects and Processing cases | census `713325aa…` checks vendors, `qa_` grants, pool access and zero sent only | **insufficient.** Alloy census extension plus a toolkit re-pin. |
| Vendor reset ordering: no document can remain bound to a deleted vendor | reset deletes vendors only | covered by §6 teardown ordering, and proven by the extended census |
| Run-stage activation: `run` scope, no-send guard evidence, `documents_revised_plan_contract_approved` | gate open for `provisioning` and `org_ensure` only | **not opened** |
| Contract pin | `734a502f…` (Revision 1) | **re-pin to Revision 2 after approval** |

## 10. Revision 2 changes (from Revision 1)

1. QA-A is replaced by **QA Shared**; QA-B by **QA Secondary**, the cross-organization refusal target only (§2).
2. Identities: seven persistent per-persona `qa-authz-*` accounts become **five reusable pooled identities**, leased per run, plus **two dedicated organization administrators** as provisioning actors (§3).
3. D1/D2 become **permanent reusable QA structure** (§2), no longer per-run fixtures.
4. Fixtures are **isolated by QA-run identity**, not by a dedicated tenant (§5).
5. Zero-residue certification is **scoped to the run's fixtures, grants, sessions and registered cleanup obligations**, with the full fixture class list kept (§6).
6. Immutable audit history is **retained by design** and reported as data (§6).
7. Lifecycle steps are mapped to the installed governed actions (§6); session storage to the per-run path (§4).
8. **Unchanged:** every refusal requirement (§3), every persona's grants and scope, department scope, cross-organization isolation, storage-object authorization and removal, and the requirement that cleanup be *proven* rather than claimed.
