# Person Drawer Layout Runtime Migration

Sprint A (May 2026). Follows **Layout + Config Audit + Hardening Pass**. Precedes **Required Fields + Completion Guardrails**.

## Goal

Move person drawers from React-owned composition toward the same **runtime layout** philosophy used by opportunity drawers (`record_drawer_layouts`), while preserving current UX and ownership doctrine.

---

## Phase 1 — Runtime audit (hardcoded composition)

| Surface | Location | Classification | Notes |
|---------|----------|----------------|-------|
| Parent summary (name, email, phone, prefs) | `PersonDrawerParentSummary.tsx` | **Keep temporarily** | Rendered via `person_operating_sections`; fields still hardcoded JSX |
| Child summary (name, DOB, gender, dates) | `PersonDrawerChildSummary.tsx` | **Keep temporarily** | Same |
| Household section | `PersonDrawerHouseholdSection.tsx` | **Keep temporarily** | Relationship projection; module key `household` in layout |
| Household address | `PersonDrawerHouseholdAddress.tsx` | **Keep temporarily** | Module key `household_address`; household/customer ownership |
| Employee status | `PersonDrawerEmployeeStatusSection.tsx` | **Keep temporarily** | Module key `employee_status` |
| Operating section order | `AdminEntityDrawer.tsx` | **Move now (v1)** | `PersonDrawerOperatingSections` reads `person_operating_sections` |
| Overview section suppression | `personDrawer*OperatingSections.ts`, `personDrawerPresentationProfile.ts` | **Move now (v1)** | Replaced by `overview_suppressed_sections` when DB runtime active |
| Profile consent/medical gating | `personDrawerPresentationProfile.ts` | **Keep temporarily** | Still runs before layout filter |
| Chrome selection (child vs parent) | `personDrawerChildChrome.ts`, `personDrawerParentChrome.ts` | **Never config-driven** | Shell/navigation; variant selection input |
| Lifecycle rails / title rows | `PersonDrawer*TitleRow`, `*LifecycleRail` | **Never config-driven** | Shell chrome |
| Tab list | `AdminEntityDrawer.tsx` | **Never config-driven** | IA shell |
| Primary contact action | `PersonDrawerHouseholdSection` + PATCH API | **Keep temporarily** | Inline UI; action_placements deferred |
| Global search open seeds | `personDrawerOpenSeed`, chrome hints | **Never config-driven** | Shell behavior |

---

## Phase 2 — Existing configuration review

### What person drawers can reuse today

| System | Opportunity | Person (before sprint) | Person (after v1) |
|--------|-------------|------------------------|-------------------|
| `record_drawer_layouts` org override | Yes | Preview only | **Yes — runtime** |
| `record_layouts` global fallback | Yes | No row | **Yes — seeded** |
| `GET /api/admin/record-layouts?entity_type=person` | Yes | **No** | **Yes** |
| `overview_section_order` | Yes | Code only | **Yes — per variant** |
| `overview_hidden_sections` | Yes | Code only | **Yes — per variant** |
| `field_placements_v1` | Yes | No | Deferred |
| `field_definitions` | Partial | Partial | Unchanged |
| `action_placements` | Yes | No | Deferred |

### Gaps (documented, not closed this sprint)

1. **`section_placements_v1` with `visible_when.roles`** — not in `config_json` schema yet
2. **Settings → Layouts person editor** — preview skeleton only; no section reorder UI
3. **Summary field registry** — parent/child summary fields still hardcoded JSX, not `field_definitions`-driven grids
4. **`field_placements_v1` for person** — requiredness/editability policies deferred to Required Fields sprint
5. **Person shell contract compiler** — no `compilePersonRecordDrawerShell` equivalent to opportunity pipeline
6. **Employee variant** — `person_employee_v1` variant key reserved; not seeded separately yet

---

## Phase 3 — Migration design (target runtime model)

### Layout variants (seeded)

| Variant key | Selection trigger | Operating modules | Overview behavior |
|-------------|-------------------|-------------------|-------------------|
| `person_child_operating_v1` | Child operating chrome | `child_summary`, `household` | Suppress summary/contact/relationship sections; show medical/consent/custom |
| `person_parent_operating_v1` | Parent operating chrome | `parent_summary`, `household`, `household_address`, `employee_status` | Suppress contact/consent/relationship duplicates |
| `person_generic_v1` | Generic person drawer | _(none)_ | Standard overview section order |

### `config_json` shape (person runtime v1)

```json
{
  "version": 1,
  "person_drawer_mode": "runtime_v1",
  "person_layout_variants": {
    "person_child_operating_v1": {
      "presentation_emphasis": "child_lifecycle",
      "person_operating_sections": ["child_summary", "household"],
      "overview_suppressed_sections": ["basic_info", "contact_info", "..."],
      "dedicated_field_keys": ["first_name", "last_name", "..."]
    }
  }
}
```

### Field model (deferred)

Summary fields remain in dedicated React components. Future sprint moves labels/visibility into `field_definitions` + layout placements while preserving explicit-save UX.

### Action model (deferred)

