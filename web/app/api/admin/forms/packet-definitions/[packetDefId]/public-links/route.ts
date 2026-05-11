import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { FORM_PUBLIC_LINK_SAFE_SELECT } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/packet-definitions/[packetDefId]/public-links — links whose metadata targets this packet. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    const supabase = createAdminClient();
    const { data: pkt, error: pErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", packetDefId)
        .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!pkt) return jsonError("Not found", 404);

    const { data, error } = await supabase
        .from("form_public_links")
        .select(FORM_PUBLIC_LINK_SAFE_SELECT)
        .eq("org_id", ctx.orgId)
        .filter("metadata->>packet_definition_id", "eq", packetDefId)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return jsonData(data ?? []);
}
