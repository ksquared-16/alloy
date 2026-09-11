/**
 * Which part of the paperwork each schema field occupies — the join, as a pure function.
 *
 * This is the rule that makes the source document an editing canvas, so it is worth stating once
 * and testing directly rather than leaving inside a route handler where it can only be exercised
 * with a database and a PDF.
 *
 * It owns NOTHING. The schema still says what a field means, the mapping still says where a fact
 * prints, and the document still says where that widget sits. All this does is line the three up:
 *
 *   mapping.acro_fields[widgetName].field_id   →   the schema field
 *   document widget of that name               →   the rectangle to draw
 *
 * A widget the mapping does not name is deliberately NOT returned. An unmapped box is not a
 * destination, and offering one as clickable would let an operator create a binding by clicking a
 * rectangle — which would quietly make geometry the semantic authority instead of the mapping.
 */

/** A destination on the page, as the canvas needs it. */
export type PaperworkRegion = {
    /** The SCHEMA field this region edits — the id the inspector already keys on. */
    field_id: string;
    /** The PDF widget it prints in, for provenance and for explaining an unmapped box. */
    pdf_field: string;
    /** 1-based. */
    page: number;
    /** [x0, y0, x1, y1] in PDF points, bottom-left origin — the canvas projects it. */
    bbox: [number, number, number, number];
};

/** The shape this needs from a parsed fidelity mapping. */
export type AcroFieldTargets = Record<string, { field_id: string }>;

/** The shape this needs from a document's own AcroForm widgets. */
export type DocumentWidget = {
    name: string | null;
    page: number;
    bbox?: [number, number, number, number] | null;
};

export type PaperworkRegionJoin = {
    regions: PaperworkRegion[];
    /**
     * Widgets the mapping names but the document does not contain. Not cosmetic: it means a fact is
     * mapped to a box that is not on the page, so it will never print. A real mapping defect.
     */
    missingFromDocument: string[];
};

/**
 * Widget names are matched case-insensitively.
 *
 * `acro_fields` is keyed by the name the mapping was authored against, and the document reports the
 * same names — but a document re-exported by different software can change their case, and a
 * case-sensitive match would silently return no regions at all, leaving an editor looking at a page
 * nothing on it can be clicked.
 */
export function buildPaperworkRegions(
    acroFields: AcroFieldTargets,
    widgets: readonly DocumentWidget[],
): PaperworkRegionJoin {
    const targetByLowerName = new Map<string, string>();
    for (const [pdfField, target] of Object.entries(acroFields)) {
        targetByLowerName.set(pdfField.toLowerCase(), target.field_id);
    }

    const regions: PaperworkRegion[] = [];
    for (const widget of widgets) {
        // A widget with no rectangle cannot be drawn, so it cannot be selected either.
        if (!widget.bbox) continue;
        const fieldId = targetByLowerName.get((widget.name ?? "").toLowerCase());
        if (!fieldId) continue;
        regions.push({ field_id: fieldId, pdf_field: widget.name as string, page: widget.page, bbox: widget.bbox });
    }

    const presentLowerNames = new Set(widgets.map((w) => (w.name ?? "").toLowerCase()));
    const missingFromDocument = Object.keys(acroFields).filter((n) => !presentLowerNames.has(n.toLowerCase()));

    return { regions, missingFromDocument };
}
