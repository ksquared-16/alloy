# Workspace KPI doctrine (departments & work units)

Internal spec for how KPI **banners** and measurement strips behave on org workspace surfaces (`/admin/workspace/dept/...`). Goal: **legible, actionable** summaries tied to the **same lifecycle and terminology** as queues and record chrome — not legacy job plumbing unless the department is explicitly operations/job-centric.

---

## 1. KPI categories

| Category | Meaning | Examples |
|----------|---------|----------|
| **Volume** | How much work exists, usually by lifecycle stage, status, or work-unit/queue slice | Count of opportunities in intake; count per `work_units.key` queue |
| **Value** | Monetary exposure where the domain model exposes it | Sum of `opportunities.quote_total` for non-terminal pipeline stages |
| **Flow** | Movement, aging, stuck items (later: SLA, stage age) | Not required for v1 banner; reserve for follow-up |
| **System / automation** | Agent runs, workflow failures, automation backlog | Placeholder category; optional counts later — **do not** mix with business volume |

Rails may show **business** vs **AI/automation** separately (existing `KPIBlock` dual-rail pattern in Admin V2 mocks); production workspace bridge uses a single primary banner unless extended.

---

## 2. Data source rules

KPIs **must** be derived from:

1. **Lifecycle stage** — effective stage from `status_definitions.metadata.lifecycle_stage` plus product rules (e.g. positive `quote_total` → `decision`), via `resolveEffectiveOpportunityLifecycleStage` / `buildOpportunityLifecycleFields`.
2. **Statuses** — `status_key` on the entity row, interpreted through org `status_definitions`.
3. **Work units / queue definitions** — `work_units.queue_definition` interpreted server-side (`resolveOpportunityQueueFromDefinition`) for queue-scoped counts.
4. **Domain value fields** — e.g. `opportunities.quote_total` for priced pipeline value.

KPIs **must not** default to:

- Job/vendor assignment counts (`assigned_vendor_unassigned`, “unassigned jobs” triage) **unless** `departments.key` (or explicit product binding) is **operations / field service** and the layout is the operations registry.

If a department is a **growth slice** (pipeline / enrollment / revenue motion), metrics come from **opportunities** (and related CRM entities), not jobs.

---

## 3. Language & terminology

- Prefer **tenant / vertical terminology** when available (e.g. onboarding copy: “Family inquiry” vs “Opportunity”).
- Labels should match **department semantics** (Enrollment vs generic “Growth”).
- Avoid leaking **platform implementation** terms in user-facing labels when a business term exists (e.g. prefer configured status labels from `status_label`, not raw `status_key` in headings).
- Registry copy is **vertical-agnostic**; per-tenant strings can later load from org/vertical settings — defaults should still read as sensible English.

---

## 4. Configurability (target state)

The following should eventually be **data-driven** (DB or org config), not hardcoded per vertical:

| Dimension | Notes |
|-----------|--------|
| Which KPIs appear | Toggle metrics (e.g. hide “failure” for small teams) |
| Order | Ordered list of metric ids |
| Labels | Override display strings per org |
| Metric kind | `count` vs `currency` vs `duration` |
| Mapping | Which lifecycle stages roll into which banner cell; optional filters by work unit |

Until then, **code registry** (`DepartmentWorkspaceLayout`) + **server aggregation** (`/api/admin/departments/:id/opportunity-lifecycle-kpis`) keep behavior reviewable and consistent.

---

## 5. Growth-slice departments

Departments whose primary work is **opportunity pipeline** use `departments.key` in a small allowlist (e.g. `growth`, `enrollment`) or metadata (`tenant_slice: growth` — future). They share:

- Opportunity queue runtime (`/api/admin/work-units/:id/opportunity-queue`)
- Lifecycle KPI aggregation (this doc)
- **No** job-based workspace metrics by default

---

## 6. References (code)

- Effective lifecycle: `web/lib/admin/opportunityLifecyclePresentation.ts`
- Queue resolution: `web/lib/rrs/queue/resolveOpportunityQueue.ts`
- Layout registry: `web/lib/workspace/registry.ts`
- Runtime hook: `web/hooks/useOperationsWorkspaceData.ts`
