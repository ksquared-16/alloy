/**
 * Entity relationship catalog for Settings → Data Model workspace.
 *
 * Parents, guardians, emergency contacts, etc. are Person roles — not separate entities.
 */

import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type EntityRelationshipTarget =
    | SettingsHubEntityKey
    | "document";

export type EntityRelationshipKind = "platform" | "custom";

export type EntityRelationshipDefinition = {
    id: string;
    label: string;
    /** Business connection language shown in rows (not API grain names). */
    connection_label: string;
    /** Plain-language meaning for operators. */
    meaning: string;
    target_label: string;
    target: EntityRelationshipTarget;
    role_note?: string;
    cardinality: string;
    required: boolean;
    where_used: readonly string[];
    kind: EntityRelationshipKind;
};

const CHILD_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "child.parent_guardian",
        label: "Parent / Guardian",
        connection_label: "Family member",
        meaning: "A parent or guardian linked to this child's household.",
        target_label: "Person",
        target: "person",
        role_note: "Person role on the family — not a separate entity type.",
        cardinality: "1..N",
        required: true,
        where_used: ["Forms", "Drawers", "Focus Panel", "Business Processes"],
        kind: "platform",
    },
    {
        id: "child.emergency_contact",
        label: "Emergency Contact",
        connection_label: "Family member",
        meaning: "Someone designated as an emergency contact for this child.",
        target_label: "Person",
        target: "person",
        role_note: "Person role — emergency contact on the family.",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers"],
        kind: "platform",
    },
    {
        id: "child.family",
        label: "Family",
        connection_label: "Household",
        meaning: "The household this child belongs to.",
        target_label: "Family",
        target: "customer",
        cardinality: "1",
        required: true,
        where_used: ["Drawers", "Queues", "Focus Panel"],
        kind: "platform",
    },
    {
        id: "child.enrollment_record",
        label: "Enrollment Record",
        connection_label: "Lead / enrollment",
        meaning: "An enrollment or waitlist record for this child.",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Drawers", "Queues", "Business Processes"],
        kind: "platform",
    },
    {
        id: "child.documents",
        label: "Documents",
        connection_label: "Document packet",
        meaning: "Forms and documents collected for this child.",
        target_label: "Document",
        target: "document",
        cardinality: "0..N",
        required: false,
        where_used: ["Documents & Packets", "Forms"],
        kind: "platform",
    },
];

const PERSON_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "person.family",
        label: "Family membership",
        connection_label: "Household contact",
        meaning: "How this person participates on a family — parent, guardian, billing, and other roles.",
        target_label: "Family",
        target: "customer",
        role_note: "Contact linked to a household with a role (parent, guardian, billing, etc.).",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues"],
        kind: "platform",
    },
    {
        id: "person.child",
        label: "Related child",
        connection_label: "Child contact",
        meaning: "A child this person is connected to on an enrollment record.",
        target_label: "Child",
        target: "inquiry_child",
        role_note: "Relationship to a child on an enrollment record.",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Focus Panel"],
        kind: "platform",
    },
];

const FAMILY_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "family.primary_contact",
        label: "Primary contact",
        connection_label: "Household contact",
        meaning: "The main parent or guardian Alloy should treat as primary on this family.",
        target_label: "Person",
        target: "person",
        role_note: "Primary parent or guardian — a Person role.",
        cardinality: "0..1",
        required: false,
        where_used: ["Queues", "Focus Panel", "Drawers"],
        kind: "platform",
    },
    {
        id: "family.children",
        label: "Children",
        connection_label: "Child contact",
        meaning: "Children enrolled or inquiring through this household.",
        target_label: "Child",
        target: "inquiry_child",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues", "Focus Panel"],
        kind: "platform",
    },
    {
        id: "family.enrollment_records",
        label: "Enrollment records",
        connection_label: "Lead / enrollment",
        meaning: "Active and historical enrollment records for this family.",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Queues", "Business Processes"],
        kind: "platform",
    },
];

const LEAD_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "opportunity.family",
        label: "Family",
        connection_label: "Household",
        meaning: "The household this lead or enrollment belongs to.",
        target_label: "Family",
        target: "customer",
        cardinality: "1",
        required: true,
        where_used: ["Drawers", "Queues"],
        kind: "platform",
    },
    {
        id: "opportunity.primary_contact",
        label: "Primary contact",
        connection_label: "Household contact",
        meaning: "The primary parent or guardian on this lead.",
        target_label: "Person",
        target: "person",
        role_note: "Person role — primary parent or guardian on the lead.",
        cardinality: "0..1",
        required: false,
        where_used: ["Queues", "Focus Panel", "Forms"],
        kind: "platform",
    },
    {
        id: "opportunity.children",
        label: "Children on lead",
        connection_label: "Child contact",
        meaning: "Children included on this enrollment or waitlist record.",
        target_label: "Child",
        target: "inquiry_child",
        cardinality: "0..N",
        required: false,
        where_used: ["Forms", "Drawers", "Queues", "Focus Panel"],
        kind: "platform",
    },
];

const LOCATION_RELATIONSHIPS: EntityRelationshipDefinition[] = [
    {
        id: "location.programs",
        label: "Programs",
        connection_label: "Program offering",
        meaning: "Programs offered at this site or location.",
        target_label: "Program",
        target: "location",
        cardinality: "0..N",
        required: false,
        where_used: ["Enrollment", "Placement"],
        kind: "platform",
    },
    {
        id: "location.enrollment_records",
        label: "Enrollment at site",
        connection_label: "Lead / enrollment",
        meaning: "Enrollment records associated with this location.",
        target_label: "Lead / Enrollment",
        target: "opportunity",
        cardinality: "0..N",
        required: false,
        where_used: ["Queues", "Placement"],
        kind: "platform",
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

export function platformRelationshipsForHubEntity(entity: SettingsHubEntityKey): readonly EntityRelationshipDefinition[] {
    return relationshipsForHubEntity(entity).filter((r) => r.kind === "platform");
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

export type CustomRelationshipVocabulary = {
    id: string;
    key: string;
    label: string;
    description: string | null;
    kind: "family_role" | "person_relationship";
    is_active: boolean;
};
