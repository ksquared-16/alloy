# Sprint — Configurable priority-based placement orchestration (audit & architecture)

**Status:** **V1 sprint closed** — Cards **0.5–9** (implementation through demo enablement + verification). Placement remains **off by default**; **opt-in** via `metadata.placement_priority_v1` or **`npm run dev:seed:placement-priority-demo`**. **V1.1** = workflow events, entity GET/drawer, persistence / global ordering strategy.  
**Theme:** Generalized **priority / placement orchestration** with **childcare waitlists as V1 operational slice**, integrated into existing **work units, queues, resolvers, and config** — not a parallel subsystem.  
**Date:** May 2026  

---

## Executive summary

Alloy already treats **queues as projection surfaces** (`docs/system/workspace-system.md`, `docs/system/record-system.md`). Ordering today is overwhelmingly **SQL sort on a small allowlist of opportunity/job columns**, with **one major exception**: the **`needs_attention`** lane uses **resolver-driven membership** and **in-memory reordering** after filtering (`QueueService`). The **opportunity attention resolver** already demonstrates **explainable, deterministic outputs** (`priority_breakdown`, reason codes) aligned with resolver-first doctrine.

**Gaps:** There is **no generalized placement-priority engine**, **`group_by` in queue config is schema-only (unused)**, and **two opportunity queue interpreters** coexist (**`QueueService`** vs **`resolveOpportunityQueueFromDefinition`**), which creates **real drift risk**. Childcare “waitlist” behavior is still **status + `updated_at` (and similar) ordering**, with **`metadata.enrollment_operational`** carrying **waiting facets** but **not** full placement priority semantics.

**Direction:** Introduce a **small, shared orchestration layer** (evaluation + explainability contract) that **feeds queue projection** (sort keys, bucket labels, optional grouping) while keeping **business truth** on **entities + resolvers + workflows**, **not** on queue rows as authorities.

**RFC lock (Card 0.5):** Canonical opportunity queue execution for **workspace + placement orchestration** is **`QueueService`** (`getWorkUnitQueueItems` / `GET /api/admin/queues/...`). The Growth interpreter **`resolveOpportunityQueueFromDefinition`** remains **compatibility-only** until consolidated; **no placement/orchestration logic** may be added there. See **§ Card 0.5 — RFC lock + queue interpreter decision** below.

**Evaluator contract (Card 2):** Pure, generalized **placement priority evaluator** specification lives in **§ Card 2 — Evaluator RFC detail** below. **QueueService** remains the sole projection integration point; **legacy Growth interpreter excluded.**

**Product model (childcare waitlist preview — V1 cleanup):** Operators expect **program / room / age grouping first**, then **priority rules inside each group**. The **`program_room_group`** fact is the **primary sort/group dimension** (via preset **`primary_group_fact_key`** — not React hardcoding). **Standard family** replaces “general waitlist” copy: it means **no special priority rule matched**, not a parallel top-level cohort lane. **Admin V2** renders **section subheaders** from `program_room_group` for rows on the **loaded page** only. Demo seed sets **Infant** vs **Toddler** on demo opportunities. **`shadow_mode: true`** remains the default for the placement demo so **list order stays the queue’s usual SQL sort** while previews explain **would-be** ordering; turning **`shadow_mode` off** is only safe when operators accept **page-local** reordering (still not global fairness across pagination).

---

## Card 0.5 — RFC lock + queue interpreter decision

**Status:** Locked for this sprint (May 2026).  
**Purpose:** Prevent **two queue engines** from each gaining placement ordering, bucket grouping, explanation metadata, orchestration snapshots, or ranking — which would guarantee drift, double maintenance, and doctrine violations.

### Canonical queue execution

| Path | Role |
|------|------|
| **`QueueService`** (`web/lib/queues/QueueService.ts`) + **`GET /api/admin/queues/[workUnitId]/[queueKey]`** | **Canonical** execution for **Admin V2** primary queue rows, summaries, needs-attention lane (resolver-backed), and **all future placement orchestration** merged into preview payloads / ordering. |
| **`resolveOpportunityQueueFromDefinition`** (`web/lib/rrs/queue/resolveOpportunityQueue.ts`) | **Legacy Growth interpreter** only: parses the **single-document** shape (`filters` object + `sort: { by, direction }` + `limit`), **not** workspace `queues[]`. |

**Rationale:** Code inspection shows Admin V2 loads rows through **`/api/admin/queues/...`** (`work-unit/[workUnitId]/page.tsx`). That route calls **`getWorkUnitQueueItems`**. Needs-attention already uses **`resolveOpportunityAttention`** via **`buildOpportunityAttentionQueueItems`** (`opportunity-attention-queue` route) — separate from the Growth interpreter. Centralizing placement on **`QueueService`** keeps **one** place for enrichment, caps, access scope, and parity with pipeline **`queue_definition`** v1.

### Why dual interpreters are risky

- **Different JSON shapes** → parsers diverge; a field valid in workspace definitions may be **ignored or rejected** by the Growth strict parser (`parseQueueDefinitionV1Strict` / `queueDefinitionV1.ts`).
- **Different sort models** → multi-field `sort[]` vs single `{ by, direction }`; placement tie-breakers cannot be expressed consistently across both without duplication.
- **Different consumers** → silent behavioral skew between **legacy** `opportunity-queue` / **KPI** scoping and **Admin V2** lists.
- **Orchestration would multiply the damage** — two integration points for snapshots, explanations, and ordering policies violates the sprint non-goal of parallel systems.

### Placement orchestration ownership

| Concern | Owner |
|---------|--------|
| **Evaluate** placement/priority snapshot + explanations | **New evaluator** (pure module) + **entity GET** attachment (future cards). |
| **Project** ordering + row preview hints for operational queues | **`QueueService` only** — same pattern as **`resolveOpportunityAttention`** enrichment today. |
| **Legacy Growth interpreter** | **Must not** gain placement logic. |

### Compatibility / temporary paths

| Surface | Dependency today | Strategy |
|---------|------------------|----------|
| **`GET .../work-units/[id]/opportunity-queue`** | **`resolveOpportunityQueueFromDefinition`** | **Shim or migrate** in **Card 1 (consolidation spike)**: thin route should delegate to **`QueueService`** after **adapter** from Growth document → equivalent lane fetch, **or** migrate remaining clients off this route. **Behavior must stay stable** (response shape, filtering, limits) during transition. |
| **`GET .../departments/[departmentId]/opportunity-lifecycle-kpis`** | Same interpreter + **`pipeline_overview`** work unit lookup | **Narrow then migrate**: KPI scope should align with canonical **`enrollment_pipeline`** (or explicit config); implementation should **stop depending on the Growth interpreter for new semantics** — spike defines whether KPIs call **`QueueService`** summaries, shared scope helper, or translated definition. |
| **`useOperationsWorkspaceData`** (`fetchOpportunityQueueRuntime`) | **`opportunity-queue`** / **`opportunity-attention-queue`** | Treat as **legacy parallel** to Admin V2; consolidation spike inventories whether Growth departments still rely on it; prefer routing new work through **`/api/admin/queues/...`**. |
| **Admin V2 fallback fetch** (`opportunity-queue` / `opportunity-attention-queue` when summaries fail) | Same | After consolidation, fallback should still work; ideally fallback hits the **same** backend logic as primary (**`QueueService`**). |

**Note:** **`opportunity-attention-queue`** does **not** use `resolveOpportunityQueueFromDefinition`; it uses **`buildOpportunityAttentionQueueItems`**. Consolidation still matters so **attention + placement** share patterns, but the **dual interpreter** problem is specifically **Growth list path + KPI** vs **`QueueService`**.

### V1 non-goals (interpreter / consolidation phase)

- **No** placement evaluator implementation before **Card 1** outcomes are agreed.
- **No** new schema for snapshots until evaluator design is locked.
- **No** orchestration ordering, bucket labels, or explanation fields added inside **`resolveOpportunityQueue.ts`**.
- **No** production behavior change **unless** a consolidation PR proves parity (prefer spike doc + tests first).

### Migration / consolidation sequencing

1. **Card 1 — Queue interpreter consolidation spike:** Inventory callsites; define **adapter** (Growth JSON → internal plan or ephemeral `QueueDefinitionV1` slice) or **route migration**; list parity tests (filters, sort, limit, scope, terminal-status exclusions where applicable).
2. **Implement shim/migrate** legacy routes behind parity tests; **no** placement features yet.
3. **Card 2+ — Evaluator + QueueService integration** only after step 2 is done or explicitly scoped as “QueueService-only clients” with legacy frozen without placement.

### Acceptance criteria (Card 0.5 / consolidation gate)

- [ ] **Single canonical integration point:** All **placement orchestration** projection hooks land in **`QueueService`** (or modules called exclusively from it for queue rows), not in **`resolveOpportunityQueueFromDefinition`**.
- [ ] **Legacy stability:** **`opportunity-queue`** and **`opportunity-lifecycle-kpis`** remain **behavior-compatible** for existing Growth/work units unless a **documented** migration accompanies the change.
- [ ] **Explicit freeze:** **`resolveOpportunityQueue.ts`** does **not** receive placement/ranking/orchestration/snapshot logic; changes there are **bugfix-only** until removed or reduced to a shim delegating to **`QueueService`**.
- [ ] **Tests / smoke checks identified:** Extend or add coverage around **`GET /api/admin/queues/...`** opportunity paths (`web/tests/queues/`); add **parity** tests comparing legacy route vs shimmed path once adapter exists; manual smoke: Admin V2 queue tab + any consumer still using **`useOperationsWorkspaceData`** Growth fetch.

---

## Card 1 — Queue interpreter consolidation spike (completion notes)

**Status:** Completed (structural / guardrail phase).  
**Path chosen:** **C+** — **No full shim** of `opportunity-queue` onto **`QueueService`** in this card (would risk **`work_unit_id` scope drift**: Growth lists are **org-wide** filtered; **`QueueService`** always scopes opportunities to **`work_unit_id`**). Instead:

1. **Extracted** shared **`applyGrowthOpportunityFiltersToQuery`** (+ **`fetchBookedPipelineStageIds`**) into **`web/lib/rrs/queue/growthOpportunityQueueScope.ts`** with explicit **legacy semantics** documentation.
2. **`resolveOpportunityQueueFromDefinition`** (**`GET .../opportunity-queue`**) keeps **inline** filter construction — **not** refactored to call the shared helper (**explicit freeze / Cards 8–9 boundary**: no edits to that entrypoint). Placement and orchestration stay out of this path (**Card 0.5**).
3. **`opportunity-lifecycle-kpis`** **no longer** calls **`resolveOpportunityQueueFromDefinition`** for the heavy query path; it **`parseQueueDefinitionV1Strict`** + **`applyGrowthOpportunityFiltersToQuery`** so KPI queries share **one tested implementation** of Growth-shaped filters (parity with interpreter intent; **two SQL builders** remain until consolidation).

### Callsites inventoried

| Surface | Notes (post–Card 1) |
|---------|---------------------|
| **`resolveOpportunityQueueFromDefinition`** | **`GET .../work-units/[id]/opportunity-queue`** only (plus module export). |
| **`GET .../opportunity-lifecycle-kpis`** | Uses **shared filter helper** + strict parse; **not** the interpreter entrypoint. |
| **`useOperationsWorkspaceData`** | Still may fetch **`opportunity-queue`** / **`opportunity-attention-queue`** — unchanged; Admin V2 primary path remains **`/api/admin/queues/...`**. |
| **Admin V2 fallback** | Still may fetch legacy routes on summary failure — unchanged. |

### Files changed

- **`web/lib/rrs/queue/growthOpportunityQueueScope.ts`** — new shared Growth filter scope (documented org-wide, no `work_unit_id`).
- **`web/lib/rrs/queue/resolveOpportunityQueue.ts`** — **unchanged** for Cards 8–9 (**no** shared-helper delegation); legacy inline filters preserved.
- **`web/app/api/admin/departments/[departmentId]/opportunity-lifecycle-kpis/route.ts`** — deduped filters via shared helper; **scope-then-filters** order aligned with interpreter (AND-equivalent to prior KPI construction).
- **`web/app/api/admin/work-units/[id]/opportunity-queue/route.ts`** — doc comment on legacy scope vs QueueService.
- **`web/tests/rrs/growthOpportunityQueueScope.test.ts`** — mock chain test + childcare bootstrap strict-parse coverage.

### Remaining compatibility risks

- **`opportunity-queue`** remains on **`resolveOpportunityQueueFromDefinition`** — second execution path until a future card migrates clients or adds a **parameterized QueueService** branch for org-wide scope (product decision).
- **Sort field divergence:** Growth allows **`job_date`** sort; **`QueueService`** opportunity allowlist does **not** — any future shim must map or extend explicitly.
- **`pipeline_overview` vs `enrollment_pipeline`** KPI scope key unchanged — still a **product/config alignment** task, not solved here.
- **Filter duplication:** **`opportunity-queue`** (interpreter) vs **`opportunity-lifecycle-kpis`** (shared helper) — intentional until **`resolveOpportunityQueueFromDefinition`** is shimmed or retired (**V1.1**).

### Tests run

- `vitest run tests/rrs/growthOpportunityQueueScope.test.ts tests/queues/QueueService.test.ts tests/queues/queueRoutes.test.ts`

---

## Card 2 — Evaluator RFC detail

**Status:** Design locked for implementation planning (**no production behavior**, **no schema**, **no `QueueService` changes** in this card).  
**Scope:** Generalized **pure evaluator** contract + **V1 childcare preset** expressed as config/facts — **not** hardcoded domain logic in core types.

### 2.0 Design principles

| Principle | Meaning |
|-----------|---------|
| **Pure & deterministic** | Same `PlacementEvaluateInput` → same `PlacementEvaluateOk` (given frozen profile revision + clock). No I/O inside core evaluator. |
| **Generalized core** | Core knows **buckets**, **rules**, **facts**, **tie-breakers**, **reason templates** — not “sibling”, “employee”, etc. |
| **Vertical via preset** | Childcare V1 = **`PlacementProfile`** preset + **fact bindings** + label catalog — loaded outside core or passed in as resolved profile. |
| **QueueService-only projection** | Lists/drawers consume evaluator output only through **`QueueService`** / entity GET adapters (**Card 6+** for queue rows; entity GET still future). **`resolveOpportunityQueueFromDefinition`** stays **out of scope** for placement. |

---

### 2.1 Evaluator contract

#### Inputs (`PlacementEvaluateInput`)

| Field | Purpose |
|-------|---------|
| **`evaluator_version`** | Numeric semver-like int or string (e.g. `1`) — **breaking** rule-engine changes bump this. |
| **`now_ms`** | Wall clock for date comparisons (explicit — no `Date.now()` inside pure core). |
| **`entity`** | **Thin canonical handle:** `{ entity_type, entity_id }` — orchestration domain (`opportunity`, later `job`, …). |
| **`cohort`** | **Lane context:** e.g. `{ work_unit_id, queue_key, status_keys_allowed[] }` — evaluator does **not** re-fetch queues; caller asserts cohort membership. |
| **`facts`** | **Normalized fact bag:** string-keyed values with **`FactPresence`** (see §2.6). Scalars, booleans, ISO dates, small enums — **no** raw DB rows. |
| **`profile`** | **Resolved** `PlacementProfile` for this evaluation (frozen JSON — see §2.8). Parser validates before evaluation. |
| **`locale`** | Optional BCP 47 tag for label resolution (`en-US` default). |

#### Outputs — success (`PlacementEvaluateOk`)

| Field | Purpose |
|-------|---------|
| **`snapshot`** | `PlacementPrioritySnapshot` — authoritative **machine-readable** result for this evaluation instant. |
| **`reasons`** | Ordered list of **`PlacementReason`** — **why** this bucket / ordering factors (explainability). |
| **`tie_breaker_trace`** | Ordered applied tie-breaker steps with **resolved comparator values** (for audit + UI “Sorted by …”). |
| **`warnings`** | Non-fatal issues (e.g. optional fact missing); evaluation still succeeded. |

#### Outputs — failure (`PlacementEvaluateErr`)

| Code | When |
|------|------|
| **`INVALID_PROFILE`** | Profile schema/rule contradictions; unknown bucket reference; cyclic rule dependency. |
| **`UNSUPPORTED_COHORT`** | Profile declares cohort it cannot evaluate (e.g. wrong `queue_key`). |
| **`FACT_CONSTRAINT_VIOLATION`** | Required fact missing and profile sets **`hard_fail_missing_required`** (optional strict mode). |

**Soft path (default V1):** Never hard-fail on missing optional facts — fall through to **default bucket** + **`warnings`** (see §2.6).

#### Bucket model

- **`PlacementProfile.buckets[]`:** each `{ bucket_key, priority_order, label_key }` — **`priority_order`** lower = **earlier** in line (first served).
- **Assignment:** **first matching rule wins** where rules are ordered **`rule_order`** ascending; each rule has `{ match: FactPredicate, assign_bucket_key }`.
- **Default:** **`fallback_bucket_key`** when no rule matches.
- **Invariant:** Exactly **one** assigned bucket per successful evaluation.

#### Reason / explanation model

Each **`PlacementReason`**:

| Field | Purpose |
|-------|---------|
| **`code`** | Stable machine id (`rule_matched`, `tie_breaker_applied`, `default_bucket`, `fact_missing_optional`, …). |
| **`bucket_key`** | Bucket this reason supports (if applicable). |
| **`fact_refs`** | Keys into **`facts`** that influenced this reason (for drill-down). |
| **`label`** | **Resolved** human string for operators (from profile **`labels`** map or template + params). |
| **`detail`** | Optional structured bag (stringly JSON-safe) for advanced drawer — **no** prose generation by LLM in core. |

**Opaque scoring:** A numeric **`rank_score`** may exist **only** as an internal tie-break column — **not** shown as primary UX; prefer **bucket + trace**.

#### Deterministic tie-breaker model

After bucket assignment, entities in the **same bucket** are ordered by **`profile.tie_breakers[]`**: ordered list of `{ kind, field, direction }` where:

- **`kind`:** `fact` | `entity_column` (future) | `snapshot_literal`
- **`field`:** fact key or column name allowed by integration layer
- **`direction`:** `asc` | `desc`

**Comparator rules:** `null` / **missing** sorts **last** in `asc` (configurable via profile **`nulls`** policy). **Stable sort:** final tie-breaker is always **`entity_id` asc** (implicit, appended by evaluator).

#### Snapshot / version model (`PlacementPrioritySnapshot`)

| Field | Purpose |
|-------|---------|
| **`schema_version`** | Snapshot JSON schema version. |
| **`evaluator_version`** | Echo from input. |
| **`profile_id`**, **`profile_revision`** | Which policy was applied. |
| **`evaluated_at_ms`** | Echo `now_ms` or evaluation completion instant (caller-defined; pure core uses input clock). |
| **`bucket_key`**, **`bucket_priority_order`**, **`bucket_label`** | Assigned cohort position. |
| **`sort_tuple`** | Ordered array of comparable primitives for **stable sort** (e.g. `[priority_order, wait_since_ms, entity_id]`). |
| **`fact_digest`** | Hash or sorted key set of **present** fact keys — optional cache invalidation helper (not cryptographically required V1). |

---

### 2.2 Missing fact behavior

| State | Meaning | Default V1 behavior |
|-------|---------|---------------------|
| **`present`** | Value known | Use in predicates |
| **`absent`** | Confirmed not applicable / unknown optional | Predicate treats as false unless rule uses **`optional_match`** |
| **`unknown`** | Not yet loaded / not computed | **Soft:** exclude predicates that require it; add **`warnings`**; **Strict** (optional profile flag): **`FACT_CONSTRAINT_VIOLATION`** |

**Rule predicates** reference facts by key; core provides **`evaluatePredicate(FactPredicate, facts)`** — **no DB**.

---

### 2.3 Profile / config reference shape (`PlacementProfile`)

Resolved **before** calling evaluator (loader validates):

