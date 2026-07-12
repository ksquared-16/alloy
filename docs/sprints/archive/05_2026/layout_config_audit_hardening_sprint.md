# Layout + Config Audit + Hardening Pass

**Sprint type:** audit + alignment + safe hardening — **not** a config migration sprint.

Active sprint (May 2026). Follows **Drawer Hardening**; precedes **Required Fields + Completion Guardrails** and a future **Person Drawer Layout Runtime** sprint.

## Goal

Audit person/opportunity drawer surfaces for layout, field, label, visibility, and behavior hardcoded in React instead of configuration. **Document** findings and migration paths. Apply only **safe, low-risk** fixes that reuse existing relationship/API/config patterns. Do not redesign IA or rebuild drawers.

## What this sprint was NOT

This pass did **not**:

- Add Supabase migrations or seed rows moving person drawer fields/sections/actions into config tables
- Wire parent/child drawers to `record_drawer_layouts` at runtime
- Replace hardcoded parent/child summary components with config-driven section rendering
- Register new admin actions for primary contact (reused existing PATCH path)
- Change `field_definitions`, `field_section_definitions`, or `action_placements` schema or org seeds

Those belong to follow-up sprints with explicit migration design and blast-radius review.

## What this sprint delivered

Safe hardening and alignment:

1. Parent primary contact exposed for viewing parent via existing `customer_persons` PATCH
2. Global search open seed passthrough for consistent parent/child chrome hints
3. Phone display normalization on parent summary edit field
4. Employee **Source** field hidden on person drawer employee surfaces
5. Audit documentation with classification, risks, and deferred migration plan

## Core doctrine (unchanged)

- Layouts drive field placement, grouping, and visibility.
- React renders configured layout sections; it does not invent business fields.
- Entity configuration owns labels, exposure, visibility, and basic interaction rules.
- Hardcoding is acceptable only for true shell/navigation behavior.
- **Person** — identity/demographics/status.
- **Household/customer** — household relationship and account/address context.
- **customer_persons** — household-scoped relationship metadata, including primary contact.
- **Opportunity/OCM** — pre-enrollment placement context.
- No person-level school/program/location fields.

---

## Architecture snapshot

Person drawers use a **three-layer** layout model:

| Layer | Source | Role |
|-------|--------|------|
| 1 | `field_definitions` + `field_section_definitions` | Config-driven `EntityDrawerOverview` grids |
| 2 | `entityPresentation.ts` (`ENTITY_PRESENTATION_REGISTRY.persons`) | Static fallback when no visible defs |
| 3 | Parent/child **operating chrome** | Hardcoded summary, household, address, employee panels |

Opportunity drawers use **`record_drawer_layouts`** at runtime (workflow v1). Person drawers do **not** yet — see `child_profile_person_drawer_doctrine.md`.

Resolution flow: `GET /api/admin/entity/persons/:id` → `attachFieldDefinitionsAndValues` + `attachPersonDrawerVisibility` → `AdminEntityDrawer.configDrivenOverviewSections` → chrome selection (parent/child/generic) → `EntityDrawerOverview` with optional override.

---

## Audit findings

Classification key:

1. **Keep** — shell/navigation behavior  
2. **Layout config now** — move to `record_drawer_layouts` / section placement  
3. **Field/entity config now** — move to `field_definitions` / entity registry  
4. **Action config now** — move to registered admin actions  
5. **Defer** — document rationale  

### Opportunity drawer

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Workflow layout sections | `record_drawer_layouts`, opportunity workflow v1 | Keep + extend | Low | Already config-driven for v1 surfaces |
| Family contacts ordering | `opportunityFamilyContactsOrdering.ts` | Keep | Low | Read-path helper; primary from FK then household |
| Linked person field editing | `EditablePersonContactCard`, inquiry panels | Defer | Med | Uses PATCH persons; action config candidate |
| Lead/family labels in panels | Various opportunity drawer components | Defer | Med | Vertical labels; tenant config later |

### Child person drawer

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Child summary fields (name, DOB, gender, dates) | `PersonDrawerChildSummary.tsx` | Defer | High | Explicit save UX; field registry overlap with suppression lists |
| Household section layout | `PersonDrawerHouseholdSection.tsx` | Keep | Low | Relationship projection; primary contact uses existing PATCH |
| Section suppression lists | `personDrawerChildOperatingSections.ts`, `personDrawerPresentationProfile.ts` | Defer | Med | Needed until record_drawer_layouts for persons |
| Enrollment mirror display | Child header, household child rows | Keep | Low | Reads OCM/opportunity projection |
| Placement edit routing | Edit on Family Lead | Keep | Low | Correct ownership boundary |

