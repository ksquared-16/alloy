# Alloy OS / Surface Host — Implementation Handoff for Cursor

**Path:** `docs/sprints/07_2026/alloy-os/cursor-handoff.md`
**Audience:** An engineer (or Cursor) who has not seen this sprint. Read top-to-bottom; it is a design review, not a transcript.
**Canonical companions:** [`surface-host-architecture.md`](../../../platform/experience/surface-host-architecture.md) · [`surface-host-implementation-status.md`](../../../platform/experience/surface-host-implementation-status.md) · [`navigation-runtime-doctrine.md`](../../../platform/experience/navigation-runtime-doctrine.md) · [`engineering-handoff.md`](./engineering-handoff.md).

---

## 1. Architectural overview

Alloy's admin app (Next.js 16, App Router, Turbopack) presents operational work through two primary operator surfaces: **Workspace** (the command center) and **Work Unit** (the expanded state of a process — queue + focus panel + KPIs). Historically each was a **route segment**. The App Router unmounts a route segment when you navigate away, which means the outgoing surface is destroyed the instant the incoming one commits. That single fact caused every "this feels like a website, not an app" symptom: page-navigation feel, shell reloads, a soft/hard navigation split, motion trapped inside surfaces, and skeletons replacing whole layouts.

The **Surface Host** removes that fact. It is a persistent client component (`SurfaceHostProvider`), always mounted at the shared workspace outlet, that owns *which operational surface currently has focus*. Surfaces become **client-held operational contexts** rather than route segments. The URL becomes a **projection** of that context (hydrated on cold load, written via `replaceState` for in-surface changes) instead of the trigger that destroys and rebuilds the world.

This is not a novel pattern for the codebase. The **drawer** layer already does exactly this at the *record* level: it changes the URL via `replaceState` without a route remount and holds prior payload during a model swap. The Surface Host is that same pattern **promoted from records to surfaces**.

The Surface Host **is** the realization of the platform's NAV-1 doctrine (decision A: one route, client-driven surfaces). NAV-1 is therefore not a future project — it is this component, built incrementally.

---

## 2. Implementation summary

The sprint delivered, in dependency order:

1. **Motion Runtime adoption** on live operational surfaces — one motion source (`motionTokens.ts`: 4 durations × 4 easing curves × 5 choreographies), `.motion-*` classes and `--motion-*` CSS vars in `globals.css`, reduced-motion handling.
2. **Surface Hold + Queue Hold** — the work-unit surface holds its last-established model, and the queue lane holds prior rows, so nothing flashes a skeleton on a same-host view switch or refresh.
3. **Directional surface-enter choreography** — `motion-surface-enter-forward` / `-back` on the keyed surface.
4. **Surface Host Phase 1 (context model)** — `SurfaceHostProvider` owns `{ current, outgoing, incoming, phase }`, hydrated from the URL, back/forward mirrored via `usePathname` + `popstate`. Initially inert-by-implementation (a passive observer).
5. **Soft navigation + reload floor** — WS↔WU soft nav (`router.push`) with a watchdog that falls back to a hard `window.location.assign` only when the soft nav stalls and hasn't been superseded.
6. **Work-unit controller extraction** — `WorkUnitSlugRouteHost`'s behavior (identity resolution, record deep-link open, URL sync) lifted verbatim into `useWorkUnitSurfaceController` with pure, unit-tested helpers.
7. **Canonical Host rendering (the render takeover)** — the Host now mounts the work-unit surface via the controller; the route is **seed-only** (writes the server identity to a module cache and renders `null`). Exactly one controller runs. No feature flag, no parallel mode.

**The one distinction to hold in your head:** rendering ownership has moved to the Host, but the outgoing surface is not yet *retained through an exchange*. The Host renders the work-unit surface canonically; it does not yet hold the yielding surface and choreograph a swap. That choreography is the next work.

---

## 3. Completed work

