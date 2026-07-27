import type {
    BosCommandDraft,
    BosCommandInputValue,
    BosInputValueState,
} from "@/lib/bos/commandSession/types";

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

/**
 * Flat string payload for eligibility, preview, and execute.
 * Omits inferred/unresolved values until the operator confirms or types them.
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
        payload.household_commit = draft.household;
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
