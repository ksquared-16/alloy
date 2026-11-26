# Enrollment Summary Vertical Slice — Implementation Plan (for review)

**Path:** `docs/sprints/archive/06_2026/enrollment-summary-vertical-slice/`
**Status:** **PLAN ONLY — no code written. Awaiting review before implementation.**
**Goal:** Prove the smallest real loop of Presentation Runtime + Experience Builder V2 + Presentation Data: **configure → publish → operate → revise → publish again**, on **Enrollment Focus Panel Summary only**.

> This is a build plan, not a doctrine. It is grounded in a code inspection (Jun 2026) of the live runtime, layout storage, card system, OIP, and field/relationship utilities.

---

## 1. What we found (current state)

| Area | Reality today | Implication for the slice |
|---|---|---|
| **Layout storage** | `entity_layouts` table holds a versioned `LayoutDoc` JSON; `surface` CHECK = **`drawer` \| `queue`** only. Full draft/publish/version/duplicate/rollback already implemented (`entityLayoutsRepo.ts` + `/api/admin/entity-layouts/*`). Resolution via `resolveLayoutForOrg`. | **Reuse wholesale.** No new storage system. |
| **`LayoutDoc` shape** | `Layout → Section → Row → Column → Item`; `renderHint` vocab = `text,status,date,datetime,money,link,badge,phone,primary_yes_no,custom`; `LayoutItem` supports `related_list` + `columns` (collections); `LayoutCondition = {type,path,value}`. | Map **Card = Section**, **Slot = Item**. No new schema types. |
| **Focus Panel Summary render** | Live path (Alloy OS split): `OpportunityDrawerVmRuntime` → `OpportunityFocusPanelModeBody` → `OpportunityFocusPanelModeGrid` → `deriveOpportunityFocusPanelPresentation` (**hardcoded `SUMMARY_GRID`** in `deriveOpportunityFocusPanelCards.ts`) → `FocusPanelCardRenderer` → `UniversalCard` + `ArchetypeCardBody`. **Does NOT read layout docs.** | The slice replaces the hardcoded grid derivation with a **doc-driven** derivation, behind a flag. |
| **`focus_panel_layout_id`** | Exists on Work Views; plumbed into the drawer-body API as `pinnedEntityLayoutId`, but **ignored when `focusPanelActive`**. | Wire it into the new focus-panel derivation as the pinned layout. |
| **Renderers** | No unified slot→renderer registry. Formatters/components exist scattered: `StatusBadge`, `adminFormatters` (`formatMoney/formatDate/formatPhoneUS`), `MetricKpiCard`/`MetricVisualRenderer`, avatars, collection widgets. | Build **one thin `SlotRenderer`** that delegates to existing formatters/components. |
| **Edit Mode** | No `?edit=1` for Focus Panel; mode (summary/work/activity) is sessionStorage. Inline edit infra exists for **drawers** (`LayoutRuntimeDrawerEditProvider`) but not Focus Panel. Routes `/settings/queue-builder` and `/settings/focus-panel-builder` are **explicitly forbidden**. | In-context edit must live **on the Focus Panel surface**, via a URL/session flag — never a builder route. |
| **Data binding** | Primary contact: `resolveOpportunityPrimaryContactPerson(vmRecord)` + `person.primary_email/phone/contact_name` keys. Children: `_inquiry_children` → `child.name/age/room` (`normalizeLayoutRuntimeChildRow`). | Reuse these resolvers directly. |
| **OIP metrics** | Code registry (`web/lib/metrics/registry.ts`) + `GET /api/admin/metrics/resolve` + `fetchResolvedMetrics`. Enrollment keys: `enrollment.tour_conversion_rate`, `enrollment.time_to_schedule_tour`, `enrollment.lead_count`. **Org/workspace-scoped, not per-record.** No projected-tuition/occupancy keys. | KPI binding uses an **org-scoped** enrollment metric (e.g. `tour_conversion_rate`). |
| **Protected infra** | `AdminEntityDrawer`, `entity/*Drawer*`, `opportunity/*`, composed payload, `*Reveal*`, runtime/contract, `*Queue*` are **protected**; reveal gates govern *when the drawer opens*, not *what cards appear*. `web/components/admin/focusPanel/**` and `web/lib/adminV2/runtime/focusPanel/**` are **NOT** in the protected list. | Keep all changes inside the focus-panel subtree; **do not touch reveal gates**. |

