---
owner: platform
status: measured
last_reviewed: 2026-07-28
---

# PE-3 — cold primary-usable decomposition

**Measurement, not optimization.** This document reports what the cold path actually costs, how each
cost was attributed, and — equally important — which numbers are *not* trustworthy and why. No fix is
proposed here that the measurement did not earn.

Companion: [`RUNTIME-V1-CERTIFICATION-SPRINT.md`](./RUNTIME-V1-CERTIFICATION-SPRINT.md) (tracker),
[`RUNTIME-V1-SESSION-HANDOFF.md`](./RUNTIME-V1-SESSION-HANDOFF.md) (environment + method).

---

## 0. Method, and what "cold" means here

Prod build (`npm run build` → `next start -p 3013`), real slot-3 operator auth, real remote Supabase.

Four cells, three runs each, **sequential — never concurrent** (concurrent runs contend for CPU and
would corrupt every sample):

| Cell | Server process | Browser context | URL |
|---|---|---|---|
| `cold/deeplink` | fresh (killed + respawned per run) | fresh | `?subject_id=…` |
| `cold/bare` | fresh | fresh | no subject |
| `warmproc/deeplink` | already served the route | fresh | `?subject_id=…` |
| `warm/deeplink` | already served | **reused** (2nd navigation) | `?subject_id=…` |

**"Cold" here = cold server process + cold in-process caches + cold browser context.** The database is
**remote Supabase**, so a local restart does *not* reset DB or page-cache warmth. Nothing in this
document may be read as a cold-database measurement.

**Reproduce it:**
```
cd web && export ALLOY_ROUTE_TIMING=1
./scripts/pe3ColdLoadRun.sh cold deeplink my-run-1     # cold|warmproc|warm  ×  deeplink|bare
node scripts/pe3ColdLoadReport.mjs                     # medians/ranges/%-of-total per cell
node scripts/pe3ConnectionQueueing.mjs                 # stalled-vs-server split (see §4)
```
`ALLOY_ROUTE_TIMING=1` must be set **for the build**, not only the server process — middleware runs on
the Edge runtime, where `process.env` is inlined at build time.

Instrumentation is **prod-native only**: Navigation Timing, Resource Timing, the server `timings`
object embedded in the streamed HTML, and a pre-navigation `MutationObserver` on the production DOM
contract (`data-focus-panel-cell-reserved` / `data-card-role` / `data-fp-render-strategy`).

> **Trap avoided — and it is the one the last session fell into.** The entire `focus_panel_chain:*`
> and `perceived_*` mark suite is gated by `perfDevDetailEnabled()` =
> `process.env.NODE_ENV !== "production"` (`web/lib/perf/perfNamespaceLog.ts:244`). **None of it fires
> in a prod build.** A harness that reads those marks in production measures nothing and silently
> reports zeros. Only `window.__alloyPlatformPerf` (localStorage-gated, not NODE_ENV-gated) and the
> DOM contract survive into prod.

---

## 1. The measured budget (medians of 3; ranges shown)

Absolute ms from `navigationStart`.

| Milestone | cold/deeplink | cold/bare | warmproc/deeplink | warm/deeplink |
|---|--:|--:|--:|--:|
| TTFB (`responseStart`) | **6156** (5557–6293) | 8318 (7909–17535) | **2014** (1901–2096) | **1132** (1092–2049) |
| HTML complete (`responseEnd`) | 8755 | 11162 | 3928 | 3673 |
| `domInteractive` | 8757 | 11163 | 3929 | 3673 |
| runtime root in DOM | 8757 | 11163 | 3929 | 3674 |
| **first truthful card** | **12516** (11734–13149) | 11769 | **7721** (7195–8139) | **6374** (5377–7508) |
| **all published cards** | **19314** | 18384 | 15225 | 14362 |

Server compose, from the `timings` object delivered in the HTML (medians):

| Cell | `total_ms` | `work_unit` | `configuration` | `composition` |
|---|--:|--:|--:|--:|
| cold/deeplink | 2441 | 347 | 675 | 1490 |
| cold/bare | 2517 | 376 | 705 | 1389 |
| warmproc | 1938 | 0 | 1 | 1561 |
| warm | 1800 | 0 | 4 | 1386 |

> `presentation_ms` and `records_ms` are **residual waits, not costs** — the work is kicked off earlier
> and merely joined at those points. Sum-of-parts will never equal `total_ms`, by design. Do not treat
> the shortfall as unexplained.

Server spawn → port accepting TCP: **573ms** (321–2303, n=6). Route modules are *not* loaded then —
Next loads them on the first HTTP request, so module load sits inside TTFB.

---

## 2. The two attributions that matter

### 2a. The server's cold cost is auth + route-identity resolve — and inferring it from TTFB was wrong

This section originally concluded, by subtracting `compose total_ms` from TTFB, that the cold residual
was Next route-module load. **That inference was invalid and the direct instrumentation overturned
it.** It is left visible here because the mistake is instructive.

