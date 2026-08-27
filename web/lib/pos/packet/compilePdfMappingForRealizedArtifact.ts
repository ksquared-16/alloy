/**
 * The seam Processing never had: a realized Form version that knows where its values print.
 *
 * Participant Runtime falls back to a compiled HTML review whenever a published version carries no
 * `pdf_mapping_json`, and that fallback is correct — but every version this pipeline has ever
 * published lacked one, so a parent has never seen their actual Oregon CIS. Not because the evidence
 * was missing: `acroFormStructure` records each destination's native AcroForm name as
 * `evidence: "pdf_field:<name>"`, the draft carries it, and realization holds both that and the
 * schema field ids. Nothing joined them.
 *
 * This is that join and nothing else. It rediscovers no fields, re-reads no PDF, infers nothing from
 * labels, and makes no semantic decision — Processing already decided what each destination means.
 * The compiler only says: this realized value prints in that authored box.
 *
 * Pure. No I/O.
 */

import type { DraftFormField, StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import type { FidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";

/** How `acroFormStructure` records a destination's native identity. */
const PDF_FIELD_EVIDENCE = /^pdf_field:(.+)$/;

export interface CompiledPdfMapping {
    readonly mapping: FidelityPdfMapping;
    /** Destinations mapped to an authored AcroForm box. */
    readonly mapped: number;
    /** Signature controls whose authored rectangle was preserved. */
    readonly signatures: number;
    /** Destinations with no native identity — always empty for a true AcroForm source. */
    readonly unmapped: readonly string[];
}

export type CompilePdfMappingResult =
    | { ok: true; value: CompiledPdfMapping }
    /** Not an error: a source with no AcroForm identities is a GENERATED-document artifact. */
    | { ok: false; reason: "not_pdf_backed"; detail: string };

/**
 * Is this artifact's source a real AcroForm, or is it a hosted form with no placements?
 *
 * Decided from the evidence rather than from the file name or the artifact's title, because the
 * answer changes which renderer the parent gets and must not be a guess.
 */
export function artifactIsPdfBacked(fields: readonly DraftFormField[]): boolean {
    return fields.some((f) => PDF_FIELD_EVIDENCE.test(String(f.evidence ?? "")));
}

export function compilePdfMappingForRealizedArtifact(input: {
    draft: StoredFormDraftPreview;
    /** The `documents` row this artifact was read from, and the bytes render must refuse to drift from. */
    sourceDocumentId: string;
    sourceSha256: string;
}): CompilePdfMappingResult {
    const fields = input.draft.fields;
    if (!artifactIsPdfBacked(fields)) {
        return {
            ok: false,
            reason: "not_pdf_backed",
            detail: "No destination carries a native AcroForm identity; this artifact is generated, not source-filled.",
        };
    }
    if (!/^[0-9a-f]{64}$/.test(input.sourceSha256)) {
        return { ok: false, reason: "not_pdf_backed", detail: "Source bytes have no sha256 to pin; render could not refuse drift." };
    }

    const acro_fields: FidelityPdfMapping["acro_fields"] = {};
    const signature_placements: FidelityPdfMapping["signature_placements"] = [];
    const unmapped: string[] = [];
    /** One box shows one schema field. A second claim on the same box is a compiler bug, not a merge. */
    const claimedBy = new Map<string, string>();

    for (const field of fields) {
        const m = PDF_FIELD_EVIDENCE.exec(String(field.evidence ?? ""));
        if (!m) {
            unmapped.push(field.id);
            continue;
        }
        const acroName = m[1]!.trim();
        if (!acroName) {
            unmapped.push(field.id);
            continue;
        }

        /*
         * A signature is a MARK, not a value: it lands at an authored rectangle rather than being
         * typed into a box. Both are kept — the placement is what the parent signs on, and the box
         * is not a value destination.
         */
        if (field.type === "signature") {
            const bbox = field.bbox;
            if (Array.isArray(bbox) && bbox.length === 4 && typeof field.page === "number") {
                const [x0, y0, x1, y1] = bbox as [number, number, number, number];
                signature_placements.push({
                    field_id: field.id,
                    page: field.page,
                    x: Math.min(x0, x1),
                    y: Math.min(y0, y1),
                    width: Math.abs(x1 - x0),
                    height: Math.abs(y1 - y0),
                });
            } else {
                unmapped.push(field.id);
            }
            continue;
        }

        const prior = claimedBy.get(acroName);
        if (prior && prior !== field.id) {
            // Two schema fields claiming one box would make the rendered document depend on order.
            unmapped.push(field.id);
            continue;
        }
        claimedBy.set(acroName, field.id);
        acro_fields[acroName] = { field_id: field.id };
    }

    return {
        ok: true,
        value: {
            mapping: {
                engine: "fidelity_v1",
                source_document_id: input.sourceDocumentId,
                source_sha256: input.sourceSha256,
                acro_fields,
                signature_placements,
            },
            mapped: Object.keys(acro_fields).length,
            signatures: signature_placements.length,
            unmapped,
        },
    };
}
