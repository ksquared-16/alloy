# Operational Work V1 Phase B — Work Definitions Implementation Plan

**Path:** `docs/sprints/archive/06_2026/operational_work_v1_phase_b_implementation_plan.md`  
**Date:** 2026-06-03  
**Status:** **Planning complete — no code, no migrations**  
**Scope:** Define how Work Definitions are introduced as configuration/policy that instantiates runtime work through `instantiateWork(...)`.

**Prerequisites (shipped):**

- [`operational_work_creation_model_discovery.md`](./operational_work_creation_model_discovery.md) — creation model frozen
- [`operational_work_framework_v1.md`](./operational_work_framework_v1.md) — framework abstraction
- [`operational_work_v1_implementation_plan.md`](./operational_work_v1_implementation_plan.md) — V1 roadmap
- **Phase A** — `operationalWorkService.instantiateWork(...)` with dedupe, provenance, metadata v1

**Frozen doctrine (do not redesign):**

```
Lifecycle → Readiness → Needs Attention → Operational Work → Actions → Automations → BOS
```

| Layer | Creates work? |
|-------|---------------|
| Readiness / Attention / BOS explain | **No** |
| Work Definition + `instantiateWork` | **Yes** |
| Workflow (Phase C+) | **Yes** — via `instantiateWork` |

**Authority:** Phase B coding PRs must follow §1–§10 unless product records an exception in §11.

---

## Executive summary

A **Work Definition** is **configuration** describing **how** to instantiate a durable obligation — not runtime truth. Runtime truth remains `operational_tasks` rows created only through **`instantiateWork(...)`**.

**Phase B smallest useful slice:**

1. **Platform catalog** (TypeScript) — stable keys, categories, defaults, dedupe policy, suggested actions
2. **Lifecycle metadata schema** (`lifecycle_work_definitions_v1`) — enable/disable, overrides, stage availability — **no new DB table**
3. **Definition resolver** — merge catalog + department metadata → effective definition
4. **Request builder** — `WorkDefinition` → `InstantiateWorkRequest` → `instantiateWork`
5. **Create modal definition picker** — operator selects definition or ad hoc; definitions call `instantiateWork`
6. **Read-only Lifecycle Builder card** (stretch / B4) — visibility only; full editor deferred to Phase B+

**Explicitly not Phase B:** recurring schedules, checklist shape, automation triggers, attention subscriptions, role/team assignee resolution, org-custom definition keys, workflow `instantiate_work`.

---

## 1. Work Definition canonical model

### 1.1 Definition

A Work Definition answers:

| Question | Field |
|----------|-------|
| What is this obligation type? | `key`, `display_name`, `description`, `outcome_intent` |
| What shape? | `default_shape` (Phase B: `"task"` only) |
| What category? | `category` (platform enum) |
| What title/due/assignee defaults? | `default_title`, `due_policy`, `assignee_policy` |
| What subjects are valid? | `allowed_subjects` |
| How do we prevent duplicates? | `dedupe_policy`, optional `period_key_policy` |
| What actions are suggested after create? | `suggested_action_keys[]` |
| Is it available? | `enabled` (effective, after org/lifecycle merge) |
| Where does it apply? | `scope` (platform / lifecycle / stage bindings) |

### 1.2 Canonical schema (Phase B)

