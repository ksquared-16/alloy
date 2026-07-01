# Experience Builder doctrine

**Status:** Canonical (June 2026 — Lead/Opportunity drawer reference implementation).

Visual layout authoring for record surfaces — drawers, queue row previews, and future workspace panels.

**Unifying umbrella:** This doctrine is the reference implementation of the broader **Presentation Runtime** — see [`presentation-runtime-doctrine.md`](./presentation-runtime-doctrine.md) for the Design Surface product language, renderer-first model, three-axis framing (Perspective vs Viewpoint), Analytics-as-Dashboard, and ownership/lifecycle that this builder authors.

---

## Purpose

Experience Builder is the **canonical visual surface builder**. Operators configure what appears on a record surface; runtime renders from **LayoutDoc** without parallel code paths.

Lead/Opportunity drawer is the **reference implementation**. Person, Child, and Queue surfaces reuse the same contracts (see [surface cloning plan](./experience-builder-surface-cloning-plan.md)).

> **Convergence direction (locked):** Experience Builder's future target is **configuring card-composed surfaces** (Focus Panel Universal Cards via the Surfaces editor), **not drawer sections**. LayoutDoc **drawer** authoring (drawer overview sections + tab-body inline edit) is **transitional legacy** and must not receive new product investment. The **freeze rule** below and the sunset status matrix live in [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md). Queue row authoring (v3) is unaffected.

### Freeze rule

No new operator-facing product behavior should be added to **drawer overview**, **drawer tabs**, **lead summary blueprint**, or **`entityPresentation` drawer surfaces** unless required as temporary compatibility. Specify new behavior as **Focus Panel card behavior**.

---

## Experience Builder V4 — Canvas Builder + Evidence Group Authoring (June 2026)

The `/settings/surfaces` editor is **canvas-first**: the Focus Panel canvas **itself is the
editor** (`FocusPanelCanvasBuilder`), not a control panel beside a preview. There is no
"Compose Layout" panel.

**Composition vs Behavior — a hard separation:**

| The **CANVAS** owns composition | The **INSPECTOR** owns behavior |
|---|---|
| position · width · height · stacking · row placement | question · evidence groups · editing · expanded · related views · actions · conditions · AI · ownership |

- **Direct manipulation:** click a card to select it (opens the Inspector), drag to
  reorder / move between rows / stack, drag the **right edge** to make it wider/narrower,
  drag the **bottom edge** to give it more/less **room**. The operator thinks "bigger /
  smaller", not "layout token" — widths snap internally to Quarter / Third / Half / Two
  Thirds / Full, the runtime computes exact spacing (+ Fill), so rows stay composed with
  no dead whitespace.
- **Width** changes composition; **height** (`cell.height` → compact / standard / tall)
  changes how much room a card has before overlay/expanded behavior. Resizing **never**
  changes a card's question, evidence ownership, editability, or related views — *same
  card, same answer, different amount of room.*
- The published layout drives the runtime exactly (`FocusPanelCardGrid` honors widths,
  stacking, and reserved height). Composition is NOT configured in the Inspector.

**Surface composition pipeline (authored on the canvas):**

```
Canvas → Rows → Columns → Cards (width · height · stacking) → Published Runtime
```

**Card definition pipeline (per card — Evidence Group Authoring, V4):**

```
Card → Question → Evidence Groups → Evidence → Behavior → Related → Publish
```

**Evidence Groups are the heart of card configuration** — not "fields on a card". Each
group exposes: name · operational question/purpose · owner card · evidence items
(fields) · presentation · **Summary / Focus / Expanded visibility** · editing behavior ·
required/read-only/hidden · related views · actions · conditions. Fields live **inside**
Evidence Groups (`FocusPanelEvidenceGroup`); "Fields" is never the primary concept. A
reference card seeds its doctrine groups via `defaultEvidenceGroupsForCard`.

