# Workspace, work unit, scope, and record — doctrine

## Separation of concerns

| Concept | Role |
|---------|------|
| **Record** | **Truth, inspection, editing** — authoritative state, history, and structured detail. |
| **Work unit** | **Execution** — where operational work is done today (queues, checklists, assignments in motion). |
| **Department** | **Coordination and throughput** — lane of responsibility spanning multiple work units and people. |
| **Queue** | A **projection** of work within a work unit (filtered/sorted view), **not** the record itself. |
| **Drawer** | **Lightweight inspect / quick act** — fast path; may show a **subset** of resolver payload. |
| **Full record workspace** | **Deeper editing and context** when the drawer is insufficient. |

**Queue preview ≠ record truth** — Row summaries are optimized for triage; the resolver-backed record is authoritative when decisions matter.

## Actions

One **action definition** (same underlying capability) may appear in **queue**, **drawer**, or **full record** depending on **configuration** and context — without duplicating business logic in three places.

## Org model

| Concept | Definition |
|---------|------------|
| **Org** | Tenant / company boundary — data isolation and billing. |
| **Location** | **Physical or geographic operating site** (service address, facility, etc.) — distinct from department. |
| **Department** | **Functional lane of work** (e.g. scheduling, billing, customer success) — **not** the same as GL/cost-center “department codes.” |
| **Work unit** | **Configurable execution surface** within a department **and** within a **scope** — not a hardcoded vertical screen. |
| **Exception work unit** | A work unit whose **primary purpose** is **exception / attention** work (risk, follow-up, intervention) rather than steady-state throughput. Same abstraction as other work units; **queues** and optional **exception-type** lanes differ. **Needs Attention** is the canonical first-class example. |
| **Scope** | Where a user or surface **may operate** (org-wide, location set, customer portfolio, etc.) — **role alone is insufficient** long term. |

## Access (directional)

Future access checks should combine:

- **Role** (coarse membership / admin vs ops patterns),
- **Scope** (which subset of org data),
- **Capabilities** (fine-grained permissions),
- **Work unit membership** (which execution surfaces).

Today the codebase may only implement a **subset** (e.g. org-scoped `user_roles`); doctrine states the **target composition** without requiring immediate schema completion.

## Multiplicity

- **One record may appear in multiple work units** (e.g. handoff, cross-functional work) — routing is **config + resolver**, not a single permanent “screen owner.”
- **Records in multiple contexts** — The same underlying **record** (e.g. a job) may legitimately appear in **different operational contexts** at once: a throughput lane, an **exception** lane, and a full-record workspace. Context changes **what the UI emphasizes** (queue vs truth); it does **not** fork entity identity. Schema may still use a **single primary** operational FK (e.g. `work_unit_id`) while **projections** include the record in exception queues by predicate.
- **Needs Attention (first-class)** — Treat **Needs Attention** as a **first-class exception work unit** in product language: a dedicated place for **exception-driven** queues (not a generic “filter on the main list”). Implementation may align a stable **`needs_attention`** work-unit key with **exception-type** lanes inside that surface.
- **Multi-location orgs** must be supported **without fake sub-orgs** — locations attach to customers, jobs, or other entities as appropriate; org stays the tenant.

## Relationship to schema today

See [implementation-gap-audit.md](./implementation-gap-audit.md) for how `departments`, `work_units`, `jobs.work_unit_id`, and RLS align or fall short of this doctrine.

**Terms:** [glossary.md](./glossary.md)

## Presentation shell (Admin V2 — current standard)

The following describes the **current** workspace **chrome** and **layout mechanics** under `/adminV2/workspace/**` after the **presentation-only** Admin V2 workspace refactor. It is the **Admin V2 workspace standard as implemented today** and the **baseline for the next iteration** — not a promise of final product design. Product iteration may revise surfaces while honoring the same backend **contracts** (queues, resolver payloads, actions, layout registry payloads).

### Shared shell layout

- **`WorkspaceShellLayout`** (`web/components/admin/workspace/WorkspaceShellLayout.tsx`) is the **preferred** shared pattern for **org**, **department**, and **work-unit** workspace pages. Structural columns, scroll boundaries, and rail mounting should converge here rather than one-off forks per route.

### Scroll and rail behavior