```typescript
/** Platform-owned stable identity — never tenant-generated in Phase B. */
type WorkDefinitionKey = string; // snake_case, catalog-registered

type WorkDefinitionDuePolicy =
  | { kind: "offset_from_create"; days?: number; hours?: number } // default: +1 day
  | { kind: "none" }; // operator must set due in UI

type WorkDefinitionAssigneePolicy =
  | { kind: "record_owner" }      // opportunities.assigned_to when linked
  | { kind: "creator" }             // created_by user
  | { kind: "unassigned" }        // null assignee
  | { kind: "role"; role_key: string }; // schema only — NOT resolved in Phase B

type WorkDefinitionDedupePolicy =
  | "none"                          // manual_ad_hoc only
  | "definition_subject"            // default for catalog definitions
  | "definition_subject_period";    // future billing/recurrence — schema only Phase B

type WorkDefinitionAllowedSubject =
  | { entity_type: "opportunities" }
  | { entity_type: null };          // general unlinked work

/** Platform catalog entry — full definition template. */
type PlatformWorkDefinition = {
  key: WorkDefinitionKey;
  display_name: string;
  description: string;
  outcome_intent: string;
  default_shape: "task";            // Phase B literal
  category: WorkCategory;
  default_title: string;            // may include {{placeholders}} — Phase B: static only
  due_policy: WorkDefinitionDuePolicy;
  assignee_policy: WorkDefinitionAssigneePolicy;
  allowed_subjects: WorkDefinitionAllowedSubject[];
  dedupe_policy: WorkDefinitionDedupePolicy;
  suggested_action_keys?: string[];
  /** Platform default availability — org metadata may disable. */
  platform_enabled: boolean;
};

/** Effective definition after merge — what instantiate resolver uses. */
type EffectiveWorkDefinition = PlatformWorkDefinition & {
  enabled: boolean;
  /** Optional org/lifecycle overrides applied on top of catalog. */
  overrides?: {
    display_name?: string;
    default_title?: string;
    due_policy?: WorkDefinitionDuePolicy;
    assignee_policy?: WorkDefinitionAssigneePolicy;
  };
};
```

### 1.3 Fields evaluated but deferred in Phase B runtime

| Field | In schema | Phase B behavior |
|-------|-----------|------------------|
| `instantiation_policy` (auto/suggested/triggers) | Defined in discovery doc | **Not stored or evaluated** — Phase C |
| `aggregation_policy` (`aggregate_gaps`) | Defined in framework | **Not applied** — Phase D checklist |
| `recurrence` | Defined in framework | **Deferred** — Phase E |
| `role` assignee | In assignee_policy union | **Reject at resolve** if kind=role; fallback creator |
| `period_key_policy` | Optional on definition | **Not computed** unless caller passes periodKey |
| Custom org definition keys | — | **Rejected** — catalog keys only |

### 1.4 Relationship to runtime instance

| Plane | Stores |
|-------|--------|
| **Work Definition** | Policy + defaults |
| **Work Instance** (`operational_tasks`) | `work_definition_key`, resolved title/due/assignee, frozen `context_snapshot`, `provenance` |

Completing work does **not** mutate definitions. Definitions are versioned config, not runtime state.

### 1.5 Platform catalog seed keys (Phase B initial set)

| Key | Category | Purpose |
|-----|----------|---------|
| `manual_ad_hoc` | `other` | Freeform operator work — weak dedupe (already in Phase A) |
| `contact_family` | `follow_up` | General outreach |
| `follow_up_after_tour` | `follow_up` | Post-tour follow-up |
| `collect_missing_information` | `information_collection` | Gap collection (task-shaped until checklist Phase D) |
| `record_tour_outcome` | `coordination` | Tour outcome follow-through |
| `resolve_outstanding_balance` | `resolution` | Billing resolution (future domain) |

`friday_director_operational_review` — **catalog stub disabled** until checklist shape (Phase D).

---

## 2. Storage recommendation

### 2.1 Options evaluated

| Option | Pros | Cons | Phase B verdict |
|--------|------|------|-----------------|
| **Metadata only** | Matches readiness/NA patterns; no migration | Query/merge logic in code | ✅ **Primary org/lifecycle config** |
| **Seeded TS catalog** | Stable keys; code review; tests | Requires deploy to add keys | ✅ **Primary platform truth** |
| **Database table** | Queryable; admin CRUD | Premature; duplicates metadata pattern | ❌ **Defer** |
| **Lifecycle Builder metadata** | Operator-visible; dept-scoped | Needs parser + Builder UI | ✅ **Overrides + stage bindings** |
| **Department metadata (non-builder)** | Simple | Splits config surfaces | ⚠️ Use only via `lifecycle_work_definitions_v1` on lifecycle department |

