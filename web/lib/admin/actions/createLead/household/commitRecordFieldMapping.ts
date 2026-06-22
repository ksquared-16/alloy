import type { CreateLeadCommitRecord, CreateLeadCommitSelectionPatch } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { CreateLeadCommitEntityType } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";

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

export function payloadKeyForRecordKey(
    entityType: CreateLeadCommitEntityType,
    recordKey: CommitRecordFieldKey,
): string | null {
    return commitRecordPayloadMappings(entityType).find((m) => m.record_key === recordKey && !m.derived)?.payload_key ?? null;
}

export function recordKeyForPayloadKey(
    entityType: CreateLeadCommitEntityType,
    payloadKey: string,
): CommitRecordPayloadMapping | null {
    return commitRecordPayloadMappings(entityType).find((m) => m.payload_key === payloadKey) ?? null;
}

function readRecordValue(record: CreateLeadCommitRecord, key: CommitRecordFieldKey): string {
    const raw = record[key as keyof CreateLeadCommitRecord];
    if (raw == null) return "";
    return String(raw).trim();
}

/** Draft values keyed by commit record field for card edit forms. */
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

/** Map card edit draft back to commit selection patch. */
export function draftValuesToCommitPatch(
    entityType: CreateLeadCommitEntityType,
    draft: Record<CommitRecordFieldKey, string>,
): CreateLeadCommitSelectionPatch {
    const patch: CreateLeadCommitSelectionPatch = {
        first_name: draft.first_name,
        last_name: draft.last_name,
    };

    if (entityType === "parent") {
        patch.email = draft.email;
        patch.phone = draft.phone;
        if (draft.role.trim()) patch.role = draft.role.trim();
    } else {
        patch.dob = draft.dob.trim() || null;
        patch.program_interest = draft.program_interest.trim() || null;
        patch.desired_start_date = draft.desired_start_date.trim() || null;
        patch.program_room_cohort_key = draft.program_room_cohort_key.trim() || null;
        patch.desired_schedule_type = draft.desired_schedule_type.trim() || null;
    }

    return patch;
}

/** Payload-shaped values for placement cascade and derived field display. */
export function commitRecordToPayloadValues(
    entityType: CreateLeadCommitEntityType,
    record: CreateLeadCommitRecord,
    contextValues: Record<string, string>,
): Record<string, string> {
    const draft = commitRecordToDraftValues(record);
    const out = { ...contextValues };

    for (const mapping of commitRecordPayloadMappings(entityType)) {
        if (mapping.derived) continue;
        out[mapping.payload_key] = draft[mapping.record_key] ?? "";
    }

    return out;
}
