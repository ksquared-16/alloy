# Operating Model Validation — end-to-end mission simulations

> Status: validation, not design. **No implementation.** Assumes the current
> architecture is correct unless a simulation proves otherwise. No new runtime is
> introduced unless a simulation exposes a responsibility that cannot reasonably
> belong to an existing runtime.

Actors under test: **Kelly · Director · Capability Runtime · Knowledge Runtime ·
Reasoning Engine (GPT) · Mission Compiler · Product Definition · Acceptance ·
Worker Runtime · Provider Runtime.** ("Learning" is examined as a candidate
runtime.)

Legend for the "Kelly?" column: **YES** = irreducible operator judgment · **gate**
= a ratification the operator *could* pre-authorize · **no** = fully delegated.

---

## Mission 1 — Scheduling V2 ("Improve Scheduling")

| Stage | Owner | Inputs | Outputs | Why this owner | Kelly? |
|---|---|---|---|---|---|
| Intent | Kelly | — | "Improve Scheduling" | only the operator sets intent/priority | **YES** (intent) |
| Capability Retrieval | Capability Runtime (via Director) | intent | `cap_scheduling` object: established; proposed-vs-operational decisions; rejected patterns (OCM, queue-gate, blank-form); known_issues; roadmap; refs | authoritative capability truth home | no |
| Knowledge Retrieval | Knowledge Runtime | capability object scope | ranked supporting docs + immutable snapshot | owns retrieval/ranking | no |
| Gap Analysis | Reasoning | intent + object + docs | findings: "improve" is unscoped → clarification question; criteria gap | bounded reasoning on supplied context | no |
| **Scope decision** | Kelly (Director gate) | clarification + roadmap + known_issues | chosen axis (e.g. room-fit accuracy + proposed→operational) | subjective priority/scope | **YES** (scope) |
| Compilation | Mission Compiler | object + knowledge + decisions + resolved scope + gaps | ready package (rejected patterns pre-baked as constraints) | deterministic assembly | no |
| Operator Review | Kelly (Director gate) | ready package + trace | Approve | ratify plan | **gate** (merges with scope → 1 touch) |
| Bind + Start | Worker Runtime | ready package | mission `starting→running`; `session_id` persisted | owns execution | no |
| Generation | Provider | structured package prompt | turn output + completion report | generation | no |
| Execution monitoring | Worker Runtime | provider stream | status; outputs vs deliverables; evidence bound to criteria | owns execution truth | no* |
| Acceptance gate | Acceptance Runtime | outputs + evidence + criteria | verdict (pass/fail + missing evidence) | owns criteria/evidence/gate | no |
| **Final acceptance** | Kelly | gate verdict + visual review | accept → `completed` | product taste / visual judgment | **YES** (taste) |
| Learning | Director-orchestrated: Product Definition (classify feedback) · Capability (write-back maturity/known_issues/history) · Acceptance (ledger) | operator feedback + outcome | durable rules; updated object; ledger entry | feedback→durable truth via existing owners | partial |

\* unless the worker hits a question / gate / scope contradiction → it stops and pulls Kelly in.

**Operator judgment points:** intent · scope axis · final visual acceptance ·
ratifying load-bearing feedback. Scope + approval collapse to one interaction →
**Scheduling V2 ≈ 2 operator touches** (scope/approve at start, accept at end),
down from the many re-explanation rounds the memory record shows today.

## Mission 2 — Access & Roles V2 (mature capability)

Same pipeline; the difference is entirely upstream data quality:

- **Capability Retrieval** returns `maturity=mature`: graduated product definition,
  passing V1 acceptance gates, permission taxonomy, roadmap already framing V2.
- **Gap Analysis** finds *few* gaps — V2 is a delta on a resolved model; criteria
  derive from the taxonomy; no blocking clarification.
- **Compilation** yields a `ready` package with no open gates.
- **Operator Review:** **one** approval.

**Can Kelly approve once and leave until final QA? — Yes, realistically.** Because:
1. A mature object resolves product truth *up front*, so no product decision arises
   mid-mission.
2. Governance stops the worker before anything consequential (no push/merge/
   promote, no scope broadening) — it cannot wander.
3. The only remaining human need is final acceptance (taste/visual).

**Honest caveat:** if the worker hits an *unforeseen* product-truth gap or scope
contradiction, it stops → `waiting_for_operator`, pulling Kelly back early. The
probability is low *precisely because* the capability is mature — that is the
payoff of durable truth. So "approve once, leave until final QA" is the expected
path for mature capabilities, not a guarantee.

## Mission 3 — Internal Messaging (brand-new capability)

No product definition, no architecture, no acceptance, no capability object. This
tests the bootstrap path.

