import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/packet-definitions/[packetDefId] — definition + ordered steps. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    const supabase = createAdminClient();
    const { data: def, error: dErr } = await supabase
        .from("form_packet_definitions")
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .eq("id", packetDefId)
        .maybeSingle();
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    if (!def) return jsonError("Not found", 404);

    const { data: items, error: iErr } = await supabase
        .from("form_packet_items")
        .select(
            "id, sequence_index, form_definition_id, pinned_form_definition_version_id, metadata, form_definitions ( id, name, key )"
        )
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId)
        .order("sequence_index", { ascending: true });
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    const rawItems = items ?? [];
    const formIds = [...new Set(rawItems.map((r: { form_definition_id: string }) => r.form_definition_id))];
    let versionRows: { id: string; form_definition_id: string; status: string }[] = [];
    if (formIds.length > 0) {
        const { data: vr, error: vErr } = await supabase
            .from("form_definition_versions")
            .select("id, form_definition_id, status")
            .eq("org_id", ctx.orgId)
            .in("form_definition_id", formIds);
        if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
        versionRows = (vr ?? []) as { id: string; form_definition_id: string; status: string }[];
    }

    const enrichedItems = rawItems.map((row: Record<string, unknown>) => {
        const fid = row.form_definition_id as string;
        const pin = row.pinned_form_definition_version_id as string | null | undefined;
        let step_has_published = false;
        if (pin && typeof pin === "string") {
            step_has_published = versionRows.some((v) => v.id === pin && v.status === "published");
        } else {
            step_has_published = versionRows.some((v) => v.form_definition_id === fid && v.status === "published");
        }
        return { ...row, step_has_published_version: step_has_published };
    });

    return jsonData({ definition: def, items: enrichedItems });
}

/** PATCH /api/admin/forms/packet-definitions/[packetDefId] — name, description, is_active, metadata merge. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name must be a non-empty string", 400);
        patch.name = body.name.trim();
    }
    if (body.description !== undefined) {
        patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if (body.is_active !== undefined) {
        if (typeof body.is_active !== "boolean") return jsonError("is_active must be boolean", 400);
        patch.is_active = body.is_active;
    }
    if (body.metadata !== undefined) {
        if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) {
            return jsonError("metadata must be an object", 400);
        }
        patch.metadata = body.metadata;
    }

    if (Object.keys(patch).length === 0) return jsonError("No valid fields to update", 400);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_definitions")
        .update(patch)
        .eq("org_id", ctx.orgId)
        .eq("id", packetDefId)
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .single();
    if (error) {
        if (error.code === "PGRST116") return jsonError("Not found", 404);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}
