# Operational Workspace Shell

**Status:** Canonical operator-UI doctrine (June 2026). Defines the one shell, header rhythm, and structural grammar every operational *module* surface inherits. Distinct from the [Drawer / Focus Panel](./drawer-system.md), which is record-detail; this doctrine governs **module workspaces** (Communications, Processing, Work Items, Analytics, and future Billing / Scheduling / Compliance).

> **One shell, one interaction language, one structure.** Operational modules do not invent layouts. They inherit this shell. **Processing, Communications, Work Items, and Operational Intelligence are the four reference implementations.**

---

## Purpose

An **operational module** is a top-level workspace an operator opens to do a category of work — read/triage communications, process incoming information, manage work items, review analytics. Each opens as a **center-workspace modal** that fills the band between the left app nav and the pinned right BOS/actions rail.

These are siblings. They must feel identical in chrome and structure so operators learn the grammar once and reuse it everywhere.

---

## The shell

All operational module modals mount inside **`AdminV2WorkspaceBosModalShell`** (`web/app/adminV2/components/`). The shell owns:

- **Geometry / placement / sizing** via `measureAndApplyDrawerWorkspaceGeometry` (CSS vars).
- **Width behavior:** outside Alloy OS split, the panel fills the inner center band (left nav → BOS rail) with no centered max-width cap; in split (State‑2) it docks as a computed peer next to the compressed queue. Modules never set their own width.
- The fixed BOS right rail and overlay.

Modules supply only the **content**: header + body. They do not touch shell geometry.

---

## Canonical header — `OperationalModalHeader`

One header component (`web/app/adminV2/components/OperationalModalHeader.tsx`) for every module. It borrows the **Focus Panel header language** — a Bend Pine left accent + top wash, a bare module glyph, a strong title, and right-aligned actions — adapted for module workspaces (no record chrome, no decorative hero, **no explanatory subtitle**):

```
┃ icon  Title ……………………………… [secondary] [primary] [Close]
^ Bend Pine accent
```

- **Identity is carried by icon + title + accent + actions — never prose.** There is no subtitle. Do not add a mission/description line; the product name and accent are the identity.
- **Icon:** the module's single Lucide glyph in a transparent `h-8 w-8` box — **no tile background, border, or shadow**. The glyph color matches the title (`text-alloy-midnight`) so the icon reads as quiet identity, not a juniper accent. Same treatment across all modules; only the glyph differs (Communications → `MessageSquare`, Processing → `Layers`, Work Items → `ListChecks`, Operational Intelligence → `BarChart3`).
- **Title:** `text-[15px] font-bold text-alloy-midnight` — prominent, product name only.
- **Accent:** a `border-l-[3px] border-l-alloy-juniper` left bar plus a `from-alloy-juniper/[0.06]` top wash — the Focus Panel band language, giving warmth and presence without a hero block (no flat gray header).
- **Actions:** optional `secondaryActions` then primary `actions`, left of **Close**. Use `OPERATIONAL_PRIMARY_ACTION_CLASS` (juniper) / `OPERATIONAL_SECONDARY_ACTION_CLASS` (outline) for visual parity. A module with no action shows Close only.
- **Close:** owned by the header; same affordance and position everywhere.

Modules pass `icon`, `title`, `titleId`, optional `actions` / `secondaryActions`, and `onClose`. They never re-implement the header bar and never pass prose into the header.

---

## Vertical stack (below the header)

Surfaces stack in this fixed order; each layer is optional but never reordered:

