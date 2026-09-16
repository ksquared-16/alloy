---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 1B — error-terminal containment: implemented and certified

**Lane** `lane_73a897409906` · **Run** `erun_7564dc2aa4ccaf7b` · base `b875be32d` · slot 1 `:3011`.

| Commit | What |
|---|---|
| `caf8d74d8` | P0 containment repair + 12 regression tests |
| `d8efafe10` | Financials duplicate — root-caused and repaired |

> **Correction to the Slice 1 handoff.** That summary named the diagnosis commit `9a0b3f0`. That
> sha was hand-typed and wrong; the commit is **`650d1c817`**. No other identifier was affected.

---

## 1. The repair

`fail()` is scope-blind, and six refusal sites fire after the Work Unit, lens set and evaluated page
have all resolved. Each discarded that cohort. The error terminal now carries it.

**Type change** — additive and optional, so the terminal union stays at **four members** and no
consumer's exhaustiveness breaks:

```ts
| { terminal: "error"; code; message; orgId; workUnit; navigationFrame;
+   queueFrame?: {
+       rows; rowGrain; subjectGrain; presentation;
+       businessProcess; actionsProjection; requestedSubjectId;
+   } | null;
    timings }
```

**Six sites, all converted** (`return fail(...)` → `return await cohortRefusal(...)`):

| # | Code | Condition |
|---|---|---|
| 1 | `subject_unavailable` | requested subject not on the evaluated page (deep link / off-page) |
| 2 | `subject_unavailable` | configured strategy resolved no subject from a non-empty page |
| 3 | `no_truthful_primary_action` | child-grain composition cannot describe the position |
| 4 | `no_truthful_primary_action` | subject holds no resolvable Mission stage |
| 5 | `no_truthful_primary_action` | stage offers no reachable primary action *(measured specimen)* |
| 6 | `no_truthful_primary_action` | stage offers no work templates (type narrowing) |

**Files changed (6):** `workUnitProvisioningAnswer.ts` · `workUnitSurfaceModelFromSnapshot.ts` ·
`presentation/runtime/types.ts` · `FocusPanelSurface.tsx` · `WorkUnitSurface.tsx` ·
`provisioningSubjectRefusalContainment.test.ts`

**The refusal is not softened.** Terminal stays `error`, message stays verbatim, `provisioningErrorKind`
unchanged. It moves to `subjectRefusal`, rendered by the Focus Panel — the owner of the selected
subject. `queue.error` becomes `null`, which is the single fact QueueRegion selects its render state
on, so the queue renders rows through the *same* mapping the operational answer uses
(`queueRowModelsFrom`, shared by both exits — the refusal cannot drift into a second queue owner).

**Nothing new was introduced:** no terminal, no runtime, no cache, no fallback, no reveal mechanism.

## 2. Concurrency proof

The refusal path awaits enrichment that is **already in flight**; `focusPanelStageWorkPromise` — the
operational path's own independent work — starts *below* every refusal site, so nothing the
operational path does is serialised behind it. The operational path awaits exactly what it awaited
before, in the same order.

**Locked as an ordering fact, not a comment:** a test asserts
`indexOf("const focusPanelStageWorkPromise") > lastIndexOf("cohortRefusal(")`. Moving a refusal below
the stage-work read fails the build.

## 3. Regression results — 12 passed

| Group | Cases |
|---|---|
| **Containment** | all six post-cohort doors keep 7 rows, in order, `error: null`, pills intact |
| **Selection** | the refused subject stays selected (`source: "url"`) |
| **Honesty** | a *pre*-cohort refusal (`grain_ambiguous`) still banners — no cohort is invented |
| **Ownership** | refusal reaches the Focus Panel, message verbatim; `subject_unavailable` classifies as `subject`, not `configuration` |
| **Locks** | exactly six `cohortRefusal(` sites; stage-work ordering |

**The lock binds — proven by planting the original defect.** Reverting site 5 to `return fail(...)`
fails the lock with `expected 5 to be 6`, verified at the mutated line.

`vac run typecheck` → **rc=0**.

**Two pre-existing failures, not caused by this change.** `childGrainRowSource.test.ts` has two
source-shape assertions that fail identically with the **pristine base file restored** — verified by
running the suite against it. Their anchors (`indexOf("} else {")` precedes the child branch; an exact
`childRows\n            ? Promise.resolve([])` snippet) had already drifted before this work.
Reported, not fixed — out of this slice's scope.

## 4. Mounted API proof

| Request | Terminal | queueFrame | rows |
|---|---|---|---|
| no subject | `operational` | — | 7 |
| `subject_id=d097e1a8` (waitlist) | `operational` | — | 7 |
| `subject_id=468a5a95` (lead) | `operational` | — | 7 |
| **`subject_id=8baf8418` (decision)** | `error` `no_truthful_primary_action` | **yes** | **7** |
| **`subject_id=0000…0123` (off-page)** | `error` `subject_unavailable` | **yes** | **7** |

