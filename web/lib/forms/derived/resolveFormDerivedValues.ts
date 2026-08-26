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
import type { DerivedFieldBinding } from "@/lib/fields/derived/types";
import { resolveDerivedFieldDisplay } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

export interface FormDerivedContext {
    /** The instant the family executed this artifact. Absent before submission. */
    executedAtIso?: string | null;
    /** The organisation's IANA zone, from its canonical owner. */
    timeZone?: string | null;
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

    const stringValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (typeof v === "string") stringValues[k] = v;

    const out: Record<string, string> = {};
    for (const targetKey of Object.keys(bindings)) {
        const result = resolveDerivedFieldDisplay({
            target_key: targetKey,
            values: stringValues,
            bindings,
            ...(ctx.executedAtIso ? { executedAtIso: ctx.executedAtIso } : {}),
            ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}),
        });
        if (result) out[targetKey] = result.display;
    }
    return out;
}
