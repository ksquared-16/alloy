---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Phase 1 — measured waste map

**Lane** `lane_73a897409906` · **Run** `erun_0fac888a64de6cf8` · base `b875be32d` + `1a5c977b0`.

**Conditions.** Slot 1 `:3011`, hosted Supabase, `ALLOY_DEV_STRICT_MODE=0` **verified in the server
process env** (pid 83545). Host load 9.17 — **timing remains BLOCKED and no latency claim is made
anywhere in this document.** All evidence below is counts, bytes, provenance, ownership and
sequencing. Audit only: **no product code changed**; all temporary instrumentation was removed and
the tree is clean against `1a5c977b0`.

---

## 1. Journey map

170 API calls / **5,324 KB** across the 11 core legs of one session.

| Journey | API | dup | KB | Surface result |
|---|---:|---:|---:|---|
| J1 workspace cold | 27 | **2** | 959 | shell only |
| J2 Work Unit entry | 33 | 0 | 1137 | 7 rows, 6 cards, 7 pills |
| J3 switch → Waitlist | 19 | **1** | 658 | 16 rows (correct) |
| J3 switch → back to All | 10 | 0 | 65 | 7 rows — **warm, cheap** |
| J4 row · lead | 19 | 0 | 896 | committed |
| J4 row · **decision (refusing)** | **4** | 0 | 273 | 7 rows kept, refusal in panel |
| J4 row · waitlist | 15 | 0 | 525 | committed |
| J4 row · lead after refusal | 15 | 0 | 243 | committed |
| J5 A first | 8 | 0 | 148 | committed |
| J5 B | 9 | 0 | 258 | committed |
| J5 **A revisit (warm)** | **11** | 0 | 161 | committed |
| J6 Work Items open / **reopen** | 2 / **0** | 0 | 32 / **0** | shell preserved |
| J7 Processing open / **reopen** | 2 / **0** | 0 | 24 / **0** | shell preserved |
| J8 Inbox open / reopen | 10 / **7** | 0 | 59 / 50 | shell preserved |
| J9 Financials module | 4 | 0 | 86 | shell preserved |
| J11 search type → Enter | 1 → 5 | 0 | 30 → 82 | canonical record route |

**Two endpoints are 64% of all bytes:** `provisioning-answer` (27 calls, **2,331 KB**) and
`view-models/drawer/opportunity` (7 calls, **1,049 KB**).

## 2. Duplicate inventory

| Endpoint | Where | Count | Status |
|---|---|---|---|
| `GET /api/admin/locations?hierarchy=1` | entry, view switch, row select, **search nav** | ×2 | **F-2, open** — most consistent duplicate in the runtime |
| `GET /api/admin/work-units` | workspace cold | ×2 | F-6, intermittent |
| `GET /api/admin/departments` | workspace cold | ×2 | F-6, intermittent |
| `GET /api/admin/metrics/resolve` | workspace cold | ×2 | F-6, intermittent |
| `provisioning-answer` (same subject) | **rapid selection only** | ×3 | **F-3, reproduced** |
| `financials/card` | — | — | **CLOSED** `d8efafe10` |
| attendance/health/queue-row-layout/operational-tasks | — | — | **CLOSED** as StrictMode artifacts (Phase 0) |

## 3. Provisioning duplicate — REPRODUCED, with provenance

Slice 1B could not reproduce it. **Phase 1 did**, under a controlled trigger: **rapid successive
selection** (select A, 200ms, select B, 200ms, select A).

```
50863ms  rapid_alternate  8baf8418  dur=859ms      ← request 1
51344ms  rapid_alternate  8baf8418  dur=1728ms     ← request 2, issued 481ms later,
                                                      while request 1 was STILL IN FLIGHT
53073ms  rapid_alternate  8baf8418  dur=575ms      ← request 3
```

**Mechanism:** two byte-identical subject-scoped provisioning requests were **concurrently in flight
and not coalesced**. `workUnitProvisioningPrefetch.ts` has an `inflightEntry` dedupe map, and a
60s-TTL cache — both documented for the *work-unit tile / cold entry* path. **The subject-scoped
answer does not go through either.**

