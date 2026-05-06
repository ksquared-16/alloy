import type { FormPayload, FormPayloadGroupRow, FormPayloadSignature } from "@/lib/forms/validateSubmission";

export function emptyPayload(): FormPayload {
    return { values: {}, meta: {} };
}

export function setTopLevelValue(payload: FormPayload, fieldId: string, value: unknown): FormPayload {
    return {
        ...payload,
        values: { ...payload.values, [fieldId]: value },
    };
}

export function setSignature(payload: FormPayload, fieldId: string, sig: FormPayloadSignature): FormPayload {
    return {
        ...payload,
        signatures: { ...(payload.signatures ?? {}), [fieldId]: sig },
    };
}

export function ensureGroupRows(payload: FormPayload, groupId: string, rows: FormPayloadGroupRow[]): FormPayload {
    return {
        ...payload,
        groups: { ...(payload.groups ?? {}), [groupId]: rows },
    };
}
