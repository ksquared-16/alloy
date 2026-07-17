---
owner: runtime
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Runtime Realization — Engineering Specification

**Governing documents (both frozen, both authoritative):**
[The Alloy Operating System — Constitution](./runtime-realization-architecture.md) ·
[The Alloy Runtime Kernel](./alloy-runtime-kernel.md)

**Status:** Proposed — **reconciled to the four-system kernel (K1–K4)**. This document evolves; the
Constitution and the Kernel do not.

```
   CONSTITUTION      what Alloy is                       (frozen)
        │
   RUNTIME KERNEL    what runtime exists — K1 K2 K3 K4   (frozen)
        │
   THIS SPECIFICATION how Engineering realizes it        (evolves)
        │
   ONE REALIZATION MISSION  ─►  CERTIFICATION  ─►  PROMOTION
```

**Authority.** Where this document and the Constitution disagree, **this document is wrong**. Where it
and the Kernel disagree, **this document is wrong**. Tensions are recorded (§1.12), never resolved by
weakening either.

**Traceability rule.** Every implementation must trace to a concern in §3 and a rule in §9. **An
implementation proposal that cannot be traced to this specification is not implemented.**

---

# Section 0 — Reconciliation Ledger

*This specification predated the Kernel and described an eight-subsystem model. The Kernel supersedes
it. Every prior section and concept was re-derived — not renamed. This ledger is the disposition of
record.*

## 0.1 Prior subsystems → kernel

| Prior "subsystem" (superseded) | Disposition | Final owner |
|---|---|---|
| Attention Runtime | **Re-express** | **K1 Attention** |
| Preparation Runtime | **Re-express** | **K2 Provisioning** |
| Settlement Runtime | **Merge** — settlement is a *phase*, not a system | **K2 Provisioning** |
| Surface Host | **Re-express** | **K3 Focus** |
| Session Retention Store | **Merge** — retention has no independent state | **K3 Focus** |
| URL Projection Authority | **Merge** — a projection is a pure function of committed focus | **K3 Focus** |
| Runtime Instrumentation | **Re-express** | **K4 Instrumentation** |
| Entry Resource | **Move outside the kernel** — server-side supplier, below the seam | **Entry Resources** (neighbour) |

**Result: 8 → 4 + neighbours.** This is not a constitutional change: the Constitution names no
subsystem count, and the prior §2.1 forbade a *ninth*, not a smaller kernel.

## 0.2 Prior sections → disposition

| Prior section | Disposition | Why |
|---|---|---|
| §1 Current Runtime Engineering Model | **Retain** (re-owned) | It is measured engineering truth. Its ownership column is re-expressed against K1–K4. |
| §1.12 Recorded tensions | **Retain + amend** | T-1's resolution changed at ratification (deadline → `error`). |
| §2 Target Runtime Engineering Model | **Replace** | Re-derived from the Kernel: K1–K4 only. |
| §3 Engineering Mapping (32 concerns) | **Re-express** | Same concerns; owners re-derived; grew to cover reconciliation, mutation, deadline, legibility. |
| §4 Engineering Dependencies | **Re-express** | Re-derived against K1–K4 and the single mission. |
| §5 Migration Strategy (9 migrations) | **Replace** | **Nine migrations were nine waves wearing a disguise.** The realization is one mission (§5). |
| §6 Implementation Ordering | **Retain + amend** | Order stands (structure → behavior → performance). The *acceptance boundary* moves: performance is **inside** the mission, not after it. |
| §7 Certification Model | **Re-express** | Re-derived per kernel system, and made destructive by obligation. |
| §8 Wave Generation System | **DELETE as obsolete** | The realization is not wave-generated. **The operator experience is not accepted in fragments.** |
| §9 Engineering Rules | **Re-express** | Re-derived; R-18 clarified; rules added for the kernel's laws. |
| §10 Implementation Readiness | **Re-express** | Gates re-derived against K1–K4 and the contracts. |

---

# Section 1 — Current Runtime Engineering Model

*Engineering truth. Measured on a production build (`NODE_ENV=production`), authenticated, cold and
warm. Retained from the prior specification; ownership re-expressed against the Kernel.*

## 1.1 Current ownership, expressed against the kernel

*The left column is what exists. The right column shows why the kernel is a **consolidation**, not an
addition: today's runtime has no K1 at all, and its K2/K3/K4 responsibilities are scattered.*

