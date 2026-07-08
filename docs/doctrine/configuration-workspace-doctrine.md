# Alloy Configuration Workspace Doctrine

**Status:** Active — July 2026  
**Reference implementation:** Settings → **Data Model** (`/settings/fields`)

The Data Model workspace is the **canonical reference** for how Alloy Configuration workspaces should look, feel, and behave. Future configuration areas — Surface Builder, Business Processes, Processing, Documents, Communications, Automation — should adopt this grammar unless a domain-specific exception is documented.

This doctrine covers **interaction and visual language only**. It does not change the field platform, capability engine, resolver registry, computed fields, or business process integration.

---

## Purpose

Operators should never feel like they are configuring a database.

They should feel like they are **describing how their organization works**.

Every interaction reinforces that.

Configuration workspaces should feel:

- **Calm** — compact hierarchy, no nested cards, no modal-driven CRUD
- **Trustworthy** — availability derives from the platform; honest Future states
- **Premium** — Bend Pine accents, soft hovers, consistent iconography
- **Fast** — inline expand/edit/create; no navigation away

---

## Core principles

### Overview summarizes. Tabs edit.

The Overview tab answers **“What is this entity?”** — relationships, field counts, and where data is used. It does not duplicate editing workflows. All mutation lives in the editing tabs (Relationships, Fields).

### Business concepts first. Implementation details only under Advanced.

Operators work with field names, categories, types, descriptions, and status. Internal keys, surface placement, and capability details stay behind **Advanced** on **edit** — never during creation.

### Categories are entity-owned organizational primitives

Categories belong to **one entity at a time**. Person never shows Child Medical; Location never shows Enrollment.

Each entity has default category seeds (Identity, Contact, …) scoped in `configurationCategoryCatalog.ts`. Org-specific labels and ordering come from `field_section_definitions` via `GET /api/admin/field-sections`.

**Categories tab** is the management surface: view, create, rename, archive, reorder. Fields **consume** categories — category creation does not belong in field creation.

Categories are reused across **Forms**, **Processing**, **Surface Builder**, **Documents**, **Search**, **Reports**, and future configuration workspaces.

---

## Workspace hierarchy

```
Platform Configuration header
↓
Entity / object context (compact)
↓
Tabs: Overview · Relationships · Categories · Fields
↓
Category groups (entity-owned business language)
↓
Compact rows
↓
Inline expand (view / edit / create)
↓
Availability (derived, read-only — only when unavailable)
```

Everything stays inside one workspace.

**Computed fields** are an ownership type within Fields (Platform · Custom · Computed filters) — not a separate tab. Operators cannot configure computed fields today; a dedicated tab would imply a workflow that does not exist.

---

## Interaction grammar

| Pattern | Rule |
| --- | --- |
| **Rows** | Fields and relationships are compact rows — not cards |
| **Expand** | Click Edit / View → row expands inline |
| **Create** | Add inserts a temporary inline create row at the top of the relevant list |
| **Save** | Collapses row; Cancel restores |
| **No drawers** | No legacy configuration drawers in Configuration workspaces |
| **No modals** | Avoid modals unless unavoidable (confirm delete is acceptable) |
| **No routes** | No navigation to legacy configuration pages for ordinary edit |

Shared components (reusable Configuration Workspace framework):

| Component | Path |
| --- | --- |
| `ConfigurationCategoryHeader` | `web/components/adminV2/configuration/ConfigurationCategoryHeader.tsx` |
| `ConfigurationCategoryCreateRow` | `web/components/adminV2/configuration/ConfigurationCategoryCreateRow.tsx` |
| `ConfigurationStatusToggle` | `web/components/adminV2/configuration/ConfigurationStatusToggle.tsx` |
| `ConfigurationAdvancedToggle` | `web/components/adminV2/configuration/ConfigurationAdvancedToggle.tsx` |
| `ConfigurationCategoryRow` | `web/components/adminV2/configuration/ConfigurationCategoryRow.tsx` |
| Category catalog + entity seeds | `web/lib/adminV2/configuration/configurationCategoryCatalog.ts` |
| Inline editor shell (~768px centered) | `CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS` |
| Row shell + hover grammar | `web/lib/adminV2/configuration/configurationWorkspaceOperatorUi.ts` |

Data Model consumes these; it does not own them. Domain-specific copy lives in `web/lib/fields/dataModelWorkspaceOperatorUi.ts`.

Future configuration pages should adopt:

- inline editing
- inline creation
- business-first language
- categories
- one-workspace interaction model
- advanced implementation details hidden by default

---

## Operator language

### Never ask for implementation details during creation

