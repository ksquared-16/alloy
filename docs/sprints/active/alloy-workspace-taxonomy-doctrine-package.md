---
owner: sprint
status: sprint
last_reviewed: 2026-07-16
supersedes: []
---

# Alloy Workspace Taxonomy — Doctrine Package

**Sprint:** `workspace-surface-hierarchy` (slot 5) → mission reframed as **Workspace Taxonomy**
**Status:** **Ratified and integrated** into `docs/platform/operator/alloy-visual-language.md` (July 2026). This sprint file is retained as execution history — **not** the canonical owner.
**Date:** 2026-07-16
**Depends on:** Accepted reconciliation (`workspace-surface-hierarchy-doctrine-reconciliation.md`)

**Canonical owner after Phase 0:** [`../../platform/operator/alloy-visual-language.md`](../../platform/operator/alloy-visual-language.md)

**Constraints honored:** No Runtime, navigation, BOS, interaction, or token changes. Operational Workspace Doctrine V3 remains **frozen**. This package defined the broader taxonomy V3 specializes.

**Premise (accepted):** The missing doctrine is not a stone canvas. It is the taxonomy of Alloy workspaces and how each category composes one shared layering grammar differently.

---

## How to read this package

| Part | Deliverable |
|------|-------------|
| §1 | Workspace Taxonomy |
| §2 | Shared Layering Grammar |
| §3 | Category Composition Matrix |
| §4 | Region vs Object Philosophy |
| §5 | Platform example review |
| §6 | Cross-platform composition principles (Alloy language) |
| §7 | Canonical ownership + rollout |

**Historical proposal body below** — prefer the canonical owner for current truth.

---

# 1. Alloy Workspace Taxonomy

## 1.1 Definition

A **workspace** is a composed operator place where a *kind of work* happens. It has:

- a primary operator question,
- a navigation pattern,
- a dominant activity,
- a composition model (how the Shared Layering Grammar is realized).

A workspace is **not**: a queue alone, a card, a mode, a KPI strip, a BOS rail, or a create/confirm dialog.

## 1.2 Two axes (do not collapse)

| Axis | Owner | Answers |
|------|-------|---------|
| **Operational planes** | `operational-ux-doctrine.md` | Where the operator stands: Configuration / Planning / Operations / Records / Intelligence |
| **Workspace taxonomy** | *this package → proposed owner below* | How the place is composed: landing, execution, module, configuration, focus, … |

Planes and workspace categories compose. A Configuration plane surface uses the Configuration Workspace composition. An Operations plane surface may be Organization, Execution, or Operational Module depending on depth.

## 1.3 Progressive operational depth (already platform law)

From `workspace-v3-command-center-doctrine.md`:

```
Organization Workspace
  → Execution Workspace (Work Unit)
    → Focus Workspace (Focus Panel)
      → Embedded Workspace
        → BOS (woven assist — not a workspace destination)
```

Operational Module workspaces and Configuration workspaces are **sibling places** opened from shell navigation / settings — not steps on this zoom chain, but members of the same taxonomy.

## 1.4 Canonical categories

Derived from platform doctrine and shipped surfaces. Proposed list rejected where evidence said “false category.”

| ID | Category | Status | Primary home |
|----|----------|--------|--------------|
| **W1** | Organization Workspace | Shipped | `/workspace` command center |
| **W2** | Execution Workspace | Shipped | Work Unit (`/workspace/work-unit/:slug`) |
| **W3** | Focus Workspace | Shipped | Focus Panel (record surface) |
| **W4** | Operational Workspace | Shipped + **V3 frozen** | AdminV2 module modals |
| **W5** | Configuration Workspace | Shipped | Settings / Configuration Runtime |
| **W6** | Analytics Workspace | Shipped UI; composition under-specified | Operational Intelligence modal |
| **W7** | Embedded Workspace | Doctrinal; runtime incomplete | Inside Focus Workspace (System 5B) |
| **W8** | Planning Workspace | Plane exists; surface aspirational | Future Planning compositions |

### Rejected as top-level workspace categories