### 2.2 Recommended Phase B storage model (hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM CATALOG (code)                                     │
│  web/lib/admin/operationalWork/platformWorkDefinitionCatalog.ts │
│  — keys, categories, defaults, dedupe, suggested actions     │
└────────────────────────────┬────────────────────────────────┘
                             │ merge
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  LIFECYCLE METADATA (departments.metadata)                   │
│  lifecycle_work_definitions_v1                               │
│  — enabled flags, overrides, stage_bindings                    │
└────────────────────────────┬────────────────────────────────┘
                             │ resolve
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  EffectiveWorkDefinition                                     │
└────────────────────────────┬────────────────────────────────┘
                             │ buildInstantiateRequest
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  instantiateWork(...) → operational_tasks                    │
└─────────────────────────────────────────────────────────────┘
```

**No schema migration.** Instance rows continue using existing `metadata` jsonb for `work_definition_key`, dedupe fields, provenance.

### 2.3 `lifecycle_work_definitions_v1` metadata shape (Phase B)

Stored on **lifecycle department** `departments.metadata` (same home as `lifecycle_builder_stage_field_rules_v1`):

```typescript
type LifecycleWorkDefinitionsV1 = {
  version: 1;
  /** Catalog key → org/lifecycle config. Omitted key = platform default enabled. */
  definitions: Record<
    WorkDefinitionKey,
    {
      enabled: boolean;
      display_name_override?: string;
      default_title_override?: string;
      due_policy_override?: WorkDefinitionDuePolicy;
      assignee_policy_override?: WorkDefinitionAssigneePolicy;
    }
  >;
  /** Which definitions appear for manual create when record is in this builder stage. */
  stage_bindings: Record<
    string, // builder_stage_key
    {
      available_definition_keys: WorkDefinitionKey[];
    }
  >;
  /** Phase C+ — triggers not evaluated in Phase B. */
  triggers?: never; // reserved; omit from parser acceptance in Phase B
};
```

**Parser rules:**

- Unknown keys in metadata → **ignored** (forward compat)
- Keys not in platform catalog → **ignored** with dev warning
- `version !== 1` → parse null; fall back to catalog-only

### 2.4 Why not a table yet

- Phase B volume is small (≤10 catalog keys)
- Lifecycle Builder already owns dept metadata patterns
- `instantiateWork` dedupe queries metadata on **instances**, not definitions
- Configuration roadmap audit targets Builder configurability in Phase 2 without new tables

**Revisit table** when: org-custom definitions (Phase 5+), cross-department reporting on definition config, or Builder CRUD exceeds metadata ergonomics.

---

## 3. Lifecycle scope model

### 3.1 Target model (long-term)

| Scope | Owns | Example |
|-------|------|---------|
| **Platform** | Catalog keys, categories, dedupe invariants | `follow_up_after_tour` |
| **Org / lifecycle (department)** | Enable/disable, overrides, stage bindings | Disable billing defs for childcare-only org |
| **Stage (builder_stage_key)** | Which defs offered in create picker | Tour stage → `record_tour_outcome`, `follow_up_after_tour` |
| **Runtime instance** | Snapshot assignee, due, context | Row in `operational_tasks` |

**Not scopes:** Needs Attention (signals only), Readiness (gaps only), Queue (preview only).

### 3.2 Phase B slice

| Scope | Phase B |
|-------|---------|
| Platform catalog | ✅ Full |
| Org/lifecycle enable + overrides | ✅ Metadata schema + merge |
| Stage bindings (manual picker filter) | ✅ When drawer/create has stage context |
| Stage-entry auto-instantiate | ❌ Phase C |
| Department (non-lifecycle) standalone | ❌ Bind to lifecycle department only |
| Global org Settings page | ❌ Defer — lifecycle dept metadata sufficient |

### 3.3 Resolution order

```
1. Load PlatformWorkDefinition from catalog by key
2. Load LifecycleWorkDefinitionsV1 from lifecycle department metadata
3. Apply definition-level overrides + enabled flag
4. If stage context provided, verify key ∈ stage_bindings[stage].available_definition_keys (or platform default allowlist)
5. Return EffectiveWorkDefinition or null (disabled / unknown / out of scope)
```

**Default when metadata absent:** All platform catalog entries with `platform_enabled: true` are available (no stage filter unless stage context passed).

---

## 4. Phase B implementation architecture

### 4.1 New modules (forecast)

```
web/lib/admin/operationalWork/
├── platformWorkDefinitionCatalog.ts    # PLATFORM catalog constants
├── lifecycleWorkDefinitionsConfig.ts   # parse lifecycle_work_definitions_v1
├── resolveWorkDefinition.ts            # catalog + metadata → EffectiveWorkDefinition
├── buildInstantiateRequestFromDefinition.ts  # EffectiveWorkDefinition → InstantiateWorkRequest
└── instantiateWorkFromDefinition.ts    # public: resolve + build + instantiateWork
```

**Rule:** UI and API call **`instantiateWorkFromDefinition`** (or `instantiateWork` with fully built request) — never bypass dedupe.

### 4.2 Layering

```
UI (create modal picker)
    ↓