| Create flow | Edit + Advanced only |
| --- | --- |
| Field name | Internal key (read-only or auto-generated) |
| Category | — |
| Field type | — |
| Description | Help text |
| Status | — |

Relationship create: label, kind, description, status — key behind Advanced.

### Categories (not Sections)

**Category** is the operator-facing organizational language.

Examples: Identity, Contact, Enrollment, Health, Medical, Requirements, Attendance, Scheduling, Communications, Billing, Licensing, Transportation, Behavior, Nutrition, Custom.

API/storage may still use `section_key`; UI says **Category**.

### Status (not visibility flags)

Operators set **Status**:

- **Active** — field is part of the organization model
- **Hidden** — field is inactive (`is_active: false`)

**Availability** (Forms, Drawers, Focus Panel, Queue Rows, Business Processes, etc.) is **derived** from the canonical field platform capability engine — not configured with checkboxes in the Data Model workspace.

**Silence is success:** collapsed rows show availability only when something is unavailable (e.g. “Needs Child Context”, “Runtime-only”). Do not show availability counts on normal rows.

### Relationships

Use **business connection language**, not API grains:

- Family member
- Household contact
- Child contact
- Household
- Lead / enrollment

**Platform relationships** explain what they are, why they exist, and where they are used. View-only.

**Custom relationships** explain: created by your organization, available throughout Alloy.

**Person roles** (Parent, Guardian, Emergency contact, Pickup contact, Billing contact) are roles on Person — **not separate entities**. The Relationships tab teaches this explicitly.

### Platform vs Custom

| Kind | Behavior |
| --- | --- |
| **Platform relationships** | Structural model (Parent/Guardian, Family, Enrollment, Documents). View-only in Data Model. |
| **Custom relationships** | Tenant vocabulary (family roles, person connections). Inline create + inline edit. |

Do not mix platform and custom in one undifferentiated list.

### Ownership chips

Quiet chips on rows:

- **Platform** — neutral stone
- **Custom** — Bend Pine tint
- **Computed** — subtle violet

---

## Visual grammar

- **Bend Pine** — primary actions, selected states, category rails, available badges
- **No new colors** — lean on existing Alloy tokens
- **Category headers** — `┃ Identity` style via left Bend Pine rail
- **Row hover** — soft Bend Pine wash + inset left accent; Edit fades in on hover
- **Row density** — Surface Builder rhythm (~35% tighter than legacy admin spacing)
- **Relationship rows** — full-width row, constrained content width; implementation detail in expanded state
- **Buttons** — Primary (Bend Pine) · Secondary (outline) · Ghost (Edit/View) · Danger text (Delete)

Reference: Surface Builder row rhythm.

---

## Reusable Configuration Workspace framework

Import from these paths — do not duplicate in domain workspaces:

| Primitive | Path |
| --- | --- |
| Category header (Bend Pine rail) | `@/components/adminV2/configuration/ConfigurationCategoryHeader` |
| Category create (inline) | `@/components/adminV2/configuration/ConfigurationCategoryCreateRow` |
| Status toggle (Active / Hidden) | `@/components/adminV2/configuration/ConfigurationStatusToggle` |
| Advanced disclosure | `@/components/adminV2/configuration/ConfigurationAdvancedToggle` |
| Category catalog + labels | `@/lib/adminV2/configuration/configurationCategoryCatalog` |
| Row hover + ghost Edit grammar | `@/lib/adminV2/configuration/configurationWorkspaceOperatorUi` |
| Ownership chips | `configurationOwnershipChipClass()` |
| Key slugify helper | `slugifyConfigurationKey()` |
| Unavailable-only row hint | `configurationFieldUnavailableHint()` |

Button hierarchy: Primary (Bend Pine) · Secondary (outline) · Ghost (Edit/View) · Danger text (Delete).

## Data Model as reference

When building a new Configuration workspace:

1. Start from Data Model workspace components under `web/components/admin/fields/DataModel*`
2. Reuse `ConfigurationCategoryHeader`, `ConfigurationStatusToggle`, row shell classes
3. Keep Overview → Objects → Inline editing structure; availability only when blocked
4. Do not reintroduce legacy Settings field cards, drawers, or modals

---

## Intentional limitations (Data Model reference)

1. Platform field placement remains in Surface Builder
2. Reports builder shown as Future — not fake-available
3. Queue row hydration stays validator-gated
4. Computed fields are platform-defined (view-only) — filtered under Fields, not a separate tab
5. Full relationship vocabulary table management remains in Settings → Relationships for advanced ops

---

## Tests

```bash
cd web && npm run test -- tests/fields
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Doctrine-specific: `tests/fields/dataModelConfigurationDoctrine.test.ts`
