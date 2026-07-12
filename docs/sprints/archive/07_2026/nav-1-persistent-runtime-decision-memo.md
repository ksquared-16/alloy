# NAV-1 (Persistent Runtime) — Decision Memo

**Path:** `docs/sprints/archive/07_2026/nav-1-persistent-runtime-decision-memo.md`
**Status:** Decision memo (July 2026). Requests one ratification + authorization to start **Phase 0 only**.
**Grounds:** [`navigation-runtime-doctrine.md`](../../platform/experience/navigation-runtime-doctrine.md) (full design), [`experience-audit.md`](../../sprints/archive/06_2026/premium-operational-experience/experience-audit.md) (NAV-1 sev 5), [`sprint-roadmap.md`](../../sprints/archive/06_2026/premium-operational-experience/sprint-roadmap.md) (Phase 4 keystone).
**Companion:** Motion-adoption slice shipped this pass (queue/pill `acknowledge`, surface `reveal`, value `settle`, record `swap`, rail-menu open `reveal`) — the interaction responsiveness that makes NAV-1's payoff maximal when it lands.

---

## The one thing to internalize

NAV-1 is **not** "swap `window.location.assign` for `router.push`." That naive change was **already tried and abandoned** — soft `router.push` navigations are cancelled by in-flight RSC work on the heavy `"use client"` work-unit surface, leaving dead UI (Vercel `---` on GET). The full reload is a **correctness shield**, not a bug.

**Navigation Runtime earns the right to drop the reload** by owning preparation → hold → atomic commit → failure recovery — and it keeps the reload as a **recovery floor**, never deleting it. A version that cannot recover is worse than the reload it replaces. Everything below follows from that.

---

## The decision to ratify: (A) one-route/client-surfaces vs (B) parallel-routes

The structural enemy is fixed: **Next.js App Router route-segment changes unmount the subtree** — the opposite of a persistent runtime. Two ways to keep runtime alive across a surface change:

| | **(A) One route, client-driven surfaces** | **(B) Parallel / intercepting routes** |
|---|---|---|
| **Mechanism** | Collapse operator surfaces under one route segment; surface identity lives in client context + `replaceState` URL. | Use App Router parallel/intercepting routes so segments coexist without unmount. |
| **Precedent** | **Already in production** — this is exactly what the drawer layer does today (`syncOperatorWorkUnitUrlInBrowser` changes the URL via `replaceState` with no remount; model-swap holds prior payload). | New pattern for this shape; less proven. |
| **Blast radius** | Understood, reversible; generalizes one known pattern. | Larger framework surface; more App-Router edge behavior (parallel-route loading/error/default slots, interception semantics). |
| **Cost** | Operator surfaces stop being distinct route *files* (surface identity moves into client context). | Surfaces stay as route files, but framework complexity rises. |
| **Risk** | Lower (proven pattern, reversible). | Higher (novel, framework-coupled). |

### Recommendation: **(A) one route, client-driven surfaces.**

It promotes a pattern **already shipping in production** (drawer `replaceState` + hold-prior-payload) from the *record* level to the *surface* level, keeps the blast radius understood, and is reversible. The doctrine reaches the same recommendation independently. Choose (B) only if keeping operator surfaces as distinct route files is judged more valuable than the lower risk of (A) — it is not, given (A)'s production precedent.

---

## Risks (and how each is contained)

| Risk | Severity | Containment |
|------|:---:|-------------|
| Soft nav reintroduces cancelled-navigation dead UI (the original reason for the reload) | **High** | Resilience lands *first*; soft nav ships **flag-gated, per-surface**; the reload stays as an **automatic Tier-3 fallback**; roll out one surface at a time watching `fallback_to_reload_rate`. |
| Surface unmount loses runtime on a route change | High | Decision (A): surface change becomes a client context-swap within one persistent route — no segment unmount. |
| Cross-surface state desync (scroll/focus/drawer-stack) | Med | Navigation Runtime declares an explicit persistence boundary (what survives vs is released); drawer stack joins the context model. |
| URL ⇄ context divergence, back/forward, deep-link, refresh regressions | Med | One URL authority (context → URL on commit; URL → context on cold load only); parity tests on URL⇄context / back-forward / deep-link / refresh. |
| Weakening the locked performance/reveal gates | Med | NavRuntime only changes *who sequences* the reveal (it waits on the gate); it does not weaken the gate. Any doctrine delta rides the implementing PR. |
| Scope creep into a rewrite | Med | Converge, never rewrite: build alongside the reload, flip the default per surface, keep the floor. No new renderer/runtime beyond the navigation sequencer. |

**The gating metric:** the reload floor is demoted from default **only** once `fallback_to_reload_rate` is provably low. If it is non-trivial, the resilience isn't ready and the floor carries the load until it is.

---

## Phase 0 — instrumentation needed (the only thing to authorize now)

Phase 0 changes **no navigation behavior**. It measures the real cancelled-nav rate that justified the reload, so the later flag-flip is evidence-based, and it lands the interim held-prior guards. Concretely:

1. **Transition + fallback instrumentation** on the *current* paths (`adminV2CommitNavigation` and the drawer `replaceState` path): emit `cancelled_nav_rate`, `fallback_to_reload_rate`, `transition_latency` (reuse the existing `[wu-reveal-gate]` / `[perf:work-unit]` marks + `web/lib/perf/adminV2PerfLog.ts`).
2. **Confirm/extend the held-prior-surface guards** so no surface renders its cold shell on the *outbound* path (`isLeavingWorkUnitSurface` is the started interim; verify it covers dept/workspace exits — WU-1).
3. **A dashboards/read-out** of those three metrics over a representative usage window, to set the go/no-go threshold for Phase 3's per-surface flag flip.

Phase 0 is **Low/No risk** (measurement + a hold guard). Nothing else in Track 1 (context model, persistence tier, soft transitions, instant-back) starts until Phase 0 data exists.

---

## Exact approval needed before any NAV-1 code

1. **Ratify decision (A)** (one route / client-driven surfaces) as the persistent-runtime mechanism — or explicitly choose (B).
2. **Authorize Phase 0 only** (instrumentation + held-prior guard). Behavior-neutral.
3. **Acknowledge the sequencing contract:** Phases 1–5 (context model → persistence → **flagged** soft transitions → instant-back → collapse dual paradigm) are **not** authorized by this memo. Each subsequent phase — especially **Phase 3 (flagged soft surface transitions, High risk)** — requires its own go decision, gated on the Phase 0 metrics and the resilience contract, and **never removes the reload floor.**

Once Phase 0 data is in hand, a follow-up memo will propose the Phase 3 flag-flip threshold with the measured `fallback_to_reload_rate` in front of us — not blind.
