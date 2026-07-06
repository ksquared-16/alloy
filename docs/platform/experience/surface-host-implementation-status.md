# Surface Host — Implementation Status

**Path:** `docs/platform/experience/surface-host-implementation-status.md`
**Status:** Canonical status record (2026-07, Alloy OS sprint closeout). Single source of truth for *what is built* vs *what remains* in the Surface Host / NAV-1 program.
**Design:** [`surface-host-architecture.md`](./surface-host-architecture.md) (implementation record) · [`navigation-runtime-doctrine.md`](./navigation-runtime-doctrine.md) (doctrine).
**Rule:** when a phase lands or its scope changes, update this table *and* the `surface-host-architecture.md` §7 table in the same PR. Do not fork the status across docs.

---

## The one distinction that governs everything

The Surface Host now **owns rendering** of the work-unit operational surface — the route no longer renders it. It does **not yet retain the outgoing surface through an exchange**. Rendering ownership has moved; the *choreography that makes a surface change feel like a focus exchange* is the next work. Every "Completed" item below is a piece of the ownership move + its substrate; every "Remaining" item is a piece of the exchange.

---

## Completed

| Item | Commit | Evidence | Notes |
|---|---|---|---|
| **Surface Hold** | `7d80f6ce2` | `WorkUnitSurface.tsx` `resolveWorkUnitSurfaceRenderMode` (`cold`/`held`/`live`); `web/tests/presentation/workUnit/*` | Last-established model held during re-settle; no skeleton flash on same-host view switch or refresh. Keyed by `workUnitId` — work-unit change remounts, view switch does not. |
| **Queue Hold** | `7d80f6ce2` | `QueueRegion.tsx` `queueRegionRenderState`; `web/tests/presentation/workUnit/queueRegionHold.test.ts` | Prior rows never cleared before the next fetch settles; new rows swap in place. |
| **Motion adoption** | `2c6b25523` | `web/lib/motion/motionTokens.ts`, `web/app/globals.css`; `web/tests/motion/motionTokens.test.ts` | One motion source: 4 durations × 4 curves × 5 choreographies (`reveal/navigate/swap/acknowledge/recede`). `.motion-*` classes + `--motion-*` tokens on live surfaces. Reduced-motion collapses to opacity at token level. |
| **Surface-enter choreography** | `0ef8bf1aa` | `motion-surface-enter-forward` / `-back` keyframes; applied on the keyed surface div in `WorkUnitSurface.tsx` | Directional: forward = drill in (slide from right), back = slide from left. |
| **Surface Host Phase 1 (context model)** | `3764e039a` | `web/lib/experience/surfaceHost/{SurfaceHostContext.tsx, surfaceRef.ts, surfaceHostState.ts}` | `SurfaceHostProvider` (always mounted at the workspace outlet) owns `{ current, outgoing, incoming, phase }`; hydrates from URL via the frozen operator-route parser; back/forward mirrored via `usePathname` + `popstate`. Was inert-by-implementation until the render takeover. |
| **Soft navigation + reload floor** | `f40c09a72` | `web/lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts`, `adminV2SoftNavReloadFloor.ts` | WS↔WU soft nav (`router.push`) for eligible hrefs; watchdog reload floor (`window.location.assign`) armed on commit, fires only if the target isn't reached within budget and the nav isn't superseded (monotonic `softNavGeneration`). Default 3000ms. |
| **Work-unit controller extraction** | `4855c6fa8` | `web/lib/experience/surfaceHost/workUnitSurfaceController.ts`; `web/tests/experience/surfaceHost/*` | `useWorkUnitSurfaceController` + pure helpers (`routeRecordIdFromPathname`, `resolveDeepLinkRecordAction`, `resolveUrlSyncRecordId`, `coldShellTitleFromCache`). Lifted `WorkUnitSlugRouteHost` behavior verbatim — identity, record deep-link open, URL sync — with no behavior change. |
| **Canonical Host rendering (render takeover)** | `e66c3de51` | `SurfaceHostContext.tsx` (`surfaceHostShouldRenderWorkUnit` + `SurfaceHostWorkUnitMount`), `surfaceHostRender.ts`, `WorkUnitSlugRouteHost.tsx` (seed-only) | On a work-unit URL the Host mounts the surface via the controller; the route seeds `workUnitSlugRouteCache` (synchronous `useMemo`) and renders `null`. Exactly one controller runs → no duplicate `openDrawer`, no duplicate URL sync. `PresentationRuntime` remains the renderer. No flag, no parallel mode. |

