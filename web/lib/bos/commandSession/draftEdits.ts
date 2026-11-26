import { applyCreateLeadParseToDraft } from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import type { CreateLeadAdapterContext } from "@/lib/bos/commandSession/adapters/createLeadAdapter";
import {
    bosDraftToFormValues,
    clearBosDraftField,
    upsertBosDraftValue,
} from "@/lib/bos/commandSession/draftValues";
import type { BosCommandDraft, BosCommandInputValue } from "@/lib/bos/commandSession/types";

/**
 * Operator typed or Form-edited a field. Replaces inference and marks operator_entered.
 * Clearing the value removes the field from the draft.
 */
export function applyOperatorFieldEdit(
    draft: BosCommandDraft,
    fieldKey: string,
    value: unknown,
    now = new Date().toISOString()
): BosCommandDraft {
    const trimmed = value == null ? "" : String(value).trim();
    if (!trimmed) {
        return clearBosDraftField(draft, fieldKey);
    }
    const prior = draft.values.find((v) => v.fieldKey === fieldKey);
    const evidence = [
        ...(prior?.evidence ?? []),
        {
            kind: "operator_edit" as const,
            note: "Entered by you",
            at: now,
        },
    ];
    return upsertBosDraftValue(draft, {
        fieldKey,
        value: trimmed,
        state: "operator_entered",
        evidence,
        optionResolved: prior?.optionResolved ?? false,
    });
}

/**
 * Explicit confirm of a parsed/inferred value (Conversation chip or Form accept).
 */
export function confirmBosDraftField(
    draft: BosCommandDraft,
    fieldKey: string,
    now = new Date().toISOString()
): BosCommandDraft {
    const prior = draft.values.find((v) => v.fieldKey === fieldKey);
    if (!prior || prior.value == null || String(prior.value).trim() === "") {
        return draft;
    }
    return upsertBosDraftValue(draft, {
        ...prior,
        state: "confirmed",
        evidence: [
            ...prior.evidence,
            { kind: "operator_edit", note: "Confirmed", at: now },
        ],
    });
}

/**
 * Conversation paste/type parse applied onto the shared draft.
 * Alias of Create Lead adapter parse for mode-agnostic callers.
 */
export function applyParseResult(
    draft: BosCommandDraft,
    text: string,
    ctx: CreateLeadAdapterContext,
    now?: string
): BosCommandDraft {
    return applyCreateLeadParseToDraft(draft, text, ctx, now);
}

/**
 * Apply a full Form values map onto the draft. Keys present with empty string clear.
 * Only touches keys in `formValues` — does not wipe unrelated draft fields.
 */
export function applyFormValuesToDraft(
    draft: BosCommandDraft,
    formValues: Record<string, string>,
    now = new Date().toISOString()
): BosCommandDraft {
    let next = draft;
    for (const [fieldKey, value] of Object.entries(formValues)) {
        next = applyOperatorFieldEdit(next, fieldKey, value, now);
    }
    return next;
}

/** Round-trip helper: Form projection of the shared draft. */
export function formValuesFromDraft(draft: BosCommandDraft): Record<string, string> {
    return bosDraftToFormValues(draft);
}

export function removeInferredBosDraftField(
    draft: BosCommandDraft,
    fieldKey: string
): BosCommandDraft {
    const prior = draft.values.find((v) => v.fieldKey === fieldKey);
    if (!prior) return draft;
    if (prior.state !== "inferred" && prior.state !== "parsed_from_source") {
        return applyOperatorFieldEdit(draft, fieldKey, "");
    }
    return clearBosDraftField(draft, fieldKey);
}

export type { BosCommandInputValue };
