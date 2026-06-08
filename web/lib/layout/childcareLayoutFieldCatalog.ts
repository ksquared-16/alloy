/**
 * Childcare layout field catalog — operator-facing starter allowlist.
 *
 * Defines clean Lead / Child / Parent / Household / Location fields for
 * /adminV2/settings/layouts. Internal refKeys (e.g. inquiry_child.*) remain;
 * picker labels and grouping are operator-facing only.
 */

import type { LayoutPickerAnchorEntity } from "./platformFieldResolutionManifest";

export type ChildcareOperatorEntity = "lead" | "child" | "parent" | "household" | "location";

export type ChildcareCatalogFieldEntry = {
    refKey: string;
    operatorEntity: ChildcareOperatorEntity;
    pickerLabel: string;
    fieldType: string;
    sortOrder: number;
    defEntityType?: string;
    defFieldKey?: string;
    computed?: boolean;
    layoutAnchors: LayoutPickerAnchorEntity[];
};

export const CHILDCARE_OPERATOR_ENTITY_LABELS: Record<ChildcareOperatorEntity, string> = {
    lead: "Lead",
    child: "Child",
    parent: "Parent / Contact",
    household: "Household",
    location: "Location",
};

export const CHILDCARE_OPERATOR_ENTITY_ORDER: ChildcareOperatorEntity[] = [
    "lead",
    "child",
    "parent",
    "household",
    "location",
];

export const CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP: Record<string, string> = {
    opportunity: "opportunity",
    person: "person",
    child: "person",
    inquiry_child: "inquiry_child",
    customer: "customer",
    location: "location",
};

function lead(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
    opts?: { computed?: boolean; anchors?: LayoutPickerAnchorEntity[] },
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "lead",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "opportunity",
        defFieldKey,
        computed: opts?.computed,
        layoutAnchors: opts?.anchors ?? ["opportunities"],
    };
}

function childField(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    def: { entityType: string; fieldKey: string } | { computed: true },
    anchors: LayoutPickerAnchorEntity[] = ["opportunities", "child"],
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "child",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "computed" in def ? undefined : def.entityType,
        defFieldKey: "computed" in def ? undefined : def.fieldKey,
        computed: "computed" in def ? true : undefined,
        layoutAnchors: anchors,
    };
}

function parent(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
    anchors: LayoutPickerAnchorEntity[] = ["opportunities", "person", "child"],
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "parent",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "person",
        defFieldKey,
        layoutAnchors: anchors,
    };
}

function household(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "household",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "customer",
        defFieldKey,
        layoutAnchors: ["opportunities"],
    };
}

function locationField(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "location",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "location",
        defFieldKey,
        layoutAnchors: ["opportunities"],
    };
}

