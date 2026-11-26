---
owner: platform
status: canonical
last_reviewed: 2026-10-27
supersedes: []
---

# Roles and permissions

**Status:** Canonical (V1 as-built). Route-capability counts below remeasured 2026-10-27 at staging
`1492a2dd9` via `node web/scripts/checkRouteCapabilities.mjs`.

Capability (permission keys) vs visibility (department/site scope).

> This document distinguishes **the rule** from **what the code does today**. Where they differ, the
> gap is named with its workstream id rather than left for the reader to discover at a call site.
> A canonical document that states an unfollowed rule as an as-built fact is itself a defect
> (`M2-15`).

---

## Model — four layers

The canonical enumeration lives in code at `web/lib/admin/authorityLayers.ts` (W-62 / AD-25),
with a test that proves the mapping from physical store to conceptual layer is total in both
directions. The four layers are **Membership → Role → Capability → Scope**.

| Layer | Mechanism | As-built |
|-------|-----------|----------|
| **1. Membership / admission** | `user_roles` row existence — this user is admitted to this org | The row's existence is the membership fact; one physical store backs layers 1 and 2 |
| **2. Role** | `user_roles.role` → `role_definitions.role_key` | Portal shell requires `admin` or `ops` among the resolved role keys |
| **3. Capability** | `role_permission_grants` unioned into `permissionKeys` | Populated and correct. **Many admin routes never consult it** — see *Enforcement* |
| **4. Scope** | `user_access_profiles` + `user_department_access` / `user_site_access` | Resolved on every request; enforced only on routes that opt in. AD-25 is explicit that several physical scope tables do not make several conceptual layers |

> **A granted key is not necessarily an enforced key.** Roughly half the catalog is **inert** —
> keys no product source names on an executable line. They are listed in
> `web/lib/admin/unenforcedPermissionKeys.json`, and `web/lib/admin/permissionGrid.ts` renders
> **no control at all** for an inert row, so an organization cannot grant or withhold something
> the server never consults. Both directions are locked by
> `web/tests/access/permissionEnforcementTruth.test.ts`.
>
> **How much of the platform is actually capability-gated** is measured, not estimated:
> `web/scripts/routeCapabilities.declared.json` records every handler method as `declared`,
> `none` (reasoned — public token-scoped, signed webhook, stub) or `pending`, against a
> `max_pending` ratchet. Measured 2026-10-27 at staging `1492a2dd9` (**726** routes, **950**
> handlers): **531** `declared`, **106** `none`, **313** `pending` (of which **297** are
> program-owned against ceiling **297**, plus **16** inherited). Pending is no longer “the great
> majority.” The ratchet is tight by test — the suite fails if it could be lowered without
> producing a violation — so every conversion must lower it and none can be banked. Enforced in
> `prebuild` by `web/scripts/checkRouteCapabilities.mjs` and locked, non-vacuously, by
> `web/tests/access/routeCapabilityDeclaration.test.ts`.
>
> Prefer the declaration table over any frozen prose count when the two disagree. The table's own
> `reviewed` field may lag the tip; the live checker output is the measurement.

> **A membership is a set, but the write is still a replacement.** `permissionKeys` is the union
> of every role a person holds. `PATCH /api/admin/users/[userId]/role` nonetheless replaces every
> role row for the `(user, org)` pair with the one submitted, so changing a visible role destroys
> the rest of the union. `web/lib/access/memberRoleAssignment.ts` restores the union to the
> surface and names the roles a submission would discard; an additive write (W-17) is still open.

> **Four system roles are defined; only two were seeded with grants.** W-12 enumerated default
> grants for `admin` and `ops`. `school_director` and `regional_lead` carried an empty permission
> set across every domain until
> `supabase/migrations/20260909240000_financials_read_for_director_roles.sql` began repairing it —
> Financials was where the gap became visible, not where it started. Do not reason about those two
> roles from the four-layer model alone.

> **Surface visibility is a projection of capability, and now a checked one.** A surface declares
> the capability it presents (`web/lib/access/surfaceCapabilities.ts`), and the build fails if it
> gates on a capability its own routes do not declare
> (`web/tests/access/surfaceCapabilityDeclaration.test.ts`).

