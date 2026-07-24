# Engineering Operations Center

*The foundational doctrine for how engineering execution is operated inside Vacilando.*

A product design document — no implementation, code, APIs, prompts, providers, or runtime architecture. This is a **separate product track from Director.** Director is counsel over engineering *thinking*; the Operations Center is control over engineering *execution*. They share almost nothing in posture, and this document deliberately does not inherit Director's doctrine except where a principle genuinely transfers. Optimize for timeless product thinking over today's implementation.

---

## The thesis

Today the operator spends a large part of the day *being the operating system*. They switch between editors, chat tools, terminals, worktrees, branches, and localhost servers — not to contribute engineering value, but to reconstruct answers a machine should already hold: *Is this still running? Is it done? Is it blocked? Which worktree owns this? Which localhost is which branch? Does this need me? Can I start another? Which slot is idle? What's eating memory? What's at risk?*

Answering those questions by hand *is* the problem. Every one of them is machine-answerable, and the human answering them is a person doing a computer's job.

> **The operator should manage engineering *work*. Never provider sessions, processes, ports, branches, or slots. Vacilando should be the operating system for engineering execution — and, like a good operating system, make its own machinery invisible.**

You run programs on an OS; you do not manage processes, memory pages, and schedulers by hand. The Engineering Operations Center is that OS for engineering work: it schedules work onto capacity, tracks each piece's true state, manages resources, surfaces only what needs a human, and reclaims what's wasted. The operator watches *work*, not machinery — and mostly does not watch at all.

The single operational sin this product exists to end is **the human reconciling machine state.** (The canonical example, drawn from real operation: a dev server reported "stopped" while it was still listening, pinning capacity — the operator had to check `lsof` by hand to learn the truth. A system that makes a human verify its own reported state has failed at its one job.)

---

## Part I — Operational philosophy

Five commitments, from which everything follows:

1. **Manage work, not the substrate.** The operator's unit is a *piece of engineering work*. Slots, engines, branches, servers, and providers are interchangeable machinery the work runs *on* — surfaced only when the machinery itself is the problem.
2. **The system owns operational truth.** The operator never reconciles state. Every reported state is *verified against ground truth*, continuously, and is honest by construction. A record that disagrees with reality is a bug, not the operator's chore.
3. **Ambient by default; interrupt only when needed.** Healthy, progressing work is glanceable and silent. The operator is pulled in only for *needs-you* or *at-risk*. This is the inverse of Director's economy: operationally the operator *wants* omniscient ambient state — but they want to *spend* attention only on the two things that require them.
4. **Minimize operational attention; maximize engineering attention.** The product's success metric is how *little* of the operator's attention operations consume. Near-zero on operations; near-all on engineering.
5. **Self-heal the reclaimable; surface the rest honestly.** Idle and leaked resources are reclaimed automatically. Problems the system cannot fix are surfaced plainly, never hidden and never faked.

