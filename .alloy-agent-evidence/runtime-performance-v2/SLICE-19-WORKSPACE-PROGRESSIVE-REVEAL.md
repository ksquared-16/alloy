# SLICE 19 — WORKSPACE PROGRESSIVE REVEAL (S19-1)

Run: `erun_1eacde9e9e74acd4` · Slot 1, port 3011 · Repair `4c5d85869`
Serving BUILD_ID `1xvU9PJF9hllifk6gHWvm` (repaired). Tree clean; no experimental switch remains.

## 1. Phase A — the reveal owner

`components/presentation/workspace/WorkspaceSurface.tsx`, gated on the single boolean
`model.ready` from `useWorkspaceSurfaceRuntime()`:

* `!ready` → `AlloyOperationalBootShell variant="workspace" chrome="content"` — a **centred
  "Thinking…"** occupying the whole content region: no identity, no structure.
* `ready` → `WorkspaceHeader` + `ProcessGrid` + hosts, revealed **atomically**.

Identity available at shell commit: `useWorkspaceOrg()` already carries `orgName` synchronously.
The region that waits is the process surface. No existing pending/reserved primitive owned it — the
boot shell replaced it wholesale. A visited Workspace is `ready` immediately from its retained seed,
so this window is **cold-only**.

One contract constrains the repair, and it is recorded in `WorkspaceSurfaceModel`: the published
header must *"commit atomically with process tiles — do not flash a default header when a published
config exists."* So identity may be shown; a guessed title, subtitle or KPI may not.

## 2. The repair

`WorkspacePendingSurface` replaces the boot shell inside the same scrollport:

* **identity** — the organisation name from context (a tenant fact, not a guess) plus a neutral
  "Preparing your workspace…" line. No published title, subtitle or KPI values.
* **reserved geometry** — the same grid classes the process surface uses, `min-height: 32rem`, two
  structural slots carrying **no business values**.
* **never the empty state** — "No active business processes are configured" stays in `ProcessGrid`,
  behind a settled model.

No new runtime, no timer, no idle callback, no cache (locked by test). The application shell,
navigation, search and the retained scrollport are untouched.

**Commit:** `4c5d85869`.

## 3. Tests and planted defects

`web/tests/runtime/workspaceProgressiveReveal.test.tsx` — **9 green**, rendering the real component:
identity renders; the region reserves a footprint with slots; the empty copy never appears while
pending; no `model.header` or `WorkspaceHeader` reference in the pending path; the pending component
fetches nothing and holds no state; the surface wires the pending region in place of the boot shell;
settled behaviour (header, grid, enter choreography) unchanged; no second reveal runtime; identity
comes from the org context.

**Planted defects, both reverted:**

| Plant | Failed test | Message |
|---|---|---|
| reserved `min-height` removed | *reserves the process-surface geometry* | `a reserved footprint, not zero: expected '' to be truthy` |
| settled empty copy rendered while pending | *NEVER renders the empty state* | `expected 'XPreparing your workspace…No active b…' not to match /No active business processes/i` |

2 failed / 7 passed with the plants in; **9/9** after reverting.

## 4. Frame evidence — before and after, same host, minutes apart

Both arms built and served identically (production, `ALLOY_ROUTE_TIMING=1`), 5 cold runs each, run 1
discarded, 55 ms sampling. Host at measurement: CPU idle 75.9% PASS, spotlight 0.0% PASS, five idle
foreign next-servers, no `next build` / `playwright` / `vitest` anywhere.

| | BEFORE | AFTER |
|---|---:|---:|
| **identity visible** | **3036 ms** [2999–3220] | **415 ms** [336–452] |
| centred "Thinking…" frames | **47** | **3** |
| pending identity + reserved frames | **0** | **40** |
| reserved region height | — | **512 px**, settling to 620 px |
| primary content | 3036 ms [2999–3220] | 2888 ms [2693–3217] |
| false-empty frames | 0 | **0** |
| frames with nav absent / search absent | 0 / 0 | **0 / 0** |
| requests / bytes | 26 / **682 KB** | 26 / **682 KB** |