export const CHILDCARE_STARTER_FIELD_CATALOG: ChildcareCatalogFieldEntry[] = [
    lead("opportunity.status_key", "Lead status", "status", 10, "status_key"),
    lead("opportunity.source", "Lead source", "text", 20, "source"),
    lead("opportunity.created_at", "Lead created date", "date", 30, "created_at", { computed: true }),
    lead("opportunity.desired_start_date", "Desired start date", "date", 40, "desired_start_date"),
    lead("opportunity.tour_date", "Tour date", "date", 50, "tour_date"),
    lead("opportunity.tour_time", "Tour time", "text", 60, "tour_time"),
    lead("opportunity.tour_status", "Tour status", "status", 70, "tour_status"),
    lead("opportunity.program_type", "Program interest", "select", 80, "program_type"),
    lead("opportunity.schedule_type", "Schedule interest", "select", 90, "schedule_type"),
    lead("opportunity.customer_notes", "Lead notes", "text", 100, "customer_notes"),
    lead("opportunity.campaign", "Campaign", "text", 110, "campaign"),
    lead("opportunity.channel", "Channel", "text", 120, "channel"),

    childField("child.first_name", "First name", "text", 10, { entityType: "person", fieldKey: "first_name" }, ["child"]),
    childField("child.last_name", "Last name", "text", 20, { entityType: "person", fieldKey: "last_name" }, ["child"]),
    childField("child.preferred_name", "Preferred name", "text", 30, { entityType: "person", fieldKey: "preferred_name" }, ["child"]),
    childField("child.date_of_birth", "Date of birth", "date", 40, { entityType: "person", fieldKey: "date_of_birth" }, ["child"]),
    childField("child.age", "Age", "text", 50, { computed: true }),
    childField("person.gender", "Gender", "select", 60, { entityType: "person", fieldKey: "gender" }),
    childField("inquiry_child.desired_program_type", "Program interest", "select", 110, {
        entityType: "inquiry_child",
        fieldKey: "desired_program_type",
    }),
    childField("inquiry_child.desired_schedule_type", "Schedule interest", "select", 120, {
        entityType: "inquiry_child",
        fieldKey: "desired_schedule_type",
    }),
    childField("inquiry_child.desired_start_date", "Desired start date", "date", 130, {
        entityType: "inquiry_child",
        fieldKey: "desired_start_date",
    }),
    childField("inquiry_child.program_room_cohort_key", "Room / cohort", "select", 140, {
        entityType: "inquiry_child",
        fieldKey: "program_room_cohort_key",
    }),
    childField("inquiry_child.location_id", "Location / school", "select", 145, {
        entityType: "inquiry_child",
        fieldKey: "location_id",
    }),
    childField("inquiry_child.outcome_status_key", "Enrollment status", "status", 150, {
        entityType: "inquiry_child",
        fieldKey: "outcome_status_key",
    }),
    childField("person.allergies", "Allergies", "text", 160, { entityType: "person", fieldKey: "allergies" }),
    childField("person.medical_notes", "Medical notes", "text", 170, { entityType: "person", fieldKey: "medical_notes" }),
    childField("person.special_instructions", "Special instructions", "text", 180, {
        entityType: "person",
        fieldKey: "special_instructions",
    }),
    childField("inquiry_child.notes", "Notes", "text", 190, { entityType: "inquiry_child", fieldKey: "notes" }),

    parent("person.first_name", "First name", "text", 10, "first_name"),
    parent("person.last_name", "Last name", "text", 20, "last_name"),
    parent("person.email", "Email", "text", 30, "email"),
    parent("person.phone", "Phone", "phone", 40, "phone"),
    parent("person.secondary_phone", "Secondary phone", "phone", 50, "secondary_phone"),
    parent("person.relationship_to_child", "Relationship to child", "select", 60, "relationship_to_child", ["person", "child"]),
    parent("person.address_line1", "Address", "text", 70, "address_line1"),
    parent("person.communication_preference", "Communication preference", "select", 80, "communication_preference"),
    parent("person.sms_opt_in", "SMS opt-in", "boolean", 90, "sms_opt_in"),
    parent("person.email_opt_in", "Email opt-in", "boolean", 100, "email_opt_in"),
    parent("person.employer", "Employer", "text", 110, "employer"),
    parent("person.contact_notes", "Notes", "text", 120, "contact_notes"),

    household("customer.name", "Household name", "text", 10, "name"),
    household("customer.primary_contact", "Primary contact", "text", 20, "primary_contact"),
    household("customer.secondary_contact", "Secondary contact", "text", 30, "secondary_contact"),
    household("customer.address_line1", "Address", "text", 40, "address_line1"),
    household("customer.family_notes", "Family notes", "text", 50, "family_notes"),
    household("customer.household_status", "Household status", "select", 60, "household_status"),
    household("customer.customer_number", "Family number", "text", 70, "customer_number"),

    locationField("location.name", "Location name", "text", 10, "name"),
    locationField("location.address_line1", "Address", "text", 20, "address_line1"),
    locationField("location.site_phone", "Phone", "phone", 30, "site_phone"),
    locationField("location.director_name", "Director", "text", 40, "director_name"),
    locationField("location.capacity", "Capacity", "number", 50, "capacity"),
    locationField("location.category", "Programs offered", "select", 60, "category"),
    locationField("location.operating_hours", "Hours", "text", 70, "operating_hours"),
    locationField("location.status", "Status", "status", 80, "status"),
];

export const CHILDCARE_CATALOG_BY_REFKEY: ReadonlyMap<string, ChildcareCatalogFieldEntry> = new Map(
    CHILDCARE_STARTER_FIELD_CATALOG.map((e) => [e.refKey, e]),
);

export const CHILDCARE_HIDDEN_REF_KEYS = new Set<string>([
    "opportunity.opportunity_number",
    "opportunity.job_date",
    "opportunity.location",
    "opportunity.location_id",
    "person.person_number",
    "person.primary_contact_name",
    "person.primary_phone",
    "person.primary_email",
    "person.secondary_contact_name",
    "location.location_number",
    "child.program",
    "child.desired_start_date",
    "child.status",
    "child.location",
    "child.room",
    "child.schedule",
    "child.name",
    "child.age_band",
]);

export function isChildcareHiddenRefKey(refKey: string): boolean {
    const key = refKey.trim();
    if (!key) return true;
    if (CHILDCARE_CATALOG_BY_REFKEY.has(key)) return false;
    if (key.startsWith("child_inquiry.")) return true;
    if (CHILDCARE_HIDDEN_REF_KEYS.has(key)) return true;
    const fieldKey = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
    if (fieldKey.endsWith("_id") || fieldKey.endsWith("_uuid")) return true;
    if (fieldKey === "id" || fieldKey === "org_id") return true;
    return false;
}

export function isChildcareCatalogRefKey(refKey: string, anchor: LayoutPickerAnchorEntity = "opportunities"): boolean {
    if (isChildcareHiddenRefKey(refKey)) return false;
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(refKey);
    if (!entry) return false;
    return entry.layoutAnchors.includes(anchor);
}

