# Global search foundation (Phase 1)

**Status:** Shipped MVP — deterministic record lookup from AdminV2 header.  
**Not in scope:** BOS guidance, semantic/AI retrieval, document or communication content search.

## Product doctrine

| Surface | User intent | Examples |
|---------|-------------|----------|
| **Search** | User knows the record they want | Sophia Chen, North Campus, Family Inquiry – Chen, Invoice 1023 |
| **BOS** | User wants operational guidance | Who should I call today? Families missing paperwork? |

Search and BOS remain separate. Phase 1 is **record lookup only**.

## Architecture audit (May 2026)

### Existing assets reused

| Concern | Existing module | Global search usage |
|---------|-----------------|---------------------|
| Header chrome | `TopNavBar.tsx` | Search trigger + `GlobalSearchModal` |
| CRM text search | `crmEntitySearchShared.ts` | Token sanitization, person label helper |
| Person role badges | `resolvePersonDrawerProfile.ts` | Person hit `type_label` (Child, Guardian, …) |
| Opportunity scope | `accessScope.ts`, `resolveRecordScopeConstraints` | Org/dept/site-filtered opportunity matches |
| Person/customer scope | `fetchScopedPersonIdsForRestrictedAdmin`, `fetchScopedCustomerIdsForRestrictedAdmin` | Restricted-admin result filtering |
| Location labels | `locationDisplayLabel.ts` | Campus/site secondary context |
| Status labels | `fetchEffectiveStatusDefinitions` | Hit `status_label` |
| Drawer open | `AdminDrawerContext.openDrawer` | Via `GlobalRecordSearchOpenListener` + event bridge |
| Prior art (forms) | `GET /api/admin/forms/crm-entity-search` | Per-entity ilike patterns — **not** merged; global search adds unified API + enrichment |

### Intentionally not reused

- **`GET /api/admin/ai/task-assist/entity-search`** — BOS/Task Assist path; fuzzy variants and customer→opp bridge belong to assist, not universal search.
- **Queue row search** — Work-unit filter bars search within loaded queue slices only.

### New modules

| Path | Role |
|------|------|
| `web/lib/admin/globalSearch/globalRecordSearchService.ts` | Parallel org-scoped queries + merge |
| `web/app/api/admin/global-search/route.ts` | Admin+ops GET API |
| `web/app/adminV2/components/GlobalSearchModal.tsx` | Command-palette UI (debounced fetch, keyboard) |
| `web/lib/adminV2/globalRecordSearchOpen.ts` | Event + sessionStorage bridge (TopNavBar sits outside `AdminDrawerProvider`) |
| `web/components/adminV2/GlobalRecordSearchOpenListener.tsx` | Opens drawer with `source: "global_search"` |

## Phase 1 scope

**Entity types:** people (`persons`), leads (`opportunities`), households (`customers`), campuses (`locations` where `location_type = site`).

**Result shape:**

```json
{
  "entity_type": "persons",
  "entity_id": "uuid",
  "name": "Sophia Chen",
  "type_label": "Child",
  "secondary_context": "North Campus",
  "status_label": "Active"
}
```

**UX:** Click header search or **⌘K** (Ctrl+K on Windows) → type ≥2 chars → results → ↑↓ → Enter → drawer opens.

**Drawer behavior:** Uses existing `openDrawer` / `AdminEntityDrawer` — no parallel navigation system. Opportunity opens respect `OpportunityDrawerOpenCoordinator` deferral on workspace routes.

**Cross-route open:** TopNavBar is above nested `AdminDrawerProvider` trees. On workspace/settings/forms routes, a custom event opens the drawer in-place. On other AdminV2 routes (e.g. workflows), intent is stored in `sessionStorage` and the user is sent to `/adminV2/workspace`, where the listener consumes the intent.

## API

`GET /api/admin/global-search?q=&limit=`

- Auth: `requireAdminOrOps` + org context + access scope dimensions.
- `q`: min 2 sanitized chars, or UUID exact match.
- `limit`: 1–20 (default 20).
- Per-type cap: 8 before merge (people → leads → households → campuses).

## Performance notes

- Four parallel Supabase query groups per request (person, opportunity, customer, location).
- Person search runs up to five ilike queries then dedupes in memory (same pattern as CRM entity search).
- Server logs `[admin-timing]` when total handler time exceeds **250ms**.
- Client debounce **180ms** on input; stale responses dropped via sequence counter.
- Status definition reads use existing cached `fetchEffectiveStatusDefinitions`.

**Follow-ups if latency becomes visible:** single RPC or materialized search index; person multi-column search consolidation; prefetch on header focus.

## Future roadmap (not Phase 1)

- BOS / natural-language retrieval (separate entry point — AI command surface)
- Semantic / embedding search
- Document body and communication thread content search
- Jobs, invoices, payments, schedules as searchable types
- Deep-link URL params (`?open=`) instead of sessionStorage for non-drawer routes
- Lift `AdminDrawerProvider` to AdminV2 root to simplify open bridge
- Search analytics (top queries, zero-result rate)

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/globalSearch/globalRecordSearch.test.ts
```

Manual: ⌘K from workspace → search known person/lead/household/campus → Enter → drawer opens with correct record.

## Related docs

- `docs/system/record-system.md` — drawer authority vs queue previews
- `docs/system/workspace-system.md` — workspace navigation context
- `docs/product/bos-foundation.md` — BOS remains separate from search
