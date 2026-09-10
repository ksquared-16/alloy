# 6. Creation Runtime Contract — Work Items V3 (Frozen)

**Status:** FROZEN  
**Principle:** ONE runtime, many presentations

---

## 6.1 Entry points (frozen)

All MUST call `beginWorkItemDraft({ entry_point, seed })`:

| Entry | Presentation | Seed |
|-------|--------------|------|
| Create Work Item (header/modal) | Full Create modal | Empty or prefilled |
| BOS right rail | Compact proposal card | NL utterance + entity context |
| Record BOS | Compact → expand | Record + stage |
| Command palette (future) | Compact or full | Parsed intent |
| BP assistance (future) | Full | department + template |
| Module integrations | Compact | Domain context |

**Forbidden:** `MyTasksCreateTaskCard` as independent commit path after Phase 2.

---

## 6.2 Pipeline stages (frozen)

```
1. INTENT      — operator NL or structured seed
2. RESOLVE     — entity, BP, due, assignee, category, follow_on
3. DRAFT       — WorkItemDraftV1 persisted (optional durable)
4. VALIDATE    — client + server rules
5. REVIEW      — operator inspects (compact or full)
6. APPROVE     — explicit Commit action
7. COMMIT      — POST operational-tasks (unified body builder)
8. RECEIPT     — BOS/thread confirmation + deep link
```

---

## 6.3 WorkItemDraftV1 (frozen)

See [03-architecture-contract.md](./03-architecture-contract.md) for full TypeScript contract.

**Invariants:**
- `schema_version: "1"` required
- `draft_id` stable across compact ↔ expanded
- `status` monotonic except `rejected` terminal
- `intent_text` preserved immutably after first set

---

## 6.4 Proposal contract

Compact presentation uses `BosProposalEnvelopeV1`:

| Envelope field | Draft source |
|----------------|--------------|
| `capability_key` | `"work_item_create"` |
| `title` | `draft.title` |
| `summary` | `draft.bos_explanations` |
| `primary_action` | Commit |
| `secondary_actions` | Edit in Create, Dismiss |
| `raw_payload` | Full `WorkItemDraftV1` |

**Persistence:** Extend `task_assist_proposals` with `kind: "work_item_draft_v1"` (Phase 2 default) OR sibling `work_item_drafts` table if isolation required.

| Alternative | Decision |
|-------------|----------|
| Reuse task_assist_proposals | **Preferred Phase 2** — one approval inbox |
| New drafts table | Acceptable if Task Assist coupling untenable |

---

## 6.5 Validation contract

| Rule | Severity | Phase |
|------|----------|-------|
| Title non-empty | Block commit | 1 |
| Assignee org member | Block commit | 1 |
| Due required for `category: follow_up` | Block or warn | 2 |
| Entity required when `link_mode: required` | Block commit | 1 |
| Follow-on due after primary due | Block commit | 2 |
| Recurrence RRULE valid | Block commit | 3 |

**Clarification loop:** Missing required fields → `work_item_clarification` turn OR inline chips — never silent defaults for assignee/due on commit.

---

## 6.6 Approval boundary (frozen)

| Action | Who | Effect |
|--------|-----|--------|
| Propose | BOS / resolver | Draft only |
| Edit draft | Operator | Draft update |
| Commit | Operator explicit click | Creates row |
| Dismiss | Operator | `status: rejected` |

**Aligns with D11:** No autonomous work creation.

---

## 6.7 Conversation continuity (frozen)

- Thread turns registered in `commandSurfaceThreadTypes.ts`
- `draft_id` in session persistence (`commandSurfaceThreadPersistence`)
- Commit appends `work_item_commit_receipt` turn with task id link

**Cross-surface:** Operator starts in rail → "Edit in Create" → same thread + draft loaded in modal.

---

## 6.8 Compact ↔ expanded transfer (frozen)

```
Rail: utterance → propose → compact card
                    ↓ Edit in Create
Modal: full thread (left) + live preview (right) bound to same draft_id
                    ↓ Commit (either surface)
              operational_tasks row created
```

**Idempotency:** Commit with same `draft_id` twice returns existing task (guard required).

---

## 6.9 Commit service contract

```typescript
commitWorkItemDraft(draft: WorkItemDraftV1): Promise<{
  operational_task_id: string;
  receipt: WorkItemCommitReceiptV1;
}>
```

Internally calls existing `createOperationalTask` / `createWorkInstance` — **no parallel insert logic**.

---

## 6.10 Deprecation

| Legacy | Sunset |
|--------|--------|
| Form-only create | Phase 2 — becomes Advanced tab on preview |
| Task Assist separate POST | Phase 2 — adapter to draft commit |
| `source: task_assist` only | Phase 3 — migrate display; keep compat reads |