**Child owns Placement as an Evidence Group** (Program · Room · Schedule · Teacher ·
Desired Start) — Placement is **not** a separate card. Child groups: Identity · Placement
· Medical · Documents · Readiness · Notes. The operator manages the child without bouncing
between cards.

**Ownership lives at the Evidence Group level** (`group.owner`); a group's fields are
editable only on the owning card. **Expanded** = the same question with additional
configured evidence groups (`group.includeInExpanded`), *not* history. **Related Views**
(`config.relatedViews`) are optional report drill-downs (Schedule History, Placement
History, Billing History …) — distinct from Expanded. See
[`universal-card-lifecycle.md`](./universal-card-lifecycle.md).

- **Published layout is the source of truth.** The runtime renders the published rows/
  widths exactly (responsive single-column collapse only) and **never overrides an
  intentional published layout**. **Weight / partner / preferred shape are recommendation
  defaults only** — auto-composition exists only when nothing is published.
- Cards are sized by **intent** (**Quarter / Third / Half / Two Thirds / Full / Fill**),
  not grid fractions; the runtime computes exact spacing and **Fill** removes dead
  whitespace. Rows add / remove / reorder; cards stack and drag between rows. The builder
  preview **is** the runtime grid. Layout persists on the Summary `LayoutDoc` metadata
  (`focusPanelLayout`) via the existing draft/publish flow.
- **Fields live inside Evidence Groups**; **every concept has one owning card** (editable
  only on its owner). The Inspector is organized by operational section (Question /
  Evidence / Presentation / Behavior / Editing / Expansion / Conditions / Actions / AI).
- Full canonical state (card definition, evidence groups, ownership, expansion +
  workspace doctrine, mutation model, depth history):
  [`focus-panel-composition-v2-and-editing.md`](./focus-panel-composition-v2-and-editing.md).

---

## Core doctrine

| Rule | Detail |
|------|--------|
| **LayoutDoc is runtime truth** | Published `LayoutDoc` drives `LayoutRuntimePlanView` (and queue row composer for queue surfaces). Builder metadata is stored on LayoutDoc items/sections — not in parallel config stores. |
| **No separate runtime paths** | Builder preview and production runtime share rendering contracts (`LayoutRuntimePlanView`, `variant: "preview" \| "production"`). Preview-only items are publish-guarded, not forked renderers. |
| **Field editability is field/column-level** | `editable: true` on field items or related-list columns, plus a supported save adapter. Block `editMode` metadata is **ignored** at runtime. |
| **Section Edit is derived** | One Edit button per section/card/list header **iff** any descendant field/column has `editable: true` and a supported save adapter. Row actions, block editMode, and save-adapter alone do **not** create Edit. |
| **Canonical field settings** | One modal/panel (`OpportunityDrawerLayoutFieldSettingsModal`) for label, display, visibility, and inline editable — canvas and Properties share `applyLayoutEditorFieldSettingsPatch`. |
| **Relationship-based contacts** | Contact blocks resolve persons from household/opportunity relationships (`resolveLayoutEditorContactBlockPerson`). Not hardcoded “secondary contact” scalars. Primary is excluded from additional-contact blocks. |
| **KPI tiles are peer blocks** | Widget strip / KPI sections use tone styling and peer card width — not a separate widget runtime. |
| **Related lists are repeaters** | `related_list` items with row templates (`childRowGroups`, `layoutEditorRelatedListConfig`). Columns carry the same metadata shape as field items. |
| **Age is computed** | `child.dob_age` / age display is derived from DOB via `formatLayoutRuntimeAgeDisplay` — not stored age migration. |

---

## Builder surfaces

| Surface | Editor entry | Default doc |
|---------|--------------|-------------|
| Opportunity drawer | `/settings/layouts` → Opportunity drawer | `buildLeadDrawerDefaultDoc()` |
| Person drawer | `/settings/layouts` → Person drawer | `buildPersonDrawerDefaultDoc()` |
| Child drawer | `/settings/layouts` → Child drawer | `buildChildDrawerDefaultDoc()` |
| Queue record row | Queue layout editor (v3 metadata) | org / queue presets |

