# Director Intelligence V1 — Upstream Preparation Layer

**Status:** DESIGN / PROPOSAL — no runtime code written. Awaiting Kelly's approval before implementation.
**Sprint:** Director Intelligence V1 (Vacilando OS)
**Worktree:** `wt6-vacilando-os-product-def` · branch `agent/claude/6-vacilando-os-product-def`
**Foundation (do not revisit):** Operational Trustworthiness V1 — Closeout, Trust Dashboard, Identity Runtime, governed execution.

---

## Thesis

Vacilando **executes** work well. It does not yet **prepare** work.

Today, `Kelly → large prompt → Claude → implementation`. The operator is the preparation layer.

Target: `Kelly → intent → Director → Mission Package → Worker`. The operator **approves** a package; they do not **author** one.

The one-sentence truth this sprint acts on: **there is no reasoning anywhere upstream of the worker turn.** Every stage before execution is deterministic assembly. The compiler even records `reasoning_invocations: []` — honestly empty. This sprint builds the missing intelligence layer *without* moving reasoning into a provider call (governance: prepare, don't execute).

---

## 1. Current-State Inventory (truthful baseline)

Classification: **Implemented** (real, durable, works) · **Partial** (works for one narrow case) · **Stub** (shape exists, no substance) · **Concept only** (referenced, no code).

| Stage / Runtime | Code | Classification | What it actually does today | Honest gap |
|---|---|---|---|---|
| **Director** (conductor) | `mission-director.mjs` (257) | **Implemented** | Deterministic conductor. `compileMissionForIntent` runs identity → capability → knowledge → compile → package. `preview/start/steer/stop/evaluate/accept` all governed (preview→confirm→audit), fail-closed on identity conflict. Durable first-class requests. | Only orchestrates a 4-stage line. No Product Definition, Gap Analysis, or Readiness-verdict stage. |
| **Capability Runtime** | `capability.mjs` (141) | **Partial** | Append-only JSONL store, projected, durable. Resolves intent→capability by id/name/token match. **One hardcoded seed** (`cap_access_roles`). Holds inline `accepted_decisions` / `rejected_patterns` / roadmap / known_issues / relationships. | No registration/create API. One capability. Product truth is *inlined on the seed*, not owned by a Product Definition runtime. No readiness, owner, metrics, dependencies as first-class. |
| **Knowledge Runtime** | `knowledge.mjs` (87) | **Partial** | Deterministic, content-hashed, reproducible snapshot. Inspects curated `documentation_index` + code paths (presence/size/sha), ranks by a versioned weight table, persists immutably. No generic crawl (by design). | Snapshot = *files only*. Missing: capability data, decisions, mission history, acceptance history, evidence. Otherwise the closest-to-vision runtime already. |
| **Mission Compiler** | `mission-compiler.mjs` (110) | **Partial** | Deterministic assembly of a complete, durable, reproducible package with a `compiler_trace`. **Compiles exactly ONE mission class**: "produce the V2 proposal doc." Deliverable path, sections, and acceptance criteria are hardcoded to that class. | Cannot compile a general mission. `reasoning_invocations: []` — gap analysis "not wired," recorded honestly. |
| **Mission Package** | `commands/mission-packages.mjs` (135) | **Implemented (v1)** | Durable, append-only, projected. **Readiness computed on every write** (real gate, not a label). `version` field + `superseded` status exist. | No version *chain*, no diff between versions, no embedded gap report, no readiness *reasons* taxonomy. Single-shot, not iterative. |
| **Acceptance Runtime** | `acceptance.mjs` (116) | **Implemented** | Evaluates declared criteria against real evidence. Auto-verifies objective checks (file exists, sections present, git-clean-outside-docs); **honest `operator_review`** for subjective — never faked. Durable ledger, gate = pass/needs_operator/fail. | Criteria are *authored by the compiler*, not *suggested by reasoning*. History not fed back into preparation. |
| **Director routing** | `commands/director.mjs` (87) | **Implemented (honest)** | Records interactions, stages instruction to clipboard. Never claims to inject into a live session. | Separate from the mission pipeline; not a preparation stage. |
| **Product Definition Runtime** | — | **Concept only** | `capability.product_definition_ref` points at `"cap_access_roles/product-definition"`. **No module, no store, no object.** Decisions/patterns live inline on the capability seed. | The durable long-term memory this sprint centers on does not exist. |
| **Gap Analysis / Reasoning** | — | **Concept only** | `compiler_trace.reasoning_invocations: []`. Comment: "V1 gap-analysis is not wired." | The first genuine intelligence stage does not exist. |
| **Director Review verdict** | (readiness_status only) | **Stub** | Package has `readiness_status ∈ {draft, blocked, awaiting_operator, ready, superseded}` + `readiness_findings`. | The operator-facing verdict (Ready / Needs Decisions / Needs References / Needs Acceptance / Needs Architecture / Needs Review) does not exist. |

### Where reasoning actually occurs today

**Nowhere upstream.** Capability resolution = string matching. Knowledge ranking = a weight table. Compilation = template fill. Acceptance = regex + file stat, with honest `operator_review` for anything subjective. The *only* reasoning in the whole system happens **inside the provider turn** — i.e. downstream, inside the worker, exactly where this sprint says it should *not* be the first time intelligence is applied. Preparation is 100% deterministic assembly. That is the baseline this sprint changes.

---

## 2. Proposed Preparation Architecture

Target pipeline (Director remains the deterministic conductor; it calls each runtime, never reasons itself):

```
Mission Intent
   │  (Director parses "Build Access & Roles V2" → intent record)
   ▼
Capability Resolution ──────────► Capability Runtime  (resolve or escalate-to-register)
   ▼
Product Definition ─────────────► Product Definition Runtime  (durable long-term memory)
   ▼
Knowledge Snapshot ─────────────► Knowledge Runtime  (deterministic, reproducible, expanded)
   ▼
Gap Analysis ───────────────────► Gap Analysis Runtime  (FIRST reasoning stage; deterministic V1)
   ▼
Mission Readiness ──────────────► Director  (rolls Gap Report → six-state verdict)
   ▼
Mission Compiler ───────────────► Mission Compiler  (assembles package, embeds gap report)
   ▼
Mission Package (v1, v2, …) ────► Mission Package store  (versioned artifact + diff)
   ▼
Operator Review ────────────────► Director Review UI  (approve / send back to a stage)
   ▼
Worker  (unchanged — executes a ready, approved package)
```

Two structural principles carried from the existing system:

1. **Every runtime is an append-only JSONL log projected to current state**, rooted at `ALLOY_RUNTIME_ROOT` (`~/.local/state/alloy-dev/vacilando/…`). Survives restart; browser is never source of truth. New runtimes follow this exact pattern.
2. **Reasoning is contained and deterministic in V1.** Gap Analysis is a rule engine over structured artifacts — not a provider call. It is architected behind a `ReasoningProvider` seam so a provider-backed reasoner can deepen it later *without* changing the pipeline. This honors "prepare, don't execute."

### Per-stage definition

| Stage | Inputs | Outputs | Persistence | Owner | API | UI | Operator visibility | Failure modes |
|---|---|---|---|---|---|---|---|---|
| **Mission Intent** | operator text ("Build Access & Roles V2") | `intent{ raw, verb, capability_hint, version_hint }` | intents.jsonl | Director | `POST /api/director/prepare` | Director input box | The parsed intent echoed back | ambiguous verb → ask; empty → reject |
| **Capability Resolution** | intent | `{capability}` or `{no_capability, suggestion}` | (reads capabilities.jsonl) | Capability Runtime | (internal) | resolved capability chip | shows which capability matched + confidence | no match → escalate to "Register capability" (not silent) |
| **Product Definition** | capability_id | product definition object | product-definitions.jsonl | Product Definition Runtime | `GET /api/capability/:id/product-definition` | Product Definition panel | decisions/constraints/goals shown | missing → verdict `Needs Decisions` |
| **Knowledge Snapshot** | capability + product def + histories | immutable snapshot (files + decisions + histories + evidence) | knowledge/snapshots/*.json | Knowledge Runtime | (internal, snapshot_id returned) | snapshot manifest (what was gathered) | list of referenced items + sha + present/missing | referenced file missing → surfaced in snapshot + fed to gap analysis |
| **Gap Analysis** | intent, product def, capability, snapshot, acceptance history | gap report (missing/conflicts/unknowns/recommended refs/suggested criteria/confidence) | gap-reports/*.json | Gap Analysis Runtime | `GET /api/mission/:id/gap-report` | Gap Report panel | every gap with severity + why | over-flagging → severities + confidence bound it |
| **Mission Readiness** | gap report + package validation | six-state verdict + reasons | (on package) | Director | (part of compile result) | verdict badge + reasons | the verdict + exactly which stage to feed | — (pure projection) |
| **Mission Compiler** | capability, product def, snapshot, gap report | Mission Package (embeds gap report + product-def snapshot) | packages.jsonl | Mission Compiler | (internal) | package viewer | full package | any required input missing → block, recorded in trace |
| **Operator Review** | package + gap report + verdict | approve → mission ready; or send-back | (mission/package updates, audited) | Director | `POST /api/missions/approve` | Director Review screen | approve / send-back-to-stage buttons | approve while not Ready → confirm-override or blocked |
| **Worker** | approved ready package | implementation | (unchanged) | Worker Runtime | `POST /api/missions/start` | (existing) | (existing) | (unchanged) |

---

## 3. Runtime Ownership Matrix

Truth has exactly one owner. References resolve to owners; they are never copies.

| Concern | Owner | Everyone else | Persistence |
|---|---|---|---|
| Workflow, routing, gates, verdict | **Director** (deterministic) | reads results | intents.jsonl, audit |
| Capability identity, status, readiness, roadmap, relationships, metrics | **Capability Runtime** | references by `capability_id` | capabilities.jsonl |
| Accepted/rejected decisions, constraints, patterns, goals, tradeoffs, operator notes | **Product Definition Runtime** | Capability holds a `product_definition_ref` | product-definitions.jsonl |
| Retrieval + reproducible snapshots | **Knowledge Runtime** | consumes snapshot_id | knowledge/snapshots/ |
| Gaps, conflicts, unknowns, suggested criteria, confidence | **Gap Analysis Runtime** | reads report | gap-reports/ |
| Package assembly + versioning + diff | **Mission Compiler** + **Package store** | worker reads ready package | packages.jsonl |
| Criteria evaluation, evidence, ledger | **Acceptance Runtime** | reads verdict | acceptance/ledger.jsonl |
| Execution | **Worker Runtime** | — | missions.jsonl |
| Provider processes | **Provider Runtime** | — | (existing) |

**Reasoning ownership:** Gap Analysis is the *only* runtime permitted to reason, and in V1 it reasons deterministically (rules over structured artifacts). All other runtimes remain non-reasoning by contract.

---

## 4. Product Definition Model (the durable long-term memory)

A new runtime: `lib/vacilando/product-definition.mjs`, append-only JSONL projected, one object per capability. **This is the sprint's biggest data move:** decisions/patterns currently inlined on the capability seed migrate here; the capability keeps only a reference.

```jsonc
{
  "schema_version": "vacilando.product-definition.v1",
  "product_definition_id": "pd_access_roles",
  "capability_id": "cap_access_roles",
  "accepted_decisions": [
    { "id": "ad1", "statement": "...", "rationale": "...", "decided_at": "...",
      "decided_by": "operator", "provenance": "mission:msn_… | operator", "supersedes": null }
  ],
  "rejected_decisions": [
    { "id": "rd1", "statement": "...", "reason": "...", "rejected_at": "...", "revisit_if": "..." }
  ],
  "constraints":  [ { "id": "c1", "statement": "loopback only", "kind": "governance|technical|product", "hard": true } ],
  "patterns":     [ { "id": "p1", "statement": "roles are the unit of grant", "status": "endorsed|rejected", "ref": "…" } ],
  "goals":        [ { "id": "g1", "statement": "granular per-capability permissions", "status": "active|met|dropped" } ],
  "architecture_references": [ { "uri": "docs/…", "title": "…", "kind": "architecture" } ],
  "known_tradeoffs": [ { "id": "t1", "chose": "…", "over": "…", "because": "…" } ],
  "relationships":   [ { "to": "pd_locations", "kind": "shares_data_with" } ],
  "referenced_documents": [ { "uri": "…", "title": "…", "kind": "spec|decision|qa" } ],
  "operator_notes":  [ { "note": "V1 taxonomy settled; V2 is a delta", "actor": "operator", "at": "…" } ],
  "mission_history": [ { "mission_id": "…", "title": "…", "outcome": "completed", "decisions_added": ["ad4"], "at": "…" } ],
  "updated_at": "…", "updated_by": "seed|operator|mission"
}
```

**Learning loop:** on mission `accept`, decisions the mission settled are written back here (append-only, provenance-stamped). Over time the Product Definition *accretes* — it becomes the memory that removes manual context assembly. Every accepted/rejected decision is provenance-linked to the mission that produced it.

**API:** `GET /api/capability/:id/product-definition`, `POST /api/product-definition/:id/decision` (governed, audited).

---

## 5. Capability Model (real, not seeded)

Extend `capability.mjs` to a real registry and slim it to *capability-level truth only* (product truth moves to §4).

```jsonc
{
  "schema_version": "vacilando.capability.v2",
  "capability_id": "cap_access_roles",
  "identity":   { "name": "Access & Roles", "description": "…", "project_id": "alloy", "slug": "access-roles" },
  "status":     "active|paused|deprecated",
  "readiness":  { "level": "ready|needs_prep|blocked", "reasons": [], "computed_at": "…" },
  "owner":      { "operator": "kelly", "provider_default": "claude" },
  "product_definition_ref": "pd_access_roles",          // → Product Definition Runtime
  "knowledge_references":   [ { "uri": "…", "kind": "code|doc" } ],  // seeds the snapshot
  "architecture_references":[ { "uri": "docs/…" } ],
  "mission_history":   [ { "mission_id": "…", "outcome": "…", "at": "…" } ],
  "acceptance_history":[ { "mission_id": "…", "gate": "pass|needs_operator|fail", "at": "…" } ],
  "known_issues":      [ { "id": "ki1", "issue": "…", "severity": "…", "status": "open" } ],
  "related_capabilities": [ "cap_locations", "cap_programs" ],
  "dependencies":         [ { "capability_id": "cap_locations", "kind": "hard|soft" } ],
  "metrics": { "missions_total": 0, "missions_completed": 0, "last_accepted_at": null, "open_issues": 1 },
  "current_implementation": { "code_paths": ["…"], "entry_points": ["…"], "last_verified_at": "…" },
  "updated_at": "…", "updated_by": "…"
}
```

**Registry API:** `POST /api/capabilities` (register), `PATCH /api/capabilities/:id`, `GET /api/capabilities`, `GET /api/capabilities/:id`. The single hardcoded seed becomes a *bootstrap* seed (idempotent, still there so the slice keeps working), but the runtime now supports N capabilities with real registration. `metrics`, `readiness`, and `acceptance_history` are **projected** from the mission/acceptance logs — computed, not hand-set.

---

## 6. Knowledge Snapshot Model (context, not search)

Keep everything good about today's runtime (deterministic, content-hashed, reproducible, no crawl). **Expand the snapshot from "files" to "context."** A snapshot becomes a reproducible, multi-section context bundle:

```jsonc
{
  "schema_version": "vacilando.knowledge-snapshot.v2",
  "snapshot_id": "ksnap_…",                 // hash of (ranking_version | capability | all section content)
  "capability_id": "cap_access_roles",
  "ranking_version": "knowledge-rank/v2",
  "retrieved_at": "…",
  "sections": {
    "referenced_files":   [ { "uri": "…", "kind": "code", "exists": true, "bytes": 0, "sha": "…", "rank": 105 } ],
    "architecture":       [ { "uri": "docs/…", "sha": "…" } ],
    "accepted_decisions": [ { "id": "ad1", "statement": "…", "source": "pd_access_roles" } ],   // from Product Def
    "capability_data":    { "status": "active", "roadmap": [ … ], "known_issues": [ … ] },       // snapshot of Capability
    "mission_history":    [ { "mission_id": "…", "outcome": "…" } ],
    "acceptance_history": [ { "mission_id": "…", "gate": "…" } ],
    "relevant_evidence":  [ { "uri": "…", "kind": "qa", "sha": "…" } ]
  },
  "provenance": { "capability_version": "…", "product_definition_updated_at": "…" }
}
```

Every section is derived from a named source with a hash/timestamp, so the whole snapshot is a **pure function of state** — re-running produces the same `snapshot_id` unless a source changed. This is what makes a compiled package reproducible and auditable. Still **no reasoning, no crawl** — the Knowledge Runtime only gathers what the capability + product definition point at, plus presence/hash facts.

---

## 7. Gap Analysis Design (the first genuine intelligence stage)

New runtime: `lib/vacilando/gap-analysis.mjs`. Compares **Mission Intent** against **Product Definition · Capability · Knowledge Snapshot · Acceptance history** and returns a structured **Gap Report**.

```jsonc
{
  "schema_version": "vacilando.gap-report.v1",
  "gap_report_id": "gap_…",
  "mission_intent": "Build Access & Roles V2",
  "capability_id": "cap_access_roles",
  "snapshot_id": "ksnap_…",
  "analyzer_version": "gap/v1-deterministic",
  "findings": {
    "missing_information":   [ { "id": "m1", "what": "V2 audit-trail schema undecided", "severity": "block", "feeds_verdict": "Needs Decisions" } ],
    "conflicts":             [ { "id": "x1", "between": ["ad2","goal g1"], "detail": "…", "severity": "warn" } ],
    "unknowns":              [ { "id": "u1", "question": "Does V2 touch cap_locations shared data?", "blocking": false } ],
    "recommended_references":[ { "uri": "docs/…", "why": "referenced by roadmap rm3 but not in snapshot" } ],
    "suggested_acceptance_criteria": [ { "statement": "Role changes produce an audit record", "from": "known_issue ki1" } ],
    "missing_files":         [ { "uri": "…", "note": "referenced but absent in worktree" } ]
  },
  "confidence": 0.72,                       // deterministic: coverage ratio, not a model's self-estimate
  "generated_at": "…"
}
```

**V1 reasoning = deterministic rules** (honest, governed, no provider call). Examples of the rule set:

- Roadmap item with no covering acceptance criterion → `missing_information` / suggested criterion.
- `known_issue` (open) not addressed by intent scope → suggested criterion + unknown.
- Referenced file absent from snapshot (`exists:false`) → `missing_files` + recommended reference.
- Accepted decision that the intent appears to contradict (token overlap heuristic) → `conflict` (warn, operator confirms).
- Product Definition missing decisions for a goal marked `active` → `missing_information` → `Needs Decisions`.
- `confidence` = deterministic coverage score (roadmap covered / decisions present / files present / criteria bound), **not** a self-reported number.

**Seam for later:** the runtime exposes a `ReasoningProvider` interface. V1 ships `DeterministicReasoner`. A future `ProviderReasoner` (behind governance) can deepen findings *without changing the pipeline or the Gap Report schema*. This is how "the first genuine intelligence stage" ships now yet grows later — and it keeps this sprint's "no provider execution" promise.

---

## 8. Mission Package V2 (versioned artifact + diff)

Extend the package so it is a **versioned artifact**, not a single shot. A capability's mission accretes packages v1 → v2 → … as gaps close.

New/changed fields on `vacilando.mission-package.v2`:

```jsonc
{
  "schema_version": "vacilando.mission-package.v2",
  "package_id": "pkg_…",
  "package_lineage_id": "line_…",           // stable across versions of the same mission
  "version": 2,
  "supersedes_package_id": "pkg_…v1",
  "intent": "Build Access & Roles V2",
  "capability_ref": "cap_access_roles",
  "product_definition_snapshot": { … },     // frozen copy at compile time (reproducibility)
  "knowledge_snapshot": { "snapshot_id": "ksnap_…" },
  "gap_report": { … },                       // embedded (§7)
  "acceptance": { "criteria": [ … ], "suggested_from_gap": ["…"] },
  "expected_deliverables": [ … ],
  "scope_included": [ … ], "scope_excluded": [ … ],
  "constraints": [ … ], "governance_constraints": { … },
  "risks":     [ { "id": "r1", "risk": "…", "from": "gap x1" } ],
  "questions": [ { "id": "q1", "question": "…", "blocking": true, "from": "gap u1" } ],
  "readiness": { "verdict": "Needs Decisions", "reasons": [ … ], "status": "awaiting_operator" },
  "diff_from_previous": {
    "added":    [ "criterion AC5", "reference docs/…" ],
    "removed":  [ ],
    "resolved": [ "question q1 (audit schema decided)" ],
    "verdict_change": "Needs Decisions → Ready"
  }
}
```

**Versioning mechanics** (reuse the existing supersede plumbing):
- Compiling again for the same lineage creates a new version, marks the prior `superseded`, and computes `diff_from_previous` deterministically (set difference over criteria / references / questions / verdict).
- `readiness` now carries the **six-state verdict** (§9) plus machine reasons, layered on the existing computed `readiness_status`.
- Reproducible: given the same capability + product-def + snapshot state, the same package content hashes identically.

**Risks/Questions** are populated *from the Gap Report* — so an incomplete package always explains itself.

---

## 9. Director Review Flow (verdict + send-back)

Director rolls the Gap Report + package validation into a **six-state verdict**. The operator reviews the package; the worker never receives an incomplete package without the operator knowing exactly why.

| Verdict | Trigger (from Gap Report / validation) | What the operator does | Send-back target |
|---|---|---|---|
| **Ready** | no blocking gaps; all package validations pass | Approve → mission becomes `ready` | Worker |
| **Needs Decisions** | Product Definition missing decisions for an active goal; unresolved decision gate | Decide (writes to Product Definition) | Product Definition Runtime |
| **Needs References** | referenced/recommended files absent from snapshot | Add references / point at docs | Capability + Knowledge |
| **Needs Acceptance** | roadmap/known-issue uncovered by criteria; criterion without evidence | Accept/adjust suggested criteria | Acceptance |
| **Needs Architecture** | no architecture reference resolvable; conflict with an architecture doc | Supply/curate architecture ref | Product Definition (architecture_references) |
| **Needs Review** | conflicts or non-blocking unknowns require human judgment | Confirm/resolve unknowns | Operator judgment |

Flow:

```
compile → Gap Report → verdict
   ├─ Ready ────────────► [Approve] (governed: preview→confirm→audit) → mission ready → Worker
   └─ Needs X ──────────► operator resolves at stage X → recompile (new package version, diff shown) → re-verdict
```

- **Approve** is a governed action (same preview→confirm→audit lifecycle as start/stop/accept). Approving a non-`Ready` package requires an explicit override confirmation and is audited as such — the operator can force it, but never silently.
- Each send-back is a one-click route to the exact runtime that owns the missing input. Resolving it and recompiling produces a **new package version with a visible diff** — the operator watches readiness climb toward Ready.

**API:** `POST /api/missions/approve` (governed), `GET /api/mission/:id/gap-report`, verdict included in `/api/missions/compile` and `/api/mission` responses.

**Success test (from the mission):** operator types `Director / Build Access & Roles V2` → Director resolves the capability, loads its Product Definition, builds an expanded snapshot, runs Gap Analysis, compiles a versioned package, and returns a verdict + review screen — **no manually assembled prompt.**

---

## 10. Recommended Implementation Order

Bottom-up, matching Vacilando's proven build philosophy (each layer durable + tested before the next). Every step is append-only JSONL, projected, restart-safe, governed, loopback-only. No push/merge/promote.

1. **Product Definition Runtime** (`product-definition.mjs` + store). Migrate `accepted_decisions` / `rejected_patterns` off the capability seed into a real product-definition object; capability keeps only `product_definition_ref`. Learning-loop write-back on `accept`. *Foundational — everything downstream reads it.*
2. **Capability model v2 + registry.** Expand fields (readiness, owner, metrics, dependencies, related, acceptance_history — projected from logs). Add `POST/PATCH/GET /api/capabilities`. Keep the bootstrap seed idempotent; support N capabilities.
3. **Knowledge Snapshot v2.** Expand the snapshot from files → sectioned context (decisions, capability data, mission/acceptance history, evidence). Preserve determinism + reproducibility + content-hash.
4. **Gap Analysis Runtime** (`gap-analysis.mjs`, `DeterministicReasoner` + `ReasoningProvider` seam). The first reasoning stage. Emits the Gap Report. *This is the intelligence.*
5. **Mission Package v2.** Versioning + `diff_from_previous` + embedded gap report + product-def snapshot + risks/questions + readiness verdict. Reuse supersede plumbing.
6. **Director Readiness verdict + Review flow.** Roll gap report → six-state verdict; add governed `POST /api/missions/approve` with send-back routing; wire verdict into compile/mission responses.
7. **Director intent parse + full pipeline wire-up.** `POST /api/director/prepare`: intent → resolve → product-def → snapshot → gap → readiness → compile → package. Extend `compileMissionForIntent` into the full 8-stage line.
8. **Operator UI: Mission Preparation & Review.** One screen: package + gap report + verdict + send-back buttons + version/diff. The operator *approves a package, does not author one.*

**Testing:** each runtime gets a `node --test` suite mirroring `mission-runtime.test.mjs` (currently 9/9). Browser certification of the Review screen deferred to a calmer host (per the host-thrash watch-out), same disposable-fixture bar as Closeout.

---

## Boundaries & governance (unchanged)

- **No provider execution this sprint.** Gap Analysis reasons deterministically; the provider seam stays dormant.
- Loopback only · fixed executables · `shell:false` · nothing pushed/merged/promoted without explicit approval.
- Destructive/consequential actions: preview → confirm → execute → audit. Approve is governed like every other action.
- **Do not revisit** Closeout, Trust Dashboard, Identity Runtime, or governed execution unless a regression appears — they are the execution foundation this layer sits on.

**This document is the sprint deliverable. Implementation begins only on Kelly's approval, in the order above.**
