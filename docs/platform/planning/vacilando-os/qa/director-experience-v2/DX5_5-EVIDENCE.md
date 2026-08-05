---
owner: platform
status: proposed
last_reviewed: 2026-08-05
---

# Director Experience V2 — DX-5.5 Mission Continuation evidence

**Branch:** `agent/cursor/6-director-experience-dx5-5-continuation`  
**Slice:** Mission Continuation & Recommended Next Actions (presentation only)  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md) §9 + approved roadmap insertion  
**Base:** DX-5 tip `4ce2b6fa1` (Evidence Experience; pending promotion)

## Constraint honored

- Mission lifecycle / posture / advance / certification **unchanged**
- No new lifecycle states
- No recommendation engine — deterministic presentation mappings only
- No threaded feedback persistence (surface prepared only)
- Confidence / Evidence / Journey / Timeline untouched except L1 **order**
- Mapping lives in `mission-continuation.mjs`, not in `mission-control.js` logic

## What shipped

1. **Recommended Next Action** section replaces terminal-feeling “Your decision” strip  
2. Deterministic mappings: discovery complete → Begin Implementation; blocked → Resolve Blockers; parked → Resume Mission; certification ready → Accept and close; completed → Begin Next Planned Mission; incomplete discovery review → Request More Discovery  
3. **Alternative decisions:** Request More Discovery, Park Mission, Close Without Continuing, Review Findings, Provide Feedback  
4. **Review Findings** — presentation-only; scrolls to executive summary / findings  
5. **Provide Feedback** — first-class alternative; opens prepared panel (not persisted)  
6. **Close Without Continuing** — abandonment copy + confirm dialog  
7. L1 IA: Outcome → Summary → Confidence → Journey → Evidence → **Recommended Next Action** → Alternatives → Technical Depth  

## Automated tests

```bash
node scripts/local-dev/tests/mission-continuation-dx5-5.test.mjs
node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
node scripts/local-dev/tests/explained-confidence-dx2.test.mjs
node scripts/local-dev/tests/mission-journey-dx4.test.mjs
node scripts/local-dev/tests/evidence-experience-dx5.test.mjs
```

All passed (2026-08-05).

## Browser certification

Control plane: **wt6** on **`:3026`**.

| Case | Mode | Recommended | Notes |
|---|---|---|---|
| Discovery complete (`advance.ok`) | Fixture | Begin Implementation | `dx5_5-fixture-discovery_complete.png` |
| Blocked | Fixture | Resolve Blockers | `dx5_5-fixture-blocked.png` |
| Parked | Fixture | Resume Mission | `dx5_5-fixture-parked.png` |
| Certification ready | Fixture | Accept and close | `dx5_5-fixture-certification_complete.png` |
| Live Mission 2 (`msn_f74ed02c126c88d7ff`) | Live | Request More Discovery | advance not ready; alternatives include Feedback / Findings / Close Without Continuing |

Artifacts under [`screenshots/`](screenshots/):

- `dx5_5-live-operator-review.png`
- `dx5_5-live-feedback-panel.png`
- `dx5_5-live-l1-top.png`
- `dx5_5-fixture-*.png`
- `dx5_5-browser-checks.json`
- `dx5_5-continuation-state-fixtures.json`

Capture helper: `scripts/local-dev/apps/vacilando/capture-dx5-5-continuation.mjs`

### Checks (from browser-checks.json)

- discoveryCompleteRecommendsBeginImplementation: true  
- blockedRecommendsResolve: true  
- parkedRecommendsResume: true  
- closeRenamed: true  
- feedbackDistinct: true  
- reviewFindingsPresent: true  
- liveHasRecommended / Feedback / Findings: true  

## Known limitations

- Live Mission 2 is **not** advance-ready, so Recommended is Request More Discovery (honest mapping), not Begin Implementation — fixture covers the advance-ready case.  
- Provide Feedback does **not** persist or reopen workers (DX-6 / later).  
- “Promote” is not a mission continuation action (toolkit promotion remains out of band).  
- Blocked / parked synthetics currently expose the single recommended card without soft alternatives.  

## Recommended next slice

**DX-6 — Remote Review** (unless a larger executive UX gap appears during promotion of DX-5 / DX-5.5).
