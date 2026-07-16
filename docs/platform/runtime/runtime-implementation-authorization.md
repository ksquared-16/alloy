---
owner: runtime
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Runtime Realization — Implementation Authorization Package

**Mission:** Realize `Workspace → Work View → Work Unit` on the Alloy Runtime Kernel.
**Status:** Proposed for authorization. **One mission. Not a sequence of waves.**

**Governing (frozen):** [Constitution](./runtime-realization-architecture.md) ·
[Runtime Kernel](./alloy-runtime-kernel.md)
**Governing (evolves):** [Engineering Specification](./runtime-realization-engineering-specification.md)

> This package exists so that the next mission is **implementation**, not another architectural
> interpretation exercise. Everything Engineering needs to execute the complete realization is here or
> is referenced here. Nothing in it requires further architecture to resolve.

---

# Part 2 — The Ratified Surface Contracts

*Declared from the frozen Constitution, canonical product doctrine, the measured runtime, and the
stated product goal. Not asked of Product — derived, and put to Product for ratification.*

## 2.0 The product goal, restated as law

The operator clicks a Work View from the Workspace. Then:

| The operator **must** | The operator **must never** |
|---|---|
| be answered immediately | stare at an unchanged Workspace |
| experience **movement** into the Work Unit immediately | see a white page |
| receive the Work Unit as **one premium, coherent operational surface** | watch header, queue, Focus Panel, or rail construct themselves |
| be able to **continue working** at Operational Commit | be handed a shell and told it is a destination |

**"Does not stare at an unchanged Workspace" is a binding constraint, and it is new.** It forbids the
naive reading of "hold the outgoing surface" — a frozen Workspace held for four seconds satisfies the
Constitution's letter and fails the product. It is discharged by **transition legibility** (§3.3, C-36):
the outgoing surface **visibly yields** (`recede`) within 100 ms, while the destination remains unshown
until it is Operational. **Movement is carried by the surface that is leaving — never by revealing one
that is not ready.**

## 2.1 The keyboard test, applied honestly

> *If the operator's hands were on the keyboard right now, could they perform the next intended action?*

| Surface | The next intended action | Therefore Operational requires |
|---|---|---|
| **Workspace** | choose where to work | orientation + the choosable set + that choice being reachable |
| **Work Unit** | **act on the selected subject** | orientation + the work + who is selected + **the ability to act on them** |

> **A Focus Panel with an identity and no operational content is NOT Operational.** The operator can
> see who is selected and can do nothing. That is a destination they must *wait inside*, which is the
> defect wearing a better outfit. **This supersedes the earlier D-1 recommendation** (which admitted
> only subject identity): applied honestly, the keyboard test rejects it.

## 2.2 WORKSPACE — the four contracts

### Operational Contract
The operator can continue working in the Workspace when **all** are true:

| # | Required | Why (capability, not completion) |
|---|---|---|
| W-O1 | **Orientation** — organization identity and the active location/site scope | they must know *whose* work and *which* scope they are choosing within |
| W-O2 | **The choosable set** — every configured business process and its Work Views, with the identity needed to recognise them (label, process, target) | this *is* "choose where to work" |
| W-O3 | **Choice is reachable** — a Work View can be selected, by pointer or keyboard | the next intended action must be performable |
| W-O4 | **Authoritative empty** — if no process is configured for this principal/scope, it is stated plainly | "nothing here" is a workable place; "not yet" dressed as "nothing" is a violation |
| W-O5 | **Honest error** — if orientation or the choosable set cannot be obtained, an honest error surface with a reachable retry | an error is a workable place |

**Explicitly NOT required:** KPI values · Work View counts · attention/overdue metrics · right-rail
actions · operational signals · any decision-support evidence.
*Rationale:* counts inform **which** Work View to choose; they do not confer the ability to choose.
They arrive into reserved geometry (W-S1). A count that is late is a settled value; a count that is
wrong is a constitutional violation (Art 1.2).

### Preparation Contract — *exactly this, nothing more*
K2 provisions, in **one answer**:

| # | Fact | Composed |
|---|---|---|
| W-P1 | principal · tenant · role/permission scope · active site scope | **server**, once — one authorization + one scope resolve for the whole answer |
| W-P2 | organization identity (name, orientation facts) | server |
| W-P3 | the configured business processes and their Work Views: identity, label, process, target reference, order | server, from Configuration |
| W-P4 | the Workspace's **operational presentation composition** (which regions exist and their geometry) | server, from Configuration |
| W-P5 | operational action availability for the surface (is choosing permitted; is Create permitted) | server, from Actions |

**May not be included:** metric values · counts · right-rail action bundles · signals · lifecycle
rollups · anything in W-S.

### Retention Contract — what K3 retains while attention is elsewhere
**Real retained state** (the surface instance itself is retained; it is not rebuilt):

W-R1 the Workspace **surface instance** · W-R2 scroll position · W-R3 site/location filter selection ·
W-R4 expanded/collapsed state · W-R5 the last committed composition (valid truth).

**Not retained:** transient errors · in-flight settlement · destructive confirmations.

> **Distinction of record:** today's Workspace is *cache-assisted reconstruction* — the instance is
> destroyed and rebuilt from a module `Map` fast enough to look retained. **That is not retention**
> (Art 3.5). The contract above requires the instance to survive.

### Settlement Contract — allowed after Operational Commit
W-S1 KPI/metric values · W-S2 Work View counts · W-S3 right-rail (secondary) actions · W-S4
operational signals/answers · W-S5 lifecycle rollups · W-S6 background reconciliation (X1).

