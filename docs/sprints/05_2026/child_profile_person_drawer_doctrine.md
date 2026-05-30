# Child Profile / Person Drawer Doctrine Sprint

**Date:** 2026-05-29  
**Status:** Child drawer finalized (final pass complete)

---

## Core doctrine (architecture)

**Person is the canonical identity entity.** Child, parent, guardian, emergency contact, and employee are **roles and presentation contexts** on the same `persons` record — not separate entity systems or drawer architectures.

A single person may hold multiple roles simultaneously (e.g. Parent + Emergency Contact, Employee + Parent). The drawer must not introduce hardcoded permanent “person types.”

**Presentation is derived from:**

1. **Roles** — join signals (`customer_persons`, `customer_members`, `person_relationships`, `opportunity_persons`, `is_employee`)
2. **Relationships** — directed edges + household siblings
3. **Available data** — enrollment mirror, field values, linked opportunities
4. **Layout configuration** — field_definitions today; profile-aware layouts (future)

---

## Presentation strategy (pass 2)

### Role resolution → presentation emphasis

| Module | Responsibility | Persisted? |
|--------|----------------|------------|
| `resolvePersonDrawerProfile` | Detect role keys from join signals; badge labels | No |
| `resolvePersonDrawerPresentationEmphasis` | Pick primary operator lens from roles (child-first precedence) | No |
| `applyPersonDrawerPresentationProfile` | Section/field suppression + consent gating | No (migration target: layout conditions) |

**Emphasis types** (`personDrawerPresentationEmphasis.ts`):

| Emphasis | Typical roles | Operator lens |
|----------|---------------|---------------|
| `child_lifecycle` | child | Enrollment, medical, family, future schedule/attendance |
| `guardian_communication` | parent, guardian | Contact, consent/opt-out, children |
| `employee_operations` | employee | Placement, credentials (future assignments) |
| `emergency_reachability` | emergency_contact | Contact, limited relationships |
| `general_identity` | unknown / no signals | Minimal profile |

**Mixed roles:** multiple badges; emphasis uses precedence (`child` wins over `parent` when both apply). Visibility rules use child-first gating in `applyPersonDrawerPresentationProfile`.

**Migration path:** replace emphasis precedence table with `record_drawer_layouts.config_json.presentation_emphasis` + `visible_when.roles[]` on section/field placements.

---

## Configurability audit (pass 2)

### Configurable today

| Surface | Store / API | Settings |
|---------|-------------|----------|
| Field registry | `field_definitions` (`entity_type = person`) | `/adminV2/settings/fields` |
| Field values | `field_values` | Drawer PATCH → `upsertFieldValuesFromBody` |
| Section catalog | `field_section_definitions` | `/adminV2/settings/field-sections` |
| Field placement | `field_definitions.section_key`, `sort_order` | batch-placement API |
| Visibility flags | `is_visible_in_drawer`, etc. | Fields UI |
| Status | `persons.status_key` | Statuses settings |

### Still resolver-driven (isolated modules)

| Behavior | Module | Future config path |
|----------|--------|-------------------|
| Section suppression by role | `applyPersonDrawerPresentationProfile` | `visible_when.roles` on layout sections |
| Field suppression (contact vs medical) | Same | Field placement conditions |
| Consent field profile split | `PARENT_CONSENT_FIELD_KEYS` / `CHILD_CONSENT_FIELD_KEYS` | Boolean fields + layout conditions |
| Header above-fold (contact vs DOB) | `personDrawerAboveFoldShowsContact/Dob` | Layout header slot config |
| Relationship group labels | `personDrawerRelationshipPresentation` | Section title overrides in layout |
| Custom panels (relationships, enrollment, employee) | `overviewCustomContent` | Built-in section registry + data bindings |
| Empty section suppression | `personDrawerHasRelationshipContent`, conditional append | Layout `allow_empty: false` |

### Missing for profile-aware layouts (smallest architecture)

