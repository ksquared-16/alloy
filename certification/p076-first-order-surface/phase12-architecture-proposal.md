# P0-7.6 Phase 12 — ONE architecture proposal

Run: erun_77eca4a07ae34742 · Lane: lane_73a897409906
Classification **D — MULTI_OWNER_ARCHITECTURE_CHANGE_REQUIRED**. Two owners, measured.

This is a proposal for a Director decision. No decomposition campaign was started and nothing here
was implemented.

---

## OWNER 1 — collapsed finality is gated on a payload the collapsed surface does not read

### Current path

1. Page composes for **2,540 ms**, holding the stream open.
2. Document at **3,177 ms**; Focus Panel cards first paint at **3,280 ms**.
3. The panel issues `/api/admin/view-models/drawer/opportunity/<id>`, which takes **4,536 ms**
   (server 4,331 ms, dominated by `children_overlay_parallel_fetch_ms` 2,147 ms).
4. It lands at **7,691 ms**; WU-09 mutates authoritatively on arrival.
5. `FIRST_ORDER_VISIBLE_COMPLETE` = **7,731 ms**, i.e. 40 ms later, in 11 of 11 samples.

### Proposed path

Collapsed first-order cards reach authoritative completion at **first paint**, from the
commit-critical `OperationalContext` they already consume. The Drawer View Model becomes
Stage-2 enrichment whose arrival **may not produce an authoritative mutation of a collapsed card**.

### The exact wait removed

**First paint → drawer-VM arrival: 4,546 ms P50 / 4,770 ms P95.** 59% of the metric.

### Semantic ownership impact

**None for the six configured collapsed cards.** The census in this programme established, and
`firstOrderSurfaceGenerality` guards, that they read only `{model, context}` — never the drawer
view model — and that four of six carry no fact content in their card model at all. The drawer VM
remains the sole owner of drill-down and expanded detail. What changes is not who owns a fact, but
whether a Stage-2 arrival is allowed to count as authoritative completion of a Stage-1 surface.

### The precondition that must be proved first, not assumed

Before ungating, prove empirically that **no collapsed value changes** when the drawer VM lands —
the Stage-2 monotonic convergence contract. If any collapsed field is corrected by that response,
ungating would leave a stale value on screen, which is worse than being slow. The census is a
source-level argument; this needs a rendered-frame oracle comparing every collapsed card's visible
content immediately before and after drawer-VM arrival, across the pinned specimen set.

`post-complete authoritative mutations = 16` says that today something authoritative *is* still
changing after completion, so this precondition is live, not a formality.

---

## OWNER 2 — page composition holds the stream before the first-order payload

### Current path

90,313 bytes (the shell) are delivered by **581 ms**, then the stream **stalls for 2,330 ms**
while the page segment composes, then 128 KB arrives at once. Only **29 KB** crosses the wire in
total. `compose_wall_ms` is 2,540 ms; `composition_ms` 2,259 ms of it.

### Proposed path

The first-order payload is emitted as soon as the commit-critical answer exists, rather than after
the whole page composition completes. The generic compiler
(`focusPanelWorkModeModelFromProvisioningAnswer`) is already a **pure function of the provisioning
answer with no database reads**, so what gates emission is page composition around it, not the
first-order computation itself.

### The exact wait removed

Up to **2,330 ms** of stream stall, bounded below by whatever part of composition the first-order
answer genuinely requires.

### Semantic ownership impact

None. This is scheduling — when bytes are flushed — not a change to who computes what.

---

## Expected product P50

| state | expected P50 |
|---|---|
| today | 7,731 ms |
| Owner 1 alone removed | ≈ 3,280 ms (first paint) — **still 2,280 ms over** |
| Owner 2 alone removed | ≈ 5,400 ms — **still far over** |
| both | ≈ 1,000–1,400 ms, and only then is <1,000 ms in reach |

**Neither owner alone reaches the target.** That is precisely why this is classification D and not
A, and why it needs a Director decision rather than another bounded repair.

## Implementation scope

- **Owner 1**: the Stage-2 convergence contract plus the rendered-frame oracle above. Bounded, but
  it is a correctness contract before it is a performance change.
- **Owner 2**: page-segment emission scheduling. Bounded in code, but it touches the route's
  streaming shape and needs its own byte-level before/after — the probe committed in `4cc9e3d4a`
  measures exactly this.

## What this proposal deliberately does not do

It does not optimise `document_children`, the drawer VM's own query shape, Work Views, or any
further Attendance query. The trace says those are not what the operator is waiting for: the
operator is waiting for a response the collapsed surface does not read, and for bytes the server
is holding.
