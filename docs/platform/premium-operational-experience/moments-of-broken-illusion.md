# Moments of Broken Illusion

**Path:** `docs/sprints/06_2026/premium-operational-experience/moments-of-broken-illusion.md`
**Status:** Punch list (June 2026). Companion to the [Experience Audit](./experience-audit.md).
**Purpose:** Every place the operator is reminded they are using software, scored for triage.

> The software should disappear. Each entry below is a moment it reappears.

---

## Scoring model

| Axis | Scale | Meaning |
|------|-------|---------|
| **Severity** | 1–5 | How much it breaks immersion in the moment it occurs |
| **Frequency** | Rare / Occasional / Common / Constant | How often an operator hits it in normal work |
| **Root Owner** | subsystem | Exactly one (per the audit ownership map) |
| **Fix Complexity** | Small / Medium / Large | Engineering effort + blast radius |
| **Experience ROI** | 1–5 | How much smoother the *whole product* feels once fixed |

ROI is deliberately *not* Severity. A medium-severity moment that fires constantly and lifts every surface (e.g. the motion language) can out-rank a high-severity rare one.

---

## The punch list (ranked by Experience ROI, then Severity × Frequency)

| Rank | ID | Moment of broken illusion | Severity | Frequency | Root Owner | Fix Complexity | Exp. ROI |
|------|----|---------------------------|:--------:|-----------|------------|----------------|:--------:|
| 1 | NAV-1 | Clicking a work unit reloads the whole screen — scroll resets, motion dies, shell blinks | **5** | Constant | Navigation | **Large** | **5** |
| 2 | MOT-1 | No motion language — every movement a different, unrelated speed | 3 | Constant | Motion | Medium | **5** |
| 3 | WU-2 | Returning to the queue flashes a stale row — "did my save take?" | **4** | Common | Queue | Medium | **5** |
| 4 | WS-1 | KPI numbers fade in a beat after the surface — it looks half-built | 3 | Constant | Runtime | Small | **4** |
| 5 | DRW-3 | Opportunity drawer silently discards typed edits on close | **4** | Occasional | Drawer | Small | **4** |
| 6 | WU-1 | A loading skeleton appears while *leaving* a work unit | 4 | Common | Navigation | Medium | **4** |
| 7 | DRW-1 | Drawers vanish instantly on close — no graceful exit | 3 | Constant | Motion | Small | **4** |
| 8 | NAV-2 | "I was just here" — recently-seen surfaces reload cold | 4 | Common | Runtime | Large | **4** |
| 9 | CARD-1 | Editing one card feels different from another; no consistent "saved" | 3 | Common | Card Runtime | Medium | **4** |
| 10 | DRW-2 | Linked record swap hard-cuts; old record's data flashes under new header | 3 | Common | Motion | Small | **3** |
| 11 | WS-2 | The workspace assembles itself region by region | 3 | Constant | Workspace | Medium | **3** |
| 12 | CARD-2 | An edit takes in the drawer but not on the queue behind it | 3 | Occasional | Card Runtime | Medium | **3** |
| 13 | WU-3 | Some "go somewhere" gestures are silky, others jolt | 3 | Common | Navigation | Large | **3** |
| 14 | MOT-2 | Deferred values "announce" — the eye is pulled to a number that just appeared | 2 | Common | Motion | Small | **3** |
| 15 | DRW-5 | Cold drawer open shows a "Preparing record…" wait | 2 | Occasional | Runtime | Medium | **2** |
| 16 | DRW-4 | After a refresh, "back" through records is gone | 2 | Rare | Drawer | Medium | **2** |

---

## Reading the rankings

**The top of the list is dominated by two root causes, not sixteen problems.**

- **NAV-1 / NAV-2 / WU-1 / WU-3 / DRW-4 / DRW-5** are all the *same wound*: navigation is a full reload and state is ephemeral. Six moments, one fix-family (Track 1). NAV-1 alone is the highest-leverage change in the product — it is simultaneously the worst illusion break (Severity 5, Constant) and the unlock for five other entries.

- **MOT-1 / MOT-2 / DRW-1 / DRW-2** are the *same absence*: there is no motion language. Four moments, one fix-family (Track 3). MOT-1 ranks #2 on ROI despite mid severity because it fires on *every* interaction and lifts *every* surface at once — and most of its dependents (DRW-1, DRW-2) are Small once tokens exist.

- **WS-1 / WS-2 / WU-2 / CARD-2** are the *same lapse*: the atomic-reveal law is real but selectively un-enforced, and optimism doesn't cross surface seams (Track 2).

- **DRW-3 / CARD-1** are the *same missing contract*: editing has no platform doctrine (Track 4). DRW-3 is the one with teeth — silent data loss — and it is a Small fix that should not wait for the full editing doctrine.

**The cheapest high-ROI wins** (do early, low risk): WS-1 (gate fix, Small), DRW-3 (universal dirty-guard, Small), DRW-1 (close choreography once tokens exist, Small), MOT-2 (settle token, Small).

**The keystone** (do deliberately, high risk, highest reward): NAV-1. Everything in Track 1 hangs off it; it must not be rushed and must keep a fallback.

---

## What "fixed" feels like

When this list is cleared, an operator working a full shift will not be able to point to a single moment where they noticed the software — not a reload, not a skeleton on the way out, not a stale row, not a number fading in late, not a lost edit, not a drawer that vanished, not a swap that jumped, not two movements that disagreed on speed.

They will simply have continued operating. The work will remain. The software will be gone.
