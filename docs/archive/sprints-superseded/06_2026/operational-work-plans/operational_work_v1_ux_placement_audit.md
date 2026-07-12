# Operational Work V1 — UX & Placement Audit

**Path:** `docs/sprints/archive/06_2026/operational_work_v1_ux_placement_audit.md`  
**Date:** 2026-06-03  
**Status:** **UX audit frozen — design only** (no implementation)  
**Scope:** Determine where Operational Work should appear across Alloy before PR2+ UX delivery.

**Canonical inputs (frozen):**

- [`operational_work_framework_v1.md`](./operational_work_framework_v1.md)
- [`operational_work_v1_implementation_plan.md`](./operational_work_v1_implementation_plan.md)
- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)

**Prerequisite:** PR1 (`operationalWorkService` facade) is complete. This audit informs PR2–PR6 UX only.

**Authority:** Product and engineering should align PR2 UX work to §4–§10 placement models unless §12 records an explicit exception.

---

## Executive summary

Operational Work answers **“What should I do?”** It must not be confused with **Work Units** (record views), **Needs Attention** (risk awareness), **Readiness** (advancement gates), **Actions** (execution), or **BOS** (judgment).

**Locked placement doctrine:**

| Layer | Question | Primary surface |
|-------|----------|-----------------|
| **Readiness** | Can the record advance? | Drawer Required Information panel |
| **Needs Attention** | What risk exists? | Dept NA lane, queue row badge, drawer attention strip |
| **Operational Work** | What should happen? | **My Work** (org queue) + **record work strip** (scoped obligations) |
| **Actions** | How do I execute? | Drawer header / overflow, queue row, preflight |
| **BOS** | What should I prioritize / why? | Review Assist band — routes to work + actions |

**Primary recommendation:** Operational Work lives in **two homes** — never three, never zero:

1. **Workspace shell — “My Work”** — assignee-centric obligation queue (today: My Tasks modal)
2. **Record shell — “Work on this record”** — compact open-work chips + create/complete (today: operational strip)

Everything else **links inward** (BOS handoff, NA resolution hints, queue subtle indicators) — it does not duplicate full work lists.

---

## 1. Operational Work UX audit (current state)

### 1.1 Surface inventory

| Surface | Location | What appears today | Domain | Gate / notes |
|---------|----------|-------------------|--------|--------------|
| **My Tasks modal** | Top nav (`TopNavBar`, `MyTasksModal`) | Org-wide open/overdue work list, create, complete | Work | `isTaskAssistV1UiEnabled()` |
| **My Tasks page** | `/adminV2/tasks` | Same panel full-page | Work | Same gate |
| **Nav badge** | `OperationalTasksNavBadge` | Open/overdue counts | Work | Deferred prefetch |
| **Operational compact strip** | Drawer header / inquiry summary (`OpportunityOperationalCompactStrip`) | Task chips, scheduled-send chips, BOS handoff card | Work + comms + BOS | Task Assist gate |
| **Task detail popover** | Strip chip click | Complete, edit due, cancel | Work | — |
| **Inquiry summary task preview** | Right column (`OpportunityInquirySummaryRightColumn`) | Read-only open-task chips (max 6) | Work preview | Bootstrap |
| **Operational tasks section** | Drawer body (`OpportunityOperationalTasksSection`) | Full task list (secondary mount) | Work | Often hidden |
| **Drawer header attention** | `DrawerHeaderAttentionBlock` | Readiness summary **or** BOS review assist entry | Readiness / BOS | — |
| **Operational attention strip** | `OperationalAttentionHeaderStrip` | NA reasons, waiting facet, Review Assist band | Attention + BOS | Deferred section |
| **Required Information panel** | `OpportunityDrawerRequiredInformationPanel` | Readiness gaps by level | Readiness | Bootstrap optional |
| **Action preflight panel** | `ActionPreflightBlockedPanel` | Enforced readiness blockers | Readiness gate | On action |
| **Header actions** | `OpportunityDrawerHeaderActionsMenu` | Registry actions (`create_task`, send form, etc.) | Actions | Placements |
| **BOS drawer CTA** | `BosDrawerAssistCta` | Open orchestrator / Task Assist | BOS | — |
| **Task Assist workspace** | Command bar / AI surface | Draft comms, create reminder proposals | BOS proposal → work | Task Assist |
| **Needs Attention lane** | Dept workspace right rail | Bucket chips + filtered queue | Attention overlay | Not work rows |
| **WU queue rows** | `QueueBlock`, work-unit page | Record previews + attention styling | Queue membership | `_needs_attention` badge |
| **NA deep link** | `/needs-attention` | Job exceptions (`AttentionBlock`) | Attention (home-services) | Parallel grain |
| **Packet needs attention** | Forms review (`NeedsAttentionPanel`) | Packet linkage issues | Domain-specific NA | Not platform work |
| **Legacy admin dashboard** | `/admin/dashboard` | Ops attention counts | Legacy | Outside AdminV2 |

