# Global search foundation (Phase 1 — V1 complete)

**Status:** V1 complete — inline header search with family clusters, restrained typography, AdminV2-only drawer open, search usable while drawer is open.  
**Not in scope:** BOS guidance, semantic/AI retrieval, document or communication content search.

## Product doctrine

| Surface | User intent | Examples |
|---------|-------------|----------|
| **Search** | User knows the record they want | Sophia Chen, North Campus, Family Inquiry – Chen |
| **BOS** | User wants operational guidance | Who should I call today? Families missing paperwork? |

Search and BOS remain separate. Phase 1 is **record lookup only** — no command palette / full-screen modal.

## UX (V1 closeout)

- Search stays **anchored in the AdminV2 header** (`GlobalSearchBox`).
- Focus/type → inline dropdown under the input.
- **⌘K** focuses the header input (does not open a modal).
- Keyboard: ↑↓ navigate, Enter open, Esc close (Esc in search does not dismiss the drawer).
- **Works while a drawer is open** — header search remains focusable; dropdown layers above the drawer; selecting a result **swaps** the open AdminV2 record in place (no stack push, no close/reopen flicker).
- Results grouped by **family cluster** when household/opportunity context is shared.
- Cluster header shows household, lead, and campus once as **muted typography** (non-clickable).
- **Household-aware child expansion:** searching a family name or matching any household member returns **all siblings** in that household (not just the first N direct field matches).
- Per-cluster cap (`12` children visible) shows **`+ X more children`** when a household exceeds the display cap — never silent drops within a cluster.
- Row hierarchy:
  - **Primary:** record name (e.g. `Alex Chen`, `Family Inquiry - Chen / North Campus` for leads)
  - **Secondary:** muted text — `Child · Chen Family · North Campus` or `Lead · North Campus`
  - **Status:** optional Bend Pine pill when meaningful
- **Visual restraint:** white dropdown, soft border/shadow, neutral hover/selected states — no blue accents; only status pills use color.
- **Household is not a standalone searchable/openable result** — context only on child, guardian, and lead rows or cluster header.
- Labels use **Lead** (never “Family lead”); status keys humanized (`tour_scheduled` → Tour Scheduled).

## Searchable / openable grains (V1)

| Group | Opens via AdminV2 drawer |
|-------|--------------------------|
| Children | Canonical **Person** when `person_id` exists; else opportunity or customer |
| Parents & guardians | **Person** |
| Leads | **Opportunity** |
| Campuses | **Location** |

Household (`customers`) is **context only** in V1.

## Drawer open contract

1. `resolveGlobalSearchOpenFromHit` → `launchGlobalRecordSearchOpen` with `open_entity_type` / `open_entity_id`.
2. **Never** open `customer_members` or `contacts` drawers.
3. `source: "global_search"` → `AdminDrawerContext.openDrawer` **replaces** the current drawer without pushing stack.
4. Outside-click dismiss ignores `[data-adminv2-global-search-box]` so search stays usable with drawer open.

## Location context (schema-safe)

**Do not use `customer_members.site_id`**.

| Grain | Path |
|-------|------|
| Child | `customer_id` → `customers` → `opportunities` → `locations` |
| Parent | `customer_persons` → customer path; optional `opportunity_persons` |
| Lead | Direct on opportunity row |

## API

`GET /api/admin/global-search?q=&limit=`

Returns `groups`, `clusters`, `results`. Groups: children, parents, leads, locations — **no households group**.

## Key files

| Path | Role |
|------|------|
| `web/app/adminV2/components/GlobalSearchBox.tsx` | Inline search + restrained UI |
| `web/app/adminV2/components/GlobalSearchResultPills.tsx` | Status-only pill |
| `web/lib/admin/globalSearch/globalRecordSearchHouseholdChildren.ts` | Household name + sibling child expansion |
| `web/lib/admin/globalSearch/globalRecordSearchClusterLimits.ts` | Per-cluster overflow (`+ X more`) |
| `web/lib/adminV2/drawerOutsideClick.ts` | Ignores global search for drawer dismiss |
| `web/contexts/AdminDrawerContext.tsx` | In-place swap for `global_search` source |
| `web/lib/adminV2/globalRecordSearchOpen.ts` | Event bridge + z-index constant |

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/globalSearch/globalRecordSearch.test.ts
```

## Future (post-V1)

- Standalone household search/open when customer drawer UX is ready
- BOS / semantic / document / comms content search
- Jobs, invoices, payments