| Term | Why rejected |
|------|--------------|
| **Command Workspace** | “Command Center” is Organization Workspace posture, not a separate shell family. Create/confirm dialogs are **Command Surfaces** (§1.6), not workspaces. |
| **Review Workspace** | “Needs Review” is an operational state / zone role, not a workspace type. |
| **Studio Workspace** | Work \| Studio are **modes** inside Operational / Analytics workspaces. |
| **Current Work Workspace** | Current Work is a **card/surface** inside Focus Workspace. |

## 1.5 Category definitions

### W1 — Organization Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Decide which work to enter next. Not where work is done. |
| **Primary question** | Where should I go? |
| **Navigation** | `/workspace` four zones → Work View / surface deep links |
| **Dominant activity** | Orient · prioritize · launch |
| **Visual goals** | Storytelling, operational overview, enterability; calm pulse → expansive launch surfaces |
| **Reference** | Workspace V3 Command Center; `WorkspaceRootShell` + four-zone composition |
| **Plane** | Operations (entry) |

### W2 — Execution Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Execute a cohort of work for a Business Process / Work View. |
| **Primary question** | What should I do? |
| **Navigation** | Work Unit route → Perspective (Work View) → condensed Queue ↔ Focus Panel peer |
| **Dominant activity** | Triage · select · resolve · complete |
| **Visual goals** | Continuity with landing; queue as preview; Focus as authority; no false empty; Operational Mode default |
| **Reference** | Runtime Spec Universal Workspace; Work Unit surface + queue region + Focus Panel |
| **Plane** | Operations |

### W3 — Focus Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Authoritative work on one operational subject, in place. |
| **Primary question** | What about *this* object needs me — and what next? |
| **Navigation** | Modes Summary \| Work \| Activity → Cards → Sections → Fields; Previous/Next in queue context |
| **Dominant activity** | Decide · act · disclose progressively |
| **Visual goals** | Record-centric; meaning before schema; Universal Card grammar; white working ground; supporting context without form dump |
| **Reference** | Focus Panel + System 5; `FocusPanelSurface` |
| **Plane** | Records |

### W4 — Operational Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Category-of-work module (Processing, Communications, Work Items, …) as a center modal. |
| **Primary question** | What needs action in this module right now? |
| **Navigation** | Module modal → Work \| Studio → section tabs → queue → detail / overview landing |
| **Dominant activity** | Module triage + module detail; Studio for reusable assets |
| **Visual goals** | **Frozen V3:** white shell → inset stone field → floating white surfaces → controls → Bend Pine selection |
| **Reference** | Processing (Digital Mailroom); certified: Communications, Work Items |
| **Plane** | Operations (module) / Configuration-adjacent when Studio |
| **Doctrine** | `navigation-and-workspace-doctrine.md` — Operational Workspace Doctrine **V3 (frozen)** |

### W5 — Configuration Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Operate configuration objects as things the organization runs — consequence-first, not schema-first. |
| **Primary question** | What am I configuring, and what is the operational consequence? |
| **Navigation** | Settings / ownership breadcrumb → object list → concern tabs → drill to owned child |
| **Dominant activity** | Assess health · deliberate · edit in place · immediate save |
| **Visual goals** | Calm white canvas; object-shaped header; grouped regions; fewer decorative cards; Bend Pine as sole accent |
| **Reference** | Configuration Runtime; Locations as primary object-workspace path; Commercial as consumer |
| **Plane** | Configuration |
| **Doctrine** | `configuration-workspace-platform-doctrine.md` + `configuration-workspace-visual-language.md` |

### W6 — Analytics Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Analytical posture — what happened, why, what trends — separated from operational landing. |
| **Primary question** | What happened? Why? What trends? |
| **Navigation** | Analytics modal → Work \| Studio → view / playbook |
| **Dominant activity** | Explore · compare · report (not queue execution) |
| **Visual goals** | Information hierarchy and exploration; must feel Alloy OS; composition must be certified against Shared Grammar (today: under-specified vs V3) |
| **Reference** | Operational Intelligence / `AnalyticsModal` (present; not V3 stone-certified) |
| **Plane** | Operations-adjacent / Intelligence consumption |

