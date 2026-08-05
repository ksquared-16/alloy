# V3-3 Evidence — Mission Conversation Runtime

**Sprint:** Vacilando V3-3  
**Date:** 2026-08-05  
**Base:** V3-2 (fast resume + composer pin)  
**Mission:** Identity Platform (`msn_f74ed02c126c88d7ff`)  
**Cert host:** `http://127.0.0.1:3026`  
**Branch:** `agent/cursor/6-vacilando-v3-3-mission-conversation`

## Goal

Kelly can manage a mission from **one conversation page**. The thread is the application. No new dashboard. Portfolio and Command Center left alone.

## What changed (composition only)

1. **Left rail → Missions** — renamed from Workspaces; rows show name + optional needs/provider/slot/phase; open = conversation.
2. **Center → operational thread** — ChatGPT-like; Review Outcome expands **inline** (no Mission Dashboard navigation).
3. **Artifacts on messages** — chips open an in-page modal (iframe), not another route.
4. **Right rail → Operations** — compressed Current State + Runtime / Server / PR / Worker actions (only valid Pause *or* Resume).
5. **Server / worker actions** — Start / Stop / Restart / Open Local App; Pause / Resume / Diagnose / Finish / Open PR; stay on conversation after success.
6. **Soft inline review** — when no open deliverable review exists, posture + evidence still expand inline so Review Outcome never leaves the page.

## Browser certification

Capture: `scripts/local-dev/apps/vacilando/capture-v3-3-mission-conversation.mjs` → **ok**

| Scenario | Result |
| --- | --- |
| Identity conversation open | pass |
| Left rail labeled Missions (not Workspaces) | pass |
| Compressed Current State | pass |
| Operational right rail | pass |
| Review Outcome → inline expand | pass |
| Give Feedback dialog (no hash nav) | pass |
| Artifact chip → modal (no hash nav) | pass |
| Stayed on `#/workspaces/…` | pass |
| `review_outcome` nav action removed from messages | pass |
| `inline_review_expand` present | pass |

Screenshots: `docs/platform/planning/vacilando-os/qa/v3-3/screenshots/`

- `v3-3-identity-conversation.png`
- `v3-3-inline-review.png`
- `v3-3-artifact-modal.png`
- `v3-3-ops-rail.png`
- `v3-3-browser-checks.json`

## Tests

```bash
node scripts/local-dev/tests/workspace-runtime-v3-3.test.mjs
node scripts/local-dev/tests/workspace-runtime-v3-1.test.mjs
node scripts/local-dev/tests/workspace-runtime-v3-2.test.mjs
```

All **ok**.

## Known limitations

1. Soft inline review (no open `deliverable_review`) exposes Feedback / Continue Discovery / screenshots — not drev Approve/Rework until a formal deliverable review is open.
2. Left-rail `needsYou` badges are not live-scanned via `listNeedsYou` (too expensive on shell open); Portfolio remains the attention surface.
3. Worker Pause vs Resume uses assignment pause signals; toolkit-level pause without assignment pause may still show Pause.
4. Live destructive worker/server commands were not exercised end-to-end in cert (UI affordances + command wiring verified; avoid pausing this sprint mid-delivery).

## Recommendation for V3-4

Deepen **inline evidence packets** (PR diff summary, certification checklist, browser proof gallery) as first-class message blocks — still no new pages — and wire Needs You badge counts into the cheap mission list without reintroducing Portfolio scans on every shell open.
