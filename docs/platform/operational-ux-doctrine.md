# Operational UX Architecture doctrine

**Status:** Canonical platform doctrine (June 2026). Defines Alloy's operating model across all operational domains — Enrollment, Attendance, Scheduling, Billing, Staffing, Subsidy, POS, Capacity, Compliance, and future workflows.

This document is **doctrine, not implementation detail**. It explains *why* Alloy does not need a per-domain UX redesign: every operational domain plugs into the same five-plane model, the same Operations/Records split, and the same progressive-drawer rules. Enrollment is the proof case, not a special case.

> **Companion doctrine:** This doc covers the **planes and domains** (why one architecture serves all domains). The **canonical interaction spine** an operator traverses — Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field, and the one universal drawer (Record of Truth / Record of Attention / Context Frame) — is defined in [`./operator/canonical-interaction-model.md`](./operator/canonical-interaction-model.md), with laws in [`./operator/interaction-grammar.md`](./operator/interaction-grammar.md) and the lived flow in [`./operator/operator-story.md`](./operator/operator-story.md). The progressive **tabs vs. actions** rules below are the current expression of what the interaction model frames as **Modes** (Summary / Work / Activity) and **Cards** (per-domain surfaces within Work); the Hidden / Startable / Active states carry forward unchanged.

---

## Why this doctrine exists

As Alloy expands from Enrollment into Attendance, Scheduling, Billing, Staffing, Subsidy, POS, Capacity, and Compliance, the temptation is to design a new workspace, a new record module, and a new navigation spine per domain. Alloy explicitly rejects that.

Each new domain is a **new operational surface inside the existing model**, not a new product. The platform already owns the primitives — business processes, stages, queues, drawers, layouts, actions, events, and BOS. A new domain supplies *configuration and surfaces*, not a parallel application.

The result: operators learn the model once. Adding Billing or Attendance feels like the same workspace gaining new abilities — not like learning a new tool.

---

## The five operational planes

Alloy's operating model is organized into five planes. Every domain participates in all five; no domain gets its own architecture.

| Plane | One-line purpose | Primary surfaces |
|-------|------------------|------------------|
| **Configuration** | Defines *how the organization works* | `/admin/settings/*`, business process builder, Experience Builder |
| **Planning** | Models *future state* without committing changes | Forecasts, scenarios, capacity/financial modeling (future) |
| **Operations** | Surfaces *work that needs action* | `/workspace`, work units, queues, perspectives |
| **Records** | Executes against *individual operational objects* | Drawers (record detail surfaces) |
| **Intelligence / BOS** | Recommends, explains, and assists under approval | Woven across all planes — not a standalone module |

> **Note on "planes":** This is the **operational** plane model (Configuration / Planning / Operations / Records / Intelligence). It is distinct from the Configuration platform's internal "four-plane settings model" (Fields / Field grouping / Layouts / Actions), which is a sub-structure *inside* the Configuration plane. See `./modules/configuration-platform.md`.

### Plane purposes

**Configuration** defines how the organization works — the structure operations execute against. Business processes, stages, fields, layouts, statuses, actions, placement priority, KPI targets, role scoping. Configuration is authored in settings and is **separate from execution**: changing config changes the rules of the game, never the operational history already recorded.

**Planning** models future state without committing changes. It forecasts — capacity, revenue, staffing demand, enrollment fill — by *consuming operational facts* and projecting them forward. Planning is **not another execution workspace**: it proposes and explores, it does not write operational truth. Proposed/forecast state and committed state stay separate.

**Operations** surfaces work that needs action. It begins with *work*, not with a thing. Operators arrive at `/workspace`, pick a business process, and work a stage's queue. Operations answers: *what needs my attention, and what should I do next?*

**Records** are drawer-based execution surfaces for individual operational objects. A record begins with *a thing* — this child, this invoice, this shift, this enrollment. The drawer is where an operator executes against that one object across every domain relevant to it.

