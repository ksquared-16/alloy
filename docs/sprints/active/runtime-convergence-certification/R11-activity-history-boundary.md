# R11 — Activity Initial History Boundary and Demand-Driven Retrieval

**Status: DISPROVED.** The initial Activity history boundary is already bounded and already off the
critical path. It contributes **0 ms** to the record compose, and Activity retrieval cost does not
vary with the requested limit — so lowering the boundary cannot improve initial latency.

**No Activity behaviour changed.** No pagination, cursor, archive, smaller initial boundary, second
history path, limit change, query change, ordering change or rendering change is introduced. The only
product change in this item is a **telemetry correction** (§4). This is a disproof, not an
optimization.

Measured on a production build of the branch (`ALLOY_PROD_CERT_DIST=1` → `.next-prodcert`,
BUILD_ID `oy-aXPdKBhwyJvSPUI5Xq`), served by `next start`, slot 2. Subject identifiers are pseudonyms
(`subject_<hash8>`); no tenant identifier appears in this document or in durable evidence.

---

## 1. Path inventory

| Layer | Canonical owner | Limit + order | Payload contribution | Initial or demanded |
|---|---|---|---|---|
| Record initial history | `lib/adminV2/viewModel/drawer/opportunity/initialPanelResource.ts` → `loadOpportunityActivityEvents({ limit: 24 })` | 24, `occurred_at DESC` | `record._activity_timeline_events`, 8,950 B | **Initial** (one leg of a `Promise.all`) |
| Canonical retrieval | `lib/admin/loadOpportunityRelatedActivityEvents.ts` | direct `min(max(limit*2, limit+8), 200)` = 48; three related categories at `min(max(limit,12),60)` = 24 each | ~120 rows read, deduped by id, sorted, enriched, then `.slice(0, limit)` | shared by both boundaries |
| Activity endpoint | `app/api/admin/activity/route.ts` | default 100, cap 500, **no cursor, no `has_more`** | 62,566 B at limit 100 | **Demanded** |
| Activity tab fetch | `components/admin/vmDrawer/OpportunityDrawerVmTabPanes.tsx` | `limit: "100"`, renders all (no client slice) | — | **Demanded** (tab open) |
| Idle prewarm | `lib/admin/opportunityDrawerTabPrefetch.ts` via `lib/adminV2/runtime/focusPanel/focusPanelActivityPrewarm.ts` | `limit: "100"` | — | **Idle prewarm, focused subject only** |

Identity, ordering and access are untouched by this item: immutable `workflow_events.id`, total order
`occurred_at DESC`, org-scoped through the admin route gate. A stable cursor does **not** exist today.

## 2. Does initial Activity history gate Work Unit T3? — No.

**Server-side.** The Activity fetch is a *sibling* leg of the first-paint `Promise.all`, so the only
delay it could cause is the amount by which the whole resolve exceeds the dependency leg alone. With
the phase instrumentation corrected (§4) the legs separate:

| Trial | first_paint_dependencies | activity_timeline_hydrate | first_paint_resolve | Activity marginal | compose total |
|---|---|---|---|---|---|
| 1 | 494 ms | 258 ms | 494 ms | **0 ms** | 1,772 ms |
| 2 | 345 ms | 221 ms | 345 ms | **0 ms** | 1,423 ms |
| 3 | 404 ms | 215 ms | 404 ms | **0 ms** | 1,496 ms |
| re-verified | 457 ms | 247 ms | 457 ms | **0 ms** | 1,742 ms |

The Activity leg finishes well inside its sibling every time. Compose is dominated by
`visible_entity_ms` (~1,086 ms) and `children_orientation_ms` (~564 ms) — neither is Activity.

**Browser ordering.** `scripts/r11CriticalPath.mjs`: T3 (queue rows usable) at **1,553 ms**; the single
`/api/admin/activity` request of the whole journey starts at **+1,558 ms — after T3**. Exactly one
Activity request fires, for the focused subject only.

## 3. Is there already a server limit that merely remains too large? — No.

Activity retrieval cost does not depend on the limit. 12 interleaved trials per limit, alternating
limit order per trial so warm-up cannot manufacture a slope (`scripts/r11Flatness.mjs`):

| limit | events | bytes | p50 | min | max |
|---|---|---|---|---|---|
| 8 | 8 | 3,812 | 258 ms | 244 | 318 |
| 24 | 24 | 11,409 | 271 ms | 238 | 348 |
| 50 | 50 | 23,757 | 264 ms | 246 | 284 |
| 100 | 100 | 62,566 | 264 ms | 246 | 305 |
| 200 | 117 | 75,526 | 263 ms | 239 | 318 |
| 500 | 117 | 75,526 | 279 ms | 243 | 335 |

