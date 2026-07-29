---
owner: platform
status: analysis + implemented
last_reviewed: 2026-07-28
---

# CP-1 — the enriched-VM post-hydration waterfall

Evidence: [`PE3-COLD-LOAD-DECOMPOSITION.md`](./PE3-COLD-LOAD-DECOMPOSITION.md).
Governing law: [`CARD-READINESS-LIFECYCLE.md`](./CARD-READINESS-LIFECYCLE.md) (frozen).

---

## 1. The reconstructed serial chain

Measured on a prod build; each hop verified in code, not inferred from the trace alone.

```
document request
  → middleware getUser()                       ~345ms steady (~1092ms w/ token refresh)
  → route-identity resolve (shared, cache()d)  ~2426ms cold / ~722ms warm
  → provisioning compose                       ~2434ms internal
  → HTML stream                                responseEnd ~7014ms cold
  → hydrate
  → [DEEP LINK ONLY] client provisioning fetch ~3048ms   ← seed key ≠ consume key
  → commit-critical model  ⇒ current_work, household, children paint
                           ⇒ panel operational-ready ALREADY TRUE here
  → useRecordWorkRuntime effect (no gate)
      → drawer VM fetch                        ~5478ms server
      → serial await stage-work
      → applyVm ⇒ scheduling + billing_preview paint
                → prefetchDrawerLayoutRuntimeBody (fire-and-forget) ~9626ms
  ‖ concurrently, NOT gated: 4 sibling prewarms, each = 1 provisioning compose + 1 drawer VM compose
```

## 2. Classification of each segment

| Segment | Class | Required before first truthful card? | Required before all VISIBLE cards? |
|---|---|:--:|:--:|
| middleware auth | required (A) | yes | yes |
| route-identity resolve | required (A) | yes | yes |
| provisioning compose | required (A) | yes | yes |
| deep-link client re-compose | **duplicate (C)** + serialized (B) | yes, on that path | yes |
| drawer VM fetch | **see §4 — carries no data the waiting cards need** | no | *today* yes |
| stage-work serial await | serialized (B) | no | yes |
| `layout-runtime` body | speculative prefetch | no | **no** (Tier-3 only) |
| 4 sibling prewarms | **speculative (E)** | no | no |
| HTTP/1.1 stalling | local artifact (F) | — | — |

## 3. What "all visible cards" actually means — a correction

The default composition's visible set is `current_work, household, children, scheduling, billing_preview`.
Three paint at commit. The two that wait are **`scheduling`** and **`billing_preview`**.

**Panel operational-ready does not wait for either.** `isOperationallyResolved(operational)` asks whether
there is a committed subject, a current business state and a truthful action — it is true at commit, and
`data-focus-panel-operational="resolved"` is already emitted then, with
`data-focus-panel-settlement="pending"` alongside. My PE-3 harness conflated "4 card elements present"
with operational-readiness; they are different questions and the DOM already distinguishes them.

**`billing_preview` must NOT be promoted.** `CARD-READINESS-LIFECYCLE.md:19` is explicit — at commit the
runtime does not know the billing config, and forcing a verdict fabricated one (measured, and fixed in
`7ce9f23e3`). Line 220: "At commit Billing is a title-only reserved hold." Line 221: operational readiness
is *defined* as independent of Billing settlement. Promoting it would violate frozen doctrine and
re-introduce the exact defect this initiative already removed.

That leaves **`scheduling`** as the whole of the addressable gap.

## 4. The finding that decides the architecture

**`scheduling` waits ~7s for a fetch that contains none of the data it uses.**

`buildSchedulingCardModel(record)` reads exactly one field:

```ts
const rows = mapRawInquiryChildrenToDrawerRows((record._inquiry_children as unknown[]) ?? []);
const count = rows.length;
const collection = schedulingCollectionItems(record);
...
void collection;                      // computed and DISCARDED
```

and `schedulingCollectionItems` hardcodes every child's status — it reads no assignment data at all:

```ts
// Operational schedule assignments do not exist until enrollment/Registration;
// at the case-grain lead stage each child reads "Needs a room" (honest state,
// never a fabricated schedule).
return { label: firstName, status: "Needs a room" };
```

`_inquiry_children` is **already in the commit-critical context** — the `children` card's spec gates on
exactly `context.truth._inquiry_children != null`, and the provisioning composer builds it as "the
`_inquiry_children` raw shape the shared `buildChildrenCardModel` consumes so the committed card is
byte-identical" (`workUnitProvisioningAnswer.ts:775`).

So the card is not waiting on data. It is waiting because it has no entry in
`COMMIT_CRITICAL_CARD_SPECS`. **This is a registry omission, not a waterfall.**

## 5. Options

| | Description |
|---|---|
| **A — tactical: skip the wrong-subject compose** | On a deep link the server composes the default subject and discards it. Requires the layout to know the URL has a subject — a Next layout gets no `searchParams`, so it needs a new middleware→`headers()` channel. |
| **B — concurrency: start the drawer VM earlier** | Fire the enriched fetch during streaming rather than after hydration. |
| **C — seed expansion: put enriched data in the server seed** | Widen the Provisioning Answer so the client needs no second critical fetch. |
| **D — ownership boundary: register `scheduling` as commit-critical** | The producer already holds its only input; declare it in `COMMIT_CRITICAL_CARD_SPECS` so the shared builder runs at commit. |
| **E — deferral: gate sibling prewarms behind the reveal window** | 4 prewarms (each = 1 provisioning compose + 1 drawer VM compose) fire via `requestIdleCallback(timeout:2000)` *inside* the reveal window. The guard already exists and is applied to neighbour-subject warms and workspace-surface warms — `prefetchWorkView` was simply missed. |
| **F — cache/precompute the route identity** | ~2426ms cold for a slug→work-unit/department resolve over slow-changing config. |

### Comparison

| | A skip | B earlier VM | C seed expansion | **D register scheduling** | **E gate prewarms** | F identity cache |
|---|---|---|---|---|---|---|
| Cold improvement | ~2.4s server | small | large | **removes a 5.5s wait for 1 card** | frees reveal-window capacity | ~1.7s cold |
| Warm improvement | none | small | large | **same removal, warm too** | same | ~0 |
| first→all-cards spread | none | shrinks | shrinks | **halves the waiting set (2→1)** | indirect | none |
| Data freshness | unchanged | unchanged | **risk** — enriched data ages in HTML | **unchanged** (identical builder) | unchanged | **risk** — config staleness |
| Tenant isolation | unchanged | unchanged | more data in HTML | **unchanged** | unchanged | needs tenant-keyed cache |
| Error behaviour | seed absent → today's path | racier | bigger failure blast radius | **unchanged** — card falls back to reserved | prewarm merely deferred | stale-on-error |
| Cache invalidation | n/a | n/a | hard | **n/a** | n/a | **hard** |
| Coordinator risk | none | **introduces a race** | none | **none** | none — reuses existing gate | none |
| Complexity | medium (greenfield header channel) | medium | **high** | **lowest — one array entry** | **lowest — one guard** | high |
| Observability | good | poor | medium | good | good | medium |
| Record switching | unaffected | risk of stale flash | risk of stale seed | **unaffected — same model both phases** | unaffected | unaffected |
| Child-surface generalization | good | poor | medium | **excellent — the registry is the seam** | good | neutral |
| Fabricated/stale truth risk | none | none | **stale risk** | **none — byte-identical model** | none | stale risk |

## 6. Decision

**Implement D + E. Defer A. Reject B, C, F for now.**

- **D** is the smallest possible change that attacks the dominant product-controlled chain, and it is
  behaviour-preserving by construction: the *same* shared builder over the *same* input produces a
  byte-identical model, just earlier. It needs no new mechanism, no coordinator, and no new data read.
