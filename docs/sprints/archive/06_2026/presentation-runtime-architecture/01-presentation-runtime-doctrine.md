# Presentation Runtime Doctrine

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`
**Status:** Architecture sprint — design only (June 2026)
**Audience:** Platform architects, product, and implementation leads
**Companion:** [`07-architecture-recommendations.md`](./07-architecture-recommendations.md) (decisions), [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) (authoring)

---

## 1. What the Presentation Runtime is

The **Presentation Runtime** is Alloy's universal presentation system — the layer that turns **record truth** into **operational meaning** for every operator, on every surface, in every product.

It is not a UI framework. It is not a layout builder. It is the **runtime contract** that answers:

- What surfaces exist (Design Surfaces)
- How they are composed (Zones → Cards → Slots → Renderers)
- How they resolve (inheritance, assignments, publishing)
- How they behave (visibility, expansion, actions, reveal)
- Who owns what (platform vs tenant vs process vs analytics)

Every operator experience in Alloy — a queue row, a Focus Panel card, a workspace KPI tile, an analytics chart, a form field, a document line, a POS checkout line, a parent-portal card — is an **expression of the Presentation Runtime**.

The **Experience Builder** is the configuration application administrators use to author the Presentation Runtime. It is not a separate product; it is the **Configuration Runtime surface for presentation**.

---

## 2. The frozen foundation (do not reopen)

The Presentation Runtime **builds on top of** prior freezes. It does not replace them.

| Layer | What is frozen | Authority |
|---|---|---|
| **Runtime spine** | `Workspace → Perspective → Queue → Row → Focus Panel → Context Frame → Mode → Card → Section → Field` | `canonical-interaction-model.md` |
| **Operational geometry** | Queue · Focus Panel · BOS peers; `--alloy-os-op-surface-*` tokens | Runtime Spec Part 3 |
| **Queue UX** | 52px compressed two-line row; State 1 / State 2 | Runtime Spec Part 4 |
| **Focus Panel shell** | Concept B chrome + subject + mode control; fixed bounds; no remount on swap | Focus Panel UX freeze |
| **Universal Card anatomy** | Header / Body / Footer; platform-owned slots; 6 tiers; 4 densities | `universal-card-system.md` |
| **8 Card Archetypes** | Action, Status, Summary, Profile, Collection, Metric, Timeline, Launcher | `universal-universal-card-archetypes.md` (5A) |
| **5 Interaction models** | Expand, Embedded Workspace, Drill, Change Subject, External | `card-interaction-expansion-doctrine.md` (5B) |
| **Content templates** | Fields enter cards only through templates at compact/expanded/drill/workspace depths | `card-content-template-field-inclusion-doctrine.md` (5C) |
| **Reveal / performance** | Coordinated reveal; no section-owned skeletons; queue null ≠ empty | `adminv2-runtime-performance-doctrine.md` |
| **Authority boundary** | Queues/cards = preview; entity GET = truth | `record-system.md`, `interaction-grammar.md` |

> The Runtime is **complete** (`alloy-os-runtime-completion.md`). The Presentation Runtime Architecture sprint defines how **Configuration Runtime** authors what the frozen runtime **renders**.

---

## 3. The three axes

Presentation in Alloy is not one hierarchy — it is **three orthogonal axes** that must not be collapsed.

### 3.1 Composition axis — *How is meaning assembled?*

This is the axis the brief explored. It is the primary subject of the Presentation Runtime.

```
Design Surface
  → Zone
    → Card (Archetype + Card Type instance)
      → Section (within card)
        → Slot
          → Renderer (bound to Data Source)
            → Behavior
