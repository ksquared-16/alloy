# Workspace KPI doctrine (departments & work units)

Internal spec for how KPI **banners** and measurement strips behave on org workspace surfaces (`/admin/workspace/dept/...` and **`/adminV2/workspace/**`**). It describes **current Admin V2 behavior** and **the next intended direction for configuration** — not finalized product UX. Goal: **legible, actionable** summaries tied to the **same lifecycle and terminology** as queues and record chrome — not legacy job plumbing unless the department is explicitly operations/job-centric.

---

## 1. KPI categories

| Category | Meaning | Examples |
|----------|---------|----------|
| **Volume** | How much work exists, usually by lifecycle stage, status, or work-unit/queue slice | Count of opportunities in intake; count per `work_units.key` queue |
| **Value** | Monetary exposure where the domain model exposes it | Sum of `opportunities.quote_total` for non-terminal pipeline stages |
| **Flow** | Movement, aging, stuck items (later: SLA, stage age) | Not required for v1 banner; reserve for follow-up |
| **System / automation** | Agent runs, workflow failures, automation backlog | Placeholder category; optional counts later — **do not** mix with business volume |

Rails may show **business** vs **AI/automation** as distinct **lanes** within the **same compact strip** (`KPIBlock` dual-rail / measurement-strip pattern): one shallow band rather than duplicated scorecard stacks.

Production workspace shells should preserve **density**: default **four to five visible metrics** unless layout explicitly opts into more tiles (registry / department workspace layout).

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

## 4. Configurability (current posture + next direction)

Today, KPI composition is largely **code and server aggregation** (registry + lifecycle endpoints). The **target** — **not** implemented as arbitrary page-builder KPIs — is **config-selected, code-owned metrics**, aligned with the queue preview pattern (`docs/architecture/workspace-work-unit-scope-doctrine.md` § Queue row preview).

### Target configuration surface (planned)

Config should eventually allow — **per org / department / work-unit workspace surface**:

| Dimension | Direction |
|-----------|-----------|
| **Which metrics** | Choose from **registered KPI metric ids** (implemented and calculated in server/code). |
| **Order** | Ordered list within the compact strip caps. |
| **Visibility** | Show/hide per context (e.g. hide automation failures for tiny teams). |
| **Labels** | Org-scoped overrides for display strings **without** forked calculation code. |
| **Display format** | Count vs currency vs duration / grouping — constrained to approved formatters tied to metric id. |

**Calculation stays in code / server.** Config picks **registered** metrics and presentation knobs; **not** ad hoc expressions or client-only rollups.

**Performance doctrine for KPI config v0 onward:**

- Preserve **page-level and batch loading** posture — **no N+1** per-metric queries per banner paint when avoidable.
- Prefer **single aggregation endpoints** or **bounded parallel** fetches shared across tiles; caching/TTL acceptable where doctrinally consistent.
- **Defaults** on rollout **must match current AdminV2 behavior** (same headline metrics users see today unless an org explicitly changes config).

### Current implementation anchor

Until the above lands, **`DepartmentWorkspaceLayout`** (or equivalent registry) **`+`** **`GET /api/admin/departments/:id/opportunity-lifecycle-kpis`** (and sibling endpoints) remain the reviewable sources of truth — see §6.

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

---

## 7. Presentation on Admin V2 workspace (current shell)

Independent of §2–§5 **data sourcing**, the **`/adminV2/workspace/**` shell** currently frames KPI output as:

- A **compact orientation strip** — primary label/value rhythm, minimal nested card chrome so KPIs feel like **readouts**, not a second deck inside the control lane.
- A **four-to-five metric default cap** for visible headline metrics at once (align sizing with `KPIBlock` workspace usage); configurability targets in §4 may later expand **which** IDs appear without abandoning readability defaults here.

Doctrine for **presentation shell** mechanics (scroll, rail, ambient) stays in **`docs/architecture/workspace-work-unit-scope-doctrine.md`** (Presentation shell §). Presentation changes there must **not** imply changes to KPI aggregation endpoints or resolver contracts unless explicitly delivered in API/backend work.
