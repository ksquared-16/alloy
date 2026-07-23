# Worker Runtime V1 — Mission Package Contract (design)

> Status: design for approval. Returned **before coding** per the slice brief.
> Scope: finish the Worker Runtime so it executes a durable **Mission Package**,
> never a raw free-form objective. Do NOT build Knowledge / Product Definition /
> Acceptance / Reasoning runtimes or the full Director conductor yet. The package
> may be **manually compiled** for V1, but its schema and lifecycle are real and
> durable.

Builds on the approved decomposition in `MISSION-RUNTIMES-ARCHITECTURE-V1.md`.
The Worker Runtime floor already exists (`commands/missions.mjs`,
`providers.mjs::startMissionTurn`, `provider-runtime.mjs::precheckProvider`).

---

## 1. Final Mission Package schema

Durable, versioned, append-only store at
`<runtime-root>/vacilando/missions/packages.jsonl`, projected per `package_id`.
A package targets one `mission_id`; the mission record binds the active package
via `package_id` + `package_version`. `readiness_status` is **computed** by
validation on every write (never free-set except `superseded`).

```
MissionPackage {
  schema_version: "vacilando.mission-package.v1"
  package_id:     string          // pkg_<sha slice>
  version:        int             // increments on recompile; prior → superseded
  mission_id:     string          // durable mission this package targets
  project_id:     string
  worker_slot:    int (1..6)
  title:          string
  objective:      string          // the single mission objective

  scope_included: string[]        // in-scope statements (≥1 to be ready)
  scope_excluded: string[]        // explicit exclusions, e.g. "no implementation" (≥1)

  relevant_documents:      [{ uri, title, why_relevant }]
  approved_references:     [{ type: screenshot|doc|code|url, uri, note }]
  inherited_product_rules: [{ id, scope: product|capability|mission, rule, provenance }]
  accepted_decisions:      [{ id, statement, rationale, provenance }]
  rejected_patterns:       [{ id, statement, reason, provenance }]

  acceptance_criteria: [{ id, type, statement, evidence_required: string[] }]   // ≥1
  required_evidence:   [{ id, kind: test|screenshot|report|file|log, description, criterion_ids: string[] }]

  unresolved_questions:    [{ id, question, blocking: bool }]
  operator_decision_gates: [{ id, decision, options?: string[], resolved: bool, resolution?: string }]
  governance_constraints:  { no_push, no_merge, no_promote, no_scope_broadening,
                             ask_before_consequential, loopback_only, extra?: string[] }

  QA_plan:               [{ id, step, verifies?: criterion_ids }]   // ≥1
  expected_deliverables: [{ id, kind, description, criterion_ids?: string[] }]   // ≥1

  compiled_at:        iso
  compiler_version:   string      // "manual/v1" for hand-compiled packages
  readiness_status:   draft | blocked | awaiting_operator | ready | superseded   // COMPUTED
  readiness_findings: [{ code, severity: block|warn|info, message, field? }]
}
```

## 2. Readiness validation rules (deterministic)

`validatePackage(pkg) → { readiness_status, readiness_findings }`, recomputed on
every write. **Block-level** findings (→ cannot be ready):

| code | condition |
|---|---|
| `objective_missing`        | `objective` empty |
| `scope_missing`            | `scope_included` empty |
| `exclusions_missing`       | `scope_excluded` empty |
| `acceptance_criteria_missing` | `acceptance_criteria` empty |
| `qa_plan_missing`          | `QA_plan` empty |
| `deliverables_missing`     | `expected_deliverables` empty |
| `governance_missing`       | any of the four hard flags (`no_push`, `no_merge`, `no_promote`, `no_scope_broadening`) not `true` |

**Warn-level** (ready is still allowed, surfaced): `criterion_without_evidence`
(an acceptance criterion referenced by no `required_evidence` item and with empty
`evidence_required`).

