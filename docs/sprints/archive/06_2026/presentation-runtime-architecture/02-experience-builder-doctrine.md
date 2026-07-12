# Experience Builder Doctrine

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/02-experience-builder-doctrine.md`
**Status:** Architecture sprint — design only (June 2026)
**Companion:** [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) (runtime), [`03-information-architecture.md`](./03-information-architecture.md) (IA)

---

## 1. What the Experience Builder is

The **Experience Builder** is the configuration application administrators use to **author the Presentation Runtime**.

It is not a layout editor. It is not a drag-and-drop canvas. It is not a separate product. It is **another Alloy workspace** — it follows the same interaction doctrine as every other Configuration Runtime surface:

```
Configuration Context → Configuration Queue → Configuration Workspace → BOS rail
```

The administrator's mental model:

> "I am designing the experience operators will have."

The internal mental model:

> "I am authoring Design Surfaces for the Presentation Runtime."

---

## 2. Product philosophy

### What administrators should feel

| ❌ Layout Builder feeling | ✅ Experience Builder feeling |
|---|---|
| "I'm editing a JSON layout" | "I'm designing how admissions staff see a lead" |
| "I'm placing fields in a grid" | "I'm composing operational meaning" |
| "I'm configuring a drawer" | "I'm authoring an Enrollment Focus Panel" |
| "I'm building a dashboard widget" | "I'm designing the Enrollment Analytics Dashboard" |
| Blank canvas, figure it out | Architecture first — structure before content |

### What administrators should never encounter

- A separate "Queue Builder" or "Focus Panel Builder" app (forbidden — `configuration-ownership-doctrine.md`)
- A drag-and-drop page builder with arbitrary HTML/CSS
- Per-field font size or color pickers (semantic roles only — `typography-and-presentation-doctrine.md`)
- Raw schema exposed as the primary authoring interface
- A different interaction model than the rest of Configuration Runtime

---

## 3. Relationship to existing Experience Builder

Alloy already has an **Experience Builder** product name and a shipped `/settings/layouts` route with a Layout Gallery and Opportunity Drawer visual editor (`experience-builder-doctrine.md`).

This sprint **extends** the existing Experience Builder — it does not replace it:

| Today | After Presentation Runtime Architecture |
|---|---|
| Route: `/settings/layouts` | Route: `/settings/design-surfaces` (alias `/settings/layouts` during transition) |
| Nav label: "Layouts" | Nav label: "Design Surfaces" |
| Gallery of layout surfaces | Gallery of Design Surface categories |
| Opportunity Drawer visual editor | Category-specific editors (Queue Row, Focus Panel, Dashboard, …) |
| Section/Row/Column/Item model | Zone/Card/Slot/Renderer model (migration path — see reuse map) |
| BP assigns published layouts | BP assigns published Design Surfaces (same assignment flow) |

The existing `ConfigurationModeShell`, `LayoutGalleryClient`, `OpportunityDrawerLayoutVisualEditor`, and `LayoutAssignmentCard` are **reused and extended**, not replaced.

---

## 4. The authoring hierarchy

When an administrator opens a Design Surface in the Experience Builder, the editor **begins with architecture** — never a blank canvas.

```
Design Surface (selected)
  → Zones (topology — platform-defined per category)
    → Cards (Card Type instances — tenant selects from platform catalog)
      → Card Composition (Archetype, density, span, interaction model)
        → Slots (Data Source → Renderer bindings)
          → Behavior (visibility, conditions, actions)
            → Preview (render against live/sandbox data)
