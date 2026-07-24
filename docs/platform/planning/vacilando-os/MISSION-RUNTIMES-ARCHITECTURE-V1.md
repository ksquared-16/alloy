# Vacilando — Mission Runtimes Architecture (revised)

> Status: architecture proposal for review. Supersedes the "Director becomes
> intelligent" framing. Returned **before expanding implementation** per the
> Director Architecture Clarification.

## The correction

Director is **not** a reasoning model. Director does not become another GPT, does
not replace product reasoning, and is not an autonomous planner.

**Director is the deterministic conductor.** It becomes *exceptionally informed*
not by thinking harder but by orchestrating specialized runtimes and invoking a
reasoning service only where reasoning is genuinely required. Every capability
that looks like "intelligence" is decomposed into an explicit runtime or service
with owned state, typed inputs, and typed outputs. Nothing important lives in a
model's head; everything durable lives in a runtime.

```
Kelly
  │  (intent)
  ▼
Director Runtime ─────────── orchestration (deterministic state machine)
  │  asks "what do I know?" / "what's missing?" / "who does the next step?"
  ├──▶ Knowledge Runtime ──── retrieval (documents, decisions, screenshots, QA)
  ├──▶ Product Definition ─── durable classified operator feedback (inherited)
  ├──▶ Acceptance Runtime ─── typed criteria + evidence + gates (inherited)
  ├──▶ Reasoning Engine ───── GPT/Claude as a SERVICE, reasoning only, on demand
  ▼
Mission Compiler ─────────── deterministic assembly → Mission Package
  │
  ▼
Worker Runtime ───────────── durable mission execution  ◀── (built in this sprint)
  │
  ▼
Provider Runtime ─────────── auth · capabilities · health · session transport  ◀── (already shipped)
  │
  ▼
Claude / Cursor ──────────── generation
```

**Roles, stated once:** Director orchestrates · Knowledge retrieves · Product
Definition remembers · Acceptance judges · GPT reasons · the Compiler assembles ·
Workers execute · Providers generate.

The design goal is not "automate prompts." It is to **automate the preparation,
retrieval, decomposition, and packaging** that Kelly and GPT do *before*
implementation — so the provider spends nearly all of its effort executing a
well-prepared mission, never rediscovering architecture, decisions, or rejected
designs.

---

## The seam that connects everything: the Mission Package

Every runtime above the Worker Runtime exists to produce **one deterministic
artifact**: a Mission Package. The Worker Runtime consumes *only* a package —
never a raw prompt, never a discovery task. Defining this schema now (even if V1
fills only part of it) is the single most important architectural decision,
because it is the contract that lets each upstream runtime grow independently.

```
MissionPackage {
  package_id, version, compiled_at, compiler_manifest_hash
  project_id, capability, mission_title, objective
  scope:            { included[], excluded[] }        ← explicit exclusions
  product_rules[]:  { scope: product|capability|mission, rule, provenance }
  decisions[]:      { kind: accepted|rejected, statement, rationale, provenance }
  references[]:     { type: doc|screenshot|code|qa, uri, why_relevant }
  acceptance:       { criteria[]: {id, type, statement, evidence_required}, gate }
  open_questions[]: { id, question, blocking: bool }
  governance:       { no_push, no_merge, no_promote, no_scope_broadening, ask_before_consequential }
  readiness:        { ready: bool, gaps[] }            ← compiler attestation
}
```

The Worker Runtime's mission record already carries `objective`, `governance`,
`pending_question`, and output plumbing — it is package-shaped today; V1 will
accept a package reference where it currently accepts a raw objective string.

---

## Runtime specifications

### 1. Director Runtime — orchestration

- **Responsibility.** Hold the active orchestration context and decide the next
  step **deterministically** via a state machine and policy — never by reasoning
  about product. It routes: given the mission state and a "what's missing"
  checklist, it dispatches to the correct specialist runtime and projects status
  to Kelly. It coordinates; it does not invent.
- **Owned state.** Active `project_id`, active `mission_id`, worker/slot
  assignment, provider selection, the mission lifecycle state machine, the
  missing-information checklist, pending operator prompts, and an audit of every
  dispatch. **No** domain knowledge, product rules, or acceptance criteria live
  here — those are owned by their runtimes.
- **Inputs.** Operator intents; status/events from every other runtime (knowledge
  availability, compiler readiness, acceptance gate results, reasoning results,
  mission status); Provider Runtime health.
- **Outputs.** Dispatch calls (retrieve / compile / reason / execute / consult);
  operator-facing projections (mission status, Needs You); audit events.
- **Lifecycle.** Continuous. Per intent: `resolve → gather → compile → reason (only
  if a gap is detected) → dispatch → observe → project`. Transitions are
  deterministic and auditable.
- **Interactions.** Calls Knowledge, Product Definition, Acceptance, Reasoning
  Engine, Mission Compiler, and Worker Runtime. Owns none of their state.

