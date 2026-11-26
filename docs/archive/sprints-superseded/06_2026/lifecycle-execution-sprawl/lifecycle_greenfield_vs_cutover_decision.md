# Lifecycle greenfield vs cutover — product decision

**Path:** `docs/sprints/archive/06_2026/lifecycle_greenfield_vs_cutover_decision.md`  
**Status:** **Decision pending** — no implementation until approved  
**Date:** 2026-06-02  

**Assumptions for this review:**

- **Lifecycle Builder** becomes the **primary** runtime configuration system.
- **Enrollment Pipeline** (`enrollment_pipeline` work unit, legacy multi-lane model) is **sunset**, not the long-term execution model.
- **Model C (hybrid)** from [lifecycle_runtime_visibility_architecture_decision.md](./lifecycle_runtime_visibility_architecture_decision.md) is the visibility north star: **lenses from Builder rules**, **assignment** separate.

**Hard stop:** No queue refactors, attach automation, or migration-on-navigation until greenfield/cutover policy and visibility contract are signed off.

**Related:**

- [lifecycle_runtime_visibility_architecture_decision.md](./lifecycle_runtime_visibility_architecture_decision.md)
- [lifecycle_runtime_visibility_model_review.md](./lifecycle_runtime_visibility_model_review.md)

---

## Executive recommendation

| Question | Recommendation |
|----------|----------------|
| **Default when a new lifecycle is created** | **Greenfield** — runtime starts empty; cohort grows via creates and explicit imports only |
| **Cutover** | **Opt-in operator action** at lifecycle activation or later in Settings — never automatic on navigation or Builder save |
| **Enrollment sunset** | Org-wide **one-time cutover program** per retiring pipeline (not per new lifecycle default) |

**Lead Management + 17 `new_inquiry` on Enrollment:** Treat as **greenfield** unless operators run an explicit **Import from Enrollment** cutover. Zero rows in Lead Management is **expected**, not a defect.

---

## 1. When a new lifecycle is created: greenfield or cutover?

### 1.1 Options

| Mode | Definition | Operator expectation |
|------|------------|-------------------|
| **Greenfield** | New lifecycle department is a **new operational workspace**. Queues show only records that **enter this lifecycle** via policy (create, import, or future rule membership). | “We are standing up a new way to work; old pipeline rows stay where they are until we import them.” |
| **Cutover** | On activation (or later), matching legacy records are **brought into** this lifecycle’s visibility/assignment rules per import policy. | “This lifecycle **replaces** Enrollment for this cohort; move existing leads here.” |
| **Hybrid org default** | Every new lifecycle is greenfield; **cutover is a separate wizard** labeled “Import / replace legacy pipeline.” | Clear mental model; avoids silent cross-lifecycle moves |

### 1.2 Recommendation: **Greenfield by default**

**Why greenfield fits Builder-primary + pipeline sunset:**

1. **Multiple lifecycles will coexist** (Enrollment replacement, regional variants, specialty programs). Auto-importing by status alone would **duplicate visibility** or **steal** records from sibling lifecycles.
2. **Sunset is a program, not an accident** — retiring `enrollment_pipeline` should be a **planned migration** with audit, not the side effect of creating “Lead Management.”
3. **Operators need a clear empty state** — greenfield signals “configuration is live; cohort is not yet operating here,” which matches staged rollouts.
4. **Technical debt** — cutover-on-create without visibility/assignment decoupling reintroduces `work_unit_id` reassignment as the only fix.

**When cutover is appropriate (explicit, not default):**

- Replacing a **named legacy workspace** (e.g. “Enrollment” department) with a **single** successor lifecycle.
- Executive mandate to **continue working the same backlog** in the new UI on day one.
- Data cleanup projects where status mappings are **frozen** and ownership transfer is approved.

### 1.3 Lifecycle creation UX (policy, not code spec)

At **Create lifecycle** / **Activate**:

| Default | Copy intent |
|---------|-------------|
| **Greenfield** (pre-selected) | “This lifecycle starts with no records. New work and imports will appear here.” |
| Optional checkbox | “Import matching records from another department or legacy pipeline” → opens **cutover wizard** (never silent) |

