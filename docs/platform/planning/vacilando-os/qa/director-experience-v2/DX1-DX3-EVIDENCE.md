---
owner: platform
status: proposed
last_reviewed: 2026-08-04
---

# Director Experience V2 — DX-1 + DX-3 evidence

**Branch:** `agent/cursor/2-director-experience-dx1-dx3`  
**Slice:** Executive Overview L1 shell + decision cards  
**Spec:** [`../../DIRECTOR-EXPERIENCE-V2.md`](../../DIRECTOR-EXPERIENCE-V2.md)

## Spec baseline (docs-only)

| Commit | Note |
|---|---|
| `6cf1a9179` | Spec + QA index + DX-EXPERIENCE-V2 + MC-MANAGED-WORKER-DOCK backlog |
| `6f2eeadf7` | Frontmatter vocabulary fix for `docs:lint:ci` |

Remote tip at docs baseline push: `6f2eeadf7` (then implementation commit follows).

## Automated tests

```bash
node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
node scripts/local-dev/tests/operator-views.test.mjs
node scripts/local-dev/tests/mission-posture.test.mjs
node scripts/local-dev/tests/mission-dashboard-v1.test.mjs
```

## Browser certification (port 3022 — wt2 control plane)

Live mission: `msn_f74ed02c126c88d7ff` (operator_review / additional discovery)

| Check | Result |
|---|---|
| Mission Outcome visible | Pass |
| Executive summary visible | Pass |
| Continue discovery / Park / Close cards | Pass |
| Primary CTA is Continue discovery (not Review outcome) | Pass (API + UI) |
| Technical depth holds Local app / usage / confidence math | Pass |
| Local Alloy app not above the fold | Pass |
| Single confidence glance on L1 (mission) | Pass |

Screenshots:

- [`screenshots/dx1-operator-review-l1.png`](screenshots/dx1-operator-review-l1.png)
- [`screenshots/dx1-technical-depth-open.png`](screenshots/dx1-technical-depth-open.png)
- [`screenshots/dx1-browser-checks.json`](screenshots/dx1-browser-checks.json)

## Known limitations

- Full explained-confidence (DX-2) and evidence gallery (DX-5) not in this slice.
- Advance-to-implementation UI not browser-certified live (no current advance-ok fixture); covered by unit decision-card tests.
- Desktop Vacilando on `:3021` may still serve an older worktree — verify against wt2 (`:3022` or restarted server).
- Mission list cards may still show posture `Review outcome` until a later list-card pass.

## Not in this slice

Mission Control Managed Worker Dock — backlog `MC-MANAGED-WORKER-DOCK`.
