# Experience Audit — Premium Operational Experience Sprint

**Path:** `docs/sprints/archive/06_2026/premium-operational-experience/experience-audit.md`
**Status:** Audit (June 2026). Evidence base for the Operational Experience Doctrine and Operational Motion Doctrine.
**Method:** Six parallel subsystem investigations grounded in code (workspace, work-unit/queue, drawers, cards, navigation/runtime, motion), cross-read against the locked performance/reveal doctrines.

---

## The one-sentence finding

Alloy already owns the contracts for a premium experience — atomic reveal gates, warm prefetch, hold-prior-payload, optimistic save coordination, shallow-URL drawers — **but the illusion holds only inside a surface and shatters at every surface boundary.** The platform knows how to disappear. It stops doing it at the seams.

Three structural reasons, each owned by exactly one subsystem:

| # | Structural gap | Owner | What the operator feels |
|---|----------------|-------|--------------------------|
| A | Global navigation is a full `window.location.assign()` document reload | **Navigation** | Entering a work unit reloads the world: scroll resets, motion state dies, caches wipe, the shell blinks |
| B | The atomic-reveal law is selectively un-enforced (KPI region, editable cards) | **Runtime** | The workspace assembles itself piece by piece even though the gate that would prevent it exists |
| C | There is no motion language — 50+ scattered durations, no tokens, no owner | **Motion System** (does not yet exist) | Every movement is a different speed; nothing feels like it came from one mind |

Everything below is a specific instance of A, B, or C.

---

## How to read this audit

Each issue follows the sprint's required frame:

- **Current behavior** — what actually happens, with `file:line`.
- **Operator perception** — what they believe is happening; where confidence breaks.
- **Owner** — exactly one subsystem. (Surface owners decide *when* something may change; the Motion System decides *how* it moves. No overlap — see the ownership model in the Experience Doctrine.)
- **Root cause** — why it exists. Often: a deliberate trade-off, not a bug.
- **Desired experience** — the perception we want. Experience first, never implementation.
- **Visual choreography** — frame by frame.
- **Implementation strategy** — last, never first.

Issues are grouped by surface. Each carries an ID (`WS-1`, `WU-2`, …) used by the [Moments of Broken Illusion](./moments-of-broken-illusion.md) punch list and the [Sprint Roadmap](./sprint-roadmap.md).

---

# Part 1 — Navigation & Runtime (the foundation)

These two issues are the root of most surface-level symptoms. Fixing them upgrades every surface at once.

## NAV-1 — Work-unit navigation is a full page reload

**Current behavior.** Operator navigation between surfaces commits through `adminV2CommitNavigation()`, which calls `window.location.assign()` — a complete document reload — rather than Next.js soft routing. ([web/lib/adminV2/shellNavigation.ts:28](web/lib/adminV2/shellNavigation.ts), `AdminV2NavLink` click handler [web/app/adminV2/components/navigation/AdminV2NavLink.tsx:59](web/app/adminV2/components/navigation/AdminV2NavLink.tsx).) The layout re-renders, the bootstrap re-fetches, the DOM churns, and all in-memory session caches (slug route cache, bootstrap cache, drawer VM cache) are wiped.

**Operator perception.** "I clicked a queue and the screen reloaded." Scroll position resets, focus is lost, any in-flight motion snaps to its end state, and the sidebar visibly re-mounts. The shell *appears* persistent only because Next.js re-mounts the layout layer fast — it is not actually surviving the navigation. This is the single loudest "I am using a website" signal in the product.

**Owner.** Navigation.

**Root cause.** Intentional. The comment at [AdminV2NavLink.tsx:30](web/app/adminV2/components/navigation/AdminV2NavLink.tsx) is explicit: full reload "avoids dead UI from cancelled `router.push` / soft `<Link>` transitions during heavy RSC work." The work-unit page is a heavy `"use client"` surface whose data is fetched client-side after mount; under load, the App Router can cancel a soft navigation and leave a dead frame. Full reload is a *correctness shield* against that failure mode. It trades the OS illusion for reliability.

