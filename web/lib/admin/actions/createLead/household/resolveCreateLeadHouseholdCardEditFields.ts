import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { CreateLeadCommitEntityType } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    commitRecordPayloadMappings,
    type CommitRecordFieldKey,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";

export type CreateLeadHouseholdCardEditField = {
    payload_key: string;
    record_key: CommitRecordFieldKey;
    field_label: string;
    tier: "required" | "optional";
    value_kind: ActionWorkspaceGatherField["value_kind"];
    option_set_key?: string | null;
    placement_select?: ActionWorkspaceGatherField["placement_select"];
    multiline?: boolean;
    derived?: boolean;
};

const PARENT_SKIP = new Set(["location_id", "source", "intake_notes"]);
const CHILD_SKIP = new Set(["child_location_id"]);

const MINIMUM_PARENT_PAYLOAD_KEYS = ["first_name", "last_name", "email", "phone"] as const;
const MINIMUM_CHILD_PAYLOAD_KEYS = [
    "child_first_name",
    "child_last_name",
    "child_date_of_birth",
    "child_age",
    "child_program",
    "child_desired_start_date",
] as const;

function gatherFieldByPayloadKey(payloadKey: string): ActionWorkspaceGatherField | undefined {
    return CREATE_LEAD_GATHER_FIELDS.find((field) => field.payload_key === payloadKey);
}

function sectionForEntity(entityType: CreateLeadCommitEntityType): ActionWorkspaceGatherField["section"] {
    return entityType === "parent" ? "person" : "child";
}

function fieldsForEntityFromGather(
    gatherFields: readonly ActionWorkspaceGatherField[],
    entityType: CreateLeadCommitEntityType,
): ActionWorkspaceGatherField[] {
    const section = sectionForEntity(entityType);
    return gatherFields.filter((field) => field.section === section);
}

function defaultFieldsForEntity(entityType: CreateLeadCommitEntityType): ActionWorkspaceGatherField[] {
    const section = sectionForEntity(entityType);
    return CREATE_LEAD_GATHER_FIELDS.filter((field) => field.section === section);
}

function toDescriptor(
    field: ActionWorkspaceGatherField,
    entityType: CreateLeadCommitEntityType,
    requiredPayloadKeys: readonly string[],
): CreateLeadHouseholdCardEditField | null {
    const mapping = commitRecordPayloadMappings(entityType).find((entry) => entry.payload_key === field.payload_key);
    if (!mapping) return null;

    return {
        payload_key: field.payload_key,
        record_key: mapping.record_key,
        field_label: field.field_label,
        tier: requiredPayloadKeys.includes(field.payload_key) ? "required" : field.tier,
        value_kind: mapping.derived ? "text" : field.value_kind,
        option_set_key: field.option_set_key,
        placement_select: field.placement_select,
        multiline: field.multiline,
        derived: mapping.derived,
    };
}

function ensureMinimumFields(
    descriptors: CreateLeadHouseholdCardEditField[],
    entityType: CreateLeadCommitEntityType,
    requiredPayloadKeys: readonly string[],
): CreateLeadHouseholdCardEditField[] {
    const seen = new Set(descriptors.map((field) => field.payload_key));
    const minimumKeys = entityType === "parent" ? MINIMUM_PARENT_PAYLOAD_KEYS : MINIMUM_CHILD_PAYLOAD_KEYS;
    const next = [...descriptors];

    for (const payloadKey of minimumKeys) {
        if (seen.has(payloadKey)) continue;
        const field = gatherFieldByPayloadKey(payloadKey);
        if (!field) continue;
        const descriptor = toDescriptor(field, entityType, requiredPayloadKeys);
        if (descriptor) next.push(descriptor);
    }

    return next;
}

/** Resolve editable household card fields from ActionIntakeSpec gather metadata. */
export function resolveCreateLeadHouseholdCardEditFields(input: {
    entityType: CreateLeadCommitEntityType;
    gatherFields?: readonly ActionWorkspaceGatherField[];
    requiredPayloadKeys?: readonly string[];
}): CreateLeadHouseholdCardEditField[] {
    const requiredPayloadKeys = input.requiredPayloadKeys ?? [];
    const skip = input.entityType === "parent" ? PARENT_SKIP : CHILD_SKIP;
    const source =
        input.gatherFields?.length ?
            fieldsForEntityFromGather(input.gatherFields, input.entityType)
        :   defaultFieldsForEntity(input.entityType);

    const descriptors: CreateLeadHouseholdCardEditField[] = [];
    const seenRecordKeys = new Set<CommitRecordFieldKey>();

    for (const field of source) {
        if (skip.has(field.payload_key)) continue;
        const descriptor = toDescriptor(field, input.entityType, requiredPayloadKeys);
        if (!descriptor) continue;
        if (descriptor.derived) {
            descriptors.push(descriptor);
            continue;
        }
        if (seenRecordKeys.has(descriptor.record_key)) continue;
        seenRecordKeys.add(descriptor.record_key);
        descriptors.push(descriptor);
    }

    const withMinimum = ensureMinimumFields(descriptors, input.entityType, requiredPayloadKeys);

    const order = new Map(
        commitRecordPayloadMappings(input.entityType).map((mapping, index) => [mapping.payload_key, index]),
    );
    return withMinimum.sort(
        (a, b) => (order.get(a.payload_key) ?? 999) - (order.get(b.payload_key) ?? 999),
    );
}
