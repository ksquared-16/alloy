# V2 workspace visual bridge — real blocks × Admin V2 language

**Status:** Implementation-oriented bridge spec (staging). **Purpose:** Define how the **production workspace block system** (`/admin/workspace`, `WorkspaceRenderer`, `web/lib/workspace/*`) should **map into** the **visual and interaction hierarchy** already established under **`/adminV2`**—without replacing the block model, without a net-new redesign, and **without** turning staging into a static mock.

**Doctrine:** [`docs/architecture/README.md`](../architecture/README.md). **Block system:** [`web/lib/workspace/types.ts`](../../web/lib/workspace/types.ts), [`web/lib/workspace/registry.ts`](../../web/lib/workspace/registry.ts). **Admin V2 reference implementation:** [`web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx`](../../web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx), [`web/app/adminV2/components/workspace/workspace.css`](../../web/app/adminV2/components/workspace/workspace.css).

---

## 1. Visual zones (Admin V2 department grammar)

The department workspace in Admin V2 is **not** a flat stack of cards. It is a **zoned operating surface** with explicit roles. The following zones are **fixed by layout** in `DepartmentWorkspace` + `workspace.css` (class names preserved for reuse).

| Zone | Admin V2 location (reference) | Purpose |
|------|------------------------------|---------|
| **Ambient field** | `AdminV2Shell` workspace wrapper — radial/linear washes on `data-adminv2-workspace-ambient-root` | Page-level depth and continuity; panels sit *on* this field, not as disconnected white boxes. |
| **Control deck** | `.adminv2-ws-dept-v2-control-deck` inside **primary column** | Compression band: orientation, risk, and light metrics before work. Sub-stacks below. |
| **Top stack** | `.adminv2-ws-dept-v2-top-stack` inside control deck | **Briefing** (headline + optional “Briefing” tooltip), optional **AI awareness** line, **signal strip** (operational alerts / counts as signal cards). |
| **KPI strip** | `KPIBlock` immediately after top stack inside control deck | Business / ops metrics strip (Admin V2 KPI grammar). Distinct from signals: slower-moving or rollup metrics. |
| **Operational row** | `.adminv2-ws-dept-v2-operational-row` | **Throughput** and **attention** lanes side-by-side (grid); this is where **queues** dominate visually. |
| **Throughput lane** | `.adminv2-ws-dept-v2-lane--throughput`, `data-ws-lane-kind="throughput"` | Primary work lane: main queue, highest visual weight (`QueueBlock` `variant="primary"`). |
| **Attention lane** | `.adminv2-ws-dept-v2-lane--attention`, `data-ws-lane-kind="attention"` | Secondary / exception lane: second queue when present (`QueueBlock` `variant="secondary"`); hidden when no secondary queue. |
| **Workflows strip** | `.adminv2-ws-dept-v2-workflows-strip` | Optional **WorkBlock** summary — checklist / follow-up work *below* the operational row (not competing with throughput). |
| **Command rail** | `.adminv2-ws-dept-v2-command-column` + `.adminv2-ws-dept-v2-rail--command-shell`, `data-adminv2-workspace-command-rail` | Full-height **~25%** column: decisions and **Actions** (`ActionsBlock`), aligned with department shell grammar. |

**Page split:** Primary column **~75%** | Command column **~25%** (`.adminv2-ws-dept-v2-page-split`, `grid-template-columns: minmax(0, 3fr) minmax(220px, 1fr)`).

**Containment:** Centered max width (e.g. `--ws-dept-page-max-width: 1520px`), horizontal padding from tokens — avoids full-bleed “dashboard soup.”

---

## 2. Block type → zone mapping

Production block types live in `web/lib/workspace/types.ts`. This table defines **where each type belongs** when rendered in Admin V2 language, and **how prominent** it should be for the **cleaning Operations** first slice.

| Block type | Allowed zones (Admin V2) | Role | Cleaning Operations (first slice) |
|------------|---------------------------|------|-----------------------------------|
| **`signals`** | Control deck → **top stack** → signal strip (or compact inline if only 1 metric) | Fast operational awareness: counts, thresholds, “needs attention” | **Prominent but compact** — e.g. unassigned job count as one signal card or strip chip, not a giant panel. |
| **`queue`** | **Throughput** lane (primary); optionally **attention** lane (secondary queue) | Dominant work surface: drillable list / entry points | **Dominant** — “Unassigned Jobs” (and deferred work-unit rows) should use **primary queue chrome** (lane deck, row height, scroll cap from `workspace.css`). |
| **`kpi`** | Control deck → **KPI strip** (`KPIBlock`) | Rollups, slower metrics | **Supportive / compact** — placeholder strip until real metrics exist; same *slot* as Admin V2 KPI, minimal height. |
| **`actions`** | **Command rail** (`ActionsBlock`) | Navigation, admin commands, “open system” links | **Always visible in rail** — e.g. “Manage work units”; avoid duplicating as full-width buttons in the primary column. |
| **`context`** | **Below** operational row **or** collapsed into briefing area as static copy | Doctrine copy, “what is this surface,” light relationships | **Supportive** — short paragraphs, lower visual priority; optional collapse on small viewports. **Not** competing with throughput lane. |