### 1.2 Current behavior patterns

**Work is split across two operator mental models:**

- **“My follow-ups”** — top-nav My Tasks (assignee queue)
- **“This record’s reminders”** — drawer strip chips (record-scoped)

**Attention is split across three:**

- **Lane/bucket** — dept NA overlay
- **Row badge** — subtle styling on pipeline queues
- **Drawer strip** — explainability + Review Assist

**BOS overlaps work and actions:**

- Review Assist “Do next” reads like a task title
- Orchestrator handoff seeds Task Assist reminder creation
- `create_task` registry action opens My Tasks — not record create

**Scheduled sends share the operational strip with tasks** — correct separation at urgency layer (`taskAssistOperationalUrgency.ts`) but visually co-located.

### 1.3 Duplication

| Duplication | Where | Problem |
|-------------|-------|---------|
| Task preview vs strip vs section | Inquiry summary, compact strip, `OpportunityOperationalTasksSection` | Three list depths for same data |
| Attention vs readiness vs BOS “Do next” | Header block, attention strip, review assist | Operators see three “what’s wrong” surfaces |
| `next_follow_up_at` vs task chips | Metadata field + operational strip | Two follow-up signals |
| My Tasks vs `create_task` action | Panel open vs operator expectation of inline create | Action inventory mismatch |
| NA lane vs work queue | Both feel like “to-do lists” | Conceptual collision |

### 1.4 Confusion

| Confusion | Cause |
|-----------|-------|
| “Is Needs Attention my task list?” | NA lane lists **records**, not obligations |
| “Did sending the message complete my task?” | Comms scheduled sends adjacent to human tasks |
| “Why doesn’t Create Task create a task?” | Opens global panel |
| “Where did tasks go?” | Task Assist feature gate hides entire work UX |
| “Review assist vs attention vs readiness” | Three header-adjacent bands with similar urgency copy |

### 1.5 Opportunities

| Opportunity | Benefit |
|-------------|---------|
| Unified **My Work** shell with filters (mine / overdue / unassigned) | Single assignee home for all shapes later |
| Record **Work** strip decoupled from Task Assist gate | Core ops not blocked by AI flag |
| Clear vertical stack: Readiness → Attention → Work → Actions | Matches frozen doctrine stack |
| BOS routes to work create modal with prefill | Closes recommend → act gap |
| Queue row: attention badge only, optional “has open work” dot | Awareness without obligation list |
| Separate **comms schedule** from **human work** visually in strip | Reduce domain confusion |

---

## 2. Placement recommendations (canonical model)

### 2.1 The two-home rule (locked)

Operational Work appears in **exactly two primary placements**:

```
┌─────────────────────────────────────────────────────────────┐
│  WORKSPACE SHELL — My Work                                   │
│  “What am I personally responsible for?”                     │
│  Assignee-filtered · cross-record · due-ordered              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  RECORD SHELL — Work on this record                          │
│  “What obligations exist on this entity?”                    │
│  Open items · create · complete · suggested actions          │
└─────────────────────────────────────────────────────────────┘
```

**Not primary homes:** WU queue rows, NA lane, BOS band, readiness panel, dashboard widgets (until Phase 6 intelligence).

### 2.2 Record drawer vertical stack (recommended)

Top to bottom on opportunity drawer (and future entity drawers):

