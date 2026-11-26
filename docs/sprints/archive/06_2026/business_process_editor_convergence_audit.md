# Business Process Editor Convergence Audit

**Sprint:** Business Process Configuration Convergence (June 2026)  
**Scope:** Stage operating plan editor — work items, work-scoped outcomes, attention rules, outcome automation visibility.

---

## Current vs target architecture

| Layer | Before | After (this sprint) |
|-------|--------|---------------------|
| Work | Text rows (label, required, due only) | Work **items** with name, description, required, due, **primary** flag |
| Outcomes | Flat stage list | **Attached to work items** in editor; legacy unattached outcomes preserved |
| Attention | Read-only seeded list + misleading copy | **Editable** rules stored in `stage_operating_plan_v1.attention_rules` |
| Outcome automation | Hidden in JSON | **Read-only summary** per outcome (`→ Move to qualification`, etc.) |
| Primary Work Intent runtime | Hardcoded per stage | **Primary work template** from saved plan when present; legacy map fallback |

---

## 1. Current stage editor structure

**Shell:** `LifecycleStageWorkspace.tsx` → sections: Membership, Stage Requirements, **Operating Plan**, Ready Check.

**Operating Plan (`LifecycleStageOperatingPlanEditor.tsx`):**
- Purpose (textarea)
- Journey (family / child)
- **Work items** (name, description, required, due days, primary radio)
- **Outcomes per work item** + legacy stage-level outcomes
- **Attention rules** (`LifecycleStageAttentionRulesEditor.tsx`)

---

## 2. `stage_operating_plan_v1` structure

**Module:** `web/lib/lifecycle/stageOperatingPlanV1.ts`  
**Storage:** `departments.metadata.lifecycle_builder_v1.processes[].stages[].stage_operating_plan_v1`

```typescript
StageOperatingPlanV1 {
  purpose?, journey_segment,
  work_templates[]  // + primary?, description
  outcomes[]        // + work_template_key?
  outcome_rules[]   // preserved; automation visibility only in editor
  attention_rules[] // + label, severity, template_key; new kinds
}
```

---

## 3–6. Sub-structure support matrix

| Section | Stored | Editor (after) | Runtime |
|---------|--------|----------------|---------|
| **work_templates** | ✓ | ✓ Full work item object | **Partial** — primary template drives spawn + Work Intent when saved on stage |
| **outcomes** | ✓ | ✓ Work-scoped + legacy | ✓ Stage outcomes still used in picker (unchanged) |
| **outcome_rules** | ✓ | Read-only automation lines | Partial — executor live; `move_to_stage` no-op |
| **attention_rules** | ✓ | ✓ Full editor | **Not evaluated** — config-only this sprint |

### Attention rule kinds (editor)

| Kind | Label |
|------|-------|
| `work_overdue` | Work overdue |
| `stage_age_exceeded` | Stage age exceeded |
| `missing_required_fields` | Missing required fields |
| `no_contact_attempt` | No contact attempt |
| `waiting_on_family` | Waiting on family |
| `waiting_on_provider` | Waiting on provider |

Legacy kinds (`tasks_without_success`, `days_without_success`, `required_work_overdue`) still parse; normalize to canonical kinds on save.

---

## 7. Runtime consumption

| Path | Behavior |
|------|----------|
| `resolvePrimaryWorkIntentForStage(stage, plan?)` | Primary work template → intent; else legacy stage map |
| `onStageEntrySpawnWorkIntent` | Loads explicit saved plan; spawns primary work |
| `projectWorkIntentRuntime` | Projects primary intent + stage outcomes |
| `executeStageOperatingOutcome` | Unchanged — runs `outcome_rules` on completion |
| Stage `attention_rules` evaluator | **Gap** — not implemented |

Org-wide Needs Attention (`opportunity_attention_rules`) remains separate.

---

## Proposed editor structure (implemented)

```
Stage
├── Purpose
├── Journey
├── Work Items[]
│   ├── Name, Description, Required, Due days
│   ├── Primary (one per stage)
│   └── Outcomes[]
│       ├── Label, Success flag
│       └── Automation summary (read-only)
├── Legacy stage outcomes (if any)
└── Attention Rules[]
    ├── Type, Label, Severity, Days threshold
    └── Optional work item scope (work_overdue)
```

---

## Lead stage usability test (configured in tests)

**Purpose:** Qualify inbound inquiries quickly.

**Primary work:** Review Inquiry (1 day due)

**Outcomes:** Qualified · Need More Information · Duplicate · Closed Lost

**Attention:** Work overdue 1 day · Stage age > 7 days

Verified in `stageOperatingPlanConvergence.test.ts` → persists and parses cleanly.

---

## Remaining gaps

1. **Attention rule evaluation** — stage `attention_rules` not wired to Needs Attention resolver
2. **Outcome rule editor** — operators cannot edit automation targets in UI
3. **Multiple work spawn** — only primary work spawns on stage entry
4. **Work-scoped outcomes in runtime** — picker still shows all stage outcomes
5. **Ready Check** — may not reflect full operating plan completeness

---

## Next convergence phase (recommended)

1. Wire `attention_rules` evaluator (bridge to `create_needs_attention` or org resolver)
2. Minimal outcome rule editor (status move + next work + no movement)
3. Filter Work Intent outcome picker to primary work item outcomes when scoped
4. Spawn required non-primary work via `create_next_work` or idempotent multi-spawn

---

## Screenshots

Not captured in this agent session. Manual QA: Business Process → select stage → Operating Plan section.