1. **KPI / status strip** — `CompactKpiStrip` (`web/components/workspace/CompactKpiStrip.tsx`). One short row of semantic chips. Real or derived data only — never fabricated.
2. **Work / Studio mode switch** — `AlloyModeSwitch` (`web/components/workspace/AlloyModeSwitch.tsx`), where the module has both runtime work and design-time setup.
3. **Child-section nav** — sections *inside* the active mode, visually subordinate to the mode switch (a second tier, not a peer of Work/Studio). Render as a **lighter underline tab strip attached to a hairline baseline** (Communications' `CommsModalTabBar`), not a floating pill group, so the sections read as belonging to the mode context.
4. **Queue / workspace body** — see the queue → workspace model below.

---

## Queue → workspace model

The body follows a **queue → workspace** model wherever it fits:

- **Queue** — a list / category rail / filter rail of operational items, with a **queue header** (active section label + count) for rhythm. Queues are preview/selection surfaces; rows are lightweight (title + urgency + due), with an overdue left accent.
- **Workspace** — the selected item's detail, its actions, and a **calm empty state** when nothing is selected. Where context exists, the workspace preserves a path back to the record/Focus Panel (e.g. Work Items' "Open record").

Communications, Processing, and Work Items all express the two-pane queue → workspace model in their modals (queue/list left, workspace/detail right). Do **not** force a two-column layout where the data does not support it yet; a single-column queue with a queue header is a valid waypoint, but the modal target is two-pane.

---

## Work / Studio model

Modules that own both live work and reusable asset setup expose two modes:

- **Work** — runtime operational work (live records, queues, decisions).
- **Studio** — design-time setup (the reusable assets that power Work).

Mode is the **primary** navigation layer. Child sections belong to exactly one mode and must never render as peers of Work/Studio.

| Module | Work sections | Studio sections |
|--------|---------------|-----------------|
| Processing | Incoming | Documents · Forms · Packets · Settings |
| Communications | Inbox · Announcements | Templates · Channels, signatures & rules |
| Work Items | Process rail (Business Process → interim Stage; Work View is the target lens) → queue | — (no design-time assets) |
| Operational Intelligence | Overview *(future: Planning · Financials · Utilization)* | Playbooks · Configure *(future: Metrics · Targets · Display)* |

**Configure belongs to Studio.** When a module has Work/Studio, configuration is a Studio entry — never a duplicated header action or a free-floating button repeated across views. Operational Intelligence exposes exactly one Configure, in Studio.

Work Items has no design-time assets, so it omits the Work/Studio switch; its primary axis is the **process rail** (below).

---

## Operational Work Doctrine — the canonical chain

Operational work in Alloy is **generated by Business Processes and consumed through Work Views**. The canonical chain is:

```
Business Process → Work View → Queue Lane → Operational Artifact → Focus Panel / Record
```

Each link has a single, distinct role. Do not collapse them:

| Link | Role | Operator navigation? |
|------|------|----------------------|
| **Business Process** | Configuration — what work exists and how it moves (`lifecycle_builder_v1`). | Root anchor (the `/workspace` landing). |
| **Work View** | Configuration + **operator navigation** — the named lens over a process's work (filters, sort, queue/Focus-Panel layouts). | **Yes — the operator lens.** |
| **Queue Lane** | Execution / runtime — a structural slice of a `queue_definition` (e.g. `new_leads`). | **No.** Lanes are an implementation surface a Work View resolves onto, not something operators navigate by name. |
| **Stage** | Lifecycle / governance — membership, operating plan, status bindings. Maps onto queue lanes; it is not a navigation tier. | **No — not primary operator navigation.** |
| **Operational Artifact** | The unit of work in a lane — a record (opportunity/person/child) or a discrete `operational_tasks` row. | Selected, not navigated. |
| **Focus Panel / Record** | Authoritative detail and action surface. | Terminal. |

The **workspace runtime already implements this for record queues** (`web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` → `QueueBlock` → drawer). Business Processes are configured in `departments.metadata.lifecycle_builder_v1`; Work Views (`WorkViewConfigV1Stored` in `web/lib/lifecycle/workViewsConfigV1.ts`) carry filters, sort, and queue/Focus-Panel layout assignments and resolve onto queue lanes via `compat_queue_key`; the queue API applies the active Work View and the Focus Panel layout flows into the drawer.

> **Audit conclusion (June 2026).** "New Leads" is a **queue lane** (`enrollment_pipeline.queue_definition`), not a Work View. Work Views *organize and refine* queue lanes for operators; lanes themselves are execution. Stages are lifecycle/governance and map onto lanes — neither lanes nor stages are the operator's primary navigation. **Work Views are.**

