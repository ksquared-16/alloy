/**
 * The imported document's own geometry, handed to the layer that owns recognizable paperwork.
 *
 * Import already reads everything `fidelity_v1` needs. `acroFormStructure` keeps each widget's
 * native name, page and rectangle; the draft carries them through review as `pdf_field_name`,
 * `page` and `bbox`; and `draftFormToFormSchemaV1` gives every question the draft field's own id.
 * Then materialization dropped all of it and wrote `pdf_mapping_json: null`, so a Form generated
 * from a school's paperwork could ask every question on that paperwork and never render it back.
 *
 * This is the bridge, and it is deliberately only a bridge:
 *
 *   - It adds nothing to `FormSchemaV1`. Geometry does not belong there; Forms stays the semantic
 *     and validation authority and gains no coordinates.
 *   - It copies no source TEXT. The recognizable document is the original bytes, which the fidelity
 *     engine fills in place — reproducing its prose as `text_block`s would duplicate the document
 *     into the schema and make the copy compete with the original.
 *   - It invents no mapping format. Every value here is a value the contract already defines.
 *
 * ## Why the map is keyed by widget name and not by rectangle
 *
 * `fidelity_v1` maps `acro_fields[pdfFieldName] → { field_id }`: a location names the semantics it
 * shows, never the reverse. That is also what makes ONE canonical fact reach EVERY place the
 * paperwork prints it — several widgets may name the same `field_id`, and the engine fills them all
 * from the single resolved value. Rectangles are needed only where there is no widget to fill: a
 * signature is drawn onto the page, so it carries a placement.
 *
 * Pure. The caller supplies the pinned source identity.
 */

import type { FidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import type { StoredFormDraftPreview } from "./types";

/**
 * A signature is painted onto the page, so it needs a rectangle rather than a widget name.
 *
 * PDF `/Rect` is `[x0, y0, x1, y1]` in user space with the origin at the bottom-left, and pdf-lib
 * draws from the same origin — so the conversion is a subtraction, not a transform. Pages are
 * 1-based on the draft and 0-based in the contract.
 */
function signaturePlacement(field: {
    id: string;
    page?: number;
    bbox?: [number, number, number, number];
}): FidelityPdfMapping["signature_placements"][number] | null {
    const { bbox } = field;
    if (!bbox || typeof field.page !== "number" || field.page < 1) return null;
    const [x0, y0, x1, y1] = bbox;
    const width = x1 - x0;
    const height = y1 - y0;
    // A degenerate rectangle would place a mark nowhere visible; omitting it leaves the signature
    // uncaptured on the document, which is honest, rather than stamped at a wrong size.
    if (!(width > 0) || !(height > 0)) return null;
    return { field_id: field.id, page: field.page - 1, x: x0, y: y0, width, height };
}

export type FidelitySourceIdentity = {
    /** The `documents` row the import came from. */
    sourceDocumentId: string;
    /** The pinned hash of that document's bytes — render refuses anything else. */
    sourceSha256: string;
};

/**
 * Build the `fidelity_v1` mapping for a draft, or null when this document cannot back one.
 *
 * Null is the correct answer for a source with no fillable widgets — a scanned or flat-text
 * document has no locations to fill, and an empty map is refused by `parseFidelityPdfMapping`
 * anyway. Such a Form is still a perfectly good Form; it simply has no original to render into.
 */
export function buildFidelityMappingFromDraft(
    draft: StoredFormDraftPreview,
    source: FidelitySourceIdentity,
): FidelityPdfMapping | null {
    const acro_fields: Record<string, { field_id: string; compose_with?: string[] }> = {};
    const signature_placements: FidelityPdfMapping["signature_placements"] = [];

    for (const field of draft.fields) {
        if (field.suppressed_by_collection) continue;
        if (field.type === "signature") {
            const placement = signaturePlacement(field);
            if (placement) signature_placements.push(placement);
            // A signature widget is not a value destination: the engine records it as "missed" if
            // asked to set one, and the mark is drawn instead.
            continue;
        }
        const widget = (field.pdf_field_name ?? "").trim();
        if (!widget) continue;
        const existing = acro_fields[widget];
        if (existing) {
            /*
             * A second question claiming the same printed box is not a conflict — it is a box that
             * holds more than one fact.
             *
             * Review splits a source's single "Emergency Contact Name" into a first name and a last
             * name, because that is what a name is to a record. Both halves keep the provenance of
             * the one widget they came from, so they arrive here together and the destination
             * composes them. Draft order is document order, so the parts join in the order the form
             * asks for them.
             *
             * This is generic on purpose: any question the reviewer splits out of one box composes
             * back into it, and an administrator configures nothing for an ordinary import.
             */
            existing.compose_with = [...(existing.compose_with ?? []), field.id];
            continue;
        }
        // Date formatting at the destination is left to the contract's default (mm/dd/yyyy), which
        // is what paperwork prints. A destination needing the machine form declares it deliberately.
        acro_fields[widget] = { field_id: field.id };
    }

    if (Object.keys(acro_fields).length === 0) return null;

    return {
        engine: "fidelity_v1",
        source_document_id: source.sourceDocumentId,
        source_sha256: source.sourceSha256,
        acro_fields,
        signature_placements,
    };
}
