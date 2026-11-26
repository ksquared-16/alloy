import { collectReadOnlyScalarFieldIds, walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
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
    // A derived destination is written by the platform at submit, not carried from the draft
    // baseline — restoring the baseline over it would erase the value it just computed.
    const derivedIds = new Set<string>();
    walkScalarFormFields(schema, (f) => { if (f.derived) derivedIds.add(f.id); });
    const baseVals = baseline?.values ?? {};
    const values = { ...(incoming.values ?? {}) };
    for (const id of ids) {
        if (derivedIds.has(id)) continue;
        if (baseVals[id] !== undefined) values[id] = baseVals[id] as unknown;
    }
    return { ...incoming, values };
}
