# P0-7.6 SLICE 11B — SEED CONVERGENCE DEPLOYED + NEW CRITICAL-PATH BASELINE

**`P0_7_6_SLICE_11_DEPLOYED_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `01a66ee3a` · repair `f8f9f894d` · certification `974cc931f` |
| Candidate | **`e568cf45f`** (staging reconciled; repair byte-identical to `f8f9f894d`) |
| PR | [**#1054**](https://github.com/ksquared-16/alloy/pull/1054) — **12/12** checks |
| Merge SHA | **`29cf29abd`** |
| Deployed SHA | **`29cf29abd`** — exact equality |

Deployment proof: `gitBranch staging`, `nodeEnv production`, `dpl_BAvP2wG2Cr3dBrcHmx5xQzTTE1Qw`, Supabase `ikaxilmwmrmbagoidedu`. Candidate and repair both contained by ancestry. QA session verified fresh (23 s).

Pre-promotion gates: focused **317/319**, geometry **47/47**, `typecheck` / `typecheck:tests` / `build` all **rc=0**. The two reds are the classified pre-existing ones (TTL test hygiene; `EXTERNAL_FINANCIALS_TEST_DEBT`), neither touched.

---

## 4 · TIMING INSTRUMENT SELF-CHECK — **and it caught a real harness fault**

The first run **failed** its self-check and, per §4, no performance number was reported from it:

```
playwright_prov_count: 1     browser_prov_count: 0
playwright_prov: [{ startRel: -6089, duration: 6625 }]
```

A **negative `startRel`**. Playwright's `requestfinished` listener outlives the returning-operator warm-up navigation, so a request that *started* during warm-up but *finished* after the measured navigation was being attributed to the cold entry — while the browser's own resource timeline had reset. The instrument disagreed because the two were describing different navigations.

**Harness repaired** (measured set filtered to `startRel >= 0`, excluded requests counted separately), then re-run:

| | Playwright | browser |
|---|---|---|
| document duration | **6,122** | **6,122** (`responseEnd`) |
| provisioning request count | **0** | **0** |

`ok: true`. Only then was anything reported. **Had the self-check not existed, this run would have reported "1 provisioning request remains" and called the repair a partial failure.**

---

## 5 · SEED-CONVERGENCE DEPLOYED GATE — **PASS**

`ALLOY_SEED_TRACE`, deployed `29cf29abd`, returning-operator client state:

```
register      t=6136  producer=page(subject=null,cohort=null)
              terminal=OPERATIONAL  composedSubject=9ab36f48-…
              /api/admin/work-units/waitlist/provisioning-answer

consume-miss  t=6142  kernel-consume
              /api/admin/work-units/waitlist/provisioning-answer?dept_config=17820bbd…,3933ac47…,5f6bba4c…,f73bb50f…

consume-hit   t=6142  kernel-consume
              /api/admin/work-units/waitlist/provisioning-answer