- **E** removes 4 provisioning composes + 4 drawer-VM composes from the reveal window using the guard
  that already exists three other places. Not adopting it leaves the storm competing with the very
  work D accelerates.
- **A** is real but needs a middleware→`headers()` channel with **zero precedent in this repo**, and its
  end-to-end value is unproven on a contended host. Deferred with its evidence, not forgotten.
- **B** introduces a race for a modest win — the coordinator risk this runtime has repeatedly paid for.
- **C** would put enriched, ageing data in the HTML: a freshness and blast-radius cost for a case that
  D solves with no data movement at all.
- **F** targets a genuinely large cold cost but needs a tenant-keyed cache with a real invalidation
  story; it is a separate concern with its own proof obligations.

**Not claimed:** that `billing_preview` should ever join them. Doctrine says it must not, and this
analysis agrees — the panel is operational without it, and its verdict is genuinely unknown at commit.

---

## 7. Certification (prod build, default-off instrumentation, slot-3 auth)

| Scenario | Result |
|---|---|
| Cold deep link ×3 (fresh process each) | TTFB 4250–4273; **operational-ready 10653–10692ms**; settlement 17339–17520ms; 35 API requests; 0 console/page errors |
| Warm deep link ×5 | TTFB median 1755; **operational-ready median 6699ms** (6484–7988); settlement median 13896ms (13035–15593); 0 errors |
| Narrow 480px | strategy correctly becomes `published-rows`; same 4-card set, same order; operational 8004ms; 0 errors |
| Record switch A→B | subject commits at +2760ms; **card count constant at 4** (no geometry swap, no collapse); final content correct (Chapmap → Fitz); 0 errors |
| Published-doc tenant (Firefly) | `published-lanes`, `publishedCards=4`, Milestones absent, Billing present-but-unresolved at commit — **unchanged** |

### The structural win, stated exactly

**Sibling prewarms moved out of the reveal window.** Before: all four fired at **+11741ms**, inside the
window, competing with the drawer-VM fetch the operator was waiting on. After: **+17698/17729ms**,
after settlement resolves (~17.4s). That is 4 provisioning composes + 4 drawer-VM composes removed
from contention — verified structurally, independent of host timing.

Timings did also improve (cold operational-ready ~12.5s → ~10.7s), but the host remains contended and
**no causal timing claim is made from it**.

### Two honest scope limits

1. **The `scheduling` promotion is not observable on the certified tenant.** Firefly publishes a
   4-card doc — `current_work`, `billing_preview`, `children`, `household` — that **does not include
   `scheduling`**. The promotion is verified by unit guards and matters for the default composition
   and the Child surface; it changed nothing measurable here, and is not claimed to have.
2. **On Firefly the first-card → all-cards gap is entirely `billing_preview`, and doctrine requires
   that gap.** `operational:resolved` fires *with* the three commit cards while
   `settlement:pending`; Billing arrives at settlement. That is exactly
   `CARD-READINESS-LIFECYCLE.md:220-221`. So on this tenant CP-1's premise — "a large spread to
   eliminate" — does not hold: the spread is the doctrine working.

### A measurement correction worth recording

The record-switch run first appeared to show **34 frames (~3.4s) of "stale subject"** — the panel's
`data-inline-focus-panel-subject` carrying the NEW id while cards still rendered the OLD family. That
reading was wrong, and the mistake is instructive: that attribute tracks the **committed selection**,
not the **visible payload**. `InlineOpportunityFocusPanel.tsx:339-345` implements *ATOMIC SUBJECT
COHERENCE* — `visible = resolved ?? heldPrior` binds header **and** body to the prior subject until
the destination VM is coherent, then swaps atomically, specifically so a mixed-subject frame cannot
occur. Holding the complete prior subject is the designed behaviour, not a flash.

What the episode does expose is that the ~3.4s hold is the drawer-VM fetch showing up in *switching*
latency. That is the same enriched-VM cost, in the interaction path rather than the load path — and
it is the strongest remaining argument for attacking the drawer VM itself.

