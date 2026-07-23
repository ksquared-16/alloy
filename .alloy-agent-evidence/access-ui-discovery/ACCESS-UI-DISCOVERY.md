# Access Product UI — Discovery & Classification

UI-only rebuild of `/settings/users-roles` (Access product): Collection → Selected → Focused
Workspace, replacing the technical-tab `UsersRolesSettingsClient`. No schema changes, no new
auth semantics, no new mutation paths — every write reuses an existing API with its existing
guard (`requireUsersRolesManageAuth`, org `admin` check on password reset).

## Files touched

| File | Change |
|---|---|
| `web/app/adminV2/settings/users-roles/page.tsx` | Recognizes 4 sections (`users\|roles\|scopes\|security`) via `normalizeAccessWorkspaceChapter`; landing unchanged. |
| `web/components/adminV2/settings/access/AccessWorkspaceSurface.tsx` | New. Compact `ConfigurationContext` ("Access") + chapter tabs, `canManage` gate, routes to the 4 chapter pages. |
| `web/components/adminV2/settings/access/AccessUsersConfigurationPage.tsx` | New. Users collection + selected workspace (Overview/Roles/Access/Security/History) + Invite dialog. |
| `web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx` | New. Roles collection + selected workspace (Overview/Permissions/Users/Experience Access/History) + New Role dialog. |
| `web/components/adminV2/settings/access/AccessScopesPage.tsx` | New. Launch cards to Locations (owned) and Departments (owned; read-only count/list here). |
| `web/components/adminV2/settings/access/AccessSecurityPage.tsx` | New. Org-level security posture: Password available, everything else Planned. |
| `web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx` | Thin wrapper → `AccessWorkspaceSurface`. |
| `web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx` | **Deleted.** Legacy technical-tab client; nothing imports it anymore. |
| `web/lib/access/accessChapterRoutes.ts` | New. Chapter enum + href builder (`commercialChapterRoutes.ts` pattern). |
| `web/lib/access/accessPresentationContracts.ts` | New. Type-only VM stubs for Planned surfaces (see below). |
| `web/components/adminV2/settings/configurationRuntime/LocationMultiSelect.tsx` | Extended with optional label/copy props so Access can reuse it for Departments without saying "location" everywhere. No behavior change for existing callers (all props default to prior literal copy). |
| `web/tests/configRuntime/organizationDomainLandings.test.ts` | Updated Access assertions to 4 tiles / empty `summaryCards` (model itself was already updated ahead of this task). |
| `web/tests/adminV2/configurationRuntimeSettingsRollout.test.ts`, `configurationRuntimeFinalCleanup.test.ts`, `configurationRuntimeV1Final.test.ts` | Updated hard-coded expectations that locked the old `UsersRolesSettingsClient` / `SettingsConfigurationSurfaceShell` embedding, now pointing at `AccessWorkspaceSurface`. |
| `web/tests/access/accessProductUi.test.ts` | New. Landing model, chapter routing, permission-grid label hygiene, Planned-state hygiene. |

## API reuse (no new endpoints)

| UI action | Endpoint | Notes |
|---|---|---|
| Load members / departments / sites | `GET /api/admin/settings/users-roles/members` | Existing. Departments reused read-only in Access Scopes. |
| Invite user | `POST /api/admin/users` `{ email, role }` | Existing. |
| Change role | `PATCH /api/admin/users/[userId]/role` `{ role }` | Existing. Followed by `router.refresh()` (unchanged behavior from old client — keeps `AdminAuthProvider` roleKeys fresh). |
| Change access scope | `PATCH /api/admin/users/[userId]/access-scope` | Existing. Same payload shape as old client. |
| Remove user | `POST /api/admin/users/[userId]/remove` | Existing. Wired as the "More → Remove from organization" confirm action (previously unused by any UI). |
| Send password reset | `POST /api/admin/send-password-reset` `{ email }` | Existing. Server enforces org `admin` role — errors surface as-is; UI does not weaken or bypass this. |
| Role catalog | `GET/POST /api/admin/rbac/roles` | Existing. |
| Update role | `PATCH /api/admin/rbac/roles/[role_key]` | Existing. |
| Permission catalog | `GET /api/admin/rbac/permissions` | Existing. Used only for read/write hint text, never as the row label. |
| Grants | `GET/PUT /api/admin/rbac/grants?role_key=` | Existing. |

