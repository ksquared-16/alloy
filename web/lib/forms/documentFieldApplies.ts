/**
 * Does this destination apply to THIS family's document?
 *
 * ## The defect this closes
 *
 * The Oregon CIS prints, in the Varicella row: a tickbox reading "Check if child had chickenpox
 * disease", and beneath it "Date / Fecha". That date is the date of the DISEASE. It was declared
 * `derived: {kind: "execution_date"}`, so the platform stamped today into it at submission and the
 * flattened, signed state form asserted that the child had chickenpox on the day they enrolled —
 * with the tickbox above it empty.
 *
 * The correction is two halves. The declaration stops claiming the platform knows that date. And
 * the box only carries a value when the condition beside it is true, which is what the document
 * itself says: a chickenpox date exists only if there was chickenpox.
 *
 * ## Why `visibility` and not something new
 *
 * `FormSchemaV1` already has `visibility` — `{all: [{field_id, op, value}]}` — and
 * `validateSubmission` already evaluates it to decide what a submission must contain. Nothing here
 * invents a conditional model; it applies the existing one at the three places a value can reach
 * paper: the derived writer, the source-fidelity fill, and the generated-document composer. All
 * three used to disagree with the schema's own statement about when a field applies.
 *
 * ## Signatures are values too
 *
 * A date beside a signature line means "the date of THAT signature". The CIS carries two — the
 * verification signature and the update signature — and stamping the update's date when nobody made
 * an update signature asserts an update that did not happen. A signature field's value lives in
 * `payload.signatures` rather than in `values`, so this resolves it there, letting a schema say
 * `{field_id: "field_48", op: "neq", value: null}` and mean exactly what it reads like.
 *
 * Pure. No I/O.
 */

import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";

export type DocumentApplicabilityInput = {
    readonly schema: FormSchemaV1;
    readonly values: Readonly<Record<string, unknown>>;
    /** `payload.signatures`, so a condition may refer to whether a signature was actually made. */
    readonly signatures?: Readonly<Record<string, unknown>> | null;
};

/**
 * The value a CONDITION sees for one field.
 *
 * For an ordinary field that is the payload entry. For a signature field it is the captured
 * signature, or null — because "does this field have a value" has to mean the same thing for a
 * signature as it does for a date, or a condition written about one reads as a condition about the
 * other.
 */
function conditionValue(input: DocumentApplicabilityInput, fieldId: string, signatureIds: ReadonlySet<string>): unknown {
    if (signatureIds.has(fieldId)) {
        const entry = input.signatures?.[fieldId];
        return entry == null ? null : entry;
    }
    const held = input.values[fieldId];
    return held === undefined ? null : held;
}

function signatureFieldIds(schema: FormSchemaV1): Set<string> {
    const ids = new Set<string>();
    walkScalarFormFields(schema, (field) => {
        if (field.type === "signature") ids.add(field.id);
    });
    return ids;
}

/**
 * Which destinations this document may carry a value for.
 *
 * A field with no `visibility` always applies — the overwhelming majority, and the reason this is
 * additive rather than a new gate everything has to satisfy.
 */
export function documentFieldApplies(input: DocumentApplicabilityInput): (fieldId: string) => boolean {
    const signatures = signatureFieldIds(input.schema);
    const memo = new Map<string, boolean>();
    return (fieldId: string) => {
        const cached = memo.get(fieldId);
        if (cached !== undefined) return cached;
        const applies = evaluateFieldVisibility(fieldId, input.schema, (id) =>
            conditionValue(input, id, signatures),
        );
        memo.set(fieldId, applies);
        return applies;
    };
}

/**
 * The payload's values with every inapplicable destination removed.
 *
 * Storage is untouched — this reads a payload and returns what belongs on the page. A value the
 * family once entered and whose condition later became false stays in the draft and stops printing,
 * which is the truthful outcome: the document says what is true now.
 */
export function applicableDocumentValues(
    input: DocumentApplicabilityInput,
): Record<string, unknown> {
    const applies = documentFieldApplies(input);
    const out: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(input.values)) {
        if (!applies(fieldId)) continue;
        out[fieldId] = value;
    }
    return out;
}