1. **Intent** — Kelly: "Build Internal Messaging." **[Kelly]**
2. **Capability Retrieval — MISS.** No object. Director escalates: *register a new
   capability?* Kelly authorizes `cap_internal_messaging` (cold). **[Kelly: capability
   registration]**
3. **Establish product truth.** No rules exist. Reasoning **proposes** a starter
   product definition (draft rules, options, clarification questions) by reasoning
   over analogous capabilities + intent. Kelly **ratifies** the load-bearing
   product truth. **[GPT proposes · Kelly ratifies — the heavy phase]**
4. **Architecture.** None. Reasoning **proposes** an architecture sketch +
   decomposition; Kelly ratifies key decisions. Often a Proposal-Only mission runs
   first (exactly the Worker Runtime cert case). **[GPT proposes · Kelly ratifies]**
5. **Acceptance criteria.** Reasoning **proposes** criteria from the new
   definition; Kelly ratifies; Acceptance Runtime records them. **[GPT · Kelly]**
6. **Knowledge** is thin — only the fresh proposal docs + cross-capability
   analogies. **[autonomous]**
7. **Compilation → Worker → Acceptance → Learning** as normal; the cold object now
   starts accumulating maturity from the ratified decisions.

**Where Kelly is required:** capability registration; ratifying the initial product
definition (the big cost); architecture decisions; initial acceptance criteria;
final acceptance. **Where GPT is required:** proposing the starter definition,
architecture, decomposition, criteria, and clarification questions — all
*proposals*. **Where Director continues autonomously:** every orchestration,
routing, retrieval, compilation, and execution step *between* the ratification
gates.

**Key finding:** the architecture does **not** eliminate the cost of defining a
new capability — it **front-loads that cost once and makes it durable.** The second
mission onward on Internal Messaging inherits everything and behaves like
Mission 1/2. The cold-start tax is real, bounded, and non-recurring.

## Mission 4 — Bug fix ("Director sends disappear after refresh")

1. **Intent** — Kelly (or an auto-filed known_issue): "Fix: Director sends
   disappear after refresh." **[Kelly / or pre-authorized bug class]**
2. **Capability Retrieval** — resolves to a **platform capability**
   (`cap_director` / request-delivery), whose `known_issues` may already list it.
   *Finding:* capabilities include **platform/infrastructure** capabilities, not
   only product ones.
3. **Knowledge** — retrieves the relevant code (durable request store, server send
   path) + prior decisions.
4. **Gap Analysis** — narrow: Reasoning proposes a root-cause hypothesis + the
   acceptance criterion (a reproduction/regression test).
5. **Scope/approval** — bug scope is usually unambiguous → **zero or one** approval
   (bug-class missions can be pre-authorized).
6. **Compilation** — objective=fix; `acceptance_criteria` = "bug no longer
   reproduces + regression test + no scope broadening"; QA_plan = repro steps.
7. **Worker** — produces the fix + regression test.
8. **Acceptance** — the gate is **objectively verifiable** (regression passes,
   repro gone), so Acceptance Runtime largely self-verifies — **lowest Kelly
   involvement of any mission class.**
9. **Learning** — the known_issue is closed on the capability object; the fix
   becomes an accepted decision/pattern.

**Finding:** bug fixes are the lowest-operator-involvement class because acceptance
is *objective* (reproduction/regression), not subjective taste. The architecture
handles them with only the modeling note that capabilities include platform
capabilities — which fits the existing Capability object, no new runtime.

---

## The seven questions

1. **Repetitive Kelly work that disappears:** re-explaining capability context each
   mission (proposed-vs-operational, rejected patterns, approved mockups);
   re-locating docs/decisions/screenshots; re-stating governance; hand-assembling
   briefs; re-teaching workers what was already decided or rejected; tracking which
   mission is where. All become durable retrieval + inheritance.
2. **Repetitive GPT work that disappears:** reconstructing context from scratch each
   session; re-reading and re-summarizing the same architecture/doc sets;
   re-deriving now-durable decisions; re-classifying the same feedback. GPT's
   *context reconstruction* disappears; only fresh reasoning remains.
3. **Repetitive work that still cannot disappear:** the actual generation/
   implementation (the Provider must do the work); verifying *real* runtime
   behavior and visuals; the one-time definition of a brand-new capability; genuine
   novel reasoning per mission (gaps differ each time).
4. **Subjective decisions that always require Kelly:** intent + priority (what to
   work on); scope resolution (which axis of "improve"); product-taste / visual
   acceptance; ratifying load-bearing product truth (new rules, architecture,
   criteria for cold capabilities); go/no-go on consequential/irreversible actions
   (push/merge/promote).
