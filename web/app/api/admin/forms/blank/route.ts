import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbInsertFormDefinition,
    dbInsertVersion,
    dbListFormDefinitionKeys,
} from "@/lib/admin/forms/formsAdminDb";
import { deleteFormDefinitionForAdmin } from "@/lib/admin/forms/deleteFormDefinitionForAdmin";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import { createBlankSchema } from "@/lib/forms/formBuilderSchema";
import { brandingMetadataPatch } from "@/lib/forms/processingFormBranding";
import { applyDefaultLeadCaptureFormMetadata } from "@/lib/forms/intake/defaultLeadCaptureFormMetadata";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";

/**
 * POST /api/admin/forms/blank — atomically create form definition + initial draft version.
 * Rolls back the parent form if version insert fails (no orphan forms).
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return jsonError("name is required", 400);

    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const brandName = typeof body.brand_name === "string" ? body.brand_name.trim() : "";
    const accentColor = typeof body.accent_color === "string" ? body.accent_color.trim() : "#00A283";
    const originRaw = typeof body.origin === "string" ? body.origin.trim() : "blank";
    const origin = originRaw === "document" || originRaw === "packet" ? originRaw : "blank";

    const metadataBase =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const brandingMeta = brandingMetadataPatch({
        brand_name: brandName,
        accent_color: accentColor,
        logo_url: null,
        description: description ?? "",
    });

    const supabase = createAdminClient();

    let key: string;
    try {
        const taken = await dbListFormDefinitionKeys(supabase, ctx.orgId);
        key = allocateUniqueKey(slugKeyFromDisplayName(name), taken);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Key allocation failed" }, { status: 500 });
    }

    let metadata: Record<string, unknown> = {
        ...metadataBase,
        source: "processing",
        origin,
        ...brandingMeta,
        field_count: 0,
        section_count: 1,
    };

    // A blank form is the lead-capture creation path: default it to the enrollment_lead
    // operational intent (+ Business Process context) so a minted public link auto-resolves
    // org intake routing instead of silently dead-ending. Document/packet origins keep their
    // own intent; an explicit intake_intent in the request metadata always wins.
    if (origin === "blank") {
        metadata = await applyDefaultLeadCaptureFormMetadata(supabase, ctx.orgId, metadata);
    }

    const { data: formRow, error: formErr } = await dbInsertFormDefinition(supabase, {
        org_id: ctx.orgId,
        key,
        name,
        kind: "center",
        description,
        metadata,
    });

    if (formErr || !formRow) {
        if (formErr?.code === "23505") return jsonError("A form with this key already exists", 409);
        return NextResponse.json({ error: formErr?.message ?? "Failed to create form" }, { status: 400 });
    }

    const formId = (formRow as { id: string }).id;
    const blankSchema = createBlankSchema(name);

    const { data: versionRow, error: versionErr } = await dbInsertVersion(supabase, {
        form_definition_id: formId,
        org_id: ctx.orgId,
        version_number: 1,
        status: "draft",
        schema_json: blankSchema,
        metadata: { source: "processing", origin },
    });

    if (versionErr || !versionRow) {
        try {
            await deleteFormDefinitionForAdmin(supabase, ctx.orgId, formId);
        } catch (rollbackErr) {
            console.error("[forms/blank] rollback failed after version insert error", rollbackErr);
        }
        return NextResponse.json(
            { error: versionErr?.message ?? "Failed to create initial form version" },
            { status: 500 }
        );
    }

    return jsonData(
        {
            form: formRow,
            version: versionRow,
            form_id: formId,
            form_version_id: (versionRow as { id: string }).id,
        },
        { status: 201 }
    );
}