### 2. Knowledge Runtime — retrieval

- **Responsibility.** Own deterministic, reproducible retrieval over the durable
  corpus: documents, accepted/rejected decisions, approved/rejected screenshots,
  implementation references, QA/evidence history, architecture, prior mission
  outputs. Returns **sources, not opinions**. No generation.
- **Owned state.** A knowledge index/manifest — a catalog of items with type,
  provenance, capability tags, timestamps, status, and content pointers
  (git-tracked files, screenshots, ledger entries).
- **Inputs.** Scoped queries ("Compile Scheduling"), filters (type, capability,
  recency, status).
- **Outputs.** A ranked, typed, reproducible set of knowledge references with
  provenance.
- **Lifecycle.** Index refresh on repo change and on new durable writes from
  Product Definition / Acceptance; query on demand; cacheable.
- **Interactions.** Serves Director and Mission Compiler; ingests durable items
  from Product Definition and Acceptance; reads git-tracked artifacts. Director
  never searches repositories by hand — it asks Knowledge.

### 3. Mission Compiler — compilation

- **Responsibility.** Assemble a **complete, deterministic** Mission Package from
  retrieved knowledge, current repository state, applicable product rules,
  acceptance criteria, prior outputs, and unresolved questions. It does **not
  execute** and does **not reason** — it may *invoke* the Reasoning Engine for
  bounded sub-tasks (decomposition, contradiction detection), but the compiler
  itself is deterministic assembly, templating, and completeness validation. When
  inputs are missing it emits a **gap report**, not a half-package.
- **Owned state.** Package schema/templates; compilation manifests (inputs,
  versions, hashes) for reproducibility and audit; the compiled, versioned
  packages themselves.
- **Inputs.** Knowledge references; Product Definition applicable-rules set;
  Acceptance criteria + evidence requirements; repository state; open questions;
  prior mission outputs; optional Reasoning Engine results.
- **Outputs.** A Mission Package (self-contained; no discovery required) **or** a
  readiness gap report.
- **Lifecycle.** Compile on Director request; versioned; recompile when inputs
  change; **immutable once dispatched** — a mission executes a specific package
  version.
- **Interactions.** Pulls from Knowledge / Product Definition / Acceptance; may
  call the Reasoning Engine; hands the package to Director → Worker Runtime.

### 4. Reasoning Engine — reasoning only (GPT/Claude as a specialist service)

- **Responsibility.** Bounded, explicitly-invoked reasoning: detect
  contradictions, find missing acceptance criteria, summarize large document
  sets, decompose work, recommend scope, classify operator feedback, identify
  missing information. **Stateless.** Provider-neutral — a role, not a vendor. It
  is *not* the system; it is one service Director uses.
- **Owned state.** None durable. Task/prompt templates per reasoning capability;
  an audit of invocations. Never fetches its own context.
- **Inputs.** A specific reasoning task **plus the exact context it needs**,
  supplied by the caller (Director/Compiler) and retrieved by Knowledge.
- **Outputs.** Typed, structured reasoning results consumed deterministically.
- **Lifecycle.** Per-invocation, bounded (runs as a short Provider Runtime turn —
  never a long mission). Results are persisted by the *caller* if durable.
- **Interactions.** Called by Director (decisions) and Mission Compiler
  (compilation sub-reasoning). Runs on the Provider Runtime.

### 5. Product Definition Runtime — durable product knowledge

- **Responsibility.** Turn operator feedback into durable, classified,
  **inheritable** knowledge. Every feedback item is classified as exactly one of:
  permanent product rule · capability-specific rule · mission-specific rule ·
  accepted pattern · rejected pattern · explicit exclusion · unresolved question ·
  future enhancement. Future missions inherit applicable rules automatically.
- **Owned state.** The **Product Definition ledger** — git-tracked, versioned,
  durable: rules (scoped), accepted/rejected patterns, exclusions, open
  questions, future enhancements — each with provenance (mission/feedback),
  scope, status, timestamps, and supersession links.
- **Inputs.** Raw operator feedback; the mission/capability context it attaches
  to; a classification (the runtime *owns* the durable record and scope decision;
  it may call the Reasoning Engine to *propose* a classification).
- **Outputs.** Durable classified items into the ledger; an applicable-rules set
  scoped by capability/mission for the Compiler; an unresolved-questions feed for
  Director (Needs You).
- **Lifecycle.** Append on feedback; rules persist and are inherited until
  superseded or rejected; versioned.
- **Interactions.** Feeds Knowledge (indexed) and Mission Compiler
  (applicable rules); may call the Reasoning Engine to classify; surfaces open
  questions to Director.

### 6. Acceptance Runtime — criteria, evidence, gates

