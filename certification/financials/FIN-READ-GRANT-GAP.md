# `fin.read` is enforced, defined, and granted to nobody who needs it

## Exact permission resolution

`assertFinancialsReadAllowed` (`web/lib/financials/financialsPermissions.ts`) enforces the key
`fin.read` through the org RBAC — `user_roles` → `role_permission_grants` via
`resolveActorPermissionGrants`. There is no parallel permission system, so a missing grant row is the
whole story.

Measured against the deployed tenant (org `93667019…`) through the authenticated slot-2 session:

| role | grants | `fin.*` held |
|---|---|---|
| `admin` | 52 | `fin.responsibility`, `fin.adjust`, `fin.subsidy` — **no `fin.read`, no `fin.write`** |
| `regional_lead` | 1 | `fin.read` |
| `school_director` | 1 | `fin.read` |
| `ops` | 7 | — |
| `assistant_director` | 0 | — |

The catalog defines all five: `fin.read`, `fin.write`, `fin.adjust`, `fin.subsidy`,
`fin.responsibility`.

## The anomaly worth fixing, separate from QA

**`admin` can adjust, subsidise and assign responsibility for money it cannot read.** Those three are
mutations; the base read is the one thing missing. `admin` also still carries the older
`billing.read` / `billing.write` pair, which suggests Financials moved to the `fin.*` family and the
admin grant set was never carried across with it.

This is not a QA-only problem: no operator holding `admin` can open Financials in this tenant.

## Why the governed grant did not fix it

`environment.assign_qa_identity_access` (`gar_1b184648796da6` → `tha_0ad773d7ea2f7b`) completed with:

```
status "already_exists"   mutated false   role "admin"   org_source "existing_membership"
```

It assigns **org membership**, not capabilities. The identity already had the membership, so it
correctly changed nothing. No governed action in this lane's catalog writes `role_permission_grants`
or assigns a role to a user — the closest keys are `environment.provision_qa_identity` and
`environment.assign_qa_identity_access`, and neither touches RBAC grants.

## Smallest paths, for whoever holds the authority

- **User-scoped (narrowest).** Assign the QA identity `school_director` or `regional_lead`. Each role
  holds **exactly one** permission — `fin.read` — so this grants that and nothing else, and touches
  only that user.
- **Fix the anomaly.** Grant `fin.read` to `admin`, which already holds three `fin.*` mutations. This
  adds no write authority, but it changes every admin in the org, so it is a product decision rather
  than a certification convenience.

Not done from this lane: writing deployed RBAC through the app's own admin API would route around the
governed seam that exists for privileged writes, and the narrow and broad options differ in blast
radius in a way that is the operator's call.
