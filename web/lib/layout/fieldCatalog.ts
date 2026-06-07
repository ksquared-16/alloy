/**
 * Layout V2 — Field & Widget Catalog (Layout Builder V1).
 *
 * Normalizes fields from several sources into a single shape the builder's
 * field picker can use, restricted to the V1 entity groups (Lead/Opportunity,
 * Person/Contact, Child, Children Inquiry). Layout entity_type stays
 * `opportunities`; fields reference related entities via NAMESPACED refKeys
 * (e.g. `opportunity.status_key`, `person.primary_phone`, `child.name`).
 *
 * Normalized field entry:
 *   { entityKey, entityLabel, fieldKey, fieldLabel, fieldType, refKey }
 *
 * Where exact hydration of a related field isn't available yet, the layout
 * still preserves the intended source (refKey) and the proof renderer shows a
 * placeholder.
 */

export type LayoutEntityGroupKey = "opportunity" | "person" | "child" | "child_inquiry";

export interface LayoutCatalogField {
    /** Opaque display-grouping id + sourceEntity hint (string so non-Lead
     *  surfaces — e.g. waitlist — can use their own bucket keys). */
    entityKey: string;
    entityLabel: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    /** Namespaced source ref used as the layout item refKey. */
    refKey: string;
}

export interface LayoutCatalogGroup {
    entityKey: string;
    entityLabel: string;
    fields: LayoutCatalogField[];
}

export const WIDGET_CATEGORIES = ["Work", "Communication", "Enrollment", "Waitlist", "System"] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

export interface LayoutCatalogWidget {
    widgetKey: string;
    label: string;
    defaultDisplayMode?: string;
    /** User-facing category for grouping in the picker. */
    category?: WidgetCategory;
    /** Short user-facing description (no raw keys). */
    description?: string;
    /** Surfaces where this widget is meaningful; elsewhere it's shown disabled. */
    relevantSurfaces?: ("drawer" | "queue")[];
}

export interface LayoutFieldCatalog {
    groups: LayoutCatalogGroup[];
    widgets: LayoutCatalogWidget[];
}

/** Field groups for the Lead/Opportunity drawer, in display order (user-facing). */
export const LAYOUT_ENTITY_GROUPS: { entityKey: LayoutEntityGroupKey; entityLabel: string }[] = [
    { entityKey: "opportunity", entityLabel: "Lead" },
    { entityKey: "person", entityLabel: "Contact / Parent" },
    { entityKey: "child", entityLabel: "Child" },
    { entityKey: "child_inquiry", entityLabel: "Child · Enrollment" },
];

/**
 * GLOBAL widget catalog — one clean, categorized list shown on every surface.
 * Widgets never disappear by surface; those not meaningful on the current
 * surface are shown disabled with helper text (via `relevantSurfaces`). Raw
 * widget keys are never shown to the user — only friendly label + description.
 */
export const GLOBAL_WIDGET_CATALOG: LayoutCatalogWidget[] = [
    // Work
    { widgetKey: "tasks", label: "Tasks", category: "Work", description: "Open tasks for this record", defaultDisplayMode: "list" },
    { widgetKey: "reminders", label: "Reminders", category: "Work", description: "Upcoming reminders", defaultDisplayMode: "list" },
    { widgetKey: "actions", label: "Actions", category: "Work", description: "Quick action buttons", defaultDisplayMode: "buttons" },
    // Communication
    { widgetKey: "recent_communication", label: "Recent Communication", category: "Communication", description: "Latest messages & calls", defaultDisplayMode: "feed" },
    { widgetKey: "notes", label: "Notes", category: "Communication", description: "Internal notes", defaultDisplayMode: "list" },
    // Enrollment
    { widgetKey: "tour_summary", label: "Tour Summary", category: "Enrollment", description: "Tour date & follow-up", defaultDisplayMode: "summary" },
    { widgetKey: "children_list", label: "Children List", category: "Enrollment", description: "Children on this inquiry", defaultDisplayMode: "list" },
    // Waitlist (queue-meaningful; shown disabled on drawer surfaces)
    { widgetKey: "waitlist_position", label: "Waitlist Position", category: "Waitlist", description: "Computed waitlist position", relevantSurfaces: ["queue"], defaultDisplayMode: "badge" },
    { widgetKey: "waitlist_tier", label: "Waitlist Tier", category: "Waitlist", description: "Priority tier / bucket", relevantSurfaces: ["queue"], defaultDisplayMode: "badge" },
    { widgetKey: "waitlisted_since", label: "Waitlisted Since", category: "Waitlist", description: "Date added to the waitlist", relevantSurfaces: ["queue"], defaultDisplayMode: "text" },
    { widgetKey: "waitlist_adjustment", label: "Waitlist Adjustment", category: "Waitlist", description: "Manually adjust position", relevantSurfaces: ["queue"], defaultDisplayMode: "control" },
    { widgetKey: "sibling_context", label: "Sibling Context", category: "Waitlist", description: "Siblings also waitlisted", relevantSurfaces: ["queue"], defaultDisplayMode: "text" },
    { widgetKey: "waitlist_override", label: "Override Flags", category: "Waitlist", description: "Active overrides on this candidate", relevantSurfaces: ["queue"], defaultDisplayMode: "badge" },
    { widgetKey: "capacity_recommendation", label: "Capacity Recommendation", category: "Waitlist", description: "Suggested seat fill (future)", relevantSurfaces: ["queue"], defaultDisplayMode: "summary" },
];

