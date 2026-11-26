# POST-DEPLOYMENT QA — REPAIR SLICE 4: BUSINESS PROCESS COMMIT ADMISSION

Run `erun_55dbacf77957c14e` · starting SHA `9544b3f4c` · repair SHA `13b892e25`
Deployed SHA under repair: `ec8cdaa605da374d1bbec9e389b233f13c76709f`
**P0-2 only.** No Attendance/Health projection work, no Household/Children change, no S8-2 change,
no general latency work. **Not merged, promoted or deployed.**

## FINAL STATUS: `REPAIR_SLICE_4_COMPLETE_CERTIFIED`

Certified locally at the composition level. Deployed acceptance is unclaimed and remains the gate.

---

## 1. ADMISSION OWNERSHIP MAP

| Concern | Owner |
|---|---|
| Is a card's first-operational **content** derivable from commit truth? | `focusPanelCommitCriticalCards.ts` → `COMMIT_CRITICAL_CARD_SPECS` |
| Does a card have enough **identity** to mount and start its own read? | `focusPanelMountableCards.ts` → `MOUNTABLE_CARD_SPECS` |
| Turning those into a model + readiness map | `focusPanelWorkModeModelFromProvisioningAnswer.ts` (commit) / `…FromDrawerVm.ts` (settled) |
| Deciding whether a cell mounts | `OpportunityFocusPanelModeGrid.tsx` ~703 |
| Rendering the admitted card | `FocusPanelCardRenderer.tsx` → `BusinessProcessCard` |
| Composing what the card says | `buildBusinessProcessCardEvidence` (pure, over `OperationalContext`) |

The grid's rule is the whole story:

```ts
const readiness = cardReadiness.get(typeKey) ?? "reserved";
const baseModel  = cards.get(typeKey);
const mountable  = readiness === "ready" || readiness === "self_loading";
if (!mountable || !baseModel) return <ReservedFocusPanelCell … />;
```

## 2. BUSINESS PROCESS — ADMISSION PATH BEFORE THE CHANGE

`business_process` appeared in **neither** registry. So at commit `cardReadiness.get("business_process")`
was `undefined` → defaulted to `"reserved"` → not mountable → `ReservedFocusPanelCell`. The component
was never mounted, therefore Repair Slice 2's fallback — which lives *inside* that component — could
never execute. The card first appeared only when the drawer-VM producer built a model for it.

This is why Slice 5 measured **no improvement at all** (6,562 ms vs a 5,949 ms baseline), and why
Slice 2's own note that the card was *"absent from the DOM, not an empty shell"* was the tell.

**Why the fix belongs here and not in the card.** A mounting branch inside `BusinessProcessCard`
cannot work — the component is not rendered, so no code in it runs. The only place that decides
mounting is the admission registry, which is also the seam the file documents as "promoting the next
knowable card to ready-at-commit is ONE entry here, not producer surgery."

**Why commit-critical rather than mountable.** The registries split on content vs identity. This card
issues no request; every fact is composed from the context it is handed. Admitting it as
`self_loading` would assert it fetches something, which is false. Its content is commit-knowable
exactly when the stage is.

**Participation — the law `scheduling` was reverted for.** Commit work may only be spent on a card the
resolved composition places. This one is placed: first entry in `ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS`,
declared **global** successor to `current_work` (`supersededBy`, no grain scope), and measured
rendering on deployed staging.

## 3. KNOWABILITY PREDICATE

```ts
isKnowable: (context) => normalizedStageKey(context) != null

function normalizedStageKey(context: OperationalContext): string | null {
    const raw = context.businessProcess.stageKey ?? context.businessProcess.key ?? null;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed === "" ? null : trimmed;
}
```

**Requires:** the subject (implied — the context is built per subject) and the authoritative stage key,
which `buildCommitCriticalOperationalContext` sets from the answer's `currentBusinessState`.
**Does not require:** process name, stage rail, participants, work rollups, final evidence, drawer VM.

`key` is read as a fallback because the commit builder sets both fields from the same `situation.stageKey`
while the settled context fills them from the lifecycle rail. Blank is treated as **absent**, matching
the mountable registry's rule that `""` is an absent identity, not an empty one.