```

**Data Sources** (what a Slot binds to) are not presentation primitives — they are references to record truth:

| Source kind | Example | Owner |
|---|---|---|
| **Field ref** | `opportunity.status_key`, `person.phone` | Field Catalog (`field_definitions`) |
| **Resolver ref** | `readiness.summary`, `billing.balance` | Platform code (record responder / VM) |
| **Metric ref** | `enrollment.conversion_rate` | OIP / Analytics (`metric_definitions`) |
| **Collection ref** | `household.contacts`, `enrollment.children` | Record System (related records) |
| **Static ref** | Label, heading, spacer, divider | Authoring config |

Fields are **data**. Renderers are **presentation**. A Slot binds one Data Source to one Renderer (or a Renderer group for composite slots like "name + avatar + status").

### 3.2 Selection axis — *What subset of work, in what order?*

**Perspective** (frozen term) = an **operating lens** over the same underlying records.

> A perspective **changes the lens, not reality.** — `canonical-interaction-model.md`

Examples: Today's Tours, Failed Payments, Waitlist, New Leads. A Perspective is a saved filter/sort/grouping that determines which records appear in a Queue and how they are ordered.

Perspectives are **Configuration Runtime artifacts** owned by Business Processes (`perspectives_v1` / `work_views_v1`). They are **not** Design Surfaces. They **select** which Design Surfaces apply (via layout assignment on Work Views) but do not **compose** them.

### 3.3 Audience axis — *Who is experiencing this, and how does it differ?*

**Viewpoint** (new term — see Naming Doctrine) = an **audience scope** that determines which Design Surface assignments, card visibility, and density defaults apply for a class of operator.

Examples: Admissions Staff, Center Director, Executive, Teacher, Parent (portal), Corporate (multi-site).

Viewpoints are **not** Perspectives. A Director and a Teacher may share the same Perspective ("Today's Enrollments") but experience **different Viewpoints** (Director sees financial KPIs; Teacher sees attendance readiness).

Viewpoints participate in the **inheritance cascade** (§8) and may override card visibility, zone presence, and density — never field truth or process rules.

> **Why not reuse "Perspective"?** "Perspective" is frozen as the operating lens (`glossary.md`, `canonical-interaction-model.md`, `configuration-ownership-doctrine.md`). Reusing it for role-based views would break the spine and every existing doc. **Viewpoint** is the audience-axis primitive.

---

## 4. Primitive definitions

Each primitive below states: **responsibility**, **ownership**, **reuse**, **inheritance**, and **lifecycle**.

### 4.1 Design Surface

| Property | Definition |
|---|---|
| **What** | A named, versioned, publishable **presentation context** — the unit an administrator authors and an operator experiences. |
| **Examples** | Enrollment Queue Row (Compact), Enrollment Focus Panel (Summary), Analytics Dashboard (Enrollment), POS Checkout, Invoice Print View, Parent Portal — Family Card |
| **Responsibility** | Declares its **category**, **entity binding** (if any), **zone topology**, **ownership model**, and **resolution key** |
| **Ownership** | Tenant-authored (Experience Builder); platform provides **Surface Blueprints** (starter topologies) |
| **Reuse** | One published Design Surface may be **assigned** to many Business Processes, Work Views, Perspectives, and Viewpoints |
| **Inheritance** | Resolved through the cascade (§8); child scopes override parent |
| **Lifecycle** | Working Copy → Preview → Published → Retired → Restored (§9) |

A Design Surface is **not** a layout file. It is the **conceptual unit**. Today, a Focus Panel Design Surface is stored as a `LayoutDoc` in `entity_layouts`; a Queue Row Design Surface is stored as `doc.metadata.queue_record_layout`; an Analytics Dashboard Design Surface will be stored as a `metric_placements` bundle + surface document. The **concept** unifies; the **storage shapes** may differ by category (see §10).

### 4.2 Zone

| Property | Definition |
|---|---|
| **What** | A **structural region** within a Design Surface that groups Cards by operational role. |
| **Examples** | Focus Panel: `summary_strip`, `main`, `right_rail`, `footer_actions`. Queue Row: `header.primary`, `header.secondary`, `context`, `body`, `actions`. Dashboard: `hero`, `kpi_strip`, `detail_grid`, `sidebar` |
| **Responsibility** | Topology (which regions exist), default visibility, responsive collapse rules |
| **Ownership** | **Platform-owned topology** per surface category; tenant configures **which Cards** populate each zone |
| **Reuse** | Zone topologies are **category-scoped** — all Queue Row surfaces share the same zone grammar; all Focus Panel surfaces share another |
| **Inheritance** | Zone *presence* may be overridden by Viewpoint (e.g., hide `right_rail` for Teacher Viewpoint) |
| **Lifecycle** | Part of the Design Surface document; versioned with parent |

Zones are **not** Cards. A Zone is a container; Cards are content. Platform shell chrome (header, tabs, BOS rail, lifecycle rail) is **not** a Zone — it is platform-owned and never configurable (`PLATFORM_SHELL_SLOTS` in `surfaceLayoutRegistry.ts`).

### 4.3 Card

| Property | Definition |
|---|---|
| **What** | A **reusable business primitive** that answers exactly **one operational question**. Not a field container. |
| **Examples** | Readiness, Billing Setup, Family, Current Work, Enrollment Timeline, Lead Summary |
| **Responsibility** | Carry operational meaning via its Archetype behavior, Content Template, and configured Slots |
| **Ownership** | **Platform owns** anatomy, behavior, Archetype, tiers, densities, states. **Tenant owns** Card Type **instance** (which Archetype, which Slots filled, density, span, visibility) |
| **Reuse** | One Card Type (e.g., *Readiness*) is composed once and expressed across Enrollment, Compliance, Billing via data bindings |
| **Inheritance** | Card *inclusion* may be overridden by BP stage/mission rules and Viewpoint; card *anatomy* is never overridden |
| **Lifecycle** | Card Type instances live inside a Design Surface document |

> A card is the answer to a question an operator would otherwise have to assemble by reading raw fields. Cards exist so the operator **scans meaning** instead of **reading schema**. — `universal-card-system.md`

#### Card Type vs Card Instance

| Term | Meaning |
|---|---|
| **Card Type** | A platform-defined, reusable card identity (Readiness, Family, Billing, Timeline, …). Fixed purpose, allowed Archetype, allowed Slots, density/span options. **Users do not create new Card Types.** |
| **Card Instance** | A tenant-configured **placement** of a Card Type inside a Design Surface — which Slots are filled, density, span, visibility conditions, assigned Renderer per Slot |

The 8 frozen **Archetypes** (Action, Status, Summary, Profile, Collection, Metric, Timeline, Launcher) are the **structural behavior** of a Card Type. A Card Type selects one Archetype and parameterizes it.

### 4.4 Card Slot

| Property | Definition |
|---|---|
| **What** | A **named region inside a Card** where one Data Source is bound to one Renderer. |
| **Examples** | Billing Card: `balance` (Currency renderer), `status` (Status renderer), `next_invoice_date` (Date renderer). Family Card: `parents` (Collection renderer), `children` (Collection renderer), `emergency_contacts` (Collection renderer) |
| **Responsibility** | Bind data to presentation at a specific depth (compact, expanded, drill) |
| **Ownership** | **Platform defines** allowed Slots per Card Type. **Tenant configures** which Data Source fills each Slot and which Renderer draws it |
| **Reuse** | Slot definitions are **Card Type-scoped** — all Billing Card instances share the same Slot grammar |
| **Inheritance** | Slot *visibility* and *Renderer choice* may be overridden; Slot *existence* is platform-owned |
| **Lifecycle** | Part of Card Instance config inside Design Surface |

#### Should Card Slots exist?

**Yes.** Slots are the correct abstraction for intra-card composition. The alternative — treating Parents, Children, Emergency Contacts as separate Cards — would fragment operational meaning ("Who are the people?" is one question, not three).

Slots vs nested Cards decision matrix:

| Pattern | Use Slots | Use nested Cards |
|---|---|---|
| Sub-units of one business question (Billing: balance/invoices/credits) | ✅ | |
| Related records at a glance (Family: parents/children/contacts) | ✅ | |
| Distinct operational questions (Readiness + Billing + Timeline) | | ✅ |
| Expandable detail within one card | ✅ (expanded depth) | |
| Cross-card navigation (Family → Person) | | ✅ (Change Subject interaction) |

Content Template doctrine (5C) already defines Slot depths: compact, expanded, drill, workspace. The Presentation Runtime adopts this unchanged.

### 4.5 Section (within Card)

| Property | Definition |
|---|---|
| **What** | An **organizing band** of related Slots under the card's business question. |
| **Examples** | Billing expanded: "Invoices" section, "Credits" section, "Payment History" section |
| **Responsibility** | Group Slots for scannability; control collapse/expand within expanded card depth |
| **Ownership** | Platform-defined in Content Template; tenant may reorder Sections within a Card Instance |
| **Reuse** | Section definitions are Content Template-scoped |
| **Inheritance** | Section visibility may be Viewpoint-overridden |
| **Lifecycle** | Part of Content Template + Card Instance |

> **Disambiguation:** "Section" in the **composition axis** (within a Card) is distinct from "Section" in **LayoutDoc** (a layout container in Experience Builder's legacy section/row/column model). During migration, LayoutDoc sections map to Zones or Cards; the Card-internal Section is the 5C primitive.

### 4.6 Renderer

| Property | Definition |
|---|---|
| **What** | A **pure presentation function** — the smallest reusable presentation primitive. Draws one typed value, collection, or signal. |
| **Examples** | Text, Status, Currency, Date, DateTime, Avatar, Relationship, Badge, Chart, Progress, Timeline, Table, Document Viewer, Action Button, Photo, Signature, QR Code, AI Summary, Sparkline, Gauge, Scorecard, Chip, Link, Phone, Primary Yes/No |
| **Responsibility** | Visual presentation only — typography tier, color, icon, format, density envelope. **Never owns data, never owns behavior, never owns actions.** |
| **Ownership** | **Platform-owned catalog.** Tenants select Renderers; they do not create them. |
| **Reuse** | **Universal** — the same Currency renderer draws a balance in a Focus Panel card, a queue row field, a KPI tile, a POS line item, a document table cell, and a portal card |
| **Inheritance** | Renderer *choice* may be Viewpoint-overridden (e.g., compact vs expanded Date renderer); Renderer *implementation* is never overridden |
| **Lifecycle** | Platform code; versioned with platform releases |

Renderers map to the existing closed vocabulary:

| Existing vocab | Presentation Runtime Renderer |
|---|---|
| `LAYOUT_RENDER_HINTS` (`layoutV2.ts`) | Text, Status, Date, DateTime, Currency (money), Link, Badge, Phone, Primary Yes/No, Custom |
| `MetricVisualizationType` (`metrics/platform/types.ts`) | KPI Card, Trend Card, Sparkline, Line/Area/Bar Chart, Comparison, Gauge, Scorecard, Table, Chip |
| Forms field types (`schema.ts`) | Text, Number, Date, Boolean, Select, File, Signature, Group (repeat) — **capture** renderers, distinct from display renderers |
| Typography tiers (`presentationTypography.ts`) | Renderers consume tiers 1–6; they do not define them |

> **The Renderer is the atom.** Everything above it is composition. Everything below it (Data Source, field value) is data. This is the sprint's load-bearing decision — see `07-architecture-recommendations.md`.

### 4.7 Data Source (binding primitive)

| Property | Definition |
|---|---|
| **What** | A reference to **record truth** that a Slot binds to a Renderer. Not a presentation primitive — included here because Slots require it. |
| **Responsibility** | Resolve the value(s) a Renderer will draw |
| **Ownership** | Field refs → Field Catalog. Resolver refs → Platform code. Metric refs → OIP. Collection refs → Record System |
| **Reuse** | Field refs are universal (`field_definitions.field_key`). Resolver refs are Card Type-scoped |
| **Inheritance** | Data Sources are never overridden by presentation config — only Slot visibility and Renderer choice |
| **Lifecycle** | Fields version with Field Catalog; metrics version with OIP definitions |

### 4.8 Behavior

| Property | Definition |
|---|---|
| **What** | A **declarative rule** governing how a primitive appears, responds, or transitions. |
| **Responsibility** | Visibility, required, read-only, editable, expandable, conditional display, default state, density selection, span selection, interaction model selection |
| **Ownership** | Split by layer (see Behavior Ownership table below) |
| **Reuse** | Behavior *types* are platform-owned; behavior *values* are configured per primitive |
| **Inheritance** | Behavior cascades through the inheritance chain; child scope wins |
| **Lifecycle** | Part of Design Surface / Card Instance / Slot config |

#### Behavior ownership

| Behavior | Field | Slot | Card | Zone | Design Surface | Viewpoint | BP / Process | System |
|---|---|---|---|---|---|---|---|---|
| Visibility | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (stage/mission) | |
| Required | ✅ (Field Catalog) | | | | | | ✅ (stage rules) | |
| Read-only | ✅ (Field Catalog) | ✅ | | | | ✅ | | |
| Editable | ✅ (Field Catalog) | ✅ | | | | | | |
| Expandable | | | ✅ (interaction model) | | | | | ✅ (5B models) |
| Conditional display | | ✅ | ✅ | ✅ | | ✅ | ✅ | |
| Default state (expanded/collapsed) | | | ✅ | | | ✅ | | |
| Density | | ✅ | ✅ | | | ✅ | | ✅ (platform options) |
| Span | | | ✅ | | | | | ✅ (platform grid) |
| Interaction model | | | ✅ | | | | | ✅ (5B catalog) |
| Actions (CTA) | | ✅ | ✅ | | ✅ (surface actions) | | ✅ (process actions) | ✅ (executors) |
| AI assistance | | | ✅ | | ✅ | | | ✅ (BOS) |
| Publishing | | | | | ✅ | | | ✅ |
| Permissions | | | | | ✅ | ✅ | ✅ | ✅ (RBAC) |
| Reveal timing | | | ✅ | | | | | ✅ (performance doctrine) |

### 4.9 Condition

| Property | Definition |
|---|---|
| **What** | A **predicate** evaluated at render time to gate Behavior. |
| **Examples** | `stage = 'tour_scheduled'`, `field.opportunity.status_key = 'open'`, `metric.enrollment_rate < target`, `viewpoint = 'director'`, `mission = 'review_lead'` |
| **Responsibility** | Determine whether a Behavior applies |
| **Ownership** | Condition *operators* are platform-owned. Condition *expressions* are configured by tenant (Experience Builder) or BP (stage/mission rules) |
| **Reuse** | Same condition grammar across all primitives and all surfaces |
| **Inheritance** | Conditions are evaluated at the scope where they are defined; child-scope conditions add to (never remove) parent-scope conditions unless explicitly overridden |
| **Lifecycle** | Part of Behavior config |

Condition grammar (proposed, aligned with existing forms visibility):

```
Condition := FieldRef Operator Value
           | Condition AND Condition
           | Condition OR Condition
           | NOT Condition

