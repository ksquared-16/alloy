---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando — Control Room Reset (capability matrix + build)

**Role:** Lead Engineer · **Slot 6** · branch `agent/claude/6-vacilando-os-product-def`
Flip Vacilando from a reporting dashboard into a control room whose primary object is the **active
worker session and its assigned work**. Runtime/command safety foundation unchanged.

## Required recon — capability matrix

Legend: **✅ governed** (safe toolkit command, wired) · **🟡 partial** (supported portion wired, gap
documented) · **⛔ unavailable** (no governed capability; shown honestly, never simulated).

| Capability | Existing command / API | Authoritative source | Safety posture | Missing gap | Decision this sprint |
|---|---|---|---|---|---|
| **Start worker** | `alloy-sprint-start <name> --provider claude\|cursor --slot auto\|N --objective` | toolkit | governed; fail-closed if slot occupied/unhealthy; opens a GUI app | heavy (npm install + opens editor) | ✅ `sprint.start` command w/ preview. Live it refuses — all 6 slots occupied |
| **Stop worker** | none distinct — `alloy-worker-pause` is the stop | toolkit | governed, reversible | no hard "kill" beyond pause | 🟡 "Stop" maps to Pause (registry-owned provider/server/browser); labelled |
| **Pause worker** | `alloy-worker-pause <slot>` | toolkit | governed, reversible | — | ✅ already `worker.pause` |
| **Resume worker** | `alloy-worker-resume <slot>` | toolkit | governed | — | ✅ already `worker.resume` |
| **Send msg → active Claude session** | none (only `pbcopy` + **manual paste**) | — | — | **no programmatic injection into a live interactive session** | 🟡 `director.route`: compose → preview → confirm → **record + copy to clipboard**; operator pastes. Gap documented |
| **Send msg → active Cursor session** | none (only `pbcopy` + manual paste) | — | — | same | 🟡 same path |
| **Read worker output** | evidence dir, `git log`, worker reports | fs / git | read-only | structured reports rarely present | ✅ Outputs from evidence + commits + changed-files |
| **Read screenshots / artifacts** | `evidence/<wt>/*` (PNG/JSON) | fs | read-only | — | ✅ served + **rendered** via `/api/evidence` (path-validated) |
| **Create worktree** | `alloy-worktree-create` / `alloy-sprint-start` | toolkit | governed | — | ✅ via `sprint.start` |
| **Close session (keep worktree)** | `alloy-sprint-finish <slot> [--acknowledge-uncommitted]` | toolkit | governed; **never** deletes/pushes/merges | needs clean state or --ack | ✅ `sprint.finish` command (End Work) |
| **Delete worktree** | `alloy-worktree-remove <name>` | toolkit | destructive; guarded (refuses dirty/unmerged, never `--force`) but **requires interactive TTY** | cannot run headless from the loopback server | ⛔ unsupported from Vacilando — must run in a terminal. Shown with reason + the exact command |
| **Read CPU / mem / process** | `ps` / `lsof` / `du` + dev-server PID (`dev-status`) | OS | read-only | **provider (editor) app PID is not tracked** per slot | 🟡 real resources for **running servers**; provider app process = "not confidently identified" (never faked) |
| **Read provider usage / cost** | none on staging | — | — | needs headless `claude -p` usage JSON (the stranded Director capability) | ⛔ unavailable — marked, integration documented |

**Load-bearing consequences**
1. **Director routing is prepare-and-hand-off, not auto-send.** No integration can inject text into a
   running Claude/Cursor window. Vacilando composes, previews, requires confirmation, records the
   interaction, and puts the instruction on the clipboard. The operator pastes. This still removes the
   "retype context across tools" tax. *Missing integration: a provider session message API (or headless
   `claude -p --resume <session>` execution, which the stranded Director had and is not on staging).*
2. **Resources are honest.** CPU/mem/elapsed/port come from the dev-server PID via `ps`/`lsof`; disk via
   `du`. Slots with no running server show "no active process identified" rather than invented usage.
3. **Delete-worktree stays out of the loopback plane** (interactive TTY only) — surfaced with the exact
   terminal command, never a fake success.

## Build & results

**Shell** → Command Center · Work History · Settings (Sprints/Workers/Repository/Approvals/Activity
removed as separate pages; recomposed into the operating model). Command Center = **worker board**
(left, 6 slots) · **selected-worker operating surface** (center) · **Needs You** rail (right).

**New backend** (all read-only except governed commands):
- `lib/vacilando/resources.mjs` + `/api/resources` — per-worker CPU/mem/elapsed/port from the dev-server
  PID (`ps`), disk from bounded `du`, overall from node `os`; slots without a server show "no active
  process"; provider-app PID + provider cost marked unavailable.
- `lib/vacilando/outputs.mjs` + `/api/outputs` + `/api/evidence` — evidence (screenshots **rendered**
  inline), commits, changed-file summary; path-validated image serving.
- `lib/vacilando/commands/director.mjs` + `director.route` command + `/api/director` — compose → preview
  → confirm → **record + clipboard**; never claims injection.
- `sprint.start` (Start Work) and `sprint.finish` (End Work — close & keep worktree) commands.

**Live QA (against real toolkit state):**

| Check | Result |
|---|---|
| Shell reshaped to 3 items, all working | ✅ Command Center / Work History / Settings |
| Worker board — 6 slots, real resources, controls | ✅ real cpu/mem/elapsed/port; honest "no active process" |
| Selected-worker operating surface (Overview/Outputs/Director) | ✅ authoritative state, worktree/git, resources |
| Outputs render screenshots inline | ✅ 3 evidence images (1440×1100) served + rendered for slot 4 |
| Outputs list commits + changed-files | ✅ with `git log` / `git status` provenance |
| Director routing (compose→preview→confirm→record+clipboard) | ✅ executed for slot 6; logged `copied ✓`; honest "cannot inject" |
| Start Work | ✅ form + preview; **refuses** (all six slots occupied) |
| End Work menu (pause / close / delete-unsupported) | ✅ built; delete shown as terminal-only |
| Resource visibility + machine-pressure warning | ✅ 99% mem → high-pressure warning in Needs You |
| Needs You rail actionable | ✅ resource warning + per-worker attention deep-links |
| Settings capability matrix (wired vs honest gaps) | ✅ incl. message-injection + provider-cost gaps |
| SPA has no orchestration logic | ✅ cert check 11; app.js clean of orchestration tokens |

Regression suites: **cert 15/15 · vacilando unit 26 · alloy-ro 57**. Identity (cream/forest/terracotta)
preserved. Loopback-only; nothing pushed/merged/promoted/deleted.

Screenshots captured live in the verification session: control-room Command Center; worker board +
operating surface; Outputs with rendered screenshots; Director conversation + confirm; Start Work form;
Settings capability matrix; Work History. (In-session browser; not persisted as repo files.)
