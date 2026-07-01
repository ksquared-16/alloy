# Phase 1 — GATE P1-A: UX audit & surface mapping

**Status:** Complete — **STOP for approval** before P1-B (explainability design) and P1-C (implementation).  
**Sprint:** [`enrollment_operational_attention_v2_sprint.md`](./enrollment_operational_attention_v2_sprint.md)  
**North star:** Operators understand *why*, *what matters*, *what’s waiting*, *confidence*, and *next step* — calmly, without overwhelming density.

---

## 1. Executive summary

| Finding | Severity |
|--------|----------|
| **Drawer has no resolver-backed attention payload** | **Critical gap** — `GET …/entity/opportunities/:id` does not call `resolveOpportunityAttention`; explainability cannot be drawer-first until the entity surface attaches (additive) resolver output or an equivalent server-computed block. |
| Queue CRM-compact rows show **primary label only** | Medium — `_attention_reasons_detail`, waiting, score, SLA tiers, and `sla_clock_confidence` are **unused** in UI. |
| **Attention reason line + activity stale** can feel like **two competing “why stale” signals** | Medium — cognitive load / duplication risk (resolver vs activity signal). |
| **OpportunityAttentionLaneBlock** groups previews by **primary label** while histogram APIs use **multi-reason counts** | Medium — semantic mismatch risk unless copy/tooltips clarify (execution doc partially addresses histogram). |
| Department KPI / tab counts | Low–medium — rely on summaries; saturation honesty exists in payloads but **not always surfaced in UI chrome**. |

**Strategic implication:** Phase 1 explainability **must** include a **server-side bridge** for the drawer (entity GET or dedicated lightweight endpoint) so React remains a **pure presenter** of resolver truth — consistent with architectural rules.

---

## 2. Surface inventory

### 2.1 Enrollment work-unit queue (primary operational list)

