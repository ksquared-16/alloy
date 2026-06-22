import {
    parseCreateLeadCommitSelection,
    serializeCreateLeadCommitSelection,
    syncCreateLeadValuesFromCommitSelection,
    type CreateLeadCommitSelection,
} from "@/lib/intake/commit/createLeadCommitSelection";

export const CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY = "household_commit_v1";

/** Merge flat gather values with serialized multi-member commit selection. */
export function mapCreateLeadCommitSelectionToExecutePayload(input: {
    values: Record<string, string>;
    selection: CreateLeadCommitSelection;
}): Record<string, string> {
    const synced = syncCreateLeadValuesFromCommitSelection(input.values, input.selection);
    return {
        ...synced,
        [CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]: serializeCreateLeadCommitSelection(input.selection),
    };
}

export function readCreateLeadCommitSelectionFromPayload(
    merged: Record<string, unknown>,
): CreateLeadCommitSelection | null {
    return parseCreateLeadCommitSelection(merged[CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]);
}
