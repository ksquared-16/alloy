---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

# V3-2 Evidence — Fast Resume + Context Compression

**Sprint:** Vacilando V3-2  
**Date:** 2026-08-05  
**Base:** V3-1 `2a5f15ce1`  
**Workspace:** Identity Platform (`ws_identity`)  
**Cert host:** `http://127.0.0.1:3026`  
**Branch:** `agent/cursor/6-vacilando-v3-2-fast-resume`

## Root cause (measured before changes)

Live Identity open was **not** dominated by reading ~1950 timeline lines (that is ~15–25ms).

Measured V3-1 open under concurrent control-plane load:

| Milestone | Before (ms) |
| --- | ---: |
| Shell DOM frame | ~198 |
| First `workspace-runtime` HTTP response | ~914 |
| Messages actually painted | **~14 378** |
| Full initial ready | **~18 625** |

**Cause:** duplicate `workspace-runtime` fetches + stale-seq discard of the first good response, while the **single-threaded** Vacilando server was busy with Missions / Needs You / legacy `/api/state` / director conversations. The UI blocked the whole workspace on that contended full payload.

## What changed

1. **Fast shell** — `#/workspaces/ws_identity` paints an immediate frame; Current State + Since-last-visit load via `/api/v2/views/workspace-shell` without waiting for the full thread.
2. **Progressive messages** — `/api/v2/views/workspace-messages` first page (40) + **Load earlier** pagination.
3. **Deterministic Context Compression** — “Since your last visit” from timeline + Current State (no LLM).
4. **Last-seen marker** — `vacilando/workspace-last-seen/` (operator × workspace); update is fire-and-forget.
5. **Contention relief** — defer Missions / Needs You / board poll / notify on workspace route; skip revision hard-reload until messages ready; drop local port probe from open-path context rail.

## Performance after

| Milestone | Before (ms) | After first open (ms) | After return visit (ms) |
| --- | ---: | ---: | ---: |
| Shell visible | ~198 (loading only) | **302** (usable frame) | **28** |
| Current State visible | ~18 625 (with full payload) | **3 175** | **43** |
| First messages visible | **14 378** | **3 210** | **73** |
| Shell API (standalone) | n/a (bundled) | ~0.4–2.8s | warm ~sub-second |
| Messages API (40) | n/a | ~0.2–3.3s | ~0.2s |

Source: `qa/v3-2/screenshots/v3-2-browser-checks.json`

Kelly can read Current State + “Since your last visit” in **under 15 seconds** on cold open (measured ~3.2s), and near-instantly on return.

## Browser certification

Capture: `scripts/local-dev/apps/vacilando/capture-v3-2-fast-resume.mjs` → **ok**

| Scenario | Result |
| --- | --- |
| First / cold open with shell then messages | pass |
| Return visit with material changes | pass |
| Return visit with no material changes | pass |
| Load earlier history | pass |
| Reply after progressive load | pass |
| Current State + compression present | pass |
| Rapid reopen without blanking | pass |
| Provenance intact | pass |

### Screenshots

| Artifact | File |
| --- | --- |
| Opening shell | `screenshots/v3-2-opening-shell.png` |
| Since last visit | `screenshots/v3-2-since-last-visit.png` |
| Current State | `screenshots/v3-2-current-state.png` |
| Load earlier | `screenshots/v3-2-load-earlier.png` |
| Reply | `screenshots/v3-2-reply.png` |
| Return visit | `screenshots/v3-2-return-visit.png` |
| No material change | `screenshots/v3-2-no-change.png` |

## Tests

```bash
node scripts/local-dev/tests/workspace-runtime-v3-1.test.mjs  # ok
node scripts/local-dev/tests/workspace-runtime-v3-2.test.mjs  # ok
```

## Live vs fixture

| Area | Source |
| --- | --- |
| Open / return / reply / load-earlier / provenance | Live Identity workspace |
| Last-seen boundaries, compression no-change, pagination, stale cursor | Unit fixtures (`ALLOY_RUNTIME_ROOT` temp) |

## Known limitations

- First cold shell API can still take 1–3s (posture + continuation derivation) — far better than 14–18s blocked thread, but not sub-100ms.
- First-page still caps at 40 messages; older history requires Load earlier.
- PR field remains `—`.
- Last-seen is local control-plane state (not multi-device sync).
- Mission Control unchanged and still available.

## Day-to-day readiness

Yes — for Identity Platform, Kelly can open the workspace, see what changed and what to do, and reply without waiting on Mission Control. Return visits are effectively instant once warm.

## Recommendation for V3-3

**Inline artifacts in conversation** (evidence / PR / diff cards as message projections) — still no second persistence model, still one workspace until Identity feels native for weeks.