/** Back-compat alias (lead drawer/queue presets reference widgets by key). */
export const LAYOUT_WIDGET_CATALOG: LayoutCatalogWidget[] = GLOBAL_WIDGET_CATALOG;

export function makeRefKey(entityKey: LayoutEntityGroupKey, fieldKey: string): string {
    return `${entityKey}.${fieldKey}`;
}

/** Split a namespaced refKey into { entityKey, fieldKey }. Bare keys → opportunity. */
export function parseRefKey(refKey: string): { entityKey: string; fieldKey: string } {
    const dot = refKey.indexOf(".");
    if (dot === -1) return { entityKey: "opportunity", fieldKey: refKey };
    return { entityKey: refKey.slice(0, dot), fieldKey: refKey.slice(dot + 1) };
}

const ENTITY_LABEL: Record<LayoutEntityGroupKey, string> = {
    opportunity: "Lead",
    person: "Contact / Parent",
    child: "Child",
    child_inquiry: "Child · Enrollment",
};

function field(
    entityKey: LayoutEntityGroupKey,
    fieldKey: string,
    fieldLabel: string,
    fieldType: string,
): LayoutCatalogField {
    return {
        entityKey,
        entityLabel: ENTITY_LABEL[entityKey],
        fieldKey,
        fieldLabel,
        fieldType,
        refKey: makeRefKey(entityKey, fieldKey),
    };
}

/**
 * Curated fallback fields per group, used when no field_definitions source is
 * available (child / children-inquiry have no clean field-def surface today,
 * and opportunity/person fall back to these if the org has no field defs).
 */
export const CURATED_FIELDS: Record<LayoutEntityGroupKey, LayoutCatalogField[]> = {
    opportunity: [
        field("opportunity", "status_key", "Status", "status"),
        field("opportunity", "location", "Location", "text"),
        field("opportunity", "source", "Source", "text"),
        field("opportunity", "channel", "Channel", "text"),
        field("opportunity", "campaign", "Campaign", "text"),
        field("opportunity", "tour_status", "Tour status", "status"),
        field("opportunity", "tour_date", "Tour date", "date"),
        field("opportunity", "job_date", "Requested date", "date"),
        field("opportunity", "customer_notes", "Notes", "text"),
    ],
    person: [
        field("person", "primary_contact_name", "Primary contact name", "text"),
        field("person", "primary_phone", "Phone", "phone"),
        field("person", "primary_email", "Email", "text"),
        field("person", "secondary_contact_name", "Secondary contact name", "text"),
        field("person", "secondary_phone", "Secondary phone", "phone"),
    ],
    child: [
        field("child", "name", "Child name", "text"),
        field("child", "program", "Program", "text"),
        field("child", "desired_start_date", "Desired start date", "date"),
        field("child", "status", "Status", "status"),
        field("child", "age_band", "Age band", "text"),
    ],
    child_inquiry: [
        field("child_inquiry", "child_name", "Child name", "text"),
        field("child_inquiry", "program", "Program", "text"),
        field("child_inquiry", "desired_start_date", "Desired start date", "date"),
        field("child_inquiry", "status", "Status", "status"),
    ],
};

/**
 * Waitlist Candidate Card catalog (entity_type = placement_candidate).
 * Fields use flat dot-path refKeys matching `waitlistCardVmToProofRecord()`.
 * Bucket `entityKey`s reuse existing valid keys purely as display groupings;
 * the refKey (not entityKey) drives resolution. Presentation-only.
 */
function wlField(entityKey: string, entityLabel: string, refKey: string, fieldLabel: string, fieldType: string): LayoutCatalogField {
    return { entityKey, entityLabel, fieldKey: refKey, fieldLabel, fieldType, refKey };
}

/**
 * Full Waitlist Candidate Card catalog — the builder must NOT artificially limit
 * fields (Goal 4). Grouped into the operator-facing categories. refKeys are flat
 * dot-paths matching `waitlistCardVmToProofRecord()`; runtime-computed values
 * (tier/position) are exposed too — they render blank until the runtime supplies
 * them. Presentation only.
 */
