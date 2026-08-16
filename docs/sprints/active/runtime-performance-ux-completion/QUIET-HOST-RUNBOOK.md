---
owner: runtime
status: active
last_reviewed: 2026-08-14
supersedes: []
---

# Quiet-host certification runbook

**Purpose:** make the timing evidence reproducible. Everything below is procedure, not
findings. Run it once the workstation is genuinely quiet; do not run it to "get a number".

**Base:** `agent/claude/5-runtime-performance-ux-completion` on `origin/staging b4bc5d682`.
**Companions:** [`PE3-COLD-LOAD-DECOMPOSITION.md`](../../../runtime/PE3-COLD-LOAD-DECOMPOSITION.md)
(historical method), [`DEFECT-REGISTER.md`](./DEFECT-REGISTER.md).

---

## 0. Before anything — re-pin the harness

The PE-3 harness is **hardcoded to slot 3** and to one tenant record. Running it unmodified
from slot 5 measures the wrong server, or an error page that still produces plausible numbers.

| Constant | File | Current value | Must become |
|---|---|---|---|
| `STORAGE` | `pe3ColdLoadHarness.mjs:25` | `auth/slot3/storage-state.json` | `auth/slot5/…` |
| `BASE` | `pe3ColdLoadHarness.mjs:26` | `http://127.0.0.1:3013` | `:3015` |
| port | `pe3ColdLoadRun.sh` | `3013` (3 places) | `3015` |
| `SUBJECT` | `pe3ColdLoadHarness.mjs:27` | `b29921ca-…` | a subject that **exists on this tenant** |
| work-unit slug | `pe3ColdLoadHarness.mjs:29-30` | `lifecycle_wu_lead` | a slug that **resolves on this tenant** |

**Verify before trusting any run:** load both URLs in a browser with slot-5 auth and confirm
a Focus Panel renders. A 404 or empty queue still produces a full timing profile.

**The harness instrumentation itself is VALID.** All nine DOM contracts it observes still
exist in current code: `data-alloy-os-runtime`, `data-runtime-label`,
`data-focus-panel-boundary`, `data-fp-render-strategy`, `data-inline-focus-panel`,
`data-focus-panel-grid-cell`, `data-focus-panel-cell-reserved`,
`data-focus-panel-cell-preparing`, `data-card-role`.

---

## 1. Environment

| Requirement | Value | Why |
|---|---|---|
| Build | **production** (`npm run build` → `next start`) | Dev is Turbopack compile-on-demand; a dev number is not a product number |
| Node | arm64 `v22.21.1` via nvm | x64 Homebrew node breaks prod builds on this host |
| `ALLOY_ROUTE_TIMING=1` | set **for the build**, not just the server | Middleware runs on Edge, where `process.env` is inlined at build time |
| Port | 3015 (slot 5) | Permanent slot→port mapping |
| Auth | slot-5 storage state, **refreshed same day** | A stale token adds a ~700ms refresh that the historical run mistook for auth cost |
| Tenant | the hosted tenant this slot's env targets | Remote Supabase — a local restart does **not** reset DB or page-cache warmth |
| Browser | fresh Playwright context per cold run | Cold = cold server process + cold in-process caches + cold browser context |

**Must be stopped first:** every other Alloy dev server (slots 1–4, 6), any `next build`,
any watcher, and Docker if the stack is not needed. `alloy-worker-pause <slot>` per slot.

---

## 2. Host qualification

The prior program **did not define a numeric gate** — it recorded a pressure snapshot
(`vm_stat` + `uptime` into `/tmp/pe3/pressure-*.txt`) and disqualified runs after the fact.
That is why PE-3 was never delivered: R-02 says the loop is untrustworthy under saturation,
but nothing stopped a run from starting.

This runbook keeps the existing snapshot and adds an explicit gate. **All must hold:**

| Criterion | Threshold | How to check |
|---|---|---|
| Load average, 1-min | **≤ 4** and not rising | `uptime` |
| Load trend | 1-min ≤ 5-min | `uptime` — a falling average means a burst is draining |
| CPU idle | **≥ 70%** sustained 60s | `top -l 5 -n 0 \| grep "CPU usage"` |
| Spotlight | no `mds`/`mds_stores` above 5% | `ps -Ao pcpu,comm -r \| head` |
| Competing node | **zero** other `next-server` / `next build` | `pgrep -fl "next-server\|next build"` |
| Free memory | no sustained swap-out | `vm_stat` |
| Control request | 5 consecutive `GET /api/health`-class requests within ±15% of each other | curl loop before the run |