1. **`record_drawer_layouts` runtime for person** — currently preview-only skeleton
2. **`visible_when` on sections/fields** — `{ roles: ["parent"], emphasis: ["guardian_communication"] }`
3. **Settings layout mutation for person** — section order, hide/show (parity with opportunity workflow v1)
4. **Built-in section registry** — relationships, enrollment_activity, employee_placement as declarative slots (not ad-hoc JSX)

**Recommendation:** Extend opportunity's `field_placements_v1` pattern to person layouts:

```json
{
  "presentation_emphasis_default": "general_identity",
  "section_placements_v1": [
    {
      "section_key": "enrollment_activity",
      "visible_when": { "roles_any": ["child", "parent", "guardian"] },
      "builtin_panel": "person_enrollment_activity"
    },
    {
      "section_key": "consent",
      "visible_when": { "roles_any": ["parent", "guardian"] }
    }
  ]
}
```

Resolver modules remain as **fallback** until layout rows exist per org.

---

## Child lifecycle evolution (structure only)

The child person record is the durable lifecycle anchor. Current drawer slots and future modules:

| Lifecycle stage | Current drawer surface | Future module |
|-----------------|------------------------|---------------|
| Opportunity / inquiry | `enrollment_activity` (OCM + opp links) | — |
| Waitlist | Outcome status on mirror rows | WU queue deep-link |
| Tours | — | Tour section (future) |
| Enrollment | `enrollment_activity` | Expand with packet status |
| Scheduling | — | Schedule section |
| Attendance | — | Attendance section |
| Billing | — | Billing/account section |
| Documents | Documents tab | Inline summary (future) |
| Communications | — | Comms section / thread preview |
| History | — | Activity timeline |

**Final child UX pass (2026-05-29):** Child drawer complete — deduplicated information ownership, selective green rail (summary + enrollment shell only), Family as relationship home, horizontal lifecycle stepper. Ready for Parent operating surface sprint. See [`person_relationship_child_lifecycle_foundation.md`](./person_relationship_child_lifecycle_foundation.md).

`CHILD_LIFECYCLE_SECTION_SLOTS` in `personDrawerPresentationEmphasis.ts` documents reserved layout keys; only `enrollment_activity` + `relationships` render as body sections today.

---

## UX pass 2 (shipped)

| Issue | Fix |
|-------|-----|
| Duplicate enrollment strips | Single `enrollment_activity` section; legacy `enrollment` / `enrollment_opportunities` filtered |
| Awkward enrollment cards | `PersonDrawerEnrollmentActivity` with `oppInqInnerCardCompact` premium cards |
| Empty relationship cards | Section omitted when no relationship rows; overview returns `null` not placeholder copy |
| Disconnected context | `PersonDrawerContextPanel` wired above overview — associated people quick links only |
| Generic relationship styling | Relationship groups use premium inner cards + eyebrow labels |
| Database-form feel | Retained `sectionSurface="premium"` + lead-summary shell tokens |

---

## Part A — Current Person drawer audit

### Shared drawer primitives

| Primitive | Person usage |
|-----------|--------------|
| `AdminEntityDrawer` + `Drawer.tsx` | Shell, tabs (overview / related / documents), header rail, save actions |
| `EntityDrawerOverview` | Config-driven overview body; `oppInqLeadSummaryShellClassName` / `oppInqInnerCardCompact` density tokens |
| `EntityDrawerSection` | Premium section cards for field grids |
| `RecordDrawerContextPanel` (`variant="lead-summary"`) | Operational context only — `PersonDrawerContextPanel` |
| `RecordDrawerHeaderStatusSelect` | Person status in header |
| `PersonDrawerHeaderMetadata` | `#person_number`, back link, above-fold contact/DOB |
| `PersonDrawerProfileBadges` | Role pills (Child, Parent, …) |
| `ViewPersonDrawerIconButton` | Open from opportunity family surfaces |
| `useConfigDrivenOverview` | Existing persons route through config-driven overview (not compact bespoke overview) |

**Open path:** `openViewPersonFromOpportunity` → cache/prefetch via `prefetchPersonDrawerSnapshot` + optional `personDrawerOpenSeed` for first paint.

**Data path:** `GET /api/admin/entity/persons/{id}` → `attachPersonDrawerVisibility` + `attachFieldDefinitionsAndValues` + relationship displays.

