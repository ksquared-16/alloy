---
owner: platform
status: canonical
last_reviewed: 2026-07-24
supersedes: []
---

# Organization Configuration — Product Realization Closeout

**Status:** Canonical closeout (2026-07-24). This document formally closes the Organization Configuration **product realization** sprint. UI and interaction language for the seven Organization domains listed below are **complete and stable** for operator configuration. What remains is **runtime convergence, deferred domains, and implementation sprints** — not a redesign of the realized product surfaces.

**Companion artifacts:**

- Platform doctrine — [`../operator/configuration-workspace-platform-doctrine.md`](../operator/configuration-workspace-platform-doctrine.md)
- Control plane — [`../modules/configuration-platform.md`](../modules/configuration-platform.md)
- Per-domain product UI — [`../operator/access-product-ui.md`](../operator/access-product-ui.md), [`../operator/business-processes-product-ui.md`](../operator/business-processes-product-ui.md), [`../operator/surfaces-product-ui.md`](../operator/surfaces-product-ui.md), [`../operator/data-model-product-ui.md`](../operator/data-model-product-ui.md)
- Organization Runtime V2 contract — [`../../system/organization-configuration-runtime-v2.md`](../../system/organization-configuration-runtime-v2.md)

---

## Completed product summary

Organization Configuration product realization is **complete** for seven domains. Each domain shares the same operator spine:

**Collection → Selected object → Focused workspace**

with **embedded editing** (no detached builders as the primary journey), **overview-before-edit** on object workspaces (read-first posture before intentional edit modes), and a **shared configuration visual language** inherited from the Locations reference implementation and Configuration Runtime primitives.

| Domain | Route | Realized posture |
|--------|-------|------------------|
| **Programs & Locations** | `/organization/programs-locations` (Programs `/organization/programs`, Locations `/organization/locations`) | Grouped landing; Programs consumes publishable Collection/Detail Runtime (Overview-first, explicit publication); Locations remains the frozen reference workspace (child objects, Attention/Setup, nested master/detail). |
| **Financials** | `/organization/financials` | Grouped landing; Catalog, Policies, and GL Codes use Collection → selected workspace; Tuition Plans retain chapter deep links under Financials. |
| **Access** | `/organization/access` | Users · Roles · Access Scopes · Security; Collection → Selected object → Focused workspace with Overview-first tabs; existing invite/scope APIs wired; identity/auth runtime deferred. |
| **Business Processes** | `/organization/processes` | Collection rail → Selected Process → Overview-first workspace (Stages, Work Views, Actions, Automation, Health, History); existing lifecycle board rehosted, not rewritten. |
| **Surfaces** | `/organization/surfaces` | Category landing → Collection → Selected Surface; **Edit-first** (no Overview tab); embedded builders; collapsible inspector (default collapsed); Save/Publish/Undo/Reset on tab row; publication posture in collection list. |
| **Data Model** | `/organization/data-model` | Entity-centric (no category rail); Entity selector → selected Entity workspace (Overview, Vocabulary, Fields, Relationships, Status, History); child objects use Definition · Usage · History; Usage on fields/option sets links to Surfaces (Focus Panels, Queue Rows). Operational Calculations remains a deep-link compat pane only. |

Legacy `/settings/*` paths redirect to the canonical `/organization/*` routes where productized. Compatibility redirects must not render a second canonical page.

---

## Architectural decisions that are now canonical

These decisions are binding for future Organization Configuration work. Domains may differ in **owned concerns and substrate**; they may not invent a parallel configuration experience.

1. **Collection → Selected → Focused workspace** — Every Organization domain selects an object from a collection rail (or category landing that resolves to a collection), then works inside that object's focused workspace. No category-rail fetch waterfalls; no detached full-bleed builders as the primary journey.

2. **Embedded editing** — Surface builders, field/relationship/status editors, and lifecycle boards render **inline** inside the selected-object workspace. Deep links may open a specific tab or editor mode, but the collection rail and workspace shell stay mounted.