**Two existing partial bridges to reuse, not duplicate:** the **Lead Summary blueprint editor** (`/settings/layouts?blueprint=lead_summary`, `leadSummaryCardBlueprint.ts`) and the **Experience Builder studio** patterns (`ExperienceBuilderEditableCardShell`, publish workflow).

---

## 2. Architecture decision — how Summary becomes config-driven

**Map the Presentation Runtime primitives onto the existing `LayoutDoc` schema** so we add **zero new storage types**:

| Presentation Runtime primitive | `LayoutDoc` representation |
|---|---|
| Design Surface (Focus Panel Summary) | one `entity_layouts` row (`LayoutDoc`) |
| Card | `LayoutSection` (`section.key` = card type, `section.metadata.archetype/span/density`) |
| Card slot | `LayoutItem` (`item.refKey` = data reference, `item.renderHint`/`metadata.layoutEditorDisplay` = renderer) |
| Collection slot (Children) | `LayoutItem` kind `related_list` + `columns[]` (already supported) |
| Condition (visible/highlighted/read-only) | `LayoutSection.visibleWhen` + new `metadata.highlightWhen` / `metadata.readOnlyWhen` (reusing `LayoutCondition`) |

A new pure function **`deriveFocusPanelCardsFromLayoutDoc(doc, vmRecord, metrics)`** converts the doc into the existing `FocusPanelCardModel[]` + `FocusPanelCardGridSpec` that `FocusPanelCardRenderer`/`UniversalCard` already render. **The renderer is unchanged → published == editing is automatic.**

### Storage recommendation (decision needed — see §11)

**Recommended: reuse `surface = 'drawer'` with a dedicated `layout_key = 'focus_panel_summary'`. No migration.**

- Resolved by **pinned id** (`focus_panel_layout_id` → existing `pinnedEntityLayoutId` path) or a dedicated resolver call scoped to `layout_key = 'focus_panel_summary'`.
- Avoids the `surface` CHECK migration and reuses 100% of repo/API/resolution/versioning code.
- Guard: the drawer-body evaluator resolves `layout_key = 'default'`; the focus-panel path explicitly requests `focus_panel_summary`, so they never collide.
- Alternative (deferred): add `surface = 'focus_panel'` (small CHECK migration + `LayoutSurface` type + resolver branch audit). Cleaner conceptually, higher blast radius. **Not recommended for the slice.**

---

## 3. Files to touch

### New files (additive — low risk)

| File | Purpose |
|---|---|
| `web/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc.ts` | Doc → `FocusPanelCardModel[]` + grid (the core mapping) |
| `web/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog.ts` | Small card-type catalog (Readiness, Family, Enrollment, Current Work, Billing, Documents, Metric/KPI) as section templates with default slots |
| `web/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc.ts` | Code-built default doc reproducing today's Summary (the system default; avoids a data migration) |
| `web/lib/presentation/slotRenderer/SlotRenderer.tsx` | One renderer switch → delegates to existing formatters/components (Text, Status Pill, Date, Money, Relationship Summary, Collection List, KPI Card, Action Button) |
| `web/lib/presentation/slotRenderer/resolveSlotValue.ts` | `(reference, vmRecord, metrics) → typed value`; canonical / relationship / collection / metric |
| `web/lib/presentation/conditions/evaluateLayoutCondition.ts` | Client-side evaluator for `LayoutCondition` (visible/highlighted/read-only) |
| `web/lib/adminV2/runtime/focusPanel/useFocusPanelSummaryLayout.ts` | Hook: load resolved/pinned focus-panel layout doc (+ session cache, reuse `drawerLayoutRuntimeBodySessionCache` pattern) |
| `web/lib/adminV2/runtime/focusPanel/useFocusPanelEditSession.ts` | Edit state: working-copy draft load/create, auto-save (PATCH), publish, undo/redo, structure/content mode, `?edit=1` parsing |
| `web/components/admin/focusPanel/FocusPanelEditBar.tsx` | The single Edit Bar (Done · Structure/Content · Undo/Redo · Working Copy/Published/History · Scope chip · Publish) |
| `web/components/admin/focusPanel/FocusPanelEditAffordances.tsx` | Hover/select outlines, insertion lines, drag handles, inline slot editor, card-type picker — overlaid on the real cards |
| `web/lib/metrics/focusPanelMetricBinding.ts` | Resolve a bound metric key via `fetchResolvedMetrics` for KPI cards |
| Tests (see §9) | unit + integration |