| Area | State | Key symbols |
|---|---|---|
| Motion Runtime | ✅ | `MOTION_DURATION`, `MOTION_EASING`, `MOTION_CHOREOGRAPHY`, `motion-surface-enter-{forward,back}` |
| Surface Hold | ✅ | `resolveWorkUnitSurfaceRenderMode` (`cold`/`held`/`live`) |
| Queue Hold | ✅ | `queueRegionRenderState` |
| Surface Host context model | ✅ | `SurfaceHostProvider`, `surfaceRef`, `surfaceHostReducer` |
| Soft nav + reload floor | ✅ | `commitAdminV2NavLinkNavigation`, `armSoftNavReloadFloor`, `shouldFireReloadFloor` |
| Work-unit controller | ✅ | `useWorkUnitSurfaceController` + pure helpers |
| Canonical Host rendering | ✅ | `surfaceHostShouldRenderWorkUnit`, `SurfaceHostWorkUnitMount`; `WorkUnitSlugRouteHost` seed-only |

All landed on `staging` (latest: `e66c3de51`).

---

## 4. Remaining work

| # | Item | One-line scope |
|---|---|---|
| 1 | Surface exchange choreography | Dispatch `navigate/settle/cancel` (defined + tested, not wired): acknowledge → hold outgoing → prepare incoming → exit+enter → project URL → settle. |
| 2 | Outgoing surface retention | Keep the yielding surface mounted + non-interactive through its exit; fill the reducer's `outgoing` slot at the render layer. |
| 3 | Tile yield | Originating tile hands off to the incoming surface. |
| 4 | Surface settle | Deferred values settle after establish (Motion `settle`), non-blocking. |
| 5 | Focus / Person / Child Host integration | New surface *kinds* in the same `{ current, outgoing, incoming }` model. |
| 6 | Configuration Host integration | Bring settings under the Host (needs a product decision — settings is page-like by design). |
| 7 | Perceived Performance | Warm-on-intent, instant back, persistence tier (NAV-2), instrumentation. **The recommended next sprint.** |

---

## 5. Current runtime ownership

```
Shell (AdminV2Shell) ............ app chrome, providers, drawer host, BOS. Persists on soft nav.
Surface Host (SurfaceHostProvider) which operational surface has focus; outgoing/incoming; lifecycle.
useWorkUnitSurfaceController ..... work-unit identity, record deep-link open, URL sync. THE one controller.
WorkUnitSlugRouteHost ............ SEED-ONLY: writes workUnitSlugRouteCache, renders null.
PresentationRuntime .............. renders surface content (WorkUnitSurface / WorkspaceSurface). Unchanged.
Motion Runtime ................... how a surface moves. Host invokes, Motion plays.
Reveal / Surface Hold ............ when a surface is ready. Host waits on it.
Drawer / Focus Panel ............. record-level focus within a surface. Unchanged.
Soft nav + reload floor .......... WS↔WU commit + recovery.
```

Navigation: WS↔WU is soft (`router.push`) with a reload floor; record↔queue inside a work unit is shallow `replaceState`; settings/workflows/forms are hard nav by design; back/forward re-hydrate via `popstate`.

---

## 6. Files of interest

**Surface Host core — `web/lib/experience/surfaceHost/`**
- `SurfaceHostContext.tsx` — `SurfaceHostProvider`, the render decision + `SurfaceHostWorkUnitMount`, the `hydrate`/`popstate` effects. *Start here.*
- `surfaceRef.ts` — `SurfaceRef` (`kind`/`workUnitSlug`/`recordId`/`key`), `surfaceRefFromPath`, `surfaceRefToPath`, `isSameSurface`. Identity model; `key` = surface only.
- `surfaceHostState.ts` — the reducer + `{ current, outgoing, incoming, phase }`; `navigate/settle/cancel` are **defined + tested but not dispatched** — this is where the exchange choreography plugs in.
- `surfaceHostRender.ts` — `surfaceHostShouldRenderWorkUnit` (the single render decision).
- `workUnitSurfaceController.ts` — `useWorkUnitSurfaceController` + pure helpers (`routeRecordIdFromPathname`, `resolveDeepLinkRecordAction`, `resolveUrlSyncRecordId`, `coldShellTitleFromCache`). The identity/deep-link/URL-sync brain.

