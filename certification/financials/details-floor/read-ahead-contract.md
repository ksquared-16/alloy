# The existing read-ahead contract, and why Accounts was outside it

Mapped from source before any mutation, per §5.

## The eight questions

**1. Which host supplies the projection?** The Focus Panel, via
`context.operationalProjection.cards.financials`. It is not a client prefetch at all — the
projection **carries the answer**, composed server-side and arriving with the subject it belongs to.

**2. What does `hostSuppliesProjection` mean?** `context.operationalProjection != null` — "this host
will hand me the card's model; do not bootstrap one." A host supplying none is answered by the
card's self-bootstrap instead, which is the branch the Accounts workspace takes.

**3. What starts the prewarm?** An effect in `FinancialsCard`. Its first line is
`if (!hostSuppliesProjection || provisioned?.state !== "ready") return;` — so the *deep* read-ahead
only ever runs where a projection is supplied and ready. It is queued at idle and cancelled if the
subject changes, per the repository's stated doctrine: *sanctioned idle prefetch, never a reveal
gate*.

**4. At what grain?** The account: `customerId ?? scopedMemberId`, composed into
`customer_id=…` / `customer_member_id=…`.

**5. Where was the result/in-flight owned?** `coalescerRef = useRef(createInFlightCoalescer())` —
**on the component instance**.

**6. How does Details consume it?** `load()` runs through that coalescer and applies the answer with
`setVm`, guarded by `requestSeq` supersession and `deepLoadedForRef` / `answeredKeyRef`.

**7. What prevents duplicate reads?** The coalescer: one slot, keyed by the composed query, a second
ask for the same key joining the first. A *different* key replaces the slot rather than joining it,
so two accounts are always two operations.

**8. What invalidates it?** Nothing needs to. The slot is cleared the instant the operation settles,
so it holds no truth between operations; a mutation's re-read is simply new work. That is the
existing doctrine, and this repair does not alter it.

## Why Accounts never participated

Two independent reasons, and the second is the fatal one:

1. `FinancialsAccountDetail` supplies no `operationalProjection`, so `hostSuppliesProjection` is
   false and the idle prewarm returns early. The host was never eligible.
2. **The Accounts card is keyed by account** (`key={account-${selected}}`). Every selection mounts a
   new instance with a new ref and an empty slot, so even an eligible prewarm would have had
   nowhere to put an in-flight read that the next instance could join.

Measured consequence on deployed `92bfd2217`, fresh, cold n=5 / warm n=8:

| milestone | COLD P50 | WARM P50 |
|---|---|---|
| selected row | 160 ms | 119 ms |
| floor geometry | 1,199 ms | 1,040 ms |
| **usable Details** | **1,205 ms** | **1,042 ms** |
| first financial meaning | 1,208 ms | 1,043 ms |

Targets are <500 ms cold and <250 ms warm. The row commits in ~160 ms; everything after it is one
request that began at the click.

## The repair, in one sentence

Move the coalescer out of the instance and let it return the model, so a read started on intent is
the same read the card later joins — without caching any financial truth, and without touching F44.

One detail is load-bearing: the coalescer returns the **first** caller's promise and never runs a
later caller's work. A prewarm coalescing a `void` operation would have left the card awaiting a
promise that resolves to nothing, having never called its own `setVm` — the read would be free and
the card would still be empty. The coalesced operation is therefore the fetch, and its value is the
model.
