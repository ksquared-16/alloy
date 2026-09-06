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

---

# Phase 4 — Retention, reclamation and hygiene lifecycle

Owner modules: `artifact-retention.mjs`, `hygiene-classification.mjs`,
`hygiene-observe.mjs`, `hygiene-reclaim.mjs`, `hygiene-execute.mjs`,
`hygiene-cycle.mjs`. Surface: `vac hygiene`.

Hygiene must never destroy work. A resource is reclaimed automatically only
when Vacilando can positively prove why that is safe. Absence of evidence is
not evidence of disposability, and UNKNOWN preserves.

## Composed, not invented

Nothing here re-decides a question an existing owner already answers.

| Question | Owner | Phase 4's part |
| --- | --- | --- |
| Is this worktree safe to retire? | `worktree-retirement.mjs` (13 gates) | reads the verdict |
| Retire it | `trusted-host-worktree-retirement.mjs` | calls it |
| Which toolkit versions matter? | `toolkit-retention.mjs` | policy v2; reads the plan |
| Prune them | `vac-toolkit-prune.mjs --yes` | invokes it |
| Is this worktree known, and how? | `worktree-registration.mjs` | reads provenance |
| What kind of state is this path? | `durable-state.mjs` `STATE_FAMILIES` | reads the declaration |
| Where does a durable problem live? | `operational-findings.mjs` | writes to it |
| What drives a bounded loop? | `host-steward-cycle.mjs` | one more stage in it |

New code exists only where no owner did: retention classes for artefacts, the
six-state hygiene vocabulary, the reclamation ledger, and a bounded log rewrite.

## Classification

Every managed resource ends in exactly one state. There is no default.

| State | Meaning |
| --- | --- |
| `HEALTHY` | in active, correct use |
| `EXPECTED` | nothing is using it and policy retains it anyway |
| `RECONCILE` | metadata disagrees with reality; the correction touches only metadata |
| `RECLAIMABLE` | every required proof is measured and passed |
| `NEEDS_ATTENTION` | a decision or some work is owed |
| `UNKNOWN` | evidence is missing — preserve |

`HEALTHY` and `EXPECTED` both mean "do nothing", and collapsing them loses the
reason. One answer is "it is working"; the other is "we decided to keep it", and
only the second is ever worth revisiting.

The evidence that produced a state is carried with it. A classification that
cannot say what it was measured from cannot be audited later.

## Positive-proof rules

**Worktree retirement.** All thirteen gates in `SAFETY_GATES` measured and
passed — `git_worktree_exists`, `no_live_provider`, `no_live_dev_server`,
`no_active_execution_run`, `no_active_governed_action`, `no_active_lane`,
`tree_clean_or_handled`, `branch_durability_proven`,
`unique_commits_recoverable`, `no_untracked_unreproducible`,
`not_self_retirement`, `no_operator_hold`, `no_governance_exception`. An
unmeasured gate blocks exactly as a failed one does. Durability must be
`merged`, `reachable_from_canonical_remote` or `pushed_not_merged`; a worktree
holding unique local commits is never reclaimed and is never auto-merged,
rebased, pushed or squashed to make it so. **A worktree with managed
provenance is retained regardless** — see below. Execution re-measures every
gate and refuses on any drift from the bound fingerprint, removes through
`git worktree remove` without `--force`, and never deletes the branch.

**Toolkit pruning.** A version is retained if it is `current`, referenced by a
live process, explicitly pinned, inside the rollback window, retained for
reproducibility, of unknown provenance, of unknown install time, or needed by
the minimum-retention floor. It is pruned only when none of those applies. Any
unresolved live pin blocks every prune, not only its own.

**Artefact reclamation.** The path's retention class must be one of
`RECENT_DIAGNOSTIC`, `TRANSIENT_QA` or `SCRATCH`; every evidence key its rule
requires must be measured; no live writer, no active session or run reference,
no retention hold; and it must be outside its window — or, for an unrotated
log, over the size ceiling. Class comes from a declared relationship, never
from a filename and never from an mtime.

## Toolkit retention policy v2

