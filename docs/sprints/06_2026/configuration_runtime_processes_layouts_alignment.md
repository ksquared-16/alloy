# Alloy OS Configuration Runtime — Processes · Work Views · Layouts Alignment

**Status:** Vertical slice implemented — foundation commit  
**Date:** June 2026  
**Supersedes for planning:** partial UI passes on old Business Processes page; [process work views realignment](./configuration_runtime_process_work_views_realignment.md) (exploratory — folded here)

**Canonical UX references:** [Concept A freeze](./configuration_runtime_concept_a_freeze.md) · [green/pine mockups](./configuration-runtime-bp-ux-redesign/) · [Universal Card System](../../platform/operator/universal-card-system.md)

---

## Problem statement

Configuration Runtime was implemented as **three partial ideas**:

| Surface | Mistake |
|---------|---------|
| Business Processes | Stage-scoped “Perspectives,” legacy form stack, stacked nav |
| Work Views | Renamed labels on old editor; read-only filters |
| Layouts | Links to Layouts instead of assignment; no card blueprint model |

**Hard reset:** One configuration system with clear ownership. **Stop iterating** the old `/settings/business-processes` page shape.

---

## Product decisions (locked for this gate)

| # | Decision |
|---|----------|
| 1 | User-facing **Processes** at `/settings/processes` (internal route `business-processes` may remain temporarily) |
| 2 | **Work Views are process-level** — may span stages via filters |
| 3 | **Layouts are card-based** — blueprint → configured instance → composed layout; Experience Builder owns editing; Processes assign/preview only |

---

## Ten alignment answers

### 1. What does `/settings/processes` own?

**Processes** is the operator configuration workspace for **how work moves** through a business process.

| Owns | Does not own |
|------|----------------|
| Process catalog (Enrollment, etc.) | Field definitions |
| Stages (membership, requirements, operating plan, readiness) | Layout card internals |
| Process-level **Work Views** (filters, sort, visibility, layout assignment) | Queue Builder / Focus Panel Builder |
| **Presentation assignments** (which published layouts power queue + focus panel) | Universal Card blueprint anatomy |
| Process actions matrix | Status vocabulary |
| Automation entry points (future) | Runtime reveal / queue fetch semantics |
| Configuration health / ready check | Authoritative record data |

**Persistence (reuse, no new tables):** `departments.metadata.lifecycle_builder_v1` (processes, stages), `work_views_v1` on process records, `lifecycle_actions_matrix_order_v1`, stage field rules, `business_process_layout_assignments` for presentation links.

---

### 2. What does `/settings/layouts` own?

**Layouts** (Experience Builder) is the operator workspace for **what operators see** when working records.

| Owns | Does not own |
|------|----------------|
| Layout gallery (published / draft) | Stage membership rules |
| **Card blueprint library** (platform archetypes) | Work View filters |
| **Card instances** (field slots, size, span, visibility) | Process actions |
| Composition: Queue row, Focus Panel Summary / Work / Activity | BOS intelligence content |
| Publish workflow for `entity_layouts` | Business process stage graph |

**Persistence (reuse):** `entity_layouts` (LayoutDoc in `doc` JSON), existing layout APIs, field catalog (`fieldCatalog`, system field registry), publish/draft status on layout records.

---

### 3. What is a Work View?

A **Work View** is a **process-level operational lens** — the operator-facing name for what runtime shows as a switchable view of work (pills, list column, or nav row).

| Property | Meaning |
|----------|---------|
| Operators see | Label shown in runtime |
| Purpose / mission | Why this view exists |
| Show work when… | Business conditions (`filters_v1`) — may span stages |
| Default order | Sort (`sort_v1`) |
| Visibility / display order | Runtime rail placement |
| Presentation | Assigned queue layout + focus panel layout (published `entity_layouts`) |
| Preview runtime | Opens real workspace with current config |

**Not:** a stage section, a queue lane editor, or a layout editor.

**Compatibility:** Legacy stage `perspectives_v1` + synced `queue_definition` lanes remain until runtime reads `work_views_v1`. UI may seed from legacy data; runtime convergence is a **follow-up**, not this slice.

---

### 4. What is a Card Blueprint?

A **Card Blueprint** is a **platform-owned archetype** — a known structure with fixed operational purpose (System 4 / 5A).

Examples: Lead Summary, Why Now, Household, Children, Work Launcher, Timeline.

| Blueprint defines | Blueprint does not define |
|-------------------|---------------------------|
| Archetype (Action, Status, Summary, …) | Which process uses it |
| Allowed field slots / widget placeholders | Work View filters |
| Default density tier, span options | Stage status membership |
| Read vs edit affordances where supported | Org field validation rules |

**Source of truth:** platform docs + archetype registry (code), not tenant JSON inventing new card types in Processes.

---

### 5. What is a Card Instance?

A **Card Instance** is a **tenant-configured placement** of a blueprint inside a **LayoutDoc** (`entity_layouts.doc`).