### Parent/guardian person drawer

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Parent summary (name, email, phone, prefs) | `PersonDrawerParentSummary.tsx` | Defer | High | Same as child summary |
| **Primary contact for viewing parent** | `PersonDrawerHouseholdSection.tsx` | **Action (done)** | Low | **Migrated:** viewing-person card + shared PATCH path |
| Household address CRUD | `PersonDrawerHouseholdAddress.tsx` | Keep | Low | locations API; household-scoped |
| Employee status | `PersonDrawerEmployeeStatusSection.tsx` | Field config (partial) | Low | Source field hidden on all person drawer paths |
| Parent location-agnostic rule | `personDrawerLocationCategoryOwnership.ts` | Keep | Low | Doctrine enforced in projection |
| Consent field gating | `personDrawerPresentationProfile.ts` | Field config (partial) | Med | Uses field def keys when present |

### Household/contact sections

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Guardian/children column layout | `PersonDrawerHouseholdSection.tsx` | Keep | Low | IA shell |
| Primary contact radio | `patchHouseholdPrimaryContact` → `customer_persons` | Action (done) | Low | Canonical write path |
| Viewing parent excluded from guardians list | `resolvePersonDrawerHouseholdModel.ts` | Keep | Low | IA; primary control on viewing-person card |
| Emergency/pickup read-only primary | `GuardianCard canMutate={false}` | Keep | Low | Correct |

### AdminEntityDrawer / layout resolution

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Employee fields filtered from layout defs | `AdminEntityDrawer.tsx` ~9424 | Keep | Low | Prevents duplicate employee UI |
| Parent/child overview override | `personDrawerOverviewSectionsOverride` | Keep | Low | Prevents generic fallback when chrome active |
| Global search open seed passthrough | `globalRecordSearchOpen.ts` | Keep (fixed) | Low | **Fixed:** seed forwarded for layout chrome hints |
| Generic relationships tab | Legacy list on non-operating persons | Defer | Med | Operating tab uses `PersonDrawerOperatingActivityTab` |

### Field rendering

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Phone display | `formatPhoneUS` in `adminFormatters.ts` | Field config (partial) | Low | **Migrated:** parent summary edit uses `formatPhoneUSForEdit` |
| Phone in header/metadata | `PersonDrawerHeaderMetadata`, `EntityDrawerOverview` | Keep | Low | Already uses `formatPhoneUS` |
| Duplicate local formatters | `QuickMessageModal`, `CommunicationsDrawerSection` | Defer | Low | Converge on shared helper |
| DOB/start date edit | Child summary explicit save | Defer | Med | Required-fields sprint |
| Gender field | `personDrawerGenderField.ts` | Field config (partial) | Med | Native + config hybrid |
| Source on employee status | `PersonEmployeePlacementSection` | Field config (done) | Low | **Hidden** via `compactOperatingSurface` on person drawers |

### Global search

| Item | Location | Class | Risk | Notes |
|------|----------|-------|------|-------|
| Empty drawer shell | Open resolution + prefetch | Keep | Low | Hardening sprint addressed; seed passthrough fixed here |
| Parent seed empty phone/email | `personDrawerOpenSeedFromGlobalSearchHit` | Defer | Low | Hit type lacks phone; hydrates on GET |
| Layout consistency | Chrome hints from seed + `global_search` source | Keep (fixed) | Low | Seed now reaches listener/drawer |

---

## Migrated this sprint

1. **Parent primary contact control** — Viewing parent sees “You” card in household guardians column with same radio/PATCH as other guardians (`PersonDrawerHouseholdSection`, `resolveViewingPersonGuardianForCustomer`).
2. **Global search seed passthrough** — `launchGlobalRecordSearchOpen` forwards full `personDrawerOpenSeed` for consistent parent/child chrome on first paint.
3. **Phone formatting** — Parent summary phone input initializes via `formatPhoneUSForEdit` (E.164 → `(XXX) XXX-XXXX`).
4. **Employee source hidden** — `compactOperatingSurface` on generic person drawer employee section (already on parent operating surface).

---

## Remains hardcoded (intentional shell)

- Parent/child operating chrome composition and section order
- Household guardians/children paired columns
- Drawer back-link and lifecycle rails
- Role-based section/field suppression lists (`personDrawerPresentationProfile.ts`)
- `entityPresentation.ts` persons fallback sections
- Global search clustering and open-target resolution

---

## Deferred → Required Fields + Completion Guardrails sprint

- Required-field enforcement and completion guardrails
- Migrating child/parent summary fields into field registry with explicit-save semantics
- Consolidating duplicate phone formatters in communications modals
- Opportunity linked-person field editing → action config
- Vertical-specific labels (lead/family/guardian) → tenant config

---

## Deferred → Person drawer layout runtime (future Supabase + web sprint)

True config-driven parent/child drawers require **database seeds**, **runtime layout resolution**, and **Settings UX parity** — not React-only refactors. This sprint intentionally did not start that work.

### Current state (confirmed)

| Surface | Runtime layout source | Config tables used today |
|---------|----------------------|--------------------------|
| Opportunity drawer (workflow v1) | `record_drawer_layouts.config_json` | Yes — section order, hidden sections, `field_placements_v1` |
| Person drawer — overview grids | `field_definitions` + `field_section_definitions` | Partial — medical, consent, custom sections only |
| Person drawer — parent/child operating chrome | Hardcoded React components | **No** — summary, household, address, employee, lifecycle rails |
| Person drawer — profile/role selection | Code (`personDrawerPresentationProfile`, chrome hints) | **No** — suppression lists, not layout rows |
| Primary contact | Existing relationship API | `customer_persons` (data); UI not action-config registered |