Operator := eq | neq | gt | lt | gte | lte | in | not_in | is_empty | is_not_empty | matches_stage | matches_mission | matches_viewpoint
```

### 4.10 Action

| Property | Definition |
|---|---|
| **What** | An **invocation point** that triggers a registered platform action through the canonical execution pipeline. |
| **Responsibility** | Surface the expected next move without embedding process logic |
| **Ownership** | Split across layers (see Action Ownership below) |
| **Reuse** | Same canonical action key may appear on multiple surfaces (header Manage, rail, card CTA, queue row inline, layout action button) |
| **Inheritance** | Action *availability* cascades; action *definition* is global |
| **Lifecycle** | Action definitions are versioned in Actions hub; placements are part of Design Surface / Card / Slot config |

#### Action ownership (unified layer)

| Action layer | What it is | Config store | Example |
|---|---|---|---|
| **System Action** | Platform-defined executor | `action_definitions` | `executeAdminAction`, relationship wizard |
| **Business Process Action** | Stage/process-gated availability | BP stage matrix + `action_placements` | "Approve enrollment" available only in Enrolled stage |
| **Workflow Action** | Automation-triggered | Workflow definitions | Auto-send welcome email on stage transition |
| **Surface Action** | Design Surface chrome action | Design Surface config | "Create Lead" on workspace header |
| **Card Action** | Card CTA (primary/secondary) | Card Instance config | "Schedule Tour" on Readiness card footer |
| **Slot Action** | Inline action on a field/row | Slot config | "Make Primary" on contact row |
| **BOS Action** | AI-proposed action | BOS rail | "Draft follow-up email" |

**Rule:** Do not embed Process Actions inside Cards as ad-hoc logic. Card CTAs **reference** canonical action keys; BP owns *when* they are available; Actions hub owns *what* they do; executors own *how* they run.

Card footer actions today are "visual affordances only" (5B §12 — runtime not fully built). The Presentation Runtime adopts the 5B/5C action placement model as the target.

### 4.11 Viewpoint

| Property | Definition |
|---|---|
| **What** | An **audience scope** that determines presentation defaults for a class of operator. |
| **Examples** | Admissions Staff, Center Director, Executive, Teacher, Parent (portal), Corporate (multi-site), Kiosk (POS) |
| **Responsibility** | Override card visibility, zone presence, density defaults, and Design Surface assignments for an audience — never data, process rules, or permissions |
| **Ownership** | Tenant-configured; platform provides default Viewpoints per industry bootstrap |
| **Reuse** | One Viewpoint applies across all Business Processes for an audience |
| **Inheritance** | Viewpoint overrides sit below Org and above Operator in the cascade (§8) |
| **Lifecycle** | Published alongside org config; may be assigned to roles/access profiles |

Viewpoints are **not** RBAC. Permissions gate *capability*; Viewpoints gate *presentation*. A Teacher with `enrollment.view` permission sees the Teacher Viewpoint; a Director with the same permission sees the Director Viewpoint.

### 4.12 Perspective (frozen — selection axis)

| Property | Definition |
|---|---|
| **What** | An **operating lens** — saved filter/sort/grouping over the same records. |
| **Responsibility** | Determine which records appear in a Queue and how they are ordered |
| **Ownership** | Business Processes (`work_views_v1` / `perspectives_v1`) |
| **Reuse** | Process-scoped; referenced by Operational Surfaces and deep links |
| **Inheritance** | Not part of the presentation inheritance cascade — Perspectives are runtime selection, not presentation config |
| **Lifecycle** | Saved with BP config; synced to queue lanes on stage save |

> Perspective is **not renamed**. It is frozen. See §3.2.

---

## 5. Card expansion architecture

Cards may expand. The Presentation Runtime adopts the **five frozen interaction models** (System 5B) and does not invent ad hoc expansion.

| Model | When | What expands | Subject preserved? |
|---|---|---|---|
| **Expand** | More detail, same question | Slot depths: compact → expanded → drill | ✅ Same subject, same mode |
| **Embedded Workspace** | Domain workspace needed (Communications, Documents) | Activity-mode horizontal tab workspace inside Focus Panel | ✅ Subject preserved; back returns to prior mode |
| **Drill View** | Focused subordinate detail | Drill shell with back stack (e.g., invoice line items) | ✅ Subordinate detail, not new subject |
| **Change Subject** | Operator selects another business object | Full Focus Panel recompose for new subject | ❌ New subject (explicit selection) |
| **External / Full Workspace** | Destination cannot fit in Focus Panel | Full workspace, modal, or route with return context | Context preserved via return stack |

Expansion content is determined by: **Archetype + Content Template + configured Slot depths + interaction model**. Not by dumping all catalog fields.

Example — Billing Card:

| Depth | Content |
|---|---|
| **Compact** (card in grid) | Balance (Currency) · Status (Status) · Next Invoice (Date) |
| **Expanded** (inline expand) | + Invoices section (Table renderer) · Credits section (Table) · Payment History section (Timeline) |
| **Drill** (drill view) | Single invoice detail with line items |
| **Embedded Workspace** | Full billing workspace (future — if billing module warrants it) |

Should expansion expose Slots, nested Cards, secondary Zones, modal, or embedded workspace?

**Answer: primarily Slots at deeper depths; Embedded Workspace for domain modules; Drill for subordinate detail; never unconfigured field dumps.**

---

## 6. Analytics as a Design Surface

Analytics is **not a separate product**. It is a **Design Surface category** within the Presentation Runtime.

### Current state (parallel systems)

| Layer | Analytics V2 | OIP legacy | Layout/Card |
|---|---|---|---|
| Definition | `metric_definitions` | `kpiRegistry` (code) | N/A |
| Visualization | `metric_visualizations` | `OipKpiObjectCard` (code) | Card Archetype: Metric |
| Placement | `metric_placements` (surface + zone) | `workspace_kpi_placement` | Layout widget / KPI strip |

### Target state (unified)

| Concern | Owner | Primitive |
|---|---|---|
| **Metric math** (aggregation, filters, targets, thresholds) | OIP / Analytics platform (code + `metric_definitions`) | Data Source (metric ref) |
| **Visualization** (how a number looks) | Shared Renderer catalog | Chart, KPI Card, Sparkline, Gauge, Scorecard, Table, Trend Card, Chip renderers |
| **Placement** (where it appears) | Design Surface config | Zone + Card (Metric Archetype) + Slot + Renderer |
| **Dashboard composition** | Experience Builder | Design Surface (category: Dashboard) with Zones + Metric Cards |

An Analytics Dashboard Design Surface is composed exactly like a Focus Panel Design Surface:

```
Analytics Dashboard (Design Surface)
  → Zone: hero (KPI strip)
    → Card: Enrollment Conversion (Metric Archetype)
      → Slot: rate → Renderer: KPI Card
      → Slot: trend → Renderer: Sparkline
  → Zone: detail_grid
    → Card: Enrollment Funnel (Metric Archetype)
      → Slot: stages → Renderer: Bar Chart
  → Zone: sidebar
    → Card: Alerts (Metric Archetype)
      → Slot: items → Renderer: Table
