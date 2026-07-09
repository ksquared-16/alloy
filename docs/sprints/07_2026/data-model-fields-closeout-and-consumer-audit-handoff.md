# Data Model / Fields Sprint — Closeout & Consumer Audit Handoff

## FINAL STATUS

### Data Model Workspace

**Status: FROZEN**

Reference implementation for:

- **Configuration Workspace Doctrine**
- **Configuration Entity Catalog**
- **Canonical Field Platform**
- **Entity-owned Categories**
- **Inline Configuration Grammar**
- **Business-first terminology**

Consumer adoption starts after this merge. No additional standalone Data Model implementation work.

---

**Status:** **FROZEN** — July 2026 (clarification sprint complete; Field Platform Consumer Audit is next)  
**Workspace:** Settings → Data Model (`/settings/fields`) · Settings → Entities (`/settings/entities`)  
**Staging baseline:** `3068b53a2` — final Data Model QA hotfix on `origin/staging`

---

## Final QA hotfix (July 2026)

Last standalone Data Model sprint before consumer audit. Fixes only — no redesign.

| Issue | Fix |
| --- | --- |
| Industry selector noise | Hide when `industryOptions.length <= 1` (non-generic industries); restores automatically when multiple industries exist |
| Entities layout | Remove centered `CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS`; left-aligned full-width list matching Data Model rhythm |
| Entity label persistence (blocker) | `resolveConfigurationEntitySingularLabel` / `Plural` no longer hardcode `opportunity` / `location` to canonical labels; honor `EntityLabelsContext` effective map |
| Shared entity source | Entities workspace + Data Model rail both use `configurationEntityCatalog.ts` + `EntityLabelsContext` |

**Root cause (persistence):** `configurationEntityCatalog.ts` returned canonical strings for `opportunity` and `location`, bypassing org overrides saved via `PUT /api/admin/entity-labels` even though the API persisted correctly.

**Secondary hardening:** `entityLabelsResolve.ts` now includes org overrides not present in industry defaults in the `effective` array.

---

## Closeout statement

**Data Model is frozen.**

The Data Model workspace is the **canonical reference implementation** for the Configuration Workspace Doctrine. Future changes must come from the **Field Platform Consumer Audit**, not from standalone Data Model redesign sprints.

Any gap discovered during audit should be classified as:

1. **Consumer adoption issue** — Surface Builder, Forms, Processing, Business Processes, Documents, Focus Panel not yet adopting doctrine
2. **Field platform issue** — resolver, capability engine, metadata persistence layer
3. **Configuration Workspace doctrine issue** — only if audit proves the doctrine itself is wrong

Do **not** open another standalone Data Model implementation sprint unless doctrine is explicitly revised.

---

## Clarification sprint final status

| Layer | Status |
| --- | --- |
| **Data Model Workspace** | **FROZEN** |
| **Field Platform** | **ACTIVE** |
| **Configuration Workspace Doctrine** | **REFERENCE IMPLEMENTATION** |

Next phase: **Field Platform Consumer Audit**.

Data Model is frozen while Field Platform continues evolving through consumer adoption.

### Clarification sprint deliverables (July 2026)

| Deliverable | Outcome |
| --- | --- |
| Business vs Calculated vs Runtime Signal taxonomy | `web/lib/fields/fieldConceptModel.ts` + `docs/platform/modules/field-concepts.md` |
| Computed catalog audit (24 entries) | 3 Calculated (planned), 21 Runtime Signals |
| Ownership filter relabel | Platform · Business · Runtime Signals · Calculated |
| Availability noise reduction | Silence by default; only Archived, Hidden, Coming soon, Requires Child Context |
| Inline choice option management | `ConfigurationFieldOptionsEditor` on create/edit for select/multiselect |
| Calculated field builder | **Not implemented** — documented only |

---

## Final staging hash

```
3068b53a2
```

| Artifact | Hash |
| --- | --- |
| **Final QA hotfix** | `0499c9e20` — `fix(settings): finalize Data Model QA hotfixes` |
| **Feature merge** | `a504e075d` — merge `feat/data-model-final-qa-hotfix` |
| **Final staging** | `3068b53a2` — `origin/staging` tip after final QA hotfix promotion |
| Data Model merge | `cf1de3aa2` — merge `feat/data-model-qa-fixes` onto `0e72e3051` |
| Category picker QA | `3e0511a9e` — `fix(settings): Data Model category picker and reassignment QA` |
| Closeout handoff doc | `0482a6bb6` — `docs(sprint): Data Model closeout and consumer audit handoff` |
| Prior QA cleanup | `fc2b3a071` — `fix(settings): finalize Data Model QA cleanup` |
| IA sprint | `a560cc8b3` — `polish(settings): finalize Data Model information architecture` |

---

## Commits merged (Data Model sprint arc)

| Commit | Summary |
| --- | --- |
| `a560cc8b3` | Final Data Model information architecture — entity-owned Categories tab, compact rows, computed integrated into Fields ownership |
| `fc2b3a071` | QA cleanup — archived category behavior, presentation overrides for system fields, hide Advanced/internal key |
| `3e0511a9e` | Category picker + reassignment QA — active-only shared picker, grouping via persisted `section_key`, unrelated category exclusion |