## 5. Mounted browser proof

| Row | Stage | Before | After |
|---|---|---|---|
| idx 4 | lead | 7 rows, committed | 7 rows, committed, 6 cards |
| idx 3 | waitlist | 7 rows, committed | 7 rows, committed, 6 cards |
| idx 2 | **decision** | **0 rows, 0 cards, not committed** | **7 rows, committed, refusal in panel** |
| idx 1 | **decision** | **0 rows, 0 cards, not committed** | **7 rows, committed, refusal in panel** |

**Switching** `lead → decision → waitlist → decision → lead`: rows stay **7** and pills stay **7**
throughout; cards return to 6 on every valid subject.

**Rapid selection** (decision, then waitlist 250ms later): latest wins — `d097e1a8` committed, 7 rows,
6 cards, no refusal. The pre-existing `requestSeq` guard is intact.

Screenshot `shot-3-after-repair.png`: full queue, the decision row selected and lit, header and pills
intact, and in the panel — *"This record can't be opened until its configuration is fixed … Other
records in this view are unaffected."*

## 6. Financials duplicate — root-caused and repaired

**Provenance, measured not inferred** (mount counter + per-request correlation header):

```
[fin-probe] MOUNT instance=1
[fin-probe] FETCH instance=1 seq=1 customerId=50b19065… scopedMemberId=null      query=customer_id=50b19065…
[fin-probe] FETCH instance=1 seq=2 customerId=50b19065… scopedMemberId=a227e460… query=customer_id=50b19065…
```

**One mounted instance. No remount. Two fetches.** That is case **C** — and it eliminates the two
readings the DOM suggested.

**Root cause:** `load` depended on `[customerId, scopedMemberId]`, while the request it builds depends
on whichever is present *first*. The participant resolves after the household, so `scopedMemberId`
went `null → a227e460…`, `load`'s identity changed, the mount effect re-ran — and produced a
**byte-identical** request, because `customerId` won the ternary both times.

**Repair through the existing owner:** the effect now keys on the composed query — what it actually
sends. Not a cache, not a dedupe layer. An input change that cannot change the request no longer
re-issues it; the member-scoped branch still refetches when it genuinely can.

**Instrumentation removed** after attribution (0 references remain).

## 7. Request counts, before → after

| Journey | Before | After |
|---|---|---|
| Work Unit entry — **duplicate calls** | **1** (`financials/card` ×2) | **0** |
| Row selection — **duplicate calls** | **1** (`provisioning-answer?subject_id` ×2) | **0** |
| Row selection — total calls | 9 | 5 |

**Not claimed:** entry total moved 30 → 34 (stable across two runs). **Unattributed.** Both "before"
figures were single samples, and the speculative sibling prewarm (frozen) fires opportunistically, so
this is not offered as either a gain or a regression. The duplicate elimination is a structural
property and is claimed; the totals are not.

**No latency claim is made anywhere.** Timing remains BLOCKED on the quiet-host window.

## 8. Provisioning duplicate — status

**Not repaired in this slice, and not mixed into it.** It no longer reproduces: row selection shows
0 duplicates across two runs. The likely reason is that the teardown itself was re-driving the
selection path, but that is **not proven**, so the item stays **OPEN pending confirmation** rather
than being claimed as fixed.

## 9. Ranked map

| Rank | Item | State |
|---|---|---|
| ~~P0~~ | Subject-scope refusal unmounts its cohort | **CLOSED** `caf8d74d8` — 6 doors, tested + mounted-certified |
| ~~P1~~ | Financials card ×2 per entry | **CLOSED** `d8efafe10` — root-caused, ×2 → ×1 |
| P2 | `provisioning-answer` ×2 on row selection | **Open, not reproducing** — confirm before closing |
| P3 | `decision` stage declares no execution mode | Tenant config; untouched **by design** — the runtime is now correct while it stays broken |
| P3 | `/api/admin/departments` ×2, `/api/admin/work-units` ×2 on cold workspace | Open, intermittent |
| — | R-018/D-3 sibling prewarm | **Frozen** pending quiet-host A/B |
| — | Search's four silent-return sites | **Frozen** hardening debt |
| — | `childGrainRowSource` stale source locks (2) | Pre-existing, reported |

## 10. Phase 1 gate: **OPEN**

The journey that corrupted measurement is repaired and certified: a selected subject can no longer
erase the Work View, so request counts, mount counts, duplicate attribution, warm-navigation and
Focus Panel lifecycle samples are now taken against a queue that stays mounted across the full
switching matrix.

**One standing condition:** Phase 1 counts are only trustworthy with `ALLOY_DEV_STRICT_MODE=0` —
StrictMode accounted for six of seven duplicates in Phase 0. The measuring server currently runs with
it set; restart without it before behavioural QA.