**Save path:** `PATCH /api/admin/persons/{id}` — native columns on `persons`; custom keys via `upsertFieldValuesFromBody` → `field_values`.

### Config-driven vs code-driven

| Layer | Source of truth | Configurable today? |
|-------|-----------------|---------------------|
| Field registry (`field_definitions`, `entity_type = person`) | DB + Settings → Fields | **Yes** — labels, types, section_key, sort, visibility flags |
| Field grouping (`field_section_definitions`) | DB + Settings → Field sections | **Yes** — section catalog |
| Drawer section skeleton | `entityPresentation.ts` → `persons.drawer.overviewSections` | **Partial** — canonical locked sections (Profile, Contact, Employee, Relationships, Record Info) |
| Field placement in overview | `_field_definitions` merged in `AdminEntityDrawer` `useMemo` overview assembly | **Yes** — via field `section_key` + `sort_order` (batch-placement API) |
| Drawer layout composition | `record_drawer_layouts` | **No for person** — Layouts hub shows person as `presentation_ordered_skeleton` only; section order/hide/edit deferred |
| Profile-specific section/field visibility | `resolvePersonDrawerProfile` + `applyPersonDrawerPresentationProfile` | **No in layout config** — code-driven resolver (this sprint keeps resolver; documents gap) |
| Custom panels (relationships, enrollment, employee) | `overviewCustomContent` in `AdminEntityDrawer` | **Code-driven** — injected when data exists |
| Header above-fold (email/phone vs DOB) | `personDrawerAboveFoldShowsContact` / `personDrawerAboveFoldShowsDob` | **Code-driven** |
| Relationship group labels | `personDrawerRelationshipPresentation` | **Code-driven** |

### Person profile resolver

**Module:** `web/lib/admin/person/resolvePersonDrawerProfile.ts`

**Inputs (read-only join signals on GET payload):**

- `customer_members.relationship` (child)
- `customer_persons.role_type` (child, parent, guardian, emergency)
- `person_relationships` directed edges (parent/guardian/child/emergency)
- `opportunity_person_roles` from `opportunity_persons`
- `persons.is_employee`

**Output:** `PersonDrawerProfileResult` — `profiles[]`, `display` (`child` \| `parent` \| … \| `mixed` \| `unknown`), `badgeLabels[]`.

**Not persisted** — presentation only. Multiple roles → multiple badges; `mixed` when 2+ apply.

**Presentation filter:** `applyPersonDrawerPresentationProfile` hides sections/fields per profile (child hides contact; parent hides medical; consent fields split by profile key sets).

### Settings surfaces affecting Person today

| Route | Plane | Effect |
|-------|-------|--------|
| `/adminV2/settings/fields` → Person tab | Fields | CRUD custom person fields; visibility flags |
| `/admin/system/person-fields` | Fields (legacy path) | Same client |
| `/adminV2/settings/field-sections` | Field grouping | Person section catalog |
| `/adminV2/settings/layouts?entity=person` | Layouts | **Preview only** — no section order/hide mutation |
| `/adminV2/settings/statuses` | Status | Person `status_key` |
| `/admin/system/customer-person-role-types` | Related | Role labels for `customer_persons.role_type` |

### Hardcoded / presentation-only surfaces

| Surface | Notes |
|---------|-------|
| `entityPresentation.persons.drawer.overviewSections` | Locked canonical sections when no field defs |
| `PersonDrawerRelationshipsOverview` | Relationship lists from joins |
| `PersonDrawerEnrollmentMirror` / `PersonDrawerEnrollmentOpportunitiesMirror` | OCM / opportunity links |
| `PersonEmployeePlacementSection` | `is_employee`, `employee_id`, `employee_source` native columns |
| `PersonDrawerContextPanel` | Compact related enrollment + associated people |
| Profile badge order / mixed display | Resolver precedence |
| Parent contact merge into Profile basic section | Code merges email/mobile into `basic_info` for parent-like |

### Feature matrix (audit table)