3. **Overview-before-edit** — Object workspaces default to a read-first posture (Overview tab, or Overview regions inside the first tab) before the operator enters intentional edit modes. Surfaces is the deliberate exception: operators configuring presentation compose in **Edit-first** posture because the builder *is* the primary work surface.

4. **Shared configuration visual language** — Compact grouped landings, `ConfigObjectHeader`, horizontal concern tabs, `ConfigWorkspaceTabBar`, collection rails, planned-capability empty states, and Configuration Runtime workspace primitives are inherited — not re-invented per domain.

5. **Entity-centric Data Model** — Data Model is organized by **Entity**, not six parallel category products (Entities · Fields · Statuses · Option Sets · Relationships · Operational Calculations). Fields, statuses, option sets, and relationships resolve inside the selected Entity. Operational Calculations is deferred and reachable by deep link only.

6. **Surfaces: Edit-first, collapsible inspector, tab-row chrome** — Selecting a Surface opens **Edit** directly. Builder inspectors use `SurfaceBuilderInspectorRail` (default collapsed). Save, Publish, Undo, and Reset register on the workspace tab row via `SurfaceEditTabActions`; publication posture appears on collection rows. Assignments, Versions, Health, and History remain truthful Planned surfaces where no authoritative data exists yet.

---

## Deferred (future sprints — no implementation now)

1. **Operational Calculations & Commands Product Realization** *(recommended next)* — Entity workspace shell exists; formula/registry authoring, command catalog, and operator-facing calculation product remain deferred. "Automation" is not long-term product language; **Commands** is.

2. **Commands** — Command catalog, authoring, and execution product (replacing Automation as operator language when implemented).

3. **Settings Runtime Convergence — remaining certification** — Route composition under `/organization`, eliminate configuration fetch waterfalls, and first-paint readiness for domains that still client-primary-load or refetch after SSR seed (documented Surfaces runtime gaps).

4. **Access implementation** — Identity, login, users/providers, sessions, MFA, audit, and authorization pipelines. **Access UI is realized**; runtime binding is deferred.

5. **In-context Surface authoring** — Process → Work Unit → Manage → Edit Experience (authoring Surfaces from operational context, not only from Organization → Surfaces).

---

## Risks / intentional gaps

Honest gaps carried forward from Data Model and adjacent domains (see [`../operator/data-model-product-ui.md`](../operator/data-model-product-ui.md)):

- **Field usage depth** — per-field usage for platform-catalog and computed fields is not tracked; Usage reports visibility for configured fields and states limits plainly.
- **History** — no audit trail yet for entity labels, field definitions, option sets, status definitions, or relationship terms; History tabs are planned empty states.
- **Operational Calculations** — not promoted in Entity IA; compat embed only.
- **Surfaces runtime certification** — Focus Panel Summary client refetch, Workspace Header client-primary load, and builder/runtime seams for Work Unit Header and Operational Intelligence are documented, not fixed in the UI sprint.
- **Access runtime** — Effective Access, Experience Access, MFA, sessions, SSO, Audit Log, and Person ↔ User linking are UI-decided / Planned.
- **Business Processes** — Automation authoring, configuration-history events, and per-location availability overrides are Planned.

These are **intentional** deferrals, not oversights. Do not fabricate data or claim shipped behavior until wired through server-authoritative paths.

---

## Suggested next sprint

**Operational Calculations & Commands Product Realization**

Bring Operational Calculations out of the Data Model compat pane and establish the Commands product surface with the same Collection → Selected → Focused workspace language. This is the natural successor: Data Model entity work is realized; calculation and command authoring are the largest remaining Organization gaps without reopening the realized domains above.

---

## When this doc must be updated

A realized domain materially changes its interaction model; a deferred item ships; a new Organization domain adopts (or deviates from) the platform; or the recommended next sprint changes.
