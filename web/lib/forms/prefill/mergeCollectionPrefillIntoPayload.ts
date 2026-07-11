import type { FormPayload, FormPayloadGroupRow } from "@/lib/forms/validateSubmission";

/** Merge collection-bound group prefill rows into an initial payload (server wins for existing linked items). */
export function mergeCollectionPrefillIntoPayload(
    payload: FormPayload,
    collectionGroups: Record<string, FormPayloadGroupRow[]>,
): FormPayload {
    if (Object.keys(collectionGroups).length === 0) return payload;
    return {
        ...payload,
        groups: {
            ...(payload.groups ?? {}),
            ...collectionGroups,
        },
    };
}
