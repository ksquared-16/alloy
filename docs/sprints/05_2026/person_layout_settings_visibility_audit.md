# Person Layout + Completion — Settings Visibility Audit

Audit date: May 2026. Confirms what operators see in **Settings → Layouts / Fields** after Sprint A (layout runtime v1) and Sprint B (**Completion Guardrails Foundation** — bootstrap preview rules, not final configuration).

**Phase 1 (visibility) — complete.** Person tab shows Runtime v1 variants and completion bootstrap catalog (read-only). Layout and requirement **editing** remain deferred.

---

## Direct answers (post Phase 1)

### 1. Can admins see Sprint A person drawer layout variants in Settings?

**Yes — read-only on Person tab.**

| What exists | What admins see |
|-------------|-----------------|
| **Person tab** on `/adminV2/settings/layouts?entity=person` | Yes |
| **`person_layout_variants` in DB** | **Person drawer layouts (Runtime v1)** panel lists `person_child_operating_v1`, `person_parent_operating_v1`, `person_generic_v1` with operating section order |
| **Runtime mode / provenance** | `person_drawer_mode`, DB-backed vs code fallback, layout row source |
| **Developer details** (collapsed) | Unchanged — generic section skeleton + provenance debug |

### 2. Can they edit person layouts, or is it preview-only?

**Preview-only.** No PATCH editor. Read-only banner and badges state editing is deferred.

### 3. Are completion guardrails visible anywhere in Settings?

**Yes — read-only Completion guardrails panel** on Person tab. Bootstrap rules grouped by Parent, Child, Opportunity, Household — **catalog for transparency, not editable configuration**. UI copy in drawer Assist column states rules are bootstrap preview only.

### 4. Where are requiredness rules stored?

Unchanged — Sprint B enforcement is **code bootstrap**; opportunity layout requiredness is **DB** (`field_placements_v1`); person layout structure is **DB** when migration applied.

### 5. Deferred work (Phase 2+)

- Person layout edit (operating section reorder PATCH)
- Requirement policy edit via `field_placements_v1` on person layouts
- Settings redesign (out of scope)

---

## Historical audit (pre Phase 1)

### 1. Can admins see Sprint A person drawer layout variants in Settings?

**Partially — not the variants themselves.**

| What exists | What admins see |
|-------------|-----------------|
| **Person tab** on `/adminV2/settings/layouts?entity=person` | Yes — tab is in `LAYOUT_SETTINGS_ENTITY_ORDER` |
| **`person_layout_variants` in DB** (after migration `20260531140000`) | Resolved at **drawer runtime**, not surfaced as variant rows in Settings UI |
| **Settings preview** | Shows `presentation_ordered_skeleton` from `entityPresentation.ts` (Profile, Contact, Employee, Relationships) — **not** `person_child_operating_v1` / `person_parent_operating_v1` / `person_generic_v1` |
| **Developer details** (collapsed) | `EffectiveDrawerLayoutPreviewPanel` calls `GET /api/admin/record-layouts/effective-preview?entity_type=person` — shows layout **provenance** (org override vs global) and generic section list; **does not render `person_layout_variants` JSON or operating modules** |

**Conclusion:** Admins can open the Person layouts tab and see that an org layout row exists (in developer details), but they **cannot see the three Sprint A variants or operating section order** as first-class UI.

---

### 2. Can they edit person layouts, or is it preview-only?

**Preview-only (read-only). No person editor.**

| Capability | Opportunity | Person |
|------------|-------------|--------|
| Section reorder / hide | Yes (workflow v1 editor) | **No** — `layoutSettingsSupportsSectionConfig("person")` → `false` |
| Field placement / requiredness on layout | Yes (`field_placements_v1`) | **No** |
| Main workspace editor | `OpportunityWorkflowV1SectionsEditor` | **Not mounted** — `RecordDrawerCompositionWorkspace` only loads preview bundle when `entity === "opportunity"` |
| Operator-facing preview | Full editor | Amber read-only banner only |

**UX bug:** `resolveLayoutCompositionCapabilities()` has no `person` branch — person tab falls through to the **schedule** read-only message (“Schedule drawer composition uses layout blocks…”), which is misleading.

**Conclusion:** Person layouts are **preview-only and developer-details-only**. Sprint A seeds are applied via migration + runtime; Settings cannot edit them.

---

### 3. Are completion / required guardrails visible anywhere in Settings?

**No dedicated completion guardrails surface.**

| Settings area | Completion visibility |
|---------------|----------------------|
| **Layouts → Person** | No requirement / missing-field UI |
| **Layouts → Opportunity** | Per-field Required / editability via `LayoutFieldBehaviorControls` + `field_placements_v1` (opportunity only) |
| **Fields → Person** | Legacy **`is_required`** checkbox on field definitions — **not** wired to Sprint B evaluator |
| **Status transition rules** | Legacy `required_metadata_fields` / `required_payload_fields` on `status_transition_rules` — separate from Sprint B structured completion |
| **Layout integrity report** | Includes person entity filter — structural integrity, not completion rules |

Sprint B guardrails run at **PATCH / drawer Assist column** (`MissingRequirementsSummary` in BOS panels). Operators discover missing requirements in the **person drawer**, not in Settings.

---

### 4. Where are requiredness rules stored today?

