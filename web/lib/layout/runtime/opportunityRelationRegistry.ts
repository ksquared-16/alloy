/**
 * Opportunity drawer — relation registry (Phase 1 proof).
 *
 * Declarative Relation descriptors for layout runtime binding. Does not fetch data;
 * documents how relationship/reference items resolve. Single-hop only (§10.6).
 */

import type { LayoutRelationDescriptor } from "./valueBinding";

/** Anchor entity for opportunity drawer layouts. */
export const OPPORTUNITY_LAYOUT_ANCHOR_ENTITY = "opportunities";

/**
 * Known relations for enrollment opportunity drawer (Phase 1 scope).
 * Keys are stable layout authoring identifiers — not DB table names exposed to operators.
 */
export const OPPORTUNITY_DRAWER_RELATIONS: Record<string, LayoutRelationDescriptor> = {
    primary_contact: {
        relationKey: "primary_contact",
        targetEntity: "persons",
        cardinality: "one",
        fkColumn: "primary_person_id",
        label: "Primary contact",
    },
    secondary_contact: {
        relationKey: "secondary_contact",
        targetEntity: "persons",
        cardinality: "one",
        fkColumn: "secondary_person_id",
        label: "Secondary contact",
    },
    household_customer: {
        relationKey: "household_customer",
        targetEntity: "customers",
        cardinality: "one",
        fkColumn: "customer_id",
        label: "Household / customer",
    },
    enrollment_site_location: {
        relationKey: "enrollment_site_location",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "site",
        label: "School / site",
    },
    enrollment_classroom_location: {
        relationKey: "enrollment_classroom_location",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "classroom",
        label: "Classroom",
    },
    enrollment_room_location: {
        relationKey: "enrollment_room_location",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "room",
        label: "Room",
    },
    household_address: {
        relationKey: "household_address",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "household_address",
        linkTable: "customer_locations",
        label: "Household address",
    },
    person_address: {
        relationKey: "person_address",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "person_address",
        linkTable: "person_locations",
        label: "Contact address",
    },
    enrollment_children: {
        relationKey: "enrollment_children",
        targetEntity: "customer_members",
        cardinality: "many",
        linkTable: "opportunity_customer_members",
        localKey: "opportunity_id",
        targetKey: "customer_member_id",
        enrollmentChildContext: true,
        label: "Enrollment children",
    },
};

/** Computed projection keys (lifecycle-owned resolvers, §9.1). */
export const OPPORTUNITY_COMPUTE_KEYS = {
    program_category: "enrollment.program_category",
    placement_priority: "enrollment.placement_priority",
    readiness_summary: "enrollment.readiness_summary",
} as const;

export function getOpportunityRelation(relationKey: string): LayoutRelationDescriptor | null {
    return OPPORTUNITY_DRAWER_RELATIONS[relationKey] ?? null;
}