### Modified files (focus-panel subtree only — NOT protected)

| File | Change | Risk |
|---|---|---|
| `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | When flag on + `mode==='summary'`, derive from layout doc instead of `deriveOpportunityFocusPanelPresentation`; render edit affordances when in edit mode | Low (not protected) |
| `web/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts` | Export the hardcoded `SUMMARY_GRID`/card builders as the **fallback**; no behavior change when flag off | Low |
| `web/components/admin/focusPanel/FocusPanelCardRenderer.tsx` | Accept doc-driven card body via `SlotRenderer` (additive branch); existing archetype bodies remain | Low |
| `web/lib/layout/featureFlag.ts` | Add `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` (default **off**) | Trivial |
| `web/lib/layout/surfaceLayoutRegistry.ts` | Add `enrollment_focus_panel_summary` surface_key → `(opportunities, drawer, layout_key='focus_panel_summary')` + allowed section/card keys | Low |
| `web/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx` | Focus-panel layout dropdown filters `layout_key='focus_panel_summary'` rows (not drawer `default`) | Low (settings UI) |

### Files we will NOT touch (protected / out of scope)

`AdminEntityDrawer.tsx`, `web/components/admin/entity/*Drawer*`, `web/components/admin/opportunity/*`, `web/lib/admin/drawer/composedDrawerPayload/*`, `web/lib/adminV2/*RevealGate.ts`, `web/lib/adminV2/runtime/contract/*`, `*Queue*`, work-unit page. **`OpportunityDrawerVmRuntime.tsx` stays essentially untouched** — the focus-panel layout is loaded inside the focus-panel subtree (it already exposes `focus_panel_layout_id` via context).

---

## 4. Existing pieces to reuse (do not rebuild)

| Need | Reuse |
|---|---|
| Storage + versioning + publish | `entity_layouts`, `entityLayoutsRepo.ts`, `/api/admin/entity-layouts/*`, `layoutEditorPublishWorkflow.ts`, `adminv2:entity-layout-published` cache-bust event |
| Layout resolution + pinning | `resolveLayoutForOrg`, `pinnedEntityLayoutId` plumbing, `resolveEffectiveProductionLayoutDoc` (fallback pattern) |
| Doc edit ops | `builderOps.ts` (`makeId`, add/move/remove section/item) |
| Field catalog (Data Browser) | `/api/admin/entity-layouts/field-catalog`, `fieldCatalog.ts`, `fieldDefToCatalog` |
| Primary contact / children resolution | `resolveOpportunityPrimaryContactPerson`, `normalizeLayoutRuntimeChildRow`, `mapRawInquiryChildrenToDrawerRows` |
| Renderers/formatters | `StatusBadge`, `adminFormatters`, `MetricKpiCard`, avatars, collection widgets |
| Metrics | `fetchResolvedMetrics`, `/api/admin/metrics/resolve` |
| Actions | `CANONICAL_ACTION_REGISTRY`, existing `CardFooterAction` |
| Card shell | `UniversalCard`, `FocusPanelCardRenderer` (unchanged renderer = visual parity) |

---

## 5. Compatibility layer

- **Flag-gated fork:** `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` off → today's hardcoded `SUMMARY_GRID` exactly. On → doc-driven; if no published `focus_panel_summary` doc resolves, **fall back to the code-built default doc** (`buildFocusPanelSummaryDefaultDoc`), which reproduces today's layout. No "blank" state ever.
- **Card vocabulary bridge:** the catalog maps each `section.key` (card type) → an existing `FocusPanelCardArchetype` so `UniversalCard` keeps rendering identically.
- **Renderer bridge:** `SlotRenderer` reads `renderHint`/`displayType` (extending the editor display map to wire `money` + relationship/collection/kpi, which are partially unwired today).

---

## 6. Edit Mode plumbing (doctrine-compliant)

- **Entry:** `?edit=1` on the operator work-unit record URL (parsed in the focus-panel subtree only; `parseOperatorWorkUnitPath` extended for query). `?edit_mode=structure|content` sub-state. No new route; no `focus-panel-builder`.
- **The runtime is the editor:** `OpportunityFocusPanelModeGrid` renders the **same** cards; `FocusPanelEditBar` + `FocusPanelEditAffordances` overlay edit controls. Reveal/open path untouched.
- **Structure Mode:** add (insertion line + card-type picker), reorder (drag), remove, resize/span — mutate the working-copy doc via `builderOps`.
- **Content Mode:** click a slot → inline editor → Data Source Browser (field catalog) + `SlotRenderer` picker + label + conditions.
- **Working copy / publish:** `useFocusPanelEditSession` forks a draft (`duplicate` if editing a published doc), auto-saves via `PATCH`, `POST .../publish` → new version; History/Restore via existing repo ops. Cache-bust fires the existing published event so the live runtime re-resolves.

---

## 7. Data binding & renderer contracts (slice scope)

| Renderer | Accepts (Presentation Type) | Source for slice |
|---|---|---|
| Text | Text | canonical field |
| Status Pill | Status | canonical status |
| Date | Date | canonical date |
| Money | Money | canonical money (verify billing fields, §11) |
| Relationship Summary | Entity | `resolveOpportunityPrimaryContactPerson` (Primary Contact → name/email/phone) |
| Collection List | Collection\<Child\> | `_inquiry_children` → name/age/room |
| KPI Card | Metric | `enrollment.tour_conversion_rate` (org-scoped) |
| Action Button | Action | `CANONICAL_ACTION_REGISTRY` key in card footer |

Binding is validated by Presentation Type (renderer-contract doctrine); incompatible renderers are disabled in the picker.

---

## 8. Reveal / performance safety (protected infrastructure)

- All changes are **downstream of drawer-open reveal** (card composition), inside `focusPanel/**` — not in the protected gate files.
- **Do not** alter `drawerOpen`, `evaluateComposedDrawerPayload`, `*RevealGate`, runtime contracts, cache keys, or queue empty semantics.
- No editing-only skeletons; no layout shift entering/exiting edit mode (the Edit Bar overlays; cards keep position).
- We will still **run the full protected test suite + `tsc`** as a regression guard (§9), per the AdminV2 doctrine, even though we avoid protected files.

---

## 9. Tests

**New unit/integration:**
- `deriveFocusPanelCardsFromLayoutDoc` — doc → card models + grid; fallback when no doc.
- `resolveSlotValue` — canonical / relationship (primary contact) / collection (children) / metric.
- `evaluateLayoutCondition` — visible / highlighted / read-only predicates; null-safety (no false hides).
- `SlotRenderer` — each renderer renders expected output; incompatible type rejected.
- Edit session — fork draft → autosave → publish → re-resolve renders published doc (the **loop** test).
- Renderer/visual parity — doc-default vs hardcoded `SUMMARY_GRID` produce equivalent card set (snapshot).

**Regression (must pass, per doctrine):**
```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
cd web && npx tsc --noEmit
```

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Touching the live opportunity Focus Panel regresses reveal | Stay in `focusPanel/**`; flag default off; run protected suite + manual smoke |
| `surface='drawer'` overload collides with drawer body | Distinct `layout_key`; focus-panel path requests it explicitly; resolver guard test |
| Visual drift (editing vs published) | Same renderer for both; parity snapshot test |
| OIP metric is org-scoped, not per-record | Slice binds an org-scoped enrollment metric; documented; per-record metrics are future work |
| Billing/Enrollment card data fields may not exist | Verify canonical fields (§11); fall back to empty-state cards if absent — does not block criteria 5–7 |
| Condition evaluator could create false-empty hides | `evaluateLayoutCondition` honors known-empty (missing ≠ empty); unit-tested |
| Scope creep into dashboard/POS/forms | Hard scope guard: Focus Panel Summary + Enrollment only |

---

## 11. Decisions needed before implementation

1. **Storage:** approve **reuse `surface='drawer'` + `layout_key='focus_panel_summary'` (no migration)** vs. add `surface='focus_panel'` (small CHECK migration). *Recommendation: no migration.*
2. **KPI metric:** approve binding an **org-scoped** metric (`enrollment.tour_conversion_rate`) for the KPI card, since no per-enrollment-record metric exists yet. *Recommendation: yes for the slice.*
3. **Billing/Enrollment cards:** confirm whether canonical billing/enrollment fields exist on the opportunity to bind, or accept empty-state cards for those two in the slice. *(Quick verification task before build.)*
4. **Edit entry:** approve `?edit=1` on the work-unit record URL as the in-context entry (vs sessionStorage). *Recommendation: URL, for shareability.*

---

## 12. Phased build order (proves the loop incrementally)

1. **Read path (operate):** flag + `buildFocusPanelSummaryDefaultDoc` + `deriveFocusPanelCardsFromLayoutDoc` + `SlotRenderer` + `resolveSlotValue` → Summary renders from the default doc, visually identical. *(Criteria 1, 5, 6.)*
2. **Metric + conditions:** KPI binding + `evaluateLayoutCondition`. *(Criteria 7, 8.)*
3. **Edit Mode (configure):** `?edit=1`, Edit Bar, structure (add/reorder/remove/resize) + content (inline slot/renderer/field edit). *(Criteria 2, 3, 4.)*
4. **Publish + reopen (loop):** working-copy fork → autosave → publish → reopen renders published doc. *(Criteria 9, 10.)*
5. **Revise → publish again:** second pass proves `configure → publish → operate → revise → publish`.

Each phase is independently shippable behind the flag and independently testable.

---

## 13. Success criteria → coverage map

| # | Criterion | Covered by |
|---|---|---|
| 1 | Open Enrollment Summary Focus Panel | Phase 1 (existing runtime) |
| 2 | Enter Edit Mode on the real surface | Phase 3 (`?edit=1`, Edit Bar) |
| 3 | Add/reorder/remove cards | Phase 3 (Structure Mode + `builderOps`) |
| 4 | Edit card content inline | Phase 3 (Content Mode) |
| 5 | Bind slot/renderer to a canonical field | Phase 1 (`resolveSlotValue` canonical) |
| 6 | Bind through relationships (contact / children) | Phase 1 (`resolveOpportunityPrimaryContactPerson`, children) |
| 7 | Bind one OI metric into a KPI renderer | Phase 2 (`fetchResolvedMetrics` + KPI Card) |
| 8 | Simple conditions (visible/highlighted/read-only) | Phase 2 (`evaluateLayoutCondition`) |
| 9 | Publish a working copy | Phase 4 (existing publish API) |
| 10 | Reopen workspace → renders from config | Phase 4 (resolve published doc) |

---

**Next step:** review §11 decisions. On approval, implement Phase 1 first behind `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` (default off) and validate visual parity before proceeding.
