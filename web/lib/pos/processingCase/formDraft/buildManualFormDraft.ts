/**
 * POS-FP14 — build a Document → Form draft from an OPERATOR-REVIEWED field list.
 *
 * When text detection is weak (e.g. the real MO500 blob), the operator sets the form up
 * against the PDF preview: add / edit / remove fields, then create. This pure builder
 * turns that reviewed list into the SAME `StoredFormDraftPreview` shape the detector
 * produces, so the existing create path (`createFormFromCaseDraft`) and the existing
 * persistence (`dbStoreFormDraftPreview`) are reused unchanged — no second form system.
 *
 * Operator-authored fields are "high" confidence by definition (a human chose them).
 */

import type { DraftFormField, DraftFormFieldType, DraftFormSection, StoredFormDraftPreview } from "./types";
import type { SectionDisposition } from "./sectionDisposition";

export const MANUAL_FORM_DRAFT_VERSION = "manual-1";

// Choice questions keep their type: leaving `select` / `multiselect` out of this list turned every
// dropdown into free text on each rebuild, and the choices it still carried stopped rendering.
const ALLOWED_TYPES: DraftFormFieldType[] = ["text", "number", "date", "boolean", "file_ref", "signature", "select", "multiselect"];

export interface ManualFieldInput {
    label: string;
    type?: string;
    required?: boolean;
    section?: string;
    /** PDF provenance preserved from AcroForm detection or manual mapping (kept through create). */
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    /** Provenance tag, e.g. "pdf_field" | "manual_pdf_mapping" | "operator". */
    evidence?: string;
    /** Operator-reviewed canonical binding — persisted through to the generated form. */
    field_source?: import("@/lib/forms/schema").FormFieldSource;
    /** Operator-visible note — e.g. unresolved-at-generate destination flag. */
    description?: string;
    /**
     * An ACCEPTED conditional relationship, carried through save.
     *
     * Save rebuilds the draft from the fields it is posted, so anything not on this input is dropped.
     * A condition an operator accepted has to survive that rebuild or it would silently un-accept
     * itself on the next save — which is worse than never having offered the feature.
     */
    visible_when?: import("@/lib/forms/schema").FormVisibilityCondition;
    /**
     * The choices the question offers.
     *
     * Save rebuilds the draft from what it is posted, so a choice list that is not on this input is
     * gone — and a select with no choices is not a select. An imported "Yes / No / Sometimes" question
     * silently became a free-text box the first time anyone changed an unrelated mapping.
     */
    options?: readonly string[];
    /**
     * How wide the question sits on its row — the thing that puts First name beside Last name.
     *
     * The canvas already rows fields by width and the published schema already carries it, so the only
     * missing link was this one: a width the operator set was dropped by the rebuild, snapped both
     * fields back to full width, and made side-by-side look unavailable rather than unsaved.
     */
    layout_width?: "full" | "half" | "third" | "quarter";
    /**
     * What the importer concluded about this field, carried THROUGH the rebuild.
     *
     * This was hardcoded to "high" here, which quietly made two features impossible. Document-plumbing
     * detection keyed on low confidence, so it stopped recognising anything after the first save and the
     * operator's "Remove it from the form" action went permanently dark. And `deriveResolutionStatus`
     * reads confidence, so a destination the importer had only SUGGESTED read as settled the moment any
     * unrelated field was saved — the draft silently gained certainty nobody had agreed to.
     *
     * An operator-authored field has no importer opinion; the caller says "high" for those, which is
     * what the hardcode was accidentally right about and wrong to apply to everything.
     */
    confidence?: import("./types").DraftFieldConfidence;
}

/** Operator-set intent for a section (by title), carried into the draft + emitted schema. */
export interface SectionDispositionInput {
    title: string;
    disposition: SectionDisposition;
    /** Preserved instructional/consent/signature prose. When absent for a non-"fields" disposition, it
     * is derived from the section's field labels so meaningful text is never silently dropped. */
    static_text?: string;
}