### W7 — Embedded Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Domain workspace inside Focus without changing subject or inventing a new product shell. |
| **Primary question** | What domain work applies to this subject? (ledger, thread, calendar, …) |
| **Navigation** | Card action → embedded state → Back to Focus composition |
| **Dominant activity** | Contained domain work with return |
| **Visual goals** | Feels like depth inside Focus, not a new app; inherits Focus canvas; Regions over nested product chrome |
| **Reference** | System 5B Model 2 (doctrine approved; runtime incomplete) |
| **Plane** | Records (depth) |

### W8 — Planning Workspace

| Attribute | Definition |
|-----------|------------|
| **Purpose** | Model future state without committing operational truth. |
| **Primary question** | What if? What does capacity / demand / money look like ahead? |
| **Navigation** | TBD — must not impersonate Execution queues as truth |
| **Dominant activity** | Compare · forecast · scenario |
| **Visual goals** | Scenario layout, comparison rhythm, clear non-authoritative labeling |
| **Reference** | Planning plane in `operational-ux-doctrine.md`; no shipped workspace composition owner yet |
| **Plane** | Planning |
| **Status** | **Proposed category** — reserve the slot; do not invent UI in this sprint |

## 1.6 Related primitives (not workspaces)

| Primitive | Role |
|-----------|------|
| **Application Shell** | Persistent app chrome (`AdminV2Shell`, nav, BOS rail geometry) |
| **Queue** | Preview/selection region inside Execution or Operational workspaces |
| **Command Surface** | Dialog / confirm / destructive / create-destroy — decision → outcome; minimal chrome |
| **Mode** | Lens inside a workspace (Focus modes; Work \| Studio) |
| **Card / Object** | Business-question unit inside Focus, Overview, or Configuration regions |
| **BOS** | Woven Intelligence — never a destination workspace |

---

# 2. Shared Layering Grammar

## 2.1 Law

**Every workspace inherits the same layering grammar.**
**Composition varies by category. The grammar does not.**

This grammar is **structural**, not a color system. Canvas treatment is a *category composition choice* at Layer C, not a new grammar.

Operational Workspace Doctrine V3 is a **frozen specialization** of this grammar for W4 — not the grammar itself.

## 2.2 Layers

```
A  Application Shell
B  Workspace Frame
C  Workspace Canvas
D  Working Regions
E  Objects
F  Controls
G  Selection / Emphasis
```

| Layer | Name | Responsibility | What it is not |
|-------|------|----------------|----------------|
| **A** | Application Shell | Persistent OS chrome: app nav, geometry, modal host, BOS rail peer | Page content, cards |
| **B** | Workspace Frame | Identity + primary navigation for *this* workspace: title, modes, section tabs, health band when applicable | The working ground |
| **C** | Workspace Canvas | The continuous working ground that establishes depth beneath regions/objects | A card; a full-bleed decoration |
| **D** | Working Regions | Structural partitions: columns, rails, zones, section stacks, inspector columns | Business-question cards |
| **E** | Objects | Units that answer a business question or represent a selectable/operable thing | Layout scaffolding |
| **F** | Controls | Buttons, inputs, toggles, zoom, row actions | Regions |
| **G** | Selection / Emphasis | Active/selected/ progressive state — typically Bend Pine | Decorative accent spam |

## 2.3 Mapping from frozen V3 (W4 specialization)

| V3 layer (frozen) | Shared grammar |
|-------------------|----------------|
| 1 Application shell | **A + B** (modal chrome + header/mode nav) |
| 2 Workspace field (inset stone) | **C** — Operational specialization: stone field via `WS_SHELL_INSET` + `WS_FIELD_CANVAS` |
| 3 White operational surfaces | **D + E** — regions (`WorkspaceZonePanel`, rails) and objects (`WorkspaceCard`, rows) on the field |
| 4 Interactive objects | **F** |
| 5 Selection / Bend Pine | **G** |

V3 rules that remain locked for W4 only: Layer C is inset stone; Layer A/B never full-bleed stone; white surfaces float on the field.

## 2.4 Grammar invariants (all categories)

