---
owner: platform
status: analysis
last_reviewed: 2026-07-28
---

# PE-3 — architecture options for the dominant product-controlled bottleneck

Evidence: [`PE3-COLD-LOAD-DECOMPOSITION.md`](./PE3-COLD-LOAD-DECOMPOSITION.md). Options are analysed
under CP-1 discipline (≥5 materially distinct approaches, compared before any implementation).

---

## 1. Naming the bottleneck — and separating two different ones

The decomposition surfaced **two** large costs. They are not the same problem and must not share an
option set.

**PE-3's bottleneck (this document): the deep-link seed miss.**
On a `?subject_id=` cold load the Provisioning Answer is composed **twice, for two different subjects**:
2441ms on the server for the *default* subject (discarded — nothing on the page consumes it) and
3048ms of server time again on the client for the *requested* subject, after hydration. ~5.5s of
work on a ~12.5s cold path, of which one half is waste and the other half is serialized behind
hydration. This is product-controlled and squarely inside the repo.

**CP-1's bottleneck (out of scope here): the enriched drawer-VM hop.**
First-card → all-cards costs **6.8–8.0s in every cell, warm included** (drawer VM = 5478ms real server
time). It does not shrink with warmth, so it is not a cold problem at all.

> **This settles the reorder question the handoff left open.** PE-3 was run before CP-1 on the
> reasoning that it needed no design gate. That was correct as sequencing, and the measurement now
> shows **CP-1 is the larger prize**: the cold-only penalty is ~3.7s of Next module load (environment,
> §5 class D), while CP-1's ~7–8s is constant and product-owned. PE-3's own product-controlled share
> is real but smaller. CP-1 should follow immediately, and it now has measured evidence to open with.

**The largest single cold number — ~3715ms of route-module load — is class D (environment/build) and
is not addressable as an architecture option here.** On a fresh `next start` process Next loads route
modules on first request; in production this is a deployment/runtime cold-start concern, not a runtime
architecture concern. Recorded, not optimized.

---

## 2. The options

### O1 — Smallest tactical correction: seed from the page segment, using `searchParams`
`page.tsx` *does* receive `searchParams`; compose the requested subject there.

**Already tried and reverted, with measurement.** `page.tsx:1-8` records that a page-segment seed
hydrates in a later streaming boundary than the shell's Surface Host, so K2's cold consume fires
first and the seed loses the race. Listed for completeness and to stop a future session re-deriving
it. **Rejected on existing evidence.**

### O2 — Smallest correction that can actually work: forward the subject to the layout via a request header
A Next layout cannot receive `searchParams`, but middleware already runs on every request and can read
`request.nextUrl.searchParams`, and can forward values as request headers the layout reads with
`headers()`. The layout then composes **the subject the URL actually asks for**, in the *same*
streaming boundary that already wins the race today.

Removes both halves: no wasted default compose, no post-hydration re-fetch.

### O3 — Concurrency: overlap the client fetch with HTML streaming instead of serializing after hydration
Leave the compose where it is, but stop the requested-subject fetch from *waiting* for hydration —
start it at parse time from the document (early inline kick-off / preload), so it overlaps the ~2.6s
HTML stream and the hydrate window. Does not remove duplicated work; removes the serialization
(class B) only.

### O4 — Cache / precomputation: split the answer into a subject-independent shell and a subject delta
`configuration_ms` (675 cold) and `work_unit_ms` (347 cold) are **subject-independent** and are paid
twice today. Seed the shared shell once per route identity; let only the subject-specific slice be
fetched per subject. Attacks duplication structurally rather than per-path.

### O5 — Ownership-boundary redesign: the route identity carries the full request intent
Today correctness depends on *which segment* composes (layout vs page) and on a `null` passed for
`requestedSubjectId`. Make `requestedSubjectId` part of the route identity contract so
`composeProvisioningAnswerForRoute` is always called with the complete intent and no segment can
silently compose the wrong thing. The deep-link bug becomes unrepresentable.

### O6 — Removal of noncritical work: skip the default compose when the URL names a subject
Pure subtraction. If the request carries `subject_id`, the default-subject compose is provably not
consumed by that page load — so don't do it. Saves ~2441ms of TTFB with no new mechanism. Leaves the
client fetch in place.

---

## 3. Comparison

