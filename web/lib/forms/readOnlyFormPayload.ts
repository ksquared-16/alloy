import { collectReadOnlyScalarFieldIds } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

/** Prevent tampering with read-only answers by restoring baseline draft values (typically server-prefilled). */
export function applyReadOnlyBaselineToPayload(
    schema: FormSchemaV1,
    incoming: FormPayload,
    baseline: FormPayload | null | undefined
): FormPayload {
    const ids = collectReadOnlyScalarFieldIds(schema);
    if (ids.size === 0) return incoming;
    const baseVals = baseline?.values ?? {};
    const values = { ...(incoming.values ?? {}) };
    for (const id of ids) {
        if (baseVals[id] !== undefined) values[id] = baseVals[id] as unknown;
    }
    return { ...incoming, values };
}
