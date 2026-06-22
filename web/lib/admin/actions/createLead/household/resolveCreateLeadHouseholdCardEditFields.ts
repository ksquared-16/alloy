import { actionIntakeFieldToGatherField } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { CreateLeadCommitEntityType } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    isDerivedHouseholdCardPayloadKey,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import { CREATE_LEAD_DERIVED_FIELD_BINDINGS } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";

export type CreateLeadHouseholdCardEditField = {
    payload_key: string;
    rule_id: string;
    field_label: string;
    tier: "required" | "optional";
    value_kind: ActionWorkspaceGatherField["value_kind"];
    option_set_key?: string | null;
    placement_select?: ActionWorkspaceGatherField["placement_select"];
    multiline?: boolean;
    derived?: boolean;
};

export type CreateLeadHouseholdCardEditFieldGroups = {
    required: CreateLeadHouseholdCardEditField[];
    additional: CreateLeadHouseholdCardEditField[];
};

const HOUSEHOLD_CARD_SKIP_PAYLOAD_KEYS = new Set([
    "location_id",
    "source",
    "intake_notes",
    "child_location_id",
]);

function entityForCard(entityType: CreateLeadCommitEntityType): ActionIntakeFieldSpec["entity"] {
    return entityType === "parent" ? "person" : "child";
}

function intakeSpecOrPlatformFallback(intakeSpec?: ActionIntakeSpec | null): ActionIntakeSpec {
    if (intakeSpec) return intakeSpec;
    return resolveCreateLeadActionIntakeSpec({
        department_id: "platform-fallback",
        operator_stage: "lead",
    });
}

function specFieldsForEntity(spec: ActionIntakeSpec, entityType: CreateLeadCommitEntityType): ActionIntakeFieldSpec[] {
    const entity = entityForCard(entityType);
    return [...spec.required, ...spec.recommended, ...spec.optional].filter((field) => field.entity === entity);
}

function toDescriptor(field: ActionIntakeFieldSpec, tier: "required" | "optional"): CreateLeadHouseholdCardEditField | null {
    if (HOUSEHOLD_CARD_SKIP_PAYLOAD_KEYS.has(field.payload_key)) return null;
    if (isDerivedHouseholdCardPayloadKey(field.payload_key)) {
        return {
            payload_key: field.payload_key,
            rule_id: field.rule_id,
            field_label: field.field_label,
            tier,
            value_kind: "text",
            derived: true,
        };
    }

    const gather = actionIntakeFieldToGatherField({ ...field, tier: tier === "required" ? "required" : field.tier });
    return {
        payload_key: field.payload_key,
        rule_id: field.rule_id,
        field_label: field.field_label,
        tier,
        value_kind: gather.value_kind,
        option_set_key: gather.option_set_key,
        placement_select: gather.placement_select,
        multiline: gather.multiline,
        derived: false,
    };
}

function dedupeDescriptors(fields: CreateLeadHouseholdCardEditField[]): CreateLeadHouseholdCardEditField[] {
    const seen = new Set<string>();
    const out: CreateLeadHouseholdCardEditField[] = [];
    for (const field of fields) {
        if (seen.has(field.payload_key)) continue;
        seen.add(field.payload_key);
        out.push(field);
    }
    return out;
}

function appendDerivedAgeIfNeeded(
    fields: CreateLeadHouseholdCardEditField[],
    entityType: CreateLeadCommitEntityType,
): CreateLeadHouseholdCardEditField[] {
    if (entityType !== "child") return fields;
    if (fields.some((field) => field.payload_key === "child_age")) return fields;
    if (!fields.some((field) => field.payload_key === "child_date_of_birth")) return fields;

    const binding = CREATE_LEAD_DERIVED_FIELD_BINDINGS.child_age;
    if (!binding) return fields;

    return [
        ...fields,
        {
            payload_key: "child_age",
            rule_id: "derived:child_age",
            field_label: "Child Age",
            tier: "optional",
            value_kind: "text",
            derived: true,
        },
    ];
}

function canMapToCommitRecord(entityType: CreateLeadCommitEntityType, payloadKey: string): boolean {
    if (HOUSEHOLD_CARD_SKIP_PAYLOAD_KEYS.has(payloadKey)) return false;
    if (isDerivedHouseholdCardPayloadKey(payloadKey)) return true;
    if (entityType === "child") return payloadKey.startsWith("child_") || payloadKey === "child_age";
    return !payloadKey.startsWith("child_") && !payloadKey.startsWith("opportunity_");
}

/** Resolve household card edit fields from ActionIntakeSpec (entity fields + BP rules). */
export function resolveCreateLeadHouseholdCardEditFields(input: {
    entityType: CreateLeadCommitEntityType;
    intakeSpec?: ActionIntakeSpec | null;
}): CreateLeadHouseholdCardEditFieldGroups {
    const spec = intakeSpecOrPlatformFallback(input.intakeSpec);
    const requiredKeys = new Set(spec.required.map((field) => field.payload_key));

    const required: CreateLeadHouseholdCardEditField[] = [];
    const additional: CreateLeadHouseholdCardEditField[] = [];

    for (const field of spec.required) {
        if (field.entity !== entityForCard(input.entityType)) continue;
        if (!canMapToCommitRecord(input.entityType, field.payload_key)) continue;
        const descriptor = toDescriptor(field, "required");
        if (descriptor) required.push(descriptor);
    }

    for (const field of [...spec.recommended, ...spec.optional]) {
        if (field.entity !== entityForCard(input.entityType)) continue;
        if (requiredKeys.has(field.payload_key)) continue;
        if (!canMapToCommitRecord(input.entityType, field.payload_key)) continue;
        const descriptor = toDescriptor(field, "optional");
        if (descriptor) additional.push(descriptor);
    }

    const orderedRequired = dedupeDescriptors(required);
    const orderedAdditional = dedupeDescriptors(
        appendDerivedAgeIfNeeded(additional, input.entityType),
    );

    return {
        required: orderedRequired,
        additional: orderedAdditional,
    };
}

/** Flat list for callers/tests that expect a single array. Required fields first. */
export function flattenCreateLeadHouseholdCardEditFields(groups: CreateLeadHouseholdCardEditFieldGroups): CreateLeadHouseholdCardEditField[] {
    return [...groups.required, ...groups.additional];
}
