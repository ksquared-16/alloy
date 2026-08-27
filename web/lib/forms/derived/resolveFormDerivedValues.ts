/**
 * Forms' consumption of the platform derived-field doctrine.
 *
 * `lib/fields/derived` has said from the start that "POS/forms should register their own bindings,
 * not hardcode in shared UI". Forms never did — so a destination the reader had already classified
 * as derived ("Alloy already knows it from when the form was submitted") arrived at realization with
 * nothing to fill it, and became a required blank on a document a family signs beneath.
 *
 * This is the missing consumer, and nothing else. It reads the `derived` declaration the schema
 * carries, asks the platform resolver, and returns values by field id. It knows no labels: a
 * destination is derived because the schema says so, never because of what it is called.
 *
 * Pure. No I/O — the caller supplies the execution instant and the organisation's zone.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { DerivedFieldBinding, DerivedFieldResult } from "@/lib/fields/derived/types";
import { resolveDerivedFieldDisplay } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import { documentFieldApplies } from "@/lib/forms/documentFieldApplies";

export interface FormDerivedContext {
    /** The instant the family executed this artifact. Absent before submission. */
    executedAtIso?: string | null;
    /** The organisation's IANA zone, from its canonical owner. */
    timeZone?: string | null;
    /**
     * `payload.signatures`, when the caller has them.
     *
     * A date beside a signature line is the date of THAT signature, so whether it applies depends on
     * whether the signature exists — and a signature's value does not live in `values`.
     */
    signatures?: Readonly<Record<string, unknown>> | null;
}

/** The bindings this schema itself declares, keyed by the field they fill. */
export function formDerivedBindings(schema: FormSchemaV1): Record<string, DerivedFieldBinding> {
    const bindings: Record<string, DerivedFieldBinding> = {};
    walkScalarFormFields(schema, (field) => {
        const d = field.derived;
        if (!d) return;
        bindings[field.id] = {
            kind: d.kind,
            source_key: d.source_key ?? "",
            ...(d.as_of_key ? { as_of_key: d.as_of_key } : {}),
        };
    });
    return bindings;
}

/** The authored type of each derived destination — what SHAPE the payload must hold. */
function derivedDestinationTypes(schema: FormSchemaV1): Record<string, string> {
    const types: Record<string, string> = {};
    walkScalarFormFields(schema, (field) => {
        if (field.derived) types[field.id] = field.type;
    });
    return types;
}

/**
 * What gets STORED at one derived destination — which is not what gets printed there.
 *
 * `DerivedFieldResult` deliberately carries both: `display` is the operator-facing string
 * (`08/26/2026`, `5 years 4 months`) and `source_value` is the ISO date the derivation is about.
 * Writing `display` into the payload put `08/26/2026` in a `date` field, and the submission was
 * refused — "Expected date string YYYY-MM-DD" — for three boxes the platform had just filled in
 * itself. A parent could sign the Oregon CIS and never get past it.
 *
 * The destination's authored TYPE decides, because that is what validation enforces and what the
 * next reader of this payload will assume. A `date` box stores a date; everything else stores the
 * derivation's own words. How it then PRINTS on a specific line of a specific document is already
 * owned elsewhere (`formatValueForDocumentDestination`), and that separation is the whole point:
 * one stored value, formatted per destination.
 *
 * An age has no date-valued result — its `source_value` is the date of birth it was computed FROM,
 * which is a different fact. Rather than write a plausible wrong date, a date destination with no
 * date-valued derivation is left alone.
 */
function storedValueFor(result: DerivedFieldResult, destinationType: string | undefined): string | null {
    if (destinationType !== "date") return result.display;
    return result.kind === "execution_date" ? result.source_value : null;
}

/**
 * Resolve every derived destination this schema declares.
 *
 * A destination whose inputs are not available yet is simply absent from the result. That is the
 * honest outcome: an execution date does not exist before the family submits, and an age has no
 * value until the date it is taken as of has one. Absent is not the same as broken.
 */
export function resolveFormDerivedValues(
    schema: FormSchemaV1,
    values: Record<string, unknown>,
    ctx: FormDerivedContext,
): Record<string, string> {
    const bindings = formDerivedBindings(schema);
    if (!Object.keys(bindings).length) return {};
    const destinationTypes = derivedDestinationTypes(schema);
    /*
     * A DERIVED DESTINATION THAT DOES NOT APPLY IS NOT WRITTEN.
     *
     * The Oregon CIS's "Update signature — Date" is an execution date of exactly the right kind,
     * and stamping it when nobody made an update signature asserts an update that did not happen.
     * The schema says when a destination applies; this is the writer agreeing with it.
     */
    const applies = documentFieldApplies({ schema, values, signatures: ctx.signatures ?? null });

    const stringValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (typeof v === "string") stringValues[k] = v;

    const out: Record<string, string> = {};
    for (const targetKey of Object.keys(bindings)) {
        if (!applies(targetKey)) continue;
        const result = resolveDerivedFieldDisplay({
            target_key: targetKey,
            values: stringValues,
            bindings,
            ...(ctx.executedAtIso ? { executedAtIso: ctx.executedAtIso } : {}),
            ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}),
        });
        if (!result) continue;
        const stored = storedValueFor(result, destinationTypes[targetKey]);
        if (stored != null) out[targetKey] = stored;
    }
    return out;
}