- **`profile_id`**, **`revision`**, **`domain`** (`generic`, `childcare_enrollment`, …)
- **`buckets[]`**, **`rules[]`**, **`tie_breakers[]`**, **`fallback_bucket_key`**
- **`labels`**: map **`label_key` → template** (`{{fact.wait_since}}`) or literal string
- **`required_fact_keys[]`** (optional strict mode)
- **`cohort_filter`** (optional): restrict profile to certain `queue_key` / `status_keys`

**Storage location (future):** work unit metadata, org metadata, or versioned JSON asset — **not** decided in this card.

---

### 2.4 Proposed TypeScript types (RFC — not yet shipped)

```typescript
/** Fact presence — evaluator core never reads DB. */
export type FactPresence = "present" | "absent" | "unknown";

export type FactValue =
    | { presence: "present"; value: string | number | boolean | null }
    | { presence: "absent" }
    | { presence: "unknown" };

export type FactBag = Record<string, FactValue>;

export type PlacementEvaluateInput = {
    evaluator_version: string;
    now_ms: number;
    entity: { entity_type: string; entity_id: string };
    cohort: {
        work_unit_id: string;
        queue_key: string;
        status_keys_allowed?: string[];
    };
    facts: FactBag;
    profile: PlacementProfile;
    locale?: string;
};

export type PlacementPrioritySnapshot = {
    schema_version: 1;
    evaluator_version: string;
    profile_id: string;
    profile_revision: string;
    evaluated_at_ms: number;
    bucket_key: string;
    bucket_priority_order: number;
    bucket_label: string;
    sort_tuple: Array<string | number | null>;
    fact_digest?: string;
};

export type PlacementReason = {
    code: string;
    bucket_key?: string;
    fact_refs?: string[];
    label: string;
    detail?: Record<string, string | number | boolean | null>;
};

export type TieBreakerTraceStep = {
    tie_breaker_index: number;
    field: string;
    direction: "asc" | "desc";
    resolved_a: string | number | null;
    resolved_b: string | number | null;
};

export type PlacementEvaluateOk = {
    snapshot: PlacementPrioritySnapshot;
    reasons: PlacementReason[];
    tie_breaker_trace: TieBreakerTraceStep[];
    warnings: Array<{ code: string; message: string; fact_keys?: string[] }>;
};

export type PlacementEvaluateErr = {
    ok: false;
    code: "INVALID_PROFILE" | "UNSUPPORTED_COHORT" | "FACT_CONSTRAINT_VIOLATION";
    message: string;
    details?: Record<string, unknown>;
};

/** Discriminated union: success wraps `{ ok: true, value }`; errors include `ok: false`. */

export type PlacementEvaluateResult = { ok: true; value: PlacementEvaluateOk } | PlacementEvaluateErr;

/** Predicate mini-DSL — evaluated in core; childcare binds facts outside core. */
export type FactPredicate =
    | { all: FactPredicate[] }
    | { any: FactPredicate[] }
    | { not: FactPredicate }
    | { fact_eq: { key: string; value: string | number | boolean } }
    | { fact_in: { key: string; values: string[] } }
    | { fact_present: { key: string } };

export type PlacementProfile = {
    profile_id: string;
    revision: string;
    domain: string;
    buckets: Array<{ bucket_key: string; priority_order: number; label_key: string }>;
    rules: Array<{ rule_order: number; when: FactPredicate; assign_bucket_key: string }>;
    fallback_bucket_key: string;
    tie_breakers: Array<{ kind: "fact"; field: string; direction: "asc" | "desc" }>;
    labels: Record<string, string>;
    cohort_filter?: { queue_keys?: string[]; status_keys?: string[] };
    required_fact_keys?: string[];
};
```

---

### 2.5 Example input / output (illustrative)

**Input (facts supplied by adapter — keys from childcare binding):**

```json
{
  "evaluator_version": "1",
  "now_ms": 1715176800000,
  "entity": { "entity_type": "opportunity", "entity_id": "opp_123" },
  "cohort": {
    "work_unit_id": "wu_enroll",
    "queue_key": "waitlisted",
    "status_keys_allowed": ["waitlisted"]
  },
  "facts": {
    "wait_since": { "presence": "present", "value": "2024-06-01T12:00:00.000Z" },
    "flag_employee_household": { "presence": "present", "value": true },
    "flag_sibling_enrolled": { "presence": "unknown" },
    "program_room_group": { "presence": "present", "value": "infant_room_a" }
  },
  "profile": { "...": "childcare_waitlist_v1 preset resolved JSON" }
}
```

**Output (abbreviated):**

```json
{
  "ok": true,
  "value": {
    "snapshot": {
      "schema_version": 1,
      "bucket_key": "staff_community",
      "bucket_priority_order": 10,
      "bucket_label": "Staff / community priority",
      "sort_tuple": [10, 1717243200000, "opp_123"],
      "evaluated_at_ms": 1715176800000,
      "profile_id": "childcare_enrollment_waitlist_v1",
      "profile_revision": "2026-05-08"
    },
    "reasons": [
      {
        "code": "rule_matched",
        "bucket_key": "staff_community",
        "fact_refs": ["flag_employee_household"],
        "label": "Staff household — policy tier applies."
      },
      {
        "code": "fact_missing_optional",
        "fact_refs": ["flag_sibling_enrolled"],
        "label": "Sibling enrollment not verified; default ordering within tier."
      }
    ],
    "tie_breaker_trace": [],
    "warnings": [{ "code": "unknown_fact", "message": "Sibling flag unknown.", "fact_keys": ["flag_sibling_enrolled"] }]
  }
}
```

---

### 2.6 V1 childcare preset (recommended default)

**Profile id:** `childcare_enrollment_waitlist_v1` (example).

**Cohort:** `queue_key in ["waitlisted"]` (optional `ready_to_enroll` if product allows).

**Priority buckets (earlier = smaller `priority_order`) — illustrative:**

| Order | `bucket_key` | Operator label | Rule idea (facts) |
|------:|--------------|------------------|-------------------|
| 1 | `tier_critical` | Urgent / protective placement | Predicate on org-defined **`flag_urgent_placement`** (rare) |
| 2 | `tier_staff_community` | Staff / community priority | `flag_employee_household` OR `flag_community_priority` |
| 3 | `tier_sibling_sister_site` | Sibling / sister center | `flag_sibling_enrolled` OR `flag_sister_center` |
| 4 | `tier_standard` | Standard waitlist | fallback |

**Tie-breakers (within bucket):**

1. **`wait_since`** fact **asc** (earlier wait = higher priority) — use explicit ISO from ops, **not** raw `updated_at` alone.
2. **`program_room_group` asc** (deterministic grouping — optional; product may omit V1).
3. Implicit **`entity_id` asc**.

**Facts — required vs optional (V1):**

| Fact key | Required | Notes |
|----------|----------|--------|
| **`wait_since`** | **Required** for fair FIFO within tier; may default to inquiry `created_at` **only** if adapter documents mapping. |
| **`flag_employee_household`** | Optional | `unknown` → rule does not fire; standard tier. |
| **`flag_sibling_enrolled`**, **`flag_sister_center`** | Optional | Same. |
| **`flag_community_priority`** | Optional | Same. |
| **`program_room_group`** | Optional | For grouping label only V1. |

**Example explanations (copy templates):**

- “**Earlier wait date** (since Jun 1, 2024) — same priority tier.”
- “**Staff household** — tier applies.”
- “**Community priority** program — tier applies.”
- “**Sibling enrollment** not verified — ranked within standard tier.”

---

### 2.7 QueueService integration points (future — **not implemented** in Card 2)

| Integration | Behavior |
|-------------|----------|
| **Row ordering** | After **`getWorkUnitQueueItems`** loads cohort rows for an **opt-in** lane, **`QueueService`** merges **`snapshot.sort_tuple`** (or comparable key) and **sorts in memory** (needs-attention pattern) **or** uses persisted sort key when present (**Card 6**). |
| **Row preview** | Attach **`bucket_label`** + short **`primary_reason.label`** on preview objects — **not** full snapshot authority. |
| **Drawer** | **`GET /api/admin/entity/opportunities/:id`** adds **`_placement_priority`** (mirror **`_operational_attention`** pattern in P1-B). |
| **Workflow payloads** | Emitter reads **latest snapshot** from entity payload or re-evaluates on relevant **`placement_priority_snapshot_changed`** (**§2.9**). |

---

### 2.8 Persistence recommendation

| Mode | When | V1 |
|------|------|-----|
| **Computed only** | Low volume; acceptable in-memory sort after capped fetch | **Recommended V1 default** — simplest; aligns with “no schema in Card 2”. |
| **Metadata snapshot** | Need audit trail / drawer without recompute; cheap SQL sort columns later | **V1 optional** — `metadata.placement_priority_snapshot_v1` written **only** on meaningful change + event (**Card 5+**). |
| **Generic sidecar table** | Cross-entity analytics, indexing, many rows | **V2** — when caps distort ordering or reporting needs history. |
| **Hybrid** | Hot path compute + async persist for BI | **V2+** |

**V1 path:** **Computed on read** inside **`QueueService`** enrichment for opted-in lanes; **optional** persist behind feature flag if perf demands.

**V2 path:** Sidecar **`entity_placement_snapshots`** (generic `entity_type`, `entity_id`, `profile_revision`, JSON snapshot) + partial index on `(org_id, cohort_key, sort_key)`.

---

### 2.9 Event contract (recommended — **not implemented**)

**Event type:** **`placement_priority_snapshot_changed`**

**Emit when (material change):**

- **`bucket_key`** changes, OR
- **`sort_tuple`** changes beyond tie-breaker noise threshold (optional), OR
- **`profile_revision`** bump replay

**Payload (workflow / `workflow_events`):**

```typescript
export type PlacementPrioritySnapshotChangedPayload = {
    event_type: "placement_priority_snapshot_changed";
    occurred_at: string;
    org_id: string;
    entity_type: string;
    entity_id: string;
    work_unit_id: string | null;
    queue_key: string | null;
    previous: PlacementPrioritySnapshot | null;
    current: PlacementPrioritySnapshot;
    reason_codes: string[];
};
```

**Do not emit** on every queue poll — **only** on persisted snapshot change or authoritative mutation hook (**Card 7+**).

