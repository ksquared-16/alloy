# Navigation Runtime Doctrine

**Path:** `docs/platform/experience/navigation-runtime-doctrine.md`
**Status:** **Ratified (decision A) and in implementation — this is the Surface Host.** Decision (A) — one route, client-driven surfaces — has been ratified and built. The realized form of this doctrine is the **Surface Host** ([`surface-host-architecture.md`](./surface-host-architecture.md)), not a separate future "navigation rewrite." As of 2026-07 the following are **shipped**: the persistent client context model (§2), URL hydration on cold load, the held-prior guards (Phase 0), soft navigation for WS↔WU with the reload floor as recovery, and canonical Host rendering of the work-unit surface. **Remaining:** the soft *surface exchange* (Phase 3 here) — outgoing-surface retention + atomic swap + settle. This document is the **design spec / doctrine**; the Surface Host doc is the **implementation record**. Read them together.
**Realizes:** The Experience Layer's keystone — Capability 2 (Continuity System) + Capability 6 (Navigation Continuity) of [`experience-layer-architecture.md`](./experience-layer-architecture.md), unified into one runtime. **Realized by** [`surface-host-architecture.md`](./surface-host-architecture.md).
**Closes:** NAV-1 (full-reload navigation) — *substrate shipped, exchange remaining*; NAV-2 (cold caches); WU-1 (outbound skeleton) — *held-prior guard shipped*; WU-3 (dual navigation paradigm); DRW-4 (drawer stack lost on refresh) from the [Experience Audit](../premium-operational-experience/experience-audit.md).
**Companion law:** [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) Law 2 (Continuity) and Law 3 (Memory). This doctrine is their navigation-level implementation.

> **NAV-1 is not a future rewrite.** It is the Surface Host, being implemented incrementally. Where this doctrine below says "will," "proposed," or "Phase N," consult the landed-state table in [`surface-host-architecture.md`](./surface-host-architecture.md) §7 for what is actually shipped. The module sketch in §4 (`web/lib/experience/navigation/`) is the *generalized target*; the shipped implementation currently lives in `web/lib/experience/surfaceHost/` and is the work-unit-first realization of the same design.

---

## The anchoring truth (read first)

The current `window.location.assign()` reload is a **shield, not a mistake.** It exists because soft `router.push` navigations are cancelled by in-flight RSC work and leave dead UI (`adminV2CommitNavigation` comment; Vercel `---` on GET). The naive evolution — replace `assign` with `push` — was already tried and abandoned because it reintroduces dead UI.

**Therefore Navigation Runtime is not a swap. It is the resilience layer that earns the right to drop the reload** by owning preparation, holding, atomic commit, and failure recovery — keeping the reload as a **recovery floor**, never deleting it. A Navigation Runtime that cannot recover is worse than the reload it replaces.

Everything below follows from this.

---

# 1 — Should Alloy evolve? (Q1: website vs OS navigation)

## The conceptual difference

| | Page Navigation (website) | Operational Navigation (OS) |
|---|---------------------------|------------------------------|
| **Unit** | The *page/document* | The *operational context* (surface, record, drawer-stack) |
| **Navigating means** | Fetch + render a new document; destroy the old | Change what's in the foreground; the runtime persists |
| **Source of truth** | The **URL** — runtime is derived from it | The **runtime context** — URL is a *projection* of it |
| **State** | Reconstructed from URL each time | **Retained**; reconstruction is the exception |
| **Owner of the model** | The browser (history, back, reload) | The **application** |
| **Continuity** | Incidental | The default; destruction is the exception |
| **Operator verb** | "Go to a page" (location) | "Bring to focus" (attention) |

The defining inversion: **a website derives runtime from the URL; an operating system serializes the URL from runtime.** In Alloy today the URL is the trigger that destroys and rebuilds the world. In Operational Navigation the URL is a *shareable serialization* of a context that already exists and persists. The operator widens, narrows, and shifts focus. They never "leave."

## Verdict

