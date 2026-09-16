---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 3 — perceived performance and continuity

**Lane** `lane_73a897409906` · **Run** `erun_9a219a6f620fab23` · base `abd577712`.

**Conditions.** `ALLOY_DEV_STRICT_MODE=0`, host load 4.9 — **timing BLOCKED, no millisecond
performance claim is made.** Durations appear only descriptively, as the ORDER and SHAPE of state
changes the operator would see.

**Method.** DOM frame-sampling at ~80–100ms across each transition (≈58 frames per switch),
recording cards, rows, heights, subject identity, header text, scroll, skeletons and spinners.
**No source instrumentation was added this slice** — all observation was external. Tree is clean.

---

## 1–2. Subject switching, normal and rapid (P1, P2)

Across **every** P1–P4 leg:

| Signal | Result |
|---|---|
| Cards on screen | **6 → 6, never once 0** |
| Queue rows | **7 → 7, never once 0** |
| Blank card frames | **0** |
| False-empty frames | **0** |
| Distinct panel heights | **1** — no layout jump |
| Queue scroll | preserved (`[0]`) |
| Skeletons / spinners | **0 / 0** |

The Focus Panel now behaves as one stable operating surface whose subject changes. Latest-selection
-wins is visually confirmed: the selected row and the committed body subject both track the newest
intent, and no abandoned subject's body flashed in.

## 3–5. Immediate vs deep revisit — **not perceptibly different**

| Journey | API | KB | provisioning | Frame film |
|---|---:|---:|---:|---|
| **P3 A→B→A (immediate)** | 7 | **32** | **0 — cache HIT** | 6 cards throughout, subject flips at ~397ms |
| **P4 A→B→C→B→A (deep)** | 8 | 149 | **1 — refetched** | 6 cards throughout, subject flips at ~391ms |

**The hit/miss landed the opposite way round from Slice 2** — the *immediate* revisit hit and the
*deep* one refetched. That is itself the finding: the outcome is not determined by journey depth but
by whether a prewarm happened to re-warm that URL in the interval.

**And the two films are indistinguishable.** Same card count throughout, same subject-commit shape,
no blanking in either. A 126 KB provisioning refetch produced **no operator-visible penalty**,
because the stable surface bridges it.

## 6. Work View continuity — clean

`All → Waitlist → All → Waitlist`: rows move 7 ↔ 16 (correct, different cohorts), cards stay 6,
**zero** zero-row frames, **zero** false empties, one panel height, scroll preserved.

## 7. Refusal continuity — clean

`lead → refuse → waitlist → refuse → lead`: **rows stayed 7 in every frame of every leg.** Cards go
6 → 0 → 6 exactly as designed (the refusal owns the panel), the refusal is visibly attributed to the
selected subject, the operator can pick another row at any moment, and no stale refusal leaked into
the next valid subject.

## 8. Card-by-card matrix, across one subject switch

| Card | Disappears | Height | Collapses | Goes empty | Loading state | Holds prior content |
|---|---|---|---|---|---|---|
| Current Work | no | 220–256 | no | no | no | **yes** |
| **Financials** | no | **69–409** | no | **YES** | **YES** | yes, then clears |
| Children | no | 257–534 | no | no | no | **yes** |
| Attendance | no | 69 (flat) | no | no | no | yes |
| Household | no | 267–293 | no | no | no | **yes** |
| Health & Safety | no | 69 (flat) | no | no | no | yes |

**No card disappeared; none collapsed to zero.** Children's 257→534 growth is legitimate content
difference (the new family has 17 children), not a clear-and-jump.

**Financials is the sole outlier** and is covered as **S3-2** below.

## 9. Command / action feedback — clean

| Surface | Acknowledgement | Layout | Queue behind it |
|---|---:|---|---|
| Work Items | 116ms | 1 height | 7 rows kept |
| Processing | ~0ms | 1 height | 7 rows kept |
| Inbox | ~0ms | 1 height | 7 rows kept |
| Financials module | ~0ms | 1 height | 7 rows kept |