**Desired experience.** The operator never leaves. Clicking a work unit changes the operational context the way switching apps on a well-built OS changes the foreground — the frame stays, the content swaps, prior state is held until the new state is ready, and nothing reloads. Confidence is continuous because the world never blinks.

**Visual choreography.**
```
Click queue / work unit
  ↓  (<50ms) selection acknowledges — target tile lifts/holds
  ↓  current surface FREEZES in place (no teardown, no scroll reset)
  ↓  destination prepares invisibly behind the frozen surface (warm cache or fetch)
  ↓  atomic crossfade: frozen surface → ready destination (one motion, ~200ms)
  ↓  interactive — scroll/focus restored per-surface
```
Never: `Click → reload → blank → shell remount → cold shell shimmer → content`.

**Implementation strategy.** This is the sprint's highest-value, highest-risk move; it earns its own track.
1. Make the work-unit surface resilient to soft navigation so the original reason for the full reload disappears: move slug resolution + critical bootstrap into a route handler / RSC boundary (or a navigation-blocking warm step) so `router.push` cannot land on a computing page.
2. Replace `window.location.assign()` with intercepted soft navigation behind a feature flag, gated on the new resilience.
3. Promote the in-memory caches to a navigation-surviving store so soft nav keeps them warm (see NAV-2).
4. Keep the full-reload path as an automatic fallback when the resilience contract is not met, instrumented so we can watch cancelled-navigation rates.

See the roadmap: this is **Track 1 (Persistent Runtime)** and must not be attempted before its dependencies.

---

## NAV-2 — Caches are in-memory and die on every hard load

**Current behavior.** Slug route cache, bootstrap session cache, and drawer VM session cache are in-memory `Map`s with session TTLs. ([web/lib/admin/workUnitSlugRouteCache.ts](web/lib/admin/workUnitSlugRouteCache.ts), `drawerViewModelSessionCache`.) They survive *soft* navigation but are cleared by the NAV-1 reload and by any hard refresh.

**Operator perception.** "I was just here ten seconds ago — why is it loading again?" Re-entering a work unit, or reopening a record just closed, pays a cold fetch as if it were never seen. The product has no memory of the immediate past.

**Owner.** Runtime.

**Root cause.** Caches were designed for the within-session warm path (hover prewarm → instant open). Persistence beyond the page lifetime was never built, and NAV-1's reload makes the in-memory choice moot anyway — there is nothing to persist *to* across a reload.

**Desired experience.** Recently-touched context is instantly warm. The operator's last few surfaces and records feel "already open." Returning is free.

**Visual choreography.** Re-entry to a recently-visited surface skips the cold shell entirely: `Click → (cache hit) → atomic reveal`. No shimmer, because there is nothing to wait for.

**Implementation strategy.** Introduce a navigation-surviving cache tier (sessionStorage-backed VM/bootstrap snapshots with the existing TTL contracts) so that (a) soft navigation under NAV-1 keeps state warm and (b) hard reload rehydrates the last surface from a snapshot before the network responds. Couples tightly to NAV-1; same track.

---

# Part 2 — Workspace

## WS-1 — KPI strip reveals after the rest of the surface

**Current behavior.** The workspace reveal gate has a `kpi_region_ready` phase — but `workspaceRevealKpiRegionReady()` returns `true` unconditionally ([web/lib/adminV2/workspaceRevealGate.ts:129](web/lib/adminV2/workspaceRevealGate.ts)), so the gate never waits for KPI data. KPI placements are fetched as deferred background work (`scheduleAdminV2BackgroundWork(..., { idleTimeoutMs: 2500 })`) *after* the page has already revealed ([web/app/adminV2/workspace/page.tsx:371](web/app/adminV2/workspace/page.tsx)). On the work-unit surface the parallel gate `workUnitRevealKpiReady()` is correctly *defined* but **never included** in `computeWorkUnitRevealGate()`.

**Operator perception.** The header and tiles appear, the operator's eye settles — and then numbers fade into the KPI strip a beat later. The surface looks like it is still finishing assembling itself. Even when the geometry is reserved ("quiet reserve"), the *value appearing* draws the eye and reads as load.

**Owner.** Runtime (reveal gate). KPI System owns sourcing the values; Runtime owns *when the region is allowed to reveal*.

