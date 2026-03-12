# Vertical-Aware Person Type Options — Deliverables

## 1. Files changed

| File | Change |
|------|--------|
| `web/lib/admin/personTypeSettings.ts` | Added `VerticalOptionRow` type and `resolveOptionsByVertical()` (filter by vertical or null, de-dupe by key preferring vertical-specific, sort by sort_order then label). Updated JSDoc for API query params. |
| `web/app/api/admin/customer-person-role-types/route.ts` | GET: added `vertical_id` to select and to `CustomerPersonRoleType`. Optional `?vertical_id=` param: when set, fetches active rows where `vertical_id.eq.X` or `vertical_id.is.null`, then runs `resolveOptionsByVertical()` and returns resolved list. No param = existing behavior (all org rows, optional `active_only`). |
| `web/app/api/admin/person-relationship-type-settings/route.ts` | Same pattern: `vertical_id` in select/type, `?vertical_id=` for resolved options, else org-wide list. |
| `web/app/admin/system/customer-person-roles/CustomerPersonRolesClient.tsx` | Use `useAdminVertical()`; added **Vertical** column to table (Universal vs vertical name). |
| `web/app/admin/system/person-relationship-types/PersonRelationshipTypesClient.tsx` | Same: Vertical column, verticals from `useAdminVertical()`. |

No changes to: entity/[type]/[id], related/[entity]/[id], db-relationships API, workflows, or schema.

**Note:** The implementation assumes `customer_person_role_types` and `person_relationship_type_settings` have a nullable `vertical_id` column. If that column is not yet in the DB, add it (e.g. via migration) before using vertical-aware options.

---

## 2. Where vertical-aware option loading is now used

- **API GET with `?vertical_id=`**  
  Any client that calls:
  - `GET /api/admin/customer-person-role-types?active_only=true&vertical_id=<id>`
  - `GET /api/admin/person-relationship-type-settings?active_only=true&vertical_id=<id>`
  receives the **resolved** list (active rows for that vertical + universal, de-duped by key with vertical-specific winning, sorted).

- **Settings pages (Person Roles, Relationship Types)**  
  - List view: still call GET **without** `vertical_id` so admins see **all** rows (universal + vertical-specific).  
  - Table now shows a **Vertical** column (Universal or the vertical name) so admins can see which rows are vertical-specific.

- **Future forms/dropdowns**  
  When a form needs role or relationship-type options in a vertical context (e.g. adding a customer_person from a customer/job that has a vertical), the client should call the GET with `vertical_id=selectedVerticalId` (e.g. from `useAdminVertical().selectedVerticalId` or from the parent entity’s vertical). No such form was changed in this pass; the API and helpers are ready.

---

## 3. Places still deferred

- **Entity/Related/DB-relationships label resolution**  
  When building label maps for `_role_label` / `_relationship_type_label` (entity, related, db-relationships), the code still loads role/relationship type rows by org (and key) only. It does **not** pass a vertical or apply resolution. So if the same key exists for universal and a vertical, the label shown is effectively “first match.” Vertical-aware label resolution in those APIs is **deferred** (would require vertical context in the request or from the entity).

- **Drawer/forms that pick role or relationship type**  
  No drawer form in this pass was updated to pass `vertical_id` when fetching options. When such a form is added, it should use `?active_only=true&vertical_id=...` when a vertical is available.

- **Workflows**  
  Not redesigned; no workflow-specific changes.

---

## 4. Manual test checklist

- [ ] **Person Roles – list and Vertical column**  
  - Go to System → Directory Settings → Person Roles.  
  - Confirm list loads. If any row has `vertical_id` set, confirm **Vertical** column shows the vertical name (or short id if name missing); if `vertical_id` is null, confirm **Universal**.  
  - Add/Edit still work; no regression.

- [ ] **Person Relationship Types – list and Vertical column**  
  - Same for System → Directory Settings → Relationship Types: list loads, **Vertical** column shows Universal or vertical name.

- [ ] **Resolved options with vertical**  
  - Call `GET /api/admin/customer-person-role-types?active_only=true&vertical_id=<valid-vertical-uuid>`.  
  - Confirm response has only active rows for that vertical or universal, one row per key (vertical-specific preferred when duplicate key), sorted by sort_order then label.

- [ ] **Resolved options – relationship types**  
  - Same for `GET /api/admin/person-relationship-type-settings?active_only=true&vertical_id=<valid-vertical-uuid>`: same resolution and sort.

- [ ] **No vertical (compatibility)**  
  - Call `GET /api/admin/customer-person-role-types` and `GET /api/admin/person-relationship-type-settings` with no query params.  
  - Confirm full org list is returned (all rows, with `vertical_id` in each item).  
  - Call with `?active_only=true` only; confirm only active rows, no resolution.

- [ ] **DB Relationships / Entity / Related**  
  - Open a customer or person that has customer_persons or person_relationships. Confirm role and relationship type labels still display (no regression). No vertical-aware resolution expected.