**Route + seed**
- `web/components/admin/workspace/WorkUnitSlugRouteHost.tsx` — seed-only route host + the exported `WorkUnitSurfaceView` (pure render: cold shell / hold-if-leaving / error / `PresentationRuntime`).
- `web/app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx` — server identity resolution (`loadWorkUnitSlugRouteMetaServer`) → renders the seed-only host.
- `web/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx` — where `SurfaceHostProvider` is mounted.
- `web/lib/admin/workUnitSlugRouteCache.ts` — the in-memory identity seed cache (`put`/`peek`).

**Presentation (unchanged renderer)**
- `web/components/presentation/PresentationRuntime.tsx` — entry contract.
- `web/components/presentation/workUnit/WorkUnitSurface.tsx` — Surface Hold (`resolveWorkUnitSurfaceRenderMode`), `motion-surface-enter-*`.
- `web/components/presentation/workUnit/QueueRegion.tsx` — Queue Hold (`queueRegionRenderState`).

**Navigation**
- `web/lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts` — soft-nav commit + eligibility.
- `web/lib/adminV2/navigation/adminV2SoftNavReloadFloor.ts` — the watchdog reload floor (`shouldFireReloadFloor`, monotonic `softNavGeneration`).
- `web/lib/admin/workUnitOutboundHold.ts` — `isLeavingWorkUnitSurface` (outbound skeleton suppression).

**Motion**
- `web/lib/motion/motionTokens.ts` + `web/app/globals.css` — the token system and choreography classes.

**Tests to mirror when extending**
- `web/tests/experience/surfaceHost/*` (render decision, controller helpers, state), `web/tests/presentation/workUnit/*` (Surface/Queue Hold), `web/tests/motion/motionTokens.test.ts`, `web/tests/admin/workUnitOutboundHold.test.ts`.

---

## 7. Validation status

- **Automated (green at closeout):** typecheck 0; Surface Host + controller + presentation + motion + nav suites pass (240 tests / 33 files at the render-takeover gate); `next build` OK. Landed on `staging` `e66c3de51`.
- **Not yet validated in a live browser:** the *felt* transition (choreography is not built yet); soft-nav resilience under real RSC load (`fallback_to_reload_rate`); deep-link/record-open/back-forward/refresh across authenticated sessions. The operator surfaces are behind auth, so these need an authenticated live-browser pass — tests are necessary but not sufficient for choreography work.

---

## 8. Open risks

- **Cancelled soft navigations → dead UI.** The original reason for the full reload. Mitigation is architectural: the reload floor is retained as automatic Tier-3 recovery. Do not remove it; only demote once `fallback_to_reload_rate` is provably low.
- **Record open must not trigger a surface exchange.** `isSameSurface` keys on `kind + slug`; the exchange choreography must treat record changes as intra-surface (the drawer owns them).
- **Seed ordering is load-bearing.** The seed-only route writes the cache synchronously in render before the Host's sibling mount reads it. If you restructure the outlet, preserve this ordering or the cold path regains a waterfall.
- **One controller only.** Do not reintroduce a second `useWorkUnitSurfaceController` (e.g. in the route) — that revives duplicate `openDrawer` / URL sync.

---

## 9. Recommended implementation order

1. **Exchange choreography (Remaining #1)** — wire the reducer's `navigate/settle/cancel` in `SurfaceHostContext.tsx`, invoking Reveal (gate) + Motion (`navigate`/`swap`). This is the mechanical foundation for everything felt.
2. **Outgoing retention (#2)** — render the `outgoing` slot: hold the yielding surface non-interactive through its exit, then release. Validate no double-mount, no drawer/URL races.
3. **Tile yield (#3) + Surface settle (#4)** — polish the entry/exit and the deferred-value tail. High perceptual payoff, low structural risk.
4. **Live-browser validation pass** (authenticated) — the choreography cannot be signed off by tests alone.
5. **Then** the **Perceived Performance** sprint: warm-on-intent, instant back over retained context, the persistence tier (NAV-2), and instrumentation — all consuming the retained-surface substrate, none redesigning the architecture.

**Guardrails for all of the above:** no feature flag, no parallel render mode, PresentationRuntime stays the renderer, the reload floor is never removed, decision (A) is not reopened, and the frozen operator-route parser is the single identity source. If a change touches any of those, stop — it is out of scope.

---

> **Framing for the next sprint:** *"The architecture is frozen. The goal is to make Alloy feel impossibly fast without changing the architecture."*