| Concern (as implemented) | Implemented by | Kernel owner it belongs to |
|---|---|---|
| Navigation commit | `AdminV2NavLink` → soft-nav → `router.push`; hard `location.assign` floor | **K1** (intent) + **K3** (projection) |
| Surface rendering / stable slots | `SurfaceHostContext` | **K3** |
| Surface exchange state | `surfaceHostState` reducer; `surfaceEntryAction` | **K3** |
| Commit decision | rAF DOM polling of `data-surface-ready` **or** a 2.5 s timer | **K3** (must derive from K2 only) |
| Surface identity | WU route layout (3 serial DB hops) → module cache | **K2** (provisioned identity) |
| Work Unit data | `useWorkUnitSurfaceRuntime` mount effects | **K2** |
| Readiness | `resolveWorkUnitReadiness` — six-term conjunction | **K2** (terminal outcome) |
| Record identity | `AdminDrawerContext` (seed-first) | **Records** (neighbour) |
| Record payload | `useOpportunityDrawerVmPayload` | **K2** (provision) + **Records** (compose) |
| URL | **two owners**: Next router ⊕ drawer `replaceState` | **K3** (one authority) |
| Retained operator context | `workUnitOperatorContext` | **K3** |
| Instrumentation | `__alloyWorkspaceBaseline`, perceived marks, jank budgets, Server-Timing | **K4** |
| Attention | **no owner exists** | **K1** |

> **The single most important line in this table is the last one.** Today there is no system that owns
> "what the operator wants." Intent is inferred from a URL change. Every downstream defect follows.

## 1.2 Lifecycle (as implemented)

```
gesture → router.push → RSC payload (WU layout: 3 serial DB hops) → usePathname changes
       → SurfaceHost dispatches navigate → outgoing held (stable slot)
       → WU component mounts → mount effects begin fetching
       → six readiness terms converge → data-surface-ready="true"
       → rAF poll observes it → settle
   (in parallel: a 2.5 s timer that settles regardless — and on cold, wins)
```

Preparation has no existence before mount. There is no preparation object, no preparation identity, no
terminal outcome.

## 1.3 Request graph (cold, measured)

| t | Request | Depends on |
|---|---|---|
| −6 ms | `work-units/by-slug/{slug}` (warm-on-intent) | gesture |
| 0 | RSC `…/work-unit/{slug}?_rsc` | router.push |
| 1769 | `departments/{id}` ∥ `work-units/{id}` ∥ `work-units?department_id=` | RSC commit → mount |
| 1769 | `…/queues?summary_mode=initial` (sizing) | mount |
| 1772 | `surfaces/work-unit-header` | mount |
| 1772 | `metrics/resolve` | header config |
| 1773 | `actions/right-rail-bundle` | mount |
| 3171 | `queue-row-layout/{surfaceId}` | config core |
| 4490 | `queues/{wu}/{key}?…row_mode=reveal` **(the rows)** | `configSettled` |
| 4490 | `queue-view-totals` | `configSettled` |
| 8401 | `entity-layouts/focus-panel-summary`, `related/{id}`, `activity`, `communications/bindings` | subject committed |

**16 requests before Operational. 4 dependent tiers + 1 redundant identity round-trip. The rows request
alone takes ≈3.9 s.**

## 1.4–1.6 Data / readiness / reveal (as implemented)

```
slug ──(server, 3 serial hops)──► identity ──► dept metadata ──► processKey ──► queueDefinition
                                                                        │
        queue-row-layout (PRESENTATION ONLY) ──► configSettled ─────────┴──► queue rows
                                                                                │
                                        subject (resolved CLIENT-side, first row)
                                                                                │
                                                                          record VM (settles)

coldCompositionReady = hasIdentity && configSettled && headerConfigLoaded
                    && hasHeaderPresentation && queueSettledOnce && selectionCommitted

reveal ← whichever fires first: (rAF DOM poll)  OR  (2.5 s timer)      ← the timer wins, cold
```

## 1.7–1.11 Settlement · routing · caches · retention · instrumentation

- **Settlement:** not a system. Emergent leftovers, guarded individually.
- **Routing:** plain `<a>` + intercepted click ⇒ **no route prefetch exists**; the WU route layout does
  3 serial DB hops per navigation; `prepare` returns `undefined` (awaits nothing).
- **Caches:** six overlapping module-scoped `Map`s (config 60 s/20 m; rows/summaries/totals 15 s/20 m;
  workspace 30 s; slug; dedupe; comms). SPA-heap lifetime, lost on reload.
