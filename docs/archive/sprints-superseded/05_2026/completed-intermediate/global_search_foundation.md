# Global Search V1 — Foundation & Closeout

**Path:** `docs/sprints/05_2026/global_search_foundation.md`  
**Status:** **COMPLETE** (May 2026) — Global Search V1 is shipped and operational in AdminV2.  
**Phase 2 candidates:** [global_search_phase2_candidates.md](./global_search_phase2_candidates.md)

---

## V1 Closeout

### Objective

Create a fast, permission-aware global search experience for AdminV2 that allows operators to locate and navigate directly to records from anywhere in the system.

### What shipped

#### Search UX

- Inline header search (no command palette / full-screen modal)
- Search remains usable while AdminV2 drawers are open
- Keyboard support:
  - **⌘K / Ctrl+K** — focus header search
  - **↑ / ↓** — navigate results
  - **Enter** — open selected record
  - **Escape** — dismiss search dropdown (does not close the drawer)
- Inline dropdown results under the header input
- Drawer **swap-in-place** behavior — selecting a result replaces the open record without stacking drawers

#### Search scope

| Group | Grain | Opens via AdminV2 drawer |
|-------|-------|--------------------------|
| **Children** | `customer_members` / linked `persons` | Canonical **Person** when `person_id` exists; else opportunity or customer |
| **Parents / guardians** | `persons` via `customer_persons` | **Person** |
| **Leads** | `opportunities` | **Opportunity** |
| **Campuses / locations** | `locations` (site type) | **Location** |

Household (`customers`) is **context only** — not a standalone searchable or openable result in V1.

#### Permission model

- **Organization scoped** — all queries scoped by `org_id`
- **Site / location scoped** — restricted admins see only records at allowed campuses
- **Department scoped** — record scope constraints applied where configured
- **No visibility into unauthorized records** — hits filtered before presentation; no leakage via household expansion

#### Search result presentation

- **Family / household clustering** — shared customer + opportunity context groups into card clusters
- **Household context retained** without exposing household as an openable row (header typography only)
- **Human-readable statuses** — status keys humanized (`tour_scheduled` → Tour Scheduled)
- **Child age context** — secondary line includes compact age when DOB available (e.g. `Child · 4y 2mo · South Campus`); omitted when unavailable
- **Lead labels** — short configured / household token (e.g. `Mitchell`), never “Family Lead” or “Family inquiry” boilerplate; fallback `Lead: {name}`
- **Typography-first design** — type, household, location, and age via muted secondary text
- **Status-only color treatment** — Bend Pine pill for status; neutral hover/selection elsewhere
- **Card-based cluster layout** — bordered cluster containers with attached non-clickable headers

#### Navigation behavior

- **AdminV2 drawer only** — no legacy drawer fallback
- **Canonical record resolution** — child hits resolve to Person when `person_id` exists
- **Child → canonical Person** when available; never open `customer_members` or `contacts` drawers
- **Search usable while drawer is open** — outside-click dismiss ignores `[data-adminv2-global-search-box]`; dropdown layers above drawer chrome
- **Record replacement** — `source: "global_search"` triggers in-place drawer swap via `AdminDrawerContext`, not stack push

#### Search completeness

- **Household expansion** — matching a household name or any member can surface the full household context
- **Multi-child household support** — all siblings returned, not just first N direct field matches
- **Sibling expansion** — `expandGlobalSearchChildMemberRows` merges direct matches with full household child set
- **Mitchell household validation** — integration test confirms all four Mitchell children return on last-name search
- **Cluster limits with overflow** — max 12 children visible per cluster; `+ X more children` when exceeded (no silent drops)

### Architecture: Search is not BOS

Global Search is **deterministic record retrieval**.

**Purpose:**

- Find records
- Open records
- Navigate quickly

**Global Search does NOT:**

- Perform semantic search
- Search messages
- Search documents
- Search workflows
- Execute actions
- Act as an AI assistant

Those belong to future **BOS** experiences. Search and BOS remain separate surfaces with different user intent.

| Surface | User intent | Examples |
|---------|-------------|----------|
| **Search** | User knows the record they want | Sophia Chen, Mitchell, North Campus |
| **BOS** | User wants operational guidance | Who should I call today? Families missing paperwork? |

### Lessons learned

