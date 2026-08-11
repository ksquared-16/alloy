---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Business Process System

**Status:** Canonical (June 2026 freeze). Operator mental model and platform architecture for configurable processes.

**Supersedes:** Work Unit System as the **primary documentation abstraction**. Work units remain a runtime construct — documented here, not as the operator-facing spine.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze — RFC D8).** The frozen [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) codifies the **process-promotion criteria**: an operational sequence becomes a **Business Process** only when **all four** hold — durable per-subject stage/state, human-confirmed outcomes as the mutation path, queue/work membership, and readiness gates. Otherwise it is modeled with **Actions + status domains** (and surfaced via queues + Current Work). Applied to the expansion: **Attendance** = fact authoring on a roster (not a process); **Billing obligation review** = a consequence lifecycle (not a process); **AR/collections/dunning** = a process *candidate* (meets all four); **Scheduling/Staffing** = actions/facts by default, promoted only on evidence of staged governance.

---

## Operator mental model (canonical)

Operators think in this hierarchy:

```
Organization
  └── Business Process     ← e.g. Enrollment Process (/workspace landing)
        └── Stage          ← e.g. Touring, Waitlist (queue lanes / membership)
              └── Record   ← drawer detail (opportunity, person, child context)
```

**Not the primary mental model:** Organization → Work Unit → Stage → Record.

**Internal/runtime mapping:** Each business process owns one or more **work units** that host **queues** (`queue_definition`). Stages map to stage membership (`stage_key`) and stage operating plans — not to separate work units per stage (enrollment uses one `enrollment_pipeline` work unit with multiple domain queues). Queue lanes are generated from stage membership; status-binding-driven membership was removed by the Enrollment Alignment sprint (see `stage-membership-and-outcomes.md`).

---

## Frozen decisions (June 2026)

| Decision | Status |
|----------|--------|
| Operator label **Business Process** (not Lifecycle) in settings and workspace | **Shipped** — `businessProcessUiLabels.ts` |
| Enrollment Process — 8 stages (family: lead → tour → decision → closed; child: waitlist → enrolling → enrolled → closed_withdrawn) | **Shipped** — Enrollment Alignment sprint (qualification folded into lead: no distinct work lived there) |
| One execution work unit per enrollment department (`enrollment_pipeline`) | **Frozen** — stages are queues inside WU, not separate WUs |
| Case vs child lifecycle grain | **Frozen** — `opportunities.status_key` (case) vs `opportunity_customer_members.outcome_status_key` (child). Manual Create Lead opens a Processing Case at intake and creates no CRM records until operator approve + explicit commit; after commit, child `outcome_status_key` stays **null** until enrollment disposition is set (badge suppressed) — see `../modules/actions-and-workflows.md` § Create Lead fresh-data contract |
| Queue rows are preview-only | **Frozen** — see `queue-system.md` |
| Builder API paths remain `lifecycle-*` internally | **Accepted** — rename deferred |

**Open (document in roadmap, not here):** Status ownership grain expansion for additional entity types; strict-mode activation for child lifecycle gates.

---

## Business Process (configuration)

**Settings:** `/admin/settings/lifecycle` (UI: **Business Processes**)

A business process defines:

- **Name and catalog entry** — appears on `/workspace` landing and sidebar
- **Stages** — ordered steps in the operator journey
- **Process Command selection (`command_set_v1`)** — sole target process-wide authority for which Commands the process selects (P6.S1). Stage catalogs recommend/evaluate selected Commands; they do not create process selection.
- **Stage operating plans** — purpose, expected work, success/off-track criteria — see `docs/system/operating-plan-runtime-doctrine.md`
- **Stage membership** — subject grain + scope (`membership_criteria_v1`); membership itself is the persisted `stage_key`, written by outcome execution. Authoritative entry time is `stage_entered_at` on the stage owner (`opportunities` for family/case grain; `process_instances` for child/participant grain) — see queue operational awareness in `../operator/queue-system.md`
- **Outgoing transitions** — stage-owned, stable identities for destination, availability, and optional canonical status/close effects
- **Outcome Definitions** — stage-owned completion choices; Work Templates select Available Outcomes and outcomes compose movement, follow-up work, and attention
- **Required information & actions** — per-stage configuration
- **Layout assignments** — published layouts per stage slot — see `../operator/business-process-layout-assignments.md`

