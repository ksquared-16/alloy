# Alloy OS — Experience Builder / Layouts Architecture

**Sprint:** June 2026  
**Status:** Design / architecture — **no implementation until spec + mockups approved**  
**Route target:** `/settings/layouts`  
**Depends on:** Configuration Mode shell (Context → Queue → Workspace → BOS), [`presentation-runtime-doctrine.md`](../../platform/operator/presentation-runtime-doctrine.md), [`experience-builder-doctrine.md`](../../platform/operator/experience-builder-doctrine.md), [`universal-card-system.md`](../../platform/operator/universal-card-system.md)

---

## Executive summary

`/settings/layouts` is the **Alloy Experience Builder** — the place operators configure what runtime surfaces show. It is **not** a generic page builder, blank canvas, or drag-anywhere web editor.

The builder follows the locked Configuration Mode pattern:

**Context → Layout Queue → Layout Workspace → BOS**

The workspace must **mirror the frontend runtime** as closely as possible. Operators configure Alloy runtime presentation — not HTML.

This sprint answers architecture questions, audits reuse, proposes data model extensions, and delivers mockups. **No code, migrations, or editor implementation yet.**

---

## Doctrine

| Rule | Detail |
|------|--------|
| **Runtime-first** | The workspace renders the real surface (or faithful structural twin). Edit affordances appear in place — not in a separate “builder app.” |
| **LayoutDoc is truth** | Published layout documents drive production runtime. Draft/publish lifecycle on `entity_layouts`. |
| **Catalog-driven, not freeform** | Cards come from platform **blueprints**. Fields come from canonical **field catalog**. Grid snap only — no pixel drag. |
| **Surface-specific models** | Queue rows ≠ Focus Panel cards. Each surface family has its own editor vocabulary. |
| **Assignment is external** | Layouts are authored here; **Processes** assigns layouts to stages/work views. Builder shows *where used*, not stage logic. |
| **System-owned where appropriate** | Activity mode content is **system-generated in v1**. Operators configure Summary/Work; Activity visibility is toggle-only. |
| **Configuration Mode visual law** | White canvas, Bend Pine primary/active, stone/forge borders — same tokens as Processes/Statuses. |

Aligned with Experience Builder V2 runtime-editing sprint: *the published surface and editable surface should look almost identical.*

---

## Information architecture

### Configuration Mode mapping

| Layer | Layouts meaning |
|-------|-----------------|
| **Context** | “Experience Builder” title · surface-family filter (Queue / Focus Panel / future) · entity filter · New Layout · search |
| **Layout Queue** | Layout list for selected filters — name, surface, entity, draft/published, default badge, last edited |
| **Layout Workspace** | Runtime-faithful editor for selected layout — cards/fields/queue slots · preview · draft toolbar · publish |
| **BOS** | Persistent platform rail |

### What `/settings/layouts` shows first (Q1)

**Default landing:** Context bar + **Layout Queue** filtered to **Focus Panel · Enrollment · Lead** (most common operator path), with one layout pre-selected if a published default exists.

Queue columns (left → center optional → right workspace):

1. **Surface family** (optional nav column): Queue surfaces · Focus Panel · *(future: Dashboard, Documents, …)*  
2. **Layout list**: layouts matching family + entity filter  
3. **Workspace**: selected layout editor or guided empty state

If no layouts exist for the filter, workspace shows **guided empty state** (not blank chrome): “Create your first Lead Focus Panel layout” with surface + template chooser inline.

### New layout flow (Q2)

```
New Layout
  → Choose surface family + variant
      (Queue: Compressed / Comfortable / Expanded preview row)
      (Focus Panel: Summary / Work / Activity*)
  → Choose entity / context (Lead, Person, Child, Family, Waitlist candidate, …)
  → Start from template OR blank
  → Workspace opens with card catalog prompt
  → Add cards from blueprint catalog
  → Configure cards + fields
  → Save draft (auto on change, explicit Save)
  → Publish
  → Assign in Processes (link out)
```

