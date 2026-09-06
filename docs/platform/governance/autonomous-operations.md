---
owner: platform
status: sprint
last_reviewed: 2026-09-06
supersedes: []
---

# Autonomous operations — census and owner map

> **Phase 1 of Vacilando V3.** The goal is Vacilando as the resident operator of the Mac mini. This
> is the audit that has to come first: what exists, what it already owns, what is genuinely missing,
> and what the audit itself found broken. Composition before construction.

## 1. Census, measured 2026-09-06

| Resource | Count | Size |
|---|---|---|
| worktrees registered with git | 39 | — |
| worktree directories on disk | 36 | **29 GB** |
| installed toolkit versions | **95** | 1.6 GB |
| gateway runtime state | — | 190 MB |
| tmux sessions | 9 | — |
| resident provider processes | **9** | — |
| **executing** lanes | **2** | — |
| durable lanes | 9 | — |
| disk free | 776 GB of 926 GB | — |

Three git registrations have no directory. Disk is not under pressure; the estate is untidy, not
dangerous, which is why nothing here justifies haste.

## 2. Owner map

The system is not missing an operations layer. It has 219 canonical modules and most of the target
already has an owner.

| Area | Canonical owner | State |
|---|---|---|
| A Host hygiene | `disk-hygiene.mjs` | node_modules/.next reclamation; narrow but real |
| B Worktree hygiene | `worktree-retirement*.mjs`, `trusted-host-worktree-retirement.mjs` | **strong** — classifies and fails closed |
| C Process/server hygiene | `host-steward-*.mjs` (5), `memory-manager.mjs` | observes and reclaims idle dev servers |
| D Control-plane health | `control-plane-health.mjs`, `health-probes.mjs`, `health.mjs` | 17 checks, severity-classified |
| E Self-healing | `execution-recovery.mjs`, `execution-session-recovery.mjs`, `execution-stale.mjs` | recovery exists; escalation levels do not |
| F Documentation / memory | `turn-summary*.mjs`, `memory-manager.mjs`, `checkpoint-*.mjs` | turn summary exists; **lane memory does not** |
| G Work continuation | — | **no owner** |
| H Capacity utilisation | `capacity-*.mjs` (8), `scheduler.mjs` | measurement excellent; dispatch absent |
| I Findings / friction | — | **no owner** |
| J Director attention | `lane-notifications.mjs`, `notification-preferences.mjs`, `director-attention-model.md` | policy established in Capacity V2 |

The Host Steward cycle (`host-steward-cycle.mjs`) is the composition point and already has the right
shape: *observe → classify → admit → plan → execute through canonical owners → verify → audit*, and
its own comment says it coordinates owners it does not replace. V3 should extend that loop, not
build beside it.

## 3. The scheduler gap, stated precisely

"Supervisor without a scheduler" was close but not exact. `scheduler.mjs` exists. It is **81 lines
with 2 exports**, and its own header says it *"recommends and (optionally, behind a
disabled-by-default policy) could apply."*

So the gap is not absence. It is that the scheduler answers **"which lanes are eligible under
machine pressure"** and never answers **"what should run next"** — no priorities, no dependencies,
no mission progress, no authorization state. And it cannot dispatch. That is why capacity sits idle
with 9 resident providers and 2 executing while authorized work waits.

## 4. What the audit found broken

**Residency is being counted as occupancy.** `vac health` currently returns `verdict: problem` on
two provider checks:

* `provider.capacity` — *"More provider seats are live than the configured ceiling allows"*, citing 9 pids
* `provider.seats` — *"9 seats hold capacity against a ceiling of **4**"*

Both are wrong, in two different ways.

The measured truth at that same moment was **9 resident, 2 executing**. Capacity V2 established that
provider residency is not productive execution — a resident idle session is the resting state of a
persistent agent. Counting live processes against the *productive* ceiling reports a saturated host
that is in fact 78% idle.

The system already knows better in one place and not the others: `lanes.consistency` classifies the
identical condition as a **watch**, saying *"A seat is held with no active run. Normal, and
reclaimable under contention."* Three checks, one condition, two verdicts.

`provider.seats` is worse still: it measures against **4**, the `floor(12 cores / 3)` heuristic that
Capacity V2 retired against direct measurement. Certified doctrine is 8. A health check contradicting
promoted doctrine will train its reader to ignore it, which is how a real problem gets missed later.

**Other standing signals**, recorded as census rather than diagnosis: `toolkit.retention` 84 prunable
against a depth of 10; `worktrees.registry` 26 on-disk worktrees with no registry entry;
`runs.stale` a run waiting on a reason no policy defines; `validation.routing` one heavy workload
outside the broker; `operator.decisions` unable to complete, so the report is partial.

## 5. Worktree estate, already classified

`vac worktree-retire` evaluates 32 worktrees and does the safety work correctly:

* **15 director-safe** — merged, every gate measured and passed
* **6 operator-required** — pushed but not merged; removing the worktree is safe, landing the work is a judgment call
* **11 blocked** — unique local commits, failing `branch_durability_proven` and `unique_commits_recoverable`

This is the governing invariant of §25 already implemented: unknown fails closed, and age authorises
nothing. The gap is not classification. It is that nothing acts on the 15 safe ones without a human
initiating it.

## 6. Convergence plan

Ordered by risk retired per unit of work, not by ambition.

1. **Correct the capacity signals.** Make `provider.capacity` and `provider.seats` measure executing
   occupancy against the certified ceiling of 8. Cheapest fix, removes two false problems, and stops
   the health report contradicting promoted doctrine.
2. **Findings and friction (area I).** No owner exists, and it is the substrate everything else
   reports into. One underlying issue, one finding; statuses survive sessions and feed scheduling.
3. **Escalation levels (area E/§11).** The recovery *actions* exist; the level model, retry ceilings
   and escalation conditions do not. This is what makes physical access rare.
4. **Retention lifecycle (§6).** 84 prunable toolkits and 15 director-safe worktrees are already
   classified as safe by their canonical owners; give the Steward cycle authority to act on positive
   evidence.
5. **Scheduler (areas G/H).** Extend `scheduler.mjs` from eligibility to selection and dispatch.
   Deliberately last: it must consume findings, health and capacity truth, and building it before
   those are correct would encode today's wrong signals.
6. **Lane memory (§17).** Structured durable context per lane, not transcript summarisation.

## 7. Test isolation (§24) — already done, recorded here

The Capacity V2 incident was caused by test reset helpers defaulting to `runtimeRoot()`, which in a
worker shell is the live Gateway root. `assertResettableRoot` now refuses any root ending in
`/gateway` and throws rather than no-ops, because a silent skip would leave a suite reading
production while believing it had a clean store. Production is no longer a convenient fixture.