**Root cause.** A sanctioned escape hatch. The current reveal doctrine explicitly *permits* deferred KPI as "quiet reserve … no metric-card skeleton wave." The intent was good — don't block first paint on a slow rollup query. But "quiet reserve" became a loophole: the values still pop in visibly, and the law that would have held them is bypassed rather than satisfied.

**Desired experience.** Either the KPI values are present at reveal, or their later arrival is *imperceptible* — they must not be caught by the eye. The workspace is one surface that is either not-yet-here or fully-here. There is no in-between state the operator can watch.

**Visual choreography.**
```
Navigate
  ↓  one branded loading surface
  ↓  above-fold contract resolves INCLUDING KPI (warm) OR reserves KPI invisibly
  ↓  entire surface — header, tiles, KPI, actions — reveals as one frame
  ↓  if a value was genuinely deferred, it SETTLES (not flashes) below the eye's threshold
```

**Implementation strategy.** Two-tier rule (formalized in the Experience Doctrine §"The Reveal Law"):
1. **Default:** KPI is part of the atomic above-fold bundle. Fix the gate — `workspaceRevealKpiRegionReady()` returns `false` until placements settle; add `kpi_ready` to `computeWorkUnitRevealGate()`. Move the KPI fetch into the critical bootstrap, not background work.
2. **Exception (slow-rollup only):** if a value is *provably* slow, it may defer — but its arrival is governed by the Motion Doctrine's "settle, don't announce" rule (no flash, sub-threshold opacity ramp into already-reserved geometry). Deferral becomes a motion contract, not a gap.

---

## WS-2 — Health metrics and sections have independent fetch owners

**Current behavior.** Queue summaries are owned by the page component; the operational/health region is hydrated by the department bootstrap separately; KPI is its own deferred fetch (WS-1). There is no single "operational bootstrap" that bundles summaries + metrics + KPI into one readiness signal. ([web/app/adminV2/workspace/page.tsx:272](web/app/adminV2/workspace/page.tsx) — dept and work-unit GETs run in parallel but are not bundled with KPI/metrics.)

**Operator perception.** The workspace "appears to assemble itself" — different regions resolve on their own clocks. Even sub-second, the staggering registers as construction.

**Owner.** Workspace (composition); leans on Runtime for the bundle contract.

**Root cause.** Regions were built incrementally, each wiring its own fetch. The reveal gate coordinates *paint* but not *data ownership* — so the gate can pass while a region's owner is still resolving, producing a late in-region update.

**Desired experience.** One coherent operational surface. Nothing changes, or everything is ready. No visible construction order.

**Visual choreography.** Identical to WS-1: a single above-fold contract that no region is exempt from.

**Implementation strategy.** Define one workspace above-fold readiness object that *all* above-fold regions feed (summaries, health/operational, KPI, actions). The gate reveals only when the object is complete. Regions may still *refine* after reveal — but only under the Motion Doctrine's settle rule, in reserved geometry.

---

# Part 3 — Work Unit & Queue

## WU-1 — A skeleton appears while *leaving* a work unit

**Current behavior.** Exiting a work unit unmounts `WorkUnitSlugRouteHost`, which renders `WorkUnitWorkspaceColdShell` (lifecycle-style card + lane loader skeleton) during the re-warm. ([web/components/admin/workspace/WorkUnitSlugRouteHost.tsx:106](web/components/admin/workspace/WorkUnitSlugRouteHost.tsx).) Because exit is a full route change (NAV-1), the host genuinely remounts.

**Operator perception.** "Why am I seeing a loading skeleton on my way *out*?" Loading states belong to arrival, not departure. A skeleton on exit tells the operator the software is doing bookkeeping they should never witness.

**Owner.** Navigation (the route change triggers the remount). The skeleton itself is Work Unit, but it would never render if exit weren't a remount.

**Root cause.** Direct consequence of NAV-1. Exit = route change = host unmount = cold shell.

**Desired experience.** Leaving is instantaneous and silent. The operational context simply changes; the operator does not perceive a "leave" event at all.