\* **Activity:** selectable as a surface *variant* for documentation/preview, but v1 authoring is **read-only** (see Activity decision below).

**Blank layouts:** **Yes** — blank means *no cards yet*, not “draw your own UI.” Guided empty state + card catalog. Minimum viable blank still includes platform chrome (Focus Panel header, mode tabs where applicable).

### Edit existing layout flow (Q3)

```
Select layout from queue
  → Workspace opens (runtime-faithful)
  → Draft fork if editing published version
  → Direct manipulation: add/reorder/configure cards or queue slots
  → Preview toggle = Viewing vs Editing (same surface, fewer affordances)
  → Publish (creates new published version)
  → Optional: Duplicate · Archive
```

Workspace toolbar must show:

- Draft / Published / Viewing state  
- Assigned surfaces (chips)  
- Where used (Processes links)  
- Last edited · editor  
- Duplicate · Archive  
- Publish (pine primary)

---

## Surface inventory

### v1 supported surfaces (design + implement first)

#### Queue surfaces

| Variant | Runtime target | Editor model |
|---------|----------------|--------------|
| **Compressed queue row** | Dense work-unit queue lane | Slot-based: primary, secondary, chips, status, timestamp |
| **Comfortable queue row** | Default queue row | Same slots + optional avatar, attention indicator |
| **Expanded queue row / preview** | Hover/expand preview row | Extends comfortable + preview lines, related people |

Queue rows use **`metadata.queue_record_layout` v3** inside `entity_layouts` (`surface: queue`). Not card grid.

#### Focus Panel surfaces

| Mode | Runtime target | v1 configurability |
|------|----------------|-------------------|
| **Summary** | Overview cards (Attention, Household, Children, …) | **Fully configurable** — blueprint catalog + field slots |
| **Work** | Action/workflow/task cards | **Fully configurable** — work card catalog |
| **Activity** | Timeline, communications, audit, workflow history | **System-owned v1** — read-only preview; operator can hide/show mode tab only |

**Activity decision (Q12):** Activity content is generated from platform event streams (communications, workflow, audit). Operators should not author Activity card composition in v1. v2 may allow selecting which *system card types* appear (Communications strip, Workflow history) — not custom field layouts.

### Future surfaces (design for, do not implement)

Account in **surface registry extension** and **blueprint taxonomy**:

- Dashboard cards · Analytics cards · Billing cards  
- Scheduling · Attendance · Documents · Communications command center  
- Print/report surfaces · POS workspace  

Each future surface gets: `surface_key`, `entity_type`, `layout_surface` DB enum extension (or metadata discriminator), blueprint subset, assignment slot in Processes or domain settings.

Current registry (`surfaceLayoutRegistry.ts`): `opportunity_drawer`, `person_drawer`, `child_drawer`, `queue_record`, `waitlist_queue_record` — **drawer** and **queue** map to DB. Focus Panel modes are a **presentation viewpoint** on drawer/card runtime, not yet a separate DB surface.

**Recommendation:** Extend registry with `focus_panel_summary`, `focus_panel_work`, `focus_panel_activity` as product keys mapping to `entity_type` + `layout_key` + mode metadata — without new tables.

---

## Layout naming convention (Q4)

**Pattern:** `{Domain} · {Entity/Context} · {Surface Label}`

| Example | Meaning |
|---------|---------|
| Enrollment · Lead · Focus Panel Summary | Lead enrollment, Summary mode |
| Enrollment · Tour · Queue Row Comfortable | Tour work view queue row |
| Billing · Family Balance · Summary Card | Future billing surface |
| Waitlist · Candidate · Queue Row Compressed | Waitlist candidate row |

**Rules:**

- Domain = business process or product area (Enrollment, Billing, Waitlist) — suggested from assignment context, editable  
- Entity = record type (Lead, Person, Child, Family, Candidate)  
- Surface Label = operator language (Focus Panel Summary, Queue Row, Queue Row Expanded)  
- Separator ` · ` (middle dot) — consistent, scannable  
- `layout_key` (technical): slug derived from name, stable after create (`enrollment_lead_focus_summary`)  
- System generates suggestion on create; user can rename anytime  
- Display name lives in `entity_layouts` row metadata or dedicated `display_name` field (proposal — may use existing `layout_key` + doc title)

