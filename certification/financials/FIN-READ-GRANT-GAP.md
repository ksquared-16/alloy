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

---

## The same identity, the other half: `fin.write` (found 2026-09-13)

Mounting the Slice 6 payment-reallocation certification refused at the fixture, before any UI was
exercised:

```
ACTION_BLOCKED   Recording a payment requires fin.write.
```

Measured through the product's own surface — `/api/admin/rbac/grants?role_key=admin` — the role holds
`fin.read` (the repair above), `fin.adjust`, `fin.responsibility` and `fin.subsidy`, and **not**
`fin.write`.

**Why this one is not merely the next item on the backlog.** Moving a payment between charges is a
reversal under `fin.adjust` followed by an application under `fin.write`. This role holds the first
and not the second, so an administrator here can take money off the charge it was answering and has
no permitted way to place it anywhere — the obligation returns and the money stays unapplied. Holding
neither half is coherent; holding both is coherent; holding exactly the destructive half is the one
combination that loses money's placement.

The repair reuses this document's own reasoning and is
`supabase/migrations/20260913030000_admin_holds_financials_write.sql`, which carries the argument in
full. It was proven by replaying against real Postgres with the hosted condition reconstructed on one
tenant inside a rolled-back transaction: one org stranded before, none after, and a second apply
inserts nothing. `web/tests/access/financialsReadAuthorityCoherence.test.ts` states the invariant over
roles and takes both permission keys from the action definitions, so renaming either half moves the
lock rather than unbinding it.

**Still not done from this lane, for the reason stated above:** the grant reaches the deployed tenant
only by promoting that migration through the governed seam. Until it does, the mounted proofs that
need a receipt cannot run — the persistence scenarios, the certification script and the authorization
boundaries were certified without one.
