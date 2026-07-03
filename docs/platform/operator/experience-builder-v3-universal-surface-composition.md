# Experience Builder V3 — Universal Surface Composition

**Status:** Canonical (July 2026). This doctrine **freezes the composition model that unifies every builder in Alloy.** It supersedes the per-builder mental models (Focus Panel "cards", Queue "zones", Header "tiles") with one hierarchy. It does not redesign the platform — it *converges* the builders that already exist onto a single engine.

**Depends on / reconciles:**
[`presentation-runtime-doctrine.md`](./presentation-runtime-doctrine.md) (Design Surface, Perspective, Viewpoint) ·
[`experience-builder-doctrine.md`](./experience-builder-doctrine.md) (canvas-first authoring, evidence groups) ·
[`universal-card-lifecycle.md`](./universal-card-lifecycle.md) (Summary/Focus/Expanded/Workspace) ·
[`operational-grain-doctrine.md`](./operational-grain-doctrine.md) (Case/Child/Candidate grain) ·
[`queue-row-platform.md`](./queue-row-platform.md).

**Audit that produced this doctrine:** [`docs/sprints/07_2026/experience-builder-v3/part-1-platform-audit.md`](../../sprints/07_2026/experience-builder-v3/part-1-platform-audit.md).

---

## 0. The one sentence

> **Everything an operator sees is a Surface, assembled on a Canvas from Components, each Component composed of Evidence Groups of Composition Items — and any Component can *open* another Surface.**

Once this is true, Alloy stops inventing builders. Parent Portal, Staff Portal, Scheduling, Billing, Attendance, and Dashboards become **new Surfaces assembled from the same engine**, not new builder architectures.

---

## 1. The canonical hierarchy (frozen)

```
Surface
   ↓
Canvas
   ↓
Component            ← a Card is ONE component type
   ↓
Evidence Group
   ↓
Composition Item     ← Field | Widget | Related List | Calculation | AI Summary | Action
   ↓
Conditions           ← cross-cutting facet (visible / read-only / highlighted when…)
   ↓
Actions              ← cross-cutting facet (link / edit / open-surface / handoff)
```

### 1.1 Definitions

| Layer | Definition | Not |
|-------|-----------|-----|
| **Surface** | A named, versioned, publishable presentation context. The unit an administrator authors and an operator experiences. (= "Design Surface" in Presentation Runtime language.) | a route, a component, a record |
| **Canvas** | The composition space of a Surface: rows, columns, stacking, width/height by intent (Quarter/Third/Half/Two-Thirds/Full/Fill). The authoring surface *is* the runtime grid. | a control panel beside a preview |
| **Component** | The unit placed on the Canvas. **A Card is one Component type.** So are a Queue Row, a Header Tile, a Dashboard Metric, a Portal Section, a Document Block. Every builder composes Components; the *component type* varies, the model does not. | synonymous with "Card" |
| **Evidence Group** | A named, business-meaning grouping of Composition Items inside a Component (Primary Contact, Placement, Billing Responsibility…). Ownership lives here (`group.owner`). | "fields on a component"; never "Group 1" |
| **Composition Item** | The atomic bound unit. One of six kinds: **Field, Widget, Related List, Calculation, AI Summary, Action.** Bound to a Data Source, gated by Conditions, may carry Actions. | a raw database column |
| **Conditions** | A declarative gate on any Item or Group (`visible_when`, `read_only_when`, `highlighted_when`, `collapsed_when`). One grammar. | code branches |
| **Actions** | Declarative operator actions on an Item/Group/Component (link, inline-edit, **open-surface**, handoff/change-subject). From a catalog, never raw action keys. | free-form buttons |

### 1.2 Why "Component," not "Card"

Cards, Queue Rows, Headers, and Dashboard tiles are **the same shape** — a bounded region that groups evidence and answers an operational question. Calling them all **Components** (with `componentType: card | queue_row | header_tile | metric | section | …`) is the abstraction that lets **one engine and one builder** serve all of them. The builder never branches on component type for composition; only the **renderer** and **content source** differ, and those are injected (see §4).

---

