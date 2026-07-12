# Global Search V1 — Sprint Closeout

**Path:** `docs/sprints/05_2026/completed/global_search_v1_closeout.md`  
**Status:** **CLOSED** (May 2026)  
**Canonical doc:** [global_search_foundation.md](../global_search_foundation.md)  
**Phase 2 ideas:** [global_search_phase2_candidates.md](../global_search_phase2_candidates.md)

---

## Summary

Global Search V1 is **COMPLETE** and operational in AdminV2.

| Area | Outcome |
|------|---------|
| **Search UX** | Inline header search, keyboard nav, drawer-safe dropdown, swap-in-place open |
| **Scope** | Children, parents/guardians, leads, campuses |
| **Permissions** | Org, site, and department scoped |
| **Presentation** | Family clusters, child age, lead short labels, typography-first, status-only color |
| **Navigation** | AdminV2 drawer only; canonical Person for children |
| **Completeness** | Household expansion, multi-child support, Mitchell validation, cluster overflow |

## Verification

```bash
cd web && npm run test -- tests/admin/globalSearch/globalRecordSearch.test.ts
```

40 tests passing at closeout.

## Deferred

All Phase 2 items (fuzzy matching, additional entities, productivity features, BOS integration) are documented in [global_search_phase2_candidates.md](../global_search_phase2_candidates.md). V1 does not depend on them.