Do **not** auto-import on activation completion.

---

## 2. Cutover policy (when operators opt in)

### 2.1 What records qualify?

Cutover eligibility must be **explicit predicates**, evaluated at import preview time (operator-triggered, expensive checks allowed per performance guardrails).

**Recommended qualification tiers:**

| Tier | Predicate (all AND within org) | Typical use |
|------|--------------------------------|-------------|
| **Tier 1 — Status lens** | `status_key` ∈ statuses configured for **target stage** in **target lifecycle** | “All `new_inquiry` for Lead stage” |
| **Tier 2 — Source workspace** | `work_unit_id` ∈ **source allowlist** (e.g. legacy `enrollment_pipeline` on named source department) | “Only rows currently on Enrollment pipeline” |
| **Tier 3 — Department boundary** | Source WU’s `department_id` = **source department** | Prevent pulling rows from arbitrary WUs |
| **Tier 4 — Optional site scope** | `location_id` ∈ operator-selected sites (if sticky site filter applies) | Regional cutover |
| **Tier 5 — Active only** | Exclude terminal statuses if policy says so (`lost`, `withdrawn`, etc.) | Backlog hygiene |

**Minimum bar for preview row:**

```text
org_id match
AND status_key matches target lifecycle stage status set (from Builder config)
AND work_unit_id IN source_allowlist (operator-selected legacy WUs)
```

**Do not qualify on status alone org-wide** without source workspace — that imports rows operators still manage in another lifecycle department.

**Example — Lead Management importing Enrollment `new_inquiry`:**

| Field | Qualifier |
|-------|-----------|
| `status_key` | `new_inquiry` |
| `work_unit_id` | `5ba90557-…` (Enrollment `enrollment_pipeline`) |
| Target | Assign to `lifecycle_wu_lead` on Lead Management (assignment action) |

### 2.2 How are conflicts handled?

| Conflict | Definition | Recommended handling |
|----------|------------|----------------------|
| **Status vs stage mismatch** | Row status not in any stage of target lifecycle | **Exclude** from import; show in preview “N excluded — status not mapped” |
| **Already on target lifecycle WU** | `work_unit_id` already `lifecycle_wu_*` on target dept | **Skip** (idempotent) |
| **Ambiguous stage** | Status matches multiple stages | **Exclude** until Builder config disambiguates; or map via explicit status→stage table only |
| **Terminal / locked** | Business rules forbid move (future) | **Exclude** with reason |
| **Site / access scope** | Operator cannot see row | **Exclude** (RLS-aligned) |

**Preview contract:**

- Show **counts**: eligible, skipped, excluded-by-reason.
- Require **typed confirmation** or second step for > N rows (threshold TBD by product).
- Emit **audit event** per batch: who, source, target lifecycle, stage, count, source WU ids.

### 2.3 Records already belonging to another lifecycle

Today “belongs to another lifecycle” ≈ **`work_unit_id` on another department’s work unit** (there is no `lifecycle_id` on `opportunities`).

| Scenario | Recommended policy |
|----------|-------------------|
| Row on **source legacy pipeline** (Enrollment dept) | **Allowed** for cutover — that is the intended source |
| Row on **another builder lifecycle dept** (e.g. future “Regional Lead”) | **Blocked by default** — require explicit “include other lifecycle departments” override with warning |
| Row on **same dept, wrong stage WU** | **Reassign** to target stage WU as part of import (assignment update) |
| Row **already on target `lifecycle_wu_lead`** | **Skip** |

**Conflict rule (default):**

```text
If work_unit_id references a work unit whose department_id is a different
builder-owned lifecycle department than the import target:
  → EXCLUDE unless operator enables "cross-lifecycle import" override
```

**Assignment vs visibility on cutover:**

| Action | On import |
|--------|-----------|
| **Visibility** | Row becomes visible in target lifecycle lenses because status + (future) membership rules match |
| **Assignment (today)** | `UPDATE work_unit_id` → target `lifecycle_wu_*` — **moves execution home** |
| **Side effect** | Row **disappears** from source department strict queues — operators must expect **move**, not copy |