---

## Layout zones (Opportunity drawer)

| Zone | Section keys (examples) | Presentation |
|------|---------------------------|----------------|
| **Summary strip** | `lead_summary`, KPI widget strip | Compact horizontal tiles |
| **Primary workspace** | `children_enrollment`, `program_enrollment` | Centerpiece panel, enrollment card list |
| **Body sections** | `household_contact`, `household_relationships`, custom blocks | `DrawerOverviewPanelShell` with tone/header |
| **Rail / secondary** | Attention, tasks, documents widgets | Widget placeholders + composition hints |

Section metadata: `layoutSectionPresentation`, `layoutEditorSectionType`, card width fractions, peer packing (`layoutBuilderPeerCardRows`).

---

## Section / card / list rendering

1. **Section** — `SectionView` in `LayoutRuntimePlanView.tsx`
   - Evaluates `visibleWhen`, composition hints, household profile substitution (legacy path when active).
   - Wraps body in `LayoutRuntimeBlockEditProvider` when layout-doc inline edit applies.
   - Renders **one** `SectionHeaderEditAction` in panel header.

2. **Field group / card** — `GroupCell` → `GroupCellContent`
   - Contact blocks: relationship resolution + overlay before field render.
   - No nested Edit buttons.

3. **Related list** — `RelatedCell` → `LeadEnrollmentCardList` | `LayoutRuntimeEnrollmentGrid` | compact rows
   - Row template from `childRowGroups` + `layoutEditorRelatedListConfig`.
   - Section-level Edit enables in-place column edits.

4. **Field** — `ValueCell`
   - Display + optional inline edit when section is in edit mode.

---

## Row packing

- **Section rows/columns** — 12-column grid; card width fractions for peer KPI/contact cards.
- **Child row template** — `childRowGroups` map column indices to related-list columns; runtime via `resolveChildRowTemplateRowLayout`.
- **Queue row** — v3 scoped columns + blocks (`queueRecordLayoutV3`); inline/stack block layout.

---

## Field metadata

Stored on `LayoutItem.metadata` / column metadata:

| Key | Purpose |
|-----|---------|
| `layoutEditorDisplay` | Label visibility, date format, age format, typography, link behavior |
| `layoutEditorVisibility` | Field visibility rules |
| `layoutEditorBlockConfig` | Block type, row groups, data context (authoring only for editMode) |
| `layoutEditorContactRole` | Contact card role (primary, parents, billing, emergency) |
| `layoutEditorRowTemplate` | Related-list row actions (not field editability) |
| `editable` | On field item or column — runtime inline edit flag |

---

## Inline edit behavior

### Activation

- Operator clicks section **Edit** → `LayoutRuntimeBlockEditProvider.blockEditing = true`.
- Editable fields/columns with save adapters become inputs.
- Non-editable fields remain display text.

### Presentation (518Y–518AA)

- **Same row template in display and edit** — `LeadEnrollmentRepeaterFieldCell` renders inline `Label Value` in both modes; configured `childRowGroups` use flex-wrap lines, not stacked form labels.
- **In-place controls** — `LayoutRuntimeInlineEditFieldControl` with `variant="inline-cell"` keeps label and control on one baseline (`w-auto`, no full-width line break).
- **No separate edit layout** — related-list card list and meta lines must not branch to a form/grid edit renderer.
- **Compact density** — 11px type, 24px control height, labels stay in configured positions.
- **Persistence** — drawer-level **Save Changes** via `LayoutRuntimeDrawerEditProvider`; section **Done** exits edit mode only.

### Edit button UX

- Hidden until section hover/focus (`group/section`).
- Visible while editing.
- Keyboard focus exposes Edit (`focus:opacity-100`).
- No field-level Edit buttons when section Edit is active.

---

## Save behavior

