---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 2 — stable subject lifecycle + warm reuse

**Lane** `lane_73a897409906` · **Run** `erun_b48741ac8c96e4b3` · base `172bd1657`.

| Commit | What |
|---|---|
| `dc184d80f` | **F-3** — prewarm and selection share one in-flight provisioning operation (+9 tests) |
| `5092be5ef` | **F-4** — the Focus Panel body is one surface, not one per subject |

**Conditions.** `ALLOY_DEV_STRICT_MODE=0` verified in the server process env (pid 83545). Host load
6.2 — **timing remains BLOCKED; no latency claim appears anywhere below.** Evidence is counts,
bytes, mount lifecycle and request provenance.

> **Measurement note worth keeping.** Mid-run every browser journey began failing as *"rows never
> render"* with the server answering 200 on every API call. The cause was the **slot QA session
> expiring** (minted 15:41Z, expired 16:41Z, observed 16:46Z). It does not present as an auth error;
> it presents as an empty surface. Re-minted before any measurement below was taken.

---

## 1. F-3 — root cause and repair

**Root cause: two in-flight registries that could not see each other.**
`prefetchWorkUnitProvisioning` warmed into the TTL `cache` and called `fetch` directly, while K2's
entry fetch coalesced through `inflightEntry`. A prewarm and a selection for the **same** answer
therefore raced, and rapid switching made that the common case.

**Repair:** the prewarm now issues through `fetchProvisioningEntryDeduped`. No new cache — the TTL
map keeps consume-once, and the in-flight entry is still dropped the instant it settles, so only
genuinely concurrent work is shared and nothing stale is replayed.

**Scope safety is established, not assumed.** The route composes its answer from the slug plus
`work_view_id`, `subject_id`, `cohort` and `aspect` — and `provisioningAnswerUrl` encodes exactly
those. Tenant and access come from the session gate. Tests pin all five dimensions keying
independently.

### F-3 before / after — rapid alternation specimen (A→B→A→C, ~200ms apart)

| | Before | After |
|---|---:|---:|
| provisioning requests | 10 | **7** |
| distinct URLs | 6 | 6 |
| duplicate calls | 4 | **1** |
| **concurrent overlaps of an identical URL** | **4** | **0** |

The one remaining duplicate is **sequential** — the second request starts at 858ms, exactly as the
first ends. That is consume-once working, not a race.

**9 regression tests**, and they bind: restoring the direct `fetch` fails both COALESCE tests while
the five SEPARATE guards stay green.

## 2. F-4 — root cause and repair

**Root cause:** `const bodyRenderKey = String(operationalSubjectId)` on the body wrapper, commented
*"Keyed swap wrapper — remounts + settles the body on a record switch."* The remount was deliberate,
for a settle animation.

That key was introduced for a real reason — it stopped the body remounting on the *pending → enriched*
transition, which had made three self-fetching cards re-run identical loads. It bought that
within-subject stability by paying a **full teardown across subjects**.

**Repair:** a constant key. It keeps the property the key existed for (one element, so pending →
enriched stays a prop change) and drops the one it should never have had.

**Subject coherence is preserved, and was checked rather than assumed:** every self-fetching card
already clears before it loads (`setVm(null); void load();` in Financials, same shape in Attendance,
Health, Scheduling, Assignment); `ChildrenCard` does not fetch at all. The hold/reveal contract
(`holdPriorPayload` / `heldPrior`) is untouched and remains the only sanctioned way prior content
stays on screen.

### Mount lifecycle, before / after (same probe both times)

| Journey | Before | After |
|---|---|---|
| A → B → C → A (4 selections) | **4 mounts / 3 unmounts** | **0 mounts / 0 unmounts** |
| 8 selections incl. a refusal | — | 2 mounts / 1 unmount |

The only remaining events surround the **refusing** subject: cards unmount when the Slice 1B refusal
takes the panel, and remount on return to a valid subject. That is the containment working.

### Integrity checks

| Check | Result |
|---|---|
| Subject coherence (`active === bodySubject`) | **true on every valid transition** |
| Slice 1B refusal containment | 7 rows kept, `refusal="configuration"`, cards 0 |
| Stage variation lead → refuse → waitlist → lead | queue mounted throughout, 7 rows |
| Rapid switching, latest-selection-wins | final active = last selected, coherent |

**Trade stated plainly:** the per-subject settle animation no longer replays, because it was
replaying by destroying the surface. Motion may explain continuity; it may not own it.

## 3. F-1 re-measured — **PARTIAL**

| Leg | Phase 1 | Slice 2 |
|---|---:|---:|
| A first | 8 calls / 148 KB | 2 calls / 126 KB |
| A revisit (warm) | **11 calls / 161 KB** | **8 calls / 158 KB** |
| A revisit, deeper journey (A→B→C→B→A) | not measured | **7 calls / 32 KB — no provisioning request at all** |

Warm revisit improved, and for the first time a revisit achieved a **full provisioning cache hit**
(zero provisioning bytes). But the immediate A→B→A revisit still re-fetched the 126 KB answer.

