---
owner: platform
status: proposed
last_reviewed: 2026-08-05
---

# Director Experience V2 — DX-5 Evidence Experience evidence

**Branch:** `agent/cursor/2-director-experience-dx5-evidence`  
**Slice:** Evidence Experience (presentation only)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) §8  
**Base:** `56587f9f5` (includes merged DX-1…DX-4)

## Constraint honored

- Evidence **storage schema and attach API** unchanged
- Certification / confidence / mission lifecycle / posture **unchanged**
- No AI captions; no invented sufficiency scores
- Classification and before/after pairing are **deterministic adapters**
- Raw paths / provenance remain under Technical details
- Optional path-validated file serve: `GET /api/v2/evidence/file?missionId=&evidenceId=` (only for existing `fileUri` under allowlisted roots)

## What shipped

1. **Executive evidence strip** (L1 after Mission Journey) — kinds, primary proof, sufficiency statements, gallery CTA  
2. **Evidence gallery** — grouped Product / Browser / Certification / Tests / Technical / Supporting / Unclassified  
3. **Screenshot-first cards** with preview when file resolves  
4. **Before/After pairs** only with explicit roles (`comparisonRole` / title markers) + shared group key — never filename-only  
5. **Fixture-only** labeling from environment / createdBy  
6. L1 order: Outcome → Summary → Decision → Confidence → Journey → **Evidence** → Depth  

## Automated tests

```bash
node scripts/local-dev/tests/evidence-experience-dx5.test.mjs
node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
node scripts/local-dev/tests/explained-confidence-dx2.test.mjs
node scripts/local-dev/tests/mission-journey-dx4.test.mjs
```

## Browser certification

Control plane: **wt2** on **`:3022`**.

Live mission: `msn_f74ed02c126c88d7ff` (technical + certification; **no screenshots**).

| Scenario | Source | Result |
|---|---|---|
| Screenshots + tests + certification | Fixture VM | Pass |
| Technical only, no screenshots | Live + fixture | Pass |
| Screenshots only | Fixture | Pass |
| Before / After pair | Fixture (`pairId` + roles) | Pass |
| Unclassified / incomplete metadata | Fixture (`legacy_blob`) | Pass |
| Fixture-only labeled | Fixture `environment: fixture` | Pass |
| Strip and gallery agree | Live API | Pass |
| Technical Depth raw confidence | Live Overview | Pass |
| Certification / deliverable review unchanged | Live W-4 certified surface | Pass |

Screenshots / artifacts:

- [`screenshots/dx5-overview-evidence-strip.png`](screenshots/dx5-overview-evidence-strip.png)
- [`screenshots/dx5-evidence-gallery.png`](screenshots/dx5-evidence-gallery.png)
- [`screenshots/dx5-browser-checks.json`](screenshots/dx5-browser-checks.json)
- [`screenshots/dx5-evidence-state-fixtures.json`](screenshots/dx5-evidence-state-fixtures.json)

## Known limitations

- Live Mission 2 has **no screenshot artifacts** — visual/product proof is fixture-certified.
- Before/after requires **explicit** role markers or `comparisonRole`/`pairId` — no silent filename pairing.
- Evidence gallery HTTP can be slow under concurrent control-plane load (local VM ~20ms; HTTP sometimes multi-second).
- Preview images require resolvable `fileUri` under allowlisted roots; missing files keep cards without thumbnails.
- No upload pipeline, annotation, or DX-6 remote-review chrome.

## Next slice

**DX-6 — Remote Review** (after this slice is certified and merged).