```
┌ Header ─────────────────────────────────────────────────────┐
│ Identity · Status · [Actions ▾] · [BOS assist]              │
│ [Attention summary — compact, if flagged]                   │
└─────────────────────────────────────────────────────────────┘
┌ Above-fold body ────────────────────────────────────────────┐
│ Inquiry summary / identity blocks                           │
│ ┌ Work strip ─ open obligations (chips) + [+ Work]           │
│ ┌ Review Assist — BOS judgment (if present)                  │
│ ┌ Required Information — readiness gaps (if present)         │
│ └ Operational attention panel — multi-reason depth (deferred)│
└─────────────────────────────────────────────────────────────┘
```

**Order rationale:** Attention (why flagged) may appear in header; **Work** (what to do) before **Readiness** (what’s missing for advance) — operators act on work even when readiness incomplete; readiness remains visible but does not masquerade as work.

### 2.3 What never hosts work lists

| Surface | Role | Work placement |
|---------|------|----------------|
| **WU queue rows** | Record selection | ❌ No task rows; optional dot/badge only |
| **NA lane** | Risk overlay on records | ❌ No obligation rows |
| **Readiness panel** | Gap evaluation display | ❌ No work CRUD |
| **BOS Review Assist** | Judgment + routing | ❌ Not work inventory |
| **Lifecycle Builder** | Config | Definitions only (Phase 2+) |

---

## 3. Record-level work model

### 3.1 By entity grain (V1 → future)

| Entity | V1 (today) | Recommended record work placement |
|--------|------------|----------------------------------|
| **Opportunity** | Full strip + preview | **Work strip** above Review Assist; create modal from strip + actions |
| **Person / Child** | No dedicated work UI | Phase 5+: same strip pattern when subject linkage expands; until then link via opportunity |
| **Customer / Account** | None | Phase 5 billing: work strip on account drawer |
| **Document** | Packet review NA panel | Phase 5: work item “Resolve missing documentation” on doc/packet surface — not mixed with packet NA list |
| **Job** (home services) | Separate attention block | Future: parallel work strip; do not merge with opportunity model in V1 |

### 3.2 Visibility timing

| Question | Recommendation |
|----------|----------------|
| Should work be visible immediately? | **Yes** — open-work chips in above-fold strip when count > 0 |
| Should work be a section? | **Compact strip default**; expandable list only when >3 items or operator expands |
| Near attention? | **Adjacent, not merged** — attention explains; strip holds obligations |
| Near actions? | **Below header actions** — actions execute; strip tracks |

### 3.3 Record work strip contents (canonical)

| Element | Included |
|---------|----------|
| Open work chips (title + due urgency) | ✅ |
| Create work control | ✅ PR2 |
| Complete / edit via popover | ✅ existing |
| Scheduled sends | ⚠️ Keep adjacent but **visually grouped separately** (“Scheduled messages”) |
| Suggested action chips | ✅ Phase 2 — from work definition metadata |
| Full work history | ❌ — My Work filters / record expand |

### 3.4 Empty states

- **No open work:** Hide strip section entirely (existing `operationalStripShowEmptyState` pattern) — do not show “No tasks” above fold
- **BOS recommends work not yet created:** Show in Review Assist only until operator creates instance

---

## 4. Workspace-level work model

### 4.1 “My Work” vs “My Tasks”

| Phase | Operator label | Rationale |
|-------|----------------|-----------|
| **PR2–PR3** | **My Tasks** (keep) | Task-shaped only; renaming adds noise before checklists |
| **PR4+** | **My Work** | Checklist + recurring shapes ship; label matches framework |
| **Long-term** | **My Work** | Canonical shell name in top nav |

Subtitle evolution:

- Today: *“Follow-ups and reminders across your workspace”*
- Future: *“Your operational obligations”*

### 4.2 My Work shell capabilities (roadmap)

| Capability | PR2 | Later |
|------------|-----|-------|
| Open / overdue / due today filters | ✅ | — |
| Mine / unassigned | ✅ PR1.3 | — |
| Linked record context | ✅ | — |
| Category filter | — | Phase 2 definitions |
| Checklist expand | — | Phase 4 |
| Weekly recurring section | — | Phase 3–4 |
| Site filter intersection | Partial (enrichment) | Phase 5 |

### 4.3 Workspace placement

| Placement | Recommendation |
|-----------|----------------|
| **Top nav modal** | **Keep primary** — matches inbox pattern |
| **Dedicated `/adminV2/work` route** | Optional alias when renamed; keep `/tasks` redirect |
| **Dept page panel** | **Reject** — dept is record-centric queues, not assignee queue |
| **WU page sidebar** | **Reject** — same reason |

