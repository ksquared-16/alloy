import { collectReadOnlyScalarFieldIds } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/** Server prefill first, then client draft values; read-only fields keep server values when present. */
export function mergePrefillIntoDraftValues(
    schema: FormSchemaV1,
    clientValues: Record<string, unknown>,
    serverPrefill: Record<string, string | number | boolean>
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...serverPrefill, ...clientValues };
    const readOnly = collectReadOnlyScalarFieldIds(schema);
    for (const id of readOnly) {
        if (serverPrefill[id] !== undefined) merged[id] = serverPrefill[id];
    }
    return merged;
}