**Requirements:** reserved geometry declared at commit (values land in slots that already exist) ·
no reflow · no re-order · never lowers an established truth · a resolved-empty shows a real "—",
never a placeholder that flips · a superseded response is discarded by key.

## 2.3 WORK UNIT — the four contracts

### Operational Contract
The operator can continue working in a Work Unit when **all** are true:

| # | Required | Why |
|---|---|---|
| U-O1 | **Orientation** — Work Unit / process identity, and the **active Work View** indicated among its lens set | they must know where they are and through which lens |
| U-O2 | **Queue truth** — the rows of the active Work View, in canonical order, bounded to one page, each row carrying enough to **recognise and select** | this is "the work"; a queue is a preview/selection surface (frozen doctrine) |
| U-O3 | **Selected subject** — resolved by the **configured** Default Operational Subject Strategy, committed and indicated in the queue | the runtime lands the operator on the right work, not "the first row" |
| U-O4 | **Focus Panel — operational, not hollow**: the subject's identity, its **current business state**, and its **primary action**, presented together | *this is the next intended action.* Identity alone lets them look; state + action lets them **work** |
| U-O5 | **Action is reachable** — the subject's primary action and the surface's operational actions can be invoked | capability, not decoration |
| U-O6 | **Authoritative empty** — a lens with genuinely no rows says so plainly; the Focus Panel shows an honest empty; **lens switching remains reachable** | an empty queue is a workable place — the operator changes lens |
| U-O7 | **Honest error** — terminal `error` commits an honest error surface with a reachable retry, and never a false-empty | Art 4.5 |

**Explicitly NOT required:** activity/history · communications · related records · secondary or
expanded card bodies · KPI/metric values · Work View counts · right-rail secondary actions · embedded
workspaces · evidence beyond the current business state.
*Rationale:* each is **detail or history**. The frozen screen grammar is `Situation → Decision →
Action → Detail → History`; **Operational is Situation + Decision + Action.** Detail and History settle.

### Preparation Contract — *exactly this, nothing more*
K2 provisions, in **one answer**:

| # | Fact | Composed |
|---|---|---|
| U-P1 | principal · tenant · permission scope · site scope · **Work Unit + process identity** | **server**, once — one authorization + one scope resolve for the entire answer, including the identity the client already warmed |
| U-P2 | **Work View resolution**: the active lens (URL > retained > configured default) and the lens set (identity/label/order) | server, from Configuration |
| U-P3 | **Queue truth**: the active lens's rows, canonical order, bounded page, recognition fields | server, from Records via the queue evaluator |
| U-P4 | **Default subject**: resolved server-side by the **configured strategy** (priority / due / assigned / order …), with `first_row` as the declared fallback | server, from Configuration + the same evaluated page |
| U-P5 | **Selected subject's operational composition**: identity, current business state, primary action | server, from Records + Business Processes |
| U-P6 | **Operational action availability** for the subject and the surface | server, from Actions |
| U-P7 | **Operational presentation composition** required to render U-O1…U-O5 **in final layout** — row layout/variants, header composition, Focus Panel operational composition | server, from Configuration |

**May not be included:** metric values · view counts · activity · communications · related records ·
expanded/secondary card bodies · right-rail secondary bundles · embedded workspaces · anything in U-S.

> **Why U-P7 is preparation and not settlement:** the Constitution forbids reflow after commit
> (Art 1.2, 4.4). Row layout arriving *after* rows would re-lay them out. In the single answer it can
> neither gate (no extra round-trip) nor reflow (it arrives with the rows). **The old defect —
> presentation gating truth — disappears not by demoting layout, but by removing the round-trip that
> made the question exist.**

### Retention Contract
**Real retained state:** U-R1 the Work Unit **surface instance** · U-R2 active Work View · U-R3 queue
scroll · U-R4 manual queue filters · U-R5 selected subject · U-R6 Focus Panel mode (Summary/Work/
Activity) · U-R7 embedded workspace state · U-R8 the last committed composition (valid truth).

**Not retained:** transient errors · partial mutation forms · destructive confirmations.
**Retention boundary:** tenant/principal/scope change **flushes** (a retained context may never cross
a tenant).

### Settlement Contract
U-S1 secondary/expanded card bodies · U-S2 related records · U-S3 activity · U-S4 communications ·
U-S5 KPI/metric values · U-S6 Work View counts · U-S7 right-rail secondary actions · U-S8 deferred
evidence · U-S9 background reconciliation (X1).

**Requirements:** reserved geometry declared at commit · no reflow · no re-order · never lowers an
established truth · counts show no badge rather than a wrong number · superseded responses discarded
by key.

## 2.4 What the operator experiences, state by state

| State | Time | What the operator sees |
|---|---|---|
| **Acknowledged** | ≤ 50 ms | The Work View row answers — selection treatment. *"It heard me."* |
| **Transitioning (legible)** | ≤ 100 ms | The **Workspace visibly yields** (`recede`) — movement into the Work Unit has begun. The Workspace is still true; it is departing, not waiting. **The Work Unit is not shown.** |
| **Transitioning (held)** | until terminal | The receded Workspace remains — valid truth, non-interactive. If it takes unusually long, what the operator is **told** escalates. **What they are shown does not.** |
| **Operational Commit** | one answer + render | The Work Unit **arrives whole**: header + active lens + queue + selected subject with its state and action — one atomic reveal, entering. The operator works. |
| **Settled** | after | Counts, metrics, evidence, history fill **geometry already reserved**. Nothing moves. The operator does not notice. |
| **Authoritative empty** | at commit | "This lens has no work" — stated plainly, lens switching reachable. |
| **Error** | at commit | "This did not load," honestly, retry reachable. Never a false-empty. |

