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


---

# Phase 2 — Operational findings

> **The canonical owner of durable operational knowledge.** A finding is not a ticket. A ticket is
> work someone intends to do; a finding is a fact about how the system behaves, which may or may not
> deserve work. That distinction is load-bearing: a ticket queue grows until someone grooms it, while
> findings should shrink on their own as conditions disappear.

## Composed, not invented

A store already existed at `vacilando/operational-findings/findings.json` — 22 hand-written findings
with real root causes, mitigations and promoted SHAs — and **no module referenced it**. Phase 2 is
that store's owner, `operational-findings.mjs`. All 22 records were migrated in place, none
discarded, and their `classification` vocabulary became the category model.

Migration does not invent history. A record written before the severity model existed is defaulted to
`degrades` and marked `severity_source: defaulted_on_migration`, because guessing the consequence of
an old finding would put false confidence into the field the planner keys on.

## Model

| Dimension | Values |
|---|---|
| Status | `OPEN` → `MITIGATED` → `FIXED` → `CLOSED`, plus `ACCEPTED_DEBT` |
| Category | `defect`, `design_gap`, `observability_gap`, `hardening_debt`, `operator_friction` |
| Severity | `control_plane`, `blocks_work`, `degrades`, `debt`, `opportunity` |

**`CLOSED` requires evidence.** Code changing is `FIXED`. Closing asserts the condition is *gone* —
a claim about the running system — so it must carry something a later reader could check. The gap
between "we fixed it" and "we proved it" is where regressions live.

**Severity is consequence, never frequency.** A daily irritation is not severe; a rare event that
loses data is. Frequency lives in `occurrences`, where it can inform priority without inflating
severity.

**`ACCEPTED_DEBT` is a decision, not a shrug.** The problem is real, understood, and deliberately not
being fixed now. It stays on the board and stops interrupting.

## Identity, and the duplicate this caught

Identity is `(subsystem, key)` where the key names the **cause**, not the symptom — deterministic, so
next week's observation lands on the same record, and explicit, so a vague symptom string cannot
silently merge two distinct causes.

Seeding immediately exposed a gap. The legacy records carry hand-written ids
(`supervisor-without-scheduler`, not `dev-server-supervisor-without-scheduler`), so observations meant
to update them **created duplicates** — the exact failure this system exists to prevent. Fixed by
allowing an explicit `id` to target a known finding, plus `mergeFindings` to fold a duplicate into the
record it should have been. Evidence and occurrences are additive; the duplicate is removed rather
than tombstoned, because a store that accumulates markers for its own mistakes becomes the inbox this
replaces.

## Steward integration

`host-steward-cycle.stewardStatus()` consumes `findingsForSteward()` and **never writes**, so findings
cannot become a second source of operational truth beside the run, lane and health owners. A findings
store that cannot be read degrades the Steward's awareness, never its cycle.

`affecting_operation` means the condition is still live — `OPEN` and `MITIGATED` only. `FIXED` gets
its own `awaiting_certification` bucket, because listing every past repair as still-hurting would turn
a signal into a changelog, and "what should I verify" is a question the Steward can act on.

## Director attention

An `OPEN` finding is **not** an obligation. The Director is owed attention only when consequence is
high and the system cannot proceed alone: `control_plane` or `blocks_work` severity, or a finding
that was certified `CLOSED` and has recurred. That is the difference between a scoreboard and an
inbox. Routine creation, update and mitigation are silent.

## Seeding decisions

Items evaluated and **made findings**: heavy work outside the validation broker; a run waiting on a
reason no policy defines (`blocks_work`); toolkit retention never enforced; work continuation having
no owner; lane memory not existing.

Items evaluated and **deliberately not made findings**:

* **3 stale worktree registrations** and **11 worktrees with unique local commits** — evidence on the
  existing estate finding, not separate causes. The 11 blocked are the safety system *working*.
* **The lane-registry destruction** — a closed incident whose prevention is promoted and certified.
  Closed incidents stay closed; a finding would duplicate the record.
* **Manual toolkit convergence** — the capability was built and promoted during Capacity V2.

One status was **corrected**: `supervisor-without-scheduler` was marked `FIXED`, and the Phase 1 audit
measured the capability still absent. It was never `CLOSED`, so no certification was invalidated —
`FIXED` was simply premature.

## Limitations

Severity is declared, not derived, so 22 migrated findings sit at the default `degrades` until
evidence justifies moving them. Findings inform planning through `constraining_planning` but nothing
consumes that yet — the scheduler is Phase 5.


