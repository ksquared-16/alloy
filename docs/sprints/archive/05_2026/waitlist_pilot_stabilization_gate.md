# Waitlist pilot stabilization gate (May 2026)

Browser QA gate for waitlist pilot — no new waitlist features, ranking, billing, or scheduling.

## Root-cause audit (11 items)

| # | Issue | Root cause | Fix |
|---|--------|------------|-----|
| 1 | Initial New Leads shows 8/23 | Bootstrap `primary_row_limit: "8"` hydrated inline rows and suppressed full fetch | Raise limit to `WORK_UNIT_QUEUE_ROWS_FETCH_MIN`; when pill count > inline rows, trigger background full fetch |
| 2 | Duplicate sections / wrong counts / lowercase | Mixed legacy cohort labels + expanded-by-default sections | Org-level `resolveWaitlistQueueSection`; default collapse all section keys on init |
| 3 | Location filter count ≠ rows | Header badge could show stale pill count while rows were site-scoped | Prefer loaded `queueItems.total` when available after site-scoped fetch |
| 4 | Drawer save doesn't refresh queue | OCM patch did not dispatch `adminv2:opportunity-updated` | Dispatch on placement scope field saves |
| 5 | Person drawer too generic | Config-driven `EntityDrawerOverview` with Person # and generic sections | `PersonDrawerCompactOverview`: name header, contact + employee cards |
| 6 | Back to Lead spins | Opportunity snapshot not always warm before person navigation | Continuous `putDrawerEntitySnapshot`; prefetch person on hover/focus |
| 7 | Children view action | Partial | View person/child buttons + prefetch |
| 8 | Settings locations UX | Legacy link, no search/archive/categories | Search, org categories panel, demo archive, remove full list link |
| 9 | Program/category doctrine | Partial | `orgProgramCategoryRegistry` in settings; waitlist sections use org keys |
| 10 | Legacy demo rows | Only `waitlist_demo_v1` cleanup existed | `legacyWaitlistDemoCleanup` + `dev:clean:legacy-waitlist-demo` (dry-run default) |
| 11 | KPI pill reload | Tab switch refetch + skeleton | Keep buffered rows on lane switch; bust cache on drawer mutation |

## Manual browser QA checklist

Run dev seed first:

```bash
cd web
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run dev:clean:waitlist-demo
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run dev:seed:waitlist-demo
npm run dev
```

### Queue load (#1, #11)

- [ ] Open Enrollment work unit → **New Leads** pill selected on first paint
- [ ] KPI count matches scrollable row count (e.g. 23 rows load/scroll, not 8)
- [ ] Switch KPI pills — no full skeleton when returning to a previously loaded pill
- [ ] After drawer edit (below), pill count and rows stay aligned

### Waitlist sections (#2, #9)

- [ ] **Waitlist** lane: one section per org category (Infant, Toddler, Preschool, Pre-K, Unspecified only if needed)
- [ ] Section headers are title case (never raw slugs like `toddler`)
- [ ] Sections **collapsed by default**; expand shows all rows in section
- [ ] Section `(N)` count matches visible rows when expanded (after filters)

### Location filter (#3)

- [ ] **North Campus** — only North candidate rows; KPI, section counts, and rows agree
- [ ] **South Campus** — same parity
- [ ] **All locations** — full set returns

### Drawer refresh (#4)

- [ ] Open opportunity → inquiry child → change **Site** or **Room/Cohort** → save
- [ ] Close drawer: row updates program/site; moves category bucket if category changed

### Person drawer (#5, #6, #7)

- [ ] Header shows **person name** (no prominent Person #)
- [ ] Contact + **Employee status** visible without scrolling
- [ ] Opportunity → View person opens quickly; **Back to Lead** restores opportunity without spinner
- [ ] Inquiry children show **View person** / **View child**

### Settings → Locations (#8)

- [ ] Page loads without crash
- [ ] No “Full location list” button
- [ ] Search filters tree
- [ ] Org program categories panel visible
- [ ] Demo location **Archive demo** works (deactivates only demo-tagged/legacy-named rows)

### Demo cleanup (#10)

```bash
ORG_ID=... DRY_RUN=1 npm run dev:clean:legacy-waitlist-demo
# review report; then:
ORG_ID=... LEGACY_WAITLIST_APPLY=1 npm run dev:clean:legacy-waitlist-demo
```

- [ ] Dry-run lists legacy Placement/Waitlist Demo rows without deleting real records

## Automated validation

```bash
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:demo
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:v2
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:priority-facts
npm run test -- tests/orchestration/placement tests/admin/personEmployeePlacementFields.test.ts
npm run test -- tests/adminV2/workUnitBootstrapInlineQueueCompleteness.test.ts tests/admin/personDrawerCompactOverview.test.ts
npx tsc --noEmit
```