**Evolve — yes.** Navigation is now the highest-leverage remaining capability: NAV-1 is severity 5 and the root cause of six separate audit findings, and Motion/Reveal/Interaction/Continuity are all already built or buildable on top of a stable shell. But:

- It is also the **highest-risk** change in the platform, because the Next.js App Router route-segment model is the central obstacle (route changes unmount runtime), and the dead-UI failure the reload shields against is real.
- So it is correctly sequenced **last**, ships **flag-gated**, and **never removes the reload floor**.

The evolution is justified *only* if Navigation Runtime owns failure recovery as a first-class concern. With that, it is the single change that makes the software disappear.

---

# 2 — What Navigation Runtime owns (Q2 + Deliverable 2: Ownership model)

Navigation Runtime is the **single authority for "the foreground operational context is changing."** It owns:

| Owns | Meaning |
|------|---------|
| **The context model** | What the current operational context *is* (workspace / work-view surface / record / drawer-stack), held in the persistent client runtime, **independent of the URL**. |
| **The transition lifecycle** | `intent → acknowledge → prepare (invisible) → hold prior → commit (atomic) → settle` — or `→ recover`. |
| **URL projection** | Serialize context → URL on commit; hydrate URL → context on cold load only. A URL change is **not** a destruction trigger. Owns `pushState`/`replaceState` policy. |
| **History semantics** | Maps browser back/forward to context transitions over retained state (instant back). |
| **The persistence boundary** | Declares what survives a transition (shell, runtime, caches, subscriptions, scroll/focus) and what is released. |
| **Failure recovery** | Detects failed/cancelled/stalled transitions; escalates through recovery tiers; owns the reload floor. |
| **Preparation orchestration** | Warms destination contexts on intent (hover, pointer-down, predictive). |

It explicitly does **not** own — it *coordinates* these (no overlapping ownership):

| Concern | Owner | Navigation Runtime's relationship |
|---------|-------|-----------------------------------|
| Motion curves / choreography | **Motion System** | NavRuntime *invokes* `navigate`/`swap`/`recede` at transition boundaries; Motion plays them. NavRuntime owns *when*, Motion owns *how*. |
| Surface readiness | **Reveal System** | NavRuntime *waits on* the Reveal gate (`above_fold_ready`) before committing the swap; Reveal is the gate, NavRuntime is the sequencer. NavRuntime never reveals a half-ready surface. |
| Data fetching | **Runtime / data layer** | NavRuntime requests preparation; the data layer fetches. |
| Drawer internals | **Drawer System** | NavRuntime owns the drawer-stack *as part of the context model and history*; Drawer owns the drawer's own open/edit/save lifecycle. |
| Domain truth | **Process → Stage → Record** | Unchanged; NavRuntime moves *between* surfaces over that domain. |

---

# 3 — How Navigation Runtime interacts with each subsystem (Q3)

```
            INTENT (click / hover / back)
               │
   ┌───────────▼───────────┐   acknowledge (Motion: instant/spring)
   │  Navigation Runtime   │──────────────────────────────────────────►
   │  (context authority)  │   freeze + HOLD prior surface (no teardown)
   └───────────┬───────────┘
               │ prepare destination INVISIBLY
               │   ├── ask Runtime/data: warm context
               │   └── ask Reveal: is destination above_fold_ready?
               │ when Reveal gate clears:
               │   commit ATOMIC swap (Motion: navigate/swap choreography)
               │   project context → URL (pushState/replaceState)
               │ settle (Motion: settle for deferred values)
               ▼
        interactive; scroll/focus restored per surface
```