---

### 2.10 Anti-patterns (evaluator & integration)

| Anti-pattern | Why |
|--------------|-----|
| Embedding childcare rule strings inside evaluator TS | Breaks generalized core; use **preset JSON**. |
| Calling Growth **`resolveOpportunityQueueFromDefinition`** for placement | Org-wide semantics; violates Card 0.5. |
| Using queue row order as workflow condition input | Violates queue truth boundary — use **snapshot** on entity/event payload. |
| Showing only numeric rank | Opposite of explainability doctrine — **bucket + reasons** first. |
| LLM-generated reasons in core | Non-deterministic; templates only in V1. |

---

### 2.11 Acceptance criteria for Card 3

- [x] **`evaluatePlacementPriority`** implemented as **pure function** in **`web/lib/orchestration/placement/`** with **zero** Supabase imports — unit tests only.  
- [x] **Types** in **`placementPriorityTypes.ts`** — **no** wiring to routes/`QueueService`.  
- [x] **Tests** cover predicates, bucket assignment, tie-breakers, unknown-fact warnings, **`INVALID_PROFILE`**, **`UNSUPPORTED_COHORT`**, **`FACT_CONSTRAINT_VIOLATION`**, generic rule ordering.  
- [x] **Childcare V1 preset** as **`CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1`** (TS `satisfies PlacementProfile`) — **no** domain branches in core.  
- [x] **No changes** to **`resolveOpportunityQueue.ts`** / Growth routes.  
- [x] **No** migration / metadata writes.

---

## Card 3 — Pure evaluator module + unit tests (completion notes)

**Status:** Completed.  
**Goal:** Ship Card 2 contract as **pure, deterministic** code + childcare **preset only**.

### Files added / changed

| Path | Role |
|------|------|
| `web/lib/orchestration/placement/placementPriorityTypes.ts` | Shared types (+ **`strict_required_facts`**, **`warn_if_unknown_fact_keys`** — see § Contract adjustments). |
| `web/lib/orchestration/placement/evaluatePlacementPriority.ts` | **`evaluatePlacementPriority`**, **`validatePlacementProfile`**, **`evaluatePredicate`**, **`collectPredicateFactKeys`**. |
| `web/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile.ts` | **`CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1`** preset. |
| `web/tests/orchestration/placement/evaluatePlacementPriority.test.ts` | Vitest coverage + **core string guard** (no childcare tokens in evaluator file). |

### Evaluator behavior implemented

- Profile validation (**duplicate buckets**, missing labels, bad rule bucket refs, tie-breaker shape).  
- **`cohort_filter`**: **`UNSUPPORTED_COHORT`** when `queue_key` ∉ allowed list or `status_keys_allowed` does not overlap filtered status keys.  
- **`strict_required_facts`** + **`required_fact_keys`** → **`FACT_CONSTRAINT_VIOLATION`** when required fact not `present`.  
- Rules sorted by **`rule_order`**; **first matching predicate** assigns bucket; otherwise **`fallback_bucket_key`**.  
- Reasons: **`rule_matched`**, **`fallback_bucket`**, **`fact_unknown_optional`** (with preset-driven labels).  
- Warnings: **`unknown_fact`** for keys listed in **`warn_if_unknown_fact_keys`**.  
- **`sort_tuple`**: `[bucket.priority_order, …tie-breaker comparators…, entity_id]`.  
- **`tie_breaker_trace`**: one row per profile tie-breaker + final **`__entity_id__`** row (`resolved_a === resolved_b` for single-entity evaluation).  
- ISO **date strings** in facts → numeric ms comparators for tie-breakers; non-date strings: lexical lowercasing (**desc** on non-dates is not fully inverted in v1 — preset uses date facts only).

### Tests run

`vitest run tests/orchestration/placement/evaluatePlacementPriority.test.ts`

### Production behavior

**Unchanged:** no **`QueueService`** edits, no routes, no schema, no persistence, **`resolveOpportunityQueue`** untouched.

### Contract adjustments vs Card 2 §2.4 snippet

| Addition | Purpose |
|----------|---------|
| **`PlacementProfile.strict_required_facts?: boolean`** | Gates **`FACT_CONSTRAINT_VIOLATION`** for missing **`required_fact_keys`**. |
| **`PlacementProfile.warn_if_unknown_fact_keys?: string[]`** | Config-driven **`unknown_fact`** warnings (childcare preset lists **`flag_sibling_enrolled`**). |
| **Synthetic tie-breaker trace row `field: "__entity_id__"`** | Makes implicit stable sort visible in **`tie_breaker_trace`**. |
| **`labels.reason_fallback` / `labels.reason_rule_matched`** | Optional copy overrides for generic reason lines. |

### Anti-patterns (Card 3 regression guard)

- Do not import **`evaluatePlacementPriority`** from **`QueueService`** until Card 6 explicitly integrates.  
- Do not add childcare keywords inside **`evaluatePlacementPriority.ts`** — preset-only domain language.

### Acceptance criteria for Card 4

- [x] Define **where** placement config lives (**metadata + registry**) and validation / versioning approach.  
- [x] **`resolvePlacementQueueConfig`** (+ **`validatePlacementProfile`** gate) — **no** DB writes.  
- [x] Preset registry for **`childcare_enrollment_waitlist_v1`** (**code-owned**, referenced by id).  
- [x] **Fact-key contract** module for childcare adapters (**Card 5** sourcing).

### Next recommended card (post–Card 3)

**Card 4 — Config design** — **completed** (§ Card 4 below). **Card 5 — Fact sourcing.**

---

## Card 4 — Placement profile config + resolution design (completion notes)

**Status:** Completed (design locked + **low-risk** schema/registry/resolution **code only**).  
**Hard boundaries respected:** no **`QueueService`** wiring, no queue behavior change, no new routes, no DB migrations, **`resolveOpportunityQueue`** untouched.

### 1. Audit — existing config surfaces

| Surface | Pattern | Relevance |
|---------|---------|-----------|
| **`work_units.queue_definition`** | Zod **`queueDefinitionV1Schema`** (`web/lib/config/queueDefinitionSchema.ts`) — `queues[]`, `ui`, filters/sort | **Do not embed** full **`PlacementProfile`** here — avoids bloat and mixed validation lifecycles. Optional future: tiny per-queue flags only if needed (**not** in Card 4 code). |
| **`work_units.metadata`**, **`departments.metadata`** | JSON blobs; **attention** uses **`opportunity_attention_rules`** subtree (`resolveOpportunityAttentionConfigFromMetadata`) | **Mirror pattern:** new subtree **`placement_priority_v1`** with **small** declarative layer (enabled, preset ref, caps, …). |
| **Needs-attention buckets** | `metadata.opportunity_attention_rules.needs_attention_buckets[]` | Precedent for **metadata-driven operational lenses** — placement config is **orthogonal** (different subtree). |
| **Docs** | `docs/system/configuration-system.md` | Lists queue schema + attention buckets — placement should be added when UI/admin persists it. |

### 2. Recommended storage (V1) — **hybrid**

| Layer | Stores | Notes |
|-------|--------|------|
| **Code registry** | Full **`PlacementProfile`** JSON for known presets (`placementPresetRegistry.ts`) | **Single source** for rule payloads — **no duplication** in DB rows. |
| **Department `metadata.placement_priority_v1`** | Optional **defaults** (e.g. org vertical pilot) | Weaker precedence — **work unit wins**. |
| **Work unit `metadata.placement_priority_v1`** | **Primary operator toggle** — enabled, **`profile_id`**, lane filter, caps, shadow flag | Same JSON shape as department layer. |
| **`queue_definition` extension** | **Defer** for V1 | Keeps lane definitions stable; **lane opt-in** via **`queue_keys_enabled`** list on metadata layer. |
| **Separate config table** | **Defer** (V2+) | Use when orgs need non-code profiles, A/B revisions, or audit-heavy drafts. |

**Org-level override later:** same merge model — introduce **`organizations.metadata.placement_priority_v1`** as **lowest** precedence above “all false default”, or dedicated org settings API (**future card**).

### 3. Resolution order (locked)

Applied in **`mergePlacementPriorityLayers`** → **`resolvePlacementQueueConfig`**:

1. **Defaults:** `enabled: false`, safe **`evaluation_cap`** default, no profile.  
2. **Department `placement_priority_v1`** merged (field-wise overlay).  
3. **Work unit `placement_priority_v1`** merged (**wins** on every overlapping field).  
4. **Gate:** if effective **`enabled !== true`** → **disabled** for all queues.  
5. **Gate:** if **`enabled`** but **`profile_id`** missing/blank → **disabled** (fail-safe).  
6. **Lane opt-in:** if **`queue_keys_enabled`** is set → only those **`queue_key`** values resolve **enabled**; others **disabled**.  
7. **Registry:** resolve **`profile_id`** via **`getPlacementProfileFromRegistry`** — unknown id → **disabled** with reason string (no throw in hot path).  
8. **Validate:** **`validatePlacementProfile`** on profile after applying **`missing_fact_behavior`** → **`strict_required_facts`** override; invalid profile → **disabled**.  
9. **Revision pin:** optional **`profile_revision`** vs preset **`revision`** sets **`profile_revision_mismatch`** flag on **`options`** (informational for logs/UI later).

**Disabled by default:** omitting **`placement_priority_v1`** or **`enabled: false`** yields no placement.

### 4. Minimal config shape (metadata JSON)

**Key:** `placement_priority_v1`  
**Schema:** Zod **`placementPriorityLayerSchema`** (`placementConfigSchema.ts`)

```json
{
  "version": 1,
  "enabled": true,
  "profile_id": "childcare_enrollment_waitlist_v1",
  "profile_revision": "2026-05-08",
  "queue_keys_enabled": ["waitlisted", "ready_to_enroll"],
  "shadow_mode": false,
  "evaluation_cap": 800,
  "missing_fact_behavior": "inherit",
  "display": { "show_bucket_chip": true, "show_sort_hint": true }
}
```