V1 kept the ten most recent superseded versions. Install cadence was then
measured on this host: **17, 30, 22 and 23 installs on four consecutive sprint
days, and 3 on a quiet one.** A depth of ten is therefore about eight hours of
rollback during a sprint and about three days when nothing is happening — a
window whose duration varies by a factor of ten with how busy the week was. The
failure mode is specific: a regression noticed the next morning finds every
candidate rollback target already gone.

V2 states the window in the unit the requirement is actually in.

* `rollback_window_hours: 72` — every version installed in the last 72 hours.
* `keep_n: 10` — a floor in count terms, so a quiet week still has depth.
* `min_retained_versions: 3` — a machine whose recovery path is one directory
  deep is one bad install away from having none.
* Unknown provenance or unknown install time protects on its own.

The two rules are a union, not a choice. On the live host this moved retention
from 11 of 98 versions to 41.

## Artefact retention classes

| Class | Window | Reclaimed by |
| --- | --- | --- |
| `DURABLE_EVIDENCE` | none | never automatically |
| `ROLLBACK_SUPPORT` | while referenced | its own owner |
| `RECENT_DIAGNOSTIC` | 14 days, or over an 8 MB ceiling | truncate to a 256 KB tail |
| `TRANSIENT_QA` | 3 days | directory removal |
| `SCRATCH` | 1 day | path removal |
| `LIVE_STATE` | none | never |
| `UNKNOWN` | none | never — preserved |

`LIVE_STATE` is the seventh class and is not padding. `api-token` is a secret
the Gateway authenticates with; `node.json` is this host's identity. Neither is
evidence and neither is disposable, and letting them fall through to UNKNOWN
would bury a real answer under a fail-closed one.

Class comes first from `durable-state.mjs`: a path inside a declared family is
that family's, and a directory that *contains* one is the directory that family
lives in. Only then do the path rules apply. So a family added to
`STATE_FAMILIES` is protected here automatically, and one removed there stops
being silently protected here.

**Why size may trigger a log rewrite when age may not trigger a delete.**
Deleting an old file destroys the only copy of something on the strength of a
date. Truncating an oversized log to its last 256 KB destroys nothing any
reader consumes: `alloy-dev-supervise` reads `tail -50` and `tail -3`, and no
reader in the toolkit opens a full history. The precondition is still positive
proof of no live writer — rewriting a file an appender holds open is how a log
becomes a sparse 26 MB of NULs.

## Interruption and reconciliation

There is no transaction across git, the filesystem and Vacilando's metadata,
and inventing one would be a lie with a nice API. Instead:

1. write the intention, with a before-state precise enough to recognise later;
2. act;
3. **measure** the postcondition — an action whose verifier cannot confirm the
   end state is a failure, never a success with a caveat;
4. write the outcome.

Metadata is never updated before the filesystem action it describes: a record
saying "retired" over a worktree still on disk is worse than no record, because
the next cycle believes it.

An intention with no outcome is an open reclamation. The first stage of every
cycle re-measures each one and resolves it into `reconciled_completed`,
`reconciled_not_performed` or `reconciled_partial`. A partial is reported and
never retried automatically. A resource that cannot be measured **stays open** —
closing it would be inventing an outcome, which is the one thing the ledger
exists to prevent.

## Bounds

| Kind | Per cycle |
| --- | --- |
| worktree | 2 |
| artifact | 10 |
| registration | 5 |
| toolkit | delegated |

Not a performance limit — the blast radius. A classification defect that turns
fifteen safe worktrees into fifteen wrong ones destroys fifteen in one sweep and
two in a bounded one, and the second is recoverable by someone who notices.

The toolkit carries no number because its prune is one delegated call that
recomputes and verifies the whole plan; there is no interface for "remove
twenty-five of fifty-seven", and inventing one would mean the hygiene cycle
choosing which versions die. Stating it as a number would have implied an
enforcement that does not exist.

## Steward integration

Hygiene is a stage of the existing Steward loop, not a second daemon, gated on
its own six-hourly cadence — an observation costs a `du` over ~100 toolkit
directories and an `lsof` per log, real work to reclaim bytes that were equally
reclaimable six hours ago. It never fails the Steward cycle: its result is
attached and its failures recorded, and the host's health does not depend on it.