**Why not looser.** With no stage key the evidence builder has no case stage to report and the card
would render a frame stating nothing — worse than the reserve. So `false`, and behaviour is unchanged.

## 4. THE REPAIR

Two files, one behavioural change.

* `focusPanelCommitCriticalCards.ts` — one `business_process` spec entry (+ the `normalizedStageKey` helper).
* `deriveOpportunityFocusPanelCards.ts` — the settled producer's inline model literal extracted to an
  exported `buildBusinessProcessCardModel()`, which the new spec's `build` also calls.

The extraction is not cosmetic: the registry's law is that a card must be byte-identical pending →
enriched, and this card has already been bitten by a duplicated frame — it was once
`{ ...currentWorkModel }`, so the canonical successor inherited its predecessor's title and insight and
QA correctly failed it. Two literals would be two chances to drift.

**`BusinessProcessCard.tsx` was not touched.**

### Commit-frame composition, before → after

| | before | after |
|---|---|---|
| `cardReadiness.get("business_process")` | `undefined` → `"reserved"` | **`"ready"`** |
| `cardModels.has("business_process")` | `false` | **`true`** |
| grid outcome at commit | `ReservedFocusPanelCell` | **`BusinessProcessCard` mounted** |
| what it states at commit | nothing | `currentStageLabel: "New Lead"` |
| at settlement | card first mounts | **same cell enriches** — rail + process name arrive |

### Settlement enrichment proof

The commit model equals `buildBusinessProcessCardModel()` exactly, so the enriched cell is the same
card key with the same frame — an enrichment, not a remount. Evidence monotonicity is asserted:
`caseStageKey` and `caseStageLabel` survive unchanged, `stages` grows from `[]` to the configured rail,
`processName` arrives (`null` → `"Enrollment"`), and nothing meaningful at commit becomes null.

## 5. PLANTED-DEFECT PROOF

Removed the `business_process` entry from `COMMIT_CRITICAL_CARD_SPECS` and re-ran:

| Suite | With the defect planted |
|---|---|
| `businessProcessCommitAdmission` (this slice, composition-level) | **13 of 28 FAIL**, including `THE GATE: the grid would mount the card from this model alone` |
| `businessProcessCommitMeaning` (Repair Slice 2, component-level) | **11 of 11 PASS** |

**That second row is the certification lesson, demonstrated rather than asserted.** With the exact
defect that shipped to staging planted in the tree, every one of Slice 2's tests stays green. A
component-level test cannot see an admission defect, because it renders the component the defect
prevents from rendering.

Spec restored; all suites green.

## 6. FOCUSED TESTS

`web/tests/runtime/businessProcessCommitAdmission.test.ts` — **28 tests**, every one driving the real
producer `focusPanelWorkModeModelFromProvisioningAnswer`, not the card in isolation.

1. admission includes `business_process` when the stage is knowable; admitted as **content**-ready, and absent from the mountable registry
2. **the grid would mount it from the commit model alone**, in `phase: "commit"`, with a real model
3. the mounted commit card states the committed stage (`lead` / `New Lead`) and process label, claiming no rail
4. settlement enriches the same cell — byte-identical frame, stage identity survives, monotonic
5. no stage key → not knowable, not mounted, honest reserve preserved; blank is absent
6. admission waits for the stage only — not rail, participants, current work or projection
7/8. no `fetch`/effect/state/promise/storage in the admission owner; no second readiness source; card untouched
9. the other four commit-critical cards and all three mountable cards resolve exactly as before

## 7. GATES

| Gate | Result |
|---|---|
| Focused admission suite | **28/28 pass** |
| Prior repairs re-run (P0-1, P0-5, P0-2 Slice 2, P0-3/P0-4) + adjacent | **109/109 pass**, 8 files |
| Adjacent focus-panel composition suites | **79/79 pass**, 6 files |
| `vac run typecheck` | **rc=0** |
| `vac run build` | **rc=0** |
| New network requests | **0** — the card fetches nothing; admission is a pure predicate |
| New loader / cache / readiness owner | **none** — asserted by test |

## 8. REPORTED, NOT SILENTLY ACCEPTED