Primary contact stays inline on household module (existing PATCH). `action_placements` registration evaluated in a later pass.

---

## Phase 4 — Minimal runtime migration (implemented)

### Supabase

- `supabase/migrations/20260531140000_person_drawer_layout_runtime_v1.sql`
  - Global `record_layouts` row: `entity_type = person`, `key = default`
  - Org `record_drawer_layouts` seeds for childcare MVP orgs
  - Three variants: child, parent, generic

### Web runtime

| File | Role |
|------|------|
| `web/lib/admin/person/personDrawerLayoutRuntime.ts` | Variant resolution, section filtering, code fallbacks |
| `web/components/admin/entity/PersonDrawerOperatingSections.tsx` | Config-ordered operating module renderer |
| `web/components/admin/AdminEntityDrawer.tsx` | Fetches person layout; uses runtime path when DB active |
| `web/app/api/admin/record-layouts/route.ts` | Allows `entity_type=person` |
| `web/hooks/useRecordChromeConfig.ts` | Adds `person` entity kind |
| `web/lib/recordChrome/types.ts` | Extends `RecordLayoutConfigJson` |

### Behavior

1. Person drawer fetches effective layout via `useRecordChromeConfig("person")`.
2. `resolvePersonDrawerLayoutVariant()` picks variant from chrome context.
3. When `person_drawer_mode === runtime_v1` and variants exist in DB:
   - `PersonDrawerOperatingSections` renders modules in configured order
   - `filterPersonDrawerOverviewSectionsForLayoutRuntime()` replaces TS suppression lists for overview
4. When no DB row: code defaults in `PERSON_LAYOUT_VARIANT_DEFAULTS` preserve pre-sprint behavior.

---

## Phase 5 — Layout administration alignment

| Capability | Opportunity | Person |
|------------|-------------|--------|
| Settings entity tab | Editable workflow v1 | Preview skeleton only |
| `layoutSettingsSupportsSectionOrder("person")` | N/A | **false** |
| Effective preview API | Runtime mirror | `presentation_ordered_skeleton` |
| Runtime drawer reads layout | Yes | **Yes (v1)** |
| Operator section reorder | Yes | **Not yet** |

**Gap:** Settings UI does not edit person variants this sprint. Operators change layout via DB/migrations or future Settings work.

---

## Current state vs target state

| | Before Sprint A | After Sprint A (v1) | Target (future) |
|--|-----------------|---------------------|-----------------|
| Layout source | React + field_definitions | **DB variants + React modules** | Full config-driven fields |
| Section suppression | TS Sets | **Config arrays when runtime active** | `visible_when` conditions |
| Operating module order | Hardcoded JSX order | **Config `person_operating_sections`** | Settings editor |
| Summary fields | Hardcoded JSX | Hardcoded JSX | field_definitions + layout |
| Required fields | None | None | Required Fields sprint |

---

## Migration decisions

1. **Variant-in-single-row** — all person variants live under one `record_drawer_layouts` row (`key=default`) as `person_layout_variants` map (avoids multi-key resolution changes).
2. **Module registry stays React** — layout config selects **which** built-in modules render, not arbitrary new sections.
3. **Profile gating retained** — `applyPersonDrawerPresentationProfile` still runs; layout supersedes operating suppression only.
4. **Child-first unchanged** — variant resolver respects child-over-parent precedence.
5. **No new tables** — extends existing `record_drawer_layouts` / `record_layouts`.

---

## Deferred items

- Summary field migration to `field_definitions`
- `field_placements_v1` for person surfaces
- `section_placements_v1` + `visible_when.roles`
- Settings → Layouts person editor
- `person_employee_v1` dedicated variant
- `action_placements` for household actions
- Person drawer shell contract compiler
- Retire `personDrawerPresentationProfile` hide lists entirely

---

## Risks

| Risk | Mitigation |
|------|------------|
| Org without seed row | Code defaults match pre-sprint behavior |
| Config/TS suppression drift | Migration seeds mirror `PERSON_DRAWER_*_SUPPRESSED_SECTION_KEYS` |
| Double field render | `dedicated_field_keys` + operating modules unchanged |
| Settings preview ≠ runtime | Document fidelity gap; runtime is authoritative |

---

## Future phases

1. **Required Fields + Completion Guardrails** — policies on layout surfaces
2. **Person layout Settings editor** — variant section reorder/hide
3. **Summary field config migration** — field_definitions ownership
4. **Retire suppression lists** — delete TS Sets when all orgs on runtime

---

## Tests

- `web/tests/admin/person/personDrawerLayoutRuntime.test.ts` — variant selection, section filtering, runtime detection
- Existing person drawer IA / ownership tests remain authoritative for doctrine

---

## Ownership doctrine (unchanged)

- **Person** — identity, demographics, employee status
- **Household/customer** — relationships, address, primary contact
- **OCM/opportunity** — placement context
- No person-level school/program/location fields

---

## Related docs

- `layout_config_audit_hardening_sprint.md`
- `child_profile_person_drawer_doctrine.md`
- `parent_operating_surface_person_drawer.md`
- `docs/system/configuration-system.md`