---

## Card model (Q6–Q8)

### Blueprint vs instance (Q6, Q7)

| Concept | Owner | Description |
|---------|-------|-------------|
| **Card blueprint** | Platform | Archetype: Lead Summary, Family, Children, Enrollment, Billing, … — defines default icon, tier, slot schema, allowed field groups, default density |
| **Card instance** | Tenant layout doc | A placed card in a layout: references `blueprint_key`, overrides title/subtitle/span/density/conditions |

Users **do not create blueprint types in v1**. They instantiate from catalog.

**Blueprint registry (code-first v1):** `web/lib/layout/cardBlueprintRegistry.ts` (proposed) — mirrors `system5CardArchetypes` / Universal Card archetypes. DB registry deferred.

### Card instance properties (Q8)

| Property | Configurable | Notes |
|----------|--------------|-------|
| blueprint_key | Yes (at insert) | Immutable after insert unless swap blueprint |
| title / subtitle | Yes | Defaults from blueprint |
| icon | Yes | From blueprint default |
| density | Yes | Compact · Standard · Expanded |
| width / span | Yes | 1/4 · 1/3 · 1/2 · 2/3 · 3/4 · Full (12-col grid) |
| default collapsed | Yes | Collapsed · Expanded |
| expand/collapse enabled | Yes | Platform cards may mandate minimum |
| accent / conditional color | Yes | Closed token set — not free color picker |
| visibility conditions | Yes | Work View condition builder pattern |
| editability mode | Yes | Read-only card · section edit · field-level |
| fields / widgets / actions / metrics | Yes | From catalog |
| expanded content | Yes | Separate slot list (see Expansion) |

### Card placement

- **12-column grid**, snap only  
- Supported widths: 3 · 4 · 6 · 8 · 9 · 12 (mapping to 1/4 … Full)  
- Stacked composition: two half-width in one row; stacked cards in half column; full-width below  
- **No pixel dragging**  
- Reorder via inline drag handle (row/card level) or move up/down  

Direct manipulation primary; inspector panel for Advanced only.

---

## Field model inside cards (Q9)

Fields **must** come from canonical field catalog (`field_definitions` + layout field-catalog API).

| Property | Supported |
|----------|-----------|
| label | Yes |
| hide label | Yes |
| icon / adornment | Yes |
| display format | Yes (date, money, status, link, …) |
| read-only / editable | Yes |
| required (presentation hint) | Yes — enforcement remains field/process owned |
| field width | Yes (within card grid) |
| row / column placement | Yes |
| typography size | Yes (closed scale) |
| alignment | Yes |
| conditional visibility | Yes |
| conditional editability | Yes |
| empty-state behavior | Yes (hide · em dash · placeholder copy) |
| system / read-only indicator | Yes in Advanced |

**Default picker:** end-user relevant fields only.  
**System fields:** hidden by default; available under **System / Advanced**; read-only; may appear in System Info blueprint cards.

Reuse: `OpportunityDrawerLayoutFieldSettingsModal` patterns → unified **Field inline menu** in Experience Builder.

---

## Expanded card content (Q10)

Three slot layers per card instance:

```
Card
├── header (shared — title, icon, status chip, expand trigger)
├── collapsed_slots[]   ← primary glance fields/widgets
├── expanded_slots[]    ← additional fields, related rows, metrics, actions
└── expansion_rules
      ├── trigger: chevron | click header | auto when attention
      ├── default_state: collapsed | expanded
      └── expanded_layout: stack | two_col | timeline
```

**Example — Billing card**

| Collapsed | Expanded |
|-----------|----------|
| balance · next invoice · payment status | invoice history · payments · credits · adjustments |