### 4.4 Relationship to site filter

My Work respects workspace site filter via opportunity enrichment (existing). General unlinked work always visible. Document explicitly for operators.

---

## 5. Work Unit relationship model

### 5.1 Validated definitions

| Concept | Definition | Operator question |
|---------|------------|-------------------|
| **Work Unit** | Runtime queue host — **record preview / selection** surface | “Which records are in this operational view?” |
| **Operational Work** | **Human obligation** tracked per assignee | “What must I do?” |

**Validated:** Work Units are **not** a work queue. They are **operational views** over records.

### 5.2 Interaction model

```
Staff opens Work Unit (e.g. Tour stage queue)
    → sees RECORD rows (pipeline membership)
    → rows may show ATTENTION badge (overlay signal)
    → rows may show WORK indicator (has open obligations) — future subtle dot
    → opens drawer
        → WORK STRIP shows obligations on that record
        → completes work
    → returns to WU queue (record may still appear until status changes)
```

Work completion **does not** remove record from WU queue unless status/lifecycle changes.

### 5.3 NA lane vs WU vs My Work

| Surface | Shows | Does not show |
|---------|-------|---------------|
| **Stage WU queue** | Records in stage | Work titles list |
| **NA lane / buckets** | Records matching attention reasons | Work titles list |
| **My Work** | Obligation rows | Pipeline membership |

### 5.4 Queue row affordances (future, optional)

| Affordance | Max depth |
|------------|-----------|
| Attention styling + primary reason | ✅ today |
| “Open work” dot or count badge | ✅ Phase 3 UX — **count only**, not title |
| Inline complete | ❌ — drawer only |

---

## 6. Attention relationship model

### 6.1 Ideal UX flow (operator mental model)

```
1. NOTICE  — Needs Attention (why this record matters)
2. ORIENT  — Readiness + BOS (what’s blocking / suggested priority)
3. COMMIT  — Operational Work (what I’ll do, tracked)
4. EXECUTE — Actions (side effects)
5. RESOLVE — Work complete → signals re-eval → attention may clear
```

### 6.2 Display layering

| Step | Surface | Copy tone |
|------|---------|-----------|
| **Notice** | NA bucket, queue row badge, drawer attention summary | “Needs review — Follow-up overdue” |
| **Orient** | Review Assist, Required Information | “Suggested next step” / “Required information missing” |
| **Commit** | Work strip, My Work | “Call family — due tomorrow” |
| **Execute** | Header actions | “Send form”, “Record tour outcome” |
| **Resolve** | Work popover complete | “Mark complete” |

### 6.3 How it should feel

- **Attention** feels like a **highlight**, not a assignment
- **Work** feels like a **personal commitment** with due date
- **Actions** feel like **buttons that change the record**
- Clearing attention without completing work should feel **unsatisfying** — because underlying signal remains (correct behavior)

### 6.4 Subscriptions (framework — not UX yet)

Work definitions do **not** subscribe to attention in UI. Automations may create work when reasons persist (Phase 3). NA never shows work rows.

---

## 7. Action relationship model

### 7.1 Validated: Work = outcome, Action = execution

Operators may:

1. Execute zero or more **actions**
2. Then **complete work** when outcome attested

Completing work must **not** auto-run actions (locked).

### 7.2 Canonical action placement relative to work

| Placement | Recommendation |
|-----------|----------------|
| **Inside work card** | **Suggested action links only** (1–3 CTAs) — Phase 2 |
| **Beside work strip** | ❌ — clutters strip |
| **Header actions menu** | **Primary execution home** — keep |
| **Below work in drawer** | **Preflight / blocked panel** when action gated by readiness |

### 7.3 Example: Resolve outstanding balance

| UI element | Content |
|------------|---------|
| Attention | “Outstanding balance” |
| Work strip | “Resolve outstanding balance” (due Friday) |
| Suggested actions on work card | Send statement · Create payment plan |
| Header actions | Same keys when placed on drawer |
| Complete work | Operator attests after any valid path |

### 7.4 `create_task` / `complete_task` actions

| Action | Target surface |
|--------|----------------|
| `create_task` | **Record work create modal** (PR2) — not My Tasks panel |
| `complete_task` | **Work popover / My Work card** — targets open instance on record |