**Operations hierarchy (Commands mission):** Commands define capabilities → Automations may invoke/react to Commands → Business Processes select Commands → Stages recommend/evaluate selected Commands → Surfaces expose effective Commands. There is **no** standalone Organization Commands configuration product. `/organization/commands` is internal capability diagnostics only. `command_set_v1` remains process selection authority.

**Runtime consumption (P6.S2):** Current Work, process-aware stage evaluation, and optional BOS process filters resolve Commands through `projectProcessRuntimeCommands` → `resolveEffectiveBusinessProcessCommands`. **Authoring (P6.S3):** process saves stamp `command_set_v1`; Work Template options gate to process selection. Process Command picker UI remains P6.S4.

**Implementation tables:** `lifecycles`, `business_process_layout_assignments`, lifecycle builder metadata (JSON in org/dept metadata), stage keys in builder config.

### Requirement timing (July 2026)

Required information is a **requirement**, not a fake stage or fake work item. A field rule may now declare when it applies through `rule_meta_v1` stored beside `rule_levels_v1` in existing lifecycle field-rule metadata:

```ts
rule_meta_v1: {
  version: 1,
  by_rule_id: {
    "child:program_interest": {
      timing: "stage_exit",
      applies_to_transition_keys: ["tour_scheduled"],
      excluded_transition_keys: ["closed_lost"]
    }
  }
}
```

Supported timing values are `record_creation`, `stage_progress`, `stage_exit`, and `process_completion`.

Compatibility rule: rules without timing remain visible during stage progress / Current Work readiness, but they do **not** become universal blockers for every outgoing transition. Create Lead blocking is explicit: only `record_creation` rules and the code-owned minimum identity/contact requirements block record creation. Stage-exit blocking is explicit and transition-aware.

**Code entry points:**

- `web/lib/lifecycle/businessProcessUiLabels.ts` — operator-facing labels
- `web/lib/lifecycle/defaultEnrollmentBusinessProcessV1Stages.ts` — V1 enrollment stages
- `web/components/admin/lifecycle-builder/*` — builder UI
- `loadOperatorLifecycleLandingCards` — workspace landing catalog

---

## Stage (execution lens)

A **stage** is where operators **work a cohort of records** with shared expected work.

| Operator question | Configuration surface |
|-------------------|----------------------|
| Who belongs here? | Queue membership, entry conditions, grain |
| What work is expected? | Stage operating plan, task templates, action placements |
| What does success look like? | Outcome picker, outcome rules (metadata) |
| What is off track? | Attention rules, off-track criteria |

Stages render as **queue lanes** or **header pills** on the work-unit execution surface — not as separate navigation destinations.

> **Operator navigation is the Work View, not the stage or the lane.** A **Work View** (`WorkViewConfigV1Stored`) is the operator's named lens over a process's work (filters, sort, queue/Focus-Panel layouts). Every configured visible Work View **materializes** as its own navigation item (see *Work View runtime materialization* below) — a view may bind a queue lane via `compat_queue_key`, but a view without one still materializes and routes via `?work_view=<id>`. Queue lanes are **execution/runtime**; stages are **lifecycle/governance**. Neither is the operator's primary navigation tier — Work Views are. See [`../operator/operational-workspace-shell.md` § Operational Work Doctrine](../operator/operational-workspace-shell.md#operational-work-doctrine--the-canonical-chain).

### Work View conditions — operational predicate builder (V3)

A Work View's *"Show work when…"* conditions are a real **predicate builder**: `{ match, filters_v1[] }`
evaluated against queue-row facts. The condition field list comes from a canonical registry
(`web/lib/lifecycle/workViewConditionFieldRegistry.ts`) — every field declares its subject/entity, value
type, **option source**, supported operators, and runtime resolver. See
`docs/sprints/archive/06_2026/work_view_conditions_v3.md`.

