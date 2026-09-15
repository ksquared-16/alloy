# ACCESS_ADMINISTRATIVE_SCOPE_DEBT

**Status:** OPEN — recorded by Director decision (5) of the Access Administration Split.
**Decision:** administrative scope was explicitly NOT built in this slice.

## What was decided

The Access Administration Split replaced `settings.users_roles` with four authorities:

| Authority | What it decides |
|---|---|
| `admin.users.*` | who is a member, and which roles they hold |
| `admin.roles.*` | what a role is, and which capabilities it grants |
| `admin.access_scope.write` | where a person may operate |
| `attendance.devices.manage` | which devices may record attendance |

A fifth concern was considered and deliberately deferred: **administrative scope** — bounding *which
people* an administrator may administer. Today the four authorities are organization-wide. A user
administrator may act on every member of the tenant, including administrators senior to them; there
is no notion of "may administer the Riverside site only."

This is unchanged from the umbrella, so the split neither widened nor narrowed it. Recording it here
because the split is the moment the gap became nameable: once the authorities are separate, the
question "over whom?" is the obvious next one, and its absence should not read as an oversight.

## The second, smaller half: taxonomy

`attendance.devices.manage` is filed nowhere in `web/lib/access/capabilityTaxonomy.ts` and renders in
the role editor's trailing **unmapped** area. The three `admin.*` rows were filed under *Users &
roles*, where the retired umbrella's row lived; the device authority was not, deliberately.

An operator asking *"who may register a kiosk"* looks under Attendance, not under Users & roles, and
there is no Attendance area because no decision has created one. Filing it under Users & roles to
avoid an unmapped row would be the "flattering name" that file's own header refuses, and `IA-R6`
forbids inventing product IA that no decision produced.

The row is still rendered and still grantable — unmapped means badly filed, not hidden. Giving it a
home is part of this debt's review.

## What would close it

A Director decision on (a) whether administrative scope is a capability, a scope dimension on the
existing access profile, or out of scope for the product; and (b) whether Attendance becomes an
operator-facing capability area, which would also give `attendance.read` and `attendance.record` a
home — both currently catalogued and enforced by nothing.