export interface BuildManualDraftInput {
    title: string;
    sourceDocumentId: string | null;
    fields: ManualFieldInput[];
    extractedTextLength?: number;
    extractedTextAvailable?: boolean;
    sectionDispositions?: SectionDispositionInput[];
}

function coerceType(t: string | undefined): DraftFormFieldType {
    const v = (t ?? "").toLowerCase();
    return (ALLOWED_TYPES as string[]).includes(v) ? (v as DraftFormFieldType) : "text";
}

/** Pure: reviewed field list → a valid StoredFormDraftPreview (operator-authored). */
export function buildManualFormDraft(input: BuildManualDraftInput): StoredFormDraftPreview {
    const order: string[] = [];
    const bySection = new Map<string, DraftFormField[]>();
    let counter = 0;

    for (const f of input.fields) {
        const label = (f.label ?? "").trim();
        if (!label) continue;
        counter += 1;
        const sectionTitle = (f.section ?? "").trim() || "Form fields";
        if (!bySection.has(sectionTitle)) {
            bySection.set(sectionTitle, []);
            order.push(sectionTitle);
        }
        const hasRegion = !!f.pdf_field_name || typeof f.page === "number" || Array.isArray(f.bbox);
        const evidence = f.evidence && typeof f.evidence === "string" ? f.evidence : hasRegion ? "pdf_field" : "operator";
        bySection.get(sectionTitle)!.push({
            id: `field_${counter}`,
            label,
            type: coerceType(f.type),
            required: Boolean(f.required),
            confidence: f.confidence ?? "high",
            evidence,
            ...(f.pdf_field_name ? { pdf_field_name: f.pdf_field_name } : {}),
            ...(typeof f.page === "number" ? { page: f.page } : {}),
            ...(Array.isArray(f.bbox) && f.bbox.length >= 4
                ? { bbox: [f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]] as [number, number, number, number] }
                : {}),
            ...(f.field_source ? { field_source: f.field_source } : {}),
            ...(f.description ? { description: f.description } : {}),
            // An accepted condition survives the rebuild; an absent one leaves the field always shown.
            ...(f.visible_when ? { visible_when: f.visible_when } : {}),
            ...(f.options?.length ? { options: f.options.map((o) => String(o)) } : {}),
            ...(f.layout_width && f.layout_width !== "full" ? { layout_width: f.layout_width } : {}),
        });
    }

    const dispByTitle = new Map((input.sectionDispositions ?? []).map((d) => [d.title, d]));
    const sections: DraftFormSection[] = order.map((title, i) => {
        const sectionFields = bySection.get(title)!;
        const disp = dispByTitle.get(title);
        const disposition = disp?.disposition;
        let staticText = disp?.static_text?.trim() || undefined;
        // No silent data loss: for a non-"fields" disposition without explicit prose, preserve the
        // section's detected labels as static text (they are the instructional/consent lines that would
        // otherwise become junk form fields).
        if (disposition && disposition !== "fields" && !staticText) {
            const preserved = sectionFields
                .map((f) => f.label.trim())
                .filter(Boolean)
                .join("\n");
            staticText = preserved || undefined;
        }
        return {
            id: `section_${i + 1}`,
            title,
            field_ids: sectionFields.map((f) => f.id),
            ...(disposition ? { disposition } : {}),
            ...(staticText ? { static_text: staticText } : {}),
        };
    });
    const fields: DraftFormField[] = order.flatMap((t) => bySection.get(t)!);

    return {
        source_document_id: input.sourceDocumentId,
        title: input.title.trim() || "Untitled form",
        title_from_text: false,
        extracted_text_available: input.extractedTextAvailable ?? false,
        sections,
        fields,
        warnings: [],
        diagnostics: {
            extracted_text_length: input.extractedTextLength ?? 0,
            extracted_text_preview: "",
            section_count: sections.length,
            field_count: fields.length,
        },
        generator_version: MANUAL_FORM_DRAFT_VERSION,
        generated_at: "",
    };
}
