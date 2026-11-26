# SLICE 14 — RESERVED GEOMETRY CONVERGENCE

Run: `erun_1ba1672f619970b1` · Lane: `lane_73a897409906` · Worktree: `wt1-work-unit-grade-a` (slot 1, port 3011)
Commits: `7e0c7c6e5` (convergence) · `a3b362180` (predicate correction)

## 1. What was asked, and what the five candidates turned out to be

Converge five candidate surfaces onto the reserved-geometry loading contract certified for Financials
in Slice 4. Classification was allowed to conclude "no code change".

| Candidate | Class | Outcome |
|---|---|---|
| `AttendanceCard` | A — adopter | Adopted. Clears its day on subject change; the `!vm` root is a one-line body. |
| `HealthSafetyCard` | A — adopter | Adopted. Clears health truth on subject change; falls to a one-line body. |
| `CurrentWorkCard` | A — structural | Adopted. `stageWorkPending` replaces a settled body with one line of text. |
| `CurrentWorkActivityPreview` | B/C — no change | Rendered from `CurrentWorkCard.tsx:1006/1094`; an interaction-opened preview that opens *into* a pending state. Reserving it would pad a surface the operator just asked to appear. |
| `FormDeliverySurface` | B/C — no change | Rendered from `CurrentWorkActionPanel.tsx:245`; likewise interaction-opened. |

`FinancialsCard` was deliberately **not** refactored onto the shared hook. Its Slice 4 implementation
is certified and measured; reopening it to make it resemble its successors buys nothing and risks the
one instance of this contract that is already proven. A test pins that it keeps its own geometry.

## 2. The contract, stated once

`useReservedCardGeometry(settled)` now lives beside `FOCUS_PANEL_RESERVED_MIN_HEIGHT` in
`FocusPanelSummarySkeleton.tsx` — an expression of the existing contract, not a competing primitive.
It remembers the footprint a card last settled at and reserves exactly that while the card is
resolving the next subject, falling back to the shared 7.5rem floor before anything has ever settled.
It is geometry only: it retains, restores and delays nothing.

Two adopter rules, both learned in Slice 4:

* the `ref` goes on **every root the card can return through while settled** — Health has four return
  branches and the loaded card returns through the third, which is exactly where Slice 4's first
  attempt failed (the reserve read the floor and looked like it worked);
* an interaction-opened overlay (Attendance history, Health detail) is **not** one of those roots —
  measuring it would remember the overlay's footprint as the card's.

## 3. The predicate was wrong, and the mounted panel said so

The first implementation used `vm != null` — "has data" — and it was wrong in the visible direction.
Sampling the real panel at ~85 ms across six journeys:

| | `vm != null` (v1) | `!loading` (shipped) |
|---|---|---|
| Attendance reserved frames | **79 of 80** | **0 of 80** |
| Attendance reserved height | 124px | — |
| Health reserved frames | **79 of 80** | **0 of 80** |
| Health reserved height | 142px | — |
| Natural settled height (both) | 69px | 69px |

Every subject on this Work View is family-grain and scopes no participant, so both cards sit in their
settled "Select a child…" state permanently. Under `vm != null` that state reads as *pending*, so a
repair against invented height was inventing ~50px per card on every subject, forever.

Settled means **the card has the answer**, whatever the answer is: a loaded day, "no attendance
record", "select a child", a permission refusal. The only state worth holding a footprint against is
the one where the card is resolving the next subject. The predicate is `!loading`; Current Work's is
`!stageWorkPending`, which already meant that.

This was caught by measuring, not by review — the same way Slice 4's no-op was caught.

## 4. Regression, against the base rather than against expectation

Both trees measured on the same journeys in the same session; base = `HEAD~2` card files in place.

