---
title: INTEGRATIONS_NEW_ORG_GRANT_ORPHANED_SEED
status: sprint
owner: integrations
raised_by: Access & Identity V2 — Business Process family convergence V2
---

# Every organization created since 2026-09-11 has an administrator who cannot manage Integrations

Found while running the Access locks for an unrelated slice. Recorded, not fixed: the repair is a
migration, and this slice was scoped to carry none.

## What is wrong

`20260912000000_integrations_permissions.sql` does three things. Two of them work.

1. It inserts `integrations.read` and `integrations.manage` into the catalog. ✅
2. It backfills both keys onto the `admin` role of every EXISTING organization. ✅
3. It defines `public.seed_integrations_role_grants(uuid)` to give new organizations the same two
   keys, under the comment *"New organizations, through the canonical seeding function."* ❌

**Nothing ever calls that function.** The org-creation path is
`orgs_seed_default_rbac` → `seed_default_rbac` → `seed_default_role_definitions`, and
`seed_integrations_role_grants` appears in exactly one other place in the entire migration tree: its
own `COMMENT ON FUNCTION`. It was written, commented, and orphaned in the same file.

So the backfill in step 2 is the only thing that ever granted these keys. An organization created
before that migration has them. An organization created after it does not, and nothing will ever
give them to it.

## How it is visible today

Two instruments in `web/tests/access` are red on `origin/staging` right now, and both are telling
the truth:

- `grantSeedEnumeration.test.ts` — the live seed's admin region enumerates 80 catalogued keys and
  the catalog holds 82.
- `live/newOrgBootstrapAndRevocation.live.test.ts` — *a new organization's administrator holds every
  catalogued capability*: **expected 81, received 79**, missing exactly `integrations.manage` and
  `integrations.read`. This one only runs where a live database is configured, which is why it can
  sit red without anyone tripping over it.

## What it is not

Not caused by the seed migrations that followed it. `integrations.*` is absent from the
`W12:ADMIN-GRANTS` region of all three later seeds — Forms (09-12), Processing (09-12) and
Operational Intelligence (09-15) — because the key never entered `seed_default_rbac`'s admin
enumeration in the first place. No later slice dropped it.

## The decision this needs from Integrations

The two enumeration sites are the actual question, and it is a product question, not a cleanup:

- **Fold the keys into `seed_default_rbac`'s admin region** and delete the orphan. One enumeration
  site, and `grantSeedEnumeration` goes green by construction.
- **Or wire `seed_integrations_role_grants` into the org-creation trigger** and keep it separate —
  in which case `grantSeedEnumeration` needs to learn that admin's default package is the union of
  several deliberately-enumerated regions rather than one. That lock currently assumes a single
  site, and its own comment explains why it refuses an exception list: *"An exception list on a
  completeness check is a list of the failures it has agreed not to see."* Teaching it about sibling
  enumerators must not become such a list.

Either repair needs a migration and a backfill for organizations created in the window. Neither
belongs to Access & Identity: the keys, the function and the decision are all Integrations'.