**Model in LayoutDoc (proposal):**

Extend `field_group` / card section metadata:

```typescript
metadata: {
  cardBlueprintKey: "billing",
  density: "standard",
  span: 6,
  collapse: { enabled: true, default: "collapsed" },
  slots: {
    collapsed: LayoutItem[],
    expanded: LayoutItem[],
  },
}
```

Runtime: Universal Card renderer reads collapsed slots by default; expanded slots on expand — same card header.

---

## Conditions (Q11)

Same builder pattern as Work Views: **field / operator / value**.

Apply to:

- Card visibility  
- Field visibility  
- Field editability  
- Card accent / attention tier  
- Card collapse behavior (e.g. auto-expand when attention)  
- Requiredness hints  

**Date operators** (parity with Work Views):

- Today · Tomorrow · This week · Next week  
- Custom date  
- Next [n] days/weeks/months  
- Previous [n] days/weeks/months  

Storage: extend `LayoutCondition` in `layoutV2.ts` or metadata `visibleWhen` / `editableWhen` arrays — align schema with `workViewsConfigV1` condition shape for UX reuse, translate at runtime evaluate layer.

---

## Queue row configuration (Q12)

Queue row editor ≠ Focus Panel editor.

**Configures slots (v3 model):**

| Slot | Examples |
|------|----------|
| Primary line | Lead name, candidate name |
| Secondary line | Program, location, age |
| Chips | Stage, tour date, priority |
| Status | Enrollment status chip |
| Attention | Needs-attention indicator |
| Related people | Children count, household |
| Timestamp | Last activity, due date |
| Right action | Quick action icon |
| Avatar / icon | Person avatar, record type |

**Does not** use full Universal Cards unless runtime row actually renders card blocks (expanded preview may show mini-cards — separate sub-surface).

Reuse: `QueueRecordLayoutVisualEditor.tsx`, `queueRecordLayoutV3.ts` — **refactor** UI into Configuration Mode shell + runtime-faithful row preview.

Variants (compressed / comfortable / expanded) = preset slot density templates, not different data models.

---

## Focus Panel configuration (Q12)

Card-based grid inside Focus Panel body (Concept B from Universal Card System).

| Mode | v1 catalog emphasis |
|------|---------------------|
| **Summary** | Attention · Current Work · Household · Children · Tour · Readiness · Communications · Documents |
| **Work** | Work launcher · Workflow steps · Tasks · Automations · Notes |
| **Activity** | System cards only — timeline, comms, audit (read-only authoring) |

Mode selector in runtime chrome is **platform-owned**; layout doc selects which cards appear **per mode** via separate layout documents or mode sections within doc:

**Proposal:** One `entity_layouts` row per (entity, focus_panel_{mode}) OR single doc with `metadata.focus_panel_modes: { summary: Section[], work: Section[] }`. Prefer **single doc, mode sections** to keep assignment simple.

Assignment: Work View `focus_panel_layout_id` continues to pin one doc; doc contains mode sections. Runtime mode switch selects section subset.

---

## Published / default / assigned (Q13)

| State | Meaning |
|-------|---------|
| **Draft** | Working copy on `entity_layouts.status = draft` |
| **Published** | Active version; highest version wins at resolve |
| **Default** | Org fallback when no BP/work-view assignment matches |
| **Assigned** | Linked from Processes — BP assignment row or work view layout IDs |

**Resolution order** (existing, preserve):

1. Work view pin (`focus_panel_layout_id`, `queue_layout_id`)  
2. BP assignment exact match  
3. BP stage / status defaults  
4. Org published default for surface  
5. Platform builtin doc  

Builder shows **where used** read-only with links to Processes. Publish does not auto-assign.

---

## System / read-only fields (Q14)

- Hidden from default field picker  
- Available under **System / Advanced** picker filter  
- Render with read-only indicator · monospace optional in Advanced  
- May appear in **System Info** blueprint (audit ids, created_at, org keys)  
- Never mixed into editable custom field lists without explicit add  

---