**Status derivation (precedence):**
1. `superseded` flag set → `superseded`.
2. Any block-level finding → `blocked`.
3. Any `unresolved_questions[].blocking === true` **or** any
   `operator_decision_gates[].resolved === false` → `awaiting_operator`.
4. Otherwise → `ready`.
5. `draft` = explicit initial authoring state before first validation.

## 3. Worker execution contract

**Start preconditions** — a mission may start **only** when ALL hold:

- a package exists and is bound to the mission
- `package.readiness_status === "ready"`
- `objective` present
- `scope_included` and `scope_excluded` present
- `acceptance_criteria` ≥ 1
- `QA_plan` present
- no open blocking questions
- `governance_constraints` present

If any fail, Worker Runtime **refuses to execute**, returns the **exact blockers**
(readiness findings + failed preconditions), and marks the package/mission as
routed back to Director (`awaiting_operator`/`blocked`). It NEVER sends a raw
objective and NEVER asks the provider to discover missing mission definition.

**Execution steps** (all enforced, not by convention):

1. **Load** the package by `package_id`; re-validate `ready`.
2. **Bind** to the mission record (`package_id`, `package_version`; status
   `ready → starting`).
3. **Serialize** the package into a **structured** provider prompt — a
   deterministic rendering with labeled sections (`OBJECTIVE`, `IN SCOPE`,
   `EXCLUDED — HARD`, `PRODUCT RULES`, `ACCEPTED DECISIONS`, `REJECTED PATTERNS`,
   `ACCEPTANCE CRITERIA`, `REQUIRED EVIDENCE`, `QA PLAN`, `EXPECTED DELIVERABLES`,
   `GOVERNANCE`, `TURN PROTOCOL`) — **never** the raw objective string alone. The
   provider is told: everything needed is here; do not rediscover; report
   per-criterion; end the turn with a control token.
4. **Start** the streaming turn (`startMissionTurn`); capture `provider_session_id`
   from the first frame and persist it immediately.
5. **Track** execution state (`starting → running`, `last_activity_at`,
   `turn_count`) — honest liveness, no fabricated granular progress.
6. **Persist outputs** against `expected_deliverables`.
7. **Bind evidence** to acceptance criteria where possible (via
   `required_evidence.criterion_ids`); unproduced evidence is recorded as missing,
   never fabricated.
8. **Stop and escalate** on: unresolved product truth · an operator decision gate
   · a governance approval · a scope contradiction → `waiting_for_operator` /
   `blocked` (via the turn control protocol).
9. **Never silently broaden scope** — `no_scope_broadening` is embedded in the
   prompt; a detected scope contradiction → `blocked`.
10. **Never mark complete on a provider claim alone** — a provider "completed"
    claim is recorded as a *claim*; the mission moves to `waiting_for_acceptance`.

**Turn control protocol** (the provider emits exactly one final token):
`<<VACILANDO status=completed>>` · `<<VACILANDO status=waiting_for_operator>>`
(question above it) · `<<VACILANDO status=blocked>>` (reason above it). No output
after the token. Absent token → `waiting_for_operator` (never assumed complete).

## 4. Output and evidence contract

Durable under `<runtime-root>/vacilando/missions/outputs/<mission_id>/`.

- **Turn output** — each turn's full provider text persisted (`turn-<n>.md`).
- **Completion report** — the provider emits a fenced, sentinel-delimited JSON
  block Worker Runtime parses and persists:
  ```
  { implementation_summary, changed_files[], tests{ran,results},
    screenshots[], reports[],
    criterion_evidence[]: { criterion_id, status: met|partial|unmet|not_evidenced, evidence_ref },
    deviations_from_package[], unresolved_items[], provider_completion_claim{claimed,text} }
  ```
- **Evidence records** — `{ evidence_id, kind, uri|inline, criterion_ids,
  provenance_turn }`, durable and readable by a future Acceptance Runtime.
