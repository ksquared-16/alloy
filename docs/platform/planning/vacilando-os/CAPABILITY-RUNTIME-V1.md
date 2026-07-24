# Capability Runtime V1 — architecture (completes the upstream half)

> Status: architecture for approval. **Design only — do not implement.** Does not
> revise Worker Runtime or Mission Compiler. Builds on
> `MISSION-RUNTIMES-ARCHITECTURE-V1.md`, `MISSION-COMPILER-V1.md`,
> `WORKER-RUNTIME-V1-MISSION-PACKAGE.md`.

## The gap this closes

Capability Resolution assumed Director *discovers* Scheduling, Financials, Forms,
etc. That is wrong. **Capabilities are first-class runtime objects.** Director
never rediscovers a capability — it **retrieves** the capability object. Each
capability (Scheduling, Financials, Enrollment, Forms, Communications, Programs,
Locations, Access & Roles) becomes durable, curated, authoritative truth — not a
pile of documents.

**The load-bearing separation:** Capability Runtime owns capability **truth**;
Knowledge Runtime owns **retrieval**. Capability Runtime performs no generic
search. Knowledge Runtime defines no capability truth. The capability object is
the **map/spine**; the other runtimes own the **territory** (rules, criteria,
docs) and the object holds authoritative **references** into them.

---

## 1. Capability Runtime responsibilities

- Own the durable, authoritative **Capability object** for every capability — a
  first-class runtime object, not a document collection.
- Provide **deterministic retrieval of a capability by id/name** — Director asks,
  it returns the object. **No generic search.**
- Own capability-level truth that no other runtime owns: `status`, `maturity`,
  `graduation_status`, `roadmap`, `known_issues`, cross-capability
  `relationships`, `operator_notes`, and the curated index of `active_missions` /
  `mission_history`.
- Own the **curated spine of authoritative references** — pointers to where each
  kind of truth lives (Product Definition, Acceptance, Architecture, Knowledge),
  plus curated `approved_screenshots` / `rejected` visual references.
- **Maintain** capability truth as capabilities evolve: status transitions,
  maturity graduation, roadmap progress, known-issue tracking — updated via
  write-back from mission completion and acceptance-gate results.
- Does **not**: perform generic document search (Knowledge does) · define product
  rules (Product Definition does) · evaluate criteria (Acceptance does) · execute
  (Worker does).

Distinction, stated once: Capability Runtime answers **"what is Scheduling, and
where does its truth live?"** (authoritative, curated, structured). Knowledge
Runtime answers **"find documents relevant to this scope"** (retrieved, ranked).

## 2. Capability object schema

Durable, versioned store. Fields the Capability Runtime **owns directly** vs those
it holds as **references** into the owning runtimes (never duplicated truth):

```
Capability {
  schema_version: "vacilando.capability.v1"
  capability_id:  string          // cap_scheduling
  project_id:     string
  name:           string          // "Scheduling"
  description:    string

  // ---- owned directly (capability-level truth no other runtime owns) ----
  status:         proposed | active | in_development | stable | deprecated
  maturity:       cold | emerging | established | mature      // implementation maturity
  graduation_status: { level, criteria_met[], criteria_pending[], graduated_at? }
  roadmap:        [{ id, item, status: planned|in_progress|done|parked }]
  known_issues:   [{ id, issue, severity, status }]
  relationships:  [{ to: capability_id, kind: depends_on|materializes_into|shares_data_with|adjacent }]
  operator_notes: [{ note, actor, at }]
  active_missions:[{ mission_id, title, status }]             // curated index
  mission_history:[{ mission_id, title, outcome, at }]
  current_implementation: { code_paths[], entry_points[], runtime_behavior_note, last_verified_at }
  current_runtime_behavior: { summary, health? }
  updated_at, updated_by

  // ---- authoritative REFERENCES (resolve to the owning runtime; not copies) ----
  product_definition_ref: { runtime: "product-definition", scope: capability, ref }
  acceptance_ref:         { runtime: "acceptance", ref }       // criteria + gate + ledger + evidence index
  architecture_ref:       { uri }
  documentation_index:    [{ uri, title, kind }]               // curated pointers, NOT a search result
  accepted_decisions:     [{ id, statement, ref }]             // ref → Product-Def / Acceptance ledger
  rejected_patterns:      [{ id, statement, reason, ref }]
  approved_screenshots:   [{ uri, note, approved_at }]
  visual_references:      [{ type: approved|rejected, uri, note }]
  qa_evidence_ref:        { runtime: "acceptance", evidence_index_ref }
}
```

The capability object is a **curated spine of references** plus the capability-
level state no one else owns. Rules, criteria, evidence, and documents live in
their owning runtimes; the object points at the current truth and never becomes
its editable home.

## 3. Relationship to Knowledge Runtime