| Feature | Current source of truth | Configurable today? | Target state |
|---------|-------------------------|---------------------|--------------|
| Identity (first/last/preferred) | `persons` native columns | Partial (editable in drawer for adults) | Config-driven placement; child-first header |
| Email / phone | `persons` native columns | Visibility via profile resolver | Parent/emergency: visible; child: hidden |
| DOB / age | `field_values` (`date_of_birth`) | Field def if seeded | Child: visible; parent: hidden |
| Medical / allergies | `field_definitions` + `field_values` | **Yes** (Settings) | Child only |
| Photo sharing consent | `field_definitions` (when seeded) + resolver | **Yes** structure; visibility resolver | Child only |
| Communication opt-out | `field_definitions` `communication_opt_out` (migration) | **Yes** | Parent/guardian only |
| Enrollment activity | OCM + opportunity joins (read-only mirror) | No | Child lifecycle surface (expand) |
| Relationships | Join tables + custom panel | No | Profile-aware grouping (resolver today) |
| Employee placement | `persons` columns + custom panel | Partial | Employee profile only |
| Drawer section order | `entityPresentation` + field section keys | **No for person** | Profile-aware `record_drawer_layouts` |
| Actions | Global action registry | Partial | Profile-scoped placements (future) |

---

## Part B — Target person profile model

### Child

| Area | Target |
|------|--------|
| **Header** | Name + Child badge; DOB/age above fold; no email/phone |
| **Body sections** | Profile (name), Medical, Consent (photo), Enrollment activity, Documents, Relationships (parents/guardians/emergency/siblings) |
| **Fields shown** | first/last/preferred, DOB, allergies, medical_notes, photo_sharing_consent, custom child fields in medical/child_profile/enrollment sections |
| **Fields hidden** | email, phone, communication opt-out, employee fields |
| **Relationships** | Parents, guardians, emergency, siblings |
| **Lifecycle** | Enrollment mirror, future schedule/attendance/billing stubs |
| **Actions** | Send form, link documents (via existing registry when configured) |

### Parent / Guardian

| Area | Target |
|------|--------|
| **Header** | Name + Parent/Guardian badge; email + mobile above fold |
| **Body sections** | Profile (name + contact inline), Consent, Enrollment activity (as primary contact), Documents/comms, Relationships (children) |
| **Fields shown** | first/last/preferred, email, phone (Mobile), communication_opt_out, sms/email consent when configured |
| **Fields hidden** | DOB, medical, photo consent |
| **Relationships** | Children (siblings group titled "Children"); hide emergency/sibling noise |
| **Actions** | Communication drafts, send form |

### Emergency contact

| Area | Target |
|------|--------|
| **Header** | Name + Emergency Contact badge; phone/email above fold when present |
| **Body** | Profile, Contact, Relationships (limited) |
| **Hidden** | Medical (unless configured), enrollment, employee, child medical |
| **Future** | Authorized pickup notes field |

### Employee / Staff (future)

| Area | Target |
|------|--------|
| **Header** | Name + Employee badge |
| **Body** | Profile, Employee status section (`is_employee`, `employee_id`, `employee_source`) |
| **Future** | Staff role, site assignment |

### Mixed role

Multiple badges; presentation uses **child-first** rule when child profile is among resolved roles (child contact fields stay hidden; parent medical stays hidden).

---

## Part C — Communication opt-out (shipped)

| Property | Value |
|----------|-------|
| **Key** | `communication_opt_out` |
| **Label** | Communication opt-out |
| **Type** | boolean |
| **Scope** | `entity_type = person` |
| **Section** | `consent` |
| **Storage** | `field_values.value_boolean` via standard PATCH |
| **Migration** | `supabase/migrations/20260529210000_person_communication_opt_out_field.sql` |
| **Drawer visibility** | Parent/guardian via `PARENT_CONSENT_FIELD_KEYS`; hidden for child |
| **Settings** | Visible under Person Fields after migration |

---

## Part D — Layout/config doctrine

### Can layout support profile-specific sections today?

**No.** Person layout settings (`LAYOUT_SETTINGS_ENTITY_ORDER` includes `person`) expose **effective preview skeleton only**:

- `layoutSettingsSupportsSectionOrder` → `opportunity` only
- `layoutSettingsSupportsSectionConfig` → `opportunity` only
- No `record_drawer_layouts` row drives person drawer runtime today

### Interim approach (this sprint)

Keep **resolver-driven visibility** in `applyPersonDrawerPresentationProfile`. Consent fields use explicit profile key sets (`PARENT_CONSENT_FIELD_KEYS`, `CHILD_CONSENT_FIELD_KEYS`) — no blanket “show all booleans in consent section.”

### Future plan (TODO)

1. **Profile-aware `record_drawer_layouts`** — layout variant keyed by `person_profile` (child \| parent \| emergency \| employee \| default)
2. **Layout conditions** — `visible_when: { profile: ["parent", "guardian"] }` on section and field placement rows
3. **Field visibility conditions** — extend `field_placements_v1` or person-specific placement metadata
4. **Settings UX** — enable person layout mutation parity with opportunity workflow v1 (section order, hide/show)

Reference: `docs/sprints/05_2026/layout_field_behavior_semantics_phase_2.md` (deferred enhancements).

---

## Part E — Data integrity (verified)

| Flow | Mechanism | Test coverage |
|------|-----------|---------------|
| Linked inquiry child → person identity | `patchInquiryChildIdentityFromDrawer` → `PATCH /api/admin/persons/{id}` | `inquiryChildFieldEdit.test.ts` |
| Unlinked child → customer_member | Same module → `PATCH /api/admin/customer-members/{id}` | Same |
| Person drawer read | `GET /api/admin/entity/persons/{id}` + field values | Integration via entity route |
| Custom person fields persist | `upsertFieldValuesFromBody` on person PATCH | Platform standard; boolean via `payloadFromFieldType` |
| No duplicate identity truth | Canonical owner: person when `customer_members.person_id` set | Documented in `person_location_ux_reset.md` |
| communication_opt_out | field_definitions + field_values | Presentation tests in `personDrawerPresentationProfile.test.ts` |

---

## Part F — UI acceptance checklist

| Profile | Expected drawer behavior |
|---------|--------------------------|
| **Child** | Executive header: avatar, Child badge, age/program/location/lead chips; household summary; Family owns relationships; Child details (no duplicate name fields); Lifecycle tab; no communication opt-out |
| **Parent** | Parent badge; email/mobile in Profile + header; communication opt-out in Consent; no medical; children in relationships |
| **Emergency** | Contact-first; minimal sections |
| **Visual parity** | Same `EntityDrawerSection` / lead-summary context panel tokens as Opportunity drawer |

---

## Files changed (implementation)

### Pass 1

| File | Change |
|------|--------|
| `supabase/migrations/20260529210000_person_communication_opt_out_field.sql` | Seed `communication_opt_out` + consent section for all orgs |
| `web/lib/admin/person/personDrawerPresentationProfile.ts` | Parent consent key + strict profile gating |
| `web/tests/admin/person/personDrawerPresentationProfile.test.ts` | Opt-out + photo consent profile tests |
| `docs/sprints/05_2026/child_profile_person_drawer_doctrine.md` | This document |

### Pass 2 (architecture + UX)

| File | Change |
|------|--------|
| `web/lib/admin/person/personDrawerPresentationEmphasis.ts` | Role → presentation emphasis resolution + lifecycle slot registry |
| `web/lib/admin/person/personDrawerRelationshipVisibility.ts` | Relationship content detection (suppress empty sections) |
| `web/components/admin/entity/PersonDrawerEnrollmentActivity.tsx` | Unified deduped enrollment activity panel |
| `web/components/admin/entity/PersonDrawerContextPanel.tsx` | Associated people only (enrollment in body) |
| `web/components/admin/entity/PersonDrawerVisibilitySections.tsx` | Premium relationship cards; null when empty |
| `web/components/admin/AdminEntityDrawer.tsx` | Context panel wire-up; single enrollment_activity section |
| `web/lib/admin/person/personDrawerPresentationProfile.ts` | Filter legacy enrollment section keys |
| `web/tests/admin/person/personDrawerPresentationEmphasis.test.ts` | Emphasis + enrollment merge tests |
| `web/tests/admin/person/personDrawerArchitecturePass2.test.ts` | Architecture wiring tests |