Slope 8 → 117 events: **9 ms (0.08 ms/event)** against a **446 ms** noise band — the slope is an order
of magnitude inside run-to-run variation of a single limit. (An earlier run measured −1 ms.) The
~260 ms is fixed overhead — route gate, four parallel `workflow_events` queries, child-name
enrichment — not row cost. **Lowering the initial boundary buys zero latency.**

This makes the conclusion volume-independent: the initial leg reads at most ~120 rows via Postgres
`.limit()` on the indexed `occurred_at` order regardless of how much history a record holds, so it
cannot grow into the critical path as history accumulates. Headroom before Activity could gate
anything is the sibling leg's 345–494 ms against a flat ~260 ms.

## 4. Telemetry correction — the only product change

`initialPanelResource.ts` reported **both** `first_paint_resolve_ms` and
`activity_timeline_hydrate_ms` as `Date.now() - tDeps0` — one number under two names. That made the
Activity leg unobservable and this question unanswerable from telemetry.

After the correction:

- `activity_timeline_hydrate_ms` records the **Activity leg's own completion**;
- `first_paint_resolve_ms` continues to represent the **full dependency resolution**;
- the two are no longer aliases of one expression.

Field names and units (whole milliseconds) are unchanged, and upstream phase keys still merge through.
Guarded by `tests/adminV2/viewModel/initialPanelResourceActivityTiming.test.ts`, which drives the real
`buildInitialPanelResource` against a fake clock with both legs hand-resolved (§7).

## 5. How much history is fetched but not initially used?

- Initial record: 24 fetched, 24 carried — not over-fetched.
- Activity tab / prewarm: 100 fetched, all rendered (no client slice); viewport shows roughly 8–12.
- Tenant population: of **63** candidate subjects, **1** has any history — **117 events**. Nothing
  approaches the 500 cap, so there is no history tail to page. Building pagination here would be
  building it solely because history exists, which R11 excludes.

## 6. Evidence for future R15 payload-efficiency review — not R11 work

Recorded here as evidence only; **no change is made to it under R11**:

- The composed record is serialized twice — `first_paint.data.record_visible` (51,829 B) and
  `above_fold.record` (51,588 B), near-identical (differing by two debug keys).
- That is approximately **29% of the measured 178 KB drawer-VM payload**.
- Activity's 8,950 B appearing twice (17,900 B, 10% of payload) is a **passenger of that broader
  composition shape**, not an Activity defect. Reducing Activity would not address it.

Also noted, unmeasured and unaddressed: 24 / 100 / 100 / cap-500 are four boundaries describing one
canonical activity set (coherence debt), and `/api/admin/activity` exposes no cursor or `has_more`.

## 7. Guards and harnesses

`tests/adminV2/viewModel/initialPanelResourceActivityTiming.test.ts` — five cases over the real
instrumentation owner: Activity finishing first (values differ), Activity finishing last (equal, and
the resolve cannot precede it), both together (equal without sharing an expression), Activity failing
(true elapsed time, no fabricated history, warning emitted), and field-name/unit compatibility.
Positive control: reintroducing the original aliased expression fails 2 of 5 with
`expected 400 to be 100`.

Harnesses under `web/scripts/`, all read-only against a running local server, none mutating
certification data: `r11Env.mjs` (shared PE3 environment, build-freshness assertion, subject
redaction, `try/finally` disposal) · `r11Discover.mjs` · `r11History.mjs` · `r11ActivityBoundary.mjs` ·
`r11Flatness.mjs` · `r11CriticalPath.mjs`.

Environment follows the PE3 convention (`PE3_SLOT` / `PE3_PORT` / `PE3_BASE` / `PE3_STORAGE`, plus
`R11_OUT_DIR`), refuses any non-local base, and refuses to measure a `.next-prodcert` older than the
sources it claims to contain — a killed `next start` can leave its child holding the port, so the
replacement fails and the *old* server answers a plausible-looking reading. Durable evidence is
written with subject identifiers replaced by stable pseudonyms; working state carrying real ids stays
in the gitignored `.r11-out/`.

## 8. Limits of this evidence

- **One subject in this tenant carries history** (117 events), so the volume premise could not be
  reproduced by data. The disproof rests on volume-independent structure — the bounded server-side
  `.limit()`, the measured flatness of cost in limit, and the 0 ms marginal against a longer sibling
  leg — not on sample size. A tenant with materially deeper history would change the *payload*
  discussion (§5) but not the *latency* conclusion (§2, §3).
- **No cold-database claim is made.** Measurements ran against the shared local Supabase stack in a
  warm steady state. Nothing here characterises a cold or remote database, and the flatness result is
  a within-environment comparison across limits, not an absolute latency budget.
- Timings are server-local; they exclude hosted network latency.