- **Deliverable mapping** — outputs mapped to `expected_deliverables` ids where
  tagged; unmapped output stored as general output; missing deliverables recorded.
- **Worker Runtime assessment** — Worker Runtime computes its OWN verdict
  (does bound evidence cover the criteria?) distinct from the provider's claim.

## 5. Completion-state rules

Extend the mission lifecycle with `waiting_for_acceptance`. After a turn the
mission may move ONLY to:

- `waiting_for_acceptance` — provider claims done AND a completion report parsed;
  Worker Runtime assessment computed; final acceptance deferred.
- `waiting_for_operator` — question or operator decision gate.
- `blocked` — cannot proceed (unresolved product truth / scope contradiction /
  governance approval needed).
- `failed` — provider error / turn failure / auth.
- `stopped` — operator Stop.
- (`interrupted` — server restart; recoverable.)

**`completed` / `accepted` is never auto-set.** It requires the Acceptance Runtime
gate to pass (future) OR an explicit operator acceptance action. A provider
completion claim advances the mission to `waiting_for_acceptance` only.

## 6. UI changes (Slot 6)

**Mission Package panel** (new, in the Director/Work surface for the slot):

- readiness badge (`draft` / `blocked` / `awaiting_operator` / `ready` /
  `superseded`) + findings list
- objective · scope (included) · exclusions
- criteria count · unresolved-questions count · operator-gates count
- QA plan (count/summary) · expected outputs (count)

**Actions:** Review Package (full view) · **Start Mission** (disabled unless
`ready`) · Stop Mission · Send Steering Instruction · View Outputs · View Evidence.

Mission execution status uses the mission vocabulary including
`waiting_for_acceptance`. Questions/gates surface in Needs You.

## 7. Certification plan

Manually author a package (`compiler_version: "manual/v1"`) for
**"Product Definition + Acceptance Runtime V1 — Proposal Only"**:

- **objective** — analyze current Vacilando; produce a proposal (current-state
  diagnosis, proposed model, smallest vertical slice, QA plan, exclusions,
  operator decisions) for the Product Definition + Acceptance Runtime.
- **scope_included** — analysis + a written proposal.
- **scope_excluded** — any code/implementation; push/merge/promote.
- **relevant_documents** — `MISSION-RUNTIMES-ARCHITECTURE-V1.md`, existing
  Vacilando planning docs; **approved_references** — the architecture doc.
- **acceptance_criteria** — the required proposal sections are present + no code
  changed. **expected_deliverables** — the proposal sections.
- **QA_plan / required_evidence** — worktree diff shows no source changes; the
  proposal is stored as an output.
- **governance_constraints** — no push/merge/promote/scope-broadening; loopback.
- **operator_decision_gates** — one review gate → forces end in
  `waiting_for_operator` / `waiting_for_acceptance`.

**Two runs:**
- (a) an intentionally **incomplete** package (omit `acceptance_criteria` or
  `QA_plan`) → readiness `blocked` → Start disabled/refused with exact blockers
  (proves points 3, 4).
- (b) the **complete** package → `ready` → Start (proves points 1, 2, 5).

**Proof matrix (12 points):**
1. raw text not sent directly → structured serialization (step 3) + API requires `package_id`
2. worker starts from a package reference → start API takes `package_id`, not text
3. readiness visible → panel badge + findings
4. incomplete package blocked → run (a)
5. ready package starts → run (b), < 1s
6. survives browser refresh → durable mission + package projection
7. session identity persisted → `provider_session_id` captured from first frame
8. proposal stored as expected output → output bound to a deliverable
9. provider does not implement → `git status` clean in the worktree; proposal is analysis only
10. ends `waiting_for_operator` / `waiting_for_acceptance` → operator review gate
11. follow-up resumes same mission → `--resume <session>` steering turn
12. no push/merge/promote → audit + clean remote

Evidence under
`docs/platform/planning/vacilando-os/qa/worker-runtime-v1-mission-package/`.
