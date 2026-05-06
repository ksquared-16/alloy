import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow, FormPayloadSignature } from "@/lib/forms/validateSubmission";

export type CollectedSignature = {
    field_id: string;
    instance_key: string;
    signature: FormPayloadSignature;
};

function walkGroupFields(
    fields: FormField[],
    row: FormPayloadGroupRow,
    out: CollectedSignature[]
): void {
    for (const child of fields) {
        if (child.type === "signature") {
            const sig = row.signatures?.[child.id];
            if (sig) {
                out.push({ field_id: child.id, instance_key: row.instance_key, signature: sig });
            }
        }
        if (child.type === "group") {
            const nested = row.groups?.[child.id];
            if (!nested) continue;
            for (const nr of nested) {
                walkGroupFields(child.fields, nr, out);
            }
        }
    }
}

/** Collect every non-empty signature entry from the payload (top-level + nested repeatables). */
export function collectSignaturesFromPayload(schema: FormSchemaV1, payload: FormPayload): CollectedSignature[] {
    const out: CollectedSignature[] = [];

    for (const field of schema.fields) {
        if (field.type === "signature") {
            const sig = payload.signatures?.[field.id];
            if (sig) out.push({ field_id: field.id, instance_key: "", signature: sig });
        }
        if (field.type === "group") {
            const rows = payload.groups?.[field.id] ?? [];
            for (const row of rows) {
                walkGroupFields(field.fields, row, out);
            }
        }
    }

    return out;
}
