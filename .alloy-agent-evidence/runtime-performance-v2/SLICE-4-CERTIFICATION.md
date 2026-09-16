---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 4 — monotonic subject identity + stable card geometry

**Lane** `lane_73a897409906` · **Run** `erun_7725aaeabbec4173` · base `b1eece16f` · commit **`6c8c54cc3`**.

**Conditions.** `ALLOY_DEV_STRICT_MODE=0`, host load 4.1 — **timing BLOCKED, no latency claim.**
Same external frame-sampling harness as Slice 3 (~80ms cadence). Instrumentation used only for the
F-4 mount check and removed; tree clean.

---

## 1–2. S3-1 — root cause and implementation

**Ownership:** two rules, each individually documented, composing into a reversal.
`FocusPanelCompactHeader` (seed) names the **clicked** subject — *"identity commits from the click,
not from provisioning"*. Then `OpportunityFocusPanelHeader` took over and, while
`bodyHoldsPriorSettlement` (`resolved == null && heldPrior != null`) was true, deliberately named the
**held** subject so the title matched the body still on screen.

**Implementation:** the carve-out is gone.

```diff
-const headerTitle = (!bodyHoldsPriorSettlement ? seedSubjectTitle : null)
-    || childDisplayName || (visible ? drawerTitle : null);
+const headerTitle = seedSubjectTitle || childDisplayName || (visible ? drawerTitle : null);
```

The seed is keyed on LIVE attention, so it always carries the newest intent. A resolved payload may
still **enrich** the chrome (context chips, summary line) but can no longer **rename** the subject.
The hold/reveal contract is untouched, and the body retains its own `data-focus-panel-body-subject`,
so held content is never relabelled — chrome answers *who was selected*, the body answers *what valid
content can remain visible*.

## 3. Before / after frame sequence

| | Title sequence |
|---|---|
| **Before** | Specq0913 (2ms) → Kurzman (86ms) → **Specq0913 (775ms)** → Kurzman (2216ms) |
| **After** | Specq0913 (1ms) → **Kurzman (86ms)** — and nothing further |

Every switch measured after the repair is two entries, forward only:

| Switch | Sequence |
|---|---|
| A → B | Specq0913 → Kurzman |
| B → C | Kurzman → Certfree |
| C → A | Certfree → Specq0913 |
| A → B (again) | Specq0913 → Kurzman |

## 4. Rapid selection A → B → C → D

```
[prior] → Specq0913 (309ms) → Kurzman (695ms) → Certfree (1200ms) → Certopp (1487ms)
```

Strictly forward, in selection order, no reversal. Final committed row `468a5a95` = D, and the title
agrees. **Latest-selection-wins intact; no stale payload overwrote the current header.**

## 5. Refusal title behavior

`Kurzman → Disposable0913 (83ms) → "This record can't be opened…" (831ms)`.

The selected subject is acknowledged first, then the refusal takes the panel body. Throughout:
`activeRow = 8baf8418` (the refusing subject stays lit), `refusalKind = configuration`, **rows 7**,
cards 6 → 0 → 6. **Slice 1B containment unchanged**, and no stale refusal leaked into the next
subject.

## 6. S3-2 — shared primitive assessment

**Finding: `FocusPanelSummarySkeleton` is a panel-BODY-level pending grid, not a per-card primitive.**
It composes the whole card grid while the body is pending; it is not something an individual card can
render for its own hydration. Forcing Financials into it would have been the wrong adoption.

**But the canonical per-card contract does exist inside that module** — `ReservedSettlementRegion`,
documented as *"keeps the card shell and `minHeight` (that is what prevents reflow when Detail settles
into it)"*. It was private, and its height was an inline literal.

**Correct repair = small shared correction + adoption**, which is what was done: the floor is now
exported as `FOCUS_PANEL_RESERVED_MIN_HEIGHT` (one definition, used by both the skeleton and the
card). **No new primitive, no new skeleton system, no `min-height: 409px`.**

**Latent elsewhere:** the same one-line-loading pattern with no reserved geometry exists in
`AttendanceCard`, `CurrentWorkCard`, `HealthSafetyCard`, `CurrentWorkActivityPreview` and
`FormDeliverySurface`. Slice 3 did not expose them because those cards were already short (69px) for
the measured subjects. Recorded as **S4-1 (P2)**, with the adoption path now available.

## 7. S3-2 implementation

Financials keeps `setVm(null)` — clearing is correct. It now reserves geometry on its **existing**
shell (no new DOM node): its own last loaded footprint when it has one, falling back to the shared
token on a first load. Geometry is not data — remembering how much room the card occupied leaks
nothing about the previous account, and it adapts per subject instead of freezing one height.

