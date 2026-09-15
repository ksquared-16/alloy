---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 8 — operational mutation refresh fan-out

**Lane** `lane_73a897409906` · **Run** `erun_c88a3eaaad31c3e9` · base `d7f47460d`.

**Conditions.** `ALLOY_DEV_STRICT_MODE=0` verified in the server process; timing BLOCKED, **no latency
claim**. **Audit only — no product code changed, no instrumentation added.**

---

## 1–2. Fixture and isolation

**`enrollment_certification`**, org `93667019…`, reserved namespace **`enrollment-cert.alloy.invalid`**.

Chosen because it is the smallest existing fixture that exercises the **canonical Business Process
runtime** while mounted in the Work Unit + Focus Panel: its `opportunity_backed` family is
"Certopp Family", already a row in the "All" Work View used by every prior slice's harness. No new
fixture infrastructure was invented.

**Isolation is the fixture's own reserved namespace plus a proven `reset`** (§19). The subject
mutated (`468a5a95`) is fixture-owned.

**Recorded honestly:** the first `verify` **failed** — `context_free: 2 participations exist for this
child; exactly one is expected`. That residue was **pre-existing**, not caused by this slice (only
reads had occurred). It flagged the *context_free* family only, so the mutation used
`opportunity_backed`, which verify did not flag. The closing reset/ensure/verify cleared it (§19).

## 3. Mutation selected

**"Move to Waitlist"** — a real registered operator command on the Current Work card, executed
through the UI, not a lower-level write.

It is a **membership-changing** mutation (Lead → Waitlist), which is the most demanding class for
this audit: it must move queue membership, Work View counts and stage simultaneously.

**The command is three steps**, which matters for anyone repeating this: open (participant
selection, child pre-checked) → **Continue** (advances to confirm; **0 requests**) → **"Move to
Waitlist"** (the actual execution boundary). Measuring at either of the first two steps records an
empty fan-out and would look like a mutation that did nothing.

## 4–5. Before state and authoritative result

| | Before | After |
|---|---|---|
| Subject | `468a5a95` Certopp Family | unchanged, still selected |
| Queue row | "Certopp Family **Lead**" | "Certopp Family **Waitlist**" |
| Pills | New **3** · Waitlist **16** · All 7 | New **2** · Waitlist **17** · All 7 |
| Rows / cards | 7 / 6 | **7 / 6** |

Counts and row state agree, and `All` correctly did **not** move — the case stayed in the Work Unit
and changed stage.

## 6–7. Event / refresh sequence

Execution is `POST /api/admin/actions/execute`. Client convergence then arrives in two observable
waves:

| t | what converged |
|---|---|
| ~2.5s | nothing visible yet |
| **~5.0s** | **queue row** flips to Waitlist (subject-level truth) |
| **~7.5s** | **pills/counts** converge (New 2, Waitlist 17) |
| 10–17.5s | stable, no further movement |

Subject truth lands before aggregate counts — the projection settles after the record.

## 8–9. Complete fan-out

**12 requests · 464 KB · 10 distinct endpoints.**

| n | endpoint |
|---:|---|
| **3×** | `work-units/all/provisioning-answer` |
| 1× | `actions/execute` |
| 1× | `queue-view-totals` |
| 1× | `metrics/resolve` |
| 1× | `view-models/drawer/opportunity/468a5a95/stage` |
| 1× | `layout-runtime/opportunity-drawer-body` |
| 1× | `entity-layouts/focus-panel-summary` |
| 1× | `queues/stage-membership-ack` |
| 1× | `opportunities/468a5a95/eligible-enrollment-children` |
| 1× | `view-models/drawer/opportunity/**eb5394c7**` |

## 10–14. Dependency classification