**Disposition: OPEN, root-caused, NOT closed as could-not-reproduce.** The Phase 0 specimen was
never refusal-dependent; it was selection-rate dependent, which is why keyboard and synthetic-click
probes both hit it and the calmer Slice 1B legs did not.

## 4. Warm reuse is effectively zero — and the cause is a remount

**F-1 · Warm revisit re-fetches everything.** `1a132b7f` provisioned at **18,441ms**, re-provisioned
at **30,511ms** — a **12.1s** gap, far inside `PREFETCH_TTL_MS = 60_000`. **126 KB re-downloaded**,
plus `locations`, `financials/card`, `operational-tasks`, `activity`. In the longer J5 run the warm
revisit cost **more** than the first visit (11 calls vs 8).

**F-4 · The Focus Panel card remounts on every subject switch.** Measured with a mount counter, not
inferred from the DOM:

```
entry            → MOUNT id=1
lead row         → UNMOUNT id=1, MOUNT id=2
waitlist row     → UNMOUNT id=2, MOUNT id=3
refusing row     → UNMOUNT id=3              (correct: cards yield to the refusal)
valid row again  → MOUNT id=4
```

4 selections → **4 mounts, 3 unmounts**. A remounted card holds no state, so **every card refetch on
every selection is a consequence of this**, and no card-level cache can help until card identity is
stable. This is the single highest-leverage structural finding in Phase 1.

The refusing-row behaviour (unmount, no remount) is **correct** — the contained refusal owns the panel.

## 5. Server composition (structural, not timing)

One `provisioning-answer` response, 123 KB, decomposed:

| Field | KB | Share |
|---|---:|---:|
| `focusPanelStageWork` | **72** | 59% |
| `focusPanelSummaryDoc` | **27** | 22% |
| `rows` (the cohort) | 13 | 11% |
| `presentation` | 6 | 5% |
| everything else | ~5 | 3% |

**81% of the payload is two subject-scoped documents**, re-sent in full on every row selection —
and then discarded by the remount. The cohort itself is only 11%.

## 6. Card hydration classification (Audit C)

At 1600×1000, all six mounted cards were **visible and above the fold**:

| Card | role / archetype | top px | Classification observed |
|---|---|---:|---|
| Current Work | active-work / action | 293 | above-fold |
| Financials | context / status | 293 | above-fold |
| Attendance — Today | active-work / timeline | 559 | above-fold |
| Children | reference / collection | 628 | above-fold |
| Health & Safety | context / status | 693 | above-fold |
| Household | reference / profile | 895 | above-fold (marginal) |

**No card was found hydrating while invisible.** The "hidden-surface hydration" hypothesis is
**closed as not supported** at this viewport. Household sits at 895px and would fall below the fold
on a shorter viewport — flagged as monitor, not finding.

## 7. Speculative prefetch (R-018 / D-3) — policy unchanged, now measured

Per row selection the runtime provisions the target **plus 1–3 sibling subjects**. Across the
session: 27 provisioning calls, **2,863 KB**, 7 distinct subjects, 2 never visited.

**The decisive measurement: a prefetched subject is re-fetched in full when actually selected.**
`1a132b7f` was provisioned as a sibling, then again on selection, then again on revisit — three
126 KB fetches. `468a5a95` likewise three times.

So on the **client** side the prefetch currently buys nothing measurable: it does not prevent the
real request. That does **not** settle retain/remove — it may still warm server-side caches, which is
exactly what the quiet-host A/B must decide. **Policy unchanged, as instructed.**

## 8. Closed this phase

**Closed as expected behavior**
- Focus Panel cards hydrating while hidden — not observed (§6).
- Module warm state — Work Items and Processing **reopen at 0 API calls**; shell preserved throughout.
- J11 search — exercised via the component's real keyboard path ("Kurzman" → 4 results → Enter):
  navigated to canonical `/workspace/record/household/0658832a…` in 5 calls, shell intact, no
  teardown, no silent no-op. **The prior click bug does not reproduce.** Four silent-return sites
  stay frozen debt.
- R-012 (Inbox datasets "count GROWS per open", August, external owner): **growth does not
  reproduce** — 10 on open, 7 on reopen.
- J4 refusing-row path stayed stable across every measurement leg — the P0 repair holds under audit.