Note the contrast with Director: Director is *maximally restrained* (it protects the operator's attention by staying silent); the Operations Center is *maximally informative but minimally demanding* (it always knows and shows the state, but rarely requires the operator to act). Restraint there; omniscience-without-nagging here.

---

## Part II — Challenging the abstractions

Today's concepts are implementation leaking into the product. Each has a timeless thing underneath it that the operator should think in instead.

| Today's concept | What it really is | What the operator should think in |
|---|---|---|
| **Slot** (numbered lane 1–6, fixed, a port) | a *materialized unit of capacity* | **Headroom** — is there room for more work? (never a slot number) |
| **Worker** (a Claude/Cursor agent) | an *engine executing a piece of work* | **Work** — the piece of engineering; the engine is an attribute of it |
| **Branch / Worktree** | *isolation* — a private workspace so work doesn't collide | (nothing) — isolation is guaranteed and invisible |
| **Dev server / localhost:port** | a *preview* — a way to *see* the running work | **"Show me this work"** — addressed by the work, never the port |
| **Provider (Claude / Cursor / ChatGPT)** | an *interchangeable engine* (a driver) | (nothing) — the engine disappears behind the work |

And the deeper units the brief asks for, defined timelessly:

- **Work** — the operational unit the operator manages: a bounded piece of engineering with a goal, a state, a health, and an attention flag. (Its Director-side face is a *mission*; the Operations Center is where a mission *runs*.) This replaces "worker" as the thing tracked.
- **Capacity** — the amount of work the system can sustain *concurrently without degrading* — derived from the machine's real resources, not a fixed count of lanes. Capacity shrinks when the machine is thrashing and grows when it's idle. Replaces "slots."
- **An Engine** — the interchangeable execution backend a piece of work runs on (today: a provider process). An attribute of work, not a tracked entity. Replaces "worker/provider."
- **Isolation** — the guarantee that each piece of work has a private workspace. A property, not a thing to manage. Replaces "branch/worktree" as an operator concern.
- **A Preview** — a way to *see* running work, addressed by the work itself. Replaces "which localhost is which branch."
- **Progress** — measurable forward movement of a piece of work toward acceptance. Distinct from mere *activity* (running ≠ progressing).
- **Throughput** — the rate at which work reaches accepted/closed. The system's real output.
- **Readiness** — two kinds: *work-readiness* (is this piece ready to execute — owned by Director) and *system-readiness* (is there capacity to run it now — owned here).
- **Operational Attention** — the scarce human resource the Operations Center exists to *conserve*: the operator's attention should be spent on engineering, essentially never on operations.
- **Flow** — how engineering moves through the system: prepared → admitted → executing → verifying → complete → accepted → closed, with discoveries looping back. The Operations Center manages the *flow*, not the individual engines.

The reframe in one line: **the operator manages a portfolio of *work in flight*; everything that today has a number, a port, or a brand name is substrate the work runs on.**

---

## Part III — The operational state model

*(Answers Q10 — the state vocabulary.)* Every piece of work has exactly one **state**, and the states must be *distinct and honest* — the operator relies on them to decide whether to look, wait, or act. The lifecycle:

```
  ready ──▶ running ──▶ verifying ──▶ complete ──▶ accepted ──▶ closed
             │  ▲          
   (stalled) │  │          
   (blocked) ▼  │          
   (waiting) ───┘          
   (needs operator) ──────▶ (back to running once answered)
```

Precise definitions, and the distinctions that matter:

- **ready** — prepared and provisioned, not yet executing. (Work-ready *and* admitted to capacity, awaiting start.)
- **running** — an engine is actively executing. This is an *operational* fact: something is executing. It says nothing about progress.
- **progressing** — running *and* advancing (state is moving toward the goal). **Running vs. progressing** is the first critical distinction: *running* answers "is something executing?"; *progressing* answers "is it getting anywhere?" A run can be running-but-not-progressing.
- **stalled** — running but not progressing (looping, spinning, hung). An *execution-health* problem, not a state the work chose. Distinct from blocked (nothing external stopped it — it's just not moving).
- **blocked** — cannot progress because of an *external* dependency: a failing test, a missing resource, an error it can't pass. Waiting on *the world*, not the operator. Distinct from *waiting* (blocked = can't; waiting = paused-by-choice) and from *needs-operator* (blocked = the world; needs-operator = a human).
- **waiting** — paused, not executing, durably expecting to resume (e.g., deliberately held). Distinct from blocked (it *could* run) and running (it isn't).
- **needs operator** — progress requires a *human*: a decision, an approval, an answer only the operator can give. **This is the one state that should actively interrupt.** Distinct from blocked (the world) — this is specifically "waiting on *you*."
- **verifying** — execution finished; the work is being *checked* against acceptance (tests, review, evidence). **Not done — being proven.**
- **complete** — the work finished *and self-verified*: it did what it set out to do, evidence in hand — but the operator has not yet signed off. **Complete vs. accepted** is the sovereignty distinction: complete is the *system's* claim; accepted is the *operator's* judgment.
- **accepted** — the operator has signed off; the work is good.
- **closed** — accepted *and* wound down: isolation released, capacity freed, artifacts preserved, resources reclaimed. The terminal, tidy state. **Accepted vs. closed**: accepted is a judgment; closed is the cleanup that follows it (and the moment capacity returns to the pool).

Three honesty rules on the state model, each a scar from real operation:
- **A state must never disagree with reality.** "Complete" while it's still running, or "stopped" while it's still listening, is the cardinal sin. State is *verified*, not *recorded-and-trusted*.
- **Progress is measured, not assumed.** "Running" is not "fine." The system distinguishes activity from advancement so a stalled run cannot masquerade as a healthy one.
- **The human-blocking state is singular and loud.** Only *needs-operator* pulls the operator in; everything else resolves without them or waits quietly.

---

## Part IV — Execution lifecycle and flow

Execution is a **phase, not a terminal handoff.** Work flows:

1. **Prepared** (Director) — a mission reaches work-readiness upstream.
2. **Admitted** — the Operations Center admits it to capacity *only if there is real headroom* (Part VI). Otherwise it queues. Admission is where the system protects itself from overload.
3. **Executing** — running/progressing on an engine, in isolation, with a preview available on demand.
4. **Verifying** — checked against acceptance.
5. **Complete → Accepted** — self-verified, then operator-approved.
6. **Closed** — wound down, capacity returned.

Two flow properties matter more than any single run:

- **Discoveries loop back.** When execution turns up something that bears on the *understanding* (a broken assumption, a scope change, a better approach), it does not stay in execution — it returns to Director as a reopened question (per the Shared Understanding Model's "execution continues the understanding"). The Operations Center's job is to *route* the discovery: an implementation detail stays with the engine; a load-bearing discovery flows back. It manages the flow across the Director/execution seam without adjudicating the engineering itself.
- **The system optimizes throughput, not activity.** The output that matters is work reaching *accepted/closed*, not engines being busy. A system with six busy engines and nothing completing is failing; one with two engines and steady completion is winning. Throughput, work-in-progress limits, and bottleneck identification are the lens (Part IX) — a lean-flow view, not a utilization view.

---

## Part V — The two healths

*(Answers Q6 and Q7.)* There are **two orthogonal healths**, and conflating them is a classic operational failure.

**Operational health** — the fitness of the *system* to run work:
- Is there capacity / headroom?
- Is the machine thrashing (resource pressure)?
- Are engines responsive?
- Is isolation intact (no cross-contamination)?
- Are previews serving?
- **Is the system's reported state true?** (State-reconciliation health — the antidote to the pidfile leak.)
- Are there leaked or orphaned resources pinning capacity?

**Execution health** — the fitness of a *piece of work* to complete:
- Is it progressing, or stalled/looping?
- Is it likely to reach acceptance, or drifting?
- Is it blocked on the world?
- Is it consuming disproportionate resources for its value?
- Has it exceeded a sane time/effort envelope?

These are independent. A run can be **execution-healthy on an operationally-sick system** (progressing well while the machine thrashes and starves everything) or **operationally-fine but execution-sick** (plenty of capacity, but this run has been stalled for an hour). The Operations Center must report them *separately* — "the system is under pressure" is a different message, with a different remedy, than "this work is stuck." Blending them ("work blocked" when the machine is merely thrashing) sends the operator to fix the wrong thing.

---

## Part VI — The capacity model

*(Answers "Capacity," "can I start another," "which slot is idle.")* Capacity is **not a fixed count of lanes.** It is *the amount of concurrent work the machine can sustain without degrading*, derived continuously from real resources (compute, memory, and actual thrash pressure). This directly fixes the lived failure of a machine pinned at extreme load running more heavy work than it could bear.

- **Headroom** = sustainable capacity − active work. The operator's question "can I start another?" is answered by headroom, at a glance, never by counting idle slots.
- **Admission** is gated by *real* headroom: a new piece of work is admitted only if it won't degrade the whole. If capacity is exhausted, work **queues** rather than thrashing everything. The system may *refuse* to overload itself — and say so plainly.
- **Capacity is dynamic.** A thrashing machine has *less* capacity than an idle one; the number moves with reality. A fixed "6 slots" is a fiction that either wastes an idle machine or thrashes a busy one.
- **Reclamation creates headroom.** Idle engines, orphaned servers, and leaked resources are reclaimed automatically (Part IX) to return capacity to the pool — the generalization of the memory-manager reclaim, made a first-class capacity function rather than a background patch.

The operator never asks "which slot is free." They see *headroom* and *what's consuming capacity*, and start work when there's room — or let the system queue it.

---

## Part VII — Operator attention and interruption

*(Answers Q3, Q4, Q5, Q13.)* The operator's attention is the resource being conserved. The model:

**What the operator always knows without asking** (the ambient set — the antidote to the day's twelve questions):
- Per piece of work: its **state**, its **health**, and whether it **needs them**.
- System-wide: **headroom** (room for more), **the attention queue** (what needs them, now), and **the at-risk list** (what's degrading).
- On demand, one gesture away: a **preview** of any running work, and the **truth** behind any state (never requiring reconciliation).

**What stays ambient** (glanceable, never demanding): everything healthy and progressing. The operator should be able to *not look* for long stretches and trust that silence means health.

**When Vacilando interrupts** — only two triggers, because interruption spends the attention the whole product protects:
1. **Needs-operator** — a piece of work cannot progress without a human decision/approval. The one routine interrupt.
2. **At-risk** — operational or execution health is degrading toward failure (a run stalled past its envelope, capacity exhausted, a leak the system can't reclaim, an engine unresponsive). A push, because silence here would be negligence.

Everything else is **pull, not push**: *complete / needs-acceptance* is surfaced as ready-for-you (a gentle pull, not an alarm — the work is done, not urgent); *progressing* is silent; *blocked-on-the-world* self-resolves or escalates to at-risk only if it persists.

**What the operator should NEVER manually monitor** (Q13) — because every item is machine-answerable and monitoring it by hand is the problem itself:
- Whether an engine/process is alive.
- Which port belongs to which work.
- Which worktree/branch owns which piece of work.
- Memory or resource consumption.
- Whether an engine has finished.
- Whether there's capacity to start more.
- Whether a server or resource has leaked.
- Whether reported state is actually true.

If the operator ever has to check any of these by hand, the Operations Center has failed at that point, and that failure is a defect to fix — not an operator responsibility.

---

## Part VIII — The provider abstraction

*(Answers Q9 — how providers disappear.)* A provider (Claude, Cursor, ChatGPT, whatever comes next) is an **engine — an interchangeable driver** that executes a piece of work. It is an *attribute* of work, not a thing the operator tracks. The operator names the work and its intent; the system runs it on a capable engine; the operator asks *"is the work done?"* — never *"is Claude done?"*

Provider identity surfaces in exactly two cases, and no others:
1. **Preference** — when *which* engine matters for a piece of work (a capability, a cost, a known strength), the operator may choose; otherwise the system picks. A rare, deliberate choice, not a default concern.
2. **Engine failure** — when the engine *itself* is the problem (unresponsive, errored), which is an *execution-health* event surfaced as "this work's engine needs attention," with the remedy (retry on the same or a different engine) handled by the system where possible.

Everything else about the provider — its session, its process, its progress protocol — is machinery beneath the work. This is also how the product survives the decade: providers will churn, split, and be replaced; if the operator thinks in *work*, the engine underneath can change entirely without changing how they operate. **The brands disappear; the work endures.**

---

## Part IX — Operational intelligence that emerges automatically

*(Answers Q12.)* The Operations Center should *derive* the operational truths the operator currently computes by hand, and act on the ones it can:

- **Headroom** — sustainable capacity minus active work, live.
- **The attention queue** — the ordered set of work that needs the operator, so "does anything need me?" is always already answered.
- **The at-risk list** — work or system health degrading toward failure, before it fails.
- **Throughput** — the rate work reaches accepted/closed; the real output signal.
- **Bottleneck identification** — what is actually constraining flow (capacity? a stalled run? verification? operator attention?), so the operator addresses the true constraint rather than a symptom.
- **Waste detection and reclamation** — idle engines, orphaned servers, leaked resources, abandoned isolation — found and reclaimed automatically to return capacity. (The generalized cure for the leaked-server-pinning-capacity failure.)
- **State reconciliation** — continuous verification of every reported state against ground truth, so the system's picture is *always* true and the operator *never* reconciles. This is the deepest piece of operational intelligence: the system that checks itself. It is what would have prevented the "stopped but still running" defect entirely — not by fixing one report, but by never trusting a record over reality.

Operational intelligence is *derived and acted upon*, not merely displayed. A dashboard that shows a leak but doesn't reclaim it has only relocated the operator's manual work onto a prettier screen.

---

## Part X — Director and the Operations Center

*(Answers Q11.)* Two planes, one flow of work:

- **Director** owns *preparation and counsel* — the upstream, thinking phase. It is restrained, advisory, and never operational.
- **The Operations Center** owns *execution and operations* — the downstream, running phase. It is informative, controlling, and never counsel.

The **seam** is the mission: when Director's work reaches readiness, it enters the Operations Center as a piece of work to run; the Operations Center admits it to capacity, executes it, and tracks its state to acceptance. **Discoveries flow back:** an execution discovery that bears on the understanding is routed by the Operations Center *back* to Director as a reopened question. Neither plane adjudicates the other's domain — the Operations Center never advises on the engineering, and Director never manages processes.

The posture difference is the important product truth: **Director is quiet and counsels; the Operations Center is omniscient and controls.** They must not be built with the same instincts. An Operations Center that "counsels" (withholds state to avoid overloading you) would be broken; a Director that "controls" (drives the operator through a process) would be broken. Same operator, two products, opposite defaults — bound by a shared unit of *work* and a shared respect for the operator's attention and sovereignty.

---

## Part XI — Product principles

1. **The operator manages work; never the substrate.**
2. **The system owns operational truth; the operator never reconciles state.** A record that disagrees with reality is a defect.
3. **Every state is honest and distinct.** Never "complete" while running, never "stopped" while listening.
4. **Progress is measured, not assumed.** Running is not fine; activity is not throughput.
5. **Ambient by default; interrupt only for needs-you or at-risk.**
6. **Minimize operational attention; maximize engineering attention.** The success metric is how little the operator spends on operations.
7. **Capacity is real, dynamic, and resource-derived — never a fixed count of lanes.**
8. **Self-heal the reclaimable; surface the un-healable honestly; fake nothing.**
9. **Providers are interchangeable engines that disappear behind the work.**
10. **Isolation is guaranteed and invisible.**
11. **Operational and execution health are reported separately.**
12. **A discovery is not the end of understanding; execution is a phase, and load-bearing discoveries flow back.**

---

## Part XII — Failure modes

- **The dashboard trap.** The Operations Center becomes another screen the operator must monitor — reintroducing the manual OS in prettier form. *Guard:* the product's job is to *answer* the questions and *act*, not to display them for the human to answer. Success is the operator looking *less*, not at a nicer board.
- **False state — the cardinal sin.** Reporting running/stopped/ready/complete dishonestly (the pidfile leak). *Guard:* verify every state against ground truth; never trust a record over reality.
- **Provider leakage.** The operator ends up thinking in Claude/Cursor sessions again. *Guard:* the engine must stay beneath the work; any surface that names a provider by default is a leak.
- **Alert fatigue.** Interrupting too often → the operator tunes out → the real *needs-you* is missed. *Guard:* only two interrupt triggers; everything else is pull.
- **Capacity by fiat.** Fixed slot counts that don't match the machine — wasting an idle machine or thrashing a busy one. *Guard:* capacity derived from real resources, dynamic.
- **Resource leaks pinning capacity.** Orphaned servers/worktrees/engines the system doesn't reclaim (lived, repeatedly). *Guard:* reclamation is a first-class capacity function, not a background afterthought.
- **Silent failure.** Work fails and the operator isn't told. *Guard:* failure is an at-risk/needs-you event, never swallowed.
- **Conflating the two healths.** A thrashing machine reported as "work blocked," or a stalled run reported as "system fine." *Guard:* separate reporting, separate remedies.
- **Operational-attention creep.** The system quietly asks the operator to manage the substrate again — pick a port, kill a process, choose a slot. *Guard:* every such ask is a defect against Principle 1.
- **Utilization worship.** Optimizing for busy engines instead of completed work. *Guard:* throughput, not utilization, is the metric.
- **The omniscience-without-honesty failure.** The Operations Center, unlike Director, is *supposed* to always know — so its deepest failure is not silence but *confident wrongness*. An operator who learns the state can be wrong must reconcile by hand forever, and the whole product collapses back into the problem it was built to end.

---

## The decade view

Providers will be replaced. Editors will change. The word "slot" will age out, and "worktree" and "localhost:3011" with it. What will not change is that a person is trying to move engineering work through a system and needs to know, without being the system: *what's running, what's done, what needs me, and is there room for more.*

Build the Operations Center around **work and its true state**, with the machinery — engines, capacity, isolation, previews — invisible beneath it and honest by construction, and it will still be right when every provider and every tool underneath it has been swapped out. The measure of success is simple and permanent: **the operator stops being the operating system, and gets their day back for engineering.**
