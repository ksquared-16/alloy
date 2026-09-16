# PERFORMANCE SLICE 4 — S8-2 CAUSAL AUDIT + FIRST-PROMOTION DECISION

Run `erun_9f7567e98db62795` · candidate `87447616a45cb3ec71db700629cf35ab7848efbc`
**No product code changed in this slice.** No merge, no promotion, no deploy.

---

## 0. VERDICT (read this first)

| Question | Answer |
|---|---|
| S8-2 classification | **`S8-2_NEUTRAL`** — zero measured cost on the critical path, with one named unproven residual |
| Repair S8-2 before first promotion? | **NO.** Authorization condition 1 ("the causal defect is proven") is not met |
| `READY_FOR_FIRST_STAGING_PROMOTION` | **YES** — promote `87447616a` as-is |

The audit also **overturns my own Slice 2 inference**. Slice 2 observed the fan-out firing on deployed
staging and recorded "S8-2 should be reopened as OPEN". The observation was correct; the inference that
it competes with the selected subject was never measured, and the archived trace shows it does not.

---

## 1. THE FAN-OUT, MAPPED

Owner: `web/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts`.

**Window.** `adjacentSubjectIds` (line ~477) builds a **±2 row window** around the selected subject —
at most 4 neighbours — anchored on live attention (`useAttentionSubject()`) with a row-index fallback.
Entries are `subjectId|opportunityId`.

**Schedule.** The effect (line ~499) hands `run()` to `requestIdleCallback(timeout: 2500)`, falling back
to `setTimeout(run, 400)`. Cleanup cancels a **not-yet-fired** callback only.

**Emission.** `run()` calls `prewarmSubjectDestination` (line 60) once per neighbour. Each emission is
at most:

* 1 × `prefetchWorkUnitProvisioning` → `GET /api/admin/work-units/<t>/provisioning-answer?subject_id=…`
* 1 × `prewarmRecordWork(opportunityId)` → the drawer VM, **only** when the row carries an opportunity

| property | value | source |
|---|---|---|
| subject id | each of ≤4 rows at offsets −2,−1,+1,+2 | `adjacentSubjectIds` |
| selected vs neighbour | neighbour only — `r.entityId !== selectedSubjectId` | same |
| initiator | `useCommittedWorkUnitSurfaceRuntime` effect (idle) **or** the row hover handler (line ~423) | both funnel through `prewarmSubjectDestination` |
| trigger | selection change (window recompute) or pointer intent | — |
| cache state | deduped + TTL `PREFETCH_TTL_MS = 60_000`; warm/in-flight entry reused, never re-fetched | `workUnitProvisioningPrefetch.ts:26,68,94` |
| consumed? | yes — K2's `EntryResource` calls `consumeFreshProvisioning(url)` on the **identical** URL key | `workUnitEntryResourceClient.ts:39` |
| competes with selected-subject critical work? | **No — structurally excluded.** See §2 | — |

**Key parity is structural, not conventional.** Both the warm and the click build the URL through the
single builder `provisioningAnswerUrl(slug, lens, subject, cohort, aspect, retainedDepartmentConfigIds(),
heldFocusPanelSummaryIdentities())`. And both paths now register in one coalescer
(`fetchProvisioningEntryDeduped`), so a selection **joins** a prewarm already in flight rather than
racing it.

---

## 2. WHY LOOPBACK SUPPRESSED IT AND DEPLOYED STAGING EXECUTES IT

The gate is **reveal-scoped**, and the two environments sampled opposite sides of the window.

```ts
// prewarmSubjectDestination, line 81
if (isWorkUnitPrimaryRevealActive()) { recordRevealGateEvent("subject_warm_suppressed", id); return; }
```

Note the shape: this **drops**, it does not defer. (The drawer-VM scheduler next door *does* defer —
`endWorkUnitPrimaryReveal()` flushes its held queue one task at a time. The subject warm has no queue.)

The reveal window is opened by `useRecordWorkRuntime` (line 294) **synchronously, inside the effect that
starts the selected subject's VM fetch**, and closed on every completion path plus cleanup (lines 271,
312, 318, 340).