**Closed as development artifacts** — the Phase 0 StrictMode set (attendance, health,
queue-row-layout, operational-tasks, stage-membership-ack). Not revisited, per instruction.

## 9. Not covered, stated plainly

- **Refresh / invalidation fan-out (Audit D): NOT EXERCISED.** Every representative mutation writes
  tenant data on a shared hosted database. I did not invent a fixture for it inside an audit run.
  Requires a disposable subject; carried to the next slice.
- **J10 Attendance module: NO LAUNCHER.** The sidebar exposes Workspace, Inbox, Processing,
  Operations, Financials, Work Items, Analytics. Matches the August register's R-013 — still module
  enablement, still an external owner. The Attendance **card** was audited (§6) and is clean.
- **Entry totals 30 → 34** from Slice 1B remain **unattributed** and are not interpreted, per rule.

## 10. Ranked map

### P0 — none
No correctness or ownership defect was found in this phase. The Slice 1B containment holds under
every journey.

### P1 — high-frequency operator-visible waste, safe repair
| ID | Finding | Evidence | Disposition |
|---|---|---|---|
| **F-4** | Focus Panel card **remounts on every subject switch** | mount counter: 4 selections → 4 mounts / 3 unmounts | **Next slice** — stabilise card identity; unlocks every card-level cache |
| **F-1** | Warm revisit reuses nothing; subject-scoped answer refetched 12.1s apart inside a 60s TTL | 126 KB re-downloaded | **Next slice** (same root as F-4/F-3) |
| **F-3** | `provisioning-answer` ×3 on rapid selection, two concurrently in flight | timeline §3 | **Repair now-ish** — extend the existing `inflightEntry` coalescing to the subject-scoped path. Small, contained, no policy change |
| **F-2** | `locations?hierarchy=1` (15 KB) fetched ×2 per interaction, on entry, view switch, row select **and search navigation** | §2 | **Next slice** — stable org config, one owner |

### P2 — structural work requiring contained engineering
| ID | Finding | Evidence |
|---|---|---|
| **F-5** | 81% of a 123 KB provisioning answer is `focusPanelStageWork` (72 KB) + `focusPanelSummaryDoc` (27 KB), re-sent per selection and discarded by the remount | §5 |
| **F-7** | `view-models/drawer/opportunity` ~150 KB × 7 = 1,049 KB — second-largest byte source | §1 |
| **F-8** | `activity?limit=100` returned 67.5 KB for one subject; a card-sized read asking for 100 rows | J5 capture |

### P3 — lower-frequency
| ID | Finding |
|---|---|
| **F-6** | Intermittent ×2 on `work-units`, `departments`, `metrics/resolve` at workspace cold |
| **F-9** | `location-program-categories` (12 KB) fetched on some revisits and not others — inconsistent trigger |
| **F-10** | Household card marginally above fold at 1000px height; below it on shorter viewports |

## 11. Recommended next repair slice

**Slice 2 — "stabilise card identity, then reuse".** In order, because each step makes the next
measurable:

1. **F-3** inflight coalescing for subject-scoped provisioning (smallest, provable immediately).
2. **F-4** stop remounting Focus Panel cards across subject switches.
3. **F-1** re-measure warm reuse — F-4 is expected to change it; do not pre-judge by how much.
4. **F-2** single owner for `locations?hierarchy=1`.

F-5 and F-7 (payload shape) should wait until after F-4, because a stable card may make part of
those payloads unnecessary rather than merely smaller.

## 12. Quiet-host experiments still required

1. **R-018 / D-3 A/B** — sibling prefetch on vs off, switch latency. Phase 1 establishes the client
   reuse is zero, so the experiment now has a precise question: *does the prefetch buy anything
   server-side, given its result is never reused client-side?*
2. **D-2 / R-005** — remaining August latency items.
3. **F-4 before/after** — remount repair measured as latency, not only as call counts.
4. Any cold/warm budget at all — still requires a production build, still blocked on the host.

## 13. Perceived-performance pass: NOT YET

Not ready, for one concrete reason: **F-4**. A card that remounts on every selection cannot hold
prior valid content while the next subject hydrates, which is the central requirement of the
perceived-performance doctrine. Running that pass now would measure the remount, not the perception.
**Land Slice 2 items 1–3, then the perceived pass is meaningful.**
