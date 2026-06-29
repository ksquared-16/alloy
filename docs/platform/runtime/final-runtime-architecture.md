# Final Runtime Architecture

**Status:** Architectural north star (Track 2 — June 2026). **Design only. No implementation.**
**Premise:** Not "improve today's runtime." If Alloy had never been built, **this is the runtime we would build today** — and every future module (Workspace, Work Unit, Focus Panel, Settings, Analytics, Billing, Scheduling, Attendance, Processing, Parent, Staff) inherits it.
**Continues:** [`operational-runtime-doctrine.md`](./operational-runtime-doctrine.md) (the laws), [`operational-runtime-topology.md`](./operational-runtime-topology.md) (today's measured stack), [`../../sprints/06_2026/runtime-simplification-plan.md`](../../sprints/06_2026/runtime-simplification-plan.md) (which layers disappear). The migration roadmap lives in [`../../sprints/06_2026/runtime-simplification-v1.md`](../../sprints/06_2026/runtime-simplification-v1.md).

> **The one sentence.** The server composes a complete, typed **Route VM** for an operating surface; a persistent **Operational Shell** reveals it **once**; mutations **patch the VM optimistically**; navigation **reuses warm VMs** without teardown. Everything else — providers, contexts, hooks, the 60 caches, the 36 `router.refresh` — collapses into a handful of coordinators behind that contract.

---

## Canonical Runtime Rule

**Runtime flags are migration tools. They are not architecture.**

A runtime flag is allowed only to serve one of:
1. **temporary migration**,
2. **emergency rollback**,
3. **controlled rollout**.

A runtime flag must **not** become a permanent product mode. The long-term runtime is **never** described as flag-gated. The end state is not `legacy path + new path + flag` — it is **canonical path only**.

Once a runtime pattern becomes canonical:
- the canonical path **replaces** the old path,
- the old path is **quarantined**,
- **parity is proven**,
- compatibility code is **deleted**,
- the flag is **removed**.

The runtime must get **simpler over time**. It does not accumulate optional modes. (Migration lifecycle: see **Prove → Merge → Delete** in [`../../sprints/06_2026/runtime-simplification-v1.md`](../../sprints/06_2026/runtime-simplification-v1.md).)

## Architecture vs implementation detail

The **architecture** is the set of runtime concepts Alloy would still need **if React disappeared tomorrow**. Everything else is **implementation detail** — real today, but replaceable, and not part of the enduring runtime.

| Architecture (enduring concepts) | Implementation detail (today's React/Next mechanics) |
|---|---|
| Route VM · Operational Shell · Navigation Coordinator · Save Coordinator · Runtime Cache · Warm Coordinator · Reveal Contract · Focus Panel VM · Surface Renderer (concept) | React providers · hooks · contexts · client components · Next layouts · Suspense boundaries · route files · module caches |

Implementation details exist today and are fine — but they are **not permanent runtime objects** and must not be treated as architecture unless they pass the test below.

## The React-Disappearance Test

For every proposed runtime object, ask: **“If React disappeared tomorrow, would Alloy still need this concept?”** Yes → it may be architecture. No → it is implementation detail.

| Candidate | Survives React? | Verdict |
|---|---|---|
| **Route VM** | Yes | **Architecture** — the enduring runtime unit |
| Surface VM | — | merged into Route VM (architecture, *as* the Route VM) |
| **Save Coordinator** | Yes | **Architecture** |
| **Navigation Coordinator** | Yes | **Architecture** |
| **Warm Coordinator** | Yes | **Architecture** |
| **Runtime Cache** | Yes | **Architecture** (a module cache is just one impl) |
| **Focus Panel VM** | Yes | **Architecture** |
| **Operational Shell** | Yes | **Architecture** |
| Reveal Contract | Yes | **Architecture** |
| Surface Renderer (concept) | Yes — some renderer always exists | **Architecture as a concept**; the React component is the impl |
| RuntimeProvider | No | **Implementation detail** — one way to pass Runtime Services |
| React context | No | **Implementation detail** |
| Hooks | No | **Implementation detail** |
| Suspense | No | **Implementation detail** |
| Next layouts / route files | No | **Implementation detail** |

**Explicit:** Route VM, Save Coordinator, Navigation Coordinator, Runtime Cache, and Operational Shell **survive**. React providers, hooks, Suspense, and Next layouts **do not survive as architecture**.

---

## 1. Final runtime architecture (the model)

The operator must perceive **only continuous operational flow** — never routing, fetching, rendering, hydration, cache restoration, loading, or save refreshes. That perceptual bar forces four structural commitments:

1. **Data is composed on the server, per surface, as one payload** (the Route VM) — not fetched by client effects the reveal gate then waits on.
2. **Chrome is one persistent shell** that commits once and never remounts across operational routes — so navigation is continuity, not page replacement.
3. **State changes are patches to the VM**, optimistic and reconciled in the background — never a refresh or rebuild.
4. **The next surface is warmed before it is needed** — so a click reveals an already-prepared VM.

These are not optimizations layered on the current runtime; they are the runtime. The current 8-layer stack (Route→Layout→Providers→Contexts→VM→Cache→Hooks→Components) collapses to **four conceptual layers + five coordinators**.

---

## 2. Runtime layer diagram

```
TODAY (8 layers, measured)                  TARGET (4 layers + coordinators)
─────────────────────────                   ────────────────────────────────
Route                                        [A] EDGE / ROUTE RESOLUTION  (server)
Layout                                            url → route identity + access gate
Providers (×8)                                       │  composes ↓
Contexts (×many)                             [B] SERVER VM COMPOSER       (server)
VM (client-composed)            ⟶                    route → ONE complete Route VM
Cache (×60 modules)                                  (identity+context+kpis+sections+reveal+focusPanel frame)
Hooks                                                │  hands to ↓
Components                                   [C] RUNTIME HOST             (host, persistent)
                                                  one Operational Shell + Runtime Services
                                                  + 5 coordinators: Cache · Save · Nav · Warm · Reveal
                                                  (a React provider is today's impl, not a layer)
                                                     │  renders ↓
                                             [D] SURFACE RENDERERS        (client, pure)
                                                  components render VM sections; own nothing
```

- **[A] Edge/Route resolution** — *Why:* every request must resolve who/where/what + access. *Owns:* routing, auth/access gate, route params. *Could disappear?* No — but stays thin (identity + access only, no data).
- **[B] Server VM Composer** — *Why:* one payload = one reveal (Doctrine Law 5). *Owns:* ALL first-paint data for the surface, composed in parallel + streamed. *Could disappear?* No — it **replaces** providers + contexts-as-data + client first-paint effects. This is the heart of the new runtime.
- **[C] Runtime Host** — *Why:* stable chrome + a single place that holds the VM and the coordinators. *Owns:* shell persistence, the VM handoff, access to Runtime Services. *Could merge?* It **absorbs** the 8 providers and the 60 cache modules behind **Runtime Services** + one cache. (Today those services are distributed via a React provider value — that provider is implementation detail, not a runtime layer; see the React-Disappearance Test.)
- **[D] Surface Renderers** — *Why:* something must paint. *Owns:* presentation only — no fetch, no cache, no reveal decision. *Could disappear?* No, but they become trivial (pure functions of the VM).

---

## 3. Runtime ownership model

| Concern | Owner (target) | Notes |
|---|---|---|
| Route identity + access | Edge/Route resolution (server) | params + access scope only |
| First-paint data | **Route VM** (server-composed) | the single source of "the surface is ready" |
| Chrome / shell | **Operational Shell** (one, persistent) | commit once, never remount across operational routes |
| Subject identity (focus) | **Focus Panel VM** (sub-VM of Route VM) | one subject, one frame; seeded synchronously |
| Cached snapshots | **Runtime Cache** (one namespace) | `(org, scope, route, entity)` keyed; SWR |
| Mutations | **Save Coordinator** (one) | optimistic patch → persist → saved/failed/conflict |
| Transitions | **Navigation Coordinator** (one) | commit-first; reuse warm VM; no teardown-before-ready |
| Prewarming | **Warm Coordinator** (one) | hover/intent → hydrate next Route VM |
| Reveal decision | **Reveal Coordinator** (one, thin) | reveal = "Route VM present + blocking sections seeded" |
| Session identity (auth/org/labels/tz/vertical) | **Runtime Services** (distributed by the Runtime Host) | impl today = one provider value + selector hooks; the provider is impl detail, not a layer |
| Presentation | Surface Renderers (pure) | own nothing |

**Rule:** every visible region has exactly one Render owner, one Fetch owner (the Composer), one Cache owner (the Runtime Cache), one Update owner (the Save/Live patch), one Destroy owner (route teardown — which the persistent shell makes a no-op for chrome). No exceptions, no competing owners.

---

## 4. Runtime object model (canonical objects)

| Object | Verdict | Role |
|---|---|---|
| **Operational Shell** | **KEEP (one)** | Persistent chrome: nav, header frame, command rail, Focus Panel frame. Commits once; survives `workspace ↔ work-unit ↔ …` without remount. |
| **Route VM** | **NEW canonical** | Server-composed, complete first-paint payload + reveal contract for a route. THE unit of readiness. Replaces fan-out fetches + client-compose. |
| **Surface VM** | **MERGE → Route VM** | Today's client-composed "Surface VM" ceases to exist as a separate object; it *is* the (now server-composed) Route VM. |
| **Focus Panel VM** | **KEEP (one)** | One subject, one frame; subject seeded synchronously, cards hydrate in place. The single drawer/focus-panel runtime. |
| **Runtime Cache** | **KEEP (one)** | Single namespace + API (`peek/get/set/patch/invalidate`), SWR, persistence, warm. Replaces 60 modules. |
| **Save Coordinator** | **KEEP (one)** | Optimistic → background persist → saved/failed/conflict. Replaces 36 `router.refresh`. |
| **Navigation Coordinator** | **KEEP (one)** | commit-first transitions over the persistent shell. |
| **Warm Coordinator** | **KEEP (one)** | Unifies the 31 prefetch utils behind one intent→warm API. |
| **Reveal Coordinator** | **KEEP (thin)** | One commit decision per surface; no longer waits on client effects (VM is server-composed). |
| **Render Coordinator** | **DOES NOT EXIST** | Rendering is React; there is no bespoke render orchestrator. Surface Renderers are pure. |
| **Providers (×8)** | **REMOVE (not a runtime object)** | Providers/contexts/hooks are implementation detail (fail the React-Disappearance Test). Collapsing the 8 into one provider value is a *migration tactic*, not the target; the concept is **Runtime Services**. |
| **Live Patch Channel** | **NEW (optional per surface)** | Server-pushed VM patches (real-time queue/presence) reuse the same patch mechanism as save — keeps real-time inside the VM model. |

---

## 5. Provider strategy

**Providers are implementation detail, not a runtime layer.** The conceptual runtime is:

```
Route VM  →  Runtime Services (Cache · Save · Nav · Warm · Reveal · Focus)  →  Surface Renderer
```

A React provider is **one possible way** to distribute Runtime Services to renderers — not the architecture. **The architecture has no "provider layer," and the target is not "one provider."** The target is **Route VM → Runtime Services → Surface Renderer.**

- **Today:** 8 nested context providers hydrated from server props (auth, vertical, labels, viewer-tz, operational-tz, org, operational-mode, first-paint-seed) + the drawer provider.
- **Migration tactic (a step, not the target):** collapse the 8 into a single provider *value*, with selector hooks as shims so call sites stay stable. This is useful — it removes nesting and forces the Runtime Services boundary into existence — but **"one provider" is a migration tactic, not the architecture.**
- **Target:** renderers consume the **Route VM** and request **Runtime Services**. Whether those services arrive via a React context, a module singleton, a server component, or a future framework is an implementation choice. If React disappeared, the *Route VM → Runtime Services → Renderer* relationship would remain; the provider would not.
- **Data vs behavior:** server-resolved data (timezones, org, labels, first-paint) is **Route VM / session state**, not contexts; behavior (operational-mode, focus/open-state) is **coordinator state**, not standalone providers.

Do not state the target as "one provider." State it as **Route VM → Runtime Services → Surface Renderer** — a provider may *internally* pass the services, but it is not the conceptual runtime layer.

---

## 6. Cache strategy

**One Runtime Cache.** Single logical store, single API, two physical tiers behind it.

- **Key:** `(orgId, accessScopeFingerprint, routeKey, entityKey?)` — deterministic, scope-isolated.
- **Tiers (hidden):** in-memory (fast, per-session) + sessionStorage (survives reload/same-tab). One API (`peek` sync, `get` SWR, `set`, `patch`, `invalidate(prefix)`); callers never choose a tier or a module.
- **Ownership:** Runtime Host owns it. The **Server VM Composer writes the authoritative snapshot**; the **Save Coordinator patches**; the **Warm Coordinator pre-populates** the next route.
- **Invalidation:** scoped + event-driven by key prefix (`org:` / `route:` / `entity:`). **Never nuke the surface.** A mutation invalidates the entity, not the route.
- **Hydration:** server VM seeds the cache; warm reads are synchronous (no flash).
- **Persistence:** sessionStorage tier survives reload; bounded (LRU + TTL) — no unbounded growth.
- **Navigation:** the cache lives in the Runtime Host **above routes**, so it survives route changes; back-navigation restores the prior Route VM synchronously.
- **Warm:** Warm Coordinator writes the next Route VM speculatively on intent.

Replaces: the 60 cache modules, the lifecycle/KPI/summaries duplicates, and the module-vs-session dual reads.

---

## 7. Navigation strategy

**One Navigation Coordinator, commit-first, over a persistent shell.**

```
hover/intent       → Warm Coordinator hydrates the next Route VM into the cache
click              → Nav commits the new surface from the warm VM (or a fast server compose)
                     WITHOUT tearing down the current surface until the next is ready
shell              → persists (no remount); only the surface body swaps
back/forward       → restore prior Route VM from cache (synchronous) → reveal once
Focus Panel open   → subject = clicked-row seed (synchronous); cards hydrate in the seeded frame
adjacent queue row → swap subject in the SAME Focus Panel frame (no frame remount)
save               → not a navigation; optimistic VM patch in place
return             → warm Route VM restored; reveal once
```

There is **never** an intermediate skeleton, gate, or cold shell: the destination VM is either already warm or composed fast server-side, and the current surface stays until the next commits. This is how `Workspace → Work Unit → Focus Panel → Back → Hover → Adjacent → Save → Return` becomes one continuous flow.

---

## 8. Save strategy

**One Save Coordinator. No `router.refresh`, no shell rebuild.**

```
intent     → optimistic VM patch (UI updates immediately; section marked "saving")
persist    → background request carrying a generation token
success    → reconcile: replace optimistic with server truth (no-op if equal); mark "saved"
failure    → rollback optimistic patch; mark "failed" with explicit recovery affordance
conflict   → stale generation detected → re-read entity, re-apply or surface a conflict resolution
```

- **States are VM fields:** `dirty / saving / saved / failed / conflict` per section — rendered, not refreshed.
- **Collections** (household contacts, inquiry children) use the same patch+reconcile per item.
- **Real-time** server pushes use the identical patch path (Live Patch Channel), so concurrent edits and live updates converge through one mechanism.
- Replaces the 36 `router.refresh` sites (6 non-drawer + 30 in the drawer monolith).

---

## 9. Route strategy (who owns data)

| Layer | Owns | Does NOT own |
|---|---|---|
| **Route** (segment) | identity (params) + access gate | data, shell |
| **Layout** | the persistent Operational Shell (mount once) | per-route data |
| **Route VM** (server) | **all first-paint data** + reveal contract | chrome |
| **Surface VM** | — (merged into Route VM) | — |
| **Components** | render the VM | data, cache, reveal |

**Answer:** Routes own identity, Layouts own the shell, the **Route VM owns data**, components render. Surface VM as a distinct data owner is eliminated.

---

## 10. Rendering strategy

- **Paints:** **one** meaningful paint per navigation (the reveal). Subsequent in-place **value patches** into reserved slots (KPIs, counts, live data) are allowed — they must not move layout or change axis.
- **Reveals:** **one** per surface.
- **Loading states:** **zero** visible on warm navigation. On cold, the only acceptable visible loading is the intentional **BOS / OS transition** — never a skeleton, gate, cold shell, or staggered section.
- **Forbidden:** skeleton-to-structure morph · shell-first-then-body · staggered sections · KPI reshape (vertical→horizontal or height change) · partial reveal · full-page refresh/remount on save · duplicate fetch waterfalls · competing owners · legacy fallback UI on the canonical path.

---

## 11. Validation against future modules

The architecture is module-agnostic because every module is "a route → server Route VM → render once → optimistic save → warm nav over the one shell." Stress tests:

| Module | Fits the model via | Stress / resolution |
|---|---|---|
| **Workspace** | Route VM = tiles + KPIs + context | already in flight (Slices 2) |
| **Work Unit** | Route VM = identity + context + KPIs + queue + Focus Panel frame | slug resolve in flight (Slice 3) |
| **Focus Panel** | Focus Panel VM (sub-VM); subject seed + card hydrate | one frame, subject swap — already canonical |
| **Settings** | Settings routes also produce Route VMs (today they delegate to legacy clients) | least converged today → the model *unifies* it |
| **Analytics** | Route VM with heavy sections marked deferred (non-primary) | compute-heavy → parallel compose + streamed sub-sections |
| **Billing / Scheduling / Attendance / Processing** | same Route VM pattern; domain data in the VM | transactional saves → Save Coordinator conflict handling |
| **Parent / Staff portals** | same runtime objects; a *different* Operational Shell per audience | shell differs, runtime model identical |
| **Real-time surfaces** (live queue, presence) | **Live Patch Channel** → VM patches | the reason the model includes server-push patches — real-time stays inside the VM, not a re-fetch |
| **Interactive editors** (Experience Builder, layout authoring) | Route VM provides initial state; editor owns local edit state; saves via Save Coordinator | "app within a surface" — still one shell, one save path |

**If the architecture broke for any one of these, it would be wrong.** It holds because the contract (server VM → reveal once → patch → warm) is independent of domain, and the two escape hatches (deferred sub-sections; Live Patch Channel) cover compute-heavy and real-time surfaces without special-casing the runtime.

---

## Why this consolidation matters (future work becomes easier)

The goal is **not** faster Workspace. The goal is that **every future module inherits one runtime** instead of inventing its own.

Without this, each new module — **Billing, Scheduling, Attendance, Processing, Parent, Staff, Analytics, Settings** — tends to invent its own loading model, save model, navigation model, cache model, and route model. Under this architecture they inherit:
- one **Route VM** contract (loading + readiness),
- one **Save Coordinator** (save + conflict + error),
- one **Navigation Coordinator** (transitions + continuity),
- one **Runtime Cache** (cache + warm + persistence),
- one **Operational Shell** (chrome).

Future teams build **domain composition + renderers**, not runtime. That is why the runtime must become **one system that gets simpler over time** — not a set of optional, flag-gated modes. Consolidation is the multiplier: the next ten modules are cheaper because the runtime is solved once. A runtime that accumulates modes makes every future module harder; a runtime that converges to one canonical path makes every future module faster.

---

## 12. What must never regress

The architecture exists to satisfy the doctrine's acceptance bar — these are non-negotiable invariants for every module that inherits it:

1. **One reveal** — a surface reveals once, in final structure (never partial/staggered/reconstructed).
2. **Stable chrome** — orientation chrome never moves/reshapes after reveal; the shell never remounts across operational routes.
3. **No visible construction** — no skeleton/placeholder/“Preparing…”/KPI reshape; the only visible load is the intentional OS transition.
4. **One owner per region** — no competing/legacy/duplicate owners or fetches.
5. **Continuous navigation** — no intermediate gate; never clear the current surface before the next is ready.
6. **Continuous save** — optimistic patch + explicit saved/failed/conflict; never `router.refresh`/remount.
7. **Correctness invariants** — access scoping, known-empty semantics (`null` ≠ empty), request-ownership/stale-response guards, and cache-key determinism survive every refactor.

---

## North star
This is the runtime Alloy deserves: **one shell, one server-composed Route VM per surface, Runtime Services, one cache, one save path, predictive warm — one canonical path, no permanent modes.** The migration from today's stack — **Prove → Merge → Delete**, where each step deletes the path it replaces and removes its temporary flag (never accumulating modes) — is specified in [`runtime-simplification-v1.md`](../../sprints/06_2026/runtime-simplification-v1.md). Design only; no code until reviewed.
