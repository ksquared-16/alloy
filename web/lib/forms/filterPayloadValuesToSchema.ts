import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";

/**
 * Keep only the field ids this schema actually answers in `values`.
 *
 * Used for packet embeds so `shared_values` carry-forward does not inject a foreign key from another
 * step into the next step's payload. That is the whole point: the set is an allow-list of THIS
 * schema's own answerable fields.
 *
 * ## Scalar children of a plain group belong here
 *
 * The first version allowed top-level non-group fields only, and dropped everything nested. That was
 * invisible while no plain group held an answerable field — a COLLECTION group's answers live under
 * `payload.groups`, one row at a time, never in `values`. Admissions v12 has two plain groups, the
 * Home and Mailing addresses, whose children are ordinary text fields addressed by their own id in
 * `values`. Filtering those out silently discarded a parent's typed address on every draft save.
 *
 * A collection group's children are still excluded, deliberately: a bare `values` entry keyed by a
 * repeating child's id has no row to belong to, so admitting one would smuggle in exactly the kind of
 * unanchored key this filter exists to refuse.
 */
function collectAnswerableIds(fields: readonly FormField[], into: Set<string>): void {
    for (const field of fields) {
        if (field.type !== "group") {
            into.add(field.id);
            continue;
        }
        // A repeating group's answers are rows under `payload.groups`, not entries in `values`.
        if (groupFieldHasCollectionBinding(field)) continue;
        if (Array.isArray(field.fields)) collectAnswerableIds(field.fields, into);
    }
}

export function filterPayloadValuesToSchemaFields(
    schema: FormSchemaV1,
    values: Record<string, unknown>
): Record<string, unknown> {
    const allowed = new Set<string>();
    collectAnswerableIds(schema.fields, allowed);
    const out: Record<string, unknown> = {};
    for (const id of allowed) {
        if (Object.prototype.hasOwnProperty.call(values, id)) {
            out[id] = values[id];
        }
    }
    return out;
}
