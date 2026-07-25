/**
 * Canonical computed field catalog — runtime projections (third field class).
 *
 * Computed fields are not stored directly. They derive from records, relationships,
 * process state, communications, placement, or operational work at runtime.
 *
 * Stack: Registry → Resolver → Renderer → Builder → Publish → Available
 *
 * @see docs/sprints/archive/07_2026/computed-fields-and-fields-page-rebuild.md
 */

import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";
import type { FieldOwnershipKind } from "@/lib/fields/fieldOwnership";

export type ComputedFieldResolverStatus = "now" | "future";

export type ComputedFieldSectionKey =
    | "identity"
    | "contact"
    | "enrollment"
    | "profile"
    | "requirements"
    | "runtime_signals"
    | "communications"
    | "placement"
    | "system";

/** Settings → Fields hub entity tab (operator-facing). */
export type ComputedFieldSettingsEntity =
    | "person"
    | "customer"
    | "inquiry_child"
    | "opportunity"
    | "location";

export type ComputedFieldDefinition = {
    refKey: string;
    label: string;
    /** API entity grain for resolver input (may differ from operator entity). */
    entity_type: string;
    /** Settings hub tab key. */
    settings_entity: ComputedFieldSettingsEntity;
    section_key: ComputedFieldSectionKey;
    description: string;
    field_type: string;
    ownership: Extract<FieldOwnershipKind, "computed">;
    /** Set at catalog merge from field concept audit. */
    concept_kind?: import("@/lib/fields/fieldConceptModel").FieldConceptKind;
    /** Human-readable derivation path. */
    source_derivation: string;
    /** Runtime resolver refKeys checked for surface support (aliases allowed). */
    resolver_ref_keys: readonly string[];
    resolver_owner: string;
    resolver_status: ComputedFieldResolverStatus;
    /** Surfaces where runtime resolution is intended when resolver_status is now. */
    intended_surfaces: readonly FieldConsumerSurface[];
    editable: false;
    configurable: false;
    /** Why unavailable when resolver_status is future or surface blocked. */
    unavailable_reason?: string;
    /** Dependencies for detail inspector. */
    dependencies?: readonly string[];
    /** Operator example value copy. */
    example?: string;
    freshness_note?: string;
    fallback_behavior?: string;
};