- **Motion** — invoked at three boundaries: `acknowledge` on intent (<50ms), `navigate`/`swap` on commit, `recede` for departing transient surfaces. Motion never gates interactivity; NavRuntime never picks a duration. (Tokens already exist: `web/lib/motion/motionTokens.ts`.)
- **Reveal** — NavRuntime holds the prior surface until `computeWorkspace/WorkUnit/Dept RevealGate(...).above_fold_ready` is true for the destination, then commits. The reveal gates become *destination-readiness signals to the sequencer* rather than render-blocking page gates. (The KPI-gating fix already routes real readiness into them.)
- **Continuity** — Navigation Runtime *is* the realized Continuity System. The Experience Layer's `withContinuity(freeze→hold→prepare→swap)` is NavRuntime's core loop. Capability 2 is absorbed here.
- **Drawers** — Drawers are the **existing proof of operational navigation**: `syncOperatorWorkUnitUrlInBrowser` already changes the URL via `replaceState` *without a route remount*, and the drawer model-swap holds prior payload. NavRuntime **generalizes the drawer pattern to every surface level** and becomes the *single* URL/history authority, ending the two-mechanism split (drawer `replaceState` vs surface `assign`). The drawer stack joins the context model → survives refresh (closes DRW-4), gets instant-back.
- **Work Units** — become **runtime context instances** NavRuntime mounts/holds/releases. NavRuntime owns "which work-unit/work-view surface is foreground." (Composes with the Work View model: NavRuntime navigates between Work View *surfaces* hosted in Work Unit *containers*.)
- **Workspace** — the persistent shell (`AdminV2Shell` already stays mounted). NavRuntime guarantees the shell + maximal runtime survive every transition. Workspace root is just another context, not a "home page."
- **Browser history** — NavRuntime maps history entries ↔ context states: `pushState` for back-able context changes, `replaceState` for in-context refinement (drawer open/close already does this). Back/forward restore *retained* context = instant back.
- **URL synchronization** — URL becomes a **projection** (serialize on commit) and a **hydration source on cold load only**. One authority replaces the current `adminV2CommitNavigation` ⊕ `syncOperatorWorkUnitUrlInBrowser` split.

---

# 4 — Module architecture (Deliverable 3)

## New modules (`web/lib/experience/navigation/`)

| Module | Responsibility | Public surface (sketch) |
|--------|----------------|--------------------------|
| `navigationContext.ts` | The context model: a serializable description of the foreground context (surface id, work-view, record/drawer-stack, scroll/focus anchors). | `NavigationContext` type; `serializeToUrl()`, `hydrateFromUrl()` |
| `navigationRuntime.ts` | The transition sequencer: intent → ack → prepare → hold → commit → settle/recover. Single authority. | `navigate(targetContext, opts)`, `back()`, `getContext()`, `subscribe()` |
| `navigationPersistence.ts` | The persistence boundary: navigation-surviving store (sessionStorage-backed VM/bootstrap/context snapshots) so soft nav *and* reload rehydrate warm (NAV-2). | `persistContext()`, `restoreContext()` |
| `navigationHistory.ts` | History entry ↔ context mapping; pushState/replaceState policy; back/forward → context restore. | `recordEntry()`, `onPopState()` |
| `navigationRecovery.ts` | Failure detection + the recovery tiers, incl. the reload floor. | `withRecovery(transition)`, `escalate(reason)` |
| `navigationPreload.ts` | Intent-driven destination warming (generalizes the existing row/dept prewarm). | `warmOnIntent(targetContext)` |

## Modules absorbed or obsoleted (Q4)

