# P0-7.6 SLICE 12C — COMPOSE PRELUDE DECOMPOSITION

**`P0_7_6_SLICE_12C_BLOCKED_DOMINANT_WAIT_NOT_YET_MEASURABLE`**

The decomposition instrument is built and certified. **The repair cannot be chosen in this run**, and the reason is structural, not a shortfall of effort — explained in §REPAIR below.

| | |
|---|---|
| Starting SHA | `9a60a1f28` |
| Repair (instrument) SHA | **`f2ce3dc20`** |
| Certification SHA | this commit |
| Files changed | 4 — `routeTimingDiagnostic.ts`, `composeProvisioningAnswerForRoute.ts`, `routeTimingInstrumentConvergence.test.ts`, `composePreludeSpans.test.ts` (new) |

Not merged, promoted or deployed. `ALLOY_ROUTE_TIMING` left enabled.

---

## 6 · THE PRELUDE EXECUTION MAP — and a correction to Slice 12B

**12B's label was wrong, and the error mattered.** It measured `compose_wall_ms` − inner `total_ms` = ~3,869 ms and called it a *prelude*. Source tracing shows the gap **straddles** the inner composer:

| # | operation | kind | position | grain |
|---|---|---|---|---|
| 1 | `await resolveWorkUnitRouteIdentity(rawSlug)` → `loadAdminRouteGate()` + `fetchWorkUnitsForSlugResolution` (+ dept fallback) | **await, DB** | **BEFORE** | gate = **PER_OPERATOR**; slug→unit = **ORG + dim + CONFIGURATION** |
| 2 | `createAdminClient()` | **synchronous** | before | PER_REQUEST, local construction — no I/O |
| 3 | `documentActorFromAdminGate(gate)` | **synchronous** | before | pure derivation from the gate — no I/O |
| 4 | `await composeWorkUnitProvisioningAnswer(...)` | **await** | — | the inner composer (owns `ProvisioningTimings`) |
| 5 | `await projectFocusPanelCardProducers(...)` | **await, DB** | **AFTER** | server-only producers (Attendance reads) |

**Operations 2 and 3 are synchronous** — confirmed at source, not assumed, and still timed so "it is not those" becomes evidence.

So the 3,869 ms is **prelude + postlude**. Had the repair been chosen from 12B's label it would have targeted route resolution, when a DB-reading step *after* the compose is an equally live candidate.

## 7 · SPAN SCHEMA

```ts
route_compose_spans: {
  route_identity_ms: number;        // BEFORE — gate + slug resolution
  admin_client_ms: number;          // sync
  document_actor_ms: number;        // sync
  inner_compose_ms: number;         // outer view of the inner composer
  card_producers_ms: number | null; // AFTER — null when the step did not run
} | null
```

`compose_wall_ms` and the inner `total_ms` remain the authoritative outer boundaries. Anything the spans do not explain stays **`PRELUDE_UNATTRIBUTED_MS`** — equality is not forced.

---

## 8–11 · WHY THE DOMINANT WAIT IS NOT REPORTED

**These spans do not exist on the deployed build.** Deployed is `236578d88`, which carries the 12A instrument but not this decomposition. §2 forbids choosing a repair before the winner is established by measurement; §"DO NOT MERGE/PROMOTE/DEPLOY" prevents obtaining that measurement in this run.

I will not name a dominant wait I have not measured. That is exactly how this programme produced its earlier confident wrong answers, and 12B's mislabelling — corrected above — is a live example of how far a plausible-sounding label can drift from the code.

### What the existing evidence *does* narrow, stated as hypothesis only

| observation | inference |
|---|---|
| The layout's `route_meta_ms` is **493 ms** median and calls the same `cache()`-memoized `resolveWorkUnitRouteIdentity` | If layout and page share the resolution, the page's `route_identity_ms` should be near zero; if they do not, ~493 ms is the scale of that work. Either way **493 ms ≪ 3,869 ms** |
| `projectFocusPanelCardProducers` performs its own DB reads and is entirely unmeasured | the only remaining await large enough to account for the residual |

**Hypothesis (to be confirmed or refuted by the next deployed run): the postlude — card producers — dominates, not route resolution.** Ranked as a hypothesis, not adopted. §4's cache-sharing question resolves with the same measurement: `route_identity_ms` near zero proves the layout/page `cache()` scope is shared; a repeat of ~493 ms proves it is not.

---

## 12–15 · AUTHORITY / GRAIN MAP

| operation | grain | reuse safety |
|---|---|---|
| `loadAdminRouteGate()` | **PER_OPERATOR — AUTHORIZATION** | **MUST NOT** be cached or reused across operators, whatever it measures |
| `fetchWorkUnitsForSlugResolution` | **ORG + dim + platformKey** — configuration | reusable across operators within an org; invalidated by work-unit / department configuration change or slug change |
| `createAdminClient()` | PER_REQUEST | local construction; nothing to cache |
| `documentActorFromAdminGate` | derived from the gate | pure; inherits the gate's per-operator grain |
| `projectFocusPanelCardProducers` | subject + org, with operator `access` | **per-operator authorization is an input** — not safely cacheable across operators |