---

# Part 3 — The Complete Target Runtime

*The Kernel is authoritative; this is its binding instantiation for this mission.*

## 3.1 K1 — Attention

| Concern | Definition |
|---|---|
| **Gesture capture** | Pointer, keyboard, search, command, notification, direct link, **browser history pop** — all enter K1. There is no second entry. |
| **Scope** | `SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT`. A Work View click is **LENS scope when already in its Work Unit**, **SURFACE scope from the Workspace**. |
| **Attention reference** | `(scope, target, lens?, subject?, id)` — a serializable statement of what the operator wants. Not a URL. |
| **Immediate acknowledgment** | ≤ 50 ms, unconditional, **before any network exists**. K1 cannot fail; if everything else fails the operator was still answered. |
| **Supersession** | Newest attention wins, decided **once**, by K1. K2 obeys. |
| **Cancellation** | Attention returning to `current` cancels the movement; no dead UI. |
| **Same-scope vs coarser-scope** | Same scope → replace the target (a lens change replaces the lens). **Coarser scope supersedes all finer work in the context it leaves** (Law of Scope Supersession). |
| **Direct link / cold load** | The URL **hydrates attention once**. It never moves it thereafter. |
| **Browser history** | A pop is an **attention movement** at whatever scope the popped reference implies — not a rebuild. |

## 3.2 K2 — Provisioning

| Concern | Definition |
|---|---|
| **Key** | `(surface-kind, target, lens, subject?, principal, tenant, scope)`. Same key ⇒ one provisioning. |
| **Lifecycle** | `pending → operational \| empty \| error`. Exactly one terminal outcome, exactly once. |
| **Single authoritative answer** | One request per Preparation Contract. The dependent chain (identity → process → lens → rows → subject → subject composition) resolves **in-process, server-side**. |
| **Server composition boundary** | The Entry Resource may compose **only** the declared Preparation Contract. **The contract is the boundary — this is what makes it not a god-endpoint.** A field not in §2.2/§2.3 may not appear in the answer. |
| **Authorization & scope** | **Once** per answer, reused by every internal read. |
| **Work View resolution** | URL > retained > configured default, resolved server-side. |
| **Queue truth** | The active lens's page, canonical order, evaluated **once**; the same evaluation feeds the subject strategy. |
| **Default subject strategy** | **Configuration-driven**, resolved server-side from the same evaluated page. `first_row` is the declared fallback, not the hardcoded behaviour. |
| **Operational Focus Panel composition** | Subject identity + current business state + primary action, composed server-side. **Not the full view model.** |
| **Authoritative empty** | Zero rows from an authoritative evaluation ⇒ terminal `empty`. Never inferred from a failure. |
| **Terminal error** | Any failure to satisfy the contract ⇒ terminal `error`, honestly attributed. |
| **Non-terminating deadline** | **One runtime deadline**, K2-owned. Product: **`error` only.** Never `operational`. Never per-surface, per-component, or per-request. |
| **Deduplication** | Same key in flight ⇒ join. Never a second request. |
| **Cancellation** | Superseded ⇒ cancelled; a cancelled provisioning can never win a commit. |
| **Reuse** | A terminal `operational` snapshot within its freshness window is reused synchronously — this is what makes warm effectively immediate. |
| **Snapshot semantics** | The answer is **immutable** at commit. Later change arrives via settlement or X1 — never by mutating the snapshot. |
| **Settlement handoff** | On `focus.committed`, K2 begins the Settlement Contract, keyed identically, discarding superseded results. |

## 3.3 K3 — Focus

| Concern | Definition |
|---|---|
| **Current focus / desired attention** | K3 holds `current`; it **reads** K1's attention. **The gap between them is the transition.** |
| **Outgoing retained surface** | Kept mounted, valid, non-interactive — and **visibly yielding** (`recede`) so movement is legible (C-36). |
| **Incoming provisioned surface** | Never shown before terminal `operational`/`empty`/`error`. |
| **Atomic Operational Commit** | On `preparation.terminal` **and nothing else**. No clock. No DOM. No component's opinion. Outgoing released, incoming becomes current, URL projected — one indivisible step. |
| **Surface retention** | The **instance** persists while attention is elsewhere. Return is a reveal. Tenant/principal/scope change flushes. |
| **Surface exchange** | Promotion `incoming → current` is a **role change, never a rebuild**. |
| **Subject movement within a surface** | SUBJECT scope: the queue, lens, header, and rails **do not move**. Identity commits from the row seed; the operational composition swaps atomically; prior content never appears under a new identity. |
| **Work View movement** | LENS scope: only lens-owned regions change — queue truth, the selected subject if the configured strategy resolves differently or the current subject no longer belongs, and lens indication. **The rest of the Work Unit does not move.** |
| **Surface movement** | SURFACE scope: the full exchange. |
| **URL projection** | **One authority.** Serialized from committed focus on commit. Hydrated on cold load only. The drawer's record URL is folded in — there is no second writer. |
| **Browser history** | Owned by K3 as the projection; a pop re-enters K1 as an attention movement. |
| **Reload recovery** | The floor: only when the runtime cannot reach a terminal outcome. **Never reached by slowness.** |
| **Focus Panel identity & content ownership** | Identity: **Records** (seed-first). Operational content: **K2** (provisioned). Region and appearance: **Presentation**. When it becomes visible: **K3**. Four owners, no overlap. |
| **Presentation rendering** | Presentation renders the committed world from provisioned truth. It never fetches, never decides readiness, never gates. |
| **Settlement application** | K3 applies settled values into reserved geometry. Never re-lays out, never re-orders, never lowers truth. |

