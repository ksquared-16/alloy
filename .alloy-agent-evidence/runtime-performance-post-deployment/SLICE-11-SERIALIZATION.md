# P0-7.6 SLICE 11 — DOCUMENT → PROVISIONING SERIALIZATION

**`P0_7_6_SLICE_11_SERIALIZATION_COMPLETE_CERTIFIED`** — with the deployed *after* measurement owed and named.

| | |
|---|---|
| Starting SHA | `01a66ee3a` |
| Repair SHA | **`f8f9f894d`** |
| Certification SHA | this commit |
| Measured against | deployed `009beb369` |

Files changed — **3**: `workUnitProvisioningPrefetch.ts` (the repair), `workUnitEntryResourceClient.ts` (the seam), `workUnitProvisioningPrefetch.test.ts` (gates). No new file, no new endpoint, no new cache.

---

## 6 · THE COLD-ENTRY EXECUTION GRAPH — AND THE ANSWER TO THE QUESTION

**The document does not block provisioning by design. It already composes the answer.**

| boundary | owner | what it does |
|---|---|---|
| route document | `[workUnitSlug]/layout.tsx` + `page.tsx` | resolves route meta **and awaits `composeProvisioningAnswerForRoute`** |
| seed | `ProvisioningAnswerSeed` → `seedProvisioningForRoute` | writes the composed answer into K2's cache, render-phase |
| consume | `workUnitEntryResourceClient` → `consumeFreshProvisioning` | builds its key **with S6-1 client assertions**, misses, fetches live |
| fetch | `/api/admin/work-units/waitlist/provisioning-answer` | 6.6 s baseline / 4.7 s warm — **entirely redundant** |

### 9 · CLASSIFICATION: **ACCIDENTAL_SERIALIZATION**

Specifically a **key-identity divergence between the seed producer and the consumer**. Not a true data dependency, not authorization, not route lifecycle, not framework.

The kernel's own docblock claims: *"Key parity with K2's consume is therefore an in-kernel invariant (both go through `provisioningAnswerUrl`), guarded by the seed-contract unit test."* Both **do** go through it — **with different arity**, which is where parity was actually lost.

* consume (`workUnitEntryResourceClient.ts:28`) passes `retainedDepartmentConfigIds()` + `heldFocusPanelSummaryIdentities()` → `?dept_config=…`
* seed (`workUnitProvisioningPrefetch.ts:239`) **cannot** pass them — it runs on the server, which cannot know what this browser holds

So for **any returning operator holding published department configuration, the two keys could never match.** The better the client's cache, the more certainly the seed was unreachable.

### 8 · THE PROOF — the runtime's own instrumentation, deployed

```
register      t=5032  producer=page(subject=null,cohort=null)  terminal=operational
              /api/admin/work-units/waitlist/provisioning-answer
consume-miss  t=5036  producer=kernel-consume                  terminal=null
              /api/admin/work-units/waitlist/provisioning-answer?dept_config=17820bbd…,3933ac47…,5f6bba4c…,f73bb50f…
```

**A composed operational answer sat in the cache four milliseconds before the consume that missed it.** The surface then waited 4.7 s for an answer it already held.

---

## 7 · PROVISIONING INPUT MATRIX

| input | classification |
|---|---|
| org / tenant | KNOWN_FROM_SESSION |
| authenticated operator | KNOWN_FROM_SESSION |
| work unit slug | KNOWN_FROM_ROUTE |
| work view / lens | KNOWN_FROM_ROUTE (`?work_view_id`) |
| subject / cohort / aspect | KNOWN_FROM_ROUTE (`searchParams`) |
| site / department scope | resolved **server-side inside the document**, from session + route |
| permissions / RBAC | KNOWN_FROM_SESSION, enforced server-side |
| held department config (S6-1) | **client-only assertion — NOT_ACTUALLY_REQUIRED** to compose a correct answer |

**What must be learned from the 8.3 s document response before provisioning can legitimately start? Nothing.** The document *is* where provisioning is composed. Nothing waits on its payload.

## 10 · AUTHORIZATION PROOF

Unchanged, and untouched. The seeded answer is produced by `composeProvisioningAnswerForRoute` — **the same tenant-authorized server path the HTTP seam uses**, on the server, before anything is written. The repair is a client-side *cache lookup order*; it creates no pre-auth path, trusts no client claim, duplicates no session authority, and bypasses no RBAC, site scope, Work Unit access or participant authorization.

**Direction safety is the security property, and only one direction is sound:**

* a **base-key** seed MAY serve an asserting consume — the base answer is a **superset** (the server omitted nothing, because no assertion was made);
* an **assertion-keyed** entry must **NEVER** serve a consume that asserted nothing — that one may legitimately be short of configuration. No fallback is offered that way, and it is gated.

---

## 13 · THE REPAIR

`consumeFreshProvisioningForRoute(route, heldDeptIds, heldSummaryIds)` in the kernel — which the docblock already names as the key-scheme owner. Exact key first; the seed's base key second; network last.

* **Dedupe** — both lookups go through `consumeFreshProvisioning`, which deletes on read, so consume-once holds *across* the fallback. When the caller asserts nothing, `baseUrl === exactUrl` and the function returns after one lookup rather than re-reading a deleted entry.
* **Staleness** — the same `isFresh` window applies to both lookups; a lapsed seed serves nothing.
* **Commit safety** — no change. The answer flows into the existing K2 resolution and the existing atomic semantic commit, under the existing latest-destination generation guard. No second visual commit mechanism.
* **Identity** — the base key still carries target, lens, subject, cohort and aspect. Only the client assertions are dropped, and they do not decide *which* answer this is.