**Classification: PARTIAL.** Stable identity was necessary but not sufficient — exactly as the
instruction anticipated.

**The remaining ownership boundary, named before any cache is added:**
`consumeFreshProvisioning` **deletes the entry on consumption** (*"a click is a one-shot navigation;
a later revisit re-warms"*). So an immediate revisit inside the 60s TTL has nothing left to reuse —
it can only hit if a prefetch happened to re-warm that URL in between, which is precisely why the
deeper journey hit and the immediate one did not.

**No cache was added.** Changing consume-once is a staleness decision about authoritative data and
belongs in its own slice with its own invalidation argument.

**Not claimed:** leg totals swing with speculative prewarm timing (one `B` leg cost 25 calls here
versus 9 in Phase 1 purely because five siblings warmed in that window). Only the matched, structural
numbers above are offered.

## 4. F-2 — attributed, re-classified, not repaired

**Attribution: the endpoint has no owner.** `/api/admin/locations?hierarchy=1` has **8+ independent
call sites**, three of which define their own private URL constant
(`WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL`, and `LOCATION_HIERARCHY_API` twice).

**Re-classification.** Phase 1 called this a duplicate. It is not a race: the two Phase 1 calls were
**sequential, 2,544ms apart** — two independent owners firing at different times.

| | Phase 1 | Slice 2 |
|---|---:|---:|
| legs with >1 `locations` call | 1 of 11 | **0 of 7** |
| calls per subject selection | ~1 | ~1 (15 KB each) |

**Disposition: next slice, re-scoped.** The within-interaction duplicate no longer reproduces. What
remains is *repeated stable-config resolution with no owner* — genuine, but the repair is a single
owner for location hierarchy, and the instruction rightly warns against a location-specific shadow
cache. That is a design decision, not an opportunistic fix.

## 5. Refresh / invalidation fixture status

**Still unavailable in this lane.** The measuring server targets **hosted Supabase (Firefly)** — a
shared tenant. The only isolated tenant available on this host is the local `alloy-cert` stack's
synthetic org, which this dev server is not pointed at; repointing it is a host-wide env change
affecting other sessions. **Carried forward, not fabricated.**

## 6. Payload map after stable lifecycle (unchanged, for the next decision)

`provisioning-answer` ≈123 KB: `focusPanelStageWork` 72 KB · `focusPanelSummaryDoc` 27 KB · cohort
`rows` 13 KB · `presentation` 6 KB. `view-models/drawer/opportunity` ≈150 KB. `activity?limit=100`
up to 67.5 KB.

**Still held, deliberately.** F-1 is PARTIAL, so what is genuinely *necessary* per selection is not
yet settled. Optimising payload shape now would optimise a request pattern that is still moving.

## 7. Ranked map

### P1
| ID | Finding | State |
|---|---|---|
| ~~F-3~~ | concurrent duplicate provisioning | **CLOSED** `dc184d80f` — overlaps 4 → 0 |
| ~~F-4~~ | card tree remount per subject | **CLOSED** `5092be5ef` — 4/3 mounts → 0/0 |
| **F-1** | warm revisit still refetches the 126 KB answer | **PARTIAL** — boundary named: consume-once. Next slice |
| **F-2** | `locations?hierarchy=1` has no owner, ~1 call per selection | Next slice, re-scoped |

### P2
`F-5` provisioning payload shape · `F-7` drawer VM ≈150 KB × n · `F-8` `activity?limit=100` ≈67.5 KB.
All **held** until F-1 is closed.

### P3
`F-6` intermittent ×2 on `work-units` / `departments` / `metrics/resolve` at workspace cold ·
`F-9` inconsistent `location-program-categories` · `F-10` Household card marginal above fold.

### Pre-existing, not ours
`childGrainRowSource` ×2 (proven against pristine base in Slice 1B) and **`drawerVmPrewarmScheduler`
×2**, newly confirmed this slice: both reproduce with **both** Slice 2 changes reverted. One fails on
`ENOENT` for `app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`, a path that
does not exist.

## 8. Quiet-host experiments still pending

- **Q1 — R-018/D-3 prefetch.** Now sharper still: with F-3 the prewarm and the selection share one
  operation, so the question is no longer "does it duplicate" but "does the warm it leaves behind get
  consumed before consume-once discards it". Policy unchanged.
- **Q2 — F-4 perceived/timing effect.** Click → subject identity, click → usable body, hold duration,
  before/after stable identity.
- **Q3 — D-2 / R-005**, unchanged from the register.

## 9. Readiness

| Pass | Verdict |
|---|---|
| **Payload optimisation** | **Not yet** — F-1 is PARTIAL; the necessary per-selection work is still moving. |
| **Perceived-performance pass** | **Ready.** The blocker was F-4: a card that remounted every selection could not hold prior valid content while the next subject hydrated. It no longer remounts, subject coherence is certified, and the hold/reveal contract is intact. |

**Recommended next: the perceived-performance pass, or F-1's consume-once decision — not payload.**
