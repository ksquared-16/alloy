# Priority 0 — Location save hang investigation

**Status:** Root cause confirmed; critical-path fix implemented.  
**Surface:** Locations Configuration Runtime → Edit location → Save location  
**Worktree:** `wt2-locations-config-runtime`

## Root cause

Not an optimistic-UI failure, duplicate PATCH, `revalidatePath` loop, or stuck server action.

**Primary:** `patchLocation` awaited a full org hierarchy GET (`/api/admin/locations?include_inactive=true&hierarchy=1`) after every successful PATCH. The panel’s “Saving…” state stayed true until **both** the PATCH and that list reload finished.

**Secondary (amplified post-save lag):** After `setRows`, effects re-fetched schedule patterns for every site, and the owned-concerns effect depended on the whole `selectedSite` object (so a new row identity after save re-ran tours + full members list). Those did not extend the spinner, but made the workspace feel stuck after save.

## Fix implemented

1. **`useLocationsConfigurationSettings.patchLocation`** — merge the PATCH response row into local `rows`. Only fall back to full `refreshLocations()` if the response lacks an `id`.
2. **`LocationsConfigurationPage` owned-concerns effect** — depend on `selectedSiteId` instead of `selectedSite`, so identity-field saves do not re-fetch tours/members.

## Remaining technical debt (deferred — platform / scale, not header/nav)

| Debt | Why deferred |
| --- | --- |
| `refreshSchedulePatterns` fans out one GET per site whenever `rows` changes | Broader data-loading redesign; not required to make Save trustworthy |
| Hierarchy GET still heavy for create / cold load / `admin-entity-saved` | Correct for full reload; out of scope for single-field save |
| Members endpoint used for access readiness is org-wide | Owned-concern readiness model; separate from mutation latency |
| No background reconcile after patch merge | Acceptable for allowlisted site fields; add soft reconcile later if hierarchy enrichment drifts |

## Classification

**In scope for this sprint:** yes — save trustworthiness blocks further UI certification.  
**Unrelated platform debt:** the N+1 schedule fanout and heavy members fetch remain; documented above, not fixed in this pass.