- **Retention:** operator context retained; **surfaces are rebuilt from cache** (invisible, but a
  reconstruction).
- **Instrumentation:** emits requests, durations, cache outcomes. **Emits no operator signal.**

## 1.12 Recorded tensions (Constitution/Kernel vs. implementation)

| # | Governing law | Reality | Engineering implication |
|---|---|---|---|
| T-1 | Art OC.4 Law 3 (as amended) — time may never **show a non-Operational destination**; it **may** establish terminal `error` | A 2.5 s timer commits regardless of truth | Delete the timer as a reveal mechanism. Its legitimate function moves to **K2's single deadline**, whose only product is `error` (§3, C-27/C-35). |
| T-2 | Kernel K2 — one answer | 4 dependent client tiers | The chain moves server-side (Entry Resource). It cannot be cached or prefetched into compliance. |
| T-3 | Art 2.3 Anti-Fork; Kernel K1 | Subject movement and surface movement are different mechanisms | Both converge on K1 at different scopes (§3, C-3). |
| T-4 | Art 2.4; Kernel K3 | Two URL authorities | One authority: K3 (§3, C-14/C-15). |
| T-5 | Art 4.6; Kernel K2 | Readiness polled from the DOM | Readiness is K2's terminal outcome; the DOM channel becomes diagnostics only (§3, C-8). |
| T-6 | Art 3.2.2 — *nothing more* | Preparation is whatever components fetch | Bounded by declaration (§3, C-6). |
| T-7 | Art 3.5; Kernel K3 | Surfaces rebuild from cache on return | Cache is not retention (§3, C-17). |
| **T-8** | **Kernel K1 exists** | **No system owns attention** | **The kernel's largest addition is the one system today lacks entirely.** Every other reconciliation depends on it. |

---

# Section 2 — Target Runtime Engineering Model

**The target is the Kernel.** It is not restated here; it is authoritative at
[`alloy-runtime-kernel.md`](./alloy-runtime-kernel.md). This section states only what Engineering must
hold true about it.

## 2.1 The only runtime systems

| System | Owns | Engineering must never let it |
|---|---|---|
| **K1 Attention** | intent · scope · acknowledgment · supersession | fetch, render, commit, or read a URL as a command |
| **K2 Provisioning** | truth acquisition · **termination** · the deadline · settlement (phase) | render, commit, exceed its contract, or fail to terminate |
| **K3 Focus** | the visible world · hold · commit · retention · URL projection · reload floor | fetch, poll the DOM, obey a clock, or un-commit |
| **K4 Instrumentation** | the operator signals | participate, be depended upon, or grade the machine |

**There is no fifth runtime system.** A proposal introducing one is an amendment to the Kernel
(Kernel §9.1), not a design choice.

## 2.2 Named neighbouring authorities (outside the kernel, canonical in their own right)

| Neighbour | Canonical authority over | Crosses into the kernel only as |
|---|---|---|
| **Presentation** | appearance, regions, geometry, motion; renders the committed world | *nothing* — it receives; it never asks |
| **Records** | server-authoritative truth, the change stream, **reconciliation**, optimistic mutation, subject identity | **the truth-movement seam** (X1) — patches committed content; **never commits, never moves attention** |
| **Business Processes** | what work exists, stages, actions, attention rules, Current Work | declarations K2 provisions and Presentation renders |
| **Actions** | action definition, permission, invocation, outcome | availability facts inside a Preparation Contract; invocation is a mutation (X1) |
| **Configuration** | what a tenant has declared (processes, lenses, layouts, strategies) | configuration facts composed into the provisioning answer |
| **Product** | **the four contracts per surface** | the declarations everything else obeys |
| **Entry Resources** (server) | composing a Preparation Contract into one answer | K2's supplier |
| **Engineering infrastructure** | framework, routing, transport, build, harness | subordinate; never on the operator's critical path |

## 2.3 The truth-movement seam (the only kernel boundary crossing)

```
   Records ──X1: truth.moved──► the committed world (rendered by Presentation)
                                        ▲
                                        │  K3 owns this world
                                        │  X1 patches its CONTENT
                                        │  X1 may never produce E3 (commit)
                                        │  X1 may never move attention
```

Reconciliation enters here and nowhere else. **A surface that reaches for live truth has forked the
runtime** (Art 3.3).

---

# Section 3 — Engineering Mapping

*Every runtime concern: Current → Kernel owner → Migration → Dependencies → Risk → Acceptance.*

## 3.0 How this section resolves ownership disputes

This table is the **register of runtime ownership**.

