# Alloy OS — Engineering Handoff

**Path:** `docs/sprints/07_2026/alloy-os/engineering-handoff.md`
**Status:** Canonical sprint-closeout handoff (2026-07). Written so another engineer can continue without re-discovering the architecture.
**Read with:** [`surface-host-architecture.md`](../../../platform/experience/surface-host-architecture.md) (architecture), [`surface-host-implementation-status.md`](../../../platform/experience/surface-host-implementation-status.md) (status), [`navigation-runtime-doctrine.md`](../../../platform/experience/navigation-runtime-doctrine.md) (doctrine), [`cursor-handoff.md`](./cursor-handoff.md) (design-review form of this doc).

---

## Executive Summary

### What changed
Operator surfaces (Workspace, Work Unit) were **Next.js route segments**, so the App Router destroyed the outgoing surface the instant the incoming committed. Every continuity failure — page-navigation feel, shell reload, soft/hard split, motion trapped inside surfaces, skeletons replacing layouts — was a symptom of that one fact. This sprint introduced the **Surface Host**: a persistent client component, always mounted at the workspace outlet, that owns *which operational surface has focus*. Surfaces stop being routes and become **client-held operational contexts**. The URL becomes a *projection* of context, not the trigger that destroys and rebuilds it.

Concretely, the sprint shipped, in order: motion adoption on live surfaces → Surface Hold + Queue Hold (no skeleton flashes) → directional surface-enter choreography → the Surface Host context model (Phase 1) → soft navigation for WS↔WU with a watchdog reload floor → extraction of the work-unit controller → **canonical Host rendering**: the Host is now the one renderer of the work-unit surface, and the route (`WorkUnitSlugRouteHost`) is seed-only.

### Why it changed
The objective is *make navigation disappear* — the operator should perceive one persistent operating system whose surfaces exchange focus, never a website loading pages. That is impossible while the outgoing surface is a route segment that unmounts on commit. The Surface Host removes the structural obstacle by moving surface identity off route segments and into client context — exactly what the drawer layer already does for records (`replaceState` + hold-prior-payload). Nothing here is novel to Alloy; it is the drawer pattern, promoted from records to surfaces.

### Architectural decisions made (and ratified)
1. **Surface Host = NAV-1, decision (A).** One route, client-driven surfaces; URL as projection. NAV-1 is no longer a future rewrite — it is this component, built incrementally. (B) parallel/intercepting routes was rejected as unproven for this shape.
2. **Always mounted, no feature flag, no parallel mode.** One architecture, one execution path. Behavior-changing phases roll out gated on the reload floor as recovery, never on a toggle. If a passive phase changes behavior, that is a bug to fix in the implementation, not hide behind a flag.
3. **The reload floor is retained forever** — demoted from default to recovery Tier-3, never deleted. A Surface Host that cannot recover is worse than the reload it replaces.
4. **PresentationRuntime remains the renderer.** The Host owns *which* surface and *the exchange*; it never renders surface content.
5. **Exactly one controller runs.** After the render takeover, the route is seed-only and the Host runs the sole `useWorkUnitSurfaceController` — no duplicate `openDrawer`, no duplicate URL sync, no duplicate identity effects.

---

## Final Architecture

### Mount chain (current)
```
adminV2/layout.tsx — AdminV2Shell (persists on soft nav; reloads only on the reload floor)
  └─ workspace/layout.tsx (server: org/tz/access/labels + workspace Route VM)
       └─ AdminV2WorkspaceClientProviders
            └─ SurfaceHostProvider  ← always mounted; owns operational-surface focus
                 ├─ {children}
                 │    ├─ /workspace              → page.tsx → PresentationRuntime surface="workspace"
                 │    └─ /work-unit/[slug]/layout → WorkUnitSlugRouteHost (SEED-ONLY: writes
                 │                                   workUnitSlugRouteCache, renders null)
                 └─ SurfaceHostWorkUnitMount (rendered iff URL is a work unit)
                        └─ useWorkUnitSurfaceController({ initialRouteMeta: null })
                             └─ WorkUnitSurfaceView
                                  └─ PresentationRuntime surface="work-unit" → WorkUnitSurface
```