**Intelligence / BOS** provides recommendations, explanations, and approval-gated assistance across the platform. BOS is a **woven layer**, present in queues, drawers, configuration, and planning — never a destination operators "go to." It **proposes; humans approve** (see `./modules/ai-platform.md`).

---

## Operations + Records doctrine

The two execution-facing planes are intentionally split by *where the operator starts*:

| | Operations | Records |
|---|-----------|---------|
| **Begins with** | Work | A thing |
| **Question answered** | "What needs action?" | "Everything about this object" |
| **Surface** | Work units, perspectives, queues | Drawer |
| **Authority** | Preview / selection only | Resolver-backed entity GET |

**Rules:**

- **Operations begins with work.** Work units and perspectives show what needs action across a cohort of records.
- **Records begin with a thing.** A drawer shows everything about one operational object at its current stage of life.
- **Queues are preview/selection surfaces only** — authoritative detail comes from the entity GET / record responder, never from queue JSON (see `./core/record-system.md`, `./operator/queue-system.md`).
- **Clicking a row opens a drawer while preserving workspace context.** The queue page does not remount; the drawer appends `:recordId` to the route. Operators should **never feel like they navigated to a separate "record module."** The drawer is detail *in place*, not a destination switch.

This split is what lets a new domain (e.g. Attendance) appear as a *queue/perspective* in Operations **and** a *tab* on the relevant Records drawer, without any new navigation paradigm.

See `./core/business-process-system.md` and `./core/navigation-and-workspace-doctrine.md` for the operator hierarchy (Business Process → Stage → Record).

---

## Progressive drawer doctrine

Drawers are **not static**. The set of tabs a drawer shows is **stage-aware and context-aware** — it reflects what is operationally relevant for *this* record at *this* point in its life.

- A **lead** should not show Attendance or Billing tabs before those concepts are relevant to it.
- An **enrolled child** may show Placement, Schedule, Attendance, Billing, Payments, Documents, Communications, Tasks, and History.
- The drawer is **the operational surface for a record at its current stage of life** — it grows as the record's operational reality grows.

This is what makes the same drawer architecture serve a brand-new lead and a long-enrolled child without two different designs. Tabs are composed from layout configuration (Experience Builder) and gated by lifecycle stage and operational history — not hardcoded per entity type. See `./operator/experience-builder-doctrine.md` and `./operator/drawer-system.md`.

---

## Critical refinement: tabs vs actions

This is the single most important rule in this doctrine, because it is the easiest to get wrong.

> **Tabs represent active operational surfaces or history.**
> **Actions initiate valid operational work.**
>
> **A hidden tab must never hide the path to begin valid work.**

A progressive drawer hides tabs that have no history yet. If tabs were the *only* way to start work, hiding a tab would trap the operator: there'd be no door to begin the first invoice or the first attendance record. That is forbidden.

Tabs and actions are **separate mechanisms**:

- **Tabs** are operational *surfaces* — they appear when there is history to show or the lifecycle stage requires the surface.
- **Actions** are how operators *start* operational work — they appear when the record is *eligible*, regardless of whether any history exists yet.

**Examples:**

| Situation | Tab behavior | Action behavior |
|-----------|--------------|-----------------|
| No billing history yet, record eligible | Billing tab **hidden** | Actions expose **"Start billing" / "Create invoice" / "Add charge"** |
| No attendance history yet, child eligible | Attendance tab **hidden** | Actions expose **"Record attendance" / "Mark present" / "Add first attendance"** |
| History now exists | Tab becomes **visible** as the record's operational surface | Actions continue to offer ongoing operations |

Once the first operational fact is written, the tab appears and becomes the record's surface for that domain. The action created the history; the tab now reflects it. Actions route through the canonical action/workflow path (`./modules/actions-and-workflows.md`).

---

## Visibility states

Every domain surface on a record resolves to exactly one of three states:

| State | Meaning | Tab | Actions |
|-------|---------|-----|---------|
| **Hidden** | Not relevant and not startable for this record/stage | Not shown | Not offered |
| **Startable** | No history exists yet, but the operator may initiate the workflow | Not shown | **"Start …" actions offered** |
| **Active** | History exists, or lifecycle stage requires the surface | **Shown** as operational surface | Ongoing operations offered |

The transition that matters is **Startable → Active**: it happens the moment the first operational fact is recorded (or the lifecycle stage forces the surface). This is the only progressive-drawer rule needed to support every domain.

---

## Enrollment validation (proof case)

Enrollment validates the model — it is **not a redesign** of enrollment. The point is to show that the existing stages already map cleanly onto the five planes and the tabs/actions rules. Every other domain follows the same pattern.

Journey: **Lead → Proposal → Agreement → Placement → Schedule → Attendance → Billing → Payments.**

| Stage | Likely workspace / work unit | Drawer tabs visible (Active) | Actions available (incl. Startable) | BOS guidance | Operational history created |
|-------|------------------------------|------------------------------|-------------------------------------|--------------|-----------------------------|
| **Lead** | Enrollment process → New Leads / Tours queue | Overview, Contacts, Communications, Tasks, History | Schedule tour, Send message, Change status, *(Startable: Create proposal)* | Suggest next step, draft outreach, flag stale lead | Inquiry created, comms, tour bookings |
| **Proposal** | Enrollment → Proposal/Offer queue | + Proposal | Send proposal, Revise terms, *(Startable: Create agreement)* | Recommend program/room fit, draft proposal copy | Proposal sent/viewed/accepted |
| **Agreement** | Enrollment → Agreements queue | + Documents (agreement) | Send agreement, Countersign, *(Startable: Place child)* | Explain missing required info, nudge signature | Agreement executed, documents |
| **Placement** | Enrollment → Placement / Capacity queue | + Placement | Assign program/room, Change placement, *(Startable: Build schedule)* | Recommend placement vs capacity, surface conflicts | Effective-dated placement record |
| **Schedule** | Scheduling work unit / Enrollment | + Schedule | Set schedule pattern, Adjust days, *(Startable: Record attendance)* | Detect schedule/capacity conflicts, propose pattern | Effective-dated schedule assignments |
| **Attendance** | Attendance work unit (daily roster) | + Attendance | Mark present/absent, Add first attendance, Correct entry | Flag absence patterns, suggest follow-up | Attendance facts (never overwritten) |
| **Billing** | Billing work unit / AR perspective | + Billing | Start billing, Create invoice, Add charge, Apply discount | Explain balance, recommend plan, flag overdue | Invoices, charges, ledger entries |
| **Payments** | Billing → Payments / Collections perspective | + Payments | Record payment, Send payment link, Refund | Predict delinquency, recommend reminder cadence | Payment records, receipts |

Reading the table top-to-bottom shows the progressive drawer in action: tabs accrete as history accrues, and each stage's **Startable** action is the bridge that creates the next stage's history — so an operator is never blocked from beginning valid work.

Enrollment grain detail (childcare reference implementation) lives in `../product/crm-system.md` and `./core/placement-system.md` — supplemental, not platform identity.

---

## How future domains plug in

Because the model is plane-based, each domain ships the *same* artifact set rather than a bespoke UX:

| Domain | Operations surface | Drawer tab (Active) | Key Startable actions | Planning input | BOS role |
|--------|--------------------|--------------------|-----------------------|----------------|----------|
| **Attendance** | Daily roster work unit / perspective | Attendance | Record attendance, Mark present | Utilization forecasting | Absence pattern detection |
| **Scheduling** | Scheduling work unit | Schedule | Set pattern, Adjust days | Capacity/demand modeling | Conflict detection |
| **Billing** | AR / invoicing perspective | Billing, Payments | Start billing, Create invoice | Revenue forecast | Balance explanation, delinquency prediction |
| **Staffing** | Staffing work unit | (staff drawer) Shifts, Assignments | Create shift, Assign staff | Labor demand modeling | Coverage gap suggestion |
| **Subsidy** | Subsidy / funding perspective | Subsidy | Start subsidy case, Submit claim | Funding forecast | Eligibility/renewal reminders |
| **POS** | Point-of-sale surface | Transactions | New sale, Add charge | Revenue forecast | Reconciliation assist |
| **Capacity** | Capacity / placement perspective | Placement, Capacity | Adjust capacity, Reserve seat | Fill-rate forecast | Overbooking/under-fill warnings |
| **Compliance** | Compliance work unit | Compliance, Documents | Start review, Record requirement | Risk/readiness modeling | Expiry and gap detection |

None of these requires a new navigation spine, a new "record module," or a new drawer architecture. They are configuration + surfaces inside the existing planes.

---

## Doctrine principles

1. **Configuration is separate from execution.** Settings define the rules; they never rewrite recorded operational truth.
2. **Planning forecasts before execution.** Modeling future state is distinct from committing it.
3. **Operations surfaces work.** Work units and perspectives show what needs action.
4. **Drawers execute against records.** One object, every relevant domain, in place.
5. **Tabs show relevant operational surfaces/history.** They appear when there is history or the stage requires them.
6. **Actions start workflows.** A hidden tab must never hide the path to begin valid work.
7. **BOS recommends; humans approve.** No autonomous operational side effects.
8. **Never overwrite operational history.** Corrections are new effective-dated facts, not edits-in-place of the record of what happened.
9. **Proposed state and committed state must remain separate.** Planning/proposal surfaces never silently mutate operational truth.
10. **Every effective-dated operational object should preserve history.** Placement, schedule, billing, and similar objects keep their timeline.
11. **Planning consumes operational facts.** Forecasts are built from real operational history, not from a parallel data store.
12. **Analytics explains outcomes and predicts future state.** Measurement and modeling sit above execution; they read facts, they do not author them.

---

## Cross-references

| Concern | Doctrine |
|---------|----------|
| Canonical interaction spine / primitives | `./operator/canonical-interaction-model.md` |
| Interaction laws / grammar | `./operator/interaction-grammar.md` |
| Lived operator experience | `./operator/operator-story.md` |
| Visual doctrine (look/feel; mockup bridge) | `./operator/alloy-visual-language.md` |
| Runtime Specification (synthesis; implementation bridge) | `./operator/alloy-runtime-specification.md` |
| Configuration plane / settings control plane | `./modules/configuration-platform.md` |
| Experience Builder / record layouts / drawer composition | `./operator/experience-builder-doctrine.md` |
| Business processes, stages, work units | `./core/business-process-system.md` |
| Navigation & workspace spine | `./core/navigation-and-workspace-doctrine.md` |
| Drawer architecture & VM ownership | `./operator/drawer-system.md` |
| Queue preview boundary | `./operator/queue-system.md` |
| Record authority & resolution | `./core/record-system.md` |
| Status & lifecycle ownership | `./core/status-and-state-system.md` |
| Record actions & workflow spine | `./modules/actions-and-workflows.md` |
| BOS / AI agent foundation | `./modules/ai-platform.md` |
| Planning / analytics measurement layer | `./modules/operational-intelligence-platform.md`, `./analytics/analytics-v2-roadmap.md` |
| Placement priority & capacity | `./core/placement-system.md` |
| Documentation governance | `./governance/documentation-governance.md` |
| Enrollment vertical reference (supplemental) | `../product/crm-system.md` |

---

## When this doc must be updated

- A new operational domain is introduced (add it to "How future domains plug in").
- The five-plane model, Operations/Records split, or tabs-vs-actions rule changes.
- The progressive-drawer visibility states (Hidden / Startable / Active) change.
- Planning/BOS positioning relative to execution changes.