- **Capability Runtime returns the object; Knowledge Runtime returns documents.**
- Director retrieves the **capability object first**; that object **scopes** the
  Knowledge query (capability_id + documentation_index + code_paths +
  relationships), so Knowledge retrieves only relevant supporting docs — never a
  blind global search.
- **Knowledge owns:** search · ranking · relationships (document-level graph) ·
  cross-capability discovery · snapshots · document retrieval · versioning. It can
  *discover* documents the object doesn't yet reference and **suggest** them back
  to the Capability Runtime for curation.
- **Knowledge must not become another Capability Runtime:** it holds no
  status/maturity/roadmap, no authoritative decisions — only retrievable documents
  and their relationships.
- Symbiosis: the object gives Knowledge the **scope + seed references**; Knowledge
  **expands within that scope** and surfaces uncurated docs. Capability = curated
  truth; Knowledge = discovered documents. (Boundary on "relationships":
  Capability owns *semantic capability-level* edges — `materializes_into`;
  Knowledge owns *document-level* edges — "this doc cites that doc.")

## 4. Relationship to Product Definition Runtime

- Product Definition Runtime **owns the actual product rules** (permanent /
  capability / mission scoped; accepted/rejected patterns; exclusions; questions;
  future enhancements) as a durable ledger.
- Capability Runtime **references** them: `product_definition_ref` scoped to the
  capability; the object's `accepted_decisions` / `rejected_patterns` are
  **summaries with refs** into the Product-Def ledger, not the source of truth.
- **Boundary:** to change a rule → Product Definition Runtime (append to ledger);
  the capability's references resolve to the current ledger state. The capability
  owns the *capability-level framing* ("this rule applies to Scheduling"); Product
  Definition owns the *rule itself* + scope/provenance/status.

## 5. Relationship to Acceptance Runtime

- Acceptance Runtime **owns** typed criteria sets, evidence bindings, the gate,
  and the decision ledger.
- Capability Runtime **references** the capability's acceptance posture via
  `acceptance_ref`, and **consumes** acceptance results as an input to
  `maturity` / `graduation_status` — a capability graduates
  (emerging → established → mature) as its acceptance gates pass across missions.
- **Boundary:** Acceptance owns criteria + evidence + verdicts; Capability
  references the current posture and derives maturity from it. Capability never
  evaluates criteria itself.

## 6. Updated Director orchestration

```
Mission Intent (Kelly)
  → Capability Retrieval   (Capability Runtime)  — retrieve the durable object; never rediscover
  → Knowledge Retrieval    (Knowledge Runtime)   — scoped BY the object → supporting docs + snapshot
  → Gap Analysis           (Reasoning Engine)    — on intent + capability object + knowledge
  → Mission Compilation    (Mission Compiler)    — object + knowledge + decisions + gaps → package
  → Operator Review        (Kelly / Director gate)
  → Ready → Worker Runtime (execute)
```

Stage 1 changes from **"Capability Resolution (discover)"** to **"Capability
Retrieval (retrieve the durable object)."** Escalation: if the intent names a
capability with no object yet → Director asks whether to **register a new
capability** (a deliberate operator bootstrap, never silent discovery).
Capabilities are created explicitly, then retrieved forever after. Gap Analysis
now receives the **capability object** (known_issues, rejected_patterns, roadmap,
maturity), so Reasoning compares the intent against authoritative capability state
rather than raw documents — sharper gaps, fewer of them for mature capabilities.

## 7. Scheduling walkthrough

**Intent:** "Improve Scheduling."

1. **Capability Retrieval (Director → Capability Runtime):** retrieve
   `cap_scheduling`. Returns the object: `status=active`, `maturity=established`;
   `product_definition_ref` (proposed-vs-operational tiers; entry-is-the-child);
   `acceptance_ref` (criteria + 37/37, 99/99 QA); `architecture_ref`
   (SchedulingProjection, `placement` family, `room_fit`); `current_implementation`
   (code paths); `active_missions` (Milestone-1, room-fit); `known_issues`;
   `rejected_patterns` (OCM, needs-placement queue gate, blank-form/orphaned-
   projection); `approved_screenshots` (card+editor mockups); `roadmap`;
   `relationships` (`materializes_into: cap_enrollment`).
2. **Knowledge Retrieval:** scoped by the object → **only** Scheduling supporting
   docs (spec detail, related decision docs, QA logs) + snapshot. Not a global
   search.
3. **Gap Analysis (Reasoning):** intent + object + docs → "improve" is unscoped →
   one clarification question; flags criteria gaps for an open-ended "improve."
4. **Mission Compilation:** assembles the package from the object (rejected
   patterns, decisions, references already curated) + knowledge + gaps.
   `readiness = awaiting_operator` (clarification blocking).
5. **Kelly Review:** one clarification/approval → `ready` → Worker.

Director never asks "what is Scheduling?" — it **retrieves** Scheduling. The
rejected patterns, decisions, and screenshots are curated capability truth in the
object, not rediscovered each mission.

## 8. Access & Roles V2 walkthrough

