# 14. Frozen Architectural Decisions — Work Items V3

**Status:** FROZEN (2026-07-10)  
**Authority:** This document is the implementation contract. Changes require explicit architecture review.

Each decision includes: **why**, **alternatives**, **rejected rationale**, **implementation implications**.

---

## FD-01: Work Item definition

**Decision:** A Work Item is an operational commitment persisted as an `operational_tasks` row. Operator term = Work Item; table name unchanged Phase 1–3.

**Why:** BP spawn, Task Assist, and Current Work already anchor here. One row shape = one inbox.

**Alternatives considered:**
- New `work_items` table
- Task type enum column
- Separate task manager micro-product

**Rejected because:** Parallel persistence breaks spawn, dedupe, and cross-surface links; enums block generic platform.

**Implementation implications:** All features extend metadata additively; UI copy migration only in Phase 1.

---

## FD-02: Current Work relationship

**Decision:** Current Work is record-scoped stage progression; Work Items is cross-record execution. Both consume same BP-generated rows; neither replaces the other.

**Why:** Checklist/outcome UX belongs in Focus Panel grammar, not cross-record modal.

**Alternatives:** Merge into Work Items; eliminate Current Work; duplicate checklist in WI detail.

**Rejected because:** Wrong scope per surface; duplicates truth; breaks Focus Panel investment.

**Implementation implications:** WI detail links Open Record; outcome completion defaults to Current Work API.

---

## FD-03: Business Process relationship

**Decision:** BP chain `Process → Stage → Operating Plan → Generated Work` remains canonical. Work Items lists generated work; does not spawn BP work or evaluate transitions.

**Why:** One lifecycle engine; D8 guards against process proliferation.

**Alternatives:** WI as BP replacement; WI-owned spawn rules.

**Rejected because:** Violates frozen platform architecture.

**Implementation implications:** Group by BP metadata; Generators link to builder; no stage transition UI in WI.

---

## FD-04: Work Item provenance

**Decision:** Provenance via `source` + `metadata.provenance` / lifecycle fields — immutable after commit.

**Why:** Audit, filtering, honest breadcrumbs without type enums.

**Alternatives:** Single enum column; inferred provenance from entity.

**Rejected because:** Too coarse; inference lies about BP attribution.

**Implementation implications:** Add `bos_work_item` source; display mappers per provenance.

---

## FD-05: Work Item ownership

**Decision:** `assigned_to_user_id` = responsible operator; `created_by` = audit; optional `metadata.waiting_on` = external blocker.

**Why:** Separates responsibility from blocking reason.

**Alternatives:** `status: waiting`; infer waiting from Communications.

**Rejected because:** Conflates states; cross-module inference unreliable.

**Implementation implications:** Waiting metric = open + assignee me + waiting_on set.

---

## FD-06: Waiting state semantics

**Decision:** Waiting is metadata + presentation badge, not a status enum.

**Why:** Item remains `open`; waiting is contextual.

**Alternatives:** New status value; separate blocks table.

**Rejected because:** Breaks existing status machine; over-engineered.

**Implementation implications:** `WaitingOnV1` in metadata; WAITING badge in row mapper.

---

## FD-07: Completion semantics

**Decision:** Simple complete → status patch; BP outcome work → `completeStageWorkWithOutcome` via record when effects configured.

**Why:** Outcome side effects stay in lifecycle runtime.

**Alternatives:** Always inline outcome picker in WI; auto-complete on comms.

**Rejected because:** Duplicates Current Work; silent side effects forbidden.

**Implementation implications:** Detect outcome requirement from row metadata; route operator.

---

## FD-08: Audit model

**Decision:** Create/assign/complete/cancel audited via row timestamps + activity feed; BOS propose/commit via proposal + receipt turns.

**Why:** Aligns with human-in-the-loop and existing patch patterns.

**Alternatives:** Separate audit table only; no BOS receipts.

**Rejected because:** Loses conversational trace; weaker operator trust.

**Implementation implications:** Activity tab merges task patches + related record events.

---

## FD-09: Parent / child Work Items

**Decision:** Parent link via `parent_work_item_id` (column preferred Phase 2).

**Why:** Minimal schema for project groupings.

**Alternatives:** Nested set table; project enum.

**Rejected because:** Unnecessary complexity.

**Implementation implications:** Child rows inherit project breadcrumb; scoped queue on parent select.

---

## FD-10: Projects

**Decision:** Projects = parent Work Items with `metadata.shape = project_container`.

**Why:** Ad-hoc initiatives ≠ Business Processes.

**Alternatives:** BP as project; saved filter only; separate projects table.

**Rejected because:** BP is lifecycle; filters lack rollup; parallel table duplicates entity.

**Implementation implications:** Projects folder; optional complete-parent prompt when last child done.

---

## FD-11: Checklists

**Decision:** Checklist authority = stage operating plan + Current Work. WI holds optional `checklist_ref` pointer; detail tab read-only or link.

**Why:** Single checklist truth.

**Alternatives:** WI-owned checklist items; duplicate storage on task row.

**Rejected because:** Drift from published field rules.

**Implementation implications:** Create draft may include checklist items → link template on commit, not parallel DB.

---

## FD-12: Recurring Work