| Leg | metric | base | Slice 14 |
|---|---|---|---|
| A→B→C→A | blank-card / zero-row / false-empty frames | 0 / 0 / 0 | 0 / 0 / 0 |
| A→B→C→A | distinct panel heights | 1 | 1 |
| A→B→C→A | subject-incoherent frames | 21 | 23 |
| A→B→A | subject-incoherent frames | 10 | 7 |
| lead→refusal→waitlist→refusal→lead | subject-incoherent frames | 15 | 14 |
| all legs | queue scroll values | [0] | [0] |
| all legs | rows | 7 constant | 7 constant |
| all legs | Financials settled height / inline min-height | 325px / none | 325px / none |
| all legs | Attendance & Health settled height | 69px | 69px |
| A→B, B→A, A→B→C, rapid A→B→C→D | stale-subject frames | — | 0 |

Subject-incoherent frames are the certified hold-prior behaviour (the active row advances while the
body keeps the prior subject until the next payload lands) and are **pre-existing**: the base shows
the same counts within sampling jitter, in both directions. Geometry cannot move that number, and the
base measurement is what says so rather than the argument.

F-4 intact: `InlineOpportunityFocusPanel.tsx:782` still renders `key="focus-panel-body"`.
Slice 4 intact: `FinancialsCard` still carries `ref={shellRef}` on both roots, settles at 325px, and
imposes no inline min-height while settled.

## 5. What the mounted evidence could NOT show, and why

* **The reserved window itself was never exercised.** Attendance and Health never receive a
  participant scope on this Work View — `data-attendance-subject` is null on every sampled frame and
  the body reads "Select a child to see their day." Clicking the Children card's child entry did not
  set the scope either (three attempts, subject stayed null). With no scoped participant there is no
  fetch, so there is no loading window to reserve against.
* **Current Work does not render here at all.** The panel's card set is
  `business_process, financials, children, attendance, household, health_safety` — Process Card
  supersedes Current Work on this surface, so `[data-work-card]` was absent in all 592 sampled frames.

Neither is a defect and neither was worked around. Both adoptions are held by tests instead, and the
tests are proven to bind (§6).

No latency claim appears anywhere in this document; timing remains BLOCKED pending a quiet host.

## 6. Tests, and the proof they bind

`web/tests/runtime/reservedGeometryConvergence.test.tsx` — 14 tests, green.

Behaviour (rendered, jsdom + `createRoot`, heights supplied explicitly since jsdom lays nothing out):
the shared floor before anything settles; the remembered footprint reserved while pending; **no content
carried across**; the *last* settled height wins, not the first; a zero measurement is never
remembered; a settled-but-empty card is settled — not padded — and its one line becomes the footprint;
and a two-root card measures only if the settled root holds the ref.

Wiring, per adopter: which roots hold the `ref` and the `style`, that the predicate is the one stated
above, that all three import the single shared contract, that none hard-codes 7.5rem, and that
Financials keeps its own.

**Planted defects — three, none on Financials, each restored:**

| Plant | Test that failed | Failure text |
|---|---|---|
| Health: `ref` removed from the settled root (Slice 4's exact defect) | "Health holds the ref on BOTH…" | `expected '<div\n className="allo…' to contain 'ref={reservedGeometry.ref}'` |
| Attendance: `style` removed from the pending root (reserve computed, never applied) | "Attendance holds the ref on BOTH…" | `expected '<div\n ref={reservedGeomet…' to contain 'style={reservedGeometry.style}'` |
| Current Work: predicate replaced with `true` (can never be pending) | "Current Work reserves on its single root…" | `expected … to match /useReservedCardGeometry\(!stageWorkPe…/` |

3 failed / 10 passed with the plants in; 14/14 after restoring. Each plant was verified on the mutated
line itself, not by grep.

Validation: `vac run typecheck` → 0. `vac run test tests/runtime/reservedGeometryConvergence.test.tsx` → 0.

## 7. Held, not done

Unchanged from Slice 13 and still waiting on a quiet host or dedicated tests: S8-3 (eligible-enrollment
children ×2), S8-2/R-018 sibling prefetch, S5-4 Activity prefetch, S9-1 post-mutation generation, F-2
location hierarchy, S3-4, D-2/R-005.

New from this slice: the reserved window for all three adopters is unmeasured on the mounted panel for
the reasons in §5. A surface that scopes a participant (or a tenant whose Work View renders Current
Work) would exercise it; that is a measurement opportunity, not a blocker on this repair.
