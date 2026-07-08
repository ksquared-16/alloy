# Focus Panel — Composition V2 + Card Definition V2 (canonical state)

**Status:** Canonical (June 2026). The merged state of the Focus Panel QA + Composition
V2 + Experience Builder V2 sprints. Supersedes the V1 "engine composes the surface" and
flat-field-list framings where they differ.

**Companions:** [`card-composition-system.md`](./card-composition-system.md) ·
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md) ·
[`experience-builder-doctrine.md`](./experience-builder-doctrine.md) ·
[`operational-context-boundary.md`](./operational-context-boundary.md) ·
[`canonical-interaction-model.md`](./canonical-interaction-model.md).

**Code:**
`web/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout.ts` (layout model + intent sizing) ·
`…/composition/focusPanelPublishedLayoutOps.ts` (builder ops: rows / widths / Fill) ·
`web/components/admin/focusPanel/FocusPanelRowLayoutBuilder.tsx` (visual builder) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel.ts` (card definition: question / evidence groups / ownership / `configFields`) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps.ts` (evidence-group + ownership ops) ·
`web/components/admin/focusPanel/FocusPanelCardInspector.tsx` (Inspector V2) ·
`web/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` (mount) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelMutation.ts` (edit adapter) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel.ts` (depth history).

---

## 1. Focus Panel — canonical surface

- **Core Four** universal cards: **Household** & **Children** (truth-owning) · **Readiness**
  & **Current Work** (diagnostic/action). Cards consume the **Operational Context** only.
- **Focus Cards:** truth cards elevate to a centered Focus Card (zoom-from-origin in,
  reverse-zoom on dismiss); the base canvas **never reflows** — depth is an overlay layer.
- **Inline Overlay:** diagnostic cards (Readiness, Current Work) reveal evidence as a
  **downward-only** card-anchored overlay that covers the card below without moving the
  canvas. It never opens upward; when space is tight the panel scrolls. It never becomes
  a Focus Card and never buries under the header.
- **Three operational depths** (Evidence / Focus / Workspace) per
  [`operational-depth-doctrine.md`](./operational-depth-doctrine.md). Edit is a capability
  of Focus, not a fourth depth.

---

## 2. Composition V2 — the published layout is the source of truth

> **Default composition = smart recommendation. Published composition = source of truth.**

- A **published layout** (`FocusPanelPublishedLayout`) is operator-authored:
  **rows → cells → sized by intent (`Quarter · Third · Half · Two Thirds · Full · Fill`)
  → vertically stacked cards.** Sizes are operator intent, not grid tokens — the runtime
  computes exact spacing, and **Fill** absorbs a row's leftover space so nothing is pinned
  awkwardly and no dead whitespace remains. Stacking lets a column hold two cards (e.g.
  *Household left, Readiness + Current Work stacked right*). Legacy fraction values stay
  valid for already-published docs.
- When a surface has a **published layout**, the runtime renders **exactly** those
  rows/widths. The only sanctioned override is **responsive collapse** to a single column
  on a too-narrow surface. No hidden auto-layout overrides a published layout.
- When **no** layout is published, the **Composition Engine** (`composeFocusPanelSurface`)
  provides the default (interlocking lanes / stack from card semantics). The legacy
  **weight / preferred-partner / preferred-shape** model is now a **recommendation default
  only** — it never overrides a published layout.
- Storage: the layout is persisted on the Summary `LayoutDoc` **metadata**
  (`focusPanelLayout`); the runtime reads it via `readFocusPanelPublishedLayout`. No new
  storage type; no parallel config store.

---

## 3. Experience Builder — row-based composition

The builder authors the published layout visually (not abstract tokens like `wide`/`1x`).
Pipeline:

```
Surface
  ↓ Rows                 (operator adds rows)
    ↓ Cards              (cards placed into a row's columns)
      ↓ Evidence Groups  (per-card content: fields / related lists)
        ↓ Perspectives   (depth defaults: Evidence / Focus / Workspace)
          ↓ Conditions   (visibility / state rules)
            ↓ Actions    (card / row affordances)
              ↓ Published Runtime
```

