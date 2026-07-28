# Sprint Runtime — Vacilando Alpha

*The live operational record for the Vacilando initiative. The one page to read before continuing this work. Governed by [SPRINT-RUNTIME.md](SPRINT-RUNTIME.md); populated only from durable evidence.*

- **Owner:** Director · **Operator:** Kelly · **Status:** active (entering sustained Alpha operation)
- **Worktree / branch:** `/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def` / `agent/claude/6-vacilando-os-product-def`
- **Server:** Vacilando runtime at `http://127.0.0.1:3020` (dev; `node lib/vacilando-server.mjs --port 3020` from `scripts/local-dev/`, node22)
- **Opened:** 2026-07-25 · **Last updated:** 2026-07-25

---

## Overall Progress

**Current phase:** Vacilando Alpha Operations. **Overall status:** operational and entering sustained use — the product prepares, executes, verifies, reviews, and closes real engineering work end-to-end, and stays present throughout. Feature development is ready to pause in favour of operating it.

**Confidence:** evidence-qualified. The realized behaviors are backed by tests, live lifecycle runs, and certification documents. Remaining Alpha assumptions are visible and named under Risks — notably that scale across concurrent capabilities, Cursor worker behavior, and cross-provider context continuity are not yet proven, and that Operational Learning exists only as doctrine plus a manual practice.

---

## Product Health

| Dimension | Status | Why |
|---|---|---|
| Engineering Leadership | **Healthy** | Director acts as counsel — confidence-qualified readiness + attempt-history + frontier, validated against real conversations ([DIRECTOR-PRODUCT-VALIDATION.md](DIRECTOR-PRODUCT-VALIDATION.md), [VACILANDO-ALPHA.md](VACILANDO-ALPHA.md)). |
| Mission Integrity | **Healthy** | Operator-approved intent controls execution; the Understanding stage surfaces Director's questions before preparation; the approval snapshot binds objective + acceptance ids. |
| Operations | **Healthy** | Work-centric Engineering Operations loop (`operations.mjs`) drove full lifecycles live (Access & Roles, Communications) without the operator managing a provider/branch/port. |
| Shared Understanding | **Healthy** | Visible, curated reliance surface (`shared-understanding.mjs`) — status × authorship, frontier, knowingly-carrying, set-aside — durable across restart. |
| Worker Runtime | **Needs Attention** | Governed runner is a hard guarantee and direct-Claude delivery is certified, **but** routing long commands through it remains advisory, and Cursor behavior is delivered structurally yet uncertified ([qa/worker-operating-policy/CERTIFICATION.md](qa/worker-operating-policy/CERTIFICATION.md)). |
| Operational Learning | **Needs Attention** | Only the doctrine ([OPERATIONAL-LEARNING.md](OPERATIONAL-LEARNING.md)) and a **manual** observation practice ([FRICTION-LOG.md](qa/alpha-operations/FRICTION-LOG.md)) exist; the learning runtime is not realized. Not Healthy by definition. |

---

## Phase Tracker

Completion is marked only where durable evidence exists (tag, commit, cert doc, or live run).

| Phase | Status | Evidence |
|---|---|---|
| Architecture & doctrine (10 foundation docs) | **Done** | tag `vacilando-architecture-v1` (`cef5827c6`); index `VACILANDO-PRODUCT-ARCHITECTURE.md` |
| Director Product Validation | **Done** | `DIRECTOR-PRODUCT-VALIDATION.md` |
| Confidence-qualified counsel (P1) | **Done** | `counsel.mjs`; promoted, tag `vacilando-alpha` (`468515926`) |
| Visible Shared Understanding (P2) | **Done** | `shared-understanding.mjs`; promoted |
| Engineering Operations (P3) | **Done** | `operations.mjs`; promoted; live lifecycle runs |
| Mission Intent Integrity | **Done** | promoted; on `origin/staging` |
| Understanding-before-preparation | **Done** | Understanding stage; `FRICTION-LOG` [VALIDATED]; on `origin/staging` |
| Worker Operating Policy | **Done** | `WORKER-OPERATING-POLICY.md`; `command-budget.mjs`; merge `ca1bcf9e7` (promoted) |
| Direct-worker certification | **Done** | `qa/worker-operating-policy/CERTIFICATION.md`; fresh-claude Case A/B; promoted |
| Ready-gate coherence | **Done** | commit `45c78a523`; browser-verified; *promoting in this mission* |
| Operational Presence | **Done** | `presence.mjs`; commit `147bd822e`; live end-to-end; `FRICTION-LOG` [VALIDATED]; *promoting in this mission* |
| Sprint Runtime specification | **Done** | `SPRINT-RUNTIME.md`; commit `c0ef8856b`; *promoting in this mission* |
| Alpha Operations | **In Progress** | current phase — operate real capabilities, accumulate observations |

