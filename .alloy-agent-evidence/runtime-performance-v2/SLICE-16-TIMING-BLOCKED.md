# SLICE 16 — QUIET-HOST TIMING WINDOW: **TIMING_BLOCKED**

Run: `erun_72b19181847806e2` · Lane: `lane_73a897409906` · Worktree: `wt1-work-unit-grade-a` (slot 1, port 3011)
Continues from Slice 15 certification `949f5f4a8`. **No product change. No timing recorded.**

The instruction is explicit: *"This slice MUST NOT produce timing conclusions until the host is
suitable… If the host is not quiet enough: STOP WITH `TIMING_BLOCKED`… Do not substitute noisy
timings."* The host is not suitable, by the programme's own gate. Nothing was measured, and nothing
below is a timing claim.

## 1. The gate, run twice

`web/scripts/pe3HostGate.sh` is the programme's authoritative admissibility test (PHASE-0 §6 names it
as the thing the operator must make pass). Run with `PE3_PORT=3011`:

| Criterion | Limit | 14:05 | 14:08 | |
|---|---|---|---|---|
| load 1-min | ≤ 4 | **12.36** | **8.98** | FAIL |
| load trend | 1-min ≤ 5-min | 12.36 > 8.05 | 8.98 > 7.59 | FAIL (rising) |
| CPU idle | ≥ 70% | 93.18% | 77.38% | PASS |
| spotlight | < 5% | 0.0% | 0.0% | PASS |
| competing node | 0 others | **12** | **12** | FAIL |
| control probe (context only) | — | p50 24.44 ms, max/p50 1.89 | p50 20.24 ms, max/p50 1.42 | INFO |

> **HOST NOT QUALIFIED — do not start a run; any timing taken now is inadmissible.**

The control probe is recorded as environment, not as a gate — the script's own header documents why
(on Apple Silicon it is anti-correlated with contention).

## 2. What is competing, by name

Port 3011 is owned by pid 78587. The other Next processes belong to **at least five other live
engineering lanes**:

`documentation-api` · `attendance` · `access-identity` · `wt6-surfaces-faacca` · `financials`
· one unnamed server on `-p 3020`

One of the twelve (pid 83545) is this worktree's own `next dev` supervisor, counted as foreign because
it is outside the port-owner's process tree — so **eleven are genuinely other lanes**.

A Playwright certification run was also live in `access-identity`
(`organization-vocabulary-authority.cert.spec.ts`, under `vac-governed-validate.mjs`). Sampled at 15 s:

```
14:03:08 load=7.43  6.01 6.15  cert=2 chrome=4
14:03:23 load=10.84 6.83 6.43  cert=2 chrome=8
14:03:39 load=13.68 7.69 6.75  cert=2 chrome=8
14:03:54 load=15.12 8.32 6.99  cert=2 chrome=9   ← peak
14:04:09 load=12.36 8.05 6.92  cert=0 chrome=5   ← that certification ended
```

That run has finished; load fell but **did not clear the gate**, because the failure is structural
(five other dev servers) rather than transient. Host: Mac16,11, 12 cores (8P+4E), 48 GB, 1.65 GB swap
in use.

**Nothing was killed or paused.** PHASE-0 §6 assigns pausing competing sessions to the **Operator**,
and another lane was mid-certification; disrupting it to buy a measurement window would be the wrong
trade and is not this lane's call.

## 3. A second, independent blocker: no QA session

Even on a quiet host, no mounted journey could be measured right now:

```
vac browser-auth status  → "state": "authentication_expired"
                            earliest_expiry 2026-09-04T02:52:44Z
vac browser-auth restore → "state": "awaiting_operator_approval"
                            mechanism: single_use_magiclink, password_involved: false
```

The restore request is filed. Until it is approved, Playwright cannot authenticate against slot 1, so
every journey in the matrix (§1–§12 of the instruction) is unreachable. This is an operator approval,
not a credential request, and no credential was or will be asked for.

## 4. A third, structural precondition — recorded, not newly discovered

PHASE-0 §6 already states that cold/warm millisecond budgets need **a production build**, because
`ALLOY_ROUTE_TIMING=1` must be set at build time. On `next dev`, T2/T3 for a cold route are dominated
by on-demand compilation, so a dev-server matrix would measure the bundler, not the product, and would
be inadmissible for exactly the reason this slice refuses noisy timings. **The quiet-host window and
the production build are two requirements, and only the first is about load.**

## 5. Methodology, fixed now so the next window is turnkey

Agreed milestone definitions, to be applied identically to every surface (frame sampling via the
existing `frames.mjs` harness at ~85 ms, which already carries `film()` and `verdict()`):

| Milestone | Definition | Observable |
|---|---|---|
| **T0** | operator intent | the dispatched click/keypress timestamp |
| **T1** | acknowledgement | `[data-queue-row-active='true']` flips, shell/route element appears, pressed state |
| **T2** | meaningful content | destination identifiable: queue rows > 0, or Focus Panel subject attribute present, or module shell + primary region |
| **T3** | usable | the primary action is present and enabled (e.g. a selectable row, an enabled command, a focusable composer) |
| **T4** | settled | no further sampled change in card count, card heights or request count for 2 consecutive samples |