Merge commits on staging include `feat/data-model-ia-sprint` and `feat/data-model-qa-fixes` (no-ff).

---

## What shipped

### Workspace hierarchy

```
Overview · Relationships · Categories · Fields
```

- **Overview** summarizes only — no duplicated editing
- **Relationships** — platform vs custom split, inline create/edit, business language
- **Categories** — entity-owned management (create, rename, archive, reorder)
- **Fields** — platform / custom / computed ownership filters; inline create/edit rows

### Configuration Workspace primitives (reusable)

| Primitive | Path |
| --- | --- |
| Category header | `web/components/adminV2/configuration/ConfigurationCategoryHeader.tsx` |
| Category row / create | `ConfigurationCategoryRow`, `ConfigurationCategoryCreateRow` |
| Status toggle | `ConfigurationStatusToggle.tsx` |
| Category catalog | `web/lib/adminV2/configuration/configurationCategoryCatalog.ts` |
| Row grammar | `web/lib/adminV2/configuration/configurationWorkspaceOperatorUi.ts` |
| Doctrine | `docs/doctrine/configuration-workspace-doctrine.md` |

Data Model **consumes** these; it does not own them.

### Operator UX

- Compact centered inline editors (~768px)
- Field create: Field Name · Category · Type · Description · Status — no Advanced, no internal key
- Field edit: same business-first surface; system fields allow presentation overrides only
- Availability: silence is success — only show when unavailable
- No legacy drawers, modals, or `EntityFieldsClient` in Data Model paths

---

## Data Model workspace rules

1. **Overview summarizes. Tabs edit.**
2. **Business concepts first** — no implementation language in create/edit flows
3. **Categories are entity-owned** — managed in Categories tab; Fields consume them
4. **Archived categories** — never selectable; fields referencing them stay visible under `· Archived` groups
5. **Platform/system fields** — presentation-editable (label, category, description); storage/type/resolver locked
6. **Computed fields** — ownership filter within Fields tab, not a separate tab
7. **Inline everything** — rows expand; no navigation away for ordinary edit
8. **Field lifecycle** — Active · Hidden · Archived · Delete-when-safe via compact row actions
9. **Entities page** — adopts Configuration Workspace row grammar; shares `configurationEntityCatalog.ts` with Data Model rail

---

## Field lifecycle rules (final controls sprint)

| Ownership | Active | Hidden | Archived | Delete |
| --- | --- | --- | --- | --- |
| **Platform** (`is_system`) | ✓ | ✓ (visibility flags) | ✗ | ✗ |
| **Custom** | ✓ | ✓ | ✓ | ✓ when safe |
| **Computed** | view-only | ✗ | ✗ | ✗ |

- **Hidden** — not offered for new builder/form/process usage; existing `field_values` remain
- **Archived** — `config.lifecycle_state: "archived"`; excluded from pickers; shown in Fields tab with status chip
- **Deleted** — only when `assessFieldDefinitionDeleteSafety` passes (field values, forms, drawer layouts scanned)

**Delete safety API:** `GET /api/admin/field-definitions/[id]/delete-safety`  
**Uncovered checks (documented):** focus panel, queue rows, business process requirements, documents/packets, processing mappings

**Key files:** `fieldLifecycleModel.ts`, `fieldDeleteSafety.ts`, `DataModelFieldRow.tsx`, `DataModelFieldsTab.tsx`

---

## Entity model (Entities workspace adoption)

| Hub key (internal) | Operator label | Labels API key |
| --- | --- | --- |
| `person` | Person | `persons` |
| `customer` | Family | `customers` |
| `inquiry_child` | Child | `customer_members` |
| `opportunity` | Lead / Enrollment | `opportunities` |
| `location` | Location / Site | `locations` |

**Shared catalog:** `web/lib/adminV2/configuration/configurationEntityCatalog.ts`  
**Entities workspace:** `web/components/adminV2/settings/entities/EntitiesWorkspaceClient.tsx`  
**Data Model rail:** `FieldEntityNav.tsx` uses same catalog resolver

Internal grains (`inquiry_child`, `customer_member`, `placement_candidate`) do not appear in operator UI.

---

## Field platform architecture (unchanged)

Data Model is a **consumer** of the field platform, not an extension of it.

| Ownership | Source | Data Model behavior |
| --- | --- | --- |
| **Platform** | Native columns + platform catalog | View-only unless `field_definitions` row exists (`is_system`) |
| **Custom** | `field_definitions` / `field_values` | Full inline edit (label, category, description, status, delete) |
| **Computed** | Runtime projections | View-only |

Catalog merge: `buildSettingsFieldCatalogEntries()` in `web/lib/fields/fieldCatalogForSettings.ts`  
Edit capability: `fieldRowEditCapability()`  
Grouping: `catalogEntrySectionKey()` — persisted `field_definitions.section_key` overrides platform catalog defaults

API guardrails: `FORBIDDEN_FOR_SYSTEM` on PATCH (`web/app/api/admin/field-definitions/[id]/route.ts`)

