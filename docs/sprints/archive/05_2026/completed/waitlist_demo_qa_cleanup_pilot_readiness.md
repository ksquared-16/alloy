# Waitlist Demo QA Cleanup / Pilot Readiness

Sprint doc for browser-QA fixes (no new waitlist features).

## Card 0 — Root causes

| # | Issue | Root cause | Fix |
|---|--------|------------|-----|
| 1 | Settings locations crash | `LocationsHierarchySettingsClient` uses `useAdminDrawer()` but settings layout lacked `AdminDrawerProvider` | Added provider + `AdminEntityDrawer` to settings client providers |
| 2–3 | Duplicate Infant sections; count mismatch | Mixed section keys: V2 rows used `cohortKey` while V1/legacy used label-only `groupLabel`; `workUnitSectionKey` treated them as different buckets. Sections also defaulted collapsed | Unified section keys via `resolveWaitlistQueueSection`; sections expanded by default |
| 4 | “Program waitlist” label | Fallback in `formatPlacementWaitlistSectionLabel` | Replaced with “Unspecified category waitlist” |
| 5 | Demo names in UI | Seed created “Waitlist Demo — …” sites and “Waitlist demo — {Family}” opportunities | Reseed uses shared `site_north_campus` / `site_south_campus`; opportunity names `{Family} Family` |
| 6 | Location filter wrong | `applyRecordScopeConstraintsToQuery` filtered `location_id` on `placement_candidates` (uses `site_id`) | Candidate-grain filter on `site_id` with opportunity `location_id` fallback |
| 7 | Person drawer spread-out | Profile included editable `status_key` and mixed contact fields | Compact Profile / Contact / Employee / Relationships sections |
| 8 | Back from Person reloads | Person fetch overwrote `data`; goBack skipped fetch but left person payload | `drawerEntitySnapshotCache` restores cached entity on stack back |
| 9 | Inquiry children View unclear | Generic “View” label | “View person” / “View child” |
| 10 | Queue date unclear | Bare wait-since date in meta chips | “Waitlisted since {date}” |
| 11 | KPI pill reload | Tab change used `force: !sameQueue` (cache bust) and cleared row buffer | Use cached prefetch (`force: false`); preserve buffer during lane switch |

## Program/category vs location hierarchy (doctrine)

Waitlist grouping follows a **two-layer model**:

| Layer | Scope | Examples | Used for |
|-------|--------|----------|----------|
| **Program/category** | Org-level | Infant, Toddler, Preschool, Pre-K | Waitlist **section headers**, cross-site reporting, priority sort partitions |
| **Site/campus** | Location-level | North Campus, South Campus, West Campus | **Which candidates appear** when header location filter is set (`placement_candidates.site_id`, opportunity `location_id` fallback) |
| **Classroom/room** | Location-level (under site) | North → Toddler A, Toddler B; South → Toddler Room | Future capacity, rates, assignment — **not** waitlist section keys |

**Rules implemented in code:**

- `resolveOrgProgramCategoryForWaitlist()` (`web/lib/orchestration/placement/orgProgramCategory.ts`) maps stored cohort keys/labels and room names to org categories.
- `resolveWaitlistQueueSection()` uses org category for **one stable section key per category** across sites.
- Location filter (`applyWaitlistCandidateLocationScopeToQuery`) narrows **rows inside** category sections; it does not create per-site section headers.
- Row-level program context may still show detailed labels (e.g. `Preschool — 3–4 years`) — only section grouping is org-normalized.

**Explicitly not built:** rates, classroom assignment engine, site-scoped program catalog, billing.

## Category / location doctrine (Card 1.5 — prior)

- **Waitlist grouping** = program/category level (Infant, Toddler, Preschool) — not individual classroom.
- **Location hierarchy** = campus/site → classroom/room/unit (settings page + existing `locations`).
- No new scheduling, billing, capacity, or classroom-assignment engines in this sprint.

## Validation

```bash
cd web
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run dev:clean:waitlist-demo
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run dev:seed:waitlist-demo
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:demo
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:v2
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:priority-facts
npm run test -- tests/orchestration/placement tests/admin/personEmployeePlacementFields.test.ts tests/queues/candidateGrainWaitlistSiteScope.test.ts
```

Browser QA checklist: no duplicate waitlist sections; counts match expanded rows; location filter; person drawer polish; settings locations loads; no fake demo names; Williams multi-child split; manual adjustment; labeled queue dates; KPI switching feels cached.