- **One primary workspace scroll surface** — the main operational column owns vertical scrolling (single scroll owner with explicit surface labeling / CSS variables). Avoid stacking independent scroll contexts for primary queue/control content.
- **Desktop command/action rail** — on sufficiently wide viewports, contextual commands/actions live in a **sticky** right-hand column aligned with workspace chrome. At **narrower breakpoints** the rail **stacks below** primary content rather than pinning in a cramped side column.

### Actions rail visibility

- When **no** actions are resolved for the current context, **the rail collapses**. There is **no** persistent placeholder panel (no standing “No configured actions” tombstone) purely to preserve white space layout.

### KPI / scorecard density

- KPIs surface as a **compact orientation strip** — a shallow measurement band, not heavy nested cards. Default presentation targets **four to five visible metrics at a time** unless layout configuration explicitly warrants more density. Semantic and data sourcing rules remain in **`docs/specs/workspace-kpi-doctrine.md`**.

### Ambient layer

- The **background field** stays **near-white / very light neutral** with **slate-forward** ambient texture (dots/specs/sparse wash) at **low contrast**. The intent is **operational continuity** (“where am I”), not illustrative or decorative canvas. Ambient tweaks are **presentation-only** and **do not** substitute for resolver/visual-context tokens that carry operational meaning.

### Contracts preserved by this refactor

The shell refactor was **presentation-layer only**: **`work_units.queue_definition`** interpretation, **action inventory and resolution**, **workspace layout/registry** payloads, resolver shapes, and **HTTP API** contracts were **not** changed by swapping scroll/rail/chrome. Behavioral changes belong in resolver, configuration, or API layers—not in workspace shell CSS/layout alone.

### Living code anchors

| Concern | Indicative path |
|---------|----------------|
| Shell layout composable | `web/components/admin/workspace/WorkspaceShellLayout.tsx` |
| Workspace route segment | `web/app/adminV2/workspace/layout.tsx`; client providers beside it |
| App shell wiring + workspace scroll host | `web/app/adminV2/components/AdminV2Shell.tsx` |
| Workspace ambient visuals | `web/app/adminV2/components/WorkspaceAmbientLayer.tsx`; scoped rules in `web/app/adminV2/adminV2.css`, `workspace.css` |

**Implementation companion:** [`docs/implementation/workspace-v2/WORKSPACE_SYSTEM.md`](../implementation/workspace-v2/WORKSPACE_SYSTEM.md) (routes, hierarchy).

### Queue row preview (Admin V2 — current standard)

- **Config selects a registered template; code owns the template.** `work_units.queue_definition` (validated as QueueDefinition v1) exposes **`ui.row_preview.variant`**, **`ui.row_preview.fields`**, and **`ui.row_preview.actions`**. Only **approved** variants implemented in code (e.g. **`crm_compact`**, **`basic`**) are valid — this is **not** an arbitrary page-builder row layout.
- **Triage vs truth:** Queue rows are for **sorting and next action** in context. The **resolver-backed record** and **drawer** remain **authoritative** for inspection and decisions when precision matters.
- **Implementation notes:** Normalization via `getQueueUiConfig()`; work-unit page mapper builds `semanticCrmCompact` / basic subtitles from row enrichment + field gates. See [`docs/implementation/workspace-v2/WORKSPACE_SYSTEM.md`](../implementation/workspace-v2/WORKSPACE_SYSTEM.md) § Queue row preview.

### Work-unit queue record row (CRM compact — fact groups)

This subsection is the **presentation doctrine** for **`crm_compact`** queue rows on **work-unit** surfaces. It does not change resolver semantics, queue membership, or actions — only how a row is read in triage.

**Three zones (left → middle → right):**

1. **Left — identity / next step** — family or opportunity title, status pill, next-step strip, attention or stale cue when present.
2. **Middle — fact groups** — **field-column grids** for contact, timing, and children/program (each configured field is a column: muted label above, value below). Optional **meta** lines remain label + value (`room`, `age_band`). No sentence-style middots in the primary CRM fact layout.
3. **Right — actions** — Open / Call / Email / configured row actions; alignment and behavior stay independent of fact groups.

**Fact group pattern (middle zone):**

