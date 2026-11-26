# Fields Registry and Surface Availability Audit

**Sprint:** 07/2026 — Alloy Fields Review  
**Status:** Active audit + UX correction  
**Branch:** `feat/fields-registry-audit-wt-p2os`

## Canonical field architecture

Alloy fields are **not** a single flat list. A field being in Settings → Fields means it exists in the org-scoped **`field_definitions`** registry (plus native column manifests for profile/enrollment grains). **Surface availability** requires the full stack:

| Layer | Source | Role |
|-------|--------|------|
| Registry | `field_definitions` API + entity manifests (`inquiryChildFieldRegistry`, `customerMemberFieldRegistry`, …) | Canonical key, label, type, section, visibility flags |
| Runtime resolver | `resolveLayoutRuntimeFieldControl`, `resolveChildProfileFieldValue`, queue row resolvers | Read/write at runtime |
| Publish allow-list | `queueRecordValidatorAllowList`, `platformFieldResolutionManifest` | What layouts/builders may reference |
| Builder library | `compositionFieldAdapter`, `formFieldRegistryPicker`, layout field-catalog API | What operators can pick |
| Render support | Drawer layout runtime, `QueueRecordFieldRenderer`, Forms schema | What actually displays |

**Operator entity grains (Settings → Fields tabs):**

| Operator label | Settings `entity` param | `field_definitions.entity_type` | Storage |
|----------------|-------------------------|----------------------------------|---------|
| Person | `person` | `person` | `persons` |
| Family | `customer` | `customer` | `customers` |
| Lead | `opportunity` | `opportunity` | `opportunities` |
| Child | `inquiry_child` | `inquiry_child` + `customer_member` | OCM + profile |
| Location | `location` | `location` | `locations` |

Internal terms (`inquiry_child`, `customer_member`, OCM, `placement_candidate`) remain in code and DB — **not** in operator UI.

## Surface availability model

**Single module:** `web/lib/fields/fieldSurfaceAvailability.ts`

Consumers:

- Settings → Fields cards (`FieldDefinitionSettingsCard`)
- Builder guardrails (`compositionFieldAdapter` filters through validator allow-list)
- Tests (`fieldSurfaceAvailability.test.ts`)

Surfaces tracked:

- **Forms** — `formFieldRegistryPicker` + visibility flags
- **Drawers** — layout picker + `tenantLayoutFieldPickerCatalog`
- **Tables** — `is_visible_in_table`
- **Queue rows** — `queueRecordValidatorAllowList` only (not aspirational)
- **Focus panel** — queue-resolvable refs + card evidence (profile config fields excluded)
- **Business processes** — lifecycle rule bindings
- **Documents** — same registry seam as Forms

Each unavailable surface includes an operator-readable **reason** (not a generic “unsupported” badge).

## Consumer map

| Consumer | Canonical source | Guard |
|----------|------------------|-------|
| Settings → Fields | `field_definitions` API | `fieldSettingsOperatorUi`, `childcareFieldCatalogDoctrine` |
| Forms builder | `buildFormSystemFieldPicker` | Registry-first; `customer_member` included for profile fields |
| Drawer / layout pickers | `field-catalog` API + `tenantLayoutFieldPickerCatalog` | `platformFieldResolutionManifest`, blocked ref keys |
| Queue Row builder | `compositionFieldAdapter` | `validatorAllowedQueueRecordFieldRefKeys` |
| Focus Panel builder | Same composition adapter + evidence groups | Namespace + validator filter |
| Business Process requirements | `fieldRegistryReferenceMatrix` + lifecycle bindings | Canonical ref only |
| Documents / packets | Forms registry binding | POS-F04 seam |

## Gender field audit (example)

| Question | Answer |
|----------|--------|
| **Stored where** | `field_values` on `customer_members.id` (`entity_type = customer_member`, `field_key = gender`) |
| **Configured where** | Settings → Fields → **Child** tab → Child profile section; seeded via `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST` |
| **Layout refKey** | `child.gender` |
| **Resolver** | `resolveChildProfileFieldValue`, layout runtime select via option set `person_gender` |
| **Drawer** | Available when registry row active + drawer visibility |
| **Forms** | Available via `customer_member` in `FORM_PICKER_ENTITY_TYPES` |
| **Queue rows** | **Not available** — not on `queueRecordValidatorAllowList`; builder filtered |
| **Focus panel** | **Not available** — profile config grain; cards use enrollment/work evidence |
| **Tables** | Follows `is_visible_in_table` on registry row |

Manifest entry added: `child.gender` in `platformFieldResolutionManifest` (`runtimePhase: now`).

## Settings → Fields UX

- Entity tabs: Person, Family, Lead, Child, Location (`SettingsEntityTabBar`)
- **Child** tab loads **two grains**: profile (`customer_member`) + enrollment (`inquiry_child`) via `ChildFieldsSettingsClient`
- Grouped **field cards** with refKey, type, section, availability badges, Configure action
- Trust copy on page shell; configuration pattern placeholder removed
- Operator labels from `CHILDCARE_FIELD_ENTITY_SINGULAR_LABELS` / `adminFieldEntityDisplayLabel` — **Child**, not Inquiry child

## Known gaps

1. **Person / Location legacy clients** — legacy routes still use table UI; AdminV2 hub now routes all entities through `EntityFieldsClient` card view.
2. **Native columns** (e.g. `first_name`, `dob`) — not `field_definitions` rows; shown via manifests/parity docs, not Settings cards yet.
3. **Focus panel** — no separate field picker catalog; shares queue composition namespaces; profile-only fields correctly excluded.
4. **`placement_candidate`** — layout anchor grain only; not a Fields hub entity.
5. **Business process “available”** — lifecycle-bound fields only; custom fields need explicit binding to appear as available.

## Next steps

1. Seed/read-only **native column cards** on Settings → Fields for complete Child/Person picture.
2. Wire Focus Panel builder inspector to `fieldSurfaceAvailability` badges (read-only) for parity with Fields page.
3. Expand lifecycle bindings audit — auto-mark BP availability from `LIFECYCLE_FIELD_RULE_BINDINGS`.
4. Playwright smoke: Fields hub entity tabs + Gender card availability assertions.

## Validation

```bash
cd web && npm run test -- tests/fields/fieldSurfaceAvailability.test.ts tests/fields/fieldSettingsOperatorUi.test.ts
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```