**Future Model C:** Support **import modes**:

| Mode | Behavior |
|------|----------|
| **Move** (default today) | Update `work_unit_id`; single home |
| **Copy visibility only** (future) | Add lifecycle membership; keep assignment on source until operator reassigns |
| **Duplicate row** | **Reject** — not supported for opportunities |

Until membership exists, cutover is **move**, not **multi-home**.

### 2.4 Cutover and Enrollment Pipeline sunset

Sunset program (org-level, phased):

| Phase | Activity |
|-------|----------|
| **1 — Parallel** | New lifecycle greenfield; legacy Enrollment still operates |
| **2 — Import** | Cutover wizard moves qualified cohort per Tier 1–3 |
| **3 — Read-only legacy** | Enrollment dept tiles marked legacy; no new creates routed there |
| **4 — Deactivate** | `enrollment_pipeline` WU `is_active = false`; dept archived or hidden |

Cutover is **not** required for every new lifecycle — only for **replacement** of an existing workspace.

---

## 3. Greenfield: runtime validation and empty queues

### 3.1 Principle

**Zero records is a valid, expected state** for a greenfield lifecycle. Validation must **pass** with informational copy — never imply broken queues or failed filters.

### 3.2 Operator-facing copy (canonical)

**Settings / runtime validation — records check:**

> No records belong to this lifecycle yet. Create a Lead from this lifecycle, or use **Import records** to bring in matching work from a legacy pipeline.

**Work unit / dept empty queue:**

> No records in this view yet. New work created from this lifecycle will appear here.

**Do not use:**

- “Queue filters broken”
- “No records match these statuses” (without greenfield context) — implies misconfiguration
- “Repair required” when count is zero and no misassignment detected

### 3.3 Validation check semantics (greenfield)

| Check | Greenfield pass criteria |
|-------|--------------------------|
| Work units visible | Lifecycle `lifecycle_wu_*` rows exist |
| Queue filters connected | Lane status keys ⊇ configured stage statuses |
| Records query ready | Query succeeds; **0 rows is informational pass** |
| Workspace tile | Department active and entitled |

**Informational only when:**

- `matching_by_status = 0` in **target lifecycle department scope**
- No `matching_elsewhere_in_department` (no hidden rows on sibling WUs in same dept)

**If org has rows elsewhere (Enrollment) on same status:**

> N records exist elsewhere in the organization (e.g. Enrollment pipeline). They are not in this lifecycle until you import them.

— Pass + link to **Import records** (cutover wizard), not attach-on-navigation.

### 3.4 Dept tile subtitle

Workspace tile may show **“0 work units”** vs **“2 work units”** — that is WU row count, not record count. Prefer subtitle: **“Lifecycle configured · no records yet”** when record count known zero (future enhancement); until then avoid implying backlog size on tile.

---

## 4. BOS, reporting, regional views, lenses — without visibility = assignment

### 4.1 Problem

If every consumer reads only `opportunities.work_unit_id`, then:

- BOS recommends for **wrong home** when row is **visible** in a different lens.
- Regional view cannot include site cohort without **moving** FK.
- Reporting double-counts or under-counts when lenses diverge from assignment.

### 4.2 Target consumption model (Model C)

Introduce a **Lifecycle Visibility Contract** (conceptual API — implementation later):

```text
resolveVisibility(opp, lens) → boolean
resolveAssignment(opp) → work_unit_id | null
resolveLifecycleContext(opp) → { primary_department_id, visible_lenses[], assignment_home }
```

**Lens types (examples):**

| Lens key | Inputs | Uses assignment? |
|----------|--------|------------------|
| `lifecycle_stage_queue` | org, lifecycle_dept_id, stage_key, lane status filters | **No** (rules + status) |
| `needs_attention` | org, attention rules, optional dept | **Partial** (fetch cap from execution WU) |
| `bos_operational` | org, entity_id, open surface, catalog rules | **Optional** — prefer rules + status age |
| `reporting.lifecycle_backlog` | org, lifecycle_id, stage, as-of date | **No** |
| `regional.site` | org, location_id, lifecycle rules | **No** |
| `drawer_actions` | org, entity_id | **Yes** — default home WU for action placement |

