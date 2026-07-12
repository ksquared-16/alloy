---
owner: experience
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Surface Host Architecture

**Path:** `docs/platform/experience/surface-host-architecture.md`
**Status:** **Ratified — decision (A). Phase 1 shipped (2026-07).** The Surface Host is the canonical architecture: **always mounted, no feature flag, no parallel runtime mode.** Phase 1 is **inert by implementation** (a passive observer of surface state) — behavior is identical to today; the only new thing is that Host state exists internally. Phase 0 (interim snapshot) was **rejected** — no temporary bridges.
**Objective:** *Make navigation disappear.* The operator perceives operational surfaces exchanging focus inside one persistent operating system — never page navigation.
**Realizes:** [`navigation-runtime-doctrine.md`](./navigation-runtime-doctrine.md) (NAV‑1). **The Surface Host IS NAV‑1 decision (A)** — see §4.
**Builds on:** Presentation Runtime V2, Motion Runtime + tokens, Surface Hold, Queue Hold, the drawer's client‑URL swap. Reuses; does not replace.

---

## 1. The one‑sentence problem

Operator surfaces are **Next.js route segments**, so the App Router **destroys the outgoing surface the instant the incoming commits**. Every continuity failure — page‑navigation feel, shell reload, replacement feel, soft/hard split, motion trapped inside surfaces, skeletons replacing layouts, loading *between* surfaces — is a symptom of that single fact. The Surface Host removes the fact: surfaces stop being routes and become **client‑held operational contexts that exchange focus**.

---

## 2. Audit — where the Surface Host belongs (grounded in current code)

| Question | Finding (file) |
|---|---|
| Shared center outlet | `{children}` inside `.adminv2-workspace-scroll-surface`, in `AdminV2WorkspaceClientProviders` — the **client** wrapper the workspace layout renders. Both `/workspace` (`WorkspaceSurface`) and `/workspace/work-unit/:slug` (`WorkUnitSurface`) mount here as `children`, via `PresentationRuntime`. **This is where the Surface Host lives.** |
| What owns surface swapping today | The **Next.js App Router**. A route‑segment change swaps `{children}`. |
| What unmounts immediately | The **outgoing surface subtree** (workspace page ↔ work‑unit route) on route commit. No overlap window. This is why the outgoing surface cannot yield. |
| What already stays mounted | `AdminV2Shell` (left nav / header / right rail / BOS) — it sits in the **parent** layout `adminV2/layout.tsx`, above the outlet. It persists on **soft** nav; it reloads only on **hard** nav (`window.location.assign`). |
| What can be reused (do NOT rebuild) | `PresentationRuntime` (surface renderer) · motion tokens + `motion-surface-enter-*` · **Surface Hold** (`WorkUnitSurface` cold/held/live) · **Queue Hold** · **the drawer's client‑URL swap** (`syncOperatorWorkUnitUrlInBrowser` = `replaceState` with no route remount + `AdminDrawerContext` hold‑prior) · `WorkUnitSlugRouteHost` (already resolves work‑unit identity **client‑side** from a server seed). |
| What absolutely requires NAV‑1 | Keeping the outgoing surface **mounted** through its exit; making WU→WS a **client surface swap** (not a hard reload); collapsing the soft/hard split into **one physics**. All three are NAV‑1. |

**The decisive reusable asset: the drawer is already a working micro Surface Host.** `AdminDrawerContext` changes the URL (`:recordId`) via `replaceState` **without a route remount**, **holds prior payload** during a model‑swap, and exchanges focus between records. The Surface Host is that exact pattern **promoted from records to surfaces**. Nothing here is novel to Alloy — it is the drawer, generalized.

---

## 3. What the Surface Host owns

The **Shell** owns the application (chrome, providers, drawer host, BOS). The **Surface Host** owns *which operational surface currently has focus* and the *exchange* between them.

Eventually (design the home now; implement incrementally):
`current surface · outgoing surface · incoming surface · surface lifecycle · transition orchestration · loading orchestration · motion orchestration · optimistic surface swap · warm preload · history continuity · focus restoration · scroll restoration.`

Surfaces never destroy one another. They **exchange focus**. The Host orchestrates the exchange and holds the outgoing until the incoming has established.

---

## 4. The determination: the Surface Host **becomes** NAV‑1

The chain is forced, not chosen:

1. The desired experience requires the **outgoing** surface to stay alive long enough to visibly yield.
2. Today the outgoing surface is a route segment → it unmounts on commit.
3. To keep it mounted, surface identity must move **off route segments** into **client context**, with the **URL as a projection** (`replaceState`), exactly as the drawer already does for records.
4. That decoupling **is** NAV‑1 decision (A): *"one route, client‑driven surfaces; surface identity lives in client context + `replaceState` URL — what drawers already do today."*
5. Separately, WU→WS is a hard reload today; the Host replaces it with a client surface swap — which is *stronger* than "soft nav" and is the NAV‑1 mechanism.

**Verdict:** the Surface Host **is** the realization of NAV‑1 (A). It does not sit on top of NAV‑1 and it is not a lighter alternative — it is the same object. Therefore NAV‑1 does not need to "change first" as a separate dependency; **building the Surface Host is building NAV‑1.** The only thing that must be **decided** first is the routing model (§5).

---

## 5. The crux decision to ratify (this is what must change first)

The App Router route‑segment model is the obstacle. Two ways to hold surfaces across a focus change:

- **(A) One route, client‑driven surfaces.** Collapse operator surfaces under one route segment; surface identity lives in the Host's client context; the URL is a projection (`replaceState`), hydrated only on cold load. **Generalizes the drawer pattern already in production.** Lower risk, reversible, proven. Cost: operator surfaces stop being distinct route *files*.
- **(B) Parallel / intercepting routes.** App‑Router parallel routes so segments coexist. More "native," but more framework surface and unproven for this shape.

**Recommendation: (A).** It promotes a pattern already shipping (drawer `replaceState` + hold‑prior) from the record level to the surface level; blast radius understood; reversible. **This is the one ratification required before any Host code.**

---

## 6. Architecture — Current → Target

### Current (route‑owned surfaces)
```
adminV2/layout.tsx ─ AdminV2Shell (persists on soft nav; RELOADS on hard nav)
  └─ workspace/layout.tsx ─ providers ─ .scroll-surface ─ {children}   ← App Router swaps this
        ├─ /workspace          → WorkspaceSurface     (unmounts on WS→WU)
        └─ /work-unit/:slug     → WorkUnitSurface      (unmounts on WU→WS)
Owner of swap: Next App Router.  Outgoing: destroyed on commit.  URL: the trigger that destroys+rebuilds.
```

### Target (Host‑owned surfaces)
```
adminV2/layout.tsx ─ AdminV2Shell (ALWAYS persists)
  └─ workspace/layout.tsx ─ providers ─ .scroll-surface
        └─ SurfaceHost (client; owns operational context)
              ├─ current  : WorkspaceSurface | WorkUnitSurface   (mounted, has focus)
              ├─ outgoing : the yielding surface (held through its exit, non-interactive)
              └─ incoming : the establishing surface (mounted, resolving inside itself)
Owner of swap: SurfaceHost.  Outgoing: HELD then released.  URL: a PROJECTION of context (replaceState).
```

### Ownership
| Concern | Owner |
|---|---|
| Application chrome, providers, drawer host, BOS | **Shell** (`AdminV2Shell`) — unchanged |
| Which surface has focus; outgoing/incoming; lifecycle | **Surface Host** (new client component at the outlet) |
| Surface *content* (header/queue/focus/tiles) | **Presentation Runtime** — unchanged |
| *How* a surface moves (curves) | **Motion Runtime** (`motion-surface-enter/exit-*`) — Host invokes, Motion plays |
| *When* a surface is ready to reveal | **Reveal / Surface Hold** — Host waits on it |
| Record‑level focus within a surface | **Drawer / Focus Panel Runtime** — unchanged (Host generalizes its pattern) |
| Domain (Process→Stage→Record) | Unchanged |

### Transition flow (the core loop — the drawer's loop, at surface scope)
```
intent (tile/nav click / back-forward)
  → acknowledge (motion.instant)                          — the click registers
  → HOLD outgoing surface in place (no teardown)          — it stays alive to yield
  → prepare incoming INVISIBLY (warm cache or fetch)      — data resolves in destination
  → when incoming Reveal gate clears:
       outgoing plays surface-exit (yield away)           — Motion: exit, directional
       incoming plays surface-enter (establish)           — Motion: enter, directional
       project context → URL (replaceState / pushState)   — URL follows, never triggers
  → settle; release outgoing; restore scroll/focus        — incoming is primary
  → [recover tier] if prepare stalls: reveal degraded, or reload floor
```