| Location | Component / path | What operators see today | Resolver-backed? |
|----------|------------------|---------------------------|------------------|
| Row preview (CRM compact) | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` → `CrmCompactQueuePreview` | Title, stage/status pill, next step strip, commercial line, **`attentionReason`** (single string = `_attention_reason_label`), **`activityStale`** chip, fact groups, notes footer | Partial — label only; **no** multi-reason, waiting, score, SLA, confidence |
| Row urgency chrome | Same | `urgencyTier` from queue meta (`critical` / `warning` for attention lane) | Lane-level, not per-row resolver severity |
| Semantic slots source | `web/lib/workspace/viewModels/enrollmentWorkUnitViewModel.ts` → `buildEnrollmentCrmRowSemanticSlots` | Populates `attentionReason`, `activityStale`, lifecycle, notes | Uses `_attention_reason_label` only |
| Work-unit page row assembly | `web/app/adminV2/workspace/dept/.../work-unit/.../page.tsx` | Maps queue JSON → `semanticCrmCompact` including `attentionReason` | Same |

### 2.2 Department enrollment workspace

| Location | What operators see | Notes |
|----------|---------------------|--------|
| `OpportunityAttentionLaneBlock` | Title, total, “Open queue”, grouped **counts by primary label** (first 6 groups) | Uses `_attention_reason_label` only; **does not** use `_attention_reasons_detail` or histogram payload |
| `WorkspaceRenderer` | Places attention lane blocks | No resolver detail |
| Department overview KPIs | `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` | Needs-attention **sums** across work units — cohort/cap semantics documented elsewhere; UI may not echo disclaimer |

### 2.3 Legacy / alternate queue previews

| Location | Notes |
|----------|--------|
| `web/components/admin/workspace/blocks/QueueBlock.tsx` | `OpportunityQueueInlinePreview` — concatenates `_attention_reason_label`, activity line, **`stale_signal`** text with `[severity]` prefix — dense single subline |
| `web/components/admin/workspace/blocks/QueueBlock.tsx` | Job/opportunity rows — attention label where present |

### 2.4 Opportunity drawer (record chrome)

| Location | What operators see today | Resolver v2 |
|----------|---------------------------|-------------|
| `AdminEntityDrawer` + `GET /api/admin/entity/opportunities/:id` | Lifecycle, workflow sections, fields from layout — **no dedicated “Operational attention” panel** | **`respondOpportunityEntityGet`** (`web/lib/admin/opportunityEntityRecord.ts`) — **no** `resolveOpportunityAttention` import or attachment |
| `EntityDrawerOverview` | Generic overview fields + opportunity-specific relationship readers | No attention explainability block |

**Conclusion:** The **drawer is the largest explainability gap** relative to Phase 1 north star.

### 2.5 Filters / deep links

| Mechanism | Implementation |
|-----------|----------------|
| `attention_reason_code` | Work-unit page filters rows by primary code or any code in `_attention_reasons_detail` |
| Legacy `attention_reason` | Label match |
| Enrollment VM links | Prefer `attention_reason_code` where known |

---

## 3. Resolver payload field usage matrix

Fields produced by QueueService / `buildOpportunityAttentionQueueItems` (when enrichment runs):

| Field | Queue list/workspace JSON | CRM compact UI | Drawer entity GET |
|-------|---------------------------|----------------|-------------------|
| `_attention_reason` | ✅ (filter/code) | ❌ not shown | ❌ |
| `_attention_reason_label` | ✅ | ✅ single line | ❌ |
| `_attention_severity` | ✅ in API | ❌ not surfaced as hierarchy | ❌ |
| `_attention_priority_score` | ✅ | ❌ | ❌ |
| `_attention_priority_breakdown` | ✅ | ❌ | ❌ |
| `_attention_waiting_bucket` | ✅ | ❌ | ❌ |
| `_attention_reasons_detail` | ✅ | ❌ | ❌ |
| `attention_reason_counts` | ✅ API | Partial — lane block uses **label grouping**, not full histogram payload | N/A |

---

## 4. Duplication, noise, and hierarchy issues

1. **Dual “staleness” signals:** Resolver reasons (e.g. mid-funnel stale) can coexist with **`activityStale`** / **`stale_signal`** presentation — operators may read two unrelated notions as one. Needs **explicit differentiation** in copy (lifecycle vs last activity signal).

2. **Primary-only row line vs multi-reason truth:** Rows imply **one** reason string; resolver knows **many**. Risk: **false simplicity** — acceptable only if **drawer + expand** completes the story (progressive disclosure).

3. **Attention footer stress styling:** `noteStress = Boolean(attentionReason)` footers get `--stress` — links attention to **notes** chrome; verify this still matches product intent when explainability moves to a dedicated panel.

4. **Lane grouping vs histogram:** Lane block mini-groups are **not** the same as `attention_reason_counts` (multi-reason). Product copy should avoid implying they match without qualification.

5. **Missing hierarchy:** No consistent **blocked / waiting / aging / urgent** visual language at row level — only generic urgency tier + text line.

---

## 5. Opportunities for progressive disclosure (proposal sketch — P1-B detail)

| Level | Proposed content | Surfaces |
|-------|------------------|----------|
| **L0 (scan)** | Primary operational headline + calm severity/waiting indicator + one “next step” clue | Queue row |
| **L1 (expand row / chip)** | “+N reasons”, waiting bucket label, non-numeric urgency | Queue row |
| **L2 (drawer panel)** | Full `reasons[]` with SLA tier + **confidence copy**, waiting facet, score **summary** (tiered language, not raw number first), deterministic next-step hints | Drawer |
| **L3 (detail)** | `priority_breakdown` dimensions, raw codes for support | Drawer expandable / admin |

*Detailed UX spec belongs in **P1-B** after approval of this audit.*

---

## 6. Backend prerequisite for drawer-first (non-UI rule)

To avoid a **second attention engine** and UI-only logic:

- Extend **`respondOpportunityEntityGet`** (or a narrowly scoped additive include) to attach something like `_operational_attention: OpportunityAttentionResult` (or a slim public projection), computed with the same **`resolveOpportunityAttention`** + **`resolveOpportunityAttentionConfigFromMetadata`** sourced from **work unit / department** metadata as queue paths (precedence rule must be defined — **P1-B**).

Alternatively: drawer fetches existing queue row snapshot — fragile if opened from non-queue contexts. **Server attachment on entity GET is preferred.**

---

## 7. Performance & cognitive-load considerations (audit-only)

- **Drawer:** One extra resolver evaluation per opportunity open — acceptable; cache per request; reuse status defs already loaded where possible.
- **Queue:** Avoid re-running resolver per render; data already on row JSON — Phase 1 should **consume**, not recompute.
- **High-volume queues:** Row must stay **compressed**; expansion must be **optional** and cheap.

---

## 8. Unresolved UX questions (for P1-B)

1. **Config source for drawer resolver:** When opportunity opens outside a clear work-unit context, which **`opportunity_attention_rules`** apply (org default, department of record, work_unit_id on row)?
2. **Should row show waiting bucket** even when primary reason is stale (multi-signal compression)?
3. **Score presentation:** Confirm **tiered language only** at L0/L1 (e.g. “High priority” / “Needs review soon”) — numeric score deferred to L2/L3?
4. **Mobile / narrow:** Drawer panel stacks; queue row may collapse fact groups — breakpoint behavior?
5. **Empty states:** Opportunity **not** needing attention — hide panel vs collapsed “No operational exceptions”?

---

## 9. GATE P1-A deliverables checklist

- [x] Queue row / lane / drawer / tooltip-adjacent surfaces mapped  
- [x] Duplication & noise called out  
- [x] Unused resolver fields identified  
- [x] Drawer backend gap flagged  
- [x] Progressive disclosure direction sketched  
- [x] Open questions listed  

---

## 10. Recommendation — next step (GATE P1-B)

Upon approval of **P1-A**:

1. Lock **drawer data contract** (entity GET attachment + config precedence).  
2. Produce **wire-level design** for explainability panel + row compression rules + confidence copy patterns + next-step template mapping (deterministic).  
3. Provide **ASCII / structured examples** for dense queue + drawer (screenshots can follow in P1-C).

**Do not implement P1-C until P1-B is approved.**

---

## 11. Mockup placeholders (text-only examples for review)

**Queue row L0 (needs_attention lane, calm):**

> **Rivera family** · `Qualified · Contacted`  
> **Needs review** · Waiting on staff · +2 factors  
> *Next: Complete follow-up*

**Drawer L2 (panel header):**

> **Operational attention**  
> Primary: Waiting on staff (high)  
> Also: Mid-funnel stale · Follow-up date passed  
> SLA: Approaching · Timing: based on explicit wait start *(confidence: high)*  
> *Suggested: Log outreach outcome or reschedule*

*(Illustrative — final copy in P1-B.)*