1. **Find the concern.** Its Kernel Owner column names the single owner. That is the answer.
2. **If two systems claim it** — one is wrong by R-1. The register decides; the other is migrated or
   deleted.
3. **If the concern is absent** — it is **unowned**, and unowned concerns are how the runtime we are
   replacing was built. It must be **added here, with an owner, before any code claims it**. A concern
   discovered during implementation is a specification amendment, not an implementation decision.

> **No runtime concern may exist outside this register.**

## 3.1 The register

| # | Concern | Current | **Kernel owner** | Migration | Deps | Risk | Acceptance |
|---|---|---|---|---|---|---|---|
| **C-1** | Navigation | plain `<a>` → `router.push`; no prefetch | **K1** (intent) + **K3** (projection) | navigation stops being a trigger; K3 projects after commit | C-3, C-14 | Med | navigation is never observable and never precedes preparation |
| **C-2** | Routing / Next route lifecycle | WU layout: 3 serial DB hops per nav | **Engineering infrastructure** (outside) | route carries no surface; performs no critical work; hydration only on cold load | C-14, C-20 | Med | route resolution is absent from the cold critical path |
| **C-3** | **Attention** | **no owner** | **K1** | introduce the event; route every gesture (row, lens, surface, search, command, deep link, history) through it | — | High | one mechanism serves all scopes; anti-fork assertion passes |
| **C-4** | Scope + supersession | implicit, per-mechanism | **K1** | Law of Scope Supersession (Kernel §2.1.1) | C-3 | Med | a coarser movement cancels all finer work in the context it leaves |
| **C-5** | Operational Contract | undeclared; emergent 6-term conjunction | **Product** declares; **K2** satisfies; **K3** commits on it | declare + ratify (Authorization §2) | — | Low | stated in one place; the *only* reveal gate |
| **C-6** | Preparation Contract | whatever components fetch | **Product** declares; **K2** bounded by it | bound K2 by the declaration | C-5 | Low | no request in preparation is absent from the declaration |
| **C-7** | Preparation | **does not exist** | **K2** | first-class: keyed, shared, superseded, terminal | C-3, C-20 | High | every prepared destination has an identity and exactly one terminal outcome |
| **C-8** | Readiness | 6-term conjunction + rAF DOM polling | **K2** (terminal outcome) | delete both; K3 consumes `P.state` | C-7 | High | K3 reads no DOM and no timer |
| **C-9** | Reveal / commit | DOM poll **or** 2.5 s timer | **K3** | commit atomically on terminal outcome; remove the timer edge | C-7, C-8 | High | `visible_construction_ms = 0`; no time→reveal edge exists |
| **C-10** | Settlement | emergent leftovers | **K2** (phase) → applied by **K3** | declared Settlement Contract, post-commit only | C-5, C-9 | Med | nothing outside the contract can gate a commit |
| **C-11** | Queue truth | rows gated by presentation-only layout | **K2** (rows are truth) | rows arrive in the provisioning answer | C-20 | Low | presentation config cannot delay rows |
| **C-12** | Operational projection / row layout | on the truth path | **K2** (delivered *with* rows, same answer) | not a gate and not a later patch — **same answer**, so it can neither block nor reflow | C-20 | Low | rows render in final layout at first paint |
| **C-13** | Focus Panel | correct: seed-first identity, holds prior | **K1+K2+K3 at subject scope**; region owned by **Presentation** | **keep the behaviour; generalize it** — it is the kernel at one scope | C-3 | Low | record movement stays instant and continuous |
| **C-14** | URL | two authorities | **K3** | fold the drawer's writes; URL written only on commit | C-7 | Med | one writer; URL⇄focus parity under link/back/forward/deep-link |
| **C-15** | Browser history | emergent from two writers | **K3** (projection) + **K1** (a pop is an attention movement) | history entries owned by K3; back/forward enter K1 | C-14 | Med | back/forward produce attention movements, not rebuilds |
| **C-16** | Browser state (scroll/focus) | ad hoc per surface | **K3** (Retention Contract) | uniform restoration | C-17 | Low | restoration is identical across surfaces |
| **C-17** | Retention | module `Map`s; surfaces rebuilt; lost on reload | **K3** | real retention of surface instances; declared boundary | C-5 | Med | a return is a reveal; **0 rebuilds** |
| **C-18** | Caches | six overlapping | **K2** (preparation freshness) + **K3** (retention). **No third.** | collapse; delete the rest with their consumers | C-7, C-17 | Med | no cache exists outside the two owners |
| **C-19** | Request orchestration | 16 requests, 4 tiers | **K2** | the client asks once | C-20 | High | exactly one provisioning request per destination |
| **C-20** | Server composition | absent | **Entry Resources** (outside) | compose the declared Preparation Contract in-process; one auth + one scope resolve; batched reads | C-5, C-6 | High | the answer satisfies the contract and **nothing more** |
| **C-21** | Identity / slug resolution | resolved twice; the redundant one blocks 1769 ms | **K2** (provisioned once) | warm identity is authoritative; the route stops re-deriving it | C-2, C-20 | Med | identity is never resolved twice per movement |
| **C-22** | Default subject strategy | client-side first-row; engine unused | **Configuration** declares; **Entry Resource** resolves; **K2** delivers | wire the existing engine server-side | C-20 | Low | the configured strategy decides the landed subject |
| **C-23** | Record VM | fetched after subject | **K2** provisions the *operational* part; **Records** composes; the rest **settles** | split by the Operational Contract, not by convenience | C-5, C-10 | Med | the operational part is in the answer; evidence/history settle |
| **C-24** | Header / KPI metrics | `metrics/resolve` silently gates reveal | **K2** (settlement phase) | remove from readiness; declare as Settlement | C-5, C-10 | Low | metrics cannot gate a commit |
| **C-25** | Right rail | non-blocking already | **K2** (settlement) — except operational action availability, which is **preparation** | split by the contract | C-10 | Low | the operator can act at commit; secondary actions settle |
| **C-26** | Failure handling | emergent (honest error, no false-empty) | **K2** (terminal `error`) | formalize the outcome; keep the honest surface | C-7 | Med | failure is a declared terminal state; no false-empty possible |
| **C-27** | Recovery | reload floor + a timer acting as pseudo-recovery | **K2** (deadline → `error`) + **K3** (reload floor) | affordance escalation for slowness; deadline for non-termination; floor only for an inconsistent runtime | C-9, C-35 | Med | a stall concludes honestly; the floor is never reached by slowness |
| **C-28** | Instrumentation | requests, durations, caches | **K4** | operator signals (§7.2) | C-5 | Low | operator signals emitted on every attention movement |
| **C-29** | Budgets | overfetch counts, hold ceilings, TTLs | **K4** measures; **Product** ratifies | operator budgets (Authorization §8) | C-28 | Low | budgets are acceptance; diagnostics are not |
| **C-30** | Testing | asserts "no blank frame"; passed while the operator suffered | **K4** + Certification | re-found on operator contracts; **destructive by obligation** | C-28 | **High** | **the harness fails the current runtime** (§10, G-7) |
| **C-31** | Motion | tokenized; invoked at boundaries | **Presentation** (outside); invoked by **K3** | **keep** | — | Low | motion never decides commit; `recede` carries legibility |
| **C-32** | Surface Host | both surfaces, stable slots; **but** DOM polling + timer | **K3** | keep the anatomy; replace the triggers | C-7, C-8, C-9 | High | 0 rebuilds; commit derives solely from `P.state` |
| **C-33** | Reconciliation | emergent, per-feature | **Records** (outside), via the X1 seam | one path; surfaces stop reaching for live truth | C-7, C-10 | Med | no surface subscribes/polls; a change lands quietly and never commits |
| **C-34** | Operator mutation | per-feature optimistic paths | **Records** (outside) — operator-sourced truth movement | acknowledgment stays K1; consequence reconciles via X1 | C-33 | Med | ack ≤ 50 ms; no preparation, no commit; failure withdraws legibly |
| **C-35** | The deadline | a 2.5 s timer that commits | **K2** — single; product is `error` only | delete the reveal-timer; introduce the deadline | C-7, C-9 | Med | no code path lets a clock produce `operational` |
| **C-36** | **Transition legibility** | none — the workspace sits unchanged until it is replaced | **K3** (invokes **Presentation** `recede`) | the outgoing surface visibly yields on intent; the destination is still never shown | C-3, C-9 | Med | `transition_legibility_ms ≤ 100 ms`; the operator never stares at an unchanged surface |