### Final pass — Child drawer closeout (UX correction)

| File | Change |
|------|--------|
| `PersonDrawerChildSummary.tsx` | **Primary above-the-fold** child identity (photo, name, DOB, age, gender, program, location, status, optional guardian) |
| `PersonDrawerChildHouseholdContext.tsx` | Secondary household context below summary |
| `PersonDrawerChildLifecycleSnapshot.tsx` | Operational lifecycle rollup on Overview (replaces Lifecycle tab) |
| `PersonDrawerChildOverviewSkeleton.tsx` | Child-specific loading skeleton — no generic person flash |
| `personDrawerChildChrome.ts` | Open-hint + seed fallback for child-first paint |
| `personDrawerChildSummaryModel.ts` | Shared summary/header resolver |
| `personDrawerOpenSeed.ts` | `presentation_emphasis: child_lifecycle` on inquiry-child open |

#### Information hierarchy (corrected)

1. **Child summary** — focal identity (Opportunity Primary Contact doctrine)
2. **Household context** — supporting
3. **Lifecycle snapshot** — compact operational rollup with links
4. **Family** → **Enrollment** → **Child details** (config-driven sections)

#### Tabs

`Overview | Related | Documents` — lifecycle is **not** a separate tab.

#### Temporary vs config (this pass)

| Temporary (code) | Future (`record_drawer_layouts`) |
|------------------|----------------------------------|
| `personDrawerChildChromeActive` open hints | `presentation_emphasis` variant selection |
| Section order (`CHILD_LIFECYCLE_SECTION_ORDER`) | `overview_section_order` |
| Section titles (`personDrawerChildSectionTitle`) | Section label overrides |
| Lifecycle snapshot slot list | `section_placements_v1` built-in modules |
| `personDrawerCrmDisplayLabel` | Vertical entity/status label config |
| Field hide/show by role | `visible_when.roles` on placements |

**Defer** person layout runtime — do not add child-specific config tables.

#### Loading doctrine

When child chrome is active (profile, seed hint, or `opportunity_inquiry_child` open source):

- Child header + tabs paint immediately
- `PersonDrawerChildOverviewSkeleton` replaces generic person / profile loading
- Profile-driven section suppression applies before overview body renders

---

### Stabilization pass — Child drawer (May 2026)

Corrective pass: stabilize without new concepts or redesign.

| File | Change |
|------|--------|
| `collectLinkedPersonIdsFromOpportunityRecord.ts` | Prefetch includes `_inquiry_children` person ids |
| `personDrawerOpenSeed.ts` | Inquiry-child seed with DOB + `child_lifecycle` emphasis |
| `patchPersonDrawerFields.ts` | PATCH helper for editable child summary fields |
| `PersonDrawerChildSummary.tsx` | Editable DOB/gender; no header duplication |
| `PersonDrawerChildHeaderExecutive.tsx` | Operational pills only — status in title rail |
| `PersonDrawerChildLifecycleSnapshot.tsx` | Horizontal lifecycle strip (Family Lead, Documents, Communications, Activity) |
| `PersonDrawerVisibilitySections.tsx` | Family section owns household + guardians + siblings |
| `personDrawerChildLifecycleSlots.ts` | Activity label; operational slot phases |
| `AdminEntityDrawer.tsx` | Preload on opp reveal; hide Enrollment when lifecycle owns lead; child status badge |

#### Information hierarchy (stabilized)

1. **Header** — name, enrollment status (title rail), Child/age/DOB/gender/program/location pills
2. **Child summary** — avatar, name, editable DOB/gender (Opportunity primary-contact doctrine)
3. **Lifecycle strip** — compact horizontal rollup with links
4. **Family** — household, guardians, siblings
5. **Child details** — remaining configurable fields

Enrollment section is **suppressed** when child lifecycle chrome is active (lifecycle strip links to Family Lead).

