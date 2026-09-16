---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 5 — payload criticality map

**Lane** `lane_73a897409906` · **Run** `erun_d2a610e25dc48af3` · base `5ee036db0`.

**Conditions.** Host load 3.3, **timing BLOCKED, no latency claim.** All evidence is bytes, SHA-256
hashes of field subtrees, and traced consumers. **No product code changed this slice** — §11 states
why plainly.

---

## 1. Provisioning criticality map (126 KB representative answer)

Classified by traced consumer and by hash comparison across subjects, **not** by field name.

| Field | KB | Class | Evidence |
|---|---:|---|---|
| `terminal`/`code`/`workUnit`/`businessProcess`/`activeWorkView`/`rowGrain`/`subjectGrain` | <1 | **A commit** | required to commit identity |
| `recordOfAttention`, `recordOfTruth`, `contextFrame` | <1 | **A commit** | subject commit |
| `currentBusinessState`, `primaryAction`, `subjectIdentityTruth`, `childIdentity` | <1 | **A commit** | Situation/Decision/Action |
| `rows` (cohort) | 13 | **B settlement** | queue render |
| `focusPanelStageWork.stage_work_runtime` | 1.9 | **B settlement** | Current Work |
| `focusPanelStageWork.work_intent_runtime` | 1.0 | **B settlement** | Current Work |
| `…published_stage_inputs.commandProjection` | 9.3 | **B settlement** | varies per subject |
| `…published_stage_inputs.operatingPlan` | 5.1 | **B settlement** | varies per subject |
| `presentation` | 6 | **E stable config** | hash `21dcb60a9985` identical across all subjects |
| `lensSet`, `actionsProjection`, `settlement` | ~2 | **E stable config** | identical hashes across all subjects |
| **`focusPanelSummaryDoc`** | **27** | **E stable + F redundant** | §4 |
| **`…published_stage_inputs.departmentMetadata`** | **29.7** | **E stable + F redundant** | §3 |
| **`…published_stage_inputs.process`** | **26.2** | **E stable config** | identical across subjects |
| `…processTracks` / `processStages` / `commandConfiguration` / `operatorGuidance` | ~1 | **E stable config** | identical across subjects |

**Headline: ~90 KB of a 126 KB answer (≈71%) is byte-identical configuration re-transmitted on every
row selection.** Genuinely subject-specific truth is ~36 KB.

Hash proof, three subjects in three different stages (lead / waitlist / lead) plus the no-subject
answer:

```
focusPanelSummaryDoc   985e793e3c5e  985e793e3c5e  985e793e3c5e  985e793e3c5e   ← identical
presentation           21dcb60a9985  21dcb60a9985  21dcb60a9985  21dcb60a9985   ← identical
lensSet                9fa2edc74f43  9fa2edc74f43  9fa2edc74f43  9fa2edc74f43   ← identical
actionsProjection      4de07af2aed9  4de07af2aed9  4de07af2aed9  4de07af2aed9   ← identical
focusPanelStageWork    20e8335585b1  49676eebf630  d69c6f630906  20e8335585b1   ← genuinely varies
```

## 2–3. `focusPanelStageWork` — consumer map and disposition

74.7 KB, and it decomposes cleanly:

| Sub-field | KB | Varies by subject? |
|---|---:|---|
| `published_stage_inputs.departmentMetadata` | 29.7 | **No — identical** |
| `published_stage_inputs.process` | 26.2 | **No — identical** |
| `published_stage_inputs.commandProjection` | 9.3 | yes |
| `published_stage_inputs.operatingPlan` | 5.1 | yes |
| `stage_work_runtime` | 1.9 | yes |
| `work_intent_runtime` | 1.0 | yes |
| tracks / stages / commandConfiguration / guidance | ~1 | **No — identical** |

**~57 KB of the 74.7 KB is stable process/department configuration.**

**Two independent redundancies, both proven by hash:**

1. **`departmentMetadata` (29.7 KB) is byte-identical to `/api/admin/departments` → `items[0].metadata`**
   — an endpoint the workspace **already fetches** on cold entry (Phase 1 even measured it ×2 there).
2. **The entire `focusPanelStageWork` (74.7 KB) is byte-identical to the drawer opportunity VM's
   `.workspace.published_stage_inputs` / `.stage_work_runtime` / `.work_intent_runtime`** (hashes
   `924ed77c2720`, `ea0a86e86284`, `09b36954f2f4`). Both payloads are fetched for the same subject on
   the same selection.

**Disposition: SPLIT CRITICAL / DEFERRED.** The commit/settlement-critical portion is
`stage_work_runtime` + `work_intent_runtime` + `operatingPlan` + `commandProjection` ≈ **17 KB**. The
~57 KB configuration remainder has an existing owner and does not need to ride the subject answer.

**Not "defer whole document"** — the answer's contract is explicit that Current Work must be
renderable from provisioning alone, and that is exactly the 17 KB.

## 4–5. `focusPanelSummaryDoc` — hypothesis confirmed

**Key space: org + surface + configuration version. Not subject, stage, or Work View.**
Hash `985e793e3c5e` identical across every subject measured.

**Existing owner found, with real invalidation:**
`provisioning.focusPanelSummaryDoc.doc` is **byte-identical (`abfe29b4f262`) to
`/api/admin/entity-layouts/focus-panel-summary` → `published.doc`**, and that endpoint carries
`id`, **`version: 153`** and `updatedAt`.

**Consumer trace shows it is already a seed, not an authority.** `ProvisionedWorkUnitSurface` passes
it as `summaryDocSeed` → `usePublishedFocusPanelSummaryDoc`, which documents:
*"While the scope fetch is in flight, the commit-critical seed is the answer"* and *"the fetch, once
settled, replaces the seed — so a publish-event invalidation always wins over a stale seed."*