No dead-button window, no command-surface layout jump, no teardown of the surface behind.

## 10–11. Work Items / Processing — continuous

Both **reopen with 0 API calls and ~1ms acknowledgement**, zero busy indicators. Retained state is
useful rather than stale: the shell returns as it was left.

## 12. Communications Preview → Full — behaves as enrichment

Cold open: 10 calls / 59 KB with **18 concurrent busy/skeleton elements**. Reopen: 7 calls / 50 KB
and **0 busy elements**. The warm path replaces loading with content rather than re-running the
loading experience, which is the intended preview-then-hydrate shape. The 18 skeletons on a cold
open are the one rough edge (**S3-4**, P3).

## 13. Financials after Slice 2

The duplicate request stays fixed. What remains is presentational, and it is now the most visible
card defect — see **S3-2**.

## 14. False-empty / loading defects

**Zero** across every journey except Financials. No `[]`-as-empty during load, no "No data" before
completion, no queue flashing zero, no configuration banner during ordinary hydration.

## 15. Motion — no replacement needed

**Recommendation: add nothing.** The per-subject settle died with F-4, and the swap does not read as
abrupt: content is held and then replaced in place, with one panel height and no blank frame. There
is nothing discontinuous for motion to explain. Re-introducing motion here would be decoration, and
the only previous way to obtain it was destroying the surface.

---

# FINDINGS

## S3-1 · Header identity oscillates A → B → A → B during a switch — **P1**

**Journey:** P1 subject switching. **Evidence**, one A→B switch, reproduced:

```
   2ms  row=A  header="Specq0913 Family"   (A)   ✅
  86ms  row=B  header="Kurzman Family"     (B)   ← seed header acknowledges the click
 775ms  row=B  header="Specq0913 Family"   (A)   ← REVERTS to the previous subject
2216ms  row=B  header="Kurzman Family"     (B)   ✅ settles
```

The operator clicks Kurzman, reads "Kurzman", then reads "Specq0913" again, then "Kurzman".

**Ownership.** Two components own the title in different phases, each individually correct:
`FocusPanelCompactHeader` (seed) names the **clicked** subject — *"identity commits from the click,
not from provisioning"*. Then `OpportunityFocusPanelHeader` takes over and, while
`bodyHoldsPriorSettlement` is true, deliberately names the **held** subject so the header matches the
body on screen. Each rule is documented; their composition is not.

**Frequency:** 1 of 3 measured switches — it appears only when the incoming payload is slow enough
that the resolved header renders *during* the hold. That makes it **more** likely on slower
connections and heavier subjects, i.e. exactly when perceived performance matters.

**Classification:** perceived performance, correctness-adjacent. **Confidence:** high.
**Disposition: NOT repaired here — next slice, as a decision.** The two branches encode a genuine
conflict (identity-follows-the-click vs header-matches-the-body) and there is no repair that honours
both without changing what the body holds. Flipping it unilaterally would reverse an explicitly
documented product decision.

Two options, for an explicit call:
- **(a) monotonic forward** — keep the seed header until the selected subject's payload resolves.
  Sequence B → B → B. Extends the existing header-over-held-body window rather than creating a new
  class of mismatch. *Recommended*, since "identity follows the operator" is the stated principle.
- **(b) monotonic held** — name the held subject from the start. Sequence A → A → B. Header always
  matches body, but the click is no longer acknowledged in the header.

## S3-2 · Financials clears to an empty state and collapses ~340px — **P1**

**Evidence:** across a subject switch the card drops to **69px** with content length 30 while every
other card holds its prior content, then expands to **409px** when data lands, displacing everything
below it. It is the only card that goes empty and the only one that shows a loading state.

**Ownership:** the card's own `setVm(null); void load();` — deliberate, so a previous household's
balance cannot linger. With `vm` null it renders a single `<p>Loading the account…</p>`, which is why
geometry collapses.