1. **One shell, one frame, one canvas** per workspace instance — no nested competing shells.
2. **Regions partition; objects mean** — do not use object chrome to invent layout.
3. **Selection is semantic** — Bend Pine (or documented semantic tokens) for active/selected/action; not theme decoration.
4. **Queues remain preview** — authoritative detail lives in Focus / entity GET, never queue JSON as truth.
5. **Modes are lenses, not destinations.**
6. **No parallel hierarchy** invented per module — vary composition tables, not grammar names.

## 2.5 Vocabulary (disambiguation)

| Term | Meaning in this package |
|------|-------------------------|
| **Canvas** | Layer C working ground (stone *or* white *or* future planning ground) |
| **Field** | Prefer “canvas” in taxonomy docs; V3 “workspace field” = Operational Layer C |
| **Region** | Layer D structural partition |
| **Object** | Layer E meaning unit (may render as card, row, tile, or plain block) |
| **Card** | A *presentation* of an Object with card anatomy — not a layout primitive |
| **Surface** | Generic composed UI unit; prefer category + layer names when writing doctrine |

---

# 3. Category Composition Matrix

Legend for canvas: **Stone** = V3 inset stone field · **White** = continuous white working ground · **Ambient** = shell-inherited / presentation ambient without a second field.

| Category | Canvas (C) | Containment | Working regions (D) | Object density (E) | Card philosophy | Whitespace | Depth | Nav emphasis (B) | Interaction emphasis |
|----------|------------|-------------|---------------------|--------------------|-----------------|------------|-------|------------------|----------------------|
| **W1 Organization** | Ambient / white storytelling ground | Zones as regions; avoid card walls | Four zones (Pulse → Launch → Activity) | Low–medium; launch tiles as objects | Launch/overview objects — not Universal Card dumps | Expansive at launch; compact at pulse | Story depth, not modal stone | Zone questions; enterability | Launch / deep link |
| **W2 Execution** | White (System 5) | Queue region ‖ Focus region | Condensed queue rail + Focus peer | Queue rows compact; detail in Focus | Cards live in Focus, not as page chrome | Tight in queue; calmer in Focus | Peer split, Surface Hold | Work View / strategy | Select → open subject |
| **W3 Focus** | White | Shell owns boundary; body scrolls by mode | Mode body; card grid/stack as regions of meaning | Medium; tiered | **Universal Card** — one business question each | Calm; progressive disclosure | Mode + expand/embed depth | Mode switch; context chrome | Act / edit intentional |
| **W4 Operational** | **Stone (frozen V3)** | Soft elevation on white regions/objects | Zone panels, queue rail, artifact, inspector | Medium; overview cards + queue rows | `WorkspaceCard` / zones on stone — spacing over boxes | Gutter + field create depth | Inset field + float | Work \| Studio + sections + health | Queue → detail; Studio assets |
| **W5 Configuration** | **White (required)** | Grouped sections; hairlines inside regions | Object list \| workspace; tab concerns | Low object-card count | Prefer **section rows inside regions** over card mosaics | Generous; deliberative | Object header anchors; quiet chips | Ownership breadcrumb + tabs | Consequence-first edit |
| **W6 Analytics** | White (until certified otherwise) | Dashboard regions; view strip | Category/view region + canvas | Medium; charts as objects in regions | Cards/panels for analytical questions — not operational queue cards | Exploration rhythm | View hierarchy | Work \| Studio + views | Explore / compare |
| **W7 Embedded** | Inherits Focus canvas | Single contained region replacing card body / mode slice | One domain region + Back | Domain-specific | Avoid re-shelling; reuse domain objects | Preserve Focus calm | Explicit depth overlay | Back to Focus | Domain act + return |
| **W8 Planning** | TBD (not stone-by-default) | Scenario columns / comparison regions | Scenario / horizon regions | Low–medium | Projection objects clearly non-authoritative | Comparison whitespace | Scenario side-by-side | Scenario switcher | Compare / do not commit |

### Composition laws by category (summary)

