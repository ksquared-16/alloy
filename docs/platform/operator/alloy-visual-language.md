---
owner: operator
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# Alloy Visual Language

**Status:** Canonical doctrine (June 2026; Workspace Taxonomy ratified July 2026). **Visual doctrine** — the bridge from the [Canonical Interaction Model](./canonical-interaction-model.md), [Interaction Grammar](./interaction-grammar.md), and [Operator Story](./operator-story.md) into mockups and category composition.

This document is the **canonical owner** for:

- Alloy Workspace Taxonomy (W1–W8)
- Shared Layering Grammar (A–G)
- Category-level composition philosophy
- Region vs Object vs Card philosophy
- Cross-category visual consistency principles

This is **not** a design system spec, a Tailwind/token document, a Figma spec, or a component inventory. Specialist implementation detail stays in category-owned doctrine (linked below). Code owns literal tokens.

---

## Core premise

> Alloy should not feel like a configurable database UI. **Alloy should feel like a modern operational system.**

Configuration powers the runtime, but the runtime must not expose raw configuration as the primary experience. The operator sees **operational meaning**; the schema lives underneath.

**Same operating system, different kinds of work.** Every workspace inherits one Shared Layering Grammar. Categories compose that grammar differently on purpose — Operational (W4) and Configuration (W5) do not share a canvas treatment.

This doctrine pairs with the interaction model: the interaction model defines the **primitives and laws**; this doc defines how those primitives should **look, layer, and compose**. Mockups and category UIs should be derived from both — not designed screen-by-screen.

---

## 1. Business meaning before fields

The interface leads with **operational meaning**, not schema.

| ❌ Schema-first (avoid as headline) | ✅ Meaning-first (lead with this) |
|-------------------------------------|-----------------------------------|
| Enrollment Status | This family is ready for tour. |
| Program / Desired Start Date | This child is blocked by missing medical documentation. |
| Billing Type | This payment failed and needs action. |
| Tour Date | This room has capacity risk next week. |

Fields are still necessary — they **support** meaning, they do not **dominate** the screen.

## 2. Operators scan before they read

Operators are interrupted and under pressure. The runtime must be **quickly scannable**:

- Strong hierarchy
- Concise labels
- Meaningful chips
- Clear status
- Calm whitespace
- Predictable object rhythm (cards when they earn their chrome)
- Immediate recognition of **risk / readiness / next action**

Avoid dense field grids as the default presentation.

## 3. Cards communicate state, not schema

Cards are **business primitives** that answer a business question — *Is this family ready? What is blocking enrollment? Is billing set up? Is this child safe to attend? Is this schedule valid? Is capacity available? What work remains?*

| ❌ Schema grouping (avoid) | ✅ Business primitive (prefer) |
|----------------------------|-------------------------------|
| Enrollment Fields | Enrollment Readiness |
| Billing Info | Billing Setup |
| Child Details | Health & Safety |
| (field dump) | Placement · Schedule · Capacity · Operational Work |

