import type {
    CreateLeadCommitRecord,
    CreateLeadCommitSelectionPatch,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { CreateLeadCommitEntityType } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { CREATE_LEAD_DERIVED_FIELD_BINDINGS } from "@/lib/fields/derived/resolveDerivedFieldDisplay";

export type CommitRecordFieldKey =
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "role"
    | "dob"
    | "program_interest"
    | "desired_start_date"
    | "program_room_cohort_key"
    | "desired_schedule_type";

export type CommitRecordPayloadMapping = {
    payload_key: string;
    record_key: CommitRecordFieldKey;
    derived?: boolean;
};

const PARENT_MAPPINGS: CommitRecordPayloadMapping[] = [
    { payload_key: "first_name", record_key: "first_name" },
    { payload_key: "last_name", record_key: "last_name" },
    { payload_key: "email", record_key: "email" },
    { payload_key: "phone", record_key: "phone" },
];

const CHILD_MAPPINGS: CommitRecordPayloadMapping[] = [
    { payload_key: "child_first_name", record_key: "first_name" },
    { payload_key: "child_last_name", record_key: "last_name" },
    { payload_key: "child_date_of_birth", record_key: "dob" },
    { payload_key: "child_age", record_key: "dob", derived: true },
    { payload_key: "child_program", record_key: "program_interest" },
    { payload_key: "child_desired_start_date", record_key: "desired_start_date" },
    { payload_key: "child_program_room_cohort_key", record_key: "program_room_cohort_key" },
    { payload_key: "child_desired_schedule_type", record_key: "desired_schedule_type" },
];

export function commitRecordPayloadMappings(entityType: CreateLeadCommitEntityType): CommitRecordPayloadMapping[] {
    return entityType === "parent" ? PARENT_MAPPINGS : CHILD_MAPPINGS;
}

export function recordKeyForPayloadKey(
    entityType: CreateLeadCommitEntityType,
    payloadKey: string,
): CommitRecordPayloadMapping | null {
    return commitRecordPayloadMappings(entityType).find((mapping) => mapping.payload_key === payloadKey) ?? null;
}

export function isDerivedHouseholdCardPayloadKey(payloadKey: string): boolean {
    return payloadKey in CREATE_LEAD_DERIVED_FIELD_BINDINGS;
}

function readRecordValue(record: CreateLeadCommitRecord, key: CommitRecordFieldKey): string {
    const raw = record[key as keyof CreateLeadCommitRecord];
    if (raw == null) return "";
    return String(raw).trim();
}

/** Payload-shaped draft values for household card editing. */
export function commitRecordToPayloadDraft(
    record: CreateLeadCommitRecord,
    entityType: CreateLeadCommitEntityType,
): Record<string, string> {
    const draft: Record<string, string> = {};

    for (const mapping of commitRecordPayloadMappings(entityType)) {
        if (mapping.derived) continue;
        draft[mapping.payload_key] = readRecordValue(record, mapping.record_key);
    }

    for (const [payloadKey, value] of Object.entries(record.extra_payload_values ?? {})) {
        draft[payloadKey] = value ?? "";
    }

    return draft;
}

/** Map payload draft back to commit selection patch. */
export function payloadDraftToCommitPatch(
    entityType: CreateLeadCommitEntityType,
    draft: Record<string, string>,
): CreateLeadCommitSelectionPatch {
    const patch: CreateLeadCommitSelectionPatch = {};
    const extra: Record<string, string> = {};

    for (const [payloadKey, rawValue] of Object.entries(draft)) {
        const value = rawValue ?? "";
        const mapping = recordKeyForPayloadKey(entityType, payloadKey);
        if (mapping?.derived) continue;

        if (mapping) {
            switch (mapping.record_key) {
                case "first_name":
                    patch.first_name = value;
                    break;
                case "last_name":
                    patch.last_name = value;
                    break;
                case "email":
                    patch.email = value;
                    break;
                case "phone":
                    patch.phone = value;
                    break;
                case "role":
                    if (value.trim()) patch.role = value.trim();
                    break;
                case "dob":
                    patch.dob = value.trim() || null;
                    break;
                case "program_interest":
                    patch.program_interest = value.trim() || null;
                    break;
                case "desired_start_date":
                    patch.desired_start_date = value.trim() || null;
                    break;
                case "program_room_cohort_key":
                    patch.program_room_cohort_key = value.trim() || null;
                    break;
                case "desired_schedule_type":
                    patch.desired_schedule_type = value.trim() || null;
                    break;
                default:
                    break;
            }
        } else {
            extra[payloadKey] = value;
        }
    }

    if (Object.keys(extra).length > 0) {
        patch.extra_payload_values = extra;
    }

    return patch;
}

/** Payload-shaped values for placement cascade and derived field display. */
export function commitRecordToPayloadValues(
    entityType: CreateLeadCommitEntityType,
    record: CreateLeadCommitRecord,
    contextValues: Record<string, string>,
): Record<string, string> {
    return {
        ...contextValues,
        ...commitRecordToPayloadDraft(record, entityType),
    };
}

/** @deprecated Use commitRecordToPayloadDraft */
export function commitRecordToDraftValues(record: CreateLeadCommitRecord): Record<CommitRecordFieldKey, string> {
    return {
        first_name: readRecordValue(record, "first_name"),
        last_name: readRecordValue(record, "last_name"),
        email: readRecordValue(record, "email"),
        phone: readRecordValue(record, "phone"),
        role: readRecordValue(record, "role"),
        dob: readRecordValue(record, "dob"),
        program_interest: readRecordValue(record, "program_interest"),
        desired_start_date: readRecordValue(record, "desired_start_date"),
        program_room_cohort_key: readRecordValue(record, "program_room_cohort_key"),
        desired_schedule_type: readRecordValue(record, "desired_schedule_type"),
    };
}

/** @deprecated Use payloadDraftToCommitPatch */
export function draftValuesToCommitPatch(
    entityType: CreateLeadCommitEntityType,
    draft: Record<CommitRecordFieldKey, string>,
): CreateLeadCommitSelectionPatch {
    const payloadDraft: Record<string, string> = {};
    for (const mapping of commitRecordPayloadMappings(entityType)) {
        if (mapping.derived) continue;
        payloadDraft[mapping.payload_key] = draft[mapping.record_key] ?? "";
    }
    return payloadDraftToCommitPatch(entityType, payloadDraft);
}