```

Exactly the designed lookup order, **in the same millisecond**: the exact assertion key misses (expected — the server cannot know what the browser holds), and the base seed key **hits**.

| | |
|---|---|
| seed register key | `/api/admin/work-units/waitlist/provisioning-answer` (base) |
| consumer exact key | same + `?dept_config=<4 ids>` |
| assertion values | the same four department-config ids that caused the old miss |
| base-key fallback | **HIT** |
| consume-once | one hit, no second serve |

**The returning-operator condition was genuinely reproduced.** The localStorage probe reported `client_state_keys_before_entry: 0` because the held configuration lives in an in-memory nav cache, not localStorage — but the consume key itself carries the four assertion ids, which is the authoritative evidence and the exact condition that produced the old miss.

## 6 · NETWORK GATE — **PASS**

**`HTTP_PROVISIONING_REQUEST_COUNT = 0`** on the seeded entry path.

The answer is still **composed server-side inside the document** — `composedSubject=9ab36f48…`, `terminal=operational`. No provisioning work was removed; one redundant client round-trip was.

---

## 7 · NEW CRITICAL-PATH TIMELINE — deployed `29cf29abd`

| milestone | ms |
|---|---|
| navigation | 0 |
| first non-blank | 1 |
| **destination shell** | **623** (named `waitlist`) |
| document start / TTFB / end | 4 / **504** / **6,126** (duration 6,122) |
| **seed register** | **6,136** |
| **seed consume (hit)** | **6,142** |
| **published structure** | **6,250** |
| **first critical meaning** | **6,250** |
| **last critical meaning** | **6,250** |
| Track-A resolving | 6,250 |
| Track-A meaningful | 12,341 |
| final settlement | 39,934 |

## 20–22 · DELTA — decomposed honestly

§10's discipline applies to the timeline too: not every improvement here is Slice 11's.

| | baseline `009beb369` | now `29cf29abd` | delta |
|---|---|---|---|
| document duration | 8,325 (TTFB 3,043) | 6,122 (TTFB 504) | −2,203 — **environmental, NOT Slice 11** |
| client provisioning | 6,579 (TTFB 6,522) | **none** | **−6,579 — Slice 11** |
| published structure | 15,031 | **6,250** | −8,781 *(observed, both causes)* |
| first critical meaning | 15,031 | **6,250** | −8,781 *(observed)* |

**The environment-independent measure — structure commit measured from the end of the document:**

| | |
|---|---|
| baseline | 15,031 − 8,328 = **6,703 ms** after the document |
| now | 6,250 − 6,126 = **124 ms** after the document |
| **SERIAL_TIME_REMOVED_MS** | **6,579 ms** |

That figure matches the baseline provisioning duration (6,579 ms) **exactly**, which is the arithmetic signature of the whole request leaving the critical path rather than merely overlapping it. Slice 11 predicted 6,579 ms; the deployed measurement is 6,579 ms.

## 23–24 · REQUEST / BYTE DELTA

| | baseline | now |
|---|---|---|
| total requests | 146 | **145** |
| `/api` requests | 39 | **38** |
| `/api/admin/work-units/waitlist/provisioning-answer` | **1** | **0** |

Exactly one request removed, and it is the right one. **Byte delta is not reportable**: API responses carry no `content-length` (compressed/chunked), so the harness measured `api_bytes = 0` on both sides. Saying the payload shrank by one provisioning answer would be true but unmeasured, and this programme has been burned by exactly that kind of claim.

---

## 8–9 · CORRECTNESS

| | result |
|---|---|
| **`CARD_COHERENCE_WINDOW`** | **0 ms** (BP / Financials / Attendance / Health all first-meaningful at **6,250**) — budget ≤ 250 ms |
| **`unstable_or_false_construction_ms`** | **0** — destination shell truthful (`waitlist`) from 623 ms, no card grid before the published composition |
| published composition | **all six cells at structure commit**, identical set at settlement — no late structural insertion |
| Track-A cards | `children` + `household` resolving inside existing geometry at 6,250, meaningful at 12,341 |
| **7.5** painted band | BP `top 292.5 / h 299.0`, Financials `top 292.5 / h 299.2` — equal |
| 7.2 / 7.3 / 7.4 | unchanged and green in the focused suite; nothing in this slice touches them |
| Attendance / Health | present and scoped at structure commit |

**Speed did not come from reintroducing a waterfall.** The coherence window is still exactly 0 ms.

---

## 11 · NEW CRITICAL-PATH CLASSIFICATION — proven, not assumed

| blocks | evidence |
|---|---|
| **destination shell** | 623 ms — route + desired attention only. **Nothing network-blocking.** |
| **published structure** | the **document alone**: ends 6,126, structure commits 6,250 — **124 ms later** |
| **first critical meaning** | the same instant, 6,250 |

**The hypothesis holds: the document is now the sole dominant blocker**, and it is proven by the 124 ms gap rather than asserted. Of its 6,122 ms, TTFB was 504 ms on this run — so the bulk is now *streaming/render*, not time-to-first-byte. That is a materially different shape from the baseline (TTFB 3,043 of 8,325) and worth re-measuring rather than generalising from one run.

Post-structure costs, now the largest remaining numbers and all *after* first critical meaning: drawer VM `view-models/drawer/opportunity` **6,146 ms** (starts 6,179), `related/opportunity` **14,597 ms** (starts 12,498), drawer body **4,219 ms**, four `communications/*` calls **~5,600 ms** combined.

---

## 12 · SLICE 12 INSTRUMENTATION READINESS

**What `ALLOY_ROUTE_TIMING` exposes**

| half | transport | fields |
|---|---|---|
| middleware (Edge) | response headers | `x-alloy-mw-t0` (entry epoch), `x-alloy-mw-auth-ms` (auth round-trip) |
| layout (Node, during stream) | `<script id="__alloy_route_timing" type="application/json">` | `layout_entry_epoch_ms`, `route_meta_ms`, `compose_wall_ms`, `layout_total_ms`, `seeded` |

Two transports because middleware finishes before the first byte while the layout runs during the stream. Both carry wall-clock epochs so the consumer can subtract across them.

**Overhead / risk:** a handful of `Date.now()` / `performance.now()` calls behind the flag, two header writes, one small JSON script tag. The module states it emits ids and durations only — **never subject or operator data** — and the marks confirm it. Negligible overhead, no PII.

**Staging-safe:** yes.

**Exact enablement:** `ALLOY_ROUTE_TIMING=1`. **It must be set for the BUILD, not merely the server process** — the source is explicit that middleware runs on the Edge runtime where `process.env` is inlined at build time. So a Vercel environment variable on the staging project **plus a redeploy**. That is a configuration + deployment change, Director-owned; this lane cannot perform it.

### ⚠ THE PREREQUISITE THAT WOULD HAVE WASTED SLICE 12

Enabling the flag today would report the single most important number as **zero**. `[workUnitSlug]/layout.tsx` hardcodes:

```ts
// The compose no longer happens here — it moved to the page segment, which is the only
// boundary that can see which subject was asked for.
compose_wall_ms: 0,
seeded: false,
```

The provisioning compose **moved to `page.tsx` and the instrument never followed it**. `compose_wall_ms` and `seeded` are now literals describing a boundary that no longer does the work. Since the document is the sole remaining blocker and the compose is the largest thing inside it, Slice 12 would enable the flag, read `compose_wall_ms: 0`, and learn nothing.

**Exact Slice 12 prerequisite — two parts, in order:**

1. **Extend the timing marks to the page segment**, where `composeProvisioningAnswerForRoute` is actually awaited, so `compose_wall_ms` and `seeded` become measured rather than literal. Small, existing-mechanism, no new transport.
2. **Then** set `ALLOY_ROUTE_TIMING=1` on the staging build and redeploy (Director-owned).

Doing (2) without (1) produces a confident, precise, wrong answer — the same shape as every false green this programme has hit.

---

## UPDATED P0-7.6 LEDGER

| | state |
|---|---|
| **11** document → provisioning serialization | **CLOSED — deployed verified. 6,579 ms removed.** |
| **12** document internals (now the sole blocker) | **OPEN — next**, blocked on the instrument prerequisite above |
| 13 decouple published composition from the full answer | OPEN — may be reframed: the compose is inside the document now |
| 14 defer non-visible work past first critical meaning | OPEN — `related/opportunity` 14.6 s, drawer body 4.2 s, communications ~5.6 s |
| 15 cache org/department-scoped reads | OPEN |
| 16 drawer VM | OPEN — 6,146 ms, now the largest post-structure cost |

## REMAINING BLOCKERS

1. **The document**, 6,122 ms, sole blocker of structure and critical meaning.
2. The Slice 12 instrument prerequisite (compose marks in the page segment).
3. `ALLOY_ROUTE_TIMING=1` build-time enablement — Director-owned.

## `READY_FOR_SLICE_12_DOCUMENT_INSTRUMENTATION = YES`

With the prerequisite stated: extend the marks to the page segment **before** enabling the flag.

---

## RUN-FILING NOTE

`erun_84474f01a82260f7` was closed externally while this work was in progress — a governed-action notice reported it `COMPLETE`, and `run-status … executing` refuses with `illegal_transition (COMPLETE → EXECUTING)`. The dispatch's mandatory completion filing is therefore unsatisfiable for this run, and the notice explicitly instructed not to report it again. This document is the durable record instead.