`vac host-steward --status` answers what the last hygiene cycle reclaimed and
what remains open without measuring anything. The full scoreboard — every count
§17 asks for — is `vac hygiene --json`.

Routine success is silent. The Director hears only about ownership that cannot
be resolved, work no retained history holds, repeated failure, or a blocked
toolkit plan.

## An authority change, recorded

`retire_worktree` was in `OPERATOR_ONLY_ACTIONS` "whatever the evidence says".
Phase 4 moved it to `AUTONOMOUS_ACTIONS`. The basis is that a worktree is a
checkout and not the work: it is retired only where the commits are proven
reachable from the canonical remote, so recreating it is one `git worktree add`.
That is the reversible mechanism — not a quarantine directory, which would only
move the bytes.

`delete_branch` stayed operator-only. Retiring a checkout does not imply
deleting its branch: two decisions, two blast radii.

## Two defects this phase found before either fired

**The population was measured by name.** `reconciliation-observe` lists
worktrees with `filter(d => /^wt/.test(d.name))`. `financials`, `payments`,
`troubleshooting` and `ui-vac` matched nothing, so they appeared in no
classification at all — not preserved, not UNKNOWN, absent. The hygiene
population is the union of git's registration list and the parent directory,
with no name filter. The same comparison shape produced the accepted Phase 1
figure of *3 stale registrations*: 39 registered minus 36 directories in the
managed parent. All three exist — the canonical checkout and two
`alloy-promotions` worktrees. **Actual stale registrations: zero.**

**A managed slot can pass every gate.** `troubleshooting` (slot 8, port 3018)
and `wt3-communications-inbound-sms` (slot 3, port 3013) both scored a clean
retirement `candidate`: idle, clean, merged, unreferenced. Every git fact was
true and retiring them would still have broken two slots, because
`metadata/<name>.env` names their path and the thirteen gates do not read slot
configuration. Managed provenance is now `EXPECTED` — intentionally retained.
Releasing a slot is not a hygiene decision.

## Limitations

* The retirement gate set itself still cannot see slot configuration. The
  protection lives in the hygiene layer, so a caller going straight to
  `evaluateRetirementSafety` gets `candidate` for a managed worktree.
* 24 runtime state paths are declared by no `STATE_FAMILIES` entry. They are
  preserved as UNKNOWN, and they are also outside the durable backup unit.
* `git worktree prune` is repository-wide; it cannot reconcile one registration
  while leaving another stale one. The verifier checks the specific target and
  the whole ref list, so this is safe, not silent.
* Worktree byte totals come from `du` and cost about 20 seconds over a 29 GB
  estate. Routine cycles run without them; only the scoreboard pays it.

---

# Phase 5 — Resident scheduling, continuation, and the unread-output view

Owner modules: `work-scheduler.mjs` (decision), `work-scheduler-observe.mjs`
(composition), `lane-attention-view.mjs` (operator view). Surface:
`vac host-steward --status --json`, `scheduling` and `attention`.

**Status: the decision layer and the explanation are live. Autonomous dispatch
is not enabled, and the reason is a missing owner, not a missing scheduler.**

## What the scheduler owns, and what it may not

It owns exactly one judgement: *of the work Vacilando is already authorized to
do, what deserves the next provider, and if nothing does, why is that right?*

It may not decide whether a run exists, whether a provider is executing, whether
a lane is closed, whether capacity is occupied, whether a finding exists,
whether the host is healthy, whether a governed action is approved, or whether a
dependency is satisfied. It consumes all of that. `work-scheduler.mjs` imports
nothing at all, and a control asserts it — a planner that could reach a store
would eventually start deciding these for itself.

`scheduler.mjs` is left alone. It answers a different question — "given machine
pressure and free slots, may I start a worker?" — over a legacy sprint/slot
snapshot with `auto_scheduling: false`. Its pressure half is superseded by
`capacity-operating-model` and `provider-seat-state`, and it has no
representation of lanes, runs, missions, dependencies or findings.

## Wait reasons

Thirteen, closed, with `unknown` explicit: `executing`, `eligible`,
`no_authorized_work`, `dependency`, `director_answer`, `governed_action`,
`capacity`, `host_constrained`, `provider_unavailable`, `finding_constraint`,
`retry_cooldown`, `completed`, `scheduled_later`.

