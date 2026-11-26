/**
 * Every required box on a finished document must have something that can put a value in it.
 *
 * This is deliberately INDEPENDENT of participant-question eligibility. That model decides who is
 * asked; this one asks a blunter question of the finished schema — when this artifact is completed,
 * what actually fills this box? Keeping them separate is the point: if the eligibility model makes a
 * mistake, a check derived from the same model would agree with it. This one disagrees.
 *
 * It reads only the published schema and the mechanisms the platform already owns. It has no notion
 * of roles, dispositions or ownership doctrine.
 *
 * The failure it exists to stop is specific and was real: a required destination stops being asked
 * because a named owner "owns" it, and then no owner ever writes to it — so the family signs a
 * document with a confidently-labelled blank on it.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { canonicalPrefillPathForBinding } from "@/lib/forms/prefill/canonicalPrefillMap";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

export type ValueProductionPath =
    /** The participant fills it — a question, a choice, a signature, an upload, an artifact control. */
    | "participant_interaction"
    /** Canonical truth already known to Alloy is written into it. */
    | "canonical_prefill"
    /** A repeating/structured collection supplies it. */
    | "structured_collection"
    /** A document the family attaches supplies it, through extraction. */
    | "upload_extraction"
    /** Alloy computes it from canonical truth at the moment the source means. */
    | "derived_value_writer"
    /** The source does not require a value here. */
    | "source_requires_no_value";

export interface ValueProductionContext {
    /**
     * Destinations the SOURCE marked required, taken from the reader's structure before any
     * eligibility decision touched them. This is the evidence the invariant is measured against.
     */
    sourceRequiredFieldIds?: ReadonlySet<string>;
    collectionFieldIds?: ReadonlySet<string>;
    extractionFieldIds?: ReadonlySet<string>;
    /** Field ids that exist in this schema, so a derivation cannot cite an input that is not there. */
    presentFieldIds?: ReadonlySet<string>;
}

export interface StrandedDestination {
    field_id: string;
    label: string;
    type: string;
    /** What the schema says about it, so a reader can check the verdict rather than trust it. */
    evidence: string;
}

export interface ValueProductionResult {
    ok: boolean;
    byPath: Record<string, number>;
    stranded: StrandedDestination[];
    /** Required destinations examined. */
    required: number;
}

/**
 * How this one box gets a value, or null when nothing can supply it.
 *
 * `collectionFieldIds` are destinations a structured collection fills; `extractionFieldIds` are
 * destinations an upload's extraction fills. Both are passed in rather than inferred, because a
 * mechanism that has to be guessed at is exactly the kind that turns out not to exist.
 */
export function valueProductionPathFor(
    field: FormField,
    ctx?: ValueProductionContext,
): { path: ValueProductionPath; basis: string } | null {
    /*
     * Requiredness is read from the SOURCE, never from the finished field.
     *
     * Relinquishing a requirement is how a hidden box is made submittable, so by the time the schema
     * exists the flag is already gone — and a check that reads `field.required` would conclude "the
     * source does not require a value here" about the very destinations it was built to catch. It
     * passed 66 of 66 that way, which is what a vacuous gate looks like from the outside.
     */
    const required = field.required === true || ctx?.sourceRequiredFieldIds?.has(field.id) === true;
    if (!required) return { path: "source_requires_no_value", basis: "the source does not require a value here" };

    // Asked is asked: a question, a choice, a signature, an upload and an artifact control all put
    // the box in front of the person completing the document.
    if (field.read_only !== true) return { path: "participant_interaction", basis: `the participant completes this ${field.type}` };

    /*
     * A derived writer counts — but only when its inputs actually resolve.
     *
     * This is the difference the timing rule turns on: publication requires that a truthful writer
     * EXISTS, not that the value exists yet. An execution date genuinely does not exist until the
     * family submits, and requiring it to exist beforehand would be requiring the impossible. What
     * must not pass is a declaration with nothing behind it — an age whose as-of date is not on the
     * artifact is a story about a value, not a value.
     */
    if (field.derived) {
        const d = field.derived;
        if (d.kind === "execution_date") return { path: "derived_value_writer", basis: "the organisation-local date this artifact is executed" };
        const sourcePresent = d.source_key ? ctx?.presentFieldIds?.has(d.source_key) !== false : false;
        const asOfPresent = d.as_of_key ? ctx?.presentFieldIds?.has(d.as_of_key) !== false : true;
        if (sourcePresent && asOfPresent) {
            return { path: "derived_value_writer", basis: `computed from ${d.source_key}${d.as_of_key ? ` as of ${d.as_of_key}` : ""}` };
        }
        return null;
    }

    if (ctx?.collectionFieldIds?.has(field.id)) return { path: "structured_collection", basis: "supplied by a structured collection" };
    if (ctx?.extractionFieldIds?.has(field.id)) return { path: "upload_extraction", basis: "supplied by extraction from an attached document" };

    const src = field.field_source;
    if (src?.entity_type && src.field_key) {
        // The prefill map is asked, not assumed. A key it merely passes through is a column that
        // might exist — which is not evidence that a value will arrive.
        const path = canonicalPrefillPathForBinding(src.entity_type, src.field_key, { aliasOnly: true });
        if (path) return { path: "canonical_prefill", basis: `canonical prefill from ${path}` };
    }

    return null;
}

export function assertValueProduction(schema: FormSchemaV1, ctx?: ValueProductionContext): ValueProductionResult {
    const byPath: Record<string, number> = {};
    const stranded: StrandedDestination[] = [];
    let required = 0;

    // A derivation may only cite inputs this schema actually carries.
    let presentFieldIds = ctx?.presentFieldIds;
    if (!presentFieldIds) {
        const ids = new Set<string>();
        walkScalarFormFields(schema, (f) => ids.add(f.id));
        presentFieldIds = ids;
    }
    const withPresence: ValueProductionContext = { ...ctx, presentFieldIds };

    walkScalarFormFields(schema, (field) => {
        if (field.required === true || ctx?.sourceRequiredFieldIds?.has(field.id)) required += 1;
        const verdict = valueProductionPathFor(field, withPresence);
        if (!verdict) {
            const src = field.field_source;
            stranded.push({
                field_id: field.id,
                label: field.label,
                type: field.type,
                evidence: `required at source${field.required ? "" : " (requirement relinquished)"}, read_only, binding=${src ? `${src.entity_type}.${src.field_key}` : "none"}${field.derived ? `, derived=${field.derived.kind} (inputs unresolved)` : ""}`,
            });
            return;
        }
        byPath[verdict.path] = (byPath[verdict.path] ?? 0) + 1;
    });

    return { ok: stranded.length === 0, byPath, stranded, required };
}
