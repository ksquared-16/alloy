import {
    parseCreateLeadCommitSelection,
    serializeCreateLeadCommitSelection,
    syncCreateLeadValuesFromCommitSelection,
    type CreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { householdFromCommitSelection } from "@/lib/pos/processingIdentity/sources/householdFromCommitSelection";
import { CREATE_LEAD_INTAKE_HOUSEHOLD_KEY } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";

export const CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY = "household_commit_v1";

/** Merge flat gather values with serialized multi-member commit selection. */
export function mapCreateLeadCommitSelectionToExecutePayload(input: {
    values: Record<string, string>;
    selection: CreateLeadCommitSelection;
}): Record<string, string> {
    const synced = syncCreateLeadValuesFromCommitSelection(input.values, input.selection);
    const locationId = synced.location_id?.trim() || null;
    const household = householdFromCommitSelection(input.selection, { locationId });
    return {
        ...synced,
        [CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]: serializeCreateLeadCommitSelection(input.selection),
        [CREATE_LEAD_INTAKE_HOUSEHOLD_KEY]: JSON.stringify(household),
    };
}

export function readCreateLeadCommitSelectionFromPayload(
    merged: Record<string, unknown>,
): CreateLeadCommitSelection | null {
    return parseCreateLeadCommitSelection(merged[CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]);
}