- **Column layout (contact, timing, children):** `WorkUnitQueueCrmFactGroupVm.columnGrid` carries `{ headers[], rows[][] }`. Each header uses **`row_preview.field_labels`** keys (`primary_contact`, `phone`, `email`, `desired_start_date`, `tour_date`, `child_name`, `program`) merged with `DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS`. **No** section title row for **Timing**; desired start and tour are **peer columns** with their own labels. **Empty** gated fields show **`—`**. Multi-child: **Child** and **Program** columns with one value row per child (extra children collapse to `+N more`). Program-only (single column): header **Program** via `program` label, not `children_programs`.
- **Flat contact only:** When enrichment cannot split name/phone/email but supplies a snippet, the group uses a single **legacy** value line under the **Contact** label (middots allowed in that fallback only).
- **Children / programs:** Built in `buildCrmCompactWorkUnitFactGroups` (`web/lib/ui-v2/crmQueueRowPreviewPresentation.ts`). Program text is still deduped when age is redundant (`dedupeRedundantProgramAgeInPreview`).
- **Timing:** Date-only values use **`MM-DD-YYYY`** where applicable (formatters in `web/lib/adminFormatters.ts`).
- **Meta:** `room` / `age_band` keep **group `label` + `lines`** (no column grid).

Optional **meta** groups (`room`, `age_band`) may append when non-empty; they use the same label-above-value classes.

**Structured VM:** `CrmCompactRowSemanticSlots.crmFactGroups` is an ordered list of `WorkUnitQueueCrmFactGroupVm` (`web/lib/ui-v2/workspace-types.ts`). **`QueueBlock`** (`web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`) renders them with **`CrmWorkUnitFactGroup`** / **`CrmFactColumnGrid`**. If `crmFactGroups` is absent (older payloads), **`LegacyCrmCompactQueueMiddle`** prefers the same column layout when slots expose structured fields; otherwise middot/string fallbacks remain.

**CSS:** Column layout: `adminv2-ws-queue-fact-column-grid`, `adminv2-ws-queue-fact-field-col`, `adminv2-ws-queue-fact-col-head`, plus existing `adminv2-ws-queue-fact-value` / `-line`. Legacy parts layout retains `adminv2-ws-queue-fact-line--parts`, `adminv2-ws-queue-fact-part-sep` (middots). Shared type tokens: `--ws-type-fact-group-label-size`, `--ws-type-fact-value-size`, `--ws-type-crm-record-title-size`, etc. (see `web/app/adminV2/components/workspace/workspace.css`). Company workspace department tiles reference `--ws-type-dept-tile-name-size` and `--ws-type-dept-tile-desc-size` for the same hierarchy family.

### CRM queue row — notes footer (latest note only)

- **Single preview line:** The footer shows **at most one** activity/note line. For multi-line `_notes_preview` blobs, the formatter **`chooseLatestDatedNoteLine`** (`web/lib/admin/activityTimelineFormat.ts`) picks the line with the greatest embedded date/timestamp; if no line is dated, the **last** line is used. There are **never** multiple note lines stacked in the CRM queue row.
- **Display order:** **`{datetime} · {note body}`** (date first) via `formatOpportunityQueueNotesPreview` for scan-first triage.
- **Datetime format:** **`MM/DD/YYYY h:mm A`** in the viewer/org-resolved IANA timezone (`formatQueueNoteDateTime`). **No comma** between the date and time (e.g. `04/29/2026 9:11 PM · …`).
- **Typography:** `familyNotePreview` on `CrmCompactRowSemanticSlots` carries `{ timestamp, body }` so the **timestamp** can render **semibold** and the **body** **regular** weight (`QueueBlock` — classes `adminv2-ws-crm-queue-preview__note-ts` / `__note-body`). Plain `familyNote` remains the composed string for backward compatibility.

### Cross-surface typography roles (record cards)

Use this **role** vocabulary when adding or tuning compact record/deck surfaces (work-unit queues, department paired panels, workspace department tiles, dense settings cards):

| Role | Intent | Typical use |
|------|--------|-------------|
| **Section label / eyebrow** | Muted section or group cue | Fact group labels, “Notes”, settings group headings |
| **Record title** | Primary identity — clearly larger than fact values | CRM compact primary name; department tile name (tile scale may be larger than embedded queue row) |
| **Fact label** | Muted, readable, not microscopic | `children_programs`, `timing`, contact group titles |
| **Fact value** | Scannable data | Contact line, program lines, timing values |
| **Meta / helper** | Secondary explanation | Last activity line, stale hint, tile description |
| **Action control** | Button/chip label | Open, future composer-driven actions |

**Rules:** Avoid arbitrary **all caps**; keep **titles larger than data**; **settings** may stay slightly denser than operational rows but should share **the same role ordering** (title → values → meta → actions). Prefer **configuration and shared tokens** over one-off pixel values.

