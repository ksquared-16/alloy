---
owner: runtime
status: active
last_reviewed: 2026-08-16
supersedes: []
---

# Timing phase — execution card

**Everything below is pre-verified. Tonight is execution, not setup.**

The runtime correctness / interaction UX phase is certified and promoted; see
[`DEFECT-REGISTER.md`](./DEFECT-REGISTER.md). What remains is the quantitative work that a loaded
workstation cannot produce. Method discipline lives in
[`QUIET-HOST-RUNBOOK.md`](./QUIET-HOST-RUNBOOK.md) — this file is only the commands and the
already-settled parameters.

---

## 0. What is already done

| Runbook §0 requirement | State |
|---|---|
| Harness re-pinned off slot 3 | ✅ env-driven, defaults `PE3_SLOT=5` → port 3015, `auth/slot5` storage |
| `pe3ColdLoadRun.sh` port | ✅ derives from `PE3_SLOT`; no hardcoded 3013 |
| Work-unit slug resolves on this tenant | ✅ `PE3_SLUG` defaults to `all` — verified, renders 4 cards |
| Subject exists on this tenant | ✅ `d097e1a8-c3c0-4c51-a113-2275b009b9a9` (Kurzman Family) — must be passed, see below |
| Host gate exists **and exits non-zero** | ✅ `pe3HostGate.sh` returns 1 when unqualified, so `&&` chaining is safe |
| Production build output isolated | ✅ `ALLOY_PROD_CERT_DIST=1` → `.next-prodcert`, cannot clobber the running dev `.next` |
| DOM contracts still exist | ✅ `data-focus-panel-boundary`, `data-focus-panel-grid-cell`, `data-card-role`, `data-work-view-id`, `data-entity-id`, `data-queue-row-active` all confirmed live this sprint |

**The one thing only Kelly can do:** pause the other heavy sessions. The gate currently reports
**7 competing node processes**; it requires zero.

---

## 1. Qualify, then build

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion/web
bash scripts/pe3HostGate.sh
```

Do not continue unless it prints `HOST QUALIFIED`. The **control-request spread is the real gate** —
`uptime` looking calm while the spread is wide means the host is not quiet.

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion/web
ALLOY_PROD_CERT_DIST=1 ALLOY_ROUTE_TIMING=1 npx next build
```

`ALLOY_ROUTE_TIMING` must be set **for the build**, not just the server — middleware runs on Edge,
where `process.env` is inlined at build time. Exit **144** means SIGTERM under memory pressure: the
host lied, stop and re-qualify. It has failed this way twice, most recently at swap 10.8G/12.3G.

---

## 2. Baseline

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt5-runtime-performance-ux-completion/web
export ALLOY_PROD_CERT_DIST=1 ALLOY_ROUTE_TIMING=1
export PE3_SUBJECT=d097e1a8-c3c0-4c51-a113-2275b009b9a9

./scripts/pe3ColdLoadRun.sh cold deeplink run-1
./scripts/pe3ColdLoadRun.sh cold bare run-1
./scripts/pe3ColdLoadRun.sh warmproc deeplink run-1
./scripts/pe3ColdLoadRun.sh warm deeplink run-1

node scripts/pe3ColdLoadReport.mjs
node scripts/pe3ConnectionQueueing.mjs
```

Without `PE3_SUBJECT` the harness warns and the `deeplink` cell silently measures the **bare** path.

**5 runs per cell. Discard run 1. Median of the remaining 4. Report max, not p95, at n=4. Never
discard an outlier — re-qualify the host and re-run the cell.** Re-run `pe3HostGate.sh` between
cells; stop the moment it fails.

---

## 3. The loop

```text
MEASURE → identify the dominant phase → fix the shared owner → rebuild → remeasure → commit → next
```

Do not optimise against the July numbers — that profile is obsolete and was taken at load 7.8–15.6.

### Cold
`/workspace` · Workspace → Work Unit · Work Unit → first usable Focus Panel

### Warm
Work View switch · row → Focus Panel · subject → subject · card transition · command → destination ·
edit/dropdown · save acknowledgement + convergence · Processing reopen · Work Items reopen ·
Organization warm navigation

---

## 4. The four register items waiting on this window

These are latency questions, which is exactly why they did not block promotion. Each needs a
with/without comparison on a qualified host, not a code reading.

| ID | Experiment | Why it needs production |
|---|---|---|
| **D-3 / R-018** | Sibling work-view prewarm: measure switch latency **with and without**. On Firefly it warms 5 siblings, 4 of which return `terminal: "empty"` | The historical note says the prewarm bought **46 ms** on record-switch. Removing it without measuring both ways would trade a real win for a tidier request count |
| **D-2** | `queue-row-layout` ×2 per Work Unit entry — both from `fetchWorkUnitSurfaceConfigBundle`, sequential so in-flight coalescing cannot collapse them. Have the runtime config effect consult `putWorkUnitSurfaceConfigCache` first | The fix is cheap; the question is whether it moves warm entry at all |
| **R-005** | Fold the tour slot panel's 2 re-fetches into `tourScheduleWarmCache`. Blocked on the cache key covering the reschedule variant (`exclude_booking_id`) | Same — the saving is latency |
| **D-4** | `family-workspace` ×2, `metrics/resolve` ×2. **Re-observe with `ALLOY_DEV_STRICT_MODE=0` FIRST** | Never checked against M-1. An on-mount ×2 is a development artifact until proven otherwise, and seven of eight such "duplicates" already evaporated once |

---

## 5. Standing rules that still bind

- **No timing without its environment** — load, build mode, sample count, or it is not evidence.
- **A green harness run is not proof the harness measured the product.** Load both URLs by hand first;
  a 404 produces a complete and entirely plausible profile.
- **Counted evidence is always admissible** — request counts, call sites, render passes are not
  load-sensitive. Use them freely even when timing is not available.
- If the host degrades mid-window, **stop**. Partial evidence from a degrading host is worse than none.