#### Child open path inconsistency (May 2026 debug)

**Symptom:** From the same opportunity, one inquiry child (e.g. Sophia) opens child-lifecycle drawer; another (e.g. Wrigley) opens generic person chrome.

**Root causes addressed:**
1. **Prefetch cache hit without child emphasis** — idle prefetch stored full person GET without `_drawer_presentation_emphasis`; click open skipped seed on cache hit.
2. **Inquiry seed lookup order** — `personDrawerSeedFromOpportunityRecord` checked primary person before inquiry children.
3. **Missing `person_id` on click row** — fell through to `customer_members` drawer instead of resolving canonical person + child seed.
4. **customer-members GET omitted `person_id`** — member→person resolution failed on click fallback.

**Fix:** Unified `openInquiryChildPersonFromOpportunity` stamps child-lifecycle context on cache hit; inquiry-child seed resolves by `person_id` or `customer_member_id`; prefetch merges child seed after GET.

**Data backfill:** Ensure `customer_members.person_id` is set for household children (member→person link). Rows with only metadata `inquiry_children` and no member link remain synthetic — not openable as person until linked.

---

Focused tightening — no redesign, no new concepts.

| File | Change |
|------|--------|
| `PersonDrawerChildLifecycleRail.tsx` | Child module shortcuts in `postTabStrip` (no enrollment pipeline) |
| `resolveWorkUnitQueueDefinitionForDrawer.ts` | Coerce v2 `queue_definition` for **Opportunity** lifecycle rail |
| Migration `20260529220000_person_gender_field_definition.sql` | Configurable gender select on person |
| `AdminEntityDrawer.tsx` | `personDrawerChildBodyHydrated`; status in subtitle rail; `goBack()` for linked lead |

Hierarchy: subtitle person status → module nav (below tabs) → child summary → enrollment context → Family → Child details. Profile/Basic hidden. Enrollment pipeline rail is **Opportunity drawer only**.

#### Preload doctrine

After opportunity primary hydrate, background-prefetch linked person ids (primary, `_opportunity_persons`, `_inquiry_children`). Child open checks cache/seed first — no generic person shell flash.

---

### IA audit implementation pass (2026-05-30)

Approved audit direction — child drawer as **operating surface**, not Person entity form.

| File | Change |
|------|--------|
| `PersonDrawerChildSummary.tsx` | Identity hero — avatar, inline name, compact DOB/gender (age in title row only) |
| `PersonDrawerChildEnrollmentContext.tsx` | Enrollment-owned program/location/lead link (overview) |
| `PersonDrawerChildLifecycleRail.tsx` | Module nav chips only — Documents, Communications, Activity, future modules |
| `resolvePersonDrawerChildEnrollmentProgress.ts` | Resolver for linked lead pipeline (Opportunity drawer / tests — not child UI) |
| `resolvePersonDrawerChildModuleNavModel.ts` | Documents, Communications, Activity, future modules |
| `mergeHouseholdAdultLinks.ts` | Source dedupe for duplicate `customer_persons` role rows |
| `attachPersonDrawerVisibility.ts` | Applies household adult merge at projection |
| `AdminEntityDrawer.tsx` | Summary from seed; early prefetch; Related→Activity tab label; opp tabs+rail parity |

#### Information hierarchy (IA-approved)

1. **Header** — name + Child + age pill (once); person `status_key` dropdown in subtitle rail (`persons.status_key`, not opportunity status)  
2. **Tabs** — Overview \| Activity (related) \| Documents  
3. **Post-tab strip** — compact module shortcuts only (Documents, Communications, Activity, Schedule/Attendance/Billing soon)  
4. **Child summary** — identity hero (editable name/DOB/gender — no duplicate age)  
5. **Enrollment context** — program, location, family lead link  
6. **Family & household** — account, primary guardian, other adults, siblings  
7. **Medical / child details** — config-driven remainder  

**Rivera three-guardian root cause:** duplicate `customer_persons` rows for one adult with different `role_type` values — fixed at `_household_adult_links` projection via `mergeHouseholdAdultLinks`.

---

### Final pass — Child drawer closeout (prior)

