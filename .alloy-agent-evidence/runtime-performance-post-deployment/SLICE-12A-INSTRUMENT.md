# P0-7.6 SLICE 12A — DOCUMENT CRITICAL-PATH INSTRUMENTATION CONVERGENCE

**`P0_7_6_SLICE_12A_INSTRUMENTATION_COMPLETE_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `19eca7eab` |
| Instrumentation repair SHA | **`ae3795d59`** |
| Certification SHA | this commit |

**Measurement infrastructure only.** No document optimization, no caching, no deferral, no compose-semantics change. Not merged, promoted or deployed.

Files changed — **6**: `routeTimingDiagnostic.ts`, `[workUnitSlug]/layout.tsx`, `[workUnitSlug]/page.tsx`, `RouteTimingSeed.tsx`, `workUnitProvisioningAnswer.ts` (one `markSpan`), `routeTimingInstrumentConvergence.test.ts` (new).

---

## ADOPTED — OPERATOR LATENCY BUDGET

Recorded here as the programme's governing target. **The current ~6.25 s to first critical meaning is an intermediate baseline, not an outcome.**

| budget | target | deployed today (`29cf29abd`) | status |
|---|---|---|---|
| destination shell | ≤ 500 ms | **623 ms** | near |
| published structure | ≤ 1,000 ms | **6,250 ms** | **6.25× over** |
| **time to first critical meaning** | **≤ 2,000 ms (hard)** | **6,250 ms** | **3.1× over** |
| aspirational (warm) | < 1,000 ms | — | — |
| card coherence window | ≤ 250 ms | **0 ms** | **met** |
| secondary settlement | ≤ 3,000 ms | 12,341 ms (Track A) / 39,934 ms (final) | over |

P0-7.6 is **not** complete because the redundant 6.579 s request was removed. The remaining gap to the 2 s target is **≈ 4,250 ms**, and it lives almost entirely in the document.

---

## 6 · CURRENT DOCUMENT EXECUTION MAP — before editing

| phase | owner | file/function | instrumented before | field | stale? |
|---|---|---|---|---|---|
| middleware + auth | middleware | `middleware.ts` | **yes** | `x-alloy-mw-t0`, `x-alloy-mw-auth-ms` (headers) | no |
| work-unit layout entry | layout | `[workUnitSlug]/layout.tsx` | yes | `layout_entry_epoch_ms` | no |
| route-meta resolve | layout | `loadWorkUnitSlugRouteMetaServer` | yes | `route_meta_ms` | no |
| layout total | layout | — | yes | `layout_total_ms` | no |
| **page segment entry** | page | `[workUnitSlug]/page.tsx` | **NO** | — | — |
| **provisioning compose** | **page** | `await composeProvisioningAnswerForRoute` | **NO** | `compose_wall_ms` **emitted by the LAYOUT as `0`** | **STALE** |
| compose internals | compose | `composeWorkUnitProvisioningAnswer` | measured but **never surfaced** | `ProvisioningTimings` | not reaching the document |
| published composition ready | compose | `focusPanelSummaryDoc` construction | **NO** | — | — |
| seed creation | page | `ProvisioningAnswerSeed` | **NO** | `seeded` **emitted by the LAYOUT as `false`** | **STALE** |
| React render / stream | framework | — | no | — | unattributable from inside |

### 7 · STALE INSTRUMENTATION MAP

```ts
// layout.tsx, before
compose_wall_ms: 0,     // literal — the layout stopped composing
seeded: false,          // literal — the layout stopped seeding
```

Two fields describing a boundary that no longer performed the work. Not a missing measurement — a **wrong** one, and precise enough to be believed.

## 8 · FINAL TIMING AUTHORITY

**One payload, two contributors, one emitter.** The layout and page are separate server components with no prop channel (the page arrives as `children`), and each holds numbers the other cannot see. Both write into one request-scoped collector (`React cache()`, the mechanism `resolveWorkUnitRouteIdentity` already uses); the **page** emits, because it finishes last and owns the compose. The layout no longer renders the seed at all.

---

## 9 · FINAL PAYLOAD SCHEMA

```ts
type RouteTimingMarks = {
  layout_entry_epoch_ms: number;   // layout
  route_meta_ms: number;           // layout
  layout_total_ms: number;         // layout
  page_entry_epoch_ms: number;     // page
  compose_wall_ms: number;         // page — MEASURED around the real await
  seeded: boolean;                 // page — answer != null
  page_total_ms: number;           // page
  compose_total_ms: number | null; // both composers
  compose_sections: {              // full-breakdown composer only, else null
    authorization_ms; work_unit_ms; configuration_ms; presentation_ms;
    records_ms; projection_ms; composition_ms; total_ms;
    spans?: Record<string, number>;
  } | null;
  composition_ready_ms: number | null;  // from the compose's own t0
};
```

Plus the middleware's two headers, which must stay headers — middleware finishes before the first byte.

| | owner |
|---|---|
| **compose timing** | the **page segment**, around the awaited compose |
| **seeded** | the **page segment**, from the answer it actually hands the seed |
| **internal sections** | the compose's own `ProvisioningTimings`, surfaced verbatim |
| **composition_ready** | `markSpan("composition_ready", t0)` at `focusPanelSummaryDoc` |

### 12 · INTERNAL COMPOSE SECTIONS — surfaced, not invented

The dispatch's suggested labels map almost exactly onto sections that **already existed**:

| dispatch label | real field |
|---|---|
| authorization/context | `authorization_ms` |
| Work Unit / Work View resolution | `work_unit_ms` |
| configuration / published composition | `configuration_ms` |
| subject/lens + records | `records_ms` |
| operational/card context | `presentation_ms` |
| action/readiness derivation | `projection_ms` |
| serialization / final assembly | `composition_ms` |
| — | `total_ms`, plus named `spans` (e.g. `child_grain_*`, `focus_panel_operational_projection`) |

**No new timers were scattered through the compose.** A second set over the same code would be a second authority that can disagree — the defect this slice removes, re-created one layer down.

**Two composers, handled honestly:** `ContextualFocusAnswer` measures only `total_ms`. Its `compose_sections` is `null`, not seven zeros — the absence says "this composer has no breakdown", where zeros would say "the breakdown was free".

### 13 · COMPOSITION-READY TIMING

`markSpan("composition_ready", t0)` immediately before `focusPanelSummaryDoc` is constructed, measured from the compose's own start so it is directly comparable with every section beside it. **Diagnostic only** — nothing is decoupled, flushed or streamed, and a gate asserts no `flush`/`stream`/`Suspense`/added-await appears around it.

---

## 14 · DATA-SAFETY PROOF

Every schema field is a duration, an epoch, a boolean, or a named span map — asserted by a gate that extracts the field names and requires each to match `_ms$` / `_epoch_ms$` / `seeded` / `compose_sections`. A second gate scans for identifying fields by **word-boundary regex**.

*Recorded because it nearly produced a false red:* a naive substring scan for `"record"` matched **`records_ms`** — the compose's legitimate records-phase duration. The scan was tightened rather than the field renamed.

## 15–16 · OVERHEAD

| | |
|---|---|
| **flag disabled** | one boolean read per call site; every clock is `timing ? … : 0`; `recordRouteTiming` returns before touching the collector; `collectedRouteTiming` returns `null`; `RouteTimingSeed` renders `null`. **No accumulation, no script tag, no measurable work.** Gated. |
| **flag enabled** | four `Date.now()`/`performance.now()` reads, one object assign, one JSON serialization of ~15 numbers, one inline `<script>` (a few hundred bytes). The compose timing wraps the promise the route **already awaits** — a gate asserts no added `await`/`setTimeout` — so it cannot serialize or reorder the thing it measures. |

## 17–18 · FLAG BEHAVIOUR AND EXACT ENABLEMENT

| part | runtime | binding |
|---|---|---|
| middleware headers | **Edge** | **BUILD-TIME** — `process.env` is inlined |
| layout + page + compose marks | Node server | runtime, but shipped by the same build |

**One flag** (`ALLOY_ROUTE_TIMING=1`) controls both, read at call time (gated, so it cannot be captured at module load).

**Exact staging enablement:** set `ALLOY_ROUTE_TIMING=1` as an environment variable on the staging Vercel project **and redeploy**, so the Edge middleware is rebuilt with it inlined. Setting it on the running server alone yields **half an instrument** — page/layout marks without the middleware/auth header, silently. **Not changed in this slice**; it is a Director-owned configuration + deployment action.

---

## 19–22 · INSTRUMENT SELF-CERTIFICATION — six plants, each to its own gate

| plant | result |
|---|---|
| **A (real delay)** — `timedSpan` stops measuring elapsed time | **2 fail**: *a known ~100 ms delay moves the measured span*, *section isolation* |
| **A2 (structural)** — `compose_wall_ms` detached from the compose | *the page owns compose_wall_ms and seeded* fails |
| **B** — `composition_ready` detached from its owner | *composition_ready is measured from the compose's own start* fails |
| **C** — `seeded` made a constant | *the page owns compose_wall_ms and seeded* fails |
| **D** — stale layout compose authority restored | *the layout no longer claims compose authority* fails |
| **E** — collector not inert when the flag is off | *recordRouteTiming is inert when the flag is off* fails |

**25/25 green unplanted.**

### What this certification can and cannot prove — stated rather than glossed

§9 asks for a delay plant that moves `compose_wall_ms` by a known amount **end to end**. The compose runs inside an RSC route segment, which cannot be invoked from vitest without a server, a tenant and a session. So the certification is deliberately two-part:

1. **structural** gates prove the primitive is wrapped around the real awaited compose, and each detaches under its own plant;
2. **behavioural** gates prove the primitive reports real elapsed time — a known 100 ms delay moves it, an unrelated span does not absorb it, a rejection still rejects.

The end-to-end number is produced by the **deployed diagnostic run (Slice 12B)**, which is the only place it can honestly be measured. Claiming an end-to-end plant here would be the fabricated arithmetic §2 forbids.

## 23–25 · CROSS-CHECK AND HARNESS

The browser/document cross-check (`MEASURED_INTERNAL_MS` vs `UNATTRIBUTED_DOCUMENT_MS`) **requires the flag enabled on a deployed build** and is therefore Slice 12B's first output, not this slice's. The remainder — React render and streaming outside the measured sections — is expected to be non-zero and will be reported as unattributed rather than absorbed into a section.

The Slice 11B harness contract is preserved and unchanged: only `startRel >= 0` belongs to the measured navigation, `relativeStart = startTime − navigationEpoch`, `duration = responseEnd`, with the self-check retained.

---

## 26–30 · REGRESSION

| | |
|---|---|
| Slice 11 seed convergence | **green** |
| Structural Commit | **green** |
| Presentation Truth 7.2–7.5 | **green** |
| coherence gates | **green** |
| participant transport | **green** |
| geometry browser suite | **47/47** |
| **totals** | **349 passed / 359 across 22 files** |

**Request-count behaviour: unchanged.** The instrument adds no request in either state; with the flag off it renders nothing at all.

### The ten reds — every one pre-existing, none introduced

| class | count | evidence |
|---|---|---|
| **D1 provisioning/route resolution** (`d1ProvisioningAnswer`, `d1ProvisioningAnswerRoute`) | **8** | **Proven pre-existing**: the identical eight fail on a clean checkout of all five changed files. They surfaced now only because this slice added those two files to the regression set for the first time. **New class — recorded, not repaired** (§12 forbids product change). |
| TTL test hygiene | 1 | classified in Slice 11 |
| `EXTERNAL_FINANCIALS_TEST_DEBT` | 1 | other programme |

## 31–34 · GATES

`tests` 349/359 (all reds pre-existing) · `typecheck` **rc=0** · `typecheck:tests` **rc=0** · `build` **rc=0** · geometry **47/47**.

---

## 35–37 · NEXT

### `READY_FOR_ROUTE_TIMING_DIAGNOSTIC_DEPLOYMENT = YES`

**Exact configuration/deployment action required:** set `ALLOY_ROUTE_TIMING=1` on the staging Vercel project environment and **redeploy** (build-time, for the Edge middleware). Director-owned; not performed here.

### Proposed Slice 12B diagnostic procedure

1. Promote this instrument (it is inert with the flag off, so promotion is safe independent of enablement).
2. Enable `ALLOY_ROUTE_TIMING=1` on staging **and rebuild**.
3. Cold Work Unit entry with the Slice 11B harness: read the middleware headers and the `__alloy_route_timing` payload alongside the browser document timing.
4. Report `MEASURED_INTERNAL_MS` vs `UNATTRIBUTED_DOCUMENT_MS` — do not force the sections to sum to the document duration.
5. Rank the document's internal sections by measured contribution against the **≤ 2,000 ms** budget.
6. Answer P0-7.6 item 13 from `composition_ready_ms` vs `compose_wall_ms`: how much of the compose runs **after** the published composition is already available.

### Updated P0-7.6 ledger

| | state |
|---|---|
| 11 document → provisioning serialization | **CLOSED** deployed-verified, 6,579 ms removed |
| **12A instrument convergence** | **COMPLETE + CERTIFIED locally** — promotion and enablement owed |
| 12B document internal measurement | **OPEN — next**, needs 12A promoted + flag enabled |
| 13 published-composition decoupling | OPEN — `composition_ready_ms` will size it |
| 14 defer non-visible work | OPEN — `related/opportunity` 14.6 s, drawer body 4.2 s, communications ~5.6 s |
| 15 cache org/department-scoped reads | OPEN |
| 16 drawer VM | OPEN — 6,146 ms, largest post-structure cost |
| **NEW** D1 route-resolution test debt | OPEN — 8 pre-existing failures, unowned |

**Gap to the hard target: ≈ 4,250 ms**, and after Slice 11 it is almost entirely inside the document. Whether the current architecture can reach ≤ 2,000 ms is exactly what 12B's section breakdown will show — and if it cannot, the evidence will say which boundary prevents it rather than the target being relaxed.
