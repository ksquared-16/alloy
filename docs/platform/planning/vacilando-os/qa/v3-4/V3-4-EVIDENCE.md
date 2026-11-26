---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

# V3-4 Evidence — Conversational Director + Shell Simplification

**Sprint:** Vacilando V3-4  
**Date:** 2026-08-06  
**Base:** V3-3 `9286e478f`  
**Mission:** Identity Platform (`msn_f74ed02c126c88d7ff`)  
**Cert host:** `http://127.0.0.1:3026`  
**Branch:** `agent/cursor/6-vacilando-v3-4-conversational-director`

## Primary acceptance

Open Identity → type recap question → Kelly message + Director reply in same thread → refresh keeps both → follow-up recall works.

**Result: PASS** (API + browser)

Sample Director (live Identity): grounded in posture “Waiting on you”, worker cursor/slot 6, recommendation, open guidance.

## Root cause of Opening…

Client boot path dual-kicked `fetchWorkspaceShell` (`revalidate` + direct) on every paint while `!shellReady`, bumping `_wsShellSeq` and **discarding** completed shell responses. Expensive shell VM (since-last-visit timeline ≤5000 + double `operationalRailVm`) amplified contention. Error UI was unreachable behind the Opening gate.

### Fix

1. Coalesce shell fetch with `_inflight` (no duplicate seq bumps).
2. Single kick while booting; revalidate only after shell ready.
3. Surface Retry in boot frame on error.
4. Slim shell: defer `sinceLastVisit`; reuse one `operationalRailVm` for context.

Measured: shell API ~0.6–1.1s; open-to-shell UI ~1.0–2.3s.

## Director response path

Not a new LLM runtime. Deterministic mission conversational Director:

`postWorkspaceReply` → timeline `operator_message` → `executeMissionDirectorTurn` → director-messages + timeline `director_response` → projected in thread.

Context: `deriveMissionPosture`, `buildDirectorSummary`, open collaboration, recent timeline, worker identity, evidence tail.

Intent: `classifyMissionComposerIntent` → question | guidance | action (action only proposes existing actions; does not silent-launch).

## Context compounds

Guidance mode → `createCollaborationEntry` (`implementation_guidance`).  
`buildMissionContextPackage` includes `operatorGuidance`.  
`serializeAssignmentPrompt` injects “Open operator guidance” into worker handoff.

## Shell simplification

- Green rail = mission list (`#mission-rail`) with Needs You badges.
- Beige duplicate mission column removed (`ws-shell-v34` is conversation + ops).
- Settings moved to bottom Admin/account control (`.ruser`).
- Portfolio / Needs You / Workers / Improvements under **More** (capabilities preserved).

## Tests

```bash
node scripts/local-dev/tests/mission-conversation-v3-4.test.mjs
node scripts/local-dev/tests/workspace-runtime-v3-3.test.mjs
node scripts/local-dev/tests/workspace-runtime-v3-1.test.mjs
node scripts/local-dev/tests/workspace-runtime-v3-2.test.mjs
```

All **ok**.

## Browser certification

`capture-v3-4-conversational-director.mjs` → **ok**  
Screenshots: `docs/platform/planning/vacilando-os/qa/v3-4/screenshots/`

## Known limitations

1. Director replies are **deterministic** (Current State / summary grounded), not free-form LLM prose.
2. Action intents propose existing actions; they do not auto-dispatch workers.
3. Soft deliverable Approve still requires an open deliverable review (V3-3).
4. Needs You badges use open decisions + open deliverable review (not full Needs You scan).

## Recommendation

Do not start another V3 product slice until Kelly uses Identity conversation for a real work session. If Director quality feels thin, next investment is richer deterministic compose from continuation/executive cards — still no parallel chat runtime.