| File | Change |
|------|--------|
| `web/lib/admin/person/personDrawerChildHeaderContext.ts` | Executive header context (avatar, age, program, location, lead status) |
| `web/components/admin/entity/PersonDrawerChildHeaderExecutive.tsx` | Header row under title — Child badge + operational chips |
| `web/components/admin/entity/PersonDrawerIdentityAvatar.tsx` | Person photo or initials avatar |
| `web/lib/admin/person/personDrawerChildLifecycleActions.ts` | Lifecycle slot → tab / opportunity / comms actions |
| `web/components/admin/entity/PersonDrawerChildLifecycleOperationalPanel.tsx` | **Lifecycle tab** — stepper + actionable module rows |
| `web/components/admin/entity/PersonDrawerChildLifecycleSummary.tsx` | Household + primary guardian reference only |
| `web/lib/admin/person/personDrawerPresentationProfile.ts` | Hide name fields in Child details for child profile |
| `web/lib/admin/person/personDrawerChildLifecycleSlots.ts` | UX constant → `lifecycle_tab_operational` |
| `web/lib/entityPresentation.ts` | `lifecycle` drawer tab key |
| `web/components/admin/AdminEntityDrawer.tsx` | Header context, Lifecycle tab strip, progressive paint with seed |
| `web/tests/admin/person/personDrawerChildFinalization.test.ts` | Header, tabs, actions, field suppression tests |

#### Executive header (child)

- **Title:** display name (unchanged)
- **`headerRecordContext`:** avatar + chips — Child, age, program/classroom, location, lead status
- **Right rail:** status + actions only (no duplicate Child badge / DOB meta)

#### Tab strip (child lifecycle emphasis)

`Overview | Lifecycle | Related | Documents`

Lifecycle tab owns stage visibility + links into existing modules (enrollment → overview or opportunity; documents → Documents tab; communications → opportunity comms; activity/history → Related).

#### Information ownership (final)

| Information | Primary home |
|-------------|--------------|
| Name, age, program, location, lead status, avatar | Header executive row |
| Household + primary guardian hint | Summary card |
| Guardians, parents, siblings | Family |
| Lead / enrollment detail | Enrollment section |
| Configurable child fields | **Child details** (`basic_info`) |
| Lifecycle stages + links | **Lifecycle tab** |
| Documents | Documents tab |

#### Loading doctrine (person drawer)

- Shell, title, tabs paint when entity id matches row (including **open seed** from opportunity)
- Body hydrates progressively; full fetch replaces seed without blocking chrome
- Scoped to person drawer — no platform-wide performance rewrite

---

## Deferred items

- Profile-aware person `record_drawer_layouts` runtime + `visible_when` conditions
- Settings layout mutation for person (section order/hide)
- Built-in section registry for relationships / enrollment_activity / employee panels
- `photo_sharing_consent` field_definitions seed (org-wide)
- Schedule / attendance / billing lifecycle **modules** (tab shows placeholders + links only)
- Person-native Communications tab (today: link to opportunity comms when enrollment opp exists)
- **BOS child insights** in child drawer (future: optional signal slot via layout config)
- Parent Operating Surface sprint (next)
- Platform-wide inquiry → lead terminology (drawer display labels only today)
- Remove `PersonDrawerChildLifecycleRoadmap.tsx` overview component (superseded by Lifecycle tab; file retained unused)
- Authorized pickup as structured field (notes field exists: `authorized_pickup_notes`)
- Employee staff assignment surfaces beyond `PersonEmployeePlacementSection`
- Remove resolver fallback once layout conditions ship per org

---

## Related docs

- `docs/sprints/05_2026/person_relationship_child_lifecycle_foundation.md` — relationship audit + parent/child foundation
- `docs/sprints/05_2026/person_location_ux_reset.md` — inquiry child identity sync, visual parity
- `docs/sprints/05_2026/completed/settings_control_plane_closeout.md` — four-plane model
- `docs/system/configuration-system.md` — Fields vs Layouts doctrine
- `docs/system/entity-model.md` — persons, customer_persons, customer_members
