---
owner: operator
status: canonical
last_reviewed: 2026-08-12
supersedes: []
---

# Drawer Sunset & Focus Panel Convergence Roadmap

**Status:** COMPLETE (August 2026). Kept as the record of how the position was reached.

> **The sunset is finished.** `AdminEntityDrawer` and both runtimes it mounted are deleted; no
> operator path can produce the record overlay. Steps 9–12 of the sequencing below are done, and the
> "Search & queue destination intent" table is no longer intent — every row of it is live and
> browser-certified. The freeze rule outlived its purpose: there is nothing left to freeze.
>
> The capabilities the deletion stranded are mounted or retired with evidence —
> [`post-drawer-capability-convergence.md`](./post-drawer-capability-convergence.md).
>
> Current state and the platform rules it established: [`drawer-system.md`](./drawer-system.md).
> Caller-by-caller inventory: [`drawer-product-eradication-inventory.md`](./drawer-product-eradication-inventory.md).

**Source material:** Card System Discovery Audit + Drawer Sunset & Focus Panel Convergence Audit.
**Companion code plan:** `../../sprints/archive/06_2026/platform_simplification_phase3_drawer_deletion_audit.md` (historical: `../../sprints/archive/06_2026/platform_simplification_phase3_drawer_deletion_audit.md`) (legacy monolith deletion — a **separate track** from card convergence).

This doc locks the product position: **the Focus Panel is the operator surface; the drawer is reveal/open-state infrastructure.** It exists so future implementation does not keep investing in legacy drawer / tab / LayoutDoc-overview behavior.

---

## Decision

| Position | Statement |
|---|---|
| 1 | **Focus Panel is the canonical operator surface.** Operators work in the Focus Panel, never "in a drawer." |
| 2 | **The drawer shell remains** as reveal / open-state infrastructure (one `AdminDrawerContext` open-state primitive; one shell). |
| 3 | **Drawer / tab overview is legacy compatibility** — the non-Focus-Panel body path (tabs + `OpportunityDrawerOverviewBody`). |
| 4 | **LayoutDoc drawer authoring is transitional** and must not receive new product investment. |
| 5 | **Universal Cards absorb drawer sections over time** — sections become cards, not the reverse. |
| 6 | **Operational editing must move into Focus Panel cards** (inline card edit, focused card state, card detail, action modal, embedded workspace). |
| 7 | **Search and queue opens should target Focus Panel card states**, not generic drawer tabs. |
| 8 | **Person/Child Focus Panel bodies are required** before drawer UX can be fully retired. |
| 9 | **Lead summary blueprint and drawer overview config paths are legacy** after Focus Panel parity. |
| 10 | **Experience Builder configures card-composed surfaces**, not drawer sections. |

These positions are consistent with [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) (lexical layers) and [`drawer-system.md`](./drawer-system.md) (infrastructure matrix). This roadmap adds the **sunset status** and **freeze rule** those docs reference.

---

## Sunset status matrix

| Area | Current role | Future role | Status |
|---|---|---|---|
| Drawer shell (`Drawer.tsx`) | Reveal / open-state infrastructure | Action-modal chrome only — never a record surface | **Infrastructure** |
| Opportunity Focus Panel | Canonical operator surface | Keep / invest | **Canonical** |
| Opportunity tab overview | Legacy fallback | Retire after card editing parity | **Transitional** |
| LayoutDoc drawer sections | Operational edit stack | Migrate behavior into cards | **Transitional** |
| Lead summary blueprint | Duplicate top-of-record config | Archive after parity | **Legacy** |
| Person Focus Panel | Canonical operator surface | Invest (card editing substrate) | **Canonical** |
| Child Focus Panel | Canonical operator surface | Invest (card editing substrate) | **Canonical** |
| Location operating surface | Settings Configuration Mode | `/settings/locations` canonical | **Canonical** |
| AdminEntityDrawerLegacy | Legacy monolith | **Deleted** July 2026 | **Removed** |
| `AdminEntityDrawer` + both VM runtimes | Modal record product | **Deleted** August 2026 | **Removed** |
| Focus Panel Universal Cards | Future card runtime | Invest | **Canonical** |

---

## Freeze rule (doctrine)

> **No new operator-facing product behavior** should be added to **drawer overview**, **drawer tabs**, **lead summary blueprint**, or **`entityPresentation` drawer surfaces** unless it is required as **temporary compatibility**. New behavior should be specified as **Focus Panel card behavior**.

Applies to (do not invest):

- `OpportunityDrawerOverviewBody` / `OpportunityDrawerInquiryWorkflowOverview` and tab overview body.
- Drawer LayoutDoc authoring at `/settings/layouts` (drawer surfaces).
- `leadSummaryCardBlueprint` / `LeadSummaryCardBlueprintEditor`.
- `entityPresentation.ts` drawer surface definitions.
- Drawer summary card family (`LeadOperatingSummaryCard` and Lead/Person/Child summary variants) as a config target.