**Visual choreography.**
```
Back / switch
  ↓  (<50ms) the destination (queue) is ALREADY mounted underneath — reveal it
  ↓  current work-unit surface lifts away in one motion
  ↓  queue is interactive immediately (state held, not re-fetched)
```
Never a skeleton on the *outbound* path.

**Implementation strategy.** Resolves automatically when NAV-1 becomes soft navigation with a persistent shell — the queue never unmounts, so there is nothing to skeleton. Until then, suppress the cold shell on the *outbound* transition (only show arrival loading, never departure loading).

## WU-2 — Back-navigation briefly exposes a stale queue

**Current behavior.** On a pathname change, `AdminDrawerContext` detects the change and calls `closeDrawer()` ([web/contexts/AdminDrawerContext.tsx:1307](web/contexts/AdminDrawerContext.tsx)). The queue behind it is rendered from a client cache (`peekCachedQueueItemsForPill`) that was last touched before the drawer opened and was never invalidated while the drawer was up. So the first frame after back shows rows from a previous session state. ([web/lib/workspace/workUnitQueueLaneDisplay.ts:49](web/lib/workspace/workUnitQueueLaneDisplay.ts).)

**Operator perception.** "Did my action not save? That row still shows the old status." A flash of stale truth undermines confidence in the most load-bearing way possible — it makes the operator doubt whether their work took effect.

**Owner.** Queue (cache validity). The close is Drawer; the *staleness* is the queue cache's invalidation contract.

**Root cause.** The queue cache is a warm-display optimization with no invalidation hook tied to mutations that happened inside the drawer. Hold-prior-payload (good for continuity) without revalidate-on-return (needed for truth) yields a stale flash.

**Desired experience.** The queue the operator returns to reflects what they just did. Continuity *and* truth: the prior rows may be held for zero-flicker, but any row the operator touched is already correct, and the rest revalidates invisibly.

**Visual choreography.**
```
Close drawer / back to queue
  ↓  queue revealed instantly from held payload (no skeleton)
  ↓  any row mutated during the drawer session shows its NEW value already (optimistic carry-through)
  ↓  background revalidation settles remaining rows silently (Motion: settle, don't flash)
```

**Implementation strategy.** Carry the drawer's optimistic patches through to the queue cache on close (the save coordinator already knows what changed — see CARD-2), and trigger a silent revalidation of the lane on return. The held payload provides continuity; the optimistic carry-through provides truth at the first frame; revalidation reconciles the rest under the settle rule.

## WU-3 — Two navigation paradigms inside one surface

**Current behavior.** Within a work unit, drawer↔queue transitions use shallow `replaceState` (no remount — OS-like). Exiting the work unit or switching surface uses full route navigation (NAV-1 — website-like). The two coexist, so the *same gesture class* (going somewhere) sometimes feels instant and sometimes feels like a page load.

**Operator perception.** Inconsistent physics. Opening a record is silky; switching work units jolts. The operator cannot form a stable mental model of "what happens when I go somewhere," so they stay slightly braced.

**Owner.** Navigation.

**Root cause.** The drawer layer was upgraded to shallow-URL continuity; the surface layer was not (NAV-1). The product is half-converted to an OS.

**Desired experience.** One physics for all navigation. Every "go somewhere" — record, work unit, department, workspace — obeys the same continuity contract.

**Visual choreography.** Unify on the drawer layer's physics: freeze → prepare → atomic swap, for *every* level of navigation.

**Implementation strategy.** Subsumed by NAV-1. Once surface navigation is soft and shell-persistent, both paradigms collapse into one.

---

# Part 4 — Drawers

The drawer subsystem is the most mature surface — model-swap phase machine, hold-prior-payload, optimistic save coordinator. Its gaps are almost entirely **motion** and **trust**, not data.

## DRW-1 — Drawers have no close animation

**Current behavior.** Open has motion (modal: `animate-in fade-in zoom-in-[0.99] duration-300` [web/components/admin/Drawer.tsx:576](web/components/admin/Drawer.tsx)). Close has none — the portal unmounts instantly; only the backdrop fades (200ms). Sidebar-presentation drawers have **no entry animation either**.

**Operator perception.** The record vanishes. Focus snaps back to the queue with a jolt. Asymmetric motion (smooth in, hard out) feels broken in a way operators feel but can't name.

