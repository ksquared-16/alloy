---
owner: platform
status: proposed
last_reviewed: 2026-08-04
---

# Director Experience V2 — DX-4 Mission Journey evidence

**Branch:** `agent/cursor/2-director-experience-dx4-journey`  
**Slice:** Mission Journey (presentation only)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) §10  
**Base:** `origin/staging` @ `0aa49972a` (PR #332 / DX-2)

## Constraint honored

- Mission lifecycle / posture / certification / timeline storage **unchanged**
- No worker redesign, no confidence engine changes, no evidence gallery work
- Journey is a **deterministic presentation adapter** over brief phases, posture, reviews, and decisions
- Engineering timeline remains available behind **Show engineering activity**

## Automated tests

```bash
node scripts/local-dev/tests/mission-journey-dx4.test.mjs
node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
node scripts/local-dev/tests/explained-confidence-dx2.test.mjs
```

Covers kickoff → plan phases → current marker, L1 strip nesting, timeline page nesting, and completed-phase outcome / decision-produced fields.

## Browser certification

Control plane: **wt2** on **`:3022`** (desktop `:3021` left alone).

Live mission: `msn_f74ed02c126c88d7ff` — **You are here — Director decision** (awaiting Director Decision / promotion gate as Advance to implementation).

| Requested state | How certified | Result |
|---|---|---|
| Mission in Discovery | Fixture VM (`dx4-journey-state-fixtures.json`) | Pass — current on Discovery/Architecture after kickoff |
| Mission in Implementation | Fixture after Discovery complete | Pass — advances to Certification or next plan phase |
| Mission awaiting Certification | Fixture / live W-4 already certified | Pass (live shows Certification **complete**) |
| Mission awaiting Director Decision | Live Overview + Journey | Pass — YOU ARE HERE on Director decision |
| Mission awaiting Promotion | Live Advance to implementation upcoming | Pass (Vacilando “promotion” = advance-to-implementation gate) |
| Completed Mission | Not live on control plane | Deferred — adapter includes Complete stage when posture `completed` |

Verify:

| Check | Result |
|---|---|
| Current phase clearly visible | Pass — rail ● + YOU ARE HERE badge |
| Completed phases understandable | Pass — Outcome + Decision produced |
| Decision gates visible | Pass — Available gates on Director decision |
| Engineering history accessible but secondary | Pass — collapsed by default; expands to timeline events |

Screenshots / artifacts:

- [`screenshots/dx4-mission-journey-page.png`](screenshots/dx4-mission-journey-page.png)
- [`screenshots/dx4-overview-journey-strip.png`](screenshots/dx4-overview-journey-strip.png)
- [`screenshots/dx4-engineering-activity-expanded.png`](screenshots/dx4-engineering-activity-expanded.png)
- [`screenshots/dx4-browser-checks.json`](screenshots/dx4-browser-checks.json)
- [`screenshots/dx4-journey-state-fixtures.json`](screenshots/dx4-journey-state-fixtures.json)

## Known limitations

- Brief phase titles that duplicate the mission title read poorly on the rail (data quality, not journey logic).
- Timeline API for large missions can take ~9s; Journey tab may show “Loading journey…” briefly.
- Vacilando has no separate “Merge to staging” promotion noun — mapped to **Advance to implementation**.
- Completed-mission browser pixel not captured (no completed mission on this control plane).
- DX-5 Evidence Experience / DX-6 Remote Review / list-card residuals still open.

## Next slice

**DX-5 — Evidence Experience**
