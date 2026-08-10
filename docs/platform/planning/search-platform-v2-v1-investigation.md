# Search V1 investigation — evidence

Base: `origin/staging` @ `0108c0005`. Read-only inspection checkout.

## 1. Current query API

`GET /api/admin/global-search?q=&limit=` — [route.ts](web/app/api/admin/global-search/route.ts)

- `requireAdminOrOps()` gate, then `getAdminContextCached()` (org), then
  `getAdminAccessContextCached()` → `scopeDimensionsFromAccess(access)`.
- `q` sanitized by `sanitizeCrmSearchToken` (strips `% _ , \ ( ) . "`, collapses
  whitespace, truncates to 64). Min length 2 unless the raw `q` is a UUID.
- `limit` clamped to `GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT = 48`.
- Emits an `[admin-timing]` warn when total > 250ms. **This is the only
  performance instrumentation that exists.**
- Single service call: `runGlobalRecordSearch`.

## 2. Supported subject types

Hardcoded to exactly four groups in `globalRecordSearchTypes.ts`:

| group | table | label (hardcoded) |
|---|---|---|
| `children` | `customer_members` | "Children" |
| `parents` | `persons` | "Parents & guardians" |
| `leads` | `opportunities` | "Leads" |
| `locations` | `locations` | "Campuses" |

`GLOBAL_RECORD_SEARCH_GROUP_LABELS` is a static childcare-specific map. Group
order is a static array. There is **no registry** — adding a subject type means
editing the union type, the label map, the order array, `runGlobalRecordSearch`,
the clustering module, and the drawer-target module.

## 3. Matching fields

All matching is `ilike '%token%'`. No trigram index, no full-text, no ranking function.

- children: `customer_members.display_name`, `.first_name`, `.last_name` — three
  separate parallel queries, merged into a `Map` by id.
- parents: `persons.full_name`, `.first_name`, `.last_name` — same three-query shape.
- leads: `opportunities.name`, `.title` via a single `.or(...)`.
- locations: `locations.label`, restricted to `location_type = 'site'` and active.

**Gap:** `searchParents` selects `email, phone` in its column list but never
matches on them. Email/phone are retrieved and unused. The mission requires them
as matching signals.

**Gap:** no household/`customers.name` matching — the doc comment says
"Household name is context-only in V1 — not a standalone result group." So
`Smith household` cannot resolve a household subject today.

**Gap:** no related-person matching (parent name → child), except indirectly via
`supplementChildrenFromHouseholdSeeds`, which back-fills children from the
households of already-matched parents/leads.

## 4. Ranking

**There is none.** Ordering is:
1. Fixed group order (`children`, `parents`, `leads`, `locations`).
2. Alphabetical by `name` within children/parents.
3. `created_at DESC` for leads; `label ASC` for locations.

No relevance score, no exact-match boost, no query-intent term handling. A query
of `Joe Smith schedule` sanitizes to the token `Joe Smith schedule` and is
`ilike '%Joe Smith schedule%'` against name columns → **zero results**. Intent
words actively break V1.

## 5. Navigation behavior

One destination per hit. `open_entity_type` / `open_entity_id` name an AdminV2
drawer target, resolved by `resolveGlobalSearchDrawerOpenTarget`.

- Legacy drawer types (`customer_members`, `contacts`) are explicitly banned
  (`GLOBAL_SEARCH_LEGACY_DRAWER_ENTITY_TYPES`) — consistent with "do not restore
  legacy drawer behavior."
- Child rows are re-pointed by `resolveGlobalSearchChildDrawerTarget`:
  person → opportunity → customer, first non-null wins.

**There is no multi-destination model.** The mission's critical UX law (expose
useful destinations on the initial result) has no V1 substrate at all. This is
the single largest structural addition V2 must make.

## 6. Permission / org / site filtering

Reuses the canonical access model — this is the strongest part of V1 and must be
retained.

- Every query filters `org_id`.
- persons: `fetchScopedPersonIdsForRestrictedAdmin` → allow-list intersect.
- opportunities: `resolveRecordScopeConstraints` + `applyRecordScopeConstraintsToQuery`;
  bails early on `scopeCons.impossible`.
- locations: filtered by `accessDim.allowedSiteLocationIds` both in-query and post-fetch.
- children: **no scope constraint at query time.** Scope is applied only
  post-assembly by `applySiteScopeToHit` using the resolved enrollment-context
  location. `globalSearchRecordAllowedBySiteScope` returns `false` when the
  location is absent, so it does fail closed — but the候 candidate row and its
  name were already fetched and materialized in process before the check.

Retention verdict: the *helpers* are canonical and reusable. The *pattern* of
"retrieve wide, filter after assembly" is what V2 must not carry forward.

## 7. Caches / indexes

- No search index, no projection table, no materialized view.
- `web/lib/adminV2/globalRecordSearchWarmPrefetch.ts` — client-side warm prefetch.
- `dispatchGlobalRecordSearchInvalidate.ts` — client cache invalidation event.
- Status label definitions fetched per request via `fetchEffectiveStatusDefinitions`
  for `persons` and `opportunities`.

## 8. UI

- `web/app/adminV2/components/GlobalSearchBox.tsx` (397 lines) — the input +
  results surface.
