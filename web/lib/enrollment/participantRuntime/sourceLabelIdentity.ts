/**
 * Is this control's label the SOURCE's own field name, or something a person wrote?
 *
 * ## The defect this closes
 *
 * A source-fidelity Form is imported from a real document, and the importer has exactly one string
 * available per control: the AcroForm widget's internal name. So `Var history`, `Prov Sp`, `DTP`
 * and `Signature1` become field labels — not because anyone chose them as questions, but because
 * they are what the PDF's author named the boxes. Printed to a parent they read as gibberish, and
 * on the certification packet they reached the signature confirmation block verbatim.
 *
 * The temptation is to pattern-match the ugly ones. That is unfixable: `Polio` and `Hep B` are
 * perfectly ordinary English, and `Module` is a word. No shape test separates a source name from a
 * question, because the difference is not in the string — it is in the PROVENANCE.
 *
 * ## The provenance is already recorded
 *
 * `pdf_mapping_json.acro_fields` is the canonical join between a schema field and the widget it was
 * imported from (`fidelity_v1`). If a label is that widget's name, the label carries no authored
 * meaning by construction: it is the source system talking to itself. That is a derivation from
 * data Alloy already holds, not a guess about English.
 *
 * ## What a control with no participant label means
 *
 * It means Alloy has no words for this control and must not invent any. On a source-fidelity
 * artifact that is not a loss: the parent is looking at the actual document, which prints its own
 * question beside the box ("Check if child had chickenpox disease"). The control is presented by
 * its PLACEMENT, the way a signature is — never by a caption Alloy made up.
 *
 * Pure. No I/O.
 */

/** The mapping shape this reads — a structural subset of `fidelity_v1`. */
export type SourceFieldMapping = {
    readonly acro_fields?: Record<string, { readonly field_id?: string }> | null;
} | null | undefined;

/**
 * Field id → the source widget name it was imported from.
 *
 * Inverts `acro_fields`, which is keyed by widget name because that is what the filler needs.
 */
export function sourceFieldNamesByFieldId(mapping: SourceFieldMapping): Record<string, string> {
    const out: Record<string, string> = {};
    const acro = mapping?.acro_fields;
    if (!acro || typeof acro !== "object") return out;
    for (const [widgetName, spec] of Object.entries(acro)) {
        const fieldId = spec?.field_id;
        if (typeof fieldId === "string" && fieldId) out[fieldId] = widgetName;
    }
    return out;
}

/**
 * Compare a label to a widget name the way the importer transformed it.
 *
 * The importer title-cases and re-spaces (`Var history` → `Var History`, `HepB` → `Hep B`), so
 * equality has to survive case and separator changes and nothing else. Deliberately NOT a fuzzy
 * match: two genuinely different strings must never collapse together, or an authored question
 * would be silently suppressed.
 */
function normalizeForProvenance(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** True when this label is the source widget's own name rather than authored words. */
export function labelIsSourceFieldName(label: string | null | undefined, sourceFieldName: string | null | undefined): boolean {
    const l = (label ?? "").trim();
    const s = (sourceFieldName ?? "").trim();
    if (!l || !s) return false;
    return normalizeForProvenance(l) === normalizeForProvenance(s);
}

/**
 * The words Alloy may print for this control, or null when it has none.
 *
 * Null is a real answer and callers must handle it — it is the difference between "the school
 * wrote this question" and "the PDF named this box". A caller that falls back to the raw label on
 * null has reintroduced the defect.
 */
export function participantFacingLabel(
    label: string | null | undefined,
    sourceFieldName: string | null | undefined,
): string | null {
    const raw = (label ?? "").trim();
    if (!raw) return null;
    if (labelIsSourceFieldName(raw, sourceFieldName)) return null;
    return raw;
}
