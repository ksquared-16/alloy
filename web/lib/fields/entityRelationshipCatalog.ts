/**
 * Entity relationship catalog for Settings → Data Model workspace.
 *
 * Parents, guardians, emergency contacts, etc. are Person roles — not separate entities.
 */

import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type EntityRelationshipTarget =
    | SettingsHubEntityKey
    | "document";

export type EntityRelationshipDefinition = {
    id: string;
    label: string;
    target_label: string;
    target: EntityRelationshipTarget;
    role_note?: string;
    cardinality: string;
    required: boolean;
    where_used: readonly string[];
};

const CHILD_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "child.parent_guardian",
        label: "Parent / Guardian",
        target_label: "Person",
        target: "person",
        role_note: "Person role on the family — not a separate entity type.",
        cardinality: "1..N",
        required: true,
        where_used: ["Forms", "Drawers", "Focus Panel", "Business Processes"],
    },
    {
        id: "child.emergency_contact",
        label: "Emergency Contact",
        target_label: "Person",
        target: "person",
        role_note: "Person role — emergency contact on the family.",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers"],
    },
    {
        id: "child.family",
        label: "Family",
        target_label: "Family",
        target: "customer",
        cardinality: "1",
        required: true,
        where_used: ["Drawers", "Queues", "Focus Panel"],
    },
    {
        id: "child.enrollment_record",
        label: "Enrollment Record",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Drawers", "Queues", "Business Processes"],
    },
    {
        id: "child.documents",
        label: "Documents",
        target_label: "Document",
        target: "document",
        cardinality: "0..N",
        required: false,
        where_used: ["Documents & Packets", "Forms"],
    },
];

const PERSON_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "person.family",
        label: "Family membership",
        target_label: "Family",
        target: "customer",
        role_note: "Contact linked to a household with a role (parent, guardian, billing, etc.).",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues"],
    },
    {
        id: "person.child",
        label: "Related child",
        target_label: "Child",
        target: "inquiry_child",
        role_note: "Relationship to a child on an enrollment record.",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Focus Panel"],
    },
];

const FAMILY_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "family.primary_contact",
        label: "Primary contact",
        target_label: "Person",
        target: "person",
        role_note: "Primary parent or guardian — a Person role.",
        cardinality: "0..1",
        required: false,
        where_used: ["Queues", "Focus Panel", "Drawers"],
    },
    {
        id: "family.children",
        label: "Children",
        target_label: "Child",
        target: "inquiry_child",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues", "Focus Panel"],
    },
    {
        id: "family.enrollment_records",
        label: "Enrollment records",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Queues", "Business Processes"],
    },
];

const LEAD_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "opportunity.family",
        label: "Family",
        target_label: "Family",
        target: "customer",
        cardinality: "1",
        required: true,
        where_used: ["Drawers", "Queues"],
    },
    {
        id: "opportunity.primary_contact",
        label: "Primary contact",
        target_label: "Person",
        target: "person",
        role_note: "Person role — primary parent or guardian on the lead.",
        cardinality: "0..1",
        required: false,
        where_used: ["Queues", "Focus Panel", "Forms"],
    },
    {
        id: "opportunity.children",
        label: "Children on lead",
        target_label: "Child",
        target: "inquiry_child",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues", "Focus Panel"],
    },
];

const LOCATION_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "location.programs",
        label: "Programs",
        target_label: "Program",
        target: "location",
        cardinality: "0..N",
        required: false,
        where_used: ["Enrollment", "Placement"],
    },
    {
        id: "location.enrollment_records",
        label: "Enrollment at site",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Queues", "Placement"],
    },
];

export const ENTITY_RELATIONSHIPS_BY_HUB: Readonly<Record<SettingsHubEntityKey, readonly EntityRelationshipDefinition[]>> = {
    inquiry_child: CHILD_RELATIONSHIPS,
    person: PERSON_RELATIONSHIPS,
    customer: FAMILY_RELATIONSHIPS,
    opportunity: LEAD_RELATIONSHIPS,
    location: LOCATION_RELATIONSHIPS,
};

export function relationshipsForHubEntity(entity: SettingsHubEntityKey): readonly EntityRelationshipDefinition[] {
    return ENTITY_RELATIONSHIPS_BY_HUB[entity] ?? [];
}

/** Internal API grain label shown muted in entity header — operator-facing name is separate. */
export const HUB_ENTITY_SYSTEM_GRAIN_LABEL: Readonly<Partial<Record<SettingsHubEntityKey, string>>> = {
    inquiry_child: "Customer Member",
    customer: "Customer",
    opportunity: "Opportunity",
    person: "Person",
    location: "Location",
};

export const DATA_MODEL_USAGE_SURFACES = [
    { id: "forms", label: "Forms", description: "Intake and enrollment forms" },
    { id: "drawers", label: "Drawers", description: "Record detail drawers" },
    { id: "focus_panel", label: "Focus Panels", description: "Side evidence panels on work records" },
    { id: "queue_row", label: "Queue Rows", description: "Queue preview rows" },
    { id: "business_process", label: "Business Processes", description: "Stage requirements and readiness" },
    { id: "documents", label: "Documents & Packets", description: "Enrollment documents and packets" },
] as const;

export const DATA_MODEL_BUILDER_AVAILABILITY = [
    { id: "surface_builder", label: "Surface Builder", available: true },
    { id: "forms_builder", label: "Forms Builder", available: true },
    { id: "business_process_builder", label: "Business Process Builder", available: true },
    { id: "documents_packets", label: "Documents / Packets", available: true },
    { id: "reports", label: "Reports", available: false, reason: "Report field picker not yet unified with Data Model catalog." },
] as const;