**Owner.** Motion System (the *how*); Drawer owns *when* close is allowed.

**Root cause.** `Drawer.tsx` has an entry `animate-in` class but no exit class; portals unmount synchronously, so there is no exit window unless one is engineered. No shared motion language meant no default close choreography to inherit.

**Desired experience.** The record recedes as gracefully as it arrived. Closing is a deliberate, reversible-feeling motion — the operator's attention is *handed back* to the queue, not dropped.

**Visual choreography.**
```
Close
  ↓  drawer content + panel ease out (fade + slight scale/slide), ~180ms
  ↓  backdrop fades in concert
  ↓  queue beneath gently regains focus (subtle, not a pop)
```

**Implementation strategy.** Engineer an exit window (keep the portal mounted for the exit duration via the existing phase machine), apply a Motion-token-defined close choreography symmetric to open. Give sidebar drawers a `slide-in-from-right` entry (already available in Tailwind, unused). This is a Motion Doctrine adoption, not a drawer rewrite.

## DRW-2 — Drawer→drawer swaps jump (no crossfade, stale flash)

**Current behavior.** Linked navigation uses a phase machine (`swap_preparing → applying_vm`) that *holds prior content* while the target VM fetches — good. But when the target applies, the body content switches with **no visual transition** ([drawerRuntimePhase.ts](web/lib/adminV2/viewModel/drawer/drawerRuntimePhase.ts)); on a slow fetch the operator sees the *old* record's data, then it hard-cuts to the new one.

**Operator perception.** "Wait — was that the right record? Did it reload?" The hard cut from stale to fresh is ambiguous: the operator can't tell if data updated or the drawer reloaded. Worse, briefly seeing the *previous* person's name under the *new* person's header is a trust hazard.

**Owner.** Motion System (crossfade); Drawer owns swap readiness.

**Root cause.** The phase machine governs logical readiness but never had a motion phase. Hold-prior-payload solved blank-flash but introduced stale-visible, and no crossfade exists to make the handoff legible.

**Desired experience.** One record dissolves into the next. The handoff is a single, legible motion that says "you have moved to a new record," never "the page reloaded."

**Visual choreography.**
```
Open linked record
  ↓  prior record held, target prepares invisibly
  ↓  when target ready: prior content crossfades to new content (~160ms)
  ↓  header identity swaps WITH the body, never ahead of it
```
Critically: identity (name/avatar) and body must swap *together* so the operator never sees a mismatched header/body pair.

**Implementation strategy.** Add a motion phase to the swap machine: on `applying_vm`, crossfade old→new under a Motion token; ensure header and body apply atomically from the same VM commit. Hold-prior-payload stays; it just gets a graceful exit.

## DRW-3 — Opportunity drawer silently discards unsaved edits

**Current behavior.** The unsaved-changes guard (`PersonDrawerUnsavedChangesModal`, `drawerOperatingIsDirty()`) is wired **only** for the Person drawer ([web/contexts/AdminDrawerContext.tsx:88](web/contexts/AdminDrawerContext.tsx)). The Opportunity drawer ignores dirty state on back/close — edits are silently dropped.

**Operator perception.** Catastrophic when it bites: "I typed all that and it's gone." This is not a polish issue; it is a **trust-and-data-integrity** failure. One occurrence permanently lowers the operator's willingness to trust inline editing.

**Owner.** Drawer.

**Root cause.** The dirty-guard was implemented per-drawer rather than as a platform contract of the save coordinator. As editing spreads to more drawers (and cards — see CARD-1), the gap widens.

**Desired experience.** The operator's in-progress work is sacred. Leaving with unsaved changes always prompts, everywhere, identically. The operator never loses keystrokes to a navigation.

**Visual choreography.**
```
Back / close with dirty state (ANY drawer)
  ↓  motion pauses; unsaved-changes affordance presents
  ↓  Save / Discard / Keep editing — consistent wording and placement everywhere
```

**Implementation strategy.** Lift the dirty-guard into the save coordinator as a platform invariant: any registered edit section that `isDirty()` blocks close/back with the standard affordance, regardless of drawer type. This is part of the **Editable Card / Edit-Mode interaction doctrine** the sprint asked us to determine the need for — and the answer is yes (see CARD-1).