```

**No second configuration model for Analytics.** Metric definitions remain in OIP; only visualization + placement move into the Presentation Runtime composition model.

---

## 7. System ownership models

Not every Design Surface should be fully configurable. Each declares an **ownership model**:

| Model | Meaning | Examples |
|---|---|---|
| **System-Owned** | Platform defines topology, cards, and content. Tenant may not reconfigure. | Platform shell chrome, BOS rail, reveal gates, performance doctrine surfaces |
| **Hybrid** | Platform defines topology and Card Types. Tenant configures Card Instances, Slot fill, visibility, density. | Focus Panel (Summary/Work/Activity), Queue Row, Workspace KPI strip |
| **Fully Configurable** | Tenant defines zones, cards, slots, renderers within platform guardrails. | Analytics Dashboard, Document template, Communication template, Portal card, Print view |
| **Capture** (distinct runtime) | Tenant defines fields, validation, submission — not display composition. | Forms (`FormSchemaV1`), POS intake fields |

Capture surfaces share **authoring chrome** (field catalog, visibility, draft/publish) with the Experience Builder but have a **separate runtime contract** (validation, signatures, submission lifecycle). They are Design Surface categories, not Design Surface clones.

---

## 8. Inheritance cascade

The Presentation Runtime supports a **six-level inheritance cascade**. Child scope overrides parent; unset values inherit.

```
Platform Default (blueprint)
  → Industry Default (vertical bootstrap)
    → Organization (tenant)
      → Location (site)
        → Viewpoint (audience)
          → Operator (personal preference — future)