export function childcareCatalogRefKeysForOperatorEntity(
    operatorEntity: ChildcareOperatorEntity,
    anchor: LayoutPickerAnchorEntity = "opportunities",
): string[] {
    return CHILDCARE_STARTER_FIELD_CATALOG.filter(
        (e) => e.operatorEntity === operatorEntity && e.layoutAnchors.includes(anchor),
    )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => e.refKey);
}

export type CatalogFieldLike = {
    refKey: string;
    fieldKey?: string;
    fieldLabel?: string;
    fieldType?: string;
    entityKey?: string;
    entityLabel?: string;
};

export function applyChildcareCatalogLabel<T extends CatalogFieldLike>(field: T): T {
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(field.refKey);
    if (!entry) return field;
    return { ...field, fieldLabel: entry.pickerLabel, fieldType: entry.fieldType };
}

export type CatalogGroupLike = {
    entityKey: string;
    entityLabel: string;
    groupSubtitle?: string;
    groupDescription?: string;
    fields: CatalogFieldLike[];
};

export function organizeChildcarePickerGroups(
    fields: CatalogFieldLike[],
    anchor: LayoutPickerAnchorEntity = "opportunities",
): CatalogGroupLike[] {
    const byEntity = new Map<ChildcareOperatorEntity, CatalogFieldLike[]>();
    for (const entity of CHILDCARE_OPERATOR_ENTITY_ORDER) {
        byEntity.set(entity, []);
    }

    const present = new Set<string>();
    for (const f of fields) {
        if (!isChildcareCatalogRefKey(f.refKey, anchor)) continue;
        const entry = CHILDCARE_CATALOG_BY_REFKEY.get(f.refKey)!;
        byEntity.get(entry.operatorEntity)!.push(applyChildcareCatalogLabel(f));
        present.add(f.refKey);
    }

    for (const entry of CHILDCARE_STARTER_FIELD_CATALOG) {
        if (!entry.layoutAnchors.includes(anchor)) continue;
        if (present.has(entry.refKey)) continue;
        const dot = entry.refKey.indexOf(".");
        const namespace = dot === -1 ? entry.refKey : entry.refKey.slice(0, dot);
        const fieldKey = dot === -1 ? entry.refKey : entry.refKey.slice(dot + 1);
        byEntity.get(entry.operatorEntity)!.push({
            entityKey: namespace,
            entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[entry.operatorEntity],
            fieldKey,
            fieldLabel: entry.pickerLabel,
            fieldType: entry.fieldType,
            refKey: entry.refKey,
        });
    }

    const entityKeyForOperator: Record<ChildcareOperatorEntity, string> = {
        lead: "opportunity",
        child: "child",
        parent: "person",
        household: "customer",
        location: "location",
    };

    const groups: CatalogGroupLike[] = [];
    for (const operatorEntity of CHILDCARE_OPERATOR_ENTITY_ORDER) {
        const entityFields = byEntity.get(operatorEntity)!;
        entityFields.sort((a, b) => {
            const ao = CHILDCARE_CATALOG_BY_REFKEY.get(a.refKey)?.sortOrder ?? 999;
            const bo = CHILDCARE_CATALOG_BY_REFKEY.get(b.refKey)?.sortOrder ?? 999;
            return ao - bo;
        });
        if (entityFields.length === 0) continue;
        groups.push({
            entityKey: entityKeyForOperator[operatorEntity],
            entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[operatorEntity],
            groupDescription:
                operatorEntity === "child"
                    ? "Child profile and enrollment fields used on leads and child records"
                    : undefined,
            fields: entityFields.map((f) => ({
                ...f,
                entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[operatorEntity],
            })),
        });
    }
    return groups;
}

export function collectChildcareUserFacingCopy(groups: CatalogGroupLike[]): string[] {
    const out: string[] = [];
    for (const g of groups) {
        out.push(g.entityLabel);
        if (g.groupSubtitle) out.push(g.groupSubtitle);
        if (g.groupDescription) out.push(g.groupDescription);
        for (const f of g.fields) {
            if (f.fieldLabel) out.push(f.fieldLabel);
            if (f.entityLabel) out.push(f.entityLabel);
        }
    }
    return out;
}

export const BANNED_CHILDCARE_OPERATOR_COPY = [
    /child\s*inquiry/i,
    /inquiry\s*child/i,
    /children\s*inquiry/i,
    /child_inquiry/i,
    /\binquiry_child\b/i,
    /\bOCM\b/,
    /opportunity_customer_members/i,
] as const;

export function childcareCopyContainsBannedPhrase(text: string): boolean {
    return BANNED_CHILDCARE_OPERATOR_COPY.some((re) => re.test(text));
}