## DRW-4 — The drawer stack is lost on refresh

**Current behavior.** The navigation stack (Opportunity → Person → Location → back → back) lives in React state only. A refresh restores the *current* drawer from the URL `:recordId` segment but discards the stack ([web/contexts/AdminDrawerContext.tsx](web/contexts/AdminDrawerContext.tsx)), so "back" is gone.

**Operator perception.** "I can't get back to where I was." After a refresh, the breadcrumb trail evaporates. Minor in frequency, but it contradicts the OS promise that context is durable.

**Owner.** Drawer (state durability); related to NAV-2.

**Root cause.** Stack is ephemeral React state with no serialization to URL or storage.

**Desired experience.** The operator's path is durable. Refresh restores not just the current record but the trail that led there.

**Implementation strategy.** Serialize the stack to the navigation-surviving store (NAV-2) or encode it in URL state; rehydrate on mount. Low priority relative to NAV-1/NAV-2 but rides their infrastructure.

## DRW-5 — Cold drawer open shows a "Preparing record…" overlay

**Current behavior.** Opportunity drawer cold-open waits for bootstrap + `drawer_primary` + header actions behind an `OpportunityDrawerOpeningOverlay` ("Preparing record…", ~500–1500ms cold) before the drawer mounts ([OpportunityDrawerOpeningOverlay.tsx](web/components/admin/OpportunityDrawerOpeningOverlay.tsx)). Warm (prefetched) opens skip it.

**Operator perception.** On the warm path: instant, excellent. On the cold path: a branded wait that, while honest, is still a *wait the operator is asked to watch*. The overlay is the polite version of a spinner.

**Owner.** Runtime (warmth); Drawer owns the overlay presentation.

**Root cause.** Cold open has a real sequential dependency chain (open → bootstrap → primary → mount) and no prefetch was possible because the open was unanticipated (e.g., deep link, cold cache after NAV-1 reload).

**Desired experience.** Opens feel instant because the record was already warm. The cold path is the rare exception, and when it happens the wait is sub-second and feels like focus arriving, not like loading.

**Implementation strategy.** Maximize warm-open coverage (NAV-2 persistence means recently-seen records stay warm; broaden row-intent prefetch). Where cold open is unavoidable, the overlay obeys Motion tokens (one branded surface, no internal skeleton wave) — which it largely already does.

---

# Part 5 — Cards & Editable Cards

## CARD-1 — Editable cards run two competing interaction models with no save-acknowledgement standard

**Current behavior.** Cards themselves are clean: stateless, parent-fed renderers; no self-fetch; parent-owned fixed-geometry skeletons; height-locked refresh prevents layout jump ([QueueBlock.tsx:1787](web/app/adminV2/components/workspace/blocks/QueueBlock.tsx)). **Editing**, however, has two patterns colliding:

- **Pattern A (preferred):** `LayoutRuntimeDrawerEditProvider` — inline edit, **optimistic** patch dispatch, coordinated multi-section save via `registerDrawerOperatingEditSection()`, queue refresh on save ([web/components/layout/LayoutRuntimeDrawerEditProvider.tsx](web/components/layout/LayoutRuntimeDrawerEditProvider.tsx)).
- **Pattern B (legacy):** `EditablePersonContactCard` — self-managed state, **pessimistic** blur-save, own error handling, `savedFlash` feedback, no coordination ([web/components/admin/opportunity/EditablePersonContactCard.tsx:67](web/components/admin/opportunity/EditablePersonContactCard.tsx)).

There is **no shared save-acknowledgement**: Pattern A fires an `onSaved` callback with no required visual; Pattern B sets a local flash. Optimism is per-pattern. Inline-vs-toggle is per-pattern. Dirty-guarding is per-drawer (DRW-3).

**Operator perception.** Editing one card feels different from editing another — one confirms with a flash, one doesn't confirm at all; one updates instantly, one waits for the network; one warns before you leave, one drops your work (DRW-3). The operator cannot trust a single mental model for "edit a thing," so editing never feels safe.