Allowed (compatibility only): bug fixes, reveal/performance integrity, and parity scaffolding that the Focus Panel reuses (e.g. `OpportunityDrawerVmTabPanes` consumed by Activity mode).

---

## Editing gap note (highest-risk blocker)

When **`focusPanelActive`** is enabled, `OpportunityDrawerVmRuntime` renders `OpportunityFocusPanelModeBody` **instead of** the LayoutDoc overview body. As a result the entire `LayoutRuntime*` operational edit stack — `LayoutRuntimeBlockEditProvider`, `LayoutRuntimeInlineEditFieldControl`, `LayoutRuntimeDrawerEditProvider`, the `drawerOperatingSaveCoordinator` Save-All flow, `EditablePersonContactCard`, `OpportunityInquiryChildrenSection`, and relationship-action buttons — is **not mounted**.

**Therefore the Focus Panel is currently read-only for most operational data.** Per [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md), edit mutations are a deferred phase.

The next implementation priority is **not "more cards."** It is the editing/interaction substrate, in order:

1. Focus Panel **card expansion** (runtime, not just config model)
2. **Focused item state** (selected child / contact / document / task)
3. **Card-level actions** (section / row / contact actions on cards, not header-only)
4. **Inline operational editing** (port the `LayoutRuntime*` edit behavior into cards)
5. **Save / dirty behavior** (wire card edit sections into a save coordinator)
6. **Collection editing** (household contacts, inquiry children)

---

## Next implementation target

> Doctrine lock only — listed here so the first build sprint inherits the priority. No code in this sprint.

### First editable card: **Household Card**

> **Frozen design:** [`household-reference-card.md`](./household-reference-card.md) (Identity archetype reference — all states/densities, interaction + performance models). Cards build against the [`operational-context-boundary.md`](./operational-context-boundary.md) spine (Queue → Operational Context → Focus Panel → Cards), not "drawer".

Proves the hardest drawer migration path:

- primary contact
- phone / email
- household contacts
- make primary contact
- add contact
- relationship actions
- focused contact state
- inline editing
- dirty / save behavior
- search-to-contact focus

### Second card: **Children Card**

Proves:

- selected child state
- per-child expansion
- child data editing
- OCM / program / schedule fields
- search-to-child focus
- collection editing

---

## Search & queue destination intent (forward target)

Documented as intent only (see audit Deliverable 7); not implemented here.

| Open | Future destination |
|---|---|
| Child search | Focus Panel — Children card expanded, selected child focused |
| Parent/contact search | Focus Panel — Household/Contacts expanded, selected contact focused |
| Lead/enrollment search | Enrollment Focus Panel Summary |
| Task search | Focus Panel — Current Work / Tasks focused |
| Document search | Focus Panel — Documents focused |
| Communication search | Focus Panel — Communications / Activity focused |
| Location search | Location operating surface (not generic drawer) — currently **Unresolved** |
| Queue row open | Focus Panel card context (not generic drawer tabs) |

Search seeds today carry only `presentation_emphasis` (`child_lifecycle`, `guardian_communication`); a card-focus/selection seed does not exist yet.

---

## Sequencing (high-level)

1. Freeze drawer feature development (this doc).
2. Mark drawer runtime legacy in docs (this lock).
3. Define Focus Panel card parity requirements (editing gap note above).
4. Implement Household card parity (first target).
5. Implement Children card parity (second target).
6. Implement relationship/contact editing on cards.
7. Implement Activity parity (real `workflow` / `audit` bodies).
8. Build Person/Child Focus Panel bodies.
9. Redirect search destinations to card states.
10. Redirect queue row open behavior to Focus Panel contexts.
11. Fold drawer LayoutDoc authoring into Experience Builder card composition.
12. Archive drawer code after parity (coordinate with Phase 3/4 monolith deletion plan).

**Gate:** legacy-entity drawers (location, job, etc.) have neither a Focus Panel path nor a migration target today; they gate the final archive step and `location drawer` remains **Unresolved**.

---

## Related

- [`drawer-system.md`](./drawer-system.md) — infrastructure matrix (legacy naming)
- [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) — lexical layers
- [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md) — edit law (cards summarize; expansions/drills edit)
- [`universal-card-system.md`](./universal-card-system.md) — composition primitive
- [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) — surface authoring (LayoutDoc drawer authoring = transitional)
- [`archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](../../archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) — unifying presentation umbrella
- [`queue-system.md`](./queue-system.md) — queue opens Focus Panel contexts
- `../../sprints/archive/06_2026/platform_simplification_phase3_drawer_deletion_audit.md` (historical: `../../sprints/archive/06_2026/platform_simplification_phase3_drawer_deletion_audit.md`) — legacy monolith deletion track
