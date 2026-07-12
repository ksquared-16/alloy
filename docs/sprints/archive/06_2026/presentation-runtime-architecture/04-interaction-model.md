# Interaction Model — Experience Builder

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/04-interaction-model.md`
**Status:** Architecture sprint — design only (June 2026)
**Companion:** [`03-information-architecture.md`](./03-information-architecture.md) (IA), [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) (doctrine)

---

## 1. Core interaction pattern

The Experience Builder follows the **same interaction doctrine** as every Configuration Runtime surface and every operational runtime surface. No special UI. No separate editor. It feels like another Alloy workspace.

### Configuration Mode (authoring)

```
Configuration Context → Configuration Queue → Configuration Workspace → BOS rail
```

### Operational Mode (what is being authored)

```
Context → Queue → Workspace → BOS
```

The parallel is intentional and frozen. An administrator who knows how to configure Business Processes already knows how to configure Design Surfaces.

---

## 2. Navigation flows

### 2.1 Entry

```
Operator clicks Settings (bottom rail icon)
  → Settings Mode activates (left rail switches to Configuration nav)
    → /settings hub (9 tiles) OR last-visited settings surface
      → "Design Surfaces" tile
        → /settings/design-surfaces (Experience Builder hub)
```

Last-surface memory via localStorage applies (same as Processes).

### 2.2 Category selection

```
/settings/design-surfaces
  → Configuration Context shows category chips/dropdown
    → Operator selects "Focus Panel"
      → Configuration Queue populates with Focus Panel Design Surfaces
        → List column shows surfaces in category
          → First surface auto-selected (or last-visited)
            → Workspace loads surface editor
```

### 2.3 Surface editing

```
Surface selected in list column
  → Workspace loads:
    1. Architecture panel (zone topology + card inventory)
    2. Editor canvas (category-specific)
    3. Preview panel (toggleable)
  → Operator selects a Zone
    → Cards in zone highlight
  → Operator selects a Card
    → Card composition panel: Archetype, density, span, interaction model
    → Slot list with Data Source → Renderer bindings
  → Operator selects a Slot
    → Data Source picker (Field Catalog / Resolver / Metric)
    → Renderer picker (closed catalog)
    → Behavior panel (visibility, conditions)
  → Changes auto-save to Working Copy
```

### 2.4 Cross-navigation from Business Processes

```
/settings/processes → Work View setup → Design Surface Assignment Card
  → "Enrollment Focus Panel (Summary)" [chip]
  → "Edit in Design Surfaces →" link
    → /settings/design-surfaces?category=focus-panel&surface={id}
      → Surface editor opens with return context
```

Same pattern as today's "Open in Layouts" link from `LayoutAssignmentCard`.

### 2.5 Cross-navigation from runtime preview

```
Operator viewing runtime → "Configure this surface" (admin-only affordance)
  → Deep link to Experience Builder with surface pre-selected
    → /settings/design-surfaces?category={cat}&surface={id}&preview=1
```

---

## 3. Configuration flow (authoring lifecycle)

### 3.1 Create

```
Operator clicks "Create Design Surface"
  → Category must be selected
  → Modal / inline form:
    - Name (required)
    - Category (pre-filled from context)
    - Entity binding (if category requires it: Opportunity, Person, Child, —)
    - Start from: [Platform Default blueprint] or [Blank (architecture only)]
  → Creates Working Copy (version 1, status: draft)
  → Opens in workspace editor
```

Starting from a Platform Default blueprint pre-populates Zones and default Card Types. Starting blank shows zone topology only.

### 3.2 Edit

```
Operator edits Working Copy
  → Changes auto-save (debounced)
  → Architecture panel updates live (card inventory, zone fill)
  → Preview panel updates live (render against sandbox record)
  → No effect on runtime until published