---

## Current Work

Operating real engineering capabilities through Vacilando and collecting product-centered Operational Observations. The next move is the **operator's**: choose the next genuine capability to operate. No implementation phase is open.

## Next Planned Work

Operate real capabilities and observe friction — **not** a new implementation phase. Recommended operating sequence (genuine Alloy work, not demos):

1. **Communications** — the next capability already scoped ([qa/alpha-operations/KICKOFF-communications.md](qa/alpha-operations/KICKOFF-communications.md)); an Alpha run already surfaced a real consent-enforcement gap (see Mission History).
2. **Scheduling**
3. **Financials**
4. Other genuine Alloy work as it arises.

Fixes to friction come only after observations accumulate and the operator decides — never pre-emptively.

---

## Mission History

Significant executed missions (not every validation run). Append-only.

- **Access & Roles — Product Realization validation** — 2026-07-24 — outcome: P1–P3 counsel / shared-understanding / operations validated against this capability with a real provider — evidence: `VACILANDO-ALPHA.md`, tag `vacilando-alpha` — acceptance: accepted (promoted) — follow-up: none.
- **Worker Operating Policy — direct-worker certification** — 2026-07-24 — outcome: fresh, uncoached `claude` workers handled a progressing (Case A) and a stalled/failing (Case B) command through the governed runner, ending in valid terminal states with no operator intervention — evidence: `qa/worker-operating-policy/CERTIFICATION.md` — acceptance: accepted (promoted, merge `ca1bcf9e7`) — follow-up: Cursor behavioral certification (open, see Risks).
- **Access & Roles — current-model inventory** — 2026-07-25 — outcome: fresh worker produced a file/line-grounded reference doc; no code changed; correctly held `ki1` out of scope — evidence: live lifecycle run (Ready→Executing→Review→Accept→Close), acceptance gate `needs_operator` then operator-accepted — acceptance: accepted, closed — follow-up: none (validation run; deliverable retained as local QA evidence, not committed).
- **Communications — current-model inventory** — 2026-07-25 — outcome: fresh worker inventoried channels/templates/delivery/opt-out and surfaced a genuine finding — *consent-before-send is enforced only for broadcast announcements and is dark (flag-off) for one-to-one sends; recipient STOP handling is coded but unwired* — evidence: live lifecycle run through the reworked presence + gate; operator-accepted — acceptance: accepted, closed — follow-up: the consent-gap finding is a candidate for a future real Communications mission (not yet authored).

Full durable record of each mission lives in the Product Definition runtime's `mission_history` for its capability; the above references it.

---

## Deliverables Completed

Append-only; each carries evidence.

- **Ten-document architecture foundation** — evidence: tag `vacilando-architecture-v1` (`cef5827c6`); index `VACILANDO-PRODUCT-ARCHITECTURE.md`.
- **Product Realization P1–P3 → Vacilando Alpha** — evidence: tag `vacilando-alpha` (`468515926`); `VACILANDO-ALPHA.md`; `counsel.mjs` / `shared-understanding.mjs` / `operations.mjs`.
- **Worker Operating Policy + direct-worker delivery/guard** — evidence: `WORKER-OPERATING-POLICY.md`, `command-budget.mjs`, `qa/worker-operating-policy/CERTIFICATION.md`; merge `ca1bcf9e7` (promoted).
- **Ready-gate coherence** — evidence: commit `45c78a523`; browser-verified.
- **Operational Presence** (incl. the missing *Launching* state) — evidence: `presence.mjs`; commit `147bd822e`; live end-to-end.
- **Canonical Sprint Runtime specification** — evidence: `SPRINT-RUNTIME.md`; commit `c0ef8856b`.
- **This live Sprint Runtime instance** — evidence: this document.

---

## Evidence

**The Evidence Law:** nothing above reads Done/Accepted without a concrete, checkable fact recorded at the thing that changed. What counts here: passing tests, live lifecycle runs, operator confirmation/acceptance, certification documents, milestone tags.