```

| Level | What it overrides | Example |
|---|---|---|
| **Platform Default** | Surface Blueprint topology, default Card Types, default Content Templates | Enrollment Focus Panel ships with Readiness + Family + Timeline cards |
| **Industry Default** | Industry-specific Card Types, metric packs, Viewpoint defaults | Childcare bootstrap adds Attendance card, enrollment KPI pack |
| **Organization** | Published Design Surfaces, custom Card Instances, org Viewpoints | Org publishes custom Billing card layout |
| **Location** | Site-specific overrides (e.g., hide corporate KPIs at a single center) | North Campus hides Executive KPI strip |
| **Viewpoint** | Audience-specific card visibility, density, zone presence | Teacher Viewpoint hides Billing zone |
| **Operator** | Personal density/expand preferences (future) | Operator prefers compact cards |

**Override rules:**

1. Child may **hide** what parent shows (visibility override).
2. Child may **change Renderer/density** for visible primitives.
3. Child may **not** invent primitives parent doesn't allow (no new Card Types, no new Zones, no new Renderers).
4. Child may **not** override data truth, process rules, or permissions.
5. BP stage/mission rules apply **in addition to** (not instead of) the inheritance cascade.

**Resolution at runtime:**

```
resolved_config = merge(
  platform_default,
  industry_default,
  org_published_surface,
  location_override,
  viewpoint_override,
  operator_preference,
  bp_stage_mission_rules  // additive visibility/actions
)
```

This extends the existing layout resolver order (`experience-builder-doctrine.md`):

1. Work View pinned layout IDs
2. `business_process_layout_assignments`
3. Org → default → builtin → registry fallback

…with Viewpoint and Location layers above org, and Industry below org.

---

## 9. Publishing lifecycle

Every Design Surface follows the same publishing lifecycle:

```
Working Copy
  → Preview (render against live/sandbox data)
    → Published (immutable version, assignable)
      → Retired (soft-delete, no new assignments)
        → Restored (re-publish retired version)
