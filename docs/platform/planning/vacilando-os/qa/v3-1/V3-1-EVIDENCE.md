# V3-1 Evidence — Workspace Runtime

**Sprint:** Vacilando V3-1 Workspace Runtime  
**Date:** 2026-08-05  
**Workspace:** Identity Platform (`ws_identity` → `msn_f74ed02c126c88d7ff`)  
**Cert host:** `http://127.0.0.1:3026` (worktree server)  
**Branch:** `agent/cursor/6-vacilando-v3-1-workspace-runtime`

## What was proven

One vertical slice: open a workspace, read projected conversation, see derived Current State, reply in natural language — without using Mission Control for that workspace.

Architecture laws held:

1. Conversation is a **view** over mission timeline (provenance kept; no second persistence model).
2. Current State is **derived** (`editable: false`).
3. Composer is natural language only (timeline `operator_message`).

## Browser certification

Capture script: `scripts/local-dev/apps/vacilando/capture-v3-1-workspace.mjs`

Result: **ok** — see `qa/v3-1/screenshots/v3-1-browser-checks.json`

| Check | Result |
| --- | --- |
| Opening workspace (`#/workspaces/ws_identity`) | pass |
| Conversation messages (projected timeline) | pass |
| Composer | pass |
| Current State (derived) | pass |
| Context rail (worker / branch / evidence / actions) | pass |
| Scrolling | pass |
| Reply (UI → timeline → message) | pass |
| Event projection + provenance | pass |

### Screenshots

| Artifact | File |
| --- | --- |
| Opening workspace | `screenshots/v3-1-opening-workspace.png` |
| Conversation | `screenshots/v3-1-conversation.png` |
| Composer | `screenshots/v3-1-composer.png` |
| Current State + Context | `screenshots/v3-1-current-state-context.png` |
| Workspace nav | `screenshots/v3-1-workspace-nav.png` |
| Scroll top / bottom | `screenshots/v3-1-scroll-top.png`, `v3-1-scroll-bottom.png` |
| Reply | `screenshots/v3-1-reply.png` |

## Tests

```bash
node scripts/local-dev/tests/workspace-runtime-v3-1.test.mjs
# → workspace-runtime-v3-1.test.mjs: ok
```

## Known limitations

- **One workspace only** (Identity Platform). Portfolio / Mission Control unchanged for other work.
- Conversation shows last ~100 projected events (not full 1947-line history dump).
- Workspace runtime GET can take ~20–40s on the live Identity timeline (heavy derivation); reply race guarded with fetch seq.
- PR field on context rail is placeholder (`—`) in this slice.
- Mac Vacilando.app on `:3021` may still serve an older checkout until retargeted; cert used worktree `:3026`.
- Worker health may report `conflict` while slot branch differs from mission history — informational only.

## Recommendation for V3-2

Do **not** migrate more workspaces yet until Kelly prefers this surface for Identity day-to-day.

If validated, V3-2 should be **Context Compression + faster runtime projection** (deterministic summary of older events so conversation stays readable and cold-open is snappy) — still no second persistence layer, still no dashboard rewrite.
