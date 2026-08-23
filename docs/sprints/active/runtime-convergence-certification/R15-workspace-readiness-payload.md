# R15 — Workspace Readiness Payload Efficiency

**Status: DECISION REQUIRED.** Material waste is proven — roughly **1.2 MB of uncompressed
provisioning JSON for one Workspace → Work Unit journey** — but the two levers that would remove most
of it fall outside the shapes R15 authorizes, and the larger of the two cannot be verified against
production from this lane. No product code was changed.

Grade-A preparation is working and must not be traded away: the prepared destination was a **HIT** and
the Work Unit revealed **390 ms** after the click.

Measured on a production build of staging `2f2420c18`, slot 2 / port 3012.

---

## 1. The readiness contract

`useWorkspaceSurfaceRuntime` collects each process's `entryHref` plus every Work View row href,
de-duplicates, and caps the set at `WORKSPACE_READINESS_DESTINATION_CAP = 6`. The primary destination
is warmed **immediately**; the rest on `requestIdleCallback(timeout: 2500)`, held back while a Work
Unit reveal is active. Each warm is one `GET /api/admin/work-units/{slug}/provisioning-answer`, cached
by exact URL for `PREFETCH_TTL_MS = 60_000` and consumed by K2 via `consumeFreshProvisioning`.

A second, separate prewarm exists at the Work Unit surface: `useCommittedWorkUnitSurfaceRuntime`
warms **neighbour queue-row subjects** with `?subject_id=…`, suppressed during the primary reveal.

## 2. Measured cost

**Workspace cold entry** — T3 2,046–3,822 ms; 6 answers prepared, **373.2 KB** raw:

| Prepared answer | Raw | Transfer | Encoding |
|---|---:|---:|---|
| waitlist | 228.9 KB | 229.2 KB | **identity** |
| all | 106.2 KB | 106.5 KB | **identity** |
| active-pipeline, new, tours, registration | 9.5 KB each | 9.8 KB each | **identity** |
| **total** | **373.1 KB** | **374.8 KB** | ratio **100.5%** |

**Full journey** (Workspace → enter Waitlist) — **1,204.2 KB across 14 responses**:

| Phase | Responses | Bytes |
|---|---:|---:|
| Prepared on Workspace entry | 6 | 373.2 KB |
| Sibling Work View answers after entry | 5 | 144.2 KB |
| **Neighbour-subject prewarms** (`?subject_id=…`) | **3** | **686.7 KB** |

`waitlist` alone is fetched **4 times at 228.9 KB = 915.8 KB**.

Prepared-answer outcome: **HIT** for the chosen destination; prepared Work Unit T3 **390 ms**.
**5 of 6** prepared answers were never entered — 144.2 KB prepared and unused. JS heap after readiness
settles: 26.3 MB.

### Answers to the Phase 2 questions

- **Is Waitlist still ~222 KB?** Yes — **228.9 KB**.
- **Raw or transferred?** **Both.** It is served uncompressed, so transfer ≈ raw.
- **How well does it compress?** Extremely well: **gzip 21.2 KB (9.3%)**, **brotli 16.2 KB (7.1%)**.
- **Does it delay Workspace T3?** No — the secondary warms are idle-scheduled and reveal-gated.
- **Does it delay prepared Work Unit T3?** No — 390 ms from a warm answer.
- **Percentage of prepared answers consumed?** **1 of 6** in this journey.
- **Dominant waste?** **Repeated canonical truth.** Each `?subject_id=` answer re-serializes the whole
  `rows` collection (126.5 KB of the 228.9 KB) that differs in no way between subjects of the same
  view. Three neighbour prewarms therefore re-send ~380 KB of identical rows.
- **Genuine debt or theoretical?** Genuine in raw bytes, server composition and parse. Whether it is
  genuine in *transfer* depends entirely on compression (§3).

## 3. The compression finding

Every readiness response carries `content-encoding: identity`. That is **not** a disabled-compression
artifact: on the same server, in the same page load, the encodings split cleanly by content type.