## Reuse audit (Q15)

| Asset | Path / store | Classification | Notes |
|-------|--------------|----------------|-------|
| `entity_layouts` + LayoutDoc | DB + `layoutV2.ts` | **Reuse as-is** | Canonical store; extend doc metadata |
| Draft/publish/rollback | `entityLayoutsRepo.ts` | **Reuse as-is** | |
| `business_process_layout_assignments` | DB + repo | **Reuse as-is** | Assignment stays in Processes |
| `record_drawer_layouts` | DB | **Compatibility → deprecate** | Person v1 only; do not extend |
| Queue v3 metadata | `queueRecordLayoutV3.ts` | **Reuse as-is** | Parallel schema intentional |
| Layout gallery + editors | `LayoutGalleryClient`, `*LayoutVisualEditor*` | **Refactor** | Mount in Configuration Mode shell; runtime-faithful workspace |
| Drawer runtime | `LayoutRuntimePlanView`, `useDrawerLayoutRuntimeBody` | **Reuse as-is** | Workspace preview renderer |
| Focus Panel cards | `focusPanel/*`, System 5 archetypes | **Refactor** | Unify with blueprint registry; doc-driven composition target |
| Field catalog API | `/api/admin/entity-layouts/field-catalog` | **Reuse as-is** | |
| Fields Hub | `field_definitions` | **Refactor** | Converge picker + hub |
| Work View conditions UI | `WorkViewConditionEditor` | **Reuse as-is** | Same condition builder in layout editor |
| `LayoutAssignmentCard` | Processes work view editor | **Reuse as-is** | Assign from Processes, not builder |
| Analytics placements | `metric_placements` | **Defer** | Separate Design Surface |
| Action placements | Settings → Actions + `_action_button` layout items | **Refactor** | Layout action buttons still preview-guarded |
| Configuration Mode shell | `ConfigurationModeLayout.tsx` | **Reuse as-is** | Context/Queue/Workspace/BOS |
| Experience Builder V2 editing model | sprint docs | **Reuse as-is** | Edit Mode, Structure/Content modes |

---

## Data model proposal

**Prefer extending `entity_layouts.doc`** — avoid new tables unless necessary.

### Layout document (extended LayoutDoc)

```typescript
interface ExperienceLayoutDoc extends LayoutDoc {
  metadata: {
    displayName?: string;
    domain?: string;           // Enrollment, Billing, …
    surfaceProductKey?: string; // focus_panel_summary | queue_record_comfortable
    focusPanelModes?: {
      summary?: LayoutSection[];
      work?: LayoutSection[];
      activity?: "system" | LayoutSection[];  // v1: "system"
    };
    queueRecordLayout?: QueueRecordLayoutV3;    // queue surfaces
    cardGrid?: {
      columns: 12;
      rows: CardInstanceRow[];
    };
  };
}
```

### Card instance (in doc)

```typescript
interface CardInstance {
  id: string;
  blueprintKey: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  span: 3 | 4 | 6 | 8 | 9 | 12;
  density: "compact" | "standard" | "expanded";
  collapse?: { enabled: boolean; default: "collapsed" | "expanded" };
  accent?: string;
  visibleWhen?: LayoutCondition[];
  collapsedSlots: LayoutItem[];
  expandedSlots?: LayoutItem[];
}
```

### Card blueprint registry (code)

```typescript
interface CardBlueprint {
  key: string;
  label: string;
  tier: "attention" | "work" | "context" | "reference" | "metric";
  defaultIcon: string;
  defaultSpan: number;
  allowedFieldGroups: string[];
  supportsExpansion: boolean;
  systemOwned?: boolean;  // Activity cards
}
```

### Field placement

Continue `LayoutItem` with `kind: field | field_group | related_list | widget_placeholder` + metadata keys from experience-builder-doctrine (`layoutEditorDisplay`, `layoutEditorVisibility`, `editable`, …).

### Draft/publish

No change — row-level on `entity_layouts`.

### New tables?