| Instance configures | Stored as |
|---------------------|-----------|
| Blueprint reference | Layout item kind + archetype key |
| Included / swapped / optional fields | `refKey` slots in grid cells |
| Size: compact / standard / expanded | density on item |
| Span: half / full / emphasis | row/column span in grid |
| Conditional visibility | visibility rules on item (existing LayoutDoc patterns) |
| Read/edit behavior | render hints / widget config |

Layouts **compose** card instances into surfaces: Queue row template, Focus Panel Summary grid, Work tab, Activity tab.

---

### 6. What can be configured in Processes?

| Section | Configurable |
|---------|--------------|
| **Overview** | Process name, description, stats, preview entry |
| **Stages** | Stage list, status membership, required information, operating plan, stage readiness |
| **Work Views** | Full Work View model (§3) including conditions, sort, visibility, layout assignment, preview |
| **Presentation** | Per-stage or process-default **assignment** of published queue + focus layouts; previews; Change / Open in Layouts |
| **Actions** | Process actions matrix |
| **Automation** | Workflow entry points (later) |
| **Health** | Ready check, BOS config recommendations (later) |

**Never in Processes:** editing card field grids, inventing blueprints, queue row field pickers that duplicate Layouts.

---

### 7. What can be configured in Layouts?

| Area | Configurable |
|------|--------------|
| **Gallery** | Browse, duplicate, publish, archive layouts |
| **Blueprint library** | Pick archetype to add |
| **Card editor** | Field slots, swap/add/remove optional fields, size, span, conditions |
| **Surface composition** | Which cards appear in Queue row vs Focus Panel modes |
| **Preview** | Live preview against sample record context |

**Never in Layouts:** stage rules, Work View filters, process actions, status transitions.

---

### 8. What must never be duplicated?

| Concern | Single owner |
|---------|--------------|
| Field catalog / labels | Fields settings + `fieldCatalog` |
| Status vocabulary | Statuses settings |
| Card anatomy / tiers | Platform Universal Card System |
| Layout grid / publish | Experience Builder (`entity_layouts`) |
| Work View business conditions | Processes `work_views_v1` |
| Stage membership | Processes stage metadata |
| Runtime queue fetch / reveal | Runtime (unchanged in config slices) |
| BOS rail chrome | AdminV2 shell |

**Forbidden:** Queue Builder, Focus Panel Builder, separate Card Builder outside Layouts, second field registry, duplicate presentation stores.

---

### 9. What existing code/data should be reused?

| Asset | Reuse in vertical slice |
|-------|-------------------------|
| `departments.metadata.lifecycle_builder_v1` | Process + stage graph |
| `processes[].work_views_v1` | Primary Work View authoring (already drafted in branch — refine, do not restart elsewhere) |
| `stages[].perspectives_v1` | Runtime compatibility only |
| `entity_layouts` + publish API | Layout assignment targets |
| `business_process_layout_assignments` | Presentation assignment pattern |
| `LayoutsSettingsHubClient` / gallery | Layouts IA anchor |
| Field catalog APIs | Condition builder field picker (Layouts slice) |
| `buildOperationalViewPreviewRuntimeHref` | Preview runtime link |
| AdminV2 shell + BOS rail | All settings surfaces |
| `ConfigurationRuntimeUniversalCard` | Processes **settings-tier** section cards (not Focus Panel runtime cards) |
| Canonical `/settings` auth + app shell | No marketing chrome |

**Retire from primary UX:** stage-embedded Perspectives editor as source of truth; read-only “work included” chips as substitute for condition builder.

---

### 10. What is the first vertical slice?

**One complete path:** Process → Work View → Queue/Focus Panel layout assignment → Preview Runtime.

| In scope | Out of scope |
|----------|--------------|
| `/settings/processes` visible route (+ redirect from `/settings/business-processes`) | Full Layouts card editor |
| UI copy **Processes** | All card blueprints |
| Process cards + process-level section nav | Runtime migration to `work_views_v1` |
| Work Views workspace with **editable** condition rows + sort | Schema migrations |
| Layout assignment **selectors** (published layouts) | Automation / Health beyond placeholder |
| Preview runtime link | Queue Builder / FP Builder |

**Definition of done:** mockup-parity screenshots (§ Visual acceptance) + targeted tests. **Not done** if controls are read-only, missing, or only renamed.

---

## Information architecture

### `/settings/processes`

```
Processes (page)
├── Process selector (cards)
└── [Selected process]
    ├── Overview
    ├── Stages
    │   ├── Stage list / pills
    │   ├── Status membership
    │   ├── Required information
    │   ├── Stage operating plan
    │   └── Stage readiness
    ├── Work Views
    │   ├── Work View list / cards
    │   └── Work View editor
    │       ├── Operators see
    │       ├── Purpose
    │       ├── Show work when… (editable rows)
    │       ├── Default order (sort)
    │       ├── Presentation assignment (queue + focus selectors)
    │       ├── Visibility / display order
    │       ├── Preview runtime
    │       └── Advanced → technical identity (collapsed)
    ├── Presentation
    │   ├── Assignment previews (queue + focus panel)
    │   ├── Layout names
    │   ├── Change / Open in Layouts
    │   └── No card-internals editing
    ├── Actions
    ├── Automation (placeholder → later)
    └── Health (ready check → BOS health later)
```