### Loading flow
Loading lives **inside the incoming surface** (Surface Hold + Queue Hold already do this), never between surfaces. The outgoing surface is the "loading screen" — it stays until the incoming has established. No blank canvas, no skeleton‑replaces‑layout.

### Browser history
URL becomes a **projection**: serialize context → URL on commit; hydrate URL → context on **cold load only**. Back/forward map to context exchanges over retained surfaces (instant back). Deep links unchanged (URL still addresses the surface + record). One authority replaces the current `adminV2CommitNavigation` ⊕ drawer‑`replaceState` split.

### Warm loading
Intent (hover/pointer‑down) warms the destination context into the live Host before commit — the existing tile/row/nav prewarm, promoted to "warm the surface." Many transitions become instant.

### Outgoing / incoming
Outgoing is held **non‑interactive** (`pointer-events-none`) through its exit (~`motion.standard`), then released. Incoming establishes with the Reveal gate + Surface Hold. Both share the scroll‑surface box.

### Reduced motion
Collapses the exit/enter to opacity‑only at the **token** level (already true for `motion-*`). Continuity (the hold + swap) is preserved; only translate/scale is removed.

### The reload floor (never removed)
`window.location.assign` is demoted from *default* to *recovery Tier‑3*: called only when the Host cannot recover (inconsistent client runtime). It is retained forever for non‑operator paths (settings/workflows/forms) and as the floor. **A Surface Host that cannot recover is worse than the reload it replaces.**

---

## 7. Smallest implementation that grows (phased; WS↔WU first)

**One architecture, one execution path** — the Host is always mounted; there is no flag toggling it on/off and no parallel mode. Behavior‑changing phases roll out gated on the **reload floor as recovery** (never a parallel toggle). Nothing is a big‑bang rewrite.

- **Phase 0 — REJECTED.** An interim snapshot/presence wrapper would be another temporary bridge. Skipped deliberately — we build the actual architecture.
- **Phase 1 — Host home (decision A) — SHIPPED.** `SurfaceHostProvider` (always mounted at the outlet) owns `{ current, outgoing, incoming, phase }` as **client context**, hydrated from the URL via the frozen operator‑route parser; back/forward mirrored via `usePathname` + `popstate`. **Inert by implementation** — a passive observer: renders children unchanged, no render takeover, no nav interception, no URL/history writes, reload floor untouched. Files: `web/lib/experience/surfaceHost/`. `navigate/settle/cancel` are defined + tested as the Phase‑2 home but not dispatched.
- **Phase 2 — Exchange orchestration.** Wire the transition loop (§6): hold outgoing → prepare incoming (Surface Hold/Reveal) → exit+enter (Motion) → commit URL → settle. This is where WS↔WU *feels* like focus exchange.
- **Phase 3 — Continuity.** Instant back/forward over retained context; warm‑on‑intent; scroll/focus restoration; drawer stack folded into the Host's context model.
- **Extension (no redesign).** Because surfaces are now client contexts under one host, **Focus Panel · Person · Child · Configuration** are added as new surface kinds in the same `{ current, outgoing, incoming }` model — the drawer's record‑level swap and the surface‑level swap become **one** mechanism.

---

## 8. What this closes
`NAV‑1` (page‑reload nav) · `NAV‑2` (cold caches) · `WU‑1` (outbound skeleton) · `WU‑3` (dual paradigm) · `DRW‑4` (drawer stack lost) — all become properties of the Host, not separate fixes. The soft/hard split collapses to one physics.

---

## 9. Risks / mitigations (unchanged from NAV‑1 doctrine)
Soft transitions can reintroduce cancelled‑nav dead‑UI → resilience lands with recovery tiers + reload floor, flag‑gated, per‑surface, watched via `cancelled_nav_rate` / `fallback_to_reload_rate`. Cross‑surface state desync → explicit persistence boundary. URL⇄context divergence → one authority + parity tests (URL⇄context, back/forward, deep‑link, refresh). Locked performance/reveal doctrine → the Host *waits on* the reveal gate; it does not weaken it.

---

## 10. When this doc updates
Ratification of (A) vs (B); a phase completing; a change to the ownership model, transition loop, or reload‑floor policy.