- Cards are sized by **intent** (**Quarter / Third / Half / Two Thirds / Full / Fill**),
  not grid fractions; rows can be added, removed, and reordered; cards stack within a
  column and drag between rows. The builder's **preview is the real runtime grid** fed
  the same layout — preview equals runtime.
- Mounted in the gated `/settings/surfaces` Focus Panel editor; **Save draft** and
  **Publish** persist the layout through the existing draft/publish flow
  (`saveFocusPanelSummaryDraft` / `publishFocusPanelSummary`). A layout persists only once
  authored — otherwise no metadata is written and the runtime keeps its auto default.

---

## 3a. Card Definition V2 — Question → Evidence Groups → Ownership

A card is authored as operational meaning, not a flat field list. The Inspector edits,
in order:

```
Card
  ↓ Question        (the one thing the card answers)
    ↓ Evidence Groups (named bundles: Identity / Enrollment / Placement / Readiness / Medical / Documents …)
      ↓ Evidence    (fields live INSIDE a group; bound to business concepts)
        ↓ Presentation (size / density)
          ↓ Expansion (collapsed ↔ expanded; see §3b)
            ↓ Actions
              ↓ Conditions
                ↓ AI  (advisory only)
                  ↓ Ownership (owner card + editable / required / read-only)
```

- **Evidence Groups** own the fields. Legacy flat-`fields` configs auto-wrap into one
  "Details" group; the runtime renders the flattened fields (`configFields`) in reading
  order, so grouping never forks the render path. Code:
  `focusPanelCardConfigModel.ts` (`evidenceGroups`, `configFields`),
  `focusPanelEvidenceGroupOps.ts` (Inspector ops).
- **Ownership doctrine:** every business concept has **exactly one owning card** (Phone →
  Household, Program → Placement, Medical → Health & Safety, Weekly Charges → Billing,
  Timeline Event → Timeline, Communications → Communications). A concept may be **shown
  read-only** on other cards, but is **editable only on its owner**. The Inspector's
  Editing tab enforces this (the "Editable here" toggle is disabled off-owner); validation
  raises an `ownership` issue otherwise.
- **Inspector V2 sections:** Question · Evidence · Presentation · Behavior · Editing ·
  Expansion · Conditions · Actions · AI (`FocusPanelCardInspector.tsx`). Technical detail
  is secondary to operational meaning.

---

## 3b. Expansion doctrine

Expansion is **not** Focus and **not** Workspace. Expansion means *the same operational
question, with more room*:

| Card | Collapsed | Expanded |
|------|-----------|----------|
| Readiness | top blockers | the full blocker list |
| Children | 2 children | all children |
| Billing | this week's charge | historical weekly charges |

- Same question, same card — just more evidence. It **overlays downward** (the inline
  overlay), **never pushes** surrounding cards, **never changes layout**, and **never
  creates a new surface**. Authored per-field via the Inspector's Expansion tab
  (collapsed vs expanded placement).

---

## 3c. Workspace doctrine

A **Workspace** begins when the operator stops **reviewing** and starts **doing work** —
bulk financial review, large document review, weekly attendance editing, mass schedule
editing. Those are Workspaces (the deepest operational depth — see
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md)), **not** expanded
cards. A card expands to answer its question with more room; it becomes a Workspace only
when the work itself is the activity. Only truth-owning cards may reach Workspace depth;
diagnostic cards top out at Evidence and hand off.

---

## 4. Operational Context mutation model

- **`OperationalContext` is read-only.** Cards observe `truth` + `capabilities`; they never
  write to the context and never fetch to enrich it.
- Mutation is a **separate injected adapter** (`FocusPanelMutation`), the same pattern as
  `coordination`. It persists through the **existing server route** and refreshes via the
  **existing record-patch event**:

```
Edit a row → adapter.savePersonContact(personId, patch)
  → PATCH /api/admin/persons/[id]            (existing route: permissions + validation)
  → record-patch event → drawer VM merge
  → buildOperationalContext recomposes       (context rebuilt from refreshed truth)
  → card reflects saved truth                (no manual refresh, no context write)
```

- No new mutation path; audit/permission behavior is exactly the existing route's
  (parity — no audit added or bypassed).

---

## 5. Household live editing — targeted, per row

Editing is **targeted, not card-wide**:

```
Card → Evidence Group → Evidence Row → Edit → Save → Context Update
```

- Every editable person row owns its own quiet Edit affordance (primary contact / other
  parent-guardian / additional / emergency / pickup / billing). There is **no** card-wide
  "Edit contact" link.
- Edit names the target (`Edit {name}`), seeds from that person, **saves only that person**
  (adapter generalized to any household person by id), and **Cancel** returns to the same
  Household state. Phone displays formatted; on save the card recomposes and flashes a
  transient "✓ Saved" confirmation.
- **Children rows are belonging-only**: clicking a child **hands off** to the Children card;
  it does **not** edit child operational fields inside Household.

---

## 6. Card-depth / Back history

A lightweight **local** depth-history stack (not routing, not drawer navigation) records
where a card-to-card handoff originated so **Back** returns to the prior card state:

```
Household focused evidence → click child → Children focused child
  → Back → Household focused evidence   (the launching state, restored)
```

- A handoff pushes its source `{ card, focus }`; `back()` pops and restores it; dismissing
  to the base panel clears the stack. Back labels: **← Back to panel** (no history),
  **← Back to Household** (came from Household), **← All children** (within Children).

---

## 7. Interaction doctrine (frozen primitives)

Exactly three interaction primitives — no others:

| Primitive | Meaning |
|-----------|---------|
| **Perspective Change** | Same subject + context; presentation depth changes (Overview → Evidence → Focus → Edit). |
| **Subject Change** | A different subject; the panel recomposes around the new Operational Context. |
| **Context Update** | Same subject + context; observed truth changes; cards observing it recompose. |

**Card Editing V1** is expressed through these: a targeted row edit saves through the
adapter, which produces a **Context Update** (record-patch → VM merge → context recompose),
and the card re-renders from refreshed truth.

---

## 8. Invariants

- Published layout is the source of truth; auto-composition is default-only fallback.
  The runtime **never overrides an intentional published layout** (only responsive
  single-column collapse); auto-composition exists only when no layout is published.
- Composition is sized by **intent** (Quarter…Full + Fill); the runtime computes exact
  spacing and Fill removes dead whitespace. No grid tokens in the authoring vocabulary.
- A card is authored as **Question → Evidence Groups → Ownership**, not a field list.
  Fields live inside evidence groups; the runtime renders the flattened fields.
- **One owning card per concept**; a concept is editable only on its owner, read-only
  elsewhere.
- **Expansion ≠ Focus ≠ Workspace**: expansion is the same question with more room
  (overlays downward, never reflows, never a new surface); Workspace is doing work.
- The base canvas never moves; depth/overlays are an overlay layer.
- Inline overlays open downward only.
- `OperationalContext` is read-only; mutation flows through the injected adapter +
  existing route + record-patch refresh.
- Editing is targeted (row-level); only truth-owning cards edit.
- No new interaction primitive beyond the three above; no new runtime architecture.

---

## Presentation Runtime V3 — nested surface editing (July 2026)

`/settings/surfaces → Focus Panel` supports **universal nested-surface drill-in editing**:

- **Primary UX:** click **Configure expansion →** on a canvas card with a depth-bound nested surface (same navigation path as chip launchers).
- **Editor:** `NestedSurfaceEditor` — evidence groups derive from the registered `SurfaceSpec` (`groupDefsFor`); no parallel `NESTED_SURFACE_DEFS`.
- **Groups:** registry evidence group keys (e.g. Children → Identity · Placement · Readiness; Financial Configuration → Current Configuration · Configuration History · Actions).
- **Persistence:** `metadata.nestedSurfaces[surfaceId]` on the Focus Panel summary `entity_layouts` doc, via the existing draft/publish loop.
- **Runtime:** Children + Billing Preview consume published config via `nestedSurfaceConfigReader` (field order / expanded sections). Full nested-surface overlay render remains deferred.

Canonical doc: [`universal-nested-surface-drill-in.md`](./universal-nested-surface-drill-in.md).

This supersedes the earlier "Expansion never creates a new surface" invariant: **Expanded = Open Surface** (a nested Surface via `openSurfaceId`), per [`experience-builder-v3-universal-surface-composition.md`](./experience-builder-v3-universal-surface-composition.md) §3.

---

## Surface Composer V3 — runtime edit mode (July 2026)

> **The Surface Composer is not a builder. It is the runtime placed into an "Edit
> Layout" mode.** Editing happens where the field renders; the operator edits the
> product itself, not an abstraction of it.

### Mental model

Like Figma / Notion / Google Docs: the runtime stays visible and editable at all times,
editing tools appear exactly where the operator is working, and the right inspector is
**secondary** — card metadata only (Question · Conditions · Actions · AI · Behavior). There
is no "runtime left / configuration right" split; the runtime IS the editor.

- **One render path.** Composer mode WRAPS the runtime (`FocusPanelCardRenderer`, the same
  component `/work-unit` mounts) — it never recreates it. There is no duplicate composer
  card renderer. Runtime parity is structural: a composer edit produces the same published
  configuration model as a direct runtime edit.
- **Inline field editing.** Fields are relabeled (presentation label, never the schema
  name), reordered, added (`+ Add field` → shared library), and given a per-field behavior
  (**Editable / Read-only / Hidden**) directly on the runtime surface via
  `InlineRuntimeFieldList`. Hidden fields do not render at runtime.
- **Subtle affordances.** Hover outlines, fade-in grips/nudges, inline rename and behavior
  pills. No builder chrome competes with the runtime; the "editing the product" illusion is
  preserved.

### The six distinctions (what the operator may change)

| Layer | Meaning | Operator control |
|-------|---------|------------------|
| **Runtime structure** | The fixed anatomy of the surface (Core Four, rows, depth model). | Fixed — not editable in the composer. |
| **Configurable sections** | Named, semantic sections added via **Add Section**. | Add / remove / relabel. Semantic identity preserved. |
| **Configurable fields** | Fields inside a region. | Relabel · reorder · add · behavior (Editable/Read-only/Hidden). |
| **Domain-locked regions** | Regions a domain owns (marked `Domain-locked`). | Read-only structure; fields may still show. |
| **Evidence surfaces** | History / archive (e.g. *View all evidence*, related reports). | Browsed, not operated. Never competes with operational info. |
| **Operational surfaces** | The fields/actions the operator works with daily. | Primary; actions live next to the field they affect. |

### Add Section flow

`+ Add section` offers **platform-defined sections** with stable semantic identities
(preserved for future BOS/AI understanding) plus one **Custom Section** escape hatch:

- Emergency Contact · Authorized Pickup · Billing Contact · Emergency Medical · Custom Notes
- Custom Section — operator-named, carries a stable `custom` semantic.

Catalog: `web/lib/adminV2/settings/surfaces/sectionCatalog.ts`. Sections map to optional
evidence groups on the registered surface spec; no new storage — enablement + semantic +
optional custom label persist on the nested-surface group config
(`nestedSurfaceEditorModel.ts`).

### Consistent field composition

Every configurable region exposes the **same** editing affordances. Additional Contacts
has field-composition parity with Primary Contact; both resolve fields per group through the
same `renderContactFields` / `InlineRuntimeFieldList` path.

### Child detail — one Edit mode + contextual History

