/**
 * Field availability context — which record/work context a surface or builder operates in.
 *
 * Availability is context-aware: a field is available when the context can reach
 * the field's entity grain and the resolver/renderer/builder/publish stack passes.
 */

import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type FieldAvailabilityContext =
    | "person"
    | "family"
    | "child"
    | "lead"
    | "lead_with_child"
    | "family_with_children"
    | "location"
    | "process_stage"
    | "work_item";

/** Contexts where child profile fields (customer_member grain) are reachable. */
export const CHILD_PROFILE_CONTEXTS = new Set<FieldAvailabilityContext>([
    "child",
    "lead_with_child",
    "family_with_children",
]);

/** Contexts where person-role fields are reachable on a lead/family record. */
export const PERSON_ROLE_CONTEXTS = new Set<FieldAvailabilityContext>([
    "person",
    "family",
    "lead",
    "lead_with_child",
    "family_with_children",
]);

/** Default richest context for Settings → Data Model availability display per hub entity. */
export function defaultAvailabilityContextForHubEntity(entity: SettingsHubEntityKey): FieldAvailabilityContext {
    switch (entity) {
        case "inquiry_child":
            return "lead_with_child";
        case "customer":
            return "family_with_children";
        case "opportunity":
            return "lead_with_child";
        case "person":
            return "person";
        case "location":
            return "location";
        default:
            return "lead_with_child";
    }
}

/** Context used when evaluating a specific consumer surface in Settings. */
export function availabilityContextForSurface(
    hubEntity: SettingsHubEntityKey,
    surface: string,
): FieldAvailabilityContext {
    if (surface === "queue_row") {
        return hubEntity === "opportunity" ? "lead" : "lead_with_child";
    }
    return defaultAvailabilityContextForHubEntity(hubEntity);
}

export function contextSupportsChildProfileFields(context: FieldAvailabilityContext | undefined): boolean {
    if (!context) return false;
    return CHILD_PROFILE_CONTEXTS.has(context);
}

export function contextSupportsPersonFields(context: FieldAvailabilityContext | undefined): boolean {
    if (!context) return false;
    return PERSON_ROLE_CONTEXTS.has(context);
}

export function contextSupportsFamilyFields(context: FieldAvailabilityContext | undefined): boolean {
    if (!context) return false;
    return context === "family" || context === "family_with_children" || context === "lead_with_child";
}

export function contextSupportsLeadFields(context: FieldAvailabilityContext | undefined): boolean {
    if (!context) return false;
    return context === "lead" || context === "lead_with_child";
}

export function contextSupportsLocationFields(context: FieldAvailabilityContext | undefined): boolean {
    return context === "location";
}
