# Business Process System

**Status:** Canonical (June 2026 freeze). Operator mental model and platform architecture for configurable processes.

**Supersedes:** Work Unit System as the **primary documentation abstraction**. Work units remain a runtime construct — documented here, not as the operator-facing spine.

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

**Internal/runtime mapping:** Each business process owns one or more **work units** that host **queues** (`queue_definition`). Stages map to queue membership, stage operating plans, and status bindings — not to separate work units per stage (enrollment uses one `enrollment_pipeline` work unit with multiple domain queues).

---

## Frozen decisions (June 2026)

| Decision | Status |
|----------|--------|
| Operator label **Business Process** (not Lifecycle) in settings and workspace | **Shipped** — `businessProcessUiLabels.ts` |
| Enrollment Process V1 — 13 stages (family + child journeys) | **Shipped** — default builder seed |
| One execution work unit per enrollment department (`enrollment_pipeline`) | **Frozen** — stages are queues inside WU, not separate WUs |
| Case vs child lifecycle grain | **Frozen** — `opportunities.status_key` (case) vs `opportunity_customer_members.outcome_status_key` (child). Create Lead leaves child `outcome_status_key` **null** at intake (no enrollment disposition yet; badge suppressed) — see `../modules/actions-and-workflows.md` § Create Lead fresh-data contract |
| Queue rows are preview-only | **Frozen** — see `queue-system.md` |
| Builder API paths remain `lifecycle-*` internally | **Accepted** — rename deferred |

**Open (document in roadmap, not here):** Status ownership grain expansion for additional entity types; strict-mode activation for child lifecycle gates.

---

## Business Process (configuration)

**Settings:** `/admin/settings/lifecycle` (UI: **Business Processes**)

A business process defines:

- **Name and catalog entry** — appears on `/workspace` landing and sidebar
- **Stages** — ordered steps in the operator journey
- **Stage operating plans** — purpose, expected work, success/off-track criteria — see `docs/system/operating-plan-runtime-doctrine.md`
- **Queue membership** — which records appear in which stage (`queue_membership_v1`)
- **Status bindings** — platform status keys tied to stage transitions
- **Required information & actions** — per-stage configuration
- **Layout assignments** — published layouts per stage slot — see `../operator/business-process-layout-assignments.md`

**Implementation tables:** `lifecycles`, `business_process_layout_assignments`, lifecycle builder metadata (JSON in org/dept metadata), stage keys in builder config.

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
| Who belongs here? | Queue membership, status filters, grain (case vs candidate) |
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
`docs/sprints/06_2026/work_view_conditions_v3.md`.

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
- **Stage is a roll-up over status.** Opportunities do not store a stage column; a record's stage = the
  stage its `status_key` belongs to (`status_definitions.metadata.process_stage_key`, e.g.
  `new_inquiry → lead`). The projection derives `opportunity_stage` from the status
  (`enrichRowsWithDerivedStage`) before evaluating, so Stage Work View predicates (New Leads = stage
  "lead") match. Without this, a Stage predicate evaluates against a null stage and a new lead falls
  through to whatever view's `needs_attention`/`any` branch catches it.
- **Analytics is not operational truth.** Window/aggregate metrics (e.g. "leads created in 30 days") are
  analytics — they may differ in scope and must be labeled as such. A KPI tile **never** renders a value
  beside a "No data" indicator (`oipDisplayValueIsPresent` guard).
- **Focus Panel loads by id; membership is evaluated against the active view.** `resolveFocusPanelScope`
  classifies a deep-linked record as in/out of the active Work View so the UI can offer "open in All
  Leads" instead of silently showing a record the active queue counts as 0.
- **Refresh recomputes the projection.** Membership-changing actions (Create Lead) dispatch the canonical
  `dispatchOpportunityQueueUpdated` — re-running the projection updates card count, Work View counts, rows,
  and Focus Panel scope from one event. See `docs/sprints/06_2026/operational_projection_convergence.md`.

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
`docs/sprints/06_2026/command_surface_v2.md`.

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

## Related docs

| Topic | Doc |
|-------|-----|
| Navigation & workspace landing | `navigation-and-workspace-doctrine.md` |
| Queues & preview contract | `queue-system.md` |
| Status ownership | `status-and-state-system.md` |
| CRM enrollment grain | `../../product/crm-system.md` (supplemental — childcare vertical) |
| Sprint closeout | `docs/sprints/06_2026/business_processes_v1_sprint_report.md` |

## When this doc must be updated

When operator hierarchy language changes, stage/work-unit binding rules change, or enrollment canonical patterns shift.