---

# Phase 3 — Control-plane recovery

> **The goal is not automatic restart.** A restart loop is worse than an outage: it looks like the
> system is trying, it destroys the evidence of why, and it can mask a crash into what appears to be
> failing hardware. The model is *diagnose → bounded repair → verify → escalate only when necessary*.

## Composition

Every recovery **action** already had an owner. Phase 3 adds the decision, not the repair:

| Concern | Existing owner |
|---|---|
| process identity, owned restart | `control-plane-health.recoverOwnedVacilandoProcess` |
| loopback health | `control-plane-health.probeVacilandoAccepting` |
| installed/running convergence | `toolkit-convergence.mjs` |
| tailnet address, retry policy | `vacilando-tailscale-bind.mjs` |
| attempts, cooldown, audit | `host-steward-cycle.mjs` |
| durable problem memory | `operational-findings.mjs` |

The one thing that could **not** be composed is episode memory. Every existing attempt counter lives
in the Gateway's own runtime, and the Gateway is the thing being restarted — so a restart loop would
reset its own memory of looping each time round, and every iteration would look like a first attempt
forever. Episode state is written to disk **before** the action that may kill the writer.

## Failure classes

Classification order is **certainty, not severity**. Host reachability first, because nothing else can
be trusted without it. Missing process before health, because a dead process cannot answer a probe and
would otherwise look merely "unhealthy". Drift before route, because a Gateway running the wrong
toolkit may serve loopback perfectly and still be wrong.

| Class | Evidence | Action | Level | Ceiling |
|---|---|---|---|---|
| `HEALTHY` | every measured signal healthy | none | 0 | — |
| `PROCESS_DEAD` | no Gateway process | owned restart | 2 | 3 |
| `PROCESS_ALIVE_UNHEALTHY` | alive, loopback down ≥ 60 s | owned restart | 2 | 2 |
| `TOOLKIT_DRIFT` | running ≠ installed | converge then restart | 3 | 2 |
| `SERVE_ROUTE_FAILURE` | loopback healthy, route down | reconcile Serve | 1 | 2 |
| `SUPERVISOR_FAILURE` | Steward stale, Gateway healthy | restart Steward | 2 | 2 |
| `TAILSCALE_FAILURE` | tailnet down | **none** | 4 | 0 |
| `HOST_UNREACHABLE` | host silent | **none** | 5 | 0 |
| `UNKNOWN` | incomplete or contradictory | **none** | 4 | 0 |

**`UNKNOWN` fails closed**, and it is reached more often than one might expect: a single failed probe,
an unreadable process table, or unreadable episode memory all land there. Never restart on
`health = false` alone — slow bind, an unattempted probe, and a genuinely wedged process are three
different things and only the third wants a restart.

**A healthy Gateway behind a broken route is never restarted.** Restarting a working service to fix a
network destroys the thing that works. **The tailnet is never repaired autonomously**, because it may
be the only channel back to the host.

## Live certification

| Case | Result |
|---|---|
| A · dead Gateway | **PASS** — `kill -9`, caught `PROCESS_DEAD`, recovered within one 250 ms sample |
| B · alive but unhealthy | **PASS** — SIGSTOP; launchd never fires; sustained → `PROCESS_ALIVE_UNHEALTHY`, single probe → `UNKNOWN` |
| C · toolkit drift | **PASS** — certified against real drift observed this session, caught while loopback was healthy |
| D · Serve route failure | **classification PASS; injection NOT RUN** — Serve is the Director's only remote channel |
| E · retry exhaustion | **PASS** — ceiling honoured, escalates to L4, one obligation, no loop |
| F · `UNKNOWN` | **PASS** — live during B, and on blind/contradictory evidence |
| G · durability | **PASS** — 9 lanes and 27 findings byte-identical across the kill |

**Live certification found a defect in its own observer.** curl exits non-zero when the service does
not answer, so a generic guard turned "the Gateway did not respond" into "loopback was not measured",
and a SIGSTOPped Gateway read as `UNKNOWN` instead of `PROCESS_ALIVE_UNHEALTHY` — the model's own
conflation, inside the model. A printed status code is an answer; only curl being unusable is
genuinely unmeasured.

## What this does not yet do

The decision model is certified; it is **not driven autonomously on a Steward cycle**. A real
unhealthy Gateway is therefore diagnosed, not repaired without a human. `director-forced-to-mac-mini`
is accordingly **MITIGATED, not CLOSED** — closure requires that execution path live-verified, and
recovery code existing is not evidence that recovery happens.
