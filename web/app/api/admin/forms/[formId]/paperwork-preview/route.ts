/**
 * GET /api/admin/forms/[formId]/paperwork-preview — the DOCUMENT this form produces.
 *
 * ## Why the builder needed this
 *
 * Packet and Forms Studio offered two previews, "Preview" and "Runtime", which rendered the same
 * component from the same schema and differed only in a header. Neither showed the thing an
 * administrator actually needs to check before sending a packet to families: the PAPERWORK — the
 * school's own PDF, with Alloy's answers landing in its boxes. Kelly's verdict on the pair was
 * exact: the preview was the wrong product.
 *
 * This answers the question the old previews only appeared to. It renders the pinned source PDF
 * through the SAME fidelity engine the participant review and the signed artifact use, so what an
 * operator checks here is what a family will see and what will be stored — not a second renderer
 * that could quietly disagree.
 *
 * ## Sample values, clearly marked as samples
 *
 * Boxes are filled with the label of the Alloy field that feeds them, in braces — `{Child first
 * name}` — because the operator's question is "does my mapping put the right fact in the right
 * box", and a blank form cannot answer it. Nothing here reads a real child: this is a configuration
 * surface, and putting a family's data on an admin screen to demonstrate a mapping would be a
 * privacy cost with no purpose.
 *
 * Refuses rather than approximates: a form with no fidelity mapping has no paperwork to show, and
 * says so, instead of rendering a generated stand-in that would misrepresent what prints.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    fidelityFieldValues,
    parseFidelityPdfMapping,
    resolveFidelitySourceBytes,
} from "@/lib/forms/pdf/fidelityMappingContract";
import { fillPdfWithFidelity } from "@/lib/forms/pdf/generation/fidelityEngine";
import type { FormSchemaV1 } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: raw } = await params;
    const formId = parseUuidParam(raw, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();

    /*
     * The DRAFT if there is one, else the published version.
     *
     * An administrator previews what they are working on. Showing them the published paperwork while
     * they edit a draft would answer a question they did not ask, and would hide exactly the mapping
     * mistake this view exists to catch.
     */
    const { data: versions, error: vErr } = await supabase
        .from("form_definition_versions")
        .select("id, status, version_number, schema_json, pdf_mapping_json")
        .eq("org_id", ctx.orgId)
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false });
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const rows = (versions ?? []) as Array<{
        id: string;
        status: string;
        schema_json: unknown;
        pdf_mapping_json: unknown;
    }>;
    const version = rows.find((r) => r.status === "draft") ?? rows.find((r) => r.status === "published");
    if (!version) return jsonError("This form has no version to preview yet.", 404, { code: "NO_VERSION" });

    const mapping = parseFidelityPdfMapping(version.pdf_mapping_json);
    if (!mapping) {
        return jsonError(
            "This form has no source document, so there is no paperwork to show. Forms built from scratch are completed on screen.",
            404,
            { code: "NO_PAPERWORK" },
        );
    }

    const source = await resolveFidelitySourceBytes(supabase, ctx.orgId, mapping);
    if (!source.ok) {
        return jsonError(
            source.code === "sha_mismatch"
                ? "The original document has changed since this form was mapped to it, so the paperwork cannot be shown."
                : "The original document could not be read.",
            409,
            { code: source.code.toUpperCase() },
        );
    }

    // Label every mapped destination by the Alloy field that feeds it.
    const schema = version.schema_json as FormSchemaV1 | null;
    const labelByFieldId = new Map<string, string>();
    const walk = (fields: readonly { id: string; label?: string; type?: string; fields?: unknown }[] | undefined) => {
        for (const f of fields ?? []) {
            if (f.type === "group") walk(f.fields as never);
            else labelByFieldId.set(f.id, (f.label ?? "").trim() || f.id);
        }
    };
    walk(schema?.fields as never);

    const sampleValues: Record<string, unknown> = {};
    for (const target of Object.values(mapping.acro_fields)) {
        sampleValues[target.field_id] = `{${labelByFieldId.get(target.field_id) ?? target.field_id}}`;
        for (const extra of target.compose_with ?? []) {
            sampleValues[extra] = `{${labelByFieldId.get(extra) ?? extra}}`;
        }
    }

    const filled = await fillPdfWithFidelity({
        sourcePdf: source.bytes,
        fieldValues: fidelityFieldValues(mapping, sampleValues),
        documentId: mapping.source_document_id ?? mapping.template_key ?? formId,
        now: new Date().toISOString(),
    });

    return new NextResponse(Buffer.from(filled.bytes), {
        status: 200,
        headers: {
            "content-type": "application/pdf",
            "content-disposition": "inline",
            // Reflects the draft an operator is editing right now.
            "cache-control": "no-store",
            // What the operator most needs to know when a box stays empty: the mapping named a PDF
            // field that the document does not actually contain.
            "x-alloy-fidelity-applied": String(filled.applied.length),
            "x-alloy-fidelity-missed": String(filled.missed.length),
        },
    });
}