Index of proof:
- **Tests:** mission-runtime **112/112**, Vacilando regression **26/26** (node22; `scripts/local-dev/tests/`).
- **Milestone tags:** `vacilando-architecture-v1` (`cef5827c6`), `vacilando-alpha` (`468515926`).
- **Certification / operating docs:** `VACILANDO-ALPHA.md`, `WORKER-OPERATING-POLICY.md`, `qa/worker-operating-policy/CERTIFICATION.md`, `qa/alpha-operations/FRICTION-LOG.md`.
- **Live lifecycle runs:** Access & Roles and Communications, each Ready → Launching → Executing → Reviewing → Accepted → Closed on `:3020`.

---

## Decisions Frozen

Append-only. A decision that changes is superseded, never rewritten.

1. **The operator is the author of the work.** — *Reason:* Vacilando aims at the operator's independence, not their dependence. — *Implications:* the system may understand deeply and propose rarely, but never authors the decision.
2. **Director is counsel.** — *Reason:* the product's value is improving the operator's engineering thinking, not answering. — *Implications:* Director earns attention, stays mostly silent, disagrees when it must, never owns the decision.
3. **Operator-approved intent controls execution.** — *Reason:* a mission must faithfully carry what the operator approved. — *Implications:* the approval snapshot binds objective + acceptance; scope is not silently substituted.
4. **Conversations and providers are disposable transport.** — *Reason:* durable value (understanding, history, relationship) belongs to Director. — *Implications:* it survives every model, tool, and conversation beneath it.
5. **The operator manages work, not provider sessions.** — *Reason:* the operator should stop being the operating system. — *Implications:* providers, processes, ports, and branches disappear beneath the work.
6. **Completed work requires evidence and acceptance.** — *Reason:* optimism is not completion. — *Implications:* no status becomes Complete/Accepted without recorded proof and an operator acceptance.
7. **Long-running workers own forward progress.** — *Reason:* "still running" is not a valid state to end a turn on. — *Implications:* budgets by class; at soft diagnose, at hard corrective action; never hand monitoring back.
8. **The operator should never have to infer what Director needs next.** — *Reason:* the next action must always be obvious. — *Implications:* questions are shown, presence is expressed, gates carry only actionable content.
9. **Operational observations describe the product, never the person.** — *Reason:* friction is evidence of the product's shortcomings. — *Implications:* the subject of every observation is Vacilando; the operator's actions are data, not judgments.

---

## Risks

Currently evidenced; visible until retired.

- **Cursor worker behavior is delivered but not behaviorally certified.** — *Watch:* no headless agentic Cursor path exists to run a live stalled-command exercise; delivery parity only (`qa/worker-operating-policy/CERTIFICATION.md`).
- **Direct-worker governed-runner selection is partly advisory.** — *Watch:* the runner is a hard guarantee only for commands routed through it; a direct worker is instructed but not mechanically forced.
- **Scale across concurrent capabilities is unproven.** — *Watch:* validation has run one initiative at a time; concurrent missions in one worktree can contend on files.
- **Cross-provider context continuity is partially unproven.** — *Watch:* resumable turns exist, but continuity across an actual provider handoff has not been exercised end-to-end.
- **Operational observations are still recorded by hand.** — *Watch:* the FRICTION-LOG is manual; nothing yet guarantees friction is captured rather than forgotten.
- **Provider/server ground-truth reconciliation may be incomplete outside mission execution.** — *Watch:* state reconciliation is strongest inside the mission loop; ambient drift outside it is less certain.

---

## Open Questions

- What is the honest boundary of "the operator manages work, not providers" when a worker genuinely stalls — how much autonomous recovery vs. operator escalation? (informs Worker Runtime maturity)
- Should un-adopted acceptance suggestions ever become a one-click "add these checks" affordance, or stay a prepare-again scope change? (informs the Ready gate; deferred by design)
- What is the smallest real signal that turns an Operational Observation into authorized improvement work, without taking authorship from the operator? (the Operational Learning trigger)

---

## Operational Observations

The accumulation point for [Operational Learning](OPERATIONAL-LEARNING.md). Accumulate; do not implement from here.

