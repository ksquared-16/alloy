---
owner: platform
status: proposed
last_reviewed: 2026-08-04
---

# Director Experience V2 — DX-2 Explained Confidence evidence

**Branch:** `agent/cursor/2-director-experience-dx2-confidence`  
**Slice:** Explained Confidence (presentation only)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) §7  
**Base:** `origin/staging` @ `160e75d92` (PR #331)

## Constraint honored

- `mission-confidence.mjs` weights and scoring **unchanged**
- No second confidence system
- No AI-generated explanations
- L1 shows **one** primary confidence (mission or certification)
- Technical Depth still exposes raw `%`, why list, and factor weights

## Automated tests

```bash
node scripts/local-dev/tests/explained-confidence-dx2.test.mjs
node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
node scripts/local-dev/tests/operator-views.test.mjs
```

Covers high / medium / low factor grouping, certification-primary demotion of mission %, dashboard nesting, and unchanged `CONFIDENCE_WEIGHTS`.

## Browser certification

Control plane: **wt2** on **`:3022`** (avoid desktop `:3021` / wt6).

Live mission: `msn_f74ed02c126c88d7ff` — Mission confidence **53%** (developing) with supporting + reducing factors, remaining uncertainty, and increase-confidence steps.

| Check | Result |
|---|---|
| High confidence explanation | Pass (fixture VM — `dx2-confidence-band-fixtures.json`) |
| Medium confidence | Pass (live 53% + fixtures) |
| Low confidence | Pass (fixture VM) |
| Unresolved / blocking uncertainty | Pass (live reducing factors + low fixture `blocking: true`) |
| Technical Depth raw calculation | Pass |
| No duplicate L1 mission vs cert peer % | Pass |
| Recommendation agrees with band / decision | Pass |

Screenshots / artifacts:

- [`screenshots/dx2-explained-confidence-l1.png`](screenshots/dx2-explained-confidence-l1.png)
- [`screenshots/dx2-confidence-panel.png`](screenshots/dx2-confidence-panel.png)
- [`screenshots/dx2-technical-depth-confidence.png`](screenshots/dx2-technical-depth-confidence.png)
- [`screenshots/dx2-browser-checks.json`](screenshots/dx2-browser-checks.json)
- [`screenshots/dx2-confidence-band-fixtures.json`](screenshots/dx2-confidence-band-fixtures.json)

## Known limitations

- High/low band browser pixels use deterministic fixture VMs (no separate live high/low mission in control plane). Medium + uncertainty certified live.
- Deliverable certification briefing may still show certification % inside DREV (same primary kind) — mission % remains demoted to Technical depth / secondary note.
- Mission list “Review outcome” residual unchanged (`MC-MISSION-LIST-PRIMARY-CTA`).

## Next slice

**DX-4 — Story timeline** (phase rail + gates; engineering history collapse), per `DIRECTOR-EXPERIENCE-V2.md` roadmap (after DX-2).