**Person `record_drawer_layouts` rows exist for preview/skeleton in Settings only** — they do not drive `AdminEntityDrawer` runtime today (`child_profile_person_drawer_doctrine.md` Part D).

### Supabase migration work (not done in this sprint)

Planned migrations/seeds for a future sprint:

1. **`record_drawer_layouts` person variants** — seed org rows (or template → org copy) for:
   - `person_child_operating_v1`
   - `person_parent_operating_v1`
   - `person_generic_v1` (fallback)
   - `config_json` shape aligned with opportunity workflow v1: `overview_section_order`, `overview_hidden_sections`, `presentation_emphasis`, `section_placements_v1`, optional `field_placements_v1`

2. **`field_definitions` completion** — seed/extend person field registry for summary fields currently hardcoded in React:
   - Child: first/last name, DOB, gender, enrollment/start dates
   - Parent: first/last name, email, phone, preferred contact, communication opt-out
   - Native vs `field_values` ownership per existing person field conventions
   - Drawer visibility + section_key placement matching target layout sections

3. **`field_section_definitions`** — catalog sections for operating chrome slots if not already present:
   - `parent_summary`, `child_summary`, `household`, `household_address`, `employee_status`, lifecycle modules
   - Labels and sort_order for Settings + runtime grouping

4. **`action_placements` (optional phase)** — register household-scoped actions if primary contact moves from inline UI to configured action:
   - `set_household_primary_contact` surface placement on household section
   - Reuse existing `PATCH /api/admin/customers/[id]/household-primary-contact` handler — no new execution semantics

5. **Demo/staging seed alignment** — ensure childcare demo org reflects person layout rows + field placements for QA parity

Reference migrations (pattern, not person drawer): `20260520120000_inquiry_child_desired_start_and_field_defs.sql`, `20260529210000_person_communication_opt_out_field.sql`, opportunity drawer layout seeds under `20260513103000_*` / `20260513140000_*`.

### Web/runtime work (depends on migrations above)

1. **Layout resolver for persons** — extend `AdminEntityDrawer` / entity presentation to read effective person layout from `record_drawer_layouts` by `person_profile` + `presentation_emphasis` (replace `personDrawerPresentationProfile` suppression tables incrementally)

2. **Section module registry** — map layout `section_key` → renderer:
   - Built-in modules: summary, household, address, employee, enrollment activity, relationships
   - Config-driven modules: `EntityDrawerOverview` field grids from `field_definitions`
   - Retire duplicate hardcoded section order in `personDrawer*OperatingOverviewSections.ts`

3. **Settings UX** — enable person layout mutation in `/adminV2/settings/layouts` (today: preview skeleton only; `layoutSettingsSupportsSectionOrder` → opportunity only)

4. **Open-seed / chrome hints** — converge `personDrawerOpenSeed.presentation_emphasis` with layout variant selection from `record_drawer_layouts`

5. **Explicit-save semantics** — summary fields may remain explicit-save even when config-driven; layout config owns visibility/requiredness, not autosave behavior (Required Fields sprint)

### Suggested sprint sequence after this pass

1. **Required Fields + Completion Guardrails** — field policies, completion state, explicit-save contracts
2. **Person drawer layout runtime v1** — Supabase seeds + resolver + Settings parity (child profile first)
3. **Parent operating layout runtime** — parent variant + household/action placements
4. **Retire code suppression lists** — delete `personDrawerPresentationProfile` hide sets as layout `visible_when` replaces them

### Exit criteria for “true config-driven person drawers”

- [ ] Person drawer section order and visibility come from effective `record_drawer_layouts`, not TypeScript hide lists
- [ ] Summary field labels, ordering, and drawer visibility come from `field_definitions` (+ layout placements where overridden)
- [ ] Settings → Layouts can reorder/hide person sections for at least one profile variant
- [ ] No regression: parent/child/household/global-search open paths resolve the same effective layout
- [ ] Supabase seeds exist for demo org; migrations idempotent per org

---

## Tests

- `web/tests/admin/person/layoutConfigAuditSprint.test.ts` — primary contact, seed passthrough, phone, employee source, doc presence
- Existing: `personDrawerPrimaryContactLocationDoctrine.test.ts`, `personDrawerOwnershipFinalPass.test.ts`, `globalRecordSearch.test.ts`, `formatPhoneUS.test.ts`

---

## Related docs

- `person_drawer_primary_contact_location_doctrine.md`
- `child_profile_person_drawer_doctrine.md`
- `parent_operating_surface_person_drawer.md`
- `person_drawer_hardening_performance_sprint.md`
- `docs/system/configuration-system.md`
- `docs/system/record-system.md`