export const WAITLIST_CANDIDATE_CATALOG_GROUPS: LayoutCatalogGroup[] = [
    {
        entityKey: "placement_candidate",
        entityLabel: "Candidate",
        fields: [
            wlField("placement_candidate", "Candidate", "candidateId", "Candidate ID", "text"),
            wlField("placement_candidate", "Candidate", "waitlist.status", "Candidate status", "status"),
            wlField("placement_candidate", "Candidate", "waitlist.waitSince", "Waitlisted since", "text"),
            wlField("placement_candidate", "Candidate", "waitlist.desiredStartDate", "Desired start", "date"),
        ],
    },
    {
        entityKey: "wl_child",
        entityLabel: "Child",
        fields: [
            wlField("wl_child", "Child", "child.name", "Child name", "text"),
            wlField("wl_child", "Child", "child.ageLabel", "Age", "text"),
            wlField("wl_child", "Child", "child.birthdate", "Birthdate", "date"),
            wlField("wl_child", "Child", "child.desiredStartDate", "Desired start", "date"),
            wlField("wl_child", "Child", "child.schedulePreference", "Schedule preference", "text"),
        ],
    },
    {
        entityKey: "wl_parent",
        entityLabel: "Parent",
        fields: [
            wlField("wl_parent", "Parent", "household.primaryContactName", "Primary contact", "text"),
            wlField("wl_parent", "Parent", "household.phone", "Phone", "phone"),
            wlField("wl_parent", "Parent", "household.email", "Email", "text"),
        ],
    },
    {
        entityKey: "wl_household",
        entityLabel: "Household",
        fields: [
            wlField("wl_household", "Household", "household.name", "Household name", "text"),
        ],
    },
    {
        entityKey: "wl_location",
        entityLabel: "Location",
        fields: [
            wlField("wl_location", "Location", "household.locationName", "Location", "text"),
        ],
    },
    {
        entityKey: "wl_program",
        entityLabel: "Program",
        fields: [
            wlField("wl_program", "Program", "child.programLabel", "Program / classroom", "text"),
            wlField("wl_program", "Program", "waitlist.cohortLabel", "Cohort", "text"),
            wlField("wl_program", "Program", "waitlist.cohortSectionTitle", "Cohort section", "text"),
        ],
    },
    {
        entityKey: "wl_lifecycle",
        entityLabel: "Lifecycle",
        fields: [
            wlField("wl_lifecycle", "Lifecycle", "waitlist.status", "Lifecycle status", "status"),
        ],
    },
    {
        entityKey: "wl_waitlist",
        entityLabel: "Waitlist",
        fields: [
            wlField("wl_waitlist", "Waitlist", "waitlist.tierLabel", "Priority tier", "status"),
            wlField("wl_waitlist", "Waitlist", "waitlist.positionLabel", "Position", "text"),
            wlField("wl_waitlist", "Waitlist", "waitlist.waitSince", "Waitlisted since", "text"),
            wlField("wl_waitlist", "Waitlist", "overrides.flags", "Override flags", "status"),
            wlField("wl_waitlist", "Waitlist", "overrides.reason", "Override reason", "text"),
        ],
    },
    {
        entityKey: "wl_system",
        entityLabel: "System",
        fields: [
            wlField("wl_system", "System", "candidateId", "Candidate ID", "text"),
            wlField("wl_system", "System", "opportunityId", "Opportunity ID", "text"),
            wlField("wl_system", "System", "householdId", "Household ID", "text"),
            wlField("wl_system", "System", "childId", "Child ID", "text"),
        ],
    },
];

/**
 * Context widgets — reusable across queue cards (Context Area). The same engine
 * powers Lead and Waitlist; these widgets are simply placeable in any card's
 * Context Area. NOT fields. (Goal 3/5 — one engine, different widgets.)
 */
export const CONTEXT_WIDGET_CATALOG: LayoutCatalogWidget[] = [
    { widgetKey: "waitlist_position", label: "Position", defaultDisplayMode: "badge" },
    { widgetKey: "waitlist_tier", label: "Priority Tier", defaultDisplayMode: "badge" },
    { widgetKey: "waitlisted_since", label: "Waitlisted Since", defaultDisplayMode: "text" },
    { widgetKey: "waitlist_adjustment", label: "Adjust Position", defaultDisplayMode: "control" },
    { widgetKey: "sibling_context", label: "Sibling Context", defaultDisplayMode: "text" },
    { widgetKey: "waitlist_override", label: "Override", defaultDisplayMode: "badge" },
    { widgetKey: "capacity_recommendation", label: "Capacity Recommendation", defaultDisplayMode: "summary" },
];