- **Operational (W4):** Stone canvas is **mandatory** under frozen V3. Do not “simplify” to white-on-white.
- **Configuration (W5):** White canvas is **mandatory** under configuration visual language. Do not import stone to “match Processing.” Fix hierarchy with **regions and whitespace**, not a second field tint, unless a future ratified amendment says otherwise.
- **Organization (W1):** Hierarchy from **zone questions and rhythm**, not from floating every block as a card.
- **Focus (W3):** Hierarchy from **tiers + modes + progressive disclosure**, not from extra page chrome.
- **Execution (W2):** Hierarchy from **queue ‖ focus peer geometry**, not from carding the queue.

---

# 4. Region vs Object Philosophy

## 4.1 Definitions

| Concept | Definition | Layer |
|---------|------------|-------|
| **Region** | A structural partition of the canvas that groups work by *role in the layout* (list rail, detail column, zone, section stack, inspector). | D |
| **Object** | A unit that answers a *business question* or represents an operable entity instance (family readiness, location hours, processing case row). | E |
| **Card** | An Object (or Object cluster) presented with **card anatomy** (border/radius/elevation/header pattern). | E presentation |
| **Containment** | Using region boundaries, whitespace, typography, and hairlines — without object chrome — to show grouping. | D |

**Law:** A Region is not a Card. A Card is not a layout primitive.

## 4.2 When hierarchy comes from Regions

Use Regions when the operator must understand **where they are working**:

- Queue vs detail
- Object list vs workspace
- Source document vs inspector
- Organization pulse vs launch zone
- Tab body as a single concern stack

Regions may use: columns, rails, section stacks, subtle hairlines, background shift **only when category composition allows** (e.g. stone canvas under W4; white section stacks under W5).

## 4.3 When hierarchy comes from Objects

Use Objects when the operator must understand **what needs attention or meaning**:

- Universal Cards in Focus (System 5)
- Overview action tiles in Operational Overview
- Configuration glance/summary blocks that answer a consequence question
- Queue rows as selectable objects (preview)

## 4.4 When Cards are appropriate

Cards are appropriate when **all** of the following hold:

1. The unit answers **one business question** (or is an explicit launch/action object).
2. The unit is **not** being used merely to create a box around layout.
3. Elevation/border helps the object **float on a canvas** (especially W4 stone) or read as a discrete operable thing.
4. Removing the card chrome would make the business question **harder** to scan — not easier.

## 4.5 When Cards are inappropriate (Locations lesson generalized)

Prefer Regions + containment when:

- Multiple “cards” only restate schema groups (Hours, Programs, Policies as a mosaic of boxes).
- Hierarchy could be a **section stack with hairlines** inside one workspace region.
- The page already sits on white canvas and cards create **white-on-white competition**.
- Density is deliberative (configuration) — calm sections beat tile walls.
- The element is structural (toolbar, tab body, list rail) — those are Regions/Controls, not cards.

**Generalization:** Overuse of cards is a symptom of missing Region language. Before adding a card, name the Region it lives in and the Object question it answers. If you cannot name the question, it is probably a Region or plain content.

## 4.6 Whitespace vs borders vs elevation

| Tool | Use when |
|------|----------|
| **Whitespace / rhythm** | Default separator between sections in W1, W5, calm Focus bodies |
| **Hairline** | Region edges that must read without elevation (queue rail, tab baseline, section split) |
| **Elevation / soft shadow** | Objects floating on stone (W4) or discrete operable panels that must lift from canvas |
| **Fill shift** | Rare; category-owned (stone canvas, selected row wash) — never accidental gray boxes |

**Law (from V3 containment, generalized):** Spacing over boxes. Soft elevation for true objects. Visible hairlines when regions must read. No double-tint canvas stacks.

---

# 5. Platform example review

No implementation — assessment only.