| Field | Purpose |
|-------|---------|
| **`version`** | Literal **1** — breaking changes bump schema module. |
| **`enabled`** | Master flag; default **false** when omitted after merge. |
| **`profile_id`** | Registry key — **not** inlined rules. |
| **`profile_revision`** | Optional pin; mismatch ≠ hard fail (**flag** only). |
| **`queue_keys_enabled`** | Lane opt-in; **recommended** when `enabled` to avoid accidental global ordering on every lane. |
| **`shadow_mode`** | Reserved for QueueService compare-only mode (**Card 6**). |
| **`evaluation_cap`** | Bounded (**≤ 5000**); default **800** when omitted. |
| **`missing_fact_behavior`** | **`inherit`** \| **`strict`** \| **`soft`** → maps to evaluator **`strict_required_facts`**. |
| **`display`** | Presentation hints for UI (**Card 7**); ignored by evaluator core. |

### 5. Validation strategy

| Concern | Mechanism |
|---------|-----------|
| Malformed metadata | **`parsePlacementPriorityLayerStrict`** → Zod issues (admin save). |
| Unknown preset | **`resolvePlacementQueueConfig`** → **disabled** + reason (**runtime safe**). |
| Unsafe cap | Zod **`.max(PLACEMENT_EVALUATION_CAP_MAX)`**. |
| Invalid profile after merge | **`validatePlacementProfile`** (existing evaluator validator). |

### 6. Fact-key contract (childcare V1)

**Module:** `web/lib/orchestration/placement/childcarePlacementFactContractV1.ts`

| Fact key | Role | Required / optional |
|----------|------|---------------------|
| **`wait_since`** | FIFO tie-break (ISO 8601) | **Strongly required** for fair ordering; adapter may map inquiry start → **`wait_since`**. |
| **`desired_start_date`** | Secondary tie-break | **Optional** |
| **`flag_employee_household`** | Staff/community tier OR arm | **Optional** (`unknown` → rule does not match) |
| **`flag_staff_household`** | Staff tier OR arm | **Optional** |
| **`flag_community_priority`** | Community tier OR arm | **Optional** |
| **`flag_sibling_enrolled`** | Sibling tier rule | **Optional**; preset warns when **`unknown`** |
| **`flag_sister_center`** | Sister-center tier rule — domain **“sister center transfer”** maps here at adapter | **Optional** |
| **`program_room_group`** | Optional cohort label / future grouping | **Optional** |

### 7. Implementation added (Card 4)

| File | Role |
|------|------|
| `web/lib/orchestration/placement/placementConfigSchema.ts` | Zod layer schema, merge, defaults, caps. |
| `web/lib/orchestration/placement/placementPresetRegistry.ts` | **`getPlacementProfileFromRegistry`**, lists ids — references **`CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1`**. |
| `web/lib/orchestration/placement/resolvePlacementQueueConfig.ts` | **`resolvePlacementQueueConfig`**, **`validatePlacementMetadataLayers`**. |
| `web/lib/orchestration/placement/childcarePlacementFactContractV1.ts` | Fact-key constants + docs for adapters. |
| `web/tests/orchestration/placement/placementConfigResolution.test.ts` | Schema + merge + resolve coverage. |

### 8. Remaining risks

| Risk | Mitigation |
|------|------------|
| **`queue_keys_enabled` omitted** while **`enabled: true`** applies placement on **every** lane | **Recommend** always setting **`queue_keys_enabled`** in pilot docs / seeds. |
| **Department + WU divergence** | Merge rules documented; future admin UI should show **effective** preview. |
| **Preset drift vs pinned revision** | **`profile_revision_mismatch`** surfaced on **`options`** — wire to logging/UI later. |

### 9. Acceptance criteria for Card 5

- [x] Opportunity **adapter** builds **`FactBag`** from row-shaped inputs using **`childcarePlacementFactContractV1`** keys.  
- [x] Unit tests for adapter mapping (**no** QueueService).  
- [x] Fact mapping documented (**§ Card 5** table below); joins beyond **`metadata`/`created_at`** deferred.  
- [x] Still **no** queue reorder in **`QueueService`** (**Card 6**).

---

## Card 5 — Opportunity placement fact sourcing (completion notes)

**Status:** Completed.  
**Scope:** **`buildOpportunityPlacementFacts`** — pure extraction from **`created_at` + `metadata`** shapes aligned with **`QueueService`** opportunity previews (**no** Supabase, no routing).

### 1. Queue row / enrichment audit (findings)

| Source | Available today | Used by adapter |
|--------|-----------------|-----------------|
| **`OpportunityRowPreview`** (`QueueService.ts`) | `id`, `name`, `status_key`, `customer_id`, `primary_person_id`, `primary_contact_id`, `work_unit_id`, `quote_*`, **`metadata`**, **`created_at`**, **`updated_at`** | **`metadata`**, **`created_at`** |
| Post-enrichment preview | `_desired_start_date`, `_requested_program`, CRM lines, attention fields | **Not read** in Card 5 — adapter targets **raw row** before enrichment so **`QueueService`** can call it on DB-shaped rows; **`desired_start_date`** duplicated from **`metadata.desired_start_date`** per **`QueueService`** enrichment path |

### 2. Fact mapping table (implemented)

| Fact key | Presence rules | Metadata / field sources (first hit wins where listed) |
|----------|----------------|------------------------------------------------------|
| **`wait_since`** | `present` / `absent` | ① **`metadata.enrollment_operational.wait_since`** (via **`parseEnrollmentOperationalFromMetadata`**) ② **`metadata.wait_since`** (ISO) ③ optional **`created_at`** only if **`wait_since_fallback_created_at: true`** |
| **`desired_start_date`** | `present` / `absent` | **`metadata.desired_start_date`**, or **`metadata.placement_fact_inputs_v1.desired_start_date`** |
| **`flag_employee_household`** | `present` / `unknown` / `absent` | **`metadata.flag_*`**, **`placement_fact_inputs_v1`**, **`enrollment_placement`** |
| **`flag_staff_household`** | same | same pattern |
| **`flag_community_priority`** | same | same pattern |
| **`flag_sibling_enrolled`** | same | **`flag_sibling_enrolled`**, **`placement_fact_inputs_v1`**, **`enrollment_placement`**, **`sibling_enrollment_status`**; strings **`unknown` \| `pending` \| `pending_verification`** → **`unknown`** |
| **`flag_sister_center`** | same | **`metadata.flag_sister_center`**, **`sister_center_transfer`**, **`enrollment_placement.sister_center_transfer`**, **`placement_fact_inputs_v1`** sister-center keys |
| **`program_room_group`** | `present` / `absent` | **`placement_fact_inputs_v1.program_room_group`**, **`metadata.program_room_group`**, fallback **`metadata.program_label`** |

### 3. Explainability

- **`FactValue.source`** (optional string on **`placementPriorityTypes`**) records adapter lineage; **`evaluatePlacementPriority`** ignores it. Rich multi-source provenance (**tables**, joins) → **future card** (optional **`detail`** bag).

### 4. Files changed / added

| Path | Role |
|------|------|
| `web/lib/orchestration/placement/placementPriorityTypes.ts` | Optional **`source?: string`** on **`FactValue`**. |
| `web/lib/orchestration/placement/adapters/opportunityPlacementFacts.ts` | **`buildOpportunityPlacementFacts`**, **`OpportunityPlacementFactSource`**. |
| `web/tests/orchestration/placement/opportunityPlacementFacts.test.ts` | Adapter + evaluator smoke tests. |

### 5. Tests run

`vitest run tests/orchestration/placement/ --run` — **38 tests**, **3 files** (adapter + evaluator + config resolution).

### 6. Unresolved fact gaps (Card 6+ / product)

| Gap | Notes |
|-----|------|
| **Employee / staff / community flags** | No canonical CRM columns yet — rely on **`placement_fact_inputs_v1`** or future workflow writes into **`metadata`**. |
| **Sibling / sister-center truth** | Today **metadata-driven**; authoritative household/sibling joins (**`customer_members`**, etc.) → optional **Card 6** enrichment feeding adapter **or** widening **`OpportunityPlacementFactSource`**. |
| **program_room_group vs classroom** | **`program_label`** is a **preview fallback**, not a formal room assignment. |

### 7. What QueueService can consume in Card 6 (shadow / ordering)

1. Load **`work_unit` + `department` metadata** → **`resolvePlacementQueueConfig(queue_key)`**.  
2. If **`enabled`**, build **`FactBag`** via **`buildOpportunityPlacementFacts({ created_at, metadata })`** per row.  
3. Call **`evaluatePlacementPriority`** with **`profile`** from registry — attach snapshot + **`sort_tuple`** to preview payload; **`shadow_mode`** compares without replacing SQL sort until explicitly flipped.

### 8. Acceptance criteria for Card 6

- [x] **`QueueService`** opportunity path: optional placement enrichment behind **`resolvePlacementQueueConfig`**.  
- [x] Respect **`evaluation_cap`**, **`shadow_mode`**, **`queue_keys_enabled`**.  
- [x] No changes to **`resolveOpportunityQueueFromDefinition`**.

---

## Card 6 — QueueService placement integration (completion notes)

**Status:** Completed (**shadow-first**, opt-in **`placement_priority_v1`**).  
**Integration point:** **`getWorkUnitQueueItems`** — after **`enrichOpportunityRows`** for all **opportunity** list branches (**standard paginated lane**, **`omitTotalCount`**, **`needs_attention`**). **`resolveOpportunityQueueFromDefinition`** untouched.

### 1. Files changed / added

| Path | Role |
|------|------|
| `web/lib/orchestration/placement/applyPlacementToOpportunityQueueRows.ts` | **`applyPlacementToOpportunityQueueRows`** — facts → evaluate → **`_placement_priority`**; optional reorder by **`sort_tuple`**. |
| `web/lib/queues/QueueService.ts` | Loads **`departments.metadata`** once per opportunity items request (when `department_id` present); **`resolvePlacementQueueConfig`** + **`attachPlacementToEnrichedOpportunityItems`**; **`opportunityQueueStatusKeysAllowed`** from lane status filters. |
| `web/lib/queues/types.ts` | Optional **`placement_projection_diagnostics`** on **`QueueItemsResult`**. |
| `web/tests/orchestration/placement/applyPlacementToOpportunityQueueRows.test.ts` | Helper behavior: shadow vs reorder, cap, errors contained, warnings. |
| `web/tests/queues/QueueServicePlacementProjection.test.ts` | Disabled config + **`queue_keys_enabled`** gate + status filter helper. |