### Two streams today

Work Items currently represents a **second stream** of operational work that does not yet flow through the same chain:

1. **Record-queue work** — opportunities/records sitting in a stage, surfaced via Work Views in the workspace runtime (queue → record drawer).
2. **Discrete operational tasks** — `operational_tasks` rows (follow-ups, stage operating-plan work, Task Assist, manual), surfaced in Work Items.

Business-Process-generated tasks already carry their process context in `metadata` (`department_id`, `lifecycle_stage_key`, `work_definition_key`, `lifecycle_provenance`), but manual / Task Assist tasks carry no Business Process link.

### Hybrid convergence plan

The approved model is **hybrid**. Work Items becomes the **process-first operational work entry point**:

- **Business Processes are the root** of the rail (never a parallel taxonomy invented for Work Items).
- **Work Views are the operator lens** within a process (rendered via the existing workspace runtime — a later phase). They are the long-term navigation tier.
- **Operational tasks group under the same Business Process structure**, derived from the task metadata above; **Stage** is an interim grouping that Work Views replace once rendered.

Convergence is phased: Phase 1 exposes the existing task metadata and groups tasks by real Business Process (with interim Stage subgroups). Rendering configured Work Views / record queues inside Work Items is a later phase and is **not** built yet.

### General / Cross-process fallback

Tasks without Business Process metadata — **manual tasks, Task Assist tasks, and any row lacking `department_id` / stage** — group under a single **General / Cross-process** bucket. This bucket is explicit and honest; we never fabricate a Business Process for them.

### Focus Panel / Record rule