### Queue row quick actions (Call / Email → Message)

- **`ui.row_preview.actions`** in the queue definition decides **which** built-in slots appear (`open`, `call`, `email`). That selection is **config-driven**.
- **Implementations** for **`call`** and **`email`** today are **local quick actions** (e.g. `crm_tel` / `crm_mailto` with `tel:` / `mailto:` payloads) wired in work-unit mapper code — not arbitrary URLs from config.
- A future **single “Message”** control should open the **communications composer** with **channel choice**, driven by an **action definition / registry** entry (same pattern as other queue actions), **not** by hardcoding another special case beside `crm_tel` / `crm_mailto`. Product should replace or alias the two slots via **config** once the composer path exists.

### Count consistency (Admin V2 — current standard)

- **Authoritative operator counts use exact semantics** where the UI presents a number as **the** count for a bucket (pills, badges, headline totals tied to a queue scope). **Planned / estimated** counts (e.g. PostgreSQL planner estimates) are **not** acceptable for that role unless the UI **explicitly** frames them as approximate or non-authoritative.
- **Same scope, same number:** Counts shown on **org / department / work-unit** workspace surfaces for the **same** queue or aggregation scope **must not contradict** each other after refresh (within normal race windows). When performance requires staged loading, prefer **empty / deferred / “…”** states over a wrong integer.
- **Performance is real; trust comes first** for operational triage. Batch or shared queries and honest loading states beat **fast wrong** numbers on pills and KPI-style readouts.

### Lifecycle / status pills, “Other,” and reconciliation (canonical)

- **Pills are derived** from `work_units.queue_definition` (+ UI sections / `getQueueUiConfig`). There is **no** separate pill configuration table; do not hardcode vertical-specific status lists in page code.
- **All-records** (primary / broadest non–`needs_attention` lane per definition) is the **canonical scope total** for “how many records are in this work unit” comparisons.
- **Reconciliation:** `All` (all-records lane) **=** sum of **status-filtered** lifecycle/stage lane counts **+** **Other** (remainder = opportunities whose `status_key` is not in any stage lane’s status `in` set). **Non-status** lanes (e.g. date slices) are **not** part of that sum.
- **Needs Attention** is a **first-class exception overlay** (typically `needs_attention` queue). It **may overlap** lifecycle stages; it is **not** a bucket in the `All = stages + Other` sum.
- **Other** is a **configuration / data coverage signal** — treat nonzero Other as “status vocabulary or queue filters don’t cover some in-scope records,” not as a generic UI bug.
- **KPI strip:** On lifecycle-heavy work units, the **generic** KPI strip is **suppressed** when stage/status **pills** already summarize the context (`shouldSuppressWorkUnitKpiStrip`); placements remain valid for future non-pipeline work units.
- **Paired throughput | attention panels:** Use **`WorkspacePairedOperPanelsGrid` / `WorkspacePairedOperPanel`** and `.adminv2-ws-paired-oper-*` (see `WORKSPACE_SYSTEM.md`) so department and similar surfaces stay visually aligned without one-off CSS.

### Visual system (Admin V2 — workspace)

High-level palette roles for workspace chrome (token detail: [`docs/implementation/workspace-v2/VISUAL_CONTEXT_SYSTEM.md`](../implementation/workspace-v2/VISUAL_CONTEXT_SYSTEM.md)):

- **Background / ambient** supports **operational clarity** (continuity, depth, calm) — not decorative illustration.
- **Bend Pine** — primary **healthy / active / throughput** operational state where product uses green-family emphasis.
- **Alloy Blue / Midnight** — **system**, **workflow**, and **control** accents (rails, chrome, procedural emphasis).
- **Amber / rust family** — **exception**, **attention**, **risk**, **stale**, or **failure-adjacent** states — **not** undifferentiated “everything is red” fields.
- Avoid **wide red or amber washes** unless the surface is intentionally an **exception** or alert zone.

## Future AI compatibility (not implementation now)

**AI operates within doctrine; it does not replace it.** Automated agents may **suggest** or **tune**:

- Overview **layout** or band visibility (within allowed templates),
- **Queue prioritization** and ordering hints,
- **Work unit grouping** or routing suggestions,
- **Signal thresholds** (what counts as urgent),

based on behavior and telemetry. Human-approved **config and governance** remain authoritative; AI proposals are constrained by the same resolver, scope, and permission models as the rest of the product.
