---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 1 — decision-stage Work View teardown: root cause and repair design

**Lane** `lane_73a897409906` · **Run** `erun_28abacd901339296` · base `b875be32d` · slot 1 `:3011`.

**Status: diagnosis COMPLETE and proven at the API layer. Repair DESIGNED, NOT IMPLEMENTED.**
Section 6 states why, and exactly what the next run executes.

---

## 1. The condition, proven without the UI

The banner is not a rendering accident. It is the faithful rendering of a whole-answer refusal:

```
GET /api/admin/work-units/all/provisioning-answer
  → terminal: "operational"      ← 7 rows, full lens set, Work Unit "New Leads", view "All"

GET /api/admin/work-units/all/provisioning-answer?subject_id=8baf8418…
  → terminal: "error"
     code:    "no_truthful_primary_action"
     message: stage "decision" offers no reachable primary action …
```

**Same Work Unit, same Work View, only `subject_id` differs.** The Work View is demonstrably
operational. The subject is not. The answer reports the subject's problem as the *surface's*
terminal.

## 2. Ownership chain

| Step | Owner | What happens |
|---|---|---|
| 1 | `familyStageDestinationOperability` (`lib/runtime/provisioning/workViewDestinationOperability.ts:84`) | Subject's Mission stage has a work template, no `execution_mode: "outcome_led"`, and no `primary_action.action_ref` → `{ ok: false }` |
| 2 | `composeWorkUnitProvisioningAnswer` (`workUnitProvisioningAnswer.ts:1486`) | Calls `fail("no_truthful_primary_action", …)` |
| 3 | `fail()` (`:642`) | Returns `terminal: "error"` — **a whole-answer terminal with no notion of scope** |
| 4 | `workUnitSurfaceModelFromSnapshot` (`:174-204`) | On `terminal === "error"` builds an error surface: `queue.rows: []`, `selectedRecordId: null`, `selectedSubject.source: "empty"` |
| 5 | `QueueRegion` (`:394`) | `errorKind === "configuration"` → renders the banner **in place of the rows** |

**Root cause (step 3): `fail()` is scope-blind.** Six refusal sites (`:1313`, `:1325`, `:1442`,
`:1466`, `:1486`, `:1495`) fire *after* the Work View, its lens set and its evaluated page have all
resolved successfully, and every one of them discards that resolved cohort.

**Classification: an ownership bug that is independent of configuration validity.** The tenant
configuration gap is real and separate (§4), but even a genuinely broken subject must not be able to
unmount its cohort.

**This is the same defect the file already fixed one level up, and stopped short of finishing.**
`fail()` was previously given a `navigationFrame` parameter for exactly this reason, documented at
`:391`:

> *"A refusal must not also remove the way out."*

The lens set was preserved so the operator keeps an exit. **Nobody carried the rows.** The repair is
that same sentence applied one level deeper.

A second, independent confirmation that this blast radius is a known-but-unfixed shape — from
`workViewDestinationOperability.ts:60`, written when `outcome_led` was added:

> *"because one inoperable stage refuses the WHOLE Work View, a correctly configured process
> rendered no queues, no rows and no selectable subject at all."*

That change made one stage class stop triggering the teardown. It never removed the teardown.

## 3. Which other states trigger the same parent teardown

Any of the six subject-scope refusals. Confirmed reachable today:

| Code | Trigger |
|---|---|
| `no_truthful_primary_action` | subject's stage offers no reachable primary action *(the measured case)* |
| `no_truthful_primary_action` | subject holds no resolvable Mission stage |
| `no_truthful_primary_action` | child-grain composition cannot describe the subject's position |
| `subject_unavailable` | requested subject not in the evaluated page — **a deep link to an off-page row unmounts the cohort** |
| `subject_unavailable` | configured strategy resolved no subject from a non-empty page |

So this is **not** a `decision`-stage bug. `decision` is merely the configuration that reaches it
first on this tenant. Fixing the stage config would hide the measured instance and leave five doors
open.

## 4. The configuration gap, stated separately

The refusal branch that fired identifies the tenant state exactly: the stage **has** work templates
(it passed the earlier check), its template does **not** declare `execution_mode: "outcome_led"`, and
its `primary_action.action_ref` is null. Per the rule's own documentation this refusal is *by design*
— *"a template that says nothing and offers nothing has not claimed to be outcome-led, it is simply
incomplete."*

**Do not repair this by declaring the stage outcome-led.** That is the "merely hide the banner" move
the instruction forbids, and it would leave §3 intact.

## 5. The repair (designed, reviewed against the concurrency structure)

Mirror the `navigationFrame` precedent: **carry the cohort that was already resolved.**