## Classification: Real vs Planned

| Surface | Status | Why |
|---|---|---|
| Users collection, invite, role assignment, location/department scope | **Real** | Backed 1:1 by existing APIs above. |
| Roles collection, permission grid (via `PERMISSION_GRID_ROWS`), grants | **Real** | Same grid/apply logic as the old client, reused verbatim (`applyGridRowSelection`, `levelFromGrantedKeys`). |
| Access Scopes (Locations link, Departments read-only list) | **Real** (as a *pointer*) | Locations/Departments remain owned by their own product surfaces; this chapter does not duplicate their editors. |
| Password authentication + password reset | **Real** | Only supported auth method today; reset button calls the real endpoint. |
| "Active" badge on every user row / selected header | **Real, but degenerate** | There is no deactivation-without-removal concept in the schema today (`user_roles` delete = removal, not a status flag). Every row returned by `/members` is, by definition, a current member, so "Active" is truthful for 100% of rows — it is not a fabricated status field. Documented here so it isn't mistaken for a real toggle later. |
| Effective Access (Overview tab) | **Planned** | `EffectiveAccessVm` stub in `accessPresentationContracts.ts`. `access-scope` GET resolves scope *dimensions* only, not full permission-union resolution. Renders static "Computed effective access will appear here when available." — no request is made. |
| Experience Access (Roles tab) | **Planned** | `ExperienceAccessVm` stub. No API projects permission grants onto product surfaces (queues/drawers/actions) yet. |
| History (Users tab, Roles tab) | **Planned** | `UserHistoryVm` / `RoleHistoryVm` stubs. No event/audit table exists for account or role lifecycle yet. Copy explicitly states "No events are fabricated for display." |
| MFA, Sessions (Users → Security tab and org-level Security chapter) | **Planned** | No API. |
| Google / Microsoft / SSO sign-in (Security chapter) | **Planned** | No API; only `password` is a real `authenticationMethod` per `UserAccessWorkspaceVm`. |
| Sign-in Policies, Audit Log (Security chapter) | **Planned** | `AccessAuditLogVm` stub. No org-wide audit table exists. |

## Rules followed

- **UI-only.** No migrations, no new RLS, no new permission semantics. `canManage` gating reuses `canManageUsersAndRoles` exactly as before (org `admin` or `settings.users_roles`).
- **Planned ≠ fake fetch.** Every Planned card renders static copy with `data-capability="planned"`; none of them issue a network request to a non-existent endpoint.
- **Operator language.** Role select shows `role_label`; `role_key` only appears (a) in the New Role dialog's own technical-identifier field with an explicit "Technical identifier only" caption, and (b) in `data-testid`/`data-permission-row` attributes — never as primary visible text. `user_id` only appears in `data-testid` (`access-user-{id}`).
- **No "Restricted".** Access tab and collection rows always resolve to counts or exact names ("All locations" / "3 locations" / a single location's real name), never the internal `restricted` scope keyword.
- **Rail pattern parity.** Users/Roles collection rails reuse `locations-collection-rail*` / `programs-collection-controls*` CSS classes and `QUEUE_ROW_CARD_*` / `QUEUE_ROW_SELECTED_RAIL_CLASS` constants, matching `GlCodesConfigurationPage` (Financials) exactly rather than inventing new list-row styling.

## Known gaps / follow-ups (explicitly out of scope here)

1. No API to deactivate a user without removing them — "Active" badge cannot yet represent a false state. If a real deactivation flag ships, `UserAccessWorkspaceVm.isActive` should be wired to it and the badge should stop being unconditional.
2. `send-password-reset` requires org `admin` (stricter than `canManageUsersAndRoles`); a `settings.users_roles`-only grantee will see a real 403 surfaced as an error banner. Not weakened here — flagged for product decision only.
3. Multi-role-per-user is not supported by `PATCH .../role` (replaces all roles with one). The Roles-tab copy states this explicitly instead of implying multi-select.
