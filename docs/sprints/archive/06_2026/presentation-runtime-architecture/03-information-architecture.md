# Information Architecture — Experience Builder

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/03-information-architecture.md`
**Status:** Architecture sprint — design only (June 2026)
**Companion:** [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md), [`04-interaction-model.md`](./04-interaction-model.md)

---

## 1. Route and nav placement

### Primary route

```
/settings/design-surfaces
```

During transition, `/settings/layouts` **aliases** to `/settings/design-surfaces`. Both resolve to the same Experience Builder hub.

### Settings Mode nav

When the operator enters `/settings/*`, the left app rail switches to Configuration Mode. The nav item currently labeled **"Layouts"** becomes **"Design Surfaces"**:

| # | Nav item | Route | Status |
|---|---|---|---|
| 1 | Processes | `/settings/processes` | Shipped |
| 2 | **Design Surfaces** | `/settings/design-surfaces` | This sprint (extends Layouts) |
| 3 | Fields | `/settings/fields` | Shipped |
| 4 | Statuses | `/settings/statuses` | Shipped |
| 5 | Actions | `/settings/actions` | Shipped |
| 6 | Automation | `/settings/automation` | Shipped |
| 7 | Operational Intelligence | `/settings/operational-intelligence` | Shipped (metric definitions) |
| 8 | Integrations | `/settings/integrations` | Shipped |
| 9 | Security / Roles | `/settings/security` | Shipped |

> **Operational Intelligence** remains the home for **metric definition** (math, aggregation, thresholds). **Design Surfaces** is the home for **metric placement and visualization** (where and how metrics appear). The split is intentional — see `01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` §6.

### `/settings` hub tile

The `/settings` landing hub tile currently labeled "Layouts" becomes **"Design Surfaces"** with copy:

> Design the experiences operators have across every surface — queue rows, focus panels, dashboards, documents, and more.

---

## 2. Page structure (Configuration Mode shell)

Every Experience Builder page follows the frozen Configuration Mode pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP — Configuration Context                                                │
│  Title: Design Surfaces · Category selector · Create Design Surface         │
├──────────┬──────────────────────────────────────────────────┬───────────────┤
│  LEFT    │  CENTER — List column + Workspace                │  RIGHT        │
│  Config  │                                                  │  BOS rail     │
│  Queue   │  (category-specific list + selected editor)      │  (unchanged)  │
│  ~260px  │                                                  │               │
└──────────┴──────────────────────────────────────────────────┴───────────────┘
```

This is the same shell as `/settings/processes` (`ConfigurationModeShell` → `BusinessProcessConfigurationShell`). No special UI. No separate editor app.

---

## 3. Configuration Context (top bar)

| Element | Behavior |
|---|---|
| **Title** | "Design Surfaces" |
| **Category selector** | Chips when ≤8 categories visible; searchable dropdown when more. Selecting a category populates the Configuration Queue. |
| **Create Design Surface** | Opens create flow scoped to selected category. Requires category selection first. |
| **Search** | Cross-category search for Design Surfaces by name |
| **Viewpoint selector** (future) | Preview inheritance overrides for a specific Viewpoint |

Auto-opens the first/default category when the page loads (same behavior as Processes auto-opening the first process).

---

## 4. Surface Categories (Configuration Queue)

Selecting a category in the Context populates the **left Configuration Queue** with Design Surfaces in that category.

### Category catalog

| Category | Queue contains | Example surfaces |
|---|---|---|
| **Queue Row** | Row layout definitions | Compact Enrollment, Expanded Enrollment, Attendance, Billing, Scheduling, Waitlist, Admissions |
| **Focus Panel** | Focus Panel layout definitions | Enrollment Summary, Enrollment Work, Enrollment Activity, Billing, Person, Child |
| **Workspace** | Workspace landing compositions | Command Center, Operational Pulse, Business Process tiles |
| **Dashboard** | Analytics dashboard definitions | Enrollment Dashboard, Billing Dashboard, Operations Board, Executive Summary |
| **Document** | Document/print template definitions | Invoice, Receipt, Enrollment Agreement, Medical Form |
| **Print** | Print-optimized view definitions | Invoice Print, Report Print, Label |
| **Communication** | Communication template definitions | Welcome Email, Tour Reminder, Payment Notice, Waitlist Update |
| **Form** | Form capture definitions | Enrollment Application, Medical Intake, Incident Report |
| **POS** | POS screen definitions | Checkout, Processing, Register |
| **Portal** | Parent/guardian portal definitions | Family Dashboard, Enrollment Status, Payment Portal |
| **Mobile** | Mobile-optimized surface definitions | Teacher Attendance, Director Snapshot |
| **Report** | Report layout definitions | Enrollment Report, Financial Summary, Compliance Audit |

Categories marked **coming soon** in the current Layout Gallery (`communications_command_center`, `pos_workspace`) become enabled as their editors ship.

### Queue grouping (when a category is selected)

For categories with many surfaces, the queue may group:

| Group | Items |
|---|---|
| **Published** | Active, assigned surfaces |
| **Draft** | Working copies in progress |
| **Retired** | Soft-deleted surfaces |
| **Platform defaults** | System-owned blueprints (read-only reference) |

Selected state: soft Bend Pine background, pine left accent, pine icon, Midnight text. No blue, slate, or gray active states (Configuration Mode visual doctrine).

---

## 5. Configuration Workspace (center)

Selecting a Design Surface from the queue opens its **editor** in the center workspace. The editor is **not a blank canvas** — it begins with architecture.

### Workspace structure (all categories)

```
Design Surface header
  ├── Name, status badge (Draft / Published / Retired), version
  ├── Category, entity binding, ownership model indicator
  └── Actions: Preview · Publish · Duplicate · Retire · Version history

Architecture panel (always visible, collapsible)
  ├── Zone topology diagram (platform-defined regions, labeled)
  ├── Card inventory (which Card Types are placed, in which zones)
  └── Inheritance indicator (what is inherited vs overridden at current scope)

Editor canvas (category-specific)
  ├── Zone editing (select zone → see cards within)
  ├── Card composition (select card → configure Archetype, density, span, slots)
  ├── Slot editing (select slot → bind Data Source, select Renderer)
  ├── Behavior panel (visibility, conditions, actions for selected primitive)
  └── Renderer preview (live render of selected slot/card/zone)

Preview panel (toggleable, right of canvas or overlay)
  ├── Live preview against sandbox record
  ├── Viewpoint override selector
  └── Inheritance cascade visualization
```

### Category-specific workspace adaptations

| Category | Canvas adaptation |
|---|---|
| **Queue Row** | Horizontal row preview (52px) with zone regions highlighted; field/signal placement within zones |
| **Focus Panel** | Vertical card grid preview with mode tabs (Summary/Work/Activity); Concept B responsive grid |
| **Dashboard** | Dashboard grid with KPI strip + detail grid zones; metric card placement |
| **Document** | Page preview with block composition; print-oriented layout |
| **Form** | Section/field composition with capture-specific controls (validation, required, signature) |
| **All others** | Category-appropriate preview with same Zone → Card → Slot → Renderer hierarchy |

---

## 6. List column (between queue and workspace)

For categories with many Design Surfaces, a **list column** (~240px) appears between the queue and workspace (same pattern as Processes stage list):

| Element | Behavior |
|---|---|
| Surface name | Primary label |
| Status badge | Draft / Published / Retired |
| Entity binding | e.g., "Opportunity", "Person", "—" (for dashboards) |
| Assignment count | Number of BP/Work View assignments |
| Last modified | Timestamp |

Selecting a surface in the list column loads it in the workspace. The queue selects the category; the list column selects the surface within the category.

---

## 7. Relationship to Business Processes

Design Surfaces are **authored** in the Experience Builder and **assigned** in Business Processes. This ownership split is frozen (`configuration-ownership-doctrine.md`):

| Where | What happens |
|---|---|
| `/settings/design-surfaces` | Author, compose, preview, publish Design Surfaces |
| `/settings/processes` → Work View setup | Assign published Design Surfaces to Work Views (queue row + focus panel) |
| `/settings/processes` → Stage setup | Assign published Design Surfaces to stages (via `business_process_layout_assignments`) |

The existing `LayoutAssignmentCard` in Work View setup becomes a **Design Surface Assignment Card** — same UX (dropdown of published surfaces + chip + link to Experience Builder), updated labels.

Presentation is **not** a top-level queue item in Business Processes. Queue and Focus Panel assignment lives inside Work View setup (frozen — `configuration_runtime_core_interaction_doctrine.md`).

---

## 8. Relationship to other settings surfaces

| Settings surface | Relationship to Design Surfaces |
|---|---|
| **Fields** | Provides the Field Catalog that Slots bind to. EB reads; never writes field definitions. |
| **Actions** | Provides action definitions that Surface/Card/Slot actions reference. EB places; Actions hub defines. |
| **Operational Intelligence** | Provides metric definitions that Metric Cards bind to. EB places; OIP defines math. |
| **Statuses** | Provides status vocabulary that Status Renderers display. EB reads; Statuses hub defines. |
| **Automation** | Workflows triggered by actions placed on Design Surfaces. EB does not configure workflows. |
| **Security / Roles** | RBAC gates capabilities. Viewpoints (audience axis) gate presentation. Separate concerns. |

### Configuration journey (updated)

The platform configuration journey becomes:

```
Fields → Business Processes → Forms → Design Surfaces → Runtime
  │           │                │            │
  │           │                │            └── Experience Builder (this sprint)
  │           │                └── Capture surfaces (Form category)
  │           └── Process rules, perspectives, assignments
  └── Field Catalog (data truth)
```

---

## 9. URL structure

```
/settings/design-surfaces                              → Hub (category selection)
/settings/design-surfaces?category=queue-row           → Queue Row category
/settings/design-surfaces?category=focus-panel         → Focus Panel category
/settings/design-surfaces?category=dashboard           → Dashboard category
/settings/design-surfaces?category=…                   → Other categories

/settings/design-surfaces?category=focus-panel&surface={id}  → Open specific surface editor
/settings/design-surfaces?category=focus-panel&surface={id}&preview=1  → Preview mode

/settings/layouts                                      → Alias (transition)
/settings/layouts?editor=1&layout={id}                 → Alias (transition)
```

---

## 10. Cross-references

| Concern | Doc |
|---|---|
| Experience Builder doctrine | [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) |
| Interaction model (flow details) | [`04-interaction-model.md`](./04-interaction-model.md) |
| Surface inventory | [`05-surface-inventory.md`](./05-surface-inventory.md) |
| Configuration Mode shell | `docs/system/configuration-mode-doctrine.md` |
| Configuration ownership | `docs/system/configuration-ownership-doctrine.md` |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