---

# Section 4 — Engineering Dependencies

*Actual dependency, not order. An edge means: the target **cannot correctly exist** until the source
does.*

```
              ┌────────────────────────────────────────┐
              │  THE FOUR CONTRACTS (Product declares) │   ← Authorization §2
              └───────┬───────────────┬────────────────┘
        ┌─────────────┘               └──────────────┐
        ▼                                            ▼
 ┌──────────────────┐                    ┌────────────────────────┐
 │ K4 INSTRUMENTATION│                   │  ENTRY RESOURCES       │
 │ (operator signals)│                   │  (server composition)  │
 └────────┬─────────┘                    └───────────┬────────────┘
          │                    ┌─────────────────────┤
          │                    ▼                     ▼
          │           ┌──────────────┐     ┌──────────────────────┐
          │           │ K1 ATTENTION │────►│  K2 PROVISIONING     │
          │           └──────────────┘     └───────────┬──────────┘
          │                                            │ terminal outcome
          │                                            ▼
          │                                 ┌──────────────────────┐
          │                                 │  K3 FOCUS (commit)   │
          │                                 └───────────┬──────────┘
          │                          ┌─────────────────┼──────────────┐
          │                          ▼                 ▼              ▼
          │                    settlement        URL projection   retention
          ▼
   ┌────────────────┐
   │ CERTIFICATION  │  ◄── requires K4 + every system emitting
   └────────────────┘
```