| Surface | Category | Composition quality | Taxonomy alignment | Grammar alignment | Recommended adjustments (docs/UI later) |
|---------|----------|---------------------|--------------------|-------------------|----------------------------------------|
| **Processing** | W4 | High — V3 reference | Aligned | Aligned (A–G via V3) | Maintain as W4 reference; do not fork |
| **Communications** | W4 | High — certified | Aligned | Aligned | Keep certification; metric split already V3 |
| **Work Items** | W4 | High — certified | Aligned | Aligned | Keep; Overview omits metrics by design |
| **Locations** | W5 | Medium — object header strong; card mosaic risk | Aligned as Configuration | Canvas white correct; **Region vs Card weak** | Prefer section regions + row containment; reduce decorative cards |
| **Commercial** | W5 (consumer) | Emerging | Align to W5 | Follow Configuration grammar | Inherit Locations lessons; no Operational stone |
| **Business Processes** | Split: settings = W5; runtime = W2 | Mixed by plane | Must not treat BP builder as W4 | Config vs Execution split | Document which BP UIs are W5 vs W2 |
| **Focus Panel** | W3 | High structurally; form-like gaps acknowledged | Aligned | A/B/C white; D/E via System 5 | Continue System 5; map docs to grammar layers |
| **Organization Landing** | W1 | Medium–high (four-zone law) | Aligned | Ambient C; zones as D | Reduce any residual card-wall launch patterns; keep enterability |
| **Configuration Runtime** | W5 shell | Good shell; consumers vary | Aligned | White C locked in CSS | Publish Region rules for all CR consumers |
| **Current Work** | Object inside W3 | N/A as workspace | Correctly not a workspace | E inside W3 | Keep as card/surface; never promote to workspace |
| **Dialogs / Command Surfaces** | Command Surface primitive | Uneven | Correctly not workspace | Minimal A/F/G | Add short Command Surface composition note under ownership doc |
| **Analytics / OI** | W6 | Partial — white modal, not V3 shell | Category real; composition gap | Grammar incomplete | Certify composition table; decide stone vs white deliberately |
| **Embedded (System 5B)** | W7 | Doctrine > runtime | Aligned doctrinally | Inherits W3 | Finish runtime against W7 composition; no new shell |

---

# 6. Workspace Composition Principles

Cross-platform study (Apple, Linear, Notion, Figma, GitHub, Stripe Dashboard, Arc) informs **principles only**. External products are not authority over Alloy doctrine. Frozen V3 and configuration white-canvas rules are not overridden.

## 6.1 Principles extracted

1. **One ground, many figures** — Strong products establish a continuous working ground; objects read as figures on that ground (Linear/Figma canvases; Alloy W4 stone or W5 white).
2. **Structure before decoration** — Hierarchy comes from layout rhythm first (Notion/Apple), chrome second.
3. **Navigation is frame, not content** — Sidebars/tabs are quieter than the working meaning (GitHub, Linear).
4. **Density matches activity** — Triage denser than deliberation (Stripe ops vs settings-like calm).
5. **Depth is earned** — Progressive disclosure and overlays beat nested card stacks (Figma, Arc).
6. **Fewer box types** — Elite UIs rarely invent a new container per section; they reuse region language.
7. **Selection is unmistakable and scarce** — One clear selected object (Arc/Linear).

## 6.2 Alloy translation

| Principle | Alloy expression |
|-----------|------------------|
| One ground, many figures | Shared Layer **C**; category chooses stone vs white |
| Structure before decoration | Regions (D) before Cards (E presentation) |
| Navigation is frame | Layer **B** Workspace Frame |
| Density matches activity | W4/W2 denser; W5/W1 calmer |
| Depth is earned | W1→W2→W3→W7 chain; System 5B models |
| Fewer box types | Region vs Object law; Locations generalization |
| Selection scarce | Layer **G**; Bend Pine semantic use |

## 6.3 Composition principles (normative for Alloy)

1. **Same OS, different work** — Consistency is grammar + tokens + selection semantics; not identical layouts.
2. **Name the category before composing** — If the surface has no category, it is not ready for UI invention.
3. **Specialize Layer C intentionally** — Stone (W4), white (W3/W5/W2), ambient (W1), TBD (W8).
4. **Prefer Regions for layout; Objects for meaning.**
5. **Cards are expensive** — spend them on business questions.
6. **Whitespace is a containment tool**, especially on white canvases.
7. **Do not borrow another category’s canvas to fix hierarchy** — fix Regions/Objects first.
8. **V3 remains frozen for W4** — taxonomy does not reopen stone field debates.

---

# 7. Canonical ownership recommendations

## 7.1 One owner, one truth