```

| Stage | Meaning | Rules |
|---|---|---|
| **Working Copy** | Draft edits in progress | Only editor sees changes; runtime unaffected |
| **Preview** | Render against live or sandbox record data | Read-only; no side effects; shows resolved inheritance |
| **Published** | Immutable version | Assignable to BP/Work View/Viewpoint; runtime reads published version only |
| **Retired** | Soft-deleted | Existing assignments continue until replaced; no new assignments |
| **Restored** | Re-publish a retired version | Creates new published version with same content |

**Version history:** Every publish creates a new version number. Diff between versions. Rollback = publish a previous version.

**Dependencies:** Publishing a Design Surface checks downstream assignments (which BPs, Work Views, Viewpoints reference it). Impact analysis shows affected surfaces before publish.

**Usage:** Published surfaces report assignment count, last-used timestamp, and dependent processes.

---

## 10. Storage shapes (conceptual unification, not migration)

The Presentation Runtime **concept** unifies all surfaces. Storage may use **category-specific document shapes** during migration and beyond:

| Design Surface category | Current storage | Target storage shape |
|---|---|---|
| Focus Panel | `LayoutDoc` (`entity_layouts`, surface=`drawer`) | `DesignSurfaceDoc` (generalized; `LayoutDoc` is a valid shape) |
| Queue Row | `doc.metadata.queue_record_layout` (v3) | `DesignSurfaceDoc` (queue category) |
| Dashboard / Analytics | `metric_placements` + viz bundle | `DesignSurfaceDoc` (dashboard category) + metric refs |
| Document / Print | `document_composition` in `FormSchemaV1` | `DesignSurfaceDoc` (document category) |
| Form (capture) | `FormSchemaV1` | `CaptureSurfaceDoc` (distinct capture contract) |
| Communication template | TBD | `DesignSurfaceDoc` (communication category) |
| POS | Bespoke shell config | `DesignSurfaceDoc` (pos category) |
| Portal / Mobile | TBD | `DesignSurfaceDoc` (portal/mobile category) |

> **This sprint does not specify the migration.** It specifies that all categories share the **same composition primitives** (Zone → Card → Slot → Renderer) and the **same authoring experience** (Experience Builder), even if storage shapes differ during transition.

---

## 11. Visual presentation contract

All Presentation Runtime surfaces inherit the locked visual language:

| Concern | Authority |
|---|---|
| Typography tiers (1–6) | `presentationTypography.ts` — values win over labels |
| Color palette | Bend Pine `#00a283`, Midnight `#1a2332`, Stone `#d4d8de`, white canvas |
| Card rhythm | White cards, stone borders, soft pine selected states, emerald gradient headers |
| Date formatting | Context-specific formatters (`presentationDateFormat.ts`) — never ISO on operator surfaces |
| Empty states | Tier 6, intentional, never disabled-looking |
| Motion | Preserves context; never weakens reveal gates |
| Density | Platform-owned options (Micro, Compact, Standard, Expanded) |