## 2. The orthogonal axis: Lifecycle / Depth (NOT "Perspective")

A Component is experienced at a **depth**. This axis is orthogonal to the composition hierarchy and is **frozen from `universal-card-lifecycle.md`** — do not rename it, and do **not** call it "Perspective."

```
Summary → Focus → Edit → Expanded → Workspace
```

| Depth | Meaning |
|-------|---------|
| **Summary** | The 2–5 second operational answer on the Surface. |
| **Focus** | The current operational truth for this Component. |
| **Edit** | Inline editing *inside* Focus; rows become controls in place. |
| **Expanded** | **Opens another Surface** (see §3). |
| **Workspace** | Larger work (bulk edits, financial/ledger review) — **also a Surface** (see §3). |

> ⚠️ **Reserved words.** **Perspective** remains the *Selection axis* — an operating lens (saved filter/sort/grouping), frozen in `presentation-runtime-doctrine.md:74`. **Viewpoint** remains the *Audience axis* (Director/Teacher/Parent/Corporate). Neither is a layer of the composition hierarchy. The V3 hierarchy introduces **no new noun** for depth — it reuses the existing lifecycle.

---

## 3. Expanded = Open Surface (the keystone)

**A Component does not own an "expanded layout." Expanded (and Workspace) resolve to *another Surface*.**

```
Focus Panel Surface
   ↓  (Children Component, Expanded)
Children Surface          ← itself a Surface: Canvas → Components → Evidence Groups → Items
   ↓  (a child row, change-subject)
Children Surface (for that child)   ← recursion
```

Likewise:

```
Financial Configuration Component  → Financial Configuration Surface
Readiness Component                → Readiness Surface
Current Work Component             → Current Work Surface
```

### 3.1 The recursion primitive

A Component (or one of its Evidence Groups) declares an **`openSurfaceId`**. When the operator opens it (Expanded/Workspace depth), the runtime is intended to **compose and render that named Surface** through the *same* compose + grid path — not a bespoke expanded view, not "more fields."

> **Wiring status (be precise).** The primitive and its resolution are **landed and
> tested at the engine level** (`universalSurfaceModel` + `surfaceRegistry`:
> `resolveOpenSurface`, `walkSurfaceGraph`, cycle-safe). **No live runtime component
> imports the registry yet** — the Focus Panel overlay still renders its existing
> in-card views. Rendering a resolved Surface inside the live overlay (the
> `ChildrenCard` swap) is a **staged follow-on** (§9). In this PR, recursion is proven
> at the model/registry level, not visible in the running app.

```
component.depth.expanded = { openSurfaceId: "children_surface" }
```

- If `openSurfaceId` is absent, Expanded falls back to the legacy behavior (additional evidence groups on the same component) — additive, non-breaking.
- The nested Surface is a first-class Surface: authorable, versionable, navigable (§6), and itself able to open further Surfaces.

### 3.2 Two recursion proofs (this sprint)

| Proof | Proves | Path |
|-------|--------|------|
| **Children Surface** | `Record → Record Surface` — a record component opens a composed record surface | (intended live path) `ChildrenCard` "View children" → composed Children Surface → child row change-subject → recursion. **In this PR:** proven at model/registry level (self-referential spec + cycle-safe walk), live overlay render deferred (§9). |
| **Financial Configuration Surface** | `Operational Surface → Operational Surface` — the platform is **not** just record layouts; a configuration/question surface opens another surface (Configuration → History → Actions) | Financial Config component → Financial Config Surface. **In this PR:** proven at model/registry level, live render deferred (§9). |

Children proves recursion. Financial Configuration proves the model generalizes beyond record drawers to **operational/configuration** surfaces — so no one can say "that's just another drawer."

### 3.3 Doctrine invariants reconciled

The following invariants previously **forbade** nested surfaces and are hereby amended (V3 supersedes):
- `focus-panel-composition-v2-and-editing.md:141-143` ("Expansion never creates a new surface") → **"Expanded opens a nested Surface via `openSurfaceId`; the inline-overlay host renders that Surface."**
- `card-interaction-expansion-doctrine.md:54-88` ("same subject, body expands inline") → **"Expanded may compose a nested Surface for the same or a changed subject."**