---

## 8. BOS relationship model

### 8.1 BOS consumes work — does not own it

| BOS may | BOS may not |
|---------|-------------|
| Read open work snapshots | List all org work as authoritative queue |
| Recommend which work/action first | Insert work without apply |
| Prefill create modal | Mark work complete |
| Explain overdue + gaps + attention together | Override assignee/due |

### 8.2 Surface mapping

| BOS capability | Placement | Relationship to work |
|----------------|-----------|----------------------|
| **Review Assist band** | Drawer / inquiry summary | Judgment → route to work create or action |
| **Orchestrator handoff** | Operational strip card | Seeds Task Assist / modal prefill |
| **Task Assist reminder proposal** | Command bar | Apply → `createWorkInstance` |
| **Operational recommendation** | `_operational_recommendation` | Maps to `create_task` handoff |
| **Priority sorting** | My Work order (Phase 5) | Weight only — not truth |

### 8.3 Recommended copy boundaries

| Surface | Starts with |
|---------|-------------|
| BOS Review Assist | “Suggested next step” |
| Work strip chip | Task title (operator or template) |
| Attention | “Needs review” + reason |
| Readiness | “Required information missing” |

Avoid BOS generating task titles that appear as work truth until operator applies.

---

## 9. Future recurring-work placement

### 9.1 Example: Weekly Director Checklist

Four reviews every Friday — exists without readiness gap, attention reason, or workflow trigger.

### 9.2 Placement (checklist shape — Phase 4)

| Surface | Behavior |
|---------|----------|
| **My Work** | **Primary home** — section “Due this week” with checklist card |
| **Top nav badge** | Counts open checklist items toward overdue |
| **Record drawer** | ❌ — not record-linked (org/role scoped) |
| **NA lane** | ❌ — unless checklist item overdue projects `operational_task_overdue`-class signal |
| **Dept dashboard** | Optional Phase 6 widget “Team operational reviews” |

### 9.3 My Work layout with recurring (future)

```
My Work
├── Overdue (3)
├── Due today (5)
├── This week — recurring obligations (1 checklist)
│   └── Friday Director Review ▾
│       ☐ Attendance audit
│       ☐ Staffing review
│       ☐ Licensing review
│       ☐ Balance review
└── Open follow-ups (12)
```

### 9.4 Today’s UX preparatory choices (PR2–PR3)

| Choice | Why |
|--------|-----|
| Keep My Tasks as modal shell | Becomes My Work without layout rewrite |
| Category metadata on create | Filters ready for recurring/compliance |
| Do not put recurring in NA lane | NA remains signal overlay |
| Assignee filter in My Work | Director sees own checklist instance |

---

## 10. Recommended Phase 1 UX implementation plan (PR2–PR5)

Aligns with [`operational_work_v1_implementation_plan.md`](./operational_work_v1_implementation_plan.md) — UX-focused sequencing.

### PR2 — Record work capture (highest operator impact)

| Item | Placement |
|------|-----------|
| `OpportunityWorkCreateModal` | Record drawer + My Tasks create card |
| `create_task` action | Opens modal on opportunity — **not** global panel |
| Strip “+ Follow-up” button | `OpportunityOperationalCompactStrip` |
| BOS handoff prefill | Modal title/due from recommendation |
| Decouple core work UI from Task Assist gate | Strip + My Tasks visible independently |

**Exit:** Operator creates work without leaving record context.

### PR3 — Assignee + My Work filters

| Item | Placement |
|------|-----------|
| Assignee on create/edit | Modal + My Tasks card |
| Mine / Unassigned / All tabs | My Tasks panel |
| Assignee chip on work card | My Tasks |

**Exit:** Managers see team unassigned pool.

### PR4 — Complete action + strip polish

| Item | Placement |
|------|-----------|
| Register `complete_task` | Header overflow + popover |
| Separate scheduled-send group label in strip | “Scheduled messages” vs “Follow-ups” |
| Consolidate: hide `OpportunityOperationalTasksSection` when strip sufficient | Reduce duplication |

**Exit:** Action catalog matches work runtime.

### PR5 — Attention + work coherence (with NA Phase 4)