| Concern | Canonical owner | Action |
|---------|-----------------|--------|
| **Workspace Taxonomy + Shared Layering Grammar + Region/Object laws** | **`docs/platform/operator/alloy-visual-language.md`** | **Amend** — add sections that host §1–§4 condensed; this package is the source draft |
| **W4 composition (stone five-layer)** | `docs/platform/core/navigation-and-workspace-doctrine.md` V3 | **Keep frozen** — add one pointer: “specialization of Shared Layering Grammar” |
| **W5 composition** | `configuration-workspace-visual-language.md` (+ platform doctrine) | **Keep** — add pointer to taxonomy ID W5; strengthen Region vs Card using §4 |
| **W1 composition** | `workspace-v3-command-center-doctrine.md` | **Keep** — pointer to W1 |
| **W2 / W3 / W7** | Runtime Spec + System 5 + System 5B + drawer-system | **Keep** — pointer to W2/W3/W7; no merge into V3 |
| **W6** | `operational-workspace-shell.md` (Analytics section) until certified | **Amend** when composition certified; do not silently claim V3 |
| **W8** | Reserve under taxonomy; plane remains `operational-ux-doctrine.md` | **No UI doctrine until Planning surfaces exist** |
| **Presentation index** | `design-and-operational-doctrine.md` | **Amend** V2→V3 pointers; link taxonomy section in visual language |
| **Structural module shell (modes, queue→workspace)** | `operational-workspace-shell.md` | **Amend** to defer visual hierarchy to V3; cite taxonomy W4 |

## 7.2 What not to create

- Do **not** create `docs/platform/**/workspace-surface-hierarchy.md` as a parallel hierarchy owner.
- Do **not** create a second five-layer system that competes with V3.
- Do **not** mark V3 obsolete.
- Prefer **one amendment** to `alloy-visual-language.md` as the taxonomy/grammar owner over a new docs/platform file — unless Kelly prefers a dedicated short canonical file that *only* owns taxonomy and immediately supersedes duplicate prose elsewhere.

**Minimum change set (documentation only, after approval):**

1. Merge condensed §1–§4 into `alloy-visual-language.md` (owner).
2. Add “specialization of Shared Layering Grammar” one-liner + taxonomy ID to V3 section.
3. Fix stale V2 / `WorkspaceMetricTiles` index lines in `design-and-operational-doctrine.md` and conflicting stacks in `operational-workspace-shell.md`.
4. Add W5 Region-vs-Card sharpening note to `configuration-workspace-visual-language.md`.
5. Archive/supersede this sprint package as historical once merged.

## 7.3 Platform rollout sequence (recommendations only)

| Phase | Work | Surfaces | Notes |
|-------|------|----------|-------|
| **0** | Ratify this package → amend owners | Docs only | Pause UI until Phase 0 done |
| **1** | Pointer / vocabulary cleanup | Design index, shell companion, V3 pointer | No pixels |
| **2** | Configuration Region discipline | Locations (reference), then Commercial / BP settings | White canvas kept; reduce card mosaics |
| **3** | Analytics composition certification | Operational Intelligence | Explicit W6 table; stone vs white decision |
| **4** | Organization launch rhythm pass | `/workspace` Zone 3 | Taxonomy W1; no Work Unit duplication |
| **5** | Focus / Embedded completion | System 5 gaps, System 5B runtime | W3/W7 — not V3 stone |
| **6** | Future Operational modules | Scheduling, Attendance, Billing, … | **Must** compose W4/V3 primitives |
| **7** | Planning | When product starts | W8 composition — new work, not borrowed W4 |

**Explicit non-goals for rollout:** redesign Runtime reveal gates; navigation spine changes; BOS behavior; token palette rewrites; reopening V3 stone field.

---

## Pause

Stop for Kelly review of:

1. Canonical taxonomy W1–W8 (and rejected categories)
2. Shared Layering Grammar A–G (with V3 as W4 specialization)
3. Composition matrix (esp. W4 stone vs W5 white preserved)
4. Region vs Object laws
5. Ownership: amend `alloy-visual-language.md` as taxonomy/grammar owner
6. Rollout sequence Phase 0 → docs before UI

**Do not implement UI or merge into `docs/platform/` until approved.**