> **There is exactly one authority deciding what the operator sees: K3.**

## 3.4 K4 — Instrumentation

| Signal | Definition |
|---|---|
| `acknowledgment_ms` | attention movement → first visual response on the touched element |
| `transition_legibility_ms` | attention movement → first visual evidence that movement is occurring (the outgoing's yield) |
| `operational_commit_ms` | attention movement → the surface is Operational per its declared contract |
| `visible_construction_ms` | cumulative time the operator can see a skeleton/placeholder/scaffold **in the visible surface** |
| `continuity_breaks` | blank frames + surface reconstructions + cleared valid truth |
| **false-empty detection** | any "empty" rendered from a non-authoritative outcome |
| **surface reconstruction count** | instance identity changes across an exchange or a return |
| **focus/attention divergence** | duration where focus ≠ attention (the gap's lifetime) |
| **superseded-result violations** | a superseded provisioning or settlement result reaching the operator |
| **settlement reflow** | geometry moving after commit |
| **failure/recovery outcomes** | terminal outcome distribution; deadline invocations; floor invocations |

Machine diagnostics (requests, caches, Server-Timing, durations) **may remain and are useful — they
are never acceptance** (R-16). K4 emits no events and is read by nothing (R-23).

---

# Part 4 — Current Runtime → Kernel Mapping

*Classification of every existing subsystem and path. **The goal is subtraction and consolidation.
No runtime concept survives merely because callers depend on it.***

| Existing subsystem / path | Classification | Final owner | Reason |
|---|---|---|---|
| **Navigation / soft-link behavior** (`AdminV2NavLink`, soft-nav commit, `adminV2CommitNavigation`) | **Replace** | **K1** (intent) + **K3** (projection) | Navigation is not a cause. Intent moves to K1; the URL becomes K3's projection. The hard-assign path survives **only** as K3's reload floor. |
| **Next route lifecycle** (WU route layout, `force-dynamic`, RSC payload) | **Remain outside** (Engineering infrastructure) — **and leave the critical path** | Infrastructure | The route may exist; it may not gate. Its 3 serial DB hops move into the Entry Resource's single composition. |
| **Work Unit slug resolution** (`loadWorkUnitSlugRouteMetaServer`, `workUnitSlugRouteCache`, `by-slug`) | **Absorb into K2** | **K2** | Identity is a provisioned fact. **Resolved once** — never warmed by the client and re-derived by the server (the 1769 ms defect). |
| **Surface Host** (`SurfaceHostContext`, `surfaceHostState`, stable slots) | **Absorb into K3** | **K3** | Right anatomy: current/outgoing/incoming, stable slots, 0 rebuilds. Sheds DOM polling and the clock. |
| **`surfaceEntryAction`** (workspace→hydrate / WU→navigate asymmetry) | **Delete** | — | A workaround for the dual URL authority. One mechanism at every scope (R-3). |
| **Presentation Runtime** | **Remain outside** | **Presentation** | It renders. Inside the kernel it would be free to fetch and to judge its own readiness — which is what happened. |
| **Work Unit surface runtime** (`useWorkUnitSurfaceRuntime` mount-effect chain) | **Delete** | **K2** provisions; **Presentation** renders | A component that fetches its own Operational Contract (R-14). The chain does not migrate — it ceases to have a reason to exist. |
| **Workspace surface runtime** (`useWorkspaceSurfaceRuntime`) | **Delete** | **K2** + **Presentation** | Same. Its `fresh`-flag fix is superseded: there is nothing to re-fan. |
| **Queue runtime** | **Split** → **K2** (rows are truth) + **Presentation** (the queue is a region) | K2 / Presentation | It was never a runtime. |
| **Operational projection / `queue-row-layout`** | **Absorb into K2** (delivered *with* rows) | **K2** | Not a gate, not a later patch. In one answer the question disappears. |
| **Work View resolution** | **Split** → **K1** (which lens the operator wants) + **K2** (resolving it server-side) | K1 / K2 | Intent vs. truth. |
| **Default subject resolution** (`workUnitPillSwitching` first-row; unused strategy engine) | **Replace** | **Configuration** declares; **Entry Resource** resolves; **K2** delivers | The dead engine becomes the live one — server-side, from the same evaluated page. |
| **Focus Panel Runtime** (seed-first identity, hold-prior) | **Absorb into K1+K2+K3 at SUBJECT scope**; region → **Presentation** | K1/K2/K3 | **It is the kernel at one scope, already working correctly.** Generalizing it *is* the Anti-Fork Rule. Its behaviour is preserved exactly; its independence ends. |
| **VM Runtime** (`useOpportunityDrawerVmPayload`, drawer VM compose) | **Split** → **K2** (the *operational* part, provisioned) + **Records** (compose) + **settlement** (the rest) | K2 / Records | The split follows the Operational Contract (U-O4), not convenience. |
| **Header / KPI resolution** (`surfaces/work-unit-header` → `metrics/resolve`) | **Split** → **K2** (header *composition*, preparation) + **settlement** (metric *values*) | K2 | Metrics silently gated the reveal. Composition is preparation; values settle into reserved slots. |
| **Right rail** | **Split** → **K2** (operational action availability) + **settlement** (secondary bundle) | K2 | Split by capability: the operator must be able to act at commit. |
| **Session / module caches** (six) | **Merge → two; Delete the rest** | **K2** (freshness) + **K3** (retention) | Every other cache existed to hide a reconstruction that will no longer occur. |
| **Browser history + drawer URL writes** (`syncOperatorWorkUnitUrlInBrowser`) | **Absorb into K3** | **K3** | One projection authority. The dual-writer war ends; the asymmetry it forced disappears. |
| **Runtime instrumentation** (`__alloyWorkspaceBaseline`, perceived marks, jank budgets, Server-Timing) | **Keep apparatus; Replace basis** | **K4** | Subject changes from machine to operator. Existing diagnostics survive as diagnostics. |
| **Readiness conditions** (`resolveWorkUnitReadiness` 6-term conjunction) | **Delete** | **K2** (terminal outcome) | Nothing to keep. This is the disease, not a subsystem. |
| **DOM readiness polling** (`data-surface-ready`, rAF) | **Delete** (attribute survives as diagnostics only) | **K2** | The runtime asked the picture whether truth had arrived. |
| **Settle timeout** (2.5 s `SURFACE_SETTLE_BUDGET_MS`) | **Delete** | **K2's deadline** (`error` only) | Certified harm: 6.6 s of watching. Its legitimate function survives; its authority to reveal does not. |
| **Error behavior** (WU ready-with-error, honest chip, no false-empty) | **Keep → formalize** | **K2** (terminal `error`) | Today it works by accident. It becomes a declared outcome. |
| **Reconciliation** (module warm caches, per-feature refetch) | **Remain outside** | **Records**, via the X1 seam | Constitutionally the record layer's (Art 4.8). Surfaces stop reaching for live truth. |
| **Reload floor** (`window.location.assign`) | **Keep → narrow** | **K3** | Recovery, never a parallel runtime; never reached by slowness. |
| **Motion tokens / `recede`** | **Keep** | **Presentation**, invoked by **K3** | Now load-bearing: `recede` carries transition legibility (C-36). |

**Nothing above is unowned. Nothing appears twice.**

---

# Part 5 — The Complete Realization

> **This is one mission.** It is not split by file, component, endpoint, or estimated effort.
> Engineering may sequence internal dependencies (Part 7) and land many commits.
> **No intermediate state is product-complete or promotable.**

## 5.1 Scope — all mutually dependent, all required

| # | Change | Establishes |
|---|---|---|
| R-a | **K1 attention capture + scope model** (incl. Law of Scope Supersession, history-as-attention) | intent exists independent of routing |
| R-b | **K2 Work Unit + Workspace provisioning** — keyed, shared, superseded, terminal, deadline (`error` only), reuse | something can finally say *"this is over"* |
| R-c | **Server-composed provisioning answer** (Entry Resources) — one auth + one scope resolve; the dependent chain in-process; bounded by the Preparation Contract | one answer replaces four tiers |
| R-d | **Config-driven default subject resolution**, server-side, from the same evaluated page | the operator lands on the right work |
| R-e | **K3 Focus consumption of terminal provisioning** | commit derives from truth |
| R-f | **Atomic Operational Commit** | the destination arrives whole |
| R-g | **Real retained Workspace and Work Unit surfaces** | return is a reveal, not a rebuild |
| R-h | **One URL projection authority** | the address follows; it never leads |
| R-i | **Transition legibility** (`recede` on intent) | the operator never stares at an unchanged Workspace |
| R-j | **Removal of route-driven preparation** | the 1769 ms dead window ends |
| R-k | **Removal of mount-driven Operational Contract fetching** | components stop summoning |
| R-l | **Removal of DOM-polled readiness** | the runtime stops asking the picture |
| R-m | **Removal of timeout-driven non-operational reveal** | the 6.6 s skeleton becomes impossible |
| R-n | **Explicit settlement** | everything else, by name, behind the commit |
| R-o | **K4 constitutional instrumentation** | we can tell the truth about what we ship |
| R-p | **Performance realization** (Part 8) | the experience is actually different |
| R-q | **Deletion of superseded paths** (Part 11) | one runtime remains |
| R-r | **Production browser certification** (Part 9) | it is proven, not asserted |

## 5.2 Why it cannot be fragmented

- **K3 cannot commit on truth until K2 terminates** (nothing else can say "over").
- **K2 cannot be one answer until the Entry Resource exists** (otherwise it legitimizes the waterfall).
- **The old chain cannot be deleted until K3 consumes K2** (nothing would render).
- **The experience is not the sum of these.** Any subset produces a partial runtime: correct in a
  fragment, incoherent to the operator. **The operator experience is not accepted in fragments**
  (R-24).

---

# Part 6 — Transition Without Competing Runtimes

## 6.1 Binding rules

1. **One implementation branch and one owned worktree** for the mission.
2. **One canonical runtime path at completion** — verified by absence, not assertion.
3. **No permanent feature flag** selecting old vs. new runtime.
4. **No duplicated preparation pipelines.**
5. **No separate timeout fallback** revealing the old surface.
6. **No old mount-fetch chain left active** behind the new provisioning answer.
7. **No router-owned and Focus-owned visible lifecycle competing.**
8. **No compatibility adapter without an explicit same-mission deletion condition.**
9. **The reload floor may remain** — as recovery, never as a parallel runtime.

## 6.2 The one unavoidable internal seam

**It exists because** R-c (the Entry Resource) is additive and must be measured before R-e/R-f can
depend on it. For a bounded window inside the mission, the old mount-fetch chain still renders the
surface while the new answer exists and is unconsumed.

| Property | Declaration |
|---|---|
| **Why** | The answer must be proven to satisfy the contract *and* to be composable within budget before the runtime is rebuilt on top of it. Building K2/K3 on an unmeasured answer risks discovering, after deletion, that the waterfall merely moved. |
| **Temporary owner** | The mission. It is **not** a product state and is never promoted. |
| **Scope** | Server-side only. **The client is never given a choice of two paths** — the old chain is not "disabled behind a flag"; it is simply not yet replaced. |
| **Removal condition** | The change that lands R-e/R-f **deletes the old chain in the same change**. The seam cannot outlive it. |
| **Certification proving it can be deleted** | The Entry Resource satisfies the Preparation Contract exactly (nothing more, nothing missing) **and** its composition time is measured within the Part 8 server budget. On that evidence, and only then, R-e/R-f + deletion proceed. |

**No other seam is authorized.** Any additional seam discovered during implementation is a **stop
condition** (Part 15).

---

# Part 7 — Dependency and Execution Model

*Internal engineering dependency inside the single mission. Not product waves. Nothing here is
independently promotable.*

| Stage | Capability it establishes | Cannot begin before | Old ownership removed | Certification to proceed | Observability |
|---|---|---|---|---|---|
| **D0 — Contracts + K4 + destructive baseline** | We can measure operator truth, and the harness is **proven valid by failing today's runtime** | Contracts ratified (Part 2) | acceptance-by-machine-metrics | **G-7**: harness fails the current runtime on `visible_construction_ms` (≈6.6 s) and on `operational_commit_ms` (≈9 s) | internal |
| **D1 — Entry Resources (server)** | One answer exists; the dependent chain is in-process | D0 (contract declared) | none yet | the answer = the contract exactly (**nothing more, nothing missing**); **composition time within the server budget** (Part 8) | internal |
| **D2 — K1 Attention** | Intent exists independent of routing; scope + supersession | — (parallel to D1) | route-driven intent | `acknowledgment_ms ≤ 50 ms` at every scope; anti-fork: one mechanism | partly observable |
| **D3 — K2 Provisioning** | Terminal outcomes; keyed/shared/superseded; the deadline (`error` only); reuse | D1 **and** D2 | warm-on-intent as a separate concept | every provisioning terminates; deadline never yields `operational`; supersession never wins | internal |
| **D4 — K3 commits on truth + legibility + **deletion**** | The experience changes: atomic commit, held+receding outgoing, real retention, one URL authority | D3 | **DOM polling · settle timer · 6-term readiness · route-driven preparation · mount-fetch chain · dual URL authority · surface rebuild — all deleted in this change** | `visible_construction_ms = 0`; `continuity_breaks = 0`; `transition_legibility_ms ≤ 100 ms`; 0 reconstructions; URL⇄focus parity | **product-observable** |
| **D5 — Settlement** | Everything else, explicitly, behind the commit, into reserved geometry | D4 | emergent leftovers; redundant post-reveal guards | no settlement gates a commit; settlement reflow = 0; no false-empty | product-observable |
| **D6 — Performance** | The budgets: query correction + indexing, parallel/batched reads, redundant identity removed, presentation gates removed, metrics off the commit, in-flight reuse, intent-time preparation, bounded speculation | D4/D5 (R-18: correctness first) | the waterfall's residue; duplicate critical-path requests | Part 8 budgets met on a production build, co-located | product-observable |
| **D7 — Certification + deletion audit** | Proof | D0–D6 | — | Part 9, in full | **the only acceptance point** |

> **Why the experience is not accepted until D7:** D4 makes it *correct*; D6 makes it *fast*; only D7
> proves both, together, on a production build, with the old runtime **absent**. A correct runtime that
> takes nine seconds is not the product; a fast runtime that constructs is unconstitutional. **Product
> accepts the mission, never a stage.**

---

# Part 8 — Performance Realization

> **"The architecture is correct but cold is still slow" is not an acceptable outcome.**
> Both causes are in scope: the **structural waterfall** and the **expensive queue/projection query**.
> The measured 8964 ms cold was ~4.4 s of serialization **and** ~3.9 s of a single query. Fixing only
> one leaves the operator with the other.

## 8.1 Structural closure

| # | Obligation |
|---|---|
| S1 | **One authorization + one scope resolution** per provisioning answer, reused by every internal read |
| S2 | **Server-side dependency composition** — identity → process → lens → rows → subject → operational composition, in-process |
| S3 | **Parallelization** of independent reads inside the answer |
| S4 | **Batched reads** — one bounded read per entity class; never per row |
| S5 | **Remove redundant slug/identity resolution** — resolved once (kills the 1769 ms) |
| S6 | **Remove presentation-only gates** — layout travels *with* rows |
| S7 | **Remove metrics from Operational Commit** — values settle |
| S8 | **In-flight provisioning reuse** — same key joins; never a duplicate |
| S9 | **Intent-time preparation** — preparation begins at the gesture, not at the route |
| S10 | **Bounded speculative preparation** — pointer/focus intent may prepare; bounded, cancellable, never a storm; never a blocking dependency |
| S11 | **Settlement deferral** — everything outside the Operational Contract, behind the commit |

## 8.2 Query/execution closure

| # | Obligation |
|---|---|
| Q1 | **Queue query analysis** of the ≈3.9 s evaluation: plan, row estimates, buffers |
| Q2 | **Query correction** — predicate/order/limit shape; one evaluation feeding both rows and subject strategy |
| Q3 | **Indexing / query-plan work** to the operator budget, not to a generic target |
| Q4 | **Enrichment bounded by entity class**, never by row count |
| Q5 | **Payload discipline** — the answer carries the contract, nothing more |
| Q6 | **Co-located certification** — measured where the app and database actually live, since local→remote latency dominates and would otherwise mask or fake the result |

## 8.3 Proposed budgets (ratify as D-6)

| Signal | Budget |
|---|---|
| `acknowledgment_ms` | **≤ 50 ms** (p99), every scope, every path |
| `transition_legibility_ms` | **≤ 100 ms** (p95) — visible response to attention movement |
| `visible_construction_ms` | **= 0** (absolute) |
| `continuity_breaks` | **= 0** (absolute) |
| `operational_commit_ms` — **warm** (reusable preparation) | **≤ 100 ms** (p95) — effectively immediate |
| `operational_commit_ms` — **cold** | **≤ 800 ms (p75), ≤ 1200 ms (p95)** — approximately one provisioning answer + render, measured co-located on a production build |
| — of which: **server composition** | **≤ 400 ms (p75)** |
| Critical-path duplicate requests | **= 0** |
| Layout reflow after commit | **= 0** |
| Surface reconstructions | **= 0** |

*(The cold ceiling is expressed as an actual measurable number so that "faster than before" can never
be mistaken for "finished.")*

## 8.4 If the target cannot be met

Engineering must produce, **before** proposing any budget change:

1. A measured decomposition of the provisioning answer: authorization · scope resolve · lens
   resolution · queue evaluation · subject strategy · subject composition · serialize · transit ·
   render.
2. The **query plan** for the queue evaluation, with row estimates and index usage.
3. Evidence that S1–S11 and Q1–Q5 are all discharged.
4. A statement of which single phase exceeds its share.

> **Then the first suspect is the Operational Contract, not the engineering.** If the declared contract
> cannot be delivered in one answer within budget, **the contract is too large** — and that is a
> **Product decision** (Part 15), not an engineering compromise. Engineering owns *how fast*; Product
> owns *what counts*.

---

# Part 9 — Certification Authority

*All nine must pass. Any single failure blocks promotion.*

| # | Certification | Proves |
|---|---|---|
| **1 — Constitutional** | The ten tests (Art 5.2) pass, as a signed review. Every relevant article is expressed. | the Constitution still governs |
| **2 — Kernel** | K1 owns intent/scope/ack/supersession; K2 owns preparation/terminal/deadline/settlement; K3 owns hold/commit/retention/URL/floor; K4 participates in nothing. | the kernel is real, not aspirational |
| **3 — Ownership** | Every Part 4 concern resolves to one owner. **No old and new owner compete.** No compatibility path survives. | one runtime |
| **4 — Product** | Immediate acknowledgment · legible movement · coherent Operational Commit per the ratified contracts · quiet settlement. Judged against Part 2.4 state by state. | the operator got what was promised |
| **5 — Performance** | **Cold · warm · repeated · slow-network · failure · supersession · record switch · Work View switch · return · direct link · search · browser history** — each meets its declared contract and budget. | it is fast *and* correct, everywhere |
| **6 — Destructive** | **The certification FAILS the current runtime before implementation.** A test that cannot fail today's 6.6-second construction experience is **invalid** and its result is void. | the harness measures the operator |
| **7 — Visual** | Authenticated browser recordings and **ordered screenshot sequences** prove the page does not assemble in phases — sampled through the whole movement, not at endpoints. | no construction, at any moment |
| **8 — Production** | A real production build, correct environment, real authentication, co-located where latency would distort. | the result is the operator's, not the harness's |
| **9 — Cleanup** | Superseded paths, tests, flags, timers, polling, and adapters are **absent**. Verified by absence. | nothing survived to compete |

---

# Part 10 — Implementation Authorization Package

| # | Item | Reference / Content |
|---|---|---|
| **1** | **Frozen Constitution** | [`runtime-realization-architecture.md`](./runtime-realization-architecture.md) — status FROZEN; amended at ratification (A1 deadline→`error`; A2 Art 4.8 Reconciliation) |
| **2** | **Frozen Kernel** | [`alloy-runtime-kernel.md`](./alloy-runtime-kernel.md) — K1 Attention · K2 Provisioning · K3 Focus · K4 Instrumentation |
| **3** | **Reconciled Engineering Specification** | [`runtime-realization-engineering-specification.md`](./runtime-realization-engineering-specification.md) — §0 reconciliation ledger (8→4), §3 register (36 concerns), §4 dependencies, §5 one mission, §6.3 acceptance law, §7 certification, §8 rules R-1…R-24, §9 gates G-1…G-11 |
| **4** | **Ratified Workspace contracts** | Part 2.2 — W-O1…O5 · W-P1…P5 · W-R1…R5 · W-S1…S6 |
| **5** | **Ratified Work Unit contracts** | Part 2.3 — U-O1…O7 · U-P1…P7 · U-R1…R8 · U-S1…S9 |
| **6** | **Target K1–K4 behavior** | Part 3 |
| **7** | **Current→target ownership map** | Part 4 |
| **8** | **Complete realization scope** | Part 5 — R-a…R-r, one mission |
| **9** | **Dependency graph** | Part 7 — D0…D7, acceptance only at D7 |
| **10** | **Performance obligations** | Part 8 — S1–S11, Q1–Q6, budgets, failure-evidence rule |
| **11** | **Deletion obligations** | §11 below |
| **12** | **Certification obligations** | Part 9 — all nine |
| **13** | **Known risks** | §13 below |
| **14** | **Explicit non-goals** | §14 below |
| **15** | **Stop conditions** | §15 below |

## 11 — Deletion obligations (acceptance criteria, not follow-ups)

Absent at certification: the **2.5 s settle timer** · **DOM readiness polling** (as a readiness
channel) · the **six-term readiness conjunction** · the **Work Unit mount-fetch chain** · the
**Workspace mount-fetch chain** · **route-driven preparation** (the 3-serial-hop slug re-derivation on
the critical path) · the **drawer URL writer** (second authority) · **`surfaceEntryAction`'s
workspace/WU asymmetry** · **four of six caches** (all but K2 freshness + K3 retention) · the
**client-side first-row subject fork** · **navigation-as-runtime** · every **compatibility adapter**
created during the mission · all **tests asserting superseded behaviour** (notably any asserting only
"no blank frame").

## 13 — Known risks

| Risk | Response |
|---|---|
| The provisioning answer becomes a god-endpoint | Bounded **by definition** by the Preparation Contract (§2.2/§2.3, *nothing more*). A field outside it in the answer is a review rejection. |
| Server composition merely relocates the waterfall | **D1 measures it before D3/D4 depend on it.** If composition exceeds its budget, the mission stops at D1 — it does not proceed and hope. |
| Intent-time preparation storms the server | Keyed, shared, cancellable, bounded (S8/S10). Intent-warming already exists; it is promoted, not invented. |
| The Work Unit Operational Contract (U-O4) proves too large to deliver in budget | Part 8.4: evidence first, then **Product** decides the contract — never engineering silently. |
| Real retention (instances) destabilises long sessions | Retention boundary declared (U-R/W-R); tenant/scope flush; measured via reconstruction count and memory. |
| Deleting the old chain reveals hidden consumers | Deletion is inside D4 with certification; hidden consumers surface as failures, not as a live second runtime. |
| Co-located certification is unavailable | Part 8 Q6 — if it cannot be run, the cold budget is **unproven** and the mission is **not promotable** (stop condition). |
| Legibility (`recede`) is read as construction | It is the **outgoing** surface, never the incoming. Certified by `visible_construction_ms = 0` alongside `transition_legibility_ms ≤ 100 ms`. |

## 14 — Explicit non-goals

- **Not** making page navigation faster. Navigation ceases to be observable (Art 2.4).
- **Not** improving the current runtime. Most of it is deleted.
- **Not** a new foundational runtime — K1–K4 is the kernel; no fifth system.
- **Not** redesigning Presentation, Records, Business Processes, Actions, or Configuration.
- **Not** visual redesign — geometry, motion tokens, and the visual language are unchanged
  (`recede` is an existing choreography, newly load-bearing).
- **Not** offline, cross-device, predictive/AI preparation, or collaborative presence.
- **Not** the other surfaces (Processing, Communications, Settings, Analytics) — they inherit the same
  kernel later by **declaring four contracts**, not by engineering runtime.
- **Not** a migration that leaves a compatibility mode behind.

## 15 — Stop conditions (require Product or Architecture review)

**Stop and escalate — do not decide in-flight:**

1. The **Entry Resource cannot satisfy a Preparation Contract in one answer** within budget → *Product*
   (is the contract too large?) — Part 8.4.
2. **Cold budget unreachable** after S1–S11 and Q1–Q5 are discharged → *Product* (contract) /
   *Architecture* (kernel assumption).
3. A **fifth runtime system** appears necessary → *Architecture* (Kernel §9.1).
4. A **sixth attention-axis event** appears necessary → *Architecture*.
5. **Two owners** for one concern cannot be resolved from the register → *Architecture* (Spec §3.0).
6. A **second internal seam** beyond Part 6.2 appears unavoidable → *Architecture*.
7. **X1 (truth movement) appears to require a commit** → *Architecture* (Art 4.8 / R-21).
8. A **constitutional article cannot be complied with** → *Architecture* — amend the Constitution
   (Art 5.3); **never** weaken it in implementation (R-20).
9. **Certification cannot be made to fail the current runtime** → *Architecture* — the harness is
   invalid (R-17); do not proceed.
10. The **operator contract must be relaxed to meet a date** → *Product*, explicitly and on the record.

---

# Final Review

*As Product Director, Chief Architect, and VP of Engineering. The package fails if any condition holds.*

| Failure condition | Status | Evidence |
|---|---|---|
| Still describes **improving current page navigation** | **False** | Part 14 non-goal #1; navigation is Deleted/Replaced in Part 4; the target has no navigation runtime. |
| Permits **partial product acceptance** | **False** | Part 5 (one mission) · Part 7 (acceptance only at D7) · R-24. |
| Leaves **performance for later** | **False** | Part 8 is in scope with a numeric ceiling; D6 is inside the mission; Spec §6.3: *order is not scope*. |
| Preserves **two runtime mechanisms** | **False** | Part 6 rules · the single seam is server-side, same-mission-deleted · Part 11 deletion obligations are acceptance criteria. |
| Cannot explain **what the operator experiences at each state** | **False** | Part 2.4, state by state, including empty and error. |
| Cannot state **which systems disappear** | **False** | Part 4 classifications + Part 11 deletion obligations. |
| Cannot generate **one complete engineering mission** without further architecture interpretation | **False** | Parts 2–9 supply contracts, target behavior, ownership, scope, dependencies, budgets, certification. Open questions are **stop conditions** (Part 15), not gaps. |
| Requires **Product decisions resolvable from frozen doctrine** | **False** | Both surfaces' contracts are **declared** in Part 2 from the Constitution, doctrine, and the stated goal — and put to Product for **ratification**, not for authorship. |

**All conditions false.**

## Authorization statement

> **This package is sufficient to authorize the complete runtime realization mission.**
>
> On ratification of Part 2 (the contracts) and Part 8.3 (the budgets), and on satisfaction of Spec
> §9.1 gates **G-1 … G-11** — of which **G-7 (the harness must fail today's runtime)** is the one that
> cannot be waived — Engineering is authorized to execute the mission defined in Part 5, sequenced by
> Part 7, and promotable only on Part 9.
>
> **The next mission is implementation.**