- `LayoutRuntimeDrawerEditProvider` tracks dirty field values per refKey (+ rowKey for repeaters).
- Save dispatches through existing opportunity PATCH / inquiry-child placement adapters.
- `LAYOUT_RUNTIME_DRAWER_SAVED_EVENT` / `REVERTED` exit section edit mode.

Supported adapters: `layoutRuntimeFieldIsEditable` + `resolveLayoutRuntimeFieldControl` registry (location, program, room, enrollment status, DOB, opportunity fields, etc.).

### Person / Child drawer — read-only fields (June 2026)

These fields remain **display-only** in default LayoutDocs because there is no reliable layout-runtime write path. Do not invent PATCH routes from the builder.

| Field / refKey | Surface | Reason |
|----------------|---------|--------|
| `customer.household_name` | Person, Child | Customer record name — no registered person/child drawer PATCH adapter; household identity is relationship-scoped, not person-scalar. |
| `person.relationship` | Person | Role on `customer_persons` — requires customer membership mutation, not covered by person contact PATCH. |
| `location.household_address` | Person, Child | Address lives on customer/location tables — no layout-runtime address save adapter. |
| `child.age_band` | Child | Computed from DOB via `formatLayoutRuntimeAgeDisplay` — not stored. |
| `child.status` (mirror) | Child | Authoritative status on enrollment mirror — edit via `inquiry_child.outcome_status_key` / placement adapters when OCM context exists. |
| `inquiry_child.program` (label) | Child | Program label is derived from placement mirror — editable program type/room/cohort fields use placement save when `ocm_id` present. |

**Supported Person drawer saves:** person contact scalars (`person.first_name`, `person.last_name`, `person.email`, `person.phone`) via `saveLayoutRuntimePersonContactEdits` → `/api/admin/persons/:id`.

**Supported Child drawer saves:** standalone child identity + inquiry_child placement fields via `saveLayoutRuntimeChildStandaloneEdits` when `customer_member_id` / `ocm_id` resolve from VM mirror.

**Widget merge:** Person and Child summary strips overlay VM widget payloads via `mergePersonLayoutRuntimeWidgetRecord` / `mergeChildLayoutRuntimeWidgetRecord` (same pattern as opportunity `_operational_*` widgets).

---

## Status / option label resolution

- `formatLayoutRuntimeStatusLabel` — enrollment vs opportunity vocabulary by refKey/renderHint.
- Option sets loaded via `LayoutRuntimePlacementDataProvider` for placement fields.
- Display labels resolved via `resolveLayoutRuntimeFieldDisplayLabel` / operator date formatting.

---

## Tone / header styling

- `DrawerOverviewPanelShell` — pine accent, icon badge, optional widget tone.
- `LayoutRuntimeTonedPanelShell` — block-level tone for custom cards.
- Section Edit lives in header actions slot — not duplicated inside body.

---

## Relationship / contact resolution

1. `buildOpportunityFamilyContactRows` — merge `_opportunity_persons` + `_customer_persons`.
2. `resolveLayoutEditorContactBlockPerson(role)` — primary, parents/additional, billing, emergency.
3. Exclude primary + already-rendered person IDs (`LayoutRuntimeRenderedContactIdsContext`).
4. Fallback: first non-primary associated person when role label is generic (`associated`, `member`).
5. `shouldHideEmptyLayoutEditorContactBlock` — hide additional blocks when no person resolved; primary always may show empty.

---

## Preview ↔ runtime parity

- Builder canvas uses trace paths (`field:`, `group:`, `column:`) resolved by `resolveLayoutEditorFieldNodeFromSerializedPath`.
- Runtime uses same LayoutDoc + `buildLayoutRuntimePlan`.
- Tests: `layoutBuilderRuntimeParity518*.test.tsx` series.

---

## Configuration model (June 2026)

### Layout library vs assignment