- **Responsibility.** Own **typed acceptance criteria** per mission/capability,
  **bind evidence** to criteria, run the **acceptance gate**, and keep a durable
  **decision-ledger** of what was accepted/rejected and why. Provides the "what
  gates exist / what evidence exists" that Director must know. (This is the
  acceptance half of the original "Product Definition + Acceptance" mission,
  now cleanly separated from durable product *rules* above.)
- **Owned state.** Acceptance criteria sets (typed), evidence bindings, gate
  results, decision ledger — git-tracked, inherited across missions.
- **Inputs.** Mission objective + product rules (to derive criteria); evidence
  artifacts (QA output, screenshots, tests, mission outputs); operator
  accept/reject decisions.
- **Outputs.** Criteria + evidence requirements for the Compiler to embed; gate
  verdicts (pass/fail + missing evidence) for Director; durable ledger entries.
- **Lifecycle.** Criteria defined at compile time; evidence bound during/after
  execution; gate evaluated at closeout; ledger durable and inherited.
- **Interactions.** Feeds Mission Compiler and Director; consumes Worker Runtime
  outputs as evidence; shares its ledger with Knowledge.

### 7. Worker Runtime — durable mission execution  *(this sprint)*

- **Responsibility.** Durably **execute a compiled Mission Package** via the
  Provider Runtime, independent of any single provider process, browser
  connection, or Vacilando restart. Owns mission lifecycle, background turn
  execution, provider-session capture/resume, layered timeouts + activity,
  restart recovery, stop/steer/continue, and progress/question projection. The
  provider executes a prepared package — it never rediscovers context.
- **Owned state.** The durable **Mission store** (mission_id, status lifecycle,
  `provider_session_id`, turns, outputs, `pending_question`, `active_request_id`,
  activity) — **already built this sprint** — plus an in-memory live-process
  registry.
- **Inputs.** A compiled Mission Package (from Director/Compiler); operator
  steering / answers / stop.
- **Outputs.** Mission status projections; durable turn outputs; questions/blocks
  to Director/Needs You; evidence artifacts to the Acceptance Runtime; provider
  session lineage.
- **Lifecycle.** `draft → ready → starting → running → (waiting_for_operator |
  blocked | completed | failed) → stopping → stopped`; `interrupted` +
  operator-resumable recovery on restart. Operator-paced turns.
- **Interactions.** Receives a package from Director; drives the Provider Runtime;
  emits outputs to Acceptance (evidence) and Knowledge (prior outputs); surfaces
  questions to Director; operator feedback on its outputs flows to Product
  Definition.

### 0. Provider Runtime — shared infrastructure *(already shipped)*

Owns provider authentication (shared Keychain credential), capabilities, health,
usage, and the governed transport (fixed argv · prompt on stdin · `shell:false` ·
session resume). Used by both the Worker Runtime (mission turns) and the
Reasoning Engine (bounded reasoning turns). A provider session is **replaceable
infrastructure**; the mission is the durable identity.

---

## What is already built, and where it sits

The Mission Execution Runtime work started this sprint is **the Worker Runtime
floor** and is not discarded:

| Built this sprint | Runtime role |
|---|---|
| `commands/missions.mjs` — durable mission store (append-only, projected, recovery) | Worker Runtime state |
| `providers.mjs::startMissionTurn` — streaming, resumable, layered-timeout turn | Worker Runtime ↔ Provider Runtime transport |
| `provider-runtime.mjs::precheckProvider / providerResumable` | Provider Runtime gate |

Everything upstream of the Worker Runtime (Director state machine, Knowledge,
Compiler, Reasoning Engine, Product Definition, Acceptance) is **new architecture
introduced by this clarification** and is proposed, not built.

## Recommended sequencing (for approval)

The Worker Runtime is the correct floor — without durable execution there is
nothing to run a package on. But its **input contract** should become the Mission
Package now, so the seam exists from day one:

1. **Finish Worker Runtime V1** (this sprint's execution substrate) but have it
   accept a **Mission Package reference**, not a raw objective. V1's package can
   be minimal (objective + governance + placeholder acceptance) — the *shape* is
   what matters.
2. **Acceptance Runtime V1** — typed criteria + evidence binding + gate (the
   original mission's true gap), so packages carry real criteria and closeout has
   a real gate.
3. **Product Definition Runtime V1** — feedback classification ledger, so
   missions inherit rules.
4. **Knowledge Runtime V1** — deterministic retrieval index over the above +
   docs/screenshots/QA.
5. **Mission Compiler V1** — assemble a real package from 2–4.
6. **Reasoning Engine V1** — wire GPT/Claude as a bounded classification/
   decomposition service the Compiler and Director call.
7. **Director Runtime** — the deterministic state machine that conducts 1–6.

This order builds the stack **bottom-up** (execute → judge → remember → retrieve →
compile → reason → conduct), so every layer has something real beneath it and
nothing is a mock.

**Holding further implementation for your review, as instructed.**