| Existing | Disposition |
|----------|-------------|
| `adminV2CommitNavigation` (`window.location.assign`) | **Demoted to recovery floor.** No longer the default commit; called only by `navigationRecovery` Tier 3. |
| `runAdminV2NavigationTransition` | **Absorbed.** Its click-ack → prepare → commit → timeout → supersession loop *is* the transition lifecycle — generalized beyond inbound-only and beyond a single global snapshot into `navigationRuntime`. |
| `syncOperatorWorkUnitUrlInBrowser` (drawer `replaceState`) | **Absorbed** into `navigationContext` URL projection (one authority). |
| The dual paradigm (shallow-for-drawers / reload-for-surfaces, WU-3) | **Collapsed** into one transition model. |
| In-memory-only session caches (slug/bootstrap/VM) | **Superseded** by `navigationPersistence` (survive reload + soft nav). |
| `WorkUnitWorkspaceColdShell` on outbound / warm re-entry | **Obsoleted** by held-prior-surface (the Phase 0 #2 `isLeavingWorkUnitSurface` guard is the interim). |
| Route `loading.tsx` boundaries (already `return null`) | **Obsoleted** — context-transition holds replace route-loading. |

## The central technical decision (named honestly)

Next.js App Router **route-segment changes unmount the subtree** — the structural enemy of persistent runtime. Two ways to preserve runtime across surface changes:

- **(A) One route, client-driven surfaces.** Collapse operator surfaces under a single route segment; surface identity lives in client context + `replaceState` URL — **exactly what drawers already do today.** Lower risk (proven pattern), but the operator surfaces stop being distinct route files.
- **(B) Parallel / intercepting routes.** Use App Router parallel routes so segments coexist without unmount. More "native," but more framework complexity and less proven for this shape.

**Recommendation: (A).** It generalizes a pattern already in production (the drawer URL sync), keeps the blast radius understood, and is reversible. This is the crux decision to ratify before Phase 3.

---

# 5 — Preserving runtime while changing context (Q5)

Yes — this is the defining capability. Mechanism:

1. The shell stays mounted (already true).
2. Surface transitions move from **route-segment swap** (unmount) to **client context-swap** (state change within one persistent route) — decision (A) above.
3. The destination is **prepared as data into the existing runtime**, then only the foreground *surface view* swaps. The React tree, module state, caches, subscriptions, and in-flight work survive.

This is precisely what the drawer layer already proves at the *record* level (`replaceState`, hold-prior-payload, model-swap). Navigation Runtime generalizes it to the *surface* level. Nothing about it is novel to Alloy — it is the drawer pattern, promoted.

---

# 6 — Failure recovery (Q6) — the reason this can ship at all

Every transition is fallible. Navigation Runtime treats recovery as first-class, in tiers:

| Tier | Trigger | Behavior | Operator perception |
|------|---------|----------|---------------------|
| **0 — Supersession** | Operator re-navigates mid-transition | Abort the in-flight transition cleanly (generalize `runAdminV2NavigationTransition`'s `activeRunId`). No dead UI. | New intent simply wins. |
| **1 — Hold + retry** | Preparation misses its budget (timeout, e.g. 1500ms) | Keep the **held prior surface**, retry preparation. | Still on the stable surface; no break. |
| **2 — Degraded reveal** | Partial readiness, slow region | Reveal the destination under the gate's **bounded degraded semantics** (the same empty/error/cached readiness the KPI fix established). | A partial-but-honest surface, never a hang. |
| **3 — Reload floor** | Client runtime inconsistent / unrecoverable (the dead-UI case) | **Deliberate `window.location.assign(targetUrl)`.** Guaranteed-correct cold rebuild. | A rare full reload — correct, not default. |

Plus: **surface-level error boundaries** so a failed mount reveals a recoverable in-context error, never a white shell.

**Instrumentation is the gate to flipping the default:** track `cancelled_nav_rate`, `fallback_to_reload_rate`, `transition_latency`. The reload floor is only ever demoted from default — never removed. If `fallback_to_reload_rate` is non-trivial, the resilience isn't ready; the floor carries the load until it is.

---

# 7 — Migration strategy (Deliverable 4) — converge, never rewrite

Build the runtime *alongside* the reload; prove resilience; flip the default per-surface; keep the floor.

**Risk controls applied throughout:** flag-gated, per-surface rollout, reload floor never removed, hard metrics on cancelled-nav / fallback / latency, parity tests on URL ⇄ context / back-forward / deep-link / refresh.

---

# 8 — Implementation phases (Deliverable 5)

| Phase | Goal | Behavior change | Risk | State (2026-07) |
|-------|------|-----------------|------|-----------------|
| **0 — Instrument & contain** | Know the real cancelled-nav rate that justified the reload. Add transition + fallback instrumentation to *current* paths. Land held-prior-surface guards (started: outbound skeleton). | None | None | ✅ **Shipped** — Surface Hold, Queue Hold, `isLeavingWorkUnitSurface` outbound guard. |
| **1 — Context model + URL authority** | Introduce the context model as the single URL-projection authority; unify the drawer `replaceState` path and surface path **without changing the surface commit mechanism yet**. | None visible (drawers already work this way) | Low | ✅ **Shipped as the Surface Host** — `SurfaceHostProvider` owns `{ current, outgoing, incoming, phase }`; `surfaceRef` hydration on cold load; canonical Host rendering of the work-unit surface (route is seed-only). URL sync inside a surface still runs via the controller (full projection authority = Phase 3/5). |
| **2 — Persistence boundary** | Navigation-surviving store; soft nav *and* reload rehydrate warm (NAV-2). | Re-entry is warm; still reloads on surface nav | Low–Med | ⬜ **Remaining** — the work-unit identity module cache (`workUnitSlugRouteCache`) is an in-memory seed only; the sessionStorage-backed persistence tier is not built. |
| **3 — Soft surface transitions (flagged)** | Decision (A): surface change = client context-swap, not route unmount. Wire freeze → prepare → hold → commit, invoking Reveal (gate) + Motion (`navigate`). **Reload retained as automatic Tier-3 fallback**, gated on the resilience contract. Roll out **one surface at a time**, watching `fallback_to_reload_rate`. | The OS feel begins, per surface | **High** | 🟡 **Partial** — soft nav (`router.push`) for WS↔WU with the watchdog **reload floor** shipped; render ownership moved to the Host. The **exchange choreography** (hold outgoing → exit+enter → settle; the reducer's `navigate/settle/cancel`) is the primary remaining Surface Host work. |
| **4 — Instant back + history + predictive preload** | Map back/forward to retained context; `pushState` semantics; warm destinations on intent. | Instant back; many transitions become instant | Med | ⬜ **Remaining** — back/forward currently re-hydrate via `popstate` (not retained-context restore). |
| **5 — Collapse the dual paradigm + retire modules** | Retire `adminV2CommitNavigation` as default; fold `runAdminV2NavigationTransition` + `syncOperatorWorkUnitUrlInBrowser` into the runtime; remove the outbound cold-shell interim. | One navigation physics everywhere | Med | ⬜ **Remaining** — both paths still coexist; the reload floor is retained by design and is *never* removed, only demoted. |

This *is* the detailed design of the roadmap's deferred **Track 1 (Persistent Runtime)** keystone — now realized as the Surface Host.

---

# Capabilities unlocked once Navigation Runtime exists (Q8)

| Capability | Mechanism |
|------------|-----------|
| **Instant back** | Back restores retained context from the persistence boundary — zero fetch. |
| **Predictive preload** | Intent (hover/pointer-down) warms the destination context into the live runtime before commit; many transitions become instant. |
| **Persistent runtime** | Subscriptions, in-flight work, scroll/focus, ambient state survive — no reconstruction tax. |
| **Surface swaps** | Atomic foreground changes — the OS feel. |
| **Cross-workspace continuity** | Move between processes/workspaces without losing the surrounding runtime; the back-stack spans them. |
| **Drawer continuity** | Drawers + surfaces share one history/URL authority; the drawer stack survives refresh; linked-drawer and surface nav unify. |
| **Optimistic navigation** | Commit on intent, prepare in background (`commitFirst` already exists); on prep failure, recover via the tiers. The operator never waits for navigation. |

---

## Relationship to existing doctrine

- **Realizes** Experience Doctrine Law 2 (Continuity) + Law 3 (Memory) at the navigation level.
- **Absorbs** Experience Layer Capabilities 2 (Continuity System) + 6 (Navigation Continuity) — those entries in `experience-layer-architecture.md` now point here.
- **Depends on** the Motion System (built) and the Reveal System (KPI-gating shipped; full generalization is Experience Layer Step 3).
- **Does not weaken** the locked performance/reveal doctrine — it changes *who sequences* the reveal (NavRuntime waits on the gate) without weakening the gate. Any change to the locked docs rides the implementing PR.

## When this doc must be updated

Ratification of decision (A) vs (B); a change to the recovery tiers or the reload-floor policy; a change to the context model or URL-projection contract; or a phase completing.