const COMPUTED_FIELDS: ComputedFieldDefinition[] = [
    {
        refKey: "child.age",
        label: "Age",
        entity_type: "customer_member",
        settings_entity: "inquiry_child",
        section_key: "profile",
        description: "Child age calculated from date of birth at display time.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Derived from child.date_of_birth (customer_members.dob)",
        resolver_ref_keys: ["child.age", "child.age_band", "child.date_of_birth"],
        resolver_owner: "web/lib/fields/derived/ageFromDateOfBirth.ts",
        resolver_status: "now",
        intended_surfaces: ["drawer", "queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["child.date_of_birth"],
        example: "3 yrs 4 mos",
        freshness_note: "Recomputed on every render from current date.",
        fallback_behavior: "Empty when date of birth is missing.",
    },
    {
        refKey: "child.age_months",
        label: "Age (months)",
        entity_type: "customer_member",
        settings_entity: "inquiry_child",
        section_key: "profile",
        description: "Total age in months for eligibility and banding rules.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Derived from child.date_of_birth",
        resolver_ref_keys: ["child.age_months"],
        resolver_owner: "web/lib/fields/derived/ageFromDateOfBirth.ts",
        resolver_status: "future",
        intended_surfaces: ["drawer", "queue_row", "focus_panel", "business_process"],
        editable: false,
        configurable: false,
        unavailable_reason: "Months-only projection not yet exposed as a standalone resolver refKey.",
        dependencies: ["child.date_of_birth"],
    },
    {
        refKey: "child.profile_completion",
        label: "Profile completion",
        entity_type: "customer_member",
        settings_entity: "inquiry_child",
        section_key: "runtime_signals",
        description: "Percent of required child profile fields completed.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Evaluated from required child profile field coverage",
        resolver_ref_keys: ["child.profile_completion"],
        resolver_owner: "future — profile readiness evaluator",
        resolver_status: "future",
        intended_surfaces: ["drawer", "queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Profile completion evaluator is not wired to field resolution yet.",
    },
    {
        refKey: "child.missing_required_info",
        label: "Missing required info",
        entity_type: "customer_member",
        settings_entity: "inquiry_child",
        section_key: "requirements",
        description: "List of required child profile fields still missing.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Evaluated from lifecycle / layout required field policies",
        resolver_ref_keys: ["child.missing_required_info"],
        resolver_owner: "future — requirement evaluator",
        resolver_status: "future",
        intended_surfaces: ["drawer", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Missing-info aggregation is not yet a resolver-backed projection.",
    },
    {
        refKey: "person.primary_phone",
        label: "Primary phone",
        entity_type: "person",
        settings_entity: "person",
        section_key: "contact",
        description: "Best available phone for the primary contact on a lead or family.",
        field_type: "phone",
        ownership: "computed",
        source_derivation: "Primary contact person record (opportunities.primary_person_id → persons.phone)",
        resolver_ref_keys: ["person.primary_phone", "person.phone"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["drawer", "queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["person.phone", "opportunity.primary_person_id"],
        example: "(555) 123-4567",
        fallback_behavior: "Empty when no primary contact phone is linked.",
    },
    {
        refKey: "person.primary_email",
        label: "Primary email",
        entity_type: "person",
        settings_entity: "person",
        section_key: "contact",
        description: "Best available email for the primary contact on a lead or family.",
        field_type: "email",
        ownership: "computed",
        source_derivation: "Primary contact person record (opportunities.primary_person_id → persons.email)",
        resolver_ref_keys: ["person.primary_email", "person.email"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["drawer", "queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["person.email", "opportunity.primary_person_id"],
        fallback_behavior: "Empty when no primary contact email is linked.",
    },
    {
        refKey: "person.relationship_to_child",
        label: "Relationship to child",
        entity_type: "person",
        settings_entity: "person",
        section_key: "identity",
        description: "How the contact relates to the enrolled child (parent, guardian, etc.).",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Household contact relationship label on lead repeater rows",
        resolver_ref_keys: ["person.relationship", "person.relationship_to_child"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["drawer", "queue_row"],
        editable: false,
        configurable: false,
        dependencies: ["person.role"],
        fallback_behavior: "Empty when relationship is not set on the contact link.",
    },
    {
        refKey: "family.primary_parent",
        label: "Primary parent",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "identity",
        description: "Display name of the primary parent or guardian for the family.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Primary contact on linked lead (person.primary_contact_name projection)",
        resolver_ref_keys: ["person.primary_contact_name", "family.primary_parent"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        dependencies: ["person.primary_contact_name", "opportunity.primary_person_id"],
        example: "Jordan Lee",
    },
    {
        refKey: "family.primary_phone",
        label: "Primary phone",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "contact",
        description: "Primary phone for the family’s main contact.",
        field_type: "phone",
        ownership: "computed",
        source_derivation: "Primary contact phone projection on queue / drawer runtime",
        resolver_ref_keys: ["person.primary_phone", "person.phone", "family.primary_phone"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        dependencies: ["person.primary_phone"],
    },
    {
        refKey: "family.primary_email",
        label: "Primary email",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "contact",
        description: "Primary email for the family’s main contact.",
        field_type: "email",
        ownership: "computed",
        source_derivation: "Primary contact email projection on queue / drawer runtime",
        resolver_ref_keys: ["person.primary_email", "person.email", "family.primary_email"],
        resolver_owner: "web/lib/layout/platformFieldResolutionManifest.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        dependencies: ["person.primary_email"],
    },
    {
        refKey: "family.children_summary",
        label: "Children summary",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "profile",
        description: "Compact summary of children on the lead or family.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Aggregated from inquiry child rows (children.summary queue hydration)",
        resolver_ref_keys: ["children.summary", "children.names", "children.count", "family.children_summary"],
        resolver_owner: "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["inquiry_child.program", "child.display_name"],
        example: "2 children · Emma (3), Noah (1)",
    },
    {
        refKey: "children.names",
        label: "Children names",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "profile",
        description: "Comma-separated child display names for family-grain queue rows and summaries.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Aggregate of related child subjects on the opportunity / household",
        resolver_ref_keys: ["children.names"],
        resolver_owner: "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["child.display_name"],
        example: "Emma, Noah",
    },
    {
        refKey: "children.count",
        label: "Children count",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "profile",
        description: "Number of children associated with the lead or household.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Count of related child subjects on the opportunity / household",
        resolver_ref_keys: ["children.count"],
        resolver_owner: "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        example: "2",
    },
    {
        refKey: "children.summary",
        label: "Children summary",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "profile",
        description: "Short rollup of children (count + names) for compact surfaces.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Aggregate presentation over related child subjects",
        resolver_ref_keys: ["children.summary", "children.names", "children.count"],
        resolver_owner: "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["children.names", "children.count"],
        example: "2 children · Emma, Noah",
    },
    {
        refKey: "family.latest_communication",
        label: "Latest communication",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "communications",
        description: "Most recent inbound or outbound message with the family.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Communications thread summary for household",
        resolver_ref_keys: ["family.latest_communication", "last_activity_summary"],
        resolver_owner: "future — communications v2 thread projection",
        resolver_status: "future",
        intended_surfaces: ["drawer", "focus_panel", "queue_row"],
        editable: false,
        configurable: false,
        unavailable_reason: "Latest communication is not yet exposed as a canonical field resolver refKey.",
    },
    {
        refKey: "family.needs_response",
        label: "Needs response",
        entity_type: "customer",
        settings_entity: "customer",
        section_key: "communications",
        description: "Whether the family has an open message awaiting staff response.",
        field_type: "boolean",
        ownership: "computed",
        source_derivation: "Conversation triage state from communications runtime",
        resolver_ref_keys: ["family.needs_response"],
        resolver_owner: "web/lib/communications/v2/conversationTriage.ts",
        resolver_status: "future",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Conversation triage exists but is not wired as a field resolver projection yet.",
    },
    {
        refKey: "opportunity.current_stage",
        label: "Current stage",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "enrollment",
        description: "Current pipeline stage label for the lead or enrollment record.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Lifecycle stage label on queue row runtime (queue_row.stage_label)",
        resolver_ref_keys: ["queue_row.stage_label", "opportunity.status_label", "opportunity.current_stage"],
        resolver_owner: "web/lib/layout/runtime/resolveCompactSlotDisplay.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        dependencies: ["opportunity.status_key"],
        example: "Tour scheduled",
    },
    {
        refKey: "opportunity.current_work",
        label: "Current work",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "runtime_signals",
        description: "Summary of active work items on the lead.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Work runtime summary on queue row (queue_row.work_summary)",
        resolver_ref_keys: ["queue_row.work_summary", "opportunity.current_work"],
        resolver_owner: "web/lib/layout/runtime/resolveCompactSlotDisplay.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        dependencies: ["opportunity.status_key"],
        example: "Follow up after tour",
    },
    {
        refKey: "opportunity.days_in_stage",
        label: "Days in stage",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "runtime_signals",
        description: "Number of days the lead has been in the current stage.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Stage entered timestamp vs current date",
        resolver_ref_keys: ["opportunity.days_in_stage"],
        resolver_owner: "future — stage duration evaluator",
        resolver_status: "future",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        unavailable_reason: "Stage duration projection is not yet resolver-backed on queue hydration.",
    },
    {
        refKey: "opportunity.next_step",
        label: "Next step",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "runtime_signals",
        description: "Recommended or assigned next action for staff.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Next best action on queue row (opportunity.next_step / queue_row.next_best_action_label)",
        resolver_ref_keys: ["opportunity.next_step", "queue_row.next_best_action_label", "next_step"],
        resolver_owner: "web/lib/layout/queueRecordValidatorAllowList.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        example: "Schedule tour",
    },
    {
        refKey: "opportunity.tour_scheduled_date",
        label: "Tour scheduled date",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "enrollment",
        description: "Scheduled tour date for the lead when set.",
        field_type: "date",
        ownership: "computed",
        source_derivation: "Tour scheduling projection (opportunity.tour_date)",
        resolver_ref_keys: ["opportunity.tour_date", "opportunity.tour_scheduled_date"],
        resolver_owner: "web/lib/layout/queueRecordValidatorAllowList.ts",
        resolver_status: "now",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        dependencies: ["opportunity.tour_date"],
        fallback_behavior: "Empty when no tour is scheduled.",
    },
    {
        refKey: "opportunity.target_start_date",
        label: "Target start date",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "enrollment",
        description: "Earliest desired enrollment start across children on the lead.",
        field_type: "date",
        ownership: "computed",
        source_derivation: "Aggregated from inquiry child start dates",
        resolver_ref_keys: ["opportunity.target_start_date", "inquiry_child.start_date"],
        resolver_owner: "future — enrollment start aggregation",
        resolver_status: "future",
        intended_surfaces: ["queue_row", "focus_panel", "drawer"],
        editable: false,
        configurable: false,
        unavailable_reason: "Lead-level target start aggregation is not yet a resolver-backed projection.",
        dependencies: ["inquiry_child.start_date"],
    },
    {
        refKey: "opportunity.missing_required_info",
        label: "Missing required info",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "requirements",
        description: "Required lead or enrollment fields still missing for progression.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Lifecycle requirement evaluator",
        resolver_ref_keys: ["opportunity.missing_required_info"],
        resolver_owner: "future — lifecycle requirement evaluator",
        resolver_status: "future",
        intended_surfaces: ["drawer", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Missing-info aggregation is not yet exposed as a field resolver.",
    },
    {
        refKey: "opportunity.readiness_status",
        label: "Readiness status",
        entity_type: "opportunity",
        settings_entity: "opportunity",
        section_key: "runtime_signals",
        description: "Overall readiness signal for enrollment progression.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Readiness evaluator across profile, documents, and stage requirements",
        resolver_ref_keys: ["opportunity.readiness_status"],
        resolver_owner: "future — readiness evaluator",
        resolver_status: "future",
        intended_surfaces: ["queue_row", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Readiness status is not yet a resolver-backed projection.",
    },
    {
        refKey: "location.capacity_summary",
        label: "Capacity summary",
        entity_type: "location",
        settings_entity: "location",
        section_key: "placement",
        description: "Human-readable capacity summary for the site.",
        field_type: "text",
        ownership: "computed",
        source_derivation: "Placement capacity tables and room assignments",
        resolver_ref_keys: ["location.capacity_summary"],
        resolver_owner: "future — placement capacity projection",
        resolver_status: "future",
        intended_surfaces: ["drawer", "table", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Site capacity summary is not yet a resolver-backed field projection.",
    },
    {
        refKey: "location.open_spots",
        label: "Open spots",
        entity_type: "location",
        settings_entity: "location",
        section_key: "placement",
        description: "Count of open enrollment spots at the site.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Placement availability counters",
        resolver_ref_keys: ["location.open_spots"],
        resolver_owner: "future — placement availability projection",
        resolver_status: "future",
        intended_surfaces: ["drawer", "table", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Open spots counter is not yet a resolver-backed field projection.",
    },
    {
        refKey: "location.waitlist_count",
        label: "Waitlist count",
        entity_type: "location",
        settings_entity: "location",
        section_key: "placement",
        description: "Number of families waiting for placement at the site.",
        field_type: "number",
        ownership: "computed",
        source_derivation: "Waitlist queue counts by site",
        resolver_ref_keys: ["location.waitlist_count"],
        resolver_owner: "future — waitlist count projection",
        resolver_status: "future",
        intended_surfaces: ["drawer", "table", "focus_panel"],
        editable: false,
        configurable: false,
        unavailable_reason: "Waitlist count is not yet a resolver-backed field projection.",
    },
];

const COMPUTED_BY_REF = new Map(COMPUTED_FIELDS.map((f) => [f.refKey, f]));

export const COMPUTED_FIELD_CATALOG: readonly ComputedFieldDefinition[] = COMPUTED_FIELDS;

export function computedFieldByRefKey(refKey: string): ComputedFieldDefinition | undefined {
    return COMPUTED_BY_REF.get(refKey.trim());
}

export function computedFieldsForSettingsEntity(entity: ComputedFieldSettingsEntity): ComputedFieldDefinition[] {
    return COMPUTED_FIELDS.filter((f) => f.settings_entity === entity);
}

/** Child tab merges customer_member + inquiry_child computed fields. */
export function computedFieldsForChildSettingsTab(): ComputedFieldDefinition[] {
    return COMPUTED_FIELDS.filter(
        (f) => f.settings_entity === "inquiry_child" || f.entity_type === "customer_member",
    );
}

export function isComputedFieldRefKey(refKey: string): boolean {
    return COMPUTED_BY_REF.has(refKey.trim());
}

export function isComputedFieldResolverReady(refKey: string): boolean {
    const entry = computedFieldByRefKey(refKey);
    return entry?.resolver_status === "now";
}

export const COMPUTED_FIELD_SECTION_LABELS: Readonly<Record<ComputedFieldSectionKey, string>> = {
    identity: "Identity",
    contact: "Contact",
    enrollment: "Enrollment",
    profile: "Profile",
    requirements: "Requirements",
    runtime_signals: "Runtime Signals",
    communications: "Communications",
    placement: "Placement",
    system: "System",
};

export const SETTINGS_ENTITY_FIELD_EXPLANATIONS: Readonly<Record<ComputedFieldSettingsEntity, string>> = {
    person:
        "Person fields describe contacts and guardians — identity, contact details, and relationship signals used across forms, records, queues, and operational workflows.",
    customer:
        "Family fields describe the household — identity, contact projections, children summaries, and communication signals used across leads, queues, and operational workflows.",
    inquiry_child:
        "Child fields describe the child profile, enrollment context, requirements, and runtime readiness signals used across forms, records, queues, and operational workflows.",
    opportunity:
        "Lead fields describe enrollment pipeline state — stage, work, next steps, tour timing, and readiness signals used across queues, focus panels, and business processes.",
    location:
        "Location fields describe site capacity, placement availability, and operational signals used across enrollment, placement, and scheduling workflows.",
};

export const SETTINGS_ENTITY_SURFACES: Readonly<Record<ComputedFieldSettingsEntity, string>> = {
    person: "Forms, record drawers, tables, and contact pickers",
    customer: "Family records, lead queues, focus panels, and communications",
    inquiry_child: "Child profiles, enrollment forms, lead drawers, and queues",
    opportunity: "Lead queues, focus panels, business processes, and record drawers",
    location: "Site settings, placement workflows, and enrollment configuration",
};
