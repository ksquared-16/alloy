---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando Project OS — V1 live QA

Served **http://127.0.0.1:3020** (loopback). Screenshots captured by driving the live app
(`scripts/local-dev/apps/vacilando/capture-qa-v1.mjs`, Node 18+). Build: `app.js?v=<contenthash>`,
served commit = worktree HEAD. Full write-up: [`../../PROJECT-OS-V1.md`](../../PROJECT-OS-V1.md).

## V1 acceptance gate — routes + interactions

| # | Gate | Route / interaction | Result |
|---|---|---|---|
| 1 | Dashboard is the default center | `#/command` | ✅ Team Dashboard (01) |
| 2 | Worker selection replaces dashboard in place | click a dock worker → `#/command/worker/N` | ✅ surface replaces dashboard (02) |
| 3 | Closing worker returns to dashboard | `← Dashboard` | ✅ returns to `#/command` |
| 4 | Worker controls functional | dock + surface | ✅ Pause/Resume/Diagnose/End (proven prior) |
| 5 | Local app links work | dock/surface `Open App` | ✅ `http://127.0.0.1:<port>` new tab when server running |
| 6 | Machine health accurate + explained | dashboard | ✅ vm_stat + kernel pressure; components + swap (01/04) |
| 7 | Provider usage/cost visible | dashboard | ✅ Cursor authed, tokens; cost authoritative-or-unavailable (01) |
| 8 | Scheduler recommendations visible | dashboard | ✅ deterministic recs, auto-scheduling off (01) |
| 9 | Start Work supports start or queue | `+ Start Work` → preview | ✅ preview (08); refuses/queues when full |
| 10 | Director real round-trip | worker → Director → Ask | ✅ `cursor: PONG` + tokens (03) |
| 11 | Outputs + screenshots render | worker → Outputs | ✅ evidence images inline (05) |
| 12 | Review approved or revised | Needs You → Review → Approve/Request | ✅ `review.resolve`, audited (dialog in ../current/09) |
| 13 | Repository lifecycle governed | worker → Repository | ✅ PR state + push/PR/merge/delete governed (06/07) |
| 14 | End Work closes/frees a slot | worker → End | ✅ preview real consequences (09); executes on fixture |
| 15 | Work History records lifecycle | `#/history` | ✅ execution audit (12); project/mission rollup = V1.1 |
| 16 | Policies reflect current rules | `#/policies` | ✅ 16 groups incl. hosts/scheduler/cost (11) |
| 17 | Reload/back/forward preserve context | reload `#/command/worker/N` | ✅ URL-driven |
| 18 | No simulated success | — | ✅ real round-trip; repo mutations previewed, not executed; Claude gap shown honestly |
| 19 | No routine Terminal for the journey | — | ✅ operate from the app; full push/PR/merge fixture journey = V1.1 |
| 20 | Localhost only | — | ✅ 127.0.0.1 bind |

## Screenshots
01-dashboard · 02-worker-selected · 03-director · 04-resources · 05-outputs-screenshot ·
06-repository-pr · 07-promotion-preview · 08-start-work-preview · 09-end-work-preview · 11-policies ·
12-work-history. (Review dialog: `../current/09-review-approval.png`.)

## Before/after resources (macOS)
- **Before:** `os.freemem()` → memory 99% used, "high" pressure (semantics bug).
- **After:** `vm_stat` (available = free+inactive+speculative+purgeable) → ~75% used / ~6G available, plus
  `kern.memorystatus_vm_pressure_level` authoritative pressure, compressed + swap surfaced. No new
  hardware indicated; Vacilando is not a top consumer.

## Remaining gaps
Durable project/mission records; full Start Work wizard + queue persistence; a disposable fixture repo to
run the full push/PR/merge/delete journey; Kelly-minutes elapsed-time; Claude OAuth re-auth; Cursor cost table.
