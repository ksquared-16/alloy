# 13. Open Questions — Product Decisions Required

**Status:** BLOCKING for implementation phases noted  
**Owner:** Product + Platform Architecture

These items are **intentionally not frozen**. Implementation phases that depend on them must wait for sign-off.

---

## 13.1 Queue & domain boundaries

### OQ-1: Billing obligation review in Work Items?

**Question:** Should billing obligation review queues (D8 — consequence lifecycle, not BP) appear inside Work Items modal or as a separate Billing workspace?

| Option | Implication |
|--------|-------------|
| A. Separate Billing workspace | Domain-owned queue; shares row grammar only |
| B. Folder inside Work Items | Unified operator inbox; cross-domain scope creep |
| C. Hybrid — link from Work Items Generators | Navigation only |

**Recommendation:** **A or C** — do not store obligation rows in `operational_tasks` without explicit decision.

**Blocks:** Phase 5 convergence planning

---

### OQ-2: Record-queue preview rows in Work Items?

**Question:** When record-queue artifacts appear in Work Items, are they read-only previews with "Open record" only, or can operators complete stage work inline?

| Option | Implication |
|--------|-------------|
| A. Preview only | Safe; preserves Current Work authority |
| B. Thin complete adapter | Faster inbox zero; duplication risk |

**Recommendation:** **A for Phase 5a**; revisit B with explicit thin-adapter spec.

**Blocks:** Phase 5

---

## 13.2 Creation & BOS

### OQ-3: Task Assist deprecation timeline?

**Question:** How long must Task Assist compact cards remain parallel to `work_item_create`?

| Option | Implication |
|--------|-------------|
| A. One release overlap | Faster convergence; regression risk |
| B. Two releases with flag | Safer; dual maintenance |

**Recommendation:** **B** — `work_items_bos_create` flag for one full phase.

**Blocks:** Phase 2 exit criteria

---

### OQ-4: Follow-on behavior ("If not completed…") scope?

**Question:** Is follow-on declarative metadata on the primary work item sufficient, or must Phase 2 auto-spawn child work items on miss?

| Option | Implication |
|--------|-------------|
| A. Declarative only in v1 | Operator/manual trigger on miss |
| B. Auto-spawn on miss | Requires scheduler/worker |

**Recommendation:** **A for Phase 2**; **B for Phase 4** with recurrence infrastructure.

**Blocks:** Phase 2 Create modal "If not completed" panel behavior

---

### OQ-5: Reminder + comms side effects?

**Question:** When BOS creates a follow-up with SMS/email reminder, is that one commit (work item + comms schedule) or two capabilities?

| Option | Implication |
|--------|-------------|
| A. Single draft, multi-capability commit | Complex commit service |
| B. Work item first; BOS proposes comms second | Simpler; two-step UX |

**Recommendation:** **B** — aligns with one capability per envelope.

**Blocks:** Phase 2 reminder intent routing

---

## 13.3 Data & permissions

### OQ-6: `work_items.assign` permission?

**Question:** Can all work_items users assign to others, or is assign-to-others restricted?

**Recommendation:** Restrict assign-to-others to lead/admin roles; default assignee = self.

**Blocks:** Phase 3 assignment UX

---

### OQ-7: Folder config ownership?

**Question:** Who can create org folders — org admin only or department leads?

**Recommendation:** Org admin (`work_items.admin`); department-scoped folders Phase 6+.

**Blocks:** Phase 3 folder management UI

---

### OQ-8: Entity types beyond opportunities?

**Question:** When can Work Items link to persons, children, locations?

**Recommendation:** Phase 5+ grain expansion epic; opportunities only until API generalized.

**Blocks:** Multi-entity create/draft seeds

---

## 13.4 UX & terminology

### OQ-9: Nav label "Work" vs "Work Items"?

**Question:** Left nav shows "Work" but modal title "Work Items" — confirm or unify?

**Recommendation:** Keep **Work** (nav) + **Work Items** (modal) per operational-workspace-shell pattern (Communications/Inbox).

**Blocks:** Phase 1 copy

---

### OQ-10: Overview continue cards — live counts?

**Question:** Must overdue/waiting counts on Overview be real-time or session-cached?

**Recommendation:** Session-cached from last queue fetch; no separate KPI API Phase 1.

**Blocks:** Phase 1 Overview

---

## 13.5 Recurring & projects

### OQ-11: Recurring checklist — standalone or BP-linked?

**Question:** Weekly classroom checklist — standalone schedule template or stage operating plan link required?

**Recommendation:** Support both; `checklist_ref` optional on template.

**Blocks:** Phase 4 template schema

---

### OQ-12: Project auto-complete?

**Question:** When last child completes, auto-prompt to complete project parent?

**Recommendation:** Yes — non-blocking prompt only.

**Blocks:** Phase 5 projects

---

## 13.6 Technical

### OQ-13: Draft persistence table?

**Question:** Extend `task_assist_proposals` vs new `work_item_drafts` table?

| Option | Tradeoff |
|--------|----------|
| Extend proposals | Unified approval inbox; schema coupling |
| New table | Clean separation; duplicate lifecycle code |

**Recommendation:** Extend proposals Phase 2; split only if coupling causes production issues.

**Blocks:** Phase 2 schema design (first migration)

---

## 13.7 Sign-off checklist

- [ ] OQ-1 Billing queue placement
- [ ] OQ-2 Record preview complete behavior
- [ ] OQ-3 Task Assist deprecation timeline
- [ ] OQ-4 Follow-on auto-spawn scope
- [ ] OQ-5 Reminder/comms commit model
- [ ] OQ-6 Assign permission
- [ ] OQ-7 Folder admin scope
- [ ] OQ-8 Entity grain timeline
- [ ] OQ-9 Nav terminology
- [ ] OQ-10 Overview count freshness
- [ ] OQ-11 Recurring checklist model
- [ ] OQ-12 Project auto-complete
- [ ] OQ-13 Draft persistence table

**Phase 1 (terminology + Overview) may proceed after OQ-9 and OQ-10 only.**

**Phase 2 requires OQ-3, OQ-4, OQ-5, OQ-13.**

**Phase 3 requires OQ-6, OQ-7.**

**Phase 5 requires OQ-1, OQ-2, OQ-8.**