5. **Where Director stops:** at every operator gate, unresolved product truth,
   consequential action, or ambiguous capability resolution. It orchestrates but
   never reasons, decides product truth, or generates.
6. **Where Reasoning stops:** at *proposing.* It finds/derives/decomposes/
   classifies/summarizes but never ratifies load-bearing truth, never executes,
   never retrieves its own context, never orchestrates. Load-bearing outputs are
   gated to Kelly.
7. **Where Worker stops:** at the completion *claim* (→ `waiting_for_acceptance`),
   a question, a block, a governance approval, or a scope contradiction. It never
   self-accepts, never broadens scope, never pushes/merges/promotes.

## Responsibility matrix

`K`=Kelly decision · `O`=owner/autonomous · `c`=contributes · `–`=not involved

| Phase | Kelly | Director | Capability | Knowledge | Reasoning | Compiler | Worker | Provider | Acceptance |
|---|---|---|---|---|---|---|---|---|---|
| Intent | **K** | c | – | – | – | – | – | – | – |
| Capability resolve | – | O | **O** | – | – | – | – | – | – |
| Knowledge retrieve | – | O | c(scope) | **O** | – | – | – | – | – |
| Gap analysis | – | O | c | c | **O** | – | – | – | – |
| Scope decide | **K** | gate | c | – | c | – | – | – | – |
| Compile | – | O | c | c | c | **O** | – | – | c(criteria) |
| Approve | **K** | gate | – | – | – | c | – | – | – |
| Execute/generate | – | O | – | – | – | – | **O** | **O** | – |
| Acceptance gate | c | O | – | – | – | – | c(evidence) | – | **O** |
| Final accept | **K** | gate | – | – | – | – | – | – | c |
| Learn/write-back | c | **O** | **O** | c(index) | c(classify) | – | c(outputs) | – | **O**(ledger) |

## Remaining operator touchpoints

Intent + priority · scope resolution · **capability registration** (new only) ·
**ratifying product truth / architecture / criteria** (cold capabilities only) ·
**final acceptance + visual taste** · go/no-go on consequential actions. Everything
else is delegated. Volume scales with capability maturity: **mature ≈ 1 approval +
final QA; bug ≈ 0–1; cold ≈ several (one-time).**

## Remaining GPT touchpoints

Gap analysis · decomposition · criteria derivation · feedback classification ·
summarization · clarification-question generation · starter product-definition /
architecture proposals for cold capabilities. **Always proposing, never
ratifying.**

## Architectural holes exposed by the simulations

The simulations ran to completion on the existing ten actors. Two responsibilities
surfaced that were **under-assigned** — but both fit existing runtimes; **neither
requires a new runtime:**

- **(A) The "Learning" write-back loop is a process, not a runtime.** Turning an
  accepted mission into durable truth is owned across existing runtimes: Director
  *orchestrates* it; Product Definition *classifies* feedback; Capability Runtime
  *writes back* maturity/known_issues/history; Acceptance *appends* the ledger.
  This is the "capability truth maintenance" gap already flagged in
  `CAPABILITY-RUNTIME-V1.md §10.3` — it must be made explicit, but it invents no
  new owner. **"Learning" is rejected as a runtime.**
- **(B) Execution-environment provisioning is under-specified but belongs to the
  Worker Runtime.** Someone must provision/resume the worktree, branch, and dev
  server per mission. This is part of *execution* and was in the original Mission
  Execution brief ("provision or resume provider execution"). Assign it explicitly
  to the Worker Runtime; no new runtime.
- **(C) Cross-mission dependency ordering** (split missions, `depends_on` /
  `materializes_into` sequencing) is a known Compiler/Director gap
  (`MISSION-COMPILER-V1.md §9.8`) — owned by Director orchestration + Capability
  relationships. No new runtime.
- **(D) Modeling note:** capabilities include **platform/infrastructure**
  capabilities (Mission 4), which the existing Capability object already
  accommodates.

## Verdict

**No new runtime is required.** All four missions — a feature evolution, a mature-
capability delta, a cold-start bootstrap, and a bug fix — execute to completion on
the current architecture. The two under-assigned responsibilities (learning
write-back; environment provisioning) resolve cleanly onto existing runtimes and
should be written into their contracts, not spun into new services.

**The architecture is complete enough to begin implementation.** Recommended
bottom-up order is unchanged: **Worker Runtime V1 → Knowledge → Capability →
Acceptance → Product Definition → Mission Compiler → Reasoning → Director**, with
the Worker Runtime's contract updated to name environment provisioning, and the
learning write-back loop named as a Director-orchestrated cross-runtime process.

**Stop after the simulations.**
