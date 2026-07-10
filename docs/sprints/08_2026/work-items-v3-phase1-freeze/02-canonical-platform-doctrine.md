# 2. Canonical Platform Doctrine — Work Items V3 (Proposed)

**Status:** PROPOSED — do not merge to `docs/platform/**` until Product signs freeze  
**Purpose:** Single operator-facing doctrine for Work Items as operational execution platform

---

## 2.1 Platform identity

> **Work Items** is Alloy's **operational execution platform**. It answers one question: *What work must actually get done?*
>
> Work Items is **not** a task manager, todo list, or parallel workflow system. It is the cross-process inbox where operators **understand, organize, execute, review, and complete** operational commitments.

### Module boundaries (frozen)

| Module | Question | Owns |
|--------|----------|------|
| Processing | What information entered? | Ingestion, triage, extraction |
| Communications | What conversations are happening? | Threads, messages, channels |
| Business Processes | What lifecycle is this record in? | Stages, operating plans, spawn rules |
| **Work Items** | **What work must get done?** | Cross-record selection, assignment, queue execution |
| **Current Work** | **What is this record's active work?** | Checklist, outcomes, stage progression |

---

## 2.2 Canonical chain (unchanged)

```
Business Process → Stage → Operating Plan → Generated Work → Current Work → Operator
```

Work Items **consumes Generated Work** (`operational_tasks` rows and, Phase 2+, record-queue previews). It does **not** generate BP work or replace stage operating plans.

**Operator navigation chain (Work Items module):**

```
Business Process → Work View (target) / Stage (interim) → Work Item → Focus Panel / Record
```

---

## 2.3 Terminology (operator-facing)

| Retire (UI) | Adopt (UI) | Keep (implementation) |
|-------------|------------|------------------------|
| Task | **Work Item** | `operational_tasks` table |
| New task | **Create Work Item** | POST operational-tasks |
| My Tasks | **Work Items** | `MyTasksModal` (rename presentation) |
| Tasks (nav) | **Work** | Event compat layer |

**Rule:** Do not blindly rename implementation symbols. Presentation migration is phased.

---

## 2.4 One creation runtime (frozen)

> Work Item creation is **conversation-first**. Operators describe intent; BOS proposes structured work; operators review and commit.
>
> **Create Work Item**, BOS rail, record BOS, command palette, and future integrations share **one runtime**: intent → draft → validation → approval → commit. Presentation differs; implementation does not.

---

## 2.5 BOS boundary (frozen, aligns with D11)

> BOS **never silently creates work**. BOS **proposes**; the operator **approves**; the server **commits** through existing operational APIs.

---

## 2.6 Current Work boundary (frozen)

> **Current Work** owns record-scoped checklist progression, outcome completion, and published field rules.
>
> **Work Items** owns cross-record selection, filtering, assignment, and queue execution.
>
> Work Items detail **links to** Current Work via Open Record. It does not replicate outcome picker semantics inline except via an explicitly approved thin complete adapter.

---

## 2.7 Queue doctrine summary

- **Folders** — organizational scope (Inbox, process-aligned buckets)
- **Views** — saved operator lenses (Mine, Waiting, Overdue…)
- **Sources / Generators** — where work originates (recurring, BP, checklists) — navigation to config, not queue filters
- **Health strip** — Queue nav-band only: Assigned · Waiting · Due Soon · Overdue
- **Overview** — **zero** nav-band and body metrics; action cards only

---

## 2.8 Proposed doctrine file locations

When promoted, merge into:

| Doc | Addition |
|-----|----------|
| `docs/platform/operator/operational-workspace-shell.md` | V3 identity, creation runtime, Overview metrics rule |
| `docs/platform/operator/work-items-platform-doctrine.md` | **New** — full Work Items platform doctrine |
| `docs/platform/core/business-process-system.md` | Generated work → Work Items + Current Work cross-ref |
| `docs/platform/operator/current-work-surface.md` | Work Items boundary section |
| `docs/platform/modules/ai-platform.md` | `work_item_create` capability |
| `docs/platform/operator/canonical-interaction-model.md` | Work Item create as command-surface flow |
| `docs/platform/core/navigation-and-workspace-doctrine.md` | Work nav label, modal active state |
| `docs/platform/operator/alloy-visual-language.md` | Queue row grammar, health strip |
| `docs/platform/foundation/platform-capabilities.md` | Work Items as execution platform capability |

---

## 2.9 Operator story (frozen narrative)

1. Operator opens **Work** from left nav.
2. **Overview** orients: create work, continue overdue, see recent — no dashboard metrics.
3. **Queue** shows what must get done: folders, views, searchable list, health at a glance.
4. Operator selects a **Work Item**, sees detail with record/BP context and optional BOS insight.
5. To complete stage checklist work, operator **opens the record** → **Current Work** in Focus Panel.
6. To capture new work, operator **Create & Ask BOS** — describes intent, reviews proposal, commits.
7. BOS elsewhere can start the same draft; operator expands to full Create to review and commit.

---

## 2.10 Relationship to Operational Expansion

Work Items V3 does **not** expand scope into Attendance, Billing, or Consumption. Those modules produce **facts and consequences**; Work Items surfaces **operator commitments** (including follow-ups triggered by those domains via existing action/event paths).

When Billing obligation review queues land, they use **queue grammar** shared with Work Items but remain **domain-owned** — not folded into `operational_tasks` without explicit product decision (see open questions).
