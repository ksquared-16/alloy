# AdminV2 Performance & Runtime Consistency — Sprint Closeout

**Path:** `docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`  
**Status:** **CLOSED** (June 2026)  
**Canonical doctrine (locked):** **`docs/system/adminv2-runtime-performance-doctrine.md`**  
**Cursor rule:** **`.cursor/rules/adminv2-runtime-performance.mdc`**

**Builds on:** `docs/sprints/archive/05_2026/adminv2_reveal_doctrine.md`, `docs/sprints/archive/05_2026/completed/adminv2_performance_closeout.md`

---

## Sprint intent

Stabilize AdminV2 so workspace, dept, work-unit, and drawer surfaces feel like **one continuous operating surface** — composed reveal, payload-first drawers, known-empty completion, and queue lanes that never flash false empties.

**Out of scope for this sprint:** backend query optimization (deferred to next phase).

---

## Desired baseline (locked)

| Surface | Behavior |
|---------|----------|
| `/workspace`, `/dept`, `/work-unit` | Composed above-fold reveal; no shell-first body-later assembly on warm nav |
| Work-unit queue lanes | No false empty; pill switch without skeleton under loaded pill |
| Opportunity drawer | Opens composed; above-fold stable on first paint |
| Person / child drawers | Opens composed; context-aware readiness |
| Known-empty | Empty household links, addresses, absent domains = ready when lookup completes |
| UI/config/layout work | Must not alter loading/reveal infrastructure |

---

## Shipped (representative)

| Area | Outcome |
|------|---------|
| **Drawer crash / hooks** | Rules-of-Hooks fix in `AdminEntityDrawer`; BOS right column no longer blocks header actions before full hydrate |
| **Composed drawer open** | Bootstrap entity reuse for first paint; pointer-down full hydrate; person fetch coalescing |
| **WU bootstrap speed** | Parallel attention resolver; inline queue completeness; defer redundant force refetch on warm nav |
| **Queue lane stability** | Request apply guards; rowsHeld / rowsLoading suppress false empty; active lane beats prefetch |
| **Known-empty / determinism** | Composed payload tests; drawer determinism; route session cache/reveal tests |
| **Lead summary density** | Family contacts capped to primary + one additional in summary variant (no overflow chrome) |
| **Doctrine lock** | System doc + Cursor rule + protected file list + required test suite |

---

## Closeout statement

- **Runtime consistency is demo-ready.**
- **Drawer and queue behavior are stable** enough to proceed with configuration, lifecycle, and messaging product work.
- **Remaining latency is backend query and payload size**, not core runtime architecture.
- **Future UI changes must preserve** `docs/system/adminv2-runtime-performance-doctrine.md`.

---

## Verification debt (ongoing)

Before merging changes to runtime-sensitive files, run the suite documented in the doctrine:

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

---

## Next phase

**Do later, not now:** `docs/sprints/archive/06_2026/adminv2_backend_query_payload_optimization_phase.md`
