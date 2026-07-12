# AdminV2 performance closeout — UX fixes + phase summary

**Path:** `docs/sprints/archive/05_2026/completed/adminv2_performance_closeout.md`  
**Status:** Closed (May 2026). Broad speed sprint **paused**; follow-ups are scoped roadmap items only.  
**Prerequisites:** [adminv2_reveal_doctrine.md](../adminv2_reveal_doctrine.md), [adminv2_speed_sprint.md](../adminv2_speed_sprint.md), [adminv2_route_shell_pipeline.md](../adminv2_route_shell_pipeline.md), [adminv2_drawer_pipeline.md](../adminv2_drawer_pipeline.md), [adminv2_drawer_performance_hardening_phase0.md](../adminv2_drawer_performance_hardening_phase0.md).

---

## 1. What we completed (this phase)

| Area | Outcome |
|------|---------|
| **Reveal doctrine** | Route-owned shell placeholders, coordinated above-fold gates (`wu-reveal-gate`, dept/workspace analogs). No second shell owners or component swaps during reveal. |
| **Route gates** | `routeShellPipeline` + `adminV2PrimarySurfaceGate` — shell visible → above-fold stable → hydration complete without blocking on background KPI/rollup. |
| **Drawer pipeline** | Inquiry workflow: calm loading header, `drawer_primary` gates first paint, `surface=full` idle after reveal. Composed open via bootstrap + primary. |
| **WU / dept / workspace loading** | Shared bootstrap patterns, `defer_bundle`, priority queue summaries, slim dept prefetch (`bundle_mode=prefetch`). WU reveal closeout: KPI never blocks TTFB. |
| **Header persistence** | `WorkspaceSiteFilterProvider` at app shell; `displayBootstrap` sticky SWR; `readInitialSelectedSiteId` on mount; scope bridge registers before layout effects; TopNav uses `displayBootstrap` + location reserve (no blank on dept→WU). |
| **Admin context cache** | `adminShellContextCache` + `loadAdminRouteGate` on shell GETs; lower repeated auth on navigation bursts. |
| **Entity labels cache** | Org-scoped TTL + invalidation on PUT/DELETE. |
| **Slim dept prefetch** | Attention buckets without full preview payloads on hard nav prep. |
| **WU bootstrap caching** | Session-scoped bootstrap client cache; pointerdown prefetch preserves target WU entry on nav. |
| **Drawer prev/next navigator** | Queue-indexed prev/next on pipeline WU; adjacent `drawer_primary` prefetch; controls top-right above quick actions. |
| **Closeout UX (this pass)** | Sticky site on dept→WU; route-owned WU title (no top-WU flash); adjacent prefetch rollover token; warm queue nav swaps id immediately; WU queue pill background prefetch (capped). |

---

## 2. Current state

### Production-grade enough

- Workspace → dept → work-unit hard nav with stable shell chrome and reveal gates.
- Header location dropdown does not blank after first valid bootstrap (sticky `displayBootstrap` + initial site id).
- Opportunity drawer open: primary path + queue seed first paint; full hydrate after reveal.
- Drawer queue prev/next for loaded queue page with intent + adjacent prefetch.
- WU operational bootstrap with defer bundle and priority summaries for faster above-fold.

### Still imperfect (known)

| Issue | Notes |
|-------|--------|
| **Late hydrates** | Drawer `surface=full`, oper strip, comms slots, tab-local fetches still land after reveal; some sections pop on slow networks. |
| **Full hydrate cost** | `field_definitions` + OCM/identity parallel segments remain ~700ms+ on cold paths (see phase-0 doc). |
| **Dept bootstrap weight** | Attention preview can still be large on some orgs; prefetch mode helps but not eliminated. |
| **Global shell routes** | Legacy route aliases and duplicate layout owners still exist outside AdminV2 shell. |
| **Queue row enrichment** | Preview mode helps; enrichment_ms still dominates some queue GETs. |
| **Monitoring** | Dev perf marks exist; production dashboards for reveal/bootstrap/drawer_primary not fully wired. |

### Speed bottlenecks (remaining)

1. Opportunity `surface=full` on coordinated reveal cap path.
2. Dept `operational-bootstrap` attention segments on large orgs.
3. Queue rows GET auth + enrichment on non-cached pill/tab switches.
4. Repeated client refetches when site filter changes (by design — scope invalidation).
5. AI command surface / sidecar modules competing for idle budget on WU.

---

## 3. Closeout fixes (May 2026)

### Critical: dept queue selection → work-unit lane (correctness)