That yields a hard ordering guarantee:

> `run()` is scheduled asynchronously (idle callback or 400 ms timer) and therefore cannot execute during
> the synchronous effect flush in which `beginWorkUnitPrimaryReveal()` runs. Any neighbour warm whose
> firing overlaps a reveal is therefore **dropped**. A neighbour warm can only reach the network in a
> window where the selected subject's own reveal has **already completed**.

* **Slice 17 (loopback A/B)** exercised interactions inside the reveal window → every warm suppressed →
  recorded as "inert in production". Correct measurement, over-general conclusion.
* **Slice 2 (deployed)** clicked a row on a panel that had already settled (16 s settle) → no reveal
  active → 3 warms emitted within 255 ms. Correct measurement, wrong inference.

Both observations are true. Neither is a defect — they are the two halves of the designed policy.

---

## 3. QUANTIFIED CAUSALITY — CURRENT POLICY vs SUPPRESSED/DEFERRED

**Instrument.** The deployed QA session (restored 09:45:22, 60-minute TTL) and the loopback slot-1
session (`expiry 2026-09-15 21:51:21`, `valid: False`) are **both expired**, so no new live A/B was run
in this window. The comparison below is drawn from the **archived, request-correlated deployed trace**
of the cold Work Unit entry (Slice 2, deployed SHA `fad44d32a8bd…`, 40 requests / 1,007 KB) plus the
source-level ordering guarantee in §2. It is not a loopback timing, and no loopback figure is offered as
acceptance.

**The measurement that settles it:** across all 40 requests of the cold Work Unit path there is
**exactly one** `provisioning-answer` — the selected subject's own, at t+7,285 ms. **Zero neighbour
warms executed during the entire 14.6 s cold path.**

| | CURRENT POLICY | NEIGHBOUR PREWARM SUPPRESSED | NEIGHBOUR PREWARM DEFERRED |
|---|---|---|---|
| requests on the cold critical path | **0** | 0 | 0 |
| ms attributable on the cold critical path | **0** | 0 | 0 |
| requests on a row click during an active reveal | **0** (dropped at the gate) | 0 | 0, then ≤4 after settle |
| requests on a row click with the panel already settled | ≤4, observed 3 in 255 ms | 0 | ≤4, serialized |
| next-selection outcome | consume (0 network) or join in flight | full cold round-trip | consume, later |

Changing the policy **cannot move the cold path**, because the policy already contributes nothing to it.
The only behaviour a change could alter is speculative work on an idle, settled panel — where the
measured alternative to warming is a full cold `provisioning-answer` round trip on the next click, which
on this environment costs **7.3 s**.

---

## 4. CLASSIFICATION — `S8-2_NEUTRAL`

**Neutral, not beneficial**, because the hit rate of the ±2 window on deployed staging was not measured
in this window. **Neutral, not harmful**, because:

1. It is absent from the cold path entirely (measured, 40/40 requests accounted).
2. It is structurally excluded from every reveal window (§2), which is the only interval in which it
   could contend with commit-critical work.
3. Its cost is bounded at ≤4 provisioning requests, deduped against a 60 s TTL and coalesced with the
   real selection's own fetch.

**The one unproven residual, stated rather than buried.** Cleanup cancels a not-yet-fired idle callback
but **not in-flight fetches**. On a rapid A→B selection, up to 4 neighbour requests issued for A can
still be in flight when B's reveal begins. This is unmeasured. Two facts bound it: the exposure is ≤4
requests, and B is by construction usually *inside A's ±2 window* — so the dominant effect of that
in-flight work is that B's own answer is **already being fetched**, which is a hit, not a cost.

Against the repair-authorization conditions, **condition 1 — "the causal defect is proven" — is not
met.** Per the slice's own instruction, that ends it: **DO NOT REPAIR.**

---

## 5. THE COLD WORK UNIT PATH, DECOMPOSED

Request/response pairs from the archived deployed trace, t=0 at navigation commit.

