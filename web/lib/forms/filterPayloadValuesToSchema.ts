import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * Keep only top-level field ids declared on the schema (excludes `group` containers).
 * Used for packet embeds so `shared_values` carry-forward does not inject foreign keys into the next step's payload.
 */
export function filterPayloadValuesToSchemaFields(
    schema: FormSchemaV1,
    values: Record<string, unknown>
): Record<string, unknown> {
    const allowed = new Set(schema.fields.filter((f) => f.type !== "group").map((f) => f.id));
    const out: Record<string, unknown> = {};
    for (const id of allowed) {
        if (Object.prototype.hasOwnProperty.call(values, id)) {
            out[id] = values[id];
        }
    }
    return out;
}