**Intent:** "Build Access & Roles V2."

1. **Capability Retrieval:** retrieve `cap_access_roles`. Returns `maturity=mature`
   (V1 shipped + graduated); `product_definition_ref` (role model, permission
   taxonomy); `acceptance_ref` (V1 criteria + passing gates); `architecture_ref`;
   `mission_history` (V1); `rejected_patterns`; `approved_screenshots`; `roadmap`
   (V2 items already planned/parked).
2. **Knowledge Retrieval:** scoped → V1 supporting docs.
3. **Gap Analysis:** few gaps — V2 is a delta on a mature, well-defined object;
   criteria derive from the established taxonomy in `acceptance_ref`; the roadmap
   already frames V2.
4. **Mission Compilation:** a complete package; `readiness = ready` (or one
   scope-confirm gate).
5. **Kelly Review:** one approval.

**Why mature capabilities need fewer operator decisions:** a mature capability
object carries graduated product definition, passing acceptance criteria, a stable
architecture, curated rejected patterns, and a roadmap. Reasoning finds few gaps
because the authoritative truth is already **resolved in the object**, so
compilation converges to a ready package. A cold capability (no object, or
`maturity=cold`) has thin references → many gaps → many operator gates to
establish truth. **Approvals scale inversely with capability maturity — and
maturity now lives in a durable object, not in Kelly's head.**

## 9. Relationships — the runtime graph and ownership boundaries

```
Project                         (registry: owns the capability set + project config)
  └─ Capability                 (Capability Runtime: owns the object + capability-level truth)
        ├─ references → Product Definition   (owns product rules)
        ├─ references → Acceptance           (owns criteria · evidence · gate · ledger)
        ├─ references → Knowledge / Architecture (owns document corpus + retrieval)
        ├─ owns       → status · maturity · roadmap · known_issues · relationships · operator_notes
        └─ Mission                           (Worker/Mission store: owns execution state + outputs)
              └─ Worker                       (owns a running turn / Provider session)
```

**Ownership boundaries:**
- **Project** — top-level container; owns the capability set + project config.
- **Capability Runtime** — the capability object: identity, status, maturity,
  roadmap, known_issues, relationships, operator_notes, curated references, and the
  active/historic mission index. Authoritative capability truth + spine.
- **Product Definition** — product rules (referenced by the capability).
- **Acceptance** — criteria/evidence/gate/ledger (referenced by the capability;
  feeds maturity/graduation).
- **Knowledge** — document corpus + retrieval/ranking/snapshots (scoped by the
  capability).
- **Mission (Worker Runtime)** — mission records, execution state, outputs. A
  mission belongs to exactly one capability (`mission.capability_id`); the
  capability **references** its missions but does not own their execution.
- **Worker** — a single running turn (Provider session).

Cross-capability edges live in the object's `relationships` — e.g. **Scheduling
`materializes_into` Enrollment** (the enrollment materialization boundary),
Enrollment `depends_on` Programs/Locations. These are semantic, capability-level
edges — distinct from Knowledge's document-level relationships.

## 10. Remaining architectural gaps

1. **Capability Runtime is unbuilt** — the new authoritative capability-object
   store.
2. **Capability registration / bootstrap** — creating a cold capability object
   (operator action + minimal seed); no silent discovery.
3. **Capability truth maintenance (write-back)** — who keeps status / maturity /
   known_issues / roadmap / active_missions current? Needs hooks from Worker
   completion and Acceptance-gate results into the object (a passing gate bumps
   maturity; a completed mission moves active → history). This is the "capability
   stays current" mechanism and is essential — a stale object is worse than none.
4. **Reference resolution + staleness** — references into Product-Def / Acceptance
   / Knowledge must resolve and stay valid as those ledgers version; mirrors
   package staleness handling.
5. **Maturity / graduation model** — exact criteria for cold → emerging →
   established → mature and the graduation gate (driven by Acceptance results +
   roadmap completion) need definition.
6. **Cross-capability relationship graph** — deriving/maintaining
   `depends_on` / `materializes_into` edges (some known: Scheduling →
   materializes_into → Enrollment; Enrollment → depends_on → Programs/Locations).
7. **Initial seeding** — a one-time curation/migration of existing scattered truth
   (memory + docs) into the first capability objects.
8. **Overlap discipline** — Capability vs Knowledge "relationships" must stay
   distinct (semantic capability edges vs document-citation edges); enforce the
   boundary so Knowledge never accretes capability truth.

**Recommended build order (bottom-up, unchanged):** Worker Runtime V1 → Knowledge
Runtime V1 → **Capability Runtime V1** → Acceptance → Product Definition → Mission
Compiler → Reasoning → Director conductor. (Capability sits just above Knowledge:
it needs a retrieval substrate to reference, and everything above it — Compiler,
Director — needs the capability object to retrieve.)

**Stop. Do not implement.** This completes the upstream half of the Vacilando
operating model.