---

## Entity-owned category model

- Seeds per hub entity in `ENTITY_CATEGORY_SEEDS` (`configurationCategoryCatalog.ts`)
- Org labels/ordering from `field_section_definitions` via `GET /api/admin/field-sections`
- Picker: `buildActiveConfigurationCategoryPickerOptions(hubEntity, registry)` — active org rows + entity seeds only
- Unrelated entity seed keys excluded via `unrelatedEntityCategoryKeys()`
- Person never shows Child Medical; Location never shows Enrollment

---

## Archived category semantics

| State | Picker | Fields tab group | Categories tab |
| --- | --- | --- | --- |
| Active | Selectable | Normal group header | Visible |
| Archived + fields reference | **Not selectable** | `· Archived` marker, fields visible | Visible only if "Show archived" and `field_count > 0` |
| Archived + no fields | **Not selectable** | Group hidden | Hidden |

Field data is **never** auto-mutated on archive. Reassignment is explicit operator action.

---

## Configuration Workspace doctrine

Canonical doc: `docs/doctrine/configuration-workspace-doctrine.md`

Data Model is the **first consumer** and **reference implementation**. Future workspaces (Forms, Processing, Surface Builder, Documents, Search, Reports) should adopt:

- Inline editing / creation grammar
- Entity-owned categories
- Business-first operator language
- Advanced implementation details hidden by default
- One-workspace interaction model

---

## QA findings fixed

| Issue | Fix |
| --- | --- |
| Archived categories selectable in pickers | `buildActiveConfigurationCategoryPickerOptions`; archived seed exclusion; shared `activeCategoryOptions` for Add + Edit |
| Unrelated categories in Person picker | `unrelatedEntityCategoryKeys()` filter |
| Category change didn't move field | Platform entries merge `field_definitions.section_key`; `catalogEntrySectionKey()` for grouping; optimistic PATCH update |
| Edit Field used broader option source | Removed `draft.category_key` fallback option; coerce to first active category when field sits in archived group |
| Archived empty categories linger | Categories tab hides archived with `field_count === 0` |
| Advanced / internal key visible | Removed from field create/edit entirely |
| System field organization | `fieldRowEditCapability` presentation mode; API allows label/category/description only |

Regression tests: `web/tests/fields/dataModelQaFixes.test.ts`, `dataModelConfigurationDoctrine.test.ts`

---

## Known remaining gaps

1. **Pure platform-catalog fields** (no `field_definitions` row) — view-only; label/category override requires materialize-on-edit or metadata layer (field platform scope)
2. **Focus Panel composer test** — `dataModelFinishPass.test.ts` pre-existing failure (`availabilityConcept`); unrelated to Data Model freeze
3. **Consumer adoption** — Surface Builder, Forms, Processing, Business Processes, Documents, Focus Panel have not adopted entity-owned categories or Configuration Workspace grammar
4. **Relationship create** — internal key still behind Advanced (intentional per doctrine)

---

## Consumer audit plan

Compare Data Model reference against each consumer. Document gaps; do not redesign Data Model in isolation.

| Consumer | Audit focus |
| --- | --- |
| **Surface Builder** | Category headers, row density, inline grammar, availability hints |
| **Focus Panel** | Composer field library, inspector language, availability |
| **Forms** | Field picker vocabulary, category assignment, ownership chips |
| **Processing** | Category consumption, operator language |
| **Business Processes** | Field requirements picker, capability honesty |
| **Documents** | Field/category assignment surfaces |
| **Queue Rows** | Row field vocabulary, entity labels, preview column language |

For each gap, classify:

1. **Consumer adoption** → fix in consumer
2. **Field Platform** → fix in `web/lib/fields/**` or API
3. **Entity Model** → entity catalog, labels, or hub mapping
4. **Configuration Workspace Doctrine** → revise `configuration-workspace-doctrine.md` first

---

## Next recommended sprint

**Field Platform Consumer Audit Sprint**

- No new Data Model features
- Audit each consumer against doctrine checklist
- Produce gap matrix (consumer / platform / doctrine)
- Implement **consumer adoption** fixes only where audit proves consumer is wrong
- Defer platform-catalog metadata override to a separate field-platform ticket if audit confirms need

---

## Validation at closeout

```bash
cd web && npm run test -- tests/fields
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Expected: fields tests pass except pre-existing `dataModelFinishPass.test.ts`; typecheck clean.

---

## Key files (reference)

| Area | Path |
| --- | --- |
| Workspace client | `web/app/adminV2/settings/fields/DataModelWorkspaceClient.tsx` |
| Fields tab | `web/components/admin/fields/DataModelFieldsTab.tsx` |
| Field row / create | `DataModelFieldRow.tsx`, `DataModelFieldCreateRow.tsx` |
| Categories tab | `DataModelCategoriesTab.tsx` |
| Category catalog | `web/lib/adminV2/configuration/configurationCategoryCatalog.ts` |
| Field catalog merge | `web/lib/fields/fieldCatalogForSettings.ts` |
| Doctrine | `docs/doctrine/configuration-workspace-doctrine.md` |
