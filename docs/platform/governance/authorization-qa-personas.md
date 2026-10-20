---
owner: platform
status: proposed
last_reviewed: 2026-10-20
supersedes: []
---

# Authorization QA: governed hosted personas and fixtures

**Status: proposed.** This is the Q1 contract for a platform capability that certifies role, capability, scope,
relationship and tenant-isolation rules through **real hosted HTTP sessions** on staging. It is
platform QA infrastructure. It is not a Documents test harness, and it certifies nothing on its own:
each domain certifies itself *through* it.

Alloy stays the authority for roles, capabilities, subject relationships and authorization decisions.
The Vacilando toolkit only executes governed provisioning and sign-in.

## 1. Environment

| | |
|---|---|
| Target | `ALLOY_STAGING`. Alias `alloy_deployed_primary`; project `ikaxilmwmrmbagoidedu`; host `staging.workwithalloy.com` |
| Source of truth | `environment-identity.mjs` (toolkit, measured 2026-10-18), plus `/api/build-info` on the deployed host |
| Mutation authority | `OPERATOR_ONLY`. Every provisioning, fixture and teardown run is an operator-approved governed action. No standing grant. |
| Production | `ALLOY_PRODUCTION`, project `vslwnntzzgpnmrpjipat`, `UNREACHABLE`. Refused by identity. |

Each action must prove the backing project before it writes. It does this with `proveProjectBacking`, the existing deployed-restore gate.

## 2. Tenancy

- **QA orgs.** There are two dedicated synthetic organizations, **QA-A** (subjects) and **QA-B** (cross-organization target).
  - They are named `ZZ QA Authorization A` and `ZZ QA Authorization B`.
  - Their ids are frozen in the toolkit registry.
  - They are created once by a governed reconciliation. The `orgs` insert fires `seed_default_rbac`, so no default package is edited.
- **No real tenant.** Firefly and every other existing organization are never a QA target.
- **Retained, never active.** The orgs are retained permanently under platform-QA ownership. Between runs they hold **no** active persona grant, membership or fixture record.

## 3. Persona registry

The registry is frozen and code-reviewed, in the toolkit. Personas are created **only** through the canonical audited RPCs:
`create_role_definition_audited`, `replace_role_permission_grants`, `assign_member_role_audited`,
`replace_member_access_scope_audited` and `remove_member_access_audited`. They are executed by the QA org's
provisioning administrator, so the W-18 delegation ceiling and the audits apply exactly as they do for a human
administrator.

| Persona key | Org | Role key (custom) | Permission keys | Scope |
|---|---|---|---|---|
| `qa_authz_admin_a` | QA-A | `admin` (seeded) | (default admin package) | all. Provisioning actor only; no gate may rely on it. |
| `qa_authz_admin_b` | QA-B | `admin` (seeded) | (default admin package) | all. Provisions QA-B's cross-org target. |
| `qa_doc_reader` | QA-A | `qa_doc_reader` | `portal.access`, `documents.read` | all |
| `qa_no_docs` | QA-A | `qa_no_docs` | `portal.access`, `crm.customers.read` | all |
| `qa_processing_only` | QA-A | `qa_processing_only` | `portal.access`, `processing.operate` | all |
| `qa_ocr` | QA-A | `qa_ocr` | `portal.access`, `documents.read`, `processing.operate` | all |
| `qa_scoped_ops` | QA-A | `qa_scoped_ops` | `portal.access`, `documents.read`, `processing.operate`, `crm.customers.read` | department restricted to QA-A `D1`; site all |

**Identities.** Each persona has one persistent managed auth user, `qa-authz-<persona>@example.com`, carrying `managed_by:"alloy"`, `purpose:"qa-authz"` and the persona key. Every identity belongs to exactly one org. A second membership resolves to no access at all (`resolveAdminAccessCore`, W-22).