```

The administrator always understands **structure before content**. Zones appear first (labeled, with platform-defined topology). Cards appear inside zones (from the Card Type catalog). Slots appear inside cards (from the Card Type's allowed Slot grammar). Renderers are selected per Slot from the closed catalog.

---

## 5. Card Type catalog (platform-owned)

Users **configure Card Instances** — they do **not** create Card Types.

The platform owns the Card Type catalog. Each Card Type declares:

| Property | Example (Billing Card Type) |
|---|---|
| **Identity** | `billing` |
| **Business question** | "What is the financial state?" |
| **Archetype** | Summary |
| **Allowed Slots** | `balance`, `status`, `next_invoice`, `autopay`, `invoices`, `credits`, `payments`, `history` |
| **Allowed densities** | Compact, Standard, Expanded |
| **Allowed spans** | 1, 2, full-row |
| **Allowed interaction models** | Expand, Drill |
| **Default Content Template** | Platform-provided compact/expanded/drill slot fill |
| **Ownership model** | Hybrid |

### Starter Card Type catalog

| Card Type | Question | Archetype |
|---|---|---|
| Lead Summary | Who is this lead? | Summary |
| Readiness | Is this ready? | Status |
| Family | Who are the people? | Profile |
| Children | Who are the enrolled children? | Collection |
| Enrollment | What is the enrollment state? | Summary |
| Billing | What is the financial state? | Summary |
| Attendance | What is the attendance state? | Status |
| Schedule | What is the schedule? | Summary |
| Communications | What was communicated? | Timeline |
| Timeline | What happened? | Timeline |
| Documents | What documents exist? | Collection |
| Tasks | What work is open? | Action |
| AI Summary | What does AI recommend? | Summary |
| Related Records | What is connected? | Collection |
| Work Launcher | What work should start? | Launcher |
| Analytics / Metric | What does the number say? | Metric |

Users pick Card Types, configure Slot fill, set density/span/visibility. They never invent new Card Types.

---

## 6. Renderer catalog (platform-owned)

Users **select Renderers** — they do **not** create Renderers.

The Experience Builder exposes the closed Renderer catalog grouped by purpose:

| Group | Renderers |
|---|---|
| **Text & identity** | Text, Link, Phone, Avatar, Photo, Signature |
| **Status & state** | Status, Badge, Chip, Progress, Primary Yes/No |
| **Numbers & money** | Currency, Number, Gauge, Scorecard |
| **Time** | Date, DateTime, Relative Date, Timeline |
| **Collections** | Table, List, Relationship, Related Records |
| **Analytics** | KPI Card, Trend Card, Sparkline, Line Chart, Area Chart, Bar Chart, Comparison, Gauge |
| **Documents** | Document Viewer, QR Code |
| **Actions** | Action Button |
| **AI** | AI Summary |
| **Layout** | Spacer, Divider, Heading, Static Text |

Each Renderer exposes **semantic configuration** only (e.g., Date renderer: "show time?" / "compact?"). Never font size, color, or pixel dimensions.

---

## 7. Ownership split (authoring vs runtime)

| Concern | Experience Builder owns | Experience Builder never owns |
|---|---|---|
| Design Surface composition | ✅ Zones, Cards, Slots, Renderers, Behavior | |
| Card Type selection | ✅ Which Card Types, in what order | ❌ Card Type definitions |
| Slot fill | ✅ Data Source → Renderer bindings | ❌ Data Source definitions |
| Density / span | ✅ Selection from platform options | ❌ Density/span implementation |
| Visibility / conditions | ✅ Per-card, per-slot, per-zone | ❌ BP stage/mission rules (reads them) |
| Interaction model | ✅ Selection from 5B catalog | ❌ Interaction model implementation |
| Actions (CTA placement) | ✅ Card/Surface action placement | ❌ Action definitions, executors |
| Publishing | ✅ Draft → Preview → Publish | ❌ Runtime rendering |
| Preview | ✅ Render against live/sandbox data | ❌ Side effects, mutations |
| Metric definitions | ❌ | ✅ OIP / Analytics platform |
| Field definitions | ❌ | ✅ Fields hub |
| Process rules | ❌ | ✅ Business Processes |
| Archetype behavior | ❌ | ✅ Platform (System 5A) |
| Content templates | ✅ Select / parameterize | ❌ Template anatomy |
| Platform shell | ❌ Never configurable | ✅ Platform |

**One-line summary:** *Experience Builder owns composition; platform owns anatomy; Business Processes own the why; OIP owns the metrics; Record System owns the data; Actions own the doing.*

---

## 8. Category-specific editors

Each Design Surface **category** gets a tailored editor within the same Configuration Mode shell. The editor adapts its zone topology and available Card Types to the category — but the interaction model is identical.

| Category | Editor focus | Zone topology (platform-defined) |
|---|---|---|
| **Queue Row** | Compact field/signal composition for 52px row | `header.primary`, `header.secondary`, `context`, `body`, `actions` |
| **Focus Panel** | Card grid composition per mode (Summary/Work/Activity) | `summary_strip`, `main`, `right_rail`, `footer_actions` |
| **Workspace** | Operational surface / command center composition | `org_pulse`, `operational_pulse`, `surfaces`, `activity` |
| **Dashboard** | Metric card + chart composition | `hero`, `kpi_strip`, `detail_grid`, `sidebar` |
| **Document** | Print/document block composition | `header`, `body`, `footer`, `signature` |
| **Communication** | Template block composition | `subject`, `body`, `footer`, `variables` |
| **Form** | Capture field composition (distinct runtime) | `sections` (capture-specific) |
| **POS** | Checkout/register line composition | `header`, `items`, `totals`, `actions` |
| **Portal** | Parent/guardian card composition | `hero`, `cards`, `actions` |
| **Print** | Print-optimized block composition | `header`, `body`, `footer` |
| **Mobile** | Responsive card composition | `header`, `body`, `actions` (responsive collapse) |
| **Report** | Report section + table/chart composition | `cover`, `summary`, `detail`, `appendix` |

All editors share:
- The same Configuration Mode shell (`ConfigurationModeShell`)
- The same Card Type catalog (filtered by category relevance)
- The same Renderer catalog
- The same publishing lifecycle
- The same preview engine
- The same BOS rail

---

## 9. What the Experience Builder is not

| Not this | Because |
|---|---|
| A CRM configuration tool | CRM is one vertical; Design Surfaces are platform-wide |
| A form builder (primary) | Forms are one category with a distinct capture runtime |
| A workflow editor | Workflows live in Business Processes + Automation |
| A field definition tool | Fields live in the Fields hub |
| An analytics definition tool | Metric math lives in OIP; EB only places metric visualizations |
| A code editor | No raw JSON/CSS/HTML authoring |
| A page builder | No arbitrary layout; architecture-first composition |

---

## 10. Cross-references

| Concern | Doc |
|---|---|
| Presentation Runtime (what is being authored) | [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) |
| IA + routes | [`03-information-architecture.md`](./03-information-architecture.md) |
| Interaction model | [`04-interaction-model.md`](./04-interaction-model.md) |
| Existing EB doctrine (storage, LayoutDoc) | `docs/platform/operator/experience-builder-doctrine.md` |
| Configuration ownership | `docs/system/configuration-ownership-doctrine.md` |
| Configuration Mode shell | `docs/system/configuration-mode-doctrine.md` |
| Reuse map | [`06-reuse-map.md`](./06-reuse-map.md) |
