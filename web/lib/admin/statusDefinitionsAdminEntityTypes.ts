/**
 * Entity types listed on the admin Statuses Settings page and used for the
 * unscoped GET /api/admin/status-definitions aggregate (effective defs per type).
 */
export const ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES = [
    "schedules",
    "jobs",
    "customers",
    "opportunities",
    "vendors",
    "service_plan_templates",
    "persons",
    "contacts",
    "customer_members",
    "locations",
    "documents",
    "payments",
    "subscriptions",
] as const;

export type AdminStatusDefinitionsEntityType = (typeof ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES)[number];