**One Edit** in the card footer enters operational edit mode (not scattered per-field
edit buttons). **History →** sits beside Program / Room / Teacher — contextual, not a
dedicated Related Views section. Schedule keeps its pill presentation; **Edit →** on the
times row opens an inline start/end editor (no modal). **View all evidence** is a quiet
bottom-right archive entry point.

### Activity preload

Whenever the Focus Panel opens, Activity-mode metadata prewarms in the background
(`useFocusPanelModePrewarm` → `prewarmFocusPanelActivityMode`: comms, documents, activity
timeline; notes ship on VM) so Work ↔ Activity switching is instant — no spinner, no layout
shift. Sanctioned idle prefetch only; never changes a reveal gate.

### Invariants (V3)

- Composer wraps the runtime; no second render path; runtime ↔ composer parity holds.
- Presentation labels never mutate schema keys.
- Field behavior is Editable / Read-only / Hidden; Hidden hides at runtime.
- Sections are semantic, platform-owned identities (+ one custom escape hatch); structure
  stays fixed.
- Evidence never competes with operational information.
- Prefetch/preload is allowed; reveal gates are not touched.
- No new runtime architecture — this is the runtime in "Edit Layout" mode.

**Code:** `InlineRuntimeFieldList.tsx` · `AddSectionMenu.tsx` · `ComposableRegionShell.tsx` ·
`FocusPanelDrillInInspector.tsx` (metadata-only) · `sectionCatalog.ts` ·
`nestedSurfaceFieldPolicy.ts` · `nestedSurfaceEditorModel.ts`.
Tests: `web/tests/adminV2/runtime/focusPanelDrillInComposition.test.ts`.

---

## Surface Composer V3.5 — operational surface completion (July 2026)

> **The Focus Panel is not a collection of cards — it is operational surfaces connected
> together.** Every level is another runtime surface; the composer configures those surfaces.

### Navigation hierarchy

```
Runtime Surface (Focus Panel)
  ↓ Nested Runtime Surface (Household · Children · Child detail)
    ↓ Evidence Surface (Documents · Medical · Pickup · Notes …)
      ↓ Operational Surface (Program · Room · Schedule · placement truth)
        ↓ Composition Mode / Edit Mode (inline field + section authoring)
```

### Section reordering

Sections inside a nested surface are **first-class and reorderable** (`moveSectionInNestedConfig`,
persisted on `NestedSurfaceConfig.groups` order). Household sections (Primary Contact, Children,
Emergency Contacts, Additional Contacts, …) can be reordered without invalidating structure.
`InlineSectionControls` provides up/down affordances in Edit Mode.

### Evidence as configurable surface

Evidence is no longer a hardcoded expanded overlay. **Evidence sections** (Documents, Medical,
Pickup, Communications, Notes, Nickname, Custom) are optional, add/remove/reorder/publish via
the same nested-surface model as operational sections. Platform-owned evidence types keep stable
semantics. **View all evidence** is the archive entry point (bottom-right); operational fields
answer "what matters now?"

### Child identity composition

Child identity is composed from presentation fields (First Name, Last Name, Preferred Name,
Nickname, Age, DOB) — never a single immutable "Child Name" schema field. The runtime identity
block renders from configured fields (`childIdentityCompose.ts`); schema keys stay hidden from
operators.

### One Edit mode

A **single Edit →** affordance enters edit/composition mode. Within Edit Mode: fields are
draggable, labels editable, display policies editable, sections reorderable, add field / add
section enabled. The runtime stays visually intact. In Settings, drill-in **is** Edit Mode
(`isEditMode` on `FocusPanelComposerProvider`).

### Runtime linking

Nested surfaces link through a platform navigation registry (`nestedSurfaceNavigation.ts`):
Household → Children → Child detail → Evidence → Documents. Link targets are configurable per
section; defaults map to registered surface ids.

### Runtime source of truth

