---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 6 — stage-work payload convergence

**Lane** `lane_73a897409906` · **Run** `erun_9f99553cf0657303` · base `037dcd0a4` · commit **`b4e5be1b3`**.

**Conditions.** Host load 4.0 — **timing BLOCKED, no latency claim.** Evidence is bytes, SHA-256
subtree hashes, compiler proof, and the certified frame harness.

---

## 1–2. Phase A — existing owners, and where the split had to stop

### `departmentMetadata` (~29.7 KB) — **NOT REMOVED**

Slice 5 proved it byte-identical to `/api/admin/departments → items[0].metadata`. Phase A went
further and traced the **client** consumer: `buildCurrentWorkSurfaceVM` passes it into
`resolveCurrentWorkChecklistTruthFromPublishedRules` — it drives Current Work **checklist truth**.

The departments endpoint has a client dedupe/TTL helper (`dedupeAdminFetchWithTtl`), but **no context
or provider holds the metadata**, so the composition boundary cannot read it today. Wiring one would
put a fetch on Current Work's critical path and break success criterion 3 — *Current Work renders
from provisioning alone*.

**Disposition: STOP, as the instruction directs.** Reported rather than forced.

### `process` (~26.2 KB) — **REMOVED**

Its owner question dissolved on inspection: **it has no client consumer at all.**

- No reader anywhere in `lib`, `components`, `app` **or `tests`**.
- Its stated purpose — *"enables the P6.S2 command authority projection"* — is satisfied by
  `commandProjection`, which is **computed from it in this same resolver** and already shipped.
- `resolveCurrentWorkTemplateFromPublishedPlan` uses `explicitProjection ?? null`: **no fallback**
  derives anything from `process`.
- It is itself derived from `departmentMetadata`, which the payload still carries.

**Proof of no consumer: removing the field from the type compiled clean (`rc=0`).** That is stronger
than a grep.

## 3. Post-split stage-work contract

Retained (all traced to a Current Work consumer, and pinned by test):

| Field | Why retained |
|---|---|
| `operatingPlan` | what the stage's work means |
| `actionCatalog` | available actions |
| `fieldRules` | requirement truth |
| `processKey`, `stageKey` | identity |
| `departmentMetadata` | checklist truth (§1) |
| `processStages`, `processTracks` | stage/track presentation |
| `operatorGuidance` | operator copy |
| `commandProjection` | command authority, precomputed |
| `commandConfiguration` | provenance |
| `stage_work_runtime`, `work_intent_runtime` | Current Work runtime |

Removed: `process` — **computed, not retransmitted.**

## 4–5. Implementation and contract tests

Commit `b4e5be1b3`. **16 tests**, pinning the distinction that is the whole repair:

- not emitted in the payload; **still used** to build `commandProjection` (so the removal stays free);
- absent from the published type, making a future consumer a build error;
- each of the 11 retained fields still emitted (named, not counted);
- **no drawer dependency** — the resolver never references the drawer VM;
- **no queue authority** — it never reaches for queue-row preview data.

**The lock binds:** re-emitting `process` fails exactly one test — *"is not emitted in the stage-work
payload"* — while the other 15 stay green.

## 6–10. Measured bytes (matched subjects)

| | Before | After | Δ |
|---|---:|---:|---:|
| Provisioning (subject A) | 126 KB | **99 KB** | −27 |
| `focusPanelStageWork` | 74.7 KB | **48.5 KB** | −26.2 |
| `published_stage_inputs` | 71.8 KB | **45.5 KB** | −26.3 |
| `…process` | 26.2 KB | **0** | −26.2 |
| Drawer VM (subject A) | 144 KB | **117 KB** | −27 |
| `vm.workspace` | 78.8 KB | **52.6 KB** | −26.2 |
| **Matched selection (prov + VM)** | **270 KB** | **216 KB** | **−54 KB (−20%)** |

**New requests introduced: none.** Nothing moved to another endpoint — the field is simply no longer
serialized, so this is net journey reduction, not relocation.

Because both payloads compose through the **one** resolver, a single removal reached both.

## 11. Server composition

