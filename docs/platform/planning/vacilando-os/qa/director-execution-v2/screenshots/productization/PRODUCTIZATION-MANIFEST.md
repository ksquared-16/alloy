# Mission Control productization — screenshot manifest

Mission: **Access & Identity V2** (`msn_b1c2aa7b4e0cc69da4`)
Decision: `dec_1d8042cdbe05bc`
Generated: 2026-07-30T17:02:39.464Z

## Two-minute QA answers

| Question | Answer from live view models |
|----------|------------------------------|
| What is the mission doing? | Answer decision: How should invitation expiry work? |
| Where is it? | Phase 2 of 3 · Canonical Authority Model |
| What needs the user? | How should invitation expiry work? |
| What is Director recommending? | Keep 7-day expiry |
| What happens after the decision? | Director will record your choice, refresh affected worker context if needed, and resume paused work. |
| Which worker is unhealthy / Director action? | Canonical Authority Model — Unresponsive — Director is intervening; Director recovery: checkpoint and pause |

## Screenshots

| File | Route | Demonstrates |
|------|-------|----------------|
| `01-missions-home.png` | `/#/missions` | Missions home with operator cards |
| `02-mission-overview.png` | `/#/missions/msn_b1c2aa7b4e0cc69da4` | Mission Overview — Director five questions, no raw JSON |
| `03-decision-desktop.png` | `/#/decisions/dec_1d8042cdbe05bc` | Decision Detail desktop |
| `04-decision-mobile.png` | `/#/decisions/dec_1d8042cdbe05bc` | Decision Detail mobile |
| `05-timeline.png` | `/#/timeline/msn_b1c2aa7b4e0cc69da4` | Operator-language timeline |
| `06-workers.png` | `/#/workers` | Workers grouped by mission |
| `07-worker-detail.png` | `/#/workers/claude-6b` | Worker Detail with technical details collapsed |
| `08-evidence.png` | `/#/evidence/msn_b1c2aa7b4e0cc69da4` | Evidence gallery — proves/AC, not paths first |
| `09-kickoff-intake.png` | `/#/kickoff` | Mission Brief empty intake |
| `10-kickoff-readiness.png` | `/#/kickoff/msn_b1c2aa7b4e0cc69da4` | Kickoff readiness/approval |
| `11-needs-you.png` | `/#/needs-you` | Needs You global rollup |
