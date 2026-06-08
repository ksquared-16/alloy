/**
 * Person drawer — relation registry (proof / shadow foundation).
 *
 * Declarative Relation descriptors for layout runtime binding. Does not fetch data;
 * documents how relationship/reference items resolve. Single-hop only.
 */

import type { LayoutRelationDescriptor } from "./valueBinding";

/** Anchor entity for person drawer layouts. */
export const PERSON_LAYOUT_ANCHOR_ENTITY = "persons";

/**
 * Known relations for person drawer (parent/guardian operating context).
 * Keys are stable layout authoring identifiers — not DB table names exposed to operators.
 */
export const PERSON_DRAWER_RELATIONS: Record<string, LayoutRelationDescriptor> = {
    household_customer: {
        relationKey: "household_customer",
        targetEntity: "customers",
        cardinality: "one",
        linkTable: "customer_persons",
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
    person_address: {
        relationKey: "person_address",
        targetEntity: "locations",
        cardinality: "one",
        locationRole: "person_address",
        linkTable: "person_locations",
        label: "Contact address",
    },
    household_children: {
        relationKey: "household_children",
        targetEntity: "customer_members",
        cardinality: "many",
        linkTable: "customer_members",
        localKey: "customer_id",
        label: "Children",
    },
    primary_child: {
        relationKey: "primary_child",
        targetEntity: "customer_members",
        cardinality: "one",
        linkTable: "customer_members",
        label: "Primary child",
    },
};

export function getPersonRelation(relationKey: string): LayoutRelationDescriptor | null {
    return PERSON_DRAWER_RELATIONS[relationKey] ?? null;
}