Ordered so the **most actionable** reason wins. A lane blocked on a person *and*
short of seats reports the person: freeing a seat would not move it, and saying
"capacity" sends someone to fix the wrong thing. `capacity` is deliberately
narrow — it was previously the catch-all, which is how a lane waiting on a
human looked like a lane waiting on a machine.

## Priority and fairness

Eight classes, highest first: `director_explicit`, `unblocks_other_work`,
`control_plane`, `mission_continuation`, `finding_constrained`,
`dependency_cleared`, `planned`, `maintenance`.

Class decides the band; within reach of a band, the longer-ready lane wins. A
lane waiting past 45 minutes is promoted by **exactly one class**, never past
`control_plane`, and never past an explicit Director priority. Ordering is total
and deterministic — ties break on lane id — so two ticks with identical facts
produce identical order.

Hygiene sits in the bottom class precisely so it cannot outrank product work by
running often, and the single-class promotion is what stops it being starved in
return.

## Continuation

`continuationDecision` requires all eight conditions measured true:
`already_authorized`, `deterministic_next_action`, `within_policy`,
`dependencies_ready`, `no_new_judgment`, `no_unresolved_blocker`,
`no_conflicting_finding`, `bounded_and_auditable`. Any unmet condition is named.
No next action returns `none`, never a silent continue.

It decides only whether a step *may* run unattended. `planSchedule` decides
*when*, from the same candidate list as everything else. One planner: a
continuation evaluator that dispatched on its own would be a second scheduler
wearing a different name.

## Why dispatch is not enabled

Run live over 9 durable lanes: **3 executing, 6 UNKNOWN.**

The six are unknown because three facts a dispatch decision needs have no owner
anywhere in the runtime — **per-lane authorization for a next step, dependency
readiness, and the deterministic next action.** Lanes, runs, seats, capacity,
findings and host band are all canonically owned and compose cleanly; these
three are recorded by nothing. `mission-advance.mjs` holds the equivalent only
for implementation chains, not for lanes generally.

So the planner refuses, which is the fail-closed answer. Enabling dispatch would
mean defaulting authorization to `true` to make the plan look decisive, which is
the one thing this programme does not do. Tracked as
`no-owner-for-lane-next-step-authorization` (`blocks_work`).

**The Phase 5 blocker is not the scheduler, capacity, or provider reuse. It is
that nothing writes down what a lane is allowed to do next.**

## The unread-output view

A provider finishes a turn, leaves output, and the lane returns to `ready` —
indistinguishable from a lane that is merely idle. Finished work was found by
opening lanes one at a time.

`lane-attention-view.mjs` derives `has_unread_output` from the notification
store's existing `seen_at` cursor. It creates **no execution or run state**,
owns no storage, and a control asserts it contains no write call. Unread state
is durable because the notification store is; it clears through
`markLaneNotificationsSeen`, the mechanism that already treats opening a lane as
the acknowledgement.

Only completed provider output counts — `complete`, `failed`, `abandoned`,
`needs_input`. A governed-action status change is activity, and activity belongs
in lane history.

**Two questions that must not collapse:**

| | answers |
| --- | --- |
| `has_unread_output` | Is there new provider output I have not seen? |
| `director_category` | Do I have an obligation? |

A completed lane is unread with `requires_director: false` — useful work that
wants reading and no reply. A `needs_input` lane is unread *and* an obligation,
reported as two separate facts, and stays an obligation after its output is
read. Presentation is a dot plus a `· New` suffix and a bold title; colour alone
is explicitly not a treatment.

Live cross-check: 141 notifications, 0 unseen, 102 output-class records, 0
unseen — and the view reports 0 unread across 9 lanes. Derivation and store
agree exactly.

## Limitations

* Dispatch is planned, keyed for idempotency and bounded, but not enabled.
* Findings constrain lanes globally, not per lane: every candidate carries the
  same constraint set until a per-lane finding index exists.
* Capacity is passed in rather than probed by the status row, so the live
  posture reports `seats_available: null` until a caller supplies it.
* The live unread transition is certified in-harness; the live store currently
  holds nothing unseen, so there was no real unread→read transition to observe
  without fabricating one in the Director's own read state.