### Dominant vs supportive (Operations)

- **Dominant:** **`queue`** (throughput lane).
- **Strong but narrow:** **`signals`** (top band — one clear number + label).
- **Supportive:** **`kpi`** (placeholder strip), **`context`** (footnote-style support).
- **Persistent utility:** **`actions`** (right rail only).

---

## 3. Cleaning Operations — target visual composition

**Scope:** Real routes and data already on staging:

- Department: **Operations** (`departments.key = operations`, layout from `getDepartmentWorkspaceLayout("operations")`).
- Work unit entry: **Unassigned Jobs** → `/admin/workspace/dept/:departmentId/unassigned`.
- Record: **Admin drawer** + RRS (`surface=drawer` / `overview` tab) + full job page as today.

### Department surface (`/admin/workspace/dept/:id`)

| Area | Intended content (visual + data) |
|------|----------------------------------|
| **Top band (control deck)** | Optional static **briefing kicker** (“Operations” / department name) + **signals**: *Jobs with no work unit* count from `metrics.jobs.unassigned_count`. *No AI headline required for slice 1* — use placeholder headline pattern from Admin V2 (`Awaiting focus summary`) or a one-line static title derived from config. |
| **KPI strip** | **`kpi`** block: Admin V2 `KPIBlock` shell with placeholder message (low height). |
| **Main work area (throughput)** | **`queue`** block: primary `QueueBlock` — **Unassigned Jobs** as primary drill row (link to unassigned route); remaining work units as secondary rows inside same list **or** reserved for future **attention** lane if a second queue is promoted. |
| **Attention lane** | **Omitted** until a real secondary queue exists (e.g. “Today’s jobs”). Hide lane or use `adminv2-ws-dept-v2-lane--attention--hidden` pattern. |
| **Side rail** | **`actions`** block only (links to system destinations). Matches `ActionsBlock` in `DepartmentWorkspace`. |
| **Lower / supporting** | **`context`** block: 1–2 short paragraphs under the operational row (or after workflows strip if WorkBlock is added later). |

### Work unit surface (`…/unassigned`)

**Target:** Reuse **`WorkUnitWorkspace`** shell grammar from Admin V2 (`web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx`) — same zones (control deck, operational row, rail). **Data:** existing jobs table + `openDrawer` / RRS.

| Area | Intended content |
|------|------------------|
| **Top band** | Lane kicker (“Unassigned Jobs”) + optional single **signal** (count or “all clear”) from same metric or list length. |
| **Main work area** | **Queue** = jobs table with Admin V2 **primary** queue list styling (row chrome, hover, selection affordance). |
| **Side rail** | **Actions** — e.g. refresh, link to full Jobs admin, future “bulk assign” (deferred). |
| **Context** | One line: bridge copy (“API: `unassigned_work_unit=true`”) only if useful for operators; otherwise omit to reduce noise. |

### Record (drawer / full)

**Unchanged in this bridge** — already RRS-grounded. Visual alignment is **inspector / record** shells in Admin V2 (`RecordWorkspace`) as a **later** pass; do not block department/work-unit bridge.

---

## 4. Reuse plan

### Reuse from `/adminV2` (visual / layout)

| Asset | Reuse |
|-------|--------|
| `workspace.css` — department v2 grid, lanes, rail, control deck, signal/KPI/queue chrome | **Import or extract** shared classes into a path both `adminV2` and `/admin/workspace` can load (e.g. shared `@/app/adminV2/components/workspace/workspace.css` or future `web/styles/workspace-v2-shell.css`). |
| `DepartmentWorkspace` **structural** markup (page split, column wrappers, `data-ws-*` attributes) | **Template** for a new shell component used by production workspace, e.g. `ProductionDepartmentWorkspaceShell`, fed by **real** props instead of `DepartmentWorkspaceModel` mock. |
| `SignalBlock`, `KPIBlock`, `QueueBlock`, `ActionsBlock` (adminV2 blocks) | **Adapter layer:** map `WorkspaceRuntimeData` + block config → the **view-models** these components expect (`SignalVm`, queue models, etc.), *or* restyle production `web/components/admin/workspace/blocks/*` to **match CSS classes** of Admin V2 blocks (lower duplication if VMs are heavy). **Prefer:** shared **presentation** classes + thin production wrappers. |
| Token contract (`deptRootStyle` / `wuRootStyle` CSS variables on root) | **Required** on production shell root so panels match Admin V2 material (`--d-panel`, `--d-rail`, etc.). |
| `AdminV2Shell` ambient wrapper | For **parity**, `/admin/workspace` routes could eventually mount under a shell that applies the same ambient root as `adminV2` workspace route — **defer** if it implies large layout churn; **minimum** is importing workspace CSS + token root on the department page content. |

