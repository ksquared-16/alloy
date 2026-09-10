# 3. Architecture Contract — Work Items V3

**Status:** FROZEN for implementation  
**Violations require explicit architecture review**

---

## 3.1 Layer contract

Implementations MUST respect this layering (top = presentation, bottom = persistence):

```
┌─────────────────────────────────────────────────────────────┐
│ L4 Presentation — Work Items module UI                       │
│  WorkItemsShell · Overview · Queue · Detail · Create views   │
├─────────────────────────────────────────────────────────────┤
│ L3 Work Item Creation Runtime (NEW)                          │
│  IntentResolution · WorkItemDraftV1 · Validation · Commit   │
├─────────────────────────────────────────────────────────────┤
│ L2 Operational Work Framework (EXISTING)                       │
│  operationalWorkService · metadata · dedupe · definitions    │
├─────────────────────────────────────────────────────────────┤
│ L1 Persistence (EXISTING — table names frozen Phase 1–3)    │
│  operational_tasks · task_assist_proposals · BP metadata     │
├─────────────────────────────────────────────────────────────┤
│ L0 Business Process Runtime (EXISTING — DO NOT REPLACE)       │
│  lifecycle_builder_v1 · operating plans · stage spawn        │
└─────────────────────────────────────────────────────────────┘
```

**Forbidden:** New layer that bypasses L2/L1 for work creation. Forbidden: client-side direct DB writes.

---

## 3.2 Core entity contract

**Canonical name (operator):** Work Item  
**Persistence (code):** `operational_tasks` row  
**Status machine:** `open` → `completed` | `canceled` (unchanged Phase 1–3)

### Required fields (existing)

| Field | Contract |
|-------|----------|
| `title` | Non-empty after commit |
| `org_id` | Scoped |
| `status` | Enum above |
| `assigned_to_user_id` | Nullable; assignee semantics below |
| `due_at` | Nullable; urgency derived |
| `entity_type`, `entity_id` | Optional record anchor |
| `source` | Creation provenance enum (extend only additively) |
| `metadata` | Operational Work Framework v1 jsonb |

### Metadata extensions (additive, Phase 2+)

`parent_work_item_id`, `folder_key`, `recurrence`, `follow_on[]`, `tags[]`, `priority`, `waiting_on`, `checklist_ref` — see [04-domain-model.md](./04-domain-model.md).

**Forbidden:** `work_item_type` enum column. **Forbidden:** parallel `work_items` table.

---

## 3.3 WorkItemDraftV1 contract

Single draft type for ALL creation entry points.

```typescript
interface WorkItemDraftV1 {
  draft_id: string;
  schema_version: "1";
  status: "draft" | "validated" | "approved" | "committed" | "rejected";
  intent_text: string;
  title: string;
  description?: string;
  due_at?: string;
  due_policy?: DuePolicyV1;
  assigned_to_user_id?: string;
  entity?: { type: string; id: string; label?: string };
  business_process?: { department_id: string; label?: string };
  stage_key?: string;
  work_definition_key?: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  tags?: string[];
  checklist_items?: ChecklistItemDraftV1[];
  recurrence?: RecurrenceDraftV1;
  follow_on?: FollowOnRuleV1[];
  provenance: {
    entry_point: WorkItemEntryPoint;
    bos_turn_id?: string;
    proposal_id?: string;
    seeded_entity?: boolean;
  };
  bos_explanations?: string[];
  validation_errors?: ValidationIssueV1[];
}

type WorkItemEntryPoint =
  | "work_items_create"
  | "bos_rail"
  | "record_bos"
  | "command_palette"
  | "bp_assist"
  | "module_integration";
```

**Invariant:** One `draft_id` may be presented in compact (BOS rail) and expanded (Create modal) simultaneously. Edits in either view mutate the same draft.

---

## 3.4 Creation pipeline contract

```
Intent → resolveIntent() → WorkItemDraftV1
       → validateDraft()  → validated | clarification required
       → operatorReview() → approved
       → commitDraft()    → operational_tasks row + receipt
```

| Stage | Owner | Side effects |
|-------|-------|--------------|
| Intent resolution | Server (+ client preview) | None on truth |
| Draft persistence | Server (proposal store) | Draft row only |
| Validation | Client + server | None on truth |
| Approval | Operator explicit action | None on truth |
| Commit | Server API | Creates `operational_tasks` |

**Forbidden:** Auto-commit on BOS propose. **Forbidden:** Separate commit paths per entry point.

---

## 3.5 API contract (additive evolution)

Phase 1: **No breaking API changes.** Existing routes remain.

Phase 2+ additive endpoints (names illustrative):

| Endpoint | Contract |
|----------|----------|
| `POST .../work-item/propose` | NL + context → `WorkItemDraftV1` |
| `PATCH .../work-item/drafts/:id` | Operator edits draft |
| `POST .../work-item/drafts/:id/commit` | Idempotent commit → task id |
| `GET .../operational-tasks?folder=&view=` | Scoped queue fetch |

Existing `POST /api/admin/operational-tasks` remains valid commit target; unified builder produces same body.

---

## 3.6 Queue architecture contract

Three-zone layout (widths may flex; zones frozen):

| Zone | Purpose |
|------|---------|
| Left rail | Folders · Views · Generators |
| Queue list | Search · filters · sort · rows |
| Detail | Selected Work Item · tabs · footer composer |

Shared row component contract: see [05-queue-doctrine.md](./05-queue-doctrine.md).

---

## 3.7 Integration contracts

### Business Process

- BP **generates** work via existing spawn paths
- Work Items **lists** rows with BP metadata
- Work Items **does not** evaluate stage transitions or outcome rules

### Current Work

- Current Work **projects** checklist/outcomes for open record
- Work Items detail **links** to record; optional read-only checklist projection
- Outcome completion **defaults to** Current Work API path

### BOS

- Capability key: `work_item_create`
- Envelope: `BosProposalEnvelopeV1` via adapter
- Apply policy: `human_approved_operational_api`

### Future modules

Any module that needs operator follow-up work MUST either:
1. Spawn `operational_tasks` through L2 framework with provenance metadata, OR
2. Register integration that produces `WorkItemDraftV1` for operator commit

**Forbidden:** Module-private task tables for operator execution.

---

## 3.8 Compatibility contract

| Layer | Phase 1–2 rule |
|-------|----------------|
| Table `operational_tasks` | Retain name |
| `source` values | Add `bos_work_item`; keep `manual`, `task_assist` |
| Events | Keep `adminv2:open-tasks-panel`; add alias |
| Task Assist | Adapter to `WorkItemDraftV1` until deprecated |
| React symbols | Rename presentation gradually (`MyTasks*` → `WorkItems*`) |

---

## 3.9 Test contract (implementation phases)

When touching queue/drawer runtime-sensitive paths, run AdminV2 doctrine test suite per workspace rules.

Minimum new tests:
- Draft validation unit tests
- Commit idempotency
- Folder/view membership rules
- Queue row mapper contract
- No false-empty during cold load

---

## 3.10 Non-goals (architecture)

- New workflow engine
- Replacing `lifecycle_builder_v1`
- Moving checklist authority out of operating plans
- Entity types beyond current grain without separate epic
- Billing obligation rows in `operational_tasks` without product decision