Renderers consume typography tiers and visual tokens. The Experience Builder exposes **semantic roles** (Title, Header, Label, Value, Helper, Empty) — never per-field font size or hex color pickers.

---

## 12. Cross-references

| Concern | Doc |
|---|---|
| Architecture decisions + smallest primitive | [`07-architecture-recommendations.md`](./07-architecture-recommendations.md) |
| Experience Builder (authoring) | [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) |
| IA + routes | [`03-information-architecture.md`](./03-information-architecture.md) |
| Interaction model | [`04-interaction-model.md`](./04-interaction-model.md) |
| Surface inventory | [`05-surface-inventory.md`](./05-surface-inventory.md) |
| Reuse map | [`06-reuse-map.md`](./06-reuse-map.md) |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
| Frozen card system | `docs/platform/operator/universal-card-system.md` |
| Frozen archetypes | `docs/platform/operator/universal-universal-card-archetypes.md` |
| Frozen interaction models | `docs/platform/operator/card-interaction-expansion-doctrine.md` |
| Frozen content templates | `docs/platform/operator/card-content-template-field-inclusion-doctrine.md` |
| Existing EB doctrine | `docs/platform/operator/experience-builder-doctrine.md` |
| Visual language | `docs/platform/operator/alloy-visual-language.md` |
| Typography | `docs/system/typography-and-presentation-doctrine.md` |