| Content type | Responses | Encoding |
|---|---:|---|
| `application/javascript` | 75 | **gzip** |
| `text/css` | 9 | **gzip** |
| `text/html` | 1 | **gzip** |
| `image/svg+xml` | 1 | **gzip** |
| **`application/json`** | **27** | **none** |

So compression is enabled and working, and Route-Handler JSON bypasses it. If production behaves the
same way, enabling JSON compression would cut this journey's 1.2 MB to roughly **110 KB** — an order
of magnitude more than any payload-shaping change available here, for no runtime risk.

**This lane cannot verify production.** Alloy deploys to Vercel, whose edge may already compress JSON,
in which case the transfer premise of R15 largely evaporates and only parse, memory and server
composition remain. That check is a Director-owned capability.

## 4. R11 duplicate-record attribution — a different owner

The readiness answer contains **no** `first_paint` and **no** `above_fold` key (verified against the
live response). R11's near-identical `first_paint.data.record_visible` / `above_fold.record` pair
belongs to `GET /api/admin/view-models/drawer/opportunity/[id]`, a different canonical owner. Per
R15's instruction it is **not** bundled here.

## 5. Field attribution for the largest answer (waitlist, 228.9 KB)

| Section | Raw | Nature | Consumer |
|---|---:|---|---|
| `rows` | 126.5 KB | queue rows for the view | the queue surface; **identical across subjects of the view** |
| `focusPanelStageWork` | 65.3 KB | subject-specific stage work | prepared Focus Panel; genuinely differs per subject (hashes differ) |
| `focusPanelSummaryDoc` | 26.6 KB | **published layout document**, selected by workView + stage | prepared Summary; **byte-identical across answers** (same hash in `waitlist` and `all`) |
| everything else | ~10 KB | presentation, actions, settlement, timings | various |

`focusPanelSummaryDoc` is deliberately carried so the prepared panel need not re-fetch it — the code
states the carried doc and any later client re-fetch resolve identically. It is config, not subject
truth, and repeats in every answer that has a subject.

## 6. Why this is a decision

Two levers dominate, and neither is straightforwardly authorized:

| | Lever | Saving | Why it is not simply implementable here |
|---|---|---|---|
| **A** | Compress API JSON | ~90% of all JSON transfer (1.2 MB → ~110 KB for this journey) | Not among R15's acceptable shapes, and production may already do it at the edge — unverifiable from this lane |
| **B** | Stop re-serializing `rows` in `?subject_id=` answers | ~380 KB per journey (3 × 126.5 KB) | The subject URL is the **cache key**; the same URL also serves direct deep-link entry, where `rows` **are** required. Varying the body by caller would need a new parameter — i.e. a parallel payload schema, which R15 forbids |
| **C** | Share `focusPanelSummaryDoc` across answers | ~27 KB per answer with a subject | It is carried precisely to keep the prepared panel from re-fetching; removing it risks the Grade-A reveal R15 protects |
| **D** | Reduce the readiness cap below 6 | up to 144 KB of unused preparation | Would make a common next Work View cold — explicitly forbidden. The 5 unused answers cost 144 KB but 4 of them are only 9.5 KB each |

**Recommended: A, contingent on a production check.** It is the only lever that is large, carries no
runtime risk, and does not touch the certified prepared experience. B is the largest payload-shaping
win but cannot be done without the parallel schema R15 rules out. C and D trade Grade-A preparedness
for modest bytes, which R15 explicitly forbids.

## 7. What was NOT done

No product code changed. No readiness disabled, no answer removed, no field removed, no cap changed,
no contract altered. R10, R11 Activity pagination and R1 photo resolution untouched. No certification
data mutated; all harnesses are read-only.

## 8. Evidence

`web/scripts/r15Readiness.mjs` — cold-entry readiness cost, transfer bytes via CDP
`Network.loadingFinished.encodedDataLength` (real on-the-wire size after content-encoding) alongside
raw body length, so raw-vs-transfer is measurable rather than assumed.
`web/scripts/r15Journey.mjs` — prepared-answer hit/miss and unused-preparation bytes across a real
Workspace → Work Unit journey.

Both follow PE3 conventions, refuse a non-local base or a stale `.next-prodcert`, dispose the browser
through `try/finally`, are read-only, and write durable evidence with subject identifiers redacted.