| Item | Placement |
|------|-----------|
| Optional queue row “open work” dot | Subtle — count only |
| Drawer attention summary links to work strip anchor | Scroll/focus |
| NA reason `operational_task_overdue` copy | Points to My Work, not inline list |

**Exit:** Attention → work navigation without duplication.

### PR6+ — My Work rename, definitions, recurring (out of PR2 scope)

| Item | Placement |
|------|-----------|
| Rename My Tasks → My Work | Top nav |
| Definition picker in create modal | Lifecycle templates |
| Recurring checklist section | My Work |
| Suggested action chips on work card | Record strip + My Work card |

---

## 11. Cross-domain applicability

| Domain | Record work home | Workspace home | Notes |
|--------|------------------|----------------|-------|
| **Enrollment / CRM** | Opportunity drawer strip | My Work | V1 pilot |
| **Waitlist** | Candidate/opportunity drawer | My Work | Same strip pattern |
| **Subsidy** | Case drawer (future) | My Work | Decision-category work |
| **Billing** | Customer/account drawer | My Work + AR queue link | Resolution-category work |
| **Documents** | Packet/doc drawer | My Work | Compliance-category work |
| **Scheduling** | Schedule entity drawer | My Work | Event follow-up tasks — not scheduled sends |

Platform rule: **one My Work shell**, domain expressed via category + subject enrichment — not per-domain work queues.

---

## 12. Anti-patterns (UX)

| Anti-pattern | Why forbidden |
|--------------|---------------|
| NA lane lists work titles | Collapses awareness + obligation |
| WU queue rows as task inbox | Collapses selection + obligation |
| Readiness panel “Create task” per gap | Readiness does not create work |
| BOS auto-creates work on recommend | Human/automation authority |
| Merging scheduled sends into work completion | Different domains |
| Header clutter: 4 bands of equal weight | Attention + BOS + readiness + work compete |
| Per-dept “Tasks” tab | Assignee queue is org-scoped |

---

## 13. Open UX decisions (pre-PR2 sign-off)

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Rename My Tasks in PR2? | **No** — PR4+ when checklists ship |
| 2 | Strip vs section for >3 work items | **Expand in strip** before separate section |
| 3 | Show work count on queue rows | **Phase 5** — dot only first |
| 4 | Scheduled sends in same strip | **Yes** — separate labeled group |
| 5 | Person/child record work | **Defer** — opportunity-linked V1 |
| 6 | `/adminV2/tasks` route rename | **Keep** until My Work rename |

---

## Appendix A — Key files (current UI)

| Area | Paths |
|------|-------|
| My Tasks shell | `web/app/adminV2/components/MyTasksModal.tsx`, `MyTasksPanel.tsx`, `TopNavBar.tsx` |
| Record work strip | `web/components/admin/opportunity/OpportunityOperationalCompactStrip.tsx` |
| Task popover | `web/components/admin/opportunity/OperationalTaskDetailPopover.tsx` |
| Inquiry preview | `web/components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx` |
| Attention strip | `web/components/admin/drawer/OperationalAttentionHeaderStrip.tsx` |
| Header attention | `web/components/admin/drawer/DrawerHeaderAttentionBlock.tsx` |
| Readiness panel | `web/components/admin/opportunity/OpportunityDrawerRequiredInformationPanel.tsx` |
| Header actions | `web/components/admin/opportunity/OpportunityDrawerHeaderControls.tsx` |
| Queue attention | `web/lib/adminV2/workUnitQueueRowAttention.ts` |
| NA buckets | `web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts` |
| Reveal doctrine | `web/lib/admin/drawer/opportunityDrawerFirstPaintContract.ts` |
| Work service (PR1) | `web/lib/admin/operationalWork/` |

---

## Appendix B — Success criteria (audit complete)

| Criterion | Status |
|-----------|--------|
| Full surface audit | Yes — §1 |
| Duplication / confusion documented | Yes — §1.3–1.4 |
| Record-level model | Yes — §3 |
| Workspace-level model | Yes — §4 |
| WU relationship validated | Yes — §5 |
| Attention flow model | Yes — §6 |
| Action relationship validated | Yes — §7 |
| BOS boundaries | Yes — §8 |
| Recurring placement | Yes — §9 |
| PR2–PR5 UX plan | Yes — §10 |
| No implementation | Yes |

---

*End of UX placement audit — PR2 implementation may proceed after §13 sign-off.*