**The operator learns where they are 2.6 seconds sooner**, and the region they are waiting on has a
structure the whole time instead of a centred spinner. The reveal grows the region by 108 px
(512 → 620) rather than materialising 620 px from nothing — growth, not collapse.

**No backend cost was added: requests and bytes are identical to the byte.**

## 5. Timing — and an honest reading of the content number

| | BEFORE | AFTER |
|---|---:|---:|
| T1 shell (cheap predicate) | 9 ms [8–10] | 15 ms [8–81] |
| T2 content (cheap predicate) | 2752 ms [2644–2802] | 3213 ms [2931–3463] |
| T2 content (frame harness) | 3036 ms [2999–3220] | 2888 ms [2693–3217] |

The two harnesses disagree on the direction of the content number: one reads +461 ms, the other
−148 ms, and the AFTER spread is wider than the difference. **The honest statement is that content
settlement is unchanged within measurement spread** — this repair was never expected to move it, and
no latency improvement is claimed. The shell remains immediate; the 242 ms "T1" the frame harness
reports for both arms is that harness's own sampling cost (it calls `innerText`, forcing layout), not
a shell regression — the cheap predicate measures 9 and 15 ms.

## 6. Final Workspace classification

**A for perceived usability, with legitimate background settlement.** The shell is immediate and
usable, identity is immediate, the waiting region is structured and honest, and the ~2.7–3 s
composition continues underneath without the operator being told nothing is happening. The underlying
composition remains a candidate for ordinary optimisation, but it is no longer an experience defect.

## 7. S5-4 — NOT RUN

The Workspace repair consumed the authenticated window: three production builds (repair, matched
before-arm, restore) plus two five-run frame cells. S5-4 needs its own build pair and two journeys.
Standing evidence is unchanged and precise — Activity costs ~66 KB once per record hydration, not per
warm subject switch — so only the benefit side remains open. **INCONCLUSIVE, carried.**

## 8. Remaining

* **S9-1** — MONITOR. No mutation occurred naturally in this slice and none was created for it.
* **R-005** — carried, not run.
* **Matrix cells** — in-shell Work Items / Processing / Communications, search → record, remaining
  Settings: not completed. Attendance stays `NOT_MEASURABLE — PRODUCT NAVIGATION OWNER`;
  reserved-geometry mounted window stays `TEST-CERTIFIED / MOUNTED WINDOW NOT OBSERVED`.

## 9. Consolidated status

**CLOSED** — runtime foundation · perceived performance · configuration freshness · payload
convergence (~126 KB → ~72 KB warm) · mutation certification · S4-1 · S8-3 · D-2 · S8-2/R-018
(inert in production) · seven-surface timing baseline · S18-1 Work View provisioning convergence ·
**S19-1 Workspace progressive reveal**.

**OPEN — IMPLEMENTABLE** — *none.* Every evidenced repair identified by this programme is landed.

**OPEN — DECISION / EXPERIMENT** — S5-4 (one build pair) · R-005 · S9-1 (monitor) · F-2 · S3-4.

**OPEN — MEASUREMENT** — in-shell Work Items / Processing / Communications · search → record ·
remaining Settings · participant-scoped reserved-geometry window.

**BLOCKED / EXTERNAL** — Attendance standalone launcher (product navigation owner) · production
`alloy-dev-start` wildcard-bind defect (toolkit-owned; scratch-config workaround certified and in use).

**NEW this slice** — the Workspace reveal owner and its atomic-header contract · identity is available
2.6 s before content and was simply not being shown · the repair is byte-neutral.

## 10. Ready to close?

**Yes, for repair.** The OPEN — IMPLEMENTABLE list is empty: every defect this programme measured and
could specify has been repaired and certified. What remains is one cheap experiment (S5-4), one
carried historical experiment (R-005), one monitored observation (S9-1), two open policy questions
(F-2, S3-4) and a handful of measurement cells — none of which gate closeout.

**Recommended closeout:** a short final slice that runs the S5-4 build pair and whatever matrix cells
fit in one authenticated window, then closes Runtime Performance V2 with the remaining items moved to
ordinary maintenance and monitoring. No further repair slice is indicated by current evidence.
