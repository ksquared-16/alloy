---
owner: platform
status: proposed
last_reviewed: 2026-08-05
---

# Director Experience V2 — DX-8 Executive Command Center evidence

**Branch:** `agent/cursor/6-director-experience-dx8-command-center`  
**Slice:** Executive Command Center (actionable inbox over Portfolio)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) (roadmap DX-8)  
**Base:** DX-7 tip `b672252ca`

## Constraint honored

- Mission lifecycle / workers / confidence / evidence / journey / continuation / collaboration / certification / **Portfolio grouping** unchanged as engines
- No new workflow states or execution paths — Command Center surfaces existing `actionBtn` kinds
- Aggregation in `executive-command-center.mjs` (composed from Portfolio cards)
- Mission detail pages remain the deep workspace

## What shipped

1. **Adapter** — `scripts/local-dev/lib/vacilando/presentation/executive-command-center.mjs`
   - Lanes: Needs Your Decision, Blocked, Ready to Promote, Waiting on Review, Waiting on Others, Recently Completed
   - Action cards: mission, phase, why here, recommendation, expected outcome, confidence, blocker, evidence, timing, one primary action
   - Deterministic priority (explainable bands — no AI)
2. **Portfolio attachment** — `directorPortfolioVm` adds `commandCenter` without changing portfolio groups
3. **UI** — Command Center is the first actionable section on the Portfolio home (above grouped portfolio cards)
4. **Roadmap** — DX-8 = Command Center; Remote Review → DX-9

## Automated tests

```bash
node scripts/local-dev/tests/executive-command-center-dx8.test.mjs
node scripts/local-dev/tests/director-portfolio-dx7.test.mjs
node scripts/local-dev/tests/operator-views.test.mjs
```

All passed (2026-08-05).

## Browser certification

Control plane: **`:3026`**

Mixed live portfolio + DX7 fixtures:

| Lane | Present |
|---|---|
| Needs Your Decision | yes |
| Blocked | yes |
| Ready to Promote | yes |
| Waiting on Others | yes |
| Recently Completed | yes |

Checks (`screenshots/dx8-browser-checks.json`):

- Command Center + Portfolio counts present
- 11 command cards / 5 lanes
- Mission detail still renders from Command Center navigation
- API `executive_command_center` + `director_portfolio` consistent

Screenshots:

- `dx8-command-center.png`
- `dx8-home.png`
- `dx8-command-lane.png`
- `dx8-command-card.png`
- `dx8-mission-detail-unchanged.png`

## Known limitations

- Enrichment (continuation + evidence + confidence) limited to top actionable cards for home latency
- “Approve Implementation” label appears when primary kind is `advance_implementation`; deliverable-review fixtures may still surface `recheck_deliverable` until Director completes cert briefing
- Command Center and Portfolio both list missions (intentional separation: do vs look)
- Home API still multi-second with large mission sets

## Recommended next roadmap slice

**DX-9 — Remote Review** → **DX-10 Mission/List Convergence** → **DX-11 Worker Operations**
