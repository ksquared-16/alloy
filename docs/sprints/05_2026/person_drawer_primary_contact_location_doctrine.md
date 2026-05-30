# Person drawer — primary contact, location & category doctrine

Active sprint note for parent/child drawer IA. See also `docs/system/roles-and-permissions.md`.

## Primary contact (household-scoped)

**Truth:** `customer_persons` with `role_type = 'primary_contact'` and `is_primary = true` per `customer_id`.

- Intake: `ensureCustomerPersonsPrimaryLink` + `opportunities.primary_person_id`
- Read: opportunity FK → household `customer_persons` → queue `primary_person_id` batch
- Household **Primary** badge: `is_household_primary_contact` on projected adult links only

Code: `web/lib/admin/person/householdPrimaryContact.ts`

## Location & category / program ownership

**Parents are location- and category-agnostic.** Do not assign `location_id`, program, or category on `persons` for drawer display.

| Surface | Placement source |
|---------|------------------|
| Child drawer header pills | `_enrollment_mirror` (OCM `location_id` → fallback `opportunities.location_id`, program labels) via `resolvePersonDrawerChildPlacementFromRecord` |
| Parent drawer household **child rows** | Same mirror per `customer_member_id` — each child shows its own program · location |
| Parent drawer household-level note | Only when **2+ visible children** share identical program **and** location (`resolveSharedHouseholdPlacementContext`) |
| Future enrolled child | Child placement / enrollment record — not person columns |

## Child school / program / site (CRM phase)

**Current:** `opportunity_customer_members` → `_enrollment_mirror` on person GET.

**Future:** Enrollment / Placement record (schedule, attendance, billing, classroom).

**Person:** identity only. **Parent:** location-agnostic.

**Child drawer:** read-only placement; **Edit on Family Lead** → opportunity / OCM PATCH. No `persons` placement fields.

Code: `personDrawerChildPlacementContext.ts`, `child_placement_location_category_ownership_audit.md`

**Not used:** `persons.location_id`, `persons.school_location`, or a single location for the parent adult.

Code: `web/lib/admin/person/personDrawerLocationCategoryOwnership.ts`

## Primary contact edit path (drawer)

**Write path:** `PATCH /api/admin/customers/[customerId]/household-primary-contact` with `{ person_id }`.

1. `ensureCustomerPersonsPrimaryLink` — demote other `primary_contact` rows on same `customer_id`, set target `is_primary = true`.
2. `opportunities.primary_person_id` — updated for all opportunities on that customer (queue/lead display).
3. Drawer optimistic patch — `applyHouseholdPrimaryContactToRecord` updates `_household_adult_links` / `_customer_persons`.

**UI:** Guardian cards — radio “Set as primary contact”; **Primary** badge only (no Parent/Guardian chips).

Code: `setHouseholdPrimaryContact.ts`, `patchHouseholdPrimaryContact.ts`, `PersonDrawerHouseholdSection.tsx`

## Household address edit path

**Write path:** `locations` with `location_type = address`, `customer_id` set.

- Existing row → `PATCH /api/admin/locations/[id]`
- None on account → `POST /api/admin/locations` (`customer_id`, `location_type: address`, `is_primary: true`)

**UI:** `PersonDrawerHouseholdAddress` — editable empty state and in-place fields on parent drawer.

## Location-scoped permissions

Person identity may span sites. Visibility filters through enrollment operational context:

- `_enrollment_mirror.location_id` must be in `allowedSiteLocationIds` when site scope is restricted
- Household child rows, adults, and contexts filter to customers with at least one accessible child enrollment

Parents appear in a household group only when that group still has visible children after filtering.

Code: `web/lib/admin/person/personDrawerHouseholdSiteScope.ts`, `attachPersonDrawerVisibility(..., { siteScope })`