**The authorization/resolution split is the safety boundary for any future repair:** *"can this operator access it"* must stay authoritative and per-operator; *"what canonical Work Unit does this slug identify"* is configuration-grain and reusable. A repair may cache the second. It may never cache the first.

**Layout/page cache-sharing verdict: NOT YET DETERMINED** — measurable by `route_identity_ms` on the next run, and deliberately not guessed.

---

## 16–19 · REPAIR

**None performed.** §2 is explicit: *"Only after the winner is established may implementation begin."* The winner is not established, because the spans that would establish it are not deployed.

Implementing against the hypothesis would mean repairing the term I *expect* to dominate. This programme has repaired the wrong term before on exactly that reasoning.

### Planted defects — five, each binding to its own gate

| plant | result |
|---|---|
| **A** remove one span | *all three awaits are measured* fails |
| **B** start the producers clock before the inner compose (**12B's own mislabelling**) | *the card-producers span is the POSTLUDE* fails |
| **C** report `0` instead of `null` when producers did not run | *card_producers_ms is NULL* fails |
| **D** remove the try/catch, making diagnostics load-bearing | *diagnostics can never break the product path* fails |
| **E** add an artificial await | *no await was added, removed or reordered* + *no sleep or artificial serialization* fail |

> **Plant B initially PASSED**, and that is worth recording. The first gate asserted the span's *presence* and the two awaits' *source order* — both of which stay true when the clock is started early, silently folding the entire inner composer into `card_producers_ms`. It was strengthened to require the producers clock to start **after** the inner compose is measured. A gate that checks a mechanism exists cannot certify it measures the right thing — the ninth instance of that shape in this programme, and the first caught by a plant rather than by production.

Slice 12A's own field-name gate also rejected `route_compose_spans` on first run. It was admitted **by name** rather than by loosening the pattern.

---

## 20–24 · PERFORMANCE

| | |
|---|---|
| before prelude+postlude | **3,869 ms** median (12B) |
| after | **unchanged — no repair made** |
| `PRELUDE_TIME_REMOVED_MS` | **0** |
| `THEORETICAL_TTFCRITICAL_DELTA` | **0** |
| `REMAINING_GAP_AFTER_12C` | **5,879 ms** (7,879 − 2,000) — unchanged |

No deployed improvement is claimed, because none was made.

## 25–29 · CORRECTNESS

Nothing in this slice alters product behaviour: every clock is behind the flag, no await was added, removed or reordered (asserted), and the recording cannot throw into the product path.

| gate | result |
|---|---|
| focused regression | **267 / 270 across 15 files** |
| geometry browser suite | **47 / 47** |
| `typecheck` / `typecheck:tests` / `build` | **rc=0 / rc=0 / rc=0** |

Three reds, all pre-existing and classified: provisioning TTL test hygiene; `EXTERNAL_FINANCIALS_TEST_DEBT`; (the third in the first run was my own new field tripping 12A's gate — fixed, not pre-existing). Presentation Truth, Structural Commit, coherence, participant/producer authorization and geometry all green.

---

## 34–37 · NEXT

### Updated P0-7.6 ledger

| | state |
|---|---|
| 11 serialization | CLOSED deployed-verified, 6,579 ms removed |
| 12A instrument | COMPLETE + DEPLOYED |
| 12B document diagnosis | COMPLETE |
| 13 published-composition decoupling | CLOSED — LOW_VALUE (~13 ms) |
| **12C decomposition instrument** | **COMPLETE + CERTIFIED — promotion + one measured run owed** |
| **12C-repair** | **OPEN — blocked on that measurement** |
| 14 defer non-visible work | OPEN — `child_grain_avatar` 1,408 ms |
| 15 cache org/department-scoped reads | OPEN — route resolution is the concrete instance |
| unattributed document time (505 ms) | OPEN |

### Ranked remaining critical-path work (12B medians, nested spans not summed)

1. outer-compose prelude+postlude **3,869 ms** — now decomposable
2. inner compose `presentation` **2,191** / `composition` **1,660** (nested)
3. `child_grain_avatar` **1,408** — degrades to initials, blocks nothing → strong defer candidate
4. destination shell **1,266**, tied to TTFB **1,052**
5. unattributed document **505 ms**

### Exact recommended Slice 12D

> **Promote this decomposition, run one deployed measurement, and repair the dominant wait it names.**

Small and well-defined: the instrument is inert with the flag off, `ALLOY_ROUTE_TIMING` is already enabled on staging, and five cold samples take minutes. It is the same promote-then-measure shape that carried 12A → 12B successfully.

**`READY_FOR_12C_PROMOTION = YES`** — the instrument is certified, inert when disabled, and adds no request.

**P0-7.6 remains OPEN.** Even a perfect prelude repair leaves ~4,010 ms against a 2,000 ms target, so 12C was never going to close it; the target is not relaxed.