- `GlobalSearchResultPills.tsx` (19 lines) — meta pills.
- `web/components/adminV2/GlobalRecordSearchOpenListener.tsx` — open dispatch.
- Results are rendered as household **clusters** (`buildGlobalSearchFamilyClusters`)
  with anchors/children/parents and a `+ X more` overflow cap of 12.

The cluster model is genuinely good product thinking and is close to the
mission's "recognition context" idea. It is worth retaining conceptually.

## 9. Performance characteristics

Per request, worst case:
- 2 status-definition fetches (parallel).
- 4 subject searches (parallel), but internally:
  - children: 3 ilike queries + expansion + context fetch + **two separate
    `persons` queries for the same person id set** (`resolveChildAgeLabelsByMemberId`
    and `resolveChildPersonStatusKeyByPersonId` — a duplicated round trip).
  - parents: 3 ilike queries + `customer_persons` + `customer_members` +
    2 context fetches.
- then `supplementChildrenFromHouseholdSeeds` issues **another** member fetch and
  another full context/age/status resolution pass.

That is a real N+1-shaped fan-out that grows with result count, and the two
duplicate `persons` reads are pure waste. Confirmed by reading; not yet measured.

## 10. Tests

`web/tests/admin/globalSearch/globalRecordSearch.test.ts` — 1100 lines, the
largest artifact in the feature. Plus `globalRecordSearchWarmPrefetch.test.ts`.
Not yet read in detail.

## 11. Doctrine

No live doctrine owns Search. Only archived sprint records:
- `docs/sprints/archive/05_2026/completed/global_search_v1_closeout.md`
- `docs/sprints/archive/05_2026/later-phase/global_search_phase2_candidates.md`
- `docs/archive/sprints-superseded/05_2026/completed-intermediate/global_search_foundation.md`

**Search has no canonical owning doctrine page.** V2 must create one.

## 12–15. Verdict

**V1 is a foundation for retrieval, not for the V2 product.**

Retain:
- the access-scope helper reuse (`scopeDimensionsFromAccess`, `resolveRecordScopeConstraints`,
  `fetchScopedPersonIdsForRestrictedAdmin`, `applyRecordScopeConstraintsToQuery`)
- the legacy-drawer ban
- the household cluster/recognition instinct
- the route's sanitize/clamp/min-length hygiene

Refactor:
- retrieval into a subject-registry shape rather than four hardcoded functions
- scope enforcement to constrain *at query time* for every subject, not post-assembly
- the duplicated `persons` reads and the double child resolution pass

Add (no V1 substrate exists):
- query intent split (subject terms vs context terms)
- multi-destination resolution
- process participation via `process_instances`
- ranking with explanation

Delete only if provably obsolete: nothing yet proven obsolete.

---

# Platform substrate for V2 (the decisive findings)

## `process_instances` — the generic participation primitive

`supabase/migrations/20260713000000_process_instances.sql`

```
process_key   text  -- WHICH process (generic, tenant-configured)
subject_type  text  -- 'child' → customer_members.id
subject_id    uuid
context_type  text  -- 'opportunity'
context_id    uuid
stage_key     text
state         text
metadata      jsonb -- location_id, schedule_type, program_category_id, room cohort, start_date
```

Indexed `(org_id, subject_id)` and `(org_id, process_key, stage_key)`.

This is **exactly** the Case 4 answer: one subject, N process instances, no
hardcoded process names. The table comment states it is the generic primitive
and that it *replaces* `opportunity_customer_members` as the runtime owner of
child participation. V1's global search does not read it at all — it still reads
`opportunities` as "leads."

## Configured process labels — the lifecycle catalog

`LifecycleCatalogEntry` (`web/lib/lifecycle/lifecycleCatalogTypes.ts`) carries
`process_key`, `lifecycle_name` (the tenant-configured label), `department_id`,
`department_name`, and a `workspace` block including `user_has_access` and
`runtime_status`. Built server-side by `web/lib/lifecycle/lifecycleCatalog.ts`;
`business_process_revisions` holds the immutable published
`lifecycle_builder_v1` payload per `(org_id, department_id)`.

`process_key → lifecycle_name` is the tenant-configurable label edge. Search V2
resolves process display names through this and hardcodes nothing.

## Schedule is already at child grain

`schedule_assignments` (`20260625120000_childcare_operational_enrollment_slice1.sql`)
keys on `customer_member_id` + `schedule_pattern_id`, with
`status ∈ planned|active|ending|ended|superseded|canceled`.

Case 3 ("Smith schedule" must not collapse to household grain) is satisfiable
directly from canonical truth — the child grain is already the storage grain.

## Staff — no canonical model exists

There is **no** `staff`, `employees`, or `employment` table. Person-side org
membership is `user_profiles` / `user_roles` / `role_definitions` /
`user_site_access` / `user_department_access` / `user_access_profiles` — that is
the *access* model for application users, not an employment/person model.

Consequence for Case 5: there is no canonical link from a `persons` row to a
staff role or assigned locations. Per the mission's explicit instruction, V2
must **not** fabricate one. Case 5 will be certified to the degree the Person +
access model supports, with the canonical staff-model dependency documented as a
sequenced follow-up.