Per surface: **≥ 5 clean runs**, reporting median and range, cold and warm separately, where "warm"
means proven retained runtime state — not merely an existing tab. Request counts require
`ALLOY_DEV_STRICT_MODE=0`; that is a measurement setting and the server must be restarted without it
before any behavioural QA.

## 6. Housekeeping finding — **D-2 is already closed and has been carried in error**

PHASE-0-BASELINE §5 closed **D-2** (`queue-row-layout` ×2) as a StrictMode echo, together with D-4.
Every slice document since has nonetheless carried the label **"D-2 / R-005"** forward in its
remaining-work table, this slice's instruction included. Only **R-005** is genuinely open. The pair
should be renamed **R-005** in the next handoff so the register stops re-opening a closed item.

This is the only substantive finding this slice can honestly make.

## 7. Standing evidence for the deferred experiments — NOT decisions

Restated so the next window starts from measurement rather than rediscovery. None of this decides
anything; each decision explicitly requires the timing that is blocked.

* **S8-2 / R-018 (sibling prefetch).** PHASE-1 §7: per selection the runtime provisions the target
  **plus 1–3 siblings**; across one session 27 provisioning calls / 2,863 KB / 7 distinct subjects, 2
  never visited. Decisively, **a prefetched subject is re-fetched in full when actually selected**
  (`1a132b7f` fetched three times; `468a5a95` likewise). So client-side reuse is **zero** and the open
  question is narrow: *does it buy anything server-side?* That is a timing question and only a timing
  question.
* **S5-4 (Activity prefetch).** Up to **~67.5 KB** on every subject selection for an interaction-only
  surface, with no cursor/offset on the endpoint (so `limit=100` cannot simply be reduced without
  truncating history). Both sides of the A/B — cost per selection, benefit on open — are timing.
* **R-005.** Carried from August; to be run under its established methodology, unchanged.
* **S9-1.** Requires a membership-changing mutation. None was run: the instruction permits observing it
  opportunistically during the S8-2 A/B, and that A/B did not run. **Still OPEN / monitor.**
* **Reserved-geometry mounted window (Slice 14 §5).** Still needs a participant-scoping surface. None
  was available in the last pass, and none was fabricated.

## 8. Consolidated programme status

### CLOSED
* **Runtime correctness / ownership** — baseline corrected from a stale worktree; StrictMode artefacts
  separated from real duplication; subject-refusal containment repaired across all six post-cohort
  paths; Financials duplicate; provisioning prewarm/selection inflight unified; card surface no longer
  remounts on subject switch; latest-selection-wins certified; monotonic header identity; search
  canonical navigation healthy; mutation fan-out proven narrow; S8-1 closed as misclassification;
  **S8-3 eligible-children duplication repaired (Slice 15)**.
* **Perceived performance** — stable queue and panel across switches; zero blank frames; zero
  false-empty transitions; scroll/context preserved; Financials geometry; **S4-1 reserved geometry
  adopted by Attendance, Health and Current Work, with Activity Preview and Form Delivery correctly
  excluded (Slice 14)**; F-1 closed KEEP.
* **Configuration freshness** — scoped + cross-tab invalidation, 90 s TTL, stale-while-revalidate,
  foreground revalidation, failed-refresh retention, generation guard at the apply boundary. No
  realtime subsystem added.
* **Payload convergence** — `process` ~26 KB, `departmentMetadata` ~30 KB, Summary doc ~27 KB removed;
  warm provisioning ~126 KB → ~72 KB (**~43%**), with no replacement per-selection fetch.
* **Mutation certification** — real `Move to Waitlist` under `enrollment_certification`: counts, rows,
  selection survival, no teardown/remount/blank.

### OPEN — IMPLEMENTABLE
*(none)* — no remaining item has both a specified repair and the evidence to justify it. Slice 15 was
the last of those.

### OPEN — DECISION / EXPERIMENT (all blocked on the same window)
S8-2/R-018 sibling prefetch · S5-4 Activity prefetch · R-005 · S9-1 (needs a mutation) ·
F-2 location hierarchy (needs a decision, not a shadow cache) · S3-4 (monitor only)

### BLOCKED / EXTERNAL
1. **Quiet host** — operator-owned; ≥ 5 foreign lanes' dev servers must stop for `pe3HostGate.sh` to pass.
2. **QA session** — `awaiting_operator_approval` on the filed single-use restore.
3. **Production build with `ALLOY_ROUTE_TIMING=1`** — required for any cold/warm budget (PHASE-0 §6).

### NEW (this slice)
* **D-2 is closed and has been carried forward in error since Phase 0** (§6). Rename to R-005.
* The competing-node check counts this worktree's own `next dev` supervisor as foreign when the port is
  owned by a different pid in the same lane — a gate-reporting wrinkle worth knowing before reading its
  output as "12 other lanes".

## 9. Success criteria — status

Criteria 1–10 of the instruction are unreachable without the window; criterion 11 (consolidated status
updated) is met by §8. Per the instruction's own escape clause, this slice returns **TIMING_BLOCKED**
rather than a fabricated baseline.

## 10. Recommended next step

Re-run this slice **unchanged** the moment all three blockers clear together — they must clear
together, since a quiet host with an expired session, or a session with a noisy host, still yields
nothing. Operator actions required: pause the other lanes' dev servers, approve the filed QA restore,
and produce a production build with `ALLOY_ROUTE_TIMING=1`. The methodology in §5 and the standing
evidence in §7 mean the next attempt should be measurement only.