| Rule set | Storage | Settings editable? | Enforced where |
|----------|---------|-------------------|----------------|
| **Sprint B bootstrap** (name, parent contact, child DOB/start, opp tour/enrolled, household primary) | **Code** — `web/lib/completion/*.ts` | **No** | Person/opportunity PATCH; drawer preview |
| **Opportunity layout requiredness** | **DB** — `record_drawer_layouts.config_json.field_placements_v1` | Yes — Layouts → Opportunity → section fields | Opportunity drawer overview |
| **Field catalog default** | **DB** — `field_definitions.requirement_policy` / legacy `is_required` | Partial — Fields hub (de-emphasized for opp layout-owned fields) | Layout assist / some forms paths |
| **Status transitions (legacy)** | **DB** — `status_transition_rules` | Read-only in Settings | Merged into opportunity transition enforcement |
| **Person layout variants** | **DB** — `person_layout_variants` in `config_json` | **No UI** | Drawer runtime (`personDrawerLayoutRuntime.ts`) |

**Conclusion:** Sprint B requiredness is **code bootstrap**, not DB/config. Opportunity layout requiredness is **DB config**. Person layout structure is **DB config** but **not Settings-editable**.

---

## Exact Settings gaps

### Layout (Sprint A)

1. No person variant list in Settings (child / parent / generic operating surfaces).
2. `buildEffectiveDrawerLayoutPreview` ignores `person_layout_variants` — preview ≠ runtime.
3. No PATCH API wired for person layout sections (unlike `opportunity-workflow-v1-sections`).
4. Person tab shows wrong read-only banner (schedule copy).
5. `EffectiveDrawerLayoutPreviewPanel` entity dropdown omits Person (only when not embedded; embedded uses tab entity).
6. Operating modules (`child_summary`, `household`, etc.) are not modeled as preview section kinds.

### Completion (Sprint B)

1. No Settings page or Layouts sub-panel for completion / requirement rules.
2. No read-only “effective requirements” report per profile or layout variant.
3. Person `field_definitions.is_required` is misleading — not authoritative for Sprint B guardrails.
4. `field_placements_v1` requirement presets not available for person entity type.
5. No bridge from Settings to `evaluateCompletionRequirements` bootstrap catalog.

---

## Smallest next sprint (no Settings redesign)

**Sprint name suggestion:** *Settings Control Plane — Person Layout + Requirements Read/Write v1*

Goal: Make Sprint A/B operator-visible and minimally editable using **existing** Layouts + Fields patterns — no new Settings IA.

### Phase 1 — Person layout visibility (read-only, ~3–5 days)

1. **Fix person capabilities** — `resolveLayoutCompositionCapabilities({ entity: "person" })` with accurate read-only copy.
2. **Extend effective-preview for person** — When `person_drawer_mode === runtime_v1`, return:
   - `preview_fidelity: "person_runtime_mirror"` (new label)
   - `person_layout_variants` as preview section groups (variant key → operating sections + suppressed overview keys)
   - Not just `entityPresentation` skeleton
3. **Operator-visible panel** (not only Developer details) — Read-only “Effective person drawer variants” card on Person layouts tab listing the three variants and module order from DB.
4. **Tests** — effective-preview returns variant keys when seed present; Settings hub renders variant list.

**No edit yet** — proves Settings matches runtime.

### Phase 2 — Person layout edit v1 (~5–7 days)

Minimal edit scope (mirror opportunity Class A only):

1. **PATCH API** — `PATCH /api/admin/record-drawer-layouts/person-runtime-v1-sections` (or extend existing persist helper):
   - Allow reorder/toggle of `person_operating_sections` per variant
   - Allow edit of `overview_suppressed_sections` / `overview_section_order` per variant
   - Do **not** expose arbitrary JSON editor
2. **Settings UI** — Lightweight `PersonRuntimeV1VariantsEditor` (copy structure from opportunity editor, single column):
   - Variant selector: child / parent / generic
   - Ordered list of operating modules (checkbox + drag)
   - Read-only overview suppression list with “reset to default”
3. **Reuse** `recordDrawerLayoutPersist.ts` pattern for org-scoped upsert.

**Out of scope:** Summary field JSX migration to field_definitions; tab composition; shell chrome.

### Phase 3 — Requirement policies visibility + edit v1 (~5–7 days)

1. **Read-only “Effective requirements” panel** on Person layouts tab (or Fields → Person sidebar):
   - Call shared evaluator with sample/fixture records per variant (`evaluatePersonDrawerCompletionPreview`)
   - Display bootstrap rules catalog from code (documented table) + which phase blocks
2. **Write path (minimal)** — Extend person `field_placements_v1` on same layout row:
   - Reuse `LayoutFieldBehaviorControls` for person when variant = generic overview sections
   - Map requirement preset → evaluator override (thin adapter layer; keep bootstrap as fallback)
3. **Optional:** Export `completion_requirements` shape in Layout integrity or new `GET /api/admin/completion/effective-preview?entity_type=person&variant=…`

**Out of scope:** New `completion_rule_sets` table; full replacement of code bootstrap; opportunity rule editor changes.

---

## Success criteria (Phase 1 — complete)

- [x] Person tab shows three layout variants matching DB seed / runtime (or code fallback)
- [x] Preview fidelity label distinguishes skeleton vs runtime mirror
- [x] Effective requirements visible per group (read-only catalog)
- [x] Read-only / Runtime v1 badges on person layout panel
- [x] Person tab copy fixed (no schedule fallback message)
- [ ] Admins can reorder operating modules — **deferred Phase 2**
- [ ] Person overview field requirement editable via `field_placements_v1` — **deferred Phase 3**

---

## Success criteria (next sprint — Phase 2+)

---

## Related docs

- `person_drawer_runtime_layout_migration.md` — Sprint A runtime
- `person_layout_completion_reconciliation.md` — Sprint A/B coexistence
- `required_fields_completion_guardrails_policy.md` — Sprint B policy model
- `docs/system/configuration-system.md` — four-plane Settings model
