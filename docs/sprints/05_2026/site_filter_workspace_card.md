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

## Queue wiring (shipped polish)

| Piece | Role |
|-------|------|
| `workspace_site_id` query param | Parsed by work-unit queue routes; intersected with permission scope via **`resolveQueueRecordScopeConstraints`**. |
| Work-unit + department pages | Append param from **`useWorkspaceSiteFilter().selectedSiteId`**; cache keys include view-site fingerprint. |
| `QueueService` | Existing **`recordScopeConstraints.locationIds`** filter on `opportunities.location_id` — no schema change. |

Default (`selectedSiteId = null`) = all sites allowed by permission scope (unchanged corp behavior).

## Follow-up: layered location UX (not started)

Product direction after the first-pass site filter is fully wired: **site first**, then optional **room / age grouping** where the org configures it. The current header dropdown is intentionally minimal; do not build the second layer until site-scoped list/workspace fetches are complete.

## Remaining wiring (follow-up)

1. **KPI resolvers** and legacy opportunity-queue endpoints — same `workspace_site_id` pattern where site-scoped counts are shown.
2. **Optional:** persist header site selection in `sessionStorage` for reload continuity.

## Verification

- Multi-site restricted user: dropdown lists only allowed sites; default empty value shows all allowed behavior once wired.
- Single-site user: label appears; no dropdown.
- Non-workspace routes: no provider overhead beyond gate pathname check.
