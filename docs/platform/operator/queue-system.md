# Queue system

**Status:** Canonical (June 2026 freeze). **Operational Mode default state:** [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

Queue preview contract, QueueService behavior, and operational row presentation.

---

## Purpose

Queues are **stage execution lenses** — preview lists that help operators select records. They are not authoritative record stores.

In **Operational Mode** (default Work Unit state), the queue presents as a **condensed rail** beside an open Focus Panel. The runtime resolves a **Default Operational Subject** on entry — not the first row. Full-width expanded queue and **Browse Mode** are retired from operator UX; implementations remain dormant.

See [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

---

## Default Operational Subject Strategy (future configuration)

Each Work Unit will configure a **Default Operational Subject Strategy**. Platform-owned strategy keys include:

| Strategy | Typical use |
|----------|-------------|
| Highest Priority | Enrollment, general pipeline |
| Earliest Due | SLA-driven work |
| Assigned To Me | Operator-owned queue |
| Largest Balance | Billing |
| Oldest | Compliance, waitlist |
| Highest Risk | Attention-driven lenses |
| Highest Score | Composite ranking |
| Newest | Intake-heavy lenses |

**Operator override:** Queue header may expose a temporary strategy switch — reorders queue, re-resolves subject, updates Focus Panel. Does not change Work Unit configuration.

**Not implemented yet** — doctrine and runtime plan only. Resolver catalog and Work Unit config UI are deferred.

---

## Truth boundary (locked)

Queue rows MAY: render labels, sort/filter, select entity, open the **Focus Panel** on that subject.

Queue rows MUST NOT: drive business logic, workflows, actions, financial math, identity resolution, or surface authority.

**Pattern:** Queue → select → entity GET → act.

> **Open target (convergence):** Queue row opens resolve to a **Focus Panel card context**, not generic drawer tabs. Future intent: child/contact opens focus the relevant card and item (Children/Household card, selected item). The drawer shell is the reveal/open-state infrastructure behind the Focus Panel — see [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md). Person/Child Focus Panel bodies are required before their queue opens fully leave legacy drawer UX.

---

## Queue definition

JSON on `work_units.queue_definition` (v1 schema):

- **Sections / domains** — lane groupings (enrollment pipeline)
- **Grain** — `case` vs `candidate` / child-primary
- **Filters, sorts, allowlists** — interpreted by `QueueService`
- **Needs attention queue** — optional overlay lane

Validated by `web/lib/config/queueDefinitionSchema.ts`.

---

## QueueService

`web/lib/queues/QueueService.ts`:

- Org timezone bounds
- Status definition joins
- Opportunity enrichment (person, tour preview, placement priority opt-in, attention flags)
- Summaries + paginated item lists

Enrichment reads canonical tables for **display** — list remains preview.

---

## Route-owned selection

URL `?queue=` + attention bucket aliases beat bootstrap default lane.

Code: `workUnitQueueSelection.ts`, bootstrap `focus_queue`.

---

## Operational queue rows (layout v3)

`metadata.queue_record_layout` v3 — columns, fields, widgets configured in Settings layouts / BP assignment.

| Queue type | Grain | Composer |
|------------|-------|----------|
| Pipeline (`queue_record`) | Case / opportunity preview | v3 field + widget columns |
| Waitlist (`waitlist_queue_record`) | **Candidate** (OCM / child-primary) | v3 + waitlist placement fields |

Renderer owns spacing/typography only. Locked: `../../system/queue-record-doctrine.md`.

### Queue row picker (context-first)

Builder groups: Lead/Enrollment, Candidate/Child, Contacts, Household/Shared, Status/Lifecycle, Waitlist/Placement, Activity/Work.

- Shared operator labels; backend refKeys hidden in normal picker
- Column scope = **default resolver context** — not global availability
- Pipeline excludes waitlist-only refs; waitlist adds placement fields

### Queue widgets (v3)

| Widget key | Purpose |
|------------|---------|
| `current_work` | Active operational work preview |
| `attention` | Needs-attention signals |
| `activity_timeline` | Compact timeline (`fetchQueueActivityTimelineEvents`) |
| `follow_ups` | Follow-up preview |

Legacy `tasks` widget remains valid for existing layouts but is hidden from new picker.

### Waitlist placement fields

`waitlist.positionLabel`, `waitlist.tierLabel`, `waitlist.priorityLabel`, `overrides.flags`, `waitlist.waitSince`, `waitlist.siblingContext` — candidate-grain only.

Code: `queueWaitlistPlacementField.ts`, `queueRecordLayoutAllowList.ts`, `validateQueueRecordLayoutConfig.ts`.

---

## Needs Attention

Resolver-backed overlay — not a stage. Bucket config: `metadata.opportunity_attention_rules.needs_attention_buckets`.

Count semantics differ by surface/cap — align cohort before QA comparisons. Detail: `../../system/workspace-system.md` § Needs attention count semantics (transitional).

---

## Client-side record filters

URL-synced `q`, `rf_*` on work-unit page — filters loaded preview page only; server GET unchanged.

---

## Performance note

Queue row API latency (~800ms–1s) is known backend debt — not a reveal regression if gates hold.

---

## Related

- `./drawer-sunset-roadmap.md` — queue/search opens target Focus Panel card states (convergence lock)
- `./operational-mode-default-state-doctrine.md` — default Operational Mode, subject resolution, Browse Mode retirement
- `./canonical-interaction-model.md` — Perspective / Queue / Row primitives
- `./interaction-grammar.md` — queues do not own data; Previous/Next follows current filtered queue
- `../core/business-process-system.md`
- `../core/record-system.md`
- `../../system/workspace-system.md` (transitional expanded reference)