| # | segment | span | cost | class |
|---|---|---|---:|---|
| 1 | boot before the first API request leaves | 0 → 1,044 | **1,044 ms** | CLIENT BOOT |
| 2 | workspace fan-out, 9 parallel requests | 1,044 → 3,905 | **2,861 ms** (long pole) | SERVER |
| 3 | **serial dependency chain** — 4 requests, each starting 1–8 ms after the previous response | 3,659 → 7,285 | **3,626 ms** | **CLIENT ORCHESTRATION** |
| 4 | **`provisioning-answer` server response** | 7,285 → 14,614 | **7,329 ms** | **SERVER** |
| 5 | settlement burst — 11 requests in ~110 ms | 14,692 → 17,834 | 3,142 ms | SERVER (parallel) |
| 6 | drawer VM inside that burst (the Business Process producer) | 14,695 → 20,367 | **5,672 ms** | SERVER |
| 7 | `opportunity-drawer-body` tail | 20,487 → 25,103 | **4,616 ms** | SERVER |

**Dominant waits, ranked:**

1. **`provisioning-answer` — 7,329 ms, 50% of the 14.6 s time-to-first-cards.** One server response.
2. **Drawer VM — 5,672 ms**, which is what holds Business Process absent until 20,656 ms.
3. **`opportunity-drawer-body` — 4,616 ms**, the tail to the 25 s settle.
4. **The serial chain — 3,626 ms — the only large *client-owned* wait.** `status-options` (795 ms) →
   `work-unit-queue-summaries` (1,964 ms) → `queue-view-totals` (2,106 ms), strictly one at a time, then
   an 866 ms non-network gap before `provisioning-answer` is even requested. The individual responses are
   ordinary; the **serialization** is the cost.
5. **Segment 2's long pole is not Work-Unit-critical work.**
   `ai/config-layout-assist/capabilities` (2,860 ms) and `ai/workflow-assist/capabilities` (1,534 ms)
   are on the wire ahead of everything the Work Unit needs.

**Speculative prefetch contributes 0 ms to all seven segments.**

The honest conclusion: **this path is server-response-bound.** ~17.6 s of the ~25 s settle is three
server responses. No client-side scheduling change — including anything that could be done to S8-2 —
moves it.

---

## 6. WORK VIEW SWITCHING, DECOMPOSED

Deployed staging, pre-repair (Slice 2, five cells):

| Cell | dwell | selection ack | queue meaningful | panel meaningful |
|---|---:|---:|---:|---:|
| A cold → All | 0 ms | 5,042 | 5,042 | 5,042 |
| A2 cold → Enrolled children | 0 ms | 5,014 | 5,014 | 5,014 |
| B immediate repeat → Waitlist | 0 ms | 6,326 | 6,326 | 6,326 |
| C natural hover 350 ms | 350 ms | — | 6,655 | 6,655 |
| D deliberate warm 1,200 ms | 1,200 ms | — | 3,182 | 3,182 |

**The three milestones are not separable, and that is the finding.** In every cell they land in the
*same sample*: nothing, then everything. There is no progressive segment to decompose because the
pre-repair pill had no acknowledgement of its own — it waited for the model to change identity.

Repair Slice 1 changed exactly that boundary and nothing else: the pill now renders `aria-selected`
from a click-time intent, with `aria-busy` / `data-work-view-intent="pending"` while the destination is
in flight. The expected post-repair decomposition is therefore **ack ≈ 0 ms** (same frame as the click),
with the remaining 3–6.7 s becoming an honest, visibly-pending wait rather than a dead pill. **That
change is in the candidate and is unverified on deployed staging** — it is the first item in §8.

---

## 7. REGRESSION SUITES — RE-RUN ON THE CANDIDATE

`vac run test` at `87447616a45c`:

```
Test Files  10 passed (10)
     Tests  102 passed (102)
```