**Disposition: commit-critical on a COLD panel, redundant on every selection thereafter.** The
module-cached owner has already settled by then, so 27 KB is re-sent to cover a window that no longer
exists.

**Convergence design (not implemented — see §11):** the client already knows the doc's `version`.
Sending it as a request hint and having the answer omit the doc when the version matches reuses the
**existing** versioned owner and its existing publish-event invalidation. **No new cache.** It is,
however, a change to the answer contract, which is a STOP condition in this slice's own rules.

## 6–7. Provisioning bytes / server work — unchanged

**126 KB before, 126 KB after. No change made.** Server composition likewise unmeasured for change,
because no field was deferred. Recorded honestly rather than claimed.

## 8–9. Drawer VM overlap map

Drawer VM = 144 KB. Largest regions: `workspace` 78.8 KB, `first_paint` 21.9, `above_fold` 20.1,
`actions` 18.6.

| Region | Overlap with provisioning | Class |
|---|---|---|
| `.workspace.published_stage_inputs` (71.8 KB) | **byte-identical** | **duplicate entity/config truth** |
| `.workspace.stage_work_runtime` (1.9 KB) | **byte-identical** | duplicate |
| `.workspace.work_intent_runtime` (1.0 KB) | **byte-identical** | duplicate |
| `first_paint` / `above_fold` / `actions` | no hash match | legitimate preview → authority |

**Disposition: hold until the stage-work split lands.** Once the ~57 KB of configuration leaves the
provisioning answer, the honest question changes — the remaining overlap is ~17 KB, and the right fix
may be for one payload to stop composing it rather than for both to shrink. Optimising the VM now
would be optimising a shape that is about to move.

## 10–11. Activity — **cannot safely reduce**

`GET /api/admin/activity` accepts only `limit`, clamped 1–500, default 100. **There is no cursor and
no offset.** Reducing the initial limit would therefore truncate history with **no operator path to
retrieve the remainder**, which this slice's rules explicitly forbid.

Separately: it is fetched by `opportunityDrawerTabPrefetch` — i.e. **interaction-only data (class D)
prefetched on selection** for a tab that may never open, at up to 67.5 KB.

**Disposition: do not truncate. The real repair is prefetch scope, not page size,** and adding a
load-more contract is new API surface. Ranked, not implemented.

## 12. Matched-journey bytes

| | KB |
|---|---:|
| provisioning per selection | 126 |
| drawer VM per selection | 144 |
| **total per selection** | **270** |
| of which **provably duplicated** (stage-work 74.7 + summary doc 27) | **~102 (38%)** |
| of which **stable config re-sent** (~90 in provisioning) | **~71% of the answer** |

## 13. Reveal / perceived harness

**Not re-run — nothing was changed to re-test.** The Slice 4 certification stands unmodified.

## 14–16. Carried items

- **S4-1** — latent card geometry. **No payload change was made, so no new loading state was
  exposed.** Remains ranked for contained cleanup; unchanged.
- **F-2** — `locations?hierarchy=1`. **A convergence opportunity did appear:** this slice proves the
  runtime already has a canonical configuration owner pattern (a versioned published-surface endpoint
  plus a module-cached hook). Location hierarchy is the same shape of problem. Noted, **not forced** —
  the instruction rightly warns against forcing unrelated ownership.
- **Refresh / invalidation** — still **unmeasured**, and now materially more important: §4's
  convergence rests on publish-event invalidation that has never been exercised on this server. No
  safe mutation fixture exists (shared hosted tenant). This is now the **gating unknown** for the
  configuration work, not a side note.

## 17. Ranking

| Rank | ID | Item | State |
|---|---|---|---|
| **P1** | **S5-1** | `focusPanelStageWork` ships twice per selection (74.7 KB, byte-identical in provisioning and drawer VM) | **new, proven** |
| **P1** | **S5-2** | ~57 KB stable process/department config rides every subject answer; `departmentMetadata` already fetched separately | **new, proven** |
| **P2** | **S5-3** | `focusPanelSummaryDoc` 27 KB re-seeds a settled owner every selection | **new, proven; design ready** |
| P2 | S5-4 | Activity prefetched on selection (≤67.5 KB) for a tab that may not open | new |
| P2 | S4-1 | latent card geometry in 5 cards | carried |
| P2 | F-2 | locations ownership | carried |
| P3 | S3-4 | Inbox cold-open skeletons | monitor |

## 18. Recommended Slice 6

**One repair, done properly: the stage-work split (S5-1 + S5-2 together).**

They are the same edit. Removing the ~57 KB configuration block from `published_stage_inputs` and
letting the existing department/process owners serve it addresses both the duplication with the
drawer VM and the stable-config retransmission, and leaves the 17 KB that genuinely must commit.

Order: (1) prove the client consumers of `departmentMetadata`/`process` read them from the answer and
not from the existing endpoints; (2) make the answer carry the subject-specific 17 KB;
(3) re-run the Slice 3/4 reveal harness in full — Current Work is the surface most at risk;
(4) re-measure the matched journey end to end, net bytes, not first-response bytes.

**Then** S5-3, which needs the invalidation question answered first.

## 19. Is further payload work materially worthwhile?

**Yes — but only these three, and only measured end to end.** ~102 KB of every 270 KB selection is
provably duplicated content, and ~71% of the provisioning answer is configuration that does not vary
by subject. That is not a compression argument; it is the same bytes arriving twice.

**What is NOT worthwhile:** shrinking fields that are genuinely subject-scoped, or trimming the
drawer VM before the stage-work split moves the boundary. The remaining subject-specific payload
(~36 KB provisioning, plus the VM's real preview→authority regions) looks proportionate to what it
delivers.
