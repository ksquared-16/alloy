/** Server- and client-safe entity label display helpers (no React context). */

export type EntityLabelEntry = { singular: string | null; plural: string | null };
export type EntityLabelsMap = Record<string, EntityLabelEntry>;

/** Default display labels when entity_labels has no override (DB entity type unchanged). */
export const DEFAULT_ENTITY_LABELS: Record<string, { singular: string; plural: string }> = {
    vendors: { singular: "Vendor", plural: "Vendors" },
    jobs: { singular: "Job", plural: "Jobs" },
    schedules: { singular: "Schedule", plural: "Schedules" },
    customers: { singular: "Customer", plural: "Customers" },
    contacts: { singular: "Contact", plural: "Contacts" },
    customer_members: { singular: "Member", plural: "Members" },
    persons: { singular: "Person", plural: "People" },
    opportunities: { singular: "Opportunity", plural: "Opportunities" },
    workflows: { singular: "Workflow", plural: "Workflows" },
    locations: { singular: "Location", plural: "Locations" },
    documents: { singular: "Document", plural: "Documents" },
    subscriptions: { singular: "Subscription", plural: "Subscriptions" },
    payments: { singular: "Payment", plural: "Payments" },
    messages: { singular: "Message", plural: "Messages" },
    service_offerings: { singular: "Service Offering", plural: "Service Offerings" },
    service_plan_templates: { singular: "Plan Template", plural: "Plan Templates" },
    discount_redemptions: { singular: "Discount Redemption", plural: "Discount Redemptions" },
    addons: { singular: "Add-on", plural: "Add-ons" },
};

/**
 * Get display label for an entity type. Use for UI only; DB entity types stay vendors/jobs/etc.
 */
export function getEntityLabel(
    labels: EntityLabelsMap,
    entityType: string,
    form: "singular" | "plural"
): string {
    const entry = labels[entityType];
    const value = form === "singular" ? entry?.singular : entry?.plural;
    if (value != null && value.trim() !== "") return value.trim();
    const defaults = DEFAULT_ENTITY_LABELS[entityType];
    if (defaults) return defaults[form];
    const fallback = form === "singular" ? entityType.replace(/s$/, "") : entityType;
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
