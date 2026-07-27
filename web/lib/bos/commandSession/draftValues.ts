import type {
    BosCommandDraft,
    BosCommandInputValue,
    BosInputValueState,
} from "@/lib/bos/commandSession/types";
import {
    buildCreateLeadCommitSelection,
    parseCreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

/** States that count toward eligibility / execute payload (V1). */
const ELIGIBLE_STATES: ReadonlySet<BosInputValueState> = new Set([
    "confirmed",
    "operator_entered",
    "parsed_from_source",
]);

export function bosInputStateCountsTowardEligibility(state: BosInputValueState): boolean {
    return ELIGIBLE_STATES.has(state);
}

export function bosDraftValueMap(draft: BosCommandDraft): Record<string, BosCommandInputValue> {
    const out: Record<string, BosCommandInputValue> = {};
    for (const value of draft.values) {
        out[value.fieldKey] = value;
    }
    return out;
}

function isIntakeHousehold(value: unknown): value is IntakeHouseholdCandidate {
    if (!value || typeof value !== "object") return false;
    if (parseCreateLeadCommitSelection(value)) return false;
    const obj = value as Record<string, unknown>;
    return (
        Array.isArray(obj.children) ||
        Array.isArray(obj.parents_guardians) ||
        Array.isArray(obj.parents)
    );
}

/**
 * Flat string payload for eligibility, preview, and execute.
 * Omits inferred/unresolved values until the operator confirms or types them.
 * When household/selection is present, emits household_commit_v1 for multi-member commit.
 */
export function bosDraftToEligiblePayload(draft: BosCommandDraft): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const entry of draft.values) {
        if (!bosInputStateCountsTowardEligibility(entry.state)) continue;
        if (entry.value == null) continue;
        const asString = String(entry.value).trim();
        if (!asString) continue;
        payload[entry.fieldKey] = asString;
    }
    if (draft.household != null) {
        const selection =
            parseCreateLeadCommitSelection(draft.household) ??
            (isIntakeHousehold(draft.household)
                ? buildCreateLeadCommitSelection(draft.household)
                : null);
        if (selection) {
            const flat: Record<string, string> = {};
            for (const [k, v] of Object.entries(payload)) {
                if (typeof v === "string") flat[k] = v;
            }
            const mapped = mapCreateLeadCommitSelectionToExecutePayload({
                values: flat,
                selection,
            });
            Object.assign(payload, mapped);
            payload.household_commit = selection;
        } else {
            payload.household_commit = draft.household;
        }
    }
    if (draft.unmappedText?.trim()) {
        const existingNotes = String(payload.intake_notes ?? "").trim();
        payload.intake_notes = existingNotes
            ? `${existingNotes}\n\n${draft.unmappedText.trim()}`
            : draft.unmappedText.trim();
    }
    return payload;
}

/** All non-empty draft values as strings (Form projection), including inferred. */
export function bosDraftToFormValues(draft: BosCommandDraft): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of draft.values) {
        if (entry.value == null) continue;
        out[entry.fieldKey] = String(entry.value);
    }
    return out;
}

export function upsertBosDraftValue(
    draft: BosCommandDraft,
    next: BosCommandInputValue
): BosCommandDraft {
    const values = draft.values.filter((v) => v.fieldKey !== next.fieldKey);
    const trimmed =
        next.value == null || String(next.value).trim() === ""
            ? null
            : next;
    return {
        ...draft,
        values: trimmed ? [...values, trimmed] : values,
    };
}

export function clearBosDraftField(draft: BosCommandDraft, fieldKey: string): BosCommandDraft {
    return {
        ...draft,
        values: draft.values.filter((v) => v.fieldKey !== fieldKey),
    };
}