**Validation at closeout:** typecheck 0 · Surface Host + presentation + motion + nav tests green (240 passed / 33 files at the render-takeover gate) · `next build` OK. Landed on `staging` (`e66c3de51`).

---

## In Progress

*None.* The sprint reached a clean stopping point: rendering ownership is fully moved and validated. The next unit of work (exchange choreography) has not been started — by design, the sprint stopped at "Host renders canonically, validated on staging" before opening Phase 2.

---

## Remaining (ranked — see engineering handoff for the why)

| # | Item | What it is | Where it plugs in | Depends on |
|---|---|---|---|---|
| 1 | **Surface exchange choreography** | Dispatch the reducer's `navigate` → `settle` / `cancel`: acknowledge → hold outgoing → prepare incoming (Reveal gate) → exit+enter (Motion) → project URL → settle. The step that makes the move *feel* like a focus exchange. | `surfaceHostState.ts` actions (defined + tested, not dispatched) wired into `SurfaceHostContext.tsx`. | Everything above. Highest-value remaining work. |
| 2 | **Outgoing surface retention** | Keep the yielding surface mounted + non-interactive (`pointer-events-none`) through its exit, then release. Fills the `outgoing` slot in the reducer. | Host render layer (currently renders only `current`). | Exchange choreography. |
| 3 | **Tile yield** | The originating tile/row visibly hands off to the incoming surface (shared-element / directional yield) rather than a static swap. | Workspace tile → Work Unit intent path + Motion. | Outgoing retention + Motion. |
| 4 | **Surface settle** | Deferred values (KPIs, live counts) settle *after* the incoming surface establishes, via Motion `settle`, without blocking the reveal. | Reveal gate + Motion `settle` at the tail of the exchange. | Exchange choreography. |
| 5 | **Focus / Person / Child Host integration** | Add these as new surface *kinds* in the same `{ current, outgoing, incoming }` model — the record-level (drawer) swap and the surface-level swap become one mechanism. | `surfaceRef` kinds + `surfaceHostShouldRender*` + controllers per kind. | A stable exchange (1–4). |
| 6 | **Configuration Host integration** | Bring the configuration/settings surfaces under the Host (currently hard-nav, excluded from the OS contract). | New surface kind + soft-nav eligibility. | 1–5; explicit product decision (settings is intentionally page-like today). |
| 7 | **Perceived Performance sprint** | Make every retained-surface transition *feel* instant: warm-on-intent into the live Host, instant back over retained context, persistence tier (NAV-2), predictive preload. | Builds on the Host's retained context; no architecture change. | 1–4 give it the substrate. **Recommended next sprint.** |

---

## What is explicitly *not* changing

- **The reload floor is never removed** — only demoted from default. It is retained forever for non-operator paths (settings/workflows/forms) and as recovery Tier-3.
- **PresentationRuntime stays the renderer.** The Host owns *which* surface and *the exchange*; it never renders surface content itself.
- **Decision (A) is ratified** — one route, client-driven surfaces, URL as projection. Do not reopen (A) vs (B).
- **No feature flag, no parallel mode.** One architecture, one execution path. Behavior-changing phases roll out gated on the reload floor, not a toggle.
- **The frozen operator-route parser** is the single source of surface identity from the URL. Do not fork it.