## 4.1 Hard dependencies

| This | Cannot exist until | Because |
|---|---|---|
| Measuring `operational_commit_ms` | the **Operational Contract** is declared | you cannot measure "the operator can work" until you have said what that means |
| **Entry Resource** | the **Preparation Contract** is declared | its response *is* the contract; without the bound it becomes a god-endpoint |
| **K2** (correctly) | the **Entry Resource** exists | one answer is required (Kernel K2). Without it, K2 would legitimize the waterfall |
| **K2** (at all) | **K1** exists | preparation is caused by an attention movement; today there is no such event |
| **K3's commit** | **K2** terminates | a commit needs a terminal outcome to commit *on*. **The 2.5 s timer exists precisely because nothing can say "this is over."** |
| **Settlement** | the **Operational Contract** | settlement is its complement |
| **URL projection / retention** | **K3 owns the world** | you cannot project or retain what you do not own |
| **Certification** | **K4** | otherwise certification asserts machine facts — exactly how the last implementation passed while failing |
| **Performance work** | the behaviour it accelerates is **correct** | R-18. Optimizing a runtime that shows construction makes the operator watch it sooner |

## 4.2 Independent (may proceed in parallel)

K1 (no server dependency) · K4 · contract declaration · Entry Resource (additive) · Motion/`recede` ·
Records' reconciliation seam.

## 4.3 The critical chain

```
Declare contracts → Entry Resource (one answer) → K1 attention → K2 provisioning (terminal)
   → K3 commits on terminal AND the old path is deleted → settlement → performance → certification
```

**No step may be skipped or reordered. The chain ends at certification, not at K3.**

---

# Section 5 — Migration Strategy: One Realization

**The prior nine migrations are deleted.** They were waves wearing a disguise, and they would have
produced exactly what this whole effort exists to prevent: a sequence of partial runtimes, each
individually defensible, none of them the product.

> **The realization of Workspace → Work View → Work Unit is ONE mission.**
> Engineering may sequence internal dependencies (§4) and land many commits.
> **No intermediate state is product-complete, promotable, or acceptable.**

## 5.1 The migration contract

The one mission answers five questions, once:

1. **What becomes canonical?** K1–K4, with the ownership register (§3) true in code.
2. **What becomes compatibility?** *Nothing permanent.* Only internal seams with same-mission deletion
   conditions (§6).
3. **What disappears?** Route-driven preparation · mount-driven contract fetching · DOM-polled
   readiness · the settle timer · the six-term conjunction · the dual URL authority · the surface
   rebuild · five of six caches · navigation-as-runtime.
4. **What gets deleted, and when?** In the same mission, before certification. Deletion is an
   acceptance criterion (§9, R-9), not a follow-up.
5. **How do we avoid competing runtimes?** §6.

## 5.2 The anti-competition rule

> **At mission completion there is exactly one runtime path.** The reload floor is recovery, not a
> parallel runtime. A flag that lets both live is how a migration becomes a permanent second runtime,
> and it is prohibited.

---

# Section 6 — Implementation Ordering

*Order stands. The acceptance boundary has moved.*

## 6.1 The three phases, inside one mission

| Phase | Establishes | Operator-observable? |
|---|---|---|
| **S — Structural** | ownership: contracts declared · K4 measuring · Entry Resource · K1 · one URL authority | mostly not |
| **B — Behavioral** | the experience: K2 terminal · K3 commits on truth · legible recede · settlement · retention · **old paths deleted** | yes |
| **P — Performance** | the budgets: server composition, query correction, intent-time preparation, reuse | yes |