> **There is a second grant-resolution path.** `getAdminAccessContextCached` is server-only, so
> registered actions reachable from client components resolve grants through
> `web/lib/access/actorPermissionGrants.ts`. It reads the same tables and fails closed.

Per-record contextual checks (for example document access decisions) exist on some routes.
AD-25 deliberately does **not** treat them as a fifth authority layer.

`W-13` shipped in two parts, and this document recorded only the first. **Part one** (2026-08-18)
collapsed the fifth-layer grants: the two gates where `portalEligible` CONFERRED authority were
converted to `settings.users_roles` / `settings.users_roles.read`
(`supabase/migrations/20260818170000_w13_collapse_portal_eligible_fifth_layer_grants.sql`), and no
`portal.access` key was introduced — which is what the sentence here used to say, correctly, about
that half.

**Part two** (2026-09-11) took the last thing the role literal decided, which was ADMISSION itself.
`PORTAL_ROLES = {admin, ops}` is gone; portal admission now resolves the capability
**`portal.access`** (`supabase/migrations/20260911140000_w13_portal_access_capability_admission.sql`,
`web/lib/admin/portalAdmission.ts`). The migration is a preservation migration — `admin` and `ops`
receive the key, which is exactly the set the literal admitted — and it is ordered before the code
that stops honouring the literal.

`school_director` and `regional_lead` do **not** hold it. W-13 changed how admission is decided, not
which roles deserve it; that is decision `D2`
(`docs/platform/planning/access-identity-v2/d2-i10-role-composition-decision.md`), and it is open.

Admission is not authorization: `portal.access` confers nothing inside the portal, and `I-35`ᴮ
forbids any capability gate from accepting an admission predicate in place of its own key.

**Rule:** Role ≠ visibility. Check `permissionKeys` for capabilities; check the access profile for
data scope.

**A membership is a set.** `user_roles` is keyed on `(user_id, org_id, role)`, so a principal may
hold several role keys in one org and `permissionKeys` is their **union**. Any surface that renders
"the user's role" as a single value is collapsing that set.

**Role keys have one normal form** — trim + lowercase, applied at the resolver boundary
(`normalizeRoleKey`, `W-42`). Do not raw-compare a role key.

---

## Enforcement

- List routes: filter by org ∩ allowed departments/sites
- Mutations: re-assert scope on the target row
  - **Registered actions (as-built, BP V2 Slice 4A, 2026-10-21).** An action that writes at a site
    declares `authorizeSites`; `runRegisteredAction` — the one execution runtime every caller reaches
    (the execute route, the Command Runtime adapter, BOS, automation) — enforces it before eligibility,
    preview or execute, so a refused invocation runs no handler and writes nothing (403,
    `site_out_of_scope` / `site_unresolved`). Declared today by every operational-assignment command
    (`assignment.create`, `change_room`, `set_primary`, `archive`, `promote_proposed`, `delete_proposed`,
    `set_time`) and `schedule.create`; `app/api/admin/scheduling` POST, which executes `schedule.create`
    directly, applies the same check with the actor's real scope. Sites are read from authoritative
    rows (`web/lib/operationalAssignments/assignmentSiteAuthority.ts`): the touched assignment rows, the
    enrollment agreement for a committed child target (a supplied site is never trusted there), the
    supplied target for a proposed child or staff row, a staff primary change's live primaries, and a
    participation draft's enrollment site. Verdict = the Coverage doctrine
    ([`staff-coverage-authority.md`](staff-coverage-authority.md)): no scope = trusted internal path;
    unrestricted writes org-wide; restricted must hold EVERY touched site; unresolvable fails closed.
    Capability policy is unchanged — this enforces scope only.
- **Absent** access profile: **denies** (`restricted`, empty allow-lists).
  `ABSENT_PROFILE_ENFORCEMENT = "deny"` in `web/lib/admin/resolveAdminAccessCore.ts` (W-7 / I-19;
  shipped — see `#1501` / “absent scope denies”). The old transition default of legacy `all` scopes
  is **not** current enforcement.
- **Failed** access-profile read: **denies** (`restricted`, empty allow-lists) — `W-43`. Absence and
  failure are deliberately the same *verdict* (deny) and remain different *populations* in audit.