### 2. Row preview shape (`_placement_priority`)

Non-authoritative projection on each evaluated opportunity row:

**Success**

- `bucket_key`, `bucket_label`, `sort_tuple`, `reasons`, `warnings`, `shadow_mode`, `evaluated_at_ms`

**Evaluator error (row-level)**

- `evaluate_error: true`, `code`, `message`, `shadow_mode`, `evaluated_at_ms`

Raw **`PlacementProfile`** JSON is **not** attached to rows.

### 3. Ordering behavior

| Config | Behavior |
|--------|----------|
| **Disabled** (default / invalid / unknown profile / lane not in **`queue_keys_enabled`**) | Identical to pre–Card 6: SQL sort + enrichment only; **no** `_placement_priority`; **no** diagnostics field. |
| **`shadow_mode: true`** | Preview attached; **SQL row order preserved**. |
| **`shadow_mode: false`** | First **`evaluation_cap`** rows **re-sorted in memory** by evaluator **`sort_tuple`** (ascending lexicographic); remaining rows **not evaluated**, appended in original order. |

### 4. Response diagnostics (`placement_projection_diagnostics`)

Present only when placement resolved **enabled** for the lane:

- `evaluated_count`, `skipped_due_to_cap_count`, `reorder_applied`, `shadow_mode`, `row_evaluation_errors`, `profile_revision_mismatch`

### 5. Tests run

- `vitest run tests/orchestration/placement/ tests/queues/QueueServicePlacementProjection.test.ts --run`  
- `vitest run tests/queues/ --run`

### 6. Known limitations

- **Pagination:** Reorder applies **only to the fetched page** (plus cap). Global ordering across offsets is **not** implied.  
- **`evaluation_cap`:** Rows beyond the cap have **no** `_placement_priority` and keep SQL order after the evaluated prefix.  
- **Department fetch:** One extra **`departments.metadata`** read per **`getWorkUnitQueueItems`** opportunity request when the work unit has **`department_id`** (needed for dept → WU merge).  
- **Summaries:** **`getWorkUnitQueueSummaries`** preview rows are **unchanged** in this card (items route only).

### 7. Next card recommendation

**V1.1:** workflow packet + entity GET/drawer + persistence / global ordering (**§ Cards 8–9** backlog).

---

## Card 7 — Placement priority UI preview (completion notes)

**Status:** Completed (Admin V2 **work-unit** opportunity queue list only).  
**Surfaces:** **`QueueBlock`** work-unit lane — CRM compact and basic row layouts; queue header hint when **`placement_projection_diagnostics`** is present.

### 1. UI surfaces changed

| Area | Behavior |
|------|----------|
| **Row** | When **`_placement_priority`** parses successfully: **“Placement priority”** kicker + **pill** with evaluator **`bucket_label`** + up to **2** **`reasons[].label`** lines + up to **2** **`warnings[].message`** lines (muted / amber). **Shadow mode:** extra footnote that row order matches the queue’s usual sort. |
| **Evaluator error rows** | Subdued **“Placement priority”** + server **message** — no fake cohort chip. |
| **Lane hint** | If API returns **`placement_projection_diagnostics`**: shadow → *“Placement priority preview — list order is unchanged; not a full-waitlist sort.”* Non-shadow → *“Sorted by placement priority for the records loaded on this page — not the full waitlist.”* |
| **Drawer / entity GET** | **Not** implemented — queue projection remains non-authoritative; full placement section waits for **resolver / entity GET** (same boundary as attention drawer). |

### 2. Copy / doctrine decisions

- **No** global rank, **no** “#1”, **no** “top of waitlist”, **no** guaranteed ordering language.
- Labels come **only** from API **`bucket_label`** / **`reasons`** / **`warnings`** — **no** childcare tier strings hardcoded in React.
- **`display`** (`show_bucket_chip`, `show_sort_hint`) — echoed on **`placement_projection_diagnostics.display`** (Cards 8–9); **`QueueVm.placementDisplay`** gates row strip + lane hint (`false` hides that surface).

### 3. Files changed / added

| Path | Role |
|------|------|
| `web/lib/ui-v2/queuePlacementPriorityPresentation.ts` | Parse **`_placement_priority`** → **`QueueRowPlacementPriorityVm`**; **`buildPlacementProjectionQueueHint`**. |
| `web/lib/ui-v2/workspace-types.ts` | **`QueueRowPlacementPriorityVm`**, **`QueueItemVm.placementPriority`**, **`QueueVm.placementProjectionHint`**, **`QueueVm.placementDisplay`**. |
| `web/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip.tsx` | Row strip UI. |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | Renders strip + lane hint. |
| `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx` | Maps API rows → **`placementPriority`**; passes **`placement_projection_diagnostics`** → hint; extends local **`QueueItemsResult`** type. |
| `web/app/adminV2/components/workspace/workspace.css` | Placement strip + hint styles. |
| `web/tests/ui-v2/queuePlacementPriorityPresentation.test.ts` | Parser + hint tests (no rank language). |
| `web/tests/adminV2/QueueRowPlacementPriorityStrip.test.tsx` | Static render smoke (chip, warnings, error path). |

### 4. Tests run

- `vitest run tests/ui-v2/queuePlacementPriorityPresentation.test.ts tests/adminV2/QueueRowPlacementPriorityStrip.test.tsx --run`

### 5. Remaining UX gaps

- **Department rollup** / summary previews unchanged (no placement on KPI cards).
- **Drawer** placement section deferred to entity GET (**V1.1**).

### 6. Next card recommendation

See **§ Cards 8–9** (V1 closeout) and **V1.1 backlog** there.

---

## Cards 8–9 — Demo enablement, E2E verification, sprint closeout (completion notes)

**Status:** Completed. **Scope:** Idempotent **demo metadata patch** (shadow placement on **`waitlisted`** only), **`display`** echo on queue diagnostics, expanded tests, **`typecheck`** script, sprint documentation for manual QA. **Not in scope:** workflow events, persistence, drawer/entity GET, **`resolveOpportunityQueueFromDefinition`** edits (**explicit freeze** maintained).

### 1. Seed command

From repo **`web/`** (requires `.env` / `.env.local` **service role** Supabase credentials like other `scripts/`):

```bash
npm run dev:seed:placement-priority-demo
```

**Env:**

| Variable | Required | Notes |
|----------|----------|--------|
| **`DEV_QUEUE_ORG_ID`** | One of | Preferred — matches **`ensureEnrollmentPipelineWorkUnitV1`**. |
| **`ORG_ID`** | One of | Fallback — matches **`seedEnrollmentPipelineDemoData`**. |
| **`WORK_UNIT_KEY`** | No | Default **`enrollment_pipeline`**. |

**Prerequisite:** enrollment pipeline work unit exists (`npm run dev:seed:ensure-enrollment-pipeline`).

**What it does (idempotent):**

1. Merges **`placement_priority_v1`** into **`work_units.metadata`** for that work unit (`enabled`, **`childcare_enrollment_waitlist_v1`**, revision **`2026-05-08`**, **`queue_keys_enabled: ["waitlisted"]`**, **`shadow_mode: true`**, **`evaluation_cap: 200`**, **`display`** flags on).
2. Creates or updates **six** **`waitlisted`** opportunities (`metadata.seed_key` = `placement_demo_waitlisted_*`) with distinct flags (staff, community, sibling, sister center, general, unknown sibling).

**Implementation:** `web/scripts/seedPlacementPriorityDemoPatch.ts` · pure helpers `web/lib/orchestration/placement/placementPriorityDemoPatch.ts`.

### 2. Manual verification — UI route

1. Run seed (above).  
2. Open **Admin V2** → **Workspace** → pick department with **Enrollment** → open **Enrollment pipeline** work unit.  
3. Select the **Waitlisted** queue tab.  
4. Confirm **lane hint** (waitlist priority preview — **loaded page**, program grouping, **not** full waitlist) and **row strips** (**Waitlist priority** kicker + **priority rule** chip + reasons; unknown sibling shows warning copy).  
5. Confirm **section headers** group rows by **Infant** vs **Toddler** (demo seed).  
6. Switch to another queue lane (e.g. **All / pipeline total**) → **no** placement UI (**`queue_keys_enabled`** gate).

### 3. Expected UI behavior

- **Shadow (demo default):** Row order matches **usual SQL sort**; grouping + rule chips are **preview only** (footnote + lane hint).  
- **Program-first:** Evaluator **`sort_tuple`** is **`program_room_group` → bucket → tie-breakers → entity id**; `_placement_priority.program_room_group_label` feeds section titles.  
- **No** rank numbers, **no** “top of waitlist” / guaranteed ordering / AI language (automated tests enforce conservative copy).  
- **`show_bucket_chip` / `show_sort_hint`** from merged config respected when returned on **`placement_projection_diagnostics.display`**.

### 4. Automated verification / tests run

```bash
cd web && npm test -- tests/orchestration/placement/ tests/queues/ tests/ui-v2/queuePlacementPriorityPresentation.test.ts tests/adminV2/QueueRowPlacementPriorityStrip.test.tsx --run
cd web && npm run typecheck
```

**Added:** `web/tests/orchestration/placement/placementPriorityDemoPatch.test.ts` (strict-parse demo layer, idempotent work-unit merge, scenario metadata).

### 5. Files changed / added (Cards 8–9)

| Path | Role |
|------|------|
| `web/lib/orchestration/placement/placementPriorityDemoPatch.ts` | Demo **`placement_priority_v1`** constant + merge helpers + scenario metadata. |
| `web/scripts/seedPlacementPriorityDemoPatch.ts` | Supabase patch runner (prints actions). |
| `web/lib/orchestration/placement/applyPlacementToOpportunityQueueRows.ts` | **`diagnostics.display`** from merged config; tuple sort typing fix for **`tsc`**. |
| `web/package.json` | **`dev:seed:placement-priority-demo`**, **`typecheck`**. |
| `web/lib/ui-v2/workspace-types.ts` | **`QueueVm.placementDisplay`**. |
| `web/app/adminV2/.../work-unit/[workUnitId]/page.tsx` | Pass **`placementDisplay`** from diagnostics. |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | Respect **`placementDisplay`** for chip + hint. |
| `web/tests/orchestration/placement/placementPriorityDemoPatch.test.ts` | Demo merge / schema tests. |