- **Fields come from config/canonical registries, never hardcoded subsets.** The Enrollment start set:
  **Stage**, **Lead Status**, **Enrollment Status**, **Campus**, **Program**, **Room**, **Desired
  Start**, **Needs Attention**, **Current Work** — grouped by subject (*Lead / Child / Household /
  Operational*).
- **Stage is process-stage membership.** The process-stage field is labeled **"Stage"** and its options
  are the process's **configured, active stages** (not a status set). Stages are never deleted or demoted
  — Work Views reference them through this one typed field.
- **Status is subject/status-group specific (Status Truth Doctrine).** There is **no generic "Status"** —
  every status belongs to a subject/grain (see `status-and-state-system.md` § Status Truth Doctrine).
  **Lead Status** = opportunity case statuses (`opportunities`); **Enrollment Status** = the full
  configured child/OCM set (`opportunity_customer_members`). Each declares its entity via `optionSource`,
  so the two never share a dropdown, and **a stage uses the status of its own grain** (Lead stages use
  Lead Status; Waitlist uses Child Enrollment Status — never the family's lead status for a child waitlist).
  **Person Status** (`persons`) and **Account Status** (`customers`) are **planned**, not yet exposed:
  Account Status has no seeded `status_definitions`, and Person Status is not carried on opportunity/child
  Work View rows — exposing either before it is backed would be a dead condition.
- **Clean option sources.** **Campus** pulls only real campuses (`locations` where `location_type='site'`)
  — units/addresses/scaffolding excluded; **Room** pulls `location_type='unit'`.
- **Multiple conditions combine with AND/OR.** A Work View carries `match: all | any` (`all` = AND,
  `any` = OR; default AND). *status is X **or** Y* and *school AND room* are both expressible. The runtime
  evaluator (`evaluateWorkViewFiltersV1.ts`) honors the combinator.
- **Operator labels vs canonical keys.** Operators see *Stage / Lead Status / Enrollment Status /
  Campus*; canonical stored/runtime keys remain `opportunity_stage` / `opportunity_status` /
  `child_enrollment_status` / `site`.
- **Backward compatible.** Legacy generic conditions normalize on load — `stage → opportunity_stage`,
  `status → opportunity_status`, `location → site` (plus `enrollment_status → child_enrollment_status`);
  views with no `match` evaluate as AND; an invalid `match` is never silently reinterpreted. The evaluator
  resolves canonical and legacy keys identically.

### Work View runtime materialization

**Process config can define many Work Views; the runtime must materialize each one.** A configured,
visible Work View is its own operational lens — it appears in the left navigation under the process,
opens its own work view, evaluates its own predicates, and shows its own count. The Work Unit page must
**not** collapse to the first/default view.

- **Nav is Work-View-driven, not lane-driven.** `buildOperatorLifecycleLanding` emits one nav item per
  configured visible Work View (ordered by `display_order`, visibility respected). It no longer collapses
  to the single view that happened to bind a queue lane — the prior bug, where views lacking a
  `compat_queue_key` (or whose key didn't match a `queue_definition` lane) were silently dropped and the
  rail fell back to the one default "New Leads" lane.
- **Stable per-view route.** A view that binds a pipeline queue lane keeps its canonical lane-slug route
  (`/workspace/work-unit/:laneSlug`). A view without a bound lane routes to the host work unit with
  `?work_view=<id>` (a supported route param) — the runtime selects it (`resolveActiveWorkViewRuntimeContext`
  resolves by id), evaluates its predicates, and counts its rows via the predicate-filtered queue route.
  The legacy New Leads lane route remains the compatibility default.
- **Focus Panel is unaffected.** `/workspace/work-unit/:slug/:recordId` opens the record by id regardless
  of the active Work View (the query string is not part of the record-id path).
- **Stage roll-up (next modeling cleanup, not solved here).** Stage should be treated as an operational
  **bucket / roll-up over statuses and work**, and Work Views should consume stages as configured
  process-stage buckets. The queue/header **pill row** on the Work Unit page is still queue-backed (it
  filters/relabels existing `queue_definition` lanes); converting it to render every configured Work View
  with its own predicate-derived count is the follow-up, tracked with the Stage roll-up modeling.

### Work View draft vs published labels

Work View authoring **Save** persists draft configuration only. Operator-facing nav pills, queue labels, and catch-all cohort copy come from the **published** Business Process revision. After editing Work Views, operators must use **Apply changes** on the publication bar (`BusinessProcessPublicationBar`) before live runtime labels update. Runtime must not invent substitute labels when published config is authoritative.

### Operational Projection — one source of runtime truth

Every operational surface must agree because they derive from **one projection**, not from independent
queries. `computeOperationalProjection({ baseRows, workViews })`
(`web/lib/lifecycle/operationalProjection.ts`) takes the work unit's **all-records base rows** (the
`primary_total_queue`, e.g. `pipeline_total`) and each configured Work View's **V3 predicates**, and
returns: `total` (process scope), per-view `count` (=== `rows.length`, via the **same**
`filterQueueRowsByWorkViewFilters` evaluator as the rows), and single-record membership for the Focus
Panel.

- **One resolver for count and rows.** A Work View's count is the predicate-filtered count over the
  all-records base — **never** a `queue_definition` lane-membership summary. So process card "records",
  "All Leads", Work View counts, and queue rows agree (All Leads = total; each view's count = its rows).
- **Stage is persisted process state.** `opportunities.stage_key` / `OCM.stage_key` hold the
  record's stage, written by outcome execution and intake only (Enrollment Alignment sprint —
  previously stage was derived from `status_definitions.metadata.process_stage_key` roll-ups,
  which required `enrichRowsWithDerivedStage` and drifted). The projection reads the column;
  Stage Work View predicates (New Leads = stage "lead") match directly.
- **Analytics is not operational truth.** Window/aggregate metrics (e.g. "leads created in 30 days") are
  analytics — they may differ in scope and must be labeled as such. A KPI tile **never** renders a value
  beside a "No data" indicator (`oipDisplayValueIsPresent` guard).
- **Focus Panel loads by id; membership is evaluated against the active view.** `resolveFocusPanelScope`
  classifies a deep-linked record as in/out of the active Work View so the UI can offer "open in All
  Leads" instead of silently showing a record the active queue counts as 0.
- **Refresh recomputes the projection.** Membership-changing actions (Create Lead) dispatch the canonical
  `dispatchOpportunityQueueUpdated` — re-running the projection updates card count, Work View counts, rows,
  and Focus Panel scope from one event. See `docs/sprints/archive/06_2026/operational_projection_convergence.md`.

**Outcome picker:** My Tasks **Complete** flow resolves stage outcomes via `GET /api/admin/lifecycle-builder/stage-work-outcomes` — human confirms before side effects.

**Actions on a stage** are configured invocations of *registered capabilities* (action
placements), not free-form buttons. **Status transitions are validated server-side** and
**process required info informs eligibility/blockers**: the Action Runtime
(`web/lib/adminV2/actions/`) resolves available transitions from `status_definitions`,
enforces `status_transition_rules`, and returns required inputs/blockers before any
mutation. Config controls which actions appear and their copy; code owns the executable
semantics. See `../modules/actions-and-workflows.md` § Action Runtime contract.

A stage **places** commands; it does not own them. Every operational mutation is an
**Operational Command** (registered capability). The same command (e.g. `schedule_tour`,
`update_status`) may appear on a Work Unit rail, the Focus Panel Manage control, or a queue
row — one capability, many placements. How the subject is resolved is the **context
resolution**: Work Unit = `user_selection` (no inherited subject; the operator chooses a
required subject — never the highlighted row by default); Focus Panel / queue row =
`current_record`. Every surface executes through the one runtime, and operators always see an
actionable command state (needs subject / needs input / preview / confirm) rather than a raw
error. See `../modules/actions-and-workflows.md` § Operational Command Runtime.

Operators complete a placed command through the **platform-owned Command Surface** — a single
reusable shell (header/body/footer/success/failure) that is identical across the Work Unit rail,
Focus Panel Manage, queue row, and BOS. A stage's configuration influences command *content*
(availability, labels, required inputs, constraints, copy) but never the surface layout,
lifecycle, or component structure. The shell is now implemented (`CommandSurfaceShell` +
`useCommandSurfaceController`, Create Lead reference); execution is injected through the existing
registered-action route, so the BPS never gains a parallel mutation path. See
`../modules/actions-and-workflows.md` § Command Surface and
`docs/sprints/archive/06_2026/command_surface_v2.md`.

### Stage grain

Each stage declares a **grain** — the entity type that queue rows represent.

| Example stage | Grain |
|---|---|
| Enrollment Intake | family |
| Waitlist | child |
| Attendance | child |
| Billing | household |
| Family Summary | household |

Grain is a stage-level declaration, not a work-unit default. A single business process can contain stages at different grains. Queues built for a stage use the stage's grain.

### Stage-action relationship and evaluation states

Actions evaluated in stage context return one of five states:

| State | Meaning |
|---|---|
| **Recommended** | Expected at this stage, all preconditions met |
| **Ready** | Available and executable; not the highlighted next step |
| **Warning** | Executable with advisory notices |
| **Blocked** | Cannot execute; reason is shown to operator |
| **Unavailable** | Not applicable in this context |

**Actions do not disappear because of stage.** Blocked actions remain visible with their reason — operators can expedite (e.g. enroll a child who skipped the waitlist) while the platform still enforces business rules (e.g. placement confirmation required).

See `docs/platform/modules/business-process-execution-platform.md` for the full action evaluation model and domain registry.

---

## Record (authoritative detail)

Selecting a row opens the **drawer** with resolver-backed entity GET — not queue JSON.

See `record-system.md`, `drawer-system.md`.

---

## Work Units (implementation construct)

Work units are **scoped execution domains** that host queues and bootstrap runtime for a business process.

| Aspect | Detail |
|--------|--------|
| **Purpose** | Queue definition host, operational bootstrap, slug routing |
| **Route** | `/workspace/work-unit/:slug` |
| **Table** | `work_units` — `key`, `queue_definition`, department FK |
| **Not** | A lifecycle stage; not the operator's primary noun |

**Enrollment canonical pattern:** Single work unit `enrollment_pipeline` with `queue_definition.ui.sections` defining domains (New Leads, Tours, Waitlist, …) at varying **grains** (`case` vs `candidate`).

**Legacy (non-canonical):** Status-sliced work units (`pipeline_overview`, per-status WUs) — URL aliases may redirect; do not document as target architecture.

**Runtime docs (implementation detail):**

- Layout: `docs/system/work-unit-layout-doctrine.md` (frozen V3)
- Surface context: `docs/system/work-unit-surface-context-contract.md`
- Performance: `docs/system/adminv2-runtime-performance-doctrine.md`

---

## Needs Attention (overlay)

**Not a business process stage.** Resolver-backed operational overlay on the same queues — configurable buckets from `metadata.opportunity_attention_rules.needs_attention_buckets`.

On enrollment departments, the needs-attention queue usually lives **inside** `enrollment_pipeline`'s `queue_definition`, not as a standalone work unit.

---

### Work Items convergence (July 2026)

Stage work surfaced in **Current Work** is the authoritative Business Process execution path. The same work may appear in **Work Items** under the Business Process source for cross-record queue visibility — it is not duplicated as separate operational truth.

- **Shared identity:** `work_id` ≡ `operational_tasks.id` across What’s Next and Workspace Work Items.
- Current Work → Work Items: deep link with same underlying task/work identity.
- Work Items → Current Work: focus event on the record-scoped work surface.
- Outcome completion remains on the authoritative BP / Current Work path.

### Work identity and reconciliation across stage movement (July 2026)

Durable BP work identity is **process subject + semantic work definition** (platform work definition / template key) — not the current stage. Stage determines expected work and applicability.

When an outcome changes stage, a canonical reconciliation pass resolves each existing or destination-expected work item to exactly one lifecycle result: `completed` | `carried_forward` | `canceled` | `superseded` | `created`.

- Carry-forward preserves the same `operational_tasks.id` and normalizes legacy stage-scoped fingerprints to the semantic form (`bpw:…`).
- Completed work stays completed and remains visible in Activity / Work Items history.
- Obsolete work is explicitly canceled or superseded — never silently deleted.
- Destination work is created only when no valid existing identity satisfies it.
- Reconciliation is idempotent across retries and projection refreshes.

### Child-grain outcome execution (July 2026)

Child-journey stages require a threaded child subject (`customer_member_id` / process instance). Outcomes must not silently fall back to family/case grain. `waitlist_child` converges onto the same outcome → disposition + stage path so status/stage are not double-written beside outcome rules. Multi-child families move only the selected child.

### Transition-specific readiness blocking (July 2026)

Before any stage-changing outcome commits, the platform evaluates configured `stage_exit` requirement timing and transition applicability. Missing fields are not universal blockers — only transition-scoped requirements block. On block: no stage mutation, no durable status mutation, no initiating-work completion, no destination work creation, no source-work cancellation. Child transitions evaluate the selected child’s canonical data (e.g. Program), not sibling or family defaults.

### Stable Focus Panel after leaving the active Work View (July 2026)

After a successful stage move, the Focus Panel stays on the same record. What’s Next, Work Items, Activity, queue rows, and Work View totals refresh from the **canonical operational projection** (one membership/count evaluator). The surface does **not** auto-navigate to the destination Work View. When the record is out of the active view, the operator sees an explicit affordance (e.g. “This record has moved to Tours. Open in Tours”). Latest committed outcome and record version win; stale responses are rejected.

### Default plan vs published tenant plan precedence (July 2026)

Code defaults (`defaultEnrollmentStageOperatingPlans`) apply when a stage has **no** published `stage_operating_plan_v1`. A published tenant operating plan **shadows** code defaults entirely for that stage — there is no deep merge at runtime. Org-safe re-seed helpers (e.g. Tour Scheduled defaults) may **add** missing canonical outcomes/rules/sufficient-command-results only where the tenant has not already configured a conflicting key; they must never overwrite intentional tenant configuration.

### Work Template action configuration (July 2026)

- **Process configuration declares subject grain** — family, child, person, or other supported record grain via stage/process metadata; the UI must not infer grain from vertical-specific assumptions.
- **Actions express operator intent** — Work Templates own placement and ordering; the Action Registry owns execution capability.
- **Target resolution** comes from process/work/runtime configuration, not duplicate grain-specific action keys in the editor.
- **Intent vs execution** — Work Templates store intent-level `action_ref` values (e.g. `move_to_waitlist`). Runtime resolves execution keys (`waitlist_child`, `move_to_waitlist`, …) from process subject configuration. Legacy saved aliases continue to execute. Multi-subject picker UI is deferred; `resolveActionIntentExecution` exposes `requiresSubjectPicker` when applicable subjects exceed one.
- **Outcome Definitions** are stage-owned and edited once. **Available Outcomes** on each Work Template are references to those definitions; templates do not duplicate them. Legacy `work_template_key` remains readable but is not required for new outcomes.
- **Transition authority** — `stage_operating_plan_v1.outgoing_transitions` owns stable `transition_ref`, source, destination, label, availability, and optional canonical resulting status. Outcomes reference only `transition_ref`; destination/status text in a newly authored outcome rule is invalid.
- **Outcome behavior is composable** — work completion stays on the outcome definition; after recording may stay or move through one transition, create zero or many follow-up Work Template instances, and optionally create attention. Selecting a configured closed status on the transition derives close semantics; there is no separate Close Record behavior.
- **Explicit vs fallback** — `undefined` on a Work Template bucket allows legacy runtime fallback; `[]` means explicitly configured empty.
- **Current Work Recent Activity** reuses the same canonical activity projection as the Focus Panel Timeline card, with a small preview adapter for prioritization and limits.


## Related docs

| Topic | Doc |
|-------|-----|
| Business Process Execution Platform | `../modules/business-process-execution-platform.md` |
| Navigation & workspace landing | `navigation-and-workspace-doctrine.md` |
| Queues & preview contract | `queue-system.md` |
| Status ownership | `status-and-state-system.md` |
| CRM enrollment grain | `../../product/crm-system.md` (supplemental — childcare vertical) |
| Sprint closeout | `docs/sprints/archive/06_2026/business_processes_v1_sprint_report.md` |

## When this doc must be updated

When operator hierarchy language changes, stage/work-unit binding rules change, stage-action or grain model shifts, or enrollment canonical patterns change.