The subtraction assumed the first byte cannot leave until the layout's `await` resolves. Under the App
Router it can: the shell **streams before** the `[workUnitSlug]` layout finishes. The proof is in the
data — `compose_wall_ms` (5456) is *larger* than TTFB (4289) in the same request, which is impossible
under the assumed serial model. TTFB is not gated on the compose; **`responseEnd` is.**

So the residual was measured directly instead (`ALLOY_ROUTE_TIMING=1`, medians, n=3 per cell):

| Span | cold | warmproc | warm (2nd nav) | what it is |
|---|--:|--:|--:|---|
| middleware `getUser()` | **1092** | 1037 | **345** | remote Auth round trip, before the route runs |
| middleware start → layout entry | 1188 | 1051 | — | the above **plus** module load + RSC boot |
| ⇒ route-module load + RSC boot | **~100** | ~14 | — | the remainder — small, not the bottleneck |
| `route_meta_ms` | **2426** | 722 | 692 | route-identity/meta resolve |
| `timings.total_ms` (internal) | 2434 | 1722 | — | the only part previously visible |
| `compose_wall_ms` | **4860** | 2449 | 2752 | provisioning compose, wall |
| ⇒ compose *outside* its own clock | **~2426** | ~727 | — | `compose_wall` − `timings.total_ms` |
| TTFB / `responseEnd` | 4228 / 7014 | 1766 / 3548 | 723 / — | |

Three findings, none of which was visible before:

1. **Middleware auth costs ~345ms on *every* request, steady state** (`middleware.ts:104`).
   `supabase.auth.getUser()` validates against the remote Auth server rather than reading the cookie
   locally. This is unconditional and product-controlled.
2. **A further ~700ms on first load is token *refresh*, and it is partly a fixture artifact.** Auth
   measured 1092ms cold and 1037ms warm-process — identical, so it is *not* connection setup — but
   **345ms** on a second navigation in the same context. The delta is the refresh of an expired access
   token. The slot-3 storage state was ~11h old, so **every fresh browser context in this harness paid
   a refresh that a real operator pays only once per token lifetime.** Cold figures here therefore
   overstate auth by ~700ms. The steady-state ~345ms independently matches a direct probe of that
   endpoint (~330ms) taken separately.
3. **Route-identity resolution costs ~2.4s cold and was entirely invisible.** `route_meta_ms` (2426)
   and the compose's out-of-clock portion (~2426) match almost exactly, because
   `resolveWorkUnitRouteIdentity` is React-`cache()`d and *both* consumers await the same resolution
   (3 DB reads). It is one shared ~2.4s dependency, not two. It falls to ~700ms once the process is
   warm, so ~1.7s of it is cold in-process cache miss.

**Cold server budget to `responseEnd` ≈ auth ~1.1s (of which ~0.7s is the refresh artifact) + shared
identity resolve ~2.4s + compose ~2.4s + serialize/stream ≈ 7s** — which is what `responseEnd`
actually measures (6957–7455).

**The earlier "module load ≈ 3.7s" claim is withdrawn.** Module load is ~100ms.

### 2b. The dominant cost is not cold-specific at all

First-truthful-card → all-published-cards, by cell:

| cold/deeplink | cold/bare | warmproc | warm |
|--:|--:|--:|--:|
| +6798ms | +6615ms | +7504ms | **+7988ms** |

**~7–8 seconds, essentially constant in every condition, warm included.** It does not shrink when the
process is warm, the caches are warm, or the browser is warm. It is gated on the enriched drawer VM
(`/api/admin/view-models/drawer/opportunity/…`, **5478ms of real server time**), and it is the single
largest block in the whole budget — 35–56% of total depending on cell.

That is **CP-1**, not PE-3. The cold investigation's headline result is that the remaining cold gap is
mostly environment, while the remaining *product* gap is the post-hydration settlement hop.

---

## 3. Structural defects the waterfall proves

These are structural — read directly off the request log, independent of host noise.

### 3a. A deep link composes the provisioning answer twice, for two different subjects

`[workUnitSlug]/layout.tsx` has no `searchParams` (a Next layout never receives them), so it composes
the **default** subject and seeds that:

```ts
const answerP = composeProvisioningAnswerForRoute({
    rawSlug: workUnitSlug, requestedWorkViewId: null, requestedSubjectId: null,
})
```

The layout's own header comment states the consequence: a `?subject_id=` deep link "keys differently
and falls back to K2's live fetch."

Measured, on `cold/deeplink`:
- server spends **2441ms** composing an answer for a subject the page will not display, and
- the client then spends **3048ms of server time** re-composing the answer for the subject it *does*
  display, after hydration (`+5939ms → +8987ms`).

**Proof the seed mechanism itself works:** on `cold/bare` the main provisioning-answer client fetch is
**absent entirely** — only the sibling prewarms remain. The seed is effective; the deep link forfeits it.

> **Honest limit on this finding.** The redundancy is certain. Its *end-to-end* value is not
> demonstrated: `cold/bare` (seed hits) reached first-card at 11769ms vs `cold/deeplink` (seed misses)
> at 12516ms — a ~750ms difference, far less than the ~3.0s of redundant work removed, and inside the
> noise of a contended host. Removing the redundancy is justified as *correctness of work performed*;
> it is **not** yet justified as a ~3s cold win, and must not be sold as one.

