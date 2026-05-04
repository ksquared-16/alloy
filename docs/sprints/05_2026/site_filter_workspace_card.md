# Card: Workspace site header filter (AdminV2)

## Goal

Users with **multiple allowed site locations** (`locations.location_type = site`) need a **header-level view filter**:

- Default: **all sites allowed by access scope** (no elevation — subset of permission).
- Selecting one site narrows workspace visibility to **scope ∩ selected site**.
- Single-site scoped users see a **label** only (no dropdown).
- Corporate **all / all** users see **All locations** plus every site in the org.

## Shipped in this pass (plumbing)

| Piece | Role |
|-------|------|
| `GET /api/admin/workspace/site-filter` | Returns `sites`, `site_scope`, `show_dropdown`, `single_site_label` from access context + org locations. |
| `WorkspaceSiteFilterProvider` + `WorkspaceSiteFilterGate` | Loads bootstrap once under `/adminV2/workspace/*`; holds `selectedSiteId` (`null` = all allowed). |
| `TopNavBar` | Renders dropdown or single-site label on workspace routes only. |

Selection is **client state only** until downstream routes read it.

## Remaining wiring (next PR)

1. **Pass `selectedSiteId` into data fetches** — department queue summaries, work-unit queues, KPI resolvers — either:
   - query param `workspace_site_id` on internal `fetch` calls, or
   - extend existing `RecordScopeConstraints` / `applyRecordScopeConstraintsToQuery` paths used by queue services.
2. **Invalidate caches** when selection changes (session cache keys for dept/work-unit pages).
3. **Optional:** persist selection in `sessionStorage` under a stable key for reload continuity.

## Verification

- Multi-site restricted user: dropdown lists only allowed sites; default empty value shows all allowed behavior once wired.
- Single-site user: label appears; no dropdown.
- Non-workspace routes: no provider overhead beyond gate pathname check.
