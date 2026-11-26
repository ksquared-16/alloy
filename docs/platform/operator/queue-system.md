---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

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

## Operational awareness on queue rows

Two separate signals — do not conflate them with status, Needs Attention, selection, or a “New” badge.

### Time in current operational state

Compact age on the right edge (`12m`, `3h`, `2d`, `4w`, `3mo`) answers: **how long has this subject been in its current authoritative process stage / cohort?** It sits beside the stage pill (both show when present) — age never replaces stage.

| Rule | Detail |
|------|--------|
| Owner | Persisted `stage_entered_at` on `opportunities` (family/case grain) and `process_instances` (child/participant grain) |
| Resolver | `resolveOperationalStateEnteredAt` — grain-aware, org-scoped |
| Precedence | (1) persisted `stage_entered_at` (2) intake `created_at` only when never-transitioned (3) unknown |
| Forbidden | Unrelated `updated_at` / generic record modification time |
| Work View | Filters/groups only — does **not** own stage age. Catch-all views still show the subject’s real stage membership age |
| Formatter | `formatCompactRelativeDuration` — months use `mo`, never ambiguous `m` |

Stage moves reset the clock at the authoritative transition write. Unrelated field edits do not.

Accessible label example: `In this stage for 2 days`.

### Personal seen / unseen

Quiet juniper dot beside the subject name means **this operator has not intentionally opened this stage membership yet**.

| Rule | Detail |
|------|--------|
| Scope | Stage-membership occurrence: org + user + subject + stage_key + stage_entered_at |
| Persist | `operator_stage_membership_acks` (idempotent upsert) |
| Mark seen | Explicit row click / keyboard open via `QueueRegion` → Focus Panel |
| Do **not** mark | Queue load, prefetch/hover warm, default operational subject auto-open |
| Isolation | One user’s open never marks seen for another |
| Stale guard | Session overlay clears the dot immediately; refresh cannot restore unseen after local ack |

Not a “NEW” badge. Distinct from Needs Attention (ember) and selected-row chrome (pine).

Code: `operationalStateEnteredAt.ts`, `operatorStageMembershipAck.ts`, `queuePersonalSeenSession.ts`, `CondensedQueueRow`.

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

Candidate-grain waitlist rows expose placement vocabulary via `queueWaitlistPlacementField.ts` and sibling/household child vocabulary via `queueRowSiblingFieldRegistry.ts` / `resolveQueueRowSiblingFields.ts`.

| RefKey | Operator label | Runtime source |
|--------|----------------|----------------|
| `waitlist.positionLabel` | Waitlist position | Candidate runtime position within section |
| `waitlist.tierLabel` | Priority tier | Placement bucket label |
| `waitlist.priorityLabel` | Priority | Alias of tier/bucket label |
| `waitlist.waitSince` | Wait since | Candidate wait-since date |
| `waitlist.siblingContext` | Sibling context | Composite first sibling context line |
| `sibling.names` | Sibling names | Waitlisted + enrolled sibling display names (excludes row child) |
| `sibling.count` | Sibling count | Count of siblings with waitlist/enrolled context |
| `sibling.enrolled` | Sibling enrolled | Enrolled sibling name/program lines |
| `sibling.waitlisted` | Sibling waitlisted | Waitlisted sibling name/program lines |
| `sibling.location` | Sibling location | Enrolled sibling campus/location labels |
| `sibling.program` | Sibling program | Waitlisted/enrolled sibling program labels |
| `household.otherChildren` | Other children | Other inquiry children on family record (excludes row child) |
| `overrides.flags` | Override flags | Active placement override kinds |
| `overrides.reason` | Override reason | Pin/adjustment reason when present |

**Visibility signal paths** (layout `visibleWhen` only, not picker fields): `_sibling.hasWaitlisted`, `_sibling.hasEnrolled`, `_household.hasMultipleChildren`.

**Presets:** `QUEUE_ROW_SIBLING_VISIBILITY_PRESETS` — hide when empty (`exists`), show when sibling waitlisted/enrolled (`equals` on signal paths), show when household has multiple children.

Pipeline queue rows reject waitlist/sibling refs at publish validation. Code: `queueRecordValidatorAllowList.ts`, `validateQueueRecordLayoutConfig.ts`.

### Waitlist placement adjust (operator)

Candidate Waitlist rows expose an **Adjust** control under the `#n/total` stamp (`WaitlistPlacementAdjustControl`) — plain link, not a primary button. The adjust modal uses Focus Panel card chrome; Apply uses Bend Pine (`#00A283` / `alloy-bend-pine`). Reason is optional (no placeholder). Group headers show **program label only** (age ranges stripped via `programLabelWithoutAgeRange`). Compact time-in-stage remains the single bottom-right stamp owned by `stage_entered_at` (see § Queue age above) — not lead `created_at`.

**Work View labels:** Settings **Save** writes draft only. Live operator pill/row labels require **Apply changes** on the Business Process publication bar (`BusinessProcessPublicationBar`). See `../core/business-process-system.md` § Work View draft vs published labels.

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
---

## Work Items queue (cross-record execution)

**Work Items** is Alloy's cross-record operational execution platform — a three-pane queue workspace (folders, views, sources) for work that spans records and domains.

| Source | Authority | Persistence |
|--------|-----------|-------------|
| **Manual** | `operational_tasks` | Persisted manual work |
| **Business Process** | stage work / Current Work | Same underlying BP work — not duplicated |
| **Processing** | Processing case state | Virtual projection only (`processing:{caseId}`) |
| **Communications** | thread attention state | Virtual projection only (`communications:{threadId}`) |

**Rules (frozen, Work Items V3):**

- Queue rows describe **provenance and execution visibility** — not duplicate domain ownership.
- Virtual projections **never** create `operational_tasks` rows.
- Domain products remain **systems of record**; Work Items supplies execution visibility and navigation.
- Unsupported sources stay **disabled** — Work Items does not fabricate rows.
- Not every unread message, Processing case, or domain event becomes work — only configured actionable lanes.
- Assignment / Mine semantics follow authoritative domain assignment — not sender/recipient inference.
- Unified **operational refresh** coordinates domain cache invalidation after authoritative mutations.

See `../core/navigation-and-workspace-doctrine.md` and `../../sprints/archive/08_2026/work-items-v3-platform/`.


## Related

- `./drawer-sunset-roadmap.md` — queue/search opens target Focus Panel card states (convergence lock)
- `./operational-mode-default-state-doctrine.md` — default Operational Mode, subject resolution, Browse Mode retirement
- `./canonical-interaction-model.md` — Perspective / Queue / Row primitives
- `./interaction-grammar.md` — queues do not own data; Previous/Next follows current filtered queue
- `../core/business-process-system.md`
- `../core/record-system.md`
- `../../system/workspace-system.md` (transitional expanded reference)