**Route plan:** canonical `/settings/processes`; temporary rewrite from `/settings/business-processes`; update nav labels to **Processes**.

### `/settings/layouts`

```
Layouts (Experience Builder)
├── Layout gallery
├── Card blueprint library
├── Queue row layouts
├── Focus Panel layouts (Summary / Work / Activity)
└── Card editor
    ├── Choose blueprint
    ├── Configure fields (include / swap / add optional / remove)
    ├── Size / density
    ├── Span
    ├── Conditions
    └── Preview → Save draft → Publish
```

**Processes Presentation** assigns published layouts; **Layouts** authors them.

---

## Layouts — first slice plan (after Processes slice)

Do **not** build full Layouts in the Processes vertical slice. Plan the first Layouts slice separately:

| Step | Deliverable |
|------|-------------|
| L1 | Card blueprint picker (one archetype: **Lead Summary**) |
| L2 | Configurable field slots against field catalog |
| L3 | Size: compact / standard / expanded |
| L4 | Span: half / full |
| L5 | Preview in card editor |
| L6 | Save as layout draft on `entity_layouts` |
| L7 | Publish |
| L8 | Appears in Processes Presentation assignment selectors |

**Reuse:** existing LayoutDoc grid, `builderOps`, gallery publish flow, `entity_layouts` table.

---

## Visual acceptance (green/pine Concept A)

Actual UI must match approved mockups — not restyled legacy forms.

| Requirement |
|-------------|
| Large cards, generous whitespace, pine accent |
| Process cards as primary navigation |
| Process-level section cards/tabs — not stacked legacy admin |
| Work View editor with **real** controls on screen |
| Presentation previews + assignment controls |
| No exposed queue keys / lane IDs in primary UI |
| BOS rail preserved |
| Full-width operational canvas |

### Screenshots required before slice sign-off

| # | Capture |
|---|---------|
| 1 | `/settings/processes` — process hub |
| 2 | Process selected — section navigation |
| 3 | Work Views section — list |
| 4 | Work View editor — condition rows + sort + presentation selectors |
| 5 | Presentation assignment |
| 6 | `/settings/layouts` — target IA mock or wireframe (Layouts slice plan) |
| 7 | Preview runtime — opened from Work View |

Directory: `docs/sprints/06_2026/configuration-runtime-vertical-slice/`

---

## Implementation plan (post-approval only)

**Phase 0 — Gate (this document)**  
Approve alignment. **No feature coding** until signed off.

**Phase 1 — Route + rename (small)**  
- `/settings/processes` canonical URL + redirects  
- Nav/title copy **Processes**  
- Retire inner settings sidebar on Processes canvas  

**Phase 2 — Processes shell (vertical slice UI)**  
- Process cards + section nav (Overview, Stages, Work Views, Presentation, Actions, placeholders)  
- Stages workspace without Work Views embedded  
- Work Views workspace wired to `work_views_v1` API  
- Editable `filters_v1`, `sort_v1`, layout selectors, visibility/order  
- Presentation assignment surface (reuse `business_process_layout_assignments`)  
- Preview runtime link  

**Phase 3 — Validation gate**  
- Playwright screenshot suite vs mockups  
- Vitest: metadata parse/save, route auth, no stage perspectives save  
- **Commit only after screenshot parity review**  

**Phase 4 — Layouts slice (separate PR)**  
- Blueprint picker + Lead Summary card instance editor per Layouts plan above  

**Phase 5 — Runtime convergence (separate PR)**  
- Runtime reads `work_views_v1`; deprecate stage `perspectives_v1` authoring path  

---

## Explicit non-goals (this program)

- Queue Builder, Focus Panel Builder  
- Database schema tables for Work Views  
- Full automation / BOS health in Processes slice  
- Claiming “implemented” without on-screen controls  
- Continuing to patch `LifecycleActivationBoard` legacy layout  

---

## Approval checklist

Before coding Phase 1–2, confirm:

- [ ] Processes rename + `/settings/processes` route approved  
- [ ] Process-level Work Views model approved  
- [ ] Card blueprint vs card instance vs layout assignment boundaries approved  
- [ ] First vertical slice scope approved (Process → Work View → assignment → preview)  
- [ ] Layouts first slice plan approved for follow-on  
- [ ] Screenshot acceptance criteria approved  

**Approver:** ___________________ **Date:** ___________

---

## Related docs

- [configuration_runtime_concept_a_freeze.md](./configuration_runtime_concept_a_freeze.md) — mockup targets  
- [configuration_runtime_process_work_views_realignment.md](./configuration_runtime_process_work_views_realignment.md) — exploratory notes (superseded by this doc for planning)  
- [universal-card-system.md](../../platform/operator/universal-card-system.md) — card primitives  
- [configuration-ownership-doctrine](../../system/configuration-ownership-doctrine.md) — ownership boundaries  