**The commit-frame card carries the stage but not the current-work line.** `safeCurrentWork` catches a
throw out of `buildCurrentWorkCardEvidence` on the commit context and degrades to `null`, so the card
is thin at commit and gains that line at settlement. Reproduced with a **production-shaped**
`StageWorkRuntimeProjection`, so it is not a minimal-fixture artifact.

It is pinned by an explicit test rather than left for a later reader to rediscover. Attributing it is a
Current Work question, not an admission one, and this slice repairs admission only. If a Current Work
repair makes the line available at commit, that test fails and is updated deliberately.

What the card receives at commit today:

```
currentStageLabel: "New Lead"     ← the meaning P0-2 is about
subjectLabel:      "Wenc Family"
stages: []  workLine: ""  actions: []  activity: []
```

Thin, but it answers the card's core question — *where is this record* — 6.5 s earlier than before.

## 9. P0-6 OBSERVATION ONLY — HOUSEHOLD / CHILDREN

**No product change.**

| Card | Classification | Commit knowability predicate |
|---|---|---|
| `household` | **commit-critical** | `hasSubjectIdentityTruth` — `truth["person.primary_contact_name"] != null \|\| truth._inquiry_children != null` |
| `children` | **commit-critical** | `truth._inquiry_children != null` |
| `readiness_kpi` | commit-critical | `hasSubjectIdentityTruth` (same as household) |

Measured truth-table:

| truth carried | household | children | readiness |
|---|---|---|---|
| contact + children | ready | ready | ready |
| children only | ready | ready | ready |
| contact only | ready | **not** | ready |
| neither | **not** | **not** | **not** |

**The finding this prepares.** Both cards are *already* commit-critical with correct predicates — yet
Slice 5 measured both arriving at 20,113 ms, not at first cards. The only way both predicates return
false is if the answer carried **neither** `person.primary_contact_name` nor `_inquiry_children` for
that subject. So the next P0-6 assessment should not look at these specs: **the gap is upstream, in the
provisioning answer's `subjectIdentityTruth` bindings for that subject.** That is a different question
from P0-2's, and adding a spec entry would not touch it.

## 10. COMPOSABILITY

Commit admission is now a total function of the answer's own context for five cards. The registry
remains the single seam — the next promotable card is one entry, and the participation law is intact.
No central switch was added; nothing branches on a card key outside a registry.

## 11. CERTIFICATION LESSON → P1-1

Added to the P1-1 inventory as **MUST_FIX_BEFORE_PROGRAMME_CLOSE**:

> **A transitional component-state repair is not certified unless the harness proves the component is
> actually ADMITTED and MOUNTED during that real runtime phase.** Rendering the component proves the
> component; it cannot prove the component runs. Demonstrated here: with the shipped defect planted,
> 11/11 of the component-level tests pass while 13/28 of the composition-level tests fail.

This is the same family as the Slice 5 item that certification harnesses are themselves uncertified,
and it is the fourth distinct instance in this programme of a green gate over broken deployed
behaviour. Not broadly implemented here, as instructed.

## 12. LEDGER

| Finding | Status |
|---|---|
| P0-1 Workspace loader | CLOSED — deployed-verified (Slice 5) |
| P0-5 Work View acknowledgement | CLOSED — deployed-verified (Slice 5) |
| **P0-2 Business Process at commit** | **REPAIRED + locally certified — awaiting deployed verification** |
| P0-3 / P0-4 presentation | CLOSED |
| Attendance/Health projection `unavailable` | OPEN — upstream, untouched |
| P0-6 Focus Panel settlement | OPEN — P0-2 half addressed; Household/Children traced upstream |
| S8-2 | BENEFICIAL / KEEP — untouched |
| P1-1 certification debt | 14 items |
| Current Work absent from the commit BP card | **NEW — reported, pinned by test, unattributed** |

**Remaining blockers:** the Attendance/Health projection question, and the `subjectIdentityTruth`
question behind Household/Children. Both upstream of presentation; neither touched here.

**Next deployed measurement for P0-2:** cold Work Unit entry; require Business Process **present and
stating its stage at first-card time**, with the 6,562 ms gap collapsed to the commit frame. The rail
and process name arriving later is enrichment, not failure.

**The programme remains open.** Final certification stays reserved for the human staging walkthrough.