**The control request is the real gate.** It measures what the run will actually experience.
If the control spread exceeds ±15%, the host is not quiet regardless of what `uptime` says.

For scale: this sprint's audit ran at load **50–118**. Nothing measured there is admissible.

---

## 3. Runs

```bash
cd web && export ALLOY_ROUTE_TIMING=1
./scripts/pe3ColdLoadRun.sh cold deeplink run-1     # cold|warmproc|warm × deeplink|bare
node scripts/pe3ColdLoadReport.mjs                  # medians/ranges/%-of-total per cell
node scripts/pe3ConnectionQueueing.mjs              # stalled-vs-server split
```

| Parameter | Value | Reason |
|---|---|---|
| Cold runs per cell | **5** (historical was 3) | 3 gives no usable tail; 5 is the minimum for a p95 worth quoting |
| Cells | `cold/deeplink`, `cold/bare`, `warmproc/deeplink`, `warm/deeplink` | The historical four — keeps comparison valid |
| Sequencing | **strictly sequential, never concurrent** | Concurrent runs contend and corrupt every sample |
| Warm-up exclusion | discard run 1 of each cell | First run pays module load the others don't |
| Primary metric | **median** of the remaining 4 | Matches the historical method — do not switch to mean |
| Tail | report **max**, not p95, at n=4 | p95 from four samples is false precision |
| Outliers | **do not discard.** Re-qualify the host and re-run the cell | Discarding outliers is how a saturated host looks quiet |
| Cold definition | fresh server process (killed + respawned), fresh browser context, TCP-only readiness probe | Issuing HTTP to check readiness pre-warms the route |
| Artifacts per run | `timings` object from the streamed HTML, Navigation Timing, Resource Timing waterfall, DOM milestones, `/tmp/pe3/pressure-*.txt` | |

**Do not** compare a number from this window to any number in the historical document
without re-stating both environments. The July figures were taken at load 7.8–15.6.

---

## 4. Flows

Cold path first — it is the open PE task. The rest establish the adjacent baselines this
sprint owns, in the same qualified window.

| # | Flow | Metric |
|---|---|---|
| 1 | `/workspace` cold | first usable surface |
| 2 | Workspace → Work Unit cold | shell commit, above-fold ready |
| 3 | Work Unit → first usable operational subject | primary-usable |
| 4 | queue row → Focus Panel | click → visible selection; → shell commit; → subject identity; → above-fold cards |
| 5 | subject → subject warm | commit latency, and whether a stale payload can disturb the active subject |
| 6 | field edit → dropdown open | click → control visible → options visible |
| 7 | field save → visible state → projection convergence | acknowledgement, server completion, convergence — reported separately |

Flows 4–7 are the mission's canonical spine and are **unmeasured to date**; every entry in
the defect register's "reported but not reproduced" table lives here.

---

## 5. Evidence format

Every measured interaction produces all ten fields. An entry missing environment or sample
count is not evidence and does not enter the register.

```text
interaction          queue row → Focus Panel shell commit
environment          prod build · slot 5 :3015 · load 1-min 2.1 · CPU idle 82% · auth refreshed 2026-08-14
sample count         4 (run 1 discarded as warm-up)
median               —
tail (max)           —
phase breakdown      middleware auth / route identity / compose / stream / hydrate
network              request count + duplicate detection
markers              [perf:section] ids, data-alloy-section-id
trace                /tmp/pe3/<label>.json
observed UX          what the operator actually sees, in words
```

---

## 6. Standing rules

- **No timing without its environment.** A number without load, build mode and sample count is not admissible.
- **Never compare across windows** without restating both environments.
- **A green harness run is not proof the harness measured the product** — verify the URL resolves first (§0).
- **Counted evidence is always admissible** — request counts, call sites, render passes are not load-sensitive.
- If the host degrades mid-window, stop. Partial evidence from a degrading host is worse than none.