**Not required for v1** if doc extension suffices. Consider later:

- `card_blueprint_registry` (if blueprints become tenant-extensible) — **defer**  
- Separate `layout_assignments` — **already exists** as `business_process_layout_assignments`

---

## Phased implementation plan

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **0 — Approval** | This doc + mockups | Product/design sign-off |
| **1 — Shell** | `/settings/layouts` on Configuration Mode shell; layout queue; empty states | Context → Queue → Workspace → BOS live |
| **2 — Gallery + lifecycle** | Migrate gallery; draft/publish toolbar; where-used | Create, duplicate, archive, publish |
| **3 — Focus Panel Summary** | Blueprint catalog; card grid; direct field add; expansion slots | Summary mode editable end-to-end |
| **4 — Focus Panel Work** | Work catalog; action/metric slots | Work mode editable |
| **5 — Queue row** | v3 editor in runtime-faithful row preview; variants | Three queue variants configurable |
| **6 — Conditions + Advanced** | Work View condition builder; system fields | Parity with Work Views dates |
| **7 — Activity** | Read-only preview + mode visibility toggle | No custom Activity authoring |
| **8 — Deprecate legacy** | Retire `record_drawer_layouts` authoring | Single layout truth |

---

## Mockups

High-fidelity HTML mockups: [`mockups/`](./mockups/README.md)

| # | File | Shows |
|---|------|-------|
| 1 | `01-layouts-landing.html` | Context + layout queue + workspace |
| 2 | `02-surface-selector.html` | New layout — surface + entity |
| 3 | `03-layout-queue.html` | Queue list with draft/published |
| 4 | `04-empty-workspace.html` | Guided blank + catalog entry |
| 5 | `05-card-catalog.html` | Add card from blueprint catalog |
| 6 | `06-card-editor-add-field.html` | Direct add field on card |
| 7 | `07-field-inline-menu.html` | Inline field edit menu |
| 8 | `08-expanded-content-editor.html` | Collapsed vs expanded slots |
| 9 | `09-queue-row-editor.html` | Queue slot editor |
| 10 | `10-focus-panel-summary.html` | Summary mode card grid |
| 11 | `11-focus-panel-work.html` | Work mode card grid |
| 12 | `12-publish-assign.html` | Publish + where used + Processes link |

Open mockups in browser at 1440px width. Visual law: Bend Pine, white canvas, Configuration Mode typography.

---

## Acceptance criteria

- [ ] Architecture doc answers all 15 core questions explicitly  
- [ ] Activity mode v1 decision documented (system-owned content)  
- [ ] Queue vs Focus Panel models are separate and clear  
- [ ] Blank layout = guided + catalog, not freeform canvas  
- [ ] Naming convention defined with examples  
- [ ] Reuse audit classifies existing assets  
- [ ] Data model extends `entity_layouts.doc` without mandatory new tables  
- [ ] 12 mockups cover full create/edit/publish flow  
- [ ] Implementation team can build without guessing surface/card/field behavior  
- [ ] Builder feels like configuring Alloy runtime, not designing a webpage  

---

## Related docs

- [`configuration_runtime_settings_pattern_rollout.md`](../configuration_runtime_settings_pattern_rollout.md) — Configuration Mode shell  
- [`experience-builder-v2-runtime-editing/`](../experience-builder-v2-runtime-editing/) — Runtime editing interaction model  
- [`presentation-runtime-architecture/`](../presentation-runtime-architecture/) — Design Surface primitives  
- [`platform/operator/business-process-layout-assignments.md`](../../platform/operator/business-process-layout-assignments.md) — Assignment routing  

---

## Open questions for approval

1. **Single doc vs per-mode docs** for Focus Panel — recommendation: single doc, mode sections  
2. **Activity v2** — allow picking system card types vs fully fixed  
3. **Drawer vs Focus Panel** — converge `opportunity_drawer` LayoutDoc with Focus Panel card grid or keep parallel until Phase 8  
4. **Default layout seeding** — platform templates per entity on org create?