### 3b. Five provisioning-answer composes per page load

One for the displayed subject plus **four speculative sibling prewarms** (`work_view_id=new_work_view_2…5`),
all fired at the instant the first card paints, each costing 1.0–2.3s of server time. They also occupy
connections (§4), delaying `activity`, `related`, `threads` and `communications/bindings` by 4.7–5.9s.

### 3c. The settlement chain is serial

`layout-runtime/opportunity-drawer-body` is requested at **+15957ms — 2ms after** the drawer VM
resolves at +15955ms. A strict serial two-hop chain. It resolves after all-cards, so it is *not* on
the primary-usable path, but it does extend full settlement to ~25s.

### 3d. `drawer-recipients` is requested twice

Confirmed in every cell (2×).

---

## 4. What is NOT trustworthy in these numbers

Stated plainly, because a budget that hides its own error bars is worse than no budget.

- **HTTP/1.1 connection queueing is a local artifact.** `next start` serves http/1.1; the browser
  opens ~6 connections per host; the page issues **35** API requests. Across one load: **60,549ms
  stalled (queued, not server work)** vs 74,564ms of real server TTFB — **~45% of aggregate request
  time never reached the server**. Production behind HTTP/2 would not queue this way. **No optimization
  may be argued from Resource Timing `duration`;** only from the `responseStart − requestStart` split.
  The per-request server times quoted above are that split.
- **The host was contended.** Load average **7.8–15.6** with ~55–134MB free during the runs, alongside
  two other worktree dev servers. Absolute figures are inflated by an unknown factor. `cold/bare` run 2
  (TTFB 17535ms vs 7909ms for run 1) is a pure contention outlier and is why the median-of-3 with
  ranges is reported rather than any single trace.
- Therefore: **relative and structural conclusions are sound; absolute cold numbers are an upper
  bound on this host, not a product metric.** The ~6.5s figure carried in the tracker is not
  comparable to the ~12.5s measured here — different host conditions and a full process-cold start.

---

## 5. Classification

| # | Cost | ms (cold/deeplink) | Class | Required for primary usability? | Owner |
|---|---|--:|:--:|:--:|---|
| 1a | Middleware `getUser()`, steady state — **every** request | **345** | **A** required, but see §7 | yes | `middleware.ts:104` |
| 1b | Token refresh on first load after expiry | ~700 | **F** partly fixture artifact (11h-stale token) | no | auth fixture |
| 1c | Shared route-identity resolve (3 DB reads) | **2426** cold / 722 warm | **A** required | yes | `resolveWorkUnitRouteIdentity` |
| 1d | Next route-module load + RSC boot | ~100 | **D** environment/build | no | Next / build |
| 2 | Server compose of the **default** subject on a deep link | 2441 | **C** duplicate/wasted | **no** — discarded | route layout |
| 3 | RSC stream + serialize (155KB) | ~2599 | **A** required | yes | RSC |
| 4 | Client re-compose of the requested subject | ~3048 | **C** duplicate + **B** serialized after hydration | yes (on this path) | K2 / seed keying |
| 5 | Enriched drawer VM gating the last card | ~5478 | **E** deferred work gating usability | contested — see §6 | CP-1 |
| 6 | 4 speculative sibling prewarms | 4×1.0–2.3s | **C** duplicate/speculative | no | prewarm scheduler |
| 7 | `layout-runtime` serial after drawer VM | 9626 | **B** accidentally serialized | no (post-settlement) | Tier-3 |
| 8 | `drawer-recipients` ×2 | 2369 | **C** duplicate | no | comms |
| 9 | HTTP/1.1 connection stalling | 60549 aggregate | **F** measurement artifact | n/a | local only |
| 10 | Host contention inflation | unknown | **G** unknown | n/a | environment |

No cost is left in **G** except the contention factor itself, which is environmental and cannot be
resolved from this repo.

---

## 6. The one open definitional question

Whether item 5 is class **A** (required) or class **E** (deferred work incorrectly gating usability)
depends on what "primary-usable" means for the last card:

- If **first truthful card** is the bar, the panel is usable at 12.5s cold and the drawer-VM hop is
  deferred settlement — class A for the enriched view, and PE-3's target is item 4.
- If **loads-as-one** is the bar (the panel must not visibly complete in stages, per Runtime V1
  doctrine), then a 7–8s spread between the 3 seeded cards and the 4th is a doctrine violation, and
  item 5 is class E.

The tracker records "loads-as-one spread 0ms" as **certified warm in prod** — but that certification
was taken on the **queue-row-click** path (client-side navigation), not on a **cold document load with
`?subject_id=`**. These are different paths and the certification does not transfer. This is not a
regression report; it is a scope statement: **the certified claim and the path measured here are not
the same claim.**

Resolving this is a decision about the product's usability bar, not a measurement — it is the one
question this decomposition cannot settle by itself.