---

## 10 · PERFORMANCE

### Instrument self-check (§14) — validated before any number was trusted

| | Playwright | browser `PerformanceResourceTiming` |
|---|---|---|
| document duration | **5,108** | **5,108** (`responseEnd`) |
| provisioning start | **5,128** | **5,127** |
| provisioning duration | **4,716** | **4,716** |

The Slice 10B model (`duration = responseEnd`, `relativeStart = startTime − navEpoch`) reproduces the browser's own numbers exactly. The bug cannot recur silently.

### Before (measured)

| | 10B baseline `009beb369` | today's warmer run |
|---|---|---|
| document | 8,325 ms (TTFB 3,043) | 5,108 ms (TTFB 955) |
| provisioning start | 8,346 ms | 5,128 ms |
| **serial gap** | **18 ms** | **17 ms** |
| provisioning | 6,579 ms (TTFB 6,522) | 4,716 ms (TTFB 4,662) |
| overlap | **0 ms** | **0 ms** |
| published structure | 15,031 ms | — |
| provisioning requests | **1** | **1** |

### After — **predicted from a proven mechanism; deployed confirmation OWED**

The repair removes the provisioning request from a warm-client cold entry entirely: the consume hits the seed the server already registered.

* **`SERIAL_TIME_REMOVED_MS` = the whole provisioning duration — 6,579 ms** on the baseline shape (4,716 ms on today's warmer shape).
* **`TIME_TO_FIRST_CRITICAL_MEANING_DELTA` ≈ −6,579 ms**, 15,031 → **≈ 8,450 ms**.
* Request count **−1**; bytes reduced by one full provisioning answer.

**Stated as prediction, not result.** The mechanism is proven end-to-end (the seed registers operational; the consume misses by exactly the `dept_config` key; the repair makes that consume hit), but this slice must not deploy, so the *after* timeline is owed on the promotion slice. The harness is parameterised and its timing model is self-checked.

**Note on the model:** this is not `max(document, provisioning)` overlap. It is better — provisioning leaves the client critical path altogether, because it was never needed there.

---

## 12 · NO PRESENTATION REGRESSION

Focused regression **302 / 304 across 19 files**; geometry browser suite **47 / 47**; `typecheck`, `typecheck:tests`, `build` all **rc=0**.

Two reds, both pre-existing and both classified:

1. **`re-warms after the TTL lapses`** — pre-existing on the unmodified base, proven by running the file on a clean checkout (**1 failed / 16 passed** there, **1 failed / 26 passed** with my 10 added gates). Cause: `prefetchWorkUnitProvisioning` now routes through `fetchProvisioningEntryDeduped`, and the test never calls `clearInflightProvisioningEntriesForTests`, so the second warm coalesces instead of re-fetching. A test-hygiene defect, not a product one. **Not repaired — out of this slice's scope.**
2. **`EXTERNAL_FINANCIALS_TEST_DEBT`** — standing, other programme.

Presentation Truth 7.2–7.5, Structural Commit, coherence and geometry gates all green and untouched.

## 31 · PLANTED DEFECTS — each binds to its own gate

| plant | result |
|---|---|
| **A** restore the serialization (remove the base-key fallback) | **THE GATE: the asserting consume reaches the server seed** fails, + DEDUPE |
| **B** allow duplicate execution (re-register after consume) | **DEDUPE: exactly one logical consume** fails |
| **C** allow a stale result to commit (ignore freshness) | **STALENESS** fails |
| **D** widen identity (drop subject/lens from the base key) | **IDENTITY IS NOT WIDENED** fails |

Each count above excludes the one pre-existing TTL red.

---

## PROGRAMME

### Updated P0-7.6 ledger

| | state |
|---|---|
| **11** document → provisioning serialization | **REPAIRED + CERTIFIED locally** — deployed confirmation owed |
| 12 provisioning-answer internal TTFB (6.5 s) | OPEN — next |
| 13 decouple published composition from the full answer | OPEN |
| 14 defer non-visible work past first critical meaning | OPEN (~23 s, ~4.5 MB) |
| 15 cache org/department-scoped reads | OPEN (~10.5 s) |
| 16 drawer VM + drawer body | OPEN (12.9 s, secondary) |

### Remaining critical-path blockers

After this repair the cold-entry critical path is **the document alone** — 8.3 s baseline, of which 3.0 s is TTFB and ~5.3 s is streaming. **The document now contains the provisioning compose**, so item 12's work has moved *inside* it: reducing provisioning TTFB is now reducing document TTFB.

### Recommended Slice 12

**Instrument the document's internal server sections** (`ALLOY_ROUTE_TIMING=1` already exists for exactly this: middleware auth via response headers, layout phases via a JSON script tag — it was **off** on staging, `route_timing_script: false`). Until those sections are measured, any attack on the remaining 8.3 s is guesswork. §5 of this slice could not be answered for that reason, and it is the honest first task.

### `READY_FOR_ACTUAL_LATENCY_PROMOTION = YES`

Three files, no new request, no new owner, four planted defects each binding to their own gate, and the mechanism proven on the deployed build by the runtime's own trace.
