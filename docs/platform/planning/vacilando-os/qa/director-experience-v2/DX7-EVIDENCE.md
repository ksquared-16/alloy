---
owner: platform
status: proposed
last_reviewed: 2026-08-05
---

# Director Experience V2 — DX-7 Director Portfolio evidence

**Branch:** `agent/cursor/6-director-experience-dx7-portfolio`  
**Slice:** Director Portfolio (executive multi-mission home)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) (roadmap DX-7)  
**Base:** DX-6 tip `64731871f`

## Constraint honored

- Mission lifecycle / workers / confidence / evidence / journey / continuation / collaboration / certification engines **unchanged**
- No initiatives, mission hierarchy, remote review, notifications, or worker-dock redesign
- Aggregation lives in `director-portfolio.mjs` — not inside `mission-control.js` business logic
- Mission detail pages remain the single-mission executive surface

## What shipped

1. **Adapter** — `scripts/local-dev/lib/vacilando/presentation/director-portfolio.mjs`
   - Posture → portfolio group (Needs Attention, Blocked, Ready for Implementation, Ready for Promotion, Waiting, In Progress, Recently Finished)
   - Priority score for 15-minute focus
   - Rich portfolio cards: phase, outcome, recommendation, blocker, owner, confidence, next action
2. **Home wiring** — `missionsHomeVm` attaches `portfolio`; landing UI is Director Portfolio
3. **UI** — counts strip, 15-minute focus list, grouped sections, portfolio cards; Workers linked but demoted
4. **Roadmap** — DX-7 = Portfolio; Remote Review shifts to DX-8

## Automated tests

```bash
node scripts/local-dev/tests/director-portfolio-dx7.test.mjs
node scripts/local-dev/tests/operator-views.test.mjs
node scripts/local-dev/tests/mission-archive.test.mjs
```

All passed (2026-08-05).

## Browser certification

Control plane: **`:3026`**

Seeded mixed fixtures:

| Fixture | Expected group |
|---|---|
| DX7 Fixture — Needs Director | Needs Your Attention |
| DX7 Fixture — Blocked Trust | Blocked |
| DX7 Fixture — Waiting Comms | Waiting |
| DX7 Fixture — Ready Implementation | Ready for Implementation |
| DX7 Fixture — Ready Promotion | Ready for Promotion |
| Recently finished (live archive) | Recently Finished |

Checks (`screenshots/dx7-browser-checks.json`):

- Portfolio title, counts, focus, 6 groups, 11 cards
- Navigation into mission detail still renders
- API `kind: director_portfolio` with mixed counts

Screenshots:

- `dx7-portfolio-home.png`
- `dx7-portfolio-counts.png`
- `dx7-portfolio-group.png`
- `dx7-portfolio-card.png`
- `dx7-mission-detail-unchanged.png`

## Known limitations

- Home latency still scales with mission count (one posture pass per mission); workers summary demoted to avoid a second heavy walk
- Confidence enrichment is limited to the focus strip (`rich: true`) for performance
- “Waiting” vs “Needs Attention” follows posture `needsYou` (paused missions that need the Director land in Needs Attention)
- Fixture seeding for QA left DX7-titled missions in the local Vacilando runtime
- Sprint finish on slot 6 remains fragile — work continued on a new branch in the same managed worktree

## Recommended next roadmap evolution

**DX-8 — Remote Review** (annotated comparison / remote-ready polish), then **DX-9 Mission List / Needs You convergence** with Portfolio (collapse duplicate inbox surfaces), then **DX-10 Worker Operations** behind the executive home.
