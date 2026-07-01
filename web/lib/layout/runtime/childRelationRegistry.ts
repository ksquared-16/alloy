/**
 * Child drawer — relation registry (proof / shadow foundation).
 *
 * Child durable truth is customer_member; relationships are modeled as edges,
 * not flat fields. Location roles disambiguate site/classroom/room.
 */

import type { LayoutRelationDescriptor } from "./valueBinding";

/** Anchor entity for child drawer layouts (registry canonical key). */
export const CHILD_LAYOUT_ANCHOR_ENTITY = "customer_members";

/**
 * Known relations for child drawer. Operator-facing label: Child.
 * Parents and primary contact resolve through Person relationships.
 */
export const CHILD_DRAWER_RELATIONS: Record<string, LayoutRelationDescriptor> = {
    household_customer: {
        relationKey: "household_customer",
        targetEntity: "customers",
        cardinality: "one",
        fkColumn: "customer_id",
        label: "Household",
    },
    household_address: {
        relationKey: "household_address",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "household_address",
        linkTable: "customer_locations",
        label: "Household address",
    },
    primary_contact: {
        relationKey: "primary_contact",
        targetEntity: "persons",
        cardinality: "one",
        linkTable: "customer_persons",
        label: "Primary contact",
    },
    parents: {
        relationKey: "parents",
        targetEntity: "persons",
        cardinality: "many",
        linkTable: "customer_persons",
        label: "Parents / guardians",
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
};

/** Computed projections for child drawer (enrollment context, read-only). */
export const CHILD_COMPUTE_KEYS = {
    enrollment_status: "enrollment.enrollment_status",
    program_category: "enrollment.program_category",
} as const;

export function getChildRelation(relationKey: string): LayoutRelationDescriptor | null {
    return CHILD_DRAWER_RELATIONS[relationKey] ?? null;
}