### 4.3 Consumer-specific guidance

| Consumer | Should use | Should not use |
|----------|------------|----------------|
| **Queues / operational views** | `resolveVisibility` for lens + lane filters | Strict assignment-only (except as fallback during transition) |
| **KPI strip (lifecycle dept)** | Count by **visibility** for “backlog in lifecycle”; separate optional “assigned here” | Raw WU FK only |
| **Reporting / BI** | Lifecycle + stage dimensions from rules; snapshot assignment home | Single `work_unit_id` as lifecycle proxy |
| **BOS recommendations** | Status, attention, staleness, **visible lenses**; assignment for action routing target | Queue preview row only |
| **Workflow Assist scope** | `department_id` + optional lens; not only WU | — |
| **Regional manager view** | Site filter ∩ lifecycle visibility rules | Moving records to regional WU |
| **AI operational views** | Registered lens keys with rule packs | Ad-hoc SQL on `work_unit_id` |

### 4.4 Phased decoupling (no code now — sequence after policy approval)

| Phase | Capability |
|-------|------------|
| **P0 — Policy** | Greenfield default; cutover wizard manual; copy above |
| **P1 — Unified queue predicate** | All queue routes use same visibility rule (B-dept) |
| **P2 — BOS context** | Entity GET includes `visible_lifecycle_lenses[]` (derived) |
| **P3 — Reporting dimensions** | Export lifecycle/stage from Builder registry |
| **P4 — Membership (optional)** | Persisted `opportunity_lifecycle_membership` for multi-lens without duplicate rows |
| **P5 — Sunset Enrollment** | Org cutover program; deactivate legacy WU |

### 4.5 Greenfield + lenses example

Record created via **Create Lead** on Lead Management:

| Field | Value |
|-------|--------|
| `status_key` | `new_inquiry` |
| `work_unit_id` | `lifecycle_wu_lead` (assignment) |
| **Visible in** | Lead Management / Lead lane (rules) |
| **Visible in** | Needs Attention if rules fire (overlay) |
| **Not visible in** | Enrollment dept (different department boundary) |
| **BOS** | Uses opp + attention; may reference assignment home for “assign tour” actions |

Record still on Enrollment pipeline (pre-cutover):

| Field | Value |
|-------|--------|
| `work_unit_id` | Enrollment pipeline |
| **Visible in** | Enrollment legacy lenses only |
| **Not visible in** | Lead Management (greenfield) |
| **BOS** | Still valid on entity GET from Enrollment context |

---

## Decision summary table

| Topic | Decision |
|-------|----------|
| New lifecycle default | **Greenfield** |
| Cutover | **Opt-in wizard**; move assignment today; audit + preview |
| Qualifying records | Status ∩ source WU allowlist ∩ source dept; not org-wide status-only |
| Other lifecycle conflict | **Block** unless explicit override |
| Zero records UX | **Informational pass** + import CTA; not “broken” |
| BOS / reporting / regional | Consume **visibility contract**; assignment for **action home** only |
| Enrollment sunset | Separate **org migration**; not automatic on create |

---

## Sign-off checklist

- [ ] Confirm **greenfield default** for all new lifecycles
- [ ] Confirm **cutover** is operator-initiated only (Settings / activation wizard)
- [ ] Approve **qualification tiers** for import preview
- [ ] Approve **cross-lifecycle block** unless override
- [ ] Approve **canonical empty-state copy** (Settings + runtime queues)
- [ ] Approve **visibility contract** as prerequisite before more queue code
- [ ] Name owner for **Enrollment sunset** cutover program (if/when)

---

## Open questions (product)

1. **Lead Management specifically:** greenfield only, or mandatory cutover from Enrollment on go-live date?
2. **Import threshold:** require approval above how many rows?
3. **Null `work_unit_id` cohort:** appear in greenfield lifecycle with matching status, or excluded until assigned?
4. **Dual operation period length** before Enrollment read-only?

**No code, schema, or queue changes in this document.** Implementation waits on checklist approval and [visibility architecture decision](./lifecycle_runtime_visibility_architecture_decision.md).