Every operational work item must expose a **path back to its operating context** when linked record context exists (open the record / Focus Panel / drawer). See [Operational work returns to context](#operational-work-returns-to-context).

### Naming collision warning

Three similarly named concepts must **not** be conflated:

| Name | What it is |
|------|-----------|
| `WorkViewConfigV1Stored` | Business-Process **Work View** config — a record-queue lens (filters, sort, queue/Focus-Panel layouts). |
| `OperationalWorkView` | The parsed framework view of a single `operational_tasks` row (shape, category, provenance, context snapshot). |
| `OperationalTaskBpDimensions` | The flat, read-only projection of Business Process fields surfaced on a task API row for Work Items grouping. |

A future task-scoped "operational Work View" (Work Views that scope tasks, not records) does not exist yet; do not introduce a type that blurs the queue Work View and the task framework view.

### Perspective terminology (resolved)

The June 2026 terminology audit resolved the **Work View vs. Perspective** question:

- **Operator-facing language is `Work View`.** Do **not** introduce "Perspective" as a new operator-facing term anywhere in the UI.
- **`Perspective`, `RuntimePerspective`, and `PerspectiveConfig` are internal compatibility/runtime names only.** They are the legacy/derived representation (`queue_definition` lanes + Work View merge) and stay in code, not in operator copy.
- **Continue converging toward `Work View` in the UI.** Where operator-facing surfaces still read "Perspective," migrate them to "Work View"; do not add new operator "Perspective" labels.

---

## Work Items doctrine — Business Process → Work View → Operational Work → Focus Panel

Work Items is the **cross-process operational work entry point**, not a flat task list. Operators reason about work by the *Business Process* it belongs to, then the *Work View* inside it, then the individual *operational work* item, and they must always be able to return to the *record / Focus Panel*.

**Approved direction (target navigation):**

```
Business Process → Work View → Operational Work → Focus Panel / Record
```

- **Business Process is the root** of the rail — never a parallel taxonomy invented for Work Items.
- **Work View is the operator lens** under a process — the named cut operators navigate by (e.g. Enrollment → Today's Tours · Follow-ups · Missing Info). This is the **long-term primary navigation tier**, shared with the workspace runtime.
- **Stage is metadata, not navigation.** A task's `lifecycle_stage_key` is governance/lifecycle context carried on the artifact; it is **not** the long-term navigation tier. The Phase 1 rail groups by Stage as an *interim* seam only because configured Work Views are not yet rendered inside Work Items — Work Views replace Stage as the operator lens once available.
- **Operational Work** is the individual artifact (a discrete `operational_tasks` row, or — later — a record queue item).
- **Filters** (Open · Mine · Unassigned · Due today · Overdue · Completed) are a **secondary axis inside the selected process/view**, never the primary architecture.

**Source of truth.** Process, view, and stage structure comes from the existing Business Process metadata stamped on tasks — never fabricated. The structure is derivable from real data; do not invent categories for visual effect.

**Phase 1 metadata exposure (June 2026, shipped).** Business-Process-generated tasks carry `department_id`, `lifecycle_stage_key`, `work_definition_key`, and `lifecycle_provenance` in `metadata`. These are surfaced **additively** on the workspace tasks API row (`extractOperationalTaskBpDimensions` → `toOperationalTaskApiRow`) and on `MyTasksTaskRow` (no schema change; the full `metadata` jsonb is preserved). `web/lib/agent/taskAssist/myTasksProcessGroups.ts` groups by these real fields: **All work · one group per Business Process (`department_id`) with interim Stage subgroups · General / Cross-process**. `entity_type` is **no longer** used to fabricate a process group.

**General / Cross-process fallback.** Tasks without Business Process metadata — manual tasks, Task Assist tasks, and any row lacking `department_id` — group under a single explicit **General / Cross-process** bucket. We never fabricate a Business Process for them.

**Phase 2 gaps (next implementation phase).** (1) Configured Work Views are not yet rendered inside Work Items — Stage grouping is the interim stand-in for the Work View lens. (2) The client has **no Business Process / department *name* source** and **no Stage *label* source**, so process groups render with a generic fallback label and stages are humanized from the stage key — pass `processLabels` / `stageLabels` to `deriveWorkItemsProcessGroups` once a label source exists. (3) Workflow-created tasks may carry `lifecycle_stage_key` (via `context_snapshot`) but no `department_id`; they fall into General until a department is resolvable. (4) "Open record" does not yet route through the Work View / Focus Panel layout context (it opens the bare entity drawer).

---

## Operational Intelligence doctrine — categories/views → dashboard/playbook

Operational Intelligence is an **analytics workspace**, not a single dashboard body. It follows Work/Studio:

- **Work** — live operational intelligence, organized by analytics *view*. Overview today; the documented future category model is **Planning** (enrollment/capacity/staffing) · **Financials** (revenue/tuition/subsidy/payments) · **Utilization** (capacity/attendance/rooms/programs).
- **Studio** — the reusable analytics assets. Playbooks today; future **Metrics · Targets · Display / placement**. **Configure** lives here as the single configuration entry.

Categories/views sit on the left (or as a subordinate view strip); the selected dashboard/playbook renders on the right. Keep existing cards and analytics behavior; do not fabricate dashboards or categories that lack data.

---

## Operational work returns to context

Operational work must always expose a path back to the operating context. Wherever a work item, queue row, or analytics object carries linked record context, the surface must offer a way to **open the record / open the Focus Panel / drawer**, or navigate to the relevant work unit / record surface. Work Items implements this today via "Open record" (and the linked entity name) for opportunity-backed items, which opens the entity drawer. Operators should never reach a dead end away from the record.

---

## Shared primitives

| Concern | Primitive | Location |
|---------|-----------|----------|
| Modal shell / geometry / width | `AdminV2WorkspaceBosModalShell` | `web/app/adminV2/components/` |
| Header rhythm + action button classes | `OperationalModalHeader` (`OPERATIONAL_PRIMARY_ACTION_CLASS` / `OPERATIONAL_SECONDARY_ACTION_CLASS`) | `web/app/adminV2/components/` |
| Active-modal anchor (left nav) | `useActiveAdminV2WorkspaceModal` | `web/lib/adminV2/` |
| Mode switch | `AlloyModeSwitch` | `web/components/workspace/` |
| KPI / status strip | `CompactKpiStrip` | `web/components/workspace/` |
| KPI/status color semantics | `kpiSemantics` | `web/components/workspace/` |

**Color semantics** (`kpiSemantics.ts`) are platform-wide. States map to one meaning and one token; modules never invent decorative colors:

| State | Meaning | Token |
|-------|---------|-------|
| `attention` | needs attention / unread / overdue / errors | red |
| `pending` | needs decision / scheduled / due soon | `alloy-ember` |
| `ready` | ready to approve / ready to send | `alloy-juniper` |
| `done` | completed / saved / sent | `alloy-slate` |
| `info` | informational only (sparingly) | `alloy-blue` |
| `neutral` | default / no semantic weight | midnight muted |

Status accents are **semantic, not dominant** — e.g. an overdue work item carries a thin left accent, not a full red card outline.

---

## Reference implementations

The first four operational modules. Future modules inherit this shell rather than inventing layouts.

| Module | Host | Queue | Workspace |
|--------|------|-------|-----------|
| **Communications** | `CommunicationsWorkspaceShell` | Conversations · Announcements | Conversation detail · announcement composer |
| **Processing** | `ProcessingModal` → `PosWorkspaceLayout` | Incoming items · folder/category rail | Document/source detail · recognized fields · approval actions |
| **Work Items** | `MyTasksModal` → `MyTasksPanel` | Process rail (All work · Business Process → interim Stage · General / Cross-process; Work View is the target lens) → queue (filters as secondary axis) | Selected item detail · actions · Open record · empty state |
| **Operational Intelligence** | `AnalyticsModal` → `AnalyticsWorkspacePanel` | Work/Studio mode → views (Overview · Playbooks · Configure) | Dashboard · metric detail · playbook insight · configuration entry |

- **Communications** — header (Compose New) → KPI strip → mode switch → child underline tab strip (Inbox/Announcements under Work; Templates + settings link under Studio).
- **Processing** — header → left mode/section rail; Work lands on Incoming with folder rail + KPI strip.
- **Work Items** — header (New task primary, opens the panel's create form via a nonce) → KPI strip (Open / Due soon / Overdue) → **process rail** (Business Process groups with interim Stage subgroups, plus General / Cross-process; Work View becomes the lens in Phase 2) → queue (search + secondary filter rail + queue header + compact rows) → workspace (selected item detail + actions + Open record). Overdue carries a thin left accent, never a full red card.
- **Operational Intelligence** — header (Close only) → Work/Studio mode switch → view underline tabs. Work → Overview; Studio → Playbooks (pack rail + sections) and Configure (single entry → analytics settings). No duplicate Configure affordances.

---

## Left nav active state

The left rail is the operator's anchor and must reflect the **active workspace** — including open operational modals, not just routes.

- When an operational modal is open, its sidebar item is the **active anchor** (`useActiveAdminV2WorkspaceModal()` → `adminv2-nav-link--active`): Communications → Inbox, Processing → Processing, Work Items → Work Items, Operational Intelligence → Analytics.
- Route-based highlights (Workspace / lifecycle) **defer** while a modal is open, so the rail shows a single active anchor.
- Route-based active state is never broken: with no modal open, it behaves exactly as before. SSR / first client render is always "no modal" → no hydration drift.

---

## Rules for future modules

1. Mount in `AdminV2WorkspaceBosModalShell`; never set custom width.
2. Use `OperationalModalHeader` with icon + title + (optional) actions — **no subtitle/prose**; never hand-roll the header bar or invent a per-module header.
3. Stack KPI strip → mode switch → child nav → body, in that order.
4. Follow the **queue → workspace** model in the body (queue header + selection → detail/empty); a single-column queue is an acceptable waypoint, not a permanent shape.
5. Reuse `CompactKpiStrip` + `kpiSemantics`; never fabricate metrics or invent colors.
6. If the module has design-time assets, use `AlloyModeSwitch` and keep child sections subordinate to the mode layer.
7. Register the modal in `workspaceModalCoordinator` and reflect it in the **left nav active state** via `useActiveAdminV2WorkspaceModal()`.
8. Left app nav order is fixed: **Workspace · Inbox · Processing · Work Items · Analytics**.

If a future surface genuinely cannot fit this grammar, change the doctrine deliberately — do not fork a one-off layout.