Covering `workspaceLoaderOwnership` (P0-1), `businessProcessCommitMeaning` (P0-2),
`cardEmptyStateSemantics` (P0-3/P0-4), `loaderOwnershipContract`, `reservedGeometryConvergence`,
`workViewProvisioningPolicy`, `revealLifecycleAndReadinessInvariants`,
`workUnitPrimaryRevealPrecedesSiblingPrewarm`, `workUnitRevealLifecycleContract`,
`provisioningInflightCoalescing`.

**Two pre-existing reds found, reported not hidden.** They are NOT regressions from the repair slices —
both are stale source-anchor locks pointing at code deleted in `2cdd4a398` ("PRV2: delete legacy
presentation tree"), which `git merge-base --is-ancestor 2cdd4a398 bf807ca85` confirms predates all
repair work:

* `tests/adminV2/drawerVmPrewarmScheduler.test.ts` — `ENOENT` reading
  `app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`; the route now lives at
  `app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx`.
* `tests/adminV2/runtime/siblingWorkViewPrewarmDefersToReveal.test.ts` — anchors on
  `const ids = siblingViewIds.split`, an identifier that exists nowhere in `lib/` or `components/`.

These are **unmeasured gates**: they were green-by-absence through the V2 certification. Repairing them
is a lock-hygiene follow-up, not a promotion blocker — neither asserts anything about the candidate's
changed behaviour.

**A third gap, stated plainly:** the neighbour-subject reveal gate has **no behavioural test anywhere** —
only a source-presence grep in `workViewProvisioningPolicy.test.ts:67`. That absence is precisely what
allowed Slice 17 to conclude "inert" and Slice 2 to conclude "fires" without either being contradicted.
I did not add one here because it requires exporting `prewarmSubjectDestination` from the runtime module,
and this slice is authorized to change product code only to repair a proven defect.

---

## 8. `READY_FOR_FIRST_STAGING_PROMOTION` = **YES**

Promote `87447616a45cb3ec71db700629cf35ab7848efbc` unchanged. Rationale: the candidate repairs four
reproduced P0s; S8-2 is neutral on the critical path; the dominant waits are server-side and untouched
by anything in this candidate either way; and **every remaining question about this candidate can only be
answered on deployed staging.** Holding it back buys no evidence.

### Exact post-deployment measurements required

The candidate is not certified by this slice. These five are the acceptance set, all on
`https://staging.workwithalloy.com` with `/api/build-info` first confirming the new SHA:

1. **P0-5 acknowledgement latency (the one that must move).** Click each Work View pill; record the
   delta from `pointerdown` to `aria-selected="true"` on the clicked pill. **Required: < 150 ms**, with
   `data-work-view-intent="pending"` present until the destination lands. Repeat across all 5 Slice 2
   cells (cold, cold-2, immediate repeat, 350 ms hover, 1,200 ms dwell). Pre-repair baseline: 5,014–6,326 ms.
2. **P0-1 loader ownership.** Three cold `/workspace` loads, frame-sampled. **Required: zero frames
   containing "Preparing your workspace…"**, and the `AlloyOperationalBootShell` mark present from the
   first non-blank frame. Pre-repair baseline: 85–118 frames (≈5.1–7.1 s) of the rejected treatment.
3. **P0-2 Business Process at commit.** Cold Work Unit entry. **Required: the card is present and
   carries commit-frame evidence at first-cards time (~14.7 s), not absent until ~20.7 s.** Record both
   timestamps; the gap is the metric.
4. **P0-3/P0-4 empty-state semantics, monotonicity.** Sample Attendance and Health at first-cards and at
   settle. **Required: never LESS INFORMATIVE across the transition**, and the settled state carries the
   right `data-*-empty` token (`error` / `unavailable` / `no-record` / permission) rather than collapsing
   to a bare "No … record."
5. **S8-2 residual, now measurable on a deployed build.** Click row A, wait for the panel to be
   meaningful, then click row B within 500 ms. Record every `provisioning-answer` with its `subject_id`,
   start time, and whether it was still in flight when B's reveal began. **This closes the one residual
   in §4** — and it is the measurement, not a repair, that the next slice should own.

Loopback is acceptable for (5)'s causal isolation only. **None of these five is acceptance until taken
on deployed staging.**