- **Search exposed canonical record ownership issues** — child hits needed explicit Person resolution; member/contact drawers were wrong targets.
- **Search exposed legacy drawer dependencies** — V1 required AdminV2-only open paths and removal of legacy fallback behavior.
- **Search required permission-aware routing** — site and department scope had to filter at the service layer, including household expansion paths.
- **Search validated AdminV2 drawer architecture** — in-place swap, z-index layering, and outside-click ignore patterns proved necessary for drawer-safe search.
- **Search benefited from family clustering** rather than flat record lists — operators think in households; cluster headers reduce repetition.
- **Search completeness matters more than advanced ranking in V1** — returning all Mitchell siblings correctly beat fuzzy matching or relevance scoring for operator trust.

---

## Implementation reference (historical)

Phase 1 was **record lookup only** — inline header search with family clusters, restrained typography, AdminV2-only drawer open, and search usable while a drawer is open.

### UX details

- Search anchored in the AdminV2 header (`GlobalSearchBox`).
- Focus/type → inline dropdown under the input.
- Per-cluster cap (`12` children visible) shows **`+ X more children`** when a household exceeds the display cap.
- Row hierarchy:
  - **Primary:** record name — children use member/person name; leads use short configured label (e.g. `Mitchell`)
  - **Secondary:** muted text — `Child · 4y 2mo · Chen Family · North Campus` or `Lead · North Campus`
  - **Status:** optional Bend Pine pill when meaningful
- Visual restraint: white dropdown, soft border/shadow, neutral hover/selected states — no blue accents.

### Drawer open contract

1. `resolveGlobalSearchOpenFromHit` → `launchGlobalRecordSearchOpen` with `open_entity_type` / `open_entity_id`.
2. **Never** open `customer_members` or `contacts` drawers.
3. `source: "global_search"` → `AdminDrawerContext.openDrawer` **replaces** the current drawer without pushing stack.
4. Outside-click dismiss ignores `[data-adminv2-global-search-box]`.

### Location context (schema-safe)

**Do not use `customer_members.site_id`**.

| Grain | Path |
|-------|------|
| Child | `customer_id` → `customers` → `opportunities` → `locations` |
| Parent | `customer_persons` → customer path; optional `opportunity_persons` |
| Lead | Direct on opportunity row |

### API

`GET /api/admin/global-search?q=&limit=`

Returns `groups`, `clusters`, `results`. Groups: children, parents, leads, locations — **no households group**.

### Key files

| Path | Role |
|------|------|
| `web/app/adminV2/components/GlobalSearchBox.tsx` | Inline search + restrained UI |
| `web/app/adminV2/components/GlobalSearchResultPills.tsx` | Status-only pill |
| `web/app/api/admin/global-search/route.ts` | Admin API route |
| `web/lib/admin/globalSearch/globalRecordSearchService.ts` | Org-scoped search orchestration |
| `web/lib/admin/globalSearch/globalRecordSearchClustering.ts` | Family cluster assembly |
| `web/lib/admin/globalSearch/globalRecordSearchAgeLabel.ts` | Child age secondary (`4y 2mo`) from DOB |
| `web/lib/admin/globalSearch/globalRecordSearchResultPresentation.ts` | Typography lines; lead short name; no inquiry boilerplate |
| `web/lib/admin/globalSearch/globalRecordSearchHouseholdChildren.ts` | Household name + sibling child expansion |
| `web/lib/admin/globalSearch/globalRecordSearchClusterLimits.ts` | Per-cluster overflow (`+ X more`) |
| `web/lib/admin/globalSearch/globalRecordSearchDrawerTarget.ts` | Canonical AdminV2 drawer resolution |
| `web/lib/adminV2/drawerOutsideClick.ts` | Ignores global search for drawer dismiss |
| `web/contexts/AdminDrawerContext.tsx` | In-place swap for `global_search` source |
| `web/lib/adminV2/globalRecordSearchOpen.ts` | Event bridge + z-index constant |
| `web/tests/admin/globalSearch/globalRecordSearch.test.ts` | V1 regression suite (40 tests) |

### Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/globalSearch/globalRecordSearch.test.ts
```

---

## Deferred to Phase 2+

See [global_search_phase2_candidates.md](./global_search_phase2_candidates.md) for future enhancements. Global Search V1 is complete and operational without them.
