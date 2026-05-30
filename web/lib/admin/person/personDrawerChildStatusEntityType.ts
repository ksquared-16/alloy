/**
 * Child drawer status reads/writes `persons.status_key` via status_definitions entity_type `persons`.
 *
 * Settings may label `customer_members` as "Children" (roster) — that is NOT this dropdown.
 * Opportunity / OCM sub-statuses are also excluded.
 */
export const PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE = "persons" as const;
