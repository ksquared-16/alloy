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
| Case vs child lifecycle grain | **Frozen** — `opportunities.status_key` (case) vs `opportunity_customer_members.outcome_status_key` (child) |
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

> **Operator navigation is the Work View, not the stage or the lane.** A **Work View** (`WorkViewConfigV1Stored`) is the operator's named lens over a process's work (filters, sort, queue/Focus-Panel layouts) and resolves onto queue lanes via `compat_queue_key`. Queue lanes are **execution/runtime**; stages are **lifecycle/governance**. Neither is the operator's primary navigation tier — Work Views are. See [`../operator/operational-workspace-shell.md` § Operational Work Doctrine](../operator/operational-workspace-shell.md#operational-work-doctrine--the-canonical-chain).

**Outcome picker:** My Tasks **Complete** flow resolves stage outcomes via `GET /api/admin/lifecycle-builder/stage-work-outcomes` — human confirms before side effects.

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
