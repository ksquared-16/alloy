/**
 * GET /api/admin/forms/[formId]/paperwork-regions — where this Form's questions LIVE on its paperwork.
 *
 * ## Why this is a join and not a new model
 *
 * Making the source document an editing canvas needs one thing the editor did not have: which part
 * of the page a given schema field occupies. Every piece of that already exists and is already
 * owned by something —
 *
 *   the schema field id      → the Form schema (semantic authority)
 *   the PDF widget it prints in → `fidelity_v1.acro_fields` (presentation/location authority)
 *   where that widget sits     → the source document's own AcroForm rectangles
 *
 * so this route joins them and stores nothing. No second field model, no geometry promoted into the
 * schema, no coordinates an operator could drag into becoming the truth. If the mapping changes, the
 * regions move with it, because the mapping is still the only thing that says where a fact prints.
 *
 * Geometry is deliberately READ FROM THE DOCUMENT rather than persisted: a widget rectangle is a
 * property of the paperwork, and duplicating it would create a second copy free to disagree with the
 * page an operator is looking at.
 *
 * A Form with no source document returns `source: false` — not an error. It is a Form families
 * complete on screen, and the editor renders its native canvas instead.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { parseFidelityPdfMapping, resolveFidelitySourceBytes } from "@/lib/forms/pdf/fidelityMappingContract";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";

export const dynamic = "force-dynamic";

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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: raw } = await params;
    const formId = parseUuidParam(raw, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();

    // The draft an operator is editing, else the published version — same rule the preview uses, so
    // the canvas and the document they are about to publish cannot disagree.
    const { data: versions, error: vErr } = await supabase
        .from("form_definition_versions")
        .select("id, status, version_number, pdf_mapping_json")
        .eq("org_id", ctx.orgId)
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false });
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const rows = (versions ?? []) as Array<{
        id: string;
        status: string;
        version_number: number;
        pdf_mapping_json: unknown;
    }>;

    /*
     * TRY THE DRAFT, THEN THE PUBLISHED VERSION — and say which one answered.
     *
     * The draft is the right first choice: an operator editing one should see the document THEY are
     * about to publish. But a draft's pinned source is not always readable — cloning a version
     * carries the mapping forward, and a pin whose bytes no longer parse yields a document with no
     * widgets at all, which would leave the editor showing a page nobody can click.
     *
     * Geometry is a property of the paperwork, and the paperwork does not change between a draft and
     * the version it was cloned from. So rather than show an uneditable page, fall back to the
     * version that can actually be read, and report it. A Form where NEITHER resolves is reported as
     * having no usable source rather than pretending to have one.
     */
    const candidates = [
        rows.find((r) => r.status === "draft"),
        rows.find((r) => r.status === "published"),
    ].filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (candidates.length === 0) {
        return jsonData({ source: false, reason: "no_version", regions: [], pageCount: 0 });
    }

    let lastReason = "no_source_document";
    for (const candidate of candidates) {
        const mapping = parseFidelityPdfMapping(candidate.pdf_mapping_json);
        if (!mapping) {
            lastReason = "no_source_document";
            continue;
        }

        const src = await resolveFidelitySourceBytes(supabase, ctx.orgId, mapping);
        if (!src.ok) {
            lastReason = src.code;
            continue;
        }

        const acro = await extractPdfAcroFormFields(src.bytes);

        /*
         * Match on the widget's own name, case-insensitively.
         *
         * `acro_fields` is keyed by the name the mapping was authored against and the document
         * reports the same names. A widget the mapping does NOT name is deliberately not returned:
         * an unmapped box is not a destination, and offering it as one would invite binding by
         * clicking a rectangle, which would make geometry the semantic authority.
         */
        const byLowerName = new Map<string, { field_id: string }>();
        for (const [pdfField, target] of Object.entries(mapping.acro_fields)) {
            byLowerName.set(pdfField.toLowerCase(), { field_id: target.field_id });
        }

        const regions: PaperworkRegion[] = [];
        for (const f of acro.fields) {
            if (!f.bbox) continue;
            const hit = byLowerName.get((f.name ?? "").toLowerCase());
            if (!hit) continue;
            regions.push({ field_id: hit.field_id, pdf_field: f.name, page: f.page, bbox: f.bbox });
        }

        if (regions.length === 0) {
            // A readable document that shares no widget names with the mapping is not this
            // version's document. Try the next candidate before giving up.
            lastReason = "no_regions_in_document";
            continue;
        }

        return jsonData({
            source: true,
            usedVersion: candidate.version_number,
            usedStatus: candidate.status,
            /** The canvas must draw THIS version's bytes, or the overlays sit on the wrong page. */
            usedVersionId: candidate.id,
            pageCount: acro.page_count,
            /** Widgets the mapping names but the document does not contain — a real mapping defect. */
            missingFromDocument: Object.keys(mapping.acro_fields).filter(
                (n) => !acro.fields.some((f) => (f.name ?? "").toLowerCase() === n.toLowerCase()),
            ),
            regions,
        });
    }

    return jsonData({ source: false, reason: lastReason, regions: [], pageCount: 0 });
}