## 6.2 The ordering law (retained)

> **A performance change is unconstitutional until the behavior it accelerates is correct** (R-18).
> Optimizing a runtime that shows construction merely makes the operator watch it sooner.

## 6.3 The acceptance law (amended — this supersedes the prior §6.2)

> **Order is not scope.** R-18 says performance is **last**. It does not say performance is **later**.
>
> **A constitutionally correct runtime that still takes nine seconds is not finished.** Phase P is
> inside this mission, at the end of its dependency graph. Nothing is promotable until it lands.

The prior specification stated that a "correct 3-second commit is constitutional." **That is retained
as a statement about *conformance* and rejected as a statement about *completion*.** Conformance is
Phase B's exit; completion requires Phase P. Product accepts the mission, not a phase.

---

# Section 7 — Certification Model

*Every implementation proves the **Constitution is still expressed** — never merely that tests pass.*

```
   CONSTITUTION ──► KERNEL ──► SPECIFICATION ──► IMPLEMENTATION
                                                       │
                    ┌──────────────┬───────────────────┼──────────────┬──────────────┐
                    ▼              ▼                   ▼              ▼              ▼
              CONSTITUTIONAL   KERNEL/OWNERSHIP   OPERATOR      PERFORMANCE      CLEANUP
                    └──────────────┴───────────────────┼──────────────┴──────────────┘
                                                       ▼
                                                 CERTIFICATION
```

## 7.1 Constitutional conformance (a review, not a test)

The ten constitutional tests (Art 5.2). **Any single failure is disqualifying**, regardless of
measurements. Recorded as a signed statement.

## 7.2 Operator Validation (primary)

Measured on an **authenticated production build**, from real browser timestamps and DOM observation —
**never from harness-side timings** (contaminated by actionability waiting).

| Signal | Criterion |
|---|---|
| `acknowledgment_ms` | ≤ 50 ms, every scope, every path |
| `transition_legibility_ms` | ≤ 100 ms — the operator sees movement begin |
| **`visible_construction_ms`** | **= 0** |
| `continuity_breaks` | = 0 |
| `operational_commit_ms` | within ratified budgets (Authorization §8) |
| focus/attention divergence | bounded by `operational_commit_ms`; never unbounded |
| superseded-result violations | = 0 |
| false-empty detections | = 0 |
| surface reconstruction count | = 0 |
| settlement reflow | = 0 |
| URL⇄focus parity | holds under link, back/forward, deep link |

**Evidence:** an **ordered frame sequence** through the whole movement — not endpoints. *The last
failure was invisible at the endpoints.*

## 7.3 Kernel & Ownership Validation

Every §3 concern resolves to exactly one kernel system or named neighbour · K1 exists and is the sole
intent owner · K2 is the sole readiness owner · K3 is the sole commit owner · K4 participates in
nothing · no compatibility path survives without a discharged deletion condition · no prohibited
construct exists (time→reveal, DOM readiness, component self-fetching its contract).

## 7.4 Performance Validation

Against ratified operator budgets, on a production build with correct environment, **co-located where
environment latency would otherwise dominate the result**. Diagnostics explain results; they never
constitute them.

## 7.5 The certification law — destructive by obligation

> **A certification that cannot fail the current implementation is not a certification.**

The harness must be demonstrated to **fail the pre-migration runtime** on the signal it protects.
A test that cannot fail today's 6.6-second construction experience is **invalid** and its result is
void. This is gate **G-7** (§10) and it is not waivable.

## 7.6 Cleanup Validation

Superseded paths, tests, flags, timers, polling, and compatibility code are **absent** — not disabled,
not dead. Verified by absence, not by assertion.

---

# Section 8 — Engineering Rules

*Immutable. Engineering law, derived from the Constitution and the Kernel. Violations are rejected at
review without debate.*