A card should not merely group fields. See [§ Region vs Object vs Card](#region-vs-object-vs-card) and `./canonical-interaction-model.md` § Cards doctrine.

## 4. Understanding is ambient; editing is intentional

The **default state of Alloy is understanding, not editing**. Operators first see the current operating state; editing happens when they intentionally choose to act. This reduces form fatigue.

| Prefer | Avoid |
|--------|-------|
| Summaries, snapshots, chips | Always-on editable field grids |
| Inline status, action rows | Exposed empty fields |
| Focused edit panels | Long forms as primary content |
| Progressive disclosure | Controls that compete with meaning |

## 5. The drawer is an operating surface, not a form

Drawers must not feel like database records. The product surface is the **Focus Workspace** (Focus Panel). It answers:

- **Who/what** am I looking at?
- **Why** am I looking at it now?
- What is the **current state**?
- What **needs action**?
- What **happened before**?
- What should I **do next**?

The drawer **chrome** makes the active context obvious:

| Chrome element | Carries |
|----------------|---------|
| Record of attention | What the operator is working on |
| Context frame | Why it was opened right now |
| Source perspective | Where it was opened from |
| Active location / scope | Which child / site / context is active |
| Previous / Next | Traversal of the current filtered queue |
| Primary action | The expected next move |
| Attention / risk state | Whether this needs urgency |

(Drawer concepts: `./canonical-interaction-model.md` § The drawer carries three concepts.)

## 6. Motion preserves context

Motion **explains continuity** — it does not decorate.

| Use motion to show | Avoid |
|--------------------|-------|
| Queue → drawer focus | Flashing |
| Card expansion | Layout jumps |
| Action completion | Skeleton morphing |
| Next-record progression | Sudden content reordering |
| Background context preservation | Animations that delay work |
| State update without disorientation | |

Motion must respect the locked reveal/performance gates — it never weakens atomic reveal or composed-payload readiness (`../../system/adminv2-runtime-performance-doctrine.md`).

## 7. Inputs are platform primitives

Date pickers, time pickers, dropdowns, lookups, status controls, money inputs, phone inputs, address inputs, and person pickers must feel **consistent across every domain**. A weak input primitive damages the entire platform.

**Current UX alignment gaps (acknowledged):**

- Drawers currently feel too **grid/form-like**.
- **Date/time** controls feel cumbersome.
- **Dropdown** styling, background, font color, disabled state, read-only state, and editable affordance need **platform-level consistency**.
- **Field density** should be controlled intentionally.
- Modernizing these primitives is **not cosmetic** — it is part of making the runtime feel cohesive.

(These mirror `./canonical-interaction-model.md` § Known UX alignment gaps and do not change any locked runtime doctrine.)

## 8. Calm under pressure

Childcare operators are interrupted constantly. Alloy should feel **calm, not busy**. Visual decisions reduce cognitive load. The runtime should:

- Keep operators oriented
- Avoid unnecessary contrast and noisy surfaces
- Make **risk visible without making everything feel urgent**
- Make completion satisfying
- Make empty states feel **intentional**, not broken

## 9. Premium means predictable

Premium is **not decorative**. Premium means:

- Predictable spacing · consistent controls · clear hierarchy
- Fast transitions · stable surfaces
- No visual surprises · no accidental layout changes
- No jarring state refreshes · **no "raw admin panel" feeling**

## 10. The visual system must serve the interaction model

Do **not** design screens independently. Design the **universal primitives**, and let every domain inherit them:

```
Workspace · Perspective · Queue · Row · Drawer shell · Context frame ·
Mode · Card · Section · Field · Platform inputs
```

Enrollment, Billing, Attendance, Scheduling, Staffing, Subsidy, Compliance, POS, Transportation, Meals, and Health all inherit the **same visual language**.

> **Mockups express the doctrine; they do not invent a new interaction model.**

---

## Alloy Workspace Taxonomy

A **workspace** is a composed operator place where a *kind of work* happens. It has a primary operator question, a navigation pattern, a dominant activity, and a composition model that realizes the [Shared Layering Grammar](#shared-layering-grammar).

Workspaces are **not** queues alone, cards, modes, KPI strips, the BOS rail, or create/confirm dialogs. See [Not workspace categories](#not-workspace-categories).

**Planes vs taxonomy:** The five operational planes (Configuration / Planning / Operations / Records / Intelligence) in [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) answer *where the operator stands*. This taxonomy answers *how the place is composed*. They compose; they are not the same axis.

### Progressive depth (Operations path)

```
W1 Organization → W2 Execution → W3 Focus → W7 Embedded
```

W4 Operational and W5 Configuration are sibling places opened from shell navigation / settings — members of the same taxonomy, not steps on this zoom chain.

### W1–W8

| ID | Category | Purpose | Primary question | Dominant activity | Composition intent | Canvas philosophy | Specialist doctrine | Maturity | Reference |
|----|----------|---------|------------------|-------------------|--------------------|-------------------|---------------------|----------|-----------|
| **W1** | Organization Workspace | Decide which work to enter next — not where work is done | Where should I go? | Orient · prioritize · launch | Orientation and operational storytelling; launch surfaces and org-level signals; not a module modal; not a field of floating cards by default | Ambient / white storytelling ground — **not** V3 stone | [`./workspace-v3-command-center-doctrine.md`](./workspace-v3-command-center-doctrine.md); landing rules in [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) | **Shipped** | `/workspace` · `WorkspaceRootShell` |
| **W2** | Execution Workspace | Execute a cohort of work for a Business Process / Work View | What should I do? | Triage · select · resolve · complete | Queue-and-focus execution; strong continuity between preview and authoritative detail; condensed queue peer to Focus | White working ground supporting sustained high-density work — **not** V3 stone | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md); Operational Mode doctrine | **Shipped** | Work Unit route + queue region + Focus Panel |
| **W3** | Focus Workspace | Authoritative work on one operational subject, in place | What about *this* object needs me — and what next? | Decide · act · disclose | One subject; mission-led hierarchy; cards as business primitives; supporting context must not compete equally with current work | White Focus ground | [`./drawer-system.md`](./drawer-system.md); [`./operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5); [`./universal-card-system.md`](./universal-card-system.md) | **Shipped** (UX gaps acknowledged in §7) | Focus Panel / `FocusPanelSurface` |
| **W4** | Operational Workspace | Category-of-work module modal (Processing, Communications, Work Items, …) | What needs action in this module right now? | Module triage + detail; Studio for assets | **Frozen Operational Workspace Doctrine V3** — inset River Stone field; white operational surfaces floating on the field | **Inset stone canvas (mandatory for W4)** | [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) § V3 (**frozen**); structural shell: [`./operational-workspace-shell.md`](./operational-workspace-shell.md) | **Shipped + frozen** | Processing (reference); Communications · Work Items (certified) |
| **W5** | Configuration Workspace | Operate configuration objects as things the organization runs | What am I configuring, and what is the consequence? | Assess · deliberate · edit in place | White canvas intentional; hierarchy from regions, grouping, spacing, scope, ownership; avoid unnecessary floating-card composition; coherent working environment — not an operational modal | **White canvas (mandatory for W5)** | [`./configuration-workspace-platform-doctrine.md`](./configuration-workspace-platform-doctrine.md); [`./configuration-workspace-visual-language.md`](./configuration-workspace-visual-language.md) | **Shipped** | Configuration Runtime; Locations · Commercial consumers |
| **W6** | Analytics Workspace | Analytical posture — what happened, why, trends | What happened? Why? What trends? | Explore · compare · report | Comparison, pattern recognition, exploration; charts and metrics are **objects**, not decorative cards | White until composition is certified (do **not** assume V3 stone) | [`./operational-workspace-shell.md`](./operational-workspace-shell.md) (OI); command-center Analytics law | **Shipped UI; composition gap** | Operational Intelligence / `AnalyticsModal` — not V3-certified |
| **W7** | Embedded Workspace | Domain workspace inside Focus without changing subject | What domain work applies to this subject? | Contained domain act + return | Inherits parent Focus context; must **not** reproduce a second full workspace shell; compact composition with clear containment | Inherits W3 canvas | [`./card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (System 5B Model 2) | **Doctrinal; runtime incomplete** | System 5B Embedded Workspace model |
| **W8** | Planning Workspace | Model future state without committing operational truth | What if? What does the future look like? | Compare · forecast · scenario | Scenario construction, comparison, future-state reasoning; clear non-authoritative labeling | Reserved — not stone-by-default; no invented implementation requirements beyond philosophy | Planning plane in [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) | **Reserved** — no complete runtime | — |

**Law:** Do not invent a parallel hierarchy per module. Vary category composition; keep the grammar.

---

## Shared Layering Grammar

### Law

**Every workspace inherits the same layering grammar.**
**Composition varies by category. The grammar does not.**

Color and token values **express** layer responsibility; they do **not** define the layers. Canvas treatment (stone vs white vs ambient) is a **category composition choice at Layer C**, not a second grammar.

Operational Workspace Doctrine V3 is the **frozen specialization of this grammar for W4** — not the platform-wide grammar itself.

### Layers A–G

```
A  Application Shell
B  Workspace Frame
C  Workspace Canvas
D  Working Regions
E  Objects
F  Controls
G  Selection
```

| Layer | Name | Responsibility |
|-------|------|----------------|
| **A** | Application Shell | Persistent OS chrome — app nav, geometry hosts, modal host, BOS rail peer. Not page content. |
| **B** | Workspace Frame | Identity and primary navigation for *this* workspace — title, modes, section tabs, health band when applicable. Not the working ground. |
| **C** | Workspace Canvas | Continuous working ground that establishes depth beneath regions and objects. Category chooses treatment (stone, white, ambient). Not a card. |
| **D** | Working Regions | Structural partitions — columns, rails, zones, section stacks, inspectors. Organize work; do not answer business questions by themselves. |
| **E** | Objects | Discrete things the operator recognizes, inspects, compares, selects, or acts on. May render as cards, rows, tiles, metrics, or plain blocks. |
| **F** | Controls | Buttons, inputs, toggles, zoom, row actions — interactive affordances. |
| **G** | Selection | Active / selected / progressive emphasis applied to an object or control (typically Bend Pine). **A state — not an independent content surface.** |

### Invariants

1. Every workspace inherits A–G; not every workspace uses the same Layer C treatment.
2. Composition varies primarily at **Canvas (C), Region (D), and Object (E)**.
3. One shell, one frame, one canvas per workspace instance — no nested competing shells.
4. Regions partition; objects mean — do not use object chrome to invent layout.
5. Selection (G) is semantic and scarce — not decorative accent spam.
6. Queues remain preview; authoritative detail lives in Focus / entity GET.
7. Modes are lenses inside a workspace, not workspace categories.

### W4 specialization map (frozen — do not reopen)

| V3 frozen layer | Shared grammar |
|-----------------|----------------|
| 1 Application shell | **A + B** |
| 2 Workspace field (inset stone) | **C** — W4 only |
| 3 White operational surfaces | **D + E** on the stone field |
| 4 Interactive objects | **F** |
| 5 Selection / Bend Pine | **G** |

Implementation vocabulary for W4: `web/components/workspace/doctrine.ts` and [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md). Token tables stay in code — not duplicated here.

---

## Category composition

Category rules below are **philosophy**. Specialist docs own implementation stacks, component inventories, and frozen pixel rules.

### W1 — Organization Workspace

- Orientation and operational storytelling; enterability over dashboards.
- Launch surfaces and organization-level signals (four-zone law).
- Not an operational module modal; not Work Unit functionality (no queues, Focus, or BOS execution on the landing).
- Not a field of floating cards by default — zones are regions; launch tiles are sparse objects.

### W2 — Execution Workspace

- Queue-and-focus execution; preview (queue) and authority (Focus) stay continuous.
- Condensed queue and Focus Workspace as peer composition under Operational Mode.
- Canvas must support sustained high-density work (white System 5 ground — not W4 stone).

### W3 — Focus Workspace

- One operational subject; mission-led hierarchy (System 5 scan questions).
- Cards as business primitives (Universal Card grammar).
- Supporting context must not compete equally with current work / Tier 1 execution.
- Progressive disclosure via modes and System 5B interaction models.

### W4 — Operational Workspace

- Inherits **frozen** Operational Workspace Doctrine V3 unchanged.
- Inset River Stone working field; white operational surfaces; Bend Pine selection.
- Processing is the reference implementation; Communications and Work Items are certified consumers.
- **No changes to frozen V3 implementation doctrine from this taxonomy.**

### W5 — Configuration Workspace

- White canvas is intentional and required.
- Hierarchy from regions, grouping, spacing, scope, and ownership — not from importing W4 stone.
- Avoid unnecessary floating-card composition; prefer section stacks and hairlines inside regions.
- Locations and Commercial are reference surfaces; configuration must feel like a coherent working environment, not an operational modal.

### W6 — Analytics Workspace

- Comparison, pattern recognition, and exploration — not queue execution.
- Charts and metrics are **objects**, not decorative cards.
- **Composition gap acknowledged:** UI exists; shared-grammar certification against A–G is incomplete. Do not silently claim V3 stone certification.

### W7 — Embedded Workspace

- Inherits parent Focus context; must not reproduce a second full workspace shell.
- Compact composition with a clear containment boundary and return path.
- Maturity remains **incomplete** at runtime (System 5B).

### W8 — Planning Workspace

- Scenario construction, comparison, and future-state reasoning.
- **Reserved category** — composition philosophy only; no invented implementation requirements or implied runtime.

---

## Region vs Object vs Card

> **Cards represent objects. Regions organize work.**

### Region

A structural area of work that organizes composition (Layer D).

A Region:

- creates hierarchy through **layout**;
- may contain many objects;
- does **not** need card chrome;
- may be identified through spacing, alignment, headings, dividers, or canvas relationship;
- should be the **default grouping mechanism**.

Examples: queue rail, Focus body column, configuration object list, Organization Zone 3 launch band, Processing source/inspector split.

### Object

A discrete thing the operator can recognize, inspect, compare, select, or act upon (Layer E).

Examples: record preview, operational summary, configuration definition, metric, document, work item, process, message thread, overview action tile.

### Card

A **visual treatment** for an object when containment materially improves recognition, state communication, reuse, or interaction.

A Card is **not**:

- a generic section;
- a spacing primitive;
- the default response to grouping;
- a substitute for layout;
- a required wrapper for every region.

### When hierarchy should come from what

Prefer tools in this order:

| Priority | Tool | Use when |
|----------|------|----------|
| 1 | **Whitespace / rhythm** | Separating sections on white or calm canvases (W1, W5, Focus bodies) |
| 2 | **Alignment / typography / headings** | Establishing scan order without chrome |
| 3 | **Canvas contrast** | Category-owned Layer C (W4 stone field; never accidental gray boxes) |
| 4 | **Dividers / hairlines** | Region edges that must read (queue rail, tab baseline, section split) |
| 5 | **Contained surfaces** | True objects that need a quiet panel without full card theater |
| 6 | **Borders** | Object recognition when softer tools fail |
| 7 | **Elevation** | Objects that must float on a canvas (especially W4 stone) |

**Borders and elevation are later tools, not the first source of hierarchy.**

### Card appropriateness test

Use a Card when **all** hold:

1. The unit answers **one business question** (or is an explicit launch/action object).
2. It is not being used merely to box layout.
3. Chrome helps the object read on its canvas.
4. Removing the chrome would make the question **harder** to scan — not easier.

If you cannot name the business question, it is probably a **Region** or plain content — not a Card. (Locations lesson generalized: overuse of cards signals missing Region language.)

---

## Not workspace categories

These belong **below** the workspace taxonomy:

| Term | Correct home | Why |
|------|--------------|-----|
| **Command Surface** | Dialog / confirm / create-destroy primitive | Decision → outcome chrome; not a composed kind-of-work place. “Command Center” names W1 posture, not a separate workspace family. |
| **Review** | Mode, working region, or operational state | “Needs Review” is state/metric or an inspector region — not a workspace type. |
| **Studio** | Mode inside W4 / W6 | Design-time lens under Work \| Studio — not a top-level workspace. |
| **Current Work** | Object / content inside W3 | Card/surface inside Focus Workspace — never a destination workspace. |

---

## How to use this doc

1. Name the **workspace category** (W1–W8) before composing UI.
2. Inherit Shared Layering Grammar **A–G**; specialize only at C / D / E per the category table.
3. Start from interaction primitives, not a domain screen (principles 1–3).
4. Default to **understanding**; editing is intentional (principle 4).
5. Prefer **Regions** for grouping; spend **Cards** on Objects that earn chrome.
6. Open the **specialist doctrine** for the category — do not fork V3, System 5, or Configuration visual language here.
7. Validate calm under pressure and premium = predictable (principles 8–9).
8. Confirm the result is reusable across domains (principle 10).

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Interaction primitives | [`./canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Interaction laws | [`./interaction-grammar.md`](./interaction-grammar.md) |
| Lived operator experience | [`./operator-story.md`](./operator-story.md) |
| Runtime Specification | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| Planes / domains | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| W1 Command Center | [`./workspace-v3-command-center-doctrine.md`](./workspace-v3-command-center-doctrine.md) |
| W4 Operational V3 (**frozen**) + W1 landing routes | [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) |
| W4 structural module shell | [`./operational-workspace-shell.md`](./operational-workspace-shell.md) |
| W3 / System 5 | [`./operational-surface-design-system.md`](./operational-surface-design-system.md) · [`./drawer-system.md`](./drawer-system.md) |
| W5 Configuration | [`./configuration-workspace-visual-language.md`](./configuration-workspace-visual-language.md) · [`./configuration-workspace-platform-doctrine.md`](./configuration-workspace-platform-doctrine.md) |
| W7 Embedded | [`./card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) |
| Card / section / field authoring | [`./experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Typography & presentation | [`../../system/typography-and-presentation-doctrine.md`](../../system/typography-and-presentation-doctrine.md) |
| Locked reveal / performance gates | [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md) |
| Platform decision register | [`../foundation/platform-decisions.md`](../foundation/platform-decisions.md) |

---

## Executable token authority (code vs documentation)

| Layer | Authority | Location |
|-------|-----------|----------|
| **Semantic visual doctrine + workspace taxonomy** | This document | Meaning, hierarchy, category composition, Region/Object laws |
| **W4 workspace shell tokens** | Code | `web/components/workspace/doctrine.ts` + `workspaceTokens.ts` |
| **Motion tokens** | Code | `web/lib/motion/motionTokens.ts`, `:root` CSS vars in `globals.css` |
| **Theme / Tailwind primitives** | Code | `@theme` and design tokens consumed by components |
| **W5 configuration tokens** | Code | `configurationRuntime.css`, config token families |

**Rule:** Documentation states *what* each visual role means and *when* to use it. Code owns literal token names, values, and exports. Do not duplicate full token tables here.

`doctrine.ts` is the **executable W4 vocabulary**. It specializes this document’s Shared Layering Grammar; it does not replace the taxonomy owner.

---

## When this doc must be updated

- A visual principle changes or a new one is added.
- The Workspace Taxonomy or Shared Layering Grammar changes.
- A UX alignment gap is closed (move it out of principle 7).
- A new domain validates or stresses the shared visual language.
- A reserved category (e.g. W8) gains a specialist composition owner.
- Mockups surface a tension between visual feel and the interaction model.