**Symptom:** From `/dept`, clicking Enrolled / Tour Scheduled / other pipeline lanes opened `/work-unit` on Contact Attempted (first default queue).

**Root cause:** Canonical `operational-bootstrap` omitted `focus_queue`; client session deduped one bootstrap per work unit; bootstrap `primary_lane` overwrote URL `?queue=` via `setSelectedQueueKeyTraced("bootstrapPrimaryLane", pl.queue_key)`.

**Contract:** `WorkUnitQueueSelection` in `web/lib/adminV2/workUnitQueueSelection.ts` — route `?queue=` (+ `attention_bucket` or `bucket` alias) → API `focus_queue` → bootstrap ownership key + primary lane + active pill + drawer navigator `selection`. Explicit queue beats priority-summary defaults (`resolveAuthoritativeWorkUnitQueueKey`). Drawer prev/next uses `opportunityDrawerNavigatorMatchesWorkUnitSelection` so only the loaded filtered row page is navigable.

**Pill polish (same phase):** `workUnitQueuePillKeySelected` aligns dept URL synthetic NA pills with WU click styling; deferred pipeline counts hydrate via `summary_mode=partial` after reveal (`mergeWorkUnitQueueSummaryCounts`) without resetting selection or reloading rows; `counts_deferred` shows skeleton until counts land.

| # | Bug | Fix |
|---|-----|-----|
| 0 | Wrong queue from dept | `focus_queue` on bootstrap URL; ownership key includes queue; dept prefetch parses href; WU applies `authoritativePrimary` only. |
| 1 | Header location reload dept→WU | Sticky bootstrap + `readInitialSelectedSiteId`; removed `selectedSiteId` from WU cache layout effect deps. |
| 2 | Drawer nav placement | `OpportunityDrawerQueueNavigatorControls` in `headerTitleRight` column above quick actions (not title row). |
| 3 | Second next slow | `adjacentPrefetchToken` (not per-navigator generation abort); warm nav applies target id immediately then loads composed open; `prefetchOpportunityDrawerOnRowIntent` + adjacent prefetch on apply. |
| 4 | Wrong WU first paint | `routeWorkUnitDisplayName`; clear stale `workUnit` when route id mismatches; bootstrap rejects `wu.id !== workUnitId`. |
| 5 | Filter pill preload | `adjacentWorkUnitQueuePillKeys` + idle `fetchQueueItems(..., { prefetchOnly: true })` cap 3 neighbors. |

---

## 4. Next phase roadmap (do not start as broad sprint)

1. **WU filter prefetch expansion** — Extend pill preload to attention bucket variants; respect lane unmapped logical cache keys.
2. **Drawer primary warm-cache** — Stronger composed-open cache across prev/next; reduce duplicate bootstrap on generation bumps.
3. **Full hydrate optimization** — Split `surface=full` segments; more below-fold deferral without breaking audit/permissions.
4. **Global shell route cleanup** — Single layout owner; retire duplicate workspace entry paths.
5. **DB / index review** — Needs-attention and queue row queries (see speed sprint staging logs).
6. **Production monitoring** — Dashboards for `wu-bootstrap-perf`, `drawer-primary-perf`, reveal gate timings, shell cache hit rate.

---

## 5. Tests (regression anchors)

| Test file | Covers |
|-----------|--------|
| `web/tests/adminV2/adminV2ShellHeaderPersistence.test.ts` | Shell provider mount, sticky bootstrap, initial site id |
| `web/tests/adminV2/adminV2WorkUnitRouteIdentity.test.ts` | Route-owned WU title, bootstrap id guard |
| `web/tests/adminV2/workUnitQueuePillPrefetch.test.ts` | Adjacent pill key selection |
| `web/tests/admin/opportunityDrawerAdjacentPrefetch.test.ts` | Adjacent prefetch + 1→2→3 rollover |
| `web/tests/admin/opportunityDrawerQueueNavigator.test.ts` | Queue index / position |

---

## 6. Key modules

- `web/contexts/WorkspaceSiteFilterContext.tsx` — header site filter persistence
- `web/lib/adminV2/workspaceSiteFilterBootstrapCache.ts` — session bootstrap cache
- `web/lib/admin/opportunityDrawerAdjacentPrefetch.ts` — adjacent drawer prefetch token
- `web/lib/adminV2/workUnitQueuePillPrefetch.ts` — queue pill preload keys
- `web/contexts/AdminDrawerContext.tsx` — queue navigation apply + prefetch
- `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx` — WU route shell + prefetch wiring