instantiateWorkFromDefinition({ key, orgId, userId, subject, context, overrides? })
    ↓
resolveWorkDefinition(key, { departmentMetadata, stageKey })
    ↓
buildInstantiateRequestFromDefinition(definition, context)
    ↓
instantiateWork(request)   ← Phase A authority
    ↓
operational_tasks
```

### 4.3 Assignee resolution (Phase B)

| Policy | Resolution |
|--------|------------|
| `record_owner` | Load `opportunities.assigned_to` for linked subject; fallback `creator` if null |
| `creator` | `userId` from request |
| `unassigned` | `null` |
| `role` | **Not supported** — treat as validation warning; fallback `creator` |

### 4.4 Due date resolution (Phase B)

| Policy | Result |
|--------|--------|
| `offset_from_create` + `days: N` | `now + N days` (org timezone — use existing admin viewer TZ or UTC consistent with Phase A) |
| `offset_from_create` + `hours: N` | `now + N hours` |
| `none` | Require operator input in modal; reject instantiate if missing |
| Operator override in modal | **Wins** over definition default when provided |

### 4.5 Context snapshot (Phase B)

When creating from drawer/modal with readiness/attention attach available:

```typescript
context_snapshot?: {
  readiness_gap_ids?: string[];
  attention_reason_codes?: string[];
  lifecycle_stage_key?: string;
}
```

Frozen at instantiate — **read-only** on instance. Definitions do **not** auto-populate from evaluators; UI passes snapshot if available.

### 4.6 Suggested actions (Phase B)

- Copy `suggested_action_keys` from definition → instance metadata at create (already supported in metadata v1)
- **Display:** optional read-only CTA chips on work card / popover (PR B3 or B4) — links to existing action registry keys
- **Do not** auto-execute actions on create

---

## 5. Definition → instantiateWork mapping

### 5.1 Request construction

```typescript
function buildInstantiateRequestFromDefinition(params: {
  definition: EffectiveWorkDefinition;
  orgId: string;
  userId: string;
  subject: { entityType: "opportunities" | null; entityId: string | null };
  provenance: { source: "manual" | "task_assist_apply" | ... };
  /** Operator overrides from modal */
  titleOverride?: string;
  dueAtOverride?: string;
  assigneeOverride?: string | null;
  contextSnapshot?: OperationalWorkContextSnapshot;
  periodKey?: string | null;
}): InstantiateWorkRequest
```

**Mapping table:**

| Definition field | InstantiateWorkRequest field |
|------------------|------------------------------|
| `key` | `workDefinitionKey` |
| `default_shape` | `shape: "task"` |
| `category` | `category` |
| `default_title` (+ override) | `title` |
| `due_policy` (+ override) | `dueAt` |
| `assignee_policy` (+ override) | `assignedToUserId` |
| subject param | `subject` |
| computed fingerprint | `subjectFingerprint` (via builder helper) |
| `dedupe_policy` | `dedupePolicy` |
| `periodKey` param | `periodKey` |
| caller context | `contextSnapshot` |
| caller provenance | `provenance` |
| `suggested_action_keys` | copied into metadata via builder |

### 5.2 Provenance

| Entry path | provenance.source |
|------------|-------------------|
| Create modal + definition picker | `manual` |
| Task Assist apply with definition key | `task_assist_apply` |
| Future workflow | `workflow` (Phase C) |

Always include `created_by_user_id` in provenance metadata when available.

### 5.3 Dedupe

Definition-backed keys use **`definition_subject`** unless catalog specifies `definition_subject_period`.

Open-instance rule from Phase A applies unchanged — duplicate create returns `{ status: "deduped", existingWork }`.

### 5.4 Example: `follow_up_after_tour`

**Input context:** Opportunity drawer, tour stage, operator picks definition.

**Effective definition:** catalog entry, enabled, due +2 days, assignee `record_owner`.

**Built request:**

```typescript
{
  workDefinitionKey: "follow_up_after_tour",
  shape: "task",
  category: "follow_up",
  title: "Follow up after tour",
  dueAt: "2027-01-17T12:00:00.000Z",
  subject: { entityType: "opportunities", entityId: "<opp-uuid>" },
  assignedToUserId: "<record-owner-uuid>",
  dedupePolicy: "definition_subject",
  provenance: { source: "manual" },
  contextSnapshot: {
    lifecycle_stage_key: "tour",
    attention_reason_codes: ["tour_date_passed"], // if UI had attach
  },
}
```

**Result:** One open instance per opportunity for this definition; second attempt dedupes.

---

## 6. Phase B scope (validated smallest slice)

### 6.1 In scope

| Item | Notes |
|------|-------|
| Platform catalog (TS) | 5–6 enrollment-relevant keys + `manual_ad_hoc` |
| Metadata schema + parser | `lifecycle_work_definitions_v1` |
| Definition resolver | Catalog + metadata merge |
| `instantiateWorkFromDefinition` | Single service entry for definition-backed create |
| Create modal definition picker | Optional select; ad hoc remains default path |
| Stage-filtered picker | When lifecycle stage known from drawer context |
| Suggested action keys on instance metadata | Copied at create |
| Read-only Builder card | List enabled definitions + stage bindings (stretch) |
| Tests | Catalog, parser, resolver, request builder, dedupe integration |

### 6.2 Out of scope (confirmed deferrals)

| Item | Target phase |
|------|--------------|
| Recurring schedule / `period_key` automation | Phase E |
| Checklist shape + `aggregate_gaps` | Phase D |
| Automation triggers (`triggers[]`, stage-entry auto-create) | Phase C |
| Workflow `instantiate_work` action | Phase C |
| Attention subscriptions / NA auto-create | Phase C+ |
| Full Builder CRUD editor | Phase B+ (after read-only card) |
| Role/team/department assignee resolution | Phase B+ / C |
| Org-custom definition keys | Phase 5+ |
| BOS apply wiring to definition key | Phase B+ (Task Assist can pass key manually first) |
| My Work rename | Phase D |
| New API routes | Reuse POST `/api/admin/operational-tasks` with `work_definition_key` in body/metadata |
| DB migration | None |

### 6.3 Compatibility requirements

- **`manual_ad_hoc`** path unchanged — weak dedupe, freeform title
- Existing POST body without definition key → ad hoc behavior
- Phase A `instantiateWork` remains sole insert authority
- `createWorkInstance` may delegate to `instantiateWorkFromDefinition` when metadata contains known catalog key

---

## 7. UI recommendation

### 7.1 Primary placement: create work modal

**File:** `OpportunityRecordCreateWorkModal.tsx`, `MyTasksCreateTaskCard.tsx` (shared component preferred)

| Element | Phase B behavior |
|---------|------------------|
| Definition select | Optional dropdown: "Work type" — includes **Ad hoc** + enabled catalog definitions |
| Title / due / assignee | Prefilled from definition; operator may override |
| Stage filter | Drawer modal filters definitions by `stage_bindings` when stage known |
| My Tasks general create | All enabled definitions (no stage filter) + ad hoc |
| Submit | Calls `instantiateWorkFromDefinition` or API with `work_definition_key` |

**Copy:** Use definition `display_name` — not internal keys.

### 7.2 Secondary (stretch B4): read-only Lifecycle Builder card

**New card:** `LifecycleWorkDefinitionsCard.tsx`

- Lists platform catalog keys with enabled/disabled state from metadata
- Shows stage binding summary per builder stage
- Link to docs — **no inline CRUD in Phase B core**
- Matches `LifecycleNeedsAttentionCard` read-only link-out pattern initially

### 7.3 Explicitly not Phase B UI

| Surface | Reason |
|---------|--------|
| Queue row quick-create from definition | WU = record preview, not work queue |
| Needs Attention lane | Signals only |
| Hidden behind Builder only | Operators need modal picker without Builder edit |
| Action menu as primary | Actions execute; definitions configure create |
| Full suggested-action chip strip | Optional B3/B4 — not blocking |

### 7.4 UX placement audit alignment

- **My Tasks** label unchanged until checklist Phase D
- **Work strip** unchanged except create modal gains picker
- **Suggested action chips** on record work card — optional Phase B tail; read definition keys from instance metadata

---

## 8. Testing plan

### 8.1 Unit tests

| Module | Cases |
|--------|-------|
| `platformWorkDefinitionCatalog` | All keys unique; valid categories; no checklist-only defs enabled |
| `parseLifecycleWorkDefinitionsV1` | Valid v1; invalid version; unknown keys stripped; empty → null |
| `resolveWorkDefinition` | Catalog-only; disabled in metadata; overrides applied; unknown key → null |
| `resolveWorkDefinition` + stage | Key in binding → available; key out of binding → null |
| `buildInstantiateRequestFromDefinition` | Due offset; assignee policies; operator overrides win |
| `buildInstantiateRequestFromDefinition` | role assignee → fallback creator + warning |
| `instantiateWorkFromDefinition` | End-to-end with mocked supabase: created + deduped |

### 8.2 Integration / service tests

| Scenario | Expected |
|----------|----------|
| Definition create | Row has `work_definition_key`, dedupe fields, provenance |
| Duplicate definition + subject | `status: "deduped"` |
| Completed prior instance | New `created` allowed |
| Disabled definition | `rejected` / modal hidden |
| Ad hoc without key | `manual_ad_hoc`, dedupe `none` |
| API POST with `metadata.work_definition_key` | Routes through definition resolver |

### 8.3 Contract tests

| Surface | Assert |
|---------|--------|
| Create modal | Definition select present; calls instantiate path |
| Builder card (if shipped) | Read-only list; no save handler |

### 8.4 Regression

- Phase A instantiate tests remain green
- PR1–PR3 UI tests (assignee, complete, filters) unchanged
- Task Assist create still works (`task_assist` provenance)

### 8.5 Validation commands (forecast)

```bash
cd web && npm run test -- tests/admin/operationalWork/
cd web && npx tsc --noEmit
```

---

## 9. Risks / anti-patterns

| Risk | Anti-pattern | Mitigation |
|------|--------------|------------|
| **Definitions create work without instantiateWork** | Parser or Builder save inserts rows | All paths → `instantiateWorkFromDefinition` |
| **NA/readiness triggers in Phase B** | `triggers[]` evaluated early | Omit triggers from Phase B parser; Phase C only |
| **Role assignee half-implemented** | Silent wrong assignee | Explicit fallback + log; block role in Phase B UI |
| **Catalog key drift** | Metadata references unknown keys | Strict catalog registry; parser strips unknown |
| **Duplicate config systems** | Settings page + Builder + code | Single metadata key on lifecycle dept |
| **Checklist via task definition** | `collect_missing_information` spawns N tasks | One task per subject; aggregation Phase D |
| **Definition = action** | Auto-fire suggested actions | Copy keys to metadata only; operator executes |
| **Premature DB table** | CRUD before metadata pattern proven | Hybrid catalog + metadata first |
| **Stage binding confusion** | Stage queue membership vs definition filter | Document: bindings filter **picker**, not auto-create |
| **Breaking ad hoc** | Forcing definition on every create | Ad hoc remains first-class |

---

## 10. Recommended PR breakdown

### PR B1 — Platform catalog + resolver (no UI)

**Goal:** Config model in code; effective definition resolution.

| Work | Exit |
|------|------|
| `platformWorkDefinitionCatalog.ts` | 5–6 keys registered |
| `lifecycleWorkDefinitionsConfig.ts` parser | Tests green |
| `resolveWorkDefinition.ts` | Merge + stage filter |
| Export types from `operationalWork/index.ts` | tsc clean |

**No UI. No API change.**

---

### PR B2 — Instantiate from definition (service only)

**Goal:** Wire definitions to Phase A authority.

| Work | Exit |
|------|------|
| `buildInstantiateRequestFromDefinition.ts` | Due/assignee/title mapping |
| `instantiateWorkFromDefinition.ts` | Calls `instantiateWork` |
| Assignee resolver (record_owner, creator, unassigned) | Unit tests |
| `createWorkInstance` uses resolver when catalog key in metadata | Back-compat tests |

**No UI.**

---

### PR B3 — Create modal definition picker

**Goal:** Operator-facing definition selection.

| Work | Exit |
|------|------|
| Shared definition select component | Enabled defs + ad hoc |
| `OpportunityRecordCreateWorkModal` + `MyTasksCreateTaskCard` | Picker + prefill |
| Stage-filtered list in drawer context | When stage available |
| API POST accepts optional top-level or metadata `work_definition_key` | Route through B2 |
| Dedupe UX: toast when deduped | Non-blocking |

**Depends on:** B1, B2.

---

### PR B4 — Read-only Lifecycle Builder card (stretch)

**Goal:** Visibility before full editor.

| Work | Exit |
|------|------|
| `LifecycleWorkDefinitionsCard.tsx` | Lists catalog + enabled state |
| Seed `lifecycle_work_definitions_v1` on enrollment template (optional) | Demo parity |
| Docs link in card | No save |

**Depends on:** B1. **Does not block** B3.

---

### PR B5 — Builder enable/disable editor (Phase B+ / defer)

**Goal:** Operators tune definitions without code deploy.

| Work | Exit |
|------|------|
| Builder CRUD for `definitions[].enabled` + overrides | Save to dept metadata |
| Stage binding editor | Per builder stage multi-select |
| Ready check row (optional) | "Work definitions configured" |

**Defer** until B3 validated in production.

---

### PR sequence diagram

```
Phase A (shipped)
    instantiateWork + dedupe
         ↓