### Where a role's capabilities come from

`seed_default_rbac(org_id)` writes the default grants, and it runs from the `orgs_seed_default_rbac`
trigger on `public.orgs` — the grant half of what `orgs_seed_default_role_definitions` does for
roles. **Until 2026-09-10 it had no trigger and no caller**, so an organization created by any route
but the local seed had four roles and zero capabilities. Because admission is a role literal that
consults no grant (see layer 1), such an organization admitted its administrator to the portal and
refused them everywhere that checks a capability. Financials was the surface that reported it,
because it is the one that says so out loud rather than rendering an empty list.

| Role | Default package |
|---|---|
| `admin` | **every active catalog key.** The Organization Administrator contract, asserted inside the migration and by `web/tests/access/grantSeedEnumeration.test.ts` — a catalog key added without a place in the admin enumeration fails the repository lock |
| `ops` | the same, less nine keys, each withheld by the decision of the migration that introduced it |
| `school_director`, `regional_lead` | `fin.read` only — a known gap across the other ~65 keys, and an open product decision |

**Revocation is a `DELETE`**, not `allowed = false`. So an absent grant row means either "never
seeded" or "an administrator removed this", and nothing in the table distinguishes them. Any repair
that backfills grants must first establish which.

### What is not true yet

The rule above says capabilities are checked. **Many admin surfaces still gate on admission alone**
and never read `permissionKeys`, but that is no longer “most handlers”: as of the 2026-10-27
remeasurement, **531 of 950** handlers are `declared` and bind a capability. Per-route capability
requirements are recorded in the `W-14` declaration table, where each handler is `declared` (bound
to source by three joins), `none` (reasoned — public token-scoped routes, signed webhooks, stubs),
or `pending` (**313** remaining; **297** program-owned). Converting `pending` handlers is `W-15`,
and each conversion is a decision about who may act, not a refactor.

**Material enforcement seams reviewed in this refresh (not a redesign):**

- **Money-capable identity.** A login that holds a money-capable capability must be *nameable*
  (account name and/or linked person). Invariants and services:
  `web/lib/access/personLinkRequirement.ts`, `userPersonLinkService.ts`, migrations such as
  `20261122140000_money_capable_grant_requires_person_link.sql` / named-operator identity. A
  Person link is not a cacheable substitute for the account name rule (W7-F002).
- **Membership and access profile.** Membership writes that clear or require an access profile are
  enforced (absent profile denies — above). Invitation location restrictions write scope in one
  path (`inviteLocationAccess.ts`).
- **Medical / health visibility.** Sensitive document and health reads require `health.view` (and
  related medical gates) in addition to ordinary record access — see
  [`document-security-model.md`](document-security-model.md) and the Medical visibility work.
- **Documents.** Document byte/link/text access goes through `assertDocumentAccess`
  (`web/lib/documents/assertDocumentAccess.ts`); route declarations for Documents moved several
  handlers from `pending` to `declared` under existing `documents.*` / Processing keys.

**Grep when touching routes.** Do not infer from a neighbouring handler that a route is gated.
Declared ≠ enforced at every call site; pending ≠ ungated when a domain service holds the check.

---

## Key files

- `web/lib/admin/resolveAdminAccessCore.ts` — the enforcing resolver, the normal form, the absent-profile mode
- `web/lib/admin/resolveAdminPortalOrgCore.ts` — the light path's separate resolver
- `web/lib/admin/getAdminAccessContext.ts` — the cached bundle
- `web/lib/admin/adminRouteGate.ts` — `loadAdminRouteGate`, preferred at route entry
- `web/lib/admin/accessScope.ts` — scope enforcement helpers

**There is more than one resolver** (three, plus a light path), and they can disagree about the same
principal (`M2-13`). `W-41` reduces them to one; it needs decision `AD-12`.

---

## Expanded reference

Implementation-level detail: **[`../../../web/README_ADMIN_AUTH.md`](../../../web/README_ADMIN_AUTH.md)**.

Superseded background, retained for history and **not canonical**:
`docs/archive/2026-06-superseded-system/roles-and-permissions.md`.

---

## When to update

New permission keys, scope dimensions, or enforcement patterns — and whenever an item under
*What is not true yet* becomes true.