---

## 4. One engine: Engine B semantics + Engine A seams (frozen decision)

The platform had **two composition engines**. They are unified as follows:

| Concern | Source | Rationale |
|---------|--------|-----------|
| **Document model / semantics** (Component → Evidence Group → Composition Item → Conditions → Actions) | **Engine B** (LayoutDoc / evidence-group stack) | It owns the layers operators care about. |
| **Plumbing** (Content Source, Renderer, Persistence adapter, runtime render) | **Engine A** (`surfaceBuilder/`) | Its injection seams are clean and branch-free on surface type. |

**The rule:** one `SurfaceDoc` whose **Components host Evidence Groups of Composition Items**, rendered by an **injected renderer** per component type, persisted by an **injected persistence adapter**, sourced by an **injected content source**. The builder **never branches on component type** for composition.

- Content Source seam: `ContentSourceProvider` (`surfaceDefinition.ts:87`).
- Renderer seam: `RendererDefinition` (`surfaceDefinition.ts:67`).
- Persistence seam: `SurfacePersistenceAdapter` (`surfaceDefinition.ts:137`).

Adding a new surface family (Portal, Scheduling…) = register a component type + renderer + content source + persistence adapter. **No new builder.**

---

## 5. Field availability: evidence groups know compatible fields (frozen)

A Composition Item's availability is governed by **the Evidence Group's accepted entity namespaces**, not by hardcoded per-component field lists.

```
Evidence Group declares:  acceptedNamespaces: [customer, person]     (Primary Contact)
                          acceptedNamespaces: [child, inquiry_child]  (Children / Placement)
Custom field created:     entity_type = person  → refKey person.preferred_language
Result:                   available in every group whose acceptedNamespaces ∋ person
```

- Availability = **platform starter fields ∪ tenant custom fields** whose namespace is accepted by the group. The starter list is a floor, never a ceiling.
- The tenant-field machinery already exists (`tenantLayoutFieldPickerCatalog.buildTenantLayoutCatalogFields`, namespace mapping, surface-compatibility gate) and is wired into drawer/queue pickers.

> **Wiring status (be precise).** V3 wires this into the **composition adapter**
> (`compositionFieldAdapter.namedEvidenceGroupsForZone(zone, isWaitlist, tenantFieldDefinitions)`):
> when a caller passes tenant field definitions, custom fields whose namespace is
> accepted by a group are returned in that group's `availableFields`. This is
> **landed and tested at the adapter level.** The **builder UI call-site is NOT yet
> wired** — `QueueRowBuilderV2` still calls the adapter *without* tenant definitions,
> so custom fields do **not** appear in the builder UI in this PR. Passing loaded
> `field_definitions` from the builder (as the drawer field-catalog route already
> does) is a **staged follow-on** (§9). Until then, custom-field availability is an
> adapter capability, not a visible builder feature.

- The queue/layout validator allow-list auto-extends for tenant refKeys that pass namespace compatibility, so published configs referencing custom fields validate. (Also an available seam, wired at publish integration.)

**What must never be hardcoded again:** the *available* field set. `defaultFieldKeys` are legitimate **defaults** (what a group seeds with), never the **availability boundary**.

---

## 6. Naming & Navigation (frozen)

- **Operators never see implementation names.** No "Group 1", "Block N", "Details" fallback, "span columns/rows", "12-column grid", "Compose layout". Every Evidence Group has a business name from the registry; every Component and Surface has an operator label.
- **Navigation reflects the Surface tree, including nested surfaces.** Editing a nested surface reads as editing a **Surface**, not a configuration record:

```
Settings → Surfaces → Focus Panel → Children Component → Children Surface
Settings → Surfaces → Queue Row → Family Queue Row / Child Queue Row
Settings → Surfaces → Financial Configuration → Financial Configuration Surface
```

- The Surface Library is a **single registry** of surface definitions (not two hand-synced catalogs), from which both the library UI and the router read.

---

## 7. Queue Row under the model (frozen direction)