**Disposition: NOT repaired here — next slice.** The instruction is explicit that a problem belonging
to a shared card/reveal primitive must not get a card-specific hack, and this is exactly that: the
panel already has a reserved-geometry skeleton (`FocusPanelSummarySkeleton`) for "replacement in
flight". The right repair routes the card's loading state through that reserved geometry rather than
adding a bespoke `min-height` magic number. Clearing the data is correct and should stay.

## S3-3 · Cache hit vs refetch is imperceptible — **closed as expected behavior**

Covered in §3–5. Recorded because it is the evidence behind the F-1 recommendation.

## S3-4 · Inbox cold open shows 18 concurrent skeletons — **P3**

Gone on reopen (0). Monitor; not operator-harmful.

---

# F-1 RECOMMENDATION: **KEEP CONSUME-ONCE**

**Do not change `consumeFreshProvisioning`.**

**Why, from evidence rather than preference:**
1. The refetch is **not perceptible**. The immediate revisit and the deep revisit produced
   indistinguishable frame films — 6 cards throughout, no blank, same subject-commit shape — while
   one hit the cache and the other spent 126 KB.
2. The stable surface, not the cache, is what makes revisit feel instant. F-4 already bought the
   operator-visible win; consume-once is now paying a cost the operator cannot see.
3. Which journey hits is **not** a function of depth — it depends on whether a prewarm re-warmed the
   URL. Changing consume-once would therefore trade a real freshness guarantee for an unpredictable
   and invisible saving.
4. Freshness simplicity is worth keeping: consume-once means an answer can never serve twice, which
   is a property that is easy to reason about against mutations whose fan-out is still unmeasured
   (that audit remains open).

**Revisit this only if** the quiet-host window later shows a click→usable difference between the hit
and miss paths, or if payload work (still held) makes the 126 KB materially cheaper to reuse than to
re-fetch.

# F-2 STATUS: carried forward, unchanged

No operator-visible cost appeared in any journey this slice — no stall, no blank, no jump
attributable to `locations?hierarchy=1`. It stays what Slice 2 classified it as: ~15 KB of unowned
stable config per selection, needing an ownership design rather than a cache. **Not repaired, per
instruction.**

# Ranked map

| Rank | ID | Item | State |
|---|---|---|---|
| **P1** | S3-1 | header identity oscillation A→B→A→B | **new** — decision needed |
| **P1** | S3-2 | Financials empty + ~340px collapse | **new** — use the shared reserved-geometry primitive |
| P2 | F-2 | `locations?hierarchy=1` unowned | carried |
| P2 | F-5/F-7/F-8 | payload shape (123 KB / 150 KB / 67.5 KB) | still held |
| P3 | S3-4 | Inbox cold-open skeleton count | monitor |
| — | F-1 | consume-once | **KEEP** — closed as expected behavior |
| — | motion | replacement transition | **close — none needed** |

**Closed this slice:** blank/false-empty defects (none found), Work View continuity, refusal
continuity, command acknowledgement, Work Items and Processing continuity, Communications
preview→full, search continuity, motion.

# Contained repairs made: **none**

Stated plainly rather than padded. The two strongest findings both sit on documented design
decisions or a shared primitive, and the instruction forbids exactly the hacks that would "fix" them
quickly. Everything else measured clean. Repairing nothing was the correct outcome of this pass.

# Recommendation for Slice 4

**Do the two P1 perceptual repairs, not payload.**

1. **S3-1** — take the header decision (recommend option (a)) and make the title monotonic. Small,
   high operator value, and it removes the last incoherence in the switch.
2. **S3-2** — route the Financials loading state through the panel's existing reserved-geometry
   skeleton, killing the 340px shift without weakening the clear.
3. Then **re-run this same frame harness** as the after-measurement.

**Payload optimisation is still not the next move.** F-1 is now closed as KEEP, so the per-selection
request pattern is finally stable — but the remaining operator-visible defects are presentational,
and they are cheaper and safer to fix than 123 KB of payload shape. Payload becomes the right target
once S3-1 and S3-2 are closed, and ideally once the quiet-host window allows the latency half of the
argument.
