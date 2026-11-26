# P0-7.6 Part 2 — what the RENDERER actually consumes

Run: erun_83d14272c1e5fb88 · Lane: lane_73a897409906

Codes: **P1** required for collapsed first paint · **INT** required for interaction ·
**DET** detail-only · **DEC** decorative enrichment · **NR** not reached by this configuration

## The renderer forks before the generic body

`FocusPanelCardRenderer.tsx` has two paths:

- lines 130–331 — a per-card-key dispatch that **early-returns a dedicated component**
- lines 332–412 — the generic archetype/payload body

**All six configured cards take the early return.** household:159, children:175,
health_safety:235, financials:242, attendance:248, business_process:261.

So of the 47 `model.` references in the renderer, the 30 below line 332 — including every use of
`model.payload` (376, 390), `model.insight` (397), `model.secondaryInsight` (398),
`model.statusChip`/`statusTone` (402/403) and the `CardFooterAction` block that reads
`model.primaryAction` (102, 109, 113, 410) — are **NR: never reached for this configuration.**

What survives above the fork, for all six:

| reference | lines | class |
|---|---|---|
| `model.visible` | 130 | **P1** |
| `model.key` | 144–331 dispatch | **P1** |

Every one of the six is handed the **identical** props contract:

```
{ model, context, receded, coordination, [mutation] }
```

No card receives `OpportunityDrawerViewModel`. The renderer's own comment states the boundary:
*"pure cards read only `model` + `context`"* and *"assembles its answer from `context.truth` — no
fetch on expand."*

## What the six components read from `model`

Exhaustive, by grep across all six component files:

| component | fields read from `model` |
|---|---|
| `HouseholdCard` | `title` `tier` `span` `key` `iconName` |
| `ChildrenCard` | `title` `tier` `span` `key` `iconName` |
| `HealthSafetyCard` | `title` `tier` `span` `iconName` `archetype` |
| `AttendanceCard` | `title` `tier` `span` `iconName` `archetype` |
| `FinancialsCard` | `title` `tier` `span` `iconName` `archetype` `density` |
| `BusinessProcessCard` | `title` |

Verified negative: **no configured card reads `model.insight`, `model.payload`,
`model.statusChip`, `model.statusTone`, `model.primaryAction` or `model.secondaryInsight`** — not
by property access and not by destructuring.

## The result

The union of all `model` fields the configured collapsed surface consumes is **eight, all P1, all
class A CONFIGURATION**:

```
key  title  archetype  tier  span  density  iconName  visible
```

### Consequence for Part 1

The only non-configuration cells the Part 1 table found — `household.insight`,
`household.payload`, `children.insight`, `children.secondaryInsight`, `children.payload` and the
single D cell `children.primaryAction` — are **computed and then never read**. They are dead
output of `buildHouseholdCardModel` / `buildChildrenCardModel`. The cards derive the same answers
themselves from `context.truth`.

So the corrected Part 1 verdict is stronger than the table: **the collapsed card model for the
configured surface is 100% configuration, with zero fact content, zero drawer-VM dependency and
zero `document_children` dependency.**

Facts do not enter through the card model at all. They enter through `context`, and through each
card's own read.