```

### 3.3 Preview

```
Operator clicks "Preview"
  → Preview panel expands (or full-screen toggle)
  → Renders against:
    - Sandbox record (default — org's test data)
    - Live record (optional — select from queue)
  → Shows resolved inheritance (which overrides apply at current scope)
  → Viewpoint selector: preview as Director / Teacher / Parent / etc.
  → Read-only — no side effects, no mutations
  → Preview URL may be shareable (read-only link for stakeholder review)
```

Preview respects the same reveal/performance gates as runtime — no false empty states, no section-owned skeletons.

### 3.4 Publish

```
Operator clicks "Publish"
  → Validation checks:
    - Required Slots filled (or explicitly marked optional)
    - No unresolved Data Source references
    - No publish-blocked items (preview-only widgets, deprecated blocks)
    - Dependency check: downstream assignments listed
  → Impact analysis modal:
    - "This surface is assigned to 3 Work Views and 1 stage"
    - "Publishing will update runtime for all assignments"
    - [Publish] [Cancel]
  → Creates immutable Published version (version N+1)
  → Status: published
  → Runtime immediately reads new published version for all assignments
  → Working Copy remains editable for next version
```

Publish validation rules carry forward from the Visual Layout Configuration Builder certification (Phase 5.15): preview-only items (opportunities related list, action buttons, some block templates) remain publish-blocked until their runtime paths exist.

### 3.5 Duplicate

```
Operator clicks "Duplicate"
  → Creates new Working Copy with copied content
  → Name: "{Original name} (copy)"
  → No assignments — must be independently published and assigned
```

Existing duplicate API (`/api/admin/entity-layouts` duplicate endpoint) is reused.

### 3.6 Retire

```
Operator clicks "Retire"
  → Confirmation: "This surface is assigned to N places. Retiring prevents new assignments but existing assignments continue until replaced."
  → Status: retired
  → Removed from assignment dropdowns
  → Existing runtime assignments continue with last published version
```

### 3.7 Restore

```
Operator selects retired surface → "Restore"
  → Re-publishes retired version as new Published version
  → Surface reappears in assignment dropdowns
```

### 3.8 Version history

```
Operator clicks "Version history"
  → Timeline of published versions with timestamps and author
  → Diff between any two versions (zone/card/slot changes highlighted)
  → "Restore this version" → creates new Published version from selected historical version
```

Existing rollback API is reused.

---

## 4. Assignment flow

Design Surfaces are **assigned**, not embedded, in Business Processes.

### 4.1 Work View assignment (primary path)

```
/settings/processes → select process → Work Views queue item
  → Work View list column → select Work View
    → Work View workspace:
      - Purpose, filters, sort (existing)
      - Design Surface Assignment Card:
        - Queue Row: [dropdown of published Queue Row surfaces]
        - Focus Panel: [dropdown of published Focus Panel surfaces]
        - "Edit in Design Surfaces →" links
      - Preview Runtime (existing)
```

Work View pins: `queue_layout_id`, `focus_panel_layout_id` (existing `workViewsConfigV1` fields — storage unchanged, labels updated).

### 4.2 Stage assignment (secondary path)

```
/settings/processes → select process → Stages → select stage
  → Stage setup → Layout assignment section:
    - Drawer surface: [dropdown]
    - Queue surface: [dropdown]
    - (via business_process_layout_assignments table)
```

Resolution order (unchanged):

1. Work View pinned layout IDs
2. `business_process_layout_assignments` (stage/status routing)
3. Org → default → builtin → registry fallback

### 4.3 Viewpoint assignment (future)

```
/settings/security → Roles / Access Profiles
  → Viewpoint assignment: [dropdown of published Viewpoints]
  → Or: /settings/design-surfaces → Viewpoints category
    → Viewpoint definition: audience label, override rules
    → Assigned to roles/access profiles
```

Viewpoint assignment is a future capability — the inheritance cascade supports it; the UI ships after core category editors.

### 4.4 Analytics placement assignment

```
/settings/design-surfaces → Dashboard category → select dashboard
  → Publish dashboard
/settings/processes → Work View setup OR /settings/operational-intelligence
  → Assign dashboard to surface (workspace header, work-unit header, OI panel)
```

Metric definitions remain in OI settings. Dashboard Design Surface assignment replaces direct `metric_placements` authoring for composed dashboards.

---

## 5. Inheritance interaction

When editing a Design Surface, the operator may see **inherited values** from parent scopes:

```
Editor shows:
  ┌─ Billing Card ──────────────────────────────────┐
  │  Density: Compact                               │
  │  ┌─ balance slot ──────────────────────────────┐│
  │  │  Data Source: billing.balance              ││
  │  │  Renderer: Currency                        ││
  │  │  ⓘ Inherited from Platform Default         ││
  │  └────────────────────────────────────────────┘│
  │  ┌─ status slot ─────────────────────────────┐│
  │  │  Data Source: billing.status               ││
  │  │  Renderer: Status                          ││
  │  │  ✎ Overridden at Organization level        ││
  │  └────────────────────────────────────────────┘│
  └─────────────────────────────────────────────────┘
```

| Indicator | Meaning |
|---|---|
| ⓘ Inherited | Value comes from parent scope; not editable at this level (override to customize) |
| ✎ Overridden | Value explicitly set at this scope; overrides parent |
| 🔒 Platform | Platform-owned; never overridable |

Operator may "Reset to inherited" on any overridden value.

---

## 6. Preview interaction

Preview is a first-class interaction, not an afterthought.

### Preview modes

| Mode | Data source | Use case |
|---|---|---|
| **Sandbox** | Org test records | Default authoring preview |
| **Live record** | Select from queue | Validate against real data |
| **Viewpoint** | Same record, different Viewpoint overrides | Validate audience differences |
| **Inheritance** | Show resolved config at each cascade level | Debug override conflicts |
| **Comparison** | Side-by-side: current published vs working copy | Pre-publish review |
| **Assignment context** | Preview as assigned to a specific Work View + stage | Validate assignment fit |

### Preview constraints

- Read-only — no mutations, no side effects
- Respects reveal gates — no false empty states
- Uses the same renderers as production runtime
- Preview-only items render with a "preview" badge (not publish-blocked items shown as functional)

---

## 7. BOS rail interaction

The BOS rail is **unchanged** in the Experience Builder. It provides:

- Contextual assistance for the surface being edited
- Suggestions for Card Type selection based on entity/category
- Validation warnings (unfilled required Slots, missing Data Sources)
- "What will operators see?" natural language summary

BOS does **not** auto-modify Design Surface config. Propose → human approve → apply (`ai-platform.md`).

---

## 8. Error and empty states

| State | Treatment |
|---|---|
| **No surfaces in category** | Honest empty state: "No {category} Design Surfaces yet. Create one to define how operators experience {category}." + Create button |
| **No published surfaces for assignment** | Assignment dropdown shows: "No published surfaces — Create in Design Surfaces →" |
| **Publish validation failure** | Inline error list with links to offending primitives |
| **Preview render failure** | Calm error card in preview panel; editor remains functional |
| **Retired surface in assignment** | Assignment shows "Retired" badge + "Replace" action |

---

## 9. Cross-references

| Concern | Doc |
|---|---|
| IA + routes | [`03-information-architecture.md`](./03-information-architecture.md) |
| Publishing lifecycle detail | [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) §9 |
| Inheritance cascade | [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) §8 |
| Configuration Mode doctrine | `docs/system/configuration-mode-doctrine.md` |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