### Reuse from production workspace (logic / data)

| Asset | Reuse |
|-------|--------|
| `getDepartmentWorkspaceLayout` + `DepartmentWorkspaceLayout` | **Source of truth** for block order and config; shell only **places** blocks in zones — **do not** hardcode Operations content in JSX. |
| `WorkspaceRenderer` | **Evolve** into “block dispatcher” that renders **either** flat sections (today) **or** **zone-aware** children passed from a thin `DepartmentWorkspacePage` orchestrator. |
| `SignalsBlock`, `QueueBlock`, etc. under `web/components/admin/workspace/blocks/` | **Restyle** (add Admin V2 class names, markup hooks) rather than rewriting business logic. **Keep** fetch logic in page / future hooks. |

### Restyle vs rewrite

- **Restyle:** Production block components + `WorkspaceChrome` breadcrumb/header (keep data attributes for tests).
- **Rewrite:** Avoid duplicating queue table logic; avoid a second registry for Operations-only UI.
- **Deferred:** AI briefing / `aiSummary`, `WorkBlock` workflows, secondary attention lane with real data, `RecordWorkspace` parity for drawer, drag/drop layout builder, mounting entire `/admin` under `AdminV2Shell`.

---

## 5. Build guidance

### Implementation order (recommended)

1. **Shared shell wrapper for department page**  
   Introduce a **production** shell component that mirrors `DepartmentWorkspace` **DOM structure** and pulls in `workspace.css` + token root style. **No mock model** — props: `title`, `breadcrumb`, `children` per zone *or* single render-prop API.

2. **Zone-aware layout orchestration**  
   Map registry blocks to zones: e.g. `signals` + `kpi` → control deck; `queue` → throughput; `actions` → rail; `context` → below operational row. Can be a small function `layoutBlocksToZones(layout)` returning buckets.

3. **Queue block visual upgrade**  
   Highest UX leverage: the **throughput lane** is what operators stare at. Apply **Admin V2 `QueueBlock` primary variant** styles (or equivalent classes) to the real unassigned entry + work-unit list on **department** and the **jobs table** on **work unit** page.

4. **Signals**  
   Map `jobs.unassigned_count` → **one** `SignalVm`-shaped object or reuse `adminv2-ws-signal-card` markup for parity.

5. **Actions + KPI + context**  
   Move **actions** into rail layout; **KPI** placeholder into `KPIBlock` shell; **context** as compact prose below.

6. **Work unit route**  
   Repeat shell with `data-ws-surface="work_unit"` and work-unit-specific kicker.

### Upgrade first (highest leverage)

| Priority | Component / area | Why |
|----------|------------------|-----|
| 1 | **Department + work unit shell** (grid, rail, tokens) | Fixes “flat” feel immediately; one consistent frame for all blocks. |
| 2 | **Queue / throughput presentation** | Core job of the workspace; aligns with explored hierarchy. |
| 3 | **Signals in top stack** | Fast validation that real metrics read as “operational,” not spreadsheet. |
| 4 | **Command rail actions** | Clears primary column clutter; matches Admin V2 decisions strip. |

### Principle (single sentence)

**The real workspace system should stay config- and data-driven; Admin V2 supplies the *geometry*, *material*, and *hierarchy* in which those blocks are placed—not a replacement for `web/lib/workspace`.**

---

## Appendix — quick reference: Admin V2 files

| Concern | File |
|---------|------|
| Department zone structure | `web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx` |
| Work unit zone structure | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Workspace layout CSS | `web/app/adminV2/components/workspace/workspace.css` |
| Workspace demo / levels | `web/app/adminV2/workspace/page.tsx` |
| Shell ambient (workspace route) | `web/app/adminV2/components/AdminV2Shell.tsx` (`isWorkspaceV2Route`) |
| Production blocks | `web/components/admin/workspace/blocks/*.tsx`, `WorkspaceRenderer.tsx` |
| Production layout registry | `web/lib/workspace/registry.ts` |
