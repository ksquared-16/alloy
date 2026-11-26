# P0-7.6 Owner 2 (Part 10) — the exact await, and why removing it trades slow for stale

Run: erun_e03540b4bdb6707c · Lane: lane_73a897409906

## CORRECTION to an earlier artifact in this programme

`owner2-first-order-emission-trace.md` states that the collapsed cards "consume **no**
`document_children`", on the grounds that the Children card reads `truth._inquiry_children`.

**That was wrong, and this supersedes it.** `_inquiry_children` *is* `document_children`:

```ts
// workUnitProvisioningAnswer.ts:2494
const documentChildren = await documentChildrenP;
markSpan("document_children_tail_ms", t_children_join);
// :2513
const subjectIdentityTruthWithChildren = documentChildren
    ? { ...(subjectIdentityTruth ?? {}), _inquiry_children: documentChildren }
    : subjectIdentityTruth;
```

The collapsed Children card's count and collection read exactly that key. So the collapsed
first-order surface **does** consume document_children.

## Part 10 — the exact await

`workUnitProvisioningAnswer.ts:2494`, `await documentChildrenP`, immediately before the
commit-critical context is built. The chain starts at :1933 as soon as `subjectRow` exists.

Measured: `document_children_ms` 2,468 P50 (the chain) and `document_children_tail_ms` 1,852 P50
(what remains past all other work). The chain is **already fully overlapped** — everything else
finishes at 778 ms while it is still in flight.

## Why the wait is load-bearing, not accidental

The code says so explicitly, and it was written as a deliberate repair:

> AWAITED HERE — before the commit-critical context is built, which is the whole point. The first
> attempt awaited this AFTER `buildCommitCriticalOperationalContext` … the COMMIT context would
> still have carried the children-less bag, the commit predicate would still have been false, and
> the card would still have waited for the drawer.

So this 1,852 ms **is the price of the Children card's first-order authority** — the same property
Owner 1 just bought for Attendance and Health & Safety.

Emitting before it would put the Children card back to reserving and then filling. That is not a
saving; it moves the same wait from the server to the browser, and `FIRST_ORDER_VISIBLE_COMPLETE`
measures the last authoritative mutation, so the metric would not improve either.

## The consequence for the target

`composition_ready` is 2,595 ms P50 and `document_children` is its pole. With the Children card
configured and needing a roster, **`FIRST_ORDER_VISIBLE_COMPLETE` cannot go below
document_children's completion** plus wire and render. `<1,000 ms` is therefore unreachable for
this configuration while that chain costs ~2.5 s.

Only two levers exist, and the dispatch forecloses one:

| lever | verdict |
|---|---|
| make `document_children` faster | **forbidden** by this dispatch |
| stop waiting for it | **trades slow for stale** — reintroduces a legitimate correction |

## The one sanctioned split, identified but NOT implemented

Part 12 explicitly permits Stage 2 to "resolve photos", and `PHOTO_ADDED` is an allowed monotonic
transition. The children chain mints `resolved_photo_url` per actor per request inside the same
attach — and photos are the one part of the roster the collapsed count and collection do **not**
need.

So the legitimate Owner 2 repair is: attach the roster **without** photo minting for first-order,
and let photos arrive as Stage 2. That is scheduling/ownership, not a change to the children query.

**It is not implemented here, and I will not claim a saving for it:** the photo-minting share of
the 2,468 ms chain is not instrumented, so the size of the win is unknown. Measuring that share is
the first step of any Owner 2 attempt, not an afterthought.

## Status

Owner 2 as specified — "emit when commit-critical is ready, let document_children continue" —
**cannot be implemented without reintroducing the exact defect Owner 1 removed.** The remaining
owner is document_children's own cost, with the photo split as the only sanctioned way to reduce
what first-order must wait for.
