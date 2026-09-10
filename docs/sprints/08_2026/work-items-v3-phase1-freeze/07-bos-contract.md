# 7. BOS Contract — Work Items V3 (Frozen)

**Status:** FROZEN  
**Aligns with:** Operational Expansion D11, `ai-platform.md`, `BosProposalEnvelopeV1`

---

## 7.1 Core rule (frozen)

> **BOS never silently creates work.**

BOS **proposes** structured work. The operator **reviews** and **approves**. The server **commits** through the operational tasks API.

---

## 7.2 Capability registration (frozen)

```typescript
{
  capability_key: "work_item_create",
  proposal_mode: "durable",
  apply_policy: "human_approved_operational_api",
  permission_keys: {
    propose: "work_items.create",
    apply: "work_items.create",
  },
}
```

Add to `bosCapabilityRegistry.ts` during implementation.

---

## 7.3 Lifecycle contracts

### Proposal lifecycle

```
utterance → routeCommandSurface → work_item_create specialist
         → resolveIntent → WorkItemDraftV1
         → persist proposal (optional)
         → render BosProposalEnvelopeV1 in thread
```

States: `draft` → `validated` → (`approved` | `rejected`)

### Conversation lifecycle

- Turns: operator message, BOS structured summary, clarification chips, compact card, receipt
- Scoped mode: `work_item_create` when Create modal open
- Entity seed from `GlobalAssistantEntityContext`

### Review lifecycle

- **Compact:** In-thread card with Commit / Edit in Create / Dismiss
- **Expanded:** Create modal preview pane (live draft binding)

### Commit lifecycle

```
operator Commit → validateDraft → commitWorkItemDraft()
               → operational_tasks insert
               → work_item_commit_receipt turn
               → optional queue refresh event
```

---

## 7.4 Entry points (frozen)

| Surface | Behavior |
|---------|----------|
| Work Items "Create & Ask BOS" | Opens full Create modal; empty draft |
| BOS rail (global) | NL → compact proposal |
| Record BOS ("Work with BOS") | Seed entity + stage |
| Queue detail footer | Seed follow-up from context |
| Task Assist legacy routes | Adapter → same draft pipeline |

**Routing:** When commitment intent detected, route to `work_item_create` **before** generic Task Assist task form.

---

## 7.5 Work Item detail BOS (frozen)

**BOS Summary box** (read-only):

- Input: work item + record snapshot + stage summary
- Output: suggested next step text
- **No mutation** without operator action

**BOS Insight card** (secondary):

- Contextual note (e.g. "Family interested in before care")
- Link: Open record

**Footer composer:**

- Seeds new `WorkItemDraftV1` for follow-on work OR posts note

---

## 7.6 Adapter contract

`workItemDraftToBosProposalEnvelope(draft) → BosProposalEnvelopeV1`

Required for compact presentation parity with other BOS capabilities.

---

## 7.7 Permissions (frozen)

| Action | Permission |
|--------|------------|
| Propose | `work_items.create` (or admin equiv) |
| Commit | `work_items.create` |
| Assign to other user | `work_items.assign` (optional Phase 3) |

Org `ai_policy` gates BOS propose features per existing AI platform rules.

---

## 7.8 Receipt contract

On successful commit:

```
✓ Work item created — {title} · Due {due_display}
  [Open in Work Items] [Open record]
```

Store `operational_task_id` in turn metadata for deep link.

---

## 7.9 Alternatives considered

| Alternative | Rejected |
|-------------|----------|
| BOS auto-creates low-risk tasks | Violates human-in-the-loop |
| Separate BOS backend for Work Items | Fragments creation runtime |
| Task Assist forever parallel | Two commit paths → drift |

---

## 7.10 Implementation implications

- Extend `commandSurfaceRouter.ts` with work-item intent signals
- Register thread turn kinds in `commandSurfaceThreadTypes.ts`
- Task Assist reminder cards produce `WorkItemDraftV1` (may still trigger comms capability separately)