1. **`ProvisioningAnswer` error terminal** gains an optional `queueFrame` — the rows, row grain,
   subject grain and resolved presentation the answer held when it refused; `null` when the refusal
   happened before rows resolved (`unauthorized`, `work_unit_not_found`, `no_business_process`,
   `grain_ambiguous`). Additive and optional, so **the union stays at four members and no consumer's
   exhaustiveness breaks.**
2. **The six subject-scope sites** return through a `cohortRefusal(code, message)` helper that awaits
   the already-in-flight `enrichedPromise` / `presentationPromise` / `actionsProjectionPromise` and
   populates `queueFrame`.
3. **`workUnitSurfaceModelFromSnapshot`** — when `queueFrame` is present: build `queue.rows` through
   the *existing* operational mapping, set `queue.error: null`, and commit `selectedRecordId` to the
   requested subject so the row still selects.
4. **The refusal moves to the Focus Panel region** as a new panel-scoped model field, rendered where
   the subject's composition would have been.
5. **`QueueRegion` is not special-cased** — it already renders rows whenever `error` is null.

**Concurrency checked, not assumed.** `focusPanelStageWorkPromise` starts at `:1537`, *after* all six
refusal sites, and enrichment is already in flight from `:1161`. Awaiting enrichment on the refusal
path therefore serializes nothing on the operational path — it costs latency only on a path that
today returns fast and useless.

**No new runtime, no new cache, no new fallback, no new terminal.**

### Required behaviour this satisfies
Work View stays mounted · queue visible · rows intact · selection commits · refusal contained to the
Focus Panel · other stages untouched (the operational path is not modified).

## 6. Why this run stopped at the design

The repair spans the 1,918-line provisioning composer plus four consumers and the Focus Panel render
path. Implementing it, its six regression tests and mounted QA did not fit the remaining context
window of this run at a standard I would certify. **A half-restructured `composeWorkUnitProvisioningAnswer`
is a worse outcome than a precise design handed forward** — it is the answer every operator surface
in the product commits against.

Nothing is speculative in §§1–5: the terminal difference is proven by two API calls, and every line
reference is read, not inferred.

**Next run executes §5 in order, then the six regression cases, then mounted QA of `8baf8418…` and
`eb5394c7…`.**

---

## 7. Financials duplicate — three causes eliminated, not yet root-caused

`GET /api/admin/financials/card?customer_id=…` fires **exactly twice** per Work Unit entry, same
query string, and was the slowest request in the Phase 0 sample.

**Eliminated by measurement:**

| Hypothesis | Verdict |
|---|---|
| React StrictMode echo | **No** — reproduces with `ALLOY_DEV_STRICT_MODE=0`; it was ×3 under StrictMode, so one echo sat on top of a real pair |
| Hook-identity double fire in one instance | **No** — one mount effect (`FinancialsCard.tsx:714`), `load` memoised on `[customerId, scopedMemberId]`, and a `requestSeq` guard already drops superseded responses |
| A second, hidden card copy (responsive duplicate) | **No** — one Focus Panel boundary, six *visible* cards at distinct widths; `data-card-role` counts of 2 are three roles across six cards, not a double mount |

**Remaining candidates:** two mounted `FinancialsCard` instances (the panel card and
`FinancialsAccountWorkspaceDetail`, the only other caller at `:58`), or a card remount during panel
composition. **Not asserted** — it needs a mount counter on the card, which is the next step.

**Disposition:** open, cause unknown, cheap to settle. Reported as unresolved rather than guessed.

**Provisioning duplicate** (`provisioning-answer?subject_id=…` ×2 on row selection): untouched this
run, still open, ranked below Financials.

## 8. Ranked map (updated)

| Rank | Item | Class | State |
|---|---|---|---|
| **P0** | Subject-scope refusal unmounts its cohort (5 reachable doors, §3) | Ownership | Diagnosed, designed, **not implemented** |
| **P1** | Financials card fetched ×2 per entry (slowest request measured) | Duplicate work | 3 causes eliminated, open |
| **P2** | `provisioning-answer` ×2 per row selection | Duplicate work | Open |
| **P3** | `decision` stage declares no execution mode | Tenant config | Separate; **do not** use as the P0 fix |
| — | R-018/D-3 sibling prewarm (6 of 9 calls) | Policy | **Frozen** pending quiet-host A/B, per instruction |
| — | Search's four silent-return sites | Hardening debt | Deferred, per instruction |

## 9. Phase 1 readiness

**Not yet.** Phase 1 is a broad regression audit whose primary instrument is exactly the journey this
P0 breaks — a cohort that vanishes mid-journey corrupts every request-count and mount-count sample
taken across it. Land the P0 repair first; then Phase 1 is safe.

**Timing remains BLOCKED.** No latency claim is made anywhere in this document.