| | O1 page seed | O2 header→layout | O3 overlap fetch | O4 shell/delta split | O5 identity contract | O6 skip default |
|---|---|---|---|---|---|---|
| **Cold improvement potential** | none (loses race) | **highest** (~2.4s TTFB + ~3.0s post-hydrate) | medium (~2.6s of serialization) | medium–high | same as O2 | **~2.4s TTFB**, certain |
| **Warm-regression risk** | — | low–med: adds compose to TTFB on deep links that previously streamed earlier | low | medium | low–med | **none** (removes work only) |
| **Data freshness** | — | unchanged (same composer/gate) | unchanged | **risk**: shared shell may outlive subject data | unchanged | unchanged |
| **Tenant isolation** | — | unchanged | unchanged | **needs care**: shared shell must be tenant-keyed | unchanged | unchanged |
| **Complexity** | low | **low–medium** | medium | **high** | medium | **lowest** |
| **Observability** | — | good (one compose to trace) | poor (two racing origins) | medium | good | good |
| **Failure behaviour** | — | header absent → today's behaviour | double-fetch if race lost | stale-shell class of bug | safest by construction | seed absent → K2 fetches (today's path) |
| **Coordinator risk** | — | none (no new coordinator) | **introduces a race to arbitrate** | none | none | none |
| **Child-surface generalization** | — | good | poor | good | **best** — any deep-linked surface inherits it | neutral |

---

## 4. Recommendation, and what must NOT be claimed

**Implement O6 now. Hold O2/O5 for a quiet-host A/B. Reject O1. Defer O3 and O4.**

Reasoning:

- **O6 is the only option this measurement fully earns.** The decomposition *proves* the default-subject
  compose is not consumed on a deep-link load. Removing provably-unused work is a correctness change
  that needs no timing claim to justify it.
- **O2 is the better fix and probably the right end state**, but §3a of the decomposition records an
  honest limit: `cold/bare` (seed hits) reached first-card at 11769ms vs `cold/deeplink` (seed misses)
  at 12516ms — only ~750ms apart, far less than the ~3.0s of redundant work, and inside the noise of a
  host running at load average 7.8–15.6. **On this host an A/B cannot distinguish a 3s win from
  nothing.** Shipping O2 and claiming a cold win would be exactly the cross-session-median error this
  initiative has already made once and written down.
- **O5 is where O2 should land eventually** — it makes the defect unrepresentable and is the only option
  that generalizes cleanly to the Child second surface, which will also be deep-linked. It should be
  designed *with* the Child surface, not before it, per the standing rule against inventing
  cross-surface abstractions ahead of the second-surface evidence.
- **O3 introduces a race** between a parse-time kick-off and the kernel's own consume, i.e. exactly the
  coordinator risk this runtime has repeatedly paid for. Not worth it when O2 removes the fetch outright.
- **O4 is the most architecturally interesting** and the only one that attacks duplication structurally,
  but it changes the answer contract and introduces a stale-shell freshness class. Too large to justify
  on current evidence.

**Explicitly not claimed:** that O6 improves cold primary-usable by a measurable amount. It removes
~2441ms of server work that nothing reads. Whether that converts into wall-clock on a quiet host is a
separate measurement, and it has not been taken.

---

## 5. Two further candidates the direct instrumentation surfaced

These emerged only after `ALLOY_ROUTE_TIMING=1` measured the server spans directly, and they were
invisible to every prior session because `ProvisioningTimings` starts its clock inside the compose.
They are recorded as candidates, **not** analysed to the ≥5-option depth — that belongs with whoever
takes them, and neither should be touched before a quiet-host baseline exists.

### C1 — Middleware auth is ~345ms on *every* request, steady state
`middleware.ts:104` runs `supabase.auth.getUser()`, which validates the JWT against the **remote** Auth
server rather than verifying it locally. The matcher excludes only static assets, so the document
**and all ~35 API requests** pay it. Steady-state cost measured at 345ms (independently corroborated by
a ~330ms direct probe of that endpoint).

This is the single most *systemic* server cost found: it is unconditional, it is on every request, and
it is entirely product-controlled. Directions worth analysing: local JWT verification against the
project JWKS with `getUser()` reserved for genuine privilege boundaries; or narrowing the matcher so
asset-like and already-authenticated API traffic does not re-validate. **Security-sensitive — this is
the auth boundary, and `getUser()` is the *correct* call for validation. Any change here needs its own
threat review, not a perf argument.**

### C2 — Route-identity resolution costs ~2.4s cold for 3 DB reads
`resolveWorkUnitRouteIdentity` is React-`cache()`d, so the layout's two consumers correctly share one
resolution — the caching is already right. But that shared resolution still costs ~2426ms cold
(~722ms warm-process), making it the largest single *required* server dependency on the cold path.
Worth attacking as precomputation/caching (it resolves a slug against work units and departments —
slow-changing tenant configuration), which is a different shape of fix from anything in §2.