`process` is still resolved server-side (`lifecycleBuilderFromDepartmentMetadata` →
`activeLifecycleProcess`) because it finds the stage and builds `commandProjection` — computation the
retained 17 KB genuinely needs. What stopped is **serialization and retransmission** of a ~26 KB
record on two payloads per selection. Per the instruction, that distinction is stated rather than
blurred: **internal computation retained, transmission removed.** No DB calls were added or removed.

## 12. Current Work semantic equivalence

Captured before **and** after by reverting the change, re-capturing, and restoring:

- **All 15 compared API values byte-identical** across three subjects in different stages — the 11
  retained stage inputs plus `stage_work_runtime`, `work_intent_runtime`, `currentBusinessState`,
  `primaryAction`.
- **Rendered Current Work identical** for all three: same text, same action buttons
  (`Contact Family`, `Tour ▾`, `Move to Waitlist`, `Add Child`, `Record outcome` for the lead;
  `Tour ▾`, `Add family member`, `Send form`, `Offer spot` for the waitlist subject), same card count,
  same header.

## 13–15. Harness, F-4, F-1

| Check | Result |
|---|---|
| Monotonic title, A→B→C→A | two entries per switch, forward only |
| Rapid A→B→C→D | strictly forward; final row `468a5a95` matches title |
| Cards / rows | **6,6** and **7,7** throughout |
| Panel heights per transition | **1** |
| Financials geometry | `fin_min` 325, no collapse, no stale values |
| Refusal containment | cards 6→0→6, rows 7, truthful |
| **F-4 mounts** | **0 mounts / 0 unmounts** across A→B→C→A |
| **F-1 warm revisit** | 13 calls, 1 provisioning — unchanged shape; **256 KB → 230 KB** |

F-1 consume-once untouched.

## 16–19. Held items

- **S4-1** — no new loading state exposed; the removed field was never rendered. **Unchanged.**
- **S5-3 summary doc** — **HELD.** Invalidation gate unchanged: publish-event invalidation has never
  been exercised here, and no isolated fixture became available this slice.
- **S5-4 Activity** — **HELD.** Still `limit`-only with no cursor; the target remains prefetch scope.
- **Drawer VM** — not independently optimised; it shrank only as a consequence of the shared resolver.
- **F-2** — **HELD.** The versioned-endpoint + module-cached-owner pattern remains the right family,
  not forced.
- **Refresh / invalidation** — still unmeasured. **This slice did not depend on it**, which is exactly
  why `process` was safe and the summary doc is not.

## 20. Ranking

| Rank | ID | Item | State |
|---|---|---|---|
| ~~P1~~ | S5-1 (part) | `process` shipped twice per selection | **CLOSED** `b4e5be1b3` — −54 KB/selection |
| **P1** | **S6-1** | `departmentMetadata` ~29.7 KB still duplicated; needs a client-side owner that does not sit on Current Work's critical path | **new blocker, scoped** |
| P2 | S5-3 | summary doc 27 KB re-seed | held on invalidation gate |
| P2 | S5-4 | Activity prefetch scope | held |
| P2 | S4-1 / F-2 | carried | unchanged |
| P3 | S3-4 | Inbox cold-open skeletons | monitor |

## 21. Recommended Slice 7

**Do not continue payload work next.** The remaining large items are all gated on the same missing
capability: **refresh / invalidation measurement**.

- S6-1 needs a department-config owner whose lifecycle is understood.
- S5-3 needs publish-event invalidation exercised.
- Both are configuration-lifecycle questions, and we have never once observed an invalidation on this
  server.

**Slice 7 should establish a safe mutation/invalidation fixture** — an isolated tenant or a
publish-event path that can be exercised without touching shared hosted data. That single capability
unblocks S6-1, S5-3 and the long-open refresh/invalidation audit together.

**If that capability cannot be obtained**, the next best contained work is **S4-1** (five cards, the
reserved-geometry contract already exported) or the **Activity prefetch policy**, which is a
perceived-latency trade needing the quiet-host window.

**Is further payload work worthwhile?** Yes, but it is now **one item** (~30 KB of `departmentMetadata`)
rather than a broad programme — and it is blocked on ownership, not on measurement.
