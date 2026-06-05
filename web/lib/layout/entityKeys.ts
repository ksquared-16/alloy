/**
 * Layout V2 — entity key mapping.
 *
 * Layout V2's CANONICAL entity key is the plural registry/presentation key
 * (e.g. "opportunities") used by entity_layouts and entityPresentation.ts.
 *
 * The field-definition / field-section system keys entities by the SINGULAR
 * form (e.g. "opportunity"; see ALLOWED_ENTITY_TYPES in
 * /api/admin/field-definitions). To avoid leaking the wrong key, callers that
 * need to talk to those singular-keyed systems must map explicitly via
 * `fieldEntityKey()` rather than passing the layout key through.
 *
 * Layout config itself only ever uses the canonical plural key; this mapping is
 * the single, explicit bridge to singular field-entity keys.
 */

/** Canonical (plural) layout entity key → field-definition (singular) entity key. */
export const LAYOUT_TO_FIELD_ENTITY: Readonly<Record<string, string>> = {
    persons: "person",
    customers: "customer",
    jobs: "job",
    opportunities: "opportunity",
    vendors: "vendor",
    schedules: "schedule",
    locations: "location",
};

/**
 * Map a canonical plural layout entity key to the singular key used by the
 * field-definition APIs. Returns the input unchanged when no mapping exists
 * (entity types without a field-definition surface).
 */
export function fieldEntityKey(layoutEntityKey: string): string {
    return LAYOUT_TO_FIELD_ENTITY[layoutEntityKey] ?? layoutEntityKey;
}