The composer wraps **`FocusPanelCardRenderer`** — the same component `/work-unit` mounts.
No duplicate presentation path. Published nested-surface config is consumed by runtime evidence
builders (`buildHouseholdCardEvidence`, `ChildrenCard`, …) on the next render.

### Definition of done (V3.5)

The Surface Composer feels like editing the application itself: enter Edit Mode, navigate runtime
surfaces, reorder sections and fields, relabel fields, configure policies, configure evidence
surfaces, configure navigation links, publish — and the runtime immediately consumes those changes.
One runtime · one renderer · one navigation hierarchy · one composition experience.

**Code:** `nestedSurfaceSectionOrder.ts` · `nestedSurfaceNavigation.ts` ·
`InlineSectionControls.tsx` · `childIdentityCompose.ts` · `focusPanelActivityPrewarm.ts` ·
evidence section catalog in `sectionCatalog.ts`.

---

## Final Surface Composer Doctrine (July 2026)

> **Runtime layouts are frozen.** The composer is an **overlay**, not another renderer.
> Edit Mode reveals editing affordances only; the operator should feel like they are editing
> the actual product.

### Sacred runtime

Do **not** redesign Household, Children, Child Detail, Activity, or Billing layouts in the
composer. The runtime is the source of truth. Every change must preserve runtime presentation.

### Edit Mode affordances

When Edit Mode is active (Settings drill-in / `isEditMode`):

- Fields become draggable (grip handles on runtime rows)
- Labels become editable
- Display policy becomes editable
- Sections become reorderable
- **Add field** and **Add section** appear
- The runtime itself stays visually unchanged except for these affordances

### Overlay rules

- Do **not** replace operational layouts with configuration layouts
- Do **not** expose implementation concepts, evidence architecture, or presentation plumbing
- Do **not** show a separate compose preview row that duplicates runtime structure
- Edit-layer controls (`InlineRuntimeFieldList` with `suppressPreview`) appear **below**
  runtime rows only when their region is selected
- **One Edit mode** — no scattered Set/Edit links on individual fields (footer `Edit →` for
  operational edit; schedule inline edit only inside operational edit preview)
- **History** stays attached to operational fields; no Related Views section
- **View all evidence** remains the single archive doorway (bottom-right)
- Evidence sections keep runtime empty states; field configuration is an edit-layer overlay
- Composer header omits the Focus Panel close control (`hideClose`) — title, icon, and pills
  align with runtime

### Definition of done

A side-by-side screenshot of runtime and composer should show the **same layout**. The only
acceptable differences are editing affordances (grips, section controls, add field/section,
edit-layer chrome on selected regions).

**Code:** `RegionEditLayer` · `ComposableFieldShell` · `InlineRuntimeFieldList` (`suppressPreview`,
`whenRegionSelectedOnly`) · `FocusPanelCompactHeader` (`hideClose`).

### Ship closeout additions (July 2026)

- **Runtime is source of truth.** Composer is overlay/edit mode only — fixed structure +
  configurable fields/sections; side-by-side parity required before ship.
- **Child edit remains staging-owned.** Runtime edit uses `ChildFocusEdit` →
  `FocusPanelMutation.saveInquiryChild` (existing identity + participation paths). Do not
  invent a parallel child edit component. Domain-locked fields must not fake editability.
- **Empty enabled sections must be actionable.** Emergency Contacts shows
  `Add emergency contact →` and opens the existing relationship modal — never a dead `0`.
- **Household section pin rules:** Primary Contact pinned top; Other Parent / Guardian pinned
  directly below when present; Additional / Emergency / Children reorderable (Children may
  precede Emergency). Adding Emergency reconciles required groups — never wipes Primary /
  Children.
- **Date doctrine:** Focus Panel dates use `focusPanelDateDisplay.ts` (presentation date +
  derived age). No raw ISO / MM/DD/YYYY on operator Focus Panel surfaces.
- **Inline work-unit** header uses `hideClose` (composer and runtime). Queue Row stays frozen.