### 6. Known limitations (unchanged + demo)

- **Pagination / cap:** Ordering is **not** globally authoritative (**§ Card 6**). Section headers and previews reflect **`evaluation_cap`** — loaded slice only.  
- **Lexicographic `program_room_group`:** Sort/group order follows **string sort** on the fact value — not a curated room-age ladder unless metadata uses comparable tokens.  
- **Per-program rule precedence** (e.g. toddler vs infant different tier orders) is **not** modeled — single rule list for all groups until **V1.1** config work.  
- **Demo rows** use **`placement_priority_demo_v1`** package marker — separate from **`enrollment_pipeline_demo_v2`** families.  
- **Department-level** placement not patched by default (work-unit-only opt-in minimizes blast radius).

**Cleanup completed:** Copy (**Waitlist priority**, **Standard family**, program-first hints), childcare preset **`primary_group_fact_key`**, evaluator **`sort_tuple`**, **`program_room_group_label`** on preview payload, UI section headers via **`groupLabel`**, demo **Infant/Toddler** facts — **implemented** in sprint doc refresh (May 2026).

### 7. V1.1 backlog (recommended)

| Item | Notes |
|------|--------|
| **Workflow event packet** | **`placement_priority_snapshot_changed`** + stable payload; emit only on material snapshot delta — **not** on every queue poll. |
| **Entity GET / drawer** | Authoritative placement section mirroring **`_operational_attention`** boundary. |
| **Persisted / global snapshot** | Optional sidecar or metadata snapshot for BI + consistent cross-page ordering. |
| **Global ordering + pagination** | Define policy when **`evaluation_cap`** / **page** boundaries distort fairness. |
| **Display flag propagation** | Already on diagnostics; optional **org defaults** / admin preview of effective config. |
| **Growth interpreter** | Shim/migrate per Card **1** deferred work — still **compatibility-only**. |

---

## 1. Current-state audit

### 1.1 Queue ordering behavior (runtime)

| Area | Behavior | Primary code / docs |
|------|----------|---------------------|
| **Default sort** | Opportunities: `updated_at` descending when queue config omits `sort`. | `buildOpportunityPlan` in `web/lib/queues/QueueService.ts` |
| **Configured sort** | Array of `{ field, direction }` applied to PostgREST query (plus in-memory replay for some paths). | Same file; `sortOpportunityRowsByPlan` for post-filter reorder |
| **Allowlisted sort columns (opportunity)** | `updated_at`, `created_at`, `status_key`, `name` only. | `OPPORTUNITY_SORT_ALLOWLIST` in `QueueService.ts` |
| **Allowlisted sort columns (job)** | `created_at`, `updated_at`, `status_key`. | `JOB_SORT_ALLOWLIST` |
| **Needs attention lane** | Hybrid: broad SQL prefilter → **`resolveOpportunityAttention`** membership → **sort reapplied in memory**. | `loadOpportunityNeedsAttentionRows` in `QueueService.ts`; resolver in `web/lib/opportunities/opportunityAttentionResolver.ts` |
| **Enrollment pipeline queues** | Mostly **`updated_at`**; tour lanes use **`asc`** where “soonest” matters. | `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts` |

**Implication:** Any placement priority that **cannot** be expressed as **simple column sorts** will follow the **same architectural pattern as needs attention**: **resolver/evaluator truth** + **projection ordering**, not “magic columns” invented only for the list UI.

### 1.2 `queue_definition` ordering / sort support

- **Schema:** `queues[].sort` is an **array** of sort specs (`web/lib/config/queueDefinitionSchema.ts`).
- **Lane hints:** `queues[].priority` is **`standard` | `attention` | `critical`** — **UX / emphasis**, not per-record placement priority.
- **`group_by`:** Present on **`queueConfigSchema`** but **not referenced** in `QueueService` or workspace composition (only schema tests). **Dead config surface today** → either implement deliberately or deprecate in docs to avoid false expectations.

### 1.3 Legacy / parallel interpreter (drift risk)

- **`resolveOpportunityQueueFromDefinition`** (`web/lib/rrs/queue/resolveOpportunityQueue.ts`) expects the **older Growth document shape**: top-level **`filters` object**, **`sort: { by, direction }`**, **`limit`** — **not** the workspace **`queues[]`** model.
- **`resolveOpportunityQueueFromDefinition`** still used by:
  - `GET /api/admin/work-units/[id]/opportunity-queue`
- **`GET .../opportunity-lifecycle-kpis`** uses **`parseQueueDefinitionV1Strict`** + **`applyGrowthOpportunityFiltersToQuery`** (`growthOpportunityQueueScope.ts`; **Card 1**) — scopes via **`pipeline_overview`** work unit key (may still be **misaligned** with canonical **`enrollment_pipeline`**).

**Admin V2 work-unit page** loads row data via **`GET /api/admin/queues/[workUnitId]/[queueKey]`** → **`QueueService`** (see `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`).

**Older operations workspace hook** may still call **`opportunity-queue`** (`web/hooks/useOperationsWorkspaceData.ts`). **Admin V2** may **fallback** to **`opportunity-queue`** / **`opportunity-attention-queue`** when the new summaries API path fails (same work-unit page).

**Needs-attention list API** (`opportunity-attention-queue`) uses **`buildOpportunityAttentionQueueItems`**, not the Growth interpreter — see **Card 0.5**.

**Canonical decision:** **`QueueService`** owns future placement projection; Growth interpreter is **compatibility-only** — **Card 0.5**.

**Risk:** Two mental models + two parsers → **subtle parity bugs** (sort fields supported, filters, limits, scope).

### 1.4 Opportunity / customer / person metadata useful for orchestration

| Signal | Today | Notes |
|--------|--------|------|
| **Lifecycle** | `opportunities.status_key` + org status definitions | Pipeline buckets are **status-filter queues** |
| **Waiting / blocked facets** | `metadata.enrollment_operational` (`wait_bucket`, `wait_since`, …) | Parsed by `web/lib/opportunities/enrollmentOperationalMetadata.ts`; wired into attention |
| **Tour / follow-up** | `metadata` keys such as `tour_date`, `next_follow_up_at`, `commitment_due_at` | Used in attention + queue prefilters |
| **Quote / value** | `quote_total`, cent columns | Attention **value** dimension uses monetary signals |
| **Childcare inquiry shape** | `customer_members`, inquiry children UI | **Sibling** flows exist in UI; **no canonical structured “placement priority facts”** surfaced for ranking |
| **`updated_at` semantics** | Trigger preserves `updated_at` when **only** metadata changes (`supabase/migrations/20260430210000_opportunities_metadata_only_preserve_updated_at.sql`) | **Careful:** metadata-only orchestration updates may **not** bump `updated_at` — date-added / stale semantics must be **explicit fields or explicit policy**, not accidental |

### 1.5 Workflow / event hooks

- **Status transitions** emit **`opportunity_status_changed`** / workflow fan-out (`web/lib/admin/emitStatusChangedEvent.ts`).
- **Workflow evaluation** reads **`workflow_conditions`** against **`workflowRun`** payload (`web/lib/workflowRun.ts`).
- **No dedicated “placement priority changed” event** today — future orchestration should **emit explicit events** when priority snapshot changes materially (for audit, workflows, notifications), **without** coupling to queue fetches.

### 1.6 Queue grouping / sorting capabilities (UI)

- **Pipeline layout:** `queue_definition.ui.layout`, **`sections`**, **`queue_keys`** — **grouping is “which lane”**, not intra-lane cohort grouping.
- **Needs-attention buckets:** Metadata-driven **`needs_attention_buckets`** (see `docs/system/configuration-system.md`) — **precedent for bucket lenses** with resolver backing.
- **KPI blocks:** Department/workspace KPI strips tie to queue keys / status keys (e.g. `KpiBlock` ready/waitlist mapping) — **presentation coupling** to status keys; orchestration should **avoid duplicating KPI logic** in React.

### 1.7 Existing “priority” concepts in-repo

| Concept | Meaning |
|---------|---------|
| **`queues[].priority`** | Lane presentation weight (`standard` / `attention` / `critical`), not row rank |
| **`needs_attention_buckets[].priority`** | Bucket ordering (lower first) |
| **`resolveOpportunityAttention` → `priority_score` + `priority_breakdown`** | Deterministic weighted score for **attention triage** (see `web/lib/opportunities/attentionPriorityScore.ts`) |
| **Platform reason ordering** | `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER` etc. (`attentionPlatformCatalog`) |

**Tension for this sprint:** Attention scoring is **explainable** but still **numeric**. Placement orchestration should prefer **named buckets + deterministic tie-breakers**; scores may remain **internal** or **advanced-only**, consistent with P1-B explainability gates (`enrollment_attention_phase1_gate_p1b_explainability_design.md`).

---

## 2. Architecture recommendations

### 2.1 Conceptual home (doctrine-aligned)

| Layer | Responsibility |
|-------|----------------|
| **Entity + workflow** | Mutations that change eligibility, cohort membership, or commitments |
| **Orchestration evaluator (new)** | Computes **placement/priority snapshot** + **human explanations** from facts (inputs from entity rows, related tables, org config) |
| **Materialization strategy (choose per scale)** | Either **persisted snapshot** on entity/metadata for cheap SQL sort, or **compute-on-read** for queue projections with caps (needs-attention pattern) |
| **`queue_definition`** | Declares **which projection** to run (filters, display hints, **optional** “use orchestration profile X”) — **not** the authority for why someone is prioritized |
| **`QueueService`** | Executes projection plans, merges resolver outputs into row previews **for display/navigation only** |
| **Entity GET / record responders** | Carry **full explanation** for drawers (mirror attention contract in P1-B) |

This preserves: **Queue → select entity → refetch authoritative data → act.**