**REQUIRED** — reads truth this mutation changed:
`actions/execute` (the mutation) · `queue-view-totals` (counts moved) ·
`metrics/resolve` (header KPIs include stage-derived counts) ·
`.../468a5a95/stage` (the subject's stage) · `queues/stage-membership-ack` (membership) ·
`eligible-enrollment-children` (the command's own participant set) ·
`layout-runtime/opportunity-drawer-body` (**stage-scoped** — its scope genuinely changed) ·
`entity-layouts/focus-panel-summary` (**scope key includes `stageKey`** — Lead→Waitlist is a real
scope change, so this is the scope-keyed cache behaving correctly, not waste).

**REQUIRED BUT DUPLICATED** — **`provisioning-answer` ×3**. The answer must refresh; three full
answers for one mutation is the finding. At ~99 KB each this is **~198 KB of the 464 KB** spent
re-fetching the same subject answer.

**SPECULATIVE** — `view-models/drawer/opportunity/**eb5394c7**`: a **different, unrelated subject's**
VM, fetched during convergence. This is the R-018/D-3 sibling prewarm firing while a mutation is
settling — speculative work competing with the convergence the operator is waiting on.

**OVER-BROAD** — none proven. Every non-duplicated request had a demonstrable dependency.

**UNRELATED** — none.

**Notably absent, and this is the good news:** no Work Unit bootstrap reload, no full card refetch
storm, no Financials/Attendance/Communications/Household/Children refresh, no queue base reload, no
`departments`/`locations` re-resolution. The mutation did **not** trigger "refresh everything for
this opportunity".

## 15. Projection convergence

Correct. Membership moved, the row re-rendered in place, `New` decremented, `Waitlist` incremented,
`All` unchanged, and **count and rows never disagreed** at any sampled point — the pills moved in the
same wave, not before the row.

## 16–18. Focus Panel, mounts, continuity

Cards stayed **6 → 6** and rows **7 → 7** across every sample. The subject remained selected and the
header remained "Certopp Family" throughout. **No remount, no blank frame, no false empty, no stale
result after the mutation.** Only the cards whose inputs genuinely changed (Current Work, and the
stage-scoped layout/summary scopes) refreshed.

The Slices 1–4 properties held **during** a mutation, which is the first time they have been tested
under one.

## 19. Reset proof

```
reset  → ok, removed: households 2, children 2, opportunities 2, journeys 2, participations 3
ensure → ok
verify → ok, findings: []
```

**No certification residue remains**, and the pre-existing `context_free` finding is gone. Note
`reset`+`ensure` creates **fresh ids** rather than restoring the originals — the mutated
`468a5a95` opportunity no longer exists.

## 20. Second mutation

**Not exercised.** One mutation was sufficient per the slice's own rule, and the membership-changing
class is the more demanding of the two. A detail-only contrast remains available for a later slice.

## 21–22. Ranked repair candidates / map

| Rank | ID | Finding | Class |
|---|---|---|---|
| **P1** | **S8-1** | One mutation triggers **3× `provisioning-answer`** (~198 KB redundant of 464 KB) | required-but-duplicated |
| **P2** | **S8-2** | Sibling prewarm fetches an **unrelated subject's VM during mutation convergence** | speculative, competes with convergence |
| **P3** | **S8-3** | `eligible-enrollment-children` fetched **×2** when the command panel opens | duplicate |
| P1 | S7-1 | configuration invalidation not cross-session, no TTL | carried, blocks S6-1/S5-3 |
| P2 | S6-1 / S5-3 | payload convergences | **blocked by S7-1** |
| P2 | S5-4 / S4-1 / F-2 | carried unchanged | — |

**No repair was made.** S8-1 is the clear candidate, but the slice's rules are explicit that refresh
correctness outranks request minimisation, and collapsing three refreshes into one touches mutation
convergence semantics — which just proved correct. That deserves its own slice, not an opportunistic
edit at the end of an audit.

**S8-2 is notable beyond its size:** it is the first evidence that the frozen R-018 prefetch does
something actively unhelpful — spending a ~150 KB VM fetch on a subject the operator did not ask for,
at the exact moment they are waiting for a mutation to settle. That is a genuine input to the
still-pending quiet-host A/B.

## 23. Recommended Slice 9

**S8-1: collapse the triple provisioning refresh — as a correctness-preserving change, not a
byte-saving one.** Establish first *why* three fire (three independent invalidation triggers? one
listener registered thrice? a refresh chain where each wave re-triggers the next?), then converge
them through the coalescer Slice 2 already built, and re-prove §15 convergence and §16 continuity
unchanged.

While in there, **S8-3** is almost certainly the same shape and is nearly free.

**Then S7-1**, which still gates the two payload convergences.

**Do not** take S8-2 alone — fold it into the R-018 quiet-host A/B, where "does prefetch help?" can
finally be answered with this new evidence that it sometimes actively competes.