**Owner.** Card Runtime (editable-card interaction model).

**Root cause.** Editable cards arrived feature-by-feature before a doctrine existed. Two teams solved the same problem two ways. **This directly answers the sprint's open question — "do editable cards require additional interaction doctrine?" Yes.** Without one, every new editable card forks the model again.

**Desired experience.** Editing anything in Alloy feels the same and feels safe: changes apply instantly (optimistic), are acknowledged identically, are protected on exit, and roll back legibly on failure. Edit is a single, learnable verb.

**Visual choreography.**
```
Edit a field (any card, anywhere)
  ↓  field enters edit affordance instantly (one inline model)
  ↓  on commit: value updates OPTIMISTICALLY (<50ms), no spinner
  ↓  a single, identical save-acknowledgement (quiet check / settle), same everywhere
  ↓  on failure: value rolls back with a legible, consistent error — never silent
  ↓  on exit with unsaved work: identical guard (DRW-3)
```

**Implementation strategy.** Author the **Editable Card Interaction Doctrine** (the sprint deliverable this issue motivates), encoded in the Experience Doctrine §"The Editing Law" and the Premium Interaction Principles. Decide and lock: inline edit (not mode-toggle) as default; optimistic-by-default with coordinated save; one save-acknowledgement primitive (Motion-token'd); universal dirty-guard (DRW-3); legible rollback. Then migrate Pattern B onto Pattern A and delete the fork.

## CARD-2 — Optimistic patches don't carry through to the queue on close

**Current behavior.** The save coordinator applies optimistic patches to the drawer VM and confirms server-side per section, with per-section rollback ([drawerOperatingSaveCoordinator.ts](web/lib/admin/drawer/drawerOperatingSaveCoordinator.ts)) — excellent within the drawer. But those patches are not propagated to the queue cache, which is why WU-2 shows stale rows on return.

**Operator perception.** See WU-2 — the edit "didn't take" on the queue even though it took in the drawer.

**Owner.** Card Runtime / Drawer (the patch origin); the *display* gap is Queue (WU-2). The fix lives at the seam and is owned by the save coordinator that knows the diff.

**Root cause.** Optimism is scoped to the drawer VM; there is no publish step to sibling surfaces holding the same record.

**Desired experience.** A change made anywhere is reflected everywhere it is visible, instantly. The record is one truth, not per-surface copies.

**Implementation strategy.** On save (optimistic apply), publish the patch to a shared record-patch channel that the queue lane subscribes to; the queue updates the matching row optimistically and revalidates silently. This is the mechanism behind WU-2's "optimistic carry-through."

---

# Part 6 — Motion (cross-cutting)

## MOT-1 — There is no motion language

**Current behavior.** No animation library. All motion is native CSS keyframes/transitions plus Tailwind `animate-pulse`. **50+ distinct duration values** (0.05s → 9.5s) and **three ad-hoc easings** are scattered across four CSS files; **50 keyframes**; **no central tokens, no documentation, no owner, no governance.** Route fade is 140ms, drawer enter 200ms, card enter 220ms — no shared rhythm. Skeleton stagger delays (55/70/90/110/120/160ms) create micro-waves. (Inventory: `app/globals.css`, `app/adminV2/adminV2.css`, `app/adminV2/components/workspace/workspace.css`, `app/adminV2/components/bos/identity/bosIdentity.css`.)

**Operator perception.** Cumulative, subliminal incoherence. No single motion is "wrong," but nothing feels like it came from one mind. The product lacks the signature continuity that makes premium software feel alive and intentional. This is the difference between "a competent app" and "an instrument."

**Owner.** Motion System — **which does not yet exist and must be created.**

**Root cause.** Performance was the priority; the reveal doctrine solved *when* things appear but is silent on *how* they move. Typography earned a tokenized 6-tier system (`presentationTypography.ts`); motion never did. With no owner and no tokens, every engineer chose their own timing.

**Desired experience.** Every movement in Alloy originates from one coherent motion language — the same handful of durations and curves, the same choreography vocabulary, applied everywhere. Motion communicates continuity, confidence, and progress; it never merely reveals implementation.

**Implementation strategy.** Author the **Operational Motion Doctrine** and ship `web/lib/motion/motionTokens.ts` mirroring the typography-token precedent: a small set of durations (instant/micro/standard/expressive), a named easing palette, and named choreographies (reveal, swap, settle, acknowledge, recede). Migrate the four CSS files onto tokens. Add motion to code review. Every issue above with a Motion owner draws its `how` from this doctrine.

## MOT-2 — Deferred values "announce" instead of "settle"

**Current behavior.** When deferred data lands (KPI quiet reserve, hydrate flash `adminv2-opportunity-hydrate-flash` 260ms), it arrives with enough visual energy to catch the eye, even in reserved geometry.

**Operator perception.** The eye is pulled to a number that just appeared — a micro-interruption that reads as "still loading."

**Owner.** Motion System.

**Root cause.** No "settle" choreography exists; late arrivals use entrance animations meant for *new* content, not *refined* content.

**Desired experience.** Values that were always going to be there appear as if they were always there. Refinement is below the threshold of attention.

**Implementation strategy.** Define a Motion "settle" token (sub-threshold opacity ramp, no scale/flash, into reserved geometry) and apply it to all post-reveal value refinement, including the sanctioned KPI deferral exception in WS-1.

---

## Ownership map (no overlaps)

The sprint requires exactly one owner per behavior. The clean rule: **the surface owner decides *when* a change is permitted; the Motion System decides *how* it moves when permitted.**

| Behavior | When (surface owner) | How (motion) |
|----------|----------------------|--------------|
| Surface navigation / shell persistence | Navigation | Motion |
| Data readiness, reveal gates, caches, persistence | Runtime | — |
| Workspace root composition | Workspace | Motion |
| Work-unit surface + queue lane mount | Work Unit | Motion |
| Queue row validity / cache invalidation | Queue | Motion |
| Drawer lifecycle, stack, dirty-guard, save orchestration | Drawer | Motion |
| Card render + editable-card interaction model | Card Runtime | Motion |
| KPI value sourcing / refinement | KPI System | Motion |
| Selection / focus acknowledgement | Focus System | Motion |
| All durations, easings, choreography | — | **Motion System** |

---

## Index of issues

| ID | Title | Owner | Severity | Track |
|----|-------|-------|----------|-------|
| NAV-1 | Work-unit navigation is a full page reload | Navigation | 5 | 1 — Persistent Runtime |
| NAV-2 | Caches die on every hard load | Runtime | 4 | 1 — Persistent Runtime |
| WS-1 | KPI strip reveals after the surface | Runtime | 3 | 2 — Reveal Law |
| WS-2 | Sections have independent fetch owners | Workspace | 3 | 2 — Reveal Law |
| WU-1 | Skeleton appears while *leaving* | Navigation | 4 | 1 — Persistent Runtime |
| WU-2 | Stale queue on back-navigation | Queue | 4 | 2 — Reveal Law |
| WU-3 | Two navigation paradigms in one surface | Navigation | 3 | 1 — Persistent Runtime |
| DRW-1 | No drawer close animation | Motion | 3 | 3 — Motion Language |
| DRW-2 | Drawer→drawer swaps jump | Motion | 3 | 3 — Motion Language |
| DRW-3 | Opportunity drawer discards unsaved edits | Drawer | 4 | 4 — Editing Law |
| DRW-4 | Drawer stack lost on refresh | Drawer | 2 | 1 — Persistent Runtime |
| DRW-5 | Cold drawer "Preparing record…" overlay | Runtime | 2 | 1 — Persistent Runtime |
| CARD-1 | Editable cards: two models, no save-ack | Card Runtime | 3 | 4 — Editing Law |
| CARD-2 | Optimistic patches don't reach the queue | Card Runtime | 3 | 2 — Reveal Law |
| MOT-1 | No motion language | Motion | 3 | 3 — Motion Language |
| MOT-2 | Deferred values announce instead of settle | Motion | 2 | 3 — Motion Language |

Severity, frequency, complexity, and ROI scoring for each is in [Moments of Broken Illusion](./moments-of-broken-illusion.md). Sequencing is in the [Sprint Roadmap](./sprint-roadmap.md).