**Decision:** `work_schedule_templates` (config) materialize `operational_tasks` instances with `metadata.recurrence`. No separate scheduler nav.

**Why:** Integrates with existing platform; operators see occurrences in queue.

**Alternatives:** Cron UI product; calendar module; BP-only recurrence.

**Rejected because:** Parallel UX; cross-process ops need non-BP recurrence too.

**Implementation implications:** Daily materializer job; Generators sidebar count; Phase 4 delivery.

---

## FD-13: Manual Work

**Decision:** Manual work = `source: manual` with sparse metadata; groups to General / Cross-process unless operator assigns folder/BP context.

**Why:** Honest about cross-process ad-hoc work.

**Alternatives:** Auto-infer BP from record; force BP selection.

**Rejected because:** Inference lies; friction on quick capture.

**Implementation implications:** BOS may suggest BP link; never required unless policy added later.

---

## FD-14: BOS-generated Work

**Decision:** BOS proposes `WorkItemDraftV1`; operator commits via unified runtime. `source: bos_work_item` (or adapted task_assist during compat).

**Why:** D11 — no silent creation.

**Alternatives:** Auto-create low-risk tasks; separate BOS POST.

**Rejected because:** Violates AI platform rules; fragments runtime.

**Implementation implications:** `work_item_create` capability; compact + full presentations.

---

## FD-15: Business Process-generated Work

**Decision:** BP spawn paths unchanged; rows carry `department_id`, `lifecycle_stage_key`, `work_definition_key`, `lifecycle_provenance`.

**Why:** Already shipped; Work Items consumes.

**Alternatives:** Re-spawn on WI open; WI-triggered regeneration.

**Rejected because:** Duplicate rows; breaks dedupe.

**Implementation implications:** Process rail → folder rules; Stage interim until Work Views.

---

## FD-16: Future module-generated Work

**Decision:** Modules MUST create work via L2 framework + provenance — no private task tables or inboxes.

**Why:** "Everything produces Work Items" strategic goal.

**Alternatives:** Per-module task lists; optional WI integration.

**Rejected because:** Parallel execution systems.

**Implementation implications:** Document integration pattern for Processing/Comms/Billing follow-ups.

---

## FD-17: One creation runtime (cross-cutting)

**Decision:** All entry points share intent → draft → validate → approve → commit.

**Why:** Mockup requirement; eliminates Task Assist / form fragmentation.

**Alternatives:** Form primary + BOS optional; per-entry commit APIs.

**Rejected because:** Two drafts diverge; operator confusion.

**Implementation implications:** See [06-creation-runtime-contract.md](./06-creation-runtime-contract.md).

---

## FD-18: Queue shared grammar (cross-cutting)

**Decision:** Canonical row slots shared across Processing, Communications, Work Items via `WorkspaceQueueRow`.

**Why:** Operator learns once; D10 presentation consistency.

**Alternatives:** Module-specific rows indefinitely.

**Rejected because:** Visual and behavioral drift.

**Implementation implications:** Extract primitive Phase 3; mappers per module.

---

## FD-19: Overview zero metrics (cross-cutting)

**Decision:** Work Items Overview has no nav-band health strip and no body KPI tiles.

**Why:** Matches Processing/Communications launch pattern; Queue owns operational health.

**Alternatives:** Overview KPI tiles; combined overview+queue metrics.

**Rejected because:** Violates Operational Health V3; duplicates Queue.

**Implementation implications:** Already on staging; preserve in all future edits.

---

## FD-20: No new workflow engine (cross-cutting)

**Decision:** Work Items V3 introduces no workflow, lifecycle, or process engine.

**Why:** Frozen platform constraint.

**Alternatives:** WI-owned automation engine; follow-on rules engine.

**Rejected because:** Duplicates BP + events + commands.

**Implementation implications:** Follow-on declarative metadata only until explicit automation epic approved.

---

## Change control

| ID range | Change authority |
|----------|------------------|
| FD-01 – FD-16 | Product + Platform Architecture |
| FD-17 – FD-20 | Platform Architecture + Operational UX doctrine |

To challenge a frozen decision: file architecture RFC with evidence, alternatives, and migration cost.

---

## Quick reference table

| # | Decision | One line |
|---|----------|----------|
| 01 | Work Item | `operational_tasks` row |
| 02 | Current Work | Record-scoped; link don't duplicate |
| 03 | Business Process | BP generates; WI lists |
| 04 | Provenance | source + metadata; immutable |
| 05 | Ownership | assignee + waiting_on |
| 06 | Waiting | metadata, not status |
| 07 | Completion | simple patch or outcome via record |
| 08 | Audit | patches + BOS receipts |
| 09 | Parent/child | parent_work_item_id |
| 10 | Projects | parent container shape |
| 11 | Checklists | Current Work authority |
| 12 | Recurring | schedule templates → instances |
| 13 | Manual | source manual; General bucket |
| 14 | BOS | propose → approve → commit |
| 15 | BP work | existing spawn metadata |
| 16 | Module work | L2 framework only |
| 17 | Creation | one runtime |
| 18 | Queue row | shared slots |
| 19 | Overview | zero metrics |
| 20 | No new engine | expand, don't replace |