The Queue Row is a **Surface** whose Component is a **Queue Row component** (`componentType: queue_row`). There is **one** Queue Row Builder:

```
Queue Row Surface
   ↓ Canvas (supports stacked sections, not only one horizontal strip)
   ↓ Component(s)
   ↓ Evidence Groups
   ↓ Composition Items (gated by Conditions)
```

- **Grain is a first-class, persisted, selectable axis** (Family/Case vs Child/Candidate), per `operational-grain-doctrine.md` — not two separate surfaces.
- **Waitlist is a Condition, not a Surface.** `IF placement_status = waitlisted THEN show Position, Tier, Wait Since, Override, Desired Schedule, Desired Program`. The "Pipeline Queue vs Waitlist Queue" split is retired.
- The Canvas supports **stacked sections** (schema successor to flat `columns[]`), enabling e.g. `Household | Status / Children | Attention / Actions`.

---

## 8. What "done" means for the whole platform

If this doctrine is correct, then for any future product surface (Parent Portal, Staff Portal, Scheduling, Billing, Attendance, Dashboards, workflows):

1. It is a **Surface** in the registry.
2. It is composed on a **Canvas** of **Components** (its component type may be new; the model is not).
3. Each Component is **Evidence Groups of Composition Items**, gated by **Conditions**, carrying **Actions**.
4. Field availability comes from **namespace compatibility**, so custom fields flow in automatically.
5. Any Component can **open another Surface** (recursion).
6. It requires **no new builder** — only a registered component type + renderer + content source + persistence adapter.

That is the architectural destination: Alloy stops inventing framework and starts assembling products.

---

## 9. Implementation status (this sprint)

| Piece | Status |
|-------|--------|
| Doctrine frozen (this doc) | ✅ landed |
| Universal model (`universalSurfaceModel.ts`): Surface → Canvas → Component → Evidence Group → Composition Item | ✅ landed |
| `openSurfaceId` recursion primitive + registry with cycle-safe resolution (`surfaceRegistry.ts`) | ✅ landed |
| Field availability — adapter capability (`acceptedNamespaces` + tenant merge) | ✅ landed + tested **at the adapter level** |
| Field availability — builder UI call-site (pass loaded `field_definitions` into the adapter) | ✅ **landed (PR #68)** — Queue Row Builder + Nested Surface Editor pass tenant defs; custom fields visible in Add Field by namespace |
| Children Surface — recursive proof (Record → Record Surface, self-referential) | ✅ landed + tested (model/registry) — **editable in /surfaces (PR #68)** |
| Financial Configuration Surface — recursive proof (Operational → Operational) | ✅ landed + tested (model/registry) — **editable in /surfaces (PR #68)** |
| Evidence Group terminology (retire abstract "Details" → "Overview") | ✅ landed (runtime-visible: default group label) |
| Nested surface **editing** in /surfaces (open card → nested surface → configure fields → persist) | ✅ **landed (PR #68)** — `NestedSurfaceEditor`, persists `metadata.nestedSurfaces[surfaceId]` |
| Stacked condensed queue row + grain/conditions | ✅ **landed (PR #68)** — `column.rowIndex` + `queueRowGrainModel`; authored + persisted |
| Runtime overlay render swap (live render of nested Surface + stacked rows + `visibleWhen`) | **deferred → Runtime Adoption** — see [`presentation-runtime-carry-forward.md`](./presentation-runtime-carry-forward.md) |
| Surface Library single-registry cutover / queue surface-entry collapse | **deferred → Runtime Adoption** |

### 9a. Authoring vs live runtime (be precise)

**Authored + persisted today (PR #68):** stacked queue rows (`rowIndex`), grain + waitlist-as-condition (`visibleWhen`), custom fields by namespace in the builders, and **nested surface editing** for Children Surface + Financial Configuration Surface (persisted to the Focus Panel summary doc metadata).

**Not yet consumed by the live operator runtime:** stacked-row render, `visibleWhen` evaluation, and nested-surface render. These are the Runtime Adoption seams — the single source of truth for what to build next is [`presentation-runtime-carry-forward.md`](./presentation-runtime-carry-forward.md). Nothing was silently dropped.