| Plane | Path | Responsibility |
|-------|------|----------------|
| **Layout library** | Settings → Layouts (`/admin/settings/layouts`) | Create, edit, publish `LayoutDoc` per surface. Does **not** assign layouts to BP stages. |
| **BP assignment** | Settings → Business Processes → stage wizard → Layout assignments | Select **published** layouts per stage slot and surface. |

**LayoutDoc shape is unchanged.** Assignment is a routing layer above `entity_layouts` resolution — see [business-process-layout-assignments.md](./business-process-layout-assignments.md).

### Supported surfaces

| Surface key | Operator label | Notes |
|-------------|----------------|-------|
| `opportunity_drawer` | Enrollment / Opportunity record drawer | Reference implementation |
| `person_drawer` | Person / Parent drawer | VM + layout runtime |
| `child_drawer` | Child drawer | Requires child/OCM context for enrollment fields |
| `queue_record` | Pipeline queue row | v3 metadata layout — not drawer sections |
| `waitlist_queue_record` | Waitlist queue row | Candidate-grain v3 composer |

### BP / stage layout resolver order

1. Exact BP + stage (+ optional status) + surface
2. BP + stage + surface
3. BP + status + surface
4. BP surface default (no stage/status)
5. Org → default → builtin → registry fallback (`resolveLayoutForOrg`)

Code: `web/lib/layout/resolveBusinessProcessLayoutAssignment.ts`

### Queue row doctrine (v3)

- Queue rows use **`doc.metadata.queue_record_layout` (v3)** — not `LayoutDoc.sections[]`.
- Fields and widgets share **operator-facing labels** from the context field catalog; backend refKeys are hidden in normal pickers.
- Column scope in the builder is **“Default resolver context”** — not global field availability.
- **Add Field / Add Widget** are scope-independent except inside repeated child blocks (repeater scope).
- Pipeline queue excludes waitlist-only refs; waitlist queue adds placement fields (`waitlist.positionLabel`, `waitlist.tierLabel`, etc.).

### Picker model

- Shared operator labels (`platformFieldResolutionManifest`, context catalog groups).
- Tenant `field_definitions` merge dynamically into picker + validator.
- Picker-visible refs must pass `validateQueueRecordLayoutConfig` / surface allow-lists.
- Context-first groups on queue rows: Lead/Enrollment, Candidate/Child, Contacts, Household/Shared, Status/Lifecycle, Waitlist/Placement, Activity/Work.

### Builder primitives: Fields, Widgets, Actions

Fields, widgets, and actions are **peer primitives** in the builder:

| Primitive | Add path | Notes |
|-----------|----------|-------|
| **Field** | Add Field (catalog / tenant fields) | Inline edit when `editable: true` + save adapter |
| **Widget** | Add Widget | KPI, attention, `current_work`, `activity_timeline`, relationship contact widgets |
| **Action** | Add Action (catalog) | **Not raw action keys** — `layoutEditorActionCatalog` + canonical availability |

Layout action catalog: `web/lib/layout/layoutEditorActionCatalog.ts` — groups relationship, contact, enrollment, and record actions by surface + context (`contact_block`, `contact_related_list`, `contact_repeater_row`, `section_row`).

### Make Primary Contact (layout-only)

- **Contact-row action only** — contact block, household contacts widget, related-list row.
- **Hidden** from generic drawer header, work-unit rail, queue row, and BOS rail (requires target person).
- Primary contact shown via **read-only badge** (`person.is_primary_contact`); promotion via **Make Primary Contact** action button with confirmation modal.
- Registry routing returns disabled reason if invoked without target: *“Select a contact first to make them primary.”*

Code: `makePrimaryContactAction.ts`, `layoutRuntimeMakePrimaryContactAction.ts`, `LayoutRuntimeMakePrimaryContactActionButton.tsx`.

---

## Related docs

- [Drawer system](./drawer-system.md)
- [Surface cloning plan](./experience-builder-surface-cloning-plan.md)
- [Queue system](./queue-system.md)
- [Record system](../core/record-system.md)
- [Typography / presentation](../../system/typography-and-presentation-doctrine.md)