**The persona action must refuse:**
- a persona key not in the registry;
- any organization other than QA-A or QA-B;
- a custom persona whose role key is `owner`, `admin`, `ops` or `manager`, because those keys admit document reads by name;
- a second membership for any identity;
- a permission key outside the persona's registered set, or a change that exceeds the actor's own grants;
- any write to a user, role or package that is not a registered QA artifact;
- caller-supplied email, org, role, scope, URL, key or path.

## 4. Sessions

Each persona signs in as its own account through the existing magic-link mint. That is `admin.generateLink` plus `verifyOtp` inside the
trusted child process: the same mechanism as the current deployed restore, verified against identity in a fresh context.

Each session is written to its own key, `<authRoot>/deployed/alloy_staging_web/<persona>/storage-state.json`. This is not
impersonation of any other user; the session carries the persona's own token, so RLS and the application gates
evaluate the persona.

## 5. Fixtures

Every row carries `metadata.qa_run_id` and `external_source = "alloy_qa_fixture"`.

| Fixture | Org | Created by |
|---|---|---|
| Departments `D1`, `D2`; work units `WU1` (D1), `WU2` (D2) | QA-A | Product APIs as `qa_authz_admin_a` |
| Lead in `WU1` with an uploaded PDF (in scope); lead in `WU2` with an uploaded PDF (out of scope) | QA-A | `create_lead` action, then `/api/admin/documents/upload` |
| Unattached `.txt` intake document (OCR text and preview) | QA-A | `/api/admin/documents/upload?open_processing_case=true` |
| Vendors `V1`, `V2` | QA-A | **Registered reconciliation SQL.** No product create path exists. Ids use a reserved prefix enforced by `hosted-fixture-safety`. |
| A document attached to `V1` | QA-A | `/api/admin/documents/upload` (`entity_type=vendor`) |
| One opportunity document (cross-organization target) | QA-B | Product APIs as `qa_authz_admin_b` |

## 6. Lifecycle and cleanup

1. **Pre-run recovery.** The reset deletes every row in QA-A/B carrying any `qa_run_id`, removes their storage objects, revokes every persona's membership, scope and grants, and deactivates and empties the custom roles. This makes an aborted run recoverable by the next run.
2. **Assign.** Persona roles, grants, memberships and scope are created for **this run only**.
3. **Fixtures.** Seed and upload, all tagged with the run id.
4. **Certify.** Real HTTP requests from each persona's own session.
5. **Teardown.** Run on completion and on any handled failure. It is the same action as step 1.
6. **Zero-residue census.** A read-only census proves zero tagged rows, zero persona memberships and grants, zero active `qa_` roles and zero run storage objects. **That census is the cleanup proof.** The persistent orgs and auth users are retained, with nothing active on them.

## 7. Change sets and ownership

| Change set | Repository | Primary mutation lane | Notes |
|---|---|---|---|
| Persona registry, assign/revoke actions, QA-org and fixture reconciliations, per-persona session storage, tests | Vacilando toolkit (`repo_ba1db10d75b549cb`) | Placed by Vacilando: declared as a governed dependency from the Documents lane run | Promotion through `host.install_toolkit` |
| Fixture SQL for vendors and QA orgs, the hosted driver, censuses, this document | Alloy | Context `identity-access` (roles, access, capability) | Secondary read-only context: Documents, Developer Platform, Environments |

**Recertification triggers for this capability.** Recertify when any of these change:
- the persona registry;
- any governed QA action;
- `resolveAdminAccessCore` or the scope model;
- the deployed-target registry or `environment-identity.mjs`;
- `seed_default_rbac`.

A domain's own certification triggers stay its own.

## 8. Containment precondition (Q1.0, implemented)

The local-only fixtures run by `vac certify-fixture` refuse any database that is not on this machine.
`web/scripts/lib/localCertificationTarget.ts` is called by each fixture entry point before a client exists, and it
has no override flag. Hosted fixtures exist only as governed reconciliations.
