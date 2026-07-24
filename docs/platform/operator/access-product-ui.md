---
owner: operator
status: active
last_reviewed: 2026-07-23
supersedes: []
---

# Access product UI

UI-only product realization for Organization **Access** (`/settings/users-roles`).

This document freezes the operator experience so a later implementation sprint can bind identity,
authentication, authorization, audit, session, and provider capabilities **without redesigning the UI**.

It does **not** redefine canonical identity or authorization doctrine. Server authorization remains
authoritative; UI visibility is presentation only.

## Sprint scope

**In scope**

- Compact grouped-configuration landings (Financials, Programs & Locations, Access)
- Access information architecture: Users · Roles · Access Scopes · Security
- Collection → Selected object → Focused workspace
- Presentation ViewModels and Planned / Unavailable states
- Wiring existing members, invite, role, scope, grants, and password-reset APIs

**Out of scope**

- Schema redesign
- New permission semantics or multi-role union changes
- SSO / MFA / sessions / audit pipeline implementation
- Person ↔ auth-user linking infrastructure
- Access Profiles as a new persisted object
- Fabricating successful behavior for Planned capabilities

## Landing simplification pattern

Grouped launcher pages use:

1. Application / Organization breadcrumb
2. Compact page title
3. Optional one-line helper
4. Launch grid immediately

They do **not** use conceptual KPI cards, philosophy cards, Organization/Location ownership framing
bars, or duplicated doctrine copy.

Shared primitives:

- `CompactGroupedLandingShell`
- `CompactConfigurationLauncher`

## Information architecture

```
Access
  Users
  Roles
  Access Scopes
  Security
```

### Operator definitions

| Concept | Meaning |
|--------|---------|
| User | A person who can sign in to Alloy |
| Role | What a user may do |
| Access Scope | Where a user may operate and which organizational records they may access |
| Security | How users authenticate and how accounts are protected |
| Person | Canonical human identity to which login access may be linked |

Roles do not own locations. Departments are not permission groups. Navigation visibility is not
authorization. Users and Persons are not the same record.

## Users

**Collection** → **Selected User** → **Focused workspace**

Tabs: Overview · Roles · Access · Security · History

Primary action: **Invite User** (dialog; not a permanent inline form).

Executable today: email + role invite (`POST /api/admin/users`), single-role replace, location /
department scope, password reset, remove from organization.

Planned: Person linking during invite, access-at-invite, Effective Access resolver, Preview Access,
MFA, sessions, History events, multi-role assignment.

## Roles

**Collection** → **Selected Role** → **Focused workspace**

Tabs: Overview · Permissions · Users · Experience Access · History

Permissions are grouped by business capability via the existing permission grid. Raw permission
keys are not primary operator labels.

**Experience Access** is a read-only projection of permission grants onto product areas. It is not
a second authorization system and is not persisted separately. Planned until a projection resolver
exists.

## Access Scopes

Consumes Locations (owned by Locations) and Departments (organization scope catalog). Does not
create a parallel Access Scope record or Access Profiles in this sprint.

## Security

Organization-level:

- Authentication (Password available; Google / Microsoft / SSO Planned)
- Sign-in Policies (Planned)
- Sessions (Planned)
- Audit Log (Planned organization-wide log; distinct from per-object History)

## History vs Audit Log

| Surface | Scope |
|--------|--------|
| User / Role **History** | Selected-object lifecycle |
| Security **Audit Log** | Organization-wide access/security events |

Both are UI-decided; event pipelines are deferred.

## Effective Access vs Experience Access

| Concept | Applies to | Nature |
|--------|------------|--------|
| Effective Access | User | Computed explanation of roles + location + department + account state |
| Experience Access | Role | Permission-derived projection onto product areas |

Neither replaces server authorization.

## Presentation contracts

`web/lib/access/accessPresentationContracts.ts` defines ViewModels such as:

`AccessLandingVm`, `UsersCollectionVm`, `UserAccessWorkspaceVm`, `UserOverviewVm`,
`EffectiveAccessVm`, `UserRolesVm`, `UserScopeVm`, `UserSecurityVm`, `UserHistoryVm`,
`RolesCollectionVm`, `RoleAccessWorkspaceVm`, `PermissionCatalogVm`, `RoleUsersVm`,
`ExperienceAccessVm`, `RoleHistoryVm`, `AuthenticationMethodsVm`, `AccessAuditLogVm`

## Capability status (summary)

| Area | Status |
|------|--------|
| Users/Roles collections and workspaces | Wired (existing APIs) |
| Invite (email + role) | Wired |
| Location / department scope | Wired |
| Password reset | Wired (org admin guard unchanged) |
| Grouped permissions editor | Wired |
| Effective Access, Experience Access, History, Audit Log | UI decided / Planned |
| MFA, Sessions, SSO, multi-role | Unsupported / Planned |
| Person ↔ User link | Unsupported / Planned |

Detailed classification: `.alloy-agent-evidence/access-ui-discovery/ACCESS-UI-DISCOVERY.md`

## Implementation-sprint dependencies

1. Effective-access resolver (role grants ∪ location ∪ department → operator statements)
2. Experience-access projection (grants → product-area levels)
3. User/Role history and org Audit Log event sources
4. Person search/link for invite
5. Multi-role assignment model (if product requires it) without silent scope changes
6. Account states beyond membership (suspend/disable/archive)
7. MFA, sessions, SSO provider configuration
8. Impact-preview counts for consequential changes
9. Preview Access (explanatory; not impersonation)

Do not claim these shipped until wired through server-authoritative paths.