- **Observation:** Director declared it had questions but did not show them. · **Evidence:** Access & Roles, questions buried in the gap report. · **Expectation:** ask the question immediately. · **Root Cause:** no operator-visible Understanding stage. · **Candidate Improvement:** derive + show the questions before preparation. · **Status:** **Implemented** (Understanding stage; `FRICTION-LOG` [VALIDATED]).
- **Observation:** Preparation appeared before understanding felt complete. · **Evidence:** same run. · **Expectation:** prepare only after questions are answered. · **Root Cause:** stage computed "preparing" the moment a package existed. · **Candidate Improvement:** gate the experience on a derived stage. · **Status:** **Implemented**.
- **Observation:** Operator intent failed to control the mission. · **Evidence:** a full multi-paragraph scope became one "decision"; the templated objective stayed in charge. · **Expectation:** a substantial scope defines the objective. · **Root Cause:** the compiler templates the objective and uses intent only for matching. · **Candidate Improvement:** let a substantial scope define the objective, not just be recorded. · **Status:** **Open** (partially addressed; the "scope defines objective" part remains).
- **Observation:** Policy present on disk but not consumed. · **Evidence:** a fresh direct `claude` answered `NO_POLICY_LOADED` though `.alloy-agent-instructions.md` held the policy. · **Expectation:** a directly-opened worker receives its policy. · **Root Cause:** Claude loads `CLAUDE.md`, not that file; no delivery seam. · **Candidate Improvement:** a SessionStart delivery hook. · **Status:** **Implemented** (certified).
- **Observation:** Work read "running" with no visible worker attachment. · **Evidence:** ~30s of dead air after Start on a real run. · **Expectation:** watch the worker come online. · **Root Cause:** no *Launching* state; presence keyed on coarse status. · **Candidate Improvement:** honest launch phases + a Launching presence. · **Status:** **Implemented** (Operational Presence; `FRICTION-LOG` [VALIDATED]).
- **Observation:** Optional acceptance suggestions appeared as unresolved blockers. · **Evidence:** "Director advises — NOT YET DECIDED: N to confirm" with no affordance at the Ready gate. · **Expectation:** clearly optional, not a blocker. · **Root Cause:** gap-analysis suggestions surfaced as a pending decision. · **Candidate Improvement:** reframe as optional; confirm criteria after the run. · **Status:** **Implemented** (Ready-gate coherence).
- **Observation:** The review experience summarized the deliverable instead of exposing the artifact — the operator could not actually review or approve the work. · **Evidence:** Slice 1 of the Access & Identity discovery produced a complete 46 KB deliverable (`qa/missions/access-roles-150aa5da29.md`), but review states + session summaries only *described* it, and its sibling validation outputs were even discarded from git as disposable; the operator had to explicitly request the artifact before Slice 2. · **Expectation:** for an engineering mission the artifact *is* the product — the review state should render the complete deliverable (read / search / copy / download / ask-questions) **before** requesting approval. · **Root Cause:** the review experience is summary-first, has no artifact renderer, and mission outputs were treated as disposable rather than the product. · **Candidate Improvement:** review states render the full deliverable inline with copy/download and question-ability, ahead of the approval request; mission outputs are durable product, not disposable QA. · **Status:** **Open** (accumulation point — a one-off rendered review package was produced as a stopgap this turn; not yet a product change).

---

## Session Handoff

*Written cold — a fresh engineer/session should continue from here without rereading the conversation.*

**Where things stand.** Vacilando is functionally complete for Alpha and entering sustained operation. All realization phases through Operational Presence are done; the Sprint Runtime specification and this live instance are in place. Feature development is ready to pause.

**Next action.** Operate a real capability end-to-end through Vacilando (start with **Communications** — kickoff at `qa/alpha-operations/KICKOFF-communications.md`) and record any friction as an Operational Observation (product-centered; do not implement fixes on the spot). Do **not** open a new implementation phase.

**Owner of the next move:** the operator (choose and start the capability).

**State to continue.** Worktree `/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def`, branch `agent/claude/6-vacilando-os-product-def`. Start the server from `scripts/local-dev/`: `node lib/vacilando-server.mjs --port 3020` (node22 at `~/.nvm/versions/node/v22.21.1/bin/node`); open `http://127.0.0.1:3020/#/director`. Tests: `node --test scripts/local-dev/tests/mission-runtime.test.mjs` and `node scripts/local-dev/tests/test-vacilando.mjs`.

**Warnings.** (1) Access & Roles is the **one seeded capability** — it re-seeds pristine and cannot be permanently deleted without editing the seed list in code. (2) The toolkit's slot-6 metadata may point at a stale sibling worktree — resolve worktrees by **name**, not slot number. (3) A Rooms & Programs RFC commit that landed on this branch during realization was **excluded** from Vacilando promotion and preserved on the local branch `salvage/rooms-programs-rfc`; it belongs to a separate initiative. (4) Update **this** Sprint Runtime at the start of each session that advances the work — change only affected sections, never lose history.