PR B1 — catalog + parser + resolve
         ↓
PR B2 — instantiateWorkFromDefinition
         ↓
PR B3 — create modal picker  ← operator value
         ↓
PR B4 — Builder read-only (optional)
         ↓
PR B5 — Builder editor (defer)
         ↓
Phase C — triggers + workflow instantiate_work
```

---

## 11. Open decisions (product sign-off before B1)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Initial catalog size | 4 vs 6 keys | **6 keys** per §1.5 |
| 2 | Default picker selection | Ad hoc vs last used | **Ad hoc** default |
| 3 | Stage binding strictness | Hide vs show disabled | **Hide** out-of-scope definitions |
| 4 | Role assignee in catalog | Include stub vs omit | **Include stub; fallback creator** |
| 5 | API `work_definition_key` location | Top-level POST field vs metadata only | **Top-level optional** + metadata compat |
| 6 | Deduped API response | 200 + flag (Phase A) vs 409 | **Keep 200 + `instantiate.status`** |
| 7 | B4 Builder card in Phase B | Ship vs defer | **Defer if B3 slips; not blocking** |
| 8 | Enrollment seed metadata | Seed stage bindings vs empty | **Seed enrollment lifecycle** with sensible bindings |
| 9 | Suggested action chips | B3 vs B4 vs defer | **Defer display to B4**; copy keys at create in B2 |
| 10 | Timezone for due offset | Viewer TZ vs org TZ vs UTC | **Match existing modal default** (admin viewer TZ) |

---

## Appendix A — API contract extension (forecast)

**POST `/api/admin/operational-tasks`** — additive optional field:

```typescript
{
  // existing fields...
  work_definition_key?: string;  // catalog key; omit = manual_ad_hoc
}
```

**Response when deduped (unchanged from Phase A):**

```json
{
  "ok": true,
  "task": { ... },
  "instantiate": { "status": "deduped" }
}
```

---

## Appendix B — Success criteria (planning sprint)

| Criterion | Status |
|-----------|--------|
| Work Definition canonical model | Yes — §1 |
| Storage recommendation | Yes — §2 |
| Lifecycle scope model | Yes — §3 |
| Phase B architecture | Yes — §4 |
| Definition → instantiateWork mapping | Yes — §5 |
| Phase B scope validated | Yes — §6 |
| UI recommendation | Yes — §7 |
| Deferred scope confirmed | Yes — §6.2 |
| Testing plan | Yes — §8 |
| Risks / anti-patterns | Yes — §9 |
| PR breakdown | Yes — §10 |
| No implementation / schema | Yes |

---

*End of Operational Work V1 Phase B plan — PR B1 may begin after §11 sign-off.*