/** Waitlist widget catalog — Context widgets the candidate card can place. */
export const WAITLIST_WIDGET_CATALOG: LayoutCatalogWidget[] = CONTEXT_WIDGET_CATALOG;

/** Person (Contact / Parent) drawer field catalog — user-facing groups. */
export const PERSON_DRAWER_CATALOG_GROUPS: LayoutCatalogGroup[] = [
    {
        entityKey: "person",
        entityLabel: "Contact / Parent",
        fields: [
            wlField("person", "Contact / Parent", "person.primary_contact_name", "Full name", "text"),
            wlField("person", "Contact / Parent", "person.primary_phone", "Phone", "phone"),
            wlField("person", "Contact / Parent", "person.primary_email", "Email", "text"),
            wlField("person", "Contact / Parent", "person.relationship", "Relationship / type", "text"),
            wlField("person", "Contact / Parent", "person.secondary_contact_name", "Secondary contact", "text"),
        ],
    },
    {
        entityKey: "household",
        entityLabel: "Household",
        fields: [
            wlField("household", "Household", "household.name", "Household", "text"),
            wlField("household", "Household", "household.locationName", "Location", "text"),
        ],
    },
    {
        entityKey: "child",
        entityLabel: "Child",
        fields: [
            wlField("child", "Child", "child.name", "Child name", "text"),
            wlField("child", "Child", "child.status", "Status", "status"),
        ],
    },
    {
        entityKey: "system",
        entityLabel: "System",
        fields: [wlField("system", "System", "person.id", "Person ID", "text")],
    },
];

/** Child drawer field catalog — durable child.* + enrollment inquiry_child.*. */
export const CHILD_DRAWER_CATALOG_GROUPS: LayoutCatalogGroup[] = [
    {
        entityKey: "child",
        entityLabel: "Child",
        fields: [
            wlField("child", "Child", "child.name", "Child name", "text"),
            wlField("child", "Child", "child.date_of_birth", "Date of birth", "date"),
            wlField("child", "Child", "child.age_band", "Age band", "text"),
            wlField("child", "Child", "child.status", "Status", "status"),
        ],
    },
    {
        entityKey: "inquiry_child",
        entityLabel: "Child · Enrollment",
        fields: [
            wlField("inquiry_child", "Child · Enrollment", "inquiry_child.program", "Program", "text"),
            wlField("inquiry_child", "Child · Enrollment", "inquiry_child.desired_start_date", "Desired start", "date"),
            wlField("inquiry_child", "Child · Enrollment", "inquiry_child.schedule", "Schedule", "text"),
            wlField("inquiry_child", "Child · Enrollment", "inquiry_child.outcome_status_key", "Enrollment status", "status"),
        ],
    },
    {
        entityKey: "person",
        entityLabel: "Contact / Parent",
        fields: [
            wlField("person", "Contact / Parent", "person.primary_contact_name", "Primary contact", "text"),
            wlField("person", "Contact / Parent", "person.primary_phone", "Phone", "phone"),
            wlField("person", "Contact / Parent", "person.primary_email", "Email", "text"),
        ],
    },
    {
        entityKey: "location",
        entityLabel: "Location",
        fields: [wlField("location", "Location", "child.location", "Location", "text")],
    },
];

/** Catalog groups for a layout entity type (curated, user-facing groups). */
export function catalogGroupsForEntityType(entityType: string): LayoutCatalogGroup[] | null {
    if (entityType === "placement_candidate") return WAITLIST_CANDIDATE_CATALOG_GROUPS;
    if (entityType === "person") return PERSON_DRAWER_CATALOG_GROUPS;
    if (entityType === "child") return CHILD_DRAWER_CATALOG_GROUPS;
    return null; // null → caller uses the default LAYOUT_ENTITY_GROUPS (field-def backed)
}

/**
 * Widget catalog — ONE global, categorized list for EVERY surface (widgets do
 * not disappear by surface). Callers group by category and disable widgets not
 * relevant to the current surface (via `relevantSurfaces`).
 */
export function catalogWidgetsForEntityType(): LayoutCatalogWidget[] {
    return GLOBAL_WIDGET_CATALOG;
}

/** Map a DB field_definitions row into a normalized catalog field for a group. */
export function fieldDefToCatalog(
    entityKey: LayoutEntityGroupKey,
    row: { field_key: string; label?: string | null; field_type?: string | null },
): LayoutCatalogField {
    return field(
        entityKey,
        row.field_key,
        (row.label ?? row.field_key).trim() || row.field_key,
        (row.field_type ?? "text") || "text",
    );
}