### Runtime ownership
| Concern | Owner | Notes |
|---|---|---|
| App chrome, providers, drawer host, BOS | **Shell** (`AdminV2Shell`) | Unchanged; persists across soft nav. |
| Which operational surface has focus; outgoing/incoming; lifecycle | **Surface Host** (`SurfaceHostProvider`) | New. Client context. |
| Work-unit identity, record deep-link open, URL sync | **`useWorkUnitSurfaceController`** | The one controller. Route is seed-only. |
| Surface *content* (header/queue/focus/tiles) | **Presentation Runtime** | Unchanged renderer. |
| *How* a surface moves (curves) | **Motion Runtime** (`motionTokens` + `.motion-*`) | Host will invoke; Motion plays. |
| *When* a surface is ready to reveal | **Reveal / Surface Hold** | Host waits on it. |
| Record-level focus within a surface | **Drawer / Focus Panel Runtime** | Unchanged; Host generalizes its pattern. |
| Server identity seed | **`[slug]/layout.tsx` → `WorkUnitSlugRouteHost` → `workUnitSlugRouteCache`** | Synchronous `useMemo` write before the Host's sibling mount reads it → no cold-shell waterfall. |

### Navigation ownership
- **WS↔WU:** soft nav (`commitAdminV2NavLinkNavigation` → `router.push`) for eligible hrefs, with `armSoftNavReloadFloor` as the watchdog. The reload floor (`window.location.assign`) fires only if the target isn't reached within budget and the nav isn't superseded.
- **Within a work unit (record ↔ queue):** shallow `replaceState` via the controller's `syncOperatorWorkUnitUrlInBrowser` — no remount.
- **Settings / workflows / forms:** hard nav by design — excluded from the OS contract.
- **Back/forward:** currently re-hydrate via `usePathname` + `popstate` (not yet retained-context restore — that is Remaining #7 territory).

### Presentation Runtime ownership
`PresentationRuntime(surface)` is the entry contract: `"work-unit"` → `WorkUnitSurface`, else `WorkspaceSurface`. It is mounted by `WorkUnitSurfaceView` (Host path) and by the workspace page. The sprint did not modify the presentation tree; it changed *who mounts it* for the work-unit surface (Host, not route).

---

## Remaining Work (ranked)

Ranked by value-per-unit-risk. Full table with plug-in points: [`surface-host-implementation-status.md`](../../../platform/experience/surface-host-implementation-status.md#remaining-ranked--see-engineering-handoff-for-the-why).

1. **Surface exchange choreography** — *highest value.* The render takeover moved ownership but the transition still relies on soft nav + reload floor. Dispatching the reducer's `navigate/settle/cancel` (already defined + tested) is what converts an ownership move into the *felt* focus exchange that is the entire point of the sprint. Everything else depends on it.
2. **Outgoing surface retention** — the mechanical prerequisite for #1's "yield": keep the outgoing surface mounted + non-interactive through its exit. Fills the reducer's `outgoing` slot, which is currently unused at the render layer.
3. **Tile yield** — the originating tile hands off to the incoming surface. Pure polish on top of #2; high perceptual payoff, low structural risk.
4. **Surface settle** — deferred values settle after establish via Motion `settle`, without blocking reveal. Completes the exchange loop's tail.
5. **Focus / Person / Child Host integration** — generalizes the model to new surface kinds. Should wait until the exchange (1–4) is stable so each kind inherits a proven mechanism rather than a moving target.
6. **Configuration Host integration** — lowest of the integration set: settings is *intentionally* page-like today, so this needs a product decision before code, and carries the least continuity payoff.
7. **Perceived Performance sprint** — see below. Not a single task but the recommended *next sprint*; it consumes the retained-surface substrate that 1–4 create.

Why this order: 1→4 are one coherent thread (build the exchange, then retain, then yield, then settle) and unlock the sprint's actual objective; 5→6 are horizontal generalizations that are cheaper and safer *after* the exchange is proven; 7 is the payoff sprint that should not start until the surfaces it accelerates are retained.

---

## Known Constraints

**What cannot be changed:**
- **The reload floor exists forever.** It is the correctness shield against cancelled soft navigations leaving dead UI (the failure mode that originally justified the full reload on the heavy `"use client"` work-unit surface). It may be demoted from default but never removed.
- **PresentationRuntime is the renderer.** Do not make the Host render surface content.
- **The frozen operator-route parser** is the sole URL→surface-identity source. Do not fork it in the Host, the controller, or the render decision.

**Assumptions that exist:**
- The server seed (`loadWorkUnitSlugRouteMetaServer` → `workUnitSlugRouteCache`) is written synchronously in render (`useMemo`) by the seed-only route *before* the Host's sibling mount reads it. This ordering (React renders `{children}` before the sibling) is load-bearing for the no-waterfall cold path. Preserve it if the outlet structure changes.
- `isSameSurface` keys on `kind + slug` only — record changes are intra-surface (drawer owns them, no surface transition). The exchange choreography must respect this: opening a record must not trigger a surface exchange.
- Soft-nav eligibility is href-based (`isAdminV2SoftNavEligibleHref`). Only WS↔WU is eligible today.

**Already ratified — do not redesign:**
- Decision (A) (one route / client surfaces / URL projection).
- Surface Host as the canonical, always-mounted, flagless architecture.
- NAV-1 = Surface Host (not a separate future rewrite).

**What should not be redesigned:**
- The Motion token system (4×4×5) — adopt it, don't add raw durations.
- Surface Hold / Queue Hold — the exchange builds *on* them; it does not replace them.
- The drawer's `replaceState` + hold-prior pattern — the surface exchange generalizes it; it is the proven precedent, not a thing to reinvent.

---

## Risks

**Requires staging validation:**
- Every behavior-changing phase lands on `staging` and is validated there before merge (typecheck + Surface Host/controller/presentation/motion/nav tests + build). The render takeover was validated this way (`e66c3de51`).

**Requires browser validation (authenticated, live):**
- The *felt* result of the exchange choreography (#1–4) cannot be proven by tests — it needs an authenticated live-browser session (the operator surfaces are behind auth). Card-drill, drag, z-index, and border restores similarly need a live browser. Treat "tests green + build OK" as necessary-but-not-sufficient for choreography work.
- Soft-nav resilience under real RSC load (the `fallback_to_reload_rate`) is a live-traffic signal, not a unit-test signal.

**Requires authenticated validation:**
- Deep-link hydration and record deep-link opening across real sessions; back/forward over real history; refresh-warmth.

**Intentionally deferred:**
- The sessionStorage-backed persistence tier (NAV-2) — the current `workUnitSlugRouteCache` is in-memory only.
- Instant-back over retained context (back/forward still re-hydrate).
- Settings/configuration under the Host (intentionally page-like).
- Removing the reload floor (never — only demote once `fallback_to_reload_rate` is provably low).

---

## Recommended Next Sprint — Perceived Performance

**Why this is now the highest-value remaining work.** The architecture is done: surfaces are client-held, the Host owns rendering, and the substrate for retaining and exchanging surfaces exists. The gap between "correct" and "impossibly fast" is now entirely *perceptual* — warmth, retention, instant back, predictive preload — and every one of those is unlocked by the retained-surface model this sprint built. There is no larger architectural lever left to pull; the leverage moved to perception.

**How it builds on the Surface Host.** Because surfaces are now client contexts under one persistent Host (not route segments that unmount), the Host can: warm the destination context into the live runtime on intent (hover/pointer-down) before commit; retain the outgoing surface so back is instant over held state; keep subscriptions/scroll/focus alive across a transition; and promote the in-memory caches to a navigation-surviving tier so both soft nav and reload rehydrate warm. None of these were possible while surfaces were routes. They are possible now *because of* this sprint.

**Why it must not redesign architecture.** The architecture is frozen and ratified (decision A, Host-owned, flagless, reload-floor-retained). Perceived Performance is a *consumption* sprint: it makes the existing retained-surface model *feel* instant. If it finds itself changing who owns rendering, reopening (A) vs (B), or adding a parallel mode, it has gone off the rails. The correct posture: build the exchange choreography (Remaining #1–4) as the mechanical foundation, then layer warmth and instant-back on top — no new renderer, no new runtime, no new route model.

**Exactly where it should focus:**
1. Wire the exchange choreography (Remaining #1–4) — the mechanical prerequisite for anything to *feel* instant.
2. Warm-on-intent: promote the existing row/tile/nav prewarm to "warm the destination surface context into the live Host."
3. Instant back: map back/forward to retained context rather than re-hydration.
4. Persistence tier (NAV-2): sessionStorage-backed VM/bootstrap snapshots so cold entry and reload rehydrate warm.
5. Instrument `cancelled_nav_rate` / `fallback_to_reload_rate` / `transition_latency` and use them to gate demoting the reload floor further — evidence-based, never blind.

The one-sentence framing for that sprint: **"The architecture is frozen. The goal is to make Alloy feel impossibly fast without changing the architecture."**