| # | Rule | Source |
|---|---|---|
| **R-1** | **One owner.** Every concern has exactly one. Two is a defect, however well it behaves. | Art 4.6 |
| **R-2** | **One runtime.** No parallel model, no second path, no "new mode". | Art 2.3 |
| **R-3** | **One attention mechanism**, every scope. Discontinuity is evidence of a fork. | Art 2.3; K1 |
| **R-4** | **One preparation** per destination: keyed, shared, superseded, terminal. | Art 4.3; K2 |
| **R-5** | **One readiness** — K2's terminal outcome. Never a DOM attribute, never a conjunction. | Art 4.6; K2 |
| **R-6** | **One operational commit** — atomic, from `P.state`, owned by K3. | Art OC.4; K3 |
| **R-7** | **One settlement** — outside the Operational Contract, after commit only. | Art 4.4; K2 |
| **R-8** | **No timeout-driven behavior.** No edge from elapsed time to what is shown. Time may change what is **told**, may establish terminal `error`, may invoke the floor. | Art OC.4 Law 3 |
| **R-9** | **Delete compatibility when canonical ownership is established** — in the same mission. Compatibility without a declared deletion condition is prohibited. | §5.2 |
| **R-10** | **No competing implementations.** No flag may let two runtime models live. | §5.2 |
| **R-11** | **No duplicate ownership**, including "temporary". | Art 4.6 |
| **R-12** | **Preparation contains nothing more** than its declared contract. | Art 3.2.2 |
| **R-13** | **Presentation may never gate truth.** | Art 4.3; K2 |
| **R-14** | **No component fetches its own Preparation Contract.** Components present; they do not summon. | Art 4.3 |
| **R-15** | **A surface never owns its own loading.** One that does has forked the runtime. | Art 3.3 |
| **R-16** | **Measure the operator.** Acceptance is operator signals; machine facts are diagnostics. | Art 4.7; K4 |
| **R-17** | **A certification that cannot fail the current implementation is not a certification.** | §7.5 |
| **R-18** | **Optimization is last — but not later.** A performance change is unconstitutional until the behavior is correct; the mission is not complete until the budgets are met. | Art OC.5; §6.3 |
| **R-19** | **A new surface is declared, never engineered.** If it needs runtime, amend the Kernel. | Art 3.2; K §1.3 |
| **R-20** | **The Constitution wins.** Tension is recorded (§1.12) and resolved in the implementation. | Art 5.3 |
| **R-21** | **The truth axis never commits.** X1 may change content; never focus, never attention. | Art 4.8; K §3.3 |
| **R-22** | **A coarser attention movement supersedes all finer work** in the context it leaves. | K §2.1.1 |
| **R-23** | **K4 participates in nothing.** No system may read instrumentation or branch on it. | K K4 |
| **R-24** | **The operator experience is not accepted in fragments.** No partial runtime is promotable. | §5, §6.3 |

---

# Section 9 — Implementation Readiness

*The Constitution and the Kernel do not authorize implementation. **This section does.***

## 9.1 Authorization gates

| Gate | Requirement |
|---|---|
| **G-1** | The **Constitution is frozen** and the **Kernel is accepted** |
| **G-2** | The target surfaces have **four declared contracts each**, ratified by Product (Authorization §2) |
| **G-3** | **K4 emits** `acknowledgment_ms`, `transition_legibility_ms`, `operational_commit_ms`, `visible_construction_ms`, `continuity_breaks` |
| **G-4** | A **production-build baseline** exists: cold, warm, repeated |
| **G-5** | The mission is **whole** (§5) — not decomposed into independently promotable waves |
| **G-6** | Every **§4 dependency** is satisfied or scheduled inside the mission |
| **G-7** | **The certification harness demonstrably FAILS the pre-migration implementation** on the signal it protects. *The single most important gate.* |
| **G-8** | The **ownership register** (§3) is accepted; every concern has one owner |
| **G-9** | The **deletion obligations** are enumerated (Authorization §11) |
| **G-10** | **Budgets are ratified** (Authorization §8), including the cold ceiling |
| **G-11** | An **owned worktree and single implementation branch** exist for the mission |

## 9.2 What is NOT sufficient authorization

The Constitution being frozen · a working prototype · a passing test suite · improved request counts ·
confidence, urgency, or a demonstration.

> **A technically-correct implementation that passed its own tests already shipped a broken
> experience. Authorization is a gate, not a judgement.**

## 9.3 Standing prohibitions

Never permitted, at any time: a time→reveal edge (R-8) · a second runtime model (R-10) · DOM-polled
readiness (R-5) · a component fetching its own Preparation Contract (R-14) · optimization before
behavior (R-18) · promoting a partial runtime (R-24) · resolving a tension by weakening the
Constitution (R-20).

---

## Amendment of this document

This specification evolves; the Constitution and Kernel do not. §1 is updated at mission exit. §3 gains
concerns as surfaces are added. §8 may gain rules but may not lose them. Where this document and either
frozen document disagree, **this document is wrong.**