### 2.2 What stays generalized vs childcare-only

| Generalized (platform) | Childcare V1 (preset / config pack) |
|------------------------|-------------------------------------|
| Orchestration **profile** ID on work unit / org metadata | Rule templates for **waitlisted / ready-to-enroll** cohorts |
| **Fact types** (boolean flags, dates, related-party checks, program/room labels) | Fact sources: inquiry children, sites, employee flags, community programs |
| **Bucket taxonomy** + tie-break keys | Default bucket ordering + labels copy |
| **Explainability record** (structured reasons, not prose) | Wording templates / locale |
| **Event**: `placement_priority_snapshot_changed` (example) | Workflow recipes reacting to waitlist promotion |

### 2.3 Service boundaries (recommended)

1. **`PlacementOrchestrationService` (name TBD)** — pure evaluation from inputs; unit-testable; no React.
2. **Integration adapter for opportunities** — maps DB row + joins → evaluator input DTO.
3. **`QueueService` integration** — for lanes that opt in, **merge** evaluator outputs into preview rows and apply **ordering policy** (see §2.5).
4. **Optional persistence layer** — if SQL sort is required at scale: **versioned snapshot** fields or sidecar table **indexed** for ordering; **never** treat queue cache as source.

### 2.4 Schema direction (options — decision in design review)

| Option | Pros | Cons |
|--------|------|------|
| **A. JSON snapshot on `opportunities.metadata`** (`placement_orchestration_v1`) | Fast to ship; fits config迭代 | Risk of uncontrolled growth; migration/tooling needed |
| **B. First-class columns** (`placement_bucket_key`, `placement_rank`, `placement_snapshot_at`) | Clean SQL sort | Schema churn; cross-vertical generalization harder |
| **C. Sidecar `entity_priority_snapshots`** (generic entity_type/id) | Clean separation; reusable across jobs/opps | More joins; consistency tooling |

**Recommendation:** Start with **A or C** depending on analytics needs; **avoid B** until verticals converge on shared semantics.

### 2.5 Resolver integration

- Mirror **`resolveOpportunityAttention`** patterns:
  - **Inputs:** normalized entity snapshot, org config, optional signals (related records), `nowMs`
  - **Outputs:** `bucket_key`, `bucket_label`, ordered **`reasons[]`**, **`tie_breakers[]`**, optional **`rank`** / **`sort_keys`** for stable ordering
- **Drawer:** Attach full snapshot + explanations on **`GET /api/admin/entity/opportunities/:id`** (same philosophical contract as `_operational_attention` in P1-B).

### 2.6 Workflow integration

- **Emit events** when snapshot changes beyond epsilon (bucket change, major reason add/remove).
- **Conditions** should refer to **snapshot fields on payload** populated by workflow enrichment — **not** “queue position.”
- **Actions** remain **`executeAdminAction`** / workflow actions — orchestration **informs** suggested actions; does not replace workflow.

---

## 3. UI/UX recommendations

| Topic | Recommendation |
|-------|----------------|
| **Queue row (L0)** | Show **one** bucket chip + **one** human headline (“Employee household · wait date Jun 2024”) — **no raw numeric score by default** |
| **Sorting** | Operator-facing **bucket order** locked by config; **within bucket**: deterministic keys (e.g. wait date ASC, then created_at) — **surface in UI as “Sorted by …”** |
| **Grouping** | Prefer **definition-driven sections** (`group_by` implemented properly **or** separate queue lanes per bucket if simpler for V1) |
| **Explainability** | Drawer section **“Placement priority”** (parallel to **Operational attention**): reasons + tie-breakers; advanced panel for technical detail |
| **Needs attention interaction** | Keep concepts distinct: **attention** = operational risk/time; **placement** = fair sequencing / policy — UI must **not** conflate badges |

---

## 4. Risks / anti-patterns

| Risk | Mitigation |
|------|------------|
| **Duplicating queue SQL** | Consolidate on **one** queue execution path for workspace opportunities; retire or shim **`resolveOpportunityQueueFromDefinition`** to **`QueueService`** |
| **Doctrine violation** | Never run placement **workflow branches** off queue rows alone; always entity/resolver |
| **Hardcoded childcare ranking in TS/React** | Encode childcare as **config presets** + metadata-driven labels |
| **Hidden global scoring** | Prefer bucket + reasons; score only as tie-break or diagnostics |
| **Projection at scale** | In-memory sort caps like needs-attention **distort tail ordering** — document limits or persist sort keys |
| **Metadata-only updates hiding recency** | Use explicit **`wait_since` / `priority_as_of`** fields — do not rely on `updated_at` alone |
| **KPI / pipeline drift** | Align KPI scope work units with **`enrollment_pipeline`** canonical config |

---

## 5. Sprint recommendation

### 5.1 Sprint file name

**This document:** `docs/sprints/05_2026/priority_placement_orchestration_may_2026.md`

### 5.2 Card sequence (ordered)

| # | Card | Notes |
|---|------|--------|
| **0.5** | **RFC lock + queue interpreter decision** | **This document § Card 0.5** — canonical **`QueueService`**; Growth interpreter frozen for placement. |
| **1** | **Queue interpreter consolidation spike** | **Done (this card):** shared Growth filter module + KPI dedupe + interpreter delegation + tests. **Deferred:** full `opportunity-queue` → QueueService shim (blocked on org-wide vs `work_unit_id` semantics). |
| **2** | **Evaluator RFC detail** | **Done (this document § Card 2)** — contract, types RFC, events, persistence rec, V1 preset narrative. |
| **3** | **Pure evaluator module + unit tests** | **Done** — `web/lib/orchestration/placement/` + **`evaluatePlacementPriority.test.ts`** (§ Card 3 completion notes). |
| **4** | **Placement profile config + resolution** | **Done** — metadata **`placement_priority_v1`**, Zod merge/resolve, preset registry, fact contract (`§ Card 4`). |
| **5** | **Opportunity placement fact sourcing** | **Done** — **`adapters/opportunityPlacementFacts.ts`** + tests (**§ Card 5**); joins deferred. |
| **6** | **`QueueService` placement integration** | **Done** — **`applyPlacementToOpportunityQueueRows`** + **`getWorkUnitQueueItems`** (**§ Card 6**); shadow / cap / lane gate. |
| **7** | **Placement priority UI preview** | **Done** — Admin V2 queue rows + lane hint (**§ Card 7**); drawer deferred. |
| **8** | **Demo enablement** | **Done** — **`npm run dev:seed:placement-priority-demo`** (**§ Cards 8–9**). |
| **9** | **E2E verification + sprint closeout** | **Done** — tests + **`typecheck`** + manual route doc (**§ Cards 8–9**). |

### 5.3 Implementation sequencing (after RFC approval)

1. **Card 0.5** locked (interpreter decision).  
2. **Card 1** structural consolidation (Growth filter dedupe).  
3. **Card 2** evaluator RFC locked (this document).  
4. **Card 3** — pure evaluator + tests (no production wiring).  
5. **Cards 4–6** — config, fact sourcing, **`QueueService`** integration.  
6. **Cards 7–9** — UI preview, demo enablement, verification (**V1 complete**).  
7. **V1.1** — Workflow packet, entity GET/drawer, persistence / global ordering (**§ Cards 8–9** backlog).  

### 5.4 V1 scope boundary (recommended)

**In V1**

- Single vertical slice: **childcare enrollment opportunities** in **`waitlisted`** (optionally **`ready_to_enroll`** if policy demands)  
- **Configurable bucket rules** (limited DSL or declarative rule list)  
- **Explainable output** on entity GET + queue preview hints  
- **Deterministic ordering** within cohort  

**Not in V1**

- Capacity solving, ratio optimization, room simulation  
- AI placement recommendations as authoritative  
- Cross-entity orchestration (staffing, vendors) — **design hooks only**  
- Full **`group_by`** UX unless trivially mapped to existing pipeline sections  
- New standalone waitlist table as system of record  

---

## 6. Transition strategy

| Topic | Recommendation |
|-------|----------------|
| **Evolution of current waitlist queues** | Keep **status-filter lanes**; add **orchestration-aware ordering** + UI badges — **do not fork** new queue types |
| **Terminology** | Externally: **placement / priority cohort** language; internally code names can stay **`waitlisted`** status until product copy shifts — avoid introducing third terms (“waitlist subsystem”) |
| **Reuse** | **`waitlisted` status**, enrollment pipeline work unit, **`metadata.enrollment_operational`** for waiting facets (extend, don’t replace) |
| **Deprecate vs extend** | Extend **`QueueService`**; **deprecate Growth-only interpreter** for workspace surfaces once parity proven |
| **Safest migration** | Feature flag **per org** / profile metadata → **shadow-evaluate** (log diff vs `updated_at` sort) before flipping sort order |

---

## 7. Alignment checklist (Alloy doctrine)

- [ ] **Queues remain projections** — no lifecycle decisions from list payloads  
- [ ] **Resolver-first** — bucket membership + explanations computed server-side  
- [ ] **Config-driven UI** — labels/order from definition/metadata, not scattered React switches  
- [ ] **Workflow/event path** for mutations that matter  
- [ ] **Future-safe** — evaluator inputs allow capacity/ML as **additional signals**, not rewrites  
- [ ] **Single queue engine for placement** — **`QueueService`** only; **`resolveOpportunityQueueFromDefinition`** shimmed/migrated per Card **1** (**Card 0.5**)  

---

## References (in-repo)

- Queue truth boundary: `docs/system/workspace-system.md`, `docs/system/record-system.md`  
- Configuration doctrine: `docs/system/configuration-system.md`  
- Canonical enrollment queue definition: `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts`  
- Queue execution: `web/lib/queues/QueueService.ts`  
- Attention resolver + scoring: `web/lib/opportunities/opportunityAttentionResolver.ts`, `web/lib/opportunities/attentionPriorityScore.ts`  
- Explainability UX precedent: `docs/sprints/05_2026/enrollment_attention_phase1_gate_p1b_explainability_design.md`  
- Enrollment operational metadata: `web/lib/opportunities/enrollmentOperationalMetadata.ts`  

---

*End of architecture alignment document — implementation deliberately deferred pending review.*