**A defect in my own first attempt, found by measurement rather than assumed away:** the reserve read
the shared floor (120px) instead of the remembered height, because the *loaded* card returns through
an earlier branch (`!expanded && vm && reconciliation`) whose root carried no `ref` — so the footprint
could never be recorded. Both roots now carry it.

## 8. Financials height before / after

| | Sequence | Displacement |
|---|---|---|
| **Slice 3 (before)** | 409 → **69** → 409 | ~340px round trip |
| **First attempt** | 409 → 120 (token floor) → 409 | ~289px — insufficient, fixed |
| **After** | **325 → 325 (reserved, `minH: 325px`) → 409** | **no collapse** |

`fin_min` is **325** on every normal switch (was 69). The 325 → 409 step is the new subject's real
content height, which the instruction explicitly permits. Returning from a refusal correctly falls
back to the 120px token, because the card was unmounted by the refusal and has no footprint to
remember — the honest fallback.

## 9. Stale-data clearing proof

`stale_money_while_reserved: false` in **every** leg — no `$` value was visible in the card while it
was in the reserved state. Clearing remains; only the footprint is held.

## 10. F-4 mount regression

**A → B → C → A: 0 mounts, 0 unmounts** (beyond the single entry mount). Neither repair — including
the added `ref` and the reserved inline style — reintroduced remounting.

## 11. Slice 3 harness rerun

| Check | Result |
|---|---|
| Cards during valid switches | **6 → 6**, never 0 |
| Queue rows | **7 → 7** in every frame |
| Panel heights per transition | **1** (no panel-level jump) |
| Blank frames / false empties | **0 / 0** |
| Refusal continuity | cards 6→0→6, rows 7, containment intact |
| Warm revisit A→B→A | 13 calls / 256 KB / 1 provisioning; cards 6, rows 7, title correct |

`vac run typecheck` **rc=0**; 37 tests pass across the containment, coalescing, snapshot-renderer and
motion suites.

## 12. New perceptual defects

**None introduced.** One pre-existing latent issue recorded (S4-1, §6).

## 13. Ranked map

| Rank | ID | Item | State |
|---|---|---|---|
| ~~P1~~ | S3-1 | header oscillation | **CLOSED** `6c8c54cc3` |
| ~~P1~~ | S3-2 | Financials geometry collapse | **CLOSED** `6c8c54cc3` |
| P2 | **S4-1** | one-line-collapse latent in 5 other cards | **new** — adoption path now exported |
| P2 | F-2 | `locations?hierarchy=1` unowned | carried |
| P2 | F-5/F-7/F-8 | payload shape | **now eligible** |
| P3 | S3-4 | Inbox cold-open skeleton count | monitor |
| — | F-1 | consume-once | **CLOSED — KEEP** |
| — | motion | none added, per Slice 3 | closed |

## 14. F-2 status

Carried forward unchanged, not touched opportunistically. Still ~15 KB of unowned stable config per
selection across 8+ callers with private URL constants, and still **no operator-visible cost** in any
Slice 3 or Slice 4 journey. Needs an ownership decision, not a cache.

## 15. Refresh / invalidation

**Still unmeasured.** No safe mutation fixture exists on the measuring server — it targets the shared
hosted Firefly tenant, and the only isolated org would require a host-wide env change affecting other
sessions. Carried forward explicitly; mutation refresh behaviour was not altered.

## 16. Payload-optimization readiness: **READY**

The gates are now clear. F-1 is closed (KEEP), so the per-selection request pattern is stable; the
two operator-visible P1 defects are repaired; the surface holds under every measured journey. Payload
shape is the largest remaining structural cost and nothing visible now outranks it.

**Do not assume all of it should be optimised** — the ranking question is still open:
`focusPanelStageWork` ~72 KB and `focusPanelSummaryDoc` ~27 KB (81% of a ~123 KB answer), drawer VM
~150 KB, `activity?limit=100` up to ~67.5 KB.

## 17. Recommended Slice 5

**Payload ranking and reduction, starting with the provisioning answer.**

1. Establish what each large field is actually *used for* at commit time — `focusPanelStageWork` is
   59% of the answer and is the Current Work slice; determine whether it must be commit-critical or
   can be deferred to Settlement.
2. Same question for `focusPanelSummaryDoc` (27 KB) — it is a published layout document and looks
   org-stable rather than subject-scoped, which would make it cacheable rather than re-sent per
   selection.
3. `activity?limit=100` is a card-sized read asking for 100 rows; a smaller page with an explicit
   "show more" is probably correct.
4. Re-run this harness after each, because payload changes can reintroduce reveal defects.

**Second candidate if payload is deferred:** **S4-1**, which is cheap now that the reserved-geometry
contract is exported, and prevents the Financials defect recurring in five other cards.
